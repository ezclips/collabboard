import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { asBoardId } from '../../domain/core/ids';
import {
  knowledgePdfAreaImageVariantPath,
  knowledgePdfAreaImageVariantUrl,
  parseKnowledgePdfAreaProvenance,
  type KnowledgePdfAreaImageVariant,
} from '../../domain/knowledge/knowledgePdfAreaImagePolicy';
import { UPLOAD_LIMITS } from '../../domain/storage/uploadLimits';
import { KNOWLEDGE_STORAGE_BUCKET } from '../../infra/knowledge/knowledgeIngestionAdapters';
import { SupabaseKnowledgeSourceReferenceWriteAuthorizer, type KnowledgeSourceReferenceWriteSupabaseClient }
  from '../../infra/knowledge/knowledgeSourceReferenceWriteAdapters';

/**
 * PATCH-182 -- write an EDITED area picture (a Draw-on-top composite or a crop)
 * into the private Knowledge bucket, beside the original crop.
 *
 * PRIVACY IS THE WHOLE POINT, so this route is deliberately not a general
 * writer. It is reachable only for a padlet that proves, through its own stored
 * provenance, that it IS a PDF-area image on a board the caller may edit; the
 * object path is derived from the two route parameters and a closed variant
 * set, never from the request body. Nothing here can write to `padlet-files`
 * or any other public bucket.
 *
 * The write is idempotent per variant: a new save overwrites the previous one
 * with `upsert`, which is what makes the returned URL's `v` the only thing that
 * changes for the browser.
 */

const EDIT_RATE_WINDOW_MS = 60 * 60 * 1000;
const IMAGE_EDITS_PER_HOUR = 120;

/**
 * The same in-memory fixed-window shape the upload route uses. Kept at MODULE
 * scope so the count survives across handler calls (the route factory is
 * invoked once per module load).
 */
const editRateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkEditRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = editRateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > EDIT_RATE_WINDOW_MS) {
    editRateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= IMAGE_EDITS_PER_HOUR) return false;
  entry.count += 1;
  return true;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function parseVariant(value: string | null): KnowledgePdfAreaImageVariant | null {
  return value === 'drawing' || value === 'base' ? value : null;
}

export interface KnowledgePdfAreaImageEditContext {
  readonly params: Promise<{ id: string; padletId: string }>;
}

export interface KnowledgePdfAreaImageEditRow {
  readonly id: string;
  readonly boardId: string;
  readonly metadata: unknown;
}

export interface KnowledgePdfAreaImageEditSession {
  readonly userId: string;
  /** EDIT, not read: this writes a private object, and a viewer must not. */
  canWriteBoard(boardId: string): Promise<boolean>;
  /** Board-scoped lookup: a padlet on another board must read as absent. */
  findPadlet(padletId: string, boardId: string): Promise<KnowledgePdfAreaImageEditRow | null>;
  uploadAreaImageVariant(objectPath: string, bytes: Uint8Array): Promise<boolean>;
}

export interface KnowledgePdfAreaImageEditDependencies {
  getAuthenticatedSession(): Promise<KnowledgePdfAreaImageEditSession | null>;
}

const json = (error: string, status: number) => NextResponse.json({ error }, { status });
const badRequest = () => json('Invalid request', 400);
const unauthorized = () => json('Unauthorized', 401);
const forbidden = () => json('Forbidden', 403);
const notFound = () => json('Not found', 404);
const payloadTooLarge = () => json('Image is too large', 413);
const tooManyRequests = () => json('Too many edits. Try again in a while.', 429);
const unavailable = () => json('Unavailable', 503);

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false };
  }
}

export function createKnowledgePdfAreaImageEditHandler(
  deps: KnowledgePdfAreaImageEditDependencies,
) {
  return async function PUT(
    request: Request,
    context: KnowledgePdfAreaImageEditContext,
  ): Promise<NextResponse> {
    const sessionAttempt = await attempt(() => deps.getAuthenticatedSession());
    if (!sessionAttempt.ok) return unavailable();
    const session = sessionAttempt.value;
    if (!session) return unauthorized();

    // Per USER, before the body is read: an over-quota caller cannot make the
    // server buffer an image just to be told no.
    if (!checkEditRateLimit(session.userId)) return tooManyRequests();

    const { id: boardId, padletId } = await context.params;

    const allowedAttempt = await attempt(() => session.canWriteBoard(boardId));
    if (!allowedAttempt.ok) return unavailable();
    if (!allowedAttempt.value) return forbidden();

    const padletAttempt = await attempt(() => session.findPadlet(padletId, boardId));
    if (!padletAttempt.ok) return unavailable();
    const padlet = padletAttempt.value;
    if (!padlet) return notFound();
    if (padlet.boardId !== boardId) return notFound();

    // The card's own provenance is the authorisation to write at all. Without
    // it this route would become a general writer to the private bucket.
    if (parseKnowledgePdfAreaProvenance(padlet.metadata) === null) return notFound();

    const variant = parseVariant(new URL(request.url).searchParams.get('variant'));
    if (variant === null) return badRequest();

    // The DECLARED size, before `arrayBuffer()` reads the body into memory.
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > UPLOAD_LIMITS.image) {
      return payloadTooLarge();
    }

    const bodyAttempt = await attempt(async () => new Uint8Array(await request.arrayBuffer()));
    if (!bodyAttempt.ok) return badRequest();
    const bytes = bodyAttempt.value;

    // The ACTUAL size, after reading but before anything is stored.
    if (bytes.byteLength > UPLOAD_LIMITS.image) return payloadTooLarge();

    // The editors always produce PNG; anything else is not ours to store.
    if (!hasPngSignature(bytes)) return badRequest();

    // Derived from validated ids only. Never from the request body.
    const objectPath = knowledgePdfAreaImageVariantPath(boardId, padletId, variant);
    if (objectPath === null) return notFound();

    const uploadAttempt = await attempt(() => session.uploadAreaImageVariant(objectPath, bytes));
    if (!uploadAttempt.ok || !uploadAttempt.value) return unavailable();

    const url = knowledgePdfAreaImageVariantUrl(boardId, padletId, variant, Date.now());
    if (url === null) return notFound();
    return NextResponse.json({ url }, { status: 200 });
  };
}

// --- Real Supabase/Storage-backed session ---------------------------------

interface PadletLookupRow {
  readonly id: string;
  readonly board_id: string;
  readonly metadata: unknown;
}

/**
 * `sessionClient` proves identity and board WRITE access through the same
 * authorizer the area-image creation route uses; `adminClient` performs the
 * storage work the browser role deliberately cannot.
 */
export function createRealKnowledgePdfAreaImageEditSession(
  sessionClient: unknown,
  adminClient: SupabaseClient,
  userId: string,
): KnowledgePdfAreaImageEditSession {
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
    async uploadAreaImageVariant(objectPath, bytes) {
      // The SAME private bucket the source PDF and the original crop live in.
      // Never padlet-files, never images, never thumbnails -- all public.
      const { error } = await adminClient.storage
        .from(KNOWLEDGE_STORAGE_BUCKET)
        .upload(objectPath, Buffer.from(bytes), {
          contentType: 'image/png',
          upsert: true,
        });
      return !error;
    },
  };
}
