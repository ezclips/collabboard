import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * BYOK Phase 3 -- the text-action route's provider-execution seam.
 *
 * The route module is exercised from here for the same reason the sibling
 * textActionRoute.test.ts does it: app/api/** is outside vitest's include
 * globs. Where that file proves the pre-BYOK contract still holds end to end
 * (real resolver, stubbed fetch), this file mocks the resolver and the adapter
 * registry so the WIRING itself -- which role is resolved, which adapter runs,
 * what is forwarded, and how failures are mapped -- can be asserted directly.
 *
 * No test here reaches a network. No real credential exists.
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

let route: typeof import('../../../app/api/ai/text-action/route');
let AIProviderError: typeof import('./providers/errors').AIProviderError;
let ipCounter = 0;

function configureAuth(user: { id: string } | null) {
  mocks.cookies.mockResolvedValue({ get: vi.fn(() => null), set: vi.fn() });
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
  });
}

function request(body: unknown) {
  ipCounter += 1;
  return new NextRequest('http://localhost/api/ai/text-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${ipCounter}` },
    body: JSON.stringify(body),
  });
}

/** The CollabBoard Default descriptor the resolver returns for an unconfigured user. */
const DEFAULT_RESOLUTION = {
  source: 'collabboard-default' as const,
  provider: 'deepseek' as const,
  model: 'deepseek-chat',
  apiKey: 'server-deepseek-key',
  connectionId: null,
};

beforeAll(async () => {
  route = await import('../../../app/api/ai/text-action/route');
  ({ AIProviderError } = await import('./providers/errors'));
});

beforeEach(() => {
  vi.clearAllMocks();
  configureAuth({ id: 'user-1' });
  mocks.resolveAIModelForRole.mockResolvedValue(DEFAULT_RESOLUTION);
  mocks.generateText.mockResolvedValue('generated text');
  mocks.getAIProviderAdapter.mockReturnValue({ generateText: mocks.generateText });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('text-action BYOK: auth and purpose validation', () => {
  it('1. an unauthenticated request is still rejected, and never resolves a provider', async () => {
    configureAuth(null);
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(401);
    expect(mocks.resolveAIModelForRole).not.toHaveBeenCalled();
  });

  it('2. an omitted purpose defaults to the edit role', async () => {
    await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(mocks.resolveAIModelForRole).toHaveBeenCalledWith('user-1', 'edit', expect.anything());
  });

  it('3. purpose "edit" resolves the edit role', async () => {
    await route.POST(request({ action: 'improve', selectedText: 'hello', purpose: 'edit' }));
    expect(mocks.resolveAIModelForRole).toHaveBeenCalledWith('user-1', 'edit', expect.anything());
  });

  it('4. purpose "source-ai" resolves the source-ai role', async () => {
    await route.POST(request({ action: 'custom', selectedText: 'hello', instruction: 'Summarize.', purpose: 'source-ai' }));
    expect(mocks.resolveAIModelForRole).toHaveBeenCalledWith('user-1', 'source-ai', expect.anything());
  });

  it('5. an unrecognised purpose is rejected with 400 before any provider work', async () => {
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello', purpose: 'chat' }));
    expect(res.status).toBe(400);
    expect(mocks.resolveAIModelForRole).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('5b. a non-string purpose is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello', purpose: 7 }));
    expect(res.status).toBe(400);
    expect(mocks.resolveAIModelForRole).not.toHaveBeenCalled();
  });

  it('5c. the user id comes from the session, never from the request body', async () => {
    await route.POST(request({ action: 'improve', selectedText: 'hello', userId: 'attacker' }));
    expect(mocks.resolveAIModelForRole).toHaveBeenCalledWith('user-1', 'edit', expect.anything());
  });
});

describe('text-action BYOK: provider selection', () => {
  it('6. an unconfigured user runs on the CollabBoard Default DeepSeek descriptor', async () => {
    await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(mocks.getAIProviderAdapter).toHaveBeenCalledWith('deepseek');
    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({ model: 'deepseek-chat' }));
  });

  it('7. a source-ai role configured for OpenAI selects the OpenAI adapter', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue({
      source: 'byok', provider: 'openai', model: 'gpt-5', apiKey: 'user-openai-key', connectionId: 'c1',
    });
    await route.POST(request({ action: 'custom', selectedText: 'hello', instruction: 'Explain.', purpose: 'source-ai' }));
    expect(mocks.getAIProviderAdapter).toHaveBeenCalledWith('openai');
    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5' }));
  });

  it('8. an edit role configured for Anthropic selects the Anthropic adapter', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue({
      source: 'byok', provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: 'user-anthropic-key', connectionId: 'c2',
    });
    await route.POST(request({ action: 'shorten', selectedText: 'hello', purpose: 'edit' }));
    expect(mocks.getAIProviderAdapter).toHaveBeenCalledWith('anthropic');
    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-4-5' }));
  });

  it('8b. the two roles resolve independently -- one request never borrows the other role', async () => {
    mocks.resolveAIModelForRole.mockImplementation(async (_userId: string, role: string) =>
      role === 'source-ai'
        ? { source: 'byok', provider: 'openai', model: 'gpt-5', apiKey: 'k1', connectionId: 'c1' }
        : { source: 'byok', provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: 'k2', connectionId: 'c2' },
    );

    await route.POST(request({ action: 'custom', selectedText: 'a', instruction: 'i', purpose: 'source-ai' }));
    await route.POST(request({ action: 'improve', selectedText: 'b', purpose: 'edit' }));

    expect(mocks.getAIProviderAdapter).toHaveBeenNthCalledWith(1, 'openai');
    expect(mocks.getAIProviderAdapter).toHaveBeenNthCalledWith(2, 'anthropic');
  });

  it('9+10. the resolved model and key are forwarded to the adapter server-side', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue({
      source: 'byok', provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'user-gemini-key', connectionId: 'c3',
    });
    await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.5-flash', apiKey: 'user-gemini-key' }),
    );
  });

  it('11. the resolved API key never reaches the response body', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue({
      source: 'byok', provider: 'openai', model: 'gpt-5', apiKey: 'SECRET-USER-KEY-XYZ', connectionId: 'c1',
    });
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(JSON.stringify(await res.json())).not.toContain('SECRET-USER-KEY-XYZ');
  });

  it('11b. a client cannot choose the provider, model, key or endpoint', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue(DEFAULT_RESOLUTION);
    await route.POST(request({
      action: 'improve',
      selectedText: 'hello',
      provider: 'openai',
      providerType: 'openai',
      model: 'attacker-model',
      apiKey: 'attacker-key',
      connectionId: 'attacker-connection',
      baseUrl: 'https://attacker.example',
    }));
    // Everything executed comes from the resolver, not the body.
    expect(mocks.getAIProviderAdapter).toHaveBeenCalledWith('deepseek');
    const call = mocks.generateText.mock.calls[0][0];
    expect(call.model).toBe('deepseek-chat');
    expect(call.apiKey).toBe('server-deepseek-key');
    expect(call).not.toHaveProperty('baseUrl');
    expect(call).not.toHaveProperty('endpoint');
  });
});

describe('text-action BYOK: preserved request semantics', () => {
  it('12. the selected text reaches the adapter trimmed and verbatim, and nothing else does', async () => {
    await route.POST(request({ action: 'improve', selectedText: '  exact source words  ' }));
    const call = mocks.generateText.mock.calls[0][0];
    expect(call.user).toBe('exact source words');
    expect(Object.keys(call).sort()).toEqual(
      ['apiKey', 'maxTokens', 'model', 'signal', 'system', 'temperature', 'user'],
    );
  });

  it('13. the existing system prompt construction is preserved', async () => {
    await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    const { system } = mocks.generateText.mock.calls[0][0];
    expect(system).toContain('You transform a short piece of user-selected text for a text editor.');
    expect(system).toContain('Improve clarity, grammar, and natural wording while preserving meaning.');
    expect(system).toContain('Return ONLY the transformed text.');
  });

  it('13b. a custom instruction still becomes the system prompt task', async () => {
    await route.POST(request({ action: 'custom', selectedText: 'hello', instruction: 'Summarize this.' }));
    expect(mocks.generateText.mock.calls[0][0].system).toContain('Task: Summarize this.');
  });

  it('14+15. maxTokens and temperature keep their existing values', async () => {
    await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 1500, temperature: 0.3 }),
    );
  });

  it('16. the route passes its own AbortSignal to the adapter', async () => {
    await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    const { signal } = mocks.generateText.mock.calls[0][0];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('17. the route timeout is cleared once the adapter resolves', async () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout');
    await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('17b. the timeout is cleared even when the adapter throws', async () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout');
    mocks.generateText.mockRejectedValue(new AIProviderError('request_failed'));
    await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('18. a successful generation is returned in the existing { text } shape', async () => {
    mocks.generateText.mockResolvedValue('  polished sentence  ');
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'polished sentence' });
  });
});

describe('text-action BYOK: failure mapping', () => {
  it('19. a broken BYOK configuration is a safe 400 and never falls back to DeepSeek', async () => {
    mocks.resolveAIModelForRole.mockRejectedValue(new AIProviderError('invalid_configuration', { provider: 'openai' }));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello', purpose: 'source-ai' }));
    expect(res.status).toBe(400);
    // The whole point: no adapter ran, so no CollabBoard quota was consumed.
    expect(mocks.getAIProviderAdapter).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('20. a provider credential rejection is 400, never a session 401', async () => {
    mocks.generateText.mockRejectedValue(new AIProviderError('authentication_failed', { provider: 'openai', status: 401 }));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(401);
    expect((await res.json()).category).toBe('authentication_failed');
  });

  it('21. a provider rate limit maps to 429', async () => {
    mocks.generateText.mockRejectedValue(new AIProviderError('rate_limited', { provider: 'openai', status: 429 }));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(429);
  });

  it('22. an unavailable provider maps to 502', async () => {
    mocks.generateText.mockRejectedValue(new AIProviderError('provider_unavailable', { provider: 'openai', status: 503 }));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(502);
  });

  it('22b. model_unavailable maps to 400 and request_failed to 502', async () => {
    mocks.generateText.mockRejectedValue(new AIProviderError('model_unavailable', { provider: 'openai', status: 404 }));
    expect((await route.POST(request({ action: 'improve', selectedText: 'a' }))).status).toBe(400);

    mocks.generateText.mockRejectedValue(new AIProviderError('request_failed', { provider: 'openai' }));
    expect((await route.POST(request({ action: 'improve', selectedText: 'b' }))).status).toBe(502);
  });

  it('22c. a non-normalized error still surfaces as the existing generic 502', async () => {
    mocks.generateText.mockRejectedValue(new Error('SECRET_PROVIDER_BODY_123'));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'AI request failed.' });
  });

  it('23. no provider body, key or stack reaches the error response', async () => {
    mocks.resolveAIModelForRole.mockResolvedValue({
      source: 'byok', provider: 'openai', model: 'gpt-5', apiKey: 'SECRET-USER-KEY-XYZ', connectionId: 'c1',
    });
    mocks.generateText.mockRejectedValue(new AIProviderError('authentication_failed', { provider: 'openai', status: 401 }));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('SECRET-USER-KEY-XYZ');
    expect(body).not.toContain('SECRET_PROVIDER_BODY');
    expect(body).not.toContain('at ');
    expect(Object.keys(await (await route.POST(request({ action: 'improve', selectedText: 'x' }))).json()).sort())
      .toEqual(['category', 'error']);
  });
});

describe('text-action BYOK: source guarantees', () => {
  const source = () => readFileSync(resolve(process.cwd(), 'app/api/ai/text-action/route.ts'), 'utf8');

  it('the hard-wired DeepSeek call is gone -- no endpoint or model literal remains in the route', () => {
    const code = source();
    expect(code).not.toContain('api.deepseek.com');
    expect(code).not.toContain('deepseek-chat');
    expect(code).not.toContain('callDeepSeek');
    expect(code).not.toContain('DEEPSEEK_API_KEY');
  });

  it('execution goes through the resolver and the fixed registry, with one route-owned timer', () => {
    const code = source();
    expect(code).toContain('resolveAIModelForRole');
    expect(code).toContain('getAIProviderAdapter');
    expect(code).toContain('20_000');
    expect(code.match(/setTimeout\(/g) ?? []).toHaveLength(1);
  });
});
