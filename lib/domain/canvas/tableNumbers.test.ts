import { describe, expect, it } from 'vitest';

import { formatSummary, parseCellNumber, summarizeColumn } from './tableNumbers';

/**
 * THE NUMBERS ARE ALWAYS THE CODE'S. These pin the parser's small, stated
 * grammar and the summaries built on it.
 */

describe('parseCellNumber', () => {
  it.each([
    ['50', 50, ''],
    ['4.5 L', 4.5, 'L'],
    ['1,234.5', 1234.5, ''],
    ['1,234', 1234, ''],
    ['-3', -3, ''],
    ['+7', 7, ''],
    ['12%', 12, '%'],
  ])('reads %s as %s with unit %s', (text, value, unit) => {
    expect(parseCellNumber(text)).toEqual({ value, unit });
  });

  it('reads a decimal comma as the owner writes it', () => {
    expect(parseCellNumber('4,5 L')).toEqual({ value: 4.5, unit: 'L' });
  });

  it('trims the text and the unit', () => {
    expect(parseCellNumber('  50  L  ')).toEqual({ value: 50, unit: 'L' });
  });

  it.each(['', '   ', 'abc', 'abc 5', '5 6', '1,2345', '1.2.3', '1,234,5', '50 L unit too long'])(
    'rejects %s',
    (text) => {
      expect(parseCellNumber(text)).toBeNull();
    },
  );
});

describe('summarizeColumn', () => {
  it('sums, averages, mins and maxes the parsed cells', () => {
    expect(summarizeColumn(['1', '2', '3'], 'sum')).toEqual({ value: 6, unit: '', counted: 3 });
    expect(summarizeColumn(['1', '2'], 'average')).toEqual({ value: 1.5, unit: '', counted: 2 });
    expect(summarizeColumn(['5', '2', '9'], 'min')).toEqual({ value: 2, unit: '', counted: 3 });
    expect(summarizeColumn(['5', '2', '9'], 'max')).toEqual({ value: 9, unit: '', counted: 3 });
  });

  it('reports the shared unit, and none when they disagree', () => {
    expect(summarizeColumn(['4.5 L', '5.5 L'], 'sum')).toEqual({ value: 10, unit: 'L', counted: 2 });
    expect(summarizeColumn(['4.5 L', '5 kg'], 'sum')).toEqual({ value: 9.5, unit: '', counted: 2 });
  });

  it('counts NON-EMPTY cells whatever they contain', () => {
    expect(summarizeColumn(['a', '', 'b', '   '], 'count')).toEqual({ value: 2, unit: '', counted: 2 });
  });

  it('is null when no cell parses', () => {
    expect(summarizeColumn(['a', 'b'], 'sum')).toEqual({ value: null, unit: '', counted: 0 });
    expect(summarizeColumn([], 'average')).toEqual({ value: null, unit: '', counted: 0 });
  });

  it('ignores non-parsing cells beside parsing ones', () => {
    expect(summarizeColumn(['1', 'n/a', '2'], 'sum')).toEqual({ value: 3, unit: '', counted: 2 });
  });
});

describe('formatSummary', () => {
  it('names the kind and appends the shared unit', () => {
    expect(formatSummary('sum', { value: 54.5, unit: 'L', counted: 2 })).toBe('Sum 54.5 L');
    expect(formatSummary('count', { value: 3, unit: '', counted: 3 })).toBe('Count 3');
  });

  it('rounds to two decimals and drops trailing zeros', () => {
    expect(formatSummary('average', { value: 18.166, unit: '', counted: 3 })).toBe('Average 18.17');
    expect(formatSummary('average', { value: 18.1, unit: '', counted: 2 })).toBe('Average 18.1');
  });

  it('shows an em dash when there is no value', () => {
    expect(formatSummary('min', { value: null, unit: '', counted: 0 })).toBe('Min —');
  });
});
