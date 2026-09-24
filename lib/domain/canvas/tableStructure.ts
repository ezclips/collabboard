/**
 * Pure structure changes for a table post.
 *
 * WHY THIS EXISTS. The editor used to change `rows`/`columns` and leave
 * `cellStyles` alone, and `cellStyles` is keyed by POSITION (`"row-col"`). So
 * inserting a row above a coloured cell left the colour on the old position:
 * it landed on the wrong cell. Fixing that in six handlers by hand is how a
 * seventh is missed, so every structural change goes through one function here,
 * which moves text, columns and styles TOGETHER.
 *
 * EVERY function returns a NEW grid and mutates nothing: the arrays and the
 * style record are rebuilt, and the input is never touched. The editor holds
 * three `useState`s and applies one result to all three.
 *
 * STYLE KEYS ARE VALIDATED, NOT TRUSTED. A key that is not two non-negative
 * integers, or that points outside the grid, is DROPPED rather than shifted.
 * Such a key is unreachable through the UI, but shifting it would move a style
 * to an unrelated cell, which is the class of bug this module exists to end.
 */

export type TableCellStyle = {
  bg?: string;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  /**
   * PATCH-169. Text size for a single-line cell. ABSENT is normal text, so
   * existing tables are unchanged and a `normal` value is never stored.
   */
  size?: 'h1' | 'h2' | 'small';
};

export type TableGrid = {
  readonly rows: readonly (readonly string[])[];
  readonly columns: readonly string[];
  /** Keyed `${row}-${col}`. */
  readonly cellStyles: Readonly<Record<string, TableCellStyle>>;
};

/** A parsed, in-range style key. */
interface StyleEntry {
  readonly row: number;
  readonly col: number;
  readonly style: TableCellStyle;
}

/**
 * The usable style entries of a grid, sorted by row then column so a shift is
 * applied to a stable sequence.
 *
 * A key that does not parse, or that points outside the grid, is dropped here
 * and therefore by every function below.
 */
function styleEntries(grid: TableGrid): readonly StyleEntry[] {
  const entries: StyleEntry[] = [];
  for (const [key, style] of Object.entries(grid.cellStyles)) {
    const match = /^(\d+)-(\d+)$/.exec(key);
    if (!match) continue;
    const row = Number(match[1]);
    const col = Number(match[2]);
    // In-range, checked against the grid THIS call was given.
    if (row < 0 || row >= grid.rows.length) continue;
    if (col < 0 || col >= grid.columns.length) continue;
    entries.push({ row, col, style });
  }
  return entries.sort((a, b) => (a.row - b.row) || (a.col - b.col));
}

/** Rebuild `cellStyles` from a mapped entry list, dropping nothing else. */
function stylesFrom(entries: readonly StyleEntry[]): Record<string, TableCellStyle> {
  const styles: Record<string, TableCellStyle> = {};
  for (const entry of entries) styles[`${entry.row}-${entry.col}`] = entry.style;
  return styles;
}

/**
 * The first unused column name in A, B, …, Z, AA, AB, ….
 *
 * The editor used `String.fromCharCode(65 + columns.length)`, which duplicates
 * after a delete: A,B,C → delete B → add → A,C,C. This scans for an unused name
 * instead, so a name is never taken twice.
 */
export function nextColumnName(columns: readonly string[]): string {
  const used = new Set(columns);
  for (let index = 0; ; index += 1) {
    const name = columnNameAt(index);
    if (!used.has(name)) return name;
  }
}

/** 0 → A, 25 → Z, 26 → AA, … (bijective base 26). */
function columnNameAt(index: number): string {
  let value = index;
  let name = '';
  do {
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return name;
}

/** The grid with an empty row inserted at `at`; styles at rows ≥ at shift down. */
export function insertRow(grid: TableGrid, at: number): TableGrid {
  const position = Math.max(0, Math.min(at, grid.rows.length));
  const rows = [
    ...grid.rows.slice(0, position),
    grid.columns.map(() => ''),
    ...grid.rows.slice(position),
  ];
  const cellStyles = stylesFrom(styleEntries(grid).map((entry) => (
    entry.row >= position ? { ...entry, row: entry.row + 1 } : entry
  )));
  return { rows, columns: grid.columns, cellStyles };
}

/**
 * The grid without the row at `index`.
 *
 * NO-OP AT ONE ROW: it returns the SAME grid object unchanged, so a caller can
 * rely on identity. A table with no rows has nothing to render, and the menu
 * hides Delete rather than relying on this — but the function must not corrupt
 * a grid if it is reached anyway.
 */
export function deleteRow(grid: TableGrid, index: number): TableGrid {
  if (grid.rows.length <= 1) return grid;
  if (index < 0 || index >= grid.rows.length) return grid;
  const rows = grid.rows.filter((_, r) => r !== index);
  const cellStyles = stylesFrom(styleEntries(grid).flatMap((entry) => {
    if (entry.row === index) return [];
    return [entry.row > index ? { ...entry, row: entry.row - 1 } : entry];
  }));
  return { rows, columns: grid.columns, cellStyles };
}

/** The grid with row `index` copied (text AND styles) at `index + 1`. */
export function duplicateRow(grid: TableGrid, index: number): TableGrid {
  if (index < 0 || index >= grid.rows.length) return grid;
  const rows = [
    ...grid.rows.slice(0, index + 1),
    [...grid.rows[index]],
    ...grid.rows.slice(index + 1),
  ];
  const cellStyles = stylesFrom(styleEntries(grid).flatMap((entry) => {
    if (entry.row === index) {
      // BOTH copies: the original stays, and its copy lands one row below.
      return [entry, { ...entry, row: entry.row + 1 }];
    }
    return [entry.row > index ? { ...entry, row: entry.row + 1 } : entry];
  }));
  return { rows, columns: grid.columns, cellStyles };
}

/** The grid with row `index` emptied. STYLES ARE KEPT. */
export function clearRow(grid: TableGrid, index: number): TableGrid {
  if (index < 0 || index >= grid.rows.length) return grid;
  const rows = grid.rows.map((row, r) => (r === index ? row.map(() => '') : row));
  return { rows, columns: grid.columns, cellStyles: { ...grid.cellStyles } };
}

/** The grid with an empty column inserted at `at`, named `nextColumnName`. */
export function insertColumn(grid: TableGrid, at: number): TableGrid {
  const position = Math.max(0, Math.min(at, grid.columns.length));
  const columns = [
    ...grid.columns.slice(0, position),
    nextColumnName(grid.columns),
    ...grid.columns.slice(position),
  ];
  const rows = grid.rows.map((row) => [
    ...row.slice(0, position),
    '',
    ...row.slice(position),
  ]);
  const cellStyles = stylesFrom(styleEntries(grid).map((entry) => (
    entry.col >= position ? { ...entry, col: entry.col + 1 } : entry
  )));
  return { rows, columns, cellStyles };
}

/** Mirror of deleteRow: no-op at one column. */
export function deleteColumn(grid: TableGrid, index: number): TableGrid {
  if (grid.columns.length <= 1) return grid;
  if (index < 0 || index >= grid.columns.length) return grid;
  const columns = grid.columns.filter((_, c) => c !== index);
  const rows = grid.rows.map((row) => row.filter((_, c) => c !== index));
  const cellStyles = stylesFrom(styleEntries(grid).flatMap((entry) => {
    if (entry.col === index) return [];
    return [entry.col > index ? { ...entry, col: entry.col - 1 } : entry];
  }));
  return { rows, columns, cellStyles };
}

/** Mirror of duplicateRow: the copy gets `nextColumnName`. */
export function duplicateColumn(grid: TableGrid, index: number): TableGrid {
  if (index < 0 || index >= grid.columns.length) return grid;
  const columns = [
    ...grid.columns.slice(0, index + 1),
    nextColumnName(grid.columns),
    ...grid.columns.slice(index + 1),
  ];
  const rows = grid.rows.map((row) => [
    ...row.slice(0, index + 1),
    row[index] ?? '',
    ...row.slice(index + 1),
  ]);
  const cellStyles = stylesFrom(styleEntries(grid).flatMap((entry) => {
    if (entry.col === index) {
      return [entry, { ...entry, col: entry.col + 1 }];
    }
    return [entry.col > index ? { ...entry, col: entry.col + 1 } : entry];
  }));
  return { rows, columns, cellStyles };
}

/** Mirror of clearRow: text cleared, styles kept. */
export function clearColumn(grid: TableGrid, index: number): TableGrid {
  if (index < 0 || index >= grid.columns.length) return grid;
  const rows = grid.rows.map((row) => row.map((cell, c) => (c === index ? '' : cell)));
  return { rows, columns: grid.columns, cellStyles: { ...grid.cellStyles } };
}

/**
 * Merge `patch` into every cell style of a row.
 *
 * A patch value of `undefined` REMOVES that key, so 'None' can clear a colour
 * rather than set it to the string "undefined". A cell whose style ends up
 * empty is removed from `cellStyles` entirely, so the record does not
 * accumulate `{}` entries.
 */
export function setRowStyle(grid: TableGrid, index: number, patch: Partial<TableCellStyle>): TableGrid {
  if (index < 0 || index >= grid.rows.length) return grid;
  const next: Record<string, TableCellStyle> = { ...grid.cellStyles };
  for (let col = 0; col < grid.columns.length; col += 1) {
    mergeStyleAt(next, index, col, patch);
  }
  return { rows: grid.rows, columns: grid.columns, cellStyles: next };
}

/** Mirror of setRowStyle across a column. */
export function setColumnStyle(grid: TableGrid, index: number, patch: Partial<TableCellStyle>): TableGrid {
  if (index < 0 || index >= grid.columns.length) return grid;
  const next: Record<string, TableCellStyle> = { ...grid.cellStyles };
  for (let row = 0; row < grid.rows.length; row += 1) {
    mergeStyleAt(next, row, index, patch);
  }
  return { rows: grid.rows, columns: grid.columns, cellStyles: next };
}

function mergeStyleAt(
  styles: Record<string, TableCellStyle>,
  row: number,
  col: number,
  patch: Partial<TableCellStyle>,
): void {
  const key = `${row}-${col}`;
  const merged: TableCellStyle = { ...styles[key] };
  for (const [name, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete (merged as Record<string, unknown>)[name];
      continue;
    }
    (merged as Record<string, unknown>)[name] = value;
  }
  if (Object.keys(merged).length === 0) {
    delete styles[key];
    return;
  }
  styles[key] = merged;
}
