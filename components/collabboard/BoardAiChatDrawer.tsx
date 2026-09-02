'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquarePlus, SendHorizontal, X } from 'lucide-react';

import BoardAiChatModelChooser from '@/components/collabboard/BoardAiChatModelChooser';
import { BOARD_AI_CHAT_MESSAGE_MAX } from '@/lib/domain/ai/boardAiChatClient';
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
 * What it is not: it is not a Reader pane, it holds no board content, and it
 * sends none. V1 is conversation text. There is no context chip, no citation
 * and no Save as Note, because none of those exist yet -- and a control that
 * did nothing would be worse than its absence.
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
  /**
   * The board's OWN blocking-editor authority, forwarded unchanged -- the same
   * flag the canvas toolbar and the Knowledge reader already step aside on. A
   * yielded drawer is invisible and inert, so an editor opened from anywhere
   * keeps the screen without this surface fighting it for clicks.
   */
  readonly blockingEditorOpen?: boolean;
}

/** A thread the user has, or the not-yet-created one a New chat represents. */
type ActiveThread = string | null;

export default function BoardAiChatDrawer({
  boardId,
  isOpen,
  onClose,
  blockingEditorOpen = false,
}: BoardAiChatDrawerProps) {
  const [threads, setThreads] = useState<readonly BoardAiChatThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<ActiveThread>(null);
  const [messages, setMessages] = useState<readonly BoardAiChatMessageView[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const yieldsToEditor = blockingEditorOpen;

  /**
   * Opening the drawer READS; it never writes. A thread row appears only when
   * a first message is actually sent, so browsing the surface leaves nothing
   * behind -- and an empty state is a real state, not a row to create.
   */
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, boardId]);

  /** One thread's messages, reloaded whenever the active thread changes. */
  useEffect(() => {
    if (!isOpen) return;
    if (activeThreadId === null) { setMessages([]); return; }
    let cancelled = false;
    setLoadingMessages(true);
    (async () => {
      try {
        const response = await fetch(`${CHAT_PATH(boardId)}?threadId=${encodeURIComponent(activeThreadId)}`);
        if (!response.ok) throw new Error(String(response.status));
        const payload = await response.json() as { messages?: BoardAiChatMessageView[] };
        if (!cancelled) setMessages(payload.messages ?? []);
      } catch {
        if (!cancelled) { setMessages([]); setError('Could not load this conversation.'); }
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, boardId, activeThreadId]);

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
    setError(null);
  }, []);

  const canSend = draft.trim().length > 0 && !sending;

  const send = useCallback(async () => {
    const content = draft.trim();
    if (content.length === 0 || sending) return;
    setSending(true);
    setError(null);
    // Shown immediately because the server persists the user turn BEFORE it
    // generates: this is what was really stored, not an optimistic guess.
    const pending: BoardAiChatMessageView = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content,
      provider: null,
      model: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, pending]);
    setDraft('');

    try {
      const response = await fetch(CHAT_PATH(boardId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // No provider, model or key: execution is the user's stored role
        // preference, resolved server-side.
        body: JSON.stringify(activeThreadId === null
          ? { message: content }
          : { threadId: activeThreadId, message: content }),
      });
      const payload = await response.json().catch(() => null) as
        | { threadId?: string; message?: BoardAiChatMessageView; error?: string }
        | null;

      // The thread id is adopted even from a failure that carries one: the
      // question IS stored, and losing the id would strand it.
      if (payload?.threadId) setActiveThreadId(payload.threadId);

      if (!response.ok) {
        setError(safeError(response.status, payload?.error));
        // The user's turn stays on screen because it stays in the database. A
        // failed answer does not unask the question.
        return;
      }
      if (payload?.message) {
        setMessages((current) => [...current, payload.message as BoardAiChatMessageView]);
      }
      if (payload?.threadId) await refreshThreads();
    } catch {
      setError('Could not reach Board AI.');
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, sending, boardId, activeThreadId]);

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
      data-board-ai-chat-yielded={yieldsToEditor ? 'true' : 'false'}
      role="complementary"
      aria-label="Board AI chat"
      /* The docked reader's band: above the editor tier's z-[1000] only while
         no editor is blocking, and always below the toolbar's z-[3000]. When
         an editor opens this goes transparent and inert rather than moving,
         so no z-index anywhere else has to change. */
      className={`fixed right-0 top-0 z-[1200] flex h-full w-full max-w-[420px] flex-col border-l border-gray-200 bg-white shadow-xl transition-opacity duration-150 ${
        yieldsToEditor ? 'pointer-events-none opacity-0' : ''
      }`}
    >
      <header className="flex shrink-0 items-center gap-1.5 border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold text-gray-800">Board AI</span>
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

      {threadOptions.length > 0 ? (
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
            <p className="text-xs font-medium text-gray-700">Your private AI conversation for this board.</p>
            {/* Says exactly what is true today. It does not claim the board is
                analysed, because nothing from the board is sent. */}
            <p className="mt-1 text-[11px] text-gray-500">
              Only you can see it. No board content is shared with the AI yet.
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
        <div className="flex items-end gap-1.5">
          <textarea
            data-board-ai-chat-input="true"
            aria-label="Message Board AI"
            rows={2}
            maxLength={BOARD_AI_CHAT_MESSAGE_MAX}
            placeholder="Ask about this board…"
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
