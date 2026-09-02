import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { BoardId, UserId } from '../../domain/core/ids';
import { asBoardId, asUserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import {
  isBoardAiMessageContentValid,
  isBoardAiMessageRole,
  normalizeBoardAiThreadTitle,
  type AppendBoardAiMessageInput,
  type BoardAiMessage,
  type BoardAiThread,
  type CreateBoardAiThreadInput,
} from '../../domain/ai/boardAiChat';

/**
 * Private board chat persistence.
 *
 * Deliberately NOT built on the service-role client, unlike the settings AI
 * repositories: those hold credentials the service role must reach, while chat
 * is ordinary user-owned content read only as the authenticated user. That
 * makes RLS the real boundary rather than a second opinion, and follows
 * `postsRepository`, whose client is the caller's session.
 *
 * Every read and write is scoped by userId AND boardId, and a thread is
 * addressed by all three of userId/boardId/threadId. There is deliberately no
 * `getThread(threadId)`: an id-only read is the shape that leaks across users
 * the moment someone forgets a filter. The scoping is defence in depth -- RLS
 * refuses the same rows independently.
 */

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface ThreadRow {
  readonly id: string; readonly board_id: string; readonly user_id: string;
  readonly title: string | null; readonly created_at: string; readonly updated_at: string;
}

interface MessageRow {
  readonly id: string; readonly thread_id: string; readonly role: string; readonly content: string;
  readonly provider: string | null; readonly model: string | null;
  readonly context: unknown; readonly citations: unknown; readonly created_at: string;
}

type QueryResult<T> = { data: readonly T[] | null; error: SupabaseErrorLike | null };

interface SelectQuery<T> extends PromiseLike<QueryResult<T>> {
  eq(column: string, value: unknown): SelectQuery<T>;
  order(column: string, options: { ascending: boolean }): SelectQuery<T>;
  maybeSingle(): Promise<{ data: T | null; error: SupabaseErrorLike | null }>;
}

interface InsertQuery<T> {
  select(columns: string): { single(): Promise<{ data: T | null; error: SupabaseErrorLike | null }> };
}

interface UpdateQuery {
  eq(column: string, value: unknown): UpdateQuery & PromiseLike<{ error: SupabaseErrorLike | null }>;
}

interface ThreadsTable {
  select(columns: string): SelectQuery<ThreadRow>;
  insert(row: Record<string, unknown>): InsertQuery<ThreadRow>;
  update(payload: Record<string, unknown>): UpdateQuery;
}

interface MessagesTable {
  select(columns: string): SelectQuery<MessageRow>;
  insert(row: Record<string, unknown>): InsertQuery<MessageRow>;
}

export interface BoardAiChatSupabaseClient {
  from(table: 'board_ai_threads'): ThreadsTable;
  from(table: 'board_ai_messages'): MessagesTable;
}

const THREAD_COLUMNS = 'id, board_id, user_id, title, created_at, updated_at';
const MESSAGE_COLUMNS = 'id, thread_id, role, content, provider, model, context, citations, created_at';

function toThread(row: ThreadRow): BoardAiThread {
  return {
    id: row.id,
    boardId: asBoardId(row.board_id),
    userId: asUserId(row.user_id),
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * An unrecognised persisted role is dropped rather than coerced: the CHECK
 * constraint makes it unreachable, and inventing a role for a row nobody can
 * explain is worse than omitting it.
 */
function toMessage(row: MessageRow): BoardAiMessage | null {
  if (!isBoardAiMessageRole(row.role)) return null;
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    provider: row.provider,
    model: row.model,
    context: (row.context ?? null) as BoardAiMessage['context'],
    citations: (row.citations ?? null) as BoardAiMessage['citations'],
    createdAt: row.created_at,
  };
}

export class SupabaseBoardAiThreadRepository {
  constructor(private readonly client: BoardAiChatSupabaseClient) {}

  async createThread(
    userId: UserId,
    boardId: BoardId,
    input: CreateBoardAiThreadInput = {},
  ): Promise<Result<BoardAiThread, DomainError>> {
    // user_id and board_id come from the caller's scope, never from `input`,
    // and RLS rejects the row anyway if they are not the session's own.
    const { data, error } = await this.client
      .from('board_ai_threads')
      .insert({
        user_id: userId,
        board_id: boardId,
        title: normalizeBoardAiThreadTitle(input.title),
      })
      .select(THREAD_COLUMNS)
      .single();

    if (error) {
      return err(domainError('unavailable', 'Could not create the board chat thread', { cause: error }));
    }
    // RLS refusing the insert returns no row rather than an error.
    if (!data) return err(domainError('permission_denied', 'Board chat thread was not created'));

    return ok(toThread(data));
  }

  /** This user's threads on this board, most recently updated first. */
  async listThreads(userId: UserId, boardId: BoardId): Promise<Result<readonly BoardAiThread[], DomainError>> {
    const { data, error } = await this.client
      .from('board_ai_threads')
      .select(THREAD_COLUMNS)
      .eq('user_id', userId)
      .eq('board_id', boardId)
      .order('updated_at', { ascending: false });

    if (error) {
      return err(domainError('unavailable', 'Could not load board chat threads', { cause: error }));
    }

    return ok((data ?? []).map(toThread));
  }

  /** All three of user, board and thread must match; null means "not yours". */
  async getThread(
    userId: UserId,
    boardId: BoardId,
    threadId: string,
  ): Promise<Result<BoardAiThread | null, DomainError>> {
    const { data, error } = await this.client
      .from('board_ai_threads')
      .select(THREAD_COLUMNS)
      .eq('id', threadId)
      .eq('user_id', userId)
      .eq('board_id', boardId)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not load the board chat thread', { cause: error }));
    }

    return ok(data ? toThread(data) : null);
  }

  async listMessages(
    userId: UserId,
    boardId: BoardId,
    threadId: string,
  ): Promise<Result<readonly BoardAiMessage[], DomainError>> {
    // The thread is resolved through the scoped read first, so a thread id
    // belonging to another user or another board never reaches the message
    // query at all.
    const thread = await this.getThread(userId, boardId, threadId);
    if (!thread.ok) return err(thread.error);
    if (thread.value === null) return err(domainError('not_found', 'Board chat thread not found'));

    const { data, error } = await this.client
      .from('board_ai_messages')
      .select(MESSAGE_COLUMNS)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) {
      return err(domainError('unavailable', 'Could not load board chat messages', { cause: error }));
    }

    const messages: BoardAiMessage[] = [];
    for (const row of data ?? []) {
      const message = toMessage(row);
      if (message) messages.push(message);
    }
    return ok(messages);
  }

  async appendMessage(
    userId: UserId,
    boardId: BoardId,
    threadId: string,
    input: AppendBoardAiMessageInput,
  ): Promise<Result<BoardAiMessage, DomainError>> {
    if (!isBoardAiMessageRole(input.role)) {
      return err(domainError('validation', 'Board chat message role is invalid'));
    }
    if (!isBoardAiMessageContentValid(input.content)) {
      return err(domainError('validation', 'Board chat message content is invalid'));
    }

    const thread = await this.getThread(userId, boardId, threadId);
    if (!thread.ok) return err(thread.error);
    if (thread.value === null) return err(domainError('not_found', 'Board chat thread not found'));

    const { data, error } = await this.client
      .from('board_ai_messages')
      .insert({
        thread_id: threadId,
        role: input.role,
        content: input.content,
        provider: input.provider ?? null,
        model: input.model ?? null,
        context: input.context ?? null,
        citations: input.citations ?? null,
      })
      .select(MESSAGE_COLUMNS)
      .single();

    if (error) {
      return err(domainError('unavailable', 'Could not append the board chat message', { cause: error }));
    }
    if (!data) return err(domainError('permission_denied', 'Board chat message was not appended'));

    const message = toMessage(data);
    if (!message) return err(domainError('unknown', 'Board chat message was stored with an unknown role'));

    // Ordering metadata, updated on the same authenticated path. Deliberately
    // NOT atomic with the insert above and deliberately not a trigger: making
    // it atomic would need an RPC, which BCHAT-A does not add. A failure here
    // is swallowed on purpose -- the message IS persisted, and losing a
    // list-ordering timestamp must never be reported as a failed send. See the
    // repository note in the slice report.
    await this.touchThread(userId, boardId, threadId);

    return ok(message);
  }

  private async touchThread(userId: UserId, boardId: BoardId, threadId: string): Promise<void> {
    await this.client
      .from('board_ai_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', threadId)
      .eq('user_id', userId)
      .eq('board_id', boardId);
  }
}

/**
 * Constructed from the CALLER'S authenticated client, so the session decides
 * what is visible. There is no service-role factory on purpose: an admin
 * client here would bypass the RLS that makes these threads private, and no
 * part of this feature needs to read another user's chat.
 */
export function createBoardAiThreadRepository(
  client: BoardAiChatSupabaseClient,
): SupabaseBoardAiThreadRepository {
  return new SupabaseBoardAiThreadRepository(client);
}
