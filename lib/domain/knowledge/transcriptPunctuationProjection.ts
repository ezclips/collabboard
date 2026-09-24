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
// ITS TEXT, and rebuild the output from the ORIGINAL letters and digits, in
// order, taking only: (a) the punctuation it placed after each word, and (b) the
// casing of a word's FIRST letter. Every letter and digit provably came from the
// original, in the same order, with nothing added, removed, reordered or
// substituted.
//
// ============================================================================
// PATCH-179 -- THE LETTERS ARE THE RULE, NOT THE BOUNDARIES
// ============================================================================
//
// PATCH-162's rule was always "every letter and digit unchanged, in order". The
// projection was stricter than that: it also froze WHERE the word boundaries
// fell, so the captions' "queen spawn" against the model's "queen's pawn" -- the
// SAME letters, `queenspawn` both ways -- was refused. The owner decided a
// boundary may move.
//
// WHAT IS GUARANTEED NOW. The two LETTER STREAMS (letters and digits only,
// lowercased) must be identical in every way; only then may boundaries differ,
// and only LOCALLY -- every region between two shared boundaries holds at most
// three original parts and at most three model parts. The output is built from
// the MODEL's segmentation, but every letter and digit is taken from the
// ORIGINAL stream at the same global offset, so no letter can be invented.
//
// THE ACCEPTED RISK, STATED: a moved space can change meaning ("now here"
// versus "nowhere"). The letters are still exactly what the captions said, and
// "As spoken" always shows the original captions.

import { domainError, type DomainError } from '../core/errors';
import { err, ok, type Result } from '../core/result';

/** What one chunk's projection produced. */
export interface PunctuationProjection {
  readonly text: string;
  /** Words whose capitalisation the model changed. Diagnostics only. */
  readonly recasedWords: number;
  readonly insertedMarks: number;
  /**
   * PATCH-179. How many MODEL parts fall inside a region whose boundaries the
   * model moved. Diagnostics only -- nothing reads it but tests.
   */
  readonly resegmentedParts: number;
}

/**
 * PATCH-178. How long a punctuated passage may be by default.
 *
 * Smaller than the 3,000 this was: one misheard word used to cost a whole third
 * of a video its readable form, and the smaller the passage, the smaller that
 * loss. ~900 characters is about ten passages for the chess transcript.
 */
export const TRANSCRIPT_PUNCTUATION_CHUNK_CHARS = 900;

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
 * The LETTERS AND DIGITS of a set of parts, concatenated, with their ORIGINAL
 * case. Length equals `comparableStream`'s, so offsets are interchangeable.
 */
function letterStream(parts: readonly string[]): string {
  return parts.map((part) => letterDigitStream(part).join('')).join('');
}

/** The comparable (letters/digits only, lowercased) stream of a set of parts. */
function comparableStream(parts: readonly string[]): string {
  return parts.map(comparablePart).join('');
}

/** The letter offset where each part starts: 0, then the running total. */
function partStartOffsets(parts: readonly string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const part of parts) {
    starts.push(offset);
    offset += comparablePart(part).length;
  }
  return starts;
}

/** The letters/digits of each part, preserving case, for slicing. */
function casePreservingStream(parts: readonly string[]): string {
  return letterStream(parts);
}

/**
 * PROJECT the model's punctuation and spelling onto the original LETTERS.
 *
 * The two LETTER STREAMS (letters and digits only, lowercased) must be
 * identical. When they are, the boundaries between parts may differ, but only
 * LOCALLY: every region between two shared boundaries must hold at most three
 * original parts and at most three model parts. A stream that differs is
 * refused -- `word-count-mismatch` when the part counts differ, otherwise
 * `word-mismatch` at the first differing part. A region that regroups too many
 * words is refused as `boundary-shift-too-wide`.
 *
 * ---------------------------------------------------------------- GUARANTEE
 * Every letter and digit in the output comes from the original, in the same
 * order, with nothing added, removed, reordered or substituted. The model
 * contributes only punctuation, in-word apostrophes and hyphens, the case of a
 * part's first letter, and WHERE SPACES FALL, within at most three neighbouring
 * words.
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

  // 1. THE LETTERS ARE THE RULE. `comparableStream` is letters and digits only,
  //    lowercased, so a moved space (which changes no letter) is invisible here
  //    and a changed letter is not.
  const originalStream = comparableStream(originalParts);
  const modelStream = comparableStream(modelParts);
  if (originalStream !== modelStream) {
    // The reason depends on the shape of the difference, not on the letters.
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
    // Unreachable when the streams differ, but a refusal is the honest default.
    return err(domainError('validation', 'The words must not change, so this chunk was not used.', {
      details: { reason: 'word-mismatch', firstDifference: -1 },
    }));
  }

  // 2. THE BOUNDARIES ARE ONLY PROVISIONALLY EQUAL. The streams match; where the
  //    parts divide them may now differ, so long as no region regroups too much.
  const originalStarts = partStartOffsets(originalParts);
  const modelStarts = partStartOffsets(modelParts);
  const modelStartSet = new Set(modelStarts);
  // Shared boundaries (offset 0 excluded) split the stream into regions.
  const shared = originalStarts.slice(1).filter((offset) => modelStartSet.has(offset));
  const regionBounds = [0, ...shared, originalStream.length];

  let resegmentedParts = 0;
  for (let region = 0; region < regionBounds.length - 1; region += 1) {
    const from = regionBounds[region];
    const to = regionBounds[region + 1];
    const originalInRegion = originalStarts.filter((offset) => offset >= from && offset < to).length;
    const modelInRegion = modelStarts.filter((offset) => offset >= from && offset < to).length;
    // Non-trivial when the interior boundaries differ -- by POSITION, not merely
    // by count: a single boundary shifted one letter is still a regrouping.
    const originalInterior = originalStarts.filter((offset) => offset > from && offset < to);
    const modelInterior = modelStarts.filter((offset) => offset > from && offset < to);
    const trivial = originalInRegion === modelInRegion
      && originalInterior.length === modelInterior.length
      && originalInterior.every((offset, index) => offset === modelInterior[index]);
    if (trivial) continue;
    if (originalInRegion > 3 || modelInRegion > 3) {
      // The original part index where this region begins.
      const originalPartIndex = originalStarts.indexOf(from);
      return err(domainError(
        'validation',
        `The model regrouped too many words at position ${originalPartIndex}.`
          + ' The words must not change, so this chunk was not used.',
        { details: { reason: 'boundary-shift-too-wide', firstDifference: originalPartIndex } },
      ));
    }
    resegmentedParts += modelInRegion;
  }

  // The output is built from the MODEL's segmentation, but every letter and
  // digit is taken from the ORIGINAL stream at the same global offset: slice the
  // original's case-preserving stream at the MODEL's boundaries into "virtual
  // original parts", then reuse the one rebuild loop below.
  const originalLetters = casePreservingStream(originalParts);
  const virtualOriginalParts = modelStarts.map((start, index) => (
    originalLetters.slice(start, modelStarts[index + 1] ?? originalLetters.length)
  ));

  return ok(rebuildFromParts(virtualOriginalParts, modelParts, modelOutput, resegmentedParts));
}

/**
 * REBUILD the output from paired `(originalLettersForPart, modelPart)`s.
 *
 * The ONE rebuild loop, shared by the common case (parts align) and the
 * resegmented case (virtual original parts sliced at the model's boundaries).
 * For every pair the LETTERS AND DIGITS come from the original part; the model
 * contributes only its in-word apostrophes/hyphens, the separator, its trailing
 * marks, and the case of the part's first letter.
 */
function rebuildFromParts(
  originalParts: readonly string[],
  modelParts: readonly string[],
  modelOutput: string,
  resegmentedParts: number,
): PunctuationProjection {
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

  return { text, recasedWords, insertedMarks, resegmentedParts };
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
  maxChars: number = TRANSCRIPT_PUNCTUATION_CHUNK_CHARS,
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
