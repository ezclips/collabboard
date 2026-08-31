import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIProviderError } from './errors';
import { OPENAI_ENDPOINT, openAIAdapter } from './openAI';

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

/** Responses API shape: a reasoning item, then the assistant message. */
const OK_BODY = {
  output: [
    { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'ignored thinking' }] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'the answer' }] },
  ],
};

const BASE_INPUT = {
  model: 'gpt-5',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 1200,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenAI adapter', () => {
  it('POSTs to the fixed Responses endpoint, not Chat Completions', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await openAIAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENAI_ENDPOINT);
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(url).not.toContain('chat/completions');
    expect(init.method).toBe('POST');
  });

  it('authenticates with a Bearer header and keeps the key out of the URL and body', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await openAIAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(url).not.toContain(FAKE_KEY);
    expect(String(init.body)).not.toContain(FAKE_KEY);
  });

  it('uses Responses semantics: instructions, input and max_output_tokens', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await openAIAdapter.generateText(BASE_INPUT);

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.model).toBe('gpt-5');
    expect(body.instructions).toBe('system prompt');
    expect(body.input).toBe('user text');
    expect(body.max_output_tokens).toBe(1200);
    // Chat Completions fields must not appear.
    expect(body).not.toHaveProperty('messages');
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('sends only the generation fields -- no board, document or page context', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await openAIAdapter.generateText(BASE_INPUT);

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(Object.keys(body).sort()).toEqual(['input', 'instructions', 'max_output_tokens', 'model']);
  });

  it('includes temperature only when supplied', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));
    await openAIAdapter.generateText({ ...BASE_INPUT, temperature: 0.5 });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).temperature).toBe(0.5);
  });

  it('forwards the AbortSignal', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));
    const controller = new AbortController();

    await openAIAdapter.generateText({ ...BASE_INPUT, signal: controller.signal });

    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(controller.signal);
  });

  it('extracts text from output_text parts of message items only', async () => {
    mockFetch(jsonResponse(OK_BODY));
    await expect(openAIAdapter.generateText(BASE_INPUT)).resolves.toBe('the answer');
  });

  it('falls back to output_text when the structured walk finds nothing', async () => {
    mockFetch(jsonResponse({ output: [], output_text: 'flat fallback' }));
    await expect(openAIAdapter.generateText(BASE_INPUT)).resolves.toBe('flat fallback');
  });

  it('fails when the response carries no textual output', async () => {
    for (const body of [
      { output: [{ type: 'reasoning', content: [{ type: 'reasoning_text', text: 'only thinking' }] }] },
      { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] },
      {},
    ]) {
      vi.unstubAllGlobals();
      mockFetch(jsonResponse(body));
      await expect(openAIAdapter.generateText(BASE_INPUT)).rejects.toMatchObject({
        category: 'request_failed',
      });
    }
  });

  it.each([
    [401, 'authentication_failed'],
    [429, 'rate_limited'],
    [404, 'model_unavailable'],
    [500, 'provider_unavailable'],
    [400, 'request_failed'],
  ])('normalizes HTTP %i to %s without leaking the body or key', async (status, category) => {
    mockFetch(jsonResponse({ error: { message: SECRET_BODY }, key: FAKE_KEY }, status));

    const error = await openAIAdapter.generateText(BASE_INPUT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIProviderError);
    expect(error).toMatchObject({ category, provider: 'openai', status });
    const serialized = `${(error as Error).message}|${JSON.stringify(error)}`;
    expect(serialized).not.toContain(SECRET_BODY);
    expect(serialized).not.toContain(FAKE_KEY);
  });
});
