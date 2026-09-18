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
