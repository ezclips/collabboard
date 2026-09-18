import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BOARD_AI_CHAT_MAX_TOKENS, BOARD_AI_CHAT_TIMEOUT_MS } from './boardAiChatExecution';
import { COMPONENT_MAX_TOKENS } from './componentGeneration';
import { DEEPSEEK_DEFAULT_MODEL } from './providers/deepSeek';

/**
 * A TOKEN BUDGET IS PART OF THE MODEL CONTRACT, NOT A CONSTANT.
 *
 * This file exists because three of the product's four budgets turned out to be
 * wrong at the same moment, for the same reason, and no test noticed any of
 * them. `deepseek-flash` spends completion tokens on `reasoning_content` before
 * it emits any `content`, and `max_tokens` fences the two together. Every
 * budget in the codebase had been sized against `deepseek-chat`, which did not
 * reason.
 *
 * WHAT WENT WRONG, AND WHY IT WAS INVISIBLE -- three different failure shapes:
 *
 *   classify-intent (80)   the reasoning consumed the entire budget and the
 *                          completion came back EMPTY. The client keeps the
 *                          current mode on a failed classify, so Auto silently
 *                          produced the wrong format. 2 of 5 realistic prompts.
 *   generate/convert (1200) the answer was cut off mid-object, which is not a
 *                          shorter card but UNPARSEABLE JSON -> 502. 1 of 5.
 *   board chat (1500)      the answer was cut off mid-sentence and RENDERED AS
 *                          AN ANSWER. No error, anywhere, ever. 3 of 4.
 *
 * The last one is the reason this file is not just a comment on a constant: it
 * is the failure no error path can catch, and the only defence is having
 * measured.
 *
 * NOT MEASURED HERE. These assertions cannot call a provider -- the numbers
 * come from the two instruments kept beside them, which send the REAL prompts:
 *   scripts/db/boardAiChatTokenBudget.ts
 *   scripts/db/aiRolePreferenceReadLatency.ts (the other half of that unit)
 * What this file does is stop a budget drifting back under a value that was
 * shown to break, and name the model the numbers were taken against -- so that
 * changing the managed default breaks a test that says "re-measure".
 */

const TEXT_ACTION_MAX_TOKENS = 1500;

describe('the budgets, and the model they were measured against', () => {
  it('names the model the measurements were taken against', () => {
    // If this fails, the managed default moved and EVERY number below is
    // unverified again. Re-run the instruments before changing it.
    expect(DEEPSEEK_DEFAULT_MODEL).toBe('deepseek-flash');
  });

  it('board chat holds a long answer -- 1500 truncated 3 of 4', () => {
    // Measured: at 1500, three of four long-answer prompts came back
    // finish_reason "length". At 4000, eight of eight completed across two
    // runs, worst completion 2,613 tokens.
    expect(BOARD_AI_CHAT_MAX_TOKENS).toBeGreaterThanOrEqual(4000);
  });

  it('records that the chat timeout has NOT been re-measured against the new cap', () => {
    // The unfinished half of the pairing, pinned so it cannot be forgotten.
    // Slowest measured completed answer: 15.7s of a 20s timeout, on 2,634
    // tokens -- the worst OBSERVED, not the worst PERMITTED. At ~6ms/token a
    // completion near the cap needs ~25s and would be aborted first.
    //
    // If BOARD_AI_CHAT_TIMEOUT_MS is raised, re-run the instrument and update
    // this expectation; if the budget is raised further without it, this fails
    // and says why.
    expect(BOARD_AI_CHAT_TIMEOUT_MS).toBe(20_000);
    const perTokenMs = 6;
    const needed = BOARD_AI_CHAT_MAX_TOKENS * perTokenMs;
    // Deliberately asserting the UNCOMFORTABLE fact rather than hiding it: the
    // top of the budget does not fit inside the timeout today.
    expect(needed).toBeGreaterThan(BOARD_AI_CHAT_TIMEOUT_MS);
  });

  it('component generation holds a whole card -- 1200 truncated it into invalid JSON', () => {
    expect(COMPONENT_MAX_TOKENS).toBeGreaterThanOrEqual(4000);
  });

  it('the classifier leaves room to reason before it answers -- 80 did not', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'app/api/ai/classify-intent/route.ts'), 'utf8');
    const match = route.match(/const CLASSIFY_MAX_TOKENS = (\d+);/);
    expect(match).not.toBeNull();
    // Reasoning alone measured 29-153 tokens against a ~25 token answer.
    expect(Number(match![1])).toBeGreaterThanOrEqual(400);
  });

  it('text-action is left alone, and that is also a measurement', () => {
    // 6 of 6 usable at 1500: reasoning 98-493, worst total completion 559.
    // Recorded so "unchanged" reads as checked rather than overlooked.
    const route = readFileSync(
      resolve(process.cwd(), 'app/api/ai/text-action/route.ts'), 'utf8');
    expect(route).toContain(`maxTokens: ${TEXT_ACTION_MAX_TOKENS}`);
  });
});

describe('a silent failure now leaves a trace', () => {
  const route = () => readFileSync(
    resolve(process.cwd(), 'app/api/ai/classify-intent/route.ts'), 'utf8');

  it('both classifier failure paths are recorded, not just the provider one', () => {
    const code = route();
    // The parse branch is the one that quietly turns any prompt into a lesson
    // board; it was as silent as the provider branch and mattered as much.
    expect(code).toMatch(/recordClassifyFailure\('provider'/);
    expect(code).toMatch(/recordClassifyFailure\('parse'/);
  });

  it('the signal survives production, where the telemetry emitter is a no-op', () => {
    // lib/ai/telemetry.ts returns early when NODE_ENV === 'production' until it
    // is wired to an endpoint. A telemetry-only signal would therefore be
    // invisible in exactly the place a recurrence matters most.
    expect(route()).toContain('console.warn');
    expect(route()).toContain('failures_since_start');
  });

  it('counts failures, because the defect it exists to expose was intermittent', () => {
    expect(route()).toMatch(/classifyFailures \+= 1/);
  });

  it('the recorded reason is ours, never the provider\'s response body', () => {
    const code = route();
    expect(code).not.toContain('response.text()');
    expect(code).not.toMatch(/details:/);
  });
});
