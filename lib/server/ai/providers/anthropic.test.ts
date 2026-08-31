import { afterEach, describe, expect, it, vi } from 'vitest';

import { ANTHROPIC_ENDPOINT, ANTHROPIC_VERSION, anthropicAdapter } from './anthropic';
import { AIProviderError } from './errors';

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

const OK_BODY = {
  content: [
    { type: 'thinking', thinking: 'ignored reasoning' },
    { type: 'text', text: 'the reply' },
  ],
};

const BASE_INPUT = {
  model: 'claude-opus-5',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 900,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Anthropic adapter', () => {
  it('POSTs to the fixed Messages endpoint', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await anthropicAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_ENDPOINT);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
  });

  it('authenticates with x-api-key -- not a Bearer header -- and sends anthropic-version', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await anthropicAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(FAKE_KEY);
    expect(headers.Authorization).toBeUndefined();
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(url).not.toContain(FAKE_KEY);
    expect(String(init.body)).not.toContain(FAKE_KEY);
  });

  it('sends model, top-level system, max_tokens and a single user message', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await anthropicAdapter.generateText(BASE_INPUT);

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.model).toBe('claude-opus-5');
    expect(body.system).toBe('system prompt');
    expect(body.max_tokens).toBe(900);
    expect(body.messages).toEqual([{ role: 'user', content: 'user text' }]);
    // The system prompt must not also appear as a message turn.
    expect(body.messages).toHaveLength(1);
  });

  it('includes temperature only when supplied', async () => {
    const withTemp = mockFetch(jsonResponse(OK_BODY));
    await anthropicAdapter.generateText({ ...BASE_INPUT, temperature: 0.4 });
    expect(JSON.parse(String((withTemp.mock.calls[0] as unknown as [string, RequestInit])[1].body)).temperature).toBe(0.4);

    vi.unstubAllGlobals();
    const withoutTemp = mockFetch(jsonResponse(OK_BODY));
    await anthropicAdapter.generateText(BASE_INPUT);
    expect(JSON.parse(String((withoutTemp.mock.calls[0] as unknown as [string, RequestInit])[1].body)))
      .not.toHaveProperty('temperature');
  });

  it('forwards the AbortSignal', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));
    const controller = new AbortController();

    await anthropicAdapter.generateText({ ...BASE_INPUT, signal: controller.signal });

    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(controller.signal);
  });

  it('joins text blocks and ignores non-text blocks', async () => {
    mockFetch(jsonResponse({
      content: [
        { type: 'thinking', thinking: 'ignored' },
        { type: 'text', text: 'part one ' },
        { type: 'tool_use', id: 'x', name: 'y', input: {} },
        { type: 'text', text: 'part two' },
      ],
    }));

    await expect(anthropicAdapter.generateText(BASE_INPUT)).resolves.toBe('part one part two');
  });

  it('fails when the response contains no text block at all', async () => {
    for (const body of [
      { content: [{ type: 'thinking', thinking: 'only reasoning' }] },
      { content: [] },
      {},
    ]) {
      vi.unstubAllGlobals();
      mockFetch(jsonResponse(body));
      await expect(anthropicAdapter.generateText(BASE_INPUT)).rejects.toMatchObject({
        category: 'request_failed',
      });
    }
  });

  it.each([
    [401, 'authentication_failed'],
    [429, 'rate_limited'],
    [404, 'model_unavailable'],
    [529, 'provider_unavailable'],
    [400, 'request_failed'],
  ])('normalizes HTTP %i to %s without leaking the body or key', async (status, category) => {
    mockFetch(jsonResponse({ error: { message: SECRET_BODY }, key: FAKE_KEY }, status));

    const error = await anthropicAdapter.generateText(BASE_INPUT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIProviderError);
    expect(error).toMatchObject({ category, provider: 'anthropic', status });
    const serialized = `${(error as Error).message}|${JSON.stringify(error)}`;
    expect(serialized).not.toContain(SECRET_BODY);
    expect(serialized).not.toContain(FAKE_KEY);
  });
});
