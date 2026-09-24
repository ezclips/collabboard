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
