// The provider-execution seam for the three component AI routes:
// generate-component, convert-component and classify-intent.
//
// SERVER ONLY.
//
// It is one function rather than three copies because all three routes want
// exactly the same thing -- "run this prompt for this user's component role and
// give me the text back" -- and differ only in the numbers they pass. Those
// numbers stay at the call sites, where they were: this module invents no
// prompt, no temperature and no token budget of its own.
//
// What it replaces is a private callDeepSeek() that lived in each of the three
// routes, read DEEPSEEK_API_KEY directly, and hard-coded `deepseek-chat`. That
// bypassed BYOK entirely, so component generation was the one AI in the product
// whose provider a user could not choose.
//
// THE TIMEOUT STAYS THE CALLER'S, in the sense that each route passes its own
// existing value; the timer is started here so there is still exactly one clock
// per request. Adapters start none of their own.

import type { AIGenerationAttribution } from '../../ai/contracts';
import { AI_ROLE_COMPONENT } from '../../ai/aiRoles';
import type { UserId } from '../../domain/core/ids';
import { createAIProviderCredentialRepository } from '../../infra/settings/aiProviderCredentialRepository';
import { createAIRolePreferenceRepository } from '../../infra/settings/aiRolePreferenceRepository';
import { getAIProviderAdapter } from './providers/registry';
import { resolveAIModelForRole } from './resolveAIModelForRole';

/**
 * The token budget for a generated or converted card.
 *
 * WAS 1200 in each route, sized for `deepseek-chat`, which did not reason. The
 * managed default is now `deepseek-flash`, and `max_tokens` bounds its
 * REASONING TOKENS AND ITS ANSWER TOGETHER. A truncated answer is not a shorter
 * card -- it is unparseable JSON, which the routes return as a 502.
 *
 * MEASURED on the real routes, not guessed: at 1200, four of five realistic
 * prompts produced a card and the fifth came back "unusable output". A
 * successful card ran to roughly 1,500 tokens of content behind about 1,500 of
 * reasoning, which is why 1200 could not hold the harder ones.
 *
 * One constant for both routes, because a conversion builds the same kind of
 * answer a generation does and two copies of this number would drift. Raising a
 * cap does not spend tokens: a model that finishes early is billed for what it
 * generated. It only stops one being cut off mid-object.
 */
export const COMPONENT_MAX_TOKENS = 4000;

export interface ComponentGenerationInput {
  /** From the session. Never from a request body. */
  readonly userId: UserId;
  readonly system: string;
  readonly user: string;
  readonly maxTokens: number;
  readonly temperature: number;
  /** The calling route's existing deadline, unchanged by this move. */
  readonly timeoutMs: number;
}

export interface ComponentGenerationResult {
  readonly text: string;
  /**
   * Safe to put in a response body: assembled field by field below, never by
   * spreading the resolver's answer, which also holds a plaintext API key.
   */
  readonly generatedBy: AIGenerationAttribution;
}

export async function generateComponentText(
  input: ComponentGenerationInput,
): Promise<ComponentGenerationResult> {
  const resolved = await resolveAIModelForRole(input.userId, AI_ROLE_COMPONENT, {
    preferences: createAIRolePreferenceRepository(),
    credentials: createAIProviderCredentialRepository(),
  });
  const adapter = getAIProviderAdapter(resolved.provider);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const text = await adapter.generateText({
      model: resolved.model,
      apiKey: resolved.apiKey,
      system: input.system,
      user: input.user,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      signal: controller.signal,
    });
    // Two named fields, written out. A spread here would ship the key.
    return { text, generatedBy: { source: resolved.source, model: resolved.model } };
  } finally {
    clearTimeout(timer);
  }
}
