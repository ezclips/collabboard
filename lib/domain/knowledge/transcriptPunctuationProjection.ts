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
 * A word, reduced to what must match between the original and the model.
 *
 * Every character that is not a letter, a digit or an apostrophe is stripped;
 * then lowercased. This is what makes "don't," and "Don't" the same word while
 * "opening's" and "openings" are NOT -- an apostrophe that changes the word is
 * a word change, not punctuation.
 */
function comparableWord(token: string): string {
  return token
    .split('')
    .filter((character) => /[\p{L}\p{N}']/u.test(character))
    .join('')
    .toLowerCase();
}

/**
 * The tokens of a string, in order, reduced to their comparable form.
 *
 * Empty tokens are dropped, so leading, trailing and repeated whitespace do not
 * change the sequence -- whitespace placement is this module's business, not the
 * model's.
 */
function comparableWords(value: string): readonly string[] {
  return value
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map(comparableWord);
}

/**
 * The model's tokens split into a word and the punctuation run that follows it.
 *
 * A token like `miss?` yields `{ word: 'miss', marks: '?' }`; `word` yields
 * `{ word: 'word', marks: '' }`. The marks are KEPT AS THE MODEL WROTE THEM at
 * this stage and filtered later, so the caller can see exactly what was
 * discarded rather than losing it silently here.
 */
function splitTrailing(value: string): { word: string; marks: string } {
  let end = value.length;
  while (end > 0 && !/[\p{L}\p{N}']/u.test(value[end - 1])) end -= 1;
  return { word: value.slice(0, end), marks: value.slice(end) };
}

/**
 * The words of a string in their ORIGINAL spelling, stripped of surrounding
 * punctuation but otherwise untouched.
 *
 * Kept separate from `comparableWords` because the reconstruction needs the
 * real characters, while the comparison needs the comparable form.
 */
function originalWords(value: string): readonly { raw: string; marks: string }[] {
  return value
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => {
      const { word, marks } = splitTrailing(token);
      // A token that is ONLY punctuation cannot be a word; it is dropped, but
      // such a token would also have produced an empty comparable word and been
      // filtered there, so the two sequences stay aligned.
      return { raw: word, marks };
    })
    .filter((entry) => entry.raw.length > 0);
}

/**
 * PROJECT the model's punctuation onto the original words.
 *
 * Returns `err` unless the model's word sequence is exactly the original's:
 * same length, same order, every token equal after reduction. The error names
 * the first index that differs, because a silent mismatch is what this whole
 * module exists to prevent.
 */
export function projectTranscriptPunctuation(
  original: string,
  modelOutput: string,
): Result<PunctuationProjection, DomainError> {
  const originalTokens = originalWords(original);
  const modelTokens = modelOutput
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map(splitTrailing)
    .filter((entry) => entry.word.length > 0);

  const originalComparable = originalTokens.map((entry) => comparableWord(entry.raw));
  const modelComparable = modelTokens.map((entry) => comparableWord(entry.word));

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
        `The model changed the word at position ${index} ("${originalTokens[index].raw}" became`
          + ` "${modelTokens[index].word}"). The words must not change, so this chunk was not used.`,
        { details: { reason: 'word-mismatch', firstDifference: index } },
      ));
    }
  }

  // The sequences match. Rebuild every word from the ORIGINAL characters --
  // only the first character's case may come from the model.
  let text = '';
  let recasedWords = 0;
  let insertedMarks = 0;

  for (let index = 0; index < originalTokens.length; index += 1) {
    const originalWord = originalTokens[index].raw;
    const modelWord = modelTokens[index].word;

    let word = originalWord;
    const originalFirst = originalWord[0];
    const modelFirst = modelWord[0];
    if (originalFirst !== undefined && modelFirst !== undefined
      && originalFirst !== modelFirst
      && originalFirst.toLowerCase() === modelFirst.toLowerCase()) {
      // The model may capitalise the first letter. NOTHING else: a change to
      // any later character is a word change and was already rejected above by
      // the comparison, since the comparison reduces case but keeps letters.
      word = modelFirst + originalWord.slice(1);
      recasedWords += 1;
    }

    if (index > 0) text += ' ';
    text += word;

    // The punctuation run that follows this word, FILTERED to the allowed set.
    // Anything else -- a bracket, a quote, a stray letter -- is dropped rather
    // than copied; a disallowed mark is not a refusal, since it cannot change a
    // word, but it is never allowed into the output.
    let marks = '';
    for (const character of modelTokens[index].marks) {
      if (!isAllowedMark(character)) continue;
      marks += character;
      insertedMarks += 1;
    }
    text += marks;
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
