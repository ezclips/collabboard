import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE,
  parseKnowledgePdfAreaProvenance,
} from '../../domain/knowledge/knowledgePdfAreaImagePolicy';
import { KNOWLEDGE_STORAGE_BUCKET } from '../../infra/knowledge/knowledgeIngestionAdapters';
import type { KnowledgeSourceRegionCropDownload } from '../knowledge/knowledgeSourceRegionCropRoute';

/**
 * IMAGE-LIBRARY-DURABLE-PREVIEW -- the address a PDF area crop keeps after the
 * card it was cut from is gone.
 *
 * The board route beside this one (`/api/boards/{id}/padlets/{padletId}/image`)
 * proves its authority from the PADLET's own provenance. That is correct for a
 * board card and is what makes revocation real there -- but it means the URL
 * dies with the placement, while the Library object it fed deliberately does
 * not. This route is the second address of the SAME private object: no copy, no
 * second bucket, no signed URL, no public token.
 *
 * The two routes are deliberately NOT merged. This one is owner-scoped; the
 * board one is board-scoped. A collaborator may read an image on a board they
 * were invited to without owning the Library row behind it, so replacing the
 * board URL with this one would take that image away from them.
 *
 * AUTHORISATION IS THE INVOKING USER'S OWN. The row is read through the
 * caller's client, so `library_items`' owner-scoped RLS is what decides -- not
 * a service-role lookup, and not `is_public`, which grants no read policy at
 * all today and must never become a way to hand out someone's private PDF.
 * Service authority appears only AFTER that decision, to fetch bytes the user
 * has already been proved entitled to.
 *
 * Nothing about the object's location comes from the request. The only input is
 * a library item id; the path is read from `knowledge_storage_path`, a column
 * no browser role may write.
 */

export interface LibraryImageServeContext {
  readonly params: Promise<{ libraryItemId: string }>;
}

export interface LibraryImageServeRow {
  readonly id: string;
  readonly type: string | null;
  /** Server-owned. The one field that says where the durable object lives. */
  readonly knowledgeStoragePath: string | null;
  /** The durable snapshot's metadata, carrying the PDF-area provenance. */
  readonly metadata: unknown;
}

export interface LibraryImageServeSession {
  readonly userId: string;
  /**
   * Reads through the CALLER's authority. A row belonging to another user must
   * come back null here -- this is the authorisation, not a filter applied to
   * something a privileged client already fetched.
   */
  findOwnLibraryItem(libraryItemId: string): Promise<LibraryImageServeRow | null>;
  downloadDurableImage(objectPath: string): Promise<KnowledgeSourceRegionCropDownload>;
}

export interface LibraryImageServeDependencies {
  getAuthenticatedSession(): Promise<LibraryImageServeSession | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (error: string, status: number) => NextResponse.json({ error }, { status });
const unauthorized = () => json('Unauthorized', 401);
const notFound = () => json('Not found', 404);
const unavailable = () => json('Unavailable', 503);

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false };
  }
}

export function createLibraryImageServeHandler(deps: LibraryImageServeDependencies) {
  return async function GET(_request: Request, context: LibraryImageServeContext) {
    const sessionAttempt = await attempt(() => deps.getAuthenticatedSession());
    if (!sessionAttempt.ok) return unavailable();
    const session = sessionAttempt.value;
    if (!session) return unauthorized();

    const { libraryItemId } = await context.params;
    if (typeof libraryItemId !== 'string' || !UUID.test(libraryItemId)) return notFound();

    const itemAttempt = await attempt(() => session.findOwnLibraryItem(libraryItemId));
    if (!itemAttempt.ok) return unavailable();
    const item = itemAttempt.value;
    // Another user's row, or none: indistinguishable on purpose. A 403 here
    // would confirm that someone else's library item exists.
    if (!item) return notFound();

    if (item.type !== 'image') return notFound();

    // The durable snapshot must still say it is a PDF area crop. Without this
    // the route would serve the private bucket for any row whose owner had
    // written a path into it -- which is precisely why the path column is not
    // writable by browsers, and why this check stands even so.
    if (parseKnowledgePdfAreaProvenance(item.metadata) === null) return notFound();

    // Server-owned, or absent. A legacy row that could not be safely repaired
    // keeps NULL here and reads as "no durable address", never as a guess.
    const objectPath = item.knowledgeStoragePath;
    if (typeof objectPath !== 'string' || objectPath.length === 0) return notFound();

    const downloadAttempt = await attempt(() => session.downloadDurableImage(objectPath));
    if (!downloadAttempt.ok) return unavailable();
    const download = downloadAttempt.value;
    if (download.kind === 'missing') return notFound();
    if (download.kind === 'unavailable') return unavailable();

    const bytes = download.bytes;
    return new NextResponse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      {
        status: 200,
        headers: {
          'Content-Type': KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE,
          // Same discipline as the board route: private, and never retained, so
          // a revoked or transferred object leaves nothing re-displayable.
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

interface LibraryLookupRow {
  readonly id: string;
  readonly type: string | null;
  readonly knowledge_storage_path: string | null;
  readonly content: { readonly metadata?: unknown } | null;
}

/** Minimal shape of the caller's own PostgREST client, for the RLS-bound read. */
export interface LibraryImageSessionClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle<T>(): PromiseLike<{ data: T | null; error: unknown }>;
      };
    };
  };
}

export function createRealLibraryImageServeSession(
  sessionClient: LibraryImageSessionClient,
  adminClient: SupabaseClient,
  userId: string,
): LibraryImageServeSession {
  return {
    userId,
    async findOwnLibraryItem(libraryItemId) {
      // The CALLER's client, deliberately. `Users can view their own library
      // items` is the authorisation; no `user_id` filter is written here
      // because a filter can be forgotten and a policy cannot.
      const { data, error } = await sessionClient
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
        metadata: data.content?.metadata ?? null,
      };
    },
    async downloadDurableImage(objectPath) {
      const { data, error } = await adminClient.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(objectPath);
      if (error) return { kind: isMissingObject(error) ? 'missing' : 'unavailable' };
      if (!data) return { kind: 'missing' };
      return { kind: 'ok', bytes: new Uint8Array(await data.arrayBuffer()) };
    },
  };
}
