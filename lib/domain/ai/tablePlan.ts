/**
 * "Edit table with AI": a plain command becomes a CHECKED PLAN of our own table
 * actions, run on a draft before anything is applied.
 *
 * WHY A PLAN OF FIXED ACTIONS. Letting a model call whatever it likes, or write
 * straight to the table, is how a feature like this becomes untrustworthy. Here
 * the model may only ask for steps from a list we define, every step is one of
 * the tested PURE functions in `tableStructure`/`tableNumbers`, and the result
 * is a draft the user reads before Apply. The model never computes a number:
 * totals and averages come from `setSummary`, which the code computes.
 *
 * COLUMNS ARE NAMED BY TITLE, ROWS BY CONDITION. A title is unique
 * (`renameColumn` enforces it), so a step that adds or renames a column cannot
 * change what a later step means. No step takes a row index, so the model never
 * needs to see every row -- it is shown a sample.
 *
 * NO PARTIAL PLANS. One bad step rejects the whole plan: dropping a step could
 * silently change what the command asked for.
 */

import { z } from 'zod';

import {
  deleteColumn,
  deleteRowsWhere,
  insertColumn,
  normalizeColumnSummaries,
  renameColumn,
  replaceInTable,
  setColumnStyle,
  sortRowsByColumn,
  type TableGrid,
} from '@/lib/domain/canvas/tableStructure';
import type { ColumnSummary } from '@/lib/domain/canvas/tableNumbers';

/** How many steps one plan may carry. */
export const TABLE_PLAN_MAX_STEPS = 8;
/** How long the user's command may be. */
export const TABLE_PLAN_MAX_COMMAND_CHARS = 300;
/** How many sample rows are shown to the model. */
export const TABLE_PLAN_SAMPLE_ROWS = 20;
/** How much of one cell is shown to the model. */
export const TABLE_PLAN_SAMPLE_CELL_CHARS = 100;
/** How many columns a table may show the model. */
export const TABLE_PLAN_MAX_COLUMNS = 50;

/**
 * ONE description of every action and its fields, used by the route's prompt.
 *
 * The prompt and the schema cannot drift apart because both are written against
 * this text: a new action has to appear here to be usable.
 */
export const TABLE_PLAN_ACTIONS_PROMPT = [
  '- sortRows: { action: "sortRows", column: <title>, direction: "asc" | "desc" }',
  '- setSummary: { action: "setSummary", column: <title>, summary: "sum" | "average" | "count" | "min" | "max" | "none" }',
  '- replaceText: { action: "replaceText", find: <text>, replace: <text>, matchCase?: boolean, wholeCell?: boolean, column?: <title> }',
  '- deleteRowsWhere: { action: "deleteRowsWhere", column: <title>, test: "empty" | "equals" | "contains", value?: <text> }',
  '- deleteEmptyRows: { action: "deleteEmptyRows" }',
  '- insertColumn: { action: "insertColumn", title: <title>, after?: <title> }',
  '- renameColumn: { action: "renameColumn", column: <title>, title: <title> }',
  '- deleteColumn: { action: "deleteColumn", column: <title> }',
  '- styleColumn: { action: "styleColumn", column: <title>, bold?: boolean, align?: "left" | "center" | "right", bg?: <#rrggbb> }',
].join('\n');

/** A title string, trimmed, 1 to 60 characters. */
const titleSchema = z.string().trim().min(1).max(60);
/** A string value at most 200 characters. */
const text200 = z.string().max(200);
const bgSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const summaryKindSchema = z.enum(['sum', 'average', 'count', 'min', 'max']);

const deleteRowsWhereSchema = z
  .object({
    action: z.literal('deleteRowsWhere'),
    column: titleSchema,
    test: z.enum(['empty', 'equals', 'contains']),
    value: text200.optional(),
  })
  .strict()
  .superRefine((step, ctx) => {
    const needsValue = step.test === 'equals' || step.test === 'contains';
    if (needsValue && step.value === undefined) {
      ctx.addIssue({ code: 'custom', message: 'value is required for equals and contains', path: ['value'] });
    }
    if (step.test === 'empty' && step.value !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'value is not allowed for empty', path: ['value'] });
    }
  });

export const tablePlanSchema = z
  .object({
    message: z.string().max(200),
    steps: z.array(z.discriminatedUnion('action', [
      z.object({
        action: z.literal('sortRows'),
        column: titleSchema,
        direction: z.enum(['asc', 'desc']),
      }).strict(),
      z.object({
        action: z.literal('setSummary'),
        column: titleSchema,
        summary: z.union([summaryKindSchema, z.literal('none')]),
      }).strict(),
      z.object({
        action: z.literal('replaceText'),
        find: z.string().min(1).max(200),
        replace: text200,
        matchCase: z.boolean().optional(),
        wholeCell: z.boolean().optional(),
        column: titleSchema.optional(),
      }).strict(),
      deleteRowsWhereSchema,
      z.object({ action: z.literal('deleteEmptyRows') }).strict(),
      z.object({
        action: z.literal('insertColumn'),
        title: titleSchema,
        after: titleSchema.optional(),
      }).strict(),
      z.object({
        action: z.literal('renameColumn'),
        column: titleSchema,
        title: titleSchema,
      }).strict(),
      z.object({
        action: z.literal('deleteColumn'),
        column: titleSchema,
      }).strict(),
      z.object({
        action: z.literal('styleColumn'),
        column: titleSchema,
        bold: z.boolean().optional(),
        align: z.enum(['left', 'center', 'right']).optional(),
        bg: bgSchema.optional(),
      }).strict(),
    ])).max(TABLE_PLAN_MAX_STEPS),
  })
  .strict();

export type TablePlanStep =
  | { action: 'sortRows'; column: string; direction: 'asc' | 'desc' }
  | {
      action: 'setSummary';
      column: string;
      summary: ColumnSummary | 'none';
    }
  | {
      action: 'replaceText';
      find: string;
      replace: string;
      matchCase?: boolean;
      wholeCell?: boolean;
      column?: string;
    }
  | {
      action: 'deleteRowsWhere';
      column: string;
      test: 'empty' | 'equals' | 'contains';
      value?: string;
    }
  | { action: 'deleteEmptyRows' }
  | { action: 'insertColumn'; title: string; after?: string }
  | { action: 'renameColumn'; column: string; title: string }
  | { action: 'deleteColumn'; column: string }
  | {
      action: 'styleColumn';
      column: string;
      bold?: boolean;
      align?: 'left' | 'center' | 'right';
      bg?: string;
    };

export interface TablePlan {
  readonly message: string;
  readonly steps: readonly TablePlanStep[];
}

/**
 * The model's answer as a plan, or `null` when it cannot be used.
 *
 * Accepts ONE JSON object even inside a ```json fence or surrounded by prose,
 * then checks it against `tablePlanSchema`. Anything invalid -- prose, a broken
 * body, a step we do not know, an extra field, nine steps -- yields `null`.
 * There is no partial plan: one bad step rejects the whole thing.
 */
export function parseTablePlanResponse(raw: string): TablePlan | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;

  const body = extractJsonObject(raw);
  if (body === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  const result = tablePlanSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data as TablePlan;
}

/** The outermost `{...}`, with a ```json fence removed first. */
function extractJsonObject(raw: string): string | null {
  const unfenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return unfenced.slice(start, end + 1);
}

export interface TablePlanApplied {
  readonly grid: TableGrid;
}

export interface TablePlanError {
  readonly error: string;
  readonly stepIndex: number;
}

/** A title matched case-insensitively and trimmed, at the CURRENT step. */
function findColumnIndex(columns: readonly string[], title: string): number {
  const wanted = title.trim().toLowerCase();
  return columns.findIndex((name) => name.trim().toLowerCase() === wanted);
}

/**
 * Run the plan's steps IN ORDER on a copy, each through a pure function, and
 * return the draft -- or the first step's error and where it happened.
 *
 * NEVER MUTATES the input. A title is resolved against the grid AS IT IS AT
 * THAT STEP, so a step may use a column an EARLIER step created or renamed.
 */
export function applyTablePlan(
  grid: TableGrid,
  steps: readonly TablePlanStep[],
): TablePlanApplied | TablePlanError {
  let current = grid;

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    const namedColumn = 'column' in step ? (step as { column: string }).column : undefined;
    const columnIndex = namedColumn === undefined ? -1 : findColumnIndex(current.columns, namedColumn);

    // Every step that names a column must resolve one.
    if (namedColumn !== undefined && columnIndex < 0) {
      return { error: `No column named "${namedColumn}"`, stepIndex };
    }

    switch (step.action) {
      case 'sortRows':
        current = sortRowsByColumn(current, columnIndex, step.direction);
        break;

      case 'setSummary': {
        const summaries = normalizeColumnSummaries(current.columnSummaries, current.columns.length);
        summaries[columnIndex] = step.summary === 'none' ? null : step.summary;
        current = { ...current, columnSummaries: summaries };
        break;
      }

      case 'replaceText': {
        const range = step.column === undefined
          ? undefined
          : {
              minRow: 0,
              maxRow: Math.max(0, current.rows.length - 1),
              minCol: columnIndex,
              maxCol: columnIndex,
            };
        const result = replaceInTable(current, {
          find: step.find,
          replace: step.replace,
          matchCase: step.matchCase,
          wholeCell: step.wholeCell,
          range,
        });
        current = result.grid;
        break;
      }

      case 'deleteRowsWhere':
      case 'deleteEmptyRows': {
        if (step.action === 'deleteEmptyRows') {
          current = deleteRowsWhere(current, (row) => row.every((cell) => cell.trim() === ''));
          break;
        }
        const test = step.test;
        const value = (step.value ?? '').trim().toLowerCase();
        current = deleteRowsWhere(current, (row) => {
          const cell = (row[columnIndex] ?? '').trim();
          if (test === 'empty') return cell === '';
          if (test === 'equals') return cell.toLowerCase() === value;
          return cell.toLowerCase().includes(value);
        });
        break;
      }

      case 'insertColumn': {
        const at = step.after === undefined
          ? current.columns.length
          : findColumnIndex(current.columns, step.after) + 1;
        if (step.after !== undefined && at === 0) {
          return { error: `No column named "${step.after}"`, stepIndex };
        }
        const inserted = insertColumn(current, at);
        const renamed = renameColumn(inserted, at, step.title);
        if ('error' in renamed) {
          return {
            error: renamed.error === 'duplicate'
              ? `A column named "${step.title}" already exists`
              : `Invalid column title "${step.title}"`,
            stepIndex,
          };
        }
        current = renamed.grid;
        break;
      }

      case 'renameColumn': {
        const renamed = renameColumn(current, columnIndex, step.title);
        if ('error' in renamed) {
          return {
            error: renamed.error === 'duplicate'
              ? `A column named "${step.title}" already exists`
              : `Invalid column title "${step.title}"`,
            stepIndex,
          };
        }
        current = renamed.grid;
        break;
      }

      case 'deleteColumn': {
        if (current.columns.length <= 1) {
          return { error: 'A table needs at least one column', stepIndex };
        }
        current = deleteColumn(current, columnIndex);
        break;
      }

      case 'styleColumn': {
        const patch: { bold?: boolean; align?: 'left' | 'center' | 'right'; bg?: string } = {};
        if (step.bold !== undefined) patch.bold = step.bold;
        if (step.align !== undefined) patch.align = step.align;
        if (step.bg !== undefined) patch.bg = step.bg;
        current = setColumnStyle(current, columnIndex, patch);
        break;
      }
    }
  }

  return { grid: current };
}

/** asc/desc as a phrase a person reads, for the preview line. */
const DIRECTION_PHRASE = {
  asc: 'A → Z / smallest first',
  desc: 'Z → A / largest first',
} as const;

const SUMMARY_PHRASE: Record<ColumnSummary | 'none', string> = {
  sum: 'the sum',
  average: 'the average',
  count: 'the count',
  min: 'the minimum',
  max: 'the maximum',
  none: 'no summary',
};

const TEST_PHRASE: Record<'empty' | 'equals' | 'contains', string> = {
  empty: 'is empty',
  equals: 'equals',
  contains: 'contains',
};

/**
 * ONE plain-English line per step, for the preview. Titles are quoted as the
 * step gives them; nothing here re-derives or normalizes a value.
 */
export function describeTablePlanStep(step: TablePlanStep): string {
  switch (step.action) {
    case 'sortRows':
      return `Sort by "${step.column}", ${DIRECTION_PHRASE[step.direction]}`;
    case 'setSummary':
      return `Show ${SUMMARY_PHRASE[step.summary]} under "${step.column}"`;
    case 'replaceText':
      return `Replace "${step.find}" with "${step.replace}"${step.column ? ` in "${step.column}"` : ''}`;
    case 'deleteRowsWhere':
      return step.test === 'empty'
        ? `Delete rows where "${step.column}" is empty`
        : `Delete rows where "${step.column}" ${TEST_PHRASE[step.test]} "${step.value ?? ''}"`;
    case 'deleteEmptyRows':
      return 'Delete empty rows';
    case 'insertColumn':
      return step.after === undefined
        ? `Add column "${step.title}"`
        : `Add column "${step.title}" after "${step.after}"`;
    case 'renameColumn':
      return `Rename "${step.column}" to "${step.title}"`;
    case 'deleteColumn':
      return `Delete column "${step.column}"`;
    case 'styleColumn': {
      const parts: string[] = [];
      if (step.bold) parts.push('bold');
      if (step.align) parts.push(`${step.align}-aligned`);
      if (step.bg) parts.push(`background ${step.bg}`);
      return `Make "${step.column}" ${parts.length > 0 ? parts.join(', ') : 'styled'}`;
    }
  }
}

export interface TablePlanRequest {
  readonly command: string;
  readonly columns: readonly string[];
  readonly sampleRows: readonly (readonly string[])[];
  readonly rowCount: number;
}

/**
 * The body sent to the route. The model sees the shape of the data, not all of
 * it: the first 20 rows, each cell cut to 100 characters.
 */
export function buildTablePlanRequest(grid: TableGrid, command: string): TablePlanRequest {
  return {
    command,
    columns: grid.columns.slice(0, TABLE_PLAN_MAX_COLUMNS),
    sampleRows: grid.rows.slice(0, TABLE_PLAN_SAMPLE_ROWS).map((row) => (
      row.map((cell) => cell.slice(0, TABLE_PLAN_SAMPLE_CELL_CHARS))
    )),
    rowCount: grid.rows.length,
  };
}
