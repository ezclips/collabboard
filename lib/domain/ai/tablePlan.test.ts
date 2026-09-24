import { describe, expect, it } from 'vitest';

import {
  applyTablePlan,
  buildTablePlanRequest,
  describeTablePlanStep,
  parseTablePlanResponse,
  TABLE_PLAN_MAX_STEPS,
  TABLE_PLAN_SAMPLE_CELL_CHARS,
  TABLE_PLAN_SAMPLE_ROWS,
  tablePlanSchema,
  type TablePlanStep,
} from './tablePlan';
import type { TableGrid } from '@/lib/domain/canvas/tableStructure';

/**
 * THE MODEL NEVER TOUCHES THE TABLE. These rules are what enforce it: only the
 * actions below are accepted, one bad step rejects the whole plan, a plan is
 * run on a copy, columns are named by title, and rows are chosen by condition.
 */

const GRID: TableGrid = {
  rows: [
    ['Toyota', 'Corolla', '50 L'],
    ['Ford', 'Focus', '45 L'],
    ['Honda', 'Civic', ''],
  ],
  columns: ['Brand', 'Model', 'Fuel tank'],
  cellStyles: {
    '0-2': { bg: '#fee2e2', bold: true },
    '1-0': { aiFilled: true },
  },
};

/** A deep copy, so a function that mutated `GRID` would be caught. */
const copyGrid = (grid: TableGrid): TableGrid => ({
  rows: grid.rows.map((row) => [...row]),
  columns: [...grid.columns],
  cellStyles: { ...grid.cellStyles },
  ...(grid.columnWidths ? { columnWidths: [...grid.columnWidths] } : {}),
  ...(grid.columnSummaries ? { columnSummaries: [...grid.columnSummaries] } : {}),
});

describe('tablePlanSchema', () => {
  const valid = (steps: unknown[]) => ({ message: 'ok', steps });

  it('accepts every action when valid', () => {
    // One valid plan per action, so all ten are exercised within the 8-step cap.
    const plans = [
      [{ action: 'sortRows', column: 'Fuel tank', direction: 'desc' }],
      [{ action: 'setSummary', column: 'Fuel tank', summary: 'sum' }],
      [{ action: 'setSummary', column: 'Fuel tank', summary: 'none' }],
      [{ action: 'replaceText', find: 'L', replace: 'litres', column: 'Fuel tank' }],
      [{ action: 'deleteRowsWhere', column: 'Brand', test: 'empty' }],
      [{ action: 'deleteRowsWhere', column: 'Brand', test: 'contains', value: 'Ford' }],
      [{ action: 'deleteEmptyRows' }],
      [{ action: 'insertColumn', title: 'Notes', after: 'Model' }],
      [{ action: 'renameColumn', column: 'Model', title: 'Trim' }],
      [{ action: 'deleteColumn', column: 'Model' }],
      [{ action: 'styleColumn', column: 'Brand', bold: true, align: 'right', bg: '#abcdef' }],
    ];
    for (const steps of plans) {
      expect(tablePlanSchema.safeParse(valid(steps)).success, JSON.stringify(steps)).toBe(true);
    }
  });

  it('rejects an unknown action', () => {
    expect(tablePlanSchema.safeParse(valid([{ action: 'explode' }])).success).toBe(false);
  });

  it('rejects an extra field', () => {
    expect(tablePlanSchema.safeParse(valid([
      { action: 'sortRows', column: 'A', direction: 'asc', sneaky: 1 },
    ])).success).toBe(false);
  });

  it(`rejects ${TABLE_PLAN_MAX_STEPS + 1} steps`, () => {
    const steps = Array.from({ length: TABLE_PLAN_MAX_STEPS + 1 }, () => ({ action: 'deleteEmptyRows' }));
    expect(tablePlanSchema.safeParse(valid(steps)).success).toBe(false);
  });

  it('rejects a bad bg', () => {
    expect(tablePlanSchema.safeParse(valid([
      { action: 'styleColumn', column: 'A', bg: 'red' },
    ])).success).toBe(false);
  });

  it('rejects equals without a value', () => {
    expect(tablePlanSchema.safeParse(valid([
      { action: 'deleteRowsWhere', column: 'A', test: 'equals' },
    ])).success).toBe(false);
  });

  it('rejects empty with a value', () => {
    expect(tablePlanSchema.safeParse(valid([
      { action: 'deleteRowsWhere', column: 'A', test: 'empty', value: 'x' },
    ])).success).toBe(false);
  });
});

describe('parseTablePlanResponse', () => {
  const plan = {
    message: 'Sorting and totalling.',
    steps: [{ action: 'sortRows', column: 'Fuel tank', direction: 'desc' }],
  };

  it('accepts a bare JSON object', () => {
    expect(parseTablePlanResponse(JSON.stringify(plan))?.message).toBe('Sorting and totalling.');
  });

  it('accepts a fenced object', () => {
    expect(parseTablePlanResponse('```json\n' + JSON.stringify(plan) + '\n```')?.steps).toHaveLength(1);
  });

  it('accepts an object surrounded by prose', () => {
    expect(parseTablePlanResponse(`Sure! ${JSON.stringify(plan)} Hope that helps.`)?.steps).toHaveLength(1);
  });

  it('returns null for garbage', () => {
    expect(parseTablePlanResponse('I cannot do that.')).toBeNull();
    expect(parseTablePlanResponse('')).toBeNull();
    expect(parseTablePlanResponse('{ broken')).toBeNull();
  });

  it('returns null when one step is invalid (no partial plans)', () => {
    const bad = { message: 'x', steps: [plan.steps[0], { action: 'explode' }] };
    expect(parseTablePlanResponse(JSON.stringify(bad))).toBeNull();
  });
});

describe('applyTablePlan', () => {
  it('sorts rows numerically and moves styles with them', () => {
    const result = applyTablePlan(GRID, [{ action: 'sortRows', column: 'Fuel tank', direction: 'asc' }]);
    expect('grid' in result).toBe(true);
    const grid = (result as { grid: TableGrid }).grid;
    expect(grid.rows.map((row) => row[0])).toEqual(['Ford', 'Toyota', 'Honda']);
    // '0-2' was on Toyota (now row 1); '1-0' was on Ford (now row 0).
    expect(grid.cellStyles['1-2']).toEqual({ bg: '#fee2e2', bold: true });
    expect(grid.cellStyles['0-0']).toEqual({ aiFilled: true });
  });

  it('sets a summary and clears it', () => {
    const set = applyTablePlan(GRID, [{ action: 'setSummary', column: 'Fuel tank', summary: 'sum' }]);
    expect((set as { grid: TableGrid }).grid.columnSummaries).toEqual([null, null, 'sum']);
    const cleared = applyTablePlan((set as { grid: TableGrid }).grid, [
      { action: 'setSummary', column: 'Fuel tank', summary: 'none' },
    ]);
    expect((cleared as { grid: TableGrid }).grid.columnSummaries).toEqual([null, null, null]);
  });

  it('replaces text only in the named column', () => {
    const result = applyTablePlan(GRID, [
      { action: 'replaceText', find: 'L', replace: 'litres', column: 'Fuel tank' },
    ]);
    const grid = (result as { grid: TableGrid }).grid;
    expect(grid.rows.map((row) => row[2])).toEqual(['50 litres', '45 litres', '']);
    // A style on a CHANGED cell loses aiFilled only where the text changed.
    expect(grid.cellStyles['0-2']).toEqual({ bg: '#fee2e2', bold: true });
  });

  it('deletes rows by a condition and re-keys styles', () => {
    const result = applyTablePlan(GRID, [
      { action: 'deleteRowsWhere', column: 'Fuel tank', test: 'empty' },
    ]);
    const grid = (result as { grid: TableGrid }).grid;
    expect(grid.rows.map((row) => row[0])).toEqual(['Toyota', 'Ford']);
    expect(grid.cellStyles['0-2']).toEqual({ bg: '#fee2e2', bold: true });
  });

  it('deleteRowsWhere contains is a case-insensitive substring match', () => {
    const result = applyTablePlan(GRID, [
      { action: 'deleteRowsWhere', column: 'brand', test: 'contains', value: 'ORD' },
    ]);
    expect((result as { grid: TableGrid }).grid.rows.map((row) => row[0])).toEqual(['Toyota', 'Honda']);
  });

  it('deleteRowsWhere equals matches the whole trimmed cell only', () => {
    const partial = applyTablePlan(GRID, [
      { action: 'deleteRowsWhere', column: 'Brand', test: 'equals', value: 'For' },
    ]);
    expect((partial as { grid: TableGrid }).grid.rows.map((row) => row[0])).toEqual(['Toyota', 'Ford', 'Honda']);
    const whole = applyTablePlan(GRID, [
      { action: 'deleteRowsWhere', column: 'Brand', test: 'equals', value: ' ford ' },
    ]);
    expect((whole as { grid: TableGrid }).grid.rows.map((row) => row[0])).toEqual(['Toyota', 'Honda']);
  });

  it('deletes empty rows', () => {
    const grid: TableGrid = {
      rows: [['a', 'b'], ['', ''], ['c', 'd']],
      columns: ['A', 'B'],
      cellStyles: {},
    };
    const result = applyTablePlan(grid, [{ action: 'deleteEmptyRows' }]);
    expect((result as { grid: TableGrid }).grid.rows).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('inserts a column after a title and renames the new one', () => {
    const result = applyTablePlan(GRID, [
      { action: 'insertColumn', title: 'Notes', after: 'Model' },
    ]);
    const grid = (result as { grid: TableGrid }).grid;
    expect(grid.columns).toEqual(['Brand', 'Model', 'Notes', 'Fuel tank']);
    expect(grid.rows[0]).toEqual(['Toyota', 'Corolla', '', '50 L']);
  });

  it('renames a column', () => {
    const result = applyTablePlan(GRID, [{ action: 'renameColumn', column: 'Model', title: 'Trim' }]);
    expect((result as { grid: TableGrid }).grid.columns).toEqual(['Brand', 'Trim', 'Fuel tank']);
  });

  it('deletes a column and moves styles', () => {
    const result = applyTablePlan(GRID, [{ action: 'deleteColumn', column: 'Model' }]);
    const grid = (result as { grid: TableGrid }).grid;
    expect(grid.columns).toEqual(['Brand', 'Fuel tank']);
    // '0-2' (Fuel tank) moves left to column 1.
    expect(grid.cellStyles['0-1']).toEqual({ bg: '#fee2e2', bold: true });
  });

  it('styles a column with only the given fields', () => {
    const result = applyTablePlan(GRID, [
      { action: 'styleColumn', column: 'Brand', bold: true, align: 'right' },
    ]);
    const grid = (result as { grid: TableGrid }).grid;
    expect(grid.cellStyles['0-0']).toEqual({ bold: true, align: 'right' });
    expect(grid.cellStyles['2-0']).toEqual({ bold: true, align: 'right' });
  });

  it('resolves a title case-insensitively and trimmed', () => {
    const result = applyTablePlan(GRID, [{ action: 'sortRows', column: '  fuel TANK ', direction: 'asc' }]);
    expect('grid' in result).toBe(true);
  });

  it('lets a later step use a column an earlier step created', () => {
    const result = applyTablePlan(GRID, [
      { action: 'insertColumn', title: 'Notes', after: 'Model' },
      { action: 'setSummary', column: 'Notes', summary: 'count' },
    ]);
    expect((result as { grid: TableGrid }).grid.columnSummaries).toEqual([null, null, 'count', null]);
  });

  it('lets a later step use a column an earlier step renamed', () => {
    const result = applyTablePlan(GRID, [
      { action: 'renameColumn', column: 'Model', title: 'Trim' },
      { action: 'styleColumn', column: 'Trim', bold: true },
    ]);
    const grid = (result as { grid: TableGrid }).grid;
    expect(grid.cellStyles['0-1']).toEqual({ bold: true });
  });

  it('an unknown column is an error with the right stepIndex', () => {
    const result = applyTablePlan(GRID, [
      { action: 'deleteEmptyRows' },
      { action: 'sortRows', column: 'Nope', direction: 'asc' },
    ]);
    expect(result).toEqual({ error: 'No column named "Nope"', stepIndex: 1 });
  });

  it('deleting the LAST column is an error', () => {
    const oneCol: TableGrid = { rows: [['a'], ['b']], columns: ['A'], cellStyles: {} };
    expect(applyTablePlan(oneCol, [{ action: 'deleteColumn', column: 'A' }]))
      .toEqual({ error: 'A table needs at least one column', stepIndex: 0 });
  });

  it('insertColumn onto a duplicate title is an error', () => {
    expect(applyTablePlan(GRID, [{ action: 'insertColumn', title: 'Brand' }]))
      .toEqual({ error: 'A column named "Brand" already exists', stepIndex: 0 });
  });

  it('does not mutate the input grid', () => {
    const before = copyGrid(GRID);
    applyTablePlan(GRID, [
      { action: 'sortRows', column: 'Fuel tank', direction: 'desc' },
      { action: 'deleteColumn', column: 'Model' },
      { action: 'setSummary', column: 'Brand', summary: 'count' },
    ]);
    expect(GRID).toEqual(before);
  });
});

describe('describeTablePlanStep', () => {
  const cases: Array<[TablePlanStep, string]> = [
    [{ action: 'sortRows', column: 'Fuel tank', direction: 'desc' }, 'Sort by "Fuel tank", Z → A / largest first'],
    [{ action: 'sortRows', column: 'Fuel tank', direction: 'asc' }, 'Sort by "Fuel tank", A → Z / smallest first'],
    [{ action: 'setSummary', column: 'Price', summary: 'sum' }, 'Show the sum under "Price"'],
    [{ action: 'replaceText', find: 'L', replace: 'litres', column: 'Oil' }, 'Replace "L" with "litres" in "Oil"'],
    [{ action: 'deleteRowsWhere', column: 'Brand', test: 'empty' }, 'Delete rows where "Brand" is empty'],
    [{ action: 'deleteRowsWhere', column: 'Brand', test: 'contains', value: 'Ford' }, 'Delete rows where "Brand" contains "Ford"'],
    [{ action: 'insertColumn', title: 'Notes', after: 'Model' }, 'Add column "Notes" after "Model"'],
    [{ action: 'renameColumn', column: 'B', title: 'Oil capacity' }, 'Rename "B" to "Oil capacity"'],
    [{ action: 'deleteColumn', column: 'C' }, 'Delete column "C"'],
    [{ action: 'styleColumn', column: 'Price', bold: true, align: 'right' }, 'Make "Price" bold, right-aligned'],
  ];

  for (const [step, line] of cases) {
    it(`describes ${step.action}`, () => {
      expect(describeTablePlanStep(step)).toBe(line);
    });
  }
});

describe('buildTablePlanRequest', () => {
  it('takes a 20-row sample, cuts cells to 100 chars, and reports the real row count', () => {
    const grid: TableGrid = {
      rows: Array.from({ length: 25 }, (_, index) => [`row ${index}`, 'x'.repeat(150)]),
      columns: ['A', 'B'],
      cellStyles: {},
    };
    const request = buildTablePlanRequest(grid, 'do something');
    expect(request.command).toBe('do something');
    expect(request.sampleRows).toHaveLength(TABLE_PLAN_SAMPLE_ROWS);
    expect(request.sampleRows[0][1]).toHaveLength(TABLE_PLAN_SAMPLE_CELL_CHARS);
    expect(request.rowCount).toBe(25);
  });
});
