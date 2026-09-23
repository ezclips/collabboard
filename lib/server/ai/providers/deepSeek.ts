// DeepSeek adapter -- the CollabBoard-default execution provider.
//
// SERVER ONLY.
//
// Wire-compatible with the existing callDeepSeek in
// app/api/ai/text-action/route.ts (same endpoint, same Bearer auth, same
// system+user message pair, same choices[0].message.content read), so routing
// that route through this adapter in a later phase is a swap, not a change in
// what DeepSeek receives. The one deliberate difference: no timer of its own.

import { chatCompletionsGenerateText } from './chatCompletions';
import type { AIGenerateTextInput, AIProviderAdapter } from './types';

export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

/**
 * The model the CollabBoard default resolves to today.
 *
 * WAS `deepseek-chat`, which is RETIRED. DeepSeek withdrew `deepseek-chat` and
 * `deepseek-reasoner` on 2026-07-24 15:59 UTC; past that date the name survives
 * only through undocumented compatibility routing, and this is the CollabBoard
 * DEFAULT -- if that routing is switched off, every text AI turn stops, not
 * just image ones. That is why a model id is being changed in a unit about
 * images.
 *
 * `deepseek-flash` (DeepSeek-V4.1-Flash) is the id DeepSeek's own pricing page
 * documents today, and it is deliberately NOT `deepseek-v4-flash`: that name,
 * along with `deepseek-v4-flash-vision-exp`, was itself retired on 2026-09-10
 * and is now merely an accepted alias served by V4.1-Flash. Moving onto a
 * second alias would repeat the defect this change exists to remove.
 * https://api-docs.deepseek.com/quick_start/pricing
 *
 * ------------------------------------------------------------------
 * CHANGING THIS LINE INVALIDATES EVERY TOKEN BUDGET IN THE PRODUCT.
 *
 * A budget is part of the MODEL CONTRACT, not a constant. `deepseek-flash`
 * REASONS: it spends completion tokens on `reasoning_content` before emitting
 * any `content`, and `max_tokens` fences the two together. Every budget in the
 * codebase had been sized against `deepseek-chat`, which did not, and three of
 * the four were wrong the moment this line changed -- in three different and
 * individually invisible ways:
 *
 *   classify-intent   empty completion -> Auto silently kept the wrong format
 *   generate/convert  truncated mid-object -> unparseable JSON -> 502
 *   board chat        truncated mid-sentence -> RENDERED AS A COMPLETE ANSWER
 *
 * No test caught any of them; the first live prompts caught all three. So when
 * this id changes, re-run the instruments before shipping:
 *   scripts/db/boardAiChatTokenBudget.ts
 * and re-read lib/server/ai/tokenBudgets.test.ts, which names each budget with
 * the numbers behind it and fails if this model id moves.
 * ------------------------------------------------------------------
 */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-flash';

/**
 * The ONLY DeepSeek model this server will send an image to. EXPERIMENTAL.
 *
 * Pinned as a single constant precisely because it is experimental: when
 * DeepSeek ships vision on the stable model, or withdraws this one, the switch
 * is this line and nothing else. Nothing in the codebase may infer vision
 * support from a model name -- see visionCapability.ts.
 *
 * RECORDED, DELIBERATELY NOT CHANGED IN THIS UNIT: this id was retired on
 * 2026-09-10 alongside `deepseek-v4-flash` and is now an accepted alias served
 * by V4.1-Flash -- the same underlying model `DEEPSEEK_DEFAULT_MODEL` above now
 * names directly. So the managed-default substitution below currently swaps one
 * name for another name of the same model. It still works, and collapsing the
 * two is a model decision rather than a wiring one, so it is left for its own
 * unit rather than folded in here.
 */
export const DEEPSEEK_VISION_MODEL = 'deepseek-v4-flash-vision-exp';

export const deepSeekAdapter: AIProviderAdapter = {
  provider: 'deepseek',
  // Chat Completions carries image_url parts, and the shared helper builds them.
  carriesImages: true,
  generateText(input: AIGenerateTextInput): Promise<string> {
    // THINKING OFF, DeepSeek's documented switch. This model thinks by default
    // and spends the completion budget on `reasoning_content` before writing any
    // `content` -- measured live at 1,500 reasoning tokens and ZERO content on a
    // 1,500-token budget, which surfaces as a failed call. A quick text action
    // wants no thinking, so the route asks for none and this adapter honours it.
    // https://api-docs.deepseek.com/guides/thinking_mode/
    const extraBody = input.reasoning === 'off' ? { thinking: { type: 'disabled' } } : undefined;
    return chatCompletionsGenerateText('deepseek', DEEPSEEK_ENDPOINT, input, extraBody);
  },
};
