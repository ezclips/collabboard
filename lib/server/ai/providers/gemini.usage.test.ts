import { afterEach, describe, expect, it, vi } from 'vitest';

import { geminiAdapter } from './gemini';
import type { AITokenUsage } from './types';

/**
 * PATCH-345. The Gemini adapter reports usage through `onUsage`.
 *
 * The adapter speaks the INTERACTIONS API, whose usage lives under
 * `usage.total_input_tokens` / `total_output_tokens` / `total_thought_tokens` --
 * NOT the generateContent `usageMetadata.promptTokenCount` shape.
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
  model: 'gemini-3-pro',
  apiKey: FAKE_KEY,
  system: 'system prompt',
  user: 'user text',
  maxTokens: 1200,
};

/** A real Interactions API body: a model_output step plus a usage object. */
const OK_BODY = {
  steps: [{ type: 'model_output', content: [{ type: 'text', text: 'the answer' }] }],
  usage: { total_input_tokens: 210, total_output_tokens: 42, total_tokens: 252 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PATCH-345 Gemini adapter usage', () => {
  it('reports total input and output tokens from the Interactions usage field', async () => {
    mockFetch(jsonResponse(OK_BODY));
    const onUsage = vi.fn();
    await geminiAdapter.generateText({ ...BASE_INPUT, onUsage });
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 210, outputTokens: 42 });
  });

  it('adds thought tokens to output', async () => {
    mockFetch(jsonResponse({
      ...OK_BODY,
      usage: { total_input_tokens: 210, total_output_tokens: 42, total_thought_tokens: 18 },
    }));
    const onUsage = vi.fn();
    await geminiAdapter.generateText({ ...BASE_INPUT, onUsage });
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 210, outputTokens: 60 });
  });

  it('does not call onUsage for a generateContent usageMetadata-only body', async () => {
    // The WRONG API's shape: it must report nothing rather than be misread.
    mockFetch(jsonResponse({
      steps: [{ type: 'model_output', content: [{ type: 'text', text: 'a' }] }],
      usageMetadata: { promptTokenCount: 210, candidatesTokenCount: 42, totalTokenCount: 252 },
    }));
    const onUsage = vi.fn();
    await geminiAdapter.generateText({ ...BASE_INPUT, onUsage });
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('does not call onUsage when the body carries no usage', async () => {
    mockFetch(jsonResponse({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'a' }] }] }));
    const onUsage = vi.fn();
    await geminiAdapter.generateText({ ...BASE_INPUT, onUsage });
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('does not call onUsage on an error response', async () => {
    mockFetch(jsonResponse({ error: { message: 'nope' } }, 500));
    const onUsage = vi.fn();
    await expect(geminiAdapter.generateText({ ...BASE_INPUT, onUsage })).rejects.toBeTruthy();
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('a throwing onUsage does not fail the call', async () => {
    mockFetch(jsonResponse(OK_BODY));
    const onUsage = vi.fn((_usage: AITokenUsage) => { throw new Error('reporter exploded'); });
    await expect(geminiAdapter.generateText({ ...BASE_INPUT, onUsage })).resolves.toBe('the answer');
  });
});
