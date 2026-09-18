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
 * THE SIGNAL RATIO UNDERCOUNTS A CORRECT ANSWER THAT IS A TITLE. It is a
 * CHARACTER ratio, and a title-only post contributes zero characters. q03 is
 * answered correctly by exactly such a post and therefore reads as 0.0% signal.
 * Do not optimise against this number without excluding that case: a rule that
 * "improved" q03's signal would be one that dropped the right answer.
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
  /** How many DISTINCT query terms occur in this passage. */
  readonly coverage: number;
  /** Total occurrences of any query term. The term-frequency mechanism. */
  readonly occurrences: number;
  /** The searchable text this passage's rank was computed from. */
  readonly ranked: string;
}

/**
 * Coverage and term frequency, counted the way `simple` tokenises.
 *
 * AN APPROXIMATION, AND IT IS FLAGGED RATHER THAN HIDDEN. `to_tsvector('simple')`
 * has its own tokeniser with special handling for URLs, emails, file paths and
 * hyphenated words, so a split on non-alphanumerics can disagree with it on
 * exotic input. For the plain alphanumeric terms this battery produces the two
 * agree, and this is used ONLY to explain mechanisms and to score a candidate
 * ORDERING -- never to reproduce a rank. Anything that needs a real rank needs
 * Postgres.
 */
function termStats(text: string, terms: readonly string[]): { coverage: number; occurrences: number } {
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let coverage = 0;
  let occurrences = 0;
  for (const term of terms) {
    const n = counts.get(term) ?? 0;
    if (n > 0) coverage += 1;
    occurrences += n;
  }
  return { coverage, occurrences };
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
        // A post's rank is computed over TITLE THEN BODY, so that is what the
        // mechanism columns must be counted against.
        const ranked = text.length === 0 ? label : `${label} ${text}`;
        passages.push({
          key: passageKey('post', row.padlet_id, 0),
          source: 'post',
          label: text.length === 0 ? `${label} (title only)` : label,
          chars: text.length,
          rank: row.rank,
          textHash: textHash(text),
          preview: text.replace(/\s+/g, ' ').slice(0, 70),
          ranked,
          ...termStats(ranked, query.terms),
        });
      }
      for (const row of (chunks.data ?? []) as ChunkRow[]) {
        const text = (row.text ?? '').trim();
        // A chunk's rank is computed over c.text ALONE -- no filename, no title.
        // That is why post title weighting cannot touch a chunk-vs-chunk
        // inversion.
        passages.push({
          key: passageKey('pdf', row.document_id, row.chunk_index),
          source: 'pdf',
          label: `${(row.original_filename ?? 'PDF').trim()} — page ${row.page_start}`,
          chars: text.length,
          rank: row.rank,
          textHash: textHash(text),
          preview: text.replace(/\s+/g, ' ').slice(0, 70),
          ranked: text,
          ...termStats(text, query.terms),
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

/**
 * Merge this run's passages into the ratings file. NEVER DELETE A RATING.
 *
 * THE BUG THIS REPLACES, because it is the worst kind an instrument can have.
 * The first version rebuilt the file from the CURRENT result set: any passage a
 * change had pushed out of the top-K silently vanished, taking its human rating
 * with it. It cost two real ratings (q10's pages 5 and 6, recovered from git),
 * and the file header claimed "Existing ratings are preserved" the whole time.
 *
 * IT ALSO MADE THE BAR UNSOUND, which is the part that matters more than the
 * lost work. The bar is "never drops a human-rated-relevant passage". If a rule
 * drops one and `--collect` then runs, the rating for the dropped passage
 * disappears -- so the rule can no longer be disqualified by it. The instrument
 * would quietly erase the evidence against the very change being measured, and
 * every table printed afterwards would look cleaner than the truth.
 *
 * So ratings are now permanent. A passage that stops being returned is KEPT and
 * reported as carried, because "this used to come back and no longer does" is a
 * finding, not garbage to collect.
 */
function collect(results: readonly BatteryResult[]): void {
  const existing = loadRatings();
  const next: Ratings = JSON.parse(JSON.stringify(existing)) as Ratings;
  const returnedNow = new Set<string>();
  let added = 0;
  for (const result of results) {
    next[result.id] ??= {};
    for (const passage of result.passages) {
      returnedNow.add(`${result.id} / ${passage.key}`);
      if (next[result.id][passage.key] !== undefined) continue;
      added += 1;
      next[result.id][passage.key] = {
        relevant: null,
        note: `${passage.source} | ${passage.label} | ${passage.chars} chars | ${passage.preview}`,
      };
    }
  }
  const carried = Object.entries(next)
    .flatMap(([question, passages]) => Object.keys(passages)
      .map((key) => `${question} / ${key}`)
      .filter((id) => !returnedNow.has(id)));

  fs.writeFileSync(RATINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${RATINGS_PATH}`);
  console.log(`${added} passage(s) need a rating. Set "relevant" to true or false for each.`);
  if (carried.length > 0) {
    // Not a warning about the file -- a report about the SEARCH. Each of these
    // was returned once and is not returned now.
    console.log(`\n${carried.length} rated passage(s) are NO LONGER RETURNED, and were kept:`);
    for (const id of carried) console.log(`  ${id}`);
  }
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
  // 0.4 is in the list because the doc quotes it: it is the first step that
  // loses a relevant passage, which is what makes 0.3 a tuned constant wearing a
  // relative name rather than a safe default.
  for (const fraction of [0.3, 0.4, 0.5, 0.7, 0.8, 0.9]) {
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

  /*
   * RECALL AGAINST THE RATING CORPUS -- the check the rule table CANNOT make.
   *
   * Every rule below is scored over the passages the search RETURNED, so a
   * change that stops returning a passage is invisible to it: the row simply is
   * not there to be dropped. That blind spot is not hypothetical. The additive
   * rank (20260918170000) pushed q07's rated-relevant TENS page out of the
   * top-K, and the rule table showed nothing at all -- every rule still read
   * "drops relevant: none", because they all operated on a set that no longer
   * contained it.
   *
   * The ratings file is the only record of what the search has EVER returned, so
   * it is the only thing a regression can be measured against. This is that
   * measurement, and it belongs above the rule table rather than below it.
   */
  const returned = new Set(results.flatMap((r) => r.passages.map((p) => `${r.id} / ${p.key}`)));
  const missingRelevant = Object.entries(ratings).flatMap(([question, passages]) =>
    Object.entries(passages)
      .filter(([key, value]) => value.relevant === true && !returned.has(`${question} / ${key}`))
      .map(([key, value]) => ({ question, key, note: value.note ?? '' })));

  console.log('\n\n# Recall against the rating corpus\n');
  if (missingRelevant.length === 0) {
    console.log('Every passage ever rated RELEVANT is still returned.');
  } else {
    console.log(`!! ${missingRelevant.length} passage(s) rated RELEVANT are NO LONGER RETURNED.`);
    console.log('   The rule table below cannot see this: it scores only what came back.\n');
    for (const entry of missingRelevant) {
      console.log(`   ${entry.question} / ${entry.key}`);
      console.log(`     ${entry.note}`);
    }
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

/* ------------------------------------------------------------------ */
/* B. The ranking diagnosis                                           */
/* ------------------------------------------------------------------ */

/**
 * Every place a passage rated IRRELEVANT outranks one rated RELEVANT.
 *
 * These are the pairs the floor died on: a floor is defined against the top hit,
 * so wherever one of these exists, the floor protects the noise and cuts the
 * answer.
 */
function invertedPairs(results: readonly BatteryResult[], ratings: Ratings) {
  const pairs: Array<{
    query: string; relevant: BatteryPassage; irrelevant: BatteryPassage; ratio: number;
  }> = [];
  for (const result of results) {
    const rel = result.passages.filter((p) => ratings[result.id]?.[p.key]?.relevant === true);
    const irr = result.passages.filter((p) => ratings[result.id]?.[p.key]?.relevant === false);
    for (const bad of irr) {
      for (const good of rel) {
        if (bad.rank > good.rank) {
          pairs.push({ query: result.id, relevant: good, irrelevant: bad, ratio: bad.rank / good.rank });
        }
      }
    }
  }
  return pairs.sort((a, b) => b.ratio - a.ratio);
}

/**
 * Which mechanism explains one inversion.
 *
 * Reported as evidence rather than a verdict: the columns are the inputs
 * `ts_rank` actually uses, so a reader can check the attribution instead of
 * taking it.
 */
function mechanismOf(pair: { relevant: BatteryPassage; irrelevant: BatteryPassage }): string {
  const { relevant, irrelevant } = pair;
  const reasons: string[] = [];
  if (irrelevant.coverage > relevant.coverage) reasons.push('coverage (irrelevant matches MORE distinct terms)');
  if (irrelevant.coverage === relevant.coverage && irrelevant.occurrences > relevant.occurrences) {
    reasons.push('term frequency (same coverage, more occurrences)');
  }
  if (irrelevant.source === 'post' && irrelevant.chars === 0) {
    reasons.push('title-only shortness (length normalization rewards a very short document)');
  }
  if (irrelevant.source === 'pdf' && relevant.source === 'pdf'
    && irrelevant.ranked.length > relevant.ranked.length && irrelevant.occurrences > relevant.occurrences) {
    reasons.push('chunk-vs-chunk: a longer intro repeats the topic more often than the answering paragraph');
  }
  if (reasons.length === 0) reasons.push('unexplained by coverage, frequency or length -- needs a real rank comparison');
  return reasons.join('; ');
}

/** Coverage-first ordering: sort by distinct terms matched, then by rank. */
const coverageFirst = (passages: readonly BatteryPassage[]): readonly BatteryPassage[] =>
  [...passages].sort((a, b) => (b.coverage - a.coverage) || (b.rank - a.rank));

function diagnose(results: readonly BatteryResult[]): void {
  const ratings = loadRatings();
  const pairs = invertedPairs(results, ratings);

  console.log('\n# B. Ranking diagnosis\n');
  console.log(`${pairs.length} inverted pair(s): an irrelevant passage outranking a relevant one.\n`);
  console.log('| query | ratio | irrelevant (rank, cov, occ, len) | relevant (rank, cov, occ, len) | mechanism |');
  console.log('|---|---|---|---|---|');
  for (const pair of pairs) {
    const f = (p: BatteryPassage) =>
      `${p.rank.toFixed(6)}, ${p.coverage}, ${p.occurrences}, ${p.ranked.length}`;
    console.log(`| ${pair.query} | ${pair.ratio.toFixed(2)}x | ${pair.irrelevant.label} (${f(pair.irrelevant)}) `
      + `| ${pair.relevant.label} (${f(pair.relevant)}) | ${mechanismOf(pair)} |`);
  }

  console.log('\n## Candidate: coverage-first ordering\n');
  console.log('Scored against the SAME 36 ratings. It reorders; it discards nothing, so it cannot');
  console.log('lose a relevant passage. What it can do is fix or fail to fix each pair.\n');
  let fixed = 0;
  let broken = 0;
  console.log('| query | pair | coverage-first fixes it? |');
  console.log('|---|---|---|');
  for (const pair of pairs) {
    const ordered = coverageFirst([pair.relevant, pair.irrelevant]);
    const ok = ordered[0].key === pair.relevant.key;
    if (ok) fixed += 1; else broken += 1;
    console.log(`| ${pair.query} | ${pair.irrelevant.label} over ${pair.relevant.label} | ${ok ? 'YES' : 'no'} |`);
  }
  console.log(`\ncoverage-first fixes ${fixed} of ${pairs.length} inverted pairs; ${broken} remain.`);

  console.log('\n## Candidates that CANNOT be scored from here\n');
  console.log('normalization 0 and 2, ts_rank_cd, setweight A/B, and a document-title term in the');
  console.log('chunk rank all need ts_rank evaluated by Postgres over alternative vectors. There is');
  console.log('no DATABASE_URL in this environment and the two shipped functions are fixed at');
  console.log('flag 1, so they cannot be measured here. Reimplementing ts_rank in TypeScript to');
  console.log('score them would encode a different assumption than the code -- exactly the error');
  console.log('this battery exists to prevent.');
  console.log('\nRun scripts/db/boardSearchRankingVariants.sql (read-only) to produce them.');
}

async function main(): Promise<void> {
  const results = await runBattery();
  if (process.argv.includes('--collect')) collect(results);
  else if (process.argv.includes('--diagnose')) diagnose(results);
  else report(results);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
