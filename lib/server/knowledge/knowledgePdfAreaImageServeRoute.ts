import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE,
  knowledgePdfAreaImagePath,
  parseKnowledgePdfAreaProvenance,
  type KnowledgePdfAreaProvenance,
} from '../../domain/knowledge/knowledgePdfAreaImagePolicy';
import { knowledgePdfAreaProvenanceMatches } from '../../domain/knowledge/knowledgePdfAreaLibraryPlacement';
import { createKnowledgePdfAreaDurableReuseLookup } from './knowledgePdfAreaLibraryReuseRoute';
import { KNOWLEDGE_STORAGE_BUCKET } from '../../infra/knowledge/knowledgeIngestionAdapters';
import type { KnowledgeSourceRegionCropDownload } from './knowledgeSourceRegionCropRoute';
import { canReadBoardKnowledge, type KnowledgeBoardReadAuthorizationClient } from './knowledgeBoardReadAuthorization';

/**
 * R6B -- the ONLY address a private PDF area crop has.
 *
 * There is no public URL and no signed URL anywhere in this feature, so this
 * route is not a convenience: it is the access control. Board membership is
 * re-checked on EVERY request, which is what makes revocation real -- remove a
 * collaborator and the image they could see yesterday 403s today, with no
 * token to expire and no cached public object left behind.
 *
 * It is deliberately NOT a general reader of the private bucket. The path is
 * re-derived from the two route parameters, and it is served only after the
 * card itself proves, through its own stored provenance, that it IS a PDF area
 * image on this board. A padlet id that is anything else gets a 404.
 */

export interface KnowledgePdfAreaImageServeContext {
  readonly params: Promise<{ id: string; padletId: string }>;
}

export interface KnowledgePdfAreaImageServeRow {
  readonly id: string;
  readonly boardId: string;
  readonly metadata: unknown;
  /**
   * IDENTITY HINT, NEVER AUTHORISATION. A browser can write this column, so it
   * is used below only to check that the trusted mapping and the placement
   * agree -- never as a reason to open a private object.
   */
  readonly libraryItemId: string | null;
}

/** The SERVER-OWNED relation. No browser role may insert, update or read it. */
export interface KnowledgePdfAreaImagePlacementMapping {
  readonly padletId: string;
  readonly libraryItemId: string;
  /**
   * The board whose EDIT authority was proven when this placement was created.
   * It does not move when the padlet does -- which is the point: an editor may
   * change `padlets.board_id`, and the entitlement must not follow.
   */
  readonly boardId: string;
}

/** The durable Library object a mapping points at, read with server authority. */
export interface KnowledgePdfAreaImageMappedLibraryItem {
  readonly id: string;
  readonly type: string | null;
  readonly knowledgeStoragePath: string | null;
  readonly metadata: unknown;
}

export interface KnowledgePdfAreaImageServeSession {
  readonly userId: string;
  canReadBoard(boardId: string): Promise<boolean>;
  /** Board-scoped lookup: a padlet on another board must read as absent. */
  findPadlet(padletId: string, boardId: string): Promise<KnowledgePdfAreaImageServeRow | null>;
  downloadAreaImage(objectPath: string): Promise<KnowledgeSourceRegionCropDownload>;
  /**
   * The trusted mapping for THIS placement, written only by the trusted reuse
   * path. Absent means there is no durable object this placement may reach.
   */
  findPlacementMapping(padletId: string): Promise<KnowledgePdfAreaImagePlacementMapping | null>;
  /** The mapped Library row. Server authority: the BOARD is the authorisation. */
  findMappedLibraryItem(libraryItemId: string): Promise<KnowledgePdfAreaImageMappedLibraryItem | null>;
}

export interface KnowledgePdfAreaImageServeDependencies {
  getAuthenticatedSession(): Promise<KnowledgePdfAreaImageServeSession | null>;
}

const json = (error: string, status: number) => NextResponse.json({ error }, { status });
const unauthorized = () => json('Unauthorized', 401);
const forbidden = () => json('Forbidden', 403);
const notFound = () => json('Not found', 404);
const unavailable = () => json('Unavailable', 503);

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false };
  }
}

/**
 * IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE -- the durable object a REUSED placement
 * is entitled to, or nothing.
 *
 * Every step below is a gate, and the order is the point:
 *
 *   1. a trusted mapping must exist FOR THIS padlet. It is written only by the
 *      trusted reuse path, so its presence is the authorisation the browser
 *      cannot forge;
 *   2. the placement's own `library_item_id` must AGREE with it. This is a
 *      consistency check, never a grant -- a forged column with no mapping
 *      behind it reaches nothing, and a forged column that disagrees with a
 *      real mapping fails closed rather than picking a winner;
 *   3. the mapped Library row must still be a PDF-area Image with a proven
 *      server-owned path;
 *   4. its provenance must be the SAME source, page and region as the
 *      placement's. Canonical semantic equality, not object identity: the two
 *      records are parsed from different rows.
 *
 * Board authorisation was settled by the caller, on the TARGET board. No origin
 * board is consulted and none is required -- the origin placement is usually
 * gone, which is the entire reason the durable object exists.
 */
async function resolveDurableReuseBytes(
  session: KnowledgePdfAreaImageServeSession,
  boardId: string,
  padletId: string,
  padlet: KnowledgePdfAreaImageServeRow,
  placementProvenance: KnowledgePdfAreaProvenance,
): Promise<KnowledgeSourceRegionCropDownload> {
  const mappingAttempt = await attempt(() => session.findPlacementMapping(padletId));
  if (!mappingAttempt.ok) return { kind: 'unavailable' };
  const mapping = mappingAttempt.value;
  if (!mapping) return { kind: 'missing' };
  if (mapping.padletId !== padletId) return { kind: 'missing' };

  // THE BOARD BINDING. Three ids must agree: the board this request was
  // authorised against, the board the padlet currently claims, and the board
  // the mapping recorded when the entitlement was granted.
  //
  // `padlets.board_id` is browser writable, so an editor can move a card they
  // legitimately created onto another board they can edit. The mapping does not
  // move with it, and nothing here repairs it to match -- so the moved card's
  // new board asks for a private object it was never granted, and gets nothing.
  if (mapping.boardId !== boardId) return { kind: 'missing' };
  if (padlet.boardId !== boardId) return { kind: 'missing' };

  // Consistency only. The mapping already decided; this refuses the case where
  // the two disagree rather than trusting either.
  if (padlet.libraryItemId !== null && padlet.libraryItemId !== mapping.libraryItemId) {
    return { kind: 'missing' };
  }

  const itemAttempt = await attempt(() => session.findMappedLibraryItem(mapping.libraryItemId));
  if (!itemAttempt.ok) return { kind: 'unavailable' };
  const item = itemAttempt.value;
  if (!item) return { kind: 'missing' };
  if (item.id !== mapping.libraryItemId) return { kind: 'missing' };
  if (item.type !== 'image') return { kind: 'missing' };

  const libraryProvenance = parseKnowledgePdfAreaProvenance(item.metadata);
  if (libraryProvenance === null) return { kind: 'missing' };
  if (!knowledgePdfAreaProvenanceMatches(placementProvenance, libraryProvenance)) {
    return { kind: 'missing' };
  }

  // Server-owned, or absent. Never a path from metadata, and never one derived
  // from ids this route did not validate itself.
  const durablePath = item.knowledgeStoragePath;
  if (typeof durablePath !== 'string' || durablePath.length === 0) return { kind: 'missing' };

  const durableAttempt = await attempt(() => session.downloadAreaImage(durablePath));
  if (!durableAttempt.ok) return { kind: 'unavailable' };
  return durableAttempt.value;
}

export function createKnowledgePdfAreaImageServeHandler(
  deps: KnowledgePdfAreaImageServeDependencies,
) {
  return async function GET(
    _request: Request,
    context: KnowledgePdfAreaImageServeContext,
  ): Promise<NextResponse> {
    const sessionAttempt = await attempt(() => deps.getAuthenticatedSession());
    if (!sessionAttempt.ok) return unavailable();
    const session = sessionAttempt.value;
    if (!session) return unauthorized();

    const { id: boardId, padletId } = await context.params;

    const allowedAttempt = await attempt(() => session.canReadBoard(boardId));
    if (!allowedAttempt.ok) return unavailable();
    if (!allowedAttempt.value) return forbidden();

    const padletAttempt = await attempt(() => session.findPadlet(padletId, boardId));
    if (!padletAttempt.ok) return unavailable();
    const padlet = padletAttempt.value;
    if (!padlet) return notFound();
    if (padlet.boardId !== boardId) return notFound();

    // The card's own provenance is the authorisation to derive a path at all.
    // Without it this route would serve any object named after any padlet id.
    const placementProvenance = parseKnowledgePdfAreaProvenance(padlet.metadata);
    if (placementProvenance === null) return notFound();

    // Re-derived, never read from stored metadata: a stored path would be a
    // client-writable field pointed at someone else's private object.
    const objectPath = knowledgePdfAreaImagePath(boardId, padletId);
    if (objectPath === null) return notFound();

    // THE DIRECT BRANCH STAYS FIRST. Every original PDF-area placement already
    // has its object at exactly this path, so nothing historical needs a
    // mapping and nothing needed backfilling for this correction.
    const downloadAttempt = await attempt(() => session.downloadAreaImage(objectPath));
    if (!downloadAttempt.ok) return unavailable();
    const download = downloadAttempt.value;
    if (download.kind === 'unavailable') return unavailable();

    let bytes: Uint8Array;
    if (download.kind === 'ok') {
      bytes = download.bytes;
    } else {
      // A REUSED placement: the durable object was cut for a different (often
      // deleted) card, so nothing lives at this placement's own path. The only
      // thing that may say which private object it is entitled to is the
      // server-owned mapping -- never `padlets.library_item_id`, which a
      // browser can write to any UUID it likes.
      const durable = await resolveDurableReuseBytes(
        session, boardId, padletId, padlet, placementProvenance,
      );
      if (durable.kind === 'missing') return notFound();
      if (durable.kind === 'unavailable') return unavailable();
      bytes = durable.bytes;
    }

    return new NextResponse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      {
        status: 200,
        headers: {
          'Content-Type': KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE,
          // `private` keeps it out of shared caches; `no-store` means a revoked
          // collaborator's browser has nothing left to re-display.
          'Cache-Control': 'private, no-store',
        },
      },
    );
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

interface PadletLookupRow {
  readonly id: string;
  readonly board_id: string;
  readonly metadata: unknown;
  readonly library_item_id: string | null;
}


export function createRealKnowledgePdfAreaImageServeSession(
  sessionClient: unknown,
  adminClient: SupabaseClient,
  userId: string,
): KnowledgePdfAreaImageServeSession {
  return {
    userId,
    async canReadBoard(boardId) {
      return canReadBoardKnowledge(sessionClient as KnowledgeBoardReadAuthorizationClient, boardId, userId);
    },
    async findPadlet(padletId, boardId) {
      const { data, error } = await adminClient
        .from('padlets')
        .select('id, board_id, metadata, library_item_id')
        .eq('id', padletId)
        .eq('board_id', boardId)
        .maybeSingle<PadletLookupRow>();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        boardId: data.board_id,
        metadata: data.metadata,
        libraryItemId: data.library_item_id ?? null,
      };
    },
    // The durable-object lookups belong to the module that owns durable
    // reuse, so this route keeps knowing only about boards, padlets and the
    // private bucket -- see createKnowledgePdfAreaDurableReuseLookup.
    ...createKnowledgePdfAreaDurableReuseLookup(adminClient),
    async downloadAreaImage(objectPath) {
      const { data, error } = await adminClient.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(objectPath);
      if (error) return { kind: isMissingObject(error) ? 'missing' : 'unavailable' };
      if (!data) return { kind: 'missing' };
      return { kind: 'ok', bytes: new Uint8Array(await data.arrayBuffer()) };
    },
  };
}
