import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createKnowledgePdfAreaImageServeHandler,
  createRealKnowledgePdfAreaImageServeSession,
} from '@/lib/server/knowledge/knowledgePdfAreaImageServeRoute';
import {
  createKnowledgePdfAreaImageEditHandler,
  createRealKnowledgePdfAreaImageEditSession,
} from '@/lib/server/knowledge/knowledgePdfAreaImageEditRoute';
import { isGuestUser } from '@/lib/domain/auth/guest';

export const runtime = 'nodejs';

export const GET = createKnowledgePdfAreaImageServeHandler({
  async getAuthenticatedSession() {
    const cookieStore = await cookies();
    const sessionClient = createRouteHandlerClient({
      cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
    });
    const { data: { user }, error } = await sessionClient.auth.getUser();
    if (error || !user) return null;
    return createRealKnowledgePdfAreaImageServeSession(sessionClient, getSupabaseAdmin(), user.id);
  },
});

export const PUT = createKnowledgePdfAreaImageEditHandler({
  async getAuthenticatedSession() {
    const cookieStore = await cookies();
    const sessionClient = createRouteHandlerClient({
      cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
    });
    const { data: { user }, error } = await sessionClient.auth.getUser();
    if (error || !user) return null;
    // PATCH-358. The edit path uploads a crop into the owner's storage, so a
    // guest is refused. The GET serve path above is a read and is not guarded.
    if (isGuestUser(user)) return { guest: true };
    return createRealKnowledgePdfAreaImageEditSession(sessionClient, getSupabaseAdmin(), user.id);
  },
});
