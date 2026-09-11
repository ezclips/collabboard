import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BOARD_AI_PROVENANCE_PROOF_ALGORITHM,
  BOARD_AI_PROVENANCE_PROOF_VERSION,
  BoardAiProvenanceProofError,
  createBoardAiProvenanceProof,
  signBoardAiProvenance,
  verifyBoardAiProvenanceProof,
  type BoardAiProvenanceSubject,
} from './boardAiProvenanceProof';

/**
 * PDF_AI_PROVENANCE_PROOF_SECRET_RESUME_1.
 *
 * `board_ai_messages` rows are writable by the thread's owner, so a valid-looking
 * citations envelope proves nothing about who wrote it. These cases are the
 * boundary between provenance CollabBoard generated and JSON a user typed.
 *
 * A deterministic test key is injected here: nothing depends on the developer's
 * real `.env.local`, and the real secret is never read by this suite.
 */
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');
const ENV_VAR = 'BOARD_AI_PROVENANCE_SIGNING_KEY';

const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const subject = (over: Partial<BoardAiProvenanceSubject> = {}): BoardAiProvenanceSubject => ({
  messageId: 'msg-1',
  threadId: 'thread-1',
  boardId: 'board-1',
  content: 'the assistant answer',
  citationItems: [
    { type: 'knowledge-selection', knowledgeDocumentId: DOC_A, pageNumber: 5, charStart: 120, charEnd: 214, label: 'p. 5' },
  ],
  ...over,
});

let originalKey: string | undefined;

beforeEach(() => {
  originalKey = process.env[ENV_VAR];
  process.env[ENV_VAR] = TEST_KEY;
});

afterEach(() => {
  if (originalKey === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = originalKey;
});

// ============================================================================
// The key itself
// ============================================================================

describe('the signing key is required, and never improvised', () => {
  it('A. a missing key fails loudly rather than signing under nothing', () => {
    delete process.env[ENV_VAR];
    expect(() => signBoardAiProvenance(subject())).toThrowError(BoardAiProvenanceProofError);
    try {
      signBoardAiProvenance(subject());
    } catch (error) {
      expect((error as BoardAiProvenanceProofError).code).toBe('missing_key');
    }
  });

  it('B. a non-base64 key is rejected', () => {
    process.env[ENV_VAR] = 'not base64!!';
    expect(() => signBoardAiProvenance(subject())).toThrowError(/must be valid base64/);
  });

  it('C. a key of the wrong length is rejected, never hashed into shape', () => {
    for (const bytes of [16, 31, 33, 64]) {
      process.env[ENV_VAR] = Buffer.alloc(bytes, 3).toString('base64');
      expect(() => signBoardAiProvenance(subject()), `${bytes} bytes`)
        .toThrowError(/exactly 32 bytes/);
    }
  });

  it('an empty key is missing, not a usable empty-string HMAC key', () => {
    // The failure mode this whole module exists to avoid: an empty secret
    // makes every signature forgeable by anyone who reads the source.
    process.env[ENV_VAR] = '   ';
    expect(() => signBoardAiProvenance(subject())).toThrowError(/not configured/);
  });

  it('there is no fallback to any other configured secret', () => {
    delete process.env[ENV_VAR];
    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
    process.env.OAUTH_STATE_SECRET = 'something';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    try {
      expect(() => signBoardAiProvenance(subject())).toThrowError(/not configured/);
    } finally {
      delete process.env.AI_CREDENTIAL_ENCRYPTION_KEY;
      delete process.env.OAUTH_STATE_SECRET;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it('the derived key is not the raw secret', () => {
    // Domain-separated via HKDF: knowing the signature tells you nothing about
    // the configured secret, and this key signs provenance and nothing else.
    const signature = signBoardAiProvenance(subject());
    const rawHmac = crypto
      .createHmac('sha256', Buffer.from(TEST_KEY, 'base64'))
      .update('anything')
      .digest('base64url');
    expect(signature).not.toBe(rawHmac);
    expect(signature).not.toContain(TEST_KEY);
  });
});

// ============================================================================
// What the proof binds
// ============================================================================

describe('a genuine proof validates, and nothing else does', () => {
  it('D. a server-generated proof verifies against its own subject', () => {
    const proof = createBoardAiProvenanceProof(subject());
    expect(proof.version).toBe(BOARD_AI_PROVENANCE_PROOF_VERSION);
    expect(proof.algorithm).toBe(BOARD_AI_PROVENANCE_PROOF_ALGORITHM);
    expect(verifyBoardAiProvenanceProof(subject(), proof)).toBe(true);
  });

  it('E. a one-character change to the signature fails', () => {
    const proof = createBoardAiProvenanceProof(subject());
    const flipped = `${proof.signature.slice(0, -1)}${proof.signature.endsWith('A') ? 'B' : 'A'}`;
    expect(verifyBoardAiProvenanceProof(subject(), { ...proof, signature: flipped })).toBe(false);
  });

  it('F. the proof does not transplant to another message id', () => {
    const proof = createBoardAiProvenanceProof(subject());
    expect(verifyBoardAiProvenanceProof(subject({ messageId: 'msg-2' }), proof)).toBe(false);
  });

  it('L. ...nor to another thread, nor another board', () => {
    const proof = createBoardAiProvenanceProof(subject());
    expect(verifyBoardAiProvenanceProof(subject({ threadId: 'thread-2' }), proof)).toBe(false);
    expect(verifyBoardAiProvenanceProof(subject({ boardId: 'board-2' }), proof)).toBe(false);
  });

  it('G. changing the answer text fails', () => {
    const proof = createBoardAiProvenanceProof(subject());
    expect(verifyBoardAiProvenanceProof(subject({ content: 'a different answer' }), proof)).toBe(false);
  });

  it('H/I/J. changing the cited document, page or offsets fails', () => {
    const proof = createBoardAiProvenanceProof(subject());
    const base = subject().citationItems[0] as Record<string, unknown>;
    const mutations: Record<string, unknown>[] = [
      { ...base, knowledgeDocumentId: DOC_B },
      { ...base, pageNumber: 6 },
      { ...base, charStart: 121 },
      { ...base, charEnd: 215 },
      { ...base, type: 'knowledge-page' },
    ];
    for (const item of mutations) {
      expect(verifyBoardAiProvenanceProof(subject({ citationItems: [item] }), proof), JSON.stringify(item))
        .toBe(false);
    }
  });

  it('adding or removing a citation fails', () => {
    const proof = createBoardAiProvenanceProof(subject());
    const extra = { type: 'knowledge-page', knowledgeDocumentId: DOC_B, pageNumber: 2, label: 'p. 2' };
    expect(verifyBoardAiProvenanceProof(subject({ citationItems: [...subject().citationItems, extra] }), proof)).toBe(false);
    expect(verifyBoardAiProvenanceProof(subject({ citationItems: [] }), proof)).toBe(false);
  });

  it('reordering citations fails -- order is part of the identity', () => {
    const a = { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 1, label: 'a' };
    const b = { type: 'knowledge-page', knowledgeDocumentId: DOC_B, pageNumber: 2, label: 'b' };
    const proof = createBoardAiProvenanceProof(subject({ citationItems: [a, b] }));
    expect(verifyBoardAiProvenanceProof(subject({ citationItems: [b, a] }), proof)).toBe(false);
  });

  it('the payload is framed, so values cannot be shifted across a boundary', () => {
    // Without length framing `a` + `bc` and `ab` + `c` would hash alike, and a
    // crafted message id could absorb part of the thread id.
    const shifted = createBoardAiProvenanceProof(subject({ messageId: 'msg', threadId: '1thread-1' }));
    expect(verifyBoardAiProvenanceProof(subject({ messageId: 'msg-1', threadId: 'thread-1' }), shifted))
      .toBe(false);
  });

  it('property order inside the subject does not change the signature', () => {
    // Canonical serialization: a re-built but identical subject must verify.
    const rebuilt: BoardAiProvenanceSubject = {
      citationItems: [{
        label: 'p. 5', charEnd: 214, charStart: 120, pageNumber: 5,
        knowledgeDocumentId: DOC_A, type: 'knowledge-selection',
      }],
      content: 'the assistant answer',
      boardId: 'board-1',
      threadId: 'thread-1',
      messageId: 'msg-1',
    };
    expect(verifyBoardAiProvenanceProof(rebuilt, createBoardAiProvenanceProof(subject()))).toBe(true);
  });
});

// ============================================================================
// Fail closed on anything that is not a proof
// ============================================================================

describe('anything that is not a genuine proof fails closed', () => {
  it('N. an unknown version or algorithm is refused, never assumed valid', () => {
    const proof = createBoardAiProvenanceProof(subject());
    expect(verifyBoardAiProvenanceProof(subject(), { ...proof, version: 2 })).toBe(false);
    expect(verifyBoardAiProvenanceProof(subject(), { ...proof, version: '1' })).toBe(false);
    expect(verifyBoardAiProvenanceProof(subject(), { ...proof, algorithm: 'none' })).toBe(false);
  });

  it('M. a hand-written citations envelope with no proof cannot validate', () => {
    // The core attack: an authenticated user inserts an assistant row into
    // their own thread citing a page their board can read. Shape is fine;
    // authenticity is absent.
    for (const forged of [null, undefined, {}, [], 'sig', 42, { signature: 'x' }, { version: 1, algorithm: 'HMAC-SHA-256' }]) {
      expect(verifyBoardAiProvenanceProof(subject(), forged), JSON.stringify(forged)).toBe(false);
    }
  });

  it('a signature made under a different key does not validate', () => {
    process.env[ENV_VAR] = Buffer.alloc(32, 9).toString('base64');
    const foreign = createBoardAiProvenanceProof(subject());
    process.env[ENV_VAR] = TEST_KEY;
    expect(verifyBoardAiProvenanceProof(subject(), foreign)).toBe(false);
  });

  it('a configuration error propagates rather than reading as "not valid"', () => {
    // A broken deployment must be loud. Silently returning false would refuse
    // every genuine proof and look like a data problem.
    const proof = createBoardAiProvenanceProof(subject());
    delete process.env[ENV_VAR];
    expect(() => verifyBoardAiProvenanceProof(subject(), proof)).toThrowError(BoardAiProvenanceProofError);
  });
});
