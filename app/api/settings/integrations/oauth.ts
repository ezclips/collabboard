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
      scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
      clientId: googleDriveClientId,
      clientSecret: googleDriveClientSecret,
      extraAuthParams: {
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
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
