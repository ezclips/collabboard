import { afterEach, describe, expect, it, vi } from 'vitest';

import { chatCompletionsGenerateText } from './chatCompletions';
import type { AITokenUsage } from './types';

/**
 * PATCH-345. The shared Chat Completions helper (DeepSeek, OpenRouter) reports
 * usage through `onUsage` using the OpenAI-style `prompt_tokens` /
 * `completion_tokens` fields.
 */

const FAKE_KEY = 'FAKE-KEY-DO-NOT-LEAK-1234';
const ENDPOINT = 'https://example.test/v1/chat/completions';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(response: Response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const BASE_INPUT = {
  model: 'deepseek-chat',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 1500,
};

/** A real Chat Completions body: one choice plus a usage object. */
const OK_BODY = {
  id: 'chatcmpl-1',
  choices: [{ index: 0, message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PATCH-345 Chat Completions usage', () => {
  it('reports prompt and completion tokens', async () => {
    mockFetch(jsonResponse(OK_BODY));
    const onUsage = vi.fn();
    await chatCompletionsGenerateText('deepseek', ENDPOINT, { ...BASE_INPUT, onUsage });
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 12, outputTokens: 34 });
  });

  it('does not call onUsage when the body carries no usage', async () => {
    mockFetch(jsonResponse({ choices: [{ message: { content: 'done' } }] }));
    const onUsage = vi.fn();
    await chatCompletionsGenerateText('deepseek', ENDPOINT, { ...BASE_INPUT, onUsage });
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('does not call onUsage on an error response', async () => {
    mockFetch(jsonResponse({ error: { message: 'nope' } }, 500));
    const onUsage = vi.fn();
    await expect(chatCompletionsGenerateText('deepseek', ENDPOINT, { ...BASE_INPUT, onUsage })).rejects.toBeTruthy();
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('a throwing onUsage does not fail the call', async () => {
    mockFetch(jsonResponse(OK_BODY));
    const onUsage = vi.fn((_usage: AITokenUsage) => { throw new Error('reporter exploded'); });
    await expect(chatCompletionsGenerateText('deepseek', ENDPOINT, { ...BASE_INPUT, onUsage })).resolves.toBe('done');
  });
});
