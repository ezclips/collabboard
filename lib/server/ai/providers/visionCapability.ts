// Which provider/model pairs accept image input.
//
// SERVER ONLY.
//
// DECLARED, NEVER INFERRED. The adapter contract calls `model` an "opaque
// provider model id, never inspected or guessed at", and that rule is what
// makes BYOK safe: a user may type any string their provider accepts, and this
// server does not pretend to know what it means. Deriving vision support from a
// name or a prefix would break that rule in the one place where being wrong is
// expensive -- guessing YES sends private PDF imagery to a model that may log
// it as an unrecognised part or reject the call; guessing NO silently drops the
// attachment the user explicitly made.
//
// So the set below is a whitelist of pairs someone deliberately added. Anything
// absent is text-only, and a request carrying an image to it is REFUSED rather
// than degraded. That refusal is the point: a user who attaches an image and
// gets a text-only answer has been lied to about what the model saw.

import { DEEPSEEK_VISION_MODEL } from './deepSeek';
import type { AIExecutionProvider } from './types';

/**
 * Keyed `provider:model` so a model id cannot claim capability it was granted
 * under a different provider -- OpenRouter in particular serves models whose
 * ids resemble other vendors'.
 */
const DECLARED_VISION_MODELS: ReadonlySet<string> = new Set([
  `deepseek:${DEEPSEEK_VISION_MODEL}`,
]);

/**
 * The model a provider may substitute when the MANAGED default needs vision.
 *
 * Only the CollabBoard-default provider has an entry, and deliberately so: the
 * managed default is CollabBoard's own choice to define, while a BYOK model is
 * the user's and is never swapped for another. A provider absent here cannot
 * serve images on any path.
 */
const DEFAULT_VISION_MODELS: Partial<Record<AIExecutionProvider, string>> = {
  deepseek: DEEPSEEK_VISION_MODEL,
};

export function supportsImages(provider: AIExecutionProvider, model: string): boolean {
  return DECLARED_VISION_MODELS.has(`${provider}:${model}`);
}

export function defaultVisionModelFor(provider: AIExecutionProvider): string | null {
  return DEFAULT_VISION_MODELS[provider] ?? null;
}
