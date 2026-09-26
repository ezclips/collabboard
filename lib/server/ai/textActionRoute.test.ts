import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mirrors lib/server/knowledge/knowledgeRouteAuthWiring.test.ts's pattern:
// app/api/** is outside vitest.config.ts's `include` globs (confirmed
// empirically -- `npx vitest run app/api/...` reports "No test files found"
// even for an explicit path), so the route module is imported and exercised
// from here instead, exactly like every other Next.js route test in this repo.
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  getPreference: vi.fn(),
  getConnection: vi.fn(),
  loadCredential: vi.fn(),
  checkAiActionCredits: vi.fn(),
  recordBoardAiCreditUsage: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));

// BYOK Phase 3: the route now resolves a provider per user/role instead of
// calling DeepSeek directly. These repositories are the resolver's data seam;
// stubbed to "no stored preference", which is exactly the CollabBoard Default
// path every assertion in this file already describes. The provider fetch
// itself is still stubbed per test, so the behaviour proven here is unchanged.
vi.mock('@/lib/infra/settings/aiRolePreferenceRepository', () => ({
  createAIRolePreferenceRepository: () => ({ getPreference: mocks.getPreference }),
}));
vi.mock('@/lib/infra/settings/aiProviderCredentialRepository', () => ({
  createAIProviderCredentialRepository: () => ({
    getConnection: mocks.getConnection,
    loadCredential: mocks.loadCredential,
  }),
}));
// PATCH-188. The credit ledger, mocked so a byok caller (the default here) is
// exactly the pre-PATCH-188 path: no board, no ledger read.
vi.mock('@/lib/server/billing/aiCredits', () => ({
  checkAiActionCredits: mocks.checkAiActionCredits,
  recordBoardAiCreditUsage: mocks.recordBoardAiCreditUsage,
  allowByokFor: (d: { kind: string }) => d.kind === 'byok',
}));

let route: typeof import('../../../app/api/ai/text-action/route');
let ipCounter = 0;

function configureAuth(user: { id: string } | null) {
  mocks.cookies.mockResolvedValue({ get: vi.fn(() => null), set: vi.fn() });
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
  });
}

function request(body: unknown, ip?: string) {
  ipCounter += 1;
  return new NextRequest('http://localhost/api/ai/text-action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip ?? `10.0.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

function mockDeepSeekSuccess(content: string) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
}

beforeAll(async () => {
  route = await import('../../../app/api/ai/text-action/route');
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');
  configureAuth({ id: 'user-1' });
  // No stored role preference => CollabBoard Default => DeepSeek, and the
  // credential table is never consulted on that path.
  mocks.getPreference.mockResolvedValue({ ok: true, value: null });
  // PATCH-188. Default: byok, so the ledger is never read and nothing records.
  mocks.checkAiActionCredits.mockResolvedValue({ kind: 'byok' });
  mocks.recordBoardAiCreditUsage.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/ai/text-action -- auth', () => {
  it('1. unauthenticated request is rejected with 401', async () => {
    configureAuth(null);
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/ai/text-action -- request validation', () => {
  it('2. invalid action is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'translate', selectedText: 'hello' }));
    expect(res.status).toBe(400);
  });

  it('3. empty selectedText is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'improve', selectedText: '   ' }));
    expect(res.status).toBe(400);
  });

  it('4. selectedText over 4000 characters is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'improve', selectedText: 'a'.repeat(4001) }));
    expect(res.status).toBe(400);
  });

  it('5. custom action without instruction is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'custom', selectedText: 'hello' }));
    expect(res.status).toBe(400);
  });

  it('6. instruction supplied on a non-custom action is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello', instruction: 'make it louder' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/text-action -- rate limiting', () => {
  it('7. the 11th request within the window from one IP is rejected with 429', async () => {
    vi.stubGlobal('fetch', mockDeepSeekSuccess('ok'));
    const ip = '203.0.113.7';
    for (let i = 0; i < 10; i++) {
      const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }, ip));
      expect(res.status).toBe(200);
    }
    const eleventh = await route.POST(request({ action: 'improve', selectedText: 'hello' }, ip));
    expect(eleventh.status).toBe(429);
  });
});

describe('POST /api/ai/text-action -- provider failure', () => {
  it('8. a provider/network failure surfaces as 502, never a raw provider payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('secret internal detail'); }));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).not.toContain('secret internal detail');
  });

  it('9. a malformed provider response (no content field) is rejected with 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{}] }), { status: 200 })));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(502);
  });

  it('9b. an empty-after-trim provider response is rejected with 502', async () => {
    vi.stubGlobal('fetch', mockDeepSeekSuccess('   '));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(502);
  });
});

describe('POST /api/ai/text-action -- success', () => {
  it('10. a successful request returns { text: string } only', async () => {
    vi.stubGlobal('fetch', mockDeepSeekSuccess('Better text'));
    const res = await route.POST(request({ action: 'improve', selectedText: 'Bravo' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ text: 'Better text' });
  });

  it('11. the exact selectedText reaches the provider prompt verbatim', async () => {
    const fetchMock = mockDeepSeekSuccess('ok');
    vi.stubGlobal('fetch', fetchMock);
    await route.POST(request({ action: 'improve', selectedText: 'Exact Bravo Text' }));
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    const userMessage = sentBody.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMessage.content).toBe('Exact Bravo Text');
  });

  it('12. the provider request contains only the system prompt + selectedText -- no board/Note/Document/Knowledge content', async () => {
    const fetchMock = mockDeepSeekSuccess('ok');
    vi.stubGlobal('fetch', fetchMock);
    await route.POST(request({ action: 'shorten', selectedText: 'Bravo' }));
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.messages).toHaveLength(2);
    // The key set is the four the route OWNS plus the one provider control it
    // now sets (PATCH-162's thinking switch). Pinned exhaustively still, so a
    // NEW field has to be considered here rather than slipping through -- the
    // property this test exists for. `thinking` is a provider control and
    // carries no board, Note, Document or Knowledge content.
    expect(Object.keys(sentBody).sort()).toEqual(['max_tokens', 'messages', 'model', 'temperature', 'thinking']);
    // And the content scoping, stated directly rather than by key count.
    expect(JSON.stringify(sentBody.messages)).toBe(
      JSON.stringify([
        { role: 'system', content: sentBody.messages[0].content },
        { role: 'user', content: 'Bravo' },
      ]),
    );
  });

  it('shorten and fix-grammar route to their own distinct task instructions', async () => {
    const fetchMock = mockDeepSeekSuccess('ok');
    vi.stubGlobal('fetch', fetchMock);
    await route.POST(request({ action: 'shorten', selectedText: 'Bravo' }));
    await route.POST(request({ action: 'fix-grammar', selectedText: 'Bravo' }));
    const systemPrompts = fetchMock.mock.calls.map(([, init]: any[]) => {
      const body = JSON.parse((init as RequestInit).body as string);
      return body.messages.find((m: { role: string }) => m.role === 'system').content;
    });
    expect(systemPrompts[0]).not.toBe(systemPrompts[1]);
  });

  it('custom action forwards the trimmed instruction into the system prompt', async () => {
    const fetchMock = mockDeepSeekSuccess('ok');
    vi.stubGlobal('fetch', fetchMock);
    await route.POST(request({ action: 'custom', selectedText: 'Bravo', instruction: '  translate to pirate speak  ' }));
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    const systemMessage = sentBody.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMessage.content).toContain('translate to pirate speak');
  });
});

describe('POST /api/ai/text-action -- scope and secret handling', () => {
  // Strips comments so this tests what the route DOES, not its own prose --
  // the route's rate-limit comment names the sibling routes by way of
  // explaining it copies their shape, which must not trip this guard.
  const routeCode = () =>
    readFileSync(resolve(process.cwd(), 'app/api/ai/text-action/route.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('13. never imports the structured-component contract, mode registry, or another AI endpoint', () => {
    const source = routeCode();
    expect(source).not.toContain('lib/ai/contracts');
    expect(source).not.toContain('mode-registry');
    expect(source).not.toContain('generate-component');
    expect(source).not.toContain('convert-component');
    expect(source).not.toContain('classify-intent');
    // Word-boundary matched, not a bare substring: the guard targets the
    // structured-component `AIMode` contract, and BYOK Phase 3 legitimately
    // imports `resolveAIModelForRole`, which contains those characters. The
    // import path assertion above remains the primary proof.
    expect(source).not.toMatch(/\bAIMode\b/);
    expect(source).not.toContain('StoredAIContent');
  });

  it('14. the API key value never appears in a response body', async () => {
    vi.stubGlobal('fetch', mockDeepSeekSuccess('ok'));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('test-deepseek-key');
  });

  it('14b. a missing API key never leaks the env var name to the client', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    // BYOK Phase 3 changed this status from 502 to 400: an absent server key is
    // now surfaced by the resolver as `invalid_configuration`, which the agreed
    // provider-error mapping renders as 400. The security property this test
    // exists for -- the env var name never reaching the client -- is unchanged.
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toContain('DEEPSEEK_API_KEY');
  });
});

describe('PATCH-162: the route asks for no thinking', () => {
  it('15. the outbound provider body carries the DeepSeek thinking switch', async () => {
    // The route passes `reasoning: 'off'`, and the DeepSeek adapter turns that
    // into its documented `thinking: { type: 'disabled' }`. Asserted on the
    // ACTUAL outbound body, so it is the request the provider would receive --
    // not a claim about the route's source. Without this, a thinking model
    // spends the whole 1,500-token budget on reasoning and returns no answer.
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: 'punctuated.' } }] }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const res = await route.POST(request({ action: 'improve', selectedText: 'hello there' }));
    expect(res.status).toBe(200);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sentBody = JSON.parse(String(init.body));
    expect(sentBody.thinking).toEqual({ type: 'disabled' });
  });
});

describe('text-action PATCH-188: AI credits', () => {
  const BOARD = '11111111-1111-4111-8111-111111111111';
  const PLAN = { workspaceId: 'w', planId: 'pro', limits: { monthlyAiCredits: 500, welcomeAiCredits: 0 }, subscriptionPeriod: null };
  const BALANCE = { allowance: 500, allowanceUsed: 0, grantTotal: 0, grantUsed: 0, remaining: 500, period: { start: new Date(), end: new Date() } };
  const allowed = () => ({ kind: 'allowed', plan: PLAN, balance: BALANCE, charge: true });

  it('byok without boardId runs as today, and nothing is recorded', async () => {
    const fetchMock = mockDeepSeekSuccess('Better text');
    vi.stubGlobal('fetch', fetchMock);
    const response = await route.POST(request({ action: 'improve', selectedText: 'Bravo' }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });

  it('managed without boardId is 402 plan_limit_no_board, and the model is never called', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({
      kind: 'refused',
      status: 402,
      body: { error: 'no board', code: 'plan_limit_no_board' },
    });
    const fetchMock = mockDeepSeekSuccess('Better text');
    vi.stubGlobal('fetch', fetchMock);
    const response = await route.POST(request({ action: 'improve', selectedText: 'Bravo' }));
    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe('plan_limit_no_board');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('managed on an unreadable board is 403, and the model is never called', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'forbidden' });
    const fetchMock = mockDeepSeekSuccess('Better text');
    vi.stubGlobal('fetch', fetchMock);
    const response = await route.POST(request({ action: 'improve', selectedText: 'Bravo', boardId: BOARD }));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('managed with credits runs and records one text_action credit', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    const fetchMock = mockDeepSeekSuccess('Better text');
    vi.stubGlobal('fetch', fetchMock);
    const response = await route.POST(request({ action: 'improve', selectedText: 'Bravo', boardId: BOARD }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.recordBoardAiCreditUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordBoardAiCreditUsage.mock.calls[0][0]).toMatchObject({
      feature: 'text_action',
      credits: 1,
      boardId: BOARD,
    });
  });

  it('PATCH-190: a configured-byok user on a Pro board runs on the CollabBoard model, is charged, and no credential is loaded', async () => {
    mocks.getPreference.mockResolvedValue({
      ok: true,
      value: { role: 'edit', connectionId: 'conn-1', modelId: 'user-model' },
    });
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    const fetchMock = mockDeepSeekSuccess('Better text');
    vi.stubGlobal('fetch', fetchMock);
    const response = await route.POST(request({ action: 'improve', selectedText: 'Bravo', boardId: BOARD }));
    expect(response.status).toBe(200);
    // The saved connection and its credential are NEVER touched.
    expect(mocks.getConnection).not.toHaveBeenCalled();
    expect(mocks.loadCredential).not.toHaveBeenCalled();
    // The managed model ran, not the configured one, and the call was charged.
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string) as { model: string };
    expect(sentBody.model).not.toBe('user-model');
    expect(mocks.recordBoardAiCreditUsage).toHaveBeenCalledTimes(1);
  });

  it('a refused decision is 402 with its body, and the model is never called', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({
      kind: 'refused',
      status: 402,
      body: { error: 'out of credits', code: 'plan_limit_credits' },
    });
    const fetchMock = mockDeepSeekSuccess('Better text');
    vi.stubGlobal('fetch', fetchMock);
    const response = await route.POST(request({ action: 'improve', selectedText: 'Bravo', boardId: BOARD }));
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: 'out of credits', code: 'plan_limit_credits' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a check throw is 503, and the model is never called', async () => {
    mocks.checkAiActionCredits.mockRejectedValue(new Error('down'));
    const fetchMock = mockDeepSeekSuccess('Better text');
    vi.stubGlobal('fetch', fetchMock);
    expect((await route.POST(request({ action: 'improve', selectedText: 'Bravo', boardId: BOARD }))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failed model call records nothing', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('SECRET_PROVIDER_BODY'); }));
    const response = await route.POST(request({ action: 'improve', selectedText: 'Bravo', boardId: BOARD }));
    expect(response.status).toBe(502);
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });

  it('a recording throw still returns the answer', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    vi.stubGlobal('fetch', mockDeepSeekSuccess('Better text'));
    mocks.recordBoardAiCreditUsage.mockRejectedValue(new Error('insert failed'));
    const response = await route.POST(request({ action: 'improve', selectedText: 'Bravo', boardId: BOARD }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: 'Better text' });
  });

  it('a non-uuid boardId is 400', async () => {
    expect((await route.POST(request({ action: 'improve', selectedText: 'Bravo', boardId: 'nope' }))).status).toBe(400);
  });
});
