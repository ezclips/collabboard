// Gemini adapter -- Interactions API.
//
// SERVER ONLY.
//
// The credential goes in the `x-goog-api-key` HEADER. Google also accepts a
// `?key=` query parameter; that form is deliberately not used, because a URL
// carrying a user's API key is exactly what ends up in access logs, proxy
// traces and error reports.
//
// `store: false` and the absence of `previous_interaction_id` keep every call
// stateless: no server-side conversation is created, so nothing to retain or
// later delete on the user's behalf.

import {
  aiProviderHttpError,
  aiProviderTransportError,
  requireProviderText,
} from './errors';
import type { AIGenerateTextInput, AIProviderAdapter } from './types';

export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

interface InteractionsStep {
  readonly type?: unknown;
  readonly text?: unknown;
  readonly content?: readonly { readonly type?: unknown; readonly text?: unknown }[];
}

interface InteractionsPayload {
  readonly model_output?: readonly InteractionsStep[];
}

/** Step kinds that are never part of the answer, whatever text they carry. */
const NON_ANSWER_STEPS = new Set(['thought', 'thinking', 'tool_call', 'tool_result']);

/**
 * Text comes ONLY from `model_output`, and only from steps that are not
 * reasoning or tool traffic. A step may carry its text directly or as content
 * parts; anything else in the payload is ignored entirely.
 */
function extractInteractionsText(payload: InteractionsPayload | null): string | null {
  const chunks: string[] = [];
  for (const step of payload?.model_output ?? []) {
    if (typeof step?.type === 'string' && NON_ANSWER_STEPS.has(step.type)) continue;
    if (typeof step?.text === 'string') {
      chunks.push(step.text);
      continue;
    }
    for (const part of step?.content ?? []) {
      if (typeof part?.type === 'string' && NON_ANSWER_STEPS.has(part.type)) continue;
      if (typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.length > 0 ? chunks.join('') : null;
}

export const geminiAdapter: AIProviderAdapter = {
  provider: 'gemini',
  async generateText(input: AIGenerateTextInput): Promise<string> {
    let response: Response;
    try {
      response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': input.apiKey,
        },
        signal: input.signal,
        body: JSON.stringify({
          model: input.model,
          input: input.user,
          system_instruction: input.system,
          store: false,
          generation_config: {
            max_output_tokens: input.maxTokens,
            ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
          },
        }),
      });
    } catch (cause) {
      aiProviderTransportError('gemini', cause);
    }

    if (!response.ok) throw aiProviderHttpError('gemini', response.status);

    let payload: InteractionsPayload | null;
    try {
      payload = (await response.json()) as InteractionsPayload;
    } catch {
      payload = null;
    }

    return requireProviderText('gemini', extractInteractionsText(payload));
  },
};
