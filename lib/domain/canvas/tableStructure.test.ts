import { describe, expect, it } from 'vitest';

import {
  clearColumn,
  clearRow,
  DEFAULT_COLUMN_WIDTH,
  deleteColumn,
  deleteRow,
  distributeColumnWidths,
  duplicateColumn,
  duplicateRow,
  fitColumnWidth,
  insertColumn,
  insertRow,
  nextColumnName,
  normalizeColumnWidths,
  setColumnStyle,
  setRowStyle,
  type TableGrid,
} from './tableStructure';

/**
 * EVERY ONE OF THESE MOVES TEXT, COLUMNS AND STYLES TOGETHER.
 *
 * `cellStyles` is keyed by position, so a structural change that does not
 * re-key it leaves a colour on the wrong cell -- the bug this module exists to
 * fix. These tests check the TEXT and the STYLES after every operation, and
 * freeze the input so a function that mutated it would throw rather than pass
 * quietly.
 */

/** A 3x3 grid with styles on several cells, including before/at/after a middle row+col. */
const baseGrid = (): TableGrid => ({
  rows: [
    ['a0', 'b0', 'c0'],
    ['a1', 'b1', 'c1'],
    ['a2', 'b2', 'c2'],
  ],
  columns: ['A', 'B', 'C'],
  cellStyles: {
    '0-0': { bg: '#fee2e2' },
    '1-1': { bg: '#dcfce7', bold: true },
    '2-2': { bg: '#dbeafe' },
  },
});

/** A deeply frozen copy, so any mutation of it throws in strict mode. */
function frozen(): TableGrid {
  const grid = baseGrid();
  const deep = (value: unknown): void => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value as Record<string, unknown>)) deep(child);
      Object.freeze(value);
    }
  };
  deep(grid.rows);
  deep(grid.columns);
  deep(grid.cellStyles);
  return Object.freeze(grid);
}

describe('insertRow', () => {
  it('inserts an empty row at the index, and shifts styles below it down', () => {
    const result = insertRow(baseGrid(), 1);
    expect(result.rows).toEqual([
      ['a0', 'b0', 'c0'],
      ['', '', ''],
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
    ]);
    // '0-0' stays; '1-1' and '2-2' each move down one row.
    expect(result.cellStyles).toEqual({
      '0-0': { bg: '#fee2e2' },
      '2-1': { bg: '#dcfce7', bold: true },
      '3-2': { bg: '#dbeafe' },
    });
  });

  it('inserts at the end with `at = rows.length`', () => {
    const result = insertRow(baseGrid(), 3);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[3]).toEqual(['', '', '']);
    expect(result.cellStyles).toEqual(baseGrid().cellStyles);
  });

  it('does not mutate a deeply frozen input', () => {
    expect(() => insertRow(frozen(), 1)).not.toThrow();
  });
});

describe('deleteRow', () => {
  it('removes the row and its styles, and shifts styles below up', () => {
    const result = deleteRow(baseGrid(), 1);
    expect(result.rows).toEqual([['a0', 'b0', 'c0'], ['a2', 'b2', 'c2']]);
    // '1-1' is gone; '2-2' moves up to '1-2'.
    expect(result.cellStyles).toEqual({
      '0-0': { bg: '#fee2e2' },
      '1-2': { bg: '#dbeafe' },
    });
  });

  it('returns the SAME grid when only one row remains', () => {
    const oneRow: TableGrid = { rows: [['x']], columns: ['A'], cellStyles: {} };
    expect(deleteRow(oneRow, 0)).toBe(oneRow);
  });

  it('does not mutate a deeply frozen input', () => {
    expect(() => deleteRow(frozen(), 0)).not.toThrow();
  });
});

describe('duplicateRow', () => {
  it('copies text and styles into the row below, shifting the rest down', () => {
    const result = duplicateRow(baseGrid(), 1);
    expect(result.rows).toEqual([
      ['a0', 'b0', 'c0'],
      ['a1', 'b1', 'c1'],
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
    ]);
    // The duplicated row's style exists at BOTH positions; '2-2' shifted to '3-2'.
    expect(result.cellStyles).toEqual({
      '0-0': { bg: '#fee2e2' },
      '1-1': { bg: '#dcfce7', bold: true },
      '2-1': { bg: '#dcfce7', bold: true },
      '3-2': { bg: '#dbeafe' },
    });
  });

  it('does not mutate a deeply frozen input', () => {
    expect(() => duplicateRow(frozen(), 0)).not.toThrow();
  });
});

describe('clearRow', () => {
  it('empties the text and KEEPS the styles', () => {
    const result = clearRow(baseGrid(), 1);
    expect(result.rows).toEqual([['a0', 'b0', 'c0'], ['', '', ''], ['a2', 'b2', 'c2']]);
    expect(result.cellStyles).toEqual(baseGrid().cellStyles);
  });

  it('does not mutate a deeply frozen input', () => {
    expect(() => clearRow(frozen(), 1)).not.toThrow();
  });
});

describe('insertColumn', () => {
  it('inserts an empty column named by nextColumnName, shifting styles right', () => {
    const result = insertColumn(baseGrid(), 1);
    expect(result.columns).toEqual(['A', 'D', 'B', 'C']);
    expect(result.rows).toEqual([
      ['a0', '', 'b0', 'c0'],
      ['a1', '', 'b1', 'c1'],
      ['a2', '', 'b2', 'c2'],
    ]);
    expect(result.cellStyles).toEqual({
      '0-0': { bg: '#fee2e2' },
      '1-2': { bg: '#dcfce7', bold: true },
      '2-3': { bg: '#dbeafe' },
    });
  });

  it('does not mutate a deeply frozen input', () => {
    expect(() => insertColumn(frozen(), 1)).not.toThrow();
  });
});

describe('deleteColumn', () => {
  it('removes the column and its styles, shifting styles right of it left', () => {
    const result = deleteColumn(baseGrid(), 1);
    expect(result.columns).toEqual(['A', 'C']);
    expect(result.rows).toEqual([['a0', 'c0'], ['a1', 'c1'], ['a2', 'c2']]);
    expect(result.cellStyles).toEqual({
      '0-0': { bg: '#fee2e2' },
      '2-1': { bg: '#dbeafe' },
    });
  });

  it('returns the SAME grid when only one column remains', () => {
    const oneCol: TableGrid = { rows: [['x'], ['y']], columns: ['A'], cellStyles: {} };
    expect(deleteColumn(oneCol, 0)).toBe(oneCol);
  });

  it('does not mutate a deeply frozen input', () => {
    expect(() => deleteColumn(frozen(), 0)).not.toThrow();
  });
});

describe('duplicateColumn', () => {
  it('copies text and styles into a new column named by nextColumnName', () => {
    const result = duplicateColumn(baseGrid(), 1);
    expect(result.columns).toEqual(['A', 'B', 'D', 'C']);
    expect(result.rows).toEqual([
      ['a0', 'b0', 'b0', 'c0'],
      ['a1', 'b1', 'b1', 'c1'],
      ['a2', 'b2', 'b2', 'c2'],
    ]);
    expect(result.cellStyles).toEqual({
      '0-0': { bg: '#fee2e2' },
      '1-1': { bg: '#dcfce7', bold: true },
      '1-2': { bg: '#dcfce7', bold: true },
      '2-3': { bg: '#dbeafe' },
    });
  });

  it('does not mutate a deeply frozen input', () => {
    expect(() => duplicateColumn(frozen(), 0)).not.toThrow();
  });
});

describe('clearColumn', () => {
  it('empties the text and KEEPS the styles', () => {
    const result = clearColumn(baseGrid(), 1);
    expect(result.rows).toEqual([['a0', '', 'c0'], ['a1', '', 'c1'], ['a2', '', 'c2']]);
    expect(result.cellStyles).toEqual(baseGrid().cellStyles);
  });

  it('does not mutate a deeply frozen input', () => {
    expect(() => clearColumn(frozen(), 1)).not.toThrow();
  });
});

describe('setRowStyle / setColumnStyle', () => {
  it('merges a patch into every cell of the row', () => {
    const result = setRowStyle(baseGrid(), 0, { bg: '#000000' });
    expect(result.cellStyles['0-0']).toEqual({ bg: '#000000' });
    expect(result.cellStyles['0-1']).toEqual({ bg: '#000000' });
    expect(result.cellStyles['0-2']).toEqual({ bg: '#000000' });
    // Another row is untouched.
    expect(result.cellStyles['1-1']).toEqual({ bg: '#dcfce7', bold: true });
  });

  it('merges without dropping existing keys', () => {
    const result = setColumnStyle(baseGrid(), 1, { align: 'center' });
    // '1-1' keeps its bg and bold and gains align.
    expect(result.cellStyles['1-1']).toEqual({ bg: '#dcfce7', bold: true, align: 'center' });
    expect(result.cellStyles['0-1']).toEqual({ align: 'center' });
  });

  it('a patch value of undefined REMOVES that key', () => {
    const result = setRowStyle(baseGrid(), 1, { bg: undefined });
    // bg removed; bold survives; the style is not empty so it stays.
    expect(result.cellStyles['1-1']).toEqual({ bold: true });
  });

  it('a style that ends up EMPTY is removed from cellStyles', () => {
    const result = setRowStyle(baseGrid(), 1, { bg: undefined, bold: undefined });
    expect(result.cellStyles).not.toHaveProperty('1-1');
    // The unrelated styles remain untouched.
    expect(result.cellStyles['0-0']).toEqual({ bg: '#fee2e2' });
  });

  it('does not mutate a deeply frozen input', () => {
    expect(() => setRowStyle(frozen(), 0, { bg: '#000000' })).not.toThrow();
    expect(() => setColumnStyle(frozen(), 0, { bg: undefined })).not.toThrow();
  });
});

describe('nextColumnName', () => {
  it('is A for no columns', () => {
    expect(nextColumnName([])).toBe('A');
  });

  it('is D for A,B,C', () => {
    expect(nextColumnName(['A', 'B', 'C'])).toBe('D');
  });

  it('fills the FIRST unused name, so a delete can be repaired', () => {
    // A,B,C -> delete B -> A,C -> the next name is B, not D.
    expect(nextColumnName(['A', 'C'])).toBe('B');
  });

  it('continues past Z', () => {
    const alphabet = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
    expect(nextColumnName(alphabet)).toBe('AA');
    expect(nextColumnName([...alphabet, 'AA'])).toBe('AB');
  });
});

describe('invalid and out-of-range style keys are dropped', () => {
  it('drops keys that do not parse as two non-negative integers', () => {
    const grid: TableGrid = {
      rows: [['x', 'y']],
      columns: ['A', 'B'],
      cellStyles: { 'not-a-key': { bg: '#000' }, '0-0x': { bg: '#111' } },
    };
    const result = insertRow(grid, 0);
    expect(result.cellStyles).toEqual({});
  });

  it('drops keys that point outside the grid', () => {
    const grid: TableGrid = {
      rows: [['x']],
      columns: ['A'],
      cellStyles: { '5-0': { bg: '#000' }, '0-9': { bg: '#111' } },
    };
    const result = insertColumn(grid, 0);
    expect(result.cellStyles).toEqual({});
  });

  it('keeps valid keys beside dropped ones', () => {
    const grid: TableGrid = {
      rows: [['x', 'y']],
      columns: ['A', 'B'],
      cellStyles: { '0-0': { bg: '#000' }, 'bogus': { bg: '#111' } },
    };
    const result = insertRow(grid, 1);
    expect(result.cellStyles).toEqual({ '0-0': { bg: '#000' } });
  });
});

describe('PATCH-169: a text size is part of the style and moves with its cell', () => {
  it('keeps `size` on the cell it belonged to through insert, delete and duplicate', () => {
    const grid: TableGrid = {
      rows: [['a', 'b'], ['c', 'd']],
      columns: ['A', 'B'],
      cellStyles: { '1-1': { size: 'h1' } },
    };

    // Insert above row 1: the styled cell moves down to row 2.
    const inserted = insertRow(grid, 1);
    expect(inserted.cellStyles['2-1']).toEqual({ size: 'h1' });
    expect(inserted.cellStyles['1-1']).toBeUndefined();

    // Delete row 0: the styled cell moves up to row 0.
    expect(deleteRow(grid, 0).cellStyles['0-1']).toEqual({ size: 'h1' });

    // Duplicate row 1: both the original and its copy carry the size.
    const duplicated = duplicateRow(grid, 1);
    expect(duplicated.cellStyles['1-1']).toEqual({ size: 'h1' });
    expect(duplicated.cellStyles['2-1']).toEqual({ size: 'h1' });
  });
});

describe('PATCH-170: column widths stay aligned with columns', () => {
  const widthGrid = (): TableGrid => ({ ...baseGrid(), columnWidths: [80, 120, 200] });

  it('insertColumn inserts the default width at the position', () => {
    expect(insertColumn(widthGrid(), 1).columnWidths).toEqual([80, DEFAULT_COLUMN_WIDTH, 120, 200]);
  });

  it('deleteColumn removes that entry', () => {
    expect(deleteColumn(widthGrid(), 1).columnWidths).toEqual([80, 200]);
  });

  it('duplicateColumn copies the source column width', () => {
    expect(duplicateColumn(widthGrid(), 1).columnWidths).toEqual([80, 120, 120, 200]);
  });

  it('row and style operations leave widths unchanged', () => {
    expect(insertRow(widthGrid(), 1).columnWidths).toEqual([80, 120, 200]);
    expect(deleteRow(widthGrid(), 1).columnWidths).toEqual([80, 120, 200]);
    expect(duplicateRow(widthGrid(), 1).columnWidths).toEqual([80, 120, 200]);
    expect(clearRow(widthGrid(), 1).columnWidths).toEqual([80, 120, 200]);
    expect(setRowStyle(widthGrid(), 0, { bold: true }).columnWidths).toEqual([80, 120, 200]);
    expect(setColumnStyle(widthGrid(), 0, { bold: true }).columnWidths).toEqual([80, 120, 200]);
  });

  it('an absent width list stays absent', () => {
    expect(insertColumn(baseGrid(), 1).columnWidths).toBeUndefined();
    expect(deleteColumn(baseGrid(), 1).columnWidths).toBeUndefined();
    expect(insertRow(baseGrid(), 1).columnWidths).toBeUndefined();
    expect(duplicateColumn(baseGrid(), 1).columnWidths).toBeUndefined();
    expect(setColumnStyle(baseGrid(), 0, { bold: true }).columnWidths).toBeUndefined();
  });
});

describe('PATCH-170: normalizeColumnWidths', () => {
  it('missing, wrong length or any non-finite entry means every column is 100', () => {
    expect(normalizeColumnWidths(undefined, 3)).toEqual([100, 100, 100]);
    expect(normalizeColumnWidths([80, 120], 3)).toEqual([100, 100, 100]);
    expect(normalizeColumnWidths([80, Number.NaN, 120], 3)).toEqual([100, 100, 100]);
    expect(normalizeColumnWidths([80, Number.POSITIVE_INFINITY, 120], 3)).toEqual([100, 100, 100]);
    expect(normalizeColumnWidths('nope', 2)).toEqual([100, 100]);
  });

  it('clamps each entry to 60..600', () => {
    expect(normalizeColumnWidths([10, 300, 9999], 3)).toEqual([60, 300, 600]);
  });
});

describe('PATCH-170: distributeColumnWidths', () => {
  it('gives every column the floor of the average, clamped', () => {
    expect(distributeColumnWidths([100, 200, 150])).toEqual([150, 150, 150]);
    // floor(301 / 3) = 100
    expect(distributeColumnWidths([100, 100, 101])).toEqual([100, 100, 100]);
    // An average below the minimum clamps up.
    expect(distributeColumnWidths([60, 60, 61])).toEqual([60, 60, 60]);
    // An average above the maximum clamps down.
    expect(distributeColumnWidths([600, 600, 601])).toEqual([600, 600, 600]);
    expect(distributeColumnWidths([])).toEqual([]);
  });
});

describe('PATCH-170: fitColumnWidth', () => {
  it('is at least 60 for short content', () => {
    expect(fitColumnWidth(['a', 'bb'], 'C')).toBe(60);
  });

  it('grows with the longest text or the header', () => {
    // 10 characters: ceil(75) + 24 = 99.
    expect(fitColumnWidth(['0123456789'], 'C')).toBe(99);
    // The header is the longest input.
    expect(fitColumnWidth(['a'], '0123456789')).toBe(99);
  });

  it('clamps to 600 for long content', () => {
    expect(fitColumnWidth(['x'.repeat(500)], 'C')).toBe(600);
  });
});
