/**
 * Filling a table column with AI: what to send, and what to accept back.
 *
 * PURE, and deliberately in the domain layer rather than in the editor, because
 * both halves have rules that must hold whatever the UI does:
 *
 *   - the ITEMS builder decides which rows are targets, what text each one
 *     sends, and how many fit in one request;
 *   - the PARSER decides which of the model's answers may be shown, and it
 *     never throws -- an unreadable answer is an empty result, not a failure.
 *
 * THE MODEL DOES NOT GET TO WRITE THE TABLE. Every value it returns becomes a
 * SUGGESTION the user reviews; nothing here touches a grid. `parseTableFillResponse`
 * additionally refuses any row the client did not ask about, so a model cannot
 * introduce a value for a cell nobody selected.
 */

/** The row/value pairs the model returns, filtered to what may be shown. */
export interface TableFillValue {
  readonly row: number;
  readonly value: string;
}

/** One item of the request body: which row, and the text to work from. */
export interface TableFillItem {
  readonly row: number;
  readonly input: string;
}

/** How many rows one request may cover. */
export const TABLE_FILL_MAX_ITEMS = 40;
/** How much text one row may send. */
export const TABLE_FILL_MAX_INPUT_CHARS = 1000;
/** How much text one request may carry in total. */
export const TABLE_FILL_MAX_TOTAL_CHARS = 12_000;
/** How long a suggested value may be. */
export const TABLE_FILL_MAX_VALUE_CHARS = 500;
/** How long a custom instruction may be. */
export const TABLE_FILL_MAX_INSTRUCTION_CHARS = 300;

export type TableFillSource = 'row' | number;

export interface TableFillGrid {
  readonly rows: readonly (readonly string[])[];
  readonly columns: readonly string[];
}

export interface TableFillItems {
  readonly items: readonly TableFillItem[];
  /** True when a row was left out because a limit was reached. */
  readonly skippedForLimit: boolean;
}

/**
 * WHAT TO SEND for one column.
 *
 * TARGET ROWS are the ones whose cell in the target column is empty -- or every
 * row when `replaceExisting` is on. A target whose INPUT is empty is then
 * skipped: there is nothing to work from, and asking the model to summarise
 * nothing would produce a value invented from nowhere.
 *
 * The input is `Name: value | Name: value` over the row's OTHER columns when
 * the source is the whole row, or that one column's text otherwise. Empty cells
 * are skipped in both cases.
 *
 * LIMITS ARE REPORTED, NOT SWALLOWED. A row dropped for the item cap or the
 * character cap sets `skippedForLimit`, so the panel can say so and a second
 * run -- which targets only the still-empty cells -- finishes the job.
 */
export function buildTableFillItems(
  grid: TableFillGrid,
  targetColumn: number,
  source: TableFillSource,
  replaceExisting: boolean,
): TableFillItems {
  if (targetColumn < 0 || targetColumn >= grid.columns.length) {
    return { items: [], skippedForLimit: false };
  }

  const items: TableFillItem[] = [];
  let totalChars = 0;
  let skippedForLimit = false;

  for (let row = 0; row < grid.rows.length; row += 1) {
    const cells = grid.rows[row] ?? [];
    const target = (cells[targetColumn] ?? '').trim();
    if (!replaceExisting && target.length > 0) continue;

    const input = source === 'row'
      ? wholeRowInput(grid, cells, targetColumn)
      : (cells[source] ?? '').trim();
    if (input.length === 0) continue;

    const bounded = input.slice(0, TABLE_FILL_MAX_INPUT_CHARS);
    if (items.length >= TABLE_FILL_MAX_ITEMS
      || totalChars + bounded.length > TABLE_FILL_MAX_TOTAL_CHARS) {
      // A LATER row was left out. Stop rather than skipping past it: rows are
      // filled top-down, so the ones already gathered are the ones the user
      // sees first.
      skippedForLimit = true;
      break;
    }

    items.push({ row, input: bounded });
    totalChars += bounded.length;
  }

  return { items, skippedForLimit };
}

/** `Name: value | Name: value`, skipping the target column and empty cells. */
function wholeRowInput(
  grid: TableFillGrid,
  cells: readonly string[],
  targetColumn: number,
): string {
  const parts: string[] = [];
  for (let col = 0; col < grid.columns.length; col += 1) {
    if (col === targetColumn) continue;
    const value = (cells[col] ?? '').trim();
    if (value.length === 0) continue;
    parts.push(`${grid.columns[col]}: ${value}`);
  }
  return parts.join(' | ');
}

/**
 * THE MODEL'S ANSWER, filtered to what may be shown.
 *
 * It never throws and never returns an error: prose, an apology, a broken JSON
 * body and an empty string all yield `[]`, which the panel renders as "no
 * suggestions came back".
 *
 * A fence around the JSON is stripped, the outermost object is taken, and every
 * entry is then checked against `requestedRows` -- a value for a row the client
 * did not ask about is DROPPED, so a model cannot propose one.
 */
export function parseTableFillResponse(
  raw: string,
  requestedRows: readonly number[],
): readonly TableFillValue[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];

  const body = extractJsonObject(raw);
  if (body === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const values = (parsed as { values?: unknown }).values;
  if (!Array.isArray(values)) return [];

  const allowed = new Set(requestedRows);
  const seen = new Set<number>();
  const out: TableFillValue[] = [];

  for (const entry of values) {
    if (!entry || typeof entry !== 'object') continue;
    const { row, value } = entry as { row?: unknown; value?: unknown };
    if (typeof row !== 'number' || !Number.isInteger(row)) continue;
    if (!allowed.has(row)) continue;
    if (seen.has(row)) continue; // first entry wins for a duplicated row
    if (typeof value !== 'string') continue;

    const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, TABLE_FILL_MAX_VALUE_CHARS);
    if (cleaned.length === 0) continue;

    seen.add(row);
    out.push({ row, value: cleaned });
  }

  return out;
}

/**
 * The outermost `{...}` of a string, with a ```json fence removed first.
 *
 * Taking the OUTERMOST braces rather than the first `{` to the last `}` is the
 * same thing when there is one object and the right thing when a preamble
 * happens to contain a brace.
 */
function extractJsonObject(raw: string): string | null {
  const unfenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return unfenced.slice(start, end + 1);
}

/**
 * Writing the accepted values into a grid: ONE pure update, styles untouched.
 *
 * Kept here beside the builder and parser so the three halves of the feature
 * are testable without React, and so the editor's Accept all has exactly one
 * place it can write text. Only the TARGET COLUMN changes; every other cell is
 * returned as it was.
 */
export function applyTableFillValues(
  grid: TableFillGrid,
  targetColumn: number,
  values: readonly TableFillValue[],
): readonly (readonly string[])[] {
  if (targetColumn < 0 || targetColumn >= grid.columns.length) return grid.rows;
  const byRow = new Map(values.map((entry) => [entry.row, entry.value]));
  return grid.rows.map((row, index) => {
    const value = byRow.get(index);
    if (value === undefined) return [...row];
    return row.map((cell, col) => (col === targetColumn ? value : cell));
  });
}
