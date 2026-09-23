import { afterEach, describe, expect, it, vi } from 'vitest';

import { chatCompletionsGenerateText } from './chatCompletions';

/**
 * THE BYTE-IDENTITY PROMISE, PINNED.
 *
 * `chatCompletionsGenerateText` gained an optional `extraBody` so an adapter
 * can add a provider-specific field (e.g. a thinking switch). WITH NO EXTRA
 * BODY the serialized request must be EXACTLY what it was before that parameter
 * existed -- the same promise the image branch already makes, kept for the same
 * reason: a change here must not alter a call that was already working.
 *
 * The expected string below is written out in full rather than snapshotted, so
 * a field reordering, an added key or a changed default is a visible diff in
 * this file rather than an opaque snapshot update.
 */

const FAKE_KEY = 'FAKE-KEY-DO-NOT-LEAK-1234';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(response: Response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const OK_BODY = { choices: [{ message: { content: 'done' } }] };

const BASE_INPUT = {
  model: 'some-model',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 1500,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('chatCompletionsGenerateText: no extra body means byte-identical', () => {
  it('serializes a text-only call EXACTLY as before the extraBody parameter', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await chatCompletionsGenerateText('deepseek', 'https://example.test/v1/chat/completions', BASE_INPUT);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // Written out in full: a field reorder or an added key shows up here.
    expect(String(init.body)).toBe(
      '{"model":"some-model","messages":[{"role":"system","content":"system prompt"},'
      + '{"role":"user","content":"user text"}],"max_tokens":1500}',
    );
  });

  it('an EMPTY extra body is also byte-identical', async () => {
    const withEmpty = mockFetch(jsonResponse(OK_BODY));
    await chatCompletionsGenerateText('deepseek', 'https://example.test/v1/chat/completions', BASE_INPUT, {});
    const [, initEmpty] = withEmpty.mock.calls[0] as unknown as [string, RequestInit];

    vi.unstubAllGlobals();
    const withNone = mockFetch(jsonResponse(OK_BODY));
    await chatCompletionsGenerateText('deepseek', 'https://example.test/v1/chat/completions', BASE_INPUT);
    const [, initNone] = withNone.mock.calls[0] as unknown as [string, RequestInit];

    expect(String(initEmpty.body)).toBe(String(initNone.body));
  });

  it('an extra body is spread in ADDITIVELY', async () => {
    const fetchMock = mockFetch(jsonResponse(OK_BODY));

    await chatCompletionsGenerateText(
      'deepseek',
      'https://example.test/v1/chat/completions',
      BASE_INPUT,
      { thinking: { type: 'disabled' } },
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    // The owned fields are untouched, and the extra key is present.
    expect(body.model).toBe('some-model');
    expect(body.max_tokens).toBe(1500);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });
});
