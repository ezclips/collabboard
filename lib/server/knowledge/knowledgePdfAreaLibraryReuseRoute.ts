import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { asBoardId } from '../../domain/core/ids';
import { buildKnowledgePdfAreaPlacementMetadata } from '../../domain/knowledge/knowledgePdfAreaLibraryPlacement';
import type {
  KnowledgePdfAreaImageMappedLibraryItem,
  KnowledgePdfAreaImagePlacementMapping,
} from './knowledgePdfAreaImageServeRoute';
import {
  SupabaseKnowledgeSourceReferenceWriteAuthorizer,
  type KnowledgeSourceReferenceWriteSupabaseClient,
} from '../../infra/knowledge/knowledgeSourceReferenceWriteAdapters';

/**
 * IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE -- placing a durable PDF-area Library
 * Image onto a board, without the browser ever naming a private object.
 *
 * WHY THIS IS A SERVER ROUTE AT ALL. Ordinary Library reuse is a plain browser
 * INSERT into `padlets`, and for ordinary content that is right. A PDF-area
 * Image is different: the bytes live in the PRIVATE Knowledge bucket, and the
 * only thing that will later authorise serving them to a collaborator is a
 * server-owned mapping row. A browser cannot be allowed to write that mapping,
 * because a browser-writable relation is an identity HINT and never an
 * authorisation -- `padlets.library_item_id` remains exactly that, and this
 * route is what supplies the trusted half beside it.
 *
 * THE BROWSER SENDS A POSITION. Nothing else. No storage path, no origin board,
 * no origin padlet, no provenance and no ownership claim: every one of those is
 * read here from rows the server already trusts, so a forged body can only ever
 * move the card, never widen what it can see.
 *
 * THE LIBRARY ITEM IS READ THROUGH THE CALLER'S OWN CLIENT, so `library_items`'
 * owner-scoped RLS is the ownership proof rather than a `user_id` filter that
 * could be forgotten. The trusted SQL below then re-proves ownership AND board
 * write authority for itself, because service_role bypasses RLS and a route's
 * check must never be the only thing standing between a delegated id and
 * someone else's board.
 */

export interface KnowledgePdfAreaLibraryReuseContext {
  readonly params: Promise<{ id: string; libraryItemId: string }>;
}

/** The durable Library row, as the server reads it. */
export interface KnowledgePdfAreaLibraryReuseItem {
  readonly id: string;
  readonly type: string | null;
  /** Server-owned. Its ABSENCE means no durable object has been proven. */
  readonly knowledgeStoragePath: string | null;
  readonly title: string | null;
  readonly content: string | null;
  readonly width: unknown;
  readonly height: unknown;
  readonly metadata: unknown;
}

/** The placement this route creates. Named so tests can assert it exactly. */
export interface KnowledgePdfAreaLibraryReusePadletRow {
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
  readonly metadata: Record<string, unknown>;
  /** The SAME durable object. No second library_items row is ever created. */
  readonly library_item_id: string;
}

export interface KnowledgePdfAreaLibraryReuseSession {
  readonly userId: string;
  /** EDIT, not read: placing a card is a board write, and a viewer must not. */
  canWriteBoard(boardId: string): Promise<boolean>;
  /**
   * Reads through the CALLER's authority. Another user's row must come back
   * null here -- this IS the ownership check, not a filter over a privileged
   * result set.
   */
  findOwnLibraryItem(libraryItemId: string): Promise<KnowledgePdfAreaLibraryReuseItem | null>;
  /**
   * ONE transaction: the placement and its trusted mapping. `false` means
   * neither exists -- a placement without its mapping would render nothing,
   * and a mapping without its placement would be an orphan authorisation.
   */
  insertReusePlacement(row: KnowledgePdfAreaLibraryReusePadletRow): Promise<boolean>;
  /** Injected so the target address is deterministic under test. */
  newPadletId(): string;
}

export interface KnowledgePdfAreaLibraryReuseDependencies {
  getAuthenticatedSession(): Promise<KnowledgePdfAreaLibraryReuseSession | null>;
}

const json = (error: string, status: number) => NextResponse.json({ error }, { status });
const badRequest = () => json('Invalid request', 400);
const unauthorized = () => json('Unauthorized', 401);
const forbidden = () => json('Forbidden', 403);
const notFound = () => json('Not found', 404);
const unavailable = () => json('Unavailable', 503);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Placement is a preference, not a permission: clamped, never trusted blindly. */
const MIN_CARD_EXTENT = 40;
const MAX_CARD_EXTENT = 2000;
const MAX_CARD_COORDINATE = 1_000_000;
const DEFAULT_CARD_WIDTH = 320;
const DEFAULT_CARD_HEIGHT = 240;

function clampCoordinate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MAX_CARD_COORDINATE, Math.max(-MAX_CARD_COORDINATE, Math.round(value)));
}

/**
 * The card's size comes from the DURABLE snapshot, never from the request: the
 * browser is not asked how big someone else's private crop is.
 */
function clampExtent(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(MAX_CARD_EXTENT, Math.max(MIN_CARD_EXTENT, Math.round(value)));
}

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false };
  }
}

export interface ParsedReusePlacementRequest {
  readonly positionX: number;
  readonly positionY: number;
}

/**
 * The whole accepted body. Anything else a caller sends is ignored by
 * construction rather than filtered, so no future field can be smuggled in.
 */
export function parseKnowledgePdfAreaReuseRequest(body: unknown): ParsedReusePlacementRequest | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  return {
    positionX: clampCoordinate(record.positionX),
    positionY: clampCoordinate(record.positionY),
  };
}

export function createKnowledgePdfAreaLibraryReuseHandler(
  deps: KnowledgePdfAreaLibraryReuseDependencies,
) {
  return async function POST(
    request: Request,
    context: KnowledgePdfAreaLibraryReuseContext,
  ): Promise<NextResponse> {
    const sessionAttempt = await attempt(() => deps.getAuthenticatedSession());
    if (!sessionAttempt.ok) return unavailable();
    const session = sessionAttempt.value;
    if (!session) return unauthorized();

    const { id: boardId, libraryItemId } = await context.params;
    if (typeof boardId !== 'string' || !UUID.test(boardId)) return badRequest();
    if (typeof libraryItemId !== 'string' || !UUID.test(libraryItemId)) return badRequest();

    // EDIT first: a viewer must not even learn whether a Library item exists.
    const allowedAttempt = await attempt(() => session.canWriteBoard(boardId));
    if (!allowedAttempt.ok) return unavailable();
    if (!allowedAttempt.value) return forbidden();

    const bodyAttempt = await attempt(() => request.json() as Promise<unknown>);
    if (!bodyAttempt.ok) return badRequest();
    const parsed = parseKnowledgePdfAreaReuseRequest(bodyAttempt.value);
    if (parsed === null) return badRequest();

    const itemAttempt = await attempt(() => session.findOwnLibraryItem(libraryItemId));
    if (!itemAttempt.ok) return unavailable();
    const item = itemAttempt.value;
    // Another user's row, or none: indistinguishable on purpose. A 403 here
    // would confirm that someone else's library item exists.
    if (!item) return notFound();
    if (item.type !== 'image') return notFound();

    // A durable address must already have been PROVEN by the creation path.
    // Without it there is nothing this route could ever serve, so there is
    // nothing for it to place.
    if (typeof item.knowledgeStoragePath !== 'string' || item.knowledgeStoragePath.length === 0) {
      return notFound();
    }

    const padletId = session.newPadletId();
    // The canonical rebinding: provenance is re-proved inside, and the
    // placement-local aliases are pointed at THIS placement's own address.
    const placement = buildKnowledgePdfAreaPlacementMetadata(item.metadata, { boardId, padletId });
    // Not a PDF-area image after all: ordinary reuse owns that case, not this
    // route, and it must not invent a mapping for it.
    if (placement === null) return notFound();

    const row: KnowledgePdfAreaLibraryReusePadletRow = {
      id: padletId,
      board_id: boardId,
      title: typeof item.title === 'string' && item.title.trim().length > 0
        ? item.title.trim().slice(0, 200)
        : 'PDF area',
      content: typeof item.content === 'string' ? item.content : '',
      type: 'image',
      position_x: parsed.positionX,
      position_y: parsed.positionY,
      width: clampExtent(item.width, DEFAULT_CARD_WIDTH),
      height: clampExtent(item.height, DEFAULT_CARD_HEIGHT),
      // The TARGET board address, which is what keeps collaborator access
      // flowing through target-board authorisation.
      file_url: placement.imageUrl,
      metadata: placement.metadata,
      library_item_id: item.id,
    };

    const insertAttempt = await attempt(() => session.insertReusePlacement(row));
    if (!insertAttempt.ok || !insertAttempt.value) return unavailable();

    return NextResponse.json({ padlet: row }, { status: 201 });
  };
}

// --- Real Supabase-backed session -----------------------------------------

interface LibraryLookupRow {
  readonly id: string;
  readonly type: string | null;
  readonly knowledge_storage_path: string | null;
  readonly content: {
    readonly title?: unknown;
    readonly content?: unknown;
    readonly width?: unknown;
    readonly height?: unknown;
    readonly metadata?: unknown;
  } | null;
}

/** Minimal shape of the caller's own PostgREST client, for the RLS-bound read. */
export interface KnowledgePdfAreaLibraryReuseSessionClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle<T>(): PromiseLike<{ data: T | null; error: unknown }>;
      };
    };
  };
}

const asText = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function createRealKnowledgePdfAreaLibraryReuseSession(
  sessionClient: unknown,
  adminClient: SupabaseClient,
  userId: string,
): KnowledgePdfAreaLibraryReuseSession {
  const authorizer = new SupabaseKnowledgeSourceReferenceWriteAuthorizer(
    sessionClient as KnowledgeSourceReferenceWriteSupabaseClient,
  );
  return {
    userId,
    async canWriteBoard(boardId) {
      const result = await authorizer.canWriteBoard(asBoardId(boardId), userId as never);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
    async findOwnLibraryItem(libraryItemId) {
      // The CALLER's client, deliberately: `Users can view their own library
      // items` is the authorisation. No `user_id` filter is written here
      // because a filter can be forgotten and a policy cannot.
      const { data, error } = await (sessionClient as KnowledgePdfAreaLibraryReuseSessionClient)
        .from('library_items')
        .select('id, type, knowledge_storage_path, content')
        .eq('id', libraryItemId)
        .maybeSingle<LibraryLookupRow>();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        type: data.type,
        knowledgeStoragePath: data.knowledge_storage_path,
        title: asText(data.content?.title),
        content: asText(data.content?.content),
        width: data.content?.width,
        height: data.content?.height,
        metadata: data.content?.metadata ?? null,
      };
    },
    async insertReusePlacement(row) {
      // ONE transaction for the placement and its trusted mapping. The board
      // edit and the Library ownership were both authorised above, and the SQL
      // re-proves both for itself: `authenticated` cannot execute this function
      // at all, and no storage path is ever sent from here.
      const { error } = await adminClient.rpc('create_knowledge_pdf_area_image_reuse_placement', {
        p_padlet_id: row.id,
        p_board_id: row.board_id,
        p_user_id: userId,
        p_library_item_id: row.library_item_id,
        p_title: row.title,
        p_content: row.content,
        p_position_x: row.position_x,
        p_position_y: row.position_y,
        p_width: row.width,
        p_height: row.height,
        p_board_file_url: row.file_url,
        p_metadata: row.metadata,
      });
      return !error;
    },
    newPadletId: () => randomUUID(),
  };
}

// --- The READ side of the same trusted relation ---------------------------

interface PlacementMappingRow {
  readonly padlet_id: string;
  readonly library_item_id: string;
}

interface MappedLibraryRow {
  readonly id: string;
  readonly type: string | null;
  readonly knowledge_storage_path: string | null;
  readonly content: { readonly metadata?: unknown } | null;
}

/**
 * How a board placement finds the durable object it was granted.
 *
 * It lives beside the write above ON PURPOSE: this module is the one place
 * that knows a durable PDF-area Library object exists, where its server-owned
 * location is recorded, and which relation says a placement may reach it. The
 * board serve route stays what it has always been -- board authority plus the
 * padlet's own provenance -- and delegates here rather than growing its own
 * knowledge of Library storage, which is exactly the separation its negative
 * control protects.
 *
 * Both reads use SERVER authority, and neither is an authorisation on its own:
 * the caller has already proved the TARGET board, and it applies every gate
 * (mapping identity, type, path, provenance) to what comes back.
 */
export function createKnowledgePdfAreaDurableReuseLookup(adminClient: SupabaseClient): {
  findPlacementMapping(padletId: string): Promise<KnowledgePdfAreaImagePlacementMapping | null>;
  findMappedLibraryItem(libraryItemId: string): Promise<KnowledgePdfAreaImageMappedLibraryItem | null>;
} {
  return {
    async findPlacementMapping(padletId) {
      // Server authority, because no browser role may read this table at all --
      // its whole purpose is to be the half of the relation a client cannot
      // write. The board was authorised before this is ever reached.
      const { data, error } = await adminClient
        .from('knowledge_pdf_area_image_placements')
        .select('padlet_id, library_item_id')
        .eq('padlet_id', padletId)
        .maybeSingle<PlacementMappingRow>();
      if (error) throw error;
      if (!data) return null;
      return { padletId: data.padlet_id, libraryItemId: data.library_item_id };
    },
    async findMappedLibraryItem(libraryItemId) {
      // Deliberately NOT the caller's client: a collaborator reading a shared
      // board does not own the Library row behind the image, and requiring
      // ownership here would take the image away from them. The mapping is
      // what proved this placement is entitled to it.
      const { data, error } = await adminClient
        .from('library_items')
        .select('id, type, knowledge_storage_path, content')
        .eq('id', libraryItemId)
        .maybeSingle<MappedLibraryRow>();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        type: data.type,
        knowledgeStoragePath: data.knowledge_storage_path,
        metadata: data.content?.metadata ?? null,
      };
    },
  };
}
