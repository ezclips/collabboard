import { describe, expect, it } from 'vitest';
import { asBoardId } from '../../domain/core/ids';
import {
  SupabaseKnowledgeDocumentReadRepository,
  type KnowledgeDocumentsReadSupabaseClient,
} from './knowledgeReadAdapters';

const BOARD_ID = asBoardId('11111111-1111-4111-8111-111111111111');

function readClient(options?: {
  error?: { message: string } | null;
  processingError?: string | null;
}) {
  const seen: {
    table?: string;
    columns?: string;
    filter?: { column: string; value: string };
    order?: { column: string; ascending: boolean };
  } = {};

  const client: KnowledgeDocumentsReadSupabaseClient = {
    from(table) {
      seen.table = table;
      return {
        select(columns) {
          seen.columns = columns;
          return {
            eq(column, value) {
              seen.filter = { column, value };
              return {
                async order(orderColumn, orderOptions) {
                  seen.order = {
                    column: orderColumn,
                    ascending: orderOptions.ascending,
                  };
                  return {
                    data: options?.error
                      ? null
                      : [
                          {
                            id: '22222222-2222-4222-8222-222222222222',
                            board_id: BOARD_ID,
                            original_filename: 'example.pdf',
                            file_size_bytes: 4567,
                            page_count: 12,
                            processing_status: 'ready',
                            processing_error: options?.processingError ?? null,
                            created_at: '2026-08-21T00:00:00.000Z',
                            updated_at: '2026-08-21T00:02:00.000Z',
                          },
                        ],
                    error: options?.error ?? null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { client, seen };
}

describe('P6B SupabaseKnowledgeDocumentReadRepository', () => {
  it('filters by board, orders newest first, and selects only browser-safe status metadata', async () => {
    const { client, seen } = readClient();
    const result = await new SupabaseKnowledgeDocumentReadRepository(client).listDocumentsByBoardId(
      BOARD_ID,
    );

    expect(result.ok).toBe(true);
    expect(seen.table).toBe('knowledge_documents');
    expect(seen.filter).toEqual({ column: 'board_id', value: BOARD_ID });
    expect(seen.order).toEqual({ column: 'created_at', ascending: false });

    expect(seen.columns).toContain('processing_status');
    // PATCH-186: processing_error IS selected now, but only to derive the
    // plan page-limit refusal. Every OTHER worker internal stays off the wire.
    expect(seen.columns).toContain('processing_error');
    for (const forbidden of [
      'storage_path',
      'content_sha256',
      'parser_name',
      'parser_version',
      'parser_options_hash',
      'raw_artifact_path',
    ]) {
      expect(seen.columns).not.toContain(forbidden);
    }

    expect(result.ok && result.value).toEqual([
      {
        id: '22222222-2222-4222-8222-222222222222',
        boardId: BOARD_ID,
        originalFilename: 'example.pdf',
        fileSizeBytes: 4567,
        pageCount: 12,
        processingStatus: 'ready',
        planLimitError: null,
        createdAt: '2026-08-21T00:00:00.000Z',
        updatedAt: '2026-08-21T00:02:00.000Z',
      },
    ]);
  });

  it('PATCH-186: keeps a plan page-limit refusal, and nulls every other processing error', async () => {
    const planMessage =
      'Page limit: This PDF has 612 pages. The Free plan allows 50 pages per PDF.';

    const plan = await new SupabaseKnowledgeDocumentReadRepository(
      readClient({ processingError: planMessage }).client,
    ).listDocumentsByBoardId(BOARD_ID);
    expect(plan.ok && plan.value[0].planLimitError).toBe(planMessage);

    const other = await new SupabaseKnowledgeDocumentReadRepository(
      readClient({ processingError: 'Extraction failed at parser stage: /tmp/secret' }).client,
    ).listDocumentsByBoardId(BOARD_ID);
    expect(other.ok && other.value[0].planLimitError).toBeNull();
  });

  it('maps Supabase list failure to unavailable', async () => {
    const { client } = readClient({ error: { message: 'db unavailable' } });
    const result = await new SupabaseKnowledgeDocumentReadRepository(client).listDocumentsByBoardId(
      BOARD_ID,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});
