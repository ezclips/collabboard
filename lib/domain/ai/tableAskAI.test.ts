import { describe, expect, it } from 'vitest';

import {
  tableAskAIInstruction,
  tableSelectionText,
  type TableAskAIGrid,
  type TableAskAIRange,
} from './tableAskAI';
import { TEXT_ACTION_SELECTED_TEXT_MAX } from '@/lib/ai/textActions';

/**
 * WHAT THE USER SELECTED becomes text, and WHAT A PRESET MEANS becomes an
 * instruction. Both are pure rules; the panel only renders their answers.
 */

const GRID: TableAskAIGrid = {
  rows: [
    ['Engine oil', 'synthetic 5W-30', ''],
    ['Tyre pressure', '', ''],
    ['Brakes', 'pads', 'check'],
  ],
  columns: ['Item', 'Value', 'Notes'],
};

const range = (minRow: number, maxRow: number, minCol: number, maxCol: number): TableAskAIRange =>
  ({ minRow, maxRow, minCol, maxCol });

describe('tableSelectionText', () => {
  it('turns a single selected cell into one line', () => {
    const { text, truncated } = tableSelectionText(GRID, range(0, 0, 0, 0));
    expect(text).toBe('Row 1: Item: Engine oil');
    expect(truncated).toBe(false);
  });

  it('uses the column names and 1-based row numbers for a range', () => {
    const { text } = tableSelectionText(GRID, range(0, 1, 0, 2));
    expect(text).toBe([
      'Row 1: Item: Engine oil | Value: synthetic 5W-30',
      'Row 2: Item: Tyre pressure',
    ].join('\n'));
  });

  it('skips empty cells and a row with no text at all', () => {
    const grid: TableAskAIGrid = {
      rows: [
        ['', '', ''],
        ['only this', '', ''],
        ['', 'and this', ''],
      ],
      columns: ['A', 'B', 'C'],
    };
    const { text } = tableSelectionText(grid, range(0, 2, 0, 2));
    // The all-empty row 1 contributes no line; empty cells are omitted.
    expect(text).toBe('Row 2: A: only this\nRow 3: B: and this');
  });

  it('stops at the last whole line that fits under 4,000 characters', () => {
    const grid: TableAskAIGrid = {
      rows: [
        ['x'.repeat(1500)],
        ['y'.repeat(1500)],
        ['z'.repeat(1500)],
      ],
      columns: ['C'],
    };
    const { text, truncated } = tableSelectionText(grid, range(0, 2, 0, 0));
    const lines = text.split('\n');
    expect(lines).toHaveLength(2);
    expect(text.length).toBeLessThanOrEqual(TEXT_ACTION_SELECTED_TEXT_MAX);
    // The kept lines are whole -- the third is dropped, not split.
    expect(lines[1]).toBe(`Row 2: C: ${'y'.repeat(1500)}`);
    expect(truncated).toBe(true);
  });

  it('returns an empty result for a selection with no text', () => {
    const grid: TableAskAIGrid = { rows: [['', '']], columns: ['A', 'B'] };
    expect(tableSelectionText(grid, range(0, 0, 0, 1))).toEqual({ text: '', truncated: false });
  });

  it('an out-of-range row is treated as empty rather than throwing', () => {
    expect(tableSelectionText(GRID, range(99, 99, 0, 0))).toEqual({ text: '', truncated: false });
  });
});

describe('tableAskAIInstruction', () => {
  it('summarize', () => {
    expect(tableAskAIInstruction('summarize')).toBe('Summarize these table cells in a few sentences.');
  });

  it('explain', () => {
    expect(tableAskAIInstruction('explain')).toBe('Explain what these table cells say, in plain language.');
  });

  it('translate embeds the language and keeps the labels', () => {
    expect(tableAskAIInstruction('translate', 'German')).toBe(
      'Translate these table cells into German. Keep the Row/column labels.',
    );
  });

  it('question embeds the question', () => {
    expect(tableAskAIInstruction('question', 'What changed?')).toBe(
      'Answer this question using only these table cells: What changed?',
    );
  });

  it('trims the detail', () => {
    expect(tableAskAIInstruction('translate', '  German  ')).toBe(
      'Translate these table cells into German. Keep the Row/column labels.',
    );
    expect(tableAskAIInstruction('question', '  What changed?  ')).toBe(
      'Answer this question using only these table cells: What changed?',
    );
  });
});
