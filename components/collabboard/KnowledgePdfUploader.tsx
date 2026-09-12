"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useParams } from 'next/navigation';

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
export interface KnowledgePdfUploadResult extends KnowledgePdfPlacementSource {
  boardId: string;
  processingStatus: 'uploaded';
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

export interface KnowledgePdfUploaderProps {
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

function uploadErrorMessage(status: number) {
  if (status === 400) return 'Choose a valid PDF file.';
  if (status === 401) return 'Sign in to upload a PDF.';
  if (status === 403) return 'You do not have permission to add PDFs to this board.';
  return 'PDF upload is temporarily unavailable. Please try again.';
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
    throw new Error('PDF upload is temporarily unavailable. Please try again.');
  }

  if (!response.ok) {
    throw new Error(uploadErrorMessage(response.status));
  }

  const payload = await safeJson(response) as Partial<KnowledgePdfUploadResult> | null;
  if (
    !payload
    || typeof payload.id !== 'string'
    || typeof payload.boardId !== 'string'
    || typeof payload.originalFilename !== 'string'
    || payload.processingStatus !== 'uploaded'
  ) {
    throw new Error('PDF upload is temporarily unavailable. Please try again.');
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

const KnowledgePdfUploader = forwardRef<KnowledgePdfUploaderHandle, KnowledgePdfUploaderProps>(function KnowledgePdfUploader({ onKnowledgeChanged, onDocumentUploaded, onDocumentSettled, inputId = KNOWLEDGE_PDF_INPUT_ID }, ref) {
  const params = useParams<{ id: string }>();
  const boardId = params?.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<UploadNotice | null>(null);

  useImperativeHandle(ref, () => ({
    openPicker() {
      if (!busy) inputRef.current?.click();
    },
  }), [busy]);

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
      // The row exists server-side from here on, so any read surface should be
      // able to show it as `uploaded` before processing has finished. PDF-C1
      // places the canvas object HERE, on the same signal and for the same
      // reason -- deliberately before the wait below, never after it.
      onKnowledgeChanged?.();
      onDocumentUploaded?.(uploaded);
      setNotice({ tone: 'info', message: `Processing ${uploaded.originalFilename}…` });

      const completed = await waitForKnowledgePdf(boardId, uploaded.id, {
        signal: controller.signal,
      });

      // Asked once more between the terminal answer and its delivery: a poll
      // that returned just as this uploader was taken away must announce
      // nothing. `waitForKnowledgePdf` already throws on a cancelled request,
      // so this covers only the narrow window after it returned.
      if (controller.signal.aborted) return;
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
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Choose PDF to add"
        disabled={busy}
        onChange={(event) => {
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
