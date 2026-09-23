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
  // Chat Completions carries image_url parts, and the shared helper builds them.
  carriesImages: true,
  generateText(input: AIGenerateTextInput): Promise<string> {
    // THINKING OFF, OpenRouter's documented switch. Measured live: a thinking
    // model here reasoned past the route's own 20 s timeout and returned
    // nothing. `reasoning: { enabled: false }` is the request that stops it;
    // absent, OpenRouter keeps the model's own default.
    const extraBody = input.reasoning === 'off' ? { reasoning: { enabled: false } } : undefined;
    return chatCompletionsGenerateText('openrouter', OPENROUTER_ENDPOINT, input, extraBody);
  },
};
