interface BoardOwnerResult {
  readonly data: { readonly id: string } | null;
  readonly error: unknown;
}

interface BoardOwnerQuery extends PromiseLike<BoardOwnerResult> {
  eq(column: string, value: string): BoardOwnerQuery;
  maybeSingle(): PromiseLike<BoardOwnerResult>;
}

export interface KnowledgeBoardReadAuthorizationClient {
  from(table: 'boards'): { select(columns: string): BoardOwnerQuery };
  rpc(
    functionName: 'is_board_member',
    args: { board_uuid: string; user_uuid: string },
  ): PromiseLike<{ data: boolean | null; error: unknown }>;
}

/**
 * Knowledge read access mirrors the RLS policy: board owner OR
 * public.is_board_member(board_id, auth.uid()). Do not use
 * requireBoardPermission/get_board_permission: those belong to the legacy
 * canvas/workspace model, whose path selects canvases.workspace_id, absent from
 * the current schema. Mutation/editor authorization is also wrong for reads:
 * viewer collaborators are valid readers because is_board_member has no editor
 * requirement. This runs as the authenticated user with RLS applicable;
 * lookup/RPC errors throw so authorization fails closed.
 */
export async function canReadBoardKnowledge(
  client: KnowledgeBoardReadAuthorizationClient,
  boardId: string,
  userId: string,
): Promise<boolean> {
  const owner = await client
    .from('boards')
    .select('id')
    .eq('id', boardId)
    .eq('user_id', userId)
    .maybeSingle();

  if (owner.error) throw owner.error;
  if (owner.data) return true;

  const member = await client.rpc('is_board_member', {
    board_uuid: boardId,
    user_uuid: userId,
  });
  if (member.error) throw member.error;
  return member.data === true;
}
