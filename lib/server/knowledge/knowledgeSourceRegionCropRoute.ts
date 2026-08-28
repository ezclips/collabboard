import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { asBoardId, asPostId } from '../../domain/core/ids';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import {
  isCanonicalPageRotation,
  normalizeStorableRegion,
  sourceRegionToDisplayRegion,
  type NormalizedPageRegion,
} from '../../domain/knowledge/knowledgePageRegionGeometry';
import { integerPixelCropBox } from '../../domain/knowledge/knowledgeRasterCropGeometry';
import {
  KNOWLEDGE_DERIVATIVE_CONTENT_TYPE,
  knowledgePageDerivativePath,
} from '../../domain/knowledge/knowledgePdfRenderPolicy';
import type { KnowledgeSourceReferenceValidationRepository } from '../../domain/knowledge/knowledgeSourceReferenceWrite';
import { SupabaseKnowledgeSourceReferenceValidationRepository, type KnowledgeSourceReferenceWriteSupabaseClient }
  from '../../infra/knowledge/knowledgeSourceReferenceWriteAdapters';
import { SupabaseKnowledgeSourceReferenceReader, type KnowledgeSourceReferenceSupabaseClient }
  from '../../infra/knowledge/knowledgeSourceReferenceAdapters';
import { KNOWLEDGE_STORAGE_BUCKET } from '../../infra/knowledge/knowledgeIngestionAdapters';
import { canReadBoardKnowledge, type KnowledgeBoardReadAuthorizationClient } from './knowledgeBoardReadAuthorization';

/**
 * P6J-F9-C1 -- reference-owned authenticated crop delivery. The browser
 * supplies board and reference identity ONLY; document, page, rotation,
 * region and raster are all server-resolved, so no crop query string exists.
 */

export interface KnowledgeSourceRegionCropRouteContext {
  readonly params: Promise<{ id: string; referenceId: string }>;
}

/** Region members stay `unknown`: the handler, not the adapter, decides what
 * a malformed persisted value means. */
export interface KnowledgeSourceRegionCropReferenceRow {
  readonly id: string;
  readonly targetPadletId: string;
  readonly sourceDocumentId: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly quoteText: string | null;
  readonly charStart: number | null;
  readonly charEnd: number | null;
  readonly regionX: unknown;
  readonly regionY: unknown;
  readonly regionWidth: unknown;
  readonly regionHeight: unknown;
}

export type KnowledgeSourceRegionCropDownload =
  | { readonly kind: 'ok'; readonly bytes: Uint8Array }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unavailable' };

export interface KnowledgeSourceRegionCropSession {
  readonly userId: string;
  readonly validation: Pick<
    KnowledgeSourceReferenceValidationRepository, 'findTargetPadlet' | 'findSourceDocument' | 'findPageGeometry'
  >;
  canReadBoard(boardId: string): Promise<boolean>;
  findReferenceById(id: string): Promise<KnowledgeSourceRegionCropReferenceRow | null>;
  /** R23: a card with more than one citation offers no single answer to crop. */
  countReferencesForTargetPadlet(targetPadletId: string): Promise<number>;
  downloadDerivative(objectPath: string): Promise<KnowledgeSourceRegionCropDownload>;
  cropToWebp(bytes: Uint8Array, displayRegion: NormalizedPageRegion): Promise<Uint8Array>;
}

export interface KnowledgeSourceRegionCropRouteDependencies {
  getAuthenticatedSession(): Promise<KnowledgeSourceRegionCropSession | null>;
}

const json = (error: string, status: number) => NextResponse.json({ error }, { status });
const unauthorized = () => json('Unauthorized', 401);
const forbidden = () => json('Forbidden', 403);
const notFound = () => json('Not found', 404);
const notReady = () => json('Knowledge document is not ready', 409);
const unavailable = () => json('Unavailable', 503);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;
const isUsablePoints = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** A thrown Result error and an infra throw both fail closed the same way. */
async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false };
  }
}

async function unwrap<T>(result: Result<T, DomainError>): Promise<T | null> {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export function createKnowledgeSourceRegionCropHandler(
  deps: KnowledgeSourceRegionCropRouteDependencies,
) {
  return async function GET(
    _request: Request,
    context: KnowledgeSourceRegionCropRouteContext,
  ): Promise<NextResponse> {
    const sessionAttempt = await attempt(() => deps.getAuthenticatedSession());
    if (!sessionAttempt.ok) return unavailable();
    const session = sessionAttempt.value;
    if (!session) return unauthorized();

    const { id: boardId, referenceId } = await context.params;

    const allowedAttempt = await attempt(() => session.canReadBoard(boardId));
    if (!allowedAttempt.ok) return unavailable();
    if (!allowedAttempt.value) return forbidden();

    const referenceAttempt = await attempt(() => session.findReferenceById(referenceId));
    if (!referenceAttempt.ok) return unavailable();
    const reference = referenceAttempt.value;
    if (!reference) return notFound();

    // Single-reference target rule: never choose among several citations.
    const countAttempt = await attempt(() => session.countReferencesForTargetPadlet(reference.targetPadletId));
    if (!countAttempt.ok) return unavailable();
    if (countAttempt.value !== 1) return notFound();

    // PAGE_REGION eligibility -- fails closed for PAGE_ONLY, EXACT_SPAN and a
    // malformed/absent rectangle alike; the DB does not enforce this shape.
    const region = normalizeStorableRegion({
      x: reference.regionX, y: reference.regionY, width: reference.regionWidth, height: reference.regionHeight,
    });
    if (region === null) return notFound();
    if (reference.charStart !== null || reference.charEnd !== null) return notFound();
    if (reference.quoteText !== null) return notFound();
    if (!isPositiveInteger(reference.pageStart) || reference.pageStart !== reference.pageEnd) return notFound();
    const pageNumber = reference.pageStart;

    const validationAttempt = await attempt(async () => ({
      padlet: await unwrap(await session.validation.findTargetPadlet(asPostId(reference.targetPadletId), asBoardId(boardId))),
      document: await unwrap(await session.validation.findSourceDocument(reference.sourceDocumentId as never, asBoardId(boardId))),
      geometry: await unwrap(await session.validation.findPageGeometry(reference.sourceDocumentId as never, pageNumber)),
    }));
    if (!validationAttempt.ok) return unavailable();
    const { padlet, document, geometry } = validationAttempt.value;
    if (!padlet) return notFound();
    if (!document) return notFound();
    if (document.processingStatus !== 'ready') return notReady();
    if (!isPositiveInteger(document.pageCount) || pageNumber > document.pageCount) return notFound();
    if (!geometry) return notFound();
    if (!isUsablePoints(geometry.widthPoints) || !isUsablePoints(geometry.heightPoints)) return notFound();
    // Persisted authority, never the client's verification-only appliedRotation.
    const rotation = geometry.rotation === null ? 0 : geometry.rotation;
    if (!isCanonicalPageRotation(rotation)) return notFound();

    const display = sourceRegionToDisplayRegion(region, rotation);
    if (display === null) return notFound();

    const objectPath = knowledgePageDerivativePath(boardId, reference.sourceDocumentId, pageNumber);
    if (objectPath === null) return notFound();

    const downloadAttempt = await attempt(() => session.downloadDerivative(objectPath));
    if (!downloadAttempt.ok) return unavailable();
    const download = downloadAttempt.value;
    if (download.kind === 'missing') return notFound();
    if (download.kind === 'unavailable') return unavailable();

    const cropAttempt = await attempt(() => session.cropToWebp(download.bytes, display));
    if (!cropAttempt.ok) return unavailable();
    const cropped = cropAttempt.value;

    return new NextResponse(cropped.buffer.slice(cropped.byteOffset, cropped.byteOffset + cropped.byteLength) as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': KNOWLEDGE_DERIVATIVE_CONTENT_TYPE, 'Cache-Control': 'private, no-store' },
    });
  };
}

// --- Real Supabase/Storage/@napi-rs/canvas-backed session -----------------

interface SourceReferenceLookupRow {
  readonly id: string;
  readonly target_padlet_id: string;
  readonly source_document_id: string;
  readonly page_start: number;
  readonly page_end: number;
  readonly quote_text: string | null;
  readonly char_start: number | null;
  readonly char_end: number | null;
  readonly region_x: number | null;
  readonly region_y: number | null;
  readonly region_width: number | null;
  readonly region_height: number | null;
}

const MISSING_OBJECT_STATUSES: ReadonlySet<number> = new Set([400, 404]);

function isMissingObject(error: unknown): boolean {
  const statusOf = (value: unknown): number | null => {
    const raw = typeof value === 'object' && value !== null ? (value as { status?: unknown }).status : null;
    return typeof raw === 'number' ? raw : null;
  };
  const status = statusOf(error) ?? statusOf((error as { originalError?: unknown } | null)?.originalError);
  return status !== null && MISSING_OBJECT_STATUSES.has(status);
}

const WEBP_OUTPUT_QUALITY = 92;

/** The one @napi-rs/canvas import in this module: decode, crop, re-encode. */
export async function cropDerivativeToWebp(bytes: Uint8Array, displayRegion: NormalizedPageRegion): Promise<Uint8Array> {
  const { loadImage, createCanvas } = await import('@napi-rs/canvas');
  const image = await loadImage(Buffer.from(bytes));
  const box = integerPixelCropBox(displayRegion, image.width, image.height);
  if (box === null) throw new Error('crop box out of bounds');
  const canvas = createCanvas(box.width, box.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, box.left, box.top, box.width, box.height, 0, 0, box.width, box.height);
  return canvas.encode('webp', WEBP_OUTPUT_QUALITY);
}

/** `sessionClient` proves identity and board read access; `adminClient` reads
 * everything else, mirroring A2a's own established authenticated-read pattern. */
export function createRealKnowledgeSourceRegionCropSession(
  sessionClient: unknown,
  adminClient: SupabaseClient,
  userId: string,
): KnowledgeSourceRegionCropSession {
  return {
    userId,
    validation: new SupabaseKnowledgeSourceReferenceValidationRepository(
      adminClient as unknown as KnowledgeSourceReferenceWriteSupabaseClient,
    ),
    async canReadBoard(boardId) {
      return canReadBoardKnowledge(sessionClient as KnowledgeBoardReadAuthorizationClient, boardId, userId);
    },
    async findReferenceById(id) {
      const { data, error } = await adminClient
        .from('source_references')
        .select('id, target_padlet_id, source_document_id, page_start, page_end, quote_text, char_start, char_end, '
          + 'region_x, region_y, region_width, region_height')
        .eq('id', id)
        .maybeSingle<SourceReferenceLookupRow>();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id, targetPadletId: data.target_padlet_id, sourceDocumentId: data.source_document_id,
        pageStart: data.page_start, pageEnd: data.page_end, quoteText: data.quote_text,
        charStart: data.char_start, charEnd: data.char_end,
        regionX: data.region_x, regionY: data.region_y, regionWidth: data.region_width, regionHeight: data.region_height,
      };
    },
    async countReferencesForTargetPadlet(targetPadletId) {
      const reader = new SupabaseKnowledgeSourceReferenceReader(
        adminClient as unknown as KnowledgeSourceReferenceSupabaseClient,
      );
      const result = await reader.listReferencesByTargetPadletId(asPostId(targetPadletId));
      if (!result.ok) throw new Error(result.error.message);
      return result.value.length;
    },
    async downloadDerivative(objectPath) {
      const { data, error } = await adminClient.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(objectPath);
      if (error) return { kind: isMissingObject(error) ? 'missing' : 'unavailable' };
      if (!data) return { kind: 'missing' };
      return { kind: 'ok', bytes: new Uint8Array(await data.arrayBuffer()) };
    },
    cropToWebp: cropDerivativeToWebp,
  };
}
