import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIProviderError } from './errors';
import { GEMINI_ENDPOINT, geminiAdapter } from './gemini';

/**
 * WHY THE SUCCESS FIXTURE IS A REAL RESPONSE AND NOT A SHAPE.
 *
 * The previous fixture was `{ model_output: [...] }` -- a top-level array that
 * the Interactions API never returns. It was invented from the same wrong
 * assumption as the adapter it tested, so the two agreed with each other and
 * disagreed with Google. Every test passed while the adapter could not extract
 * a single answer in production: it read a key that is never present, found
 * nothing on every reply, and requireProviderText turned that into a
 * `request_failed` indistinguishable from the provider rejecting the request.
 *
 * A fixture an author invents can only ever test that the code matches the
 * author's belief. So OK_BODY below is the VERBATIM body of a live call to
 * https://generativelanguage.googleapis.com/v1beta/interactions
 * (model gemini-3.5-flash, input "Say the single word: hello", HTTP 200),
 * captured 2026-09-17, with only the opaque `signature` blob truncated -- it is
 * several hundred bytes of encrypted thought state and contributes nothing.
 *
 * Test 3 is the guard that keeps the old spelling out: a payload whose text
 * sits under a top-level `model_output` must FAIL, because reading that key
 * again would be the original defect returning.
 */

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

/** VERBATIM live response. See the header for why this is not hand-written. */
const OK_BODY = {
  id: 'v1_ChZTZEtyYXFXVUJlYUJ4czBQdzhfZEdREhZTZEtyYXFXVUJlYUJ4czBQdzhfZEdR',
  status: 'completed',
  usage: {
    total_tokens: 97,
    total_input_tokens: 7,
    input_tokens_by_modality: [{ modality: 'text', tokens: 7 }],
    total_cached_tokens: 0,
    total_output_tokens: 1,
    total_tool_use_tokens: 0,
    total_thought_tokens: 89,
    raw_prompt_token: 38,
  },
  created: '2026-09-17T11:43:05Z',
  updated: '2026-09-17T11:43:05Z',
  service_tier: 'standard',
  steps: [
    // A thought step carries an opaque signature and NO text at all.
    { signature: 'EuMDCuADARFNMg8WNSjDPHDbby5bM/N2iBebmRBvSlQYC+MRZqY7xDVod1aZ5XK5…', type: 'thought' },
    // The answer. `model_output` is a step TYPE here, never a top-level key.
    { content: [{ text: 'hello', type: 'text' }], type: 'model_output' },
  ],
  object: 'interaction',
  model: 'gemini-3.5-flash',
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

  // 1. THE REAL RESPONSE. This is the assertion the old fixture could never
  //    make: the verbatim live body, extracted correctly.
  it('1. extracts the answer from a VERBATIM live response body', async () => {
    mockFetch(jsonResponse(OK_BODY));
    await expect(geminiAdapter.generateText(BASE_INPUT)).resolves.toBe('hello');
  });

  it('2. reads text from steps, ignoring thought and tool traffic', async () => {
    mockFetch(jsonResponse({
      candidates: [{ content: { parts: [{ text: 'must be ignored' }] } }],
      steps: [
        { type: 'thought', signature: 'opaque' },
        { type: 'thinking', text: 'ignored reasoning' },
        { type: 'tool_call', text: 'ignored tool' },
        { type: 'model_output', content: [{ type: 'text', text: 'first ' }] },
        { type: 'model_output', text: 'second' },
      ],
    }));

    await expect(geminiAdapter.generateText(BASE_INPUT)).resolves.toBe('first second');
  });

  // 3. THE GUARD. The defect was reading a TOP-LEVEL `model_output`, a key the
  //    API never sends. If anyone restores that spelling, this body starts
  //    succeeding -- so its continued failure is what proves the extractor is
  //    reading `steps` and nothing else.
  it('3. does NOT read a top-level model_output -- the original defect', async () => {
    mockFetch(jsonResponse({
      model_output: [
        { type: 'text', text: 'this must never become the answer' },
        { type: 'model_output', content: [{ type: 'text', text: 'nor this' }] },
      ],
    }));

    await expect(geminiAdapter.generateText(BASE_INPUT)).rejects.toMatchObject({
      category: 'request_failed',
    });
  });

  it('4. fails when steps carry no usable text', async () => {
    for (const body of [
      // A thought-only reply: exactly what a live call returns when the model
      // spends its whole budget thinking. It is a failed request, not an
      // empty answer.
      { steps: [{ type: 'thought', signature: 'opaque' }] },
      { steps: [{ type: 'thinking', text: 'only reasoning' }] },
      { steps: [] },
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
