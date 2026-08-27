import fs from 'node:fs';
import path from 'node:path';
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
  region: null,
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
    // Exactly the twelve intended fields. char offsets and selected text became
    // caller input at B4-B2A and the region pair at F9-B1; identity, hash and
    // locator never can.
    expect(Object.keys(input).sort()).toEqual([
      'appliedRotation', 'boardId', 'charEnd', 'charStart', 'pageEnd', 'pageStart',
      'quoteText', 'region', 'selectedText', 'sourceDocumentId', 'targetPadletId', 'userId',
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
      'quoteHash', 'quoteText', 'region', 'sourceDocumentId', 'targetPadletId',
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

/**
 * P6J-F9-B1. The route stays structural: it builds the typed region field and
 * nothing else, so every semantic rule about a rectangle lives in the one
 * domain command. There is no second endpoint and no crop API.
 */
describe('P6J-F9-B1 region payloads', () => {
  const REGION = { x: 0.25, y: 0.1, width: 0.5, height: 0.4 };

  it('forwards a valid region and its applied rotation to the command', async () => {
    const state = setup();

    const { response } = await post(state, body({
      quoteText: null, region: REGION, appliedRotation: 90,
    }));

    expect(response.status).toBe(201);
    const input = state.createSourceReference.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(input.region).toEqual(REGION);
    expect(input.appliedRotation).toBe(90);
  });

  it('rebuilds the rectangle field by field, so nothing rides along inside it', async () => {
    const state = setup();

    await post(state, body({
      quoteText: null,
      appliedRotation: 0,
      region: {
        ...REGION,
        // Storage authority a client might try to smuggle in beside the shape.
        storagePath: 'knowledge/board/document/pages/1.webp',
        bucket: 'knowledge-documents',
        signedUrl: 'https://example.test/signed',
        naturalWidth: 1650,
      },
    }));

    const input = state.createSourceReference.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(Object.keys(input.region as object).sort()).toEqual(['height', 'width', 'x', 'y']);
    const serialized = JSON.stringify(input);
    for (const leaked of ['knowledge-documents', 'signed', 'naturalWidth', 'pages/1.webp']) {
      expect(serialized, leaked).not.toContain(leaked);
    }
  });

  it('keeps pre-B1 bodies valid: an absent region is not a region', async () => {
    const state = setup();

    await post(state, body());
    await post(state, body({ region: null, appliedRotation: null }));

    for (const call of state.createSourceReference.mock.calls) {
      const input = call[0] as unknown as Record<string, unknown>;
      expect(input.region).toBeNull();
      expect(input.appliedRotation).toBeNull();
    }
  });

  it.each([
    ['a partial rectangle', { x: 0.1, y: 0.1, width: 0.2 }],
    ['string members', { x: '0.1', y: '0.1', width: '0.2', height: '0.2' }],
    ['an array', [0.1, 0.1, 0.2, 0.2]],
    ['a number', 4],
  ])('rejects %s structurally with 400, before the command runs', async (_label, region) => {
    const state = setup();
    const { response } = await post(state, body({ quoteText: null, region, appliedRotation: 0 }));
    expect(response.status).toBe(400);
    expect(state.createSourceReference).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric applied rotation structurally', async () => {
    const state = setup();
    const { response } = await post(state, body({ region: REGION, appliedRotation: '90' }));
    expect(response.status).toBe(400);
    expect(state.createSourceReference).not.toHaveBeenCalled();
  });

  it('passes a semantically wrong region to the domain, which owns that verdict', async () => {
    // Structurally a rectangle, semantically out of bounds: the route must not
    // grow a second copy of the rules.
    const state = setup({ result: err(domainError('validation', 'bad region')) });
    const { response, json } = await post(state, body({
      quoteText: null, region: { x: 0.9, y: 0.1, width: 0.5, height: 0.4 }, appliedRotation: 0,
    }));
    expect(state.createSourceReference).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid source reference' });
  });

  it('maps a rotation mismatch and a permission failure through the existing taxonomy', async () => {
    const mismatch = setup({ result: err(domainError('validation', 'rotation mismatch')) });
    expect((await post(mismatch, body({ region: REGION, appliedRotation: 0 }))).response.status).toBe(400);

    const denied = setup({ result: err(domainError('permission_denied', 'no write')) });
    const forbidden = await post(denied, body({ region: REGION, appliedRotation: 0 }));
    expect(forbidden.response.status).toBe(403);
    expect(forbidden.json).toEqual({ error: 'Forbidden' });

    const missing = setup({ result: err(domainError('not_found', 'cross board')) });
    expect((await post(missing, body({ region: REGION, appliedRotation: 0 }))).response.status).toBe(404);
  });

  it('returns the region on the public reference and still exposes no storage authority', async () => {
    const state = setup({
      result: ok({ ...reference, quoteText: null, quoteHash: null, region: REGION }),
    });

    const { json } = await post(state, body({ region: REGION, appliedRotation: 0 }));

    const published = (json as { reference: Record<string, unknown> }).reference;
    expect(published.region).toEqual(REGION);
    expect(Object.keys(published).sort()).toEqual([
      'charEnd', 'charStart', 'createdAt', 'id', 'locator', 'pageEnd', 'pageStart',
      'quoteHash', 'quoteText', 'region', 'sourceDocumentId', 'targetPadletId',
    ]);
  });

  it('adds no second endpoint and no client-controlled crop surface', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/server/knowledge/knowledgeSourceReferenceRoute.ts'), 'utf8');
    for (const forbidden of [
      'crop', 'storagePath', 'storage_path', 'bucket', 'createSignedUrl',
      'naturalWidth', 'naturalHeight', '.webp',
    ]) {
      expect(source, `the route must not mention ${forbidden}`).not.toContain(forbidden);
    }
    // One POST handler, and the region reaches the domain through it alone.
    expect(source.match(/export function create/g) ?? []).toHaveLength(1);
  });
});
