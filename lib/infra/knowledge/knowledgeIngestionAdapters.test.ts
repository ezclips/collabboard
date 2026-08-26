import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { asBoardId, asUserId } from '../../domain/core/ids';
import {
  KNOWLEDGE_STORAGE_BUCKET,
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeIngestionRepository,
  SupabaseKnowledgeStorageGateway,
  mapKnowledgeDocumentRow,
} from './knowledgeIngestionAdapters';
import type {
  KnowledgeAuthFilter,
  KnowledgeAuthSupabaseClient,
} from './knowledgeIngestionAdapters';

const BOARD = asBoardId('11111111-1111-1111-1111-111111111111');
const USER = asUserId('22222222-2222-2222-2222-222222222222');

/**
 * Records the (table, column=value) filters a query applied, so the tests can
 * assert the authorizer reproduces P3's policy predicate exactly.
 */
function authClient(
  rows: Record<string, Record<string, unknown> | null>,
  calls: Array<{ table: string; filters: Record<string, string> }> = [],
): { client: KnowledgeAuthSupabaseClient; calls: typeof calls } {
  const client: KnowledgeAuthSupabaseClient = {
    from(table: 'boards' | 'board_collaborators') {
      return {
        select() {
          const filters: Record<string, string> = {};
          const entry = { table, filters };
          calls.push(entry);
          const builder: KnowledgeAuthFilter = {
            eq(column: string, value: string) {
              filters[column] = value;
              return builder;
            },
            async maybeSingle() {
              return { data: rows[table] ?? null, error: null };
            },
          };
          return builder;
        },
      };
    },
  };
  return { client, calls };
}

describe('SupabaseKnowledgeBoardAuthorizer -- mirrors the P3 insert policy', () => {
  it('allows the board owner and filters on BOTH board id and user id', async () => {
    const { client, calls } = authClient({ boards: { id: BOARD } });
    const result = await new SupabaseKnowledgeBoardAuthorizer(client).canMutateBoard(BOARD, USER);

    expect(result.ok && result.value).toBe(true);
    expect(calls[0].table).toBe('boards');
    expect(calls[0].filters).toEqual({ id: BOARD, user_id: USER });
  });

  it("allows a collaborator whose role is exactly 'editor'", async () => {
    const { client, calls } = authClient({
      boards: null,
      board_collaborators: { role: 'editor' },
    });
    const result = await new SupabaseKnowledgeBoardAuthorizer(client).canMutateBoard(BOARD, USER);

    expect(result.ok && result.value).toBe(true);
    const collab = calls.find((c) => c.table === 'board_collaborators');
    expect(collab?.filters).toEqual({ board_id: BOARD, user_id: USER, role: 'editor' });
  });

  it('denies a user who is neither owner nor editor (read-only / unrelated)', async () => {
    const { client } = authClient({ boards: null, board_collaborators: null });
    const result = await new SupabaseKnowledgeBoardAuthorizer(client).canMutateBoard(BOARD, USER);
    expect(result.ok && result.value).toBe(false);
  });

  it('maps a lookup failure to an unavailable DomainError rather than allowing', async () => {
    const client: KnowledgeAuthSupabaseClient = {
      from() {
        return {
          select() {
            const builder: KnowledgeAuthFilter = {
              eq: () => builder,
              maybeSingle: async () => ({ data: null, error: { message: 'boom' } }),
            };
            return builder;
          },
        };
      },
    };
    const result = await new SupabaseKnowledgeBoardAuthorizer(client).canMutateBoard(BOARD, USER);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});

describe('SupabaseKnowledgeStorageGateway', () => {
  function storageClient(behaviour: {
    uploadError?: { message: string } | null;
    removeError?: { message: string } | null;
    uploadThrows?: boolean;
    removeThrows?: boolean;
  }) {
    const seen: {
      bucket?: string;
      path?: string;
      options?: { contentType?: string; upsert?: boolean };
      removed?: readonly string[];
      /** P6J-F9-A1a: every remove request, to prove batching is not a loop. */
      removeCalls: string[][];
    } = { removeCalls: [] };
    return {
      seen,
      client: {
        storage: {
          from(bucket: string) {
            seen.bucket = bucket;
            return {
              async upload(
                path: string,
                _bytes: Uint8Array,
                options?: { contentType?: string; upsert?: boolean },
              ) {
                if (behaviour.uploadThrows) throw new Error('network');
                seen.path = path;
                seen.options = options;
                return { error: behaviour.uploadError ?? null };
              },
              async remove(paths: readonly string[]) {
                seen.removed = paths;
                seen.removeCalls.push([...paths]);
                if (behaviour.removeThrows) throw new Error('network');
                return { error: behaviour.removeError ?? null };
              },
            };
          },
        },
      },
    };
  }

  it('uploads to the dedicated private Knowledge bucket with the PDF content type and no upsert', async () => {
    const { client, seen } = storageClient({});
    const gateway = new SupabaseKnowledgeStorageGateway(client);
    const result = await gateway.upload('knowledge/b/d/original.pdf', new Uint8Array([1]), 'application/pdf');

    expect(result.ok).toBe(true);
    expect(seen.bucket).toBe(KNOWLEDGE_STORAGE_BUCKET);
    expect(seen.bucket).not.toBe('padlet-files');
    expect(seen.path).toBe('knowledge/b/d/original.pdf');
    expect(seen.options).toEqual({ contentType: 'application/pdf', upsert: false });
  });

  it('maps upload errors and thrown failures to unavailable', async () => {
    const failing = new SupabaseKnowledgeStorageGateway(
      storageClient({ uploadError: { message: 'nope' } }).client,
    );
    const a = await failing.upload('p', new Uint8Array([1]), 'application/pdf');
    expect(!a.ok && a.error.code).toBe('unavailable');

    const throwing = new SupabaseKnowledgeStorageGateway(
      storageClient({ uploadThrows: true }).client,
    );
    const b = await throwing.upload('p', new Uint8Array([1]), 'application/pdf');
    expect(!b.ok && b.error.code).toBe('unavailable');
  });

  it('removes exactly the one path it is given (rollback support)', async () => {
    const { client, seen } = storageClient({});
    const result = await new SupabaseKnowledgeStorageGateway(client).remove('knowledge/b/d/original.pdf');
    expect(result.ok).toBe(true);
    expect(seen.removed).toEqual(['knowledge/b/d/original.pdf']);
    expect(seen.removeCalls).toEqual([['knowledge/b/d/original.pdf']]);
  });

  /**
   * P6J-F9-A1a. Cleanup hands the gateway a whole batch; it must become one
   * Storage request, not one request per path.
   */
  it('sends a batch as a single Storage request carrying every path', async () => {
    const { client, seen } = storageClient({});
    const batch = Array.from({ length: 100 }, (_, index) => `knowledge/b/d/pages/${index + 1}.webp`);

    const result = await new SupabaseKnowledgeStorageGateway(client).removeMany(batch);

    expect(result.ok).toBe(true);
    expect(seen.removeCalls).toHaveLength(1);
    expect(seen.removeCalls[0]).toEqual(batch);
  });

  it('maps a batch Storage error and a thrown client to unavailable', async () => {
    const failing = new SupabaseKnowledgeStorageGateway(
      storageClient({ removeError: { message: 'nope' } }).client,
    );
    const mapped = await failing.removeMany(['a', 'b']);
    expect(!mapped.ok && mapped.error.code).toBe('unavailable');

    const throwing = new SupabaseKnowledgeStorageGateway(storageClient({ removeThrows: true }).client);
    const crashed = await throwing.removeMany(['a', 'b']);
    expect(!crashed.ok && crashed.error.code).toBe('unavailable');
  });

  it('treats an empty batch as a no-op rather than an empty Storage call', async () => {
    const { client, seen } = storageClient({});
    const result = await new SupabaseKnowledgeStorageGateway(client).removeMany([]);

    expect(result.ok).toBe(true);
    expect(seen.removeCalls).toEqual([]);
  });
});

describe('SupabaseKnowledgeIngestionRepository', () => {
  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: '33333333-3333-3333-3333-333333333333',
      board_id: BOARD,
      created_by: USER,
      kind: 'pdf',
      original_filename: 'report.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 12,
      storage_path: 'knowledge/b/d/original.pdf',
      content_sha256: 'a'.repeat(64),
      page_count: null,
      processing_status: 'uploaded',
      processing_error: null,
      parser_name: null,
      parser_version: null,
      parser_options_hash: null,
      raw_artifact_path: null,
      created_at: '2026-08-20T00:00:00.000Z',
      updated_at: '2026-08-20T00:00:00.000Z',
      ...overrides,
    };
  }

  it('inserts only ingestion-owned columns and never worker-owned ones', async () => {
    let payload: Record<string, unknown> = {};
    const client = {
      from() {
        return {
          insert(p: Record<string, unknown>) {
            payload = p;
            return { select: () => ({ single: async () => ({ data: row(), error: null }) }) };
          },
        };
      },
    };

    const result = await new SupabaseKnowledgeIngestionRepository(client).insertDocument({
      id: '33333333-3333-3333-3333-333333333333' as never,
      boardId: BOARD,
      createdBy: USER,
      originalFilename: 'report.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 12,
      storagePath: 'knowledge/b/d/original.pdf',
      contentSha256: 'a'.repeat(64),
    });

    expect(result.ok).toBe(true);
    expect(payload.kind).toBe('pdf');
    // processing_status is left to the schema default ('uploaded').
    for (const forbidden of [
      'processing_status', 'page_count', 'parser_name', 'parser_version',
      'parser_options_hash', 'raw_artifact_path', 'processing_error',
    ]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it('maps a row to the domain KnowledgeDocument with worker fields null', () => {
    const doc = mapKnowledgeDocumentRow(row() as never);
    expect(doc.processingStatus).toBe('uploaded');
    expect(doc.kind).toBe('pdf');
    expect(doc.pageCount).toBeNull();
    expect(doc.parserName).toBeNull();
    expect(doc.rawArtifactPath).toBeNull();
  });

  it('maps an insert error to a DomainError instead of throwing', async () => {
    const client = {
      from() {
        return {
          insert() {
            return {
              select: () => ({
                single: async () => ({ data: null, error: { message: 'violates policy' } }),
              }),
            };
          },
        };
      },
    };
    const result = await new SupabaseKnowledgeIngestionRepository(client).insertDocument({
      id: 'x' as never, boardId: BOARD, createdBy: USER,
      originalFilename: 'r.pdf', mimeType: 'application/pdf', fileSizeBytes: 1,
      storagePath: 'p', contentSha256: 'h',
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});

describe('hashing + id generation', () => {
  it('produces a real SHA-256 hex digest of the bytes', async () => {
    const bytes = new Uint8Array([...Buffer.from('%PDF-1.7\nhello', 'utf8')]);
    const hash = await new NodeKnowledgeContentHasher().sha256(bytes);
    expect(hash).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates distinct uuid document ids', () => {
    const factory = new RandomKnowledgeDocumentIdFactory();
    const a = factory.newDocumentId();
    const b = factory.newDocumentId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
