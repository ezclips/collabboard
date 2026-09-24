/**
 * Turning a document into a table: the model's answer, checked and made into a
 * grid the table editor can preview and apply.
 *
 * PURE, and in the domain layer for the same reason as the other AI modules: the
 * shape the model may return is a contract, the grid it becomes is a value, and
 * neither should depend on React. The model never writes the table -- it
 * proposes columns and rows, and every cell it filled is marked `aiFilled`.
 *
 * THE MODEL DOES NOT GET TO INVENT. Nothing here forces a value into an empty
 * cell: a row of the wrong length is refused outright (there is no partial
 * table), and the prompt's "leave it empty rather than invent" is what the
 * preview shows the user before they apply anything.
 */

import { z } from 'zod';

import { aiShortMessageSchema } from './aiShortMessage';

import { DEFAULT_COLUMN_WIDTH, type TableGrid } from '@/lib/domain/canvas/tableStructure';

/** How many columns a proposed table may have. */
export const TABLE_FROM_DOCUMENT_MAX_COLUMNS = 12;
/** How many rows a proposed table may have. */
export const TABLE_FROM_DOCUMENT_MAX_ROWS = 100;
/** How long one cell's text may be. */
export const TABLE_FROM_DOCUMENT_MAX_CELL_CHARS = 300;
/** How long the user's request may be. */
export const TABLE_FROM_DOCUMENT_MAX_REQUEST_CHARS = 300;
/** How many PDF pages one read may cover. */
export const TABLE_FROM_DOCUMENT_MAX_PAGES = 20;

const columnTitleSchema = z.string().trim().min(1).max(60);

export const tableFromDocumentSchema = z
  .object({
    message: aiShortMessageSchema,
    columns: z.array(columnTitleSchema).min(1).max(TABLE_FROM_DOCUMENT_MAX_COLUMNS),
    rows: z
      .array(z.array(z.string().max(TABLE_FROM_DOCUMENT_MAX_CELL_CHARS)))
      .max(TABLE_FROM_DOCUMENT_MAX_ROWS),
  })
  .strict()
  .superRefine((table, ctx) => {
    // Each row must line up with the columns: a short or long row would be
    // rendered against the wrong headers, which is worse than refusing it.
    table.rows.forEach((row, index) => {
      if (row.length !== table.columns.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'every row must have one cell per column',
          path: ['rows', index],
        });
      }
    });
    // Titles are matched by name everywhere downstream, so two that differ only
    // in case would be indistinguishable.
    const seen = new Set<string>();
    table.columns.forEach((title, index) => {
      const key = title.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', message: 'column titles must be unique', path: ['columns', index] });
      }
      seen.add(key);
    });
  });

export type TableFromDocumentTable = z.infer<typeof tableFromDocumentSchema>;

/**
 * The model's answer as a table, or `null` when it cannot be used.
 *
 * Accepts ONE JSON object even inside a ```json fence or surrounded by prose,
 * then checks it against `tableFromDocumentSchema`. Anything invalid yields
 * `null`; there is no partial table.
 */
export function parseTableFromDocumentResponse(raw: string): TableFromDocumentTable | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;

  const body = extractJsonObject(raw);
  if (body === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  const result = tableFromDocumentSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data;
}

/** The outermost `{...}`, with a ```json fence removed first. */
function extractJsonObject(raw: string): string | null {
  const unfenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return unfenced.slice(start, end + 1);
}

/**
 * The proposed table as a grid the editor can apply.
 *
 * EVERY non-empty cell is marked `aiFilled`, so the sparkle shows where the AI
 * wrote. Widths are the default for every column and no summaries are set (the
 * user can add them later). An empty table still gets ONE empty row -- this is
 * only called after the panel has handled the "nothing found" case, but the
 * grid it returns must always be valid.
 */
export function gridFromDocumentTable(table: TableFromDocumentTable): TableGrid {
  const columns = [...table.columns];
  const rows = table.rows.map((row) => [...row]);

  const cellStyles: Record<string, { aiFilled: true }> = {};
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell.trim().length > 0) cellStyles[`${r}-${c}`] = { aiFilled: true };
    });
  });

  return {
    rows: rows.length > 0 ? rows : [columns.map(() => '')],
    columns,
    cellStyles,
    columnWidths: columns.map(() => DEFAULT_COLUMN_WIDTH),
    columnSummaries: columns.map(() => null),
  };
}

/** What the read covered, for the preview's coverage line. */
export interface TableSourceCoverage {
  readonly pagesFrom?: number;
  readonly pagesTo?: number;
  readonly pageCount?: number;
  readonly charsRead?: number;
  readonly charsTotal?: number;
  readonly truncated: boolean;
}

export interface TableFromDocumentSource {
  readonly filename: string;
  readonly kind: 'pdf' | 'text';
  readonly coverage: TableSourceCoverage;
}

const thousands = (value: number): string => value.toLocaleString('en-US');

/**
 * ONE muted line saying what was read, so the user can judge the proposal
 * against how much of the source it saw.
 */
export function describeCoverage(source: TableFromDocumentSource): string {
  const { coverage } = source;
  if (source.kind === 'pdf') {
    const from = coverage.pagesFrom ?? 1;
    const to = coverage.pagesTo ?? from;
    const of = coverage.pageCount !== undefined ? ` of ${coverage.pageCount}` : '';
    const suffix = coverage.truncated ? ' (the rest of the range was too long)' : '';
    return from === to ? `Read page ${from}${of}${suffix}` : `Read pages ${from}–${to}${of}${suffix}`;
  }
  if (!coverage.truncated) return 'Read the whole transcript';
  return `Read the first ${thousands(coverage.charsRead ?? 0)} of ${thousands(coverage.charsTotal ?? 0)} characters`;
}
