import { describe, expect, it } from 'vitest';
import { asKnowledgeDocumentId } from '../../domain/core/ids';
import type { KnowledgeExtractionCompletion } from '../../domain/knowledge/knowledgeExtraction';
import {
  SupabaseKnowledgeExtractionRepository,
  toKnowledgePageRecords,
} from './knowledgeExtractionAdapters';
import type { KnowledgeExtractionSupabaseClient } from './knowledgeExtractionAdapters';

const DOCUMENT = asKnowledgeDocumentId('44444444-4444-4444-4444-444444444444');

interface Recorded {
  readonly update?: Record<string, unknown>;
  readonly eq: Record<string, string>;
  readonly in: Record<string, readonly string[]>;
  readonly select?: string;
  readonly rpc?: { fn: string; args: Record<string, unknown> };
}

/**
 * Minimal stand-in that records the query it was asked to build, so the tests
 * can assert the SHAPE of the statement -- the predicate is the whole
 * concurrency guarantee, not an implementation detail.
 */
function client(options: {
  updateResult?: { data: unknown; error: { message: string } | null };
  probeResult?: { data: { processing_status: string } | null; error: { message: string } | null };
  rpcResult?: { data: unknown; error: { message: string } | null };
}): { client: KnowledgeExtractionSupabaseClient; recorded: Recorded } {
  const recorded: Recorded = { eq: {}, in: {} };

  const api = {
    from() {
      return {
        update(payload: Record<string, unknown>) {
          (recorded as { update?: Record<string, unknown> }).update = payload;
          const builder = {
            eq(column: string, value: string) {
              recorded.eq[column] = value;
              return builder;
            },
            in(column: string, values: readonly string[]) {
              recorded.in[column] = values;
              return builder;
            },
            select(columns: string) {
              (recorded as { select?: string }).select = columns;
              return {
                maybeSingle: async () =>
                  options.updateResult ?? { data: null, error: null },
              };
            },
          };
          return builder;
        },
        select() {
          const probe = {
            eq() {
              return probe;
            },
            maybeSingle: async () => options.probeResult ?? { data: null, error: null },
          };
          return probe;
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      (recorded as { rpc?: { fn: string; args: Record<string, unknown> } }).rpc = { fn, args };
      return options.rpcResult ?? { data: { status: 'completed' }, error: null };
    },
  };

  return { client: api as unknown as KnowledgeExtractionSupabaseClient, recorded };
}

function completion(
  overrides: Partial<KnowledgeExtractionCompletion> = {},
): KnowledgeExtractionCompletion {
  return {
    documentId: DOCUMENT,
    pageCount: 1,
    pages: [
      {
        pageNumber: 1,
        widthPoints: 612,
        heightPoints: 792,
        rotation: 0,
        text: 'page one',
        textHash: 'b'.repeat(64),
      },
    ],
    parserName: 'opendataloader-pdf',
    parserVersion: '1.4.0',
    parserOptionsHash: 'opts-abc',
    rawArtifactPath: null,
    expectedContentSha256: 'a'.repeat(64),
    ...overrides,
  };
}

describe('claim -- one conditional UPDATE, never read-then-write', () => {
  it('constrains the update by both document id and claimable status', async () => {
    const { client: api, recorded } = client({
      updateResult: {
        data: {
          id: DOCUMENT,
          board_id: '11111111-1111-1111-1111-111111111111',
          storage_path: 'knowledge/b/d/original.pdf',
          content_sha256: 'a'.repeat(64),
        },
        error: null,
      },
    });

    const result = await new SupabaseKnowledgeExtractionRepository(api).claim(DOCUMENT);

    expect(result.ok).toBe(true);
    expect(recorded.update).toEqual({
      processing_status: 'processing',
      processing_error: null,
    });
    expect(recorded.eq).toEqual({ id: DOCUMENT });
    // The predicate is what makes two concurrent claims exactly-once.
    expect(recorded.in).toEqual({ processing_status: ['uploaded', 'failed'] });
  });

  it('returns only the worker input contract', async () => {
    const { client: api } = client({
      updateResult: {
        data: {
          id: DOCUMENT,
          board_id: '11111111-1111-1111-1111-111111111111',
          storage_path: 'knowledge/b/d/original.pdf',
          content_sha256: 'a'.repeat(64),
        },
        error: null,
      },
    });

    const result = await new SupabaseKnowledgeExtractionRepository(api).claim(DOCUMENT);
    expect(result.ok && result.value).toEqual({
      documentId: DOCUMENT,
      boardId: '11111111-1111-1111-1111-111111111111',
      storagePath: 'knowledge/b/d/original.pdf',
      contentSha256: 'a'.repeat(64),
    });
  });

  it('reports a conflict when the row exists but holds an ineligible status', async () => {
    const { client: api } = client({
      updateResult: { data: null, error: null },
      probeResult: { data: { processing_status: 'ready' }, error: null },
    });

    const result = await new SupabaseKnowledgeExtractionRepository(api).claim(DOCUMENT);
    expect(!result.ok && result.error.code).toBe('conflict');
    expect(!result.ok && result.error.details).toEqual({ currentStatus: 'ready' });
  });

  it('reports not_found when the document was deleted', async () => {
    const { client: api } = client({
      updateResult: { data: null, error: null },
      probeResult: { data: null, error: null },
    });

    const result = await new SupabaseKnowledgeExtractionRepository(api).claim(DOCUMENT);
    expect(!result.ok && result.error.code).toBe('not_found');
  });

  it('maps an infrastructure error to unavailable rather than a false conflict', async () => {
    const { client: api } = client({
      updateResult: { data: null, error: { message: 'connection reset' } },
    });
    const result = await new SupabaseKnowledgeExtractionRepository(api).claim(DOCUMENT);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});

describe('complete -- routed through the transactional RPC', () => {
  it('calls complete_knowledge_extraction with the full commit payload', async () => {
    const { client: api, recorded } = client({});
    const result = await new SupabaseKnowledgeExtractionRepository(api).complete(completion());

    expect(result.ok).toBe(true);
    expect(recorded.rpc?.fn).toBe('complete_knowledge_extraction');
    expect(recorded.rpc?.args).toEqual({
      p_document_id: DOCUMENT,
      p_page_count: 1,
      p_pages: [
        {
          page_number: 1,
          width_points: 612,
          height_points: 792,
          rotation: 0,
          text: 'page one',
          text_hash: 'b'.repeat(64),
        },
      ],
      p_parser_name: 'opendataloader-pdf',
      p_parser_version: '1.4.0',
      p_parser_options_hash: 'opts-abc',
      p_raw_artifact_path: null,
      p_expected_content_sha256: 'a'.repeat(64),
    });
  });

  it('never writes pages through a separate insert statement', async () => {
    // A second write path would reintroduce exactly the partial-page window
    // the RPC exists to close.
    const { client: api, recorded } = client({});
    await new SupabaseKnowledgeExtractionRepository(api).complete(completion());
    expect(recorded.update).toBeUndefined();
  });

  it('maps a stale job to not_found', async () => {
    const { client: api } = client({ rpcResult: { data: { status: 'not_found' }, error: null } });
    const result = await new SupabaseKnowledgeExtractionRepository(api).complete(completion());
    expect(!result.ok && result.error.code).toBe('not_found');
  });

  it('maps a document that is no longer processing to conflict', async () => {
    const { client: api } = client({
      rpcResult: { data: { status: 'conflict', currentStatus: 'uploaded' }, error: null },
    });
    const result = await new SupabaseKnowledgeExtractionRepository(api).complete(completion());
    expect(!result.ok && result.error.code).toBe('conflict');
    expect(!result.ok && result.error.details).toEqual({ currentStatus: 'uploaded' });
  });

  it('maps changed document content to conflict', async () => {
    const { client: api } = client({
      rpcResult: { data: { status: 'content_mismatch' }, error: null },
    });
    const result = await new SupabaseKnowledgeExtractionRepository(api).complete(completion());
    expect(!result.ok && result.error.code).toBe('conflict');
  });

  it('maps a raised exception (the rolled-back case) to unavailable', async () => {
    const { client: api } = client({
      rpcResult: { data: null, error: { message: 'knowledge extraction persisted 1 of 2 pages' } },
    });
    const result = await new SupabaseKnowledgeExtractionRepository(api).complete(completion());
    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});

describe('fail -- processing only, and it clears the raw artifact pointer', () => {
  it('updates only from processing and nulls raw_artifact_path', async () => {
    const { client: api, recorded } = client({
      updateResult: { data: { id: DOCUMENT }, error: null },
    });

    const result = await new SupabaseKnowledgeExtractionRepository(api).fail(
      DOCUMENT,
      'Parser exited with code 1',
    );

    expect(result.ok).toBe(true);
    expect(recorded.update).toEqual({
      processing_status: 'failed',
      processing_error: 'Parser exited with code 1',
      raw_artifact_path: null,
    });
    expect(recorded.eq).toEqual({ id: DOCUMENT, processing_status: 'processing' });
  });

  it('reports not_found when the document was deleted mid-processing', async () => {
    const { client: api } = client({
      updateResult: { data: null, error: null },
      probeResult: { data: null, error: null },
    });
    const result = await new SupabaseKnowledgeExtractionRepository(api).fail(DOCUMENT, 'boom');
    expect(!result.ok && result.error.code).toBe('not_found');
  });

  it('reports a conflict when the document is no longer processing', async () => {
    const { client: api } = client({
      updateResult: { data: null, error: null },
      probeResult: { data: { processing_status: 'ready' }, error: null },
    });
    const result = await new SupabaseKnowledgeExtractionRepository(api).fail(DOCUMENT, 'boom');
    expect(!result.ok && result.error.code).toBe('conflict');
  });
});

describe('page record mapping', () => {
  it('emits the snake_case columns jsonb_to_recordset expects', () => {
    expect(toKnowledgePageRecords(completion())[0]).toEqual({
      page_number: 1,
      width_points: 612,
      height_points: 792,
      rotation: 0,
      text: 'page one',
      text_hash: 'b'.repeat(64),
    });
  });

  it('carries no chunk, embedding or padlet fields', () => {
    const keys = Object.keys(toKnowledgePageRecords(completion())[0]);
    expect(keys).toEqual([
      'page_number',
      'width_points',
      'height_points',
      'rotation',
      'text',
      'text_hash',
    ]);
  });
});
