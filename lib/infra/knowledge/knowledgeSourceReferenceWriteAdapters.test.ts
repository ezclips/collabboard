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
  const client = {
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
  return { client, calls, table: (name: string) => calls.filter((entry) => entry.table === name) };
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
      const state = setup({ padlets: { data: { board_id: BOARD_A }, error: null } });

      const result = await new SupabaseKnowledgeSourceReferenceValidationRepository(state.client)
        .findTargetPadlet(PADLET, BOARD_A);

      expect(state.table('padlets')[0].eq).toEqual([['id', PADLET], ['board_id', BOARD_A]]);
      expect(state.table('padlets')[0].select).toBe('board_id');
      expect(result).toEqual({ ok: true, value: { boardId: BOARD_A } });
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
      locator: null,
      created_at: '2026-08-24T00:00:00.000Z',
    };

    it('inserts exactly the approved V1 columns into source_references', async () => {
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
      });

      const entry = state.table('source_references')[0];
      const row = entry.insert as Record<string, unknown>;
      expect(state.calls.map((call) => call.table)).toEqual(['source_references']);
      expect(Object.keys(row).sort()).toEqual([
        'char_end', 'char_start', 'locator', 'page_end', 'page_start',
        'quote_hash', 'quote_text', 'source_document_id', 'target_padlet_id',
      ]);
      expect(row).toMatchObject({
        target_padlet_id: PADLET,
        source_document_id: DOCUMENT,
        page_start: 2,
        page_end: 3,
        quote_text: 'a quoted passage',
        quote_hash: 'server-hash',
        char_start: null,
        char_end: null,
        locator: null,
      });
      // The database owns identity and timestamp.
      expect(row).not.toHaveProperty('id');
      expect(row).not.toHaveProperty('created_at');
    });

    it('maps the returned row onto the existing domain shape', async () => {
      const state = setup({ source_references: { data: insertedRow, error: null } });

      const result = await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
        targetPadletId: PADLET, sourceDocumentId: DOCUMENT, pageStart: 2, pageEnd: 3,
        quoteText: 'a quoted passage', quoteHash: 'server-hash', charStart: null, charEnd: null,
      });

      expect(result).toEqual({ ok: true, value: {
        id: 'reference-1',
        targetPadletId: PADLET,
        sourceDocumentId: DOCUMENT,
        pageStart: 2,
        pageEnd: 3,
        quoteText: 'a quoted passage',
        quoteHash: 'server-hash',
        charStart: null,
        charEnd: null,
        locator: null,
        createdAt: '2026-08-24T00:00:00.000Z',
      } });
    });

    it('maps insert failures to unavailable without provider text', async () => {
      const queryError = setup({ source_references: { data: null, error: { message: 'violates row-level security policy' } } });
      const first = await new SupabaseKnowledgeSourceReferenceWriter(queryError.client).insertSourceReference({
        targetPadletId: PADLET, sourceDocumentId: DOCUMENT, pageStart: 1, pageEnd: 1, quoteText: null, quoteHash: null, charStart: null, charEnd: null,
      });
      expect(first.ok === false && first.error.code).toBe('unavailable');
      expect(first.ok === false && first.error.message).toBe('Could not write the source reference');
      expect(first.ok === false && first.error.message).not.toContain('row-level security');

      const thrown = setup({ source_references: new Error('network down') });
      const second = await new SupabaseKnowledgeSourceReferenceWriter(thrown.client).insertSourceReference({
        targetPadletId: PADLET, sourceDocumentId: DOCUMENT, pageStart: 1, pageEnd: 1, quoteText: null, quoteHash: null, charStart: null, charEnd: null,
      });
      expect(second.ok === false && second.error.code).toBe('unavailable');
      expect(second.ok === false && second.error.message).not.toContain('network down');
    });

    it('declares no update, delete, upsert, rpc, storage or auth capability', async () => {
      const state = setup({ source_references: { data: insertedRow, error: null } });
      const client = state.client as unknown as Record<string, unknown>;

      await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
        targetPadletId: PADLET, sourceDocumentId: DOCUMENT, pageStart: 1, pageEnd: 1, quoteText: null, quoteHash: null, charStart: null, charEnd: null,
      });

      for (const method of ['rpc', 'storage', 'auth', 'channel']) {
        expect(client[method]).toBeUndefined();
      }
      const table = (state.client.from as unknown as ReturnType<typeof vi.fn>).mock.results[0].value as Record<string, unknown>;
      expect(Object.keys(table).sort()).toEqual(['insert', 'select']);
      for (const method of ['update', 'delete', 'upsert']) {
        expect(table[method]).toBeUndefined();
      }
    });
  });

  // ==========================================================================
  // P6J-F6-B4-B2A -- canonical page read and validated offset persistence
  // ==========================================================================
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
      for (const method of ['rpc', 'storage', 'auth']) {
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
      });

      const row = state.table('source_references')[0].insert as Record<string, unknown>;
      expect(row).toMatchObject({ char_start: 10, char_end: 15, quote_text: 'alpha', locator: null });
      expect(row).not.toHaveProperty('selectedText');
      expect(row).not.toHaveProperty('selected_text');
    });

    it('V: maps the returned exact-span row onto the domain shape', async () => {
      const state = setup({ source_references: { data: insertedSpanRow, error: null } });

      const result = await new SupabaseKnowledgeSourceReferenceWriter(state.client).insertSourceReference({
        targetPadletId: PADLET, sourceDocumentId: DOCUMENT, pageStart: 2, pageEnd: 2,
        quoteText: 'alpha', quoteHash: 'server-hash', charStart: 10, charEnd: 15,
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
      });

      const row = state.table('source_references')[0].insert as Record<string, unknown>;
      expect(row).toMatchObject({ char_start: null, char_end: null, locator: null });
    });
  });
});
