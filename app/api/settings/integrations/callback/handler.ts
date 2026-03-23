import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { encryptToken } from '@/lib/security/tokenCipher';
import { resolveProvider, verifyOAuthState } from '../oauth';

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

function formatOAuthError(
  providerId: string,
  oauthError: string,
  oauthErrorDescription: string | null
): string {
  const raw = oauthErrorDescription?.trim();
  if (
    providerId === 'microsoft-onedrive' &&
    oauthError === 'unauthorized_client'
  ) {
    const hint =
      'Microsoft app is not enabled for personal accounts. In Azure App Registration, set Supported account types to include personal Microsoft accounts, or set MICROSOFT_TENANT_ID=organizations and use a work/school account.';
    return raw ? `${raw} ${hint}` : hint;
  }
  return raw || oauthError;
}

function redirectWithStatus(req: NextRequest, status: 'success' | 'error', provider: string, message?: string) {
  const redirectUrl = new URL('/dashboard/settings/integrations', req.nextUrl.origin);
  redirectUrl.searchParams.set('status', status);
  redirectUrl.searchParams.set('provider', provider);
  if (message) {
    redirectUrl.searchParams.set('message', message);
  }
  return NextResponse.redirect(redirectUrl);
}

export async function handleOAuthCallback(req: NextRequest, providerOverride?: string) {
  const providerIdFromQuery = req.nextUrl.searchParams.get('provider');
  const code = req.nextUrl.searchParams.get('code');
  const rawState = req.nextUrl.searchParams.get('state');
  const oauthError = req.nextUrl.searchParams.get('error');
  const oauthErrorDescription = req.nextUrl.searchParams.get('error_description');

  const state = verifyOAuthState(rawState);
  const providerId = providerOverride || providerIdFromQuery || state?.provider || 'unknown';
  const provider = resolveProvider(providerId);
  if (!provider) {
    return redirectWithStatus(req, 'error', providerId, 'Unsupported provider');
  }

  if (oauthError) {
    return redirectWithStatus(
      req,
      'error',
      provider.id,
      formatOAuthError(provider.id, oauthError, oauthErrorDescription)
    );
  }

  if (!code) {
    return redirectWithStatus(req, 'error', provider.id, 'Missing OAuth code');
  }

  if (!state || state.provider !== provider.id) {
    return redirectWithStatus(req, 'error', provider.id, 'Invalid OAuth state');
  }

  if (!provider.clientId || !provider.clientSecret) {
    return redirectWithStatus(req, 'error', provider.id, 'Provider is not configured');
  }

  try {
    // Must match exactly the redirect URI used when creating the provider auth URL.
    const callbackUrl = new URL(req.nextUrl.pathname, req.nextUrl.origin);
    if (callbackUrl.pathname.endsWith('/callback')) {
      // Backward compatibility for older flow that used ?provider=<id> on the callback path.
      callbackUrl.searchParams.set('provider', provider.id);
    }

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      redirect_uri: callbackUrl.toString(),
    });

    const tokenResponse = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenBody.toString(),
      cache: 'no-store',
    });

    const tokenJson = (await tokenResponse.json()) as TokenResponse;
    if (!tokenResponse.ok || !tokenJson.access_token) {
      const reason = tokenJson.error_description || tokenJson.error || 'OAuth token exchange failed';
      return redirectWithStatus(req, 'error', provider.id, reason);
    }

    const profileResponse = await fetch(provider.profileUrl, {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
      },
      cache: 'no-store',
    });

    const profileJson = (await profileResponse.json()) as Record<string, unknown>;
    if (!profileResponse.ok) {
      return redirectWithStatus(req, 'error', provider.id, 'Failed to read profile from provider');
    }

    const profile = provider.mapProfile(profileJson);
    const expiresAt =
      typeof tokenJson.expires_in === 'number'
        ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
        : null;

    const scopes =
      typeof tokenJson.scope === 'string' && tokenJson.scope.trim().length > 0
        ? tokenJson.scope.split(' ').filter(Boolean)
        : [];

    const supabaseAdmin = getSupabaseAdmin();
    const { error: upsertError } = await supabaseAdmin.from('user_integrations').upsert(
      {
        user_id: state.uid,
        provider: provider.id,
        provider_user_id: profile.providerUserId,
        email: profile.email,
        scopes,
        access_token: null,
        refresh_token: null,
        access_token_encrypted: encryptToken(tokenJson.access_token),
        refresh_token_encrypted: encryptToken(tokenJson.refresh_token || null),
        expires_at: expiresAt,
        metadata: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );

    if (upsertError) {
      return redirectWithStatus(req, 'error', provider.id, upsertError.message);
    }

    return redirectWithStatus(req, 'success', provider.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return redirectWithStatus(req, 'error', provider.id, message);
  }
}
