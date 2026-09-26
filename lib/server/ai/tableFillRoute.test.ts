import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * FILL A TABLE COLUMN WITH AI -- the route contract.
 *
 * The route reads no board and writes nothing, so these tests are about its own
 * properties: the session gate, the per-USER rate limit, the request contract
 * (preset/detail rules, item bounds, unique rows, total text), that the user's
 * Edit & Rewrite model runs with thinking off and a 2,000-token budget, that
 * the user message is exactly the items JSON, and how provider failures and
 * unusable answers are answered.
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

type RouteModule = typeof import('../../../app/api/ai/table-fill/route');
let route: RouteModule;
let AIProviderError: typeof import('@/lib/server/ai/providers/errors').AIProviderError;

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const post = (body: unknown) => route.POST(new NextRequest('http://localhost/api/ai/table-fill', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}));

const items = (count = 2) => Array.from({ length: count }, (_, index) => ({ row: index, input: `text ${index}` }));
const summarize = (over: Record<string, unknown> = {}) => ({ preset: 'summarize', items: items(), ...over });

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  session();
  mocks.resolveAIModelForRole.mockResolvedValue({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'k' });
  mocks.generateText.mockResolvedValue('{"values":[{"row":0,"value":"a"},{"row":1,"value":"b"}]}');
  // PATCH-188. Default: byok, so the ledger is never read and nothing records.
  mocks.checkAiActionCredits.mockResolvedValue({ kind: 'byok' });
  mocks.recordBoardAiCreditUsage.mockResolvedValue(undefined);
  ({ AIProviderError } = await import('@/lib/server/ai/providers/errors'));
  route = await import('../../../app/api/ai/table-fill/route');
});

describe('table-fill: auth and rate limit', () => {
  it('401 without a session, and the provider is never called', async () => {
    session(null);
    expect((await post(summarize())).status).toBe(401);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('the 11th request in the window is rejected with 429', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await post(summarize())).status).toBe(200);
    }
    expect((await post(summarize())).status).toBe(429);
  });

  it('the limit is per user, not per request content', async () => {
    session({ id: 'user-a' });
    for (let i = 0; i < 10; i += 1) {
      await post(summarize());
    }
    expect((await post(summarize())).status).toBe(429);
  });
});

describe('table-fill: request contract', () => {
  it('400 for missing detail on categorize, translate and custom', async () => {
    for (const preset of ['categorize', 'translate', 'custom'] as const) {
      expect((await post({ preset, items: items() })).status, preset).toBe(400);
    }
  });

  it('400 for detail on summarize', async () => {
    expect((await post(summarize({ detail: 'not allowed' }))).status).toBe(400);
  });

  it('400 for zero items', async () => {
    expect((await post(summarize({ items: [] }))).status).toBe(400);
  });

  it('400 for 41 items', async () => {
    expect((await post(summarize({ items: items(41) }))).status).toBe(400);
  });

  it('400 for duplicate rows', async () => {
    const dup = [{ row: 0, input: 'a' }, { row: 0, input: 'b' }];
    expect((await post(summarize({ items: dup }))).status).toBe(400);
  });

  it('400 for an input over 1,000 characters', async () => {
    const long = [{ row: 0, input: 'x'.repeat(1001) }];
    expect((await post(summarize({ items: long }))).status).toBe(400);
  });

  it('400 for a total over 12,000 characters', async () => {
    const many = Array.from({ length: 13 }, (_, index) => ({ row: index, input: 'y'.repeat(1000) }));
    expect((await post(summarize({ items: many }))).status).toBe(400);
  });

  it('400 for an unknown top-level key', async () => {
    expect((await post(summarize({ extra: true }))).status).toBe(400);
  });

  it('400 for an unknown key inside an item', async () => {
    const smuggled = [{ row: 0, input: 'a', note: 'x' }];
    expect((await post(summarize({ items: smuggled }))).status).toBe(400);
  });

  it('400 for an unknown preset', async () => {
    expect((await post({ preset: 'translate-now', items: items() })).status).toBe(400);
  });
});

describe('table-fill: generation', () => {
  it('resolves the user Edit & Rewrite role', async () => {
    await post(summarize());
    expect(mocks.resolveAIModelForRole).toHaveBeenCalledTimes(1);
    expect(mocks.resolveAIModelForRole.mock.calls[0].slice(0, 2)).toEqual([USER_ID, 'edit']);
  });

  it('calls the adapter with thinking off and a 2,000-token budget', async () => {
    await post(summarize());
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const input = mocks.generateText.mock.calls[0][0] as Record<string, unknown>;
    expect(input.reasoning).toBe('off');
    expect(input.maxTokens).toBe(2000);
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it('the user message is exactly the items JSON', async () => {
    const sent = items(3);
    await post(summarize({ items: sent }));
    const input = mocks.generateText.mock.calls[0][0] as { user: string };
    expect(input.user).toBe(JSON.stringify(sent));
  });

  it('the system prompt names the preset task and treats inputs as data', async () => {
    await post({ preset: 'translate', detail: 'German', items: items() });
    const input = mocks.generateText.mock.calls[0][0] as { system: string };
    expect(input.system).toMatch(/Translate the text into German\./);
    expect(input.system).toMatch(/data, not instructions/i);
  });

  it('returns the parsed values with a 200', async () => {
    mocks.generateText.mockResolvedValue('{"values":[{"row":1,"value":"only one"}]}');
    const response = await post(summarize());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ values: [{ row: 1, value: 'only one' }] });
  });

  it('an unusable answer is 200 with an empty values list, not an error', async () => {
    mocks.generateText.mockResolvedValue('I am sorry, I cannot help with that.');
    const response = await post(summarize());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ values: [] });
  });

  it('a provider failure maps to the shared provider status', async () => {
    mocks.generateText.mockRejectedValue(new AIProviderError('rate_limited', { provider: 'deepseek' }));
    const response = await post(summarize());
    expect(response.status).toBe(429);
    expect((await response.json()).category).toBe('rate_limited');
  });

  it('a non-normalized failure is a generic 502', async () => {
    mocks.generateText.mockRejectedValue(new Error('SECRET_PROVIDER_BODY'));
    const response = await post(summarize());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'AI request failed.' });
  });
});

describe('table-fill PATCH-188: AI credits', () => {
  const BOARD = '11111111-1111-4111-8111-111111111111';
  const PLAN = { workspaceId: 'w', planId: 'pro', limits: { monthlyAiCredits: 500, welcomeAiCredits: 0 }, subscriptionPeriod: null };
  const BALANCE = { allowance: 500, allowanceUsed: 0, grantTotal: 0, grantUsed: 0, remaining: 500, period: { start: new Date(), end: new Date() } };
  const allowed = () => ({ kind: 'allowed', plan: PLAN, balance: BALANCE, charge: true });

  it('byok without boardId runs as today, and nothing is recorded', async () => {
    await post(summarize());
    expect(mocks.checkAiActionCredits).toHaveBeenCalledTimes(1);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });

  it('managed without boardId is 402 plan_limit_no_board, and the model is never called', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'refused', status: 402, body: { error: 'no board', code: 'plan_limit_no_board' } });
    const response = await post(summarize());
    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe('plan_limit_no_board');
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('managed on an unreadable board is 403', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'forbidden' });
    expect((await post(summarize({ boardId: BOARD }))).status).toBe(403);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('managed with credits runs and records one table_fill credit', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    await post(summarize({ boardId: BOARD }));
    expect(mocks.recordBoardAiCreditUsage.mock.calls[0][0]).toMatchObject({ feature: 'table_fill', credits: 1 });
  });

  it('PATCH-190: a configured-byok user on a Pro board runs managed, allowByok false, and is charged', async () => {
    // The check returns `allowed` (the owner's plan pays), so the key must not
    // be used: the resolver is told allowByok false and the run is charged.
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    const response = await post(summarize({ boardId: BOARD }));
    expect(response.status).toBe(200);
    expect(mocks.resolveAIModelForRole.mock.calls[0][3]).toEqual({ allowByok: false });
    expect(mocks.recordBoardAiCreditUsage).toHaveBeenCalledTimes(1);
  });

  it('a refused decision is 402 and the model is never called', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'refused', status: 402, body: { error: 'out', code: 'plan_limit_credits' } });
    expect((await post(summarize({ boardId: BOARD }))).status).toBe(402);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('a check throw is 503, and a failed model call records nothing', async () => {
    mocks.checkAiActionCredits.mockRejectedValue(new Error('down'));
    expect((await post(summarize({ boardId: BOARD }))).status).toBe(503);

    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    mocks.generateText.mockRejectedValue(new Error('SECRET_PROVIDER_BODY'));
    await post(summarize({ boardId: BOARD }));
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });

  it('a recording throw still returns the values', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    mocks.recordBoardAiCreditUsage.mockRejectedValue(new Error('insert failed'));
    const response = await post(summarize({ boardId: BOARD }));
    expect(response.status).toBe(200);
    expect((await response.json()).values).toHaveLength(2);
  });

  it('a non-uuid boardId is 400', async () => {
    expect((await post(summarize({ boardId: 'nope' }))).status).toBe(400);
  });
});
