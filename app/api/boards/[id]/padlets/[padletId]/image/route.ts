import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createKnowledgePdfAreaImageServeHandler,
  createRealKnowledgePdfAreaImageServeSession,
} from '@/lib/server/knowledge/knowledgePdfAreaImageServeRoute';

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
