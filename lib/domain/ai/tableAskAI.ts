/**
 * Asking AI about the cells a table user has SELECTED.
 *
 * PURE, and in the domain layer because both halves have rules the UI must not
 * own: what text a selection becomes, and what instruction a preset means.
 *
 * The text is the cells under the COLUMN NAMES and 1-based row numbers the user
 * sees -- `Row 2: Item: Brakes | Value: pads` -- so the model is looking at the
 * same table the reader is, not at an anonymous grid. Empty cells and rows with
 * nothing in them are skipped, and the whole thing is capped at the quick-action
 * route's own selectedText limit, stopping at the last whole line so a value is
 * never cut in half.
 */

import { TEXT_ACTION_SELECTED_TEXT_MAX } from '@/lib/ai/textActions';

export type TableAskAIPreset = 'summarize' | 'explain' | 'translate' | 'question';

/** The grid, as much of it as this module needs to read. */
export interface TableAskAIGrid {
  readonly rows: readonly (readonly string[])[];
  readonly columns: readonly string[];
}

/** The editor's normalized selection: a single cell is a 1×1 range. */
export interface TableAskAIRange {
  readonly minRow: number;
  readonly maxRow: number;
  readonly minCol: number;
  readonly maxCol: number;
}

export interface TableAskAISelection {
  readonly text: string;
  /** True when a line was left out because the 4,000-character cap was reached. */
  readonly truncated: boolean;
}

/**
 * THE SELECTION AS TEXT, one line per selected row that has anything in it.
 *
 * Empty cells are skipped rather than sent as `Col: `, and a row with no text at
 * all contributes no line. When the cap would be crossed, the offending line and
 * every line after it are dropped (`truncated: true`) -- a value is never split.
 */
export function tableSelectionText(
  grid: TableAskAIGrid,
  range: TableAskAIRange,
): TableAskAISelection {
  const lines: string[] = [];

  for (let row = range.minRow; row <= range.maxRow; row += 1) {
    const cells = grid.rows[row] ?? [];
    const parts: string[] = [];
    for (let col = range.minCol; col <= range.maxCol; col += 1) {
      const value = (cells[col] ?? '').trim();
      if (value.length === 0) continue;
      parts.push(`${grid.columns[col] ?? ''}: ${value}`);
    }
    if (parts.length === 0) continue;
    lines.push(`Row ${row + 1}: ${parts.join(' | ')}`);
  }

  if (lines.length === 0) return { text: '', truncated: false };

  const kept: string[] = [];
  let length = 0;
  let truncated = false;
  for (const line of lines) {
    // A newline joins lines, but not before the first.
    const additional = (kept.length === 0 ? 0 : 1) + line.length;
    if (length + additional > TEXT_ACTION_SELECTED_TEXT_MAX) {
      truncated = true;
      break;
    }
    kept.push(line);
    length += additional;
  }

  return { text: kept.join('\n'), truncated };
}

/**
 * THE INSTRUCTION for one preset, sent as `instruction` to `/api/ai/text-action`.
 *
 * `detail` is the user's own Language or Question text; it is trimmed here so a
 * caller cannot send trailing whitespace into the prompt.
 */
export function tableAskAIInstruction(preset: TableAskAIPreset, detail?: string): string {
  const trimmed = (detail ?? '').trim();
  switch (preset) {
    case 'summarize':
      return 'Summarize these table cells in a few sentences.';
    case 'explain':
      return 'Explain what these table cells say, in plain language.';
    case 'translate':
      return `Translate these table cells into ${trimmed}. Keep the Row/column labels.`;
    case 'question':
      return `Answer this question using only these table cells: ${trimmed}`;
  }
}
