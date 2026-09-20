import { describe, expect, it } from 'vitest';

import type { BoardId, KnowledgeDocumentId, UserId } from '../../domain/core/ids';
import {
  KNOWLEDGE_TEXT_PROCESSING_STATUS,
  SupabaseKnowledgeTextRepository,
  type KnowledgeTextSupabaseClient,
} from './knowledgeTextIngestionAdapters';

const DOC = 'd1111111-1111-4111-8111-111111111111' as KnowledgeDocumentId;
const BOARD = 'b1111111-1111-4111-8111-111111111111' as BoardId;
const USER = 'u1111111-1111-4111-8111-111111111111' as UserId;

interface Call {
  readonly table: string;
  readonly op: 'insert' | 'delete';
  readonly payload: unknown;
}

function client(over: { insertError?: { message: string }; row?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  const row = over.row ?? {
    id: DOC, board_id: BOARD, created_by: USER, kind: 'text',
    original_filename: 'notes.txt', mime_type: 'text/plain', file_size_bytes: 12,
    storage_path: 'p', content_sha256: 'h', page_count: null,
    processing_status: 'ready', processing_error: null,
    parser_name: null, parser_version: null, parser_options_hash: null,
    raw_artifact_path: null, created_at: 'now', updated_at: 'now',
  };
  const error = over.insertError ?? null;
  const api: KnowledgeTextSupabaseClient = {
    from(table) {
      return {
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          const settled = Promise.resolve({ error });
          return Object.assign(settled, {
            select: () => ({ single: async () => ({ data: error ? null : row, error }) }),
          }) as never;
        },
        delete() {
          return {
            eq(_column: string, value: string) {
              calls.push({ table, op: 'delete', payload: value });
              return Promise.resolve({ error });
            },
          };
        },
      };
    },
  };
  return { api, calls };
}

const record = {
  id: DOC, boardId: BOARD, createdBy: USER, originalFilename: 'notes.txt',
  mimeType: 'text/plain', fileSizeBytes: 12, storagePath: 'p', contentSha256: 'h',
  kind: 'text' as const,
};

const chunk = (index: number) => ({
  documentId: DOC, chunkIndex: index, text: `chunk ${index}`,
  charStart: index * 10, charEnd: index * 10 + 7, textHash: `h${index}`,
});

describe('the document row a text source creates', () => {
  it('is READY, not the uploaded default', async () => {
    // The whole reason this adapter exists separately. No worker will ever
    // claim this row, so a defaulted 'uploaded' would hide it from search
    // permanently while the library showed it as still processing.
    const { api, calls } = client();
    const result = await new SupabaseKnowledgeTextRepository(api).insertTextDocument(record);

    expect(result.ok).toBe(true);
    expect((calls[0].payload as Record<string, unknown>).processing_status)
      .toBe(KNOWLEDGE_TEXT_PROCESSING_STATUS);
    expect(KNOWLEDGE_TEXT_PROCESSING_STATUS).toBe('ready');
  });

  it('carries its own kind out, not pdf', async () => {
    // mapKnowledgeDocumentRow hardcodes 'pdf'. If that leaked, the caller would
    // hand every consumer a text document claiming to be a PDF -- and the
    // citation resolver now branches on exactly this value.
    const { api } = client();
    const result = await new SupabaseKnowledgeTextRepository(api).insertTextDocument(record);
    expect(result.ok && result.value.kind).toBe('text');
  });

  it('states page_count as null rather than zero', async () => {
    const { api, calls } = client();
    await new SupabaseKnowledgeTextRepository(api).insertTextDocument(record);
    expect((calls[0].payload as Record<string, unknown>).page_count).toBeNull();
  });

  it('reports a failed insert instead of returning a document', async () => {
    const { api } = client({ insertError: { message: 'duplicate key' } });
    const result = await new SupabaseKnowledgeTextRepository(api).insertTextDocument(record);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('unavailable');
  });
});

describe('the chunks', () => {
  it('go in ONE statement, with pageless locators', async () => {
    const { api, calls } = client();
    const result = await new SupabaseKnowledgeTextRepository(api)
      .insertTextChunks([chunk(0), chunk(1), chunk(2)]);

    expect(result.ok).toBe(true);
    // One call, not three: partial success must not be a routine outcome.
    expect(calls.filter((call) => call.table === 'knowledge_chunks')).toHaveLength(1);

    const rows = calls[0].payload as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      document_id: DOC, chunk_index: 1, text: 'chunk 1', text_hash: 'h1',
      page_start: null, page_end: null, char_start: 10, char_end: 17,
    });
  });

  it('writes nothing at all for a blank source', async () => {
    // A legitimately empty file. An insert of [] would be a pointless round
    // trip that some drivers treat as an error.
    const { api, calls } = client();
    const result = await new SupabaseKnowledgeTextRepository(api).insertTextChunks([]);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([]);
  });

  it('reports a failed chunk write so the caller can compensate', async () => {
    const { api } = client({ insertError: { message: 'constraint' } });
    const result = await new SupabaseKnowledgeTextRepository(api).insertTextChunks([chunk(0)]);
    expect(result.ok).toBe(false);
  });
});

describe('compensation', () => {
  it('deletes the document by id and lets the cascade take the chunks', async () => {
    const { api, calls } = client();
    const result = await new SupabaseKnowledgeTextRepository(api).deleteDocument(DOC);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ table: 'knowledge_documents', op: 'delete', payload: DOC }]);
  });

  it('reports a failed delete rather than claiming the row is gone', async () => {
    const { api } = client({ insertError: { message: 'denied' } });
    const result = await new SupabaseKnowledgeTextRepository(api).deleteDocument(DOC);
    expect(result.ok).toBe(false);
  });
});
