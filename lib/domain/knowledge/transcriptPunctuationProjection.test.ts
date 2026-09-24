import { describe, expect, it } from 'vitest';

import {
  projectTranscriptPunctuation,
  readableTranscriptParagraphs,
  TRANSCRIPT_PUNCTUATION_CHUNK_CHARS,
  transcriptPunctuationChunks,
} from './transcriptPunctuationProjection';

/**
 * THE SAFETY CLAIM, TESTED AS A PROPERTY (PATCH-160, widened by PATCH-162).
 *
 * The model proposes; it never writes. A projection is accepted only when the
 * model's LETTER-AND-DIGIT sequence equals the original's exactly, and the
 * output is rebuilt from the ORIGINAL characters, so:
 *
 *   every accepted projection's letter and digit stream equals the original's
 *
 * is not a hope, it is the reason the module exists. It is asserted over
 * hundreds of generated cases including adversarial model outputs, because a
 * handful of hand-picked examples is what a threshold-based design would also
 * pass.
 *
 * PATCH-162 widened the guarantee from "every character" to "every letter and
 * digit": an apostrophe or hyphen inside a word is SPELLING, not a word. The
 * property below is the widened form, and it is still a property.
 */

/** The letters and digits of a string, in order, lowercased. */
const letterDigitStream = (value: string): string =>
  value.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

/** The words of a string, reduced to their comparable form. */
const words = (value: string): string[] => value
  .split(/\s+/)
  .filter((token) => token.length > 0)
  .map((token) => token.replace(/[^\p{L}\p{N}']/gu, '').toLowerCase())
  .filter((token) => token.length > 0);

/** The first differing index the error carries, read through `unknown`. */
const firstDifferenceOf = (details: unknown): number | undefined => {
  if (!details || typeof details !== 'object') return undefined;
  const value = (details as { firstDifference?: unknown }).firstDifference;
  return typeof value === 'number' ? value : undefined;
};

describe('punctuation is added and the words are untouched', () => {
  it('1. punctuation-only model output yields the same words, with marks', () => {
    const original = 'hello there how are you today';
    const output = 'Hello there, how are you today?';
    const result = projectTranscriptPunctuation(original, output);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(words(result.value.text)).toEqual(words(original));
    expect(result.value.text).toContain(',');
    expect(result.value.text).toContain('?');
    expect(result.value.insertedMarks).toBe(2);
  });

  it('spaces single, no space before a mark, one space after a sentence mark', () => {
    const result = projectTranscriptPunctuation('one two three four', 'One, two. Three four.');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe('One, two. Three four.');
    expect(result.value.text).not.toContain('  ');
  });
});

describe('a model that changes the words is refused', () => {
  it('2. a changed word is refused, and the error names the position', () => {
    const result = projectTranscriptPunctuation(
      'move the bishop to the corner',
      'Move the rook, to the corner.',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(firstDifferenceOf(result.error.details)).toBe(2);
    expect(result.error.message).toContain('bishop');  });

  it('3a. an ADDED word is refused', () => {
    const result = projectTranscriptPunctuation('the quick brown fox', 'The quick brown red fox.');
    expect(result.ok).toBe(false);
  });

  it('3b. a DROPPED word is refused', () => {
    const result = projectTranscriptPunctuation('the quick brown fox', 'The quick fox.');
    expect(result.ok).toBe(false);
  });

  it('4. a REORDERED pair is refused', () => {
    const result = projectTranscriptPunctuation('the quick brown fox', 'The quick fox brown.');
    expect(result.ok).toBe(false);
  });

  it('5a. a SUMMARY is refused', () => {
    const result = projectTranscriptPunctuation(
      'we looked at the engine and it was fine',
      'The speaker discusses inspecting an engine.',
    );
    expect(result.ok).toBe(false);
  });

  it('5b. an APOLOGY is refused', () => {
    const result = projectTranscriptPunctuation('hello there', 'I am sorry, I cannot help with that.');
    expect(result.ok).toBe(false);
  });

  it('5c. a PREAMBLE is refused', () => {
    const result = projectTranscriptPunctuation(
      'hello there friend',
      'Here is the punctuated text: Hello there, friend.',
    );
    expect(result.ok).toBe(false);
  });
});

describe('capitalisation is taken, other character changes are not', () => {
  it('6a. the first letter may be recased', () => {
    const result = projectTranscriptPunctuation('hello world', 'Hello world.');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text.startsWith('Hello')).toBe(true);
    expect(result.value.recasedWords).toBe(1);
  });

  it('6b. an apostrophe BETWEEN letters is spelling, and ACCEPTED', () => {
    // The owner's ruling: a transcript is speech, and "kings pawn" and
    // "king's pawn" are the same spoken words. The apostrophe is kept, and
    // every letter is still the original's.
    const result = projectTranscriptPunctuation('the kings pawn is strong', "The king's pawn is strong.");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toContain("king's");
    expect(letterDigitStream(result.value.text)).toBe(letterDigitStream('the kings pawn is strong'));
  });

  it('6c. altering a NON-first character of a word is refused', () => {
    const result = projectTranscriptPunctuation('hello world', 'Helo world.');
    expect(result.ok).toBe(false);
  });
});

describe('punctuation outside the allowed set is dropped, never copied', () => {
  it('7. quotes, brackets and stray characters are dropped', () => {
    const result = projectTranscriptPunctuation(
      'hello world today',
      'Hello "world" (today)',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe('Hello world today');
    // None of the disallowed characters survived.
    for (const forbidden of ['"', '(', ')']) {
      expect(result.value.text).not.toContain(forbidden);
    }
  });

  it('a newline the model emitted is not copied', () => {
    const result = projectTranscriptPunctuation('one two three', 'One two\nthree.');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).not.toContain('\n');
  });
});

describe('8. THE PROPERTY: an accepted projection always has the ORIGINAL letters and digits', () => {
  /**
   * A deterministic generator, so a failure is reproducible. No randomness
   * seed is hidden: the same corpus and the same mutations every run.
   */
  const VOCAB = ['engine', 'oil', 'filter', 'thirty', 'five', 'litres', 'check', 'the', 'a', 'is', 'and', 'setup'];

  const makeWords = (length: number, offset: number): string[] =>
    Array.from({ length }, (_, index) => VOCAB[(index * 7 + offset) % VOCAB.length]);

  const join = (list: readonly string[]) => list.join(' ');

  /** Model outputs that only ADD punctuation, capitalisation and spelling. */
  const punctuated = (list: readonly string[], cadence: number, sentenceMarks: string) =>
    list
      .map((word, index) => {
        const lead = index === 0 || index % cadence === 0 ? word[0].toUpperCase() + word.slice(1) : word;
        // INSIDE the word, the model may add an APOSTROPHE -- that is PATCH-162's
        // widening and these outputs must still be accepted.
        const spelled = index % 4 === 0 && lead.length > 3
          ? `${lead.slice(0, 2)}'${lead.slice(2)}`
          : lead;
        if ((index + 1) % cadence === 0) return `${spelled}${sentenceMarks}`;
        if (index % 3 === 1) return `${spelled},`;
        return spelled;
      })
      .join(' ')
      // A HYPHEN may join what was a SPACE -- `setup based` -> `setup-based` --
      // but must not split a word that was whole, or the part count changes and
      // the correct answer is a refusal.
      .replace(/(\w) (\w)/g, (whole, left, right) => (right === right.toUpperCase() ? whole : `${left}-${right}`));

  it('holds for several hundred generated accept cases', () => {
    let accepted = 0;
    for (let length = 1; length <= 40; length += 1) {
      for (let offset = 0; offset < VOCAB.length; offset += 1) {
        for (const [cadence, mark] of [[3, '.'], [5, '?'], [7, '!'], [4, ';']] as const) {
          const list = makeWords(length, offset);
          const original = join(list);
          const modelOutput = punctuated(list, cadence, mark);
          const result = projectTranscriptPunctuation(original, modelOutput);
          expect(result.ok, `length=${length} offset=${offset} cadence=${cadence}`).toBe(true);
          if (!result.ok) continue;
          accepted += 1;
          // THE CLAIM, on every accepted projection: the letters and digits are
          // the original's, exactly, in order.
          expect(letterDigitStream(result.value.text)).toBe(letterDigitStream(original));
        }
      }
    }
    expect(accepted).toBeGreaterThan(500);
  });

  it('inserted apostrophes and hyphens INSIDE words are accepted', () => {
    // The owner's real cases.
    for (const [original, model, spelling] of [
      ['scholars mate', "scholar's mate", "'"],
      ['setup based', 'setup-based', '-'],
      ['kings pawn', "king's pawn", "'"],
    ] as const) {
      const result = projectTranscriptPunctuation(original, model);
      expect(result.ok, `${original} -> ${model}`).toBe(true);
      if (!result.ok) continue;
      expect(letterDigitStream(result.value.text)).toBe(letterDigitStream(original));
      // The model's apostrophe or hyphen survived.
      expect(result.value.text).toContain(spelling);
    }
  });

  it('holds for several hundred generated ADVERSARIAL cases', () => {
    let refused = 0;
    let acceptedButGuaranteed = 0;
    const streamOf = (value: string) => letterDigitStream(value);
    for (let length = 2; length <= 30; length += 1) {
      for (let offset = 0; offset < VOCAB.length; offset += 1) {
        const list = makeWords(length, offset);
        const original = join(list);
        const mutatedList = (index: number, value: string) =>
          join(list.map((word, i) => (i === index ? value : word)));
        const first = list[0] ?? 'x';
        // EVERY mutation must change the LETTER/DIGIT stream, or it is not an
        // adversary at all -- asserted below before it is used.
        const mutations: readonly string[] = [
          // a dropped word
          join(list.slice(0, Math.floor(length / 2)).concat(list.slice(Math.floor(length / 2) + 1))),
          // a duplicated word
          join(list.slice(0, 1).concat(list.slice(0, 1)).concat(list.slice(1))),
          // a reordered adjacent pair
          join(list.slice(0, 1).concat([list[2] ?? list[1], list[1] ?? list[0]]).concat(list.slice(3))),
          // a substituted word
          join(list.slice(0, 1).concat(['zzz']).concat(list.slice(2))),
          // a truncated word
          join(list.slice(0, -1).concat([(list[list.length - 1] ?? 'x').slice(0, 1)])),
          // ONE LETTER SUBSTITUTED inside a word
          mutatedList(0, `${first.slice(0, -1)}z`),
          // TWO ADJACENT WORDS MERGED without a hyphen -- a word change
          `${join(list.slice(0, 2)).replace(/\s+/g, '')} ${join(list.slice(2))}`.trim(),
          // ONE WORD SPLIT in two
          mutatedList(0, `${first.slice(0, 1)} ${first.slice(1)}`),
          // a summary
          'The speaker discusses the topic at some length.',
        ];
        for (const modelOutput of mutations) {
          // A mutation that does not change the letter/digit stream is not an
          // adversary, and this generator must not count it as one -- e.g. the
          // truncated mutation on a single-character word. Skip only those.
          if (streamOf(modelOutput) === streamOf(original)) continue;
          const result = projectTranscriptPunctuation(original, modelOutput);
          if (result.ok) {
            // If a mutation was ACCEPTED, the guarantee must still hold. For a
            // real mutation it cannot, so this counter stays zero -- it is here
            // so the property is asserted on BOTH branches rather than only
            // when the call happens to succeed.
            expect(letterDigitStream(result.value.text)).toBe(letterDigitStream(original));
            acceptedButGuaranteed += 1;
          } else {
            refused += 1;
          }
        }
      }
    }
    // Every real mutation was refused, and the guarantee never had to be relied
    // on for one.
    expect(refused).toBeGreaterThan(500);
    expect(acceptedButGuaranteed).toBe(0);
  });
});

describe('9. transcriptPunctuationChunks: the partition invariant', () => {
  const reconstruct = (text: string, max?: number) =>
    transcriptPunctuationChunks(text, max).map((chunk) => text.slice(chunk.charStart, chunk.charEnd)).join('');

  it('is exact for these shapes', () => {
    const cases: readonly string[] = [
      '',
      'one line with no newline',
      'first line\nsecond line\nthird line\nfourth line',
      'trailing newline\n',
      'consecutive\n\nnewlines\n\n\ntoo',
      `${'x'.repeat(900)}\nshort\nafter a long one`,
      '\n',
    ];
    for (const text of cases) {
      expect(reconstruct(text), JSON.stringify(text)).toBe(text);
      expect(reconstruct(text, 5), JSON.stringify(text)).toBe(text);
    }
  });

  it('is contiguous, ascending, first at 0, last at length', () => {
    const text = 'alpha\nbravo\ncharlie\ndelta\necho\nfoxtrot\ngolf';
    const chunks = transcriptPunctuationChunks(text, 12);
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[chunks.length - 1].charEnd).toBe(text.length);
    for (let index = 1; index < chunks.length; index += 1) {
      expect(chunks[index].charStart).toBe(chunks[index - 1].charEnd);
    }
  });

  it('an over-long single line is its own chunk, never split', () => {
    const long = 'z'.repeat(500);
    const text = `before\n${long}\nafter`;
    const chunks = transcriptPunctuationChunks(text, 50);
    const touching = chunks.filter(
      (chunk) => chunk.charStart < text.indexOf(long) + long.length && chunk.charEnd > text.indexOf(long),
    );
    expect(touching).toHaveLength(1);
    expect(reconstruct(text, 50)).toBe(text);
  });

  it('cuts only at newline boundaries', () => {
    const text = 'alpha\nbravo\ncharlie\ndelta\necho';
    for (const chunk of transcriptPunctuationChunks(text, 10).slice(0, -1)) {
      expect(text[chunk.charEnd - 1]).toBe('\n');
    }
  });

  it('with NO size argument, no passage exceeds 900 characters unless one line does', () => {
    // A default-sized transcript: every cue well under the limit, so the
    // default must split it into several 900-character passages.
    const cue = 'a spoken line of transcript words that is comfortably under the limit';
    const text = Array.from({ length: 60 }, (_, index) => `${cue} ${index}`).join('\n');
    expect(text.length).toBeGreaterThan(TRANSCRIPT_PUNCTUATION_CHUNK_CHARS * 2);

    const chunks = transcriptPunctuationChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const slice = text.slice(chunk.charStart, chunk.charEnd);
      // Either it fits the default, or it is a SINGLE line longer than it.
      if (slice.length > TRANSCRIPT_PUNCTUATION_CHUNK_CHARS) {
        expect(slice.trimEnd().includes('\n')).toBe(false);
        expect(text[chunk.charEnd - 1] === '\n' || chunk.charEnd === text.length).toBe(true);
      }
    }
    // A line longer than the default still stands alone and is never split.
    const longLine = 'z'.repeat(TRANSCRIPT_PUNCTUATION_CHUNK_CHARS + 50);
    const withLong = `short first line\n${longLine}\nafter`;
    const longChunks = transcriptPunctuationChunks(withLong);
    const holding = longChunks.find(
      (chunk) => chunk.charStart < withLong.indexOf(longLine) + longLine.length
        && chunk.charEnd > withLong.indexOf(longLine),
    )!;
    expect(withLong.slice(holding.charStart, holding.charEnd)).toContain(longLine);
  });
});

describe('10. readableTranscriptParagraphs', () => {
  const reconstruct = (text: string, target?: number) =>
    readableTranscriptParagraphs(text, target).map((p) => text.slice(p.charStart, p.charEnd)).join('');

  it('cuts only after a sentence-ending mark', () => {
    const text = 'One sentence here. Two sentence here. Three sentence here.';
    const paragraphs = readableTranscriptParagraphs(text, 20);
    expect(paragraphs.length).toBeGreaterThan(1);
    for (const paragraph of paragraphs.slice(0, -1)) {
      // The character before the cut is whitespace, and before that a mark.
      const slice = text.slice(paragraph.charStart, paragraph.charEnd);
      expect(slice.trimEnd().endsWith('.')).toBe(true);
    }
    expect(reconstruct(text, 20)).toBe(text);
  });

  it('partitions exactly for these shapes', () => {
    for (const text of ['', 'no marks at all here', 'One. Two. Three.', 'Trailing.']) {
      expect(reconstruct(text), JSON.stringify(text)).toBe(text);
      expect(reconstruct(text, 1), JSON.stringify(text)).toBe(text);
    }
  });

  it('text with NO sentence end is exactly ONE paragraph', () => {
    const text = 'this transcript has no punctuation at all and runs on and on and on';
    const paragraphs = readableTranscriptParagraphs(text, 10);
    expect(paragraphs).toHaveLength(1);
    expect(text.slice(paragraphs[0].charStart, paragraphs[0].charEnd)).toBe(text);
  });

  it('does NOT cut on a decimal point inside a number', () => {
    // "5.5 litres" must not end a sentence.
    const text = 'the reading was 5.5 litres per minute and that is normal for this engine';
    expect(readableTranscriptParagraphs(text, 5)).toHaveLength(1);
  });
});

describe('PATCH-179: a space may move, a letter may not', () => {
  const accepted = (original: string, model: string) => {
    const result = projectTranscriptPunctuation(original, model);
    expect(result.ok, `${original} -> ${model}`).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    return result.value;
  };

  it('the chess captions: a moved space and an added apostrophe are accepted', () => {
    // "queen spawn" (captions) against "queen's pawn" (the model) -- the letters
    // are IDENTICAL, so this is now accepted, and the output is the model's.
    const value = accepted(
      'they play kings pawn queen spawn is that',
      "They play king's pawn, queen's pawn, is that",
    );
    expect(value.text).toBe("They play king's pawn, queen's pawn, is that");
    // Every letter is the original's.
    expect(letterDigitStream(value.text)).toBe(letterDigitStream('they play kings pawn queen spawn is that'));
    expect(value.resegmentedParts).toBeGreaterThan(0);
  });

  it('theorybased -> Theory-based is accepted', () => {
    expect(accepted('theorybased openings', 'Theory-based openings').text).toBe('Theory-based openings');
  });

  it('setupbased -> setup based is accepted', () => {
    expect(accepted('setupbased', 'setup based').text).toBe('setup based');
  });

  it('THE ACCEPTED RISK: "now here" -> "nowhere" is accepted', () => {
    // The owner accepted this: a moved space can change meaning. The letters are
    // still exactly the captions' letters, and "As spoken" always shows them.
    expect(accepted('now here', 'nowhere').text).toBe('nowhere');
  });

  it('four regrouped parts is boundary-shift-too-wide', () => {
    const result = projectTranscriptPunctuation('a b c d', 'abcd');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result.error.details as { reason?: string }).reason).toBe('boundary-shift-too-wide');
    expect(firstDifferenceOf(result.error.details)).toBe(0);
    expect(result.error.message).toContain('regrouped too many words at position 0');
  });

  it('a whole stream regrouped with no shared boundary is boundary-shift-too-wide', () => {
    const result = projectTranscriptPunctuation('ab cd ef gh', 'a bc de fg h');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result.error.details as { reason?: string }).reason).toBe('boundary-shift-too-wide');
  });

  it('a changed letter is still refused (word-mismatch)', () => {
    const result = projectTranscriptPunctuation('night', 'knight');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result.error.details as { reason?: string }).reason).toBe('word-mismatch');
  });

  it('an added or removed word is still refused (word-count-mismatch)', () => {
    const added = projectTranscriptPunctuation('the quick brown fox', 'the quick brown red fox');
    expect(added.ok).toBe(false);
    if (!added.ok) expect((added.error.details as { reason?: string }).reason).toBe('word-count-mismatch');
    const removed = projectTranscriptPunctuation('the quick brown fox', 'the quick fox');
    expect(removed.ok).toBe(false);
    if (!removed.ok) expect((removed.error.details as { reason?: string }).reason).toBe('word-count-mismatch');
  });

  it('two words swapped is refused when the letters coincide with a change', () => {
    // 'pawn queen' vs 'queen pawn': the stream changes (pawnqueen vs queenpawn),
    // and the counts match, so it is a word-mismatch at the first part.
    const result = projectTranscriptPunctuation('pawn queen', 'queen pawn');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result.error.details as { reason?: string }).reason).toBe('word-mismatch');
  });

  it('CASE: only a part first letter may be recased', () => {
    // The original is lowercase; the model recases a NON-first letter, which is
    // not allowed, so the output keeps the original's lowercase 'p'.
    const value = accepted('iphone', 'iPhone');
    expect(value.text).toBe('iphone');
  });
});

describe('PATCH-179: THE PROPERTY, over 3,000 seeded cases', () => {
  const VOCAB = ['engine', 'oil', 'filter', 'thirty', 'five', 'litres', 'check', 'the', 'a', 'is', 'and', 'setup', 'kings'];

  /** A deterministic LCG: the same 3,000 cases every run, no hidden seed. */
  function rng(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
  }

  const alnumCase = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, '');
  const alnumLower = (value: string) => alnumCase(value).toLowerCase();

  /** The alnum-stream offsets that begin a model part (whitespace/hyphen separated). */
  const partStartOffsetsOf = (modelOutput: string): Set<number> => {
    const starts = new Set<number>();
    let inPart = false;
    let offset = 0;
    for (const character of modelOutput) {
      if (/\s/.test(character)) { inPart = false; continue; }
      if (character === '-') { inPart = false; continue; }
      if (!/[^\p{L}\p{N}]/u.test(character)) {
        if (!inPart) { starts.add(offset); inPart = true; }
        offset += 1;
      }
    }
    return starts;
  };

  it('every accepted case has the original letters, and case only at part-first letters', () => {
    const random = rng(20260924);
    let acceptCount = 0;
    let changedLetterCount = 0;

    for (let iteration = 0; iteration < 3_000; iteration += 1) {
      const length = 1 + Math.floor(random() * 8);
      const list = Array.from({ length }, () => VOCAB[Math.floor(random() * VOCAB.length)]);

      // A model transform. AT MOST ONE boundary move (merge, split or hyphen)
      // keeps every region within three parts, as the rule requires.
      let words = [...list];
      const boundaryOp = Math.floor(random() * 4); // 0 none, 1 merge, 2 split, 3 hyphen
      const opAt = Math.floor(random() * Math.max(1, words.length - 1));
      if (boundaryOp === 1 && words.length >= 2) {
        words = [...words.slice(0, opAt), words[opAt] + words[opAt + 1], ...words.slice(opAt + 2)];
      } else if (boundaryOp === 2 && words[opAt] && words[opAt].length > 2) {
        const at = 1 + Math.floor(random() * (words[opAt].length - 1));
        words = [...words.slice(0, opAt), words[opAt].slice(0, at), words[opAt].slice(at), ...words.slice(opAt + 1)];
      }

      // Recast some first letters.
      words = words.map((word) => (random() < 0.3 ? word[0].toUpperCase() + word.slice(1) : word));

      // Sometimes move a space via a hyphen instead (still a boundary move, and
      // only when no other boundary move was made).
      let joined = words.join(' ');
      if (boundaryOp === 3 && words.length >= 2 && random() < 0.8) {
        joined = joined.replace(/(\w) (\w)/, '$1-$2');
      }

      // Add apostrophes/hyphens INSIDE a word (apostrophe keeps the boundary).
      if (random() < 0.3) joined = joined.replace(/(\w{2})(\w)/, "$1'$2");

      // Add punctuation marks after some words.
      if (random() < 0.5) joined = `${joined}.`;

      // SOMETIMES change a letter -- those must be refused.
      const changesLetter = random() < 0.3;
      if (changesLetter) {
        const target = VOCAB[Math.floor(random() * VOCAB.length)];
        const replacement = `${target.slice(0, -1)}q`;
        joined = joined.replace(target, replacement);
      }

      const original = list.join(' ');
      const result = projectTranscriptPunctuation(original, joined);

      if (changesLetter && alnumLower(joined) !== alnumLower(original)) {
        // A letter was changed: refused, and the guarantee never relied on.
        expect(result.ok, `changed letter accepted: ${original} -> ${joined}`).toBe(false);
        changedLetterCount += 1;
        continue;
      }
      if (!result.ok) continue;

      acceptCount += 1;
      // 1. The letters and digits are the original's, exactly.
      expect(alnumLower(result.value.text)).toBe(alnumLower(original));
      // 2. Every letter's CASE equals the original's, except a part's first.
      const starts = partStartOffsetsOf(joined);
      const outputCase = alnumCase(result.value.text);
      const originalCase = alnumCase(original);
      expect(outputCase.length).toBe(originalCase.length);
      for (let offset = 0; offset < outputCase.length; offset += 1) {
        if (starts.has(offset)) continue;
        expect(outputCase[offset]).toBe(originalCase[offset]);
      }
    }

    // The corpus is real: most cases were accepted, and letters really changed.
    expect(acceptCount).toBeGreaterThan(500);
    expect(changedLetterCount).toBeGreaterThan(100);
  });
});
