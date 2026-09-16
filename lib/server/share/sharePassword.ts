import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import type { ScryptOptions } from 'crypto';
import { promisify } from 'util';

/**
 * SERVER ONLY. Never import from a 'use client' module.
 *
 * Password verifiers and access grants for share links. Lives outside the
 * route files because the hashing pair is split across create/verify and the
 * grant pair across verify/padlet — four copies of crypto otherwise.
 */

// promisify resolves to scrypt's no-options overload; the options form is the
// one this module needs.
const scryptAsync = promisify(scrypt) as (
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
    options: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_PREFIX = 'scrypt$';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAX_N = 1 << 20;

/** Pre-scrypt stored format: bare unsalted SHA-256 hex. Verify-then-rehash only. */
const LEGACY_SHA256 = /^[0-9a-f]{64}$/;

const GRANT_VERSION = 'v1';
const GRANT_TTL_MS = 10 * 60 * 1000;

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch; hash/signature lengths are
  // determined by the public format, not by the secret.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;

  return [
    `${SCRYPT_PREFIX}${SCRYPT_N}`,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

async function verifyScryptHash(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6) return false;

  const [, rawN, rawR, rawP, rawSalt, rawDerived] = parts;
  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  const sane = (value: number, max: number) =>
    Number.isInteger(value) && value > 0 && value <= max;
  if (!sane(n, SCRYPT_MAX_N) || !sane(r, 32) || !sane(p, 16)) return false;

  const salt = Buffer.from(rawSalt, 'base64url');
  const expected = Buffer.from(rawDerived, 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = (await scryptAsync(password, salt, expected.length, {
    N: n,
    r,
    p,
  })) as Buffer;

  return timingSafeEqual(derived, expected);
}

export interface SharePasswordVerification {
  readonly valid: boolean;
  /** Set only when a legacy hash verified — persist it to complete the upgrade. */
  readonly upgradedHash?: string;
}

export async function verifySharePassword(
  password: string,
  storedHash: string | null,
): Promise<SharePasswordVerification> {
  if (!storedHash) return { valid: false };

  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    return { valid: await verifyScryptHash(password, storedHash) };
  }

  if (LEGACY_SHA256.test(storedHash)) {
    const legacy = createHash('sha256').update(password).digest('hex');
    if (!constantTimeEquals(legacy, storedHash)) return { valid: false };
    return { valid: true, upgradedHash: await hashSharePassword(password) };
  }

  return { valid: false };
}

/**
 * HMAC key for grants. A dedicated SHARE_GRANT_SECRET is preferred; absent one
 * the service-role key is derived from so this needs no new deploy-time env
 * var. Throws when neither exists rather than signing with a fixed fallback.
 */
function grantSecret(): Buffer {
  const explicit = process.env.SHARE_GRANT_SECRET;
  if (explicit) return Buffer.from(explicit, 'utf8');

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole) {
    return createHmac('sha256', serviceRole).update('share-grant-v1').digest();
  }

  throw new Error('SHARE_GRANT_SECRET or SUPABASE_SERVICE_ROLE_KEY is required to sign share grants');
}

function sign(encodedPayload: string): string {
  return createHmac('sha256', grantSecret())
    .update(`${GRANT_VERSION}.${encodedPayload}`)
    .digest('base64url');
}

export function issueShareGrant({
  token,
  padletId,
  now = Date.now(),
}: {
  token: string;
  padletId: string;
  now?: number;
}): string {
  const encoded = Buffer.from(
    JSON.stringify({ t: token, p: padletId, e: now + GRANT_TTL_MS }),
    'utf8',
  ).toString('base64url');

  return `${GRANT_VERSION}.${encoded}.${sign(encoded)}`;
}

/**
 * True only for a grant this server signed, unexpired, and bound to exactly
 * this token and padlet. The signature is checked before the payload is parsed.
 */
export function verifyShareGrant({
  grant,
  token,
  padletId,
  now = Date.now(),
}: {
  grant: string | null;
  token: string;
  padletId: string;
  now?: number;
}): boolean {
  if (!grant) return false;

  const parts = grant.split('.');
  if (parts.length !== 3) return false;

  const [version, encoded, signature] = parts;
  if (version !== GRANT_VERSION) return false;
  if (!constantTimeEquals(signature, sign(encoded))) return false;

  let payload: { t?: unknown; p?: unknown; e?: unknown };
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  if (typeof payload.e !== 'number' || payload.e <= now) return false;
  return payload.t === token && payload.p === padletId;
}
