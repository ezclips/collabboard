import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  KNOWLEDGE_DERIVATIVE_CONTENT_TYPE,
  knowledgePageDerivativePath,
} from '@/lib/domain/knowledge/knowledgePdfRenderPolicy';
import { KNOWLEDGE_STORAGE_BUCKET } from '@/lib/infra/knowledge/knowledgeIngestionAdapters';
import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createKnowledgeRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; auth-helper runtime requires the resolved synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

/** Plain decimal only. Number() alone accepts '4.0', '1e3', '+4', ' 4' and '04',
 * so the segment is matched as TEXT before it is ever converted. */
const PAGE_NUMBER_SEGMENT = /^[1-9][0-9]*$/;

function parsePageNumber(segment: string): number | null {
  if (!PAGE_NUMBER_SEGMENT.test(segment)) return null;
  const pageNumber = Number(segment);
  // A long run of digits passes the regex but loses precision as a double.
  return Number.isSafeInteger(pageNumber) ? pageNumber : null;
}

/**
 * Storage's not-found signal, read the way storage-js itself reads it.
 * `download()` passes `noResolveJson` -- the exact branch storage-js's handleError
 * skips -- so a missing object is never a StorageApiError carrying `status`; it is
 * a StorageUnknownError wrapping the raw Response. The SDK's own `exists()`
 * classifies that shape by `originalError.status` in [400, 404], 400 because older
 * storage-api reported a missing object that way. Reusing the same field keeps one
 * definition of "absent" rather than inventing a second.
 */
const MISSING_OBJECT_STATUSES: ReadonlySet<number> = new Set([400, 404]);

function isMissingObject(error: unknown): boolean {
  const statusOf = (value: unknown): number | null => {
    const raw = typeof value === 'object' && value !== null ? (value as { status?: unknown }).status : null;
    return typeof raw === 'number' ? raw : null;
  };
  const status = statusOf(error)
    ?? statusOf((error as { originalError?: unknown } | null)?.originalError);
  return status !== null && MISSING_OBJECT_STATUSES.has(status);
}

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
const unavailable = () => NextResponse.json({ error: 'Unavailable' }, { status: 503 });

/**
 * One worker-generated page image, streamed under the caller's own session. Not a
 * signed URL: authorization runs on every request, so a revoked collaborator loses
 * access at once rather than when a token expires, and no bearer URL can leak.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string; pageNumber: string }> },
) {
  try {
    const cookieStore = await cookies();
    const sessionClient = createKnowledgeRouteClient(cookieStore);
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: boardId, documentId, pageNumber: pageSegment } = await context.params;

    const client = sessionClient as unknown as KnowledgeBoardReadAuthorizationClient;
    let allowed: boolean;
    // A lookup or RPC error throws, so authorization fails closed as a 503.
    try { allowed = await canReadBoardKnowledge(client, boardId, user.id); }
    catch { return unavailable(); }
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const pageNumber = parsePageNumber(pageSegment);
    if (pageNumber === null) return NextResponse.json({ error: 'Invalid page' }, { status: 400 });

    // The server derives the object key from domain identity alone; a crafted id
    // yields null and is rejected, never repaired into a valid-looking path.
    const objectPath = knowledgePageDerivativePath(boardId, documentId, pageNumber);
    if (objectPath === null) return notFound();

    const adminClient = getSupabaseAdmin();
    // storage_path is deliberately not selected: this route serves the derivative.
    const { data: document, error: documentError } = await adminClient
      .from('knowledge_documents')
      .select('page_count, processing_status')
      .eq('id', documentId)
      .eq('board_id', boardId)
      .maybeSingle();

    if (documentError) return unavailable();
    // Both filters run together, so another board's document is indistinguishable
    // here from one that does not exist.
    if (!document) return notFound();
    if (document.processing_status !== 'ready') {
      return NextResponse.json({ error: 'Knowledge document is not ready' }, { status: 409 });
    }

    // The persisted count is the only page authority -- no PDF is opened, and an
    // object's existence is never taken as proof that a page exists.
    const pageCount = document.page_count;
    if (typeof pageCount !== 'number' || !Number.isInteger(pageCount) || pageNumber > pageCount) {
      return notFound();
    }

    const { data: blob, error: storageError } = await adminClient.storage
      .from(KNOWLEDGE_STORAGE_BUCKET)
      .download(objectPath);

    // Absence is an ordinary text-only answer, never an ingestion failure, while
    // an unreachable backend is a real outage. Collapsing them would either hide
    // an outage or make a text-only document look broken.
    if (storageError) return isMissingObject(storageError) ? notFound() : unavailable();
    if (!blob) return notFound();

    return new NextResponse(await blob.arrayBuffer(), {
      status: 200,
      headers: {
        // Canonical policy, never the Blob's own type or Storage metadata.
        'Content-Type': KNOWLEDGE_DERIVATIVE_CONTENT_TYPE,
        // A1 re-renders overwrite this exact path (upsert), so it is a mutable
        // slot, not an immutable content address: its stored cache-control of
        // 31536000 must never reach the browser.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return unavailable();
  }
}
