import { describe, expect, it } from 'vitest';

import { ok, err } from '@/lib/domain/core/result';
import { domainError } from '@/lib/domain/core/errors';
import { KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN } from '@/lib/domain/knowledge/knowledgeTranscriptImport';
import type {
  KnowledgeTranscriptImportDeps,
  KnowledgeTranscriptTarget,
} from '@/lib/domain/knowledge/knowledgeTranscriptImport';
import { createKnowledgeTranscriptPostHandler } from './knowledgeTranscriptRoute';

const BOARD = 'board-1';
const DOC = 'doc-1';

const SRT = [
  '1', '00:00:01,000 --> 00:00:03,000', 'hello there', '',
  '2', '00:00:04,000 --> 00:00:06,000', 'goodbye', '',
].join('\n');

interface Recorded {
  readonly creates: unknown[];
  readonly replaces: { expected: { contentSha256: string; mutationRevision: string } }[];
  readonly metadata: { expected: { contentSha256: string; mutationRevision: string } }[];
  readonly cleanup: { boardId: string; documentId: string; path: string }[];
}

function makeHandler(options: {
  userId?: string | null;
  authorized?: boolean;
  target?: KnowledgeTranscriptTarget | null;
  nextRevision?: string;
  writeError?: ReturnType<typeof domainError>;
} = {}) {
  const recorded: Recorded = { creates: [], replaces: [], metadata: [], cleanup: [] };
  const doc = { id: DOC } as never;
  const result = (revision: string) => ok({ document: doc, mutationRevision: revision });

  const deps: KnowledgeTranscriptImportDeps = {
    authorizer: { canMutateBoard: () => Promise.resolve(ok(options.authorized ?? true)) },
    repository: {
      loadTranscriptTarget: () =>
        Promise.resolve(ok(options.target === undefined ? null : options.target)),
      createTranscriptVersion: (write) => {
        recorded.creates.push(write);
        return Promise.resolve(
          options.writeError ? err(options.writeError) : result(options.nextRevision ?? '2'),
        );
      },
      replaceTranscriptVersion: (write, expected) => {
        recorded.replaces.push({ expected });
        return Promise.resolve(
          options.writeError ? err(options.writeError) : result(options.nextRevision ?? '2'),
        );
      },
      updateTranscriptMetadata: (_scope, _metadata, expected) => {
        recorded.metadata.push({ expected });
        return Promise.resolve(
          options.writeError ? err(options.writeError) : result(options.nextRevision ?? '2'),
        );
      },
    },
    storage: {
      upload: () => Promise.resolve(ok(undefined)),
      remove: () => Promise.resolve(ok(undefined)),
    },
    hasher: {
      sha256: async (bytes: Uint8Array) => {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      },
    },
    ids: { newDocumentId: () => DOC as never },
    uploads: { newUploadId: () => 'upload01' },
  };

  const handler = createKnowledgeTranscriptPostHandler({
    getAuthenticatedUserId: () => Promise.resolve(options.userId === undefined ? 'user-1' : options.userId),
    createTranscriptDeps: () => deps,
    recordCleanupCandidate: (entry) => recorded.cleanup.push(entry),
  });

  return { handler, recorded };
}

const request = (body: unknown) =>
  new Request('http://test/api/boards/board-1/knowledge/transcript', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const context = { params: Promise.resolve({ id: BOARD }) };

const validBody = (over: Record<string, unknown> = {}) => ({
  payload: SRT,
  format: 'srt',
  title: 'Lecture 1',
  trackKind: 'machine',
  ...over,
});

describe('the transcript import route', () => {
  it('refuses an unauthenticated caller', async () => {
    const { handler } = makeHandler({ userId: null });
    const response = await handler(request(validBody()), context);
    expect(response.status).toBe(401);
  });

  it('refuses a caller without board permission', async () => {
    const { handler } = makeHandler({ authorized: false });
    const response = await handler(request(validBody()), context);
    expect(response.status).toBe(403);
  });

  it('creates a transcript and returns BOTH halves of the new version', async () => {
    const { handler, recorded } = makeHandler({ nextRevision: '7' });
    const response = await handler(request(validBody()), context);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.documentId).toBe(DOC);
    expect(body.mutationRevision).toBe('7');
    // Without the hash a caller cannot make a second edit without re-reading,
    // and without the revision its second edit would be refused.
    expect(body.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(recorded.creates).toHaveLength(1);
  });

  it('will not guess the format', async () => {
    // Reading a nearly-SRT paste as SRT drops the lines that did not fit, and
    // the result looks exactly like a transcript that never had cues.
    const { handler } = makeHandler();
    const response = await handler(request({ ...validBody(), format: undefined }), context);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('format');
  });

  it('refuses a replacement that carries only the hash', async () => {
    // The hash alone cannot separate two people editing from one view: a
    // metadata correction leaves it unchanged. A half-specified replacement is
    // refused rather than quietly treated as a create.
    const { handler, recorded } = makeHandler();
    const response = await handler(
      request({ ...validBody(), replaces: { documentId: DOC, expectedContentSha256: 'a'.repeat(64) } }),
      context,
    );

    expect(response.status).toBe(400);
    expect(recorded.creates).toHaveLength(0);
    expect(recorded.replaces).toHaveLength(0);
  });

  it('passes both halves of the expected version to the write', async () => {
    const target: KnowledgeTranscriptTarget = {
      documentId: DOC as never,
      boardId: BOARD as never,
      kind: 'text',
      transcriptRepresentation: { representationVersion: 1, cues: [], language: null, trackKind: 'machine', format: 'srt', videoIdentity: null, videoAssociation: 'none' },
      contentSha256: 'a'.repeat(64),
      mutationRevision: 'rev-1',
      storagePath: 'old/path',
      originalFilename: 'Lecture 1',
      document: { id: DOC } as never,
    };
    const { handler, recorded } = makeHandler({ target });

    const response = await handler(
      request({
        ...validBody(),
        replaces: {
          documentId: DOC,
          expectedContentSha256: 'a'.repeat(64),
          expectedMutationRevision: 'rev-1',
        },
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(recorded.replaces[0].expected).toEqual({
      contentSha256: 'a'.repeat(64),
      mutationRevision: 'rev-1',
    });
  });

  it('reports a conflict as retryable after a refresh', async () => {
    const { handler } = makeHandler({
      writeError: domainError('conflict', 'This transcript changed since you opened it'),
    });
    const response = await handler(request(validBody()), context);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.refreshRequired).toBe(true);
    expect(body.safeToRetry).toBe(true);
  });

  it('reports a stalled revision as NOT retryable', async () => {
    // The transaction committed. A blind retry re-sends the same expected
    // revision, matches again, and overwrites again -- so this must never
    // arrive looking like an ordinary failed save.
    const target: KnowledgeTranscriptTarget = {
      documentId: DOC as never,
      boardId: BOARD as never,
      kind: 'text',
      transcriptRepresentation: { representationVersion: 1, cues: [], language: null, trackKind: 'machine', format: 'srt', videoIdentity: null, videoAssociation: 'none' },
      contentSha256: 'a'.repeat(64),
      mutationRevision: 'rev-1',
      storagePath: 'old/path',
      originalFilename: 'Lecture 1',
      document: { id: DOC } as never,
    };
    const withTarget = makeHandler({ target, nextRevision: 'rev-1' });

    const response = await withTarget.handler(
      request({
        ...validBody(),
        replaces: {
          documentId: DOC,
          expectedContentSha256: 'a'.repeat(64),
          expectedMutationRevision: 'rev-1',
        },
      }),
      context,
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe(KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN);
    expect(body.safeToRetry).toBe(false);
    expect(body.refreshRequired).toBe(true);
  });

  it('records the superseded object as a cleanup candidate without deleting it', async () => {
    const target: KnowledgeTranscriptTarget = {
      documentId: DOC as never,
      boardId: BOARD as never,
      kind: 'text',
      transcriptRepresentation: { representationVersion: 1, cues: [], language: null, trackKind: 'machine', format: 'srt', videoIdentity: null, videoAssociation: 'none' },
      contentSha256: 'a'.repeat(64),
      mutationRevision: 'rev-1',
      storagePath: 'knowledge/board-1/doc-1/transcript-old.srt',
      originalFilename: 'Lecture 1',
      document: { id: DOC } as never,
    };
    const { handler, recorded } = makeHandler({ target });

    const response = await handler(
      request({
        ...validBody(),
        replaces: {
          documentId: DOC,
          expectedContentSha256: 'a'.repeat(64),
          expectedMutationRevision: 'rev-1',
        },
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(recorded.cleanup).toEqual([
      { boardId: BOARD, documentId: DOC, path: 'knowledge/board-1/doc-1/transcript-old.srt' },
    ]);
    const body = await response.json();
    expect(body.supersededCleanupCandidate).toBe('knowledge/board-1/doc-1/transcript-old.srt');
  });

  it('rejects an empty transcript before anything else', async () => {
    const { handler, recorded } = makeHandler();
    const response = await handler(request({ ...validBody(), payload: '' }), context);

    expect(response.status).toBe(400);
    expect(recorded.creates).toHaveLength(0);
  });
});

describe('the panel contract the route answers', () => {
  it('never returns a document without the version to edit on', async () => {
    const { handler } = makeHandler();
    const response = await handler(request(validBody()), context);
    const body = await response.json();

    // A response that carried only the id would force every caller to re-read
    // before its next save, and a caller that skipped that would overwrite.
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(['documentId', 'contentSha256', 'mutationRevision']),
    );
  });
});
