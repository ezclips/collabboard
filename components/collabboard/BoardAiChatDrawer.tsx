'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, FilePlus2, FileText, Loader2, MessageSquarePlus, Paperclip, SendHorizontal, X } from 'lucide-react';

import BoardAiChatModelChooser from '@/components/collabboard/BoardAiChatModelChooser';
import {
  BoardAiChatDraftChips,
  BoardAiChatPersistedChips,
} from '@/components/collabboard/BoardAiChatContextChips';
import { BOARD_AI_CHAT_MESSAGE_MAX } from '@/lib/domain/ai/boardAiChatClient';
import { boardAiCitationIdentityKey } from '@/lib/domain/ai/boardAiChatCitation';
import type { BoardAiCitationItem } from '@/lib/domain/ai/boardAiChatCitation';
import { boardAiNoteEvidenceFromCitations } from '@/lib/domain/ai/boardAiNoteProvenance';
import type { BoardAiNoteEvidence } from '@/lib/domain/ai/boardAiNoteProvenance';
import {
  BOARD_AI_DRAFT_CONTEXT_MAX,
  addBoardAiDraftContext,
  boardAiDraftFromDocument,
  boardAiDraftFromPage,
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
 * board. PDF-scoped assistant answers can now be saved as ordinary board Notes
 * only when the message has a stored page-level origin.
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
    readonly pageNumber?: number | null;
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
  readonly documentSessions?: Record<string, BoardAiDocumentScopedSession>;
  readonly onDocumentSessionsChange?: React.Dispatch<
    React.SetStateAction<Record<string, BoardAiDocumentScopedSession>>
  >;
  /**
   * Opens a cited source, through the board's OWN Knowledge navigation.
   *
   * A citation is identity the server authorized -- a document and, where the
   * source had one, a page -- so this hands both to the existing authority and
   * nothing else. Absent means citations still render, as plain labels: a
   * source is worth naming even where this surface cannot navigate to it.
   */
  readonly onOpenCitation?: (request: {
    readonly knowledgeDocumentId: string;
    readonly pageNumber?: number;
  }) => void;
  readonly canSaveAssistantAsNote?: boolean;
  readonly onSaveAssistantAsNote?: (request: BoardAiAssistantNoteSaveRequest) => Promise<void>;
  /**
   * The one supported board object currently selected, already reduced to a
   * draft by the shell's own selection authority. Null when the selection is
   * empty, multiple, or something Board AI cannot honestly use.
   */
  readonly selectedBoardItem?: BoardAiDraftContextItem | null;
}

export interface BoardAiAssistantNoteSaveRequest {
  readonly messageId: string;
  readonly content: string;
  /**
   * The answer's VALIDATED supporting evidence -- 0..N canonical citations the
   * server already vouched for, in the shape a source_reference can store.
   *
   * Not the model's context: a source the model was shown and never cited is
   * not provenance, and an answer that cited nothing arrives here with an
   * empty array and saves unsourced. The browser never adds to this set.
   */
  readonly evidence: readonly BoardAiNoteEvidence[];
}

/** A thread the user has, or the not-yet-created one a New chat represents. */
type ActiveThread = string | null;

/** A stable empty default, so an absent prop is not a new array each render. */
const EMPTY_DRAFT_CONTEXT: readonly BoardAiDraftContextItem[] = [];

/** A stable empty default, so an uncited answer is not a new array each render. */
const NO_CITATIONS: readonly BoardAiCitationItem[] = [];

/** A stable empty default, so an uncited answer is not a new array each render. */
const NO_NOTE_EVIDENCE: readonly BoardAiNoteEvidence[] = [];

/**
 * The sources one answer shows, each named once.
 *
 * The server already de-duplicates what it builds and what it reads back, so
 * this is the surface's own guard rather than its only one: a repeated
 * identity would otherwise render twice and collide on its React key.
 */
function visibleCitations(items: readonly BoardAiCitationItem[]): readonly BoardAiCitationItem[] {
  const seen = new Set<string>();
  const unique: BoardAiCitationItem[] = [];
  for (const item of items) {
    const key = boardAiCitationIdentityKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique.length === items.length ? items : unique;
}

/**
 * What one cited source is called on screen.
 *
 * The label is the server's; the page is appended only where the citation has
 * one. A whole-document or post citation says so by saying nothing more -- it
 * never borrows a page it was not given.
 */
function boardAiCitationLabel(item: BoardAiCitationItem): string {
  return item.pageNumber === undefined ? item.label : `${item.label} · p. ${item.pageNumber}`;
}

export interface BoardAiDocumentScopedSession {
  readonly activeThreadId: string | null;
  readonly messages: readonly BoardAiChatMessageView[];
  readonly draft: string;
  readonly loadingMessages: boolean;
  readonly sending: boolean;
  readonly error: string | null;
  /**
   * Assistant messages already saved as a Note, by message id.
   *
   * It lives HERE, in the session the workspace host owns, for the same reason
   * the thread does: switching the right panel to Library unmounts this drawer,
   * and a duplicate-save guard kept in drawer-local state would come back empty
   * -- offering a second Save as Note for a Note that already exists. Absent
   * means nothing in this document's thread has been saved yet.
   */
  readonly savedNoteMessageIds?: readonly string[];
  /**
   * Assistant messages whose Note save is IN FLIGHT, by message id.
   *
   * The completed list above is not enough on its own. A save is an async
   * write, and the panel can be unmounted while it is still running -- switch
   * to Library and back and the drawer that started it is gone. With the
   * in-flight identity held only by that mount, the remounted panel saw a
   * message that was neither saved nor saving and offered Save as Note again,
   * which is two Notes for one answer.
   *
   * So the pending identity lives in the session the host owns, exactly as the
   * completed one does, and is written BEFORE the write begins. Absent means
   * nothing is in flight for this document.
   */
  readonly pendingNoteSaveMessageIds?: readonly string[];
}

/** A stable empty default, so an unsaved session is not a new array each read. */
const EMPTY_SAVED_NOTE_MESSAGE_IDS: readonly string[] = [];

const EMPTY_DOCUMENT_SESSION: BoardAiDocumentScopedSession = {
  activeThreadId: null,
  messages: [],
  draft: '',
  loadingMessages: false,
  sending: false,
  error: null,
  savedNoteMessageIds: EMPTY_SAVED_NOTE_MESSAGE_IDS,
  pendingNoteSaveMessageIds: EMPTY_SAVED_NOTE_MESSAGE_IDS,
};

/**
 * What one Save as Note attempt is doing right now.
 *
 * 'failed' is this mount's business alone -- it is a message to the person who
 * clicked, and a remount has nothing to apologise for. 'saving' and 'saved'
 * are outcomes the SESSION remembers, held as identity lists rather than state
 * entries so a remount can rebuild them.
 */
type AssistantNoteSaveState = 'saving' | 'saved' | 'failed';

/** Where one assistant message's save has got to, in the session's own terms. */
type AssistantNoteSaveOutcome = 'pending' | 'saved' | 'idle';

/** Adds an identity once; returns the SAME array when it is already there. */
function withMessageId(
  identities: readonly string[],
  messageId: string,
): readonly string[] {
  return identities.includes(messageId) ? identities : [...identities, messageId];
}

function withoutMessageId(
  identities: readonly string[],
  messageId: string,
): readonly string[] {
  return identities.includes(messageId)
    ? identities.filter((identity) => identity !== messageId)
    : identities;
}

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

/**
 * The evidence one assistant answer may claim, read from its OWN validated
 * citations.
 *
 * Replaces a backward walk to the preceding user message's context. That
 * answered "what was the model shown", which is a different question: it
 * credited sources the answer never used, could only ever produce one
 * reference, and flattened an exact selection to its page on the way.
 *
 * An answer with no validated citations yields an empty set, and saving is
 * still offered -- the Note is simply unsourced. There is deliberately no
 * fallback to the open document, the active page or the live selection.
 */
function assistantNoteEvidenceForMessage(
  message: BoardAiChatMessageView,
): readonly BoardAiNoteEvidence[] {
  return boardAiNoteEvidenceFromCitations(message.citations ?? null);
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
  documentSessions: controlledDocumentSessions,
  onDocumentSessionsChange,
  onOpenCitation,
  canSaveAssistantAsNote = false,
  onSaveAssistantAsNote,
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
  const [internalDocumentSessions, setInternalDocumentSessions] =
    useState<Record<string, BoardAiDocumentScopedSession>>({});
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextNotice, setContextNotice] = useState<string | null>(null);
  const [assistantNoteSaveStateByMessageId, setAssistantNoteSaveStateByMessageId] =
    useState<Record<string, AssistantNoteSaveState>>({});
  const assistantNoteSaveStateRef = useRef<Record<string, AssistantNoteSaveState>>({});
  const [boardSavedNoteMessageIds, setBoardSavedNoteMessageIds] =
    useState<readonly string[]>(EMPTY_SAVED_NOTE_MESSAGE_IDS);
  const [boardPendingNoteSaveMessageIds, setBoardPendingNoteSaveMessageIds] =
    useState<readonly string[]>(EMPTY_SAVED_NOTE_MESSAGE_IDS);
  const savedNoteMessageIdsRef = useRef<ReadonlySet<string>>(new Set<string>());
  const pendingNoteSaveMessageIdsRef = useRef<ReadonlySet<string>>(new Set<string>());
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const activeDocumentScopeRef = useRef<string | null>(null);

  const yieldsToEditor = blockingEditorOpen;
  const isEmbedded = presentation === 'embedded';
  const documentScopeId = documentScope?.knowledgeDocumentId ?? null;
  const documentSessions = controlledDocumentSessions ?? internalDocumentSessions;
  const setDocumentSessions = onDocumentSessionsChange ?? setInternalDocumentSessions;
  const documentSession = documentScopeId
    ? documentSessions[documentScopeId] ?? EMPTY_DOCUMENT_SESSION
    : EMPTY_DOCUMENT_SESSION;
  const activeThreadId = documentScopeId ? documentSession.activeThreadId : boardActiveThreadId;
  const messages = documentScopeId ? documentSession.messages : boardMessages;
  const draft = documentScopeId ? documentSession.draft : boardDraft;
  const loadingMessages = documentScopeId ? documentSession.loadingMessages : boardLoadingMessages;
  const sending = documentScopeId ? documentSession.sending : boardSending;
  const error = documentScopeId ? documentSession.error : boardError;
  const savedNoteMessageIds = documentScopeId
    ? documentSession.savedNoteMessageIds ?? EMPTY_SAVED_NOTE_MESSAGE_IDS
    : boardSavedNoteMessageIds;
  const savedNoteMessageIdSet = useMemo(
    () => new Set(savedNoteMessageIds),
    [savedNoteMessageIds],
  );
  const pendingNoteSaveMessageIds = documentScopeId
    ? documentSession.pendingNoteSaveMessageIds ?? EMPTY_SAVED_NOTE_MESSAGE_IDS
    : boardPendingNoteSaveMessageIds;
  const pendingNoteSaveMessageIdSet = useMemo(
    () => new Set(pendingNoteSaveMessageIds),
    [pendingNoteSaveMessageIds],
  );
  const mandatoryDocumentContext = useMemo(() => {
    if (!documentScope) return null;
    const pageNumber = documentScope.pageNumber;
    return Number.isInteger(pageNumber) && (pageNumber ?? 0) >= 1
      ? boardAiDraftFromPage(documentScope.knowledgeDocumentId, documentScope.originalFilename, pageNumber as number)
      : boardAiDraftFromDocument(documentScope.knowledgeDocumentId, documentScope.originalFilename);
  }, [documentScope]);

  const setDocumentSessionValue = useCallback((
    documentId: string,
    updater: (session: BoardAiDocumentScopedSession) => BoardAiDocumentScopedSession,
  ) => {
    setDocumentSessions((current) => ({
      ...current,
      [documentId]: updater(current[documentId] ?? EMPTY_DOCUMENT_SESSION),
    }));
  }, [setDocumentSessions]);

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

  /**
   * Moves ONE assistant message between the session's save states.
   *
   * One writer for both lists, and one update, so a completing save cannot be
   * observed half-applied -- pending is dropped and saved is added together.
   * Every write is a function of the CURRENT session: a save that finishes
   * after its own panel unmounted merges into whatever the session holds by
   * then rather than restoring a snapshot taken before it started.
   *
   * Appending an identity -- never replacing a list -- is what keeps several
   * answers in one thread independent, and what stops a later turn from
   * un-saving an earlier one.
   */
  const setAssistantNoteSaveOutcome = useCallback((
    messageId: string,
    outcome: AssistantNoteSaveOutcome,
  ) => {
    const apply = (session: BoardAiDocumentScopedSession): BoardAiDocumentScopedSession => {
      const pending = session.pendingNoteSaveMessageIds ?? EMPTY_SAVED_NOTE_MESSAGE_IDS;
      const saved = session.savedNoteMessageIds ?? EMPTY_SAVED_NOTE_MESSAGE_IDS;
      const nextPending = outcome === 'pending'
        ? withMessageId(pending, messageId)
        : withoutMessageId(pending, messageId);
      const nextSaved = outcome === 'saved' ? withMessageId(saved, messageId) : saved;
      if (nextPending === pending && nextSaved === saved) return session;
      return { ...session, pendingNoteSaveMessageIds: nextPending, savedNoteMessageIds: nextSaved };
    };
    if (documentScopeId) {
      setDocumentSessionValue(documentScopeId, apply);
      return;
    }
    setBoardPendingNoteSaveMessageIds((current) => (
      outcome === 'pending' ? withMessageId(current, messageId) : withoutMessageId(current, messageId)
    ));
    if (outcome === 'saved') {
      setBoardSavedNoteMessageIds((current) => withMessageId(current, messageId));
    }
  }, [documentScopeId, setDocumentSessionValue]);

  // The click guard reads both identity sets synchronously; these mirrors are
  // what a REMOUNTED drawer consults, since its own attempt map starts empty.
  useEffect(() => {
    savedNoteMessageIdsRef.current = savedNoteMessageIdSet;
  }, [savedNoteMessageIdSet]);

  useEffect(() => {
    pendingNoteSaveMessageIdsRef.current = pendingNoteSaveMessageIdSet;
  }, [pendingNoteSaveMessageIdSet]);

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

  const saveAssistantAsNote = useCallback(async (
    message: BoardAiChatMessageView,
    source: Omit<BoardAiAssistantNoteSaveRequest, 'messageId' | 'content'>,
  ) => {
    if (!onSaveAssistantAsNote) return;
    // Three guards, one rule: this message must not already be saved, must not
    // already be in flight, and must not be mid-attempt in this mount. The
    // first two read the SESSION, so they hold across an unmount; the third is
    // synchronous, so a second click in the same tick loses too.
    if (savedNoteMessageIdsRef.current.has(message.id)) return;
    if (pendingNoteSaveMessageIdsRef.current.has(message.id)) return;
    const currentState = assistantNoteSaveStateRef.current[message.id];
    if (currentState === 'saving' || currentState === 'saved') return;
    // Claimed BEFORE the write can begin a second time -- both in the session,
    // which outlives this panel, and in the mirror the next click reads.
    setAssistantNoteSaveOutcome(message.id, 'pending');
    pendingNoteSaveMessageIdsRef.current = new Set([...pendingNoteSaveMessageIdsRef.current, message.id]);
    assistantNoteSaveStateRef.current = { ...assistantNoteSaveStateRef.current, [message.id]: 'saving' };
    setAssistantNoteSaveStateByMessageId(assistantNoteSaveStateRef.current);
    try {
      await onSaveAssistantAsNote({
        messageId: message.id,
        content: message.content,
        ...source,
      });
      assistantNoteSaveStateRef.current = { ...assistantNoteSaveStateRef.current, [message.id]: 'saved' };
      setAssistantNoteSaveStateByMessageId(assistantNoteSaveStateRef.current);
      // Only a save that actually completed is remembered, and the pending
      // claim is released in the same update.
      setAssistantNoteSaveOutcome(message.id, 'saved');
    } catch {
      assistantNoteSaveStateRef.current = { ...assistantNoteSaveStateRef.current, [message.id]: 'failed' };
      setAssistantNoteSaveStateByMessageId(assistantNoteSaveStateRef.current);
      // A failure leaves the message saveable: the claim is released and
      // nothing is recorded as saved, because no Note exists for it.
      pendingNoteSaveMessageIdsRef.current = new Set(
        [...pendingNoteSaveMessageIdsRef.current].filter((identity) => identity !== message.id),
      );
      setAssistantNoteSaveOutcome(message.id, 'idle');
    }
  }, [setAssistantNoteSaveOutcome, onSaveAssistantAsNote]);

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

        {messages.map((message, index) => {
          // The answer's own validated evidence -- possibly none, which is a
          // saveable outcome and not a reason to withhold the action.
          const assistantNoteEvidence = message.role === 'assistant'
            ? assistantNoteEvidenceForMessage(message)
            : NO_NOTE_EVIDENCE;
          const noteSaveState: AssistantNoteSaveState | undefined = savedNoteMessageIdSet.has(message.id)
            ? 'saved'
            : pendingNoteSaveMessageIdSet.has(message.id)
              ? 'saving'
              : assistantNoteSaveStateByMessageId[message.id];
          const citations = message.role === 'assistant'
            ? visibleCitations(message.citations?.items ?? NO_CITATIONS)
            : NO_CITATIONS;
          // Board edit authority and a handler -- nothing about provenance.
          // An uncited answer saves as an ordinary unsourced Note.
          const canShowSaveAsNote = message.role === 'assistant'
            && canSaveAssistantAsNote
            && !!onSaveAssistantAsNote;
          return (
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
              {/*
                Which of the attached sources this answer actually used.
                Server-built and server-labelled: the model named tokens for
                blocks it had been given, and wrote none of this itself. An
                uncited answer renders nothing at all -- no empty heading.
              */}
              {citations.length > 0 ? (
                <div data-board-ai-chat-citations="true" className="mt-1.5 whitespace-normal border-t border-gray-200 pt-1.5">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">Sources</p>
                  <div className="flex flex-wrap gap-1">
                    {citations.map((item) => {
                      const citationKey = boardAiCitationIdentityKey(item);
                      const citationLabel = boardAiCitationLabel(item);
                      const citedDocumentId = item.knowledgeDocumentId;
                      const chipClass = 'inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none';
                      if (!onOpenCitation || !citedDocumentId) {
                        return (
                          <span
                            key={citationKey}
                            data-board-ai-chat-citation={citationKey}
                            className={`${chipClass} border-gray-200 text-gray-500`}
                            title={citationLabel}
                          >
                            <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{citationLabel}</span>
                          </span>
                        );
                      }
                      return (
                        <button
                          key={citationKey}
                          type="button"
                          data-board-ai-chat-citation={citationKey}
                          data-board-ai-chat-citation-document={citedDocumentId}
                          data-board-ai-chat-citation-page={item.pageNumber ?? ''}
                          title={`Open ${citationLabel}`}
                          aria-label={`Open ${citationLabel}`}
                          className={`${chipClass} border-gray-200 text-blue-700 transition hover:border-blue-200 hover:bg-blue-50`}
                          onClick={() => onOpenCitation({
                            knowledgeDocumentId: citedDocumentId,
                            ...(item.pageNumber === undefined ? {} : { pageNumber: item.pageNumber }),
                          })}
                        >
                          <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{citationLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {canShowSaveAsNote ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 whitespace-normal">
                  <button
                    type="button"
                    data-board-ai-chat-action="save-note"
                    data-board-ai-chat-save-message-id={message.id}
                    className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-default disabled:border-green-200 disabled:bg-green-50 disabled:text-green-700"
                    disabled={noteSaveState === 'saving' || noteSaveState === 'saved'}
                    onClick={() => { void saveAssistantAsNote(message, { evidence: assistantNoteEvidence }); }}
                  >
                    {noteSaveState === 'saved' ? (
                      <Check className="h-3 w-3" aria-hidden="true" />
                    ) : noteSaveState === 'saving' ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <FilePlus2 className="h-3 w-3" aria-hidden="true" />
                    )}
                    {noteSaveState === 'saved' ? 'Saved' : noteSaveState === 'saving' ? 'Savingâ€¦' : 'Save as Note'}
                  </button>
                  {noteSaveState === 'failed' ? (
                    <span data-board-ai-chat-save-note-error="true" className="text-[10px] text-red-600">
                      Could not save note.
                    </span>
                  ) : null}
                </div>
              ) : null}
              {/* Read-only, and drawn from the server's sanitized view alone.
                  Not a citation: it says what this message was allowed to
                  use, not where the answer came from. */}
              {message.role === 'user' ? <BoardAiChatPersistedChips context={message.context} /> : null}
            </div>
          </div>
          );
        })}

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
            data-board-ai-context-mandatory={mandatoryDocumentContext.request.type}
            className="mb-1.5 flex max-w-full items-center gap-1 rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[11px] text-purple-900"
          >
            <FileText className="h-3 w-3 shrink-0 text-purple-500" aria-hidden="true" />
            <span className="min-w-0 truncate">{mandatoryDocumentContext.label}</span>
            {mandatoryDocumentContext.detail ? (
              <span className="shrink-0 text-purple-600">· {mandatoryDocumentContext.detail}</span>
            ) : null}
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
