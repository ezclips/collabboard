// Adapter lookup.
//
// SERVER ONLY.
//
// A closed, statically-built map -- not a runtime registration system. Every
// executable provider is known at build time, and there is no path by which a
// caller-supplied string becomes an endpoint: an unrecognised provider is a
// configuration error, never a URL to fetch.

import { anthropicAdapter } from './anthropic';
import { deepSeekAdapter } from './deepSeek';
import { aiProviderInvalidConfiguration } from './errors';
import { geminiAdapter } from './gemini';
import { openAIAdapter } from './openAI';
import { openRouterAdapter } from './openRouter';
import type { AIExecutionProvider, AIProviderAdapter } from './types';

const ADAPTERS: Record<AIExecutionProvider, AIProviderAdapter> = {
  deepseek: deepSeekAdapter,
  openai: openAIAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  openrouter: openRouterAdapter,
};

/**
 * Throws `invalid_configuration` for anything unknown -- including a provider
 * string that survived a torn or hand-edited database row.
 */
export function getAIProviderAdapter(provider: AIExecutionProvider): AIProviderAdapter {
  const adapter = ADAPTERS[provider] as AIProviderAdapter | undefined;
  if (!adapter) throw aiProviderInvalidConfiguration();
  return adapter;
}
