import type { BoardId, KnowledgeDocumentId } from '../core/ids';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';
import type { KnowledgeContentHasher } from './knowledgeIngestion';
import type { KnowledgeDocumentProcessingStatus } from './knowledgePersistence';
import type { KnowledgePdfExtractionResult } from './pdfExtraction';

/**
 * P5A -- Knowledge extraction lifecycle.
 *
 *   uploaded -> processing -> ready
 *   uploaded -> processing -> failed -> processing -> ...
 *
 * This file owns the rules; it does not own execution. There is no worker, no
 * queue, no parser and no runtime here -- P5A defines the contract a worker
 * must come through, so that a worker (an untrusted execution component with
 * privileged server access) can never invent application state of its own.
 * Postgres stays authoritative for identity, status, parser provenance, page
 * persistence and errors.
 */

/**
 * The only transitions V1 permits. `ready` is terminal on purpose: an
 * extraction result that has been committed is immutable, and reprocessing or
 * result versioning is a separate product decision, not a side effect of a
 * worker re-running.
 */
export const KNOWLEDGE_EXTRACTION_TRANSITIONS: Readonly<
  Record<KnowledgeDocumentProcessingStatus, readonly KnowledgeDocumentProcessingStatus[]>
> = {
  uploaded: ['processing'],
  processing: ['ready', 'failed'],
  ready: [],
  failed: ['processing'],
};

/** The statuses a worker is allowed to claim: a fresh upload, or a retry. */
export const KNOWLEDGE_CLAIMABLE_STATUSES: readonly KnowledgeDocumentProcessingStatus[] = [
  'uploaded',
  'failed',
];

/** Operational default; this is not a PDF upload or processing-size policy. */
export const DEFAULT_KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS = 300;

export function canTransitionKnowledgeStatus(
  from: KnowledgeDocumentProcessingStatus,
  to: KnowledgeDocumentProcessingStatus,
): boolean {
  return KNOWLEDGE_EXTRACTION_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Worker input contract
// ---------------------------------------------------------------------------

/**
 * Everything a worker needs and nothing more. Deliberately carries no user,
 * profile, board membership or filename data: the worker reads the original
 * PDF from the private bucket with server-side credentials and reports back.
 */
export interface KnowledgeExtractionJob {
  readonly documentId: KnowledgeDocumentId;
  readonly boardId: BoardId;
  readonly storagePath: string;
  readonly contentSha256: string;
  readonly leaseToken: string;
  readonly processingAttempt: number;
  readonly leaseExpiresAt: string;
}

export interface KnowledgeProcessingLease {
  readonly leaseToken: string;
  readonly processingAttempt: number;
  readonly leaseExpiresAt: string;
}

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------

/**
 * Authoritative page geometry, supplied alongside the extraction result.
 *
 * P2 established that OpenDataLoader does not report page width, height or
 * rotation, so geometry has to come from a separate source. A document
 * therefore cannot become `ready` without it -- citations resolve against
 * page boxes, and a silently defaulted A4 page would produce confidently
 * wrong highlight coordinates. There are no defaults in this file.
 */
export interface KnowledgePageGeometryInput {
  readonly pageNumber: number;
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly rotation?: number | null;
}

/** One `knowledge_pages` row, fully validated and ready to persist. */
export interface KnowledgeExtractionPageWrite {
  readonly pageNumber: number;
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly rotation: number | null;
  readonly text: string;
  readonly textHash: string | null;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Reject inconsistent worker output before anything is written.
 *
 * Checks, in order: at least one page; 1-based integer page numbers; no
 * duplicates; the declared page count matches the pages actually supplied;
 * geometry exists for every page and for no page that was not extracted.
 */
export function buildKnowledgeExtractionPages(
  extraction: KnowledgePdfExtractionResult,
  geometry: readonly KnowledgePageGeometryInput[],
): Result<readonly KnowledgeExtractionPageWrite[], DomainError> {
  const pages = extraction.pages;

  if (pages.length === 0) {
    return err(domainError('validation', 'Extraction produced no pages'));
  }

  for (const page of pages) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
      return err(
        domainError('validation', 'Extracted page numbers must be 1-based integers', {
          details: { pageNumber: page.pageNumber },
        }),
      );
    }
  }

  const pageNumbers = pages.map((page) => page.pageNumber);
  if (new Set(pageNumbers).size !== pageNumbers.length) {
    return err(domainError('validation', 'Extraction contains duplicate page numbers'));
  }

  if (extraction.document.pageCount !== pages.length) {
    return err(
      domainError('validation', 'Extraction page count does not match the extracted pages', {
        details: { declared: extraction.document.pageCount, extracted: pages.length },
      }),
    );
  }

  const geometryByPage = new Map<number, KnowledgePageGeometryInput>();
  for (const entry of geometry) {
    if (geometryByPage.has(entry.pageNumber)) {
      return err(
        domainError('validation', 'Page geometry contains duplicate page numbers', {
          details: { pageNumber: entry.pageNumber },
        }),
      );
    }
    geometryByPage.set(entry.pageNumber, entry);
  }

  if (geometryByPage.size !== pages.length) {
    return err(
      domainError('validation', 'Page geometry does not cover exactly the extracted pages', {
        details: { geometryPages: geometryByPage.size, extractedPages: pages.length },
      }),
    );
  }

  const writes: KnowledgeExtractionPageWrite[] = [];
  for (const page of pages) {
    const entry = geometryByPage.get(page.pageNumber);
    if (!entry) {
      return err(
        domainError('validation', 'Page geometry is missing for an extracted page', {
          details: { pageNumber: page.pageNumber },
        }),
      );
    }
    if (!isPositiveFinite(entry.widthPoints) || !isPositiveFinite(entry.heightPoints)) {
      return err(
        domainError('validation', 'Page geometry requires positive width and height', {
          details: { pageNumber: page.pageNumber },
        }),
      );
    }
    const rotation = entry.rotation ?? null;
    if (rotation !== null && !Number.isFinite(rotation)) {
      return err(
        domainError('validation', 'Page rotation must be a finite number', {
          details: { pageNumber: page.pageNumber },
        }),
      );
    }

    writes.push({
      pageNumber: page.pageNumber,
      widthPoints: entry.widthPoints,
      heightPoints: entry.heightPoints,
      rotation,
      text: page.text,
      textHash: null,
    });
  }

  writes.sort((a, b) => a.pageNumber - b.pageNumber);
  return ok(writes);
}

// ---------------------------------------------------------------------------
// Failure message sanitization
// ---------------------------------------------------------------------------

export const KNOWLEDGE_PROCESSING_ERROR_MAX_LENGTH = 500;

/**
 * `processing_error` is persisted and will eventually be shown to a user, so
 * it must never carry what a parser subprocess tends to emit: stack traces,
 * full command lines, environment dumps or credentials. Detailed diagnostics
 * belong in server logs, not in a database column.
 */
/**
 * Any NAME=VALUE / NAME: VALUE pair whose NAME contains a sensitive word.
 * The name is matched as a substring rather than a whole word on purpose:
 * real leaks look like `SUPABASE_SERVICE_ROLE_KEY=...` or `--api_key=...`,
 * where the telling word is glued to underscores and dashes.
 */
const SECRET_ASSIGNMENT =
  /([A-Za-z0-9_.-]*(?:key|token|secret|password|passwd|pwd|authorization|auth|apikey|service_role|bearer|credential)[A-Za-z0-9_.-]*)\s*[:=]\s*\S+/gi;
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;
const LONG_OPAQUE_TOKEN = /\b[A-Za-z0-9_-]{40,}\b/g;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

function rawMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

export function sanitizeKnowledgeProcessingError(error: unknown): string {
  // Only the first line survives: a stack trace's frames all live below it.
  const firstLine = rawMessage(error).split(/[\r\n]/, 1)[0] ?? '';

  const redacted = firstLine
    .replace(SECRET_ASSIGNMENT, (_match, name: string) => `${name}=[redacted]`)
    .replace(JWT_LIKE, '[redacted]')
    .replace(LONG_OPAQUE_TOKEN, '[redacted]')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (redacted.length === 0) return 'Extraction failed';
  return redacted.slice(0, KNOWLEDGE_PROCESSING_ERROR_MAX_LENGTH);
}

// ---------------------------------------------------------------------------
// Worker-facing port. The implementation lives in lib/infra.
// ---------------------------------------------------------------------------

export interface KnowledgeExtractionCompletion {
  readonly documentId: KnowledgeDocumentId;
  readonly leaseToken: string;
  readonly pageCount: number;
  readonly pages: readonly KnowledgeExtractionPageWrite[];
  readonly parserName: string;
  readonly parserVersion: string;
  readonly parserOptionsHash: string | null;
  /**
   * Supplied by the caller when a raw parser artifact was preserved. P5A
   * stores the path and never generates or uploads one.
   */
  readonly rawArtifactPath: string | null;
  /** When present, the commit is refused if document identity has changed. */
  readonly expectedContentSha256: string | null;
}

/**
 * The smallest boundary a worker needs. It has three operations and no way to
 * express anything else -- a worker cannot insert a document, change a board,
 * write chunks, or move a `ready` document.
 */
export interface KnowledgeExtractionRepository {
  /**
   * Atomically move `uploaded | failed -> processing` and clear any previous
   * error. Must be one conditional update, never a read followed by a write:
   * exactly one of two concurrent claims may succeed and the other must get a
   * deterministic conflict.
   */
  claim(documentId: KnowledgeDocumentId, leaseTtlSeconds: number): Promise<Result<KnowledgeExtractionJob, DomainError>>;
  /** Renew only the current, unexpired lease. */
  renew(
    documentId: KnowledgeDocumentId,
    leaseToken: string,
    leaseTtlSeconds: number,
  ): Promise<Result<KnowledgeProcessingLease, DomainError>>;
  /** Atomically replace pages and move `processing -> ready`, or change nothing. */
  complete(completion: KnowledgeExtractionCompletion): Promise<Result<void, DomainError>>;
  /** Move `processing -> failed` with an already-sanitized message. */
  fail(documentId: KnowledgeDocumentId, leaseToken: string, message: string): Promise<Result<void, DomainError>>;
}

export interface KnowledgeExtractionDeps {
  readonly repository: KnowledgeExtractionRepository;
  /** Reused from ingestion; used only to hash page text. */
  readonly hasher: KnowledgeContentHasher;
  readonly leaseTtlSeconds?: number;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/**
 * Begin processing. Returns the worker input contract on success; a
 * `conflict` when the document is already `processing` or is `ready` (which
 * is terminal), and `not_found` when it no longer exists.
 */
export async function claimKnowledgeDocumentForProcessing(
  deps: Pick<KnowledgeExtractionDeps, 'repository' | 'leaseTtlSeconds'>,
  documentId: KnowledgeDocumentId,
): Promise<Result<KnowledgeExtractionJob, DomainError>> {
  const leaseTtlSeconds = deps.leaseTtlSeconds ?? DEFAULT_KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS;
  if (!Number.isInteger(leaseTtlSeconds) || leaseTtlSeconds <= 0) {
    return err(domainError('validation', 'Processing lease TTL must be a positive integer'));
  }
  return deps.repository.claim(documentId, leaseTtlSeconds);
}

export async function renewKnowledgeProcessingLease(
  deps: Pick<KnowledgeExtractionDeps, 'repository' | 'leaseTtlSeconds'>,
  documentId: KnowledgeDocumentId,
  leaseToken: string,
): Promise<Result<KnowledgeProcessingLease, DomainError>> {
  const leaseTtlSeconds = deps.leaseTtlSeconds ?? DEFAULT_KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS;
  if (!Number.isInteger(leaseTtlSeconds) || leaseTtlSeconds <= 0) {
    return err(domainError('validation', 'Processing lease TTL must be a positive integer'));
  }
  return deps.repository.renew(documentId, leaseToken, leaseTtlSeconds);
}

export interface CompleteKnowledgeExtractionInput {
  readonly documentId: KnowledgeDocumentId;
  readonly processingLeaseToken: string;
  readonly extraction: KnowledgePdfExtractionResult;
  readonly geometry: readonly KnowledgePageGeometryInput[];
  readonly rawArtifactPath?: string | null;
}

export interface KnowledgeExtractionOutcome {
  readonly documentId: KnowledgeDocumentId;
  readonly pageCount: number;
}

/**
 * Commit a successful extraction.
 *
 * Everything the worker asserted is validated here first, so an inconsistent
 * result is rejected before it can reach the database at all. The persistence
 * step itself is a single transactional operation: either the pages and the
 * `ready` status both land, or neither does and the document stays
 * `processing` for the failure path to handle.
 */
export async function completeKnowledgeExtraction(
  deps: KnowledgeExtractionDeps,
  input: CompleteKnowledgeExtractionInput,
): Promise<Result<KnowledgeExtractionOutcome, DomainError>> {
  const built = buildKnowledgeExtractionPages(input.extraction, input.geometry);
  if (!built.ok) return built;

  const encoder = new TextEncoder();
  const pages: KnowledgeExtractionPageWrite[] = [];
  for (const page of built.value) {
    pages.push({ ...page, textHash: await deps.hasher.sha256(encoder.encode(page.text)) });
  }

  const committed = await deps.repository.complete({
    documentId: input.documentId,
    leaseToken: input.processingLeaseToken,
    pageCount: pages.length,
    pages,
    parserName: input.extraction.parser.name,
    parserVersion: input.extraction.parser.version,
    parserOptionsHash: input.extraction.parser.optionsHash ?? null,
    rawArtifactPath: input.rawArtifactPath ?? null,
    expectedContentSha256: input.extraction.document.contentSha256 ?? null,
  });
  if (!committed.ok) return committed;

  return ok({ documentId: input.documentId, pageCount: pages.length });
}

/**
 * Record a failed extraction. Only legal while the document is `processing`,
 * so a stale worker cannot fail a document that has since been retried,
 * completed or deleted.
 */
export async function failKnowledgeExtraction(
  deps: Pick<KnowledgeExtractionDeps, 'repository'>,
  documentId: KnowledgeDocumentId,
  leaseToken: string,
  error: unknown,
): Promise<Result<void, DomainError>> {
  return deps.repository.fail(documentId, leaseToken, sanitizeKnowledgeProcessingError(error));
}
