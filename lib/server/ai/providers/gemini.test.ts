import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIProviderError } from './errors';
import { GEMINI_ENDPOINT, geminiAdapter } from './gemini';

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
  model_output: [
    { type: 'thought', text: 'ignored reasoning' },
    { type: 'text', text: 'the answer' },
  ],
};

const BASE_INPUT = {
  model: 'gemini-3-pro',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 700,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Gemini adapter', () => {
  it('POSTs to the fixed Interactions endpoint', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await geminiAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GEMINI_ENDPOINT);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(init.method).toBe('POST');
  });

  it('sends the key as the x-goog-api-key HEADER and never as a query parameter', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await geminiAdapter.generateText(BASE_INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(FAKE_KEY);
    expect(url).not.toContain('key=');
    expect(url).not.toContain('?');
    expect(url).not.toContain(FAKE_KEY);
    expect(String(init.body)).not.toContain(FAKE_KEY);
  });

  it('sends model, input, system_instruction, store:false and generation_config', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await geminiAdapter.generateText(BASE_INPUT);

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.model).toBe('gemini-3-pro');
    expect(body.input).toBe('user text');
    expect(body.system_instruction).toBe('system prompt');
    expect(body.store).toBe(false);
    expect(body.generation_config.max_output_tokens).toBe(700);
    // Stateless: no server-side conversation is referenced.
    expect(body).not.toHaveProperty('previous_interaction_id');
  });

  it('includes temperature in generation_config only when supplied', async () => {
    const withTemp = mockFetch(jsonResponse(OK_BODY));
    await geminiAdapter.generateText({ ...BASE_INPUT, temperature: 0.6 });
    expect(JSON.parse(String((withTemp.mock.calls[0] as unknown as [string, RequestInit])[1].body)).generation_config.temperature).toBe(0.6);

    vi.unstubAllGlobals();
    const withoutTemp = mockFetch(jsonResponse(OK_BODY));
    await geminiAdapter.generateText(BASE_INPUT);
    expect(JSON.parse(String((withoutTemp.mock.calls[0] as unknown as [string, RequestInit])[1].body)).generation_config)
      .not.toHaveProperty('temperature');
  });

  it('forwards the AbortSignal', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));
    const controller = new AbortController();

    await geminiAdapter.generateText({ ...BASE_INPUT, signal: controller.signal });

    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(controller.signal);
  });

  it('extracts text only from model_output, ignoring thought and tool steps', async () => {
    mockFetch(jsonResponse({
      candidates: [{ content: { parts: [{ text: 'must be ignored' }] } }],
      model_output: [
        { type: 'thought', text: 'ignored reasoning' },
        { type: 'tool_call', text: 'ignored tool' },
        { type: 'text', content: [{ type: 'text', text: 'first ' }] },
        { type: 'text', text: 'second' },
      ],
    }));

    await expect(geminiAdapter.generateText(BASE_INPUT)).resolves.toBe('first second');
  });

  it('fails when model_output carries no usable text', async () => {
    for (const body of [
      { model_output: [{ type: 'thought', text: 'only reasoning' }] },
      { model_output: [] },
      { candidates: [{ content: { parts: [{ text: 'wrong field' }] } }] },
      {},
    ]) {
      vi.unstubAllGlobals();
      mockFetch(jsonResponse(body));
      await expect(geminiAdapter.generateText(BASE_INPUT)).rejects.toMatchObject({
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
    [400, 'request_failed'],
  ])('normalizes HTTP %i to %s without leaking the body or key', async (status, category) => {
    mockFetch(jsonResponse({ error: { message: SECRET_BODY }, key: FAKE_KEY }, status));

    const error = await geminiAdapter.generateText(BASE_INPUT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIProviderError);
    expect(error).toMatchObject({ category, provider: 'gemini', status });
    const serialized = `${(error as Error).message}|${JSON.stringify(error)}`;
    expect(serialized).not.toContain(SECRET_BODY);
    expect(serialized).not.toContain(FAKE_KEY);
  });
});
