import { describe, expect, it } from 'vitest';

import { KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN } from '@/lib/domain/knowledge/knowledgeTranscriptImport';
import type {
  KnowledgeTranscriptCreateWrite,
  KnowledgeTranscriptExpectedVersion,
} from '@/lib/domain/knowledge/knowledgeTranscriptImport';
import {
  RandomKnowledgeTranscriptUploadIdFactory,
  SupabaseKnowledgeTranscriptRepository,
  type KnowledgeTranscriptSupabaseClient,
} from './knowledgeTranscriptAdapters';

const BOARD = 'board-1' as never;
const DOC = 'doc-1' as never;

const representation = {
  representationVersion: 1,
  videoIdentity: null,
  cues: [],
  language: null,
  trackKind: 'machine' as const,
  format: 'srt' as const,
  videoAssociation: 'none' as const,
};

const createWrite: KnowledgeTranscriptCreateWrite = {
  documentId: DOC,
  boardId: BOARD,
  createdBy: 'user-1' as never,
  kind: 'text',
  originalFilename: 'Lecture 1',
  mimeType: 'application/x-subrip',
  fileSizeBytes: 10,
  storagePath: 'knowledge/board-1/doc-1/transcript-x.srt',
  contentSha256: 'a'.repeat(64),
  parserName: 'knowledge-transcript',
  parserVersion: '1',
  parserOptionsHash: 'b'.repeat(64),
  canonicalText: 'hello',
  representation,
  chunks: [],
};

const expected: KnowledgeTranscriptExpectedVersion = {
  contentSha256: 'a'.repeat(64),
  mutationRevision: '3',
};

function makeClient(options: {
  rpcData?: { document_id: string; mutation_revision: number | string }[] | null;
  rpcError?: { code?: string; message?: string } | null;
  row?: Record<string, unknown> | null;
  rowError?: { code?: string; message?: string } | null;
} = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: KnowledgeTranscriptSupabaseClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: (options.row ?? null) as never,
                error: options.rowError ?? null,
              }),
          }),
        }),
      }),
    }),
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve({
        data: (options.rpcData ?? [{ document_id: 'doc-1', mutation_revision: 4 }]) as never,
        error: options.rpcError ?? null,
      });
    },
  };
  return { client, calls, repository: new SupabaseKnowledgeTranscriptRepository(client) };
}

describe('SupabaseKnowledgeTranscriptRepository', () => {
  it('calls the create RPC with the whole version in one call', async () => {
    const { repository, calls } = makeClient();
    const result = await repository.createTranscriptVersion(createWrite);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('knowledge_transcript_create_version');
    expect(calls[0].args.p_document_id).toBe(DOC);
    expect(calls[0].args.p_board_id).toBe(BOARD);
  });

  it('normalises the revision to a string', async () => {
    // It is a bigint in the database and a bigint does not fit in a JS number.
    // Comparing a silently-rounded number against an exact string is how a
    // compare-and-swap quietly stops working.
    const { repository } = makeClient({
      rpcData: [{ document_id: 'doc-1', mutation_revision: 9007199254740993 }],
    });
    const result = await repository.createTranscriptVersion(createWrite);

    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.value.mutationRevision).toBe('string');
  });

  it('sends both halves of the expected version to the replace RPC', async () => {
    const { repository, calls } = makeClient();
    await repository.replaceTranscriptVersion(
      { ...createWrite, documentId: DOC, boardId: BOARD },
      expected,
    );

    expect(calls[0].fn).toBe('knowledge_transcript_replace_version');
    expect(calls[0].args.p_expected_sha256).toBe('a'.repeat(64));
    expect(calls[0].args.p_expected_revision).toBe('3');
  });

  it('never sends an author on a replacement', async () => {
    const { repository, calls } = makeClient();
    await repository.replaceTranscriptVersion(
      { ...createWrite, documentId: DOC, boardId: BOARD },
      expected,
    );

    // Provenance belongs to whoever created the document. The replace RPC has
    // no parameter for it, and nothing here invents one.
    expect(Object.keys(calls[0].args)).not.toContain('p_created_by');
  });

  it('maps the RPC conflict code to a conflict, with one message for both causes', async () => {
    const { repository } = makeClient({ rpcError: { code: 'KT001', message: 'not available' } });
    const result = await repository.replaceTranscriptVersion(
      { ...createWrite, documentId: DOC, boardId: BOARD },
      expected,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('conflict');
      // Saying "exists but on another board" would confirm a row the caller
      // cannot see.
      expect(result.error.message).not.toContain('board');
    }
  });

  it('maps a refused non-advancing write to a retryable failure, not to uncertainty', async () => {
    // KT002 is raised INSIDE the function, so the transaction rolled back and
    // nothing was saved. That is the opposite of saved-state-uncertain.
    const { repository } = makeClient({ rpcError: { code: 'KT002' } });
    const result = await repository.replaceTranscriptVersion(
      { ...createWrite, documentId: DOC, boardId: BOARD },
      expected,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect((result.error.details as { code?: string } | undefined)?.code).not.toBe(
        KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN,
      );
    }
  });

  it('maps a validation failure to the domain validation code', async () => {
    const { repository } = makeClient({ rpcError: { code: 'KT003', message: 'chunk 0 is not an object' } });
    const result = await repository.createTranscriptVersion(createWrite);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
  });

  it('reports saved-state-uncertain when the write returns no revision', async () => {
    // The write may well have committed. Inventing a revision would hand the
    // caller a token that overwrites whatever really happened.
    const { repository } = makeClient({ rpcData: [] });
    const result = await repository.createTranscriptVersion(createWrite);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const details = result.error.details as { code?: string; safeToRetry?: boolean } | undefined;
      expect(details?.code).toBe(KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN);
      expect(details?.safeToRetry).toBe(false);
    }
  });

  it('reads a target as absent rather than as another board’s row', async () => {
    const { repository } = makeClient({ row: null });
    const result = await repository.loadTranscriptTarget(BOARD, DOC);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('refuses a target that has no revision', async () => {
    const { repository } = makeClient({
      row: {
        id: 'doc-1',
        board_id: 'board-1',
        kind: 'text',
        content_sha256: 'a'.repeat(64),
        original_filename: 'Lecture 1',
        storage_path: 'p',
        transcript_representation: representation,
        transcript_mutation_revision: null,
      },
    });
    const result = await repository.loadTranscriptTarget(BOARD, DOC);

    // A null revision matches nothing, so every edit would fail. Saying so
    // beats offering a target that cannot be written.
    expect(result.ok).toBe(false);
  });
});

describe('RandomKnowledgeTranscriptUploadIdFactory', () => {
  it('produces ids the storage key builder accepts', () => {
    const factory = new RandomKnowledgeTranscriptUploadIdFactory();
    for (let i = 0; i < 50; i += 1) {
      expect(factory.newUploadId()).toMatch(/^[0-9a-z]{8,64}$/);
    }
  });

  it('does not repeat itself', () => {
    // Two concurrent attempts sharing a key makes one request's cleanup the
    // other's data loss.
    const factory = new RandomKnowledgeTranscriptUploadIdFactory();
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(factory.newUploadId());
    expect(seen.size).toBe(500);
  });
});
