import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '../../domain/core/result';
import {
  createKnowledgeSourceHighlightDeleteHandler,
  createKnowledgeSourceHighlightGetHandler,
  createKnowledgeSourceHighlightPatchHandler,
  createKnowledgeSourceHighlightPostHandler,
} from './knowledgeSourceHighlightRoute';
import type { KnowledgeSourceHighlightSession } from './knowledgeSourceHighlightRoute';

/**
 * PDF-R6K-H2A -- the HTTP edge.
 *
 * The claims worth testing here are about TRUST: board comes from the path,
 * identity from the session, and a body naming a board, an author or a hash
 * reaches nothing. The final section proves the slice changed no renderer.
 */

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const BOARD = '11111111-1111-4111-8111-111111111111';
const DOC = '33333333-3333-4333-8333-333333333333';
const HL = '77777777-7777-4777-8777-777777777777';

const highlight = {
  id: HL, sourceDocumentId: DOC, pageNumber: 1, charStart: 6, charEnd: 10,
  quoteText: 'beta', quoteHash: 'h', color: '#fde68a', createdBy: 'u',
  createdAt: 't', updatedAt: 't', sourceReferenceId: null,
} as unknown as Parameters<typeof ok>[0];

function session(over: Partial<KnowledgeSourceHighlightSession> = {}) {
  return {
    userId: 'session-user',
    listHighlights: vi.fn(async () => ok([highlight])),
    createHighlight: vi.fn(async () => ok(highlight)),
    updateHighlightColor: vi.fn(async () => ok(highlight)),
    deleteHighlight: vi.fn(async () => ok(true as const)),
    ...over,
  } as unknown as KnowledgeSourceHighlightSession;
}

const params = { params: Promise.resolve({ id: BOARD }) };
const itemParams = { params: Promise.resolve({ id: BOARD, highlightId: HL }) };

const post = (body: unknown) =>
  new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) });

const validBody = {
  sourceDocumentId: DOC, pageNumber: 1, charStart: 6, charEnd: 10,
  quoteText: 'beta', color: '#fde68a',
};

describe('highlight route trust boundary', () => {
  it('1. every handler refuses an unauthenticated caller', async () => {
    const deps = { getAuthenticatedSession: async () => null };
    expect((await createKnowledgeSourceHighlightGetHandler(deps)(
      new Request(`http://x/api?documentId=${DOC}`), params,
    )).status).toBe(401);
    expect((await createKnowledgeSourceHighlightPostHandler(deps)(post(validBody), params)).status)
      .toBe(401);
    expect((await createKnowledgeSourceHighlightPatchHandler(deps)(
      post({ color: '#fff' }), itemParams,
    )).status).toBe(401);
    expect((await createKnowledgeSourceHighlightDeleteHandler(deps)(
      new Request('http://x/api', { method: 'DELETE' }), itemParams,
    )).status).toBe(401);
  });

  it('2. board comes from the PATH and identity from the SESSION', async () => {
    const active = session();
    const response = await createKnowledgeSourceHighlightPostHandler({
      getAuthenticatedSession: async () => active,
    })(post({
      ...validBody,
      // All ignored: the handler rebuilds its input field by field.
      boardId: 'attacker-board',
      userId: 'attacker',
      createdBy: 'attacker',
      quoteHash: 'forged',
      id: 'forged-id',
      createdAt: '1999-01-01',
    }), params);

    expect(response.status).toBe(201);
    const passed = (active.createHighlight as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passed.boardId).toBe(BOARD);
    expect(passed.userId).toBe('session-user');
    // Nothing forged survived into the command input.
    expect(Object.keys(passed).sort()).toEqual([
      'boardId', 'charEnd', 'charStart', 'color', 'pageNumber',
      'quoteText', 'sourceDocumentId', 'sourceReferenceId', 'userId',
    ]);
  });

  it('3. a malformed body is a 400 before any command runs', async () => {
    const active = session();
    const deps = { getAuthenticatedSession: async () => active };
    for (const body of [
      { ...validBody, pageNumber: '1' },
      { ...validBody, charStart: null },
      { ...validBody, color: 42 },
      { ...validBody, sourceReferenceId: 7 },
      [],
      'nope',
    ]) {
      expect((await createKnowledgeSourceHighlightPostHandler(deps)(post(body), params)).status)
        .toBe(400);
    }
    expect(active.createHighlight).not.toHaveBeenCalled();
  });

  it('4. PATCH accepts only a colour', async () => {
    const active = session();
    const response = await createKnowledgeSourceHighlightPatchHandler({
      getAuthenticatedSession: async () => active,
    })(post({ color: '#bbf7d0', charStart: 0, sourceDocumentId: 'other', createdBy: 'x' }),
      itemParams);
    expect(response.status).toBe(200);
    const passed = (active.updateHighlightColor as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    // No general row patching: span, document and author are not updatable.
    expect(Object.keys(passed).sort()).toEqual(['boardId', 'color', 'highlightId', 'userId']);
  });

  it('5. domain failures map to stable public copy, never provider detail', async () => {
    const active = session({
      createHighlight: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'permission_denied' as const, message: 'board_collaborators row missing' },
      })),
    });
    const response = await createKnowledgeSourceHighlightPostHandler({
      getAuthenticatedSession: async () => active,
    })(post(validBody), params);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('6. a non-numeric page filter is rejected rather than silently ignored', async () => {
    const active = session();
    const response = await createKnowledgeSourceHighlightGetHandler({
      getAuthenticatedSession: async () => active,
    })(new Request(`http://x/api?documentId=${DOC}&pageNumber=abc`), params);
    expect(response.status).toBe(400);
    expect(active.listHighlights).not.toHaveBeenCalled();
  });
});

describe('H2A changes no rendering and no citation authority', () => {
  const READER = read('components/collabboard/KnowledgeDocumentDetails.tsx');
  const CARD = read('components/collabboard/KnowledgePdfCanvasSurface.tsx');

  it('7. both renderers still paint citation-derived highlights, unchanged', () => {
    // H2A is data and server authority only. The renderer switch is H2B.
    for (const source of [READER, CARD]) {
      expect(source).toContain('knowledgeSourceHighlightSegments');
      // The NEW entity, by its own names. The pre-existing
      // KnowledgeSourceHighlightSpan/Color types are the citation renderer's
      // own and are deliberately not what is being excluded here.
      expect(source).not.toContain('knowledge_source_highlights');
      expect(source).not.toContain('knowledgeSourceHighlightWrite');
      expect(source).not.toContain("knowledge/knowledgeSourceHighlight'");
      expect(source).not.toContain('/highlights');
    }
  });

  it('8. no Trash, no highlight click handler was added', () => {
    expect(CARD).not.toContain('data-knowledge-pdf-highlight-delete');
    expect(READER).not.toContain('data-knowledge-highlight-delete');
  });

  it('9. the citation client is still INSERT-ONLY', () => {
    const write = read('lib/infra/knowledge/knowledgeSourceReferenceWriteAdapters.ts');
    expect(write).toContain('insert(row: SourceReferenceInsertRow): InsertedRowQuery;');
    const code = executable(write);
    expect(code).not.toContain('delete(');
    expect(code).not.toContain('upsert(');
  });

  it('10. the highlight client cannot express a citation or Note write', () => {
    const adapters = executable(read('lib/infra/knowledge/knowledgeSourceHighlightAdapters.ts'));
    // source_references and the board tables appear as READ tables only.
    expect(adapters).toContain("from(table: 'source_references'): ReadTable<ReferenceRow>;");
    expect(adapters).not.toContain('padlets');
    // One writable table, named once in the client interface.
    expect(adapters).toContain("from(table: 'knowledge_source_highlights'): HighlightTable;");
  });

  it('11. the routes use the caller authority, never an admin client', () => {
    const collection = read('app/api/boards/[id]/knowledge/highlights/route.ts');
    const item = read('app/api/boards/[id]/knowledge/highlights/[highlightId]/route.ts');
    expect(collection).toContain('createRouteHandlerClient');
    for (const source of [collection, item]) {
      expect(source).not.toContain('SERVICE_ROLE');
      expect(source).not.toContain('createAdminClient');
      expect(source).not.toContain('service_role');
    }
    // Both paths bind the same session factory, so authority cannot diverge.
    expect(item).toContain("from '../route'");
  });
});
