import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIProviderError } from './errors';
import { OPENCODE_GO_ENDPOINT, openCodeGoAdapter } from './openCodeGo';

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

const OK_BODY = { choices: [{ message: { content: 'go completion' } }] };

const BASE_INPUT = {
  model: 'deepseek-v4.1-flash',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 800,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenCode Go adapter', () => {
  it('POSTs to the fixed OpenCode Go endpoint', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await openCodeGoAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENCODE_GO_ENDPOINT);
    expect(url).toBe('https://opencode.ai/zen/go/v1/chat/completions');
    expect(init.method).toBe('POST');
  });

  it('authenticates with a Bearer header, never the URL or body', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await openCodeGoAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(url).not.toContain(FAKE_KEY);
    expect(String(init.body)).not.toContain(FAKE_KEY);
  });

  it('forwards the opaque model id untouched, plus messages and max_tokens', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await openCodeGoAdapter.generateText({ ...BASE_INPUT, temperature: 0.2 });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    // NOT normalised, NOT remapped: whatever the user typed goes through.
    expect(body.model).toBe('deepseek-v4.1-flash');
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

    await openCodeGoAdapter.generateText({ ...BASE_INPUT, signal: controller.signal });

    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(controller.signal);
  });

  it('parses the completion', async () => {
    mockFetch(jsonResponse(OK_BODY));
    await expect(openCodeGoAdapter.generateText(BASE_INPUT)).resolves.toBe('go completion');
  });

  it.each([
    [401, 'authentication_failed'],
    [429, 'rate_limited'],
    [404, 'model_unavailable'],
    [502, 'provider_unavailable'],
    [422, 'request_failed'],
  ])('normalizes HTTP %i to %s without leaking the body', async (status, category) => {
    mockFetch(jsonResponse({ error: SECRET_BODY }, status));

    const error = await openCodeGoAdapter.generateText(BASE_INPUT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIProviderError);
    expect(error).toMatchObject({ category, provider: 'opencode-go', status });
    expect(`${(error as Error).message}|${JSON.stringify(error)}`).not.toContain(SECRET_BODY);
  });
});

describe('the image refusal is the contract, not a default', () => {
  it('declares itself text-only', () => {
    // The property the client-safe mirror is pinned against.
    expect(openCodeGoAdapter.carriesImages).toBe(false);
  });

  it('REFUSES an image-bearing input rather than silently sending text-only', async () => {
    // A dropped image answers from text alone while the user believes the model
    // looked at their image -- a wrong answer that reads like a right one, which
    // types.ts names explicitly. So it must throw, and it must throw BEFORE any
    // request is made.
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    // The adapter throws SYNCHRONOUSLY (it is not async), so the refusal must be
    // caught around the call rather than with `.catch` on a promise.
    let error: unknown = null;
    try {
      await openCodeGoAdapter.generateText({
        ...BASE_INPUT,
        images: [{ mediaType: 'image/webp', base64: 'QUJD' }],
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AIProviderError);
    expect(error).toMatchObject({ category: 'invalid_configuration' });
    // Nothing left the process: no request, so no private crop on the wire.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
