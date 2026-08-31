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

export const openAIAdapter: AIProviderAdapter = {
  provider: 'openai',
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
          input: input.user,
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
