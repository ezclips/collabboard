// Reading a compilation's output: its markers, its sources, and whether it is
// actually finished.
//
// Unit 3 of .agent/wiki-plan.md. Pure domain: no client, no provider, no fetch.
//
// ===========================================================================
// THE MARKERS STAY IN THE STORED CONTENT, AND THAT IS A CONTRACT DECISION
// ===========================================================================
//
// A compiled page keeps the `[S1.2]` markers the model wrote, sentence by
// sentence, exactly as the chat path's citation grammar produces them. The
// alternative -- strip them at compile time and keep only the page-level chain
// -- loses which SENTENCE came from which passage, permanently: once a page is
// stored without markers, no later feature can recover the mapping without
// recompiling, and a recompilation does not produce the same page twice
// (measured: 11 vs 18 claims for the same topic and passages).
//
// With markers stored, a claim-level view is DERIVABLE from content + chain at
// any time, over pages that already exist. That is the whole reason to decide
// it now rather than later: it is cheap today and impossible retroactively.
//
// ===========================================================================
// AND THEY ARE ALSO THE ONLY TRUNCATION DETECTOR THIS PATH HAS
// ===========================================================================
//
// `adapter.generateText()` returns a bare string; the adapter discards
// `finish_reason`, so a compilation cut off at the token cap arrives here
// indistinguishable from a complete one -- the same blind spot that let a
// truncated chat answer render as an answer. It cannot be closed from here.
//
// But a truncated compilation has a shape: the prompt requires every sentence
// to END with its marker, so a page cut mid-sentence ends WITHOUT one. That is
// not a proof of completeness, and it is not claimed as one -- it catches the
// common case, cheaply, on a path where nothing else looks at all.

import type { BoardAiCitationItem } from '../ai/boardAiChatCitation';
import type { BoardWikiPageSource, BoardWikiSourceVersion } from './boardWikiPageSources';

/** `[S1]` or `[S1.2]` at the end of a sentence. The chat grammar, unchanged. */
const MARKER = /\[(S[1-9][0-9]*(?:\.[1-9][0-9]*)?)\]/g;

export interface BoardWikiCompiledPassage {
  /** The token the model was handed, e.g. `S1.2`. */
  readonly token: string;
  readonly item: BoardAiCitationItem;
  readonly version: BoardWikiSourceVersion;
}

export type BoardWikiCompileRejection =
  | 'empty'
  | 'unattributed'
  | 'truncated'
  | 'invented-token'
  | 'no-passages-used';

export interface BoardWikiCompileReading {
  readonly content: string;
  /** Only the passages the page ACTUALLY cited, in the order it first cited them. */
  readonly sources: readonly BoardWikiPageSource[];
  readonly claimCount: number;
  /** True when the model correctly declined to answer from the passages given. */
  readonly declined: boolean;
}

/**
 * Splits a page the way the fidelity instrument does, so the property measured
 * there is the property enforced here. Divergence between the two would mean
 * the measurement stopped describing the product.
 */
function sentencesOf(page: string): readonly string[] {
  return page
    .split('\n')
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9"'(])/u))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function markersIn(sentence: string): readonly string[] {
  return [...sentence.matchAll(MARKER)].map((match) => match[1]);
}

/**
 * A heading is not a claim, and must not be scored as one.
 *
 * Unit 0's first metric defect: the model titles the page, and counting the
 * title as an unattributed claim rejected pages whose every sentence was
 * sound. Kept identical to the instrument's rule.
 */
function isHeading(sentence: string, index: number): boolean {
  const bare = sentence.replace(MARKER, '').trim();
  if (/^#{1,6}\s/.test(bare)) return true;
  if (/^\*\*.*\*\*$/.test(bare)) return true;
  // A BARE SHORT LINE IS A TITLE ONLY AT THE TOP. This restriction is not
  // tidiness: a page cut off at the token cap ends in a short unpunctuated
  // fragment -- "Then you unscrew the" -- which is exactly the shape of an
  // unmarked heading. Without the position rule a truncated page reads as a
  // complete one with a trailing title, and the truncation check below never
  // sees the fragment at all.
  return index === 0 && bare.length < 80 && !/[.!?]$/.test(bare);
}

/**
 * The licensed refusal, which is the single most desirable behaviour a
 * compiler has and was once scored as its worst failure.
 *
 * The prompt permits exactly one unattributed sentence when the passages do not
 * cover the topic. A page that declines is a valid OUTCOME -- it is just not a
 * page worth proposing, so the caller is told which it got rather than having
 * it rejected as unattributed.
 */
function isDeclined(claims: readonly string[]): boolean {
  if (claims.length !== 1) return false;
  return /\b(do(es)? not cover|no information|not covered|cannot be answered|nicht ab|keine (Informationen|Angaben))\b/i
    .test(claims[0])
    && markersIn(claims[0]).length === 0;
}

/**
 * Reads a compilation, or says why it is not usable.
 *
 * REJECTION IS THE DEFAULT FOR ANYTHING UNCERTAIN. A proposal that reaches a
 * person is a proposal they may apply, so the cost of accepting a bad
 * compilation is a page; the cost of rejecting a good one is a second click.
 */
export function readBoardWikiCompilation(
  content: string,
  passages: readonly BoardWikiCompiledPassage[],
): { readonly ok: true; readonly value: BoardWikiCompileReading }
  | { readonly ok: false; readonly reason: BoardWikiCompileRejection } {
  const trimmed = content.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };

  const all = sentencesOf(trimmed);
  const claims = all.filter((sentence, index) => !isHeading(sentence, index));
  if (claims.length === 0) return { ok: false, reason: 'empty' };

  if (isDeclined(claims)) {
    // Nothing to propose, and nothing wrong either.
    return { ok: true, value: { content: trimmed, sources: [], claimCount: 1, declined: true } };
  }

  // THE TRUNCATION CHECK. The prompt requires every sentence to END with its
  // marker, so a page cut off at the token cap ends without one. See the header
  // for what this does and does not prove.
  //
  // TRUNCATION IS "ENDS MID-SENTENCE", NOT "ENDS WITHOUT A MARKER". The two are
  // different failures and conflating them misdiagnoses both: a complete
  // sentence the model simply failed to attribute ends with a full stop and is
  // UNATTRIBUTED, while a page cut at the cap ends with neither punctuation nor
  // a marker. Real output writes `... saving much work [S1.1].` -- marker then
  // the sentence's own stop -- and some models write the stop first, so either
  // ending counts as finished.
  const last = claims[claims.length - 1];
  if (!/[.!?]\s*$/.test(last) && !/\]\s*$/.test(last)) {
    return { ok: false, reason: 'truncated' };
  }

  const unattributed = claims.filter((sentence) => markersIn(sentence).length === 0);
  if (unattributed.length > 0) return { ok: false, reason: 'unattributed' };

  const byToken = new Map(passages.map((passage) => [passage.token, passage]));
  const cited = claims.flatMap(markersIn);
  // AN INVENTED TOKEN REJECTS THE WHOLE PAGE rather than being dropped. In the
  // chat path a bad token costs one citation on an answer that scrolls away; on
  // a page it would be a durable claim whose provenance points nowhere, and a
  // model naming a passage it was never given is evidence about the rest of
  // what it wrote.
  if (cited.some((token) => !byToken.has(token))) return { ok: false, reason: 'invented-token' };

  // In first-citation order, deduplicated: the chain reads as the page reads.
  const sources: BoardWikiPageSource[] = [];
  const seen = new Set<string>();
  for (const token of cited) {
    if (seen.has(token)) continue;
    seen.add(token);
    const passage = byToken.get(token)!;
    sources.push({ item: passage.item, version: passage.version });
  }
  if (sources.length === 0) return { ok: false, reason: 'no-passages-used' };

  return { ok: true, value: { content: trimmed, sources, claimCount: claims.length, declined: false } };
}

/**
 * The markers a stored page carries, for anything that later wants to work at
 * claim level.
 *
 * Exported so the contract is a function with a test rather than a promise in a
 * comment: if a future change strips markers on the way into storage, this
 * returns nothing and its test fails.
 */
export function boardWikiMarkersIn(content: string): readonly string[] {
  return [...new Set([...content.matchAll(MARKER)].map((match) => match[1]))];
}
