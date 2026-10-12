// PATCH-345. The ONE place an adapter reports token usage.
//
// SERVER ONLY. The contract stays "one call in, a plain string out": usage goes
// only through the caller's optional `onUsage`, so every existing `generateText`
// call site is untouched. Kept here, rather than repeated in four adapters, so
// the guards cannot drift: usage is reported only when the numbers are finite
// and non-negative, and a THROWING `onUsage` never fails the call.

import type { AIGenerateTextInput, AITokenUsage } from './types';

/** A finite, non-negative number, or null. */
export function finiteTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Reports `usage` to `input.onUsage` when there is one and the counts are sane.
 * A null usage, a missing callback, a non-finite or negative count, or a throw
 * from the callback are all no-ops.
 */
export function reportUsage(input: AIGenerateTextInput, usage: AITokenUsage | null | undefined): void {
  if (!usage || !input.onUsage) return;
  const inputTokens = finiteTokenCount(usage.inputTokens);
  const outputTokens = finiteTokenCount(usage.outputTokens);
  if (inputTokens === null || outputTokens === null) return;
  try {
    input.onUsage({ inputTokens, outputTokens });
  } catch {
    // A throwing onUsage must never fail the call.
  }
}
