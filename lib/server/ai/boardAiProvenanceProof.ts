// Server-side authenticity proof for Board AI citation provenance.
//
// SERVER ONLY. Never import this from a 'use client' module.
//
// WHY THIS EXISTS
//
// `board_ai_messages` rows are writable by the authenticated owner of the
// thread. A hand-written assistant row carrying a syntactically valid
// `citations` envelope is therefore NOT evidence that CollabBoard's AI route
// produced those citations -- shape validation is not authenticity. Without a
// keyed proof, any user could mint provenance for any page of any document
// their board can already read, and a saved Note would carry a citation the
// model never made.
//
// So the AI route signs the provenance it just authorized, and the Save-as-Note
// path refuses anything it did not sign.
//
// KEY
//
// BOARD_AI_PROVENANCE_SIGNING_KEY, base64 of EXACTLY 32 random bytes
// (`openssl rand -base64 32`). There is deliberately NO fallback to
// AI_CREDENTIAL_ENCRYPTION_KEY, OAUTH_STATE_SECRET, SUPABASE_SERVICE_ROLE_KEY
// or anything else, for the same reason credentialCipher.ts refuses one: a
// secret provisioned for another purpose must not silently become this one,
// and a misconfigured deployment must fail loudly rather than sign under
// predictable material. An empty-string HMAC key is a forgery oracle.
//
// The key is read lazily, per operation: importing this module must never fail
// merely because the secret is absent. Only an actual sign/verify fails closed.
//
// VERSIONING
//
// `version` owns format/algorithm versioning. An unknown version fails closed
// rather than being treated as valid.

import crypto from 'node:crypto';

const ENV_VAR = 'BOARD_AI_PROVENANCE_SIGNING_KEY';
const KEY_BYTES = 32;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** Domain separation: this key signs provenance and nothing else. */
const PROOF_DOMAIN = 'collabboard:board-ai-provenance:v1';
export const BOARD_AI_PROVENANCE_PROOF_VERSION = 1;
export const BOARD_AI_PROVENANCE_PROOF_ALGORITHM = 'HMAC-SHA-256';

export type BoardAiProvenanceProofErrorCode = 'missing_key' | 'invalid_key';

export class BoardAiProvenanceProofError extends Error {
  readonly code: BoardAiProvenanceProofErrorCode;
  constructor(code: BoardAiProvenanceProofErrorCode, message: string) {
    super(message);
    this.name = 'BoardAiProvenanceProofError';
    this.code = code;
  }
}

/**
 * The raw configured secret, validated. Never logged, never returned to a
 * caller that could reach the browser.
 */
function resolveSecret(): Buffer {
  const configured = process.env[ENV_VAR]?.trim();
  if (!configured) {
    throw new BoardAiProvenanceProofError('missing_key', `${ENV_VAR} is not configured.`);
  }
  if (!BASE64_PATTERN.test(configured)) {
    throw new BoardAiProvenanceProofError('invalid_key', `${ENV_VAR} must be valid base64.`);
  }
  const decoded = Buffer.from(configured, 'base64');
  if (decoded.length !== KEY_BYTES) {
    // Never hashed or padded into a usable key: a wrong-length secret is a
    // configuration bug, not something to silently repair.
    throw new BoardAiProvenanceProofError(
      'invalid_key',
      `${ENV_VAR} must decode to exactly ${KEY_BYTES} bytes.`,
    );
  }
  return decoded;
}

/**
 * The actual MAC key, derived rather than used raw.
 *
 * HKDF with the domain string as `info`, so this key is cryptographically
 * separate from anything else the same secret could ever be used for. Raw
 * string concatenation is deliberately not the derivation.
 */
function resolveProofKey(): Buffer {
  const secret = resolveSecret();
  return Buffer.from(
    crypto.hkdfSync('sha256', secret, Buffer.alloc(0), Buffer.from(PROOF_DOMAIN, 'utf8'), KEY_BYTES),
  );
}

/** The identity a proof is bound to. Every field is server-resolved. */
export interface BoardAiProvenanceSubject {
  readonly messageId: string;
  readonly threadId: string;
  readonly boardId: string;
  /** The assistant's visible answer, exactly as stored. */
  readonly content: string;
  /** The canonical citation items, in the order the server built them. */
  readonly citationItems: readonly Record<string, unknown>[];
}

/**
 * Deterministic canonical bytes for a subject.
 *
 * `JSON.stringify` over a caller-built object would make the signature depend
 * on property insertion order, so a re-serialized-but-identical subject could
 * fail to verify (or, worse, two different subjects could collide). Every
 * field is emitted in a fixed order, length-prefixed so no value can be shifted
 * across a boundary -- `a|bc` and `ab|c` must not hash alike.
 */
function canonicalPayload(subject: BoardAiProvenanceSubject): Buffer {
  const parts: string[] = [
    PROOF_DOMAIN,
    String(BOARD_AI_PROVENANCE_PROOF_VERSION),
    BOARD_AI_PROVENANCE_PROOF_ALGORITHM,
    subject.messageId,
    subject.threadId,
    subject.boardId,
    subject.content,
    String(subject.citationItems.length),
  ];
  for (const item of subject.citationItems) {
    parts.push(canonicalItem(item));
  }
  const framed = parts.map((part) => `${Buffer.byteLength(part, 'utf8')}:${part}`).join('|');
  return Buffer.from(framed, 'utf8');
}

/** One citation item, keys sorted so ordering inside the item cannot vary. */
function canonicalItem(item: Record<string, unknown>): string {
  const keys = Object.keys(item).filter((key) => item[key] !== undefined).sort();
  return keys.map((key) => `${key}=${String(item[key])}`).join(';');
}

/** The signature for one subject. Base64url, no padding surprises. */
export function signBoardAiProvenance(subject: BoardAiProvenanceSubject): string {
  return crypto
    .createHmac('sha256', resolveProofKey())
    .update(canonicalPayload(subject))
    .digest('base64url');
}

/** The proof as it is stored beside the citation items. Server-only. */
export interface BoardAiProvenanceProof {
  readonly version: number;
  readonly algorithm: string;
  readonly signature: string;
}

export function createBoardAiProvenanceProof(
  subject: BoardAiProvenanceSubject,
): BoardAiProvenanceProof {
  return {
    version: BOARD_AI_PROVENANCE_PROOF_VERSION,
    algorithm: BOARD_AI_PROVENANCE_PROOF_ALGORITHM,
    signature: signBoardAiProvenance(subject),
  };
}

/**
 * Does this proof genuinely cover this subject?
 *
 * Fails closed on everything: a missing or malformed proof, an unknown version
 * or algorithm, and any mismatch in the bound identity. Because the message id,
 * thread, board, content and every citation field are inside the payload, a
 * signature lifted from another message, thread, board, document, page or span
 * cannot validate here.
 *
 * Compared in constant time. A configuration error propagates rather than being
 * swallowed into `false`, so a broken deployment is loud instead of silently
 * refusing every genuine proof.
 */
export function verifyBoardAiProvenanceProof(
  subject: BoardAiProvenanceSubject,
  proof: unknown,
): boolean {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return false;
  const candidate = proof as { version?: unknown; algorithm?: unknown; signature?: unknown };
  if (candidate.version !== BOARD_AI_PROVENANCE_PROOF_VERSION) return false;
  if (candidate.algorithm !== BOARD_AI_PROVENANCE_PROOF_ALGORITHM) return false;
  if (typeof candidate.signature !== 'string' || candidate.signature.length === 0) return false;

  const expected = Buffer.from(signBoardAiProvenance(subject), 'utf8');
  const actual = Buffer.from(candidate.signature, 'utf8');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
