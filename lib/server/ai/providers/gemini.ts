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
  /**
   * The answer arrives in `steps`, and `model_output` is a step TYPE inside it
   * -- NOT a top-level array.
   *
   * This declared a top-level `model_output` until it was checked against a
   * live response, which is the whole reason this adapter never once returned
   * an answer: the extractor read a key that is never present, found nothing on
   * every single reply, and requireProviderText turned that into a
   * `request_failed` that looked exactly like a provider rejecting the request.
   * It survived because its own test fixture was written from the same wrong
   * assumption, and because every AI call in this project resolves to the
   * managed default, so nothing ever executed this path for real.
   *
   * The live body is:
   *   { "steps": [ { "type": "thought", "signature": "…" },
   *                { "type": "model_output",
   *                  "content": [ { "text": "hello", "type": "text" } ] } ] }
   */
  readonly steps?: readonly InteractionsStep[];
}

/** Step kinds that are never part of the answer, whatever text they carry. */
const NON_ANSWER_STEPS = new Set(['thought', 'thinking', 'tool_call', 'tool_result']);

/**
 * Text comes from `steps`, skipping reasoning and tool traffic. A step may
 * carry its text directly or as content parts; anything else in the payload is
 * ignored entirely.
 *
 * Note the asymmetry that matters: `thought` steps carry a `signature` and no
 * text, so skipping them is belt-and-braces -- but a `thinking` step that DOES
 * carry text must never reach the answer, which is what the skip list is for.
 */
function extractInteractionsText(payload: InteractionsPayload | null): string | null {
  const chunks: string[] = [];
  for (const step of payload?.steps ?? []) {
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

/**
 * A plain STRING when there is no image, so every existing text-only request
 * goes out byte-identical to what it was before images existed. The part-list
 * form is used ONLY when the caller supplied images.
 *
 * THIS IS THE INTERACTIONS API, NOT generateContent, and the two differ exactly
 * here. generateContent nests `inline_data` inside `contents[].parts[]`;
 * Interactions takes a FLAT `input` array of typed parts, and an image is
 * `{ type: 'image', data, mime_type }` -- no `inline_data` wrapper, no `parts`.
 * Using the generateContent spelling against this endpoint is a 400 that reads
 * like a provider outage, which is why this shape was verified rather than
 * assumed:
 * https://ai.google.dev/gemini-api/docs/interactions/image-understanding
 *
 * Text precedes the image here, matching the documented example's ordering.
 */
function interactionsInput(input: AIGenerateTextInput): unknown {
  const images = input.images ?? [];
  if (images.length === 0) return input.user;

  return [
    { type: 'text', text: input.user },
    ...images.map((image) => ({
      type: 'image',
      // Raw base64 with a sibling mime_type -- NOT a data: URL. The data: form
      // is what the Chat Completions adapters use; this API takes the bytes and
      // the type as separate fields.
      data: image.base64,
      mime_type: image.mediaType,
    })),
  ];
}

export const geminiAdapter: AIProviderAdapter = {
  provider: 'gemini',
  carriesImages: true,
  async generateText(input: AIGenerateTextInput): Promise<string> {
    // `reasoning` is deliberately IGNORED here: no switch for this provider was
    // measured, and an unmeasured parameter is a guess. Sending nothing keeps
    // this request exactly as it was.
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
          input: interactionsInput(input),
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
