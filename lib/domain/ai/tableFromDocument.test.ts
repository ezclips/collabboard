import { describe, expect, it } from 'vitest';

import {
  describeCoverage,
  gridFromDocumentTable,
  parseTableFromDocumentResponse,
  TABLE_FROM_DOCUMENT_MAX_COLUMNS,
  TABLE_FROM_DOCUMENT_MAX_ROWS,
  tableFromDocumentSchema,
} from './tableFromDocument';
import { DEFAULT_COLUMN_WIDTH } from '@/lib/domain/canvas/tableStructure';

/**
 * THE MODEL NEVER WRITES THE TABLE. It proposes columns and rows; the schema is
 * what decides whether the proposal is usable, and `gridFromDocumentTable` is
 * the one place a proposal becomes a value the editor can apply.
 */

const VALID = {
  message: 'A parts list.',
  columns: ['Part', 'Number', 'Price'],
  rows: [['Brake pad', 'BR-01', '45 L'], ['Filter', 'FL-02', '']],
};

describe('tableFromDocumentSchema', () => {
  it('accepts a valid table', () => {
    expect(tableFromDocumentSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts an empty rows array', () => {
    expect(tableFromDocumentSchema.safeParse({ ...VALID, rows: [] }).success).toBe(true);
  });

  it(`rejects ${TABLE_FROM_DOCUMENT_MAX_COLUMNS + 1} columns`, () => {
    const columns = Array.from({ length: TABLE_FROM_DOCUMENT_MAX_COLUMNS + 1 }, (_, i) => `C${i}`);
    expect(tableFromDocumentSchema.safeParse({ message: '', columns, rows: [] }).success).toBe(false);
  });

  it(`rejects ${TABLE_FROM_DOCUMENT_MAX_ROWS + 1} rows`, () => {
    const rows = Array.from({ length: TABLE_FROM_DOCUMENT_MAX_ROWS + 1 }, () => ['a', 'b', 'c']);
    expect(tableFromDocumentSchema.safeParse({ ...VALID, rows }).success).toBe(false);
  });

  it('rejects a row of the wrong length', () => {
    expect(tableFromDocumentSchema.safeParse({ ...VALID, rows: [['a', 'b']] }).success).toBe(false);
  });

  it('rejects duplicate titles in a different case', () => {
    expect(tableFromDocumentSchema.safeParse({
      ...VALID,
      columns: ['Part', 'part', 'Price'],
      rows: [['a', 'b', 'c']],
    }).success).toBe(false);
  });

  it('rejects an extra key', () => {
    expect(tableFromDocumentSchema.safeParse({ ...VALID, extra: true }).success).toBe(false);
  });

  it('rejects a 301-char cell', () => {
    expect(tableFromDocumentSchema.safeParse({
      ...VALID,
      rows: [['x'.repeat(301), 'b', 'c']],
    }).success).toBe(false);
  });

  it('rejects a message over 200 chars', () => {
    expect(tableFromDocumentSchema.safeParse({ ...VALID, message: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('parseTableFromDocumentResponse', () => {
  it('accepts a bare object', () => {
    expect(parseTableFromDocumentResponse(JSON.stringify(VALID))?.columns).toEqual(VALID.columns);
  });

  it('accepts a fenced object', () => {
    expect(parseTableFromDocumentResponse('```json\n' + JSON.stringify(VALID) + '\n```')).not.toBeNull();
  });

  it('accepts an object surrounded by prose', () => {
    expect(parseTableFromDocumentResponse(`Here you go: ${JSON.stringify(VALID)} Done.`)).not.toBeNull();
  });

  it('returns null for garbage', () => {
    expect(parseTableFromDocumentResponse('I cannot do that.')).toBeNull();
    expect(parseTableFromDocumentResponse('')).toBeNull();
    expect(parseTableFromDocumentResponse('{ broken')).toBeNull();
  });

  it('returns null when the table is invalid', () => {
    expect(parseTableFromDocumentResponse(JSON.stringify({ ...VALID, rows: [['only-one']] }))).toBeNull();
  });
});

describe('gridFromDocumentTable', () => {
  it('marks aiFilled only on non-empty cells', () => {
    const grid = gridFromDocumentTable(tableFromDocumentSchema.parse(VALID));
    expect(grid.cellStyles['0-0']).toEqual({ aiFilled: true });
    expect(grid.cellStyles['0-2']).toEqual({ aiFilled: true });
    // The empty Price on row 1 gets no style.
    expect(grid.cellStyles['1-2']).toBeUndefined();
  });

  it('gives every column the default width and no summaries', () => {
    const grid = gridFromDocumentTable(tableFromDocumentSchema.parse(VALID));
    expect(grid.columnWidths).toEqual([DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH]);
    expect(grid.columnSummaries).toEqual([null, null, null]);
  });

  it('returns one empty row for an empty table', () => {
    const grid = gridFromDocumentTable(tableFromDocumentSchema.parse({ ...VALID, rows: [] }));
    expect(grid.rows).toEqual([['', '', '']]);
    expect(grid.cellStyles).toEqual({});
  });
});

describe('describeCoverage', () => {
  it('says "page" for a single page', () => {
    expect(describeCoverage({ kind: 'pdf', coverage: { pagesFrom: 1, pagesTo: 1, pageCount: 1, truncated: false } } as never)).toBe('Read page 1 of 1');
  });

  it('says PDF pages when not cut', () => {
    expect(describeCoverage({
      filename: 'manual.pdf',
      kind: 'pdf',
      coverage: { pagesFrom: 3, pagesTo: 12, pageCount: 64, truncated: false },
    })).toBe('Read pages 3–12 of 64');
  });

  it('says the range was too long when cut', () => {
    expect(describeCoverage({
      filename: 'manual.pdf',
      kind: 'pdf',
      coverage: { pagesFrom: 3, pagesTo: 9, pageCount: 64, truncated: true },
    })).toBe('Read pages 3–9 of 64 (the rest of the range was too long)');
  });

  it('says the whole transcript when not cut', () => {
    expect(describeCoverage({
      filename: 'video.txt',
      kind: 'text',
      coverage: { truncated: false },
    })).toBe('Read the whole transcript');
  });

  it('says how much of the transcript when cut, with thousands separators', () => {
    expect(describeCoverage({
      filename: 'video.txt',
      kind: 'text',
      coverage: { charsRead: 40000, charsTotal: 95210, truncated: true },
    })).toBe('Read the first 40,000 of 95,210 characters');
  });
});
