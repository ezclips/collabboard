import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createCreateKnowledgeSourceReferenceCommand } from '@/lib/domain/knowledge/knowledgeSourceReferenceWrite';
import {
  SupabaseKnowledgeSourceReferenceValidationRepository,
  SupabaseKnowledgeSourceReferenceWriteAuthorizer,
  SupabaseKnowledgeSourceReferenceWriter,
  nodeKnowledgeQuoteHasher,
} from '@/lib/infra/knowledge/knowledgeSourceReferenceWriteAdapters';
import type { KnowledgeSourceReferenceWriteSupabaseClient } from '@/lib/infra/knowledge/knowledgeSourceReferenceWriteAdapters';
import { createKnowledgeSourceReferencePostHandler } from '@/lib/server/knowledge/knowledgeSourceReferenceRoute';

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createKnowledgeRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; auth-helper runtime requires the resolved synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

export const POST = createKnowledgeSourceReferencePostHandler({
  async getAuthenticatedSession() {
    const cookieStore = await cookies();
    const sessionClient = createKnowledgeRouteClient(cookieStore);
    const {
      data: { user },
      error,
    } = await sessionClient.auth.getUser();

    if (error || !user) return null;

    // Deliberately NOT an admin client. The same authenticated authority that
    // proved the user's identity performs every lookup and the final insert, so
    // source_references RLS still evaluates behind the explicit owner/editor
    // check rather than being bypassed by elevated credentials.
    const writeClient = sessionClient as unknown as KnowledgeSourceReferenceWriteSupabaseClient;

    return {
      userId: user.id,
      createSourceReference: createCreateKnowledgeSourceReferenceCommand({
        authorizer: new SupabaseKnowledgeSourceReferenceWriteAuthorizer(writeClient),
        repository: new SupabaseKnowledgeSourceReferenceValidationRepository(writeClient),
        writer: new SupabaseKnowledgeSourceReferenceWriter(writeClient),
        hasher: nodeKnowledgeQuoteHasher,
      }),
    };
  },
});
