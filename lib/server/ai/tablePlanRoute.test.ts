import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EDIT A TABLE WITH AI -- the route contract.
 *
 * The route reads no board and writes nothing, so these tests are about its own
 * properties: the session gate, the per-USER rate limit, the request contract
 * (command length, sample-row shape, the 20-row cap), that the user's Edit &
 * Rewrite model runs with thinking off and a 1,500-token budget, that the user
 * message is exactly the body JSON, that the system prompt carries the actions
 * prompt, and how provider failures and unusable answers are answered.
 *
 * The adapter is stubbed at the REGISTRY seam, so the route's own call is what
 * is asserted. No test reaches a network.
 */

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  resolveAIModelForRole: vi.fn(),
  generateText: vi.fn(),
  createAIRolePreferenceRepository: vi.fn(() => ({})),
  createAIProviderCredentialRepository: vi.fn(() => ({})),
  checkAiActionCredits: vi.fn(),
  recordBoardAiCreditUsage: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
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
vi.mock('@/lib/server/billing/aiCredits', () => ({
  checkAiActionCredits: mocks.checkAiActionCredits,
  recordBoardAiCreditUsage: mocks.recordBoardAiCreditUsage,
  allowByokFor: (d: { kind: string }) => d.kind === 'byok',
}));

const USER_ID = 'user-1';

type RouteModule = typeof import('../../../app/api/ai/table-plan/route');
let route: RouteModule;
let AIProviderError: typeof import('@/lib/server/ai/providers/errors').AIProviderError;

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const post = (body: unknown) => route.POST(new NextRequest('http://localhost/api/ai/table-plan', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}));

const base = (over: Record<string, unknown> = {}) => ({
  command: 'sort by fuel tank, largest first',
  columns: ['Brand', 'Fuel tank'],
  sampleRows: [['Toyota', '50 L'], ['Ford', '45 L']],
  rowCount: 2,
  ...over,
});

const VALID_ANSWER = JSON.stringify({
  message: 'Sorted.',
  steps: [{ action: 'sortRows', column: 'Fuel tank', direction: 'desc' }],
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  session();
  mocks.resolveAIModelForRole.mockResolvedValue({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'k' });
  mocks.generateText.mockResolvedValue(VALID_ANSWER);
  // PATCH-188. Default: byok, so the ledger is never read and nothing records.
  mocks.checkAiActionCredits.mockResolvedValue({ kind: 'byok' });
  mocks.recordBoardAiCreditUsage.mockResolvedValue(undefined);
  ({ AIProviderError } = await import('@/lib/server/ai/providers/errors'));
  route = await import('../../../app/api/ai/table-plan/route');
});

describe('table-plan: auth and rate limit', () => {
  it('401 without a session, and the provider is never called', async () => {
    session(null);
    expect((await post(base())).status).toBe(401);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('the 11th request in the window is rejected with 429', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await post(base())).status).toBe(200);
    }
    expect((await post(base())).status).toBe(429);
  });
});

describe('table-plan: request contract', () => {
  it('400 for a command over 300 characters', async () => {
    expect((await post(base({ command: 'x'.repeat(301) }))).status).toBe(400);
  });

  it('400 for a sample row whose length differs from columns', async () => {
    expect((await post(base({ sampleRows: [['only-one']] }))).status).toBe(400);
  });

  it('400 for 21 sample rows', async () => {
    const rows = Array.from({ length: 21 }, () => ['a', 'b']);
    expect((await post(base({ sampleRows: rows }))).status).toBe(400);
  });

  it('400 for an unknown top-level key', async () => {
    expect((await post(base({ extra: true }))).status).toBe(400);
  });

  it('400 for a negative rowCount', async () => {
    expect((await post(base({ rowCount: -1 }))).status).toBe(400);
  });
});

describe('table-plan: generation', () => {
  it('resolves the user Edit & Rewrite role', async () => {
    await post(base());
    expect(mocks.resolveAIModelForRole).toHaveBeenCalledTimes(1);
    expect(mocks.resolveAIModelForRole.mock.calls[0].slice(0, 2)).toEqual([USER_ID, 'edit']);
  });

  it('calls the adapter with thinking off and a 1,500-token budget', async () => {
    await post(base());
    const input = mocks.generateText.mock.calls[0][0] as Record<string, unknown>;
    expect(input.reasoning).toBe('off');
    expect(input.maxTokens).toBe(1500);
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it('the user message is exactly the body JSON', async () => {
    const sent = base();
    await post(sent);
    const input = mocks.generateText.mock.calls[0][0] as { user: string };
    expect(input.user).toBe(JSON.stringify(sent));
  });

  it('the system prompt carries the actions prompt', async () => {
    const { TABLE_PLAN_ACTIONS_PROMPT } = await import('@/lib/domain/ai/tablePlan');
    await post(base());
    const input = mocks.generateText.mock.calls[0][0] as { system: string };
    expect(input.system).toContain(TABLE_PLAN_ACTIONS_PROMPT);
    expect(input.system).toMatch(/data, not instructions/i);
  });

  it('a valid answer gives { plan }', async () => {
    const response = await post(base());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan.message).toBe('Sorted.');
    expect(body.plan.steps).toHaveLength(1);
  });

  it('prose gives { plan: null } with a 200', async () => {
    mocks.generateText.mockResolvedValue('I am sorry, I cannot help with that.');
    const response = await post(base());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: null });
  });

  it('a provider failure maps to the shared provider status', async () => {
    mocks.generateText.mockRejectedValue(new AIProviderError('rate_limited', { provider: 'deepseek' }));
    const response = await post(base());
    expect(response.status).toBe(429);
    expect((await response.json()).category).toBe('rate_limited');
  });

  it('a non-normalized failure is a generic 502', async () => {
    mocks.generateText.mockRejectedValue(new Error('SECRET_PROVIDER_BODY'));
    const response = await post(base());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'AI request failed.' });
  });
});

describe('table-plan PATCH-188: AI credits', () => {
  const BOARD = '11111111-1111-4111-8111-111111111111';
  const PLAN = { workspaceId: 'w', planId: 'pro', limits: { monthlyAiCredits: 500, welcomeAiCredits: 0 }, subscriptionPeriod: null };
  const BALANCE = { allowance: 500, allowanceUsed: 0, grantTotal: 0, grantUsed: 0, remaining: 500, period: { start: new Date(), end: new Date() } };
  const allowed = () => ({ kind: 'allowed', plan: PLAN, balance: BALANCE, charge: true });

  it('byok without boardId runs as today, and nothing is recorded', async () => {
    await post(base());
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });

  it('managed without boardId is 402 plan_limit_no_board', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'refused', status: 402, body: { error: 'no board', code: 'plan_limit_no_board' } });
    const response = await post(base());
    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe('plan_limit_no_board');
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('managed on an unreadable board is 403', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'forbidden' });
    expect((await post(base({ boardId: BOARD }))).status).toBe(403);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('managed with credits runs and records one table_plan credit', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    await post(base({ boardId: BOARD }));
    expect(mocks.recordBoardAiCreditUsage.mock.calls[0][0]).toMatchObject({ feature: 'table_plan', credits: 1 });
  });

  it('PATCH-190: a configured-byok user on a Pro board runs managed, allowByok false, and is charged', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    const response = await post(base({ boardId: BOARD }));
    expect(response.status).toBe(200);
    expect(mocks.resolveAIModelForRole.mock.calls[0][3]).toEqual({ allowByok: false });
    expect(mocks.recordBoardAiCreditUsage).toHaveBeenCalledTimes(1);
  });

  it('a refused decision is 402 and the model is never called', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'refused', status: 402, body: { error: 'out', code: 'plan_limit_credits' } });
    expect((await post(base({ boardId: BOARD }))).status).toBe(402);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('a check throw is 503, and a failed model call records nothing', async () => {
    mocks.checkAiActionCredits.mockRejectedValue(new Error('down'));
    expect((await post(base({ boardId: BOARD }))).status).toBe(503);

    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    mocks.generateText.mockRejectedValue(new Error('SECRET_PROVIDER_BODY'));
    await post(base({ boardId: BOARD }));
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });

  it('a recording throw still returns the plan', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    mocks.recordBoardAiCreditUsage.mockRejectedValue(new Error('insert failed'));
    const response = await post(base({ boardId: BOARD }));
    expect(response.status).toBe(200);
    expect((await response.json()).plan.message).toBe('Sorted.');
  });

  it('a non-uuid boardId is 400', async () => {
    expect((await post(base({ boardId: 'nope' }))).status).toBe(400);
  });
});
