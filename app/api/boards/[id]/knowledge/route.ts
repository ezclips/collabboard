import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { requireBoardPermission } from '@/lib/auth/permissions';
import {
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeIngestionRepository,
  SupabaseKnowledgeStorageGateway,
} from '@/lib/infra/knowledge/knowledgeIngestionAdapters';
import { SupabaseKnowledgeDocumentReadRepository } from '@/lib/infra/knowledge/knowledgeReadAdapters';
import { createKnowledgeListGetHandler } from '@/lib/server/knowledge/knowledgeListRoute';
import { createKnowledgeUploadPostHandler } from '@/lib/server/knowledge/knowledgeUploadRoute';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

async function createKnowledgeAuthClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing public Supabase configuration');
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Cookie writes can be unavailable in read-only request contexts.
        }
      },
    },
  });
}

export const GET = createKnowledgeListGetHandler({
  async getAuthenticatedSession() {
    const sessionClient = await createKnowledgeAuthClient();
    const {
      data: { user },
      error,
    } = await sessionClient.auth.getUser();

    if (error || !user) return null;

    return {
      async canViewBoard(boardId) {
        const access = await requireBoardPermission(sessionClient, boardId, user.id, 'reader');
        return access.allowed;
      },
    };
  },

  createRepository() {
    const adminClient = getSupabaseAdmin();
    return new SupabaseKnowledgeDocumentReadRepository(adminClient as never);
  },
});

export const POST = createKnowledgeUploadPostHandler({
  async getAuthenticatedUserId() {
    const sessionClient = await createKnowledgeAuthClient();
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
