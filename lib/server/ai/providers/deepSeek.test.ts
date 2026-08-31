import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEEPSEEK_DEFAULT_MODEL, DEEPSEEK_ENDPOINT, deepSeekAdapter } from './deepSeek';
import { AIProviderError } from './errors';

// Synthetic only. If either string ever reaches a thrown error, the leak tests
// below fail -- that is their entire job.
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

const OK_BODY = { choices: [{ message: { content: 'the completion' } }] };

const BASE_INPUT = {
  model: 'deepseek-chat',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 1500,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DeepSeek adapter', () => {
  it('POSTs to the fixed DeepSeek endpoint', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await deepSeekAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DEEPSEEK_ENDPOINT);
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(init.method).toBe('POST');
  });

  it('sends the credential as a Bearer header and never in the URL or body', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await deepSeekAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(url).not.toContain(FAKE_KEY);
    expect(String(init.body)).not.toContain(FAKE_KEY);
  });

  it('forwards model, the system/user message pair and max_tokens', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await deepSeekAdapter.generateText(BASE_INPUT);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('deepseek-chat');
    expect(body.messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'user text' },
    ]);
    expect(body.max_tokens).toBe(1500);
  });

  it('includes temperature only when supplied', async () => {
    const withTemp = mockFetch(jsonResponse(OK_BODY));
    await deepSeekAdapter.generateText({ ...BASE_INPUT, temperature: 0.3 });
    expect(JSON.parse(String((withTemp.mock.calls[0] as unknown as [string, RequestInit])[1].body)).temperature).toBe(0.3);

    vi.unstubAllGlobals();
    const withoutTemp = mockFetch(jsonResponse(OK_BODY));
    await deepSeekAdapter.generateText(BASE_INPUT);
    expect(JSON.parse(String((withoutTemp.mock.calls[0] as unknown as [string, RequestInit])[1].body)))
      .not.toHaveProperty('temperature');
  });

  it('forwards the caller AbortSignal to fetch', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));
    const controller = new AbortController();

    await deepSeekAdapter.generateText({ ...BASE_INPUT, signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('parses the completion and trims it', async () => {
    mockFetch(jsonResponse({ choices: [{ message: { content: '  spaced  ' } }] }));
    await expect(deepSeekAdapter.generateText(BASE_INPUT)).resolves.toBe('spaced');
  });

  it('fails when the provider returns no usable text', async () => {
    for (const body of [{ choices: [] }, { choices: [{ message: { content: '' } }] }, {}]) {
      vi.unstubAllGlobals();
      mockFetch(jsonResponse(body));
      await expect(deepSeekAdapter.generateText(BASE_INPUT)).rejects.toMatchObject({
        category: 'request_failed',
      });
    }
  });

  it.each([
    [401, 'authentication_failed'],
    [403, 'authentication_failed'],
    [429, 'rate_limited'],
    [404, 'model_unavailable'],
    [500, 'provider_unavailable'],
    [503, 'provider_unavailable'],
    [400, 'request_failed'],
  ])('normalizes HTTP %i to %s', async (status, category) => {
    mockFetch(jsonResponse({ error: SECRET_BODY }, status));

    await expect(deepSeekAdapter.generateText(BASE_INPUT)).rejects.toMatchObject({
      category,
      provider: 'deepseek',
      status,
    });
  });

  it('never leaks the provider body or the credential into the thrown error', async () => {
    mockFetch(jsonResponse({ error: SECRET_BODY, echoed_key: FAKE_KEY }, 400));

    const error = await deepSeekAdapter.generateText(BASE_INPUT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIProviderError);
    const serialized = `${(error as Error).message}|${(error as Error).stack ?? ''}|${JSON.stringify(error)}`;
    expect(serialized).not.toContain(SECRET_BODY);
    expect(serialized).not.toContain(FAKE_KEY);
  });

  it('maps a network failure to provider_unavailable but lets cancellation through', async () => {
    mockFetch(new Error('socket hang up'));
    await expect(deepSeekAdapter.generateText(BASE_INPUT)).rejects.toMatchObject({
      category: 'provider_unavailable',
    });

    vi.unstubAllGlobals();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    mockFetch(abortError);
    await expect(deepSeekAdapter.generateText(BASE_INPUT)).rejects.toThrow(abortError);
  });

  it('exposes the CollabBoard default model id used by the resolver', () => {
    expect(DEEPSEEK_DEFAULT_MODEL).toBe('deepseek-chat');
    expect(deepSeekAdapter.provider).toBe('deepseek');
  });
});
