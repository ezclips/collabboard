/**
 * Followups item 8 -- does passage VOLUME couple to generation LATENCY?
 *
 * WHY IT EXISTS. Plan rev. 4 made one thing a precondition on the whole search
 * reader: if the `8ebbe969` failure was our own BOARD_AI_CHAT_TIMEOUT_MS
 * aborting generation, then the number of passages is bounded by LATENCY rather
 * than by characters -- more input, slower first byte, on every searched turn.
 * Neither BOARD_AI_CONTEXT_MAX_SINGLE_CHARS nor the four-slot rule expresses
 * that. The reader was built and BOARD_AI_SEARCH_LIMIT_PER_SOURCE = 4 was set
 * as a CHARACTER-budget decision without the question being answered.
 *
 * WHAT IT MEASURES, in two parts, because neither half is observable alone:
 *
 *  1. THE ASSEMBLY, per question, with the REAL `searchBoardAiContext` and the
 *     REAL block builder. The stored context envelope keeps an EXCERPT, not the
 *     text the model saw, so the assembled character count cannot be read back
 *     off a row -- it has to be recomputed. Search is deterministic given
 *     unchanged board content, so this reproduces what a live turn assembled.
 *
 *  2. THE FINISH REASON, which NO live turn can report. `adapter.generateText`
 *     returns a bare string; finish_reason is read and discarded inside the
 *     adapter. A truncated answer renders as an answer, with no error anywhere.
 *     The only way to see it is to send the same assembled payload directly --
 *     the real system prompt in its 'ran' state and the real serializer over
 *     the real block, so this measures the request the product actually makes.
 *
 * WHY IT SWEEPS EVERY QUESTION rather than taking one. "The reachable worst
 * case" is a claim about this board's MAXIMUM. Picking one question and calling
 * it the ceiling assumes the answer -- and the sweep is what showed that the
 * question with the most CHARACTERS is not the one with the most PASSAGES.
 *
 * WHAT IT CANNOT TELL YOU. The maximum any question on this board assembles is
 * roughly 30% of BOARD_AI_CONTEXT_MAX_TOTAL_CHARS. A green result here says
 * volume does not couple at the REACHABLE maximum, not at the budget's
 * theoretical one. Record the character count beside any timing so the next
 * reader can see which maximum was tested.
 *
 * READ ONLY against CollabBoard: it writes no table and touches no board. It
 * does spend real DeepSeek tokens on the replay, which is the cost of knowing.
 *
 * USAGE
 *   npx vite-node scripts/db/boardAiSearchLoadConfirm.ts
 *   npx vite-node scripts/db/boardAiSearchLoadConfirm.ts -- --no-replay
 */
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { searchBoardAiContext } from '../../lib/server/ai/boardAiChatSearch';
import { createBoardAiSearchReader } from '../../lib/infra/ai/boardAiSearchReader';
import { BOARD_AI_CONTEXT_MAX_TOTAL_CHARS } from '../../lib/domain/ai/boardAiChatContext';
import {
  BOARD_AI_CHAT_MAX_TOKENS,
  BOARD_AI_CHAT_TEMPERATURE,
  BOARD_AI_CHAT_TIMEOUT_MS,
  boardAiChatSystemPrompt,
  serializeBoardAiChatPayload,
} from '../../lib/server/ai/boardAiChatExecution';
import { DEEPSEEK_DEFAULT_MODEL, DEEPSEEK_ENDPOINT } from '../../lib/server/ai/providers/deepSeek';

/** The reference board the retrieval work has been measured against throughout. */
const BOARD = 'af02972f-dfde-4545-9fc8-5fcbccb007c3';

/** The tuning battery's questions, so results stay comparable to its ratings. */
const MESSAGES: readonly string[] = [
  'How do I remove the bumper on an Audi A2 to change the horn?',
  'What do the Iran oil headlines on this board say?',
  'How do I look after my bike chain and when should I lube it?',
  'What is hypermodernism in chess openings?',
  'What is the single channel TENS stimulator module for?',
  'How do I knit a ribbed pattern?',
  'Which news website is linked in the slideshow?',
  'Wie löse ich die Spreizniete an der Stoßstange?',
  'What does the Trump note post say?',
  'Who won the chess tournament in Berlin last year?',
];

/** The two the sweep identifies: most characters, and most passages. */
const REPLAY: readonly string[] = [
  'How do I remove the bumper on an Audi A2 to change the horn?',
  'Wie löse ich die Spreizniete an der Stoßstange?',
];

function readEnv(name: string): string {
  const file = path.join(process.cwd(), '.env.local');
  const match = fs.readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!match) throw new Error(`${name} is not set in .env.local`);
  return match[1].trim();
}

/**
 * `unknown`, deliberately. The search takes the caller's authorization client
 * and this script hands it a service-role one, which is a different generic
 * instantiation; narrowing it here would only move the cast, not remove it.
 */
async function assemble(db: unknown, userId: string, message: string) {
  return searchBoardAiContext(
    db as never,
    createBoardAiSearchReader(),
    BOARD,
    userId,
    message,
    // No attachments, so the search is given the whole budget -- the most room
    // it can ever have, which is what a worst-case load needs.
    BOARD_AI_CONTEXT_MAX_TOTAL_CHARS,
    { padletIds: new Set(), documentPages: new Set() },
    0,
  );
}

async function main(): Promise<void> {
  const replay = !process.argv.includes('--no-replay');
  const db = createClient(readEnv('NEXT_PUBLIC_SUPABASE_URL'), readEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  // Looked up rather than hardcoded. The service-role client bypasses RLS, so
  // this recomputes the ASSEMBLY only -- it is not a check of the authorization
  // a live turn passes through the caller's own client.
  const owner = await db.from('boards').select('user_id').eq('id', BOARD).single();
  if (owner.error) throw owner.error;
  const userId = owner.data.user_id as string;

  console.log('=== what this board can assemble on a searched turn ===');
  console.log(`budget ${BOARD_AI_CONTEXT_MAX_TOTAL_CHARS} chars, no attachments, per-source limit 4\n`);

  let worstChars = { chars: 0, message: '', detail: [] as string[] };
  let worstPassages = { count: 0, message: '', chars: 0 };

  for (const message of MESSAGES) {
    const searched = await assemble(db, userId, message);
    if (!searched.ok) {
      console.log(`${message.slice(0, 46).padEnd(48)} FAILED ${JSON.stringify(searched.error)}`);
      continue;
    }
    const { block, result } = searched.value;
    const passages = block.passages ?? [];
    const posts = passages.filter((p) => p.source === 'post').length;
    const pdfs = passages.filter((p) => p.source === 'pdf').length;

    console.log(
      `${message.slice(0, 46).padEnd(48)} chars=${String(block.text.length).padStart(5)}  `
      + `used=${result.used}/${result.returned} dropped=${result.dropped}  posts=${posts} pdf=${pdfs}`,
    );

    if (block.text.length > worstChars.chars) {
      worstChars = {
        chars: block.text.length,
        message,
        detail: passages.map((p, i) => `  S1.${i + 1}  ${p.source.padEnd(4)}  ${p.label}`),
      };
    }
    if (passages.length > worstPassages.count) {
      worstPassages = { count: passages.length, message, chars: block.text.length };
    }
  }

  console.log('\n--- the reachable maxima, which are NOT the same question ---');
  console.log(`most characters: ${worstChars.chars} of ${BOARD_AI_CONTEXT_MAX_TOTAL_CHARS}`
    + ` (${((worstChars.chars / BOARD_AI_CONTEXT_MAX_TOTAL_CHARS) * 100).toFixed(1)}%)  "${worstChars.message}"`);
  console.log(worstChars.detail.join('\n'));
  console.log(`most passages  : ${worstPassages.count} (${worstPassages.chars} chars)  "${worstPassages.message}"`);

  if (!replay) return;

  console.log('\n--- finish_reason, on those same assembled payloads ---');
  console.log('(the live path cannot show this: the adapter discards it)\n');
  for (const message of REPLAY) {
    const searched = await assemble(db, userId, message);
    if (!searched.ok) continue;
    const block = searched.value.block;

    const started = performance.now();
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readEnv('DEEPSEEK_API_KEY')}` },
      body: JSON.stringify({
        model: DEEPSEEK_DEFAULT_MODEL,
        messages: [
          // THE REAL ONES, in the state a searched turn uses.
          { role: 'system', content: boardAiChatSystemPrompt('ran') },
          { role: 'user', content: serializeBoardAiChatPayload([{ role: 'user', content: message }], [block]) },
        ],
        temperature: BOARD_AI_CHAT_TEMPERATURE,
        max_tokens: BOARD_AI_CHAT_MAX_TOKENS,
      }),
    });
    if (!response.ok) { console.log(`  provider returned ${response.status}`); continue; }
    const data = await response.json();
    const ms = performance.now() - started;
    const choice = data.choices?.[0];
    const answer = typeof choice?.message?.content === 'string' ? choice.message.content : '';

    console.log(
      `${message.slice(0, 34).padEnd(36)} finish=${String(choice?.finish_reason).padEnd(7)} `
      + `reasoning=${String(data.usage?.completion_tokens_details?.reasoning_tokens ?? 0).padStart(4)} `
      + `completion=${String(data.usage?.completion_tokens ?? 0).padStart(4)}/${BOARD_AI_CHAT_MAX_TOKENS} `
      + `prompt=${String(data.usage?.prompt_tokens ?? 0).padStart(5)} `
      + `answer=${String(answer.length).padStart(5)}ch  ${(ms / 1000).toFixed(1)}s of ${BOARD_AI_CHAT_TIMEOUT_MS / 1000}s`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
