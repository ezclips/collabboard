import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIProviderError } from './errors';
import { OPENROUTER_ENDPOINT, openRouterAdapter } from './openRouter';

const FAKE_KEY = 'FAKE-KEY-DO-NOT-LEAK-1234';
const SECRET_BODY = 'SECRET_PROVIDER_BODY_123';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const OK_BODY = { choices: [{ message: { content: 'routed completion' } }] };

const BASE_INPUT = {
  model: 'anthropic/claude-opus-5',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 800,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenRouter adapter', () => {
  it('POSTs to the fixed OpenRouter endpoint', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await openRouterAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_ENDPOINT);
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.method).toBe('POST');
  });

  it('authenticates with a Bearer header, never the URL or body', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await openRouterAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(url).not.toContain(FAKE_KEY);
    expect(String(init.body)).not.toContain(FAKE_KEY);
  });

  it('forwards the opaque model id, messages and max_tokens', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await openRouterAdapter.generateText({ ...BASE_INPUT, temperature: 0.2 });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.model).toBe('anthropic/claude-opus-5');
    expect(body.messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'user text' },
    ]);
    expect(body.max_tokens).toBe(800);
    expect(body.temperature).toBe(0.2);
  });

  it('forwards the AbortSignal', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));
    const controller = new AbortController();

    await openRouterAdapter.generateText({ ...BASE_INPUT, signal: controller.signal });

    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(controller.signal);
  });

  it('parses the completion', async () => {
    mockFetch(jsonResponse(OK_BODY));
    await expect(openRouterAdapter.generateText(BASE_INPUT)).resolves.toBe('routed completion');
  });

  it.each([
    [401, 'authentication_failed'],
    [429, 'rate_limited'],
    [404, 'model_unavailable'],
    [502, 'provider_unavailable'],
    [422, 'request_failed'],
  ])('normalizes HTTP %i to %s without leaking the body', async (status, category) => {
    mockFetch(jsonResponse({ error: SECRET_BODY }, status));

    const error = await openRouterAdapter.generateText(BASE_INPUT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIProviderError);
    expect(error).toMatchObject({ category, provider: 'openrouter', status });
    expect(`${(error as Error).message}|${JSON.stringify(error)}`).not.toContain(SECRET_BODY);
  });
});
