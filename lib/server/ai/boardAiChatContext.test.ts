import { describe, expect, it } from 'vitest';

import {
  resolveBoardAiChatContext,
  resolveHistoricalBoardAiChatContext,
  type BoardAiContextSupabaseClient,
} from './boardAiChatContext';

import { err } from '../../domain/core/result';
import { domainError } from '../../domain/core/errors';

/**
 * Every case in THIS file resolves a text source, so no byte read may happen.
 * A reader that fails on contact proves that rather than assuming it: if any of
 * these ever reached the image branch, the result would change and the test
 * would say so.
 */
const neverReads = {
  download: async () => err(domainError('unavailable', 'no byte read expected in this file')),
};

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
    await resolveBoardAiChatContext(c, BOARD, [{ type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1 }], neverReads);
    // The row simply is not there for a document on another board.
    expect(filters.knowledge_documents).toEqual({ id: DOC, board_id: BOARD });
  });

  it('a post is only ever read WITH the route board', async () => {
    const { client: c, filters } = client({ padlet: { id: PAD, type: 'text', title: 'T', content: '<p>body</p>' } });
    await resolveBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }], neverReads);
    expect(filters.padlets).toEqual({ id: PAD, board_id: BOARD });
  });

  it('a document on another board is not found, and says nothing more', async () => {
    const { client: c } = client({ document: null });
    const result = await resolveBoardAiChatContext(c, BOARD, [
      { type: 'knowledge-document', knowledgeDocumentId: DOC },
    ], neverReads);
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
    ], neverReads);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('conflict');
  });

  it('11. every page keeps its number in the text handed to the model', async () => {
    const { client: c } = client({ document: readyDoc, pages: [page(1, 'first'), page(2, 'second')] });
    const result = await resolveBoardAiChatContext(c, BOARD, [
      { type: 'knowledge-document', knowledgeDocumentId: DOC },
    ], neverReads);
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
    ], neverReads);
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
    const result = await resolveBoardAiChatContext(c, BOARD, [selection()], neverReads);
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
    const result = await resolveBoardAiChatContext(c, BOARD, [selection({ selectedText: 'not this' })], neverReads);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
  });

  it('5. a range past the end of the page is refused', async () => {
    const { client: c } = client({ document: readyDoc, pages: [page(1)] });
    const result = await resolveBoardAiChatContext(c, BOARD, [selection({ charEnd: 99_999 })], neverReads);
    expect(result.ok).toBe(false);
  });

  it('a selection never quietly widens into the whole document', async () => {
    const { client: c } = client({ document: readyDoc, pages: [page(1)] });
    const result = await resolveBoardAiChatContext(c, BOARD, [selection()], neverReads);
    expect(result.ok && result.value[0].text).not.toContain('persisted');
  });

  it('6. a page that does not exist is not found', async () => {
    const { client: c } = client({ document: readyDoc, pages: [] });
    const result = await resolveBoardAiChatContext(c, BOARD, [
      { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 9 },
    ], neverReads);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });
});

describe('13,17,18,19. posts resolve to safe plain text', () => {
  it('13,18,19. markup is stripped, never forwarded or executed', async () => {
    const { client: c } = client({
      padlet: { id: PAD, type: 'text', title: 'My note', content: '<p>Hello <b>bold</b></p><script>alert(1)</script>' },
    });
    const result = await resolveBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }], neverReads);
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
      const result = await resolveBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }], neverReads);
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
      const result = await resolveBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }], neverReads);
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
    expect((await resolveBoardAiChatContext(c, BOARD, [{ type: 'padlet', padletId: PAD }], neverReads)).ok).toBe(false);
  });
});

describe('21,24,25. current fails closed; historical is dropped', () => {
  it('21. one bad current reference refuses the whole request', async () => {
    const { client: c } = client({ document: null, padlet: { id: PAD, type: 'text', title: 'T', content: 'ok' } });
    const result = await resolveBoardAiChatContext(c, BOARD, [
      { type: 'padlet', padletId: PAD },
      { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1 },
    ], neverReads);
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
  it('touches four tables and no admin client', async () => {
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
    // UPDATED DELIBERATELY at Stage 1. knowledge_chunks joins the list because
    // a PAGELESS source has no knowledge_pages row to slice -- for text and
    // markdown the chunks ARE the canonical text, and a citation's range is
    // stitched from the chunks that cover it.
    //
    // The rule this tripwire actually guards is unchanged and is the reason it
    // is still worth failing on: every read goes through the CALLER'S client,
    // so RLS decides what exists. knowledge_chunks carries its own board-scoped
    // policy exactly as the other three do, and the read is keyed by a
    // document_id that readDocument has already proved sits on the route board.
    expect([...tables].sort()).toEqual([
      "from('knowledge_chunks')",
      "from('knowledge_documents')",
      "from('knowledge_pages')",
      "from('padlets')",
    ]);
  });
});

/**
 * STAGE 1 -- a source with no pages.
 *
 * For text and markdown the CHUNKS are the canonical text: there is no
 * knowledge_pages row to slice, and Decision (A) refuses to create a synthetic
 * page 1 to make the paged path work. So a citation's range is stitched from
 * the chunks that cover it, and the two things that must not happen are a
 * pageless source failing to resolve at all, and a range resolving SHORT.
 */
describe('Stage 1. a pageless source resolves from its chunks', () => {
  const TEXT = 'Alpha paragraph one.\n\nBeta paragraph two.\n\nGamma paragraph three.';
  const CUT = 24;
  const textChunks = [
    { text: TEXT.slice(0, CUT), char_start: 0, char_end: CUT, chunk_index: 0 },
    { text: TEXT.slice(CUT), char_start: CUT, char_end: TEXT.length, chunk_index: 1 },
  ];

  /** Like `client` above, but it can answer for knowledge_chunks too. */
  function textClient(over: { chunks?: Record<string, unknown>[]; pages?: Record<string, unknown>[]; kind?: string } = {}) {
    const build = (many: Record<string, unknown>[], single: Record<string, unknown> | null) => {
      const query: Record<string, unknown> = {
        eq() { return query; },
        is() { return query; },
        in() { return query; },
        order() { return query; },
        limit() { return query; },
        maybeSingle: async () => ({ data: single, error: null }),
        then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) {
          return Promise.resolve({ data: many, error: null }).then(resolve);
        },
      };
      return query;
    };
    const api = {
      from(table: string) {
        if (table === 'knowledge_documents') {
          // THE KIND IS ON THE RECORD. The resolver reads it from here and
          // never infers it from the request, so this fake has to declare it.
          return {
            select: () => build([], {
              id: DOC, original_filename: 'notes.txt', processing_status: 'ready',
              kind: over.kind ?? 'text',
            }),
          };
        }
        if (table === 'knowledge_chunks') return { select: () => build(over.chunks ?? textChunks, null) };
        if (table === 'padlets') return { select: () => build([], null) };
        // knowledge_pages: empty, which is what makes the source pageless.
        return { select: () => build(over.pages ?? [], null) };
      },
    };
    return api as unknown as BoardAiContextSupabaseClient;
  }

  const selection = (over: Record<string, unknown> = {}) => ({
    type: 'knowledge-selection' as const,
    knowledgeDocumentId: DOC,
    charStart: 0,
    charEnd: 20,
    selectedText: TEXT.slice(0, 20),
    ...over,
  });

  it('resolves a selection inside a single chunk', async () => {
    const result = await resolveBoardAiChatContext(textClient(), BOARD, [selection()], neverReads);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({ type: 'knowledge-selection', charStart: 0, charEnd: 20 });
    expect(result.value[0].text).toBe(TEXT.slice(0, 20));
  });

  it('RESOLVES A SELECTION THAT STRADDLES TWO CHUNKS', async () => {
    // The property Decision 0 spends. A citation names offsets into the
    // source, not into a chunk, so the boundary must be invisible.
    const straddle = selection({ charStart: CUT - 6, charEnd: CUT + 6, selectedText: TEXT.slice(CUT - 6, CUT + 6) });
    const result = await resolveBoardAiChatContext(textClient(), BOARD, [straddle], neverReads);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].text).toBe(TEXT.slice(CUT - 6, CUT + 6));
  });

  it('NAMES NO PAGE IN ITS LABEL, because the source has none', async () => {
    const result = await resolveBoardAiChatContext(textClient(), BOARD, [selection()], neverReads);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].label).not.toMatch(/page/i);
    expect(result.value[0].label).toContain('notes');
  });

  it('refuses a selection whose text does not match the stored chunks', async () => {
    const result = await resolveBoardAiChatContext(
      textClient(), BOARD, [selection({ selectedText: 'not what is stored' })], neverReads);
    expect(result.ok).toBe(false);
  });

  it('REFUSES A RANGE THE CHUNKS DO NOT COVER rather than quoting short', async () => {
    // A citation that silently returns less than it names is a quotation the
    // reader believes is complete.
    const missing = [textChunks[0]];
    const straddle = selection({ charStart: CUT - 6, charEnd: CUT + 6, selectedText: TEXT.slice(CUT - 6, CUT + 6) });
    const result = await resolveBoardAiChatContext(textClient({ chunks: missing }), BOARD, [straddle], neverReads);
    expect(result.ok).toBe(false);
  });

  it('refuses a knowledge-PAGE reference to a source that has no pages', async () => {
    // Naming page 1 of a text file names something that does not exist.
    const result = await resolveBoardAiChatContext(
      textClient(), BOARD, [{ type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1 }], neverReads);
    expect(result.ok).toBe(false);
  });

  it('a whole-document attachment is the concatenated chunks, with no page list', async () => {
    const result = await resolveBoardAiChatContext(
      textClient(), BOARD, [{ type: 'knowledge-document', knowledgeDocumentId: DOC }], neverReads);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].text).toBe(TEXT);
    expect(result.value[0].pageNumbers).toEqual([]);
  });

  it('a document with neither pages nor chunks is still not found', async () => {
    const result = await resolveBoardAiChatContext(
      textClient({ chunks: [] }), BOARD, [{ type: 'knowledge-document', knowledgeDocumentId: DOC }], neverReads);
    expect(result.ok).toBe(false);
  });
});

/**
 * THE KIND COMES FROM THE RECORD, AND THE LOCATOR IS VALIDATED AGAINST IT.
 *
 * An earlier version branched on `pageNumber === undefined`, which let the
 * REQUEST choose its own resolution strategy: omit the page and the pageless
 * reader runs. A caller naming an identity is the contract; a caller selecting
 * a code path is the defect this module exists to refuse.
 */
describe('Stage 1. the locator is validated against the document kind', () => {
  const TEXT = 'Alpha paragraph one.\n\nBeta paragraph two.';
  const chunkRows = [{ text: TEXT, char_start: 0, char_end: TEXT.length, chunk_index: 0 }];

  function kindClient(kind: string, pages: Record<string, unknown>[] = []) {
    const build = (many: Record<string, unknown>[], single: Record<string, unknown> | null) => {
      const query: Record<string, unknown> = {
        eq() { return query; }, is() { return query; }, in() { return query; },
        order() { return query; }, limit() { return query; },
        maybeSingle: async () => ({ data: single, error: null }),
        then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) {
          return Promise.resolve({ data: many, error: null }).then(resolve);
        },
      };
      return query;
    };
    const api = {
      from(table: string) {
        if (table === 'knowledge_documents') {
          return { select: () => build([], { id: DOC, original_filename: 'src', processing_status: 'ready', kind }) };
        }
        if (table === 'knowledge_chunks') return { select: () => build(chunkRows, null) };
        if (table === 'padlets') return { select: () => build([], null) };
        return { select: () => build(pages, null) };
      },
    };
    return api as unknown as BoardAiContextSupabaseClient;
  }

  const sel = (over: Record<string, unknown> = {}) => ({
    type: 'knowledge-selection' as const, knowledgeDocumentId: DOC,
    charStart: 0, charEnd: 20, selectedText: TEXT.slice(0, 20), ...over,
  });

  it('A PAGELESS REQUEST AGAINST A PDF IS REFUSED, not routed to the chunk reader', async () => {
    // The exact bypass the decision closes: without this, omitting pageNumber
    // on a PDF would read that PDF's chunks and slice them by raw offsets.
    const result = await resolveBoardAiChatContext(kindClient('pdf', [page(1)]), BOARD, [sel()], neverReads);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toMatch(/A page is required/);
  });

  it('A PAGE CITED IN A TEXT SOURCE IS REFUSED, with a reason', async () => {
    const result = await resolveBoardAiChatContext(
      kindClient('text'), BOARD, [sel({ pageNumber: 1 })], neverReads);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toMatch(/has no pages/);
  });

  it('a well-formed text selection still resolves', async () => {
    const result = await resolveBoardAiChatContext(kindClient('text'), BOARD, [sel()], neverReads);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].text).toBe(TEXT.slice(0, 20));
  });

  it('a well-formed PDF selection still resolves -- the regression control', async () => {
    const pdfText = 'The stored page text, exactly as the worker persisted it.';
    const result = await resolveBoardAiChatContext(
      kindClient('pdf', [{ page_number: 1, text: pdfText }]), BOARD,
      [sel({ pageNumber: 1, charStart: 4, charEnd: 10, selectedText: pdfText.slice(4, 10) })], neverReads);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({ pageNumber: 1, charStart: 4, charEnd: 10 });
  });

  it.each([
    ['inverted', { charStart: 20, charEnd: 5 }],
    ['empty', { charStart: 7, charEnd: 7 }],
    ['negative', { charStart: -1, charEnd: 5 }],
    ['fractional', { charStart: 0.5, charEnd: 5 }],
  ])('a %s character range on a text source is refused explicitly', async (_label, range) => {
    const result = await resolveBoardAiChatContext(
      kindClient('text'), BOARD, [sel({ ...range, selectedText: 'x' })], neverReads);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('validation');
  });

  it('an unknown kind is treated as pageless, not as a PDF', async () => {
    // Forward compatibility: a kind this build does not know about has no
    // pages it could name, and guessing 'pdf' would demand a locator the
    // document cannot have.
    const result = await resolveBoardAiChatContext(kindClient('youtube'), BOARD, [sel()], neverReads);
    expect(result.ok).toBe(true);
  });
});
