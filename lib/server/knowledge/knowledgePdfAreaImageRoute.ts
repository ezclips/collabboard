import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { asBoardId } from '../../domain/core/ids';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import {
  isCanonicalPageRotation,
  normalizeStorableRegion,
  sourceRegionToDisplayRegion,
  type NormalizedPageRegion,
} from '../../domain/knowledge/knowledgePageRegionGeometry';
import { knowledgePageDerivativePath } from '../../domain/knowledge/knowledgePdfRenderPolicy';
import {
  KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE,
  buildKnowledgePdfAreaProvenance,
  knowledgePdfAreaImagePath,
  knowledgePdfAreaImageUrl,
} from '../../domain/knowledge/knowledgePdfAreaImagePolicy';
import type { KnowledgeSourceReferenceValidationRepository } from '../../domain/knowledge/knowledgeSourceReferenceWrite';
import { SupabaseKnowledgeSourceReferenceValidationRepository, SupabaseKnowledgeSourceReferenceWriteAuthorizer,
  type KnowledgeSourceReferenceWriteSupabaseClient }
  from '../../infra/knowledge/knowledgeSourceReferenceWriteAdapters';
import { KNOWLEDGE_STORAGE_BUCKET } from '../../infra/knowledge/knowledgeIngestionAdapters';
import { cropDerivativeToWebp, type KnowledgeSourceRegionCropDownload }
  from './knowledgeSourceRegionCropRoute';

/**
 * R6B -- turn a rectangle a reader drew on a private Knowledge PDF page into
 * an ordinary Image card, WITHOUT the crop ever becoming public.
 *
 * The browser supplies IDENTITY AND A RECTANGLE ONLY. It never uploads bytes,
 * never names a Storage path, and never chooses a URL. This route re-reads its
 * own stored page derivative, crops it with the existing crop authority, and
 * writes the result into the SAME private bucket the source PDF lives in. The
 * card is addressed by a same-origin route that re-authorises on every read,
 * so there is no public object, no signed URL and no permanent token to leak.
 */

export interface KnowledgePdfAreaImageRouteContext {
  readonly params: Promise<{ id: string }>;
}

/** The row the route inserts. Named so tests can assert it exactly. */
export interface KnowledgePdfAreaImagePadletRow {
  readonly id: string;
  readonly board_id: string;
  readonly title: string;
  readonly content: string;
  readonly type: 'image';
  readonly position_x: number;
  readonly position_y: number;
  readonly width: number;
  readonly height: number;
  readonly file_url: string;
  readonly metadata: {
    readonly imageUrl: string;
    readonly source: ReturnType<typeof buildKnowledgePdfAreaProvenance>;
  };
}

export interface KnowledgePdfAreaImageSession {
  readonly userId: string;
  readonly validation: Pick<
    KnowledgeSourceReferenceValidationRepository, 'findSourceDocument' | 'findPageGeometry'
  >;
  /** EDIT, not read: creating a card is a board write, and a viewer must not. */
  canWriteBoard(boardId: string): Promise<boolean>;
  downloadDerivative(objectPath: string): Promise<KnowledgeSourceRegionCropDownload>;
  cropToWebp(bytes: Uint8Array, displayRegion: NormalizedPageRegion): Promise<Uint8Array>;
  uploadAreaImage(objectPath: string, bytes: Uint8Array): Promise<boolean>;
  removeAreaImage(objectPath: string): Promise<void>;
  /**
   * IMAGE-LIBRARY-1. Creates the durable Library object AND its board placement
   * in ONE transaction, returning the library id the placement now references.
   * `false` means neither exists: a placement without its durable identity is
   * the state the product rule forbids, so there is nothing partial to undo.
   */
  insertPadlet(row: KnowledgePdfAreaImagePadletRow): Promise<false | { libraryItemId: string }>;
  /** Injected so the object path is deterministic under test. */
  newPadletId(): string;
}

export interface KnowledgePdfAreaImageRouteDependencies {
  getAuthenticatedSession(): Promise<KnowledgePdfAreaImageSession | null>;
}

const json = (error: string, status: number) => NextResponse.json({ error }, { status });
const badRequest = () => json('Invalid request', 400);
const unauthorized = () => json('Unauthorized', 401);
const forbidden = () => json('Forbidden', 403);
const notFound = () => json('Not found', 404);
const notReady = () => json('Knowledge document is not ready', 409);
const unavailable = () => json('Unavailable', 503);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;
const isUsablePoints = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Placement is a preference, not a permission: clamped, never trusted blindly. */
const MIN_CARD_EXTENT = 40;
const MAX_CARD_EXTENT = 2000;
const MAX_CARD_COORDINATE = 1_000_000;
const CARD_WIDTH = 320;

function clampCoordinate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MAX_CARD_COORDINATE, Math.max(-MAX_CARD_COORDINATE, Math.round(value)));
}

/**
 * The card's height comes from the crop's real aspect, computed from the
 * PERSISTED page geometry -- not from anything the browser measured. A quarter
 * turn transposes the rendered page, because A1 bakes rotation into the
 * derivative, so the display rectangle is already in rendered space.
 *
 * The client is never asked for a size: a wrong one would letterbox or stretch
 * a citation, and a hostile one would be a free layout primitive.
 */
export function knowledgePdfAreaCardHeight(
  displayRegion: NormalizedPageRegion,
  widthPoints: number,
  heightPoints: number,
  rotation: number,
): number {
  const quarter = rotation === 90 || rotation === 270;
  const renderedWidth = quarter ? heightPoints : widthPoints;
  const renderedHeight = quarter ? widthPoints : heightPoints;
  const cropWidth = displayRegion.width * renderedWidth;
  const cropHeight = displayRegion.height * renderedHeight;
  if (!(cropWidth > 0) || !(cropHeight > 0)) return MIN_CARD_EXTENT;
  const height = Math.round((CARD_WIDTH * cropHeight) / cropWidth);
  if (!Number.isFinite(height)) return MIN_CARD_EXTENT;
  return Math.min(MAX_CARD_EXTENT, Math.max(MIN_CARD_EXTENT, height));
}

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

interface ParsedAreaImageRequest {
  readonly knowledgeDocumentId: string;
  readonly pageNumber: number;
  readonly region: NormalizedPageRegion;
  readonly title: string;
  readonly positionX: number;
  readonly positionY: number;
}

/** Body parsing is total: anything that is not a whole request is no request. */
export function parseKnowledgePdfAreaImageRequest(body: unknown): ParsedAreaImageRequest | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const { knowledgeDocumentId, pageNumber } = record;
  if (typeof knowledgeDocumentId !== 'string' || !UUID.test(knowledgeDocumentId)) return null;
  if (!isPositiveInteger(pageNumber)) return null;
  const region = normalizeStorableRegion(record.region);
  if (region === null) return null;
  const rawTitle = typeof record.title === 'string' ? record.title.trim() : '';
  return {
    knowledgeDocumentId,
    pageNumber,
    region,
    // Display text only, capped. It is never a path, an id or an authorisation.
    title: rawTitle.length > 0 ? rawTitle.slice(0, 200) : 'PDF area',
    positionX: clampCoordinate(record.positionX),
    positionY: clampCoordinate(record.positionY),
  };
}

export function createKnowledgePdfAreaImageHandler(
  deps: KnowledgePdfAreaImageRouteDependencies,
) {
  return async function POST(
    request: Request,
    context: KnowledgePdfAreaImageRouteContext,
  ): Promise<NextResponse> {
    const sessionAttempt = await attempt(() => deps.getAuthenticatedSession());
    if (!sessionAttempt.ok) return unavailable();
    const session = sessionAttempt.value;
    if (!session) return unauthorized();

    const { id: boardId } = await context.params;

    // EDIT before anything else is read: a viewer must not even learn whether
    // a document id exists on a board they cannot write to.
    const allowedAttempt = await attempt(() => session.canWriteBoard(boardId));
    if (!allowedAttempt.ok) return unavailable();
    if (!allowedAttempt.value) return forbidden();

    const bodyAttempt = await attempt(() => request.json() as Promise<unknown>);
    if (!bodyAttempt.ok) return badRequest();
    const parsed = parseKnowledgePdfAreaImageRequest(bodyAttempt.value);
    if (parsed === null) return badRequest();

    const validationAttempt = await attempt(async () => ({
      document: await unwrap(
        await session.validation.findSourceDocument(parsed.knowledgeDocumentId as never, asBoardId(boardId)),
      ),
      geometry: await unwrap(
        await session.validation.findPageGeometry(parsed.knowledgeDocumentId as never, parsed.pageNumber),
      ),
    }));
    if (!validationAttempt.ok) return unavailable();
    const { document, geometry } = validationAttempt.value;
    // findSourceDocument is board-scoped, so a null here is equally "no such
    // document" and "not this board's document" -- one answer, no probing.
    if (!document) return notFound();
    if (document.processingStatus !== 'ready') return notReady();
    if (!isPositiveInteger(document.pageCount) || parsed.pageNumber > document.pageCount) return notFound();
    if (!geometry) return notFound();
    if (!isUsablePoints(geometry.widthPoints) || !isUsablePoints(geometry.heightPoints)) return notFound();

    // Persisted rotation, never a client-supplied applied rotation.
    const rotation = geometry.rotation === null ? 0 : geometry.rotation;
    if (!isCanonicalPageRotation(rotation)) return notFound();
    const display = sourceRegionToDisplayRegion(parsed.region, rotation);
    if (display === null) return notFound();

    const derivativePath = knowledgePageDerivativePath(boardId, parsed.knowledgeDocumentId, parsed.pageNumber);
    if (derivativePath === null) return notFound();

    const downloadAttempt = await attempt(() => session.downloadDerivative(derivativePath));
    if (!downloadAttempt.ok) return unavailable();
    const download = downloadAttempt.value;
    if (download.kind === 'missing') return notFound();
    if (download.kind === 'unavailable') return unavailable();

    const cropAttempt = await attempt(() => session.cropToWebp(download.bytes, display));
    if (!cropAttempt.ok) return unavailable();

    const padletId = session.newPadletId();
    const objectPath = knowledgePdfAreaImagePath(boardId, padletId);
    const imageUrl = knowledgePdfAreaImageUrl(boardId, padletId);
    // Both are derived from ids the server itself validated; a null means the
    // board id is not a UUID and nothing may be written under it.
    if (objectPath === null || imageUrl === null) return badRequest();

    const uploadAttempt = await attempt(() => session.uploadAreaImage(objectPath, cropAttempt.value));
    if (!uploadAttempt.ok || !uploadAttempt.value) return unavailable();

    const row: KnowledgePdfAreaImagePadletRow = {
      id: padletId,
      board_id: boardId,
      title: parsed.title,
      content: '',
      type: 'image',
      position_x: parsed.positionX,
      position_y: parsed.positionY,
      width: CARD_WIDTH,
      height: knowledgePdfAreaCardHeight(display, geometry.widthPoints, geometry.heightPoints, rotation),
      file_url: imageUrl,
      metadata: {
        imageUrl,
        source: buildKnowledgePdfAreaProvenance(parsed.knowledgeDocumentId, parsed.pageNumber, parsed.region),
      },
    };

    const insertAttempt = await attempt(() => session.insertPadlet(row));
    if (!insertAttempt.ok || !insertAttempt.value) {
      // The card is what makes the object reachable AND what authorises it.
      // Without the row the object is unreachable but still stored, so it is
      // removed rather than left as an orphan of a private PDF. The Library
      // object cannot survive this either: it and the placement share one
      // transaction, so a failure leaves neither.
      await attempt(() => session.removeAreaImage(objectPath));
      return unavailable();
    }

    // The durable identity the placement now references. The image lives in the
    // Library from here on: removing this card does not remove it.
    const placed = { ...row, library_item_id: insertAttempt.value.libraryItemId };
    return NextResponse.json({ padlet: placed }, { status: 201 });
  };
}

// --- Real Supabase/Storage-backed session ---------------------------------

const MISSING_OBJECT_STATUSES: ReadonlySet<number> = new Set([400, 404]);

function isMissingObject(error: unknown): boolean {
  const statusOf = (value: unknown): number | null => {
    const raw = typeof value === 'object' && value !== null ? (value as { status?: unknown }).status : null;
    return typeof raw === 'number' ? raw : null;
  };
  const status = statusOf(error) ?? statusOf((error as { originalError?: unknown } | null)?.originalError);
  return status !== null && MISSING_OBJECT_STATUSES.has(status);
}

/**
 * `sessionClient` proves identity and board WRITE access through the same
 * authorizer the citation writer uses; `adminClient` performs the storage and
 * row work the browser role deliberately cannot.
 */
export function createRealKnowledgePdfAreaImageSession(
  sessionClient: unknown,
  adminClient: SupabaseClient,
  userId: string,
): KnowledgePdfAreaImageSession {
  const authorizer = new SupabaseKnowledgeSourceReferenceWriteAuthorizer(
    sessionClient as KnowledgeSourceReferenceWriteSupabaseClient,
  );
  return {
    userId,
    validation: new SupabaseKnowledgeSourceReferenceValidationRepository(
      adminClient as unknown as KnowledgeSourceReferenceWriteSupabaseClient,
    ),
    async canWriteBoard(boardId) {
      const result = await authorizer.canWriteBoard(asBoardId(boardId), userId as never);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
    async downloadDerivative(objectPath) {
      const { data, error } = await adminClient.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(objectPath);
      if (error) return { kind: isMissingObject(error) ? 'missing' : 'unavailable' };
      if (!data) return { kind: 'missing' };
      return { kind: 'ok', bytes: new Uint8Array(await data.arrayBuffer()) };
    },
    cropToWebp: cropDerivativeToWebp,
    async uploadAreaImage(objectPath, bytes) {
      // The SAME private bucket the source PDF lives in. Never padlet-files,
      // never images, never thumbnails -- all three are public.
      const { error } = await adminClient.storage
        .from(KNOWLEDGE_STORAGE_BUCKET)
        .upload(objectPath, Buffer.from(bytes), {
          contentType: KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE,
          upsert: true,
        });
      return !error;
    },
    async removeAreaImage(objectPath) {
      await adminClient.storage.from(KNOWLEDGE_STORAGE_BUCKET).remove([objectPath]);
    },
    async insertPadlet(row) {
      // ONE transaction for the durable Library object and its placement. The
      // board edit was already authorised above, and `userId` is the id this
      // route authenticated -- the browser never names the owner.
      //
      // The PDF-area wrapper, not the generic function: it additionally records
      // where the private crop lives, so the Library object keeps a picture
      // after this placement is deleted. It derives that path itself from the
      // two ids below -- no location is sent from here, and `authenticated`
      // cannot execute it at all. `p_board_file_url` is the placement's own
      // board-scoped address; the Library row is pointed at its durable one
      // inside the same transaction.
      const { data, error } = await adminClient.rpc('create_knowledge_pdf_area_image_post_with_library_item', {
        p_padlet_id: row.id,
        p_board_id: row.board_id,
        p_user_id: userId,
        p_title: row.title,
        p_content: row.content,
        p_position_x: row.position_x,
        p_position_y: row.position_y,
        p_width: row.width,
        p_height: row.height,
        p_board_file_url: row.file_url,
        p_metadata: row.metadata,
      });
      if (error) return false;
      const created = (Array.isArray(data) ? data[0] : data) as
        { library_item_id?: string } | null | undefined;
      const libraryItemId = created?.library_item_id;
      return typeof libraryItemId === 'string' ? { libraryItemId } : false;
    },
    newPadletId: () => randomUUID(),
  };
}
