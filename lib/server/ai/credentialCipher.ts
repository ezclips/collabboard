// AES-256-GCM encryption for user-supplied (BYOK) AI provider API keys.
//
// SERVER ONLY. Never import this from a 'use client' module.
//
// Ciphertext format: v1.<iv_b64url>.<tag_b64url>.<ciphertext_b64url>
//
// Master key: AI_CREDENTIAL_ENCRYPTION_KEY, base64 of EXACTLY 32 random bytes,
// e.g. `openssl rand -base64 32`. There is deliberately NO fallback to
// INTEGRATIONS_TOKEN_ENCRYPTION_KEY, OAUTH_STATE_SECRET,
// SUPABASE_SERVICE_ROLE_KEY or anything else: a BYOK credential must never be
// protected by a secret that was provisioned for another purpose, and a
// misconfigured deployment must fail loudly rather than silently encrypt user
// keys under predictable material.
//
// This module deliberately does NOT reuse lib/security/tokenCipher.ts. That
// module hashes an arbitrary passphrase through a fallback chain and passes
// legacy plaintext straight through on decrypt -- both correct for migrating
// historic OAuth tokens, both unacceptable for a fresh secret store.
//
// The key is read lazily, per operation: importing this module (or the app)
// must never fail merely because BYOK has not been configured yet. Only an
// actual encrypt/decrypt fails closed.
//
// Versioning: the `v1.` prefix owns key/format versioning. A future rotation
// introduces `v2.` and decrypts `v1.` during the transition; no separate
// key-version column is needed anywhere.

import crypto from 'node:crypto';

const CIPHER_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Standard base64, optional padding. Rejects base64url and stray whitespace. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export type AICredentialCipherErrorCode =
  | 'missing_key'
  | 'invalid_key'
  | 'invalid_ciphertext'
  | 'decryption_failed';

/**
 * Cipher failures carry a code and a fixed, developer-facing message only.
 * Neither the plaintext credential nor the master key is ever interpolated
 * into an error, so these are safe to log.
 */
export class AICredentialCipherError extends Error {
  readonly code: AICredentialCipherErrorCode;

  constructor(code: AICredentialCipherErrorCode, message: string) {
    super(message);
    this.name = 'AICredentialCipherError';
    this.code = code;
  }
}

function resolveKey(): Buffer {
  const configured = process.env.AI_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new AICredentialCipherError(
      'missing_key',
      'AI_CREDENTIAL_ENCRYPTION_KEY is not configured.',
    );
  }

  if (!BASE64_PATTERN.test(configured)) {
    throw new AICredentialCipherError(
      'invalid_key',
      'AI_CREDENTIAL_ENCRYPTION_KEY must be valid base64.',
    );
  }

  const decoded = Buffer.from(configured, 'base64');
  if (decoded.length !== KEY_BYTES) {
    // Never hashed or padded into a usable key: a wrong-length secret is a
    // configuration bug, not something to silently repair.
    throw new AICredentialCipherError(
      'invalid_key',
      `AI_CREDENTIAL_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes.`,
    );
  }

  return decoded;
}

function toB64Url(input: Buffer): string {
  return input.toString('base64url');
}

function fromB64Url(input: string, expectedBytes?: number): Buffer {
  const decoded = Buffer.from(input, 'base64url');
  if (decoded.length === 0) {
    throw new AICredentialCipherError('invalid_ciphertext', 'Ciphertext segment is empty.');
  }
  if (expectedBytes !== undefined && decoded.length !== expectedBytes) {
    throw new AICredentialCipherError('invalid_ciphertext', 'Ciphertext segment has the wrong length.');
  }
  return decoded;
}

/**
 * Encrypts one plaintext API key. A fresh random IV per call means the same
 * key encrypted twice never produces the same ciphertext.
 */
export function encryptAICredential(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new AICredentialCipherError('invalid_ciphertext', 'Cannot encrypt an empty credential.');
  }

  const key = resolveKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${CIPHER_VERSION}.${toB64Url(iv)}.${toB64Url(tag)}.${toB64Url(encrypted)}`;
}

/**
 * Decrypts one stored credential. Every failure path throws: a tampered,
 * malformed, or foreign-version value NEVER degrades into returning the input
 * (the legacy-plaintext passthrough this module exists to avoid), and GCM
 * authentication failure is never swallowed.
 */
export function decryptAICredential(ciphertext: string): string {
  if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
    throw new AICredentialCipherError('invalid_ciphertext', 'Stored credential is empty.');
  }

  const parts = ciphertext.split('.');
  if (parts.length !== 4) {
    throw new AICredentialCipherError('invalid_ciphertext', 'Stored credential is malformed.');
  }
  if (parts[0] !== CIPHER_VERSION) {
    throw new AICredentialCipherError('invalid_ciphertext', 'Stored credential uses an unsupported version.');
  }

  const key = resolveKey();
  const iv = fromB64Url(parts[1], IV_BYTES);
  const tag = fromB64Url(parts[2], TAG_BYTES);
  const encrypted = fromB64Url(parts[3]);

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    // The underlying cause is deliberately dropped rather than wrapped: OpenSSL
    // error text is not useful to a caller and must not travel further.
    throw new AICredentialCipherError('decryption_failed', 'Stored credential could not be decrypted.');
  }
}
