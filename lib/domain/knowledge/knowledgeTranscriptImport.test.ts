import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { ok, err, type Result } from '../core/result';
import { domainError, type DomainError } from '../core/errors';
import type { BoardId, KnowledgeDocumentId, UserId } from '../core/ids';
import type { KnowledgeDocument } from './knowledgePersistence';
import {
  importKnowledgeTranscript,
  transcriptChunkingBreak,
  transcriptConsistencyBreak,
  buildKnowledgeTranscriptStoragePath,
  type KnowledgeTranscriptImportDeps,
  type KnowledgeTranscriptImportInput,
  type KnowledgeTranscriptTarget,
  type KnowledgeTranscriptVersionWrite,
} from './knowledgeTranscriptImport';
import { buildKnowledgeTranscriptDocument } from './knowledgeTranscriptDocument';
import { parseKnowledgeTranscript } from './knowledgeTranscriptCues';
import { knowledgeTranscriptStoredRepresentation } from './knowledgeTranscriptVersion';

const BOARD = 'board-1' as BoardId;
const USER = 'user-1' as UserId;
const DOC = 'doc-1' as KnowledgeDocumentId;

// Two cues that OVERLAP IN TIME and carry the SAME TEXT. Both properties are
// load-bearing: overlap must survive into the hash, and repeated text must not
// be de-duplicated in the first importer version.
const SRT = [
  '1',
  '00:00:01,000 --> 00:00:03,000',
  'hello there',
  '',
  '2',
  '00:00:02,500 --> 00:00:05,000',
  'hello there',
  '',
].join('\n');

/** The same words, one timing moved by a second. Nothing else differs. */
const SRT_RETIMED = SRT.replace('00:00:02,500', '00:00:03,500');

/** `details` is deliberately `unknown` on DomainError, so read it narrowly. */
const cleanupResidue = (error: DomainError): unknown =>
  (error.details as { cleanupFailed?: unknown } | undefined)?.cleanupFailed;

interface Recorder {
  readonly deps: KnowledgeTranscriptImportDeps;
  readonly uploads: { path: string; bytes: Uint8Array; contentType: string }[];
  readonly removed: string[];
  readonly writes: { write: KnowledgeTranscriptVersionWrite; expected: string | null }[];
}

function makeDeps(options: {
  authorized?: boolean;
  target?: KnowledgeTranscriptTarget | null;
  writeResult?: Result<KnowledgeDocument, DomainError>;
  uploadResult?: Result<void, DomainError>;
  removeResult?: Result<void, DomainError>;
} = {}): Recorder {
  const uploads: Recorder['uploads'] = [];
  const removed: string[] = [];
  const writes: Recorder['writes'] = [];
  const stored = { id: DOC } as unknown as KnowledgeDocument;

  const record = (write: KnowledgeTranscriptVersionWrite, expected: string | null) => {
    writes.push({ write, expected });
    return Promise.resolve(options.writeResult ?? ok(stored));
  };

  return {
    uploads,
    removed,
    writes,
    deps: {
      authorizer: {
        canMutateBoard: () => Promise.resolve(ok(options.authorized ?? true)),
      },
      repository: {
        loadTranscriptTarget: () =>
          Promise.resolve(ok(options.target === undefined ? null : options.target)),
        createTranscriptVersion: (write) => record(write, null),
        replaceTranscriptVersion: (write, expected) => record(write, expected),
      },
      storage: {
        upload: (path, bytes, contentType) => {
          uploads.push({ path, bytes, contentType });
          return Promise.resolve(options.uploadResult ?? ok(undefined));
        },
        remove: (path) => {
          removed.push(path);
          return Promise.resolve(options.removeResult ?? ok(undefined));
        },
      },
      hasher: {
        sha256: (bytes: Uint8Array) =>
          Promise.resolve(createHash('sha256').update(Buffer.from(bytes)).digest('hex')),
      },
      ids: { newDocumentId: () => DOC },
    },
  };
}

const baseInput = (over: Partial<KnowledgeTranscriptImportInput> = {}): KnowledgeTranscriptImportInput => ({
  boardId: BOARD,
  userId: USER,
  payload: SRT,
  format: 'srt',
  title: 'Lecture 1',
  language: null,
  trackKind: 'machine',
  videoIdentity: 'yt:abc123',
  replaces: null,
  ...over,
});

const transcriptTarget = (over: Partial<KnowledgeTranscriptTarget> = {}): KnowledgeTranscriptTarget => ({
  documentId: DOC,
  kind: 'text',
  transcriptRepresentation: knowledgeTranscriptStoredRepresentation({
    cues: [],
    videoIdentity: 'yt:abc123',
    language: null,
    trackKind: 'machine',
    format: 'srt',
  }),
  contentSha256: 'a'.repeat(64),
  ...over,
});

describe('importKnowledgeTranscript', () => {
  it('refuses an unauthorized board without touching storage or the database', async () => {
    const r = makeDeps({ authorized: false });
    const result = await importKnowledgeTranscript(r.deps, baseInput());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('permission_denied');
    // The order matters, not just the refusal: a rejection that has already
    // uploaded is a rejection that left something behind.
    expect(r.uploads).toHaveLength(0);
    expect(r.writes).toHaveLength(0);
  });

  it('writes the whole version in ONE repository call', async () => {
    const r = makeDeps();
    const result = await importKnowledgeTranscript(r.deps, baseInput());

    expect(result.ok).toBe(true);
    expect(r.writes).toHaveLength(1);
    const { write, expected } = r.writes[0];
    expect(expected).toBeNull();
    // Text, cues, chunks and hash arrive together, because they must be
    // written together.
    expect(write.canonicalText).toContain('hello there');
    expect(write.representation.cues).toHaveLength(2);
    expect(write.chunks.length).toBeGreaterThan(0);
    expect(write.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps repeated cue text, with no automatic de-duplication', async () => {
    const r = makeDeps();
    await importKnowledgeTranscript(r.deps, baseInput());

    const { write } = r.writes[0];
    const occurrences = write.canonicalText.split('hello there').length - 1;
    expect(occurrences).toBe(2);
    expect(write.representation.cues).toHaveLength(2);
  });

  it('keeps overlapping cues as separate cues, in file order', async () => {
    const r = makeDeps();
    await importKnowledgeTranscript(r.deps, baseInput());

    const [first, second] = r.writes[0].write.representation.cues;
    // The second cue starts BEFORE the first one ends. That is a timing
    // property; the characters do not overlap.
    expect(second.startMs).toBeLessThan(first.endMs);
    expect(second.charStart).toBeGreaterThanOrEqual(first.charEnd);
  });

  it('gives a timing-only re-import a different hash', async () => {
    // THE STALENESS PROOF. Same words, one cue moved by a second. If the hash
    // ignored timings, a corrected transcript would look unchanged and every
    // citation to a timestamp in it would keep pointing at the old moment.
    const first = makeDeps();
    await importKnowledgeTranscript(first.deps, baseInput());
    const second = makeDeps();
    await importKnowledgeTranscript(second.deps, baseInput({ payload: SRT_RETIMED }));

    expect(first.writes[0].write.canonicalText).toBe(second.writes[0].write.canonicalText);
    expect(first.writes[0].write.contentSha256).not.toBe(second.writes[0].write.contentSha256);
  });

  it('gives the same transcript under a different video a different hash', async () => {
    const first = makeDeps();
    await importKnowledgeTranscript(first.deps, baseInput());
    const second = makeDeps();
    await importKnowledgeTranscript(second.deps, baseInput({ videoIdentity: 'yt:other' }));

    expect(first.writes[0].write.contentSha256).not.toBe(second.writes[0].write.contentSha256);
  });

  it('writes each version to its own storage key', async () => {
    const first = makeDeps();
    await importKnowledgeTranscript(first.deps, baseInput());
    const second = makeDeps();
    await importKnowledgeTranscript(second.deps, baseInput({ payload: SRT_RETIMED }));

    // Version-scoped: a failed replace cannot destroy the bytes the surviving
    // row points at.
    expect(first.uploads[0].path).not.toBe(second.uploads[0].path);
    expect(first.uploads[0].path).toContain(first.writes[0].write.contentSha256);
  });

  it('uploads before it writes, and to a key nothing points at yet', async () => {
    const r = makeDeps();
    await importKnowledgeTranscript(r.deps, baseInput());

    expect(r.uploads).toHaveLength(1);
    expect(r.uploads[0].contentType).toBe('application/x-subrip');
    expect(r.uploads[0].path).toBe(r.writes[0].write.storagePath);
  });

  describe('replacing an existing transcript', () => {
    it('passes the expected hash to the transactional write', async () => {
      const target = transcriptTarget();
      const r = makeDeps({ target });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({ replaces: { documentId: DOC, expectedContentSha256: target.contentSha256 } }),
      );

      expect(result.ok).toBe(true);
      // The read-time check is for a clear message; THIS is the check that
      // cannot go stale, so it has to reach the repository.
      expect(r.writes[0].expected).toBe(target.contentSha256);
      expect(r.writes[0].write.documentId).toBe(DOC);
    });

    it('refuses, and writes nothing, when the stored version moved', async () => {
      const r = makeDeps({ target: transcriptTarget({ contentSha256: 'b'.repeat(64) }) });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({ replaces: { documentId: DOC, expectedContentSha256: 'a'.repeat(64) } }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('conflict');
      expect(r.uploads).toHaveLength(0);
      expect(r.writes).toHaveLength(0);
    });

    it('refuses to overwrite a plain text document', async () => {
      // The consistency guard. A transcript shares kind 'text', so without
      // this a text source could be replaced by a version carrying cues that
      // nothing else on that document treats as timed.
      const r = makeDeps({ target: transcriptTarget({ transcriptRepresentation: null }) });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({ replaces: { documentId: DOC, expectedContentSha256: 'a'.repeat(64) } }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('validation');
      expect(r.writes).toHaveLength(0);
    });

    it('refuses to overwrite a document of another kind', async () => {
      const r = makeDeps({ target: transcriptTarget({ kind: 'pdf' }) });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({ replaces: { documentId: DOC, expectedContentSha256: 'a'.repeat(64) } }),
      );

      expect(result.ok).toBe(false);
      expect(r.writes).toHaveLength(0);
    });

    it('reports a missing target rather than creating a new document', async () => {
      const r = makeDeps({ target: null });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({ replaces: { documentId: DOC, expectedContentSha256: 'a'.repeat(64) } }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('not_found');
      expect(r.writes).toHaveLength(0);
    });
  });

  describe('when the write fails', () => {
    it('removes the object it uploaded and leaves the stored version alone', async () => {
      const r = makeDeps({ writeResult: err(domainError('conflict', 'someone else wrote')) });
      const result = await importKnowledgeTranscript(r.deps, baseInput());

      expect(result.ok).toBe(false);
      expect(r.removed).toEqual([r.uploads[0].path]);
      // Nothing here deletes or rewrites a document: the previous version
      // survives because this path never touched it.
      if (!result.ok) expect(cleanupResidue(result.error)).toBeUndefined();
    });

    it('reports residue when the cleanup itself fails', async () => {
      const r = makeDeps({
        writeResult: err(domainError('conflict', 'someone else wrote')),
        removeResult: err(domainError('unavailable', 'bucket unavailable')),
      });
      const result = await importKnowledgeTranscript(r.deps, baseInput());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // The CAUSE is never replaced by the cleanup failure.
        expect(result.error.code).toBe('conflict');
        expect(cleanupResidue(result.error)).toEqual(['stored file']);
      }
    });

    it('does not write when the upload fails', async () => {
      const r = makeDeps({ uploadResult: err(domainError('unavailable', 'bucket unavailable')) });
      const result = await importKnowledgeTranscript(r.deps, baseInput());

      expect(result.ok).toBe(false);
      expect(r.writes).toHaveLength(0);
    });
  });
});

describe('transcriptChunkingBreak', () => {
  const document = (() => {
    const parsed = parseKnowledgeTranscript(SRT, 'srt');
    if (!parsed.ok) throw new Error('fixture must parse');
    return buildKnowledgeTranscriptDocument(parsed.value.cues, 'srt', SRT);
  })();

  it('accepts chunks that contain every cue whole', () => {
    const chunk = {
      chunkIndex: 0,
      text: document.canonicalText,
      charStart: 0,
      charEnd: document.canonicalText.length,
      startMs: 1000,
      endMs: 5000,
    };
    expect(transcriptChunkingBreak(document, [chunk])).toBeNull();
  });

  it('rejects a chunk boundary that falls inside a cue', () => {
    // A citation landing in the split half would have a character range with
    // no single cue behind it, so no timestamp could be named for it.
    const cut = document.cues[0].charStart + 2;
    const chunks = [
      { chunkIndex: 0, text: document.canonicalText.slice(0, cut), charStart: 0, charEnd: cut, startMs: 1000, endMs: 3000 },
      {
        chunkIndex: 1,
        text: document.canonicalText.slice(cut),
        charStart: cut,
        charEnd: document.canonicalText.length,
        startMs: 2500,
        endMs: 5000,
      },
    ];
    expect(transcriptChunkingBreak(document, chunks)).toContain('not wholly inside any chunk');
  });

  it('rejects chunk text that disagrees with its own range', () => {
    const chunks = [
      { chunkIndex: 0, text: 'something else', charStart: 0, charEnd: document.canonicalText.length, startMs: 1000, endMs: 5000 },
    ];
    expect(transcriptChunkingBreak(document, chunks)).toContain('does not match its own character range');
  });
});

describe('transcriptConsistencyBreak', () => {
  it('passes a transcript', () => {
    expect(transcriptConsistencyBreak(transcriptTarget())).toBeNull();
  });

  it('names the crossing it refused', () => {
    expect(transcriptConsistencyBreak(transcriptTarget({ transcriptRepresentation: null })))
      .toContain('plain text source');
    expect(transcriptConsistencyBreak(transcriptTarget({ kind: 'pdf' }))).toContain("kind 'pdf'");
  });
});

describe('buildKnowledgeTranscriptStoragePath', () => {
  it('refuses a hash that is not what it claims to be', () => {
    // A storage key is not the place to discover an input was malformed.
    expect(() => buildKnowledgeTranscriptStoragePath(BOARD, DOC, '../escape', 'srt')).toThrow();
  });

  it('scopes the key by version', () => {
    const path = buildKnowledgeTranscriptStoragePath(BOARD, DOC, 'c'.repeat(64), 'vtt');
    expect(path).toBe(`knowledge/${BOARD}/${DOC}/transcript-${'c'.repeat(64)}.vtt`);
  });
});
