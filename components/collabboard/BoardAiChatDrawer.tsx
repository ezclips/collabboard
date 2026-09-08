'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, MessageSquarePlus, Paperclip, SendHorizontal, X } from 'lucide-react';

import BoardAiChatModelChooser from '@/components/collabboard/BoardAiChatModelChooser';
import {
  BoardAiChatDraftChips,
  BoardAiChatPersistedChips,
} from '@/components/collabboard/BoardAiChatContextChips';
import { BOARD_AI_CHAT_MESSAGE_MAX } from '@/lib/domain/ai/boardAiChatClient';
import {
  BOARD_AI_DRAFT_CONTEXT_MAX,
  addBoardAiDraftContext,
  boardAiDraftFromDocument,
  boardAiDraftContextPayload,
  boardAiDraftKey,
  removeBoardAiDraftContext,
  type BoardAiDraftContextItem,
} from '@/lib/domain/ai/boardAiChatDraftContext';
import type {
  BoardAiChatMessageView,
  BoardAiChatThreadSummary,
} from '@/lib/domain/ai/boardAiChatClient';

/**
 * The board's private AI conversation.
 *
 * A board-level surface, mounted as a CanvasClient shell sibling exactly as the
 * Knowledge reader drawer is -- NOT under the sidebar, whose z-[3000] wrapper is
 * a stacking context that would pin this above every editor modal. It sits in
 * the docked reader's band, so a blocking editor still owns the screen when one
 * opens.
 *
 * What it is not: it is not a Reader pane, and it holds no board content. It
 * sends IDENTITIES the user explicitly attached -- never text it read off the
 * board. There is still no citation and no Save as Note, because neither
 * exists yet, and a control that did nothing would be worse than its absence.
 *
 * Privacy is the product: this thread belongs to one user on one board. Two
 * collaborators on the same board never see each other's, which the server
 * enforces and this surface simply states.
 */

const CHAT_PATH = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}/ai/chat`;

export interface BoardAiChatDrawerProps {
  readonly boardId: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly presentation?: 'drawer' | 'embedded';
  readonly documentScope?: {
    readonly knowledgeDocumentId: string;
    readonly originalFilename: string;
  } | null;
  /**
   * The board's OWN blocking-editor authority, forwarded unchanged -- the same
   * flag the canvas toolbar and the Knowledge reader already step aside on. A
   * yielded drawer is invisible and inert, so an editor opened from anywhere
   * keeps the screen without this surface fighting it for clicks.
   */
  readonly blockingEditorOpen?: boolean;
  /**
   * Attachments the board shell has queued for the NEXT message.
   *
   * Owned there rather than here because the surfaces that produce them --
   * a selected card, the PDF reader, a text selection -- are the shell's, and
   * a handoff from one of them has to survive this drawer being closed at the
   * moment it happens.
   */
  readonly draftContext?: readonly BoardAiDraftContextItem[];
  readonly onDraftContextChange?: (items: readonly BoardAiDraftContextItem[]) => void;
  /**
   * The one supported board object currently selected, already reduced to a
   * draft by the shell's own selection authority. Null when the selection is
   * empty, multiple, or something Board AI cannot honestly use.
   */
  readonly selectedBoardItem?: BoardAiDraftContextItem | null;
}

/** A thread the user has, or the not-yet-created one a New chat represents. */
type ActiveThread = string | null;

/** A stable empty default, so an absent prop is not a new array each render. */
const EMPTY_DRAFT_CONTEXT: readonly BoardAiDraftContextItem[] = [];

interface DocumentScopedSession {
  readonly activeThreadId: ActiveThread;
  readonly messages: readonly BoardAiChatMessageView[];
  readonly draft: string;
  readonly loadingMessages: boolean;
  readonly sending: boolean;
  readonly error: string | null;
}

const EMPTY_DOCUMENT_SESSION: DocumentScopedSession = {
  activeThreadId: null,
  messages: [],
  draft: '',
  loadingMessages: false,
  sending: false,
  error: null,
};

function applyStateAction<T>(current: T, action: React.SetStateAction<T>): T {
  return typeof action === 'function' ? (action as (previous: T) => T)(current) : action;
}

function mergeMandatoryDocumentContext(
  mandatory: BoardAiDraftContextItem | null,
  optional: readonly BoardAiDraftContextItem[],
): readonly BoardAiDraftContextItem[] {
  if (!mandatory) return optional;
  const mandatoryKey = boardAiDraftKey(mandatory);
  return [
    mandatory,
    ...optional.filter((item) => boardAiDraftKey(item) !== mandatoryKey),
  ].slice(0, BOARD_AI_DRAFT_CONTEXT_MAX);
}

export default function BoardAiChatDrawer({
  boardId,
  isOpen,
  onClose,
  presentation = 'drawer',
  documentScope = null,
  blockingEditorOpen = false,
  draftContext = EMPTY_DRAFT_CONTEXT,
  onDraftContextChange,
  selectedBoardItem = null,
}: BoardAiChatDrawerProps) {
  const [threads, setThreads] = useState<readonly BoardAiChatThreadSummary[]>([]);
  const [boardActiveThreadId, setBoardActiveThreadId] = useState<ActiveThread>(null);
  const [boardMessages, setBoardMessages] = useState<readonly BoardAiChatMessageView[]>([]);
  const [boardDraft, setBoardDraft] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [boardLoadingMessages, setBoardLoadingMessages] = useState(false);
  const [boardSending, setBoardSending] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [documentSessions, setDocumentSessions] = useState<Record<string, DocumentScopedSession>>({});
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextNotice, setContextNotice] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const activeDocumentScopeRef = useRef<string | null>(null);

  const yieldsToEditor = blockingEditorOpen;
  const isEmbedded = presentation === 'embedded';
  const documentScopeId = documentScope?.knowledgeDocumentId ?? null;
  const documentSession = documentScopeId
    ? documentSessions[documentScopeId] ?? EMPTY_DOCUMENT_SESSION
    : EMPTY_DOCUMENT_SESSION;
  const activeThreadId = documentScopeId ? documentSession.activeThreadId : boardActiveThreadId;
  const messages = documentScopeId ? documentSession.messages : boardMessages;
  const draft = documentScopeId ? documentSession.draft : boardDraft;
  const loadingMessages = documentScopeId ? documentSession.loadingMessages : boardLoadingMessages;
  const sending = documentScopeId ? documentSession.sending : boardSending;
  const error = documentScopeId ? documentSession.error : boardError;
  const mandatoryDocumentContext = useMemo(() => (
    documentScope
      ? boardAiDraftFromDocument(documentScope.knowledgeDocumentId, documentScope.originalFilename)
      : null
  ), [documentScope]);

  const setDocumentSessionValue = useCallback((
    documentId: string,
    updater: (session: DocumentScopedSession) => DocumentScopedSession,
  ) => {
    setDocumentSessions((current) => ({
      ...current,
      [documentId]: updater(current[documentId] ?? EMPTY_DOCUMENT_SESSION),
    }));
  }, []);

  const setActiveThreadId = useCallback((action: React.SetStateAction<ActiveThread>) => {
    if (documentScopeId) {
      setDocumentSessionValue(documentScopeId, (session) => ({
        ...session,
        activeThreadId: applyStateAction(session.activeThreadId, action),
      }));
      return;
    }
    setBoardActiveThreadId(action);
  }, [documentScopeId, setDocumentSessionValue]);

  const setMessages = useCallback((action: React.SetStateAction<readonly BoardAiChatMessageView[]>) => {
    if (documentScopeId) {
      setDocumentSessionValue(documentScopeId, (session) => ({
        ...session,
        messages: applyStateAction(session.messages, action),
      }));
      return;
    }
    setBoardMessages(action);
  }, [documentScopeId, setDocumentSessionValue]);

  const setDraft = useCallback((action: React.SetStateAction<string>) => {
    if (documentScopeId) {
      setDocumentSessionValue(documentScopeId, (session) => ({
        ...session,
        draft: applyStateAction(session.draft, action),
      }));
      return;
    }
    setBoardDraft(action);
  }, [documentScopeId, setDocumentSessionValue]);

  const setLoadingMessages = useCallback((action: React.SetStateAction<boolean>) => {
    if (documentScopeId) {
      setDocumentSessionValue(documentScopeId, (session) => ({
        ...session,
        loadingMessages: applyStateAction(session.loadingMessages, action),
      }));
      return;
    }
    setBoardLoadingMessages(action);
  }, [documentScopeId, setDocumentSessionValue]);

  const setSending = useCallback((action: React.SetStateAction<boolean>) => {
    if (documentScopeId) {
      setDocumentSessionValue(documentScopeId, (session) => ({
        ...session,
        sending: applyStateAction(session.sending, action),
      }));
      return;
    }
    setBoardSending(action);
  }, [documentScopeId, setDocumentSessionValue]);

  const setError = useCallback((action: React.SetStateAction<string | null>) => {
    if (documentScopeId) {
      setDocumentSessionValue(documentScopeId, (session) => ({
        ...session,
        error: applyStateAction(session.error, action),
      }));
      return;
    }
    setBoardError(action);
  }, [documentScopeId, setDocumentSessionValue]);

  useEffect(() => {
    activeDocumentScopeRef.current = documentScopeId;
    setContextMenuOpen(false);
    setContextNotice(null);
  }, [documentScopeId]);

  /**
   * Opening the drawer READS; it never writes. A thread row appears only when
   * a first message is actually sent, so browsing the surface leaves nothing
   * behind -- and an empty state is a real state, not a row to create.
   */
  useEffect(() => {
    if (!isOpen) return;
    if (documentScopeId) {
      setThreads([]);
      setLoadingThreads(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoadingThreads(true);
    setError(null);
    (async () => {
      try {
        const response = await fetch(CHAT_PATH(boardId), { method: 'GET' });
        if (!response.ok) throw new Error(String(response.status));
        const payload = await response.json() as { threads?: BoardAiChatThreadSummary[] };
        if (cancelled) return;
        const found = payload.threads ?? [];
        setThreads(found);
        // Newest first is the server's order, so the head is the conversation
        // the user was last in.
        setActiveThreadId(found.length > 0 ? found[0].id : null);
      } catch {
        if (!cancelled) setError('Could not load your chats.');
      } finally {
        if (!cancelled) setLoadingThreads(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, boardId, documentScopeId, setError]);

  /** One thread's messages, reloaded whenever the active thread changes. */
  useEffect(() => {
    if (!isOpen) return;
    if (activeThreadId === null) { setMessages([]); setLoadingMessages(false); return; }
    let cancelled = false;
    const requestDocumentScopeId = documentScopeId;
    setLoadingMessages(true);
    (async () => {
      try {
        const response = await fetch(`${CHAT_PATH(boardId)}?threadId=${encodeURIComponent(activeThreadId)}`);
        if (!response.ok) throw new Error(String(response.status));
        const payload = await response.json() as { messages?: BoardAiChatMessageView[] };
        if (requestDocumentScopeId !== activeDocumentScopeRef.current) return;
        if (!cancelled) setMessages(payload.messages ?? []);
      } catch {
        if (requestDocumentScopeId !== activeDocumentScopeRef.current) return;
        if (!cancelled) { setMessages([]); setError('Could not load this conversation.'); }
      } finally {
        if (requestDocumentScopeId !== activeDocumentScopeRef.current) return;
        if (!cancelled) setLoadingMessages(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, boardId, activeThreadId, documentScopeId, setError, setLoadingMessages, setMessages]);

  /**
   * Re-reads one thread from the server.
   *
   * Used after a turn that carried context, in BOTH the success and the
   * provider-failure paths: what a user message really carried is the envelope
   * the SERVER built, and only a read can show that. Guessing chips from the
   * draft would show the user what they asked for rather than what was
   * authorized.
   */
  const reloadThread = useCallback(async (threadId: string) => {
    const requestDocumentScopeId = documentScopeId;
    try {
      const response = await fetch(`${CHAT_PATH(boardId)}?threadId=${encodeURIComponent(threadId)}`);
      if (!response.ok) return;
      const payload = await response.json() as { messages?: BoardAiChatMessageView[] };
      if (requestDocumentScopeId !== activeDocumentScopeRef.current) return;
      setMessages(payload.messages ?? []);
    } catch {
      // The turn on screen is already truthful enough; a failed refresh only
      // costs the chips, never correctness of the conversation.
    }
  }, [boardId, documentScopeId, setMessages]);

  // Newest turn in view, without stealing focus from the composer.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages, sending]);

  /**
   * Escape precedence. While this drawer has yielded it is invisible and
   * inert, so Escape belongs to the editor actually on screen -- the same rule
   * the Knowledge reader follows. Without it one Escape closes both, and the
   * conversation the user was in disappears behind the editor they meant to
   * dismiss.
   */
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (yieldsToEditor) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, yieldsToEditor, onClose]);

  /** Clears the surface only. No row is deleted, and none is created yet. */
  const startNewChat = useCallback(() => {
    setActiveThreadId(null);
    setMessages([]);
    setDraft('');
    setLoadingMessages(false);
    setError(null);
  }, [setActiveThreadId, setDraft, setError, setLoadingMessages, setMessages]);

  const canSend = draft.trim().length > 0 && !sending;

  const setDraftContext = useCallback((items: readonly BoardAiDraftContextItem[]) => {
    onDraftContextChange?.(items);
  }, [onDraftContextChange]);

  const attach = useCallback((item: BoardAiDraftContextItem) => {
    if (mandatoryDocumentContext && draftContext.length >= BOARD_AI_DRAFT_CONTEXT_MAX - 1) {
      setContextMenuOpen(false);
      setContextNotice(`Maximum ${BOARD_AI_DRAFT_CONTEXT_MAX - 1} optional context items with this PDF.`);
      return;
    }
    const result = addBoardAiDraftContext(draftContext, item);
    setContextMenuOpen(false);
    if (result.outcome === 'added') {
      setContextNotice(null);
      setDraftContext(result.items);
      return;
    }
    // Both refusals are said out loud. Silently doing nothing would read as a
    // broken button, and silently replacing an item would discard a choice.
    setContextNotice(result.outcome === 'duplicate'
      ? 'That is already attached.'
      : `Maximum ${BOARD_AI_DRAFT_CONTEXT_MAX} context items.`);
  }, [draftContext, mandatoryDocumentContext, setDraftContext]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (content.length === 0 || sending) return;
    const requestDocumentScopeId = documentScopeId;
    setSending(true);
    setError(null);
    setContextNotice(null);
    // Captured for this ONE message. Attachments are not standing state: the
    // next question starts empty unless the user attaches again.
    const outgoingContext = mergeMandatoryDocumentContext(mandatoryDocumentContext, draftContext);
    const contextPayload = boardAiDraftContextPayload(outgoingContext);
    // Shown immediately because the server persists the user turn BEFORE it
    // generates: this is what was really stored, not an optimistic guess.
    const pending: BoardAiChatMessageView = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content,
      provider: null,
      model: null,
      createdAt: new Date().toISOString(),
      // Null until the server answers. What a message really carried is the
      // envelope the SERVER built from what it authorized, so this pending row
      // shows no chips rather than chips that might not survive the request.
      context: null,
    };
    setMessages((current) => [...current, pending]);
    setDraft('');

    try {
      const response = await fetch(CHAT_PATH(boardId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // No provider, model or key: execution is the user's stored role
        // preference, resolved server-side. `context` is identity only --
        // built by the payload helper, which never forwards a chip's label.
        body: JSON.stringify({
          ...(activeThreadId === null ? {} : { threadId: activeThreadId }),
          message: content,
          ...(contextPayload ? { context: contextPayload } : {}),
        }),
      });
      const payload = await response.json().catch(() => null) as
        | { threadId?: string; message?: BoardAiChatMessageView; error?: string }
        | null;

      if (requestDocumentScopeId !== activeDocumentScopeRef.current && requestDocumentScopeId) {
        setDocumentSessionValue(requestDocumentScopeId, (session) => {
          const withoutPending = session.messages.filter((entry) => entry.id !== pending.id);
          if (!response.ok) {
            return {
              ...session,
              activeThreadId: payload?.threadId ?? session.activeThreadId,
              messages: payload?.threadId ? session.messages : withoutPending,
              draft: payload?.threadId ? session.draft : content,
              error: safeError(response.status, payload?.error),
              sending: false,
            };
          }
          return {
            ...session,
            activeThreadId: payload?.threadId ?? session.activeThreadId,
            messages: payload?.message ? [...session.messages, payload.message] : session.messages,
            sending: false,
          };
        });
        return;
      }
      if (requestDocumentScopeId !== activeDocumentScopeRef.current) return;
      // The thread id is adopted even from a failure that carries one: the
      // question IS stored, and losing the id would strand it.
      if (payload?.threadId) setActiveThreadId(payload.threadId);

      if (!response.ok) {
        setError(safeError(response.status, payload?.error));
        // Two very different failures, told apart by what the ROUTE does
        // rather than by the status alone.
        //
        // A context refusal happens BEFORE anything is written, and the route
        // returns no thread id for it. Nothing was asked, so the question comes
        // back to the composer with its attachments intact -- the user needs
        // them to see which one to remove.
        if (!payload?.threadId) {
          setMessages((current) => current.filter((entry) => entry.id !== pending.id));
          setDraft(content);
          return;
        }
        // Otherwise the user's turn IS in the database. It stays, its
        // attachments were consumed with it, and a re-read replaces the
        // optimistic row with the real one so its chips are the server's.
        setDraftContext(EMPTY_DRAFT_CONTEXT);
        await reloadThread(payload.threadId);
        return;
      }
      // Sent and persisted: the attachments belonged to that one message.
      setDraftContext(EMPTY_DRAFT_CONTEXT);
      if (payload?.message) {
        setMessages((current) => [...current, payload.message as BoardAiChatMessageView]);
      }
      // Only when something was attached: a plain turn has no chips to fetch,
      // and the optimistic row is already exactly what was stored.
      if (contextPayload && payload?.threadId) await reloadThread(payload.threadId);
      if (!mandatoryDocumentContext && payload?.threadId) await refreshThreads();
    } catch {
      if (requestDocumentScopeId !== activeDocumentScopeRef.current && requestDocumentScopeId) {
        setDocumentSessionValue(requestDocumentScopeId, (session) => ({
          ...session,
          error: 'Could not reach Board AI.',
          sending: false,
        }));
        return;
      }
      if (requestDocumentScopeId !== activeDocumentScopeRef.current) return;
      setError('Could not reach Board AI.');
    } finally {
      if (requestDocumentScopeId !== activeDocumentScopeRef.current) return;
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft,
    sending,
    boardId,
    activeThreadId,
    draftContext,
    mandatoryDocumentContext,
    documentScopeId,
    setActiveThreadId,
    setDraft,
    setDraftContext,
    setError,
    setMessages,
    setSending,
    reloadThread,
  ]);

  const refreshThreads = useCallback(async () => {
    try {
      const response = await fetch(CHAT_PATH(boardId), { method: 'GET' });
      if (!response.ok) return;
      const payload = await response.json() as { threads?: BoardAiChatThreadSummary[] };
      setThreads(payload.threads ?? []);
    } catch {
      // A stale thread list is cosmetic; the conversation on screen is right.
    }
  }, [boardId]);

  const threadOptions = useMemo(() => threads.map((thread) => ({
    id: thread.id,
    label: threadLabel(thread),
  })), [threads]);

  if (!isOpen) return null;

  return (
    <aside
      data-board-ai-chat="true"
      data-board-ai-chat-presentation={presentation}
      data-board-ai-chat-document-scope={documentScopeId ?? ''}
      data-board-ai-chat-yielded={yieldsToEditor ? 'true' : 'false'}
      role="complementary"
      aria-label={mandatoryDocumentContext ? 'PDF AI chat' : 'Board AI chat'}
      /* The docked reader's band: above the editor tier's z-[1000] only while
         no editor is blocking, and always below the toolbar's z-[3000]. When
         an editor opens this goes transparent and inert rather than moving,
         so no z-index anywhere else has to change. */
      className={`${isEmbedded
        ? 'flex h-full min-h-0 w-full flex-col bg-white'
        : 'fixed right-0 top-0 z-[1200] flex h-full w-full max-w-[420px] flex-col border-l border-gray-200 bg-white shadow-xl transition-opacity duration-150'} ${
        yieldsToEditor ? 'pointer-events-none opacity-0' : ''
      }`}
    >
      <header className="flex shrink-0 items-center gap-1.5 border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold text-gray-800">{mandatoryDocumentContext ? 'PDF AI' : 'Board AI'}</span>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <BoardAiChatModelChooser disabled={sending} onError={setError} />
          <button
            type="button"
            data-board-ai-chat-action="new"
            title="New chat"
            aria-label="New chat"
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            onClick={startNewChat}
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-board-ai-chat-action="close"
            title="Close"
            aria-label="Close Board AI"
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {!mandatoryDocumentContext && threadOptions.length > 0 ? (
        <div className="shrink-0 border-b border-gray-100 px-3 py-1.5">
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Conversation</span>
            <select
              aria-label="Conversation"
              data-board-ai-chat-thread=""
              className="w-full truncate rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-700"
              value={activeThreadId ?? ''}
              onChange={(event) => setActiveThreadId(event.target.value === '' ? null : event.target.value)}
            >
              <option value="">New chat</option>
              {threadOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div
        ref={bodyRef}
        data-board-ai-chat-body="true"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-2"
      >
        {loadingThreads || loadingMessages ? (
          <p className="flex items-center gap-1.5 text-[11px] italic text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Loading…
          </p>
        ) : null}

        {!loadingThreads && !loadingMessages && messages.length === 0 ? (
          <div data-board-ai-chat-empty="true" className="pt-6 text-center">
            <p className="text-xs font-medium text-gray-700">
              {mandatoryDocumentContext
                ? 'Your private AI conversation for this PDF.'
                : 'Your private AI conversation for this board.'}
            </p>
            {/* Says exactly what is true today. It does not claim the board is
                analysed, because nothing from the board is sent. */}
            <p className="mt-1 text-[11px] text-gray-500">
              {mandatoryDocumentContext
                ? 'Only you can see it. This PDF is always attached; optional context is explicit.'
                : 'Only you can see it. Only items you attach are shared with Board AI.'}
            </p>
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            data-board-ai-chat-message={message.role}
            className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                message.role === 'user'
                  ? 'bg-blue-50 text-gray-800'
                  : 'bg-gray-50 text-gray-800'
              }`}
            >
              {/*
                Rendered as TEXT. React escapes it, so a model or a user cannot
                introduce markup: there is no dangerouslySetInnerHTML and no
                markdown pass anywhere on this path.
              */}
              {message.content}
              {message.role === 'assistant' && message.model ? (
                <span className="mt-1 block text-[10px] text-gray-400">{message.model}</span>
              ) : null}
              {/* Read-only, and drawn from the server's sanitized view alone.
                  Not a citation: it says what this message was allowed to
                  use, not where the answer came from. */}
              {message.role === 'user' ? <BoardAiChatPersistedChips context={message.context} /> : null}
            </div>
          </div>
        ))}

        {sending ? (
          <p data-board-ai-chat-pending="true" className="flex items-center gap-1.5 text-[11px] italic text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Thinking…
          </p>
        ) : null}
      </div>

      {error ? (
        <p data-board-ai-chat-error="true" role="alert" className="shrink-0 border-t border-red-100 bg-red-50 px-3 py-1.5 text-[11px] text-red-700">
          {error}
        </p>
      ) : null}

      <div className="shrink-0 border-t border-gray-200 p-2">
        {mandatoryDocumentContext ? (
          <div
            data-board-ai-context-mandatory="knowledge-document"
            className="mb-1.5 flex max-w-full items-center gap-1 rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[11px] text-purple-900"
          >
            <FileText className="h-3 w-3 shrink-0 text-purple-500" aria-hidden="true" />
            <span className="min-w-0 truncate">{mandatoryDocumentContext.label}</span>
            <span className="min-w-0 shrink truncate text-purple-500">· Using this PDF</span>
          </div>
        ) : null}
        <BoardAiChatDraftChips
          items={draftContext}
          disabled={sending}
          onRemove={(key) => {
            setContextNotice(null);
            setDraftContext(removeBoardAiDraftContext(draftContext, key));
          }}
        />

        {contextNotice ? (
          <p data-board-ai-context-notice="true" className="mb-1.5 text-[10px] text-gray-500">
            {contextNotice}
          </p>
        ) : null}

        <div className="relative mb-1.5">
          <button
            type="button"
            data-board-ai-context-add="true"
            aria-label="Add context"
            aria-expanded={contextMenuOpen}
            disabled={sending}
            className="flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => {
              setContextNotice(null);
              setContextMenuOpen((open) => !open);
            }}
          >
            <Paperclip className="h-3 w-3" aria-hidden="true" />
            Context
            {draftContext.length > 0 ? (
              <span className="text-gray-400">
                {draftContext.length}/{mandatoryDocumentContext ? BOARD_AI_DRAFT_CONTEXT_MAX - 1 : BOARD_AI_DRAFT_CONTEXT_MAX}
              </span>
            ) : null}
          </button>

          {contextMenuOpen ? (
            <div
              data-board-ai-context-menu="true"
              role="menu"
              className="absolute bottom-full left-0 z-10 mb-1 w-60 rounded-md border border-gray-200 bg-white p-1 shadow-lg"
            >
              {selectedBoardItem ? (
                <button
                  type="button"
                  role="menuitem"
                  data-board-ai-context-use-selected="true"
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] text-gray-700 hover:bg-gray-50"
                  onClick={() => attach(selectedBoardItem)}
                >
                  <span className="min-w-0 truncate">Use selected item</span>
                  <span className="ml-auto min-w-0 shrink truncate text-gray-400">
                    {selectedBoardItem.label}
                  </span>
                </button>
              ) : (
                /* No misleading action. Naming the requirement is more use
                   than a disabled button that says nothing. */
                <p data-board-ai-context-empty="true" className="px-2 py-1.5 text-[11px] text-gray-500">
                  Select a Note or PDF on the board, or add a page from the PDF reader.
                </p>
              )}
              <p className="mt-0.5 border-t border-gray-100 px-2 pb-0.5 pt-1 text-[10px] text-gray-400">
                Only attached items are shared with Board AI.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-end gap-1.5">
          <textarea
            data-board-ai-chat-input="true"
            aria-label={mandatoryDocumentContext ? 'Message PDF AI' : 'Message Board AI'}
            rows={2}
            maxLength={BOARD_AI_CHAT_MESSAGE_MAX}
            placeholder={mandatoryDocumentContext ? 'Ask about this PDF…' : 'Ask about this board…'}
            className="min-h-0 w-full resize-none rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-400"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter is a newline -- the composer
              // convention already used elsewhere in the app.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            data-board-ai-chat-action="send"
            aria-label="Send"
            title="Send"
            disabled={!canSend}
            className="shrink-0 rounded bg-blue-600 p-1.5 text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            onClick={() => { void send(); }}
          >
            {sending
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * A thread has no title until something names one, and V1 names none -- no AI
 * title, no silent mutation. The fallback is its own creation time, which is
 * deterministic and tells two conversations apart.
 */
function threadLabel(thread: BoardAiChatThreadSummary): string {
  if (thread.title && thread.title.trim().length > 0) return thread.title;
  const created = new Date(thread.createdAt);
  if (Number.isNaN(created.getTime())) return 'Chat';
  return `Chat · ${created.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })}`;
}

/** One safe sentence per failure. No provider text, no status echo, no stack. */
function safeError(status: number, category?: string): string {
  if (status === 429) return 'Too many messages. Wait a moment and try again.';
  if (status === 403) return 'You no longer have access to this board.';
  if (status === 404) return 'That conversation is no longer available.';
  if (category === 'invalid_configuration') {
    return 'Your selected AI provider is not usable. Check it in Settings.';
  }
  return 'Board AI could not answer. Your message was saved.';
}
