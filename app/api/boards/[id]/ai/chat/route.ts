import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { createBoardAiProvenanceProof } from '@/lib/server/ai/boardAiProvenanceProof';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import {
  boardAiCitationsFromStored,
  buildBoardAiCitationEnvelope,
  parseBoardAiCitationFooter,
} from '@/lib/domain/ai/boardAiChatCitation';
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
import { AI_ROLE_CHAT } from '@/lib/ai/aiRoles';
import { AI_CREDIT_COSTS, BOARD_CHAT_SEARCH_SURCHARGE } from '@/lib/domain/billing/plans';
import {
  allowByokFor,
  checkBoardAiCredits,
  recordBoardAiCreditUsage,
} from '@/lib/server/billing/aiCredits';
import { asBoardId, asUserId } from '@/lib/domain/core/ids';
import type { BoardAiJsonValue } from '@/lib/domain/ai/boardAiChat';
import {
  resolveBoardAiChatContext,
  resolveHistoricalBoardAiChatContext,
  type BoardAiContextSupabaseClient,
} from '@/lib/server/ai/boardAiChatContext';
// The ONE privileged read on this path, and deliberately not built here: this
// route carries a standing guard that it holds no admin client. The adapter
// takes a server-derived path and returns bytes; it answers no question about
// access, and every authorisation below still runs on the caller's own client.
import { createBoardAiContextImageReader } from '@/lib/infra/ai/boardAiContextImageReader';
// The SECOND privileged read, and the same rule applies: the two search
// functions are granted to the server role alone, so the call is made through an
// adapter built outside this file. `searchBoardAiContext` re-checks readability
// with the caller's own client BEFORE it touches this reader, and a test pins
// that order.
//
// This file names neither the admin client nor that role, deliberately: an
// existing guard asserts on the raw source, comments included, and it is right
// to. A route that merely TALKS about privileged access is one edit away from
// holding some.
import { createBoardAiSearchReader } from '@/lib/infra/ai/boardAiSearchReader';
import { searchBoardAiContext } from '@/lib/server/ai/boardAiChatSearch';
import {
  boardAiSearchCoverageOf,
  boardAiSearchHasRoom,
  boardAiSearchPromptState,
  boardAiSearchSkippedBlock,
  type BoardAiSearchResult,
} from '@/lib/domain/ai/boardAiSearchContext';
import {
  BOARD_AI_CONTEXT_MAX_ITEMS,
  BOARD_AI_CONTEXT_MAX_TOTAL_CHARS,
  boardAiContextViewFromStored,
  boundResolvedContext,
  buildBoardAiContextEnvelope,
  selectHistoricalContextIdentities,
  type BoardAiContextRequestItem,
  type ResolvedBoardAiContextBlock,
} from '@/lib/domain/ai/boardAiChatContext';

/**
 * Private Board AI Chat.
 *
 * One board, one user, one conversation nobody else can read. A viewer may use
 * it: reasoning privately over content you are allowed to read is a read, and
 * this route writes nothing to the shared board. Editor permission belongs to
 * the later slice that turns an answer into a Note.
 *
 * The request carries a message, optionally which of the caller's own threads
 * it belongs to, and optionally which sources the user explicitly attached --
 * by identity only. It carries no provider, model, key or endpoint, and the
 * schema below is strict, so a field this route does not implement is a
 * validation error rather than something silently ignored that a client might
 * believe was honoured.
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
 * Context is IDENTITY only. A client may name a document, a page, a verified
 * span or a post; it may never describe one. There is no field here for
 * source text, a title, an excerpt or a label, because every one of those is
 * something the server reads for itself -- accepting them would let a browser
 * decide what a source says.
 *
 * Each variant is strict, so an unknown field is a validation error rather
 * than something quietly dropped into the persistence column.
 */
const contextItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('knowledge-document'),
    knowledgeDocumentId: z.string().uuid(),
  }).strict(),
  z.object({
    type: z.literal('knowledge-page'),
    knowledgeDocumentId: z.string().uuid(),
    pageNumber: z.number().int().positive(),
  }).strict(),
  z.object({
    type: z.literal('knowledge-selection'),
    knowledgeDocumentId: z.string().uuid(),
    pageNumber: z.number().int().positive(),
    charStart: z.number().int().min(0),
    charEnd: z.number().int().positive(),
    selectedText: z.string().min(1).max(BOARD_AI_CHAT_MESSAGE_MAX),
  }).strict().refine((item) => item.charEnd > item.charStart, {
    message: 'charEnd must be greater than charStart',
  }),
  z.object({
    type: z.literal('padlet'),
    padletId: z.string().uuid(),
  }).strict(),
  // Identity only, and `.strict()` is what enforces it: without it a caller
  // could smuggle `imageUrl`, `base64` or `storagePath` into the persisted
  // column and the server would have accepted content from a browser -- the
  // one thing this whole contract exists to prevent. The server derives the
  // path and fetches the bytes itself.
  z.object({
    type: z.literal('padlet-image'),
    padletId: z.string().uuid(),
  }).strict(),
]);

const chatRequestSchema = z.object({
  threadId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(BOARD_AI_CHAT_MESSAGE_MAX),
  context: z.object({
    items: z.array(contextItemSchema).min(1).max(BOARD_AI_CONTEXT_MAX_ITEMS),
  }).strict().optional(),
  /**
   * The board-search toggle. ABSENT MEANS OFF, which is the safe default and
   * the reason this is `optional()` rather than defaulted true anywhere: a
   * stale client, a replayed body or a hand-written request cannot turn on an
   * automatic read of the board's text by omitting a field.
   *
   * It is a BOOLEAN and never a query string. The thing searched for is the
   * message this same request already validated, so a caller cannot ask the
   * server to search for something the user never typed.
   */
  searchBoard: z.boolean().optional(),
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
    // Renamed: the route handler already binds `context` to Next.js params.
    const { threadId, message, context: contextRequest, searchBoard } = parsed.data;

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

    // PATCH-187. AI CREDITS: the board OWNER's plan pays (PRICING.md Rule 1).
    // The check runs BEFORE the thread is created and before the user's turn is
    // stored, so a refusal leaves nothing behind.
    //
    // A byok caller never reaches the ledger: `checkBoardAiCredits` resolves the
    // pre-call source from the role preference alone and returns early on byok.
    // A check that throws fails closed (503) and never reaches the model.
    let creditDecision: Awaited<ReturnType<typeof checkBoardAiCredits>>;
    try {
      creditDecision = await checkBoardAiCredits({
        boardId,
        userId: user.id,
        role: AI_ROLE_CHAT,
        cost: AI_CREDIT_COSTS.board_chat,
        now: new Date(),
        // Basic Q&A on boards keeps answering at 0 credits on a paid plan.
        boardChat: true,
        preferences: createAIRolePreferenceRepository(),
      });
    } catch {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    if (creditDecision.kind === 'refused') {
      return NextResponse.json(creditDecision.body, { status: creditDecision.status });
    }

    // The caller's own client, so RLS is the boundary. No admin client exists
    // on this path -- a chat nobody else may read is not a chat the server
    // reads around.
    const repository = createBoardAiThreadRepository(
      sessionClient as unknown as BoardAiChatSupabaseClient,
    );
    const scopedUser = asUserId(user.id);
    const scopedBoard = asBoardId(boardId);

    // CURRENT context is authorized BEFORE anything is written.
    //
    // Fail closed, and fail early: a rejected attachment must leave no thread
    // and no message behind, or a user probing ids would litter their board
    // with orphan conversations. Every block below was read on this turn,
    // through this caller's own client, scoped to this route board.
    let currentContext: readonly ResolvedBoardAiContextBlock[] = [];
    if (contextRequest) {
      const resolved = await resolveBoardAiChatContext(
        sessionClient as unknown as BoardAiContextSupabaseClient,
        boardId,
        contextRequest.items as readonly BoardAiContextRequestItem[],
        createBoardAiContextImageReader(),
      );
      if (!resolved.ok) {
        // The same shape the Knowledge routes use: a source on another board,
        // a page that does not exist and a post this caller cannot see are
        // indistinguishable here.
        const status = resolved.error.code === 'not_found' ? 404
          : resolved.error.code === 'validation' ? 400
            : resolved.error.code === 'conflict' ? 409 : 503;
        return NextResponse.json({ error: 'Context is not available.' }, { status });
      }
      currentContext = resolved.value;
    }

    // BOARD SEARCH. After the user's own attachments, because it must yield to
    // them, and before anything is persisted, so the chip is part of the same
    // record as the question.
    //
    // R4: EXPLICIT USER INTENT OUTRANKS AUTOMATIC ENRICHMENT. The attachments
    // are measured first and the search only gets what is left. The skip
    // decision is made HERE, before the database round trip -- running a search
    // that can only report "used 0 of 6" costs a query to produce a worse
    // answer than not searching.
    let searchBlock: ResolvedBoardAiContextBlock | null = null;
    let searchResult: BoardAiSearchResult | null = null;
    if (searchBoard === true) {
      const attachmentChars = currentContext.reduce((total, block) => total + block.text.length, 0);
      if (!boardAiSearchHasRoom(attachmentChars, BOARD_AI_CONTEXT_MAX_TOTAL_CHARS)) {
        searchResult = {
          outcome: 'skipped-no-room',
          returned: 0,
          used: 0,
          dropped: 0,
          query: '',
        };
      } else {
        const searched = await searchBoardAiContext(
          sessionClient as unknown as KnowledgeBoardReadAuthorizationClient,
          createBoardAiSearchReader(),
          boardId,
          user.id,
          message,
          BOARD_AI_CONTEXT_MAX_TOTAL_CHARS - attachmentChars,
          // What the attachments already put in front of the model, by SPAN.
          // A chunk from a page a document attachment never reached is not a
          // duplicate -- it is the only evidence in the request.
          boardAiSearchCoverageOf(currentContext),
          // WHERE THE BLOCK WILL LAND, so its passages can carry the sub-token
          // a citation resolves against. The block is appended right after the
          // attachments below, and `boundResolvedContext` only ever drops a
          // SUFFIX -- once the character budget is spent every later text block
          // is skipped -- so a search block that survives still has all of
          // `currentContext` in front of it, and this index is its real
          // position. A route test pins that, because it is an invariant of the
          // bounder rather than a property of the block.
          currentContext.length,
        );
        // A SEARCH THAT FAILED IS NOT A CHAT THAT FAILED. The user asked a
        // question; an enrichment they toggled on being unavailable is not a
        // reason to refuse it. The turn proceeds as though the toggle were off,
        // which is exactly what the prompt will then say.
        if (searched.ok) {
          searchBlock = searched.value.block;
          searchResult = searched.value.result;
        } else {
          // But NOT silently. The user asked for a search; if one could not run
          // they are told so, because "nothing was searched" and "the board
          // holds nothing" are different answers and only one of them is true.
          searchResult = { outcome: 'failed', returned: 0, used: 0, dropped: 0, query: '' };
        }
      }
    }

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
      // The server's own envelope, built from what it resolved -- never the
      // request object. Identity plus a short label and excerpt the server
      // authored, so a chip can be redrawn later without any of it ever being
      // read back as source text.
      // The envelope is plain JSON by construction; the cast only crosses the
      // repository's structural JSON type, which an interface cannot satisfy
      // nominally.
      // The search's own record travels in the SAME envelope, so the chip that
      // says what was searched and what was dropped survives a reload instead
      // of living only in this one response. For a skipped search that record
      // is the only trace there is -- it is deliberately not sent to the model.
      context: buildBoardAiContextEnvelope(
        searchResult === null
          ? currentContext
          : [...currentContext, searchBlock ?? boardAiSearchSkippedBlock(
            searchResult.outcome === 'failed' ? 'failed' : 'skipped-no-room',
          )],
      ) as unknown as BoardAiJsonValue | null,
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

    // Context carried in EARLIER messages, proved again from identity alone.
    //
    // A stored envelope is a claim written by the same person who could have
    // typed anything into their own private thread, so none of its text is
    // read back: only the ids are, and each one goes through the same
    // authorization a fresh attachment does. Newest first, and the current
    // message's own blocks lead, so what the user just attached can never be
    // squeezed out by something they attached ten turns ago.
    //
    // WHICH identities are worth reading is decided BEFORE a single source is
    // read. A thread grows without limit and each message may name four
    // sources, so resolving them all would make the database work a function
    // of thread length while the prompt stayed capped at 14k. Selecting the
    // newest distinct handful first makes that work constant.
    const envelopesNewestFirst: unknown[] = [];
    for (let index = history.value.length - 1; index >= 0; index -= 1) {
      const entry = history.value[index];
      if (entry.id === stored.value.id) continue;
      envelopesNewestFirst.push(entry.context);
    }
    const historical = selectHistoricalContextIdentities(envelopesNewestFirst);
    const historicalContext = historical.length === 0
      ? []
      : await resolveHistoricalBoardAiChatContext(
        sessionClient as unknown as BoardAiContextSupabaseClient,
        boardId,
        historical,
      );
    // ONE budget across the whole request, so twenty historical attachments
    // cannot multiply it.
    //
    // ORDER IS THE BUDGET RULE. The user's own attachments lead, so they can
    // never be squeezed out; the search block follows, already trimmed to
    // whatever they left; history goes last and is what actually yields. A
    // SKIPPED search contributes nothing here -- the prompt says it instead.
    const modelContext = boundResolvedContext([
      ...currentContext,
      ...(searchBlock ? [searchBlock] : []),
      ...historicalContext,
    ]);

    let result;
    try {
      result = await executeBoardAiChat(scopedUser, turns, {
        preferences: createAIRolePreferenceRepository(),
        credentials: createAIProviderCredentialRepository(),
        // PATCH-190: the key runs only when the check's kind says it may.
        allowByok: allowByokFor(creditDecision),
      }, modelContext, boardAiSearchPromptState(searchResult?.outcome ?? 'off'));
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

    // PATCH-187. The answer succeeded, so record what it cost -- but only for a
    // managed run, and only when the pre-call check said to charge. A paid plan's
    // free board chat (`charge: false`) records nothing.
    //
    // "Search was used" is `searchBlock !== null`: the block exists exactly when
    // a search ran and its context actually travelled with this turn (including
    // a search that matched nothing).
    //
    // A recording failure is logged and swallowed: the person already has their
    // answer, and failing the request now would waste the call we paid for.
    if (
      creditDecision.kind === 'allowed'
      && creditDecision.charge
      && result.source === 'collabboard-default'
    ) {
      const creditCost = AI_CREDIT_COSTS.board_chat
        + (searchBlock !== null ? BOARD_CHAT_SEARCH_SURCHARGE : 0);
      try {
        await recordBoardAiCreditUsage({
          plan: creditDecision.plan,
          balance: creditDecision.balance,
          boardId,
          userId: user.id,
          feature: 'board_chat',
          credits: creditCost,
        });
      } catch {
        console.error('AI credit usage was not recorded', {
          boardId,
          feature: 'board_chat',
          credits: creditCost,
        });
      }
    }

    // The machine footer is read here and nowhere else, and it never reaches
    // storage or a browser: what the user sees is the prose the model wrote.
    const answer = parseBoardAiCitationFooter(result.text);
    const text = answer.content;
    if (!text) {
      return NextResponse.json(
        { error: 'AI returned an empty result.', threadId: thread.id },
        { status: 502 },
      );
    }

    /**
     * Citations are built from the SAME authorized blocks that were sent, by
     * position. The model named tokens; the server decides what they meant.
     * Nothing it wrote in prose -- a document id, a page number, a filename --
     * can reach this envelope, and an unknown or malformed token simply
     * yields no citation rather than failing the answer.
     */
    const citations = buildBoardAiCitationEnvelope(answer.tokens, modelContext);

    /**
     * The citation envelope, signed.
     *
     * `board_ai_messages` is writable by the thread's owner, so a stored
     * envelope is not by itself evidence that THIS route produced it: a user
     * can insert an assistant row citing any page their board can read. The
     * proof is what separates provenance the server authorized from JSON a
     * browser wrote, and the Save-as-Note path refuses anything unsigned.
     *
     * The id is chosen here rather than by the database because it is part of
     * what is signed -- a signature that did not bind the message could be
     * lifted onto another one.
     */
    const assistantMessageId = crypto.randomUUID();
    const signedCitations = citations
      ? {
        ...citations,
        proof: createBoardAiProvenanceProof({
          messageId: assistantMessageId,
          threadId: thread.id,
          boardId: String(scopedBoard),
          content: text,
          citationItems: citations.items as unknown as readonly Record<string, unknown>[],
        }),
      }
      : null;

    const assistant = await repository.appendMessage(scopedUser, scopedBoard, thread.id, {
      id: assistantMessageId,
      role: 'assistant',
      content: text,
      // Names only, and only on the reply that was actually generated.
      provider: result.provider,
      model: result.model,
      // Present only when the answer actually cited something: an uncited
      // reply carries no citation field at all, exactly as it carries no
      // context of its own. The proof rides inside that same envelope and is
      // stripped by `boardAiCitationsFromStored` before anything reaches the
      // browser.
      ...(signedCitations ? { citations: signedCitations as unknown as BoardAiJsonValue } : {}),
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
        // Re-derived from what was stored, through the same parser the history
        // read uses: one sanitized shape, whichever way a client got here.
        citations: boardAiCitationsFromStored(assistant.value.citations),
      },
    });
  } catch {
    // No cause, no stack: a thrown value here could carry provider detail.
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const sessionClient = createChatRouteClient(cookieStore);
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) return new NextResponse(null, { status: 401 });

    const requestedThreadId = new URL(request.url).searchParams.get('threadId');
    if (requestedThreadId === null || !threadIdSchema.safeParse(requestedThreadId).success) {
      return NextResponse.json({ error: 'Invalid thread id.' }, { status: 400 });
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
    const result = await repository.deleteThread(
      asUserId(user.id),
      asBoardId(boardId),
      requestedThreadId,
    );
    if (!result.ok) {
      return result.error.code === 'not_found'
        ? NextResponse.json({ error: 'Chat thread not found' }, { status: 404 })
        : NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
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
 * The projection is explicit rather than a row spread: `citations` is unused
 * here, `context` is re-derived from stored JSON rather than forwarded, and
 * nothing about a credential -- connection id, key hint, endpoint -- exists on
 * these rows to leak. Only `provider` and `model` names travel, which is what
 * a client may display.
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
        // Re-derived from the stored JSON, never forwarded: a row a user
        // hand-wrote can hold anything, so only fields the contract defines
        // reach a browser -- and none of them is authorization.
        context: boardAiContextViewFromStored(entry.context),
        citations: boardAiCitationsFromStored(entry.citations),
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
