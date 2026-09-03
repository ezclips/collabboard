import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE,
  knowledgePdfAreaImagePath,
  parseKnowledgePdfAreaProvenance,
} from '../../domain/knowledge/knowledgePdfAreaImagePolicy';
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
}

export interface KnowledgePdfAreaImageServeSession {
  readonly userId: string;
  canReadBoard(boardId: string): Promise<boolean>;
  /** Board-scoped lookup: a padlet on another board must read as absent. */
  findPadlet(padletId: string, boardId: string): Promise<KnowledgePdfAreaImageServeRow | null>;
  downloadAreaImage(objectPath: string): Promise<KnowledgeSourceRegionCropDownload>;
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
    if (parseKnowledgePdfAreaProvenance(padlet.metadata) === null) return notFound();

    // Re-derived, never read from stored metadata: a stored path would be a
    // client-writable field pointed at someone else's private object.
    const objectPath = knowledgePdfAreaImagePath(boardId, padletId);
    if (objectPath === null) return notFound();

    const downloadAttempt = await attempt(() => session.downloadAreaImage(objectPath));
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
        .select('id, board_id, metadata')
        .eq('id', padletId)
        .eq('board_id', boardId)
        .maybeSingle<PadletLookupRow>();
      if (error) throw error;
      if (!data) return null;
      return { id: data.id, boardId: data.board_id, metadata: data.metadata };
    },
    async downloadAreaImage(objectPath) {
      const { data, error } = await adminClient.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(objectPath);
      if (error) return { kind: isMissingObject(error) ? 'missing' : 'unavailable' };
      if (!data) return { kind: 'missing' };
      return { kind: 'ok', bytes: new Uint8Array(await data.arrayBuffer()) };
    },
  };
}
