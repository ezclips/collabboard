import { afterEach, describe, expect, it, vi } from 'vitest';

import { anthropicAdapter } from './anthropic';
import type { AITokenUsage } from './types';

/**
 * PATCH-345. The Anthropic adapter reports token usage through the optional
 * `onUsage` callback. Kept in its own file because `anthropic.test.ts` has
 * unrelated local changes.
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

const BASE_INPUT = {
  model: 'claude-sonnet-5',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 1200,
};

/** A real Messages API body: content blocks plus a usage object. */
const OK_BODY = {
  id: 'msg_01',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text: 'the answer' }],
  usage: { input_tokens: 2095, output_tokens: 503 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PATCH-345 Anthropic adapter usage', () => {
  it('reports input and output tokens from the Messages usage field', async () => {
    mockFetch(jsonResponse(OK_BODY));
    const onUsage = vi.fn();
    const text = await anthropicAdapter.generateText({ ...BASE_INPUT, onUsage });
    expect(text).toBe('the answer');
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 2095, outputTokens: 503 });
  });

  it('adds cache creation and cache read tokens to input', async () => {
    mockFetch(jsonResponse({
      ...OK_BODY,
      usage: {
        input_tokens: 2095,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 50,
        output_tokens: 503,
      },
    }));
    const onUsage = vi.fn();
    await anthropicAdapter.generateText({ ...BASE_INPUT, onUsage });
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 2245, outputTokens: 503 });
  });

  it('does not call onUsage when the body carries no usage', async () => {
    mockFetch(jsonResponse({ content: [{ type: 'text', text: 'answer' }] }));
    const onUsage = vi.fn();
    await anthropicAdapter.generateText({ ...BASE_INPUT, onUsage });
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('does not call onUsage on an error response', async () => {
    mockFetch(jsonResponse({ error: { message: 'nope' } }, 500));
    const onUsage = vi.fn();
    await expect(anthropicAdapter.generateText({ ...BASE_INPUT, onUsage })).rejects.toBeTruthy();
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('a throwing onUsage does not fail the call', async () => {
    mockFetch(jsonResponse(OK_BODY));
    const onUsage = vi.fn((_usage: AITokenUsage) => { throw new Error('reporter exploded'); });
    await expect(anthropicAdapter.generateText({ ...BASE_INPUT, onUsage })).resolves.toBe('the answer');
  });
});
