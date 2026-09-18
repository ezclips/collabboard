/**
 * Does BOARD_AI_CHAT_MAX_TOKENS still hold an answer, now that the managed
 * default reasons?
 *
 * WHY IT EXISTS. `deepseek-flash` spends completion tokens on
 * `reasoning_content` BEFORE it emits any `content`, and `max_tokens` fences
 * the two together. Every budget in the product was sized against
 * `deepseek-chat`, which did not reason. Two of them turned out to be broken
 * when measured -- classify-intent at 80 produced an empty completion on 2 of 5
 * realistic prompts, and generate/convert at 1200 truncated cards into
 * unparseable JSON. Board chat was the one budget left without a number behind
 * it, and its answers are the longest in the product.
 *
 * THE LESSON THIS INSTRUMENT ENCODES: a token budget is part of the MODEL
 * CONTRACT, not a constant. Any change to a managed default re-measures them.
 *
 * WHAT MAKES IT VALID. It sends the REAL system prompt and the REAL payload,
 * imported from boardAiChatExecution -- the same two functions the chat route
 * calls. A hand-written prompt would measure a request no user ever makes, and
 * the system prompt is a large part of what constrains how long the model
 * reasons.
 *
 * It asks for LONG answers on purpose. A budget that holds a one-line reply
 * says nothing; the failure mode is a truncated long one. Each case reports
 * reasoning tokens, answer tokens, and whether the reply was cut off.
 *
 * READ ONLY as far as CollabBoard is concerned: it touches no table and no
 * board. It does spend real DeepSeek tokens, which is the cost of knowing.
 *
 * USAGE
 *   npx vite-node scripts/db/boardAiChatTokenBudget.ts
 *   npx vite-node scripts/db/boardAiChatTokenBudget.ts -- --budget 3000
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  BOARD_AI_CHAT_MAX_TOKENS,
  BOARD_AI_CHAT_TEMPERATURE,
  BOARD_AI_CHAT_TIMEOUT_MS,
  boardAiChatSystemPrompt,
  serializeBoardAiChatPayload,
  type BoardAiChatTurn,
} from '../../lib/server/ai/boardAiChatExecution';
import { DEEPSEEK_DEFAULT_MODEL, DEEPSEEK_ENDPOINT } from '../../lib/server/ai/providers/deepSeek';

function readEnv(name: string): string {
  const file = path.join(process.cwd(), '.env.local');
  const match = fs.readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!match) throw new Error(`${name} is not set in .env.local`);
  return match[1].trim();
}

function parseBudget(argv: readonly string[]): number {
  const index = argv.indexOf('--budget');
  if (index === -1) return BOARD_AI_CHAT_MAX_TOKENS;
  const value = Number(argv[index + 1]);
  if (!Number.isFinite(value) || value < 1) throw new Error('--budget must be a positive number');
  return Math.floor(value);
}

/**
 * Deliberately the long end of what board chat is actually asked for. A short
 * question measures the floor, and the floor was never in doubt.
 */
const CASES: readonly { readonly name: string; readonly turns: readonly BoardAiChatTurn[] }[] = [
  {
    name: 'short question',
    turns: [{ role: 'user', content: 'What is on this board?' }],
  },
  {
    name: 'long explanation',
    turns: [{
      role: 'user',
      content: 'Explain in detail how photosynthesis works, covering the light-dependent '
        + 'reactions, the Calvin cycle, the role of chlorophyll, and why the process matters '
        + 'for the carbon cycle. Use headings and give an example for each stage.',
    }],
  },
  {
    name: 'structured plan',
    turns: [{
      role: 'user',
      content: 'Draft a detailed twelve week onboarding plan for a new engineer joining a '
        + 'platform team. Break it into weeks, and for every week give the goals, the people '
        + 'they should meet, the systems they should read about, and what "done" looks like.',
    }],
  },
  {
    name: 'multi-turn follow-up',
    turns: [
      { role: 'user', content: 'Summarise the tradeoffs between server-side and client-side rendering.' },
      { role: 'assistant', content: 'Server-side rendering produces HTML on the server, improving first paint and SEO at the cost of server load. Client-side rendering ships JavaScript that builds the page in the browser, which is cheaper to serve but slower to first content.' },
      { role: 'user', content: 'Now expand that into a full decision guide with a section per concern, and finish with a recommendation for a collaborative whiteboard product.' },
    ],
  },
];

interface Measurement {
  readonly name: string;
  readonly finish: string;
  readonly reasoning: number;
  readonly completion: number;
  readonly answerChars: number;
  readonly usable: boolean;
  /**
   * Wall clock for the provider call alone.
   *
   * Reported because a raised budget meets an UNCHANGED timeout: the route
   * aborts at BOARD_AI_CHAT_TIMEOUT_MS, and a cap that now permits a much
   * longer completion permits a much longer wait for it. A budget measured
   * only in tokens leaves that pairing unchecked.
   */
  readonly ms: number;
}

async function measure(
  apiKey: string,
  budget: number,
  entry: (typeof CASES)[number],
): Promise<Measurement> {
  const started = performance.now();
  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: DEEPSEEK_DEFAULT_MODEL,
      messages: [
        // THE REAL ONES. Not a paraphrase.
        { role: 'system', content: boardAiChatSystemPrompt('off') },
        { role: 'user', content: serializeBoardAiChatPayload(entry.turns, []) },
      ],
      temperature: BOARD_AI_CHAT_TEMPERATURE,
      max_tokens: budget,
    }),
  });

  if (!response.ok) throw new Error(`provider returned ${response.status}`);
  const data = await response.json();
  // After the body is read: that is what the route waits for too.
  const ms = performance.now() - started;
  const choice = data.choices?.[0];
  const answer = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : '';

  return {
    name: entry.name,
    finish: choice?.finish_reason ?? 'unknown',
    reasoning: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    completion: data.usage?.completion_tokens ?? 0,
    answerChars: answer.length,
    // Truncated mid-sentence still "has content", so `length` is not the test:
    // finish_reason is what says the model was cut off.
    usable: answer.length > 0 && choice?.finish_reason === 'stop',
    ms,
  };
}

async function main(): Promise<void> {
  const budget = parseBudget(process.argv.slice(2));
  const apiKey = readEnv('DEEPSEEK_API_KEY');

  console.log(`board chat token budget -- model ${DEEPSEEK_DEFAULT_MODEL}, max_tokens ${budget}`);
  console.log(`(BOARD_AI_CHAT_MAX_TOKENS is ${BOARD_AI_CHAT_MAX_TOKENS})\n`);

  const results: Measurement[] = [];
  for (const entry of CASES) {
    const result = await measure(apiKey, budget, entry);
    results.push(result);
    console.log(
      `${result.name.padEnd(22)} finish=${result.finish.padEnd(7)} `
      + `reasoning=${String(result.reasoning).padStart(5)} `
      + `completion=${String(result.completion).padStart(5)} `
      + `answer=${String(result.answerChars).padStart(6)} chars  `
      + `${String(Math.round(result.ms)).padStart(6)}ms  `
      + `${result.usable ? 'usable' : 'TRUNCATED'}`,
    );
  }

  const worst = Math.max(...results.map((r) => r.completion));
  const headroom = budget - worst;
  console.log(`\nworst completion ${worst} of ${budget} -- headroom ${headroom} tokens`);

  // The other half of the pairing: a raised cap permits a longer wait, and the
  // route's timeout did not move.
  const slowest = Math.max(...results.map((r) => r.ms));
  const share = (slowest / BOARD_AI_CHAT_TIMEOUT_MS) * 100;
  console.log(
    `slowest call ${(slowest / 1000).toFixed(1)}s against the route's `
    + `${BOARD_AI_CHAT_TIMEOUT_MS / 1000}s timeout -- ${share.toFixed(0)}% of it`,
  );
  if (share > 60) {
    console.log('THE TIMEOUT IS THE NEXT BOUND TO WATCH: raise it, or the budget is theoretical.');
  }
  if (results.some((r) => !r.usable)) {
    console.log('AT LEAST ONE ANSWER WAS CUT OFF. The budget is too small for this model.');
    process.exitCode = 1;
  } else if (headroom < budget * 0.2) {
    console.log('Every answer completed, but with under 20% headroom -- too close to raise no flag.');
  } else {
    console.log('Every answer completed with room to spare.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
