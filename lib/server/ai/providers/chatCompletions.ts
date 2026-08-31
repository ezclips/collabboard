// Shared OpenAI-style Chat Completions call.
//
// SERVER ONLY.
//
// Used by exactly TWO adapters -- DeepSeek and OpenRouter -- because those two
// genuinely speak the same wire format at a fixed endpoint. OpenAI itself does
// NOT use this helper: it targets the Responses API, and forcing it through
// here to save a file would misrepresent that API. Anthropic and Gemini are
// not chat-completions shaped at all.

import {
  aiProviderHttpError,
  aiProviderTransportError,
  requireProviderText,
} from './errors';
import type { AIExecutionProvider, AIGenerateTextInput } from './types';

interface ChatCompletionsResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: unknown };
  }[];
}

/**
 * The credential travels in the Authorization header and nowhere else: never
 * in the URL (which lands in logs and proxies) and never in the body.
 */
export async function chatCompletionsGenerateText(
  provider: AIExecutionProvider,
  endpoint: string,
  input: AIGenerateTextInput,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      signal: input.signal,
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.maxTokens,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      }),
    });
  } catch (cause) {
    aiProviderTransportError(provider, cause);
  }

  // The body is deliberately never read on failure -- see errors.ts.
  if (!response.ok) throw aiProviderHttpError(provider, response.status);

  let payload: ChatCompletionsResponse | null;
  try {
    payload = (await response.json()) as ChatCompletionsResponse;
  } catch {
    payload = null;
  }

  return requireProviderText(provider, payload?.choices?.[0]?.message?.content);
}
