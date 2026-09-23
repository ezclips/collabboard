/**
 * Parsing a model's suggested questions for a document.
 *
 * PURE, and deliberately NEVER an error. The model is asked for three questions
 * and may return prose, an apology, a numbered list, a bulleted list, or
 * nothing at all. Every one of those is a suggestion that could not be made,
 * which is `[]` -- not a failure. A panel that showed an error because a
 * courtesy could not be produced would be reporting a fault where there is
 * none.
 *
 * WHAT IT DOES NOT DO: it does not verify that a question is answerable from
 * the document. Only the document can say that, and a suggestion is read by the
 * user before they choose to ask it.
 */

/** The most questions ever returned, however many the model writes. */
export const BOARD_AI_STARTER_QUESTIONS_MAX = 3;

/** A question longer than this is not a question a chip can show. */
export const BOARD_AI_STARTER_QUESTION_MAX_CHARS = 160;

/**
 * Leading list furniture to strip: an ordered marker (`1.`, `1)`, `1:`), a
 * bullet (`-`, `*`, `•`), or an opening quote the model wrapped the line in.
 *
 * Anchored and repeated so `- 1. "Question?"` cleans in one pass.
 */
const LEADING_FURNITURE = /^\s*(?:(?:\d+\s*[.)\]:])|[-*•–—]|["'“”‘’])+\s*/;

/** A trailing closing quote the model added around the line. */
const TRAILING_QUOTE = /\s*["'“”‘’]\s*$/;

export function parseStarterQuestions(raw: string): readonly string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];

  const questions: string[] = [];
  const seen = new Set<string>();

  for (const line of raw.split(/\r?\n/)) {
    // Strip leading numbering/bullets/quotes and a trailing quote, then trim.
    let candidate = line.replace(LEADING_FURNITURE, '').replace(TRAILING_QUOTE, '').trim();
    // The trailing quote strip can expose more furniture (`1. "Q?" "`), so a
    // second pass keeps the clean common.
    candidate = candidate.replace(LEADING_FURNITURE, '').replace(TRAILING_QUOTE, '').trim();
    if (candidate.length === 0) continue;

    // ONLY QUESTIONS. A preamble, an apology or a sentence of prose does not
    // end in `?` and is dropped here.
    if (!candidate.endsWith('?')) continue;
    if (candidate.length > BOARD_AI_STARTER_QUESTION_MAX_CHARS) continue;

    const key = candidate.toLowerCase();
    if (seen.has(key)) continue; // case-insensitive dedupe, first wins
    seen.add(key);
    questions.push(candidate);

    if (questions.length >= BOARD_AI_STARTER_QUESTIONS_MAX) break;
  }

  return questions;
}
