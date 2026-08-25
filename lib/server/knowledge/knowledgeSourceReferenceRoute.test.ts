import { describe, expect, it, vi } from 'vitest';
import { createKnowledgeSourceReferencePostHandler } from './knowledgeSourceReferenceRoute';
import type { KnowledgeSourceReferenceSession } from './knowledgeSourceReferenceRoute';
import { domainError } from '../../domain/core/errors';
import type { DomainErrorCode } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';
import type { CreateKnowledgeSourceReferenceInput } from '../../domain/knowledge/knowledgeSourceReferenceWrite';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'session-user';
const PADLET_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

const reference = {
  id: 'reference-1',
  targetPadletId: PADLET_ID,
  sourceDocumentId: DOCUMENT_ID,
  pageStart: 2,
  pageEnd: 3,
  quoteText: 'a quoted passage',
  quoteHash: 'server-hash',
  charStart: null,
  charEnd: null,
  locator: null,
  createdAt: '2026-08-24T00:00:00.000Z',
};

function body(overrides: Record<string, unknown> = {}) {
  return {
    targetPadletId: PADLET_ID,
    sourceDocumentId: DOCUMENT_ID,
    pageStart: 2,
    pageEnd: 3,
    quoteText: 'a quoted passage',
    ...overrides,
  };
}

function request(payload: unknown, raw?: string) {
  return new Request('http://localhost/api/boards/x/knowledge/references', {
    method: 'POST',
    body: raw ?? JSON.stringify(payload),
  });
}

function setup(options: {
  session?: KnowledgeSourceReferenceSession | null;
  authThrows?: boolean;
  result?: unknown;
  commandThrows?: boolean;
} = {}) {
  const createSourceReference = vi.fn(async (_input: CreateKnowledgeSourceReferenceInput) => {
    if (options.commandThrows) throw new Error('client exploded');
    return (options.result ?? ok(reference)) as never;
  });
  const session = options.session === undefined
    ? { userId: USER_ID, createSourceReference }
    : options.session;
  const getAuthenticatedSession = vi.fn(async () => {
    if (options.authThrows) throw new Error('cookie store unavailable');
    return session as KnowledgeSourceReferenceSession | null;
  });
  return {
    handler: createKnowledgeSourceReferencePostHandler({ getAuthenticatedSession }),
    createSourceReference,
    getAuthenticatedSession,
  };
}

const context = { params: Promise.resolve({ id: BOARD_ID }) };

async function post(state: ReturnType<typeof setup>, payload: unknown, raw?: string) {
  const response = await state.handler(request(payload, raw), { params: Promise.resolve({ id: BOARD_ID }) });
  return { response, json: await response.json() as Record<string, unknown> };
}

describe('P6J-F4-B source reference write route', () => {
  it('rejects an unauthenticated caller and a failing auth lookup alike', async () => {
    for (const options of [{ session: null }, { authThrows: true }]) {
      const state = setup(options);
      const { response, json } = await post(state, body());
      expect(response.status).toBe(401);
      expect(json).toEqual({ error: 'Unauthorized' });
      expect(state.createSourceReference).not.toHaveBeenCalled();
    }
  });

  it('rejects malformed or structurally invalid bodies without invoking the command', async () => {
    const cases: Array<[string, unknown, string | undefined]> = [
      ['malformed json', undefined, '{not json'],
      ['array root', [], undefined],
      ['null root', null, undefined],
      ['string root', 'nope', undefined],
      ['missing targetPadletId', body({ targetPadletId: undefined }), undefined],
      ['empty targetPadletId', body({ targetPadletId: '' }), undefined],
      ['non-string targetPadletId', body({ targetPadletId: 42 }), undefined],
      ['missing sourceDocumentId', body({ sourceDocumentId: undefined }), undefined],
      ['empty sourceDocumentId', body({ sourceDocumentId: '' }), undefined],
      ['non-string sourceDocumentId', body({ sourceDocumentId: null }), undefined],
      ['string pageStart', body({ pageStart: '2' }), undefined],
      ['missing pageStart', body({ pageStart: undefined }), undefined],
      ['string pageEnd', body({ pageEnd: '3' }), undefined],
      ['missing pageEnd', body({ pageEnd: undefined }), undefined],
      ['numeric quoteText', body({ quoteText: 5 }), undefined],
      ['missing quoteText', body({ quoteText: undefined }), undefined],
    ];
    for (const [label, payload, raw] of cases) {
      const state = setup();
      const { response, json } = await post(state, payload, raw);
      expect(response.status, label).toBe(400);
      expect(json, label).toEqual({ error: 'Invalid source reference' });
      expect(state.createSourceReference, label).not.toHaveBeenCalled();
    }
  });

  it('accepts a null quote structurally and leaves the semantic rules to the domain', async () => {
    const state = setup();

    const { response } = await post(state, body({ quoteText: null }));

    expect(response.status).toBe(201);
    expect(state.createSourceReference.mock.calls[0][0]).toMatchObject({ quoteText: null });
  });

  it('takes board and user identity from the route and session, never the body', async () => {
    const state = setup();
    const hostile = {
      boardId: 'ATTACKER-BOARD',
      userId: 'ATTACKER-USER',
      targetPadletId: PADLET_ID,
      sourceDocumentId: DOCUMENT_ID,
      pageStart: 1,
      pageEnd: 1,
      quoteText: 'quote',
      quoteHash: 'ATTACKER-HASH',
      charStart: 99,
      charEnd: 100,
      locator: { injected: true },
      id: 'ATTACKER-ID',
      createdAt: 'ATTACKER-DATE',
    };

    const { response } = await post(state, hostile);

    expect(response.status).toBe(201);
    const input = state.createSourceReference.mock.calls[0][0] as unknown as Record<string, unknown>;
    // Exactly the ten intended fields. char offsets and selected text became
    // caller input at B4-B2A; identity, hash and locator never can.
    expect(Object.keys(input).sort()).toEqual([
      'boardId', 'charEnd', 'charStart', 'pageEnd', 'pageStart', 'quoteText',
      'selectedText', 'sourceDocumentId', 'targetPadletId', 'userId',
    ]);
    expect(input.boardId).toBe(BOARD_ID);
    expect(input.userId).toBe(USER_ID);
    const serialized = JSON.stringify(input);
    for (const injected of ['ATTACKER-BOARD', 'ATTACKER-USER', 'ATTACKER-HASH', 'ATTACKER-ID', 'ATTACKER-DATE', 'injected']) {
      expect(serialized, injected).not.toContain(injected);
    }
    for (const key of ['quoteHash', 'locator', 'id', 'createdAt']) {
      expect(input).not.toHaveProperty(key);
    }
  });

  it('returns 201 with exactly the public reference shape', async () => {
    const state = setup();

    const { response, json } = await post(state, body());

    expect(response.status).toBe(201);
    expect(Object.keys(json)).toEqual(['reference']);
    expect(json.reference).toEqual(reference);
    expect(Object.keys(json.reference as object).sort()).toEqual([
      'charEnd', 'charStart', 'createdAt', 'id', 'locator', 'pageEnd', 'pageStart',
      'quoteHash', 'quoteText', 'sourceDocumentId', 'targetPadletId',
    ]);
    // V1 guarantees from F4-A survive the boundary.
    expect(json.reference).toMatchObject({ charStart: null, charEnd: null, locator: null });
  });

  it('maps every domain error code to stable public copy', async () => {
    const cases: Array<[DomainErrorCode, number, string]> = [
      ['validation', 400, 'Invalid source reference'],
      ['permission_denied', 403, 'Forbidden'],
      ['not_found', 404, 'Source reference target not found'],
      ['conflict', 409, 'Source reference conflict'],
      ['rate_limited', 429, 'Too many requests'],
      ['quota_exceeded', 403, 'Forbidden'],
      ['unavailable', 503, 'Source references are temporarily unavailable'],
      ['unknown', 500, 'Could not create source reference'],
    ];
    for (const [code, status, error] of cases) {
      const state = setup({
        result: err(domainError(code, `RAW-${code}-DETAIL`, { cause: { message: 'permission denied for table source_references' } })),
      });
      const { response, json } = await post(state, body());
      expect(response.status, code).toBe(status);
      expect(json, code).toEqual({ error });
      // Neither the developer-facing message nor provider detail escapes.
      const serialized = JSON.stringify(json);
      expect(serialized, code).not.toContain('RAW-');
      expect(serialized, code).not.toContain('permission denied');
    }
  });

  it('fails closed with 503 when the command itself throws', async () => {
    const state = setup({ commandThrows: true });

    const { response, json } = await post(state, body());

    expect(response.status).toBe(503);
    expect(json).toEqual({ error: 'Source references are temporarily unavailable' });
    expect(JSON.stringify(json)).not.toContain('client exploded');
  });

  it('reads the board only from the route parameter', async () => {
    const state = setup();

    await state.handler(request(body({ boardId: 'ATTACKER-BOARD' })), context);

    expect((state.createSourceReference.mock.calls[0][0] as unknown as Record<string, unknown>).boardId).toBe(BOARD_ID);
  });

  // ==========================================================================
  // P6J-F6-B4-B2A -- exact-span request fields
  // ==========================================================================

  const commandInput = (state: ReturnType<typeof setup>) =>
    state.createSourceReference.mock.calls[0][0] as unknown as Record<string, unknown>;

  it('Z1: a pre-B4 body still succeeds, with the new fields normalised to null', async () => {
    const state = setup();

    const { response } = await post(state, body());

    expect(response.status).toBe(201);
    expect(commandInput(state)).toMatchObject({ charStart: null, charEnd: null, selectedText: null });
  });

  it('Z2: an exact-span body forwards the offsets and the selected text verbatim', async () => {
    const state = setup();

    const { response } = await post(state, body({
      quoteText: null, charStart: 10, charEnd: 15, selectedText: 'alpha',
    }));

    expect(response.status).toBe(201);
    expect(commandInput(state)).toMatchObject({
      charStart: 10, charEnd: 15, selectedText: 'alpha', quoteText: null,
    });
  });

  it('Z3: explicit nulls are accepted and mean "not supplied"', async () => {
    const state = setup();

    const { response } = await post(state, body({ charStart: null, charEnd: null, selectedText: null }));

    expect(response.status).toBe(201);
    expect(commandInput(state)).toMatchObject({ charStart: null, charEnd: null, selectedText: null });
  });

  it('Z4: wrong-typed new fields are a structural 400 before the command runs', async () => {
    const cases: Record<string, unknown>[] = [
      { charStart: '4' },
      { charEnd: '8' },
      { charStart: {} },
      { charEnd: [] },
      { charStart: true },
      { selectedText: 123 },
      { selectedText: {} },
    ];
    for (const override of cases) {
      const state = setup();

      const { response, json } = await post(state, body(override));

      expect(response.status, JSON.stringify(override)).toBe(400);
      expect(json).toEqual({ error: 'Invalid source reference' });
      expect(state.createSourceReference).not.toHaveBeenCalled();
    }
  });

  it('Z6: an exact-span reference is returned with numeric offsets, page-only with nulls', async () => {
    const span = setup({ result: ok({ ...reference, quoteText: 'alpha', charStart: 10, charEnd: 15 }) });
    const spanResponse = await post(span, body({ quoteText: null, charStart: 10, charEnd: 15, selectedText: 'alpha' }));
    expect(spanResponse.json).toMatchObject({
      reference: { charStart: 10, charEnd: 15, quoteText: 'alpha', locator: null },
    });

    const pageOnly = setup();
    const pageOnlyResponse = await post(pageOnly, body());
    expect(pageOnlyResponse.json).toMatchObject({
      reference: { charStart: null, charEnd: null },
    });
  });
});
