import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { handleKnowledgeWarmProxy } from '@/lib/server/knowledge/knowledgeSearchProxyRoute';
import type { KnowledgeSearchProxySessionClient } from '@/lib/server/knowledge/knowledgeSearchProxyRoute';

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createKnowledgeRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({ cookies: () => cookieStore as unknown as ReturnType<typeof cookies> });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const cookieStore = await cookies();
  const sessionClient = createKnowledgeRouteClient(cookieStore);
  return handleKnowledgeWarmProxy(
    request,
    context,
    sessionClient as unknown as KnowledgeSearchProxySessionClient,
  );
}
