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
import { finiteTokenCount, reportUsage } from './usage';
import type { AIGenerateTextInput, AIProviderAdapter, AITokenUsage } from './types';

export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

/** Required on every Messages API request; pinned deliberately. */
export const ANTHROPIC_VERSION = '2023-06-01';

interface MessagesPayload {
  readonly content?: readonly { readonly type?: unknown; readonly text?: unknown }[];
  /**
   * PATCH-345. The Messages API reports usage here. Cache reads and cache
   * writes are input the model processed, so they count toward input tokens.
   */
  readonly usage?: {
    readonly input_tokens?: unknown;
    readonly output_tokens?: unknown;
    readonly cache_creation_input_tokens?: unknown;
    readonly cache_read_input_tokens?: unknown;
  };
}

/** The reported usage, or null when the response carried none. */
function anthropicUsage(payload: MessagesPayload | null): AITokenUsage | null {
  const usage = payload?.usage;
  const outputTokens = finiteTokenCount(usage?.output_tokens);
  const baseInput = finiteTokenCount(usage?.input_tokens);
  if (baseInput === null || outputTokens === null) return null;
  const inputTokens = baseInput
    + (finiteTokenCount(usage?.cache_creation_input_tokens) ?? 0)
    + (finiteTokenCount(usage?.cache_read_input_tokens) ?? 0);
  return { inputTokens, outputTokens };
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

/**
 * A plain STRING when there is no image, so every existing text-only request
 * goes out byte-identical to what it was before images existed. The block-list
 * form is used ONLY when the caller supplied images; both are valid content for
 * a Messages user turn.
 *
 * Shape verified against Anthropic's current Messages API documentation:
 * https://platform.claude.com/docs/en/docs/build-with-claude/vision
 * -- an image is `{ type: 'image', source: { type: 'base64', media_type, data } }`,
 * and the supported formats are JPEG, PNG, GIF and WebP, so the WebP crops this
 * feature produces need no conversion.
 *
 * IMAGES COME FIRST, and that ordering is deliberate. The same documentation
 * states Claude works best when images precede text ("Images placed after text
 * or interpolated with text still perform well, but if your use case allows it,
 * prefer an image-then-text structure"). Our text half is a large JSON payload
 * carrying the whole conversation, which is exactly the case that recommendation
 * is about. The bytes never leave the request body: these are crops of private
 * Knowledge PDFs, so no URL or file_id source is used even though both exist.
 */
function messagesUserContent(input: AIGenerateTextInput): unknown {
  const images = input.images ?? [];
  if (images.length === 0) return input.user;

  return [
    ...images.map((image) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mediaType,
        data: image.base64,
      },
    })),
    { type: 'text', text: input.user },
  ];
}

export const anthropicAdapter: AIProviderAdapter = {
  provider: 'anthropic',
  carriesImages: true,
  async generateText(input: AIGenerateTextInput): Promise<string> {
    // `reasoning` is deliberately IGNORED here: no switch for this provider was
    // measured, and an unmeasured parameter is a guess. Sending nothing keeps
    // this request exactly as it was.
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
          messages: [{ role: 'user', content: messagesUserContent(input) }],
          // `temperature` is DELIBERATELY NOT FORWARDED, even though the caller
          // always supplies one. Current Anthropic models -- Claude Sonnet 5,
          // Opus 5, Opus 4.8, Opus 4.7, Fable 5, Mythos 5 -- reject a
          // non-default temperature, top_p or top_k with a 400 on EVERY
          // request, whether or not thinking is active. Omitting it is the
          // documented migration: the default value is accepted.
          //
          // A 400 is not a status errors.ts classifies, so this surfaced as
          // `request_failed`: the Board AI image turn answered "could not
          // answer" while the text-only connection test -- which passes no
          // temperature -- went green.
          // https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5
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

    const text = requireProviderText('anthropic', extractMessagesText(payload));
    // After a successful response only: a body with no text throws above and
    // reports nothing.
    reportUsage(input, anthropicUsage(payload));
    return text;
  },
};
