import { describe, expect, it } from 'vitest';

import {
  applyTableFillValues,
  buildTableFillItems,
  parseTableFillResponse,
  TABLE_FILL_MAX_INPUT_CHARS,
  TABLE_FILL_MAX_ITEMS,
  TABLE_FILL_MAX_TOTAL_CHARS,
  TABLE_FILL_MAX_VALUE_CHARS,
} from './tableFill';

/**
 * THE MODEL NEVER WRITES THE TABLE, and these are the rules that enforce it:
 * which rows are targets, what each one sends, which answers may be shown, and
 * that a value for a row nobody asked about is refused.
 */

const GRID = {
  rows: [
    ['Engine oil', 'synthetic 5W-30', ''],
    ['Tyre pressure', '32 psi', ''],
    ['Brakes', '', 'already filled'],
  ],
  columns: ['Item', 'Value', 'Notes'],
};

describe('buildTableFillItems', () => {
  it('targets only the rows whose target cell is EMPTY', () => {
    const { items, skippedForLimit } = buildTableFillItems(GRID, 2, 'row', false);
    // Row 2 already has notes, so it is not a target.
    expect(items.map((item) => item.row)).toEqual([0, 1]);
    expect(skippedForLimit).toBe(false);
  });

  it('targets EVERY row when replaceExisting is on', () => {
    const { items } = buildTableFillItems(GRID, 2, 'row', true);
    expect(items.map((item) => item.row)).toEqual([0, 1, 2]);
  });

  it('whole-row input skips the target column AND empty cells', () => {
    const { items } = buildTableFillItems(GRID, 2, 'row', false);
    // Row 0: Item + Value (Notes is the target and empty).
    expect(items[0].input).toBe('Item: Engine oil | Value: synthetic 5W-30');
    // Row 1 has both other cells non-empty too.
    expect(items[1].input).toBe('Item: Tyre pressure | Value: 32 psi');
  });

  it('a whole-row input with an empty non-target cell skips that cell', () => {
    // The Value cell is empty, so only Item contributes to the whole-row input.
    const grid = { rows: [['Tyre pressure', '', '']], columns: ['Item', 'Value', 'Notes'] };
    const { items } = buildTableFillItems(grid, 2, 'row', false);
    expect(items[0].input).toBe('Item: Tyre pressure');
  });

  it('a single-column source sends that cell alone', () => {
    const { items } = buildTableFillItems(GRID, 2, 0, false);
    expect(items[0].input).toBe('Engine oil');
    expect(items[1].input).toBe('Tyre pressure');
  });

  it('skips a target whose INPUT is empty', () => {
    const grid = { rows: [['', ''], ['has text', '']], columns: ['A', 'B'] };
    // Target column B: row 0's input (A) is empty, so it is skipped; row 1 sends.
    const { items } = buildTableFillItems(grid, 1, 0, false);
    expect(items.map((item) => item.row)).toEqual([1]);
  });

  it('truncates a 1,000-character input', () => {
    const long = 'x'.repeat(TABLE_FILL_MAX_INPUT_CHARS + 500);
    const grid = { rows: [[long, '']], columns: ['A', 'B'] };
    const { items } = buildTableFillItems(grid, 1, 0, false);
    expect(items[0].input.length).toBe(TABLE_FILL_MAX_INPUT_CHARS);
  });

  it('caps at 40 items and reports skippedForLimit', () => {
    const rows = Array.from({ length: 50 }, (_, index) => [`text ${index}`, '']);
    const grid = { rows, columns: ['A', 'B'] };
    const { items, skippedForLimit } = buildTableFillItems(grid, 1, 0, false);
    expect(items).toHaveLength(TABLE_FILL_MAX_ITEMS);
    expect(skippedForLimit).toBe(true);
  });

  it('stops before the 12,000-character total and reports skippedForLimit', () => {
    // Each row sends 900 chars, so 14 rows would exceed 12,000.
    const rows = Array.from({ length: 20 }, (_, index) => ['y'.repeat(900) + index, '']);
    const grid = { rows, columns: ['A', 'B'] };
    const { items, skippedForLimit } = buildTableFillItems(grid, 1, 0, false);
    const total = items.reduce((sum, item) => sum + item.input.length, 0);
    expect(total).toBeLessThanOrEqual(TABLE_FILL_MAX_TOTAL_CHARS);
    expect(skippedForLimit).toBe(true);
  });

  it('reports skippedForLimit FALSE when every target fits', () => {
    const { skippedForLimit } = buildTableFillItems(GRID, 2, 'row', false);
    expect(skippedForLimit).toBe(false);
  });

  it('an out-of-range target column yields no items', () => {
    expect(buildTableFillItems(GRID, 9, 'row', false)).toEqual({ items: [], skippedForLimit: false });
  });
});

describe('parseTableFillResponse', () => {
  const rows = [0, 1, 2];

  it('reads clean JSON', () => {
    const raw = '{"values":[{"row":0,"value":"a"},{"row":1,"value":"b"}]}';
    expect(parseTableFillResponse(raw, rows)).toEqual([
      { row: 0, value: 'a' },
      { row: 1, value: 'b' },
    ]);
  });

  it('reads fenced JSON', () => {
    const raw = '```json\n{"values":[{"row":0,"value":"a"}]}\n```';
    expect(parseTableFillResponse(raw, rows)).toEqual([{ row: 0, value: 'a' }]);
  });

  it('reads JSON surrounded by prose', () => {
    const raw = 'Here you go: {"values":[{"row":2,"value":"c"}]} — hope that helps!';
    expect(parseTableFillResponse(raw, rows)).toEqual([{ row: 2, value: 'c' }]);
  });

  it('yields [] for invalid JSON, and never throws', () => {
    expect(parseTableFillResponse('{ not json', rows)).toEqual([]);
    expect(parseTableFillResponse('', rows)).toEqual([]);
    expect(parseTableFillResponse('nothing here', rows)).toEqual([]);
  });

  it('drops a value for a row nobody asked about', () => {
    const raw = '{"values":[{"row":0,"value":"a"},{"row":99,"value":"intruder"}]}';
    expect(parseTableFillResponse(raw, rows)).toEqual([{ row: 0, value: 'a' }]);
  });

  it('drops a non-string value', () => {
    const raw = '{"values":[{"row":0,"value":42},{"row":1,"value":"b"}]}';
    expect(parseTableFillResponse(raw, rows)).toEqual([{ row: 1, value: 'b' }]);
  });

  it('collapses newlines and runs of whitespace', () => {
    const raw = '{"values":[{"row":0,"value":"line one\\n\\nline   two"}]}';
    expect(parseTableFillResponse(raw, rows)).toEqual([{ row: 0, value: 'line one line two' }]);
  });

  it('caps a value at 500 characters', () => {
    const raw = JSON.stringify({ values: [{ row: 0, value: 'z'.repeat(TABLE_FILL_MAX_VALUE_CHARS + 100) }] });
    expect(parseTableFillResponse(raw, rows)[0].value.length).toBe(TABLE_FILL_MAX_VALUE_CHARS);
  });

  it('keeps the FIRST entry for a duplicated row', () => {
    const raw = '{"values":[{"row":0,"value":"first"},{"row":0,"value":"second"}]}';
    expect(parseTableFillResponse(raw, rows)).toEqual([{ row: 0, value: 'first' }]);
  });

  it('drops an empty value', () => {
    const raw = '{"values":[{"row":0,"value":"   "},{"row":1,"value":"b"}]}';
    expect(parseTableFillResponse(raw, rows)).toEqual([{ row: 1, value: 'b' }]);
  });

  it('a values field that is not an array yields []', () => {
    expect(parseTableFillResponse('{"values":"nope"}', rows)).toEqual([]);
    expect(parseTableFillResponse('{"other":[]}', rows)).toEqual([]);
  });
});

describe('applyTableFillValues', () => {
  it('writes only the target column and leaves every other cell as it was', () => {
    const result = applyTableFillValues(GRID, 2, [{ row: 0, value: 'ok' }, { row: 1, value: 'low' }]);
    expect(result[0]).toEqual(['Engine oil', 'synthetic 5W-30', 'ok']);
    expect(result[1]).toEqual(['Tyre pressure', '32 psi', 'low']);
    // Row 2 was not in the values, so it is unchanged.
    expect(result[2]).toEqual(['Brakes', '', 'already filled']);
  });

  it('returns a new array and does not mutate the input', () => {
    const before = JSON.stringify(GRID.rows);
    const result = applyTableFillValues(GRID, 2, [{ row: 0, value: 'ok' }]);
    expect(JSON.stringify(GRID.rows)).toBe(before);
    expect(result).not.toBe(GRID.rows);
  });

  it('an out-of-range target column returns the rows unchanged', () => {
    expect(applyTableFillValues(GRID, 9, [{ row: 0, value: 'x' }])).toEqual(GRID.rows);
  });
});
