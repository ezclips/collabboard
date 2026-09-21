import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeStorageGateway,
} from '@/lib/infra/knowledge/knowledgeIngestionAdapters';
import {
  RandomKnowledgeTranscriptUploadIdFactory,
  SupabaseKnowledgeTranscriptRepository,
} from '@/lib/infra/knowledge/knowledgeTranscriptAdapters';
import { createKnowledgeTranscriptPostHandler } from '@/lib/server/knowledge/knowledgeTranscriptRoute';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createTranscriptRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; the auth helper needs the resolved
    // synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

export const POST = createKnowledgeTranscriptPostHandler({
  async getAuthenticatedUserId() {
    const cookieStore = await cookies();
    const sessionClient = createTranscriptRouteClient(cookieStore);
    const {
      data: { user },
      error,
    } = await sessionClient.auth.getUser();

    if (error || !user) return null;
    return user.id;
  },

  createTranscriptDeps() {
    const adminClient = getSupabaseAdmin();
    return {
      // THE SAME authorizer, storage gateway and hasher as both upload paths.
      // A second copy of the board-permission predicate is exactly the drift
      // that ends with one path enforcing a rule another forgot.
      authorizer: new SupabaseKnowledgeBoardAuthorizer(adminClient as never),
      repository: new SupabaseKnowledgeTranscriptRepository(adminClient as never),
      storage: new SupabaseKnowledgeStorageGateway(adminClient as never),
      hasher: new NodeKnowledgeContentHasher(),
      ids: new RandomKnowledgeDocumentIdFactory(),
      uploads: new RandomKnowledgeTranscriptUploadIdFactory(),
    };
  },

  recordCleanupCandidate(entry) {
    // TELEMETRY, NOT GARBAGE COLLECTION. The superseded object is RETAINED so
    // an in-flight reader of the previous version can still fetch it. Nothing
    // here deletes anything, and nothing durable records the path -- a sweep
    // needs a grace period and a fresh reference check at deletion time, which
    // is followups item 19 and does not exist yet.
    console.warn('[knowledge] superseded transcript payload retained', entry);
  },
});
