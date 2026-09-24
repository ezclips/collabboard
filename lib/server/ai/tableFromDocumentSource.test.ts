import { describe, expect, it } from 'vitest';

import { readTableSourceText, TABLE_SOURCE_MAX_CHARS, type TableSourceSupabaseClient } from './tableFromDocumentSource';
import { KNOWLEDGE_TEXT_KIND } from '../../domain/knowledge/knowledgeTextIngestion';

/**
 * The reads are the ONLY thing this module owns; authorization is Board Chat's,
 * reused. So these tests are about the board filter being applied, the page
 * range reaching the query, the markers, and the character budget.
 */

const BOARD = '11111111-1111-4111-8111-111111111111';
const OTHER_BOARD = '99999999-9999-4999-8999-999999999999';
const DOC = '22222222-2222-4222-8222-222222222222';

interface Recorded {
  filters: Record<string, Record<string, unknown>>;
}

/**
 * A fake client that records the filters each table's query applied, and can
 * answer for documents, pages and chunks. `pages` may be a function of the
 * applied range, so `gte`/`lte` are exercised rather than ignored.
 */
function client(over: {
  document?: Record<string, unknown> | null;
  pageCount?: number | null;
  pages?: Record<string, unknown>[];
  chunks?: Record<string, unknown>[];
} = {}): { client: TableSourceSupabaseClient; recorded: Recorded } {
  const recorded: Recorded = { filters: {} };

  const buildList = (table: string, rows: Record<string, unknown>[]) => {
    const applied: Record<string, unknown> = {};
    recorded.filters[table] = applied;
    const query: Record<string, unknown> = {
      eq(column: string, value: unknown) { applied[column] = value; return query; },
      gte(column: string, value: unknown) { applied[`gte:${column}`] = value; return query; },
      lte(column: string, value: unknown) { applied[`lte:${column}`] = value; return query; },
      is() { return query; },
      in() { return query; },
      order() { return query; },
      limit() { return query; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) {
        let filtered = rows;
        if (typeof applied['gte:page_number'] === 'number') {
          filtered = filtered.filter((row) => Number(row.page_number) >= (applied['gte:page_number'] as number));
        }
        if (typeof applied['lte:page_number'] === 'number') {
          filtered = filtered.filter((row) => Number(row.page_number) <= (applied['lte:page_number'] as number));
        }
        filtered = [...filtered].sort((a, b) => Number(a.page_number) - Number(b.page_number));
        return Promise.resolve({ data: filtered, error: null }).then(resolve);
      },
    };
    return query;
  };

  const api = {
    from(table: string) {
      if (table === 'knowledge_documents') {
        return {
          select: () => buildList(table, over.document === null ? [] : [{
            id: DOC,
            original_filename: 'manual.pdf',
            processing_status: 'ready',
            kind: 'pdf',
            ...(over.document ?? {}),
            ...(over.pageCount !== undefined ? { page_count: over.pageCount } : {}),
          }]),
        };
      }
      if (table === 'knowledge_pages') return { select: () => buildList(table, over.pages ?? []) };
      if (table === 'knowledge_chunks') return { select: () => buildList(table, over.chunks ?? []) };
      return { select: () => buildList(table, []) };
    },
  };
  return { client: api as unknown as TableSourceSupabaseClient, recorded };
}

const page = (n: number, text = `text of page ${n}`) => ({ page_number: n, text });

describe('tableFromDocumentSource: refusals', () => {
  it('a document on another board (no row) is not_found', async () => {
    const { client: c } = client({ document: null });
    const result = await readTableSourceText(c, OTHER_BOARD, DOC);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('an unready document is conflict', async () => {
    const { client: c } = client({ document: { processing_status: 'processing' } });
    const result = await readTableSourceText(c, BOARD, DOC);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('conflict');
  });

  it('an unknown kind is validation', async () => {
    const { client: c } = client({ document: { kind: 'image' } });
    const result = await readTableSourceText(c, BOARD, DOC);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
  });

  it('a range over 20 pages is validation', async () => {
    const { client: c } = client({ pages: [page(1)] });
    const result = await readTableSourceText(c, BOARD, DOC, { from: 1, to: 21 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
  });

  it('from < 1 is validation', async () => {
    const { client: c } = client({ pages: [page(1)] });
    const result = await readTableSourceText(c, BOARD, DOC, { from: 0, to: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
  });

  it('to < from is validation', async () => {
    const { client: c } = client({ pages: [page(1)] });
    const result = await readTableSourceText(c, BOARD, DOC, { from: 5, to: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
  });
});

describe('tableFromDocumentSource: PDF reads', () => {
  it('reads the page range with gte/lte and marks each page', async () => {
    const { client: c, recorded } = client({ pageCount: 64, pages: [page(1), page(2), page(3)] });
    const result = await readTableSourceText(c, BOARD, DOC, { from: 2, to: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(recorded.filters.knowledge_pages['gte:page_number']).toBe(2);
    expect(recorded.filters.knowledge_pages['lte:page_number']).toBe(3);
    expect(recorded.filters.knowledge_pages.document_id).toBe(DOC);
    expect(result.value.text).toContain('[page 2]');
    expect(result.value.text).toContain('[page 3]');
    expect(result.value.coverage.pagesFrom).toBe(2);
    expect(result.value.coverage.pagesTo).toBe(3);
    expect(result.value.coverage.pageCount).toBe(64);
  });

  it('keeps the marker for a page with no text', async () => {
    const { client: c } = client({ pageCount: 5, pages: [page(1, ''), page(2, 'second')] });
    const result = await readTableSourceText(c, BOARD, DOC, { from: 1, to: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toContain('[page 1]');
  });

  it('no pages in the range is not_found', async () => {
    const { client: c } = client({ pageCount: 64, pages: [page(1)] });
    const result = await readTableSourceText(c, BOARD, DOC, { from: 5, to: 8 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('falls back to the highest page read when page_count is absent', async () => {
    const { client: c } = client({ pageCount: null, pages: [page(1), page(2)] });
    const result = await readTableSourceText(c, BOARD, DOC, { from: 1, to: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.coverage.pageCount).toBe(2);
  });
});

describe('tableFromDocumentSource: transcripts', () => {
  const TEXT = 'Alpha paragraph one.\n\nBeta paragraph two.';
  const chunks = [
    { text: TEXT.slice(0, 22), char_start: 0, char_end: 22, chunk_index: 0 },
    { text: TEXT.slice(22), char_start: 22, char_end: TEXT.length, chunk_index: 1 },
  ];

  it('stitches the chunk text', async () => {
    const { client: c } = client({ document: { kind: KNOWLEDGE_TEXT_KIND }, chunks });
    const result = await readTableSourceText(c, BOARD, DOC);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('text');
      expect(result.value.text).toBe(TEXT);
      expect(result.value.coverage.truncated).toBe(false);
    }
  });

  it('no chunks is not_found', async () => {
    const { client: c } = client({ document: { kind: KNOWLEDGE_TEXT_KIND }, chunks: [] });
    const result = await readTableSourceText(c, BOARD, DOC);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });
});

describe('tableFromDocumentSource: the budget and the board filter', () => {
  it('cuts a transcript over the budget at a newline, reporting charsRead/charsTotal', async () => {
    const line = 'x'.repeat(99) + '\n';
    const full = line.repeat(500); // 50,000 chars, newlines well inside the lookback
    const chunks = [{ text: full, char_start: 0, char_end: full.length, chunk_index: 0 }];
    const { client: c } = client({ document: { kind: KNOWLEDGE_TEXT_KIND }, chunks });
    const result = await readTableSourceText(c, BOARD, DOC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.coverage.truncated).toBe(true);
    expect(result.value.coverage.charsTotal).toBe(full.length);
    expect(result.value.text.length).toBeLessThanOrEqual(TABLE_SOURCE_MAX_CHARS);
    // The kept text is a prefix cut exactly at a line boundary: the next
    // character in the source is the newline that was kept out.
    expect(full.startsWith(result.value.text)).toBe(true);
    expect(full[result.value.text.length]).toBe('\n');
    expect(result.value.coverage.charsRead).toBe(result.value.text.length);
  });

  it('cuts a PDF and corrects pagesTo to the last page fully included', async () => {
    const pageText = 'y'.repeat(3_000);
    const pages = Array.from({ length: 20 }, (_, i) => page(i + 1, pageText));
    const { client: c } = client({ pageCount: 64, pages });
    const result = await readTableSourceText(c, BOARD, DOC, { from: 1, to: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.coverage.truncated).toBe(true);
    expect(result.value.coverage.pagesTo).toBeLessThan(20);
    // The page reported as fully included really is fully inside the text.
    const marker = `[page ${result.value.coverage.pagesTo}]`;
    expect(result.value.text).toContain(marker);
  });

  it('applies the board filter to the document read', async () => {
    const { client: c, recorded } = client({ pageCount: 5, pages: [page(1)] });
    await readTableSourceText(c, BOARD, DOC, { from: 1, to: 1 });
    expect(recorded.filters.knowledge_documents.board_id).toBe(BOARD);
    expect(recorded.filters.knowledge_documents.id).toBe(DOC);
  });
});
