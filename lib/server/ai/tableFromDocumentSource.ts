// "Table from a document" -- reading ONE board document's text safely.
//
// SERVER ONLY.
//
// The authorization is NOT re-implemented here. This module reuses the reads
// Board Chat already performs (`readDocument`, `readTextChunks`) on the
// CALLER'S own client, so RLS is the boundary and the same board scope applies:
// the document must sit on the route board and be `ready`, and an unknown kind
// is refused rather than guessed. There is no admin client anywhere on this path.
//
// What is NEW is only the PDF page RANGE: Chat reads a single page or a capped
// prefix, and this feature needs pages `from`..`to`. The small `gte`/`lte` query
// interface that needs is declared here rather than widening Chat's.

import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import {
  readDocument,
  readTextChunks,
  type BoardAiContextSupabaseClient,
} from './boardAiChatContext';
import { KNOWLEDGE_TEXT_KIND } from '../../domain/knowledge/knowledgeTextIngestion';
import { TABLE_FROM_DOCUMENT_MAX_PAGES } from '../../domain/ai/tableFromDocument';

/** How much source text one proposal may read. */
export const TABLE_SOURCE_MAX_CHARS = 40_000;
/** How far back to look for a clean cut point. */
const CUT_LOOKBACK_CHARS = 2_000;

/** A board-scoped query with the one operator Chat's interface lacks. */
interface RangeQuery<Row> extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  eq(column: string, value: unknown): RangeQuery<Row>;
  gte(column: string, value: unknown): RangeQuery<Row>;
  lte(column: string, value: unknown): RangeQuery<Row>;
  is(column: string, value: null): RangeQuery<Row>;
  in(column: string, values: readonly unknown[]): RangeQuery<Row>;
  order(column: string, options: { ascending: boolean }): RangeQuery<Row>;
  limit(count: number): RangeQuery<Row>;
  maybeSingle(): Promise<{ data: Row | null; error: unknown }>;
}

/**
 * The reads this reader performs. It is a SUPERSET of the client Chat's readers
 * accept, so the same caller's client is passed to both -- Chat's readers see a
 * `BoardAiContextSupabaseClient` through a cast, justified because every method
 * they use is present here.
 */
export interface TableSourceSupabaseClient {
  from(table: 'knowledge_documents' | 'knowledge_pages' | 'knowledge_chunks'): {
    select(columns: string): RangeQuery<Record<string, unknown>>;
  };
}

export interface TableSourceRange {
  readonly from: number;
  readonly to: number;
}

export interface TableSourceCoverage {
  readonly pagesFrom?: number;
  readonly pagesTo?: number;
  readonly pageCount?: number;
  readonly charsRead?: number;
  readonly charsTotal?: number;
  readonly truncated: boolean;
}

export interface TableSourceText {
  readonly filename: string;
  readonly kind: 'pdf' | 'text';
  readonly text: string;
  readonly coverage: TableSourceCoverage;
}

/**
 * Cut `text` at `max`, preferring a clean break near the end.
 *
 * The cut point is the LAST newline (or, for a paged source, page boundary) in
 * the final 2,000 characters of the kept prefix; failing that the hard limit is
 * used. A model handed a value cut mid-word can quietly turn the fragment into
 * a different fact, so a nearby boundary is worth losing a few characters for.
 */
function cutAtBudget(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const floor = Math.max(0, max - CUT_LOOKBACK_CHARS);
  const tail = text.slice(floor, max);
  const lastNewline = tail.lastIndexOf('\n');
  if (lastNewline >= 0) return { text: text.slice(0, floor + lastNewline), truncated: true };
  return { text: text.slice(0, max), truncated: true };
}

async function readPageCount(
  client: TableSourceSupabaseClient,
  boardId: string,
  documentId: string,
): Promise<number | null> {
  const { data, error } = await client
    .from('knowledge_documents')
    .select('page_count')
    .eq('id', documentId)
    .eq('board_id', boardId)
    .maybeSingle();
  if (error || !data) return null;
  const value = data.page_count;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The text of ONE board document, for building a table.
 *
 * CHECKS, IN ORDER, all through the caller's own client: the document is on this
 * board (no admin client, no re-implementation of authorization), it is ready,
 * and its kind is one of the two this feature reads -- `pdf` or `text`. A
 * pageless `text` source (a video transcript) reads its chunks; a `pdf` reads
 * the requested page range.
 */
export async function readTableSourceText(
  client: TableSourceSupabaseClient,
  boardId: string,
  documentId: string,
  range?: TableSourceRange,
): Promise<Result<TableSourceText, DomainError>> {
  const document = await readDocument(client as unknown as BoardAiContextSupabaseClient, boardId, documentId);
  if (!document.ok) return err(document.error);
  if (document.value === null) {
    return err(domainError('not_found', 'This document is not available'));
  }
  if (!document.value.ready) {
    return err(domainError('conflict', 'This document is still being processed'));
  }
  const kind = document.value.kind;
  if (kind !== 'pdf' && kind !== KNOWLEDGE_TEXT_KIND) {
    return err(domainError('validation', 'This kind of source cannot be read'));
  }

  if (kind === KNOWLEDGE_TEXT_KIND) {
    const chunks = await readTextChunks(client as unknown as BoardAiContextSupabaseClient, documentId);
    if (!chunks.ok) return err(chunks.error);
    if (chunks.value.length === 0) {
      return err(domainError('not_found', 'This document is not available'));
    }
    const full = chunks.value
      .slice()
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((chunk) => chunk.text)
      .join('');
    if (full.length === 0) {
      return err(domainError('not_found', 'This document is not available'));
    }
    const charsTotal = full.length;
    const { text, truncated } = cutAtBudget(full, TABLE_SOURCE_MAX_CHARS);
    return ok({
      filename: document.value.filename,
      kind: 'text',
      text,
      coverage: {
        charsRead: text.length,
        charsTotal,
        truncated,
      },
    });
  }

  // PDF. The default range is the first 20 pages.
  const from = range?.from ?? 1;
  const to = range?.to ?? TABLE_FROM_DOCUMENT_MAX_PAGES;
  if (to - from + 1 > TABLE_FROM_DOCUMENT_MAX_PAGES || from < 1 || to < from) {
    return err(domainError('validation', 'The page range is not valid'));
  }

  const { data, error } = await client
    .from('knowledge_pages')
    .select('page_number, text')
    .eq('document_id', documentId)
    .gte('page_number', from)
    .lte('page_number', to)
    .order('page_number', { ascending: true });
  if (error) return err(domainError('unavailable', 'Could not read the source pages'));

  const pages = (data ?? []).map((row) => ({
    pageNumber: Number(row.page_number),
    text: typeof row.text === 'string' ? row.text : '',
  }));
  if (pages.length === 0) {
    return err(domainError('not_found', 'This document is not available'));
  }

  // Every page keeps its marker, even an empty one, so the reader can see the
  // page WAS read. Pages are joined by a blank line.
  const full = pages.map((page) => `[page ${page.pageNumber}]\n${page.text}`).join('\n\n');
  const { text, truncated } = cutAtBudget(full, TABLE_SOURCE_MAX_CHARS);

  // `pagesTo` is the last page FULLY included: walk the markers in the kept
  // text and report the highest one it still contains whole.
  let pagesTo = pages[0].pageNumber;
  if (truncated) {
    for (const page of pages) {
      const marker = `[page ${page.pageNumber}]`;
      const start = text.indexOf(marker);
      if (start < 0) break;
      const pageLength = marker.length + 1 + page.text.length;
      if (start + pageLength > text.length) break;
      pagesTo = page.pageNumber;
    }
  } else {
    pagesTo = pages[pages.length - 1].pageNumber;
  }

  const declaredCount = await readPageCount(client, boardId, documentId);
  const pageCount = declaredCount ?? pages[pages.length - 1].pageNumber;

  return ok({
    filename: document.value.filename,
    kind: 'pdf',
    text,
    coverage: {
      pagesFrom: pages[0].pageNumber,
      pagesTo,
      pageCount,
      truncated,
    },
  });
}
