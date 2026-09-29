import crypto from 'node:crypto';

export type IntegrationProvider = 'google-drive' | 'microsoft-onedrive';

interface ProviderConfig {
  id: IntegrationProvider;
  label: string;
  authUrl: string;
  tokenUrl: string;
  profileUrl: string;
  scope: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  extraAuthParams?: Record<string, string>;
  mapProfile: (profile: Record<string, unknown>) => { providerUserId: string | null; email: string | null };
}

export const PROVIDER_IDS: IntegrationProvider[] = ['google-drive', 'microsoft-onedrive'];

/**
 * PATCH-214b. The scopes a connection MUST actually carry to be usable.
 *
 * The consent screen gives each permission its own checkbox, and a user can
 * leave the Drive box unticked: the connection then saves, Settings says
 * "Connected", but the token cannot open Drive (the Picker answers 403). So the
 * callback checks the granted scopes against this list before storing anything.
 *
 * Microsoft may report a scope bare (`Files.Read`) or prefixed
 * (`https://graph.microsoft.com/Files.Read`), so the comparison is
 * case-insensitive on the final segment.
 */
export const REQUIRED_SCOPES: Record<IntegrationProvider, readonly string[]> = {
  'google-drive': ['https://www.googleapis.com/auth/drive.file'],
  'microsoft-onedrive': ['Files.Read'],
};

/**
 * Which required scopes a connection did NOT grant. An empty result is OK.
 *
 * AN EMPTY `granted` ARRAY MEANS "THE PROVIDER DID NOT SAY", so it returns `[]`.
 * Some token responses omit `scope` entirely, and blocking those would refuse
 * connections that are in fact fine. Only a NON-EMPTY list that lacks a
 * required scope is a failure.
 */
export function missingRequiredScopes(
  provider: IntegrationProvider,
  granted: readonly string[],
): string[] {
  if (granted.length === 0) return [];
  const normalise = (scope: string) => scope.trim().toLowerCase();
  const grantedSet = new Set(granted.map(normalise));
  return REQUIRED_SCOPES[provider].filter((required) => {
    const wanted = normalise(required);
    if (grantedSet.has(wanted)) return false;
    // Microsoft's prefixed form: `https://graph.microsoft.com/Files.Read`.
    return ![...grantedSet].some((scope) => scope.endsWith('/' + wanted));
  });
}

export function getProviders(): Record<IntegrationProvider, ProviderConfig> {
  const microsoftTenant = process.env.MICROSOFT_TENANT_ID || 'common';
  const googleDriveClientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const googleDriveClientSecret =
    process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const microsoftOneDriveClientId =
    process.env.MICROSOFT_CLIENT_ID || process.env.ONEDRIVE_CLIENT_ID || process.env.MICROSOFT_ONEDRIVE_CLIENT_ID;
  const microsoftOneDriveClientSecret =
    process.env.MICROSOFT_CLIENT_SECRET ||
    process.env.ONEDRIVE_CLIENT_SECRET ||
    process.env.MICROSOFT_ONEDRIVE_CLIENT_SECRET;

  return {
    'google-drive': {
      id: 'google-drive',
      label: 'Google Drive',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
      scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
      clientId: googleDriveClientId,
      clientSecret: googleDriveClientSecret,
      extraAuthParams: {
        access_type: 'offline',
        prompt: 'consent',
        // PATCH-214: NO `include_granted_scopes`. Carrying the previous grant
        // forward would keep the old `drive.readonly` (a restricted scope) on
        // every reconnect, which is the thing this change exists to drop.
      },
      mapProfile: (profile) => ({
        providerUserId: typeof profile?.sub === 'string' ? profile.sub : null,
        email: typeof profile?.email === 'string' ? profile.email : null,
      }),
    },
    'microsoft-onedrive': {
      id: 'microsoft-onedrive',
      label: 'Microsoft OneDrive',
      authUrl: `https://login.microsoftonline.com/${microsoftTenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${microsoftTenant}/oauth2/v2.0/token`,
      profileUrl: 'https://graph.microsoft.com/v1.0/me',
      scope: 'openid profile email offline_access Files.Read User.Read',
      clientId: microsoftOneDriveClientId,
      clientSecret: microsoftOneDriveClientSecret,
      mapProfile: (profile) => ({
        providerUserId: typeof profile?.id === 'string' ? profile.id : null,
        email:
          typeof profile?.mail === 'string'
            ? profile.mail
            : typeof profile?.userPrincipalName === 'string'
              ? profile.userPrincipalName
              : null,
      }),
    },
  };
}

interface StatePayload {
  uid: string;
  provider: IntegrationProvider;
  nonce: string;
  ts: number;
}

function getStateSecret(): string {
  return process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function toBase64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(value: string): string {
  return crypto.createHmac('sha256', getStateSecret()).update(value).digest('base64url');
}

export function createOAuthState(uid: string, provider: IntegrationProvider): string {
  const payload: StatePayload = {
    uid,
    provider,
    nonce: crypto.randomUUID(),
    ts: Date.now(),
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyOAuthState(rawState: string | null): StatePayload | null {
  if (!rawState || !rawState.includes('.')) return null;
  const [encoded, receivedSignature] = rawState.split('.');
  if (!encoded || !receivedSignature) return null;
  const expectedSignature = sign(encoded);
  if (expectedSignature.length !== receivedSignature.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(receivedSignature))) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encoded)) as StatePayload;
    if (!payload?.uid || !payload?.provider || !payload?.ts) return null;
    if (Date.now() - payload.ts > 15 * 60 * 1000) return null;
    if (!(payload.provider in getProviders())) return null;
    return payload;
  } catch {
    return null;
  }
}

export function resolveProvider(rawProvider: string | null): ProviderConfig | null {
  if (!rawProvider) return null;
  if (rawProvider !== 'google-drive' && rawProvider !== 'microsoft-onedrive') return null;
  return getProviders()[rawProvider];
}
