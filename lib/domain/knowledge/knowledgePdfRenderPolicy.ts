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

/**
 * The renderer's identity, and the ONE place it is written.
 *
 * It travels two ways from here: the worker records it when a render
 * completes, and the image route folds it into the HTTP validator. Bumping it
 * therefore does two useful things at once -- every cached page image stops
 * matching, and every requested document becomes a render candidate again --
 * so a genuine change in what a page looks like can never be served from a
 * stale cache. Duplicating the literal anywhere would break that link.
 */
export const KNOWLEDGE_PDF_RENDERER_VERSION = '1';

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
 * The HTTP validator for one rendered page.
 *
 * Built only from server-side identity: the source bytes' hash, the page
 * number, and the renderer version. No filename, no user input, no Storage
 * metadata -- so nothing a caller supplies can steer it, and it is a strong
 * ETag because those three values fully determine the bytes.
 *
 * Different bytes, a different page or a different renderer all produce a
 * different validator, which is the whole invalidation story: there is nothing
 * to purge, because the name changes.
 */
export function knowledgePageImageETag(
  contentSha256: string,
  pageNumber: number,
  rendererVersion: string = KNOWLEDGE_PDF_RENDERER_VERSION,
): string | null {
  if (typeof contentSha256 !== 'string' || !SHA256.test(contentSha256)) return null;
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  if (!VERSION.test(rendererVersion)) return null;
  return `"${contentSha256}:${pageNumber}:${rendererVersion}"`;
}

/**
 * The validator for one document's ready page list.
 *
 * The page set is derived from the same bytes the hash names, so the hash
 * alone already determines it; the page count travels with it because the same
 * read already has it and it makes a truncated or partially written extraction
 * visible as a different validator.
 */
export function knowledgePagesETag(
  contentSha256: string,
  pageCount: number | null,
): string | null {
  if (typeof contentSha256 !== 'string' || !SHA256.test(contentSha256)) return null;
  const pages = pageCount === null ? 'null' : String(pageCount);
  if (!/^(?:null|[0-9]{1,9})$/.test(pages)) return null;
  return `"${contentSha256}:pages:${pages}"`;
}

/**
 * Whether a conditional request already holds this exact representation.
 *
 * Handles the comma-separated list form and the weak-validator prefix, and
 * answers false for `*`: a wildcard means "if any representation exists",
 * which is a precondition question, not the cache revalidation this serves.
 */
export function knowledgeETagMatches(header: string | null, etag: string): boolean {
  if (!header || typeof etag !== 'string' || etag.length === 0) return false;
  return header
    .split(',')
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === etag || candidate === `W/${etag}`);
}

/**
 * Board and document ids are Postgres `uuid` columns, so anything that is not
 * one is rejected outright rather than escaped or sanitised. Repairing a
 * crafted id into a valid-looking path is exactly how one document ends up
 * reading or deleting another's objects.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Validator inputs are checked, never escaped: a bad one yields no ETag. */
const SHA256 = /^[0-9a-f]{64}$/i;
const VERSION = /^[0-9A-Za-z._-]{1,32}$/;

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
