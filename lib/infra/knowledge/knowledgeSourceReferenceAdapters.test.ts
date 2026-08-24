import { describe, expect, it, vi } from 'vitest';
import {
  SOURCE_REFERENCE_COLUMNS,
  SupabaseKnowledgeSourceReferenceReader,
} from './knowledgeSourceReferenceAdapters';
import type { KnowledgeSourceReferenceSupabaseClient } from './knowledgeSourceReferenceAdapters';
import { asPostId } from '../../domain/core/ids';

const PADLET_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reference-1',
    target_padlet_id: PADLET_ID,
    source_document_id: DOCUMENT_ID,
    page_start: 2,
    page_end: 3,
    quote_text: 'a quoted passage',
    quote_hash: 'hash-1',
    char_start: 10,
    char_end: 26,
    locator: { coordinateSystem: 'pdf', bbox: { x: 1, y: 2, width: 3, height: 4 } },
    created_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Records the exact query the adapter builds. Only `select`, `eq` and `order`
 * exist, so any attempt to mutate through this client is a type error at author
 * time and a missing-method crash at run time.
 */
function setup(result: { data: unknown[] | null; error: unknown } | Error) {
  const calls = { select: [] as string[], eq: [] as Array<[string, string]>, order: [] as Array<[string, { ascending: boolean }]>, from: [] as string[] };
  const query = {
    eq: vi.fn((column: string, value: string) => { calls.eq.push([column, value]); return query; }),
    order: vi.fn((column: string, options: { ascending: boolean }) => { calls.order.push([column, options]); return query; }),
    // Must honour the rejection handler: a thenable that drops it leaves the
    // caller's await hanging instead of surfacing the failure.
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => (
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    ).then(resolve, reject),
  };
  const table = { select: vi.fn((columns: string) => { calls.select.push(columns); return query; }) };
  const client = {
    from: vi.fn((name: string) => {
      calls.from.push(name);
      if (result instanceof Error && name === 'throw-on-from') throw result;
      return table;
    }),
  } as unknown as KnowledgeSourceReferenceSupabaseClient;
  return { reader: new SupabaseKnowledgeSourceReferenceReader(client), calls, client, table, query };
}

describe('P6J-F3 Supabase source reference reader', () => {
  it('selects the source reference projection from source_references only', async () => {
    const state = setup({ data: [row()], error: null });

    await state.reader.listReferencesByTargetPadletId(asPostId(PADLET_ID));

    expect(state.calls.from).toEqual(['source_references']);
    expect(state.calls.select).toEqual([SOURCE_REFERENCE_COLUMNS]);
    const projected = SOURCE_REFERENCE_COLUMNS.split(',').map((column) => column.trim());
    expect(projected).toEqual([
      'id', 'target_padlet_id', 'source_document_id', 'page_start', 'page_end',
      'quote_text', 'quote_hash', 'char_start', 'char_end', 'locator', 'created_at',
    ]);
    // Nothing beyond the domain shape leaves the database.
    expect(projected).not.toContain('*');
    for (const column of ['board_id', 'embedding', 'text_hash', 'storage_path']) {
      expect(projected).not.toContain(column);
    }
  });

  it('filters by the supplied target padlet and orders deterministically', async () => {
    const state = setup({ data: [], error: null });

    await state.reader.listReferencesByTargetPadletId(asPostId(PADLET_ID));

    expect(state.calls.eq).toEqual([['target_padlet_id', PADLET_ID]]);
    expect(state.calls.order).toEqual([
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });

  it('maps a full row onto the domain source reference', async () => {
    const state = setup({ data: [row()], error: null });

    const result = await state.reader.listReferencesByTargetPadletId(asPostId(PADLET_ID));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual([{
      id: 'reference-1',
      targetPadletId: PADLET_ID,
      sourceDocumentId: DOCUMENT_ID,
      pageStart: 2,
      pageEnd: 3,
      quoteText: 'a quoted passage',
      quoteHash: 'hash-1',
      charStart: 10,
      charEnd: 26,
      locator: { coordinateSystem: 'pdf', bbox: { x: 1, y: 2, width: 3, height: 4 } },
      createdAt: '2026-08-24T00:00:00.000Z',
    }]);
  });

  it('preserves absent provenance as null rather than inventing values', async () => {
    const state = setup({ data: [row({
      quote_text: null, quote_hash: null, char_start: null, char_end: null, locator: null,
    })], error: null });

    const result = await state.reader.listReferencesByTargetPadletId(asPostId(PADLET_ID));

    expect(result.ok && result.value[0]).toMatchObject({
      quoteText: null, quoteHash: null, charStart: null, charEnd: null, locator: null,
    });
  });

  it('keeps every citation distinct, including repeats from one source document', async () => {
    const state = setup({ data: [
      row({ id: 'reference-1', page_start: 1, page_end: 1 }),
      // Same source document, same target padlet, different citation.
      row({ id: 'reference-2', page_start: 9, page_end: 9 }),
      row({ id: 'reference-3', source_document_id: OTHER_DOCUMENT_ID, page_start: 4, page_end: 4 }),
      row({ id: 'reference-4', source_document_id: OTHER_DOCUMENT_ID, page_start: 7, page_end: 7 }),
    ], error: null });

    const result = await state.reader.listReferencesByTargetPadletId(asPostId(PADLET_ID));

    expect(result.ok).toBe(true);
    const references = result.ok ? result.value : [];
    expect(references).toHaveLength(4);
    expect(references.map((reference) => reference.id)).toEqual(['reference-1', 'reference-2', 'reference-3', 'reference-4']);
    expect(new Set(references.map((reference) => reference.sourceDocumentId)).size).toBe(2);
    expect(references.every((reference) => reference.targetPadletId === PADLET_ID)).toBe(true);
    expect(references.map((reference) => reference.pageStart)).toEqual([1, 9, 4, 7]);
  });

  it('returns an empty list rather than an error when the padlet has no references', async () => {
    for (const data of [[], null]) {
      const state = setup({ data, error: null });
      const result = await state.reader.listReferencesByTargetPadletId(asPostId(PADLET_ID));
      expect(result).toEqual({ ok: true, value: [] });
    }
  });

  it('maps a Supabase query error to an unavailable result', async () => {
    const state = setup({ data: null, error: { code: '42501', message: 'permission denied for table source_references' } });

    const result = await state.reader.listReferencesByTargetPadletId(asPostId(PADLET_ID));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('unavailable');
    expect(result.ok === false && result.error.message).toBe('Could not read the source references');
    // Raw provider text never reaches the developer-facing message.
    expect(result.ok === false && result.error.message).not.toContain('permission denied');
  });

  it('maps a thrown query failure to an unavailable result', async () => {
    const state = setup(new Error('socket hang up'));

    const result = await state.reader.listReferencesByTargetPadletId(asPostId(PADLET_ID));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('unavailable');
    expect(result.ok === false && result.error.message).toBe('Could not read the source references');
    expect(result.ok === false && result.error.message).not.toContain('socket hang up');
  });

  it('is select-only: no mutation, RPC, storage or client construction', async () => {
    const state = setup({ data: [row()], error: null });

    await state.reader.listReferencesByTargetPadletId(asPostId(PADLET_ID));

    for (const method of ['insert', 'update', 'upsert', 'delete']) {
      expect((state.table as unknown as Record<string, unknown>)[method]).toBeUndefined();
      expect((state.query as unknown as Record<string, unknown>)[method]).toBeUndefined();
    }
    for (const method of ['rpc', 'storage', 'auth']) {
      expect((state.client as unknown as Record<string, unknown>)[method]).toBeUndefined();
    }
    expect(Object.keys(state.query)).toEqual(['eq', 'order', 'then']);
  });
});
