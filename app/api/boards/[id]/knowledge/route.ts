import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeIngestionRepository,
  SupabaseKnowledgeStorageGateway,
} from '@/lib/infra/knowledge/knowledgeIngestionAdapters';
import { createKnowledgeUploadPostHandler } from '@/lib/server/knowledge/knowledgeUploadRoute';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export const POST = createKnowledgeUploadPostHandler({
  async getAuthenticatedUserId() {
    const cookieStore = await cookies();
    const sessionClient = createRouteHandlerClient({ cookies: async () => cookieStore });
    const {
      data: { user },
      error,
    } = await sessionClient.auth.getUser();

    if (error || !user) return null;
    return user.id;
  },

  createIngestionDeps() {
    const adminClient = getSupabaseAdmin();
    return {
      authorizer: new SupabaseKnowledgeBoardAuthorizer(adminClient as never),
      repository: new SupabaseKnowledgeIngestionRepository(adminClient as never),
      storage: new SupabaseKnowledgeStorageGateway(adminClient as never),
      hasher: new NodeKnowledgeContentHasher(),
      ids: new RandomKnowledgeDocumentIdFactory(),
    };
  },
});
