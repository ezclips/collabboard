import { describe, expect, it, vi } from 'vitest';
import {
  asBoardId,
  asKnowledgeDocumentId,
  asKnowledgeSourceHighlightId,
  asSourceReferenceId,
  asUserId,
} from '../core/ids';
import { ok } from '../core/result';
import {
  knowledgeSourceHighlightSpanReference,
  validateCreateKnowledgeSourceHighlight,
} from './knowledgeSourceHighlight';
import type { KnowledgeSourceHighlight } from './knowledgeSourceHighlight';
import {
  createCreateKnowledgeSourceHighlightCommand,
  createDeleteKnowledgeSourceHighlightCommand,
  createListKnowledgeSourceHighlightsQuery,
  createUpdateKnowledgeSourceHighlightColorCommand,
} from './knowledgeSourceHighlightWrite';
import type { KnowledgeSourceHighlightRepository } from './knowledgeSourceHighlightWrite';
import { resolveKnowledgeSourceSpan } from './knowledgeSourceSpanResolver';

/**
 * PDF-R6K-H2A -- the typed authority for standalone highlights.
 *
 * The security claims are the interesting ones: identity and board come from
 * the route and the session, a document on another board is unreachable, and
 * nothing in the command surface can express a write to a citation or a Note.
 */

const BOARD = asBoardId('11111111-1111-4111-8111-111111111111');
const OTHER_BOARD = asBoardId('22222222-2222-4222-8222-222222222222');
const DOC = asKnowledgeDocumentId('33333333-3333-4333-8333-333333333333');
const OTHER_DOC = asKnowledgeDocumentId('44444444-4444-4444-8444-444444444444');
const USER = asUserId('55555555-5555-4555-8555-555555555555');
const REF = asSourceReferenceId('66666666-6666-4666-8666-666666666666');
const HIGHLIGHT = asKnowledgeSourceHighlightId('77777777-7777-4777-8777-777777777777');

const highlight = (over: Partial<KnowledgeSourceHighlight> = {}): KnowledgeSourceHighlight => ({
  id: HIGHLIGHT,
  sourceDocumentId: DOC,
  pageNumber: 2,
  charStart: 10,
  charEnd: 20,
  quoteText: '0123456789',
  quoteHash: 'hash',
  color: '#fde68a',
  createdBy: USER,
  createdAt: '2026-09-04T00:00:00Z',
  updatedAt: '2026-09-04T00:00:00Z',
  sourceReferenceId: REF,
  ...over,
});

function repository(over: Partial<KnowledgeSourceHighlightRepository> = {}) {
  const base: KnowledgeSourceHighlightRepository = {
    findDocument: vi.fn(async () => ok({ id: DOC, boardId: BOARD })),
    findOriginReference: vi.fn(async () => ok({ id: REF, sourceDocumentId: DOC })),
    findHighlight: vi.fn(async () => ok(highlight())),
    list: vi.fn(async () => ok([highlight()])),
    insert: vi.fn(async () => ok(highlight())),
    updateColor: vi.fn(async () => ok(highlight({ color: '#bbf7d0' }))),
    remove: vi.fn(async () => ok(true as const)),
  };
  return { ...base, ...over };
}

const authorizer = (write = true, read = true) => ({
  canWriteBoard: vi.fn(async () => ok(write)),
  canReadBoard: vi.fn(async () => ok(read)),
});

const hasher = { hashQuoteText: (text: string) => `sha:${text.length}` };

const validCreate = {
  boardId: BOARD,
  userId: USER,
  sourceDocumentId: DOC,
  pageNumber: 2,
  charStart: 10,
  charEnd: 20,
  quoteText: '0123456789',
  color: '#fde68a',
  sourceReferenceId: null,
};

describe('span compatibility', () => {
  it('1. a highlight resolves through the EXISTING resolver, unforked', () => {
    const pageText = 'alpha beta gamma delta';
    const reference = knowledgeSourceHighlightSpanReference({
      pageNumber: 1, charStart: 6, charEnd: 10, quoteText: 'beta',
    });
    // Single page in, single page out -- and the shared resolver does the work.
    expect(reference).toEqual({
      pageStart: 1, pageEnd: 1, quoteText: 'beta', charStart: 6, charEnd: 10,
    });
    const resolved = resolveKnowledgeSourceSpan(reference, 1, pageText);
    expect(resolved.kind).toBe('exact_span');
    if (resolved.kind === 'exact_span') {
      expect(pageText.slice(resolved.start, resolved.end)).toBe('beta');
    }
  });

  it('2. drift recovery still works through the same authority', () => {
    // Offsets moved; the quote is what finds the passage again.
    const resolved = resolveKnowledgeSourceSpan(
      knowledgeSourceHighlightSpanReference({
        pageNumber: 1, charStart: 0, charEnd: 4, quoteText: 'beta',
      }),
      1,
      'xxxxxxx beta yyy',
    );
    expect(resolved.kind).toBe('exact_span');
    if (resolved.kind === 'exact_span') expect(resolved.resolution).toBe('quote_fallback');
  });
});

describe('create validation', () => {
  it('3-6. rejects malformed spans', () => {
    expect(validateCreateKnowledgeSourceHighlight({ ...validCreate, pageNumber: 0 })?.code)
      .toBe('validation');
    expect(validateCreateKnowledgeSourceHighlight({ ...validCreate, charStart: -1 })?.code)
      .toBe('validation');
    // Empty range: a span nobody can see annotates nothing.
    expect(validateCreateKnowledgeSourceHighlight({
      ...validCreate, charStart: 10, charEnd: 10, quoteText: '',
    })?.code).toBe('validation');
    expect(validateCreateKnowledgeSourceHighlight({ ...validCreate, charEnd: 5 })?.code)
      .toBe('validation');
    expect(validateCreateKnowledgeSourceHighlight({ ...validCreate, pageNumber: 1.5 })?.code)
      .toBe('validation');
  });

  it('7. the quote must actually be the passage the offsets cover', () => {
    expect(validateCreateKnowledgeSourceHighlight({ ...validCreate, quoteText: 'short' })?.code)
      .toBe('validation');
    expect(validateCreateKnowledgeSourceHighlight(validCreate)).toBeNull();
  });

  it('8. colour must be the existing hex representation, not a new format', () => {
    for (const color of ['red', 'rgb(1,2,3)', '', '#12345', 'url(x)']) {
      expect(validateCreateKnowledgeSourceHighlight({ ...validCreate, color })?.code)
        .toBe('validation');
    }
    for (const color of ['#fff', '#ffcc00', '#ffcc0080']) {
      expect(validateCreateKnowledgeSourceHighlight({ ...validCreate, color })).toBeNull();
    }
  });
});

describe('create authority', () => {
  it('9. inserts with server-derived author and hash', async () => {
    const repo = repository();
    const create = createCreateKnowledgeSourceHighlightCommand({
      authorizer: authorizer(), repository: repo, hasher,
    });
    const result = await create(validCreate);
    expect(result.ok).toBe(true);
    // quoteHash is produced here, never accepted from a body.
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({
      quoteHash: 'sha:10',
      sourceDocumentId: DOC,
    }));
    // PDF-R6K-H2A-C1: no author is sent at all. `created_by` defaults to
    // auth.uid() in the database and authenticated callers cannot name the
    // column, so authorship is unforgeable rather than merely derived here.
    expect((repo.insert as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .not.toHaveProperty('createdBy');
  });

  it('10. a document on another board is not found, never merely forbidden', async () => {
    const repo = repository({
      findDocument: vi.fn(async () => ok({ id: DOC, boardId: OTHER_BOARD })),
    });
    const create = createCreateKnowledgeSourceHighlightCommand({
      authorizer: authorizer(), repository: repo, hasher,
    });
    const result = await create(validCreate);
    expect(result.ok).toBe(false);
    // not_found, so a caller cannot use the error to probe which ids exist.
    if (!result.ok) expect(result.error.code).toBe('not_found');
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('11. a caller who cannot write the board is refused', async () => {
    const repo = repository();
    const create = createCreateKnowledgeSourceHighlightCommand({
      authorizer: authorizer(false), repository: repo, hasher,
    });
    const result = await create(validCreate);
    if (!result.ok) expect(result.error.code).toBe('permission_denied');
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('12. an origin citation from another document is rejected', async () => {
    const repo = repository({
      findOriginReference: vi.fn(async () => ok({ id: REF, sourceDocumentId: OTHER_DOC })),
    });
    const create = createCreateKnowledgeSourceHighlightCommand({
      authorizer: authorizer(), repository: repo, hasher,
    });
    const result = await create({ ...validCreate, sourceReferenceId: REF });
    expect(result.ok).toBe(false);
    // The FK alone would accept it; a false provenance record is still false.
    if (!result.ok) expect(result.error.code).toBe('validation');
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('13. a standalone highlight needs no citation at all', async () => {
    const repo = repository();
    const create = createCreateKnowledgeSourceHighlightCommand({
      authorizer: authorizer(), repository: repo, hasher,
    });
    const result = await create({ ...validCreate, sourceReferenceId: null });
    expect(result.ok).toBe(true);
    // No Note, no padlet, no citation lookup.
    expect(repo.findOriginReference).not.toHaveBeenCalled();
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ sourceReferenceId: null }));
  });
});

describe('list', () => {
  it('14. reads are member-level, not editor-level', async () => {
    const repo = repository();
    const auth = authorizer(false, true);
    const list = createListKnowledgeSourceHighlightsQuery({ authorizer: auth, repository: repo });
    const result = await list({
      boardId: BOARD, userId: USER, sourceDocumentId: DOC, pageNumber: 2,
    });
    expect(result.ok).toBe(true);
    expect(auth.canReadBoard).toHaveBeenCalled();
    expect(auth.canWriteBoard).not.toHaveBeenCalled();
    expect(repo.list).toHaveBeenCalledWith(DOC, 2);
  });

  it('15. a non-member cannot read', async () => {
    const list = createListKnowledgeSourceHighlightsQuery({
      authorizer: authorizer(false, false), repository: repository(),
    });
    const result = await list({
      boardId: BOARD, userId: USER, sourceDocumentId: DOC, pageNumber: null,
    });
    if (!result.ok) expect(result.error.code).toBe('permission_denied');
  });
});

describe('updateColor and delete', () => {
  it('16. updates only the colour', async () => {
    const repo = repository();
    const update = createUpdateKnowledgeSourceHighlightColorCommand({
      authorizer: authorizer(), repository: repo,
    });
    const result = await update({
      boardId: BOARD, userId: USER, highlightId: HIGHLIGHT, color: '#bbf7d0',
    });
    expect(result.ok).toBe(true);
    expect(repo.updateColor).toHaveBeenCalledWith(HIGHLIGHT, '#bbf7d0');
  });

  it('17. rejects a colour that is not the existing representation', async () => {
    const repo = repository();
    const update = createUpdateKnowledgeSourceHighlightColorCommand({
      authorizer: authorizer(), repository: repo,
    });
    const result = await update({
      boardId: BOARD, userId: USER, highlightId: HIGHLIGHT, color: 'chartreuse',
    });
    if (!result.ok) expect(result.error.code).toBe('validation');
    expect(repo.updateColor).not.toHaveBeenCalled();
  });

  it('18. a highlight reached through the wrong board is not found', async () => {
    const repo = repository({
      findDocument: vi.fn(async () => ok({ id: DOC, boardId: OTHER_BOARD })),
    });
    const remove = createDeleteKnowledgeSourceHighlightCommand({
      authorizer: authorizer(), repository: repo,
    });
    const result = await remove({ boardId: BOARD, userId: USER, highlightId: HIGHLIGHT });
    if (!result.ok) expect(result.error.code).toBe('not_found');
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('19. delete touches the highlight and nothing else', async () => {
    const repo = repository();
    const remove = createDeleteKnowledgeSourceHighlightCommand({
      authorizer: authorizer(), repository: repo,
    });
    const result = await remove({ boardId: BOARD, userId: USER, highlightId: HIGHLIGHT });
    expect(result.ok).toBe(true);
    expect(repo.remove).toHaveBeenCalledWith(HIGHLIGHT);
    // The repository port has no citation, padlet or Note write to call, so
    // "the Note survives" is a property of the type, not of this assertion --
    // which is exactly why the port is shaped this way.
    expect(Object.keys(repo).sort()).toEqual([
      'findDocument', 'findHighlight', 'findOriginReference',
      'insert', 'list', 'remove', 'updateColor',
    ]);
  });

  it('20. a viewer cannot mutate even an existing highlight', async () => {
    const repo = repository();
    const remove = createDeleteKnowledgeSourceHighlightCommand({
      authorizer: authorizer(false), repository: repo,
    });
    const result = await remove({ boardId: BOARD, userId: USER, highlightId: HIGHLIGHT });
    if (!result.ok) expect(result.error.code).toBe('permission_denied');
    expect(repo.remove).not.toHaveBeenCalled();
  });
});
