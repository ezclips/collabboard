import { describe, expect, it } from 'vitest';
import {
  knowledgeMalformedPageWarnings,
  knowledgeTextQuality,
} from './knowledgeTextQuality';

/**
 * Synthetic text only. The controlled PDF that motivated this detector is not
 * committed and nothing here depends on it: the defect it measures is a
 * property of the TEXT, so text is what these tests use.
 */
const NUL = '\u0000';
const REPLACEMENT = '\uFFFD';

describe('knowledgeTextQuality', () => {
  it('A: reports a clean page as clean, and counts its usable characters', () => {
    expect(knowledgeTextQuality('Iran live updates: two lines\nof ordinary text.')).toEqual({
      malformed: false,
      invalidCharacterCount: 0,
      nonWhitespaceLength: 39,
    });
  });

  it('B: detects raw parser text that still carries NUL, before normalization', () => {
    const raw = `${NUL}ran live updates`;
    expect(knowledgeTextQuality(raw)).toMatchObject({ malformed: true, invalidCharacterCount: 1 });

    // The existing normalization rule is untouched and still runs afterwards:
    // one UTF-16 code unit for one, so the count is identical on both sides.
    const normalized = raw.replace(/\u0000/gu, REPLACEMENT);
    expect(normalized).toBe(`${REPLACEMENT}ran live updates`);
    expect(knowledgeTextQuality(normalized).invalidCharacterCount).toBe(1);
    expect(normalized.length).toBe(raw.length);
  });

  it('C: detects normalized page text carrying the replacement character', () => {
    expect(knowledgeTextQuality(`${REPLACEMENT}ranian energy sites`)).toMatchObject({
      malformed: true,
      invalidCharacterCount: 1,
    });
  });

  it('D: counts every invalid character exactly, mixing both code points', () => {
    const text = `${NUL} / 7\n${REPLACEMENT}ran and ${REPLACEMENT}ranian`;
    const quality = knowledgeTextQuality(text);

    expect(quality.invalidCharacterCount).toBe(3);
    expect(quality.malformed).toBe(true);
    // Whitespace is excluded, and the invalid characters themselves are not.
    expect(quality.nonWhitespaceLength).toBe(text.replace(/\s/gu, '').length);
  });

  it('E: is a measurement -- it returns numbers and never rewrites the text', () => {
    const source = `${NUL}ran`;
    const quality = knowledgeTextQuality(source);

    expect(Object.keys(quality).sort()).toEqual([
      'invalidCharacterCount', 'malformed', 'nonWhitespaceLength',
    ]);
    for (const value of Object.values(quality)) {
      expect(typeof value === 'number' || typeof value === 'boolean').toBe(true);
    }
    expect(source).toBe(`${NUL}ran`);
  });

  it('J: substitutes nothing -- no letter, no dictionary, no language rule', () => {
    // A malformed page and a clean one differ only in what is COUNTED.
    expect(knowledgeTextQuality(`${REPLACEMENT}ran`).invalidCharacterCount).toBe(1);
    expect(knowledgeTextQuality('Iran').invalidCharacterCount).toBe(0);
    expect(knowledgeTextQuality(`${REPLACEMENT}ran`).nonWhitespaceLength)
      .toBe(knowledgeTextQuality('Iran').nonWhitespaceLength);
  });
});

describe('knowledgeMalformedPageWarnings', () => {
  it('F: a clean document produces no warnings at all', () => {
    expect(knowledgeMalformedPageWarnings([
      { pageNumber: 1, text: 'R. Rain' },
      { pageNumber: 2, text: 'ordinary page' },
    ])).toEqual([]);
  });

  it('names only the malformed pages, and carries page metadata alone', () => {
    const warnings = knowledgeMalformedPageWarnings([
      { pageNumber: 1, text: '1 / 7 R. Rain' },
      { pageNumber: 4, text: `${REPLACEMENT} / 7 ${REPLACEMENT}ran ${REPLACEMENT}ranian` },
    ]);

    expect(warnings).toEqual([
      { pageNumber: 4, invalidCharacterCount: 3, nonWhitespaceLength: 14 },
    ]);
    // No text, no excerpt, no filename -- counts and a page number.
    expect(JSON.stringify(warnings)).not.toContain('ran');
  });

  it('G: warns once per page, even when a page is reached twice in one run', () => {
    const warnings = knowledgeMalformedPageWarnings([
      { pageNumber: 4, text: `${REPLACEMENT}ran` },
      { pageNumber: 4, text: `${REPLACEMENT}ranian` },
      { pageNumber: 5, text: `${NUL}ther` },
    ]);

    expect(warnings.map((warning) => warning.pageNumber)).toEqual([4, 5]);
  });
});
