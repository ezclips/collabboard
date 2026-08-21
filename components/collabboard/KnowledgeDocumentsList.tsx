"use client";

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  listKnowledgePdfs,
  type KnowledgePdfProcessingStatus,
} from '@/components/collabboard/KnowledgePdfUploader';

const STATUS_LABELS: Record<KnowledgePdfProcessingStatus, string> = {
  uploaded: 'Uploaded',
  processing: 'Processing…',
  ready: 'Ready',
  failed: 'Failed',
};

export interface KnowledgeDocumentsListProps {
  /**
   * Bumped by the parent when an upload has changed server state. This surface
   * deliberately has no polling loop of its own: KnowledgePdfUploader already
   * owns one, and a second timer over the same endpoint would double the load
   * for no extra information.
   */
  refreshToken?: number;
  isOpen?: boolean;
  onClose?: () => void;
}

interface KnowledgeListEntry {
  id: string;
  originalFilename: string;
  pageCount: number | null;
  processingStatus: KnowledgePdfProcessingStatus | null;
  statusLabel: string | null;
}

type ListPhase = 'loading' | 'loaded' | 'error';

function isProcessingStatus(value: unknown): value is KnowledgePdfProcessingStatus {
  return value === 'uploaded' || value === 'processing' || value === 'ready' || value === 'failed';
}

/**
 * The response is treated as untrusted input. A row is rendered only when it
 * carries the two fields this surface actually needs; every other field
 * degrades to "omitted" instead of throwing. A malformed row therefore costs
 * that row, never the board.
 */
function toEntry(value: unknown): KnowledgeListEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0) return null;
  if (typeof record.originalFilename !== 'string' || record.originalFilename.length === 0) return null;

  const rawPageCount = record.pageCount;
  const pageCount = typeof rawPageCount === 'number'
    && Number.isInteger(rawPageCount)
    && rawPageCount > 0
    ? rawPageCount
    : null;

  return {
    id: record.id,
    originalFilename: record.originalFilename,
    pageCount,
    processingStatus: isProcessingStatus(record.processingStatus) ? record.processingStatus : null,
    statusLabel: isProcessingStatus(record.processingStatus)
      ? STATUS_LABELS[record.processingStatus]
      : null,
  };
}

function metadataLine(entry: KnowledgeListEntry): string | null {
  const parts: string[] = [];
  if (entry.pageCount !== null) {
    parts.push(entry.pageCount === 1 ? '1 page' : `${entry.pageCount} pages`);
  }
  if (entry.statusLabel !== null) parts.push(entry.statusLabel);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function originalPdfPath(boardId: string, documentId: string) {
  return `/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/original`;
}

/**
 * Read-only list of the PDFs already attached to the current board.
 *
 * The data reader remains mounted with the board so its GET lifecycle stays
 * unchanged; only the presentation is gated by isOpen.
 *
 * No client-side role gating: whatever the server returns is rendered, so
 * read-only collaborators see the same list an editor does.
 */
export default function KnowledgeDocumentsList({ refreshToken = 0, isOpen = true, onClose }: KnowledgeDocumentsListProps) {
  const params = useParams<{ id: string }>();
  const boardId = params?.id;
  const [phase, setPhase] = useState<ListPhase>('loading');
  const [entries, setEntries] = useState<readonly KnowledgeListEntry[]>([]);

  useEffect(() => {
    if (!boardId) return;

    const controller = new AbortController();
    let cancelled = false;
    setPhase('loading');

    void (async () => {
      try {
        const documents = await listKnowledgePdfs(
          boardId,
          (input, init) => fetch(input, { ...init, signal: controller.signal }),
        );
        if (cancelled) return;
        setEntries(
          (documents as readonly unknown[])
            .map(toEntry)
            .filter((entry): entry is KnowledgeListEntry => entry !== null),
        );
        setPhase('loaded');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [boardId, refreshToken]);

  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!boardId || !isOpen) return null;

  return (
    <div
      data-knowledge-documents="true"
      role="dialog"
      aria-modal="true"
      aria-label="Knowledge documents"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="select-none text-[9px] font-medium uppercase leading-none tracking-wider text-gray-400">
            Knowledge
          </span>
          <button
            type="button"
            aria-label="Close Knowledge"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            onClick={() => onClose?.()}
          >
            ×
          </button>
        </div>

        {phase === 'error' ? (
        <p className="mt-2 text-[11px] text-gray-500">Knowledge documents unavailable.</p>
      ) : entries.length > 0 ? (
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {entries.map((entry) => {
            const metadata = metadataLine(entry);
            return (
              <li key={entry.id} className="min-w-0">
                  {entry.processingStatus === 'ready' ? (
                    <a
                      href={originalPdfPath(boardId, entry.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-xs text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-900"
                      title={`Open ${entry.originalFilename}`}
                    >
                      {entry.originalFilename}
                    </a>
                  ) : (
                    <p className="truncate text-xs text-gray-700" title={entry.originalFilename}>
                      {entry.originalFilename}
                    </p>
                  )}
                {metadata !== null ? (
                  <p className="text-[11px] text-gray-500">{metadata}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : phase === 'loading' ? (
        <p className="mt-2 text-[11px] text-gray-500">Loading PDFs…</p>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">No PDFs added yet.</p>
        )}
      </div>
    </div>
  );
}
