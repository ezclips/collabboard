import { describe, expect, it } from 'vitest';

import {
  resolveBoardAiChatContext,
  resolveHistoricalBoardAiChatContext,
  type BoardAiContextSupabaseClient,
} from './boardAiChatContext';

const BOARD = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const PAD = '33333333-3333-4333-8333-333333333333';
const PAGE = 'The stored page text, exactly as the worker persisted it.';

/**
 * A client that records the FILTERS each query applied. The board scope is the
 * property under test, so what matters is that the resolver asked for a row on
 * this board -- not that a hand-written fake happened to return one.
 */
function client(rows: {
  document?: Record<string, unknown> | null;
  pages?: Record<string, unknown>[];
  padlet?: Record<string, unknown> | null;
}) {
  const filters: Record<string, Record<string, unknown>> = {};
  const build = (table: string, single: Record<string, unknown> | null, many: Record<string, unknown>[]) => {
    const applied: Record<string, unknown> = {};
    filters[table] = applied;
    const query: Record<string, unknown> = {
      eq(column: string, value: unknown) { applied[column] = value; return query; },
      in() { return query; },
      order() { return query; },
      limit() { return query; },
      maybeSingle: async () => ({ data: single, error: null }),
      then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) {
        const filtered = applied.page_number === undefined
          ? many
          : many.filter((row) => row.page_number === applied.page_number);
        return Promise.resolve({ data: filtered, error: null }).then(resolve);
      },
    };
    return query;
  };
  const api = {
    from(table: string) {
      if (table === 'knowledge_documents') return { select: () => build(table, rows.document ?? null, []) };
      if (table === 'padlets') return { select: () => build(table, rows.padlet ?? null, []) };
      return { select: () => build(table, null, rows.pages ?? []) };
    },
  };
  return { client: api as unknown as BoardAiContextSupabaseClient, filters };
}

const readyDoc = { id: DOC, original_filename: 'source.pdf', processing_status: 'ready' };
const page = (n: number, text = PAGE) => ({ page_number: n, text });

describe('7,15. board scope is part of every lookup', () => {
  it('a document is only ever read WITH the route board', async () => {
    const { client: c, filters } = client({ document: readyDoc, pages: [page(1)] });
    await resolveBoardAiChatContext(c, BOARD, [{ type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1 }]);
    // The row simply is not there for a document on another board.
    expect(filters.knowledge_documents).toEqual({ id: DOC, board_id: BOARD });
  });

  it('a post is only ever read WITH the route board', async () => {
    const { client: c, filters } = client({ padlet: { id: PAD, type: 'text', title: 'T', content: '<p>body</p>' } });
    await resolveBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }]);
    expect(filters.padlets).toEqual({ id: PAD, board_id: BOARD });
  });

  it('a document on another board is not found, and says nothing more', async () => {
    const { client: c } = client({ document: null });
    const result = await resolveBoardAiChatContext(c, BOARD, [
      { type: 'knowledge-document', knowledgeDocumentId: DOC },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_found');
      // Identical to a post the caller cannot see -- nothing distinguishes them.
      expect(result.error.message).toBe('Context is not available on this board');
    }
  });
});

describe('9,10,11. document context is bounded and keeps its provenance', () => {
  it('9. an unready document is refused rather than extracted', async () => {
    const { client: c } = client({ document: { ...readyDoc, processing_status: 'processing' } });
    const result = await resolveBoardAiChatContext(c, BOARD, [
      { type: 'knowledge-document', knowledgeDocumentId: DOC },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('conflict');
  });

  it('11. every page keeps its number in the text handed to the model', async () => {
    const { client: c } = client({ document: readyDoc, pages: [page(1, 'first'), page(2, 'second')] });
    const result = await resolveBoardAiChatContext(c, BOARD, [
      { type: 'knowledge-document', knowledgeDocumentId: DOC },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Never one provenance-less blob: a later citation must be able to say
      // which page an answer leaned on.
      expect(result.value[0].text).toContain('[page 1]');
      expect(result.value[0].text).toContain('[page 2]');
      expect(result.value[0].label).toBe('source.pdf');
    }
  });

  it('10. a single block is clamped rather than sent whole', async () => {
    const { client: c } = client({ document: readyDoc, pages: [page(1, 'x'.repeat(50_000))] });
    const result = await resolveBoardAiChatContext(c, BOARD, [
      { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1 },
    ]);
    expect(result.ok && result.value[0].text.length).toBeLessThanOrEqual(6_000);
  });
});

describe('3-6,12. exact selection is verified against the stored page', () => {
  const selection = (over: Record<string, unknown> = {}) => ({
    type: 'knowledge-selection' as const, knowledgeDocumentId: DOC, pageNumber: 1,
    charStart: 4, charEnd: 10, selectedText: PAGE.slice(4, 10), ...over,
  });

  it('3,12. an honest selection resolves and keeps its provenance', async () => {
    const { client: c } = client({ document: readyDoc, pages: [page(1)] });
    const result = await resolveBoardAiChatContext(c, BOARD, [selection()]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toMatchObject({
        type: 'knowledge-selection', knowledgeDocumentId: DOC, pageNumber: 1, charStart: 4, charEnd: 10,
      });
      // The SERVER'S slice, which happens to equal what the client claimed.
      expect(result.value[0].text).toBe(PAGE.slice(4, 10));
    }
  });

  it('4. tampered text is refused even with honest offsets', async () => {
    const { client: c } = client({ document: readyDoc, pages: [page(1)] });
    const result = await resolveBoardAiChatContext(c, BOARD, [selection({ selectedText: 'not this' })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
  });

  it('5. a range past the end of the page is refused', async () => {
    const { client: c } = client({ document: readyDoc, pages: [page(1)] });
    const result = await resolveBoardAiChatContext(c, BOARD, [selection({ charEnd: 99_999 })]);
    expect(result.ok).toBe(false);
  });

  it('a selection never quietly widens into the whole document', async () => {
    const { client: c } = client({ document: readyDoc, pages: [page(1)] });
    const result = await resolveBoardAiChatContext(c, BOARD, [selection()]);
    expect(result.ok && result.value[0].text).not.toContain('persisted');
  });

  it('6. a page that does not exist is not found', async () => {
    const { client: c } = client({ document: readyDoc, pages: [] });
    const result = await resolveBoardAiChatContext(c, BOARD, [
      { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 9 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });
});

describe('13,17,18,19. posts resolve to safe plain text', () => {
  it('13,18,19. markup is stripped, never forwarded or executed', async () => {
    const { client: c } = client({
      padlet: { id: PAD, type: 'text', title: 'My note', content: '<p>Hello <b>bold</b></p><script>alert(1)</script>' },
    });
    const result = await resolveBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].text).toContain('Hello bold');
      expect(result.value[0].text).not.toContain('<');
      expect(result.value[0].text).not.toContain('script');
      expect(result.value[0].label).toBe('My note');
    }
  });

  it('1,2. the two types with a real text authority are accepted', async () => {
    for (const type of ['text', 'note']) {
      const { client: c } = client({ padlet: { id: PAD, type, title: 'T', content: '<p>body</p>' } });
      const result = await resolveBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }]);
      expect(result.ok, type).toBe(true);
      if (result.ok) expect(result.value[0].text).toContain('body');
    }
  });

  it('3,4,17. every other post type is refused, todo and card included', async () => {
    for (const type of [
      // Refused because their substance is not in `content`: a to-do keeps its
      // tasks in metadata, and `card` is clipart or the Document card for a
      // PDF. Both used to resolve to a bare title and answer 200.
      'todo', 'card',
      'image', 'drawing', 'file', 'map', 'link', 'table', 'comment', 'container',
    ]) {
      const { client: c } = client({
        padlet: { id: PAD, type, title: 'Sprint list', content: '<p>x</p>' },
      });
      const result = await resolveBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }]);
      expect(result.ok, type).toBe(false);
      if (!result.ok) expect(result.error.code, type).toBe('validation');
    }
  });

  it('5,6. an unsupported stored reference is DROPPED from history, not fatal', async () => {
    for (const type of ['todo', 'card']) {
      const { client: c } = client({ padlet: { id: PAD, type, title: 'T', content: '<p>x</p>' } });
      // The thread stays usable; the reference just stops arriving.
      expect(await resolveHistoricalBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }]))
        .toEqual([]);
    }
  });

  it('an empty post carries nothing worth attaching', async () => {
    const { client: c } = client({ padlet: { id: PAD, type: 'text', title: '', content: '<p></p>' } });
    expect((await resolveBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }])).ok).toBe(false);
  });
});

describe('21,24,25. current fails closed; historical is dropped', () => {
  it('21. one bad current reference refuses the whole request', async () => {
    const { client: c } = client({ document: null, padlet: { id: PAD, type: 'text', title: 'T', content: 'ok' } });
    const result = await resolveBoardAiChatContext(c, BOARD, [
      { type: 'padlet', padletId: PAD },
      { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1 },
    ]);
    // Nothing partial: the caller gets a refusal, not a half-honoured request.
    expect(result.ok).toBe(false);
  });

  it('24,25. an unresolvable historical reference is dropped, not fatal', async () => {
    const { client: c } = client({ document: null, padlet: { id: PAD, type: 'text', title: 'T', content: 'ok' } });
    const blocks = await resolveHistoricalBoardAiChatContext(c, BOARD, [
      { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1 },
      { type: 'padlet', padletId: PAD },
    ]);
    // The conversation survives; only the reference that no longer resolves
    // stops reaching the model.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('padlet');
  });
});

describe('the resolver reads only through the caller and only what it needs', () => {
  it('touches three tables and no admin client', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const raw = fs.readFileSync(path.join(process.cwd(), 'lib/server/ai/boardAiChatContext.ts'), 'utf8');
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(source).not.toContain('getSupabaseAdmin');
    expect(source).not.toContain('service_role');
    expect(source).not.toContain('createSignedUrl');
    // 45,46. No board-wide sweep and no source-reference expansion.
    expect(source).not.toContain('source_references');
    expect(source).not.toMatch(/from\('boards'\)/);
    const tables = new Set(source.match(/from\('(\w+)'\)/g) ?? []);
    expect([...tables].sort()).toEqual(["from('knowledge_documents')", "from('knowledge_pages')", "from('padlets')"]);
  });
});
