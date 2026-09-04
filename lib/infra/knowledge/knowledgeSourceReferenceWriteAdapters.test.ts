import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  SupabaseKnowledgeSourceReferenceValidationRepository,
  SupabaseKnowledgeSourceReferenceWriteAuthorizer,
  SupabaseKnowledgeSourceReferenceWriter,
  nodeKnowledgeQuoteHasher,
} from './knowledgeSourceReferenceWriteAdapters';
import type { KnowledgeSourceReferenceWriteSupabaseClient } from './knowledgeSourceReferenceWriteAdapters';
import { asBoardId, asKnowledgeDocumentId, asPostId, asUserId } from '../../domain/core/ids';

const BOARD_A = asBoardId('11111111-1111-4111-8111-111111111111');
const BOARD_B = asBoardId('99999999-9999-4999-8999-999999999999');
const USER = asUserId('user-1');
const PADLET = asPostId('22222222-2222-4222-8222-222222222222');
const DOCUMENT = asKnowledgeDocumentId('33333333-3333-4333-8333-333333333333');

type TableResult = { data: unknown; error: unknown } | Error;

/**
 * Records the exact query shape per table. Only the methods the adapters are
 * allowed to use exist, so any mutation beyond the source_references insert is
 * a missing-method crash rather than a silent success.
 */
function setup(results: Record<string, TableResult>) {
  const calls: Array<{ table: string; select?: string; eq: Array<[string, string]>; insert?: unknown }> = [];
  // PDF-R6K-H2B: the citation write is now one atomic RPC, so the harness
  // records that call the way it records table queries.
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      const result = results.rpc;
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(result ?? {
        data: [{ reference_id: 'reference-1', highlight_id: null }],
        error: null,
      });
    }),
    from: vi.fn((table: string) => {
      const entry: { table: string; select?: string; eq: Array<[string, string]>; insert?: unknown } = { table, eq: [] };
      calls.push(entry);
      const settle = () => {
        const result = results[table];
        if (result instanceof Error) return Promise.reject(result);
        return Promise.resolve(result ?? { data: null, error: null });
      };
      const query = {
        eq: vi.fn((column: string, value: string) => { entry.eq.push([column, value]); return query; }),
        maybeSingle: vi.fn(() => settle()),
        single: vi.fn(() => settle()),
      };
      return {
        select: vi.fn((columns: string) => { entry.select = columns; return query; }),
        insert: vi.fn((row: unknown) => {
          entry.insert = row;
          return { select: vi.fn((columns: string) => { entry.select = columns; return query; }) };
        }),
      };
    }),
  } as unknown as KnowledgeSourceReferenceWriteSupabaseClient;
  return {
    client,
    calls,
    rpcCalls,
    table: (name: string) => calls.filter((entry) => entry.table === name),
  };
}

describe('P6J-F4-A source reference write adapters', () => {
  describe('quote hasher', () => {
    it('produces the known SHA-256 vector as lowercase hex', () => {
      expect(nodeKnowledgeQuoteHasher.hashQuoteText('abc'))
        .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('hashes exact bytes without trimming, casing or newline normalisation', () => {
      const hasher = nodeKnowledgeQuoteHasher;
      expect(hasher.hashQuoteText(' abc ')).not.toBe(hasher.hashQuoteText('abc'));
      expect(hasher.hashQuoteText('ABC')).not.toBe(hasher.hashQuoteText('abc'));
      expect(hasher.hashQuoteText('a\r\nb')).not.toBe(hasher.hashQuoteText('a\nb'));
      expect(hasher.hashQuoteText('é')).toHaveLength(64);
      expect(hasher.hashQuoteText('abc')).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('board write authorizer', () => {
    it('accepts the board owner by exact board and user', async () => {
      const state = setup({ boards: { data: { id: BOARD_A }, error: null } });

      const result = await new SupabaseKnowledgeSourceReferenceWriteAuthorizer(state.client)
        .canWriteBoard(BOARD_A, USER);

      expect(result).toEqual({ ok: true, value: true });
      expect(state.table('boards')[0].eq).toEqual([['id', BOARD_A], ['user_id', USER]]);
      // Ownership short-circuits: no collaborator lookup needed.
      expect(state.table('board_collaborators')).toHaveLength(0);
    });

    it('accepts an editor collaborator and never promotes a viewer', async () => {
      const editor = setup({
        boards: { data: null, error: null },
        board_collaborators: { data: { board_id: BOARD_A }, error: null },
      });
      await expect(new SupabaseKnowledgeSourceReferenceWriteAuthorizer(editor.client).canWriteBoard(BOARD_A, USER))
        .resolves.toEqual({ ok: true, value: true });
      expect(editor.table('board_collaborators')[0].eq).toEqual([
        ['board_id', BOARD_A], ['user_id', USER], ['role', 'editor'],
      ]);

      // A viewer row exists but does not satisfy role = 'editor', so the filtered
      // lookup returns nothing.
      const viewer = setup({ boards: { data: null, error: null }, board_collaborators: { data: null, error: null } });
      await expect(new SupabaseKnowledgeSourceReferenceWriteAuthorizer(viewer.client).canWriteBoard(BOARD_A, USER))
        .resolves.toEqual({ ok: true, value: false });
      expect(viewer.calls.some((entry) => entry.table === 'board_collaborators'
        && entry.eq.some(([column, value]) => column === 'role' && value === 'editor'))).toBe(true);
    });

    it('maps query and thrown failures to unavailable', async () => {
      const queryError = setup({ boards: { data: null, error: { message: 'permission denied for table boards' } } });
      const first = await new SupabaseKnowledgeSourceReferenceWriteAuthorizer(queryError.client).canWriteBoard(BOARD_A, USER);
      expect(first.ok === false && first.error.code).toBe('unavailable');
      expect(first.ok === false && first.error.message).toBe('Could not write the source reference');
      expect(first.ok === false && first.error.message).not.toContain('permission denied');

      const thrown = setup({ boards: new Error('socket hang up') });
      const second = await new SupabaseKnowledgeSourceReferenceWriteAuthorizer(thrown.client).canWriteBoard(BOARD_A, USER);
      expect(second.ok === false && second.error.code).toBe('unavailable');
      expect(second.ok === false && second.error.message).not.toContain('socket hang up');
    });
  });

  describe('validation repository', () => {
    it('scopes the source document lookup by both id and board and projects the gate columns', async () => {
      const state = setup({
        knowledge_documents: { data: { board_id: BOARD_A, page_count: 12, processing_status: 'ready' }, error: null },
      });

      const result = await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
        .findSourceDocument(DOCUMENT, BOARD_A);

      expect(state.table('knowledge_documents')[0].eq).toEqual([['id', DOCUMENT], ['board_id', BOARD_A]]);
      expect(state.table('knowledge_documents')[0].select).toBe('board_id, page_count, processing_status');
      expect(result).toEqual({ ok: true, value: { boardId: BOARD_A, pageCount: 12, processingStatus: 'ready' } });
    });

    it('reports a cross-board source document as absent', async () => {
      const state = setup({ knowledge_documents: { data: null, error: null } });

      const result = await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
        .findSourceDocument(DOCUMENT, BOARD_B);

      expect(state.table('knowledge_documents')[0].eq).toEqual([['id', DOCUMENT], ['board_id', BOARD_B]]);
      expect(result).toEqual({ ok: true, value: null });
    });

    it('scopes the target padlet lookup by both id and board', async () => {
      const state = setup({
        padlets: { data: { board_id: BOARD_A, metadata: { topStrip: '#fde68a' } }, error: null },
      });

      const result = await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
        .findTargetPadlet(PADLET, BOARD_A);

      expect(state.table('padlets')[0].eq).toEqual([['id', PADLET], ['board_id', BOARD_A]]);
      // PDF-R6K-H2B also reads the Note's colour, to seed a paired highlight
      // once. Nothing else about the lookup changed.
      expect(state.table('padlets')[0].select).toBe('board_id, metadata');
      expect(result).toEqual({
        ok: true,
        value: { boardId: BOARD_A, noteColors: { topStrip: '#fde68a', cardColor: undefined } },
      });
    });

    it('maps lookup failures to unavailable without provider text', async () => {
      const state = setup({ knowledge_documents: { data: null, error: { message: 'relation missing' } } });
      const result = await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
        .findSourceDocument(DOCUMENT, BOARD_A);
      expect(result.ok === false && result.error.code).toBe('unavailable');
      expect(result.ok === false && result.error.message).not.toContain('relation missing');

      const thrown = setup({ padlets: new Error('boom') });
      const padletResult = await new SupabaseKnowledgeSourceReferenceValidationRepository(thrown.client)
        .findTargetPadlet(PADLET, BOARD_A);
      expect(padletResult.ok === false && padletResult.error.code).toBe('unavailable');
    });
  });

  describe('writer', () => {
    const insertedRow = {
      id: 'reference-1',
      target_padlet_id: PADLET,
      source_document_id: DOCUMENT,
      page_start: 2,
      page_end: 3,
      quote_text: 'a quoted passage',
      quote_hash: 'server-hash',
      char_start: null,
      char_end: null,
      region_x: null,
      region_y: null,
      region_width: null,
      region_height: null,
      locator: null,
      created_at: '2026-08-24T00:00:00.000Z',
    };

    it('creates the citation through ONE atomic call, with the approved fields', async () => {
      const state = setup({ source_references: { data: insertedRow, error: null } });

      await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
        targetPadletId: PADLET,
        sourceDocumentId: DOCUMENT,
        pageStart: 2,
        pageEnd: 3,
        quoteText: 'a quoted passage',
        quoteHash: 'server-hash',
        charStart: null,
        charEnd: null,
        regionX: null, regionY: null, regionWidth: null, regionHeight: null,
        highlightColor: null,
      });

      // PDF-R6K-H2B: one transaction, so a citation can never outlive a failed
      // highlight write. Two sequential PostgREST calls could not promise that.
      expect(state.rpcCalls).toHaveLength(1);
      expect(state.rpcCalls[0].fn).toBe('create_knowledge_source_citation');
      expect(state.rpcCalls[0].args).toEqual({
        p_target_padlet_id: PADLET,
        p_source_document_id: DOCUMENT,
        p_page_start: 2,
        p_page_end: 3,
        p_quote_text: 'a quoted passage',
        p_quote_hash: 'server-hash',
        p_char_start: null,
        p_char_end: null,
        p_region_x: null, p_region_y: null, p_region_width: null, p_region_height: null,
        p_highlight_color: null,
      });
      // Authorship is never sent: the column default writes it (H2A-C1).
      expect(Object.keys(state.rpcCalls[0].args)).not.toContain('p_created_by');
    });

    it('returns the STORED row, read back rather than echoed', async () => {
      const state = setup({ source_references: { data: insertedRow, error: null } });

      const result = await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
        targetPadletId: PADLET,
        sourceDocumentId: DOCUMENT,
        pageStart: 2,
        pageEnd: 3,
        quoteText: 'a quoted passage',
        quoteHash: 'server-hash',
        charStart: null,
        charEnd: null,
        regionX: null, regionY: null, regionWidth: null, regionHeight: null,
        highlightColor: null,
      });

      expect(result.ok === true && result.value.id).toBe('reference-1');
      // Read by the id the function returned, through the ordinary read path.
      expect(state.table('source_references')[0].eq).toEqual([['id', 'reference-1']]);
    });

    it('passes a highlight colour through for a paintable text span', async () => {
      const state = setup({ source_references: { data: insertedRow, error: null } });

      await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
        targetPadletId: PADLET,
        sourceDocumentId: DOCUMENT,
        pageStart: 2,
        pageEnd: 2,
        quoteText: 'beta',
        quoteHash: 'server-hash',
        charStart: 6,
        charEnd: 10,
        regionX: null, regionY: null, regionWidth: null, regionHeight: null,
        highlightColor: '#fde68a',
      });

      expect(state.rpcCalls[0].args).toMatchObject({
        p_char_start: 6, p_char_end: 10, p_highlight_color: '#fde68a',
      });
    });

    it('maps failures to unavailable without provider text', async () => {
      const queryError = setup({ rpc: { data: null, error: { message: 'permission denied for relation' } } });
      const first = await new SupabaseKnowledgeSourceReferenceWriter(queryError.client).insertSourceReference({
        targetPadletId: PADLET,
        sourceDocumentId: DOCUMENT,
        pageStart: 1,
        pageEnd: 1,
        quoteText: null,
        quoteHash: null,
        charStart: null,
        charEnd: null,
        regionX: null, regionY: null, regionWidth: null, regionHeight: null,
        highlightColor: null,
      });
      expect(first.ok === false && first.error.code).toBe('unavailable');
      expect(first.ok === false && first.error.message).not.toContain('permission denied');

      const thrown = setup({ rpc: new Error('socket hang up') });
      const second = await new SupabaseKnowledgeSourceReferenceWriter(thrown.client).insertSourceReference({
        targetPadletId: PADLET,
        sourceDocumentId: DOCUMENT,
        pageStart: 1,
        pageEnd: 1,
        quoteText: null,
        quoteHash: null,
        charStart: null,
        charEnd: null,
        regionX: null, regionY: null, regionWidth: null, regionHeight: null,
        highlightColor: null,
      });
      expect(second.ok === false && second.error.code).toBe('unavailable');
      expect(second.ok === false && second.error.message).not.toContain('socket hang up');
    });

    it('declares no update, delete, upsert, storage or auth capability, and ONE named rpc', () => {
      const source = readFileSync(
        join(process.cwd(), 'lib/infra/knowledge/knowledgeSourceReferenceWriteAdapters.ts'), 'utf8',
      ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      // Precise needles: `.update(` also occurs in the SHA-256 hash builder,
      // which is not a table mutation.
      for (const forbidden of ['.update({', '.delete()', '.upsert(', 'storage', '.auth']) {
        expect(source, forbidden).not.toContain(forbidden);
      }
      // PDF-R6K-H2B adds exactly one remote procedure, typed by literal name so
      // no other function is reachable through this client.
      expect(source).toContain("fn: 'create_knowledge_source_citation'");
      expect(source).toContain("this.client.rpc('create_knowledge_source_citation'");
    });
  });

  describe('canonical page text', () => {
    const PAGE = 'prefix 😀 alpha\nbeta suffix';

    it('S: queries knowledge_pages by document and page number, selecting only text', async () => {
      const state = setup({ knowledge_pages: { data: { text: PAGE }, error: null } });

      await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
        .findPageText(DOCUMENT, 2);

      const entry = state.table('knowledge_pages')[0];
      expect(entry.select).toBe('text');
      expect(entry.eq).toEqual([['document_id', DOCUMENT], ['page_number', 2]]);
      expect(state.calls.map((call) => call.table)).toEqual(['knowledge_pages']);
    });

    it('T: returns the stored text verbatim, with no trimming or normalisation', async () => {
      const raw = '  padded\r\n\ttabbed  ';
      const state = setup({ knowledge_pages: { data: { text: raw }, error: null } });

      const result = await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
        .findPageText(DOCUMENT, 1);

      expect(result).toEqual({ ok: true, value: raw });
    });

    it('T: a missing page resolves to null rather than empty text', async () => {
      const state = setup({ knowledge_pages: { data: null, error: null } });

      const result = await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
        .findPageText(DOCUMENT, 99);

      expect(result).toEqual({ ok: true, value: null });
    });

    it('U: maps a query error or a throw to the stable unavailable failure', async () => {
      const queryError = setup({ knowledge_pages: { data: null, error: { message: 'violates row-level security policy' } } });
      const first = await new SupabaseKnowledgeSourceReferenceValidationRepository(queryError.client)
        .findPageText(DOCUMENT, 1);
      expect(first.ok === false && first.error.code).toBe('unavailable');
      expect(first.ok === false && first.error.message).not.toContain('row-level security');

      const thrown = setup({ knowledge_pages: new Error('network down') });
      const second = await new SupabaseKnowledgeSourceReferenceValidationRepository(thrown.client)
        .findPageText(DOCUMENT, 1);
      expect(second.ok === false && second.error.code).toBe('unavailable');
      expect(second.ok === false && second.error.message).not.toContain('network down');
    });

    it('Y: the page read is a SELECT -- no mutation capability is added', async () => {
      const state = setup({ knowledge_pages: { data: { text: PAGE }, error: null } });

      await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
        .findPageText(DOCUMENT, 1);

      const table = (state.client.from as unknown as ReturnType<typeof vi.fn>)
        .mock.results[0].value as Record<string, unknown>;
      for (const method of ['update', 'delete', 'upsert']) {
        expect(table[method]).toBeUndefined();
      }
      const client = state.client as unknown as Record<string, unknown>;
      // PDF-R6K-H2B: `rpc` is now a legitimate, single-purpose capability and is
      // asserted by name in the writer block above. Storage and auth remain
      // absent, and no table gains a mutation it did not have.
      for (const method of ['storage', 'auth']) {
        expect(client[method]).toBeUndefined();
      }
    });
  });

  describe('exact-span insert', () => {
    const insertedSpanRow = {
      id: 'reference-2',
      target_padlet_id: PADLET,
      source_document_id: DOCUMENT,
      page_start: 2,
      page_end: 2,
      quote_text: 'alpha',
      quote_hash: 'server-hash',
      char_start: 10,
      char_end: 15,
      locator: null,
      created_at: '2026-08-24T00:00:00.000Z',
    };

    it('V/X: persists the validated offsets and still pins locator to null', async () => {
      const state = setup({ source_references: { data: insertedSpanRow, error: null } });

      await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
        targetPadletId: PADLET, sourceDocumentId: DOCUMENT, pageStart: 2, pageEnd: 2,
        quoteText: 'alpha', quoteHash: 'server-hash', charStart: 10, charEnd: 15,
        regionX: null, regionY: null, regionWidth: null, regionHeight: null,
        highlightColor: null,
      });

      const args = state.rpcCalls[0].args;
      expect(args).toMatchObject({ p_char_start: 10, p_char_end: 15, p_quote_text: 'alpha' });
      // The locator stays unwritable: the function has no parameter for it.
      expect(args).not.toHaveProperty('p_locator');
      expect(args).not.toHaveProperty('selectedText');
      expect(args).not.toHaveProperty('p_selected_text');
    });

    it('V: maps the returned exact-span row onto the domain shape', async () => {
      const state = setup({ source_references: { data: insertedSpanRow, error: null } });

      const result = await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
        targetPadletId: PADLET, sourceDocumentId: DOCUMENT, pageStart: 2, pageEnd: 2,
        quoteText: 'alpha', quoteHash: 'server-hash', charStart: 10, charEnd: 15,
        regionX: null, regionY: null, regionWidth: null, regionHeight: null,
        highlightColor: null,
      });

      expect(result.ok && result.value.charStart).toBe(10);
      expect(result.ok && result.value.charEnd).toBe(15);
      expect(result.ok && result.value.locator).toBeNull();
    });

    it('W/X: a page-only insert still writes null offsets and a null locator', async () => {
      const pageOnlyRow = { ...insertedSpanRow, char_start: null, char_end: null };
      const state = setup({ source_references: { data: pageOnlyRow, error: null } });

      await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
        targetPadletId: PADLET, sourceDocumentId: DOCUMENT, pageStart: 2, pageEnd: 3,
        quoteText: 'a quoted passage', quoteHash: 'server-hash', charStart: null, charEnd: null,
        regionX: null, regionY: null, regionWidth: null, regionHeight: null,
        highlightColor: null,
      });

      const args = state.rpcCalls[0].args;
      expect(args).toMatchObject({ p_char_start: null, p_char_end: null });
      // A page-only citation paints nothing, so no highlight is requested.
      expect(args.p_highlight_color).toBeNull();
    });
  });
});

/**
 * P6J-F9-B1. The adapter is the only thing that knows region geometry lives in
 * four typed columns, so these pin the column names and the read that supplies
 * the server's page-shape authority.
 */
describe('P6J-F9-B1 region write adapters', () => {
  const REGION_ROW = {
    id: 'reference-1',
    target_padlet_id: PADLET,
    source_document_id: DOCUMENT,
    page_start: 4,
    page_end: 4,
    quote_text: null,
    quote_hash: null,
    char_start: null,
    char_end: null,
    region_x: 0.25,
    region_y: 0.1,
    region_width: 0.5,
    region_height: 0.4,
    locator: null,
    created_at: '2026-08-27T00:00:00.000Z',
  };

  it('writes the region into its four columns and leaves locator null', async () => {
    const state = setup({ source_references: { data: REGION_ROW, error: null } });

    const result = await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
      targetPadletId: PADLET,
      sourceDocumentId: DOCUMENT,
      pageStart: 4,
      pageEnd: 4,
      quoteText: null,
      quoteHash: null,
      charStart: null,
      charEnd: null,
      regionX: 0.25,
      regionY: 0.1,
      regionWidth: 0.5,
      regionHeight: 0.4,
      // A rectangle is not text: a region citation paints no highlight.
      highlightColor: null,
    });

    const args = state.rpcCalls[0].args;
    expect(args).toMatchObject({
      p_region_x: 0.25, p_region_y: 0.1, p_region_width: 0.5, p_region_height: 0.4,
    });
    expect(args.p_highlight_color).toBeNull();
    expect(result.ok === true && result.value.region).toEqual({
      x: 0.25, y: 0.1, width: 0.5, height: 0.4,
    });
  });

  it('selects the persisted page geometry by document and page number', async () => {
    const state = setup({
      knowledge_pages: { data: { width_points: 595, height_points: 842, rotation: 90 }, error: null },
    });

    const result = await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
      .findPageGeometry(DOCUMENT, 4);

    const entry = state.table('knowledge_pages')[0];
    expect(entry.select).toBe('width_points, height_points, rotation');
    expect(entry.eq).toEqual([['document_id', DOCUMENT], ['page_number', 4]]);
    expect(result).toEqual({ ok: true, value: { widthPoints: 595, heightPoints: 842, rotation: 90 } });
  });

  it('returns the stored geometry verbatim, defaulting and repairing nothing', async () => {
    // A NULL rotation means "none recorded"; what that means is the domain's
    // judgement, so it must be made in exactly one place and not here.
    const state = setup({
      knowledge_pages: { data: { width_points: null, height_points: null, rotation: null }, error: null },
    });

    const result = await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
      .findPageGeometry(DOCUMENT, 1);

    expect(result).toEqual({ ok: true, value: { widthPoints: null, heightPoints: null, rotation: null } });
  });

  it('reports a missing page as null and a failure as unavailable without provider text', async () => {
    const missing = setup({ knowledge_pages: { data: null, error: null } });
    expect(await new SupabaseKnowledgeSourceReferenceValidationRepository(missing.client)
      .findPageGeometry(DOCUMENT, 9)).toEqual({ ok: true, value: null });

    const failed = setup({
      knowledge_pages: { data: null, error: { message: 'violates row-level security policy' } },
    });
    const result = await new SupabaseKnowledgeSourceReferenceValidationRepository(failed.client)
      .findPageGeometry(DOCUMENT, 1);
    expect(result.ok === false && result.error.code).toBe('unavailable');
    expect(result.ok === false && result.error.message).not.toContain('row-level security');

    const thrown = setup({ knowledge_pages: new Error('network down') });
    const crashed = await new SupabaseKnowledgeSourceReferenceValidationRepository(thrown.client)
      .findPageGeometry(DOCUMENT, 1);
    expect(crashed.ok === false && crashed.error.code).toBe('unavailable');
    expect(crashed.ok === false && crashed.error.message).not.toContain('network down');
  });

  it('degrades a corrupt region row to no region rather than failing the read', async () => {
    // The CHECK constraints make this unreachable in practice; a region is
    // optional enhancement data, so one bad rectangle must not take the
    // reference with it.
    const state = setup({
      source_references: { data: { ...REGION_ROW, region_width: null }, error: null },
    });
    const result = await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
      targetPadletId: PADLET, sourceDocumentId: DOCUMENT, pageStart: 4, pageEnd: 4,
      quoteText: null, quoteHash: null, charStart: null, charEnd: null,
      regionX: 0.25, regionY: 0.1, regionWidth: 0.5, regionHeight: 0.4,
        highlightColor: null,
    });
    expect(result.ok === true && result.value.region).toBeNull();
  });
});
