/**
 * How long CollabBoard waits for each AI feature, in one CLIENT-SAFE table.
 *
 * WHY A RESTATEMENT RATHER THAN AN IMPORT. The real deadlines live on the
 * server, in files that import Supabase clients, provider keys and Next.js
 * request machinery. The Add-provider dialog is a `'use client'` bundle and
 * must not import any of that, so the numbers are written here -- and
 * `aiTimeBudgets.source.test.ts` reads the SERVER files and asserts each literal
 * equals the value below. If a timeout changes without this table changing, that
 * test fails. The two cannot drift.
 *
 * WHY THIS EXISTS AT ALL. It was invisible, and it cost a day of failures:
 * thinking models ran past the route's timeout, and on the text-action route a
 * thinking model spent the whole token budget reasoning and returned no answer.
 * A person choosing a provider and a model should be able to see what
 * CollabBoard will wait for before they find out the hard way.
 */

export interface AITimeBudget {
  /** The feature, named as a user knows it. */
  readonly feature: string;
  readonly seconds: number;
}

/**
 * The values, read from the code on 2026-09-23:
 *
 *   app/api/ai/text-action/route.ts         setTimeout(..., 20_000)
 *   lib/server/ai/boardAiChatExecution.ts   BOARD_AI_CHAT_TIMEOUT_MS = 20_000
 *   app/api/ai/generate-component/route.ts  timeoutMs: 25_000
 *   app/api/ai/convert-component/route.ts   timeoutMs: 25_000
 *   app/api/ai/classify-intent/route.ts     timeoutMs: 10_000
 *   lib/server/ai/boardWikiCompilation.ts   WIKI_COMPILE_TIMEOUT_MS = 60_000
 *   app/api/ai/table-fill/route.ts          setTimeout(..., 25_000)
 *   app/api/ai/table-plan/route.ts          setTimeout(..., 25_000)
 */
export const AI_TIME_BUDGETS: readonly AITimeBudget[] = [
  { feature: 'Source AI and Edit & Rewrite (quick actions)', seconds: 20 },
  { feature: 'Board Chat', seconds: 20 },
  { feature: 'AI cards (generate and convert)', seconds: 25 },
  { feature: 'Auto mode classifier', seconds: 10 },
  { feature: 'Board wiki', seconds: 60 },
  { feature: 'Table fill with AI', seconds: 25 },
  { feature: 'Edit table with AI', seconds: 25 },
];
