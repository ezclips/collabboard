import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createKnowledgeRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; auth-helper runtime requires the resolved synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    const cookieStore = await cookies();
    const sessionClient = createKnowledgeRouteClient(cookieStore);
    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser();

    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: boardId, documentId } = await context.params;
    const owner = await sessionClient
      .from('boards')
      .select('id')
      .eq('id', boardId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (owner.error) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

    let allowed = owner.data !== null;
    if (!allowed) {
      const member = await sessionClient.rpc('is_board_member', {
        board_uuid: boardId,
        user_uuid: user.id,
      });
      if (member.error) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
      allowed = member.data === true;
    }
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const adminClient = getSupabaseAdmin();
    const { data: document, error: documentError } = await adminClient
      .from('knowledge_documents')
      .select('id, original_filename, page_count, processing_status')
      .eq('id', documentId)
      .eq('board_id', boardId)
      .maybeSingle();
    if (documentError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (document.processing_status !== 'ready') {
      return NextResponse.json({ error: 'Knowledge document is not ready' }, { status: 409 });
    }

    const { data: pages, error: pagesError } = await adminClient
      .from('knowledge_pages')
      .select('page_number, text, width_points, height_points, rotation')
      .eq('document_id', document.id)
      .order('page_number', { ascending: true });
    if (pagesError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

    return NextResponse.json(
      {
        document: {
          id: document.id,
          originalFilename: document.original_filename,
          pageCount: document.page_count,
        },
        // P6J-F9-A2b: the geometry the worker already persisted, so the reader
        // can reserve each page image's aspect ratio before the derivative loads.
        pages: (pages ?? []).map((page: {
          page_number: number; text: string;
          width_points: number | null; height_points: number | null; rotation: number | null;
        }) => ({
          pageNumber: page.page_number,
          text: page.text,
          widthPoints: page.width_points,
          heightPoints: page.height_points,
          rotation: page.rotation,
        })),
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  }
}
