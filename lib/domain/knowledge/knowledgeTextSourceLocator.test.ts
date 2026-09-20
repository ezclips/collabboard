import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_TEXT_LOCATOR_KIND,
  buildKnowledgeTextSourceLocator,
  parseKnowledgeTextSourceLocator,
} from './knowledgeTextSourceLocator';

describe('a text range survives the trip through jsonb', () => {
  it('round trips through JSON, which is what the column stores', () => {
    const locator = buildKnowledgeTextSourceLocator(338, 1113);
    const read = parseKnowledgeTextSourceLocator(JSON.parse(JSON.stringify([locator])));
    expect(read).toEqual({ kind: KNOWLEDGE_TEXT_LOCATOR_KIND, charStart: 338, charEnd: 1113 });
  });

  it('reads a bare object as well as an array', () => {
    expect(parseKnowledgeTextSourceLocator(buildKnowledgeTextSourceLocator(0, 5))?.charEnd).toBe(5);
  });

  it('finds the text range among locators of other kinds', () => {
    const value = [
      { kind: 'something-else', charStart: 1, charEnd: 2 },
      buildKnowledgeTextSourceLocator(7, 9),
    ];
    expect(parseKnowledgeTextSourceLocator(value)?.charStart).toBe(7);
  });
});

describe('anything it cannot vouch for is null', () => {
  it.each([
    ['nothing at all', null],
    ['an empty array', []],
    ['a PDF bbox locator', [{ pageNumber: 1, space: 'pdf-points', bbox: { left: 0, bottom: 0, right: 1, top: 1 } }]],
    ['a string', 'text-range'],
    ['a number', 42],
  ])('%s', (_label, value) => {
    // A PDF's locators must never be read as a text range: they are the shape
    // this discriminant exists to be distinguished from.
    expect(parseKnowledgeTextSourceLocator(value)).toBeNull();
  });

  it.each([
    ['a missing end', { kind: KNOWLEDGE_TEXT_LOCATOR_KIND, charStart: 0 }],
    ['a string offset', { kind: KNOWLEDGE_TEXT_LOCATOR_KIND, charStart: '0', charEnd: '5' }],
    ['a fractional offset', { kind: KNOWLEDGE_TEXT_LOCATOR_KIND, charStart: 0.5, charEnd: 5 }],
    ['a negative start', { kind: KNOWLEDGE_TEXT_LOCATOR_KIND, charStart: -1, charEnd: 5 }],
    ['an empty range', { kind: KNOWLEDGE_TEXT_LOCATOR_KIND, charStart: 5, charEnd: 5 }],
    ['an inverted range', { kind: KNOWLEDGE_TEXT_LOCATOR_KIND, charStart: 9, charEnd: 2 }],
  ])('a locator that claims the kind but %s is still refused', (_label, value) => {
    // It said it was a text range, so the failure is reported rather than
    // skipped over -- a malformed locator of the right kind is a defect, not
    // another kind's locator to pass by.
    expect(parseKnowledgeTextSourceLocator([value])).toBeNull();
  });
});
