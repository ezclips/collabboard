/**
 * PATCH-196. Scoring the board's compiled wiki pages against a question.
 *
 * PURE DOMAIN: no database, no client, no I/O. The server reads the pages and
 * calls in here to decide which are worth putting in front of the model. D3 of
 * `.agent/wiki-query-plan.md` is why this is lexical and in-app: a board has
 * tens of pages, not thousands, so the title-and-body term match llm_wiki's
 * Phase 1 uses is enough -- no index, no vectors, no migration, measured before
 * anything heavier is added.
 */

import type { BoardAiSearchQuery } from './boardAiSearchQuery';

/**
 * D4. At most two wiki pages reach the model on one turn. Borrowed from
 * llm_wiki's "a few pages, not the whole wiki" rule and PROVISIONAL: the number
 * is set here and then measured on the rating battery, not imported wholesale.
 */
export const BOARD_AI_WIKI_MAX_PAGES = 2;

/**
 * D4. At most this many characters of a page's body travel. The wiki excerpt is
 * capped so the raw post and PDF passages always keep the larger share of the
 * search budget -- see `boundBoardAiWikiPassages`.
 */
export const BOARD_AI_WIKI_EXCERPT_CHARS = 1500;

/** One wiki page as this module needs it: identity, title, body, no storage. */
export interface WikiSearchCandidatePage {
  readonly pageId: string;
  readonly title: string;
  readonly content: string;
}

export interface WikiSearchMatch {
  readonly pageId: string;
  readonly title: string;
  readonly score: number;
  /** The capped excerpt of the body, starting at the first matching paragraph. */
  readonly excerpt: string;
}

/**
 * Word-boundary, case-insensitive: does this text contain `term`?
 *
 * The term itself comes from `buildBoardAiSearchQuery`, which keeps letters and
 * digits only, so it holds nothing a regex would read as an operator. The
 * boundaries are checked against the surrounding characters rather than with
 * `\b`, because `\b` treats `_` and digits asymmetrically and the terms here are
 * any-script (see the query module's Unicode note).
 */
function containsTerm(text: string, term: string): boolean {
  const haystack = text.toLowerCase();
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(term, from);
    if (at === -1) return false;
    const before = at === 0 ? '' : haystack[at - 1];
    const after = haystack[at + term.length] ?? '';
    const beforeOk = before === '' || !isWordChar(before);
    const afterOk = after === '' || !isWordChar(after);
    if (beforeOk && afterOk) return true;
    from = at + 1;
  }
}

function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

/**
 * The excerpt: a bounded window of the body starting at the paragraph that
 * holds the first matching term, or at the page start when the first match was
 * in the TITLE (a title-only match has no body paragraph to start at).
 *
 * Paragraph boundaries are blank lines. Markers such as `[S1.2]` are left in
 * place -- the page's own provenance is content, not decoration to strip.
 */
export function boardAiWikiExcerpt(
  page: WikiSearchCandidatePage,
  terms: readonly string[],
  maxChars: number = BOARD_AI_WIKI_EXCERPT_CHARS,
): string {
  const body = page.content;
  let start = 0;
  let firstMatchAt = -1;
  for (const term of terms) {
    const at = body.toLowerCase().indexOf(term.toLowerCase());
    if (at !== -1 && (firstMatchAt === -1 || at < firstMatchAt)) firstMatchAt = at;
  }
  if (firstMatchAt > 0) {
    // Walk back to the start of the paragraph containing the first match.
    const boundary = body.lastIndexOf('\n\n', firstMatchAt);
    start = boundary === -1 ? 0 : boundary + 2;
  }
  return body.slice(start, start + maxChars);
}

/**
 * The pages worth sending, best first, at most `limit`.
 *
 * SCORE = 3 × (distinct terms in the TITLE) + (distinct terms in the CONTENT).
 * A title is the page's subject; a body mentions many things. The 3× is
 * llm_wiki's title weighting, kept as a small integer rather than tuned to a
 * corpus this one is not, per D4.
 *
 * A page needs AT LEAST ONE term. Ties break by title, alphabetically, so the
 * result is deterministic and a test can pin it.
 */
export function scoreWikiSearchPages(
  pages: readonly WikiSearchCandidatePage[],
  query: BoardAiSearchQuery,
  limit: number = BOARD_AI_WIKI_MAX_PAGES,
): readonly WikiSearchMatch[] {
  if (query.terms.length === 0) return [];

  const matches: WikiSearchMatch[] = [];
  for (const page of pages) {
    let titleTerms = 0;
    let contentTerms = 0;
    for (const term of query.terms) {
      if (containsTerm(page.title, term)) titleTerms += 1;
      if (containsTerm(page.content, term)) contentTerms += 1;
    }
    if (titleTerms + contentTerms === 0) continue;
    matches.push({
      pageId: page.pageId,
      title: page.title,
      score: 3 * titleTerms + contentTerms,
      excerpt: boardAiWikiExcerpt(page, query.terms),
    });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    // A final total order so two identically-titled pages cannot swap run to
    // run and make the result non-deterministic.
    return a.pageId < b.pageId ? -1 : a.pageId > b.pageId ? 1 : 0;
  });
  return matches.slice(0, limit);
}
