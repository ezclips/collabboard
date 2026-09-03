/**
 * PDF-R1 -- derivative-only repair.
 *
 * The second lifecycle, and deliberately the smaller one. It exists because a
 * `ready` document that never got page images has no way back: rasterisation
 * is worker-only, and the extraction dispatcher cannot see a ready row on
 * purpose. So this claims its OWN lease, renders, uploads, and completes --
 * without reading or writing a single extraction field.
 *
 * What it must never do is the whole point of the module: no parser, no text,
 * no knowledge_pages, no processing_status. It downloads bytes that already
 * exist, hands them to the rasteriser that already exists, and writes to the
 * paths that already exist.
 */

import type { DomainError } from '../../lib/domain/core/errors';
import type { KnowledgeDocumentId } from '../../lib/domain/core/ids';
import type { Result } from '../../lib/domain/core/result';
import {
  KNOWLEDGE_DERIVATIVE_CONTENT_TYPE,
  KNOWLEDGE_PDF_RENDERER_VERSION,
  knowledgeDerivativeEligibility,
  knowledgePageDerivativePath,
} from '../../lib/domain/knowledge/knowledgePdfRenderPolicy';
import type { KnowledgeWorkerStorage } from './processKnowledgePdfDocument';
import { rasterizePdfPages } from './pdfPageRaster';

/** One year: the object is immutable for as long as its validator holds. */
const DERIVATIVE_CACHE_CONTROL = '31536000';

/** Long enough for a 200-page render, short enough that a crash frees it. */
export const KNOWLEDGE_RENDER_LEASE_TTL_SECONDS = 900;

/** Low-cardinality outcomes. Never a Storage message, never a path. */
export type KnowledgeRenderFailureReason =
  | 'ineligible' | 'download_failed' | 'raster_failed'
  | 'upload_failed' | 'upload_partial' | 'invalid_derivative_path';

export type KnowledgeRenderStatus =
  | 'completed' | 'not_claimed' | 'lease_lost' | 'failed';

export interface KnowledgeRenderClaim {
  readonly documentId: string;
  readonly boardId: string;
  readonly storagePath: string;
  readonly pageCount: number | null;
  readonly leaseToken: string;
}

/**
 * The database half of the lifecycle. Every method maps to one of the
 * migration's functions, and none of them can reach an extraction column.
 */
export interface KnowledgeRenderLifecycleRepository {
  listRenderCandidates(
    rendererVersion: string,
    limit: number,
  ): Promise<Result<readonly KnowledgeDocumentId[], DomainError>>;
  claimRender(
    documentId: KnowledgeDocumentId,
    rendererVersion: string,
    leaseTtlSeconds: number,
  ): Promise<Result<KnowledgeRenderClaim | null, DomainError>>;
  completeRender(
    documentId: KnowledgeDocumentId,
    leaseToken: string,
    rendererVersion: string,
  ): Promise<Result<boolean, DomainError>>;
  failRender(
    documentId: KnowledgeDocumentId,
    leaseToken: string,
    reason: KnowledgeRenderFailureReason,
  ): Promise<Result<boolean, DomainError>>;
}

export interface KnowledgeRenderDependencies {
  readonly lifecycle: KnowledgeRenderLifecycleRepository;
  readonly storage: KnowledgeWorkerStorage;
  /** Test seam only. Production leaves this unset and gets the real rasteriser. */
  readonly rasterizePages?: typeof rasterizePdfPages;
  readonly log?: (event: Record<string, unknown>) => void;
}

export interface KnowledgeRenderResult {
  readonly documentId: string;
  readonly status: KnowledgeRenderStatus;
  readonly rendered: number;
  readonly reason?: KnowledgeRenderFailureReason;
}

/**
 * Render one claimed document's pages, or say why not.
 *
 * Split out from the claim so the rendering itself is testable without a
 * database, and so the failure vocabulary is decided in one place.
 */
async function renderClaimedPages(
  deps: KnowledgeRenderDependencies,
  claim: KnowledgeRenderClaim,
): Promise<{ rendered: number; reason?: KnowledgeRenderFailureReason }> {
  let sourceBytes: Uint8Array;
  try {
    sourceBytes = await deps.storage.download(claim.storagePath);
  } catch {
    return { rendered: 0, reason: 'download_failed' };
  }

  // The same policy the original ingestion applied. A document that was
  // text-only by policy stays text-only: repair recovers missing work, it
  // does not raise limits.
  const eligibility = knowledgeDerivativeEligibility({
    sourcePdfBytes: sourceBytes.byteLength,
    pageCount: claim.pageCount,
  });
  if (!eligibility.eligible) return { rendered: 0, reason: 'ineligible' };

  const raster = await (deps.rasterizePages ?? rasterizePdfPages)(sourceBytes);
  if (raster.pages.length === 0) return { rendered: 0, reason: 'raster_failed' };

  let uploaded = 0;
  let unbuildablePath = false;
  // Sequential and page-local, exactly as ingestion does it: one bad page never
  // stops the rest, and bytes already written are never rolled back because the
  // next attempt upserts the same deterministic path.
  for (const page of raster.pages) {
    const objectPath = knowledgePageDerivativePath(claim.boardId, claim.documentId, page.pageNumber);
    if (objectPath === null) {
      unbuildablePath = true;
      continue;
    }
    try {
      await deps.storage.upload(objectPath, page.bytes, KNOWLEDGE_DERIVATIVE_CONTENT_TYPE, {
        upsert: true,
        cacheControl: DERIVATIVE_CACHE_CONTROL,
      });
      uploaded += 1;
    } catch {
      // Page-local; the next page is still attempted.
    }
  }

  if (unbuildablePath) return { rendered: uploaded, reason: 'invalid_derivative_path' };
  if (uploaded === 0) return { rendered: 0, reason: 'upload_failed' };
  // Completion means every page the rasteriser produced actually landed. A
  // partial result stays retryable rather than being recorded as done.
  if (uploaded < raster.pages.length) return { rendered: uploaded, reason: 'upload_partial' };
  return { rendered: uploaded };
}

/**
 * Claim one document, render it, and close the lease either way.
 *
 * `not_claimed` is an ordinary answer, not an error: another worker holds the
 * lease, or the request was already satisfied. Losing the lease mid-render is
 * likewise ordinary -- the winner's completion stands, and this one's bytes
 * were identical anyway.
 */
export async function repairKnowledgePageDerivatives(
  deps: KnowledgeRenderDependencies,
  documentId: KnowledgeDocumentId,
  rendererVersion: string = KNOWLEDGE_PDF_RENDERER_VERSION,
): Promise<KnowledgeRenderResult> {
  const claimed = await deps.lifecycle.claimRender(
    documentId, rendererVersion, KNOWLEDGE_RENDER_LEASE_TTL_SECONDS,
  );
  if (!claimed.ok || claimed.value === null) {
    return { documentId: String(documentId), status: 'not_claimed', rendered: 0 };
  }
  const claim = claimed.value;

  const { rendered, reason } = await renderClaimedPages(deps, claim);

  if (reason !== undefined) {
    const failed = await deps.lifecycle.failRender(documentId, claim.leaseToken, reason);
    deps.log?.({ documentId: claim.documentId, stage: 'page-derivative-repair', reason });
    return {
      documentId: claim.documentId,
      status: failed.ok && failed.value ? 'failed' : 'lease_lost',
      rendered,
      reason,
    };
  }

  const completed = await deps.lifecycle.completeRender(documentId, claim.leaseToken, rendererVersion);
  return {
    documentId: claim.documentId,
    status: completed.ok && completed.value ? 'completed' : 'lease_lost',
    rendered,
  };
}

/**
 * One bounded pass over the render queue.
 *
 * Bounded by the candidate RPC's own limit -- there is no Storage listing and
 * no scan of every ready document. A document only appears here because a
 * reader explicitly asked for it.
 */
export async function runKnowledgePageRenderPass(
  deps: KnowledgeRenderDependencies,
  limit: number,
  rendererVersion: string = KNOWLEDGE_PDF_RENDERER_VERSION,
): Promise<readonly KnowledgeRenderResult[]> {
  const candidates = await deps.lifecycle.listRenderCandidates(rendererVersion, limit);
  if (!candidates.ok) return [];
  const results: KnowledgeRenderResult[] = [];
  for (const documentId of candidates.value) {
    results.push(await repairKnowledgePageDerivatives(deps, documentId, rendererVersion));
  }
  return results;
}
