// Turning an unpunctuated transcript into a readable one, WITHOUT ever letting
// the model write the text.
//
// ============================================================================
// WHY THIS EXISTS
// ============================================================================
//
// YouTube's auto-captions carry no punctuation, and -- measured on a real
// 92-cue transcript -- no pause information either: every one of the 91 gaps
// between consecutive cues is exactly 0 ms. So a paragraph break has nothing
// real to land on, and any break is arbitrary. The only way to make the breaks
// mean something is to put sentences in.
//
// ============================================================================
// THE SAFETY PROPERTY, AND WHY IT IS STRUCTURAL RATHER THAN CHECKED
// ============================================================================
//
// An LLM asked to punctuate text WILL sometimes change words -- it is a
// documented failure, not a hypothetical. The guardrails shipped in the wild
// are thresholds ("60% of content words survived", "length within 0.5-1.5x"),
// and both would pass real corruption.
//
// So the model never writes the text. It returns punctuated text, WE DISCARD
// ITS TEXT, and rebuild the output by walking the ORIGINAL words and taking
// only: (a) the punctuation it placed after each word, and (b) the casing of a
// word's FIRST letter. Every other character of every word provably came from
// the original. A model output whose word sequence does not match the original
// EXACTLY -- same length, same order, every token equal -- is refused outright.
//
// That is strictly stronger than "generate, verify, accept or reject": harmless
// drift is repaired, real corruption is refused, and no threshold exists to be
// tuned past.

import { domainError, type DomainError } from '../core/errors';
import { err, ok, type Result } from '../core/result';

/** What one chunk's projection produced. */
export interface PunctuationProjection {
  readonly text: string;
  /** Words whose capitalisation the model changed. Diagnostics only. */
  readonly recasedWords: number;
  readonly insertedMarks: number;
}

/**
 * The punctuation a model may place between words.
 *
 * A CLOSED, EXHAUSTIVE SET DECLARED AS A `Record`, deliberately, and the reason
 * is written down because it has already cost this project once: PATCH-156
 * Part A declared a format union and shipped a value that compiled, tested and
 * could never be reached. An array widens silently -- iterating keys of a
 * Record over the exhaustive union forces every member to be considered here.
 *
 * The apostrophe is NOT in this set. An apostrophe inside a word is part of the
 * word ("don't") and is carried by the original; an apostrophe the model put
 * BETWEEN words is not something this format can place, so it is dropped like
 * any other disallowed character.
 */
const ALLOWED_MARKS: Record<'.' | ',' | '?' | '!' | ';' | ':' | '—', true> = {
  '.': true,
  ',': true,
  '?': true,
  '!': true,
  ';': true,
  ':': true,
  '—': true,
};

function isAllowedMark(character: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_MARKS, character);
}

/**
 * Sentence-ending marks, for paragraphing. A subset of the allowed set, listed
 * separately because they mean something different to the layout than a comma
 * does.
 */
const SENTENCE_END: Record<'.' | '?' | '!', true> = { '.': true, '?': true, '!': true };

/**
 * The characters that may appear INSIDE a word part, from the model.
 *
 * A second CLOSED, EXHAUSTIVE `Record`, for the same reason ALLOWED_MARKS is
 * one: an array widens silently. An apostrophe and a hyphen are SPELLING, not
 * words -- a transcript is speech, and "kings pawn" and "king's pawn" are the
 * same spoken words -- so the model may add them BETWEEN letters.
 *
 * The apostrophe has two spellings and both are accepted, because a model
 * reasonably emits either. Hyphen means `-` only; an en or em dash STAYS a
 * between-word mark, governed by ALLOWED_MARKS above.
 */
const IN_WORD_CHARACTERS: Record<"'" | '\u2019' | '-', true> = {
  "'": true,
  '\u2019': true,
  '-': true,
};

function isInWordCharacter(character: string): boolean {
  return Object.prototype.hasOwnProperty.call(IN_WORD_CHARACTERS, character);
}

function isLetterOrDigit(character: string): boolean {
  return /[\p{L}\p{N}]/u.test(character);
}

/**
 * THE WORD PARTS of a string, in order.
 *
 * Split on WHITESPACE AND HYPHENS, so `setup-based` and `setup based` yield the
 * same two parts -- that equivalence is the whole point of allowing a hyphen.
 * Each part keeps its ORIGINAL characters; the comparable form is derived
 * separately below.
 */
function wordParts(value: string): readonly string[] {
  return value
    .split(/[\s-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * A part reduced to what must match: its LETTERS AND DIGITS, lowercased.
 *
 * Apostrophes and hyphens are dropped here, so `kings` and `king's` reduce to
 * `kings`, and `setup`/`based` are the same parts whether or not a hyphen
 * joined them in the source. A letter changed, added, removed or reordered
 * still differs, which is what makes this a guarantee rather than a threshold.
 */
function comparablePart(part: string): string {
  return part
    .split('')
    .filter(isLetterOrDigit)
    .join('')
    .toLowerCase();
}

function comparableParts(value: string): readonly string[] {
  return wordParts(value).map(comparablePart);
}

/** Whitespace-delimited tokens, hyphen INCLUDED, for reconstruction. */
function whitespaceTokens(value: string): readonly string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** The letters and digits of a token, in order, as an array of characters. */
function letterDigitStream(token: string): readonly string[] {
  return token.split('').filter(isLetterOrDigit);
}

/**
 * PROJECT the model's punctuation and spelling onto the original words.
 *
 * Returns `err` unless the model's LETTER-AND-DIGIT sequence is exactly the
 * original's: same number of parts, same order, every part equal after
 * reduction. The error names the first index that differs, because a silent
 * mismatch is what this whole module exists to prevent.
 *
 * ---------------------------------------------------------------- GUARANTEE
 * Every letter and digit in the output comes from the original, in the same
 * order, with nothing added, removed, reordered or substituted. The only
 * characters the model contributes are the allowed punctuation marks, an
 * apostrophe or hyphen placed between letters, spaces, and the upper/lower case
 * of a part's first letter.
 * ---------------------------------------------------------------------------
 */
export function projectTranscriptPunctuation(
  original: string,
  modelOutput: string,
): Result<PunctuationProjection, DomainError> {
  const originalParts = wordParts(original);
  const modelParts = wordParts(modelOutput);

  const originalComparable = originalParts.map(comparablePart);
  const modelComparable = modelParts.map(comparablePart);

  if (originalComparable.length !== modelComparable.length) {
    return err(domainError(
      'validation',
      `The model returned ${modelComparable.length} words where the transcript has ${originalComparable.length}.`
        + ' The words must not change, so this chunk was not used.',
      { details: { reason: 'word-count-mismatch', firstDifference: -1 } },
    ));
  }

  for (let index = 0; index < originalComparable.length; index += 1) {
    if (originalComparable[index] !== modelComparable[index]) {
      return err(domainError(
        'validation',
        `The model changed the word at position ${index} ("${originalParts[index]}" became`
          + ` "${modelParts[index]}"). The words must not change, so this chunk was not used.`,
        { details: { reason: 'word-mismatch', firstDifference: index } },
      ));
    }
  }

  // The sequences match. REBUILD on PARTS (whitespace AND hyphens), because the
  // model may join `setup based` into `setup-based` -- one whitespace token, two
  // parts. Pairing on whitespace tokens would misalign them. For every part, the
  // LETTERS AND DIGITS come from the ORIGINAL part; the model contributes only
  // its in-word apostrophes/hyphens and its case.
  let text = '';
  let recasedWords = 0;
  let insertedMarks = 0;

  // For each part index, whether the MODEL placed a hyphen before it (as
  // opposed to a space). One pass over the model string: a part begins at each
  // letter/digit that follows whitespace or a hyphen, and the separator is
  // whichever of those it followed.
  const WAS_HYPHEN_SEPARATED: boolean[] = (() => {
    const flags: boolean[] = [];
    let separatorWasHyphen = false;
    let inPart = false;
    for (const character of modelOutput) {
      if (/\s/.test(character)) { inPart = false; separatorWasHyphen = false; continue; }
      if (character === '-') { inPart = false; separatorWasHyphen = true; continue; }
      if (!isLetterOrDigit(character)) continue;
      if (!inPart) { flags.push(separatorWasHyphen); inPart = true; }
    }
    return flags;
  })();

  for (let index = 0; index < originalParts.length; index += 1) {
    const originalPart = originalParts[index];
    const modelPart = modelParts[index];
    const originalStream = letterDigitStream(originalPart);
    let streamCursor = 0;
    let rebuilt = '';

    for (const character of modelPart) {
      if (isLetterOrDigit(character)) {
        rebuilt += originalStream[streamCursor] ?? '';
        streamCursor += 1;
        continue;
      }
      // An apostrophe or hyphen BETWEEN letters is spelling and is kept. A mark
      // after the run is punctuation, taken below.
      if (isInWordCharacter(character) && streamCursor > 0) rebuilt += character;
    }

    // The case of the first letter may come from the model; nothing else.
    const originalFirst = rebuilt[0];
    const modelFirst = modelPart[0];
    if (originalFirst !== undefined && modelFirst !== undefined
      && originalFirst !== modelFirst
      && originalFirst.toLowerCase() === modelFirst.toLowerCase()) {
      rebuilt = modelFirst + rebuilt.slice(1);
      recasedWords += 1;
    }

    // THE SEPARATOR before this part: a hyphen when the model joined it with a
    // hyphen, otherwise a space. Nothing precedes the first part.
    if (index > 0) text += WAS_HYPHEN_SEPARATED[index] ? '-' : ' ';
    text += rebuilt;

    // The punctuation TRAILING this part's last letter/digit, filtered to the
    // allowed set -- EXCEPT a hyphen, which is the separator handled above.
    let lastLetterIndex = -1;
    for (let i = modelPart.length - 1; i >= 0; i -= 1) {
      if (isLetterOrDigit(modelPart[i])) { lastLetterIndex = i; break; }
    }
    for (const character of modelPart.slice(lastLetterIndex + 1)) {
      if (!isAllowedMark(character)) continue;
      text += character;
      insertedMarks += 1;
    }
  }

  return ok({ text, recasedWords, insertedMarks });
}

/**
 * The chunks a transcript is punctuated in.
 *
 * Cuts ONLY at newline (cue) boundaries, accumulating whole lines toward
 * `maxChars`, and an over-long single line stands alone -- never split, because
 * splitting would cut mid-cue. This is the shape PATCH-157's
 * `knowledgeTranscriptReadingBlocks` proved; it is repeated here rather than
 * imported so the two can diverge if their targets do, and because that module
 * is landed and must not be touched.
 *
 * THE PARTITION INVARIANT: contiguous and ascending, first at 0, each start
 * equals the previous end, last ends at `text.length`, so
 * `chunks.map(c => text.slice(c.charStart, c.charEnd)).join('') === text`.
 *
 * EACH CHUNK IS INDEPENDENT. One refused chunk renders raw; it never
 * invalidates the rest.
 */
export function transcriptPunctuationChunks(
  text: string,
  maxChars: number = 3000,
): readonly { charStart: number; charEnd: number }[] {
  if (text.length === 0) return [];

  const chunks: { charStart: number; charEnd: number }[] = [];
  let chunkStart = 0;
  let lineStart = 0;

  for (let index = 0; index <= text.length; index += 1) {
    const atEnd = index === text.length;
    if (!atEnd && text[index] !== '\n') continue;
    const lineEnd = atEnd ? text.length : index + 1;
    const lineLength = lineEnd - lineStart;

    if (lineEnd - chunkStart > maxChars && lineStart > chunkStart) {
      chunks.push({ charStart: chunkStart, charEnd: lineStart });
      chunkStart = lineStart;
    }
    if (lineLength > maxChars) {
      chunks.push({ charStart: chunkStart, charEnd: lineEnd });
      chunkStart = lineEnd;
    }
    lineStart = lineEnd;
  }

  if (chunkStart < text.length) chunks.push({ charStart: chunkStart, charEnd: text.length });
  return chunks;
}

/**
 * Paragraphs, once sentences exist to break on.
 *
 * Cuts ONLY after a sentence-ending mark followed by whitespace (or at the end
 * of the text), accumulating toward `targetChars`. This is the reason §4.3
 * exists at all: with punctuation present, a break can land where a sentence
 * ends instead of at an arbitrary character count.
 *
 * THE SAME PARTITION INVARIANT as above. A text with NO sentence end yields
 * exactly ONE paragraph -- the whole text -- because an arbitrary cut is
 * exactly what this function is here to avoid.
 */
export function readableTranscriptParagraphs(
  text: string,
  targetChars: number = 600,
): readonly { charStart: number; charEnd: number }[] {
  if (text.length === 0) return [];

  const paragraphs: { charStart: number; charEnd: number }[] = [];
  let paragraphStart = 0;
  // The end of the last sentence seen, so a cut can land just after it.
  let lastSentenceEnd = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (!Object.prototype.hasOwnProperty.call(SENTENCE_END, character)) continue;
    // Sentence ends only where whitespace or the text's end follows, so a
    // decimal point or an abbreviation in the middle of a word does not cut.
    const next = text[index + 1];
    const isSentenceEnd = next === undefined || /\s/.test(next);
    if (!isSentenceEnd) continue;

    lastSentenceEnd = index + 1;
    if (lastSentenceEnd - paragraphStart >= targetChars) {
      paragraphs.push({ charStart: paragraphStart, charEnd: lastSentenceEnd });
      paragraphStart = lastSentenceEnd;
    }
  }

  if (paragraphStart < text.length) {
    paragraphs.push({ charStart: paragraphStart, charEnd: text.length });
  }
  return paragraphs;
}
