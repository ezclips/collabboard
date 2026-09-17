// Shared OpenAI-style Chat Completions call.
//
// SERVER ONLY.
//
// Used by exactly TWO adapters -- DeepSeek and OpenRouter -- because those two
// genuinely speak the same wire format at a fixed endpoint. OpenAI itself does
// NOT use this helper: it targets the Responses API, and forcing it through
// here to save a file would misrepresent that API. Anthropic and Gemini are
// not chat-completions shaped at all.
//
// This is also the ONLY adapter path that carries inline images, which is why
// the two providers that share it are the two that can serve them. The other
// three refuse an image rather than drop it -- the guard in each is what keeps
// "this model cannot see your picture" an error instead of a quiet omission.

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
  // A plain string when there is no image, so every existing text-only request
  // goes out byte-identical to before. The parts array is used ONLY when the
  // caller supplied images: both forms are valid Chat Completions, and keeping
  // the simple one for the common case means this change cannot alter a text
  // request that was already working.
  //
  // The images sit in the USER message and nowhere else. A provider rejects
  // image parts in a system message, and the system prompt is the one thing in
  // this call that is not user-supplied -- keeping them apart is the same
  // separation the payload's conversation/explicitContext split makes.
  const userContent = input.images && input.images.length > 0
    ? [
      { type: 'text', text: input.user },
      ...input.images.map((image) => ({
        type: 'image_url',
        image_url: {
          // A data: URL, so the bytes are IN the request. Nothing is hosted,
          // nothing is signed, and the provider is never sent to fetch from us.
          url: `data:${image.mediaType};base64,${image.base64}`,
          detail: 'original',
        },
      })),
    ]
    : input.user;

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
          { role: 'user', content: userContent },
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
