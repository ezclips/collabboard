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
// This was once the ONLY adapter path that carried inline images, and the other
// three adapters threw rather than drop one. That is no longer true: OpenAI,
// Anthropic and Gemini now carry images in their own native shapes, each
// verified against the provider's published request format. Every adapter
// declares `carriesImages` on itself, and whether an image may actually be sent
// is decided in visionCapability.ts from that declaration PLUS the model
// declaration -- not from which helper an adapter happens to use.

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
  /**
   * Provider-specific body fields the CALLER's adapter wants added, e.g. a
   * thinking switch. ABSENT OR EMPTY MEANS BYTE-IDENTICAL TO BEFORE: the spread
   * below adds nothing, so a request that carried no extra body serializes
   * exactly as it always did. That is the same promise the image branch above
   * makes, kept for the same reason -- a change here must not alter a call that
   * was already working.
   *
   * The shared helper never chooses these fields itself: what to send is a
   * property of the provider, so it belongs in the adapter, not here.
   */
  extraBody?: Record<string, unknown>,
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
        // LAST, so an extra field is additive and cannot displace a field the
        // helper owns. Empty means the object above serializes exactly as
        // before this parameter existed.
        ...(extraBody ?? {}),
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
