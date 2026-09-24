/**
 * Numbers in table cells, and the summaries built from them.
 *
 * PURE, and the ONLY place a table's numbers are computed. The coming "Ask the
 * table" AI will plan with these same functions, so a total is always the code's
 * answer, never the model's.
 *
 * THE PARSER IS DELIBERATELY SMALL. It accepts what a person types into a
 * spreadsheet cell -- `50`, `4.5 L`, `1,234.5`, `-3`, `12%`, `4,5 L` -- and
 * refuses anything else (empty, text first, two numbers). It never throws.
 */

export type ColumnSummary = 'sum' | 'average' | 'count' | 'min' | 'max';

export interface ParsedCellNumber {
  readonly value: number;
  /** Trailing non-numeric text, trimmed (may be empty). */
  readonly unit: string;
}

/** How long a trailing unit may be. */
const MAX_UNIT_CHARS = 12;

/**
 * The numeric token -> a number, or null when it is not a well-formed number.
 *
 * DECIMAL COMMA RULE (the owner's region writes `4,5`): a single comma with no
 * dot and 1-2 digits after it is a DECIMAL comma (`4,5` -> 4.5); every other
 * comma is a thousands separator (`1,234` -> 1234). Dots are always decimal
 * points, so `1,234.5` is 1234.5 (comma thousands, dot decimal). Anything with
 * two separators it cannot explain -- `1,2345`, `1.2.3` -- is null.
 */
function parseNumericToken(token: string): number | null {
  const hasDot = token.includes('.');
  const hasComma = token.includes(',');
  if (hasDot && hasComma) {
    if (!/^\d{1,3}(,\d{3})*\.\d+$/.test(token)) return null;
    return Number(token.replace(/,/g, ''));
  }
  if (hasDot) {
    if (!/^\d+(\.\d+)?$/.test(token)) return null;
    return Number(token);
  }
  if (hasComma) {
    // A single comma with 1-2 digits after is a decimal comma ...
    if (/^\d+,\d{1,2}$/.test(token)) return Number(token.replace(',', '.'));
    // ... otherwise it must be well-formed thousands separators.
    if (/^\d{1,3}(,\d{3})+$/.test(token)) return Number(token.replace(/,/g, ''));
    return null;
  }
  if (!/^\d+$/.test(token)) return null;
  return Number(token);
}

/**
 * A cell's text as a number plus its unit, or null when it does not parse.
 *
 * The leading sign is pulled off first, then the longest numeric prefix; the
 * remainder must be non-numeric (else it is "two numbers") and at most 12
 * characters.
 */
export function parseCellNumber(text: string): ParsedCellNumber | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  let body = trimmed;
  let sign = 1;
  if (body[0] === '+' || body[0] === '-') {
    sign = body[0] === '-' ? -1 : 1;
    body = body.slice(1);
  }

  const match = /^[0-9][0-9.,]*/.exec(body);
  if (!match) return null;
  const numeric = match[0];
  const unit = body.slice(numeric.length).trim();
  if (unit.length > MAX_UNIT_CHARS) return null;
  if (/[0-9]/.test(unit)) return null; // a second number, not a unit

  const value = parseNumericToken(numeric);
  if (value === null || !Number.isFinite(value)) return null;
  return { value: sign * value, unit };
}

export interface ColumnSummaryResult {
  /** Null when the kind needs numbers and none of the cells parsed. */
  readonly value: number | null;
  /** The shared unit, or '' when they disagree (or there are none). */
  readonly unit: string;
  /** How many cells the value was computed from. */
  readonly counted: number;
}

/**
 * Summarize one column's cells.
 *
 * `count` counts NON-EMPTY cells whatever they contain; the other kinds use only
 * the cells that parse and yield `value: null` when none do. `unit` is the
 * shared unit across the parsed cells, or '' when they disagree.
 */
export function summarizeColumn(texts: readonly string[], kind: ColumnSummary): ColumnSummaryResult {
  if (kind === 'count') {
    const count = texts.filter((text) => text.trim().length > 0).length;
    return { value: count, unit: '', counted: count };
  }

  const parsed = texts
    .map(parseCellNumber)
    .filter((entry): entry is ParsedCellNumber => entry !== null);
  const unit = parsed.length > 0 && parsed.every((entry) => entry.unit === parsed[0].unit)
    ? parsed[0].unit
    : '';
  if (parsed.length === 0) return { value: null, unit, counted: 0 };

  const values = parsed.map((entry) => entry.value);
  const value = kind === 'sum' ? values.reduce((sum, n) => sum + n, 0)
    : kind === 'average' ? values.reduce((sum, n) => sum + n, 0) / values.length
      : kind === 'min' ? Math.min(...values)
        : Math.max(...values);

  return { value, unit, counted: parsed.length };
}

const SUMMARY_LABELS: Record<ColumnSummary, string> = {
  sum: 'Sum',
  average: 'Average',
  count: 'Count',
  min: 'Min',
  max: 'Max',
};

/** Up to two decimals, trailing zeros dropped (`18.10` -> `18.1`). */
function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/** The footer text for one summary, e.g. `Sum 54.5 L`, `Average 18.17`, `Min —`. */
export function formatSummary(kind: ColumnSummary, result: ColumnSummaryResult): string {
  if (result.value === null) return `${SUMMARY_LABELS[kind]} —`;
  const number = formatNumber(result.value);
  return result.unit.length > 0
    ? `${SUMMARY_LABELS[kind]} ${number} ${result.unit}`
    : `${SUMMARY_LABELS[kind]} ${number}`;
}
