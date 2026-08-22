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
