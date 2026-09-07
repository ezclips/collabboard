import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createLibraryImageServeHandler,
  createRealLibraryImageServeSession,
  type LibraryImageSessionClient,
} from '@/lib/server/collabboard/libraryImageServeRoute';

export const runtime = 'nodejs';

export const GET = createLibraryImageServeHandler({
  async getAuthenticatedSession() {
    const cookieStore = await cookies();
    const sessionClient = createRouteHandlerClient({
      cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
    });
    const { data: { user }, error } = await sessionClient.auth.getUser();
    if (error || !user) return null;
    // The session client is what reads the row, so owner RLS is the authority.
    // The admin client appears only to fetch bytes after that read succeeded.
    return createRealLibraryImageServeSession(
      sessionClient as unknown as LibraryImageSessionClient,
      getSupabaseAdmin(),
      user.id,
    );
  },
});
