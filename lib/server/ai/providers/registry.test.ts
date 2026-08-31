import { describe, expect, it } from 'vitest';

import { anthropicAdapter } from './anthropic';
import { deepSeekAdapter } from './deepSeek';
import { AIProviderError } from './errors';
import { geminiAdapter } from './gemini';
import { openAIAdapter } from './openAI';
import { openRouterAdapter } from './openRouter';
import { getAIProviderAdapter } from './registry';
import { AI_EXECUTION_PROVIDERS, type AIExecutionProvider } from './types';

describe('AI provider registry', () => {
  it('resolves exactly the five executable providers', () => {
    expect([...AI_EXECUTION_PROVIDERS].sort()).toEqual([
      'anthropic',
      'deepseek',
      'gemini',
      'openai',
      'openrouter',
    ]);
  });

  it.each([
    ['deepseek', deepSeekAdapter],
    ['openai', openAIAdapter],
    ['anthropic', anthropicAdapter],
    ['gemini', geminiAdapter],
    ['openrouter', openRouterAdapter],
  ] as const)('maps %s to its adapter', (provider, adapter) => {
    const resolved = getAIProviderAdapter(provider);
    expect(resolved).toBe(adapter);
    expect(resolved.provider).toBe(provider);
  });

  it('rejects an unknown or torn provider value as invalid_configuration', () => {
    for (const bogus of ['ollama', 'azure', 'custom', '', 'DEEPSEEK']) {
      const error = (() => {
        try {
          getAIProviderAdapter(bogus as AIExecutionProvider);
          return null;
        } catch (caught) {
          return caught;
        }
      })();

      expect(error).toBeInstanceOf(AIProviderError);
      expect(error).toMatchObject({ category: 'invalid_configuration' });
    }
  });

  it('exposes no way to supply an endpoint of its own', () => {
    // The registry takes a provider identifier and nothing else -- there is no
    // base-URL parameter to smuggle an arbitrary host through.
    expect(getAIProviderAdapter.length).toBe(1);
  });
});
