// Anthropic adapter -- Messages API.
//
// SERVER ONLY.
//
// Anthropic authenticates with `x-api-key`, NOT an Authorization bearer, and
// requires the `anthropic-version` header on every request. `system` is a
// top-level field rather than a message role, so the system prompt never
// becomes a turn in `messages`.

import {
  aiProviderHttpError,
  aiProviderTransportError,
  requireProviderText,
} from './errors';
import type { AIGenerateTextInput, AIProviderAdapter } from './types';

export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

/** Required on every Messages API request; pinned deliberately. */
export const ANTHROPIC_VERSION = '2023-06-01';

interface MessagesPayload {
  readonly content?: readonly { readonly type?: unknown; readonly text?: unknown }[];
}

/**
 * Only `text` blocks contribute. A response made entirely of non-text blocks
 * (thinking, tool_use) yields nothing and is treated as a failed request
 * rather than an empty answer.
 */
function extractMessagesText(payload: MessagesPayload | null): string | null {
  const chunks: string[] = [];
  for (const block of payload?.content ?? []) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      chunks.push(block.text);
    }
  }
  return chunks.length > 0 ? chunks.join('') : null;
}

export const anthropicAdapter: AIProviderAdapter = {
  provider: 'anthropic',
  async generateText(input: AIGenerateTextInput): Promise<string> {
    let response: Response;
    try {
      response = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': input.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        signal: input.signal,
        body: JSON.stringify({
          model: input.model,
          system: input.system,
          max_tokens: input.maxTokens,
          messages: [{ role: 'user', content: input.user }],
          ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        }),
      });
    } catch (cause) {
      aiProviderTransportError('anthropic', cause);
    }

    if (!response.ok) throw aiProviderHttpError('anthropic', response.status);

    let payload: MessagesPayload | null;
    try {
      payload = (await response.json()) as MessagesPayload;
    } catch {
      payload = null;
    }

    return requireProviderText('anthropic', extractMessagesText(payload));
  },
};
