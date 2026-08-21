import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const KNOWLEDGE_STORAGE_BUCKET = 'knowledge-documents';
const SIGNED_URL_EXPIRY_SECONDS = 60;
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

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      .select('storage_path, original_filename, mime_type, processing_status')
      .eq('id', documentId)
      .eq('board_id', boardId)
      .maybeSingle();

    if (documentError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    if (!document || document.processing_status !== 'ready') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: signed, error: signedError } = await adminClient.storage
      .from(KNOWLEDGE_STORAGE_BUCKET)
      .createSignedUrl(document.storage_path, SIGNED_URL_EXPIRY_SECONDS);

    if (signedError || !signed?.signedUrl) {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }

    return NextResponse.redirect(signed.signedUrl, {
      status: 307,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  }
}
