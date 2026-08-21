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

export interface KnowledgePdfUploadResult {
  id: string;
  boardId: string;
  originalFilename: string;
  processingStatus: 'uploaded';
}

export interface KnowledgePdfUploaderHandle {
  openPicker(): void;
}

export interface KnowledgePdfUploaderProps {
  /** Fired whenever this uploader has learned that server state changed. */
  onKnowledgeChanged?: () => void;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type UploadNotice = {
  tone: 'info' | 'success' | 'error';
  message: string;
};

const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 60;

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
): Promise<KnowledgePdfUploadResult> {
  const body = new FormData();
  body.set('file', file);

  let response: Response;
  try {
    response = await fetchImpl(apiPath(boardId), { method: 'POST', body });
  } catch {
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
): Promise<readonly KnowledgePdfSummary[]> {
  let response: Response;
  try {
    response = await fetchImpl(apiPath(boardId), { method: 'GET' });
  } catch {
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

    const documents = await listKnowledgePdfs(boardId, fetchImpl);
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

const KnowledgePdfUploader = forwardRef<KnowledgePdfUploaderHandle, KnowledgePdfUploaderProps>(function KnowledgePdfUploader({ onKnowledgeChanged }, ref) {
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

  const handleFile = async (file: File) => {
    if (!boardId || busy) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setNotice({ tone: 'info', message: `Uploading ${file.name}…` });

    try {
      const uploaded = await uploadKnowledgePdf(boardId, file);
      // The row exists server-side from here on, so any read surface should be
      // able to show it as `uploaded` before processing has finished.
      onKnowledgeChanged?.();
      setNotice({ tone: 'info', message: `Processing ${uploaded.originalFilename}…` });

      const completed = await waitForKnowledgePdf(boardId, uploaded.id, {
        signal: controller.signal,
      });

      // Terminal status, or polling gave up while the worker continues: either
      // way the last known server state is newer than what was fetched above.
      onKnowledgeChanged?.();

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
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
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
