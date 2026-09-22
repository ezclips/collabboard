'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, FilePlus2, FileText, Loader2, MessageSquarePlus, Paperclip, Play, SendHorizontal, Upload, X } from 'lucide-react';

import BoardAiChatModelChooser from '@/components/collabboard/BoardAiChatModelChooser';
import {
  BoardAiChatDraftChips,
  BoardAiChatPersistedChips,
} from '@/components/collabboard/BoardAiChatContextChips';
import { BOARD_AI_CHAT_MESSAGE_MAX } from '@/lib/domain/ai/boardAiChatClient';
import { boardAiCitationIdentityKey } from '@/lib/domain/ai/boardAiChatCitation';
import {
  BOARD_AI_POST_CLIP_MIME,
  parseBoardAiPostClipPayload,
} from '@/lib/domain/ai/boardAiPostClipPayload';
import type { BoardAiCitationItem } from '@/lib/domain/ai/boardAiChatCitation';
import {
  BOARD_AI_DRAFT_CONTEXT_MAX,
  addBoardAiDraftContext,
  boardAiDraftFromDocument,
  boardAiDraftFromPage,
  boardAiDraftContextPayload,
  boardAiDraftKey,
  blockingBoardAiDraftContext,
  removeBoardAiDraftContext,
  withBoardAiDraftReadiness,
  type BoardAiDraftContextItem,
} from '@/lib/domain/ai/boardAiChatDraftContext';
import { formatTranscriptTimestamp } from '@/lib/domain/ai/boardAiTranscriptPassage';
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
/** The EXISTING knowledge endpoint: POST uploads a PDF, GET lists with status. */
const KNOWLEDGE_PATH = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}/knowledge`;
/**
 * How often to ask whether a freshly uploaded PDF is readable yet.
 *
 * Slow enough that a composer sitting open is not a load source, fast enough
 * that a small PDF does not appear stuck. Polling runs ONLY while something is
 * pending, which is a few seconds after an upload and never otherwise.
 */
const KNOWLEDGE_POLL_MS = 2500;

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
    /** A pageless source's locator: where in its text the citation points. */
    readonly charStart?: number;
    readonly charEnd?: number;
    /**
     * A transcript citation's moment, and the video it belongs to.
     *
     * Present together or not at all. The host uses them to SEEK a player
     * already on the board rather than navigate away; a host that does not
     * know how simply ignores them and opens the source as it always did.
     */
    readonly transcriptStartMs?: number;
    readonly videoIdentity?: string;
  }) => void;
  readonly canSaveAssistantAsNote?: boolean;
  readonly onSaveAssistantAsNote?: (request: BoardAiAssistantNoteSaveRequest) => Promise<void>;
  /**
   * The one supported board object currently selected, already reduced to a
   * draft by the shell's own selection authority. Null when the selection is
   * empty, multiple, or something Board AI cannot honestly use.
   */
  readonly selectedBoardItem?: BoardAiDraftContextItem | null;
  /**
   * Resolves a dragged post id against the board's own loaded posts. The SAME
   * reduction that produces `selectedBoardItem`, handed down as a function so a
   * dropped post and a selected one cannot disagree about what a post becomes.
   * Null for an id the board does not hold, or for a post Board AI cannot
   * honestly use -- and the drop then does nothing rather than attaching a
   * promise the server would refuse.
   */
  readonly onResolveDroppedPost?: (padletId: string) => BoardAiDraftContextItem | null;
}

export interface BoardAiAssistantNoteSaveRequest {
  readonly messageId: string;
  readonly content: string;
}

/** A thread the user has, or the not-yet-created one a New chat represents. */
type ActiveThread = string | null;

/** A stable empty default, so an absent prop is not a new array each render. */
const EMPTY_DRAFT_CONTEXT: readonly BoardAiDraftContextItem[] = [];

/** A stable empty default, so an uncited answer is not a new array each render. */
const NO_CITATIONS: readonly BoardAiCitationItem[] = [];


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

/**
 * The moment shown beside a transcript citation, or null.
 *
 * SEPARATE FROM THE LABEL, AND THAT IS THE POINT. Appending it to the label
 * string put it inside a `truncate` span, so on a source called "Audi a2 front
 * bumber removal and ac cooler change tips" the timestamp was the first thing
 * the ellipsis ate -- the chip looked exactly like an ordinary citation, and
 * the one piece of information the person had asked for was the one piece CSS
 * removed. Rendered as its own `shrink-0` element, the long label truncates and
 * the moment always survives.
 *
 * A PDF's page stays in the label because it is short and because a page is not
 * what anybody asked for; a moment is.
 */
function boardAiCitationMoment(item: BoardAiCitationItem): string | null {
  return item.transcriptStartMs === undefined
    ? null
    : formatTranscriptTimestamp(item.transcriptStartMs);
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

/*
 * There is deliberately NO evidence derivation here any more.
 *
 * The browser used to turn `message.citations` into the provenance a Note
 * would be saved with. But `board_ai_messages` is writable by the thread's
 * owner, so that JSON is not proof of anything the AI route produced -- a
 * user could hand-write an assistant row and mint a citation for any page
 * their board can read. The save now sends the message ID and nothing else,
 * and the server recovers provenance from the signed row it stored itself.
 *
 * `message.citations` remains what it always was for DISPLAY: the sanitized
 * chips below, which carry no proof and confer no authority.
 */

/**
 * Per-browser, not per-board: someone who wants board search generally wants it
 * on every board they open, and a per-board key would silently reset the
 * preference every time they moved.
 */
const BOARD_AI_SEARCH_PREFERENCE_KEY = 'collabboard.boardAi.searchBoard';

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
  onResolveDroppedPost,
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
  const [uploading, setUploading] = useState(false);
  /**
   * Cited documents this drawer has confirmed are GONE.
   *
   * A stored citation is a true statement about the past, so it is never
   * rewritten when its source is deleted -- and it cannot be, since the
   * citation list is inside the provenance signature over the message. What a
   * reader needs instead is to be told, at the moment it would have navigated,
   * that there is nothing left to open.
   *
   * Populated only by an ANSWERED probe. An unreachable network leaves the chip
   * alone rather than marking a live source dead.
   */
  const [goneCitationDocumentIds, setGoneCitationDocumentIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [contextNotice, setContextNotice] = useState<string | null>(null);
  /**
   * The board-search toggle. OFF BY DEFAULT, and off is what an absent stored
   * value means -- a browser with no preference, a private window, or a reader
   * that threw must all land on "do not search", never on "search because we
   * could not tell".
   *
   * Client-side only. This is a per-browser convenience, not a setting the
   * server needs to know between requests: every turn sends its own flag, so
   * there is no schema change and no way for a stale preference row to turn the
   * feature on for someone.
   */
  const [searchBoard, setSearchBoard] = useState(false);
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

  // Read once on mount, not during render: localStorage is unavailable in a
  // private window and throws rather than returning null, so every access is
  // guarded and a failure simply leaves the toggle off.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(BOARD_AI_SEARCH_PREFERENCE_KEY) === 'on') setSearchBoard(true);
    } catch { /* No preference is a preference: off. */ }
  }, []);

  const toggleSearchBoard = useCallback(() => {
    setSearchBoard((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(BOARD_AI_SEARCH_PREFERENCE_KEY, next ? 'on' : 'off');
      } catch { /* The toggle still works this session; only the memory is lost. */ }
      return next;
    });
  }, []);

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
      // THE CONTEXT MENU IS DISMISSED FIRST, AND THE PRECEDENCE LIVES HERE
      // rather than in a second listener of its own. Two document-level Escape
      // handlers would fire in registration order -- which nothing in this file
      // controls -- so one Escape would sometimes close the menu and sometimes
      // take the whole conversation with it. That is the same failure the note
      // above describes for editors, and it is avoided the same way: one chain,
      // in one place, innermost first.
      if (contextMenuOpen) {
        setContextMenuOpen(false);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, yieldsToEditor, onClose, contextMenuOpen]);

  /**
   * A click outside the context menu closes it.
   *
   * IT USED TO CLOSE ONLY BY PRESSING "Context" AGAIN, which is not where
   * anyone looks: every other menu on this board dismisses when you click away
   * from it, so this one read as stuck rather than as modal.
   *
   * POINTERDOWN, IN THE CAPTURE PHASE, and both halves matter. Pointerdown
   * rather than click, so the menu is gone before whatever was clicked reacts
   * -- on click, a menu overlapping the thing you aimed at swallows the first
   * press. Capture, so a handler that stops propagation on its own element
   * cannot leave the menu open behind it.
   */
  const contextMenuAreaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!contextMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const area = contextMenuAreaRef.current;
      // The trigger button lives inside this area too, so its own toggle still
      // works: a press on it is never "outside".
      if (area && event.target instanceof Node && area.contains(event.target)) return;
      setContextMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [contextMenuOpen]);

  /** Clears the surface only. No row is deleted, and none is created yet. */
  const startNewChat = useCallback(() => {
    setActiveThreadId(null);
    setMessages([]);
    setDraft('');
    setLoadingMessages(false);
    setError(null);
  }, [setActiveThreadId, setDraft, setError, setLoadingMessages, setMessages]);

  /**
   * Attachments that are not readable yet, or never will be.
   *
   * THE SEND GATE. A pending document has no extracted text, and every reader
   * filters on `processing_status = 'ready'` -- so sending one would attach a
   * source the server resolves to nothing. The model would answer honestly from
   * what it was given, and the user would read a confident reply about a file
   * that was never opened. Blocking the send is the only place that can be
   * prevented: nothing downstream can tell an empty attachment from an absent
   * one.
   */
  const blockingContext = blockingBoardAiDraftContext(draftContext);
  const canSend = draft.trim().length > 0 && !sending && !uploading && blockingContext.length === 0;

  const saveAssistantAsNote = useCallback(async (
    message: BoardAiChatMessageView,
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
      // The id and the visible text. No provenance: the server resolves that
      // from the message it signed.
      await onSaveAssistantAsNote({
        messageId: message.id,
        content: message.content,
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

  /* ---------------------------------------------------------------- */
  /* Dropping a post from the board                                     */
  /* ---------------------------------------------------------------- */

  /**
   * A GESTURE OVER THE EXISTING ATTACH, and nothing more.
   *
   * Everything a drop needs was already decided by `attach`: the cap, its
   * message, the duplicate refusal, and the mandatory-PDF variant. So this
   * resolves an id to the same draft item the selection path produces and hands
   * it to `attach` -- one builder, one set of rules, one place a refusal is
   * worded. A second path here would be free to drift, and the first thing it
   * would drift on is the cap.
   *
   * ORDER MATTERS MORE THAN IT LOOKS. `addBoardAiDraftContext` APPENDS. A
   * search block's sub-token (`S3.2`) has its block number baked from the
   * context length before bounding runs, which is only sound because the
   * bounder drops a suffix -- every attachment still sits in front of the
   * search. An attach that inserted ahead of an existing item would silently
   * misattribute every passage citation in the turn: no error, no symptom,
   * wrong sources. Appending is load-bearing, not incidental.
   */
  const [dropActive, setDropActive] = useState(false);

  const droppedPostIsSupported = useCallback((event: React.DragEvent) => (
    typeof onResolveDroppedPost === 'function'
    && event.dataTransfer.types.includes(BOARD_AI_POST_CLIP_MIME)
  ), [onResolveDroppedPost]);

  const handleContextDragOver = useCallback((event: React.DragEvent) => {
    if (!droppedPostIsSupported(event)) return;
    // Only a transfer we can actually honour is claimed. Without this the
    // browser's default refusal stands, which is the correct answer for a drag
    // carrying anything else.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropActive(true);
  }, [droppedPostIsSupported]);

  const handleContextDragLeave = useCallback(() => setDropActive(false), []);

  const handleContextDrop = useCallback((event: React.DragEvent) => {
    if (!droppedPostIsSupported(event)) return;
    event.preventDefault();
    setDropActive(false);
    const payload = parseBoardAiPostClipPayload(event.dataTransfer.getData(BOARD_AI_POST_CLIP_MIME));
    if (!payload) return;
    const item = onResolveDroppedPost?.(payload.padletId) ?? null;
    if (!item) {
      // A post the board does not hold, or one Board AI cannot use. Said out
      // loud for the same reason the cap is: a drop that lands on nothing reads
      // as a broken surface.
      setContextNotice('That post cannot be used as context.');
      return;
    }
    attach(item);
  }, [attach, droppedPostIsSupported, onResolveDroppedPost]);

  /* ---------------------------------------------------------------- */
  /* Uploading a PDF straight into the conversation                     */
  /* ---------------------------------------------------------------- */

  /**
   * One upload, on the rails that already exist.
   *
   * It posts to the SAME endpoint the PDF uploader uses, with the same
   * multipart field, and attaches the id that endpoint returns. No new
   * ingestion path, no new context type: the returned id is exactly what
   * `knowledge-document` already accepts, which is why this unit adds no server
   * code at all.
   *
   * PDF only, because that is what the ingestion pipeline supports. The picker
   * says so and the server refuses anything else.
   */
  const uploadPdf = useCallback(async (file: File) => {
    if (mandatoryDocumentContext && draftContext.length >= BOARD_AI_DRAFT_CONTEXT_MAX - 1) {
      setContextNotice(`Maximum ${BOARD_AI_DRAFT_CONTEXT_MAX - 1} optional context items with this PDF.`);
      return;
    }
    if (draftContext.length >= BOARD_AI_DRAFT_CONTEXT_MAX) {
      setContextNotice(`Maximum ${BOARD_AI_DRAFT_CONTEXT_MAX} context items.`);
      return;
    }
    setContextNotice(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(KNOWLEDGE_PATH(boardId), { method: 'POST', body });
      if (!response.ok) {
        // The endpoint's own messages are written for a user and carry no
        // provider or storage detail, so the fallback is only for a body that
        // did not parse.
        const payload = await response.json().catch(() => null);
        setContextNotice(typeof payload?.error === 'string' ? payload.error : 'Could not upload that file.');
        return;
      }
      const payload = await response.json().catch(() => null);
      const documentId = typeof payload?.id === 'string' ? payload.id : '';
      if (documentId.length === 0) {
        setContextNotice('Could not upload that file.');
        return;
      }
      // The SERVER's status, relayed rather than assumed. A fresh upload is
      // normally 'uploaded', but reading it means the chip is right even if
      // ingestion is instant or already failed.
      const item = boardAiDraftFromDocument(
        documentId,
        typeof payload?.originalFilename === 'string' ? payload.originalFilename : file.name,
        typeof payload?.processingStatus === 'string' ? payload.processingStatus : 'uploaded',
      );
      const result = addBoardAiDraftContext(draftContext, item);
      if (result.outcome !== 'added') {
        setContextNotice(result.outcome === 'duplicate'
          ? 'That is already attached.'
          : `Maximum ${BOARD_AI_DRAFT_CONTEXT_MAX} context items.`);
        return;
      }
      setDraftContext(result.items);
    } catch {
      setContextNotice('Could not upload that file.');
    } finally {
      setUploading(false);
    }
  }, [boardId, draftContext, mandatoryDocumentContext, setDraftContext]);

  /**
   * Watches a pending attachment until ingestion settles.
   *
   * It reads the board's existing knowledge list rather than a new status
   * endpoint -- that list already carries `processingStatus` per document and
   * is already authorized for this board. Polling stops the moment nothing is
   * pending, so a composer with no upload in it makes no requests at all.
   */
  useEffect(() => {
    const pendingIds = draftContext
      .filter((item) => item.readiness === 'pending')
      .map((item) => ('knowledgeDocumentId' in item.request ? item.request.knowledgeDocumentId : ''))
      .filter((id) => id.length > 0);
    if (pendingIds.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(KNOWLEDGE_PATH(boardId));
        if (!response.ok || cancelled) return;
        const payload = await response.json().catch(() => null);
        const documents: readonly { id?: unknown; processingStatus?: unknown }[] =
          Array.isArray(payload?.documents) ? payload.documents : [];
        if (cancelled) return;
        let next = draftContext;
        for (const id of pendingIds) {
          const found = documents.find((document) => document.id === id);
          if (!found || typeof found.processingStatus !== 'string') continue;
          next = withBoardAiDraftReadiness(next, id, found.processingStatus);
        }
        // Only when something actually moved, so an unchanged poll does not
        // re-render the composer every few seconds.
        if (next !== draftContext) setDraftContext(next);
      } catch {
        // A failed poll is not a failed upload. The next tick tries again, and
        // the chip keeps saying "Processing…" rather than inventing a failure.
      }
    };

    const timer = setInterval(() => { void poll(); }, KNOWLEDGE_POLL_MS);
    void poll();
    return () => { cancelled = true; clearInterval(timer); };
  }, [boardId, draftContext, setDraftContext]);

  /**
   * Open a cited source -- or say it is gone, and open nothing.
   *
   * WHY THE CHECK HAPPENS HERE rather than in the reader. Navigating hands the
   * dock to the reader and CLOSES this drawer, so a citation whose document no
   * longer exists used to cost the user their conversation and give them an
   * empty reader in exchange. Resolving first means a dead citation changes one
   * chip and nothing else.
   *
   * The board's own document list is the probe: it is already authorized, it is
   * already fetched by the upload poller, and it carries no page text. A
   * document missing from it is either deleted or no longer visible to this
   * reader, and both mean the same thing here -- there is nothing they can open.
   */
  const openCitation = useCallback(async (request: {
    readonly knowledgeDocumentId: string;
    readonly pageNumber?: number;
    readonly charStart?: number;
    readonly charEnd?: number;
    readonly transcriptStartMs?: number;
    readonly videoIdentity?: string;
  }) => {
    if (!onOpenCitation) return;
    if (goneCitationDocumentIds.has(request.knowledgeDocumentId)) return;

    let documents: readonly { id?: unknown }[] | null = null;
    try {
      const response = await fetch(KNOWLEDGE_PATH(boardId));
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        if (Array.isArray(payload?.documents)) documents = payload.documents;
      }
    } catch {
      // Unreachable, not answered. Fall through and navigate: the reader's own
      // error is a better outcome than this drawer claiming a source is gone
      // on the strength of a failed request.
    }

    if (documents !== null && !documents.some((document) => document.id === request.knowledgeDocumentId)) {
      setGoneCitationDocumentIds((current) => new Set([...current, request.knowledgeDocumentId]));
      return;
    }

    onOpenCitation(request);
  }, [boardId, goneCitationDocumentIds, onOpenCitation]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (content.length === 0 || sending) return;
    // The same rule as the disabled button, enforced again here: a keyboard
    // path, a race with a poll, or a future caller must not get past it.
    if (blockingBoardAiDraftContext(draftContext).length > 0) return;
    const requestDocumentScopeId = documentScopeId;
    setSending(true);
    setError(null);
    setContextNotice(null);
    // Captured for this ONE message. Attachments are not standing state: the
    // next question starts empty unless the user attaches again.
    const outgoingContext = mergeMandatoryDocumentContext(mandatoryDocumentContext, draftContext);
    const contextPayload = boardAiDraftContextPayload(outgoingContext);
    // NEVER IN A DOCUMENT-SCOPED SESSION. A PDF conversation is deliberately
    // about the one PDF in front of the user; pulling in passages from unrelated
    // notes would answer a question they did not ask, in a panel whose whole
    // premise is the document. The toggle is not offered there either.
    const shouldSearchBoard = searchBoard && !documentScopeId;
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
          // Omitted entirely when off, so a turn with the toggle down is
          // byte-identical to one sent before this feature existed. The server
          // treats absent as off, so nothing is lost by not sending `false`.
          //
          // The QUERY is not sent: the server searches the message it has
          // already validated above. A client that could name the query could
          // make the board search for something the user never typed.
          ...(shouldSearchBoard ? { searchBoard: true } : {}),
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
      // Only when the server had something to record: a plain turn has no chips
      // to fetch, and the optimistic row is already exactly what was stored.
      // A search counts even with nothing attached -- the server writes its own
      // board-search item, and that item IS the chip that says what was searched
      // and what was dropped.
      if ((contextPayload || shouldSearchBoard) && payload?.threadId) {
        await reloadThread(payload.threadId);
      }
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
                      const citationMoment = boardAiCitationMoment(item);
                      const citedDocumentId = item.knowledgeDocumentId;
                      const chipClass = 'inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none';
                      // THE SOURCE IS GONE. The citation itself is untouched --
                      // it says what the answer used, which is still true --
                      // but there is nothing to open, so the chip stops being a
                      // button and says why rather than failing on click.
                      if (citedDocumentId && goneCitationDocumentIds.has(citedDocumentId)) {
                        return (
                          <span
                            key={citationKey}
                            data-board-ai-chat-citation={citationKey}
                            data-board-ai-chat-citation-gone="true"
                            className={`${chipClass} border-gray-200 bg-gray-50 text-gray-400 line-through decoration-gray-300`}
                            title={`${citationLabel} — this source has been deleted`}
                          >
                            <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{citationLabel}</span>
                            <span className="shrink-0 no-underline">(deleted)</span>
                          </span>
                        );
                      }
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
                          data-board-ai-chat-citation-range={
                            item.charStart !== undefined && item.charEnd !== undefined
                              ? `${item.charStart}:${item.charEnd}`
                              : ''
                          }
                          title={
                            citationMoment === null
                              ? `Open ${citationLabel}`
                              : `Play ${citationLabel} from ${citationMoment}`
                          }
                          aria-label={
                            citationMoment === null
                              ? `Open ${citationLabel}`
                              : `Play ${citationLabel} from ${citationMoment}`
                          }
                          className={`${chipClass} border-gray-200 text-blue-700 transition hover:border-blue-200 hover:bg-blue-50`}
                          onClick={() => { void openCitation({
                            knowledgeDocumentId: citedDocumentId,
                            ...(item.pageNumber === undefined ? {} : { pageNumber: item.pageNumber }),
                            // A text citation locates itself by range instead.
                            // Both halves or neither: the request builder
                            // refuses a partial one rather than guessing.
                            ...(item.charStart !== undefined && item.charEnd !== undefined
                              ? { charStart: item.charStart, charEnd: item.charEnd }
                              : {}),
                            // BOTH OR NEITHER, again: seeking needs a moment
                            // AND a video to seek it in, and half of that pair
                            // is not a weaker request but an unanswerable one.
                            ...(item.transcriptStartMs !== undefined && item.videoIdentity !== undefined
                              ? {
                                  transcriptStartMs: item.transcriptStartMs,
                                  videoIdentity: item.videoIdentity,
                                }
                              : {}),
                          }); }}
                        >
                          {citationMoment === null ? (
                            <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                          ) : (
                            <Play className="h-3 w-3 shrink-0" aria-hidden="true" />
                          )}
                          <span className="truncate">{citationLabel}</span>
                          {citationMoment === null ? null : (
                            // shrink-0: the label gives way, the moment never does.
                            <span className="shrink-0 font-medium tabular-nums">
                              {citationMoment}
                            </span>
                          )}
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
                    onClick={() => { void saveAssistantAsNote(message); }}
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

        {/* WHY THE SEND BUTTON IS OFF. A disabled button with no explanation is
            the same silent failure in a different costume: the user would see a
            chip, a typed question, and a dead control. */}
        {blockingContext.length > 0 ? (
          <p data-board-ai-context-blocked="true" className="mb-1.5 text-[10px] text-gray-500">
            {blockingContext.some((item) => item.readiness === 'pending')
              ? 'Still reading your PDF. You can send as soon as it is ready.'
              : 'That PDF could not be read. Remove it to send your message.'}
          </p>
        ) : null}

        {/* Outside the menu so a click that closes the menu does not unmount
            the input mid-dialog. `accept` is a hint to the picker; the server
            is what actually refuses a non-PDF. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          data-board-ai-context-file-input="true"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared immediately so choosing the SAME file twice still fires a
            // change event -- otherwise a retry after a failure does nothing.
            event.target.value = '';
            if (file) void uploadPdf(file);
          }}
        />

        {/* THE DROP TARGET IS THE CONTEXT STRIP ITSELF, not a zone that appears
            during a drag. The strip is already where attachments live and where
            the count is read, so dropping onto it needs no explanation -- and a
            target that only exists mid-drag cannot be discovered by anyone who
            has not already guessed the gesture. */}
        <div
          className={`relative mb-1.5 rounded ${dropActive ? 'bg-blue-50/70 outline-dashed outline-1 outline-offset-2 outline-blue-400' : ''}`}
          ref={contextMenuAreaRef}
          data-board-ai-context-dropzone="true"
          data-board-ai-context-drop-active={dropActive ? 'true' : undefined}
          onDragOver={handleContextDragOver}
          onDragLeave={handleContextDragLeave}
          onDrop={handleContextDrop}
        >
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
              {/* UPLOAD A FILE. The one genuinely new affordance in this unit,
                  and it rides entirely on the existing knowledge endpoint --
                  same multipart field, same returned id, which is exactly what
                  `knowledge-document` already accepts.

                  It says PDF, because that is what the ingestion pipeline can
                  read. A generic "Upload a file" would promise a Word document
                  this product cannot open. */}
              <button
                type="button"
                role="menuitem"
                data-board-ai-context-upload="true"
                disabled={uploading}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => {
                  setContextNotice(null);
                  setContextMenuOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                <Upload className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  {uploading ? 'Uploading…' : 'Upload a PDF…'}
                </span>
              </button>
              {/* THE SEARCH TOGGLE. Board scope only -- a PDF conversation is
                  about that PDF, and searching the rest of the board there
                  would answer a question the user did not ask.

                  It sits in the Context menu because that is where a user
                  already goes to decide what Board AI may see, and it is
                  exactly that kind of decision. It is OFF by default and the
                  label says what it searches, in the same terms the model is
                  told: text, and only text. */}
              {!mandatoryDocumentContext ? (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={searchBoard}
                  data-board-ai-search-toggle="true"
                  className="mt-0.5 flex w-full items-center gap-1.5 border-t border-gray-100 px-2 py-1.5 text-left text-[11px] text-gray-700 hover:bg-gray-50"
                  onClick={toggleSearchBoard}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border text-[8px] ${
                      searchBoard ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'
                    }`}
                  >
                    {searchBoard ? '✓' : ''}
                  </span>
                  <span className="min-w-0 truncate">Search this board</span>
                  <span className="ml-auto shrink-0 text-gray-400">{searchBoard ? 'On' : 'Off'}</span>
                </button>
              ) : null}
              {!mandatoryDocumentContext ? (
                <p
                  data-board-ai-search-notice="true"
                  className="px-2 pb-0.5 text-[10px] text-gray-400"
                >
                  Searches Notes, text posts and PDF text. Images, links, drawings, tables and comments are not searched.
                </p>
              ) : null}
              <p className="mt-0.5 border-t border-gray-100 px-2 pb-0.5 pt-1 text-[10px] text-gray-400">
                Only attached items are shared with Board AI.
              </p>
              {/* Per-use visibility for the one attachment that sends PIXELS of a
                  private PDF rather than text the user can already see. It is
                  stated at the moment of attaching, not buried in a policy page.

                  "the AI provider" and not a model name on purpose: the model
                  that will actually run is decided server-side per request, and
                  the constant naming it lives under lib/server/ai/providers,
                  which is SERVER ONLY and must not be imported by a 'use client'
                  module. Naming a model here would mean either breaking that
                  boundary or printing a guess -- and the assistant's last
                  message reports the TEXT model, which is not the one that would
                  see this image. A vaguer true sentence beats a precise wrong
                  one. */}
              {selectedBoardItem?.detail === 'Image' ? (
                <p
                  data-board-ai-context-image-notice="true"
                  className="px-2 pb-0.5 text-[10px] text-gray-400"
                >
                  The image is sent to the AI provider.
                </p>
              ) : null}
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
