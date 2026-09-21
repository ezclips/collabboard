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
  type KnowledgeTranscriptCreateWrite,
  type KnowledgeTranscriptImportDeps,
  type KnowledgeTranscriptImportInput,
  type KnowledgeTranscriptExpectedVersion,
  type KnowledgeTranscriptMetadata,
  type KnowledgeTranscriptReplaceWrite,
  type KnowledgeTranscriptTarget,
  type KnowledgeTranscriptVersionBody,
  type KnowledgeTranscriptWriteResult,
} from './knowledgeTranscriptImport';
import { buildKnowledgeTranscriptDocument } from './knowledgeTranscriptDocument';
import { parseKnowledgeTranscript } from './knowledgeTranscriptCues';
import { knowledgeTranscriptStoredRepresentation } from './knowledgeTranscriptVersion';

const BOARD = 'board-1' as BoardId;
const OTHER_BOARD = 'board-2' as BoardId;
const USER = 'user-1' as UserId;
const OTHER_USER = 'user-2' as UserId;
const DOC = 'doc-1' as KnowledgeDocumentId;
const NEW_DOC = 'doc-new' as KnowledgeDocumentId;
/** The revision a caller observed when it began editing. */
const REV = 'rev-1';

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

/** The same transcript, re-pasted with different raw bytes. Same version. */
const SRT_REFORMATTED = `${SRT.replace(/\n/g, '\r\n')}\r\n\r\n`;

/** `details` is deliberately `unknown` on DomainError, so read it narrowly. */
const cleanupResidue = (error: DomainError): unknown =>
  (error.details as { cleanupFailed?: unknown } | undefined)?.cleanupFailed;

type AnyWrite = KnowledgeTranscriptCreateWrite | KnowledgeTranscriptReplaceWrite;

interface Recorder {
  readonly deps: KnowledgeTranscriptImportDeps;
  readonly uploads: { path: string; bytes: Uint8Array; contentType: string }[];
  readonly removed: string[];
  readonly creates: KnowledgeTranscriptCreateWrite[];
  readonly replaces: { write: KnowledgeTranscriptReplaceWrite; expected: KnowledgeTranscriptExpectedVersion }[];
  readonly loads: { boardId: BoardId; documentId: KnowledgeDocumentId }[];
  readonly metadataUpdates: {
    scope: { documentId: KnowledgeDocumentId; boardId: BoardId };
    metadata: Omit<KnowledgeTranscriptMetadata, 'format'>;
    expected: KnowledgeTranscriptExpectedVersion;
  }[];
}

function makeDeps(options: {
  authorized?: boolean;
  target?: KnowledgeTranscriptTarget | null;
  writeResult?: Result<KnowledgeTranscriptWriteResult, DomainError>;
  uploadResult?: Result<void, DomainError>;
  removeResult?: Result<void, DomainError>;
  metadataResult?: Result<KnowledgeTranscriptWriteResult, DomainError>;
  uploadIds?: string[];
  nextRevision?: string;
} = {}): Recorder {
  const uploads: Recorder['uploads'] = [];
  const removed: string[] = [];
  const creates: KnowledgeTranscriptCreateWrite[] = [];
  const replaces: Recorder['replaces'] = [];
  const loads: Recorder['loads'] = [];
  const metadataUpdates: Recorder['metadataUpdates'] = [];
  const doc = { id: DOC } as unknown as KnowledgeDocument;
  const stored = { document: doc, mutationRevision: options.nextRevision ?? 'rev-2' };
  const updatedStored = { document: doc, mutationRevision: options.nextRevision ?? 'rev-2' };
  const ids = [...(options.uploadIds ?? ['upload01'])];

  return {
    uploads,
    removed,
    creates,
    replaces,
    loads,
    metadataUpdates,
    deps: {
      authorizer: {
        canMutateBoard: () => Promise.resolve(ok(options.authorized ?? true)),
      },
      repository: {
        loadTranscriptTarget: (boardId, documentId) => {
          loads.push({ boardId, documentId });
          return Promise.resolve(ok(options.target === undefined ? null : options.target));
        },
        createTranscriptVersion: (write) => {
          creates.push(write);
          return Promise.resolve(options.writeResult ?? ok(stored));
        },
        replaceTranscriptVersion: (write, expected) => {
          replaces.push({ write, expected });
          return Promise.resolve(options.writeResult ?? ok(stored));
        },
        updateTranscriptMetadata: (scope, metadata, expected) => {
          metadataUpdates.push({ scope, metadata, expected });
          return Promise.resolve(options.metadataResult ?? ok(updatedStored));
        },
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
      ids: { newDocumentId: () => NEW_DOC },
      uploads: { newUploadId: () => ids.shift() ?? 'exhausted' },
    },
  };
}

const allWrites = (r: Recorder): AnyWrite[] => [
  ...r.creates,
  ...r.replaces.map((entry) => entry.write),
];

const baseInput = (
  over: Partial<KnowledgeTranscriptImportInput> = {},
): KnowledgeTranscriptImportInput => ({
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

const transcriptTarget = (
  over: Partial<KnowledgeTranscriptTarget> = {},
): KnowledgeTranscriptTarget => ({
  documentId: DOC,
  boardId: BOARD,
  kind: 'text',
  transcriptRepresentation: knowledgeTranscriptStoredRepresentation({
    cues: [],
    videoIdentity: 'yt:abc123',
    language: null,
    trackKind: 'machine',
    format: 'srt',
  }),
  contentSha256: 'a'.repeat(64),
  mutationRevision: 'rev-1',
  storagePath: 'knowledge/board-1/doc-1/transcript-old.srt',
  originalFilename: 'Lecture 1',
  document: { id: DOC } as unknown as KnowledgeDocument,
  ...over,
});

/** The hash the importer will compute for a given payload and video. */
async function hashOf(payload: string, videoIdentity: string | null = 'yt:abc123'): Promise<string> {
  const r = makeDeps();
  await importKnowledgeTranscript(r.deps, baseInput({ payload, videoIdentity }));
  return r.creates[0].contentSha256;
}

describe('importKnowledgeTranscript', () => {
  it('refuses an unauthorized board without touching storage or the database', async () => {
    const r = makeDeps({ authorized: false });
    const result = await importKnowledgeTranscript(r.deps, baseInput());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('permission_denied');
    // The order matters, not just the refusal: a rejection that has already
    // uploaded is a rejection that left something behind.
    expect(r.uploads).toHaveLength(0);
    expect(allWrites(r)).toHaveLength(0);
  });

  it('writes the whole version in ONE repository call', async () => {
    const r = makeDeps();
    const result = await importKnowledgeTranscript(r.deps, baseInput());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.written).toBe(true);
    expect(r.creates).toHaveLength(1);
    expect(r.replaces).toHaveLength(0);
    const write = r.creates[0];
    expect(write.canonicalText).toContain('hello there');
    expect(write.representation.cues).toHaveLength(2);
    expect(write.chunks.length).toBeGreaterThan(0);
    expect(write.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps repeated cue text, with no automatic de-duplication', async () => {
    const r = makeDeps();
    await importKnowledgeTranscript(r.deps, baseInput());

    const write = r.creates[0];
    expect(write.canonicalText.split('hello there').length - 1).toBe(2);
    expect(write.representation.cues).toHaveLength(2);
  });

  it('keeps overlapping cues as separate cues, in file order', async () => {
    const r = makeDeps();
    await importKnowledgeTranscript(r.deps, baseInput());

    const [first, second] = r.creates[0].representation.cues;
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

    expect(first.creates[0].canonicalText).toBe(second.creates[0].canonicalText);
    expect(first.creates[0].contentSha256).not.toBe(second.creates[0].contentSha256);
  });

  it('gives the same transcript under a different video a different hash', async () => {
    const first = makeDeps();
    await importKnowledgeTranscript(first.deps, baseInput());
    const second = makeDeps();
    await importKnowledgeTranscript(second.deps, baseInput({ videoIdentity: 'yt:other' }));

    expect(first.creates[0].contentSha256).not.toBe(second.creates[0].contentSha256);
  });

  it('uploads before it writes, to the key it then records', async () => {
    const r = makeDeps();
    await importKnowledgeTranscript(r.deps, baseInput());

    expect(r.uploads).toHaveLength(1);
    expect(r.uploads[0].contentType).toBe('application/x-subrip');
    expect(r.uploads[0].path).toBe(r.creates[0].storagePath);
  });

  describe('object ownership', () => {
    it('gives two attempts with the SAME content hash different keys', async () => {
      // The concurrency hazard in one assertion: a key derived from content
      // alone would be shared, and then one request's cleanup is the other
      // request's data loss.
      const first = makeDeps({ uploadIds: ['uploadaa'] });
      await importKnowledgeTranscript(first.deps, baseInput());
      const second = makeDeps({ uploadIds: ['uploadbb'] });
      await importKnowledgeTranscript(second.deps, baseInput());

      expect(first.creates[0].contentSha256).toBe(second.creates[0].contentSha256);
      expect(first.uploads[0].path).not.toBe(second.uploads[0].path);
    });

    it('cleans up only its own object when two replacements race', async () => {
      // Both callers hold the SAME expected hash and produce the SAME new
      // content hash. One commits; the other loses the transactional check.
      const target = transcriptTarget();
      const winner = makeDeps({ target, uploadIds: ['winner01'] });
      const loser = makeDeps({
        target,
        uploadIds: ['loser001'],
        writeResult: err(domainError('conflict', 'expected hash no longer stored')),
      });
      const replaceInput = baseInput({
        payload: SRT_RETIMED,
        replaces: { documentId: DOC, expectedContentSha256: target.contentSha256, expectedMutationRevision: REV },
      });

      const won = await importKnowledgeTranscript(winner.deps, replaceInput);
      const lost = await importKnowledgeTranscript(loser.deps, replaceInput);

      expect(won.ok).toBe(true);
      expect(lost.ok).toBe(false);
      if (!lost.ok) expect(lost.error.code).toBe('conflict');

      const winnerObject = winner.uploads[0].path;
      // The loser removed its own object and nothing else. The winner's
      // published object is untouched by the loser.
      expect(loser.removed).toEqual([loser.uploads[0].path]);
      expect(loser.removed).not.toContain(winnerObject);
      expect(loser.uploads[0].path).not.toBe(winnerObject);
    });
  });

  // TWO OPERATIONS THAT BEGAN FROM ONE OBSERVED VERSION. The content hash
  // cannot separate them -- the same-hash paths leave it exactly where they
  // found it -- so the mutation revision is the only thing that can. In each
  // scenario the winner commits and the loser is refused by the locked check.
  describe('concurrent edits from the same observed revision', () => {
    const conflict = err(domainError('conflict', 'the stored revision has moved'));

    it('lets exactly one of two metadata corrections commit', async () => {
      const target = transcriptTarget();
      const same = await hashOf(SRT);
      const observed = transcriptTarget({ contentSha256: same });

      const winner = makeDeps({ target: observed, nextRevision: 'rev-2' });
      const loser = makeDeps({ target: observed, metadataResult: conflict });

      const titleFix = baseInput({
        payload: SRT,
        title: 'Lecture 1 (corrected)',
        replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
      });
      const languageFix = baseInput({
        payload: SRT,
        language: 'de',
        replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
      });

      const won = await importKnowledgeTranscript(winner.deps, titleFix);
      const lost = await importKnowledgeTranscript(loser.deps, languageFix);

      expect(won.ok).toBe(true);
      // Both carried the SAME revision; only the locked check can separate
      // them, and it did.
      expect(winner.metadataUpdates[0].expected.mutationRevision).toBe(REV);
      expect(loser.metadataUpdates[0].expected.mutationRevision).toBe(REV);
      expect(lost.ok).toBe(false);
      if (!lost.ok) expect(lost.error.code).toBe('conflict');
      // A metadata correction uploads nothing, so it has nothing to remove --
      // and in particular nothing of the winner's.
      expect(loser.removed).toHaveLength(0);
      expect(target.storagePath).not.toBe('');
    });

    it('lets exactly one of a metadata correction and a same-hash format replacement commit', async () => {
      const same = await hashOf(SRT);
      const observed = transcriptTarget({ contentSha256: same });
      const vtt = [
        'WEBVTT', '', '00:00:01.000 --> 00:00:03.000', 'hello there', '',
        '00:00:02.500 --> 00:00:05.000', 'hello there', '',
      ].join('\n');

      const formatWinner = makeDeps({ target: observed, uploadIds: ['fmtwin01'] });
      const metadataLoser = makeDeps({ target: observed, metadataResult: conflict });

      const won = await importKnowledgeTranscript(
        formatWinner.deps,
        baseInput({
          payload: vtt,
          format: 'vtt',
          replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
        }),
      );
      const lost = await importKnowledgeTranscript(
        metadataLoser.deps,
        baseInput({
          payload: SRT,
          trackKind: 'human',
          replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
        }),
      );

      expect(won.ok).toBe(true);
      if (won.ok) expect(won.value.written).toBe(true);
      expect(lost.ok).toBe(false);
      // The format replacement's own object must survive the loser's failure.
      expect(metadataLoser.removed).not.toContain(formatWinner.uploads[0].path);
    });

    it('lets exactly one of a metadata correction and a content replacement commit', async () => {
      const same = await hashOf(SRT);
      const observed = transcriptTarget({ contentSha256: same });

      const contentWinner = makeDeps({ target: observed, uploadIds: ['contwin1'] });
      const metadataLoser = makeDeps({ target: observed, metadataResult: conflict });

      const won = await importKnowledgeTranscript(
        contentWinner.deps,
        baseInput({
          payload: SRT_RETIMED,
          replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
        }),
      );
      const lost = await importKnowledgeTranscript(
        metadataLoser.deps,
        baseInput({
          payload: SRT,
          title: 'renamed while timings were being fixed',
          replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
        }),
      );

      expect(won.ok).toBe(true);
      expect(lost.ok).toBe(false);
      if (!lost.ok) expect(lost.error.code).toBe('conflict');
      expect(metadataLoser.removed).not.toContain(contentWinner.uploads[0].path);
      // The winner's superseded object is a retained candidate, not a deletion.
      if (won.ok) expect(won.value.supersededCleanupCandidate).toBe(observed.storagePath);
      expect(contentWinner.removed).toHaveLength(0);
    });

    it('refuses before any effect when the observed revision is stale', async () => {
      // The read-time check, which exists for a clear message. The locked
      // check is what actually decides, but this one costs nothing.
      const r = makeDeps({ target: transcriptTarget({ mutationRevision: 'rev-9' }) });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT_RETIMED,
          replaces: {
            documentId: DOC,
            expectedContentSha256: 'a'.repeat(64),
            expectedMutationRevision: REV,
          },
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('conflict');
      expect(r.uploads).toHaveLength(0);
      expect(allWrites(r)).toHaveLength(0);
      expect(r.metadataUpdates).toHaveLength(0);
    });
  });

  describe('the revision must move on every successful write', () => {
    it('refuses a replacement that committed without moving it', async () => {
      // An RPC that forgets to bump hands the caller a revision the NEXT
      // writer will also match -- the same lost update, one step later.
      const target = transcriptTarget();
      const r = makeDeps({ target, nextRevision: REV });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT_RETIMED,
          replaces: { documentId: DOC, expectedContentSha256: target.contentSha256, expectedMutationRevision: REV },
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(String(result.error.message)).toContain('version marker');
    });

    it('refuses a metadata update that committed without moving it', async () => {
      const same = await hashOf(SRT);
      const r = makeDeps({ target: transcriptTarget({ contentSha256: same }), nextRevision: REV });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT,
          title: 'renamed',
          replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(String(result.error.message)).toContain('version marker');
    });

    it('reports the new revision for a caller editing on', async () => {
      const same = await hashOf(SRT);
      const r = makeDeps({ target: transcriptTarget({ contentSha256: same }), nextRevision: 'rev-7' });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT,
          title: 'renamed',
          replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
        }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.mutationRevision).toBe('rev-7');
    });
  });

  describe('replacing an existing transcript', () => {
    it('looks the target up scoped by board, not by document alone', async () => {
      const target = transcriptTarget();
      const r = makeDeps({ target });
      await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT_RETIMED,
          replaces: { documentId: DOC, expectedContentSha256: target.contentSha256, expectedMutationRevision: REV },
        }),
      );

      expect(r.loads).toEqual([{ boardId: BOARD, documentId: DOC }]);
    });

    it('refuses a target whose stored board is not the caller’s board', async () => {
      // A service_role RPC is not narrowed by RLS, so a caller authorized on
      // its own board could otherwise nominate another board's document.
      const r = makeDeps({ target: transcriptTarget({ boardId: OTHER_BOARD }) });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT_RETIMED,
          replaces: { documentId: DOC, expectedContentSha256: 'a'.repeat(64), expectedMutationRevision: REV },
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('not_found');
      expect(r.uploads).toHaveLength(0);
      expect(allWrites(r)).toHaveLength(0);
    });

    it('never carries an author on a replacement', async () => {
      // Provenance is preserved by the transaction; the replace type cannot
      // even express changing it. Checked at runtime too, because a type is
      // not a guarantee about what the adapter receives.
      const target = transcriptTarget();
      const r = makeDeps({ target });
      await importKnowledgeTranscript(
        r.deps,
        baseInput({
          userId: OTHER_USER,
          payload: SRT_RETIMED,
          replaces: { documentId: DOC, expectedContentSha256: target.contentSha256, expectedMutationRevision: REV },
        }),
      );

      const write = r.replaces[0].write as unknown as Record<string, unknown>;
      expect(write.createdBy).toBeUndefined();
      expect(write.kind).toBeUndefined();
      // boardId is present as the SCOPE to match, not a value to re-home to.
      expect(write.boardId).toBe(BOARD);
      expect(write.documentId).toBe(DOC);
    });

    it('passes the expected hash to the transactional write', async () => {
      const target = transcriptTarget();
      const r = makeDeps({ target });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT_RETIMED,
          replaces: { documentId: DOC, expectedContentSha256: target.contentSha256, expectedMutationRevision: REV },
        }),
      );

      expect(result.ok).toBe(true);
      expect(r.replaces[0].expected).toEqual({ contentSha256: target.contentSha256, mutationRevision: REV });
    });

    it('refuses, and writes nothing, when the stored version moved', async () => {
      const r = makeDeps({ target: transcriptTarget({ contentSha256: 'b'.repeat(64) }) });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          replaces: { documentId: DOC, expectedContentSha256: 'a'.repeat(64), expectedMutationRevision: REV },
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('conflict');
      expect(r.uploads).toHaveLength(0);
      expect(allWrites(r)).toHaveLength(0);
    });

    it('refuses to overwrite a plain text document', async () => {
      const r = makeDeps({ target: transcriptTarget({ transcriptRepresentation: null }) });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({ replaces: { documentId: DOC, expectedContentSha256: 'a'.repeat(64), expectedMutationRevision: REV } }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('validation');
      expect(allWrites(r)).toHaveLength(0);
    });

    it('refuses to overwrite a document of another kind', async () => {
      const r = makeDeps({ target: transcriptTarget({ kind: 'pdf' }) });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({ replaces: { documentId: DOC, expectedContentSha256: 'a'.repeat(64), expectedMutationRevision: REV } }),
      );

      expect(result.ok).toBe(false);
      expect(allWrites(r)).toHaveLength(0);
    });

    it('reports a missing target rather than creating a new document', async () => {
      const r = makeDeps({ target: null });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({ replaces: { documentId: DOC, expectedContentSha256: 'a'.repeat(64), expectedMutationRevision: REV } }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('not_found');
      expect(allWrites(r)).toHaveLength(0);
    });

    it('RETAINS the superseded object and returns it as a cleanup candidate', async () => {
      const target = transcriptTarget();
      const r = makeDeps({ target });
      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT_RETIMED,
          replaces: { documentId: DOC, expectedContentSha256: target.contentSha256, expectedMutationRevision: REV },
        }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.supersededCleanupCandidate).toBe(target.storagePath);
      // NOT deleted. A candidate is not residue, and this request is not in a
      // position to know whether anything is still mid-flight against it.
      expect(r.removed).toHaveLength(0);
    });

    it('leaves an in-flight reader of the previous version able to fetch it', async () => {
      // The race the old code created: a reader resolves the row, the replace
      // commits, the object is deleted, and the reader's fetch fails on an
      // object that existed when it was told about it.
      const target = transcriptTarget();
      const r = makeDeps({ target });

      // A reader that resolved the OLD row before the import ran.
      const readerHolds = target.storagePath;

      await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT_RETIMED,
          replaces: { documentId: DOC, expectedContentSha256: target.contentSha256, expectedMutationRevision: REV },
        }),
      );

      expect(r.removed).not.toContain(readerHolds);
    });

    it('does not touch the superseded object when the write fails', async () => {
      const target = transcriptTarget();
      const r = makeDeps({
        target,
        writeResult: err(domainError('conflict', 'expected hash no longer stored')),
      });
      await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT_RETIMED,
          replaces: { documentId: DOC, expectedContentSha256: target.contentSha256, expectedMutationRevision: REV },
        }),
      );

      // The surviving row still points at it. Removing it would leave a good
      // row with a missing original.
      expect(r.removed).not.toContain(target.storagePath);
    });
  });

  describe('a re-import of the same version', () => {
    it('writes nothing and uploads nothing when the hash is unchanged', async () => {
      // Equivalent formatting, different raw bytes, SAME semantic version.
      // Writing would swap the referenced original for bytes that mean the
      // same thing, and put a referenced object at risk for no gain.
      const same = await hashOf(SRT);
      const target = transcriptTarget({ contentSha256: same });
      const r = makeDeps({ target });

      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT_REFORMATTED,
          replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
        }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.written).toBe(false);
        expect(result.value.metadataOnly).toBe(false);
        expect(result.value.metadataChanged).toEqual([]);
        expect(result.value.supersededCleanupCandidate).toBeNull();
        expect(result.value.document).toBe(target.document);
      }
      expect(r.uploads).toHaveLength(0);
      expect(r.removed).toHaveLength(0);
      expect(r.metadataUpdates).toHaveLength(0);
      expect(allWrites(r)).toHaveLength(0);
    });

    // METADATA IS NOT COVERED BY THE HASH, so an identical hash does not mean
    // an identical request. Each of these was silently discarded before.
    const metadataCase = (
      label: string,
      over: Partial<KnowledgeTranscriptImportInput>,
      field: string,
    ) => {
      it(`applies a ${label} correction instead of dropping it`, async () => {
        const same = await hashOf(SRT);
        const target = transcriptTarget({ contentSha256: same });
        const r = makeDeps({ target });

        const result = await importKnowledgeTranscript(
          r.deps,
          baseInput({
            payload: SRT,
            replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
            ...over,
          }),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.written).toBe(false);
          expect(result.value.metadataOnly).toBe(true);
          expect(result.value.metadataChanged).toContain(field);
        }
        expect(r.metadataUpdates).toHaveLength(1);
        // Scoped and conditional, exactly like a replacement: a metadata write
        // is no less able to land on the wrong row.
        expect(r.metadataUpdates[0].scope).toEqual({ documentId: DOC, boardId: BOARD });
        expect(r.metadataUpdates[0].expected).toEqual({ contentSha256: same, mutationRevision: REV });
        // The version is untouched: nothing uploaded, no chunk or text write.
        expect(r.uploads).toHaveLength(0);
        expect(allWrites(r)).toHaveLength(0);
      });
    };

    metadataCase('title', { title: 'Lecture 1 (corrected)' }, 'originalFilename');
    metadataCase('language', { language: 'de' }, 'language');
    metadataCase('track-kind', { trackKind: 'human' }, 'trackKind');

    it('treats a format change as a new stored original, not as metadata', async () => {
      // The declared format describes the RETAINED ORIGINAL. Changing it while
      // keeping the old object would leave the row claiming a format its
      // stored bytes are not in, so this takes the full path -- with the same
      // hash, because the content genuinely did not change.
      const same = await hashOf(SRT);
      const target = transcriptTarget({ contentSha256: same });
      const r = makeDeps({ target });

      const vtt = ['WEBVTT', '', '00:00:01.000 --> 00:00:03.000', 'hello there', '',
        '00:00:02.500 --> 00:00:05.000', 'hello there', ''].join('\n');

      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: vtt,
          format: 'vtt',
          replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
        }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.written).toBe(true);
        expect(result.value.metadataOnly).toBe(false);
        expect(result.value.metadataChanged).toContain('format');
      }
      expect(r.metadataUpdates).toHaveLength(0);
      expect(r.replaces).toHaveLength(1);
      expect(r.replaces[0].write.contentSha256).toBe(same);
      expect(r.uploads[0].contentType).toBe('text/vtt');
    });

    it('reports a failed metadata update rather than claiming success', async () => {
      const same = await hashOf(SRT);
      const r = makeDeps({
        target: transcriptTarget({ contentSha256: same }),
        metadataResult: err(domainError('conflict', 'expected hash no longer stored')),
      });

      const result = await importKnowledgeTranscript(
        r.deps,
        baseInput({
          payload: SRT,
          title: 'renamed',
          replaces: { documentId: DOC, expectedContentSha256: same, expectedMutationRevision: REV },
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('conflict');
      expect(r.uploads).toHaveLength(0);
    });

    it('confirms the reformatted paste really is the same version', async () => {
      // Guards the test above from passing for the wrong reason: if the two
      // pastes hashed differently, the no-op branch would never be reached.
      expect(await hashOf(SRT_REFORMATTED)).toBe(await hashOf(SRT));
    });
  });

  describe('when the write fails', () => {
    it('removes the object it uploaded', async () => {
      const r = makeDeps({ writeResult: err(domainError('conflict', 'someone else wrote')) });
      const result = await importKnowledgeTranscript(r.deps, baseInput());

      expect(result.ok).toBe(false);
      expect(r.removed).toEqual([r.uploads[0].path]);
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
      expect(allWrites(r)).toHaveLength(0);
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
      {
        chunkIndex: 0,
        text: document.canonicalText.slice(0, cut),
        charStart: 0,
        charEnd: cut,
        startMs: 1000,
        endMs: 3000,
      },
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
      {
        chunkIndex: 0,
        text: 'something else',
        charStart: 0,
        charEnd: document.canonicalText.length,
        startMs: 1000,
        endMs: 5000,
      },
    ];
    expect(transcriptChunkingBreak(document, chunks)).toContain(
      'does not match its own character range',
    );
  });
});

describe('transcriptConsistencyBreak', () => {
  it('passes a transcript', () => {
    expect(transcriptConsistencyBreak(transcriptTarget())).toBeNull();
  });

  it('names the crossing it refused', () => {
    expect(
      transcriptConsistencyBreak(transcriptTarget({ transcriptRepresentation: null })),
    ).toContain('plain text source');
    expect(transcriptConsistencyBreak(transcriptTarget({ kind: 'pdf' }))).toContain("kind 'pdf'");
  });
});

describe('buildKnowledgeTranscriptStoragePath', () => {
  it('refuses a hash that is not what it claims to be', () => {
    // A storage key is not the place to discover an input was malformed.
    expect(() =>
      buildKnowledgeTranscriptStoragePath(BOARD, DOC, '../escape', 'upload01', 'srt'),
    ).toThrow();
  });

  it('refuses an upload id that is not what it claims to be', () => {
    expect(() =>
      buildKnowledgeTranscriptStoragePath(BOARD, DOC, 'c'.repeat(64), '../escape', 'srt'),
    ).toThrow();
  });

  it('scopes the key by version AND by attempt', () => {
    const path = buildKnowledgeTranscriptStoragePath(BOARD, DOC, 'c'.repeat(64), 'upload01', 'vtt');
    expect(path).toBe(`knowledge/${BOARD}/${DOC}/transcript-${'c'.repeat(64)}-upload01.vtt`);
  });
});

describe('the version body carries no identity', () => {
  it('has no author or board field to set', () => {
    // A compile-time fact, asserted so it is visible: the shared body is
    // content only. Authorship lives on the create shape alone.
    const body: KnowledgeTranscriptVersionBody = {
      originalFilename: 'x',
      mimeType: 'text/vtt',
      fileSizeBytes: 1,
      storagePath: 'p',
      contentSha256: 'd'.repeat(64),
      parserName: 'n',
      parserVersion: '1',
      parserOptionsHash: 'e'.repeat(64),
      canonicalText: '',
      representation: knowledgeTranscriptStoredRepresentation({
        cues: [],
        videoIdentity: null,
        language: null,
        trackKind: 'unknown',
        format: 'plain',
      }),
      chunks: [],
    };
    expect(Object.keys(body)).not.toContain('createdBy');
    expect(Object.keys(body)).not.toContain('boardId');
  });
});
