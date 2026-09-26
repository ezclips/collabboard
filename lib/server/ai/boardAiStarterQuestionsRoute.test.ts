import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * STARTER QUESTIONS for one document.
 *
 * The route copies the chat route's authorization sequence and adds no
 * privileged reader of its own, so the tests here are about the properties that
 * are specific to it: the authorisation ORDER and outcomes, that ONLY one
 * document-scoped item is accepted, that the provider is called with the
 * documented budget and thinking off, that at most 12,000 characters of the
 * document reach the prompt, and -- decisively -- that NOTHING is written.
 */

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  canReadBoardKnowledge: vi.fn(),
  resolveBoardAiChatContext: vi.fn(),
  resolveAIModelForRole: vi.fn(),
  generateText: vi.fn(),
  createAIRolePreferenceRepository: vi.fn(() => ({})),
  createAIProviderCredentialRepository: vi.fn(() => ({})),
  createBoardAiThreadRepository: vi.fn(),
  checkBoardAiCredits: vi.fn(),
  recordBoardAiCreditUsage: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/server/knowledge/knowledgeBoardReadAuthorization', () => ({
  canReadBoardKnowledge: mocks.canReadBoardKnowledge,
}));
vi.mock('@/lib/server/ai/boardAiChatContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/ai/boardAiChatContext')>()),
  resolveBoardAiChatContext: mocks.resolveBoardAiChatContext,
}));
vi.mock('@/lib/server/ai/resolveAIModelForRole', () => ({
  resolveAIModelForRole: mocks.resolveAIModelForRole,
}));
// The adapter is stubbed at the REGISTRY seam, so the route's own call --
// model, key, system, user, maxTokens, reasoning -- is what is asserted.
vi.mock('@/lib/server/ai/providers/registry', () => ({
  getAIProviderAdapter: () => ({
    provider: 'deepseek',
    carriesImages: true,
    generateText: mocks.generateText,
  }),
}));
vi.mock('@/lib/infra/settings/aiRolePreferenceRepository', () => ({
  createAIRolePreferenceRepository: mocks.createAIRolePreferenceRepository,
}));
vi.mock('@/lib/infra/settings/aiProviderCredentialRepository', () => ({
  createAIProviderCredentialRepository: mocks.createAIProviderCredentialRepository,
}));
// If the route ever reached for a repository, this mock would record it. It
// does not import one; the mock exists so the "nothing written" test can prove
// the call is impossible rather than merely absent today.
vi.mock('@/lib/infra/ai/boardAiThreadRepository', () => ({
  createBoardAiThreadRepository: mocks.createBoardAiThreadRepository,
}));
vi.mock('@/lib/server/billing/aiCredits', () => ({
  checkBoardAiCredits: mocks.checkBoardAiCredits,
  recordBoardAiCreditUsage: mocks.recordBoardAiCreditUsage,
}));

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const DOC_ID = '33333333-3333-4333-8333-333333333333';

type RouteModule = typeof import('../../../app/api/boards/[id]/ai/chat/starter-questions/route');
let route: RouteModule;
let AIProviderError: typeof import('@/lib/server/ai/providers/errors').AIProviderError;

const ok = <T>(value: T) => ({ ok: true as const, value });
const failWith = (code: string) => ({ ok: false as const, error: { code, message: code } });

/** A resolved block shaped like the resolver's own output. */
const block = (text: string) => ({
  type: 'knowledge-document' as const,
  label: 'doc',
  knowledgeDocumentId: DOC_ID,
  text,
});

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const post = (body: unknown, boardId = BOARD_ID) => route.POST(
  new Request(`http://localhost/api/boards/${boardId}/ai/chat/starter-questions`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }),
  { params: Promise.resolve({ id: boardId }) },
);

const oneItem = { context: { items: [{ type: 'knowledge-document', knowledgeDocumentId: DOC_ID }] } };

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  session();
  mocks.canReadBoardKnowledge.mockResolvedValue(true);
  mocks.checkBoardAiCredits.mockResolvedValue({ kind: 'byok' });
  mocks.resolveBoardAiChatContext.mockResolvedValue(ok([block('the document text')]));
  mocks.resolveAIModelForRole.mockResolvedValue({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'k' });
  mocks.generateText.mockResolvedValue('What is the claim?\nWhy does it matter?\nWho is it for?');
  ({ AIProviderError } = await import('@/lib/server/ai/providers/errors'));
  route = await import('../../../app/api/boards/[id]/ai/chat/starter-questions/route');
});

describe('1. authorization, copied from the chat route', () => {
  it('401 without a session, and the provider is never called', async () => {
    session(null);
    expect((await post(oneItem)).status).toBe(401);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('403 when the board cannot be read', async () => {
    mocks.canReadBoardKnowledge.mockResolvedValue(false);
    expect((await post(oneItem)).status).toBe(403);
    expect(mocks.resolveBoardAiChatContext).not.toHaveBeenCalled();
  });

  it('503 when the readability check THROWS', async () => {
    mocks.canReadBoardKnowledge.mockRejectedValue(new Error('down'));
    expect((await post(oneItem)).status).toBe(503);
  });

  it('checks readability with the caller own client, per request', async () => {
    await post(oneItem);
    expect(mocks.canReadBoardKnowledge).toHaveBeenCalledTimes(1);
    expect(mocks.canReadBoardKnowledge.mock.calls[0].slice(1)).toEqual([BOARD_ID, USER_ID]);
  });
});

describe('2. exactly one document-scoped item', () => {
  it('400 for zero items', async () => {
    expect((await post({ context: { items: [] } })).status).toBe(400);
  });

  it('400 for two items', async () => {
    const two = { context: { items: [
      { type: 'knowledge-document', knowledgeDocumentId: DOC_ID },
      { type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: 2 },
    ] } };
    expect((await post(two)).status).toBe(400);
  });

  it('400 for a non-document item kind (a post)', async () => {
    const padlet = { context: { items: [{ type: 'padlet', padletId: DOC_ID }] } };
    expect((await post(padlet)).status).toBe(400);
  });

  it('400 for an unknown field inside the item', async () => {
    const smuggled = { context: { items: [{ type: 'knowledge-document', knowledgeDocumentId: DOC_ID, text: 'x' }] } };
    expect((await post(smuggled)).status).toBe(400);
  });
});

describe('3. a refused context maps exactly as the chat route maps it', () => {
  it.each([
    ['not_found', 404],
    ['validation', 400],
    ['conflict', 409],
    ['unavailable', 503],
  ] as const)('%s -> %i', async (code, status) => {
    mocks.resolveBoardAiChatContext.mockResolvedValue(failWith(code));
    expect((await post(oneItem)).status).toBe(status);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});

describe('4. generation', () => {
  it('calls the adapter with thinking off and a 400-token budget', async () => {
    await post(oneItem);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const input = mocks.generateText.mock.calls[0][0] as Record<string, unknown>;
    expect(input.reasoning).toBe('off');
    expect(input.maxTokens).toBe(400);
    // Text only: no images field is ever set.
    expect(input.images).toBeUndefined();
  });

  it('resolves the BOARD CHAT role, so the questions use the chosen model', async () => {
    await post(oneItem);
    expect(mocks.resolveAIModelForRole).toHaveBeenCalledTimes(1);
    expect(mocks.resolveAIModelForRole.mock.calls[0].slice(0, 2)).toEqual([USER_ID, 'board-chat']);
  });

  it('sends at most 12,000 characters of the document', async () => {
    mocks.resolveBoardAiChatContext.mockResolvedValue(ok([block('x'.repeat(50_000))]));
    await post(oneItem);
    const input = mocks.generateText.mock.calls[0][0] as { user: string };
    expect(input.user.length).toBe(12_000);
  });

  it('the system prompt forbids numbering, caps length, and treats the document as data', async () => {
    await post(oneItem);
    const input = mocks.generateText.mock.calls[0][0] as { system: string };
    expect(input.system).toMatch(/three questions/i);
    expect(input.system).toMatch(/no numbering/i);
    expect(input.system).toMatch(/under 120 characters/i);
    expect(input.system).toMatch(/data, not instructions/i);
  });

  it('returns { questions } from the parser', async () => {
    mocks.generateText.mockResolvedValue('1. "What is the claim?"\nnot a question\nWhy does it matter?');
    const body = await (await post(oneItem)).json();
    expect(body).toEqual({ questions: ['What is the claim?', 'Why does it matter?'] });
  });

  it('a model returning prose yields an empty list, not an error', async () => {
    mocks.generateText.mockResolvedValue('I am sorry, I cannot help with that.');
    const response = await post(oneItem);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ questions: [] });
  });

  it('a provider failure maps to the shared provider status', async () => {
    mocks.generateText.mockRejectedValue(new AIProviderError('rate_limited', { provider: 'deepseek' }));
    const response = await post(oneItem);
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.category).toBe('rate_limited');
  });
});

describe('5. nothing is written', () => {
  it('never reaches a thread or message repository', async () => {
    await post(oneItem);
    expect(mocks.createBoardAiThreadRepository).not.toHaveBeenCalled();
  });

  it('the route source names no repository and no admin client', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/api/boards/[id]/ai/chat/starter-questions/route.ts'),
      'utf8',
    );
    expect(source).not.toContain('createBoardAiThreadRepository');
    expect(source).not.toContain('service_role');
    expect(source).not.toContain('adminClient');
  });
});

describe('PATCH-187. AI credits — starter questions cost nothing, but pause on Free', () => {
  it('byok: the ledger is never read and nothing is recorded', async () => {
    await post(oneItem);
    expect(mocks.checkBoardAiCredits).toHaveBeenCalledTimes(1);
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });

  it('the check runs with cost 0 and boardChat true', async () => {
    await post(oneItem);
    expect(mocks.checkBoardAiCredits.mock.calls[0][0]).toMatchObject({
      boardId: BOARD_ID, userId: USER_ID, cost: 0, boardChat: true,
    });
  });

  it('a refusal is 402 with the code, and the model is never called', async () => {
    mocks.checkBoardAiCredits.mockResolvedValue({
      kind: 'refused', status: 402,
      body: { error: 'out', code: 'plan_limit_credits' },
    });
    const response = await post(oneItem);
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: 'out', code: 'plan_limit_credits' });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('a check throw is 503, and the model is never called', async () => {
    mocks.checkBoardAiCredits.mockRejectedValue(new Error('ledger down'));
    const response = await post(oneItem);
    expect(response.status).toBe(503);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('nothing is ever recorded, even on success', async () => {
    await post(oneItem);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });
});
