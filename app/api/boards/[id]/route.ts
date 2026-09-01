import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { asBoardId, asUserId } from '@/lib/domain/core/ids';
import { deleteKnowledgeBoard } from '@/lib/domain/knowledge/knowledgeDeletion';
import {
  SupabaseBoardDeletionAuthorizer,
  SupabaseKnowledgeDeletionRepository,
} from '@/lib/infra/knowledge/knowledgeDeletionAdapters';
import { SupabaseKnowledgeStorageGateway } from '@/lib/infra/knowledge/knowledgeIngestionAdapters';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function statusFor(code: string): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'permission_denied':
      return 403;
    case 'validation':
      return 400;
    default:
      return 500;
  }
}

/**
 * Physical board deletion boundary. Dashboard trash remains a soft delete;
 * callers that permanently delete a board must come through this server path
 * so Knowledge Storage artifacts are captured before the DB cascade.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies();
    // createRouteHandlerClient calls .get() on whatever this returns, synchronously.
    // An async wrapper hands it a Promise, so the client threw
    // "nextCookies.get is not a function" before any auth check could run. This is
    // the same adapter form the repository's other route handlers use.
    const sessionClient = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const adminClient = getSupabaseAdmin();
    const result = await deleteKnowledgeBoard(
      {
        authorizer: new SupabaseBoardDeletionAuthorizer(adminClient as never),
        repository: new SupabaseKnowledgeDeletionRepository(adminClient as never),
        storage: new SupabaseKnowledgeStorageGateway(adminClient as never),
      },
      { boardId: asBoardId(id), userId: asUserId(user.id) },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error.code },
        { status: statusFor(result.error.code) },
      );
    }

    return NextResponse.json(result.value, { status: 200 });
  } catch (error: unknown) {
    console.error('DELETE /api/boards/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
