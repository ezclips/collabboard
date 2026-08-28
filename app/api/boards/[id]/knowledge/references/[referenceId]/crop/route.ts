import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createKnowledgeSourceRegionCropHandler,
  createRealKnowledgeSourceRegionCropSession,
} from '@/lib/server/knowledge/knowledgeSourceRegionCropRoute';

export const runtime = 'nodejs';

export const GET = createKnowledgeSourceRegionCropHandler({
  async getAuthenticatedSession() {
    const cookieStore = await cookies();
    const sessionClient = createRouteHandlerClient({
      cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
    });
    const { data: { user }, error } = await sessionClient.auth.getUser();
    if (error || !user) return null;
    return createRealKnowledgeSourceRegionCropSession(sessionClient, getSupabaseAdmin(), user.id);
  },
});
