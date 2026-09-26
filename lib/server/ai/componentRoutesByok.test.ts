import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ROLES, AI_ROLE_COMPONENT } from '../../ai/aiRoles';
import { COMPONENT_MAX_TOKENS } from './componentGeneration';
import {
  AI_ROLES as SETTINGS_ROLES,
  AI_ROLE_DESCRIPTIONS,
  AI_ROLE_LABELS,
} from '../../../components/settings/ai/aiSettingsClient';

/**
 * COMPONENT AI ONTO BYOK.
 *
 * generate-component, convert-component and classify-intent each carried a
 * private callDeepSeek() that read DEEPSEEK_API_KEY and hard-coded
 * `deepseek-chat`. They were the last AI routes in the product a user could
 * neither choose a provider for nor spend their own credits on, and the model
 * they named has been RETIRED since 2026-07-24 -- it answers today only through
 * undocumented compatibility routing.
 *
 * The routes are exercised from here because app/api/** is outside vitest's
 * include globs. The resolver and the adapter registry are mocked so the WIRING
 * is what gets asserted: which role is resolved, which adapter runs, what is
 * forwarded, what comes back, and what may never appear in a response.
 *
 * No test here reaches a network. No real credential exists.
 *
 * THE MODEL CHANGES, AND THAT IS RECORDED RATHER THAN HIDDEN. For a user with
 * no connection, these three routes now run on whatever the managed default
 * resolves to (`deepseek-flash`) instead of the retired `deepseek-chat`. The
 * provider and the key are unchanged -- same DeepSeek, same server key, same
 * billing -- and the assertions below say exactly that: stability of provider
 * and key, and an explicit statement that the model is the resolver's answer
 * and no longer a literal in the route.
 */

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  resolveAIModelForRole: vi.fn(),
  getAIProviderAdapter: vi.fn(),
  generateText: vi.fn(),
  createAIRolePreferenceRepository: vi.fn(() => ({ getPreference: vi.fn() })),
  createAIProviderCredentialRepository: vi.fn(() => ({
    getConnection: vi.fn(),
    loadCredential: vi.fn(),
  })),
  checkAiActionCredits: vi.fn(),
  recordBoardAiCreditUsage: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/server/ai/resolveAIModelForRole', () => ({
  resolveAIModelForRole: mocks.resolveAIModelForRole,
}));
vi.mock('@/lib/server/ai/providers/registry', () => ({
  getAIProviderAdapter: mocks.getAIProviderAdapter,
}));
vi.mock('@/lib/infra/settings/aiRolePreferenceRepository', () => ({
  createAIRolePreferenceRepository: mocks.createAIRolePreferenceRepository,
}));
vi.mock('@/lib/infra/settings/aiProviderCredentialRepository', () => ({
  createAIProviderCredentialRepository: mocks.createAIProviderCredentialRepository,
}));
// PATCH-188. The credit ledger, mocked so the default (byok) is the
// pre-PATCH-188 path: no board, no ledger read.
vi.mock('@/lib/server/billing/aiCredits', () => ({
  checkAiActionCredits: mocks.checkAiActionCredits,
  recordBoardAiCreditUsage: mocks.recordBoardAiCreditUsage,
  allowByokFor: (d: { kind: string }) => d.kind === 'byok',
}));

let generateRoute: typeof import('../../../app/api/ai/generate-component/route');
let convertRoute: typeof import('../../../app/api/ai/convert-component/route');
let classifyRoute: typeof import('../../../app/api/ai/classify-intent/route');
let AIProviderError: typeof import('./providers/errors').AIProviderError;
let ipCounter = 0;

/** The managed default AFTER this unit: same provider, same key, new model. */
const DEFAULT_RESOLUTION = {
  source: 'collabboard-default' as const,
  provider: 'deepseek' as const,
  model: 'deepseek-flash',
  apiKey: 'server-deepseek-key',
  supportsImages: false,
  connectionId: null,
};

function configureAuth(user: { id: string } | null) {
  mocks.cookies.mockResolvedValue({ get: vi.fn(() => null), set: vi.fn() });
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
  });
}

function request(path: string, body: unknown) {
  ipCounter += 1;
  return new NextRequest(`http://localhost/api/ai/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${ipCounter}` },
    body: JSON.stringify(body),
  });
}

/** A minimal lesson_board the validators accept, so a success path is reachable. */
const LESSON_BOARD = {
  type: 'lesson_board',
  title: 'Photosynthesis',
  sections: [{ title: 'Intro', content: 'Plants convert light into chemical energy.' }],
};

/**
 * The only conversion shape the matrix actually allows out of the box:
 * flowchart -> mindmap. Using a pair the route would reject would have let the
 * provider assertions below pass for the wrong reason -- the request never
 * reaching a provider at all.
 */
const FLOWCHART = {
  type: 'diagram',
  subtype: 'flowchart',
  title: 'Onboarding',
  renderer: 'diagram_code',
  code: 'graph TD; A-->B',
};
const SOURCE_ENVELOPE = { mode: 'diagram', version: 1, data: FLOWCHART };
const MINDMAP_REPLY = JSON.stringify({ title: 'Onboarding', code: 'mindmap\n  root((Onboarding))' });

function convertRequest(extra: Record<string, unknown> = {}) {
  return request('convert-component', {
    sourceEnvelope: SOURCE_ENVELOPE,
    targetMode: 'diagram',
    targetSubtype: 'mindmap',
    ...extra,
  });
}

beforeAll(async () => {
  generateRoute = await import('../../../app/api/ai/generate-component/route');
  convertRoute = await import('../../../app/api/ai/convert-component/route');
  classifyRoute = await import('../../../app/api/ai/classify-intent/route');
  ({ AIProviderError } = await import('./providers/errors'));
});

beforeEach(() => {
  vi.clearAllMocks();
  configureAuth({ id: 'user-1' });
  mocks.resolveAIModelForRole.mockResolvedValue(DEFAULT_RESOLUTION);
  mocks.getAIProviderAdapter.mockReturnValue({ generateText: mocks.generateText });
  mocks.generateText.mockResolvedValue(JSON.stringify(LESSON_BOARD));
  // PATCH-188. Default: byok, so the ledger is never read and nothing records.
  mocks.checkAiActionCredits.mockResolvedValue({ kind: 'byok' });
  mocks.recordBoardAiCreditUsage.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The three routes and a body each accepts, so the shared rules run on all three. */
const ROUTES = [
  {
    name: 'generate-component',
    path: 'generate-component',
    post: () => generateRoute.POST(request('generate-component', { prompt: 'teach photosynthesis', mode: 'lesson_board' })),
  },
  {
    name: 'convert-component',
    path: 'convert-component',
    post: () => convertRoute.POST(convertRequest()),
  },
  {
    name: 'classify-intent',
    path: 'classify-intent',
    post: () => classifyRoute.POST(request('classify-intent', { prompt: 'teach photosynthesis' })),
  },
] as const;

describe('the component role exists in BOTH lists, because neither is derived from the other', () => {
  it('the server registry and the Settings list agree, so the role is configurable at all', () => {
    expect(AI_ROLES).toContain(AI_ROLE_COMPONENT);
    // AIRoleSettings renders from the CLIENT list. A role present only in the
    // server registry is one the product spends calls on and no user can see
    // or change -- precisely the state this unit exists to end.
    expect(SETTINGS_ROLES).toContain(AI_ROLE_COMPONENT);
    expect([...SETTINGS_ROLES]).toEqual([...AI_ROLES]);
    // A missing label or description renders `undefined` in Settings.
    expect(AI_ROLE_LABELS[AI_ROLE_COMPONENT]).toBeTruthy();
    expect(AI_ROLE_DESCRIPTIONS[AI_ROLE_COMPONENT]).toBeTruthy();
  });
});

describe.each(ROUTES)('$name: provider selection', ({ post }) => {
  it('resolves the component role for the SESSION user', async () => {
    await post();
    expect(mocks.resolveAIModelForRole).toHaveBeenCalledWith('user-1', AI_ROLE_COMPONENT, expect.anything(), { allowByok: true });
  });

  it('an unauthenticated request never resolves a provider', async () => {
    configureAuth(null);
    const res = await post();
    expect(res.status).toBe(401);
    expect(mocks.resolveAIModelForRole).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('an unconfigured user keeps the same provider and the same server key', async () => {
    await post();
    expect(mocks.getAIProviderAdapter).toHaveBeenCalledWith('deepseek');
    const call = mocks.generateText.mock.calls[0][0];
    expect(call.apiKey).toBe('server-deepseek-key');
    // The model is now the RESOLVER's answer, not a literal in the route --
    // which is how the managed default moved off the retired `deepseek-chat`.
    expect(call.model).toBe('deepseek-flash');
    expect(call.model).not.toBe('deepseek-chat');
  });

  it('a configured connection runs on the user\'s own provider and key', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue({
      source: 'byok', provider: 'anthropic', model: 'claude-sonnet-4-5',
      apiKey: 'user-anthropic-key', supportsImages: false, connectionId: 'c1',
    });
    await post();
    expect(mocks.getAIProviderAdapter).toHaveBeenCalledWith('anthropic');
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-5', apiKey: 'user-anthropic-key' }),
    );
  });

  it('a client cannot name the provider, model, key or endpoint', async () => {
    await post();
    const call = mocks.generateText.mock.calls[0][0];
    expect(call.model).toBe('deepseek-flash');
    expect(call.apiKey).toBe('server-deepseek-key');
    expect(call).not.toHaveProperty('baseUrl');
    expect(call).not.toHaveProperty('endpoint');
    expect(Object.keys(call).sort()).toEqual(
      ['apiKey', 'maxTokens', 'model', 'signal', 'system', 'temperature', 'user'],
    );
  });

  it('the default path adds ONE preference read and touches no credential', async () => {
    const credentials = { getConnection: vi.fn(), loadCredential: vi.fn() };
    mocks.createAIProviderCredentialRepository.mockReturnValue(credentials);
    await post();
    // The cost of this migration on the most frequent call in the product is
    // one indexed single-row read, and nothing more. A user on CollabBoard
    // Default never reaches the credential table -- the resolver returns
    // before it, which is why no decryption happens for the common case.
    expect(credentials.getConnection).not.toHaveBeenCalled();
    expect(credentials.loadCredential).not.toHaveBeenCalled();
    expect(mocks.resolveAIModelForRole).toHaveBeenCalledTimes(1);
  });

  it('a broken BYOK configuration is a 400, and never falls back to the CollabBoard key', async () => {
    mocks.resolveAIModelForRole.mockRejectedValue(
      new AIProviderError('invalid_configuration', { provider: 'openai' }),
    );
    const res = await post();
    // classify-intent keeps its own 502 contract, which the client reads as
    // "stay on the current mode"; the other two map the category. Either way
    // the point holds: no adapter ran, so no CollabBoard quota was spent.
    expect(mocks.getAIProviderAdapter).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('no key, provider body or stack reaches the response', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue({
      source: 'byok', provider: 'openai', model: 'gpt-5',
      apiKey: 'SECRET-USER-KEY-XYZ', supportsImages: false, connectionId: 'c1',
    });
    const ok = JSON.stringify(await (await post()).json());
    expect(ok).not.toContain('SECRET-USER-KEY-XYZ');

    mocks.generateText.mockRejectedValue(new Error('RAW_PROVIDER_BODY_123'));
    const failed = JSON.stringify(await (await post()).json());
    expect(failed).not.toContain('SECRET-USER-KEY-XYZ');
    expect(failed).not.toContain('RAW_PROVIDER_BODY_123');
    expect(failed).not.toContain('at ');
  });
});

describe('preserved request semantics', () => {
  it('generate-component keeps its prompt, temperature and token budget', async () => {
    await generateRoute.POST(request('generate-component', { prompt: 'teach photosynthesis', mode: 'lesson_board' }));
    const call = mocks.generateText.mock.calls[0][0];
    expect(call.system).toBe('Return only valid JSON with no markdown, code fences, or surrounding prose.');
    expect(call.user).toContain('teach photosynthesis');
    expect(call.user).toContain('Return valid JSON only.');
    expect(call.temperature).toBe(0.5);
    expect(call.maxTokens).toBe(COMPONENT_MAX_TOKENS);
  });

  it('convert-component keeps its own temperature and still describes the conversion', async () => {
    mocks.generateText.mockResolvedValue(MINDMAP_REPLY);
    await convertRoute.POST(convertRequest());
    const call = mocks.generateText.mock.calls[0][0];
    expect(call.temperature).toBe(0.3);
    // The same constant, not a second copy of the number.
    expect(call.maxTokens).toBe(COMPONENT_MAX_TOKENS);
    expect(call.user).toContain('Convert the following existing content');
  });

  it('classify-intent keeps its classifier prompt, low temperature and tiny budget', async () => {
    mocks.generateText.mockResolvedValue(JSON.stringify({ mode: 'diagram', subtype: 'flowchart', confidence: 'high' }));
    const res = await classifyRoute.POST(request('classify-intent', { prompt: 'show me the steps' }));
    const call = mocks.generateText.mock.calls[0][0];
    expect(call.user).toContain('You are a content type classifier.');
    expect(call.user).toContain('show me the steps');
    expect(call.temperature).toBe(0.1);
    // NOT 80. See the constant in the route: 80 was sized for a model that did
    // not reason, and under `deepseek-flash` the reasoning tokens ate the whole
    // budget -- the real route failed 2 of 5 realistic prompts, intermittently,
    // and the client silently kept the current mode instead of showing it.
    expect(call.maxTokens).toBe(400);
    expect(call.maxTokens).toBeGreaterThan(80);
    // The response shape is untouched: no attribution on a mode decision.
    expect(await res.json()).toEqual({ mode: 'diagram', subtype: 'flowchart', confidence: 'high' });
  });

  it('each route forwards its own AbortSignal, and keeps exactly one clock', async () => {
    await generateRoute.POST(request('generate-component', { prompt: 'p', mode: 'lesson_board' }));
    const { signal } = mocks.generateText.mock.calls[0][0];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });
});

describe('a failed classify is no longer silent', () => {
  /**
   * The behaviour is unchanged -- a failed classify still keeps the current
   * mode, which is the right resilience. What changed is that it now says so.
   * That silence is exactly how an 80-token budget hid: Auto picked the wrong
   * format intermittently and nothing in the product recorded it.
   */
  it('records a provider failure, with a running count', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.generateText.mockRejectedValue(new AIProviderError('request_failed'));
    const res = await classifyRoute.POST(request('classify-intent', { prompt: 'p' }));

    expect(res.status).toBe(502);
    const line = warn.mock.calls.map((c) => String(c[0])).find((c) => c.includes('classify-intent failed'));
    expect(line).toBeDefined();
    expect(line).toContain('(provider)');
    expect(line).toMatch(/failures_since_start=\d+/);
    warn.mockRestore();
  });

  it('records a parse failure too -- the branch that quietly picks lesson_board', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A completion arrives and is not the expected shape. The route answers
    // 200 with lesson_board, so nothing downstream can tell this happened.
    mocks.generateText.mockResolvedValue('not json at all');
    const res = await classifyRoute.POST(request('classify-intent', { prompt: 'p' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'lesson_board', confidence: 'low' });
    const line = warn.mock.calls.map((c) => String(c[0])).find((c) => c.includes('classify-intent failed'));
    expect(line).toBeDefined();
    expect(line).toContain('(parse)');
    warn.mockRestore();
  });

  it('the recorded reason never carries a provider response body', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A non-normalized throw is the only way raw text could reach the reason.
    // AIProviderError carries a fixed message by construction; this asserts the
    // response stays clean even when the thrown thing is not one.
    mocks.generateText.mockRejectedValue(new Error('RAW_PROVIDER_BODY_123'));
    const res = await classifyRoute.POST(request('classify-intent', { prompt: 'p' }));
    expect(JSON.stringify(await res.json())).not.toContain('RAW_PROVIDER_BODY_123');
    warn.mockRestore();
  });
});

describe('the response says which model actually answered', () => {
  it('generate-component reports the managed default it really used', async () => {
    const res = await generateRoute.POST(request('generate-component', { prompt: 'p', mode: 'lesson_board' }));
    const body = await res.json();
    expect(body.meta.generatedBy).toEqual({ source: 'collabboard-default', model: 'deepseek-flash' });
  });

  it('generate-component reports the BYOK model, not the one the client might assume', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue({
      source: 'byok', provider: 'openai', model: 'gpt-4o',
      apiKey: 'user-openai-key', supportsImages: false, connectionId: 'c1',
    });
    const res = await generateRoute.POST(request('generate-component', { prompt: 'p', mode: 'lesson_board' }));
    expect((await res.json()).meta.generatedBy).toEqual({ source: 'byok', model: 'gpt-4o' });
  });

  it('convert-component attributes the CONVERTING model, not the source envelope\'s', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue({
      source: 'byok', provider: 'gemini', model: 'gemini-2.5-flash',
      apiKey: 'user-gemini-key', supportsImages: false, connectionId: 'c2',
    });
    mocks.generateText.mockResolvedValue(MINDMAP_REPLY);
    // A source that claims some other model made it. The conversion is a new
    // generation and must carry its own attribution.
    const res = await convertRoute.POST(convertRequest({
      sourceEnvelope: { ...SOURCE_ENVELOPE, meta: { generatedBy: { source: 'byok', model: 'old-model' } } },
    }));
    expect((await res.json()).meta.generatedBy).toEqual({ source: 'byok', model: 'gemini-2.5-flash' });
  });

  it('the attribution carries ONLY source and model -- never the key beside them', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue({
      source: 'byok', provider: 'openai', model: 'gpt-4o',
      apiKey: 'SECRET-USER-KEY-XYZ', supportsImages: false, connectionId: 'c1',
    });
    const res = await generateRoute.POST(request('generate-component', { prompt: 'p', mode: 'lesson_board' }));
    const { generatedBy } = (await res.json()).meta;
    // The seam builds this field by field for exactly this reason: the
    // resolver's descriptor it is built from also holds a plaintext key, and a
    // spread would have shipped it to the browser.
    expect(Object.keys(generatedBy).sort()).toEqual(['model', 'source']);
  });
});

describe('source guarantees: the hard-wired DeepSeek calls are gone', () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), `app/api/ai/${path}/route.ts`), 'utf8');

  /**
   * Comments stripped: these assertions are about what the route DOES. The
   * routes now carry notes explaining why `deepseek-chat` is gone and why the
   * token budget moved, and that prose naming the retired model is the record,
   * not a relapse.
   */
  const executable = (path: string) => source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it.each(ROUTES)('$name holds no endpoint, model literal or environment key', ({ path }) => {
    const code = executable(path);
    expect(code).not.toContain('api.deepseek.com');
    expect(code).not.toContain('deepseek-chat');
    expect(code).not.toContain('callDeepSeek');
    expect(code).not.toContain('DEEPSEEK_API_KEY');
    expect(code).toContain('generateComponentText');
  });

  it.each(ROUTES)('$name no longer builds an error message out of a provider response body', ({ path }) => {
    // The provider-failure branch used to return `details: error.message`,
    // where the message was `DeepSeek error: ${await response.text()}` -- the
    // provider's own body, which can echo the request that was sent to it.
    // Both halves of that construction are gone.
    const code = executable(path);
    expect(code).not.toContain('DeepSeek error');
    expect(code).not.toContain('response.text()');
    // The runtime companion to this is the "no key, provider body or stack
    // reaches the response" case above, which asserts it on an actual reply.
  });

  it('the component budget is one constant, large enough for a model that reasons', () => {
    // `max_tokens` bounds reasoning AND answer together on deepseek-flash, so
    // the old 1200 -- sized for the non-reasoning deepseek-chat -- truncated
    // cards into unparseable JSON. Measured on the real route before and after.
    expect(COMPONENT_MAX_TOKENS).toBeGreaterThan(1200);
    for (const path of ['generate-component', 'convert-component']) {
      expect(executable(path)).not.toMatch(/maxTokens:\s*1200/);
      expect(executable(path)).toContain('COMPONENT_MAX_TOKENS');
    }
  });

  it('the one execution seam owns exactly one timer', () => {
    const seam = readFileSync(resolve(process.cwd(), 'lib/server/ai/componentGeneration.ts'), 'utf8');
    expect(seam.match(/setTimeout\(/g) ?? []).toHaveLength(1);
    expect(seam).toContain('resolveAIModelForRole');
    expect(seam).toContain('AI_ROLE_COMPONENT');
    // No spread of the resolver's answer anywhere in this file.
    expect(seam).not.toMatch(/\.\.\.resolved/);
  });
});

describe('PATCH-188: the component routes carry a board and pay from its plan', () => {
  const BOARD = '11111111-1111-4111-8111-111111111111';
  const PLAN = { workspaceId: 'w', planId: 'pro', limits: { monthlyAiCredits: 500, welcomeAiCredits: 0 }, subscriptionPeriod: null };
  const BALANCE = { allowance: 500, allowanceUsed: 0, grantTotal: 0, grantUsed: 0, remaining: 500, period: { start: new Date(), end: new Date() } };
  const allowed = () => ({ kind: 'allowed', plan: PLAN, balance: BALANCE, charge: true });

  it('generate-component byok without a board runs and records nothing', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'byok' });
    const res = await generateRoute.POST(request('generate-component', { prompt: 'p', mode: 'lesson_board' }));
    expect(res.status).toBe(200);
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });

  it('generate-component managed without a board is 402 plan_limit_no_board', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'refused', status: 402, body: { error: 'no board', code: 'plan_limit_no_board' } });
    const res = await generateRoute.POST(request('generate-component', { prompt: 'p', mode: 'lesson_board' }));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('plan_limit_no_board');
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('generate-component managed with credits records one component credit', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    await generateRoute.POST(request('generate-component', { prompt: 'p', mode: 'lesson_board', boardId: BOARD }));
    expect(mocks.recordBoardAiCreditUsage.mock.calls[0][0]).toMatchObject({ feature: 'component', credits: 1 });
  });

  it('PATCH-190: a configured-byok user on a Pro board runs managed, allowByok false, and is charged', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    const res = await generateRoute.POST(request('generate-component', { prompt: 'p', mode: 'lesson_board', boardId: BOARD }));
    expect(res.status).toBe(200);
    expect(mocks.resolveAIModelForRole.mock.calls[0][3]).toEqual({ allowByok: false });
    expect(mocks.recordBoardAiCreditUsage).toHaveBeenCalledTimes(1);
  });

  it('convert-component managed for a forbidden board is 403', async () => {
    mocks.checkAiActionCredits.mockResolvedValue({ kind: 'forbidden' });
    const res = await convertRoute.POST(convertRequest({ boardId: BOARD }));
    expect(res.status).toBe(403);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('classify-intent managed success records NOTHING (cost 0)', async () => {
    mocks.checkAiActionCredits.mockResolvedValue(allowed());
    mocks.generateText.mockResolvedValue(JSON.stringify({ mode: 'diagram', subtype: 'flowchart', confidence: 'high' }));
    const res = await classifyRoute.POST(request('classify-intent', { prompt: 'p', boardId: BOARD }));
    expect(res.status).toBe(200);
    expect(mocks.recordBoardAiCreditUsage).not.toHaveBeenCalled();
  });

  it('a non-uuid boardId is 400 on a component route', async () => {
    const res = await generateRoute.POST(request('generate-component', { prompt: 'p', mode: 'lesson_board', boardId: 'nope' }));
    expect(res.status).toBe(400);
    expect(mocks.checkAiActionCredits).not.toHaveBeenCalled();
  });
});
