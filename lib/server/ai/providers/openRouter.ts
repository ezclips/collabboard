// OpenRouter adapter.
//
// SERVER ONLY.
//
// OpenRouter speaks Chat Completions at ONE fixed endpoint. The base URL is a
// constant here and is never user-supplied: a configurable endpoint is an SSRF
// surface, which is why the custom OpenAI-compatible provider is deferred.
//
// The optional HTTP-Referer / X-Title attribution headers are deliberately not
// sent: they are leaderboard metadata, not required for the call.

import { chatCompletionsGenerateText } from './chatCompletions';
import type { AIGenerateTextInput, AIProviderAdapter } from './types';

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export const openRouterAdapter: AIProviderAdapter = {
  provider: 'openrouter',
  generateText(input: AIGenerateTextInput): Promise<string> {
    return chatCompletionsGenerateText('openrouter', OPENROUTER_ENDPOINT, input);
  },
};
