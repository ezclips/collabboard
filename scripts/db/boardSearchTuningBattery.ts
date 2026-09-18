/**
 * The board-search tuning battery.
 *
 * WHY IT EXISTS. The live run of 2026-09-18 measured ~7-8.5% signal: of ~3,000
 * characters of retrieved context, ~200 answered the question. A rank floor is
 * the obvious lever, and no threshold can be chosen responsibly from one
 * question. This produces the table the decision rests on.
 *
 * THE ONE RULE THAT MAKES IT VALID: every rank here is the number the functions
 * ACTUALLY RETURN FOR THE APP-BUILT QUERY. It imports `buildBoardAiSearchQuery`
 * -- the same module the chat route uses -- and never hand-writes a tsquery.
 * `ts_rank` is query-dependent, so a floor calibrated against a hand-written
 * tsquery would be calibrated on a number no pipeline ever produces. Two earlier
 * smoke runs disagreed about the rank of the same passage for exactly this
 * reason, and both were right for their own query.
 *
 * NO MODEL CALLS. Relevance is a human rating, recorded in the ratings file. A
 * model rating its own retrieval would be grading its own homework, and the bar
 * below is a human judgement about whether an answer was reachable.
 *
 * THE BAR IS "NEVER DROPS A RELEVANT PASSAGE", NOT "BEST AVERAGE", and the
 * reason is a limit of this battery rather than a preference: THESE QUESTIONS
 * ARE OURS, NOT USERS'. They were written by the people who know what is on the
 * board, so they are unrepresentatively well-aimed. An average optimised against
 * them would be fitted to our own phrasing. A rule that never drops a relevant
 * passage on questions we wrote is a weak claim; a rule that DOES drop one here
 * is a strong disqualification, and that asymmetry is the only thing this
 * battery can honestly support.
 *
 * USAGE
 *   npx vite-node scripts/db/boardSearchTuningBattery.ts -- --collect
 *       Runs every question, writes the passages to the ratings file with
 *       `relevant: null` for any it has not seen before. Existing ratings are
 *       preserved.
 *   npx vite-node scripts/db/boardSearchTuningBattery.ts
 *       Runs every question, joins the recorded ratings, prints the table and
 *       evaluates the candidate rules.
 *
 * It needs SUPABASE_SERVICE_ROLE_KEY because the two functions are granted to
 * the server role alone. The key is read from .env.local and never printed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { buildBoardAiSearchQuery } from '../../lib/domain/ai/boardAiSearchQuery';
import { BOARD_AI_SEARCH_LIMIT_PER_SOURCE } from '../../lib/server/ai/boardAiChatSearch';
import { BOARD_AI_CONTEXT_MAX_TOTAL_CHARS } from '../../lib/domain/ai/boardAiChatContext';

const BOARD_ID = process.env.BOARD_SEARCH_TUNING_BOARD_ID
  ?? 'af02972f-dfde-4545-9fc8-5fcbccb007c3';

const RATINGS_PATH = path.resolve(__dirname, 'boardSearchTuningRatings.json');

/**
 * The battery.
 *
 * Written in user phrasing, drawn from this board's actual content. The `intent`
 * field records what the question is FOR, so a later reader can tell a
 * deliberately-unanswerable question from one that simply failed.
 */
interface BatteryQuestion {
  readonly id: string;
  readonly question: string;
  readonly intent: string;
}

export const BATTERY: readonly BatteryQuestion[] = [
  // The three already on the record from the live checks.
  { id: 'q01-iran', question: 'What do the Iran oil headlines on this board say?', intent: 'Live-check (a). One relevant passage, a 158-character slideshow page.' },
  { id: 'q02-audi-horn', question: 'How do I remove the bumper on an Audi A2 to change the horn?', intent: 'Live-check (b). Several relevant passages across a PDF and two posts.' },
  { id: 'q03-trump-note', question: 'What does the Trump note post say?', intent: 'Live-check (c). The relevant result is a TITLE-ONLY post with no body.' },
  // Two genuinely relevant passages: the floor must not over-trim.
  { id: 'q04-bike-chain', question: 'How do I look after my bike chain and when should I lube it?', intent: 'TWO genuinely relevant passages (drivetrain overview AND lubricant choice). The floor must keep both.' },
  // Duplicate documents: the same text is on this board more than once.
  { id: 'q05-hypermodern', question: 'What is hypermodernism in chess openings?', intent: 'One relevant passage that exists TWICE on the board, in two documents.' },
  // The correct answer is "nothing on this board" -- in its two DIFFERENT
  // shapes, because they test different things and only one of them can test a
  // floor at all.
  { id: 'q06-absent', question: 'How do I fix a leaking roof on a garden shed?', intent: 'Nothing on this board answers it AND no term matches, so the search returns zero passages. Proves the empty case is reached honestly; exercises no floor, because there is nothing to trim.' },
  { id: 'q11-noise-only', question: 'Who won the chess tournament in Berlin last year?', intent: 'Nothing on this board answers it, but terms DO match, so it returns passages that are ALL noise. This is the question a floor should trim to nothing -- and the one where trimming to nothing is the correct outcome rather than a failure.' },
  { id: 'q07-tens', question: 'What is the single channel TENS stimulator module for?', intent: 'A long technical passage, to see how a large relevant chunk ranks.' },
  { id: 'q08-knitting', question: 'How do I knit a ribbed pattern?', intent: 'A mid-length relevant passage in a document unrelated to everything else.' },
  { id: 'q09-watson', question: 'Which news website is linked in the slideshow?', intent: 'A very short relevant passage (75 characters), the segmentation case.' },
  // German: the collision set lives here.
  { id: 'q10-spreizniete', question: 'Wie löse ich die Spreizniete an der Stoßstange?', intent: 'German. One relevant German passage; also exercises the English stopword collision.' },
];

interface PostRow {
  padlet_id: string; title: string | null; text: string | null; rank: number;
}
interface ChunkRow {
  chunk_id: string; document_id: string; original_filename: string | null;
  page_start: number | null; page_end: number | null; chunk_index: number;
  text: string | null; rank: number;
}

export interface BatteryPassage {
  readonly key: string;
  readonly source: 'post' | 'pdf';
  readonly label: string;
  readonly chars: number;
  readonly rank: number;
  readonly textHash: string;
  readonly preview: string;
}

export interface BatteryResult {
  readonly id: string;
  readonly question: string;
  readonly intent: string;
  readonly terms: readonly string[];
  readonly expression: string;
  readonly passages: readonly BatteryPassage[];
}

/** Identity for a rating: stable across runs, and distinct per passage. */
const passageKey = (source: string, owner: string, index: number | string): string =>
  `${source}:${owner}:${index}`;

/** Cheap content identity, so duplicate TEXT across documents is detectable. */
function textHash(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `t${(hash >>> 0).toString(36)}`;
}

function readEnv(name: string): string {
  const file = path.resolve(__dirname, '../../.env.local');
  const contents = fs.readFileSync(file, 'utf8');
  const match = contents.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!match) throw new Error(`${name} is not set in .env.local`);
  return match[1].trim();
}

async function runBattery(): Promise<readonly BatteryResult[]> {
  const db = createClient(
    readEnv('NEXT_PUBLIC_SUPABASE_URL'),
    readEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  const results: BatteryResult[] = [];
  for (const entry of BATTERY) {
    // THE REAL PATH. Not a hand-written tsquery.
    const query = buildBoardAiSearchQuery(entry.question);
    const passages: BatteryPassage[] = [];

    if (!query.isEmpty) {
      const [posts, chunks] = await Promise.all([
        db.rpc('search_board_posts_text', {
          p_board_id: BOARD_ID, p_query: query.expression, p_limit: BOARD_AI_SEARCH_LIMIT_PER_SOURCE,
        }),
        db.rpc('search_board_knowledge_chunks_text', {
          p_board_id: BOARD_ID, p_query: query.expression, p_limit: BOARD_AI_SEARCH_LIMIT_PER_SOURCE,
        }),
      ]);
      if (posts.error) throw new Error(`posts search failed: ${posts.error.message}`);
      if (chunks.error) throw new Error(`chunks search failed: ${chunks.error.message}`);

      for (const row of (posts.data ?? []) as PostRow[]) {
        const text = (row.text ?? '').trim();
        const label = (row.title ?? '').trim() || 'Untitled note';
        passages.push({
          key: passageKey('post', row.padlet_id, 0),
          source: 'post',
          label: text.length === 0 ? `${label} (title only)` : label,
          chars: text.length,
          rank: row.rank,
          textHash: textHash(text),
          preview: text.replace(/\s+/g, ' ').slice(0, 70),
        });
      }
      for (const row of (chunks.data ?? []) as ChunkRow[]) {
        const text = (row.text ?? '').trim();
        passages.push({
          key: passageKey('pdf', row.document_id, row.chunk_index),
          source: 'pdf',
          label: `${(row.original_filename ?? 'PDF').trim()} — page ${row.page_start}`,
          chars: text.length,
          rank: row.rank,
          textHash: textHash(text),
          preview: text.replace(/\s+/g, ' ').slice(0, 70),
        });
      }
    }
    results.push({
      id: entry.id, question: entry.question, intent: entry.intent,
      terms: query.terms, expression: query.expression, passages,
    });
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Ratings                                                            */
/* ------------------------------------------------------------------ */

type Ratings = Record<string, Record<string, { relevant: boolean | null; note?: string }>>;

function loadRatings(): Ratings {
  if (!fs.existsSync(RATINGS_PATH)) return {};
  return JSON.parse(fs.readFileSync(RATINGS_PATH, 'utf8')) as Ratings;
}

function collect(results: readonly BatteryResult[]): void {
  const existing = loadRatings();
  const next: Ratings = {};
  let added = 0;
  for (const result of results) {
    next[result.id] = {};
    for (const passage of result.passages) {
      const prior = existing[result.id]?.[passage.key];
      if (prior === undefined) added += 1;
      next[result.id][passage.key] = prior ?? {
        relevant: null,
        note: `${passage.source} | ${passage.label} | ${passage.chars} chars | ${passage.preview}`,
      };
    }
  }
  fs.writeFileSync(RATINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${RATINGS_PATH}`);
  console.log(`${added} passage(s) need a rating. Set "relevant" to true or false for each.`);
}

/* ------------------------------------------------------------------ */
/* The candidate rules                                                */
/* ------------------------------------------------------------------ */

interface Rule {
  readonly name: string;
  readonly scales: boolean;
  /** Returns the passages this rule would keep, in order. */
  apply(passages: readonly BatteryPassage[]): readonly BatteryPassage[];
}

const topRankOf = (passages: readonly BatteryPassage[], source: string): number =>
  Math.max(0, ...passages.filter((p) => p.source === source).map((p) => p.rank));

export function candidateRules(): readonly Rule[] {
  const rules: Rule[] = [];
  // RELATIVE FLOOR: keep a passage only if its rank is at least f of the best in
  // its OWN source. Scales with the corpus, because it is defined against the
  // result rather than against an absolute number.
  for (const fraction of [0.3, 0.5, 0.7, 0.8, 0.9]) {
    rules.push({
      name: `relative floor ${fraction} of top-per-source`,
      scales: true,
      apply: (passages) => passages.filter((p) => p.rank >= topRankOf(passages, p.source) * fraction),
    });
  }
  // ABSOLUTE FLOOR: a constant. Does NOT scale -- ts_rank values depend on term
  // count and document length, so a constant tuned here is tuned to this corpus.
  for (const floor of [0.002, 0.003, 0.005]) {
    rules.push({
      name: `absolute floor ${floor}`,
      scales: false,
      apply: (passages) => passages.filter((p) => p.rank >= floor),
    });
  }
  // K: fewer slots per source.
  for (const k of [2, 3, 4]) {
    rules.push({
      name: `K = ${k} per source`,
      scales: true,
      apply: (passages) => {
        const perSource: Record<string, number> = {};
        return passages.filter((p) => {
          perSource[p.source] = (perSource[p.source] ?? 0) + 1;
          return perSource[p.source] <= k;
        });
      },
    });
  }
  // DUPLICATE TEXT: the same passage text appears on this board more than once,
  // in different documents. Keeping the first is strictly better than keeping
  // both -- the second costs budget and adds nothing.
  rules.push({
    name: 'drop duplicate passage text',
    scales: true,
    apply: (passages) => {
      const seen = new Set<string>();
      return passages.filter((p) => {
        if (seen.has(p.textHash)) return false;
        seen.add(p.textHash);
        return true;
      });
    },
  });
  // COMBINATIONS. The single rules are not alternatives: duplicate-dropping
  // removes text that is genuinely redundant, while a floor and K remove text
  // that is genuinely irrelevant. They compose, and the composition is what a
  // shipped configuration would actually be.
  const dropDuplicates = (passages: readonly BatteryPassage[]) => {
    const seen = new Set<string>();
    return passages.filter((p) => {
      if (seen.has(p.textHash)) return false;
      seen.add(p.textHash);
      return true;
    });
  };
  const relative = (fraction: number) => (passages: readonly BatteryPassage[]) =>
    passages.filter((p) => p.rank >= topRankOf(passages, p.source) * fraction);
  const limit = (k: number) => (passages: readonly BatteryPassage[]) => {
    const perSource: Record<string, number> = {};
    return passages.filter((p) => {
      perSource[p.source] = (perSource[p.source] ?? 0) + 1;
      return perSource[p.source] <= k;
    });
  };
  rules.push({
    name: 'duplicates + relative floor 0.3',
    scales: true,
    apply: (p) => relative(0.3)(dropDuplicates(p)),
  });
  rules.push({
    name: 'duplicates + K = 3',
    scales: true,
    apply: (p) => limit(3)(dropDuplicates(p)),
  });
  rules.push({
    name: 'duplicates + relative floor 0.3 + K = 3',
    scales: true,
    apply: (p) => limit(3)(relative(0.3)(dropDuplicates(p))),
  });
  // The duplicate pass runs FIRST on purpose: dropping a redundant copy before
  // K counts slots means K spends them on distinct material, which is the whole
  // reason the two compose rather than overlap.
  rules.push({
    name: 'duplicates + relative floor 0.4 + K = 3',
    scales: true,
    apply: (p) => limit(3)(relative(0.4)(dropDuplicates(p))),
  });

  // COVERAGE is NOT implemented as a rule here, and that is a finding rather
  // than an omission: `ts_rank` does not report how many DISTINCT query terms a
  // passage matched, and neither function returns the matched lexemes. Testing
  // it needs a schema change (ts_rank_cd, or a second expression returning
  // matched-term count), so it cannot be evaluated from this table. Recorded in
  // the report rather than silently skipped.
  return rules;
}

/* ------------------------------------------------------------------ */

function report(results: readonly BatteryResult[]): void {
  const ratings = loadRatings();
  const unrated: string[] = [];

  console.log('\n# Board search tuning battery\n');
  console.log(`Board: ${BOARD_ID}`);
  console.log(`Budget: ${BOARD_AI_CONTEXT_MAX_TOTAL_CHARS} characters. K = ${BOARD_AI_SEARCH_LIMIT_PER_SOURCE} per source.\n`);

  for (const result of results) {
    const rated = result.passages.map((p) => ({
      ...p, relevant: ratings[result.id]?.[p.key]?.relevant ?? null,
    }));
    for (const p of rated) if (p.relevant === null) unrated.push(`${result.id} ${p.key}`);

    const total = rated.reduce((sum, p) => sum + p.chars, 0);
    const signal = rated.filter((p) => p.relevant === true).reduce((sum, p) => sum + p.chars, 0);
    console.log(`\n## ${result.id} — ${result.question}`);
    console.log(`   intent: ${result.intent}`);
    console.log(`   terms:  ${result.expression || '(empty)'}`);
    console.log('   | rel | source | rank     | chars | label');
    console.log('   |-----|--------|----------|-------|------');
    for (const p of rated) {
      const mark = p.relevant === true ? ' YES' : p.relevant === false ? ' no ' : ' ?? ';
      console.log(`   |${mark} | ${p.source.padEnd(6)} | ${p.rank.toFixed(6)} | ${String(p.chars).padStart(5)} | ${p.label}`);
    }
    console.log(`   passages ${rated.length}, chars ${total}, relevant chars ${signal}, `
      + `signal ${total === 0 ? 'n/a' : `${((signal / total) * 100).toFixed(1)}%`}`);
  }

  if (unrated.length > 0) {
    console.log(`\n!! ${unrated.length} passage(s) are UNRATED. The rule evaluation below is incomplete.`);
    for (const entry of unrated.slice(0, 20)) console.log(`   ${entry}`);
    return;
  }

  console.log('\n\n# Rule evaluation\n');
  console.log('Bar: a rule is DISQUALIFIED if it drops any human-rated-relevant passage on any query.\n');
  console.log('| rule | scales | drops relevant | queries harmed | chars kept | signal |');
  console.log('|------|--------|----------------|----------------|------------|--------|');

  const baselineChars = results.reduce((sum, r) => sum + r.passages.reduce((s, p) => s + p.chars, 0), 0);
  const allRules = [{ name: 'none (today)', scales: true, apply: (p: readonly BatteryPassage[]) => p }, ...candidateRules()];

  for (const rule of allRules) {
    let dropped = 0; const harmed: string[] = []; let kept = 0; let keptRelevant = 0;
    for (const result of results) {
      const keep = rule.apply(result.passages);
      // THE BAR IS MEASURED ON TEXT, NOT ON ROWS, and that distinction is what
      // keeps it from being circular. This board carries the SAME passage text
      // in more than one document, so an exact duplicate is one passage
      // returned twice, not two passages. A rule that drops the second copy has
      // lost no relevant material, and judging it on row identity would
      // disqualify the duplicate rule using a rating that presupposes the
      // answer. A relevant passage counts as LOST only when its text is absent
      // from everything kept.
      const keptText = new Set(keep.map((p) => p.textHash));
      kept += keep.reduce((s, p) => s + p.chars, 0);
      keptRelevant += keep.filter((p) => ratings[result.id]?.[p.key]?.relevant === true)
        .reduce((s, p) => s + p.chars, 0);
      const lostHashes = new Set<string>();
      for (const p of result.passages) {
        if (ratings[result.id]?.[p.key]?.relevant !== true) continue;
        if (keptText.has(p.textHash)) continue;
        if (lostHashes.has(p.textHash)) continue;
        lostHashes.add(p.textHash);
        dropped += 1;
        if (!harmed.includes(result.id)) harmed.push(result.id);
      }
    }
    const verdict = dropped === 0 ? 'none' : `${dropped} DISQUALIFIED`;
    console.log(`| ${rule.name} | ${rule.scales ? 'yes' : 'no'} | ${verdict} | ${harmed.join(' ') || '—'} `
      + `| ${kept} (${((kept / baselineChars) * 100).toFixed(0)}%) | ${kept === 0 ? 'n/a' : `${((keptRelevant / kept) * 100).toFixed(1)}%`} |`);
  }
}

async function main(): Promise<void> {
  const results = await runBattery();
  if (process.argv.includes('--collect')) collect(results);
  else report(results);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
