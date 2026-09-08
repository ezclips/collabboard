import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createKnowledgePdfAreaLibraryReuseHandler,
  createRealKnowledgePdfAreaLibraryReuseSession,
} from '@/lib/server/knowledge/knowledgePdfAreaLibraryReuseRoute';

export const runtime = 'nodejs';

export const POST = createKnowledgePdfAreaLibraryReuseHandler({
  async getAuthenticatedSession() {
    const cookieStore = await cookies();
    const sessionClient = createRouteHandlerClient({
      cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
    });
    const { data: { user }, error } = await sessionClient.auth.getUser();
    if (error || !user) return null;
    return createRealKnowledgePdfAreaLibraryReuseSession(sessionClient, getSupabaseAdmin(), user.id);
  },
});
