import type { BoardId, KnowledgeDocumentId } from '../core/ids';

/**
 * P6J-F9-A0 -- what may become a rendered page derivative, and where it lives.
 *
 * Pure: no PDF.js, no canvas, no React, no DOM, no fetch, no Supabase, no
 * Storage client. Nothing here renders, uploads or mutates a document; it
 * decides eligibility and names paths, and the worker acts on that later.
 *
 * Derivatives are OPTIONAL ENHANCEMENT DATA. A document that is not eligible
 * still extracts, still becomes `ready`, and still reads as text -- skipping a
 * visual is never an ingestion failure.
 */

/** 50 MiB. Larger sources still extract; they simply get no page images. */
export const KNOWLEDGE_DERIVATIVE_MAX_SOURCE_BYTES = 52_428_800;

/** Pages beyond this are not rendered. Deletion still enumerates past it. */
export const KNOWLEDGE_DERIVATIVE_MAX_PAGES = 200;

export const KNOWLEDGE_DERIVATIVE_CONTENT_TYPE = 'image/webp';
export const KNOWLEDGE_DERIVATIVE_EXTENSION = 'webp';

export type KnowledgeDerivativeIneligibleReason =
  | 'invalid_source_size'
  | 'invalid_page_count'
  | 'source_too_large'
  | 'too_many_pages';

export type KnowledgeDerivativeEligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: KnowledgeDerivativeIneligibleReason };

export interface KnowledgeDerivativeEligibilityInput {
  readonly sourcePdfBytes: number;
  /** Null until extraction has counted the pages. */
  readonly pageCount: number | null;
}

const ELIGIBLE: KnowledgeDerivativeEligibility = { eligible: true };

function ineligible(reason: KnowledgeDerivativeIneligibleReason): KnowledgeDerivativeEligibility {
  return { eligible: false, reason };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Whether a document may have page derivatives generated for it.
 *
 * A pure verdict, never a throw and never a state change: an ordinary oversized
 * PDF is a normal answer here, not an error. Invalid inputs are reported
 * separately from exceeded thresholds so a caller can tell "too big" from
 * "nobody has counted the pages yet".
 */
export function knowledgeDerivativeEligibility(
  input: KnowledgeDerivativeEligibilityInput,
): KnowledgeDerivativeEligibility {
  const { sourcePdfBytes, pageCount } = input;
  if (!isNonNegativeInteger(sourcePdfBytes)) return ineligible('invalid_source_size');
  if (!isNonNegativeInteger(pageCount) || pageCount < 1) return ineligible('invalid_page_count');
  if (sourcePdfBytes > KNOWLEDGE_DERIVATIVE_MAX_SOURCE_BYTES) return ineligible('source_too_large');
  if (pageCount > KNOWLEDGE_DERIVATIVE_MAX_PAGES) return ineligible('too_many_pages');
  return ELIGIBLE;
}

/**
 * Board and document ids are Postgres `uuid` columns, so anything that is not
 * one is rejected outright rather than escaped or sanitised. Repairing a
 * crafted id into a valid-looking path is exactly how one document ends up
 * reading or deleting another's objects.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The deterministic derivative path, or null when it cannot be built.
 *
 * `knowledge/{boardId}/{documentId}/pages/{pageNumber}.webp` -- board-scoped,
 * document-scoped, 1-based, no random suffix, no signed URL, and never the
 * user's filename, which is display metadata and not an identity.
 */
export function knowledgePageDerivativePath(
  boardId: BoardId | string,
  documentId: KnowledgeDocumentId | string,
  pageNumber: number,
): string | null {
  if (typeof boardId !== 'string' || !UUID.test(boardId)) return null;
  if (typeof documentId !== 'string' || !UUID.test(documentId)) return null;
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  return `knowledge/${boardId}/${documentId}/pages/${pageNumber}.${KNOWLEDGE_DERIVATIVE_EXTENSION}`;
}

/**
 * Every derivative path a document could ever have, for cleanup.
 *
 * Deliberately NOT capped at KNOWLEDGE_DERIVATIVE_MAX_PAGES: eligibility is a
 * generation policy that may change, while deletion must still be able to
 * remove paths generated under an older one. Capping here would strand objects
 * the moment the limit moved.
 *
 * An unknown or unusable page count yields no paths -- deletion never guesses.
 */
export function knowledgePageDerivativePaths(
  boardId: BoardId | string,
  documentId: KnowledgeDocumentId | string,
  pageCount: number | null | undefined,
): readonly string[] {
  if (!isNonNegativeInteger(pageCount) || pageCount < 1) return [];
  const paths: string[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const path = knowledgePageDerivativePath(boardId, documentId, pageNumber);
    // One unbuildable path means the ids are untrustworthy; none are returned.
    if (path === null) return [];
    paths.push(path);
  }
  return paths;
}
