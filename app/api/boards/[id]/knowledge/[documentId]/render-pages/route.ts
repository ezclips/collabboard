import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * PDF-R1 -- ask for a document's page visuals to be (re)rendered.
 *
 * This route REQUESTS work; it never performs it. No PDF.js, no rasterisation,
 * no Storage write: rendering is worker-only and stays that way. All this does
 * is record that a reader wants the visuals, which the worker discovers through
 * its own lifecycle.
 *
 * A viewer may call it. Recovering a derived picture of a document you are
 * already allowed to read is not a board mutation -- nothing shared changes,
 * and the caller chooses no path, no renderer and no options.
 */

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createRenderRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

/** What a browser may know about the render lifecycle. Never lease internals. */
type RenderState = 'complete' | 'in_progress' | 'accepted' | 'unavailable' | 'not_ready';

interface RenderStatusRow {
  readonly processing_status: string | null;
  readonly derivatives_requested_at: string | null;
  readonly derivatives_rendered_at: string | null;
  readonly derivatives_error: string | null;
}

/**
 * Derives the one word the UI needs.
 *
 * `derivatives_error` is read as a BOOLEAN only -- its text is a worker reason
 * code and never travels to a browser. The lease token and its expiry are not
 * selected at all, so they cannot leak by accident.
 */
function renderStateOf(row: RenderStatusRow): RenderState {
  if (row.processing_status !== 'ready') return 'not_ready';
  if (row.derivatives_requested_at !== null) return 'in_progress';
  if (row.derivatives_rendered_at !== null) return 'complete';
  return row.derivatives_error !== null ? 'unavailable' : 'accepted';
}

type SessionClient = ReturnType<typeof createRenderRouteClient>;

async function authorize(
  boardId: string,
): Promise<{ ok: true; userId: string; client: SessionClient } | { ok: false; response: NextResponse }> {
  const cookieStore = await cookies();
  const sessionClient = createRenderRouteClient(cookieStore);
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  let allowed: boolean;
  try {
    allowed = await canReadBoardKnowledge(
      sessionClient as unknown as KnowledgeBoardReadAuthorizationClient,
      boardId,
      user.id,
    );
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Unavailable' }, { status: 503 }) };
  }
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, client: sessionClient };
}

/**
 * Board-scoped status, or null when this board has no such document.
 *
 * Both filters run together, so another board's document is indistinguishable
 * from one that does not exist.
 */
async function readStatus(boardId: string, documentId: string) {
  const admin = getSupabaseAdmin();
  return admin
    .from('knowledge_documents')
    // Deliberately no lease token and no lease expiry.
    .select('processing_status, derivatives_requested_at, derivatives_rendered_at, derivatives_error')
    .eq('id', documentId)
    .eq('board_id', boardId)
    .maybeSingle();
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    const { id: boardId, documentId } = await context.params;
    const authorized = await authorize(boardId);
    if (!authorized.ok) return authorized.response;

    const before = await readStatus(boardId, documentId);
    if (before.error) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    if (!before.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (before.data.processing_status !== 'ready') {
      return NextResponse.json({ state: 'not_ready' as const }, { status: 409 });
    }

    /**
     * The request goes through the RPC, not an UPDATE, because the function
     * re-proves board readability itself. A route is the wrong place for that
     * to be the only check.
     *
     * Called with the CALLER'S session, never the admin client: the function
     * reads auth.uid() to prove readability, and a service-role call has no
     * uid at all -- so an admin call would be both rejected and, if it were
     * not, an authorization bypass.
     */
    const { data, error } = await authorized.client.rpc('request_knowledge_page_render', {
      p_document_id: documentId,
    });
    if (error) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

    const status = (data as { status?: string } | null)?.status;
    if (status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (status === 'not_ready') return NextResponse.json({ state: 'not_ready' as const }, { status: 409 });

    // Idempotent: asking again while a request is outstanding simply refreshes
    // it, so a client latch is a nicety rather than a correctness requirement.
    return NextResponse.json({ state: 'in_progress' as const }, { status: 202 });
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  }
}

/** Where the render has got to, in one safe word. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    const { id: boardId, documentId } = await context.params;
    const authorized = await authorize(boardId);
    if (!authorized.ok) return authorized.response;

    const { data, error } = await readStatus(boardId, documentId);
    if (error) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(
      { state: renderStateOf(data as RenderStatusRow) },
      // Lifecycle state changes without the document changing, so this answer
      // is never cached.
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  }
}
