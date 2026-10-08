import crypto from 'node:crypto';

// PATCH-328 (Addendum 1). AES-256-GCM for the stored calendar link.
//
// The link is a secret (a Google "secret address" gives read access to a whole
// calendar), so it is stored ONLY as ciphertext. This module deliberately does
// NOT reuse lib/security/tokenCipher.ts: that one derives its key from a
// fallback chain and passes legacy plaintext through on decrypt -- both right
// for migrating historic OAuth tokens, both wrong for a fresh secret store, and
// setting INTEGRATIONS_TOKEN_ENCRYPTION_KEY would have rotated every existing
// Google Drive / OneDrive token.
//
// Master key: CALENDAR_LINK_ENCRYPTION_KEY, base64 of EXACTLY 32 random bytes
// (`openssl rand -base64 32`). There is deliberately NO fallback to any other
// secret: a misconfigured deployment must fail loudly rather than protect
// calendar links with material provisioned for something else.
//
// Ciphertext format: v1.<iv_b64url>.<tag_b64url>.<ciphertext_b64url>
//
// The key is read lazily, per operation: importing this module must never fail
// merely because the key is absent. Only an actual encrypt/decrypt fails closed.

const CIPHER_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Standard base64, optional padding. Rejects base64url and stray whitespace. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export type CalendarLinkCipherErrorCode = 'missing_key' | 'invalid_ciphertext';

/**
 * Cipher failures carry a code and a fixed, developer-facing message only.
 * Neither the link nor the master key is ever interpolated into an error, so
 * these are safe to log.
 */
export class CalendarLinkCipherError extends Error {
  readonly code: CalendarLinkCipherErrorCode;

  constructor(code: CalendarLinkCipherErrorCode, message: string) {
    super(message);
    this.name = 'CalendarLinkCipherError';
    this.code = code;
  }
}

const ENV_VAR = 'CALENDAR_LINK_ENCRYPTION_KEY';

/** Reads and validates the key, or throws `missing_key`. */
function resolveKey(): Buffer {
  const configured = process.env[ENV_VAR]?.trim();
  if (!configured) {
    throw new CalendarLinkCipherError('missing_key', `${ENV_VAR} is not configured.`);
  }
  if (!BASE64_PATTERN.test(configured)) {
    throw new CalendarLinkCipherError('missing_key', `${ENV_VAR} must be valid base64.`);
  }
  const decoded = Buffer.from(configured, 'base64');
  if (decoded.length !== KEY_BYTES) {
    // Never hashed or padded into a usable key: a wrong-length secret is a
    // configuration bug, not something to silently repair.
    throw new CalendarLinkCipherError('missing_key', `${ENV_VAR} must decode to exactly ${KEY_BYTES} bytes.`);
  }
  return decoded;
}

function toB64Url(input: Buffer): string {
  return input.toString('base64url');
}

function fromB64Url(input: string, expectedBytes?: number): Buffer {
  const decoded = Buffer.from(input, 'base64url');
  if (decoded.length === 0) {
    throw new CalendarLinkCipherError('invalid_ciphertext', 'Ciphertext segment is empty.');
  }
  if (expectedBytes !== undefined && decoded.length !== expectedBytes) {
    throw new CalendarLinkCipherError('invalid_ciphertext', 'Ciphertext segment has the wrong length.');
  }
  return decoded;
}

/** Encrypts a calendar link. A fresh IV per call, so the same link never repeats. */
export function encryptCalendarLink(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new CalendarLinkCipherError('invalid_ciphertext', 'Cannot encrypt an empty calendar link.');
  }

  const key = resolveKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${CIPHER_VERSION}.${toB64Url(iv)}.${toB64Url(tag)}.${toB64Url(encrypted)}`;
}

/**
 * Decrypts a stored calendar link. Every failure path throws: a tampered,
 * malformed or foreign-version value NEVER degrades into returning the input.
 */
export function decryptCalendarLink(ciphertext: string): string {
  if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
    throw new CalendarLinkCipherError('invalid_ciphertext', 'Stored calendar link is empty.');
  }

  const parts = ciphertext.split('.');
  if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) {
    // No plaintext passthrough: anything not `v1.` is refused.
    throw new CalendarLinkCipherError('invalid_ciphertext', 'Stored calendar link is malformed.');
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
    throw new CalendarLinkCipherError('invalid_ciphertext', 'Stored calendar link could not be decrypted.');
  }
}
