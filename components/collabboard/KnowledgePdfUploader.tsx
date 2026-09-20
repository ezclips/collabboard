"use client";

import React, {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useParams } from 'next/navigation';

import { KNOWLEDGE_TEXT_ACCEPT } from '@/lib/domain/knowledge/knowledgeTextIngestion';
import { KNOWLEDGE_DOCX_ACCEPT } from '@/lib/domain/knowledge/knowledgeDocxSource';

export type KnowledgePdfProcessingStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface KnowledgePdfSummary {
  id: string;
  boardId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  pageCount: number | null;
  processingStatus: KnowledgePdfProcessingStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * The identity a canvas placement actually consumes -- nothing more. Both ways
 * of reaching a Knowledge document produce one of these: uploading a new PDF,
 * and re-placing one the board already has. The placement authority therefore
 * takes a single input type and never learns which entry point called it.
 *
 * Upload-only fields stay off it deliberately. `boardId` is upload bookkeeping;
 * placement already knows its own board, so admitting the field here would
 * invite a second, disagreeing source of truth.
 */
export interface KnowledgePdfPlacementSource {
  id: string;
  originalFilename: string;
  processingStatus: KnowledgePdfProcessingStatus;
}

/** A fresh upload: the same placement identity, plus what only upload knows. */
/**
 * What the file chooser offers.
 *
 * Built from the domain's own list rather than restated here, so the picker and
 * the server's validator cannot drift: an extension offered but refused, or
 * accepted but never offered, is a defect a literal string would hide. `accept`
 * is a convenience, never a control -- the route validates every upload
 * regardless of what the dialog filtered.
 */
export const KNOWLEDGE_UPLOAD_ACCEPT =
  `application/pdf,.pdf,${KNOWLEDGE_TEXT_ACCEPT},${KNOWLEDGE_DOCX_ACCEPT}`;

export interface KnowledgePdfUploadResult extends KnowledgePdfPlacementSource {
  boardId: string;
  /**
   * 'uploaded' means a worker still has to make this searchable; 'ready' means
   * the server already did, which is every text source. Both are legitimate
   * answers to an upload now -- treating 'ready' as malformed would fail an
   * upload that had entirely succeeded.
   */
  processingStatus: 'uploaded' | 'ready';
  /** What the server stored it as. Absent on responses from older builds. */
  kind?: string;
  /**
   * What the extraction dropped or decided -- unread images, accepted tracked
   * changes. Absent when it kept everything it saw.
   *
   * Shown at the upload because that is the only moment the person is still
   * looking at the document. Afterwards the source is just one more thing the
   * search returns, and nothing says the pictures were never read.
   */
  notices?: readonly string[];
}

/**
 * The one hidden PDF input's DOM id, so a toolbar control can be a real
 * `<label htmlFor>` and let the BROWSER open the file dialog. That path needs
 * no ref, no imperative call and no user-activation bookkeeping, which is the
 * whole point: a programmatic `input.click()` is silently ignored whenever the
 * browser no longer considers the click a user gesture, and it fails with no
 * error to observe.
 */
export const KNOWLEDGE_PDF_INPUT_ID = 'knowledge-pdf-file-input';

/**
 * The MAIN TOOLBAR's own input id, deliberately different from the one above.
 *
 * Two uploaders can be mounted at once -- the board toolbar's and the focused
 * PDF workspace's, which covers the board rather than unmounting it. A shared
 * DOM id would make both label controls resolve to whichever input happens to
 * come first in the document, so the workspace's Upload PDF would silently run
 * the board's canvas-placement handler instead of its own.
 */
export const KNOWLEDGE_PDF_TOOLBAR_INPUT_ID = 'knowledge-pdf-toolbar-file-input';

export interface KnowledgePdfUploaderHandle {
  openPicker(): void;
}

/**
 * Who decides whether an upload may START here.
 *
 * `board-content` is the Canvas toolbar route: ingestion writes a Knowledge
 * document for a board, so it answers to that board's edit authority and the
 * probe is REQUIRED -- omitting it is a type error, never an allow-by-default.
 *
 * `host-managed` is the pre-existing PDF workspace route, which owns its own
 * policy. It does not acquire the board rule, and its behaviour is unchanged.
 */
export type KnowledgePdfUploaderInitiation =
  | { initiationPolicy: 'board-content'; canInitiateUploadNow: () => boolean }
  | { initiationPolicy?: 'host-managed'; canInitiateUploadNow?: never };

export interface KnowledgePdfUploaderBaseProps {
  /** Fired whenever this uploader has learned that server state changed. */
  onKnowledgeChanged?: () => void;
  /**
   * PDF-C1. Fired once the document row exists server-side and BEFORE polling
   * waits for processing, so the canvas can place the object immediately
   * rather than making the user wait on PDF parsing. Carries the server's own
   * document id -- identity is never the filename, which is not unique.
   */
  onDocumentUploaded?: (document: KnowledgePdfUploadResult) => void;
  /**
   * Terminal processing state for a document already placed on the canvas, so
   * the placement's stored status can converge without a second poll loop.
   */
  onDocumentSettled?: (documentId: string, status: KnowledgePdfProcessingStatus) => void;
  /**
   * Which DOM id this uploader's hidden input takes. Defaults to the single
   * shared id; a host that can be on screen beside another uploader passes its
   * own, so each label reaches the input that belongs to it.
   */
  inputId?: string;
}

export type KnowledgePdfUploaderProps =
  KnowledgePdfUploaderBaseProps & KnowledgePdfUploaderInitiation;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type UploadNotice = {
  tone: 'info' | 'success' | 'error';
  message: string;
};

const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 60;
const SUCCESS_NOTICE_MS = 5_000;

function apiPath(boardId: string) {
  return `/api/boards/${encodeURIComponent(boardId)}/knowledge`;
}

function uploadErrorMessage(status: number, serverMessage?: string) {
  // A 400 now carries the server's own reason -- "The selected file is empty",
  // "This file is not valid UTF-8 text" -- and those say what to do about it in
  // a way "Choose a valid file" cannot. Only a 400 is trusted this way: the
  // other statuses are generic by design and must not become a channel for
  // whatever an intermediary put in an error body.
  if (status === 400) {
    const trimmed = (serverMessage ?? '').trim().slice(0, 200);
    return trimmed.length > 0 ? trimmed : 'Choose a valid file.';
  }
  if (status === 401) return 'Sign in to upload a file.';
  if (status === 403) return 'You do not have permission to add files to this board.';
  return 'Upload is temporarily unavailable. Please try again.';
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function uploadKnowledgePdf(
  boardId: string,
  file: File,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<KnowledgePdfUploadResult> {
  const body = new FormData();
  body.set('file', file);

  let response: Response;
  try {
    response = await fetchImpl(apiPath(boardId), { method: 'POST', body, signal });
  } catch (error) {
    // An abort is not a failure to report: it is this caller being told to
    // stop, and it must reach the caller AS an abort so nothing downstream
    // treats it as an upload that merely went wrong.
    if (isAbortError(error)) throw error;
    throw new Error('Upload is temporarily unavailable. Please try again.');
  }

  if (!response.ok) {
    const body = await safeJson(response) as { error?: unknown } | null;
    const reason = typeof body?.error === 'string' ? body.error : undefined;
    throw new Error(uploadErrorMessage(response.status, reason));
  }

  const payload = await safeJson(response) as Partial<KnowledgePdfUploadResult> | null;
  if (
    !payload
    || typeof payload.id !== 'string'
    || typeof payload.boardId !== 'string'
    || typeof payload.originalFilename !== 'string'
    || (payload.processingStatus !== 'uploaded' && payload.processingStatus !== 'ready')
  ) {
    throw new Error('Upload is temporarily unavailable. Please try again.');
  }

  return payload as KnowledgePdfUploadResult;
}

export async function listKnowledgePdfs(
  boardId: string,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<readonly KnowledgePdfSummary[]> {
  let response: Response;
  try {
    response = await fetchImpl(apiPath(boardId), { method: 'GET', signal });
  } catch (error) {
    // A cancelled poll is not a status outage. It must reach the caller AS an
    // abort so nothing downstream reports a failure to a user who simply lost
    // the surface. `signal` is optional, so callers without a lifecycle are
    // unchanged.
    if (isAbortError(error)) throw error;
    throw new Error('PDF status is temporarily unavailable.');
  }

  if (!response.ok) {
    throw new Error('PDF status is temporarily unavailable.');
  }

  const payload = await safeJson(response) as { documents?: unknown } | null;
  if (!payload || !Array.isArray(payload.documents)) {
    throw new Error('PDF status is temporarily unavailable.');
  }

  return payload.documents as KnowledgePdfSummary[];
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function waitForKnowledgePdf(
  boardId: string,
  documentId: string,
  options: {
    fetchImpl?: FetchLike;
    signal: AbortSignal;
    intervalMs?: number;
    maxAttempts?: number;
  },
): Promise<KnowledgePdfSummary | null> {
  const {
    fetchImpl = fetch,
    signal,
    intervalMs = POLL_INTERVAL_MS,
    maxAttempts = POLL_ATTEMPTS,
  } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const documents = await listKnowledgePdfs(boardId, fetchImpl, signal);
    // Checked AFTER the await: the answer arrives later than the request, and a
    // poll that was cancelled while in flight must not report terminal state.
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const document = documents.find((item) => item.id === documentId);
    if (document?.processingStatus === 'ready' || document?.processingStatus === 'failed') {
      return document;
    }

    if (attempt + 1 < maxAttempts) {
      await wait(intervalMs, signal);
    }
  }

  return null;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

const KnowledgePdfUploader = forwardRef<KnowledgePdfUploaderHandle, KnowledgePdfUploaderProps>(function KnowledgePdfUploader({
  onKnowledgeChanged, onDocumentUploaded, onDocumentSettled,
  inputId = KNOWLEDGE_PDF_INPUT_ID, initiationPolicy, canInitiateUploadNow,
}, ref) {
  /**
   * May an upload START, or a result be delivered, RIGHT NOW?
   *
   * One derivation, read at every boundary rather than captured once: the
   * picker, the input's own click and change, the file handler and each
   * awaited step all ask it again. A host-managed uploader keeps its own
   * policy and always answers true here.
   */
  const mayInitiateNow = useCallback(
    () => (initiationPolicy === 'board-content' ? canInitiateUploadNow() : true),
    [initiationPolicy, canInitiateUploadNow],
  );
  const params = useParams<{ id: string }>();
  const boardId = params?.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<UploadNotice | null>(null);

  useImperativeHandle(ref, () => ({
    openPicker() {
      // No DOM click and no state change for a host that may not ingest.
      if (!mayInitiateNow()) return;
      if (!busy) inputRef.current?.click();
    },
  }), [busy, mayInitiateNow]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Only terminal success self-dismisses; info still means work in flight and
   * error is the one thing worth leaving on screen. Keying on the notice object
   * makes staleness structurally impossible: replacing a notice runs this
   * cleanup first, so a superseded timer is cleared before it can fire.
   */
  useEffect(() => {
    if (notice?.tone !== 'success') return;
    const timeout = window.setTimeout(() => setNotice(null), SUCCESS_NOTICE_MS);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const handleFile = async (file: File) => {
    // Before busy/notice state, before the AbortController, before any
    // FormData or request. Silent: a refusal is not an error to report.
    if (!mayInitiateNow()) return;
    if (!boardId || busy) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setNotice({ tone: 'info', message: `Uploading ${file.name}…` });

    try {
      const uploaded = await uploadKnowledgePdf(boardId, file, fetch, controller.signal);
      // Unmounted mid-upload -- because the board authority went away, say --
      // means no document may be announced and no placement attempted.
      if (controller.signal.aborted) return;
      // Independent of the abort: if the authority went away while the
      // upload was in flight, the completed document is discarded rather
      // than delivered. The server row is not ours to reverse.
      if (!mayInitiateNow()) return;
      // The row exists server-side from here on, so any read surface should be
      // able to show it as `uploaded` before processing has finished. PDF-C1
      // places the canvas object HERE, on the same signal and for the same
      // reason -- deliberately before the wait below, never after it.
      onKnowledgeChanged?.();
      onDocumentUploaded?.(uploaded);

      // ALREADY DONE. A text source is indexed by the request that uploaded it,
      // so there is no worker to wait for: polling would ask sixty times about
      // a status that cannot change, and "Processing…" would be false the
      // moment it was shown.
      if (uploaded.processingStatus === 'ready') {
        onDocumentSettled?.(uploaded.id, 'ready');
        setNotice({
          tone: 'success',
          message: knowledgeUploadReadyMessage(uploaded),
        });
        return;
      }

      setNotice({ tone: 'info', message: `Processing ${uploaded.originalFilename}…` });

      const completed = await waitForKnowledgePdf(boardId, uploaded.id, {
        signal: controller.signal,
      });

      // Asked once more between the terminal answer and its delivery: a poll
      // that returned just as this uploader was taken away must announce
      // nothing. `waitForKnowledgePdf` already throws on a cancelled request,
      // so this covers only the narrow window after it returned.
      if (controller.signal.aborted) return;
      if (!mayInitiateNow()) return;
      // Terminal status, or polling gave up while the worker continues: either
      // way the last known server state is newer than what was fetched above.
      onKnowledgeChanged?.();
      // Only a real terminal answer updates a placement. Giving up polling is
      // not a status, so the surface keeps converging on its own.
      if (completed) onDocumentSettled?.(uploaded.id, completed.processingStatus);

      if (!completed) {
        setNotice({
          tone: 'success',
          message: `${uploaded.originalFilename} uploaded. Processing is continuing in the background.`,
        });
      } else if (completed.processingStatus === 'ready') {
        setNotice({ tone: 'success', message: `${uploaded.originalFilename} is ready.` });
      } else {
        setNotice({
          tone: 'error',
          message: `Processing ${uploaded.originalFilename} failed. You can try uploading it again.`,
        });
      }
    } catch (error) {
      if (!isAbortError(error)) {
        // Every upload and poll failure converges here -- a rejected or
        // non-2xx request, a parse failure, a terminal processing error.
        // Asked live, because the failure can arrive after the board
        // authority did: publish no notice, invoke nothing, and do not
        // turn a suppressed error into an outage message.
        if (!mayInitiateNow()) return;
        setNotice({
          tone: 'error',
          message: error instanceof Error
            ? error.message
            : 'PDF upload is temporarily unavailable. Please try again.',
        });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      // A cancelled run owns no state any more: this component may already be
      // unmounted, and a later run has its own controller.
      if (!controller.signal.aborted) {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={KNOWLEDGE_UPLOAD_ACCEPT}
        className="sr-only"
        aria-label="Choose a file to add"
        disabled={busy}
        onClick={(event) => {
          // Stops the chooser opening at all -- the label guard above is not
          // the only route to this element.
          if (!mayInitiateNow()) event.preventDefault();
        }}
        onChange={(event) => {
          // Asked BEFORE the FileList is read, so a dispatched change event
          // starts no upload and leaves no busy/notice state behind.
          if (!mayInitiateNow()) {
            event.currentTarget.value = '';
            return;
          }
          const file = event.currentTarget.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {notice ? (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          data-knowledge-pdf-status={notice.tone}
          className={`fixed bottom-4 left-16 z-[3002] max-w-sm rounded-lg border bg-white px-3 py-2 text-xs shadow-lg ${
            notice.tone === 'error'
              ? 'border-red-200 text-red-700'
              : notice.tone === 'success'
                ? 'border-emerald-200 text-emerald-700'
                : 'border-slate-200 text-slate-700'
          }`}
        >
          {notice.message}
        </div>
      ) : null}
    </>
  );
});

export default KnowledgePdfUploader;

/**
 * "Ready", plus anything the extraction did not keep.
 *
 * The notices ride on the SAME message rather than a second one that could be
 * missed or dismissed separately: a person who reads "is ready" and looks away
 * has been told the document is indexed, and that is exactly the belief the
 * notice exists to qualify.
 *
 * The server authors the sentences. This adds none of its own and shows only
 * strings, so a malformed payload can make the message longer and cannot make
 * it into anything else.
 */
export function knowledgeUploadReadyMessage(uploaded: {
  readonly originalFilename: string;
  readonly notices?: readonly string[];
}): string {
  const notices = Array.isArray(uploaded.notices)
    ? uploaded.notices.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    : [];
  const ready = `${uploaded.originalFilename} is ready.`;
  return notices.length > 0 ? `${ready} ${notices.join(' ')}` : ready;
}
