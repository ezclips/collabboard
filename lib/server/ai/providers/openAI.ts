// OpenAI adapter -- Responses API.
//
// SERVER ONLY.
//
// Deliberately NOT routed through the shared Chat Completions helper. OpenAI's
// current surface is /v1/responses, whose request shape is genuinely different
// (`instructions` + `input` rather than a messages array, `max_output_tokens`
// rather than `max_tokens`), and reusing the legacy endpoint purely to share
// code with DeepSeek/OpenRouter would encode the wrong API for the sake of one
// fewer file.

import {
  aiProviderHttpError,
  aiProviderTransportError,
  requireProviderText,
} from './errors';
import type { AIGenerateTextInput, AIProviderAdapter } from './types';

export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses';

interface ResponsesPayload {
  /** SDK convenience field; used only as a fallback, never as the sole source. */
  readonly output_text?: unknown;
  readonly output?: readonly {
    readonly type?: unknown;
    readonly content?: readonly { readonly type?: unknown; readonly text?: unknown }[];
  }[];
}

/**
 * Walks the structured output. Only assistant `message` items contribute, and
 * within them only `output_text` parts -- reasoning items and any other block
 * type are ignored rather than concatenated into the answer.
 */
function extractResponsesText(payload: ResponsesPayload | null): string | null {
  const chunks: string[] = [];
  for (const item of payload?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        chunks.push(part.text);
      }
    }
  }
  if (chunks.length > 0) return chunks.join('');
  return typeof payload?.output_text === 'string' ? payload.output_text : null;
}

/**
 * `input` is a plain STRING when there is no image, which the Responses API
 * treats as a single user message -- so every existing text-only request goes
 * out byte-identical to what it was before images existed. The item-list form
 * is used ONLY when the caller supplied images.
 *
 * Shape verified against OpenAI's current Responses API documentation:
 * https://developers.openai.com/api/docs/guides/images-vision
 * -- part types are exactly `input_text` and `input_image`, and `image_url`
 * takes the data URL as a PLAIN STRING, not an object. (Chat Completions uses
 * an object there; the two APIs differ, and this one is not that one.)
 *
 * A data: URL, so the bytes are IN the request: the images are crops of private
 * Knowledge PDFs with no public address, and nothing is hosted or signed.
 */
function responsesInput(input: AIGenerateTextInput): unknown {
  const images = input.images ?? [];
  if (images.length === 0) return input.user;

  return [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: input.user },
        ...images.map((image) => ({
          type: 'input_image',
          image_url: `data:${image.mediaType};base64,${image.base64}`,
        })),
      ],
    },
  ];
}

export const openAIAdapter: AIProviderAdapter = {
  provider: 'openai',
  carriesImages: true,
  async generateText(input: AIGenerateTextInput): Promise<string> {
    let response: Response;
    try {
      response = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.apiKey}`,
        },
        signal: input.signal,
        body: JSON.stringify({
          model: input.model,
          instructions: input.system,
          input: responsesInput(input),
          max_output_tokens: input.maxTokens,
          ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        }),
      });
    } catch (cause) {
      aiProviderTransportError('openai', cause);
    }

    if (!response.ok) throw aiProviderHttpError('openai', response.status);

    let payload: ResponsesPayload | null;
    try {
      payload = (await response.json()) as ResponsesPayload;
    } catch {
      payload = null;
    }

    return requireProviderText('openai', extractResponsesText(payload));
  },
};
