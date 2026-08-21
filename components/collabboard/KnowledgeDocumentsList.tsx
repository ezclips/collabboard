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
}

interface KnowledgeListEntry {
  id: string;
  originalFilename: string;
  pageCount: number | null;
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

/**
 * Read-only list of the PDFs already attached to the current board.
 *
 * Anchored beside the toolbar rail rather than inside it: the rail is a 56px
 * icon column, which cannot render a filename, and an in-flow child would also
 * feed the rail's height-overflow measurement and push real tools into the
 * More menu. Absolute positioning keeps that measurement arithmetic untouched.
 *
 * No client-side role gating: whatever the server returns is rendered, so
 * read-only collaborators see the same list an editor does.
 */
export default function KnowledgeDocumentsList({ refreshToken = 0 }: KnowledgeDocumentsListProps) {
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

  if (!boardId) return null;

  return (
    <div
      data-knowledge-documents="true"
      className="absolute left-full top-0 z-[100] ml-2 w-56 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left shadow-sm"
    >
      <span className="select-none text-[9px] font-medium uppercase leading-none tracking-wider text-gray-400">
        Knowledge
      </span>

      {phase === 'error' ? (
        <p className="mt-2 text-[11px] text-gray-500">Knowledge documents unavailable.</p>
      ) : entries.length > 0 ? (
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {entries.map((entry) => {
            const metadata = metadataLine(entry);
            return (
              <li key={entry.id} className="min-w-0">
                <p className="truncate text-xs text-gray-700" title={entry.originalFilename}>
                  {entry.originalFilename}
                </p>
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
  );
}
