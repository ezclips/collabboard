// AES-256-GCM symmetric encryption for OAuth access/refresh tokens.
// Tokens are stored encrypted in user_integrations columns
// access_token_encrypted and refresh_token_encrypted.
//
// Ciphertext format: v1.<iv_b64url>.<tag_b64url>.<ciphertext_b64url>
//
// Key derivation: SHA-256 of INTEGRATIONS_TOKEN_ENCRYPTION_KEY (preferred),
// falling back to OAUTH_STATE_SECRET or SUPABASE_SERVICE_ROLE_KEY.
// Set INTEGRATIONS_TOKEN_ENCRYPTION_KEY explicitly in production .env.

import crypto from 'node:crypto';

function getSecretMaterial(): string {
  return (
    process.env.INTEGRATIONS_TOKEN_ENCRYPTION_KEY ||
    process.env.OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  );
}

function getKey(): Buffer {
  const secret = getSecretMaterial();
  if (!secret) {
    throw new Error('Missing token encryption secret. Set INTEGRATIONS_TOKEN_ENCRYPTION_KEY.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function toB64Url(input: Buffer): string {
  return input.toString('base64url');
}

function fromB64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export function encryptToken(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${toB64Url(iv)}.${toB64Url(tag)}.${toB64Url(encrypted)}`;
}

export function decryptToken(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;

  // Support legacy plaintext tokens stored before encryption was introduced.
  // A plaintext OAuth token never starts with "v1." so we return it as-is.
  if (!ciphertext.startsWith('v1.')) return ciphertext;

  const parts = ciphertext.split('.');
  // Expected: ['v1', iv, tag, encrypted]
  if (parts.length !== 4) return null;

  try {
    const key = getKey();
    const iv = fromB64Url(parts[1]);
    const tag = fromB64Url(parts[2]);
    const encrypted = fromB64Url(parts[3]);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}
