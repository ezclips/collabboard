import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createKnowledgePdfAreaImageHandler,
  createRealKnowledgePdfAreaImageSession,
} from '@/lib/server/knowledge/knowledgePdfAreaImageRoute';

export const runtime = 'nodejs';

export const POST = createKnowledgePdfAreaImageHandler({
  async getAuthenticatedSession() {
    const cookieStore = await cookies();
    const sessionClient = createRouteHandlerClient({
      cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
    });
    const { data: { user }, error } = await sessionClient.auth.getUser();
    if (error || !user) return null;
    return createRealKnowledgePdfAreaImageSession(sessionClient, getSupabaseAdmin(), user.id);
  },
});
