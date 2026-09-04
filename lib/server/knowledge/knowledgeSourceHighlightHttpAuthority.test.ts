import { describe, expect, it, vi } from 'vitest';
import {
  asBoardId,
  asKnowledgeDocumentId,
  asKnowledgeSourceHighlightId,
  asUserId,
} from '../../domain/core/ids';
import { ok } from '../../domain/core/result';
import {
  createDeleteKnowledgeSourceHighlightCommand,
  createUpdateKnowledgeSourceHighlightColorCommand,
} from '../../domain/knowledge/knowledgeSourceHighlightWrite';
import type { KnowledgeSourceHighlightRepository }
  from '../../domain/knowledge/knowledgeSourceHighlightWrite';
import type { KnowledgeSourceHighlight }
  from '../../domain/knowledge/knowledgeSourceHighlight';
import {
  createKnowledgeSourceHighlightDeleteHandler,
  createKnowledgeSourceHighlightPatchHandler,
} from './knowledgeSourceHighlightRoute';
import type { KnowledgeSourceHighlightSession } from './knowledgeSourceHighlightRoute';

/**
 * PDF-R6K-H2A-C1 Part D -- the route tells the truth about refusals.
 *
 * The security review noted that a viewer's raw UPDATE/DELETE simply matches no
 * rows under RLS. If the HTTP layer merely forwarded that, an unauthorized
 * caller would get 200 and believe their change landed. These wire the REAL
 * domain commands to a repository that models each caller, so the assertions
 * are about the actual authorization path rather than a stubbed answer.
 */

const BOARD = asBoardId('11111111-1111-4111-8111-111111111111');
const OTHER_BOARD = asBoardId('22222222-2222-4222-8222-222222222222');
const DOC = asKnowledgeDocumentId('33333333-3333-4333-8333-333333333333');
const HL = '77777777-7777-4777-8777-777777777777';

const highlight: KnowledgeSourceHighlight = {
  id: asKnowledgeSourceHighlightId(HL),
  sourceDocumentId: DOC,
  pageNumber: 1,
  charStart: 6,
  charEnd: 10,
  quoteText: 'beta',
  quoteHash: 'h',
  color: '#fde68a',
  createdBy: asUserId('99999999-9999-4999-8999-999999999999'),
  createdAt: 't',
  updatedAt: 't',
  sourceReferenceId: null,
};

/**
 * `canWrite` false models a viewer or commenter: RLS lets them SELECT the row,
 * so the lookup succeeds and only the write check can refuse them.
 * `visible` false models a stranger or a wrong-board id, where RLS hides the
 * row entirely and the lookup itself comes back empty.
 */
function wire(options: { canWrite: boolean; visible?: boolean; boardOfDocument?: typeof BOARD }) {
  const repository = {
    findDocument: vi.fn(async () => ok({ id: DOC, boardId: options.boardOfDocument ?? BOARD })),
    findOriginReference: vi.fn(async () => ok(null)),
    findHighlight: vi.fn(async () => ok(options.visible === false ? null : highlight)),
    list: vi.fn(async () => ok([])),
    insert: vi.fn(async () => ok(highlight)),
    updateColor: vi.fn(async () => ok({ ...highlight, color: '#bbf7d0' })),
    remove: vi.fn(async () => ok(true as const)),
  } satisfies KnowledgeSourceHighlightRepository;

  const authorizer = {
    canWriteBoard: vi.fn(async () => ok(options.canWrite)),
    canReadBoard: vi.fn(async () => ok(true)),
  };

  const session = {
    userId: 'session-user',
    listHighlights: vi.fn(async () => ok([])),
    createHighlight: vi.fn(async () => ok(highlight)),
    updateHighlightColor: createUpdateKnowledgeSourceHighlightColorCommand({ authorizer, repository }),
    deleteHighlight: createDeleteKnowledgeSourceHighlightCommand({ authorizer, repository }),
  } as unknown as KnowledgeSourceHighlightSession;

  return { session, repository };
}

const itemContext = { params: Promise.resolve({ id: String(BOARD), highlightId: HL }) };
const patchRequest = () =>
  new Request('http://x/api', { method: 'PATCH', body: JSON.stringify({ color: '#bbf7d0' }) });
const deleteRequest = () => new Request('http://x/api', { method: 'DELETE' });

const patch = (session: KnowledgeSourceHighlightSession) =>
  createKnowledgeSourceHighlightPatchHandler({ getAuthenticatedSession: async () => session })(
    patchRequest(), itemContext,
  );
const remove = (session: KnowledgeSourceHighlightSession) =>
  createKnowledgeSourceHighlightDeleteHandler({ getAuthenticatedSession: async () => session })(
    deleteRequest(), itemContext,
  );

describe('PDF-R6K-H2A-C1 truthful HTTP refusals', () => {
  it('H1. an authorized editor gets a real success', async () => {
    const { session, repository } = wire({ canWrite: true });
    const response = await patch(session);
    expect(response.status).toBe(200);
    expect((await response.json()).highlight.color).toBe('#bbf7d0');
    expect(repository.updateColor).toHaveBeenCalledOnce();
  });

  it('H2. a viewer PATCH is refused, not silently accepted', async () => {
    const { session, repository } = wire({ canWrite: false });
    const response = await patch(session);
    expect(response.status, 'never 200 for a change that did not happen').toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    // The refusal happens BEFORE the database is asked to change anything, so
    // it can never depend on how many rows RLS happened to match.
    expect(repository.updateColor).not.toHaveBeenCalled();
  });

  it('H3-H4. viewer and commenter DELETE are refused the same way', async () => {
    const { session, repository } = wire({ canWrite: false });
    const response = await remove(session);
    expect(response.status).toBe(403);
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('H5. a highlight that does not exist is a not-found, not a success', async () => {
    const { session, repository } = wire({ canWrite: true, visible: false });
    for (const response of [await patch(session), await remove(session)]) {
      expect(response.status).toBe(404);
    }
    expect(repository.updateColor).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('H6. a highlight on another board is not-found, so no IDOR and no existence leak', async () => {
    // The row is readable to this caller, but its document belongs to a board
    // the route was not called for. 404 rather than 403 on purpose: 403 would
    // confirm the id exists to someone who has no business knowing.
    const { session, repository } = wire({ canWrite: true, boardOfDocument: OTHER_BOARD });
    const response = await remove(session);
    expect(response.status).toBe(404);
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('the item route never reports success without a mutation', async () => {
    // The whole property in one place: for every refused caller, the status is
    // an explicit refusal AND the repository was never asked to write.
    for (const options of [
      { canWrite: false },
      { canWrite: true, visible: false },
      { canWrite: true, boardOfDocument: OTHER_BOARD },
    ]) {
      const { session, repository } = wire(options);
      for (const response of [await patch(session), await remove(session)]) {
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
      expect(repository.updateColor).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    }
  });
});
