// Whether an image may be sent on a given execution path.
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
// WHAT CHANGED, AND WHY IT IS NOT A WEAKENING. This module used to hold a
// whitelist of `provider:model` pairs, which meant a BYOK model could only ever
// see an image if someone added its id to a list in this repository -- so the
// answer for every model a user actually owns was "no", forever. The whitelist
// is gone, and what replaces it is not a guess: it is the CONNECTION OWNER'S
// OWN DECLARATION, captured as `ai_provider_connections.supports_images` and
// defaulting to false. The rule is still "somebody declared this deliberately";
// the only change is WHO is allowed to declare it for a model they pay for.
//
// TWO INDEPENDENT CONDITIONS, BOTH REQUIRED:
//
//   adapterCarriesImages(provider)   -- can this adapter put an image on the
//                                       wire at all? A property of the wire
//                                       format, declared by the adapter.
//   modelDeclaredForImages(resolved) -- was this model declared able to read
//                                       one? The user's flag on the BYOK path,
//                                       or CollabBoard's own declaration for
//                                       the managed default.
//
// Either one false means REFUSE. A refusal is the honest outcome: a user who
// attaches an image and gets a text-only answer has been lied to about what the
// model saw.

import { DEEPSEEK_VISION_MODEL } from './deepSeek';
import { getAIProviderAdapter } from './registry';
import type { AIExecutionProvider } from './types';

/**
 * The model a provider may substitute when the MANAGED default needs vision.
 *
 * Only the CollabBoard-default provider has an entry, and deliberately so: the
 * managed default is CollabBoard's own choice to define, while a BYOK model is
 * the user's and is never swapped for another. A provider absent here cannot
 * substitute on any path.
 */
const DEFAULT_VISION_MODELS: Partial<Record<AIExecutionProvider, string>> = {
  deepseek: DEEPSEEK_VISION_MODEL,
};

/**
 * Condition one: can this adapter carry an image at all?
 *
 * Read from the adapter itself rather than from a second list kept here, so
 * there is exactly one place a provider's wire capability is stated and no way
 * for the two to disagree.
 */
export function adapterCarriesImages(provider: AIExecutionProvider): boolean {
  return getAIProviderAdapter(provider).carriesImages;
}

/**
 * Condition two: was this model declared able to READ an image?
 *
 * On the BYOK path this is the connection owner's own flag and nothing else --
 * no fallback, no inference from the model id. On the managed-default path it
 * is CollabBoard's declaration about the one model it defines for itself.
 */
export function modelDeclaredForImages(resolved: {
  readonly source: 'collabboard-default' | 'byok';
  readonly model: string;
  readonly supportsImages: boolean;
}): boolean {
  if (resolved.supportsImages) return true;
  return resolved.source === 'collabboard-default' && resolved.model === DEEPSEEK_VISION_MODEL;
}

export function defaultVisionModelFor(provider: AIExecutionProvider): string | null {
  return DEFAULT_VISION_MODELS[provider] ?? null;
}
