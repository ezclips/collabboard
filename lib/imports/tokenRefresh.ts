// Token refresh utilities for Google Drive and Microsoft OneDrive.
// Reads from access_token_encrypted / refresh_token_encrypted columns and
// decrypts with lib/security/tokenCipher.ts (AES-256-GCM).
// Falls back to plaintext access_token / refresh_token columns if encrypted
// columns are absent (supports rows written before encryption was introduced).

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken, encryptToken } from '@/lib/security/tokenCipher';
import type { ImportProvider } from './types';

interface IntegrationRow {
  access_token: string | null;
  refresh_token: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  email: string | null;
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MICROSOFT_TENANT = process.env.MICROSOFT_TENANT_ID || 'common';
const MICROSOFT_TOKEN_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`;

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now() + 60_000; // 1 min buffer
}

async function refreshGoogle(refreshToken: string): Promise<{ access_token: string; expires_at: string } | 'refused' | null> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
    refresh_token: refreshToken,
  });

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      cache: 'no-store',
    });
  } catch {
    // A network error is TRANSIENT -- the old token may still work.
    return null;
  }

  // 400/401 = the provider REFUSED the refresh token itself (invalid_grant).
  if (res.status === 400 || res.status === 401) return 'refused';
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.access_token) return null;

  const expires_at = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  return { access_token: json.access_token, expires_at };
}

async function refreshMicrosoft(refreshToken: string): Promise<{ access_token: string; expires_at: string } | 'refused' | null> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    refresh_token: refreshToken,
    scope: 'offline_access Files.Read User.Read',
  });

  let res: Response;
  try {
    res = await fetch(MICROSOFT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      cache: 'no-store',
    });
  } catch {
    return null;
  }

  // Same distinction as Google: a refused refresh token means not connected.
  if (res.status === 400 || res.status === 401) return 'refused';
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.access_token) return null;

  const expires_at = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  return { access_token: json.access_token, expires_at };
}

/**
 * Returns a valid access token for the given provider and user.
 * Refreshes and persists if the stored token is expired.
 * Returns null when no integration row exists or refresh fails.
 */
export async function getValidAccessToken(
  userId: string,
  provider: ImportProvider
): Promise<string | null> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from('user_integrations')
    .select('access_token, refresh_token, access_token_encrypted, refresh_token_encrypted, expires_at, email')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single<IntegrationRow>();

  if (error || !data) return null;

  // Resolve access token — prefer encrypted column, fall back to plaintext
  const accessToken =
    decryptToken(data.access_token_encrypted) ||
    data.access_token ||
    null;

  const refreshToken =
    decryptToken(data.refresh_token_encrypted) ||
    data.refresh_token ||
    null;

  // If expires_at is null we don't know when the token expires; try to refresh proactively
  // if we have a refresh token so we don't hand an expired token to the provider API.
  const unknownExpiry = data.expires_at === null;

  // Return immediately if token is known-valid and we aren't in unknown-expiry + has-refresh-token path
  if (!isExpired(data.expires_at) && accessToken && !(unknownExpiry && refreshToken)) {
    return accessToken;
  }

  // Try to refresh
  if (!refreshToken) {
    // No refresh token — return whatever access token we have and hope it works
    return accessToken;
  }

  const refreshed = provider === 'google-drive'
    ? await refreshGoogle(refreshToken)
    : await refreshMicrosoft(refreshToken);

  // PATCH-214. A refresh the provider REFUSED (HTTP 400/401, e.g. `invalid_grant`
  // because the refresh token expired) is not a transient failure we should paper
  // over: Google then answers 401 to every call and `/api/imports/status` still
  // said "Connected". Treat it as "not connected" so the UI can ask to reconnect.
  // A network error or a 5xx is different -- those are transient, and the old
  // access token may still work -- so those keep today's fallback.
  if (refreshed === 'refused') {
    return null;
  }
  if (refreshed === null) {
    return accessToken;
  }

  // Persist refreshed token (always write to encrypted column)
  await admin
    .from('user_integrations')
    .update({
      access_token: null,
      access_token_encrypted: encryptToken(refreshed.access_token),
      expires_at: refreshed.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', provider);

  return refreshed.access_token;
}
