import { afterEach, describe, expect, it, vi } from 'vitest';

import { openAIAdapter } from './openAI';
import type { AITokenUsage } from './types';

/** PATCH-345. The OpenAI Responses adapter reports usage through `onUsage`. */

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
  model: 'gpt-5',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 1200,
};

/** A real Responses API body: a message item plus a usage object. */
const OK_BODY = {
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'the answer' }] }],
  usage: { input_tokens: 320, output_tokens: 48, total_tokens: 368 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PATCH-345 OpenAI adapter usage', () => {
  it('reports input and output tokens from the Responses usage field', async () => {
    mockFetch(jsonResponse(OK_BODY));
    const onUsage = vi.fn();
    await openAIAdapter.generateText({ ...BASE_INPUT, onUsage });
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 320, outputTokens: 48 });
  });

  it('does not call onUsage when the body carries no usage', async () => {
    mockFetch(jsonResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'a' }] }] }));
    const onUsage = vi.fn();
    await openAIAdapter.generateText({ ...BASE_INPUT, onUsage });
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('does not call onUsage on an error response', async () => {
    mockFetch(jsonResponse({ error: { message: 'nope' } }, 500));
    const onUsage = vi.fn();
    await expect(openAIAdapter.generateText({ ...BASE_INPUT, onUsage })).rejects.toBeTruthy();
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('a throwing onUsage does not fail the call', async () => {
    mockFetch(jsonResponse(OK_BODY));
    const onUsage = vi.fn((_usage: AITokenUsage) => { throw new Error('reporter exploded'); });
    await expect(openAIAdapter.generateText({ ...BASE_INPUT, onUsage })).resolves.toBe('the answer');
  });
});
