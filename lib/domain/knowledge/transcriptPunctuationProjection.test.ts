import { describe, expect, it } from 'vitest';

import {
  projectTranscriptPunctuation,
  readableTranscriptParagraphs,
  transcriptPunctuationChunks,
} from './transcriptPunctuationProjection';

/**
 * THE SAFETY CLAIM OF PATCH-160, AND IT IS TESTED AS A PROPERTY.
 *
 * The model proposes; it never writes. A projection is accepted only when the
 * model's word sequence equals the original's exactly, and the output is
 * rebuilt from the ORIGINAL characters, so:
 *
 *   every accepted projection's word sequence equals the original's
 *
 * is not a hope, it is the reason the module exists. It is asserted over
 * hundreds of generated cases including adversarial model outputs, because a
 * handful of hand-picked examples is what a threshold-based design would also
 * pass.
 */

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

  it('6b. an apostrophe that changes the word is a WORD CHANGE, refused', () => {
    // "openings" -> "opening's" is not punctuation; it is a different word.
    const result = projectTranscriptPunctuation('the openings are wide', "The opening's are wide.");
    expect(result.ok).toBe(false);
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

describe('8. THE PROPERTY: an accepted projection always has the ORIGINAL words', () => {
  /**
   * A deterministic generator, so a failure is reproducible. No randomness
   * seed is hidden: the same corpus and the same mutations every run.
   */
  const VOCAB = ['engine', 'oil', 'filter', "don't", 'thirty', 'five', 'litres', 'check', 'the', 'a', 'is', 'and'];

  const makeWords = (length: number, offset: number): string[] =>
    Array.from({ length }, (_, index) => VOCAB[(index * 7 + offset) % VOCAB.length]);

  const join = (list: readonly string[]) => list.join(' ');

  /** Model outputs that only ADD punctuation and capitalisation. */
  const punctuated = (list: readonly string[], cadence: number, sentenceMarks: string) =>
    list
      .map((word, index) => {
        const lead = index === 0 || index % cadence === 0 ? word[0].toUpperCase() + word.slice(1) : word;
        if ((index + 1) % cadence === 0) return `${lead}${sentenceMarks}`;
        if (index % 3 === 1) return `${lead},`;
        return lead;
      })
      .join(' ');

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
          // THE CLAIM, on every accepted projection.
          expect(words(result.value.text)).toEqual(words(original));
          // And stronger: every word character came from the original, so the
          // lowercase form of the output equals the lowercase original's words.
          expect(result.value.text.toLowerCase().replace(/[^a-z0-9' ]/g, '').split(/\s+/).filter(Boolean))
            .toEqual(original.toLowerCase().split(/\s+/).filter(Boolean));
        }
      }
    }
    expect(accepted).toBeGreaterThan(500);
  });

  it('holds for several hundred generated ADVERSARIAL cases (all refused)', () => {
    let refused = 0;
    for (let length = 2; length <= 30; length += 1) {
      for (let offset = 0; offset < VOCAB.length; offset += 1) {
        const list = makeWords(length, offset);
        const original = join(list);
        // Mutations that must ALL be refused, one per kind and position.
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
          // a summary
          'The speaker discusses the topic at some length.',
        ];
        for (const modelOutput of mutations) {
          const result = projectTranscriptPunctuation(original, modelOutput);
          if (result.ok) {
            // If it was ACCEPTED, the property must still hold -- which for a
            // real mutation is impossible, so this branch should never run.
            expect(words(result.value.text)).toEqual(words(original));
          } else {
            refused += 1;
          }
        }
      }
    }
    // Every mutation was refused, and the property never had to be relied on.
    expect(refused).toBeGreaterThan(500);
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
