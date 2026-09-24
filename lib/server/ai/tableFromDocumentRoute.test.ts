import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, err } from '@/lib/domain/core/result';
import { domainError } from '@/lib/domain/core/errors';

/**
 * BUILD A TABLE FROM A DOCUMENT -- the route contract.
 *
 * The route reads a board document through the caller's client (mocked at the
 * reader seam here) and writes nothing, so these tests are about its own
 * properties: the session gate, the rate limit, the board check, how reader and
 * provider failures map, and that the model call uses the Source AI role.
 */

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  canReadBoardKnowledge: vi.fn(),
  readTableSourceText: vi.fn(),
  resolveAIModelForRole: vi.fn(),
  generateText: vi.fn(),
  createAIRolePreferenceRepository: vi.fn(() => ({})),
  createAIProviderCredentialRepository: vi.fn(() => ({})),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/server/knowledge/knowledgeBoardReadAuthorization', () => ({
  canReadBoardKnowledge: mocks.canReadBoardKnowledge,
}));
vi.mock('@/lib/server/ai/tableFromDocumentSource', () => ({
  readTableSourceText: mocks.readTableSourceText,
}));
vi.mock('@/lib/server/ai/resolveAIModelForRole', () => ({
  resolveAIModelForRole: mocks.resolveAIModelForRole,
}));
vi.mock('@/lib/server/ai/providers/registry', () => ({
  getAIProviderAdapter: () => ({
    provider: 'deepseek',
    carriesImages: false,
    generateText: mocks.generateText,
  }),
}));
vi.mock('@/lib/infra/settings/aiRolePreferenceRepository', () => ({
  createAIRolePreferenceRepository: mocks.createAIRolePreferenceRepository,
}));
vi.mock('@/lib/infra/settings/aiProviderCredentialRepository', () => ({
  createAIProviderCredentialRepository: mocks.createAIProviderCredentialRepository,
}));

const USER_ID = 'user-1';
const BOARD = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';

type RouteModule = typeof import('../../../app/api/boards/[id]/ai/table-from-document/route');
let route: RouteModule;
let AIProviderError: typeof import('@/lib/server/ai/providers/errors').AIProviderError;

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const post = (body: unknown) => route.POST(
  new NextRequest(`http://localhost/api/boards/${BOARD}/ai/table-from-document`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id: BOARD }) },
);

const base = (over: Record<string, unknown> = {}) => ({
  documentId: DOC,
  request: 'every part with its number and price',
  ...over,
});

const VALID_ANSWER = JSON.stringify({
  message: 'A parts list.',
  columns: ['Part', 'Number', 'Price'],
  rows: [['Brake pad', 'BR-01', '45 L']],
});

const sourceOk = () => ok({
  filename: 'manual.pdf',
  kind: 'pdf' as const,
  text: '[page 1]\nsome text',
  coverage: { pagesFrom: 1, pagesTo: 1, pageCount: 64, truncated: false },
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  session();
  mocks.canReadBoardKnowledge.mockResolvedValue(true);
  mocks.readTableSourceText.mockResolvedValue(sourceOk());
  mocks.resolveAIModelForRole.mockResolvedValue({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'k' });
  mocks.generateText.mockResolvedValue(VALID_ANSWER);
  ({ AIProviderError } = await import('@/lib/server/ai/providers/errors'));
  route = await import('../../../app/api/boards/[id]/ai/table-from-document/route');
});

describe('table-from-document: auth and access', () => {
  it('401 without a session, and nothing else runs', async () => {
    session(null);
    expect((await post(base())).status).toBe(401);
    expect(mocks.readTableSourceText).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('403 when the board is not readable, and neither reader nor model runs', async () => {
    mocks.canReadBoardKnowledge.mockResolvedValue(false);
    expect((await post(base())).status).toBe(403);
    expect(mocks.readTableSourceText).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('503 when the board check throws', async () => {
    mocks.canReadBoardKnowledge.mockRejectedValue(new Error('boom'));
    expect((await post(base())).status).toBe(503);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('the 6th call in a minute is 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await post(base())).status).toBe(200);
    }
    expect((await post(base())).status).toBe(429);
  });
});

describe('table-from-document: request contract', () => {
  it('400 when only one page field is given', async () => {
    expect((await post(base({ pageFrom: 1 }))).status).toBe(400);
    expect((await post(base({ pageTo: 3 }))).status).toBe(400);
  });

  it('400 for a request over 300 characters', async () => {
    expect((await post(base({ request: 'x'.repeat(301) }))).status).toBe(400);
  });

  it('400 for a non-uuid documentId', async () => {
    expect((await post(base({ documentId: 'nope' }))).status).toBe(400);
  });

  it('400 for an unknown top-level key', async () => {
    expect((await post(base({ extra: true }))).status).toBe(400);
  });
});

describe('table-from-document: source errors', () => {
  const mapped = [
    ['not_found', 'not_found' as const, 404, 'This document is not available.'],
    ['conflict', 'conflict' as const, 409, 'This document is still being processed.'],
    ['validation', 'validation' as const, 400, 'The page range is not valid.'],
  ] as const;

  for (const [name, code, status, message] of mapped) {
    it(`${name} maps to ${status} with its text`, async () => {
      mocks.readTableSourceText.mockResolvedValue(err(domainError(code, 'x')));
      const response = await post(base());
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: message });
      expect(mocks.generateText).not.toHaveBeenCalled();
    });
  }
});

describe('table-from-document: the model call and the answer', () => {
  it('uses the Source AI role, thinking off, and an 8,000-token budget', async () => {
    await post(base());
    expect(mocks.resolveAIModelForRole.mock.calls[0].slice(0, 2)).toEqual([USER_ID, 'source-ai']);
    const input = mocks.generateText.mock.calls[0][0] as Record<string, unknown>;
    expect(input.reasoning).toBe('off');
    expect(input.maxTokens).toBe(8000);
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it('the user message is the exact JSON', async () => {
    await post(base());
    const input = mocks.generateText.mock.calls[0][0] as { user: string };
    expect(input.user).toBe(JSON.stringify({
      request: 'every part with its number and price',
      documentName: 'manual.pdf',
      truncated: false,
      text: '[page 1]\nsome text',
    }));
  });

  it('a valid answer gives { table, source }', async () => {
    const response = await post(base());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.table.columns).toEqual(['Part', 'Number', 'Price']);
    expect(body.source).toMatchObject({ filename: 'manual.pdf', kind: 'pdf' });
  });

  it('prose gives { table: null } with a 200 and the source', async () => {
    mocks.generateText.mockResolvedValue('I cannot help with that.');
    const response = await post(base());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.table).toBeNull();
    expect(body.source.filename).toBe('manual.pdf');
  });

  it('passes the page range to the reader', async () => {
    await post(base({ pageFrom: 3, pageTo: 12 }));
    expect(mocks.readTableSourceText.mock.calls[0].slice(1)).toEqual([BOARD, DOC, { from: 3, to: 12 }]);
  });

  it('a provider failure maps to the shared provider status', async () => {
    mocks.generateText.mockRejectedValue(new AIProviderError('rate_limited', { provider: 'deepseek' }));
    const response = await post(base());
    expect(response.status).toBe(429);
    expect((await response.json()).category).toBe('rate_limited');
  });

  it('a non-normalized failure is a generic 502', async () => {
    mocks.generateText.mockRejectedValue(new Error('SECRET'));
    const response = await post(base());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'AI request failed.' });
  });
});
