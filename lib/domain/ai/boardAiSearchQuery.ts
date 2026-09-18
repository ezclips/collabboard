/**
 * Turning a chat message into a tsquery the database can actually match.
 *
 * THIS IS THE PIECE THAT DECIDES WHETHER SEARCH FINDS ANYTHING AT ALL, and it
 * exists because the obvious implementation is silently broken:
 * `websearch_to_tsquery` and `plainto_tsquery` both **AND** their terms. Handing
 * either a whole chat message asks the database for a post containing every one
 * of six hundred words, which matches nothing, every time. It would not error,
 * it would not warn, and it would have shipped as "board search never finds
 * anything".
 *
 * So the query is built here, term by term, and joined with `|`. The cost of OR
 * is recall over precision -- a message mentioning "Iran" and "invoice" matches
 * posts about either -- and `ts_rank` plus the caller's small top-K is what
 * makes that acceptable: a post matching more of the terms outranks one matching
 * fewer.
 *
 * IT IS ALSO THE SANITISER. `to_tsquery` RAISES on malformed input (42601), so
 * if a user's punctuation reached it a chat message would become a 500. Terms
 * here are letters and digits only, which is what makes the SQL side able to
 * call `to_tsquery` directly instead of guessing at an escaping scheme.
 *
 * Domain, not server: no database, no client, no I/O. The server calls it, and
 * the tests pin the four cases that actually bite.
 */

/**
 * Terms shorter than this are dropped.
 *
 * Two, not three: "AI", "R2", "Q4" and "US" are exactly the kind of term a board
 * question turns on, and a one-character term under OR matches a large fraction
 * of everything while contributing nothing a reader would recognise as intent.
 */
export const BOARD_SEARCH_MIN_TERM_LENGTH = 2;

/**
 * The most terms one query may carry.
 *
 * A cap is needed because the message is capped at 4,000 characters, which is
 * hundreds of distinct words, and every OR branch is real work for the index.
 * Twenty is generous for a question and keeps the query readable in a log.
 * Terms are kept in the order they were written, so truncation keeps the
 * beginning of the question -- where people put the subject -- rather than an
 * arbitrary slice.
 */
export const BOARD_SEARCH_MAX_TERMS = 20;

/**
 * Words carrying no retrieval signal, dropped before the cap.
 *
 * Deliberately a SMALL, closed list: ordinary English function words plus the
 * handful of question openers a board chat is full of. It is not a linguistic
 * stopword list and does not try to be -- an aggressive list drops terms that
 * matter in a product corpus ("can" in "CAN bus", "will" in a name), and this
 * runs against a `simple` text search configuration that does no stemming and
 * strips no stopwords of its own.
 *
 * Dropping these BEFORE the cap is what stops "what is this document about"
 * from spending five of twenty slots on nothing.
 */
const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'done',
  'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'him', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its',
  'just', 'me', 'more', 'most', 'my',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'our', 'ours', 'out', 'over', 'own',
  'please', 'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'us', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'will', 'with', 'would',
  'you', 'your', 'yours',
]);

/**
 * Words that carry no content BECAUSE THE CORPUS IS A BOARD.
 *
 * WHY THIS EXISTS AS A SEPARATE LIST. Measured on 2026-09-18: the question
 * "What do the Iran oil headlines on this board say?" assembled 3,018 characters
 * of context of which roughly 212 answered it — about 7% signal. The rest was
 * *Chess Opening Theory* and *bicycle chain lubricant*, pulled in because `board`
 * matched a chess board and `oil` matched chain oil. The term `board` alone
 * accounted for 2,132 of those noise characters.
 *
 * WHY A DOCUMENT-FREQUENCY FLOOR CANNOT FIND THESE, which is the obvious
 * alternative and the reason it was rejected: `board` is RARE inside any one
 * board's text while being generic to the product. A corpus-relative measure
 * looks at the text being searched, finds `board` in two documents out of
 * eighty, concludes it is highly selective — and keeps precisely the term that
 * caused most of the damage. The problem is not statistical, it is contextual:
 * the user is typing to a thing called a board, so they say "board" the way they
 * say "the".
 *
 * TWO GROUPS, AND THE LINE BETWEEN THEM IS THE POINT.
 *
 *   * PRODUCT NOUNS -- `board`, `canvas`, `padlet`. The name of the surface the
 *     user is looking at. Naming it says nothing about what they want from it.
 *   * ASKING VERBS -- `say`, `tell`, `show`, `find`. These describe the REQUEST,
 *     not its subject: "find the note about X" is a request about X.
 *
 * WHAT IS DELIBERATELY NOT HERE: `note`, `post`, `page`, `pdf`, `document`.
 * Those are CONTENT-TYPE words and they stay searchable, because "what does the
 * note about X say" must not lose its noun — the user may genuinely be
 * distinguishing a note from a PDF, and a post titled "Release note" is a real
 * match for someone searching for it.
 *
 * THE LIMIT: this list is English only. It does not apply to the German
 * questions this board already receives, so no German term is dropped BY IT.
 *
 * That is not the same as "German is unaffected", and the difference is worth
 * stating rather than glossing. The LINGUISTIC list above does collide with
 * German, on six words measured against a sample of German board questions:
 * `am`, `an`, `in`, `so`, `was` and `will`. Five of those are function words in
 * German too, so dropping them is right for the wrong reason. The sixth,
 * `will` — German for "wants" — is a real verb being dropped because English
 * spells its future auxiliary the same way.
 *
 * Today that costs almost nothing: it is a recall question on one modal verb,
 * not a precision one, and the surrounding content terms carry the query. A
 * German list is worth building when German questions become common enough to
 * measure; guessing at one now would be inventing rules for traffic nobody has
 * counted, and the collision above is the honest reason it is a real item
 * rather than a theoretical one.
 */
export const BOARD_SEARCH_CONTEXT_STOPWORDS: ReadonlySet<string> = new Set([
  'board', 'canvas', 'padlet',
  'say', 'tell', 'show', 'find',
]);

/**
 * Everything that is not a letter or a digit is a separator.
 *
 * Unicode-aware on purpose: a board is not necessarily English, and splitting on
 * `[a-z0-9]` would reduce "Präsentation" to two terms and drop most of a
 * non-Latin message entirely. The `u` flag plus `\p{L}\p{N}` keeps whole words
 * in any script while still excluding every character `to_tsquery` would read as
 * an operator -- `& | ! ( ) : * < >` are none of them letters or digits.
 */
const SEPARATORS = /[^\p{L}\p{N}]+/u;

/** What the caller learns about its own query, so a chip can be honest. */
export interface BoardAiSearchQuery {
  /** The tsquery expression, or '' when nothing survived. */
  readonly expression: string;
  /** The surviving terms, in the order they were written. */
  readonly terms: readonly string[];
  /** True when the message held nothing worth searching for. */
  readonly isEmpty: boolean;
}

/**
 * Build the tsquery expression for one message.
 *
 * AN EMPTY RESULT IS NOT AN ERROR, and callers must treat it that way. A message
 * of pure stopwords ("what is it about?") legitimately reduces to nothing, and
 * that is an ordinary outcome to report -- "the search found nothing" -- not a
 * failure to raise. The SQL side agrees: a blank query returns no rows rather
 * than raising.
 */
export function buildBoardAiSearchQuery(message: string): BoardAiSearchQuery {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const raw of message.toLowerCase().split(SEPARATORS)) {
    if (terms.length >= BOARD_SEARCH_MAX_TERMS) break;
    if (raw.length < BOARD_SEARCH_MIN_TERM_LENGTH) continue;
    if (STOPWORDS.has(raw)) continue;
    // Generic to the PRODUCT rather than to language. See the list's own note
    // for why a document-frequency measure cannot find these.
    if (BOARD_SEARCH_CONTEXT_STOPWORDS.has(raw)) continue;
    // De-duplicate AFTER the stopword drop and BEFORE the cap, so a message
    // that repeats one word twenty times does not spend the whole budget on it.
    if (seen.has(raw)) continue;
    seen.add(raw);
    terms.push(raw);
  }

  return {
    expression: terms.join(' | '),
    terms,
    isEmpty: terms.length === 0,
  };
}
