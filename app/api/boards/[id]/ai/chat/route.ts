import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { createBoardAiThreadRepository } from '@/lib/infra/ai/boardAiThreadRepository';
import type { BoardAiChatSupabaseClient } from '@/lib/infra/ai/boardAiThreadRepository';
import {
  BOARD_AI_CHAT_MESSAGE_MAX,
  executeBoardAiChat,
  type BoardAiChatTurn,
} from '@/lib/server/ai/boardAiChatExecution';
import { AIProviderError } from '@/lib/server/ai/providers/errors';
import { aiProviderErrorStatus } from '@/lib/server/settings/aiProviderErrorStatus';
import { createAIRolePreferenceRepository } from '@/lib/infra/settings/aiRolePreferenceRepository';
import { createAIProviderCredentialRepository } from '@/lib/infra/settings/aiProviderCredentialRepository';
import { asBoardId, asUserId } from '@/lib/domain/core/ids';

/**
 * Private Board AI Chat.
 *
 * One board, one user, one conversation nobody else can read. A viewer may use
 * it: reasoning privately over content you are allowed to read is a read, and
 * this route writes nothing to the shared board. Editor permission belongs to
 * the later slice that turns an answer into a Note.
 *
 * The request carries a message and, optionally, which of the caller's own
 * threads it belongs to. It carries no provider, model, key, endpoint or
 * context -- the schema below is strict, so a field this slice does not
 * implement is a validation error rather than something silently ignored that
 * a client might believe was honoured.
 */

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createChatRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

/**
 * The same per-instance fixed-window limiter the existing AI routes use. Its
 * per-instance scope is pre-existing debt, not addressed here.
 *
 * Keyed by user rather than by IP: this route is authenticated-only, and an IP
 * key would let one user behind a shared address exhaust another's budget.
 */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

/** Shared by the POST body and the GET query, so both refuse the same shapes. */
const threadIdSchema = z.string().uuid();

/**
 * Strict on purpose. `knowledgeDocumentId`, `pageNumber`, `selectedText`,
 * `charStart`, `charEnd`, `postId`, `context` and `citations` all belong to
 * the later context slice, which must re-authorize each of them server-side.
 * Accepting them now -- even ignored -- would teach a client they work.
 */
const chatRequestSchema = z.object({
  threadId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(BOARD_AI_CHAT_MESSAGE_MAX),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const sessionClient = createChatRouteClient(cookieStore);
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!checkRateLimit(user.id)) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      // Deliberately not the zod issue list: a field name this slice rejects
      // is a contract detail, not something to enumerate back to a caller.
      return NextResponse.json({ error: 'Invalid chat request.' }, { status: 400 });
    }
    const { threadId, message } = parsed.data;

    const { id: boardId } = await context.params;

    // Current readability, re-checked per request and never cached: the same
    // authority the Knowledge routes use, which is the board owner OR
    // is_board_member. A viewer passes; a former collaborator does not.
    let allowed: boolean;
    try {
      allowed = await canReadBoardKnowledge(
        sessionClient as unknown as KnowledgeBoardReadAuthorizationClient,
        boardId,
        user.id,
      );
    } catch {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // The caller's own client, so RLS is the boundary. No admin client exists
    // on this path -- a chat nobody else may read is not a chat the server
    // reads around.
    const repository = createBoardAiThreadRepository(
      sessionClient as unknown as BoardAiChatSupabaseClient,
    );
    const scopedUser = asUserId(user.id);
    const scopedBoard = asBoardId(boardId);

    // Resolve or create, always through the three-part scope. A thread id
    // belonging to another user or another board is simply not found: the
    // response does not distinguish the two, so it discloses nothing about
    // what exists elsewhere.
    let thread;
    if (threadId) {
      const found = await repository.getThread(scopedUser, scopedBoard, threadId);
      if (!found.ok) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
      if (found.value === null) {
        return NextResponse.json({ error: 'Chat thread not found' }, { status: 404 });
      }
      thread = found.value;
    } else {
      const created = await repository.createThread(scopedUser, scopedBoard);
      if (!created.ok) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
      thread = created.value;
    }

    // Persisted BEFORE generation, so a failed answer still leaves a truthful
    // record of what was asked. Nothing is rolled back on failure below: the
    // question really was asked.
    const stored = await repository.appendMessage(scopedUser, scopedBoard, thread.id, {
      role: 'user',
      content: message,
    });
    if (!stored.ok) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

    const history = await repository.listMessages(scopedUser, scopedBoard, thread.id);
    if (!history.ok) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

    // Only role and content cross into the model. Everything else a row
    // carries -- ids, timestamps, and the self-reported provider/model -- is
    // storage, and one of them is client-writable; none of it is conversation.
    const turns: BoardAiChatTurn[] = history.value.map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));

    let result;
    try {
      result = await executeBoardAiChat(scopedUser, turns, {
        preferences: createAIRolePreferenceRepository(),
        credentials: createAIProviderCredentialRepository(),
      });
    } catch (error) {
      // The user's message stays. No assistant row is written, because there
      // is no assistant answer -- inventing one would be a lie in their
      // permanent history. A normalized provider failure carries a category, a
      // provider and a status, never a key, a ciphertext or a response body.
      if (error instanceof AIProviderError) {
        return NextResponse.json(
          { error: error.message, category: error.category, threadId: thread.id },
          { status: aiProviderErrorStatus(error.category) },
        );
      }
      return NextResponse.json({ error: 'AI request failed.', threadId: thread.id }, { status: 502 });
    }

    const text = result.text.trim();
    if (!text) {
      return NextResponse.json(
        { error: 'AI returned an empty result.', threadId: thread.id },
        { status: 502 },
      );
    }

    const assistant = await repository.appendMessage(scopedUser, scopedBoard, thread.id, {
      role: 'assistant',
      content: text,
      // Names only, and only on the reply that was actually generated. Context
      // and citations stay null until the slices that authorize them.
      provider: result.provider,
      model: result.model,
    });
    if (!assistant.ok) {
      // The thread id travels even on this failure. The answer was generated
      // and then lost, which is what the 503 says; but the thread and the
      // user's question ARE durable, and a client that opened a NEW thread
      // with this request would otherwise have no way to name it again --
      // every retry would strand another thread holding one message. Saying
      // which conversation this was is not a claim that the reply survived.
      return NextResponse.json({ error: 'Unavailable', threadId: thread.id }, { status: 503 });
    }

    return NextResponse.json({
      threadId: thread.id,
      message: {
        id: assistant.value.id,
        role: assistant.value.role,
        content: assistant.value.content,
        provider: assistant.value.provider,
        model: assistant.value.model,
        createdAt: assistant.value.createdAt,
      },
    });
  } catch {
    // No cause, no stack: a thrown value here could carry provider detail.
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

/**
 * Reading a private conversation back.
 *
 * Two shapes, one route: without `threadId` this answers the caller's own
 * thread summaries for THIS board, newest first and carrying no messages;
 * with one it answers that single thread and its messages in order. Both go
 * through the same authenticated client, the same board-read check and the
 * same three-part scope as POST, so neither can see further than a send can.
 *
 * The projection is explicit rather than a row spread: `context` and
 * `citations` are unused in this slice, and nothing about a credential --
 * connection id, key hint, endpoint -- exists on these rows to leak. Only
 * `provider` and `model` names travel, which is what a client may display.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const sessionClient = createChatRouteClient(cookieStore);
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: boardId } = await context.params;

    let allowed: boolean;
    try {
      allowed = await canReadBoardKnowledge(
        sessionClient as unknown as KnowledgeBoardReadAuthorizationClient,
        boardId,
        user.id,
      );
    } catch {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const repository = createBoardAiThreadRepository(
      sessionClient as unknown as BoardAiChatSupabaseClient,
    );
    const scopedUser = asUserId(user.id);
    const scopedBoard = asBoardId(boardId);

    const requestedThreadId = new URL(request.url).searchParams.get('threadId');
    if (requestedThreadId === null) {
      const threads = await repository.listThreads(scopedUser, scopedBoard);
      if (!threads.ok) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
      return NextResponse.json({
        threads: threads.value.map((entry) => ({
          id: entry.id,
          title: entry.title,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })),
      });
    }

    // A malformed id is refused before it reaches the database, and answers
    // the same way a valid-but-foreign one does: nothing here reveals whether
    // an id exists somewhere the caller cannot see.
    if (!threadIdSchema.safeParse(requestedThreadId).success) {
      return NextResponse.json({ error: 'Chat thread not found' }, { status: 404 });
    }

    const messages = await repository.listMessages(scopedUser, scopedBoard, requestedThreadId);
    if (!messages.ok) {
      // The repository reports a thread outside this user+board scope as
      // not_found; every other failure is infrastructure.
      const status = messages.error.code === 'not_found' ? 404 : 503;
      return NextResponse.json(
        { error: status === 404 ? 'Chat thread not found' : 'Unavailable' },
        { status },
      );
    }

    const thread = await repository.getThread(scopedUser, scopedBoard, requestedThreadId);
    if (!thread.ok) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    if (thread.value === null) {
      return NextResponse.json({ error: 'Chat thread not found' }, { status: 404 });
    }

    return NextResponse.json({
      thread: {
        id: thread.value.id,
        title: thread.value.title,
        createdAt: thread.value.createdAt,
        updatedAt: thread.value.updatedAt,
      },
      messages: messages.value.map((entry) => ({
        id: entry.id,
        role: entry.role,
        content: entry.content,
        provider: entry.provider,
        model: entry.model,
        createdAt: entry.createdAt,
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
