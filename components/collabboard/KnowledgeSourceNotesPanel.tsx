"use client";

import React from 'react';
import { useKnowledgeSourceNoteSummariesForDocument } from './KnowledgeSourceReferenceContext';
import type {
  KnowledgeSourceNoteReferenceDetail,
  KnowledgeSourceNoteSummary,
} from '@/lib/domain/knowledge/knowledgeSourceNoteSummary';

/**
 * PDF Source Notes Panel -- Phase 1. Lists the board Notes citing the
 * document currently open in the Knowledge reader.
 *
 * READ ONLY: the one action is opening an existing Note through the EXISTING
 * backlink-target authority, forwarded verbatim as `onOpenNote`. No editing,
 * no creation, no AI, and no dependency on a PDF page raster -- every field
 * rendered here comes from `useKnowledgeSourceNoteSummariesForDocument`,
 * itself derived from data the board already holds in memory.
 */
export interface KnowledgeSourceNotesPanelProps {
  readonly documentId: string;
  readonly onOpenNote: (targetPadletId: string) => void;
}

/** `Area · p. 3`, `p. 2 · "a quote"`, or a bare page hint for a page-only citation. */
function referenceDetailText(detail: KnowledgeSourceNoteReferenceDetail): string {
  const pageLabel = detail.pageStart === detail.pageEnd
    ? `p. ${detail.pageStart}`
    : `pp. ${detail.pageStart}–${detail.pageEnd}`;
  if (detail.kind === 'area') return `Area · ${pageLabel}`;
  if (detail.kind === 'exact-text' && detail.quoteExcerpt) return `${pageLabel} · "${detail.quoteExcerpt}"`;
  return pageLabel;
}

function SourceNoteItem({
  summary,
  onOpenNote,
}: {
  summary: KnowledgeSourceNoteSummary;
  onOpenNote: (targetPadletId: string) => void;
}) {
  // Presentation-only: a Note with no real title falls back to the same
  // content-derived label the excerpt would repeat verbatim, so the excerpt
  // line is skipped rather than showing the same text twice.
  const showBodyExcerpt = summary.bodyExcerpt.length > 0 && summary.bodyExcerpt !== summary.title;
  return (
    <li data-knowledge-source-note-item={summary.targetPadletId} className="min-w-0">
      <button
        type="button"
        onClick={() => onOpenNote(summary.targetPadletId)}
        className="block w-full rounded border border-gray-100 p-2 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-300"
        style={summary.accentColor ? { borderLeftColor: summary.accentColor, borderLeftWidth: 3 } : undefined}
      >
        <p className="truncate text-xs font-medium text-gray-800">{summary.title}</p>
        {showBodyExcerpt ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{summary.bodyExcerpt}</p>
        ) : null}
        {summary.pageHint ? (
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">{summary.pageHint}</p>
        ) : null}
        <ul className="mt-1 space-y-0.5">
          {summary.references.map((detail) => (
            <li key={detail.id} className="truncate text-[11px] text-gray-500">
              {referenceDetailText(detail)}
            </li>
          ))}
        </ul>
      </button>
    </li>
  );
}

export default function KnowledgeSourceNotesPanel({ documentId, onOpenNote }: KnowledgeSourceNotesPanelProps) {
  const summaries = useKnowledgeSourceNoteSummariesForDocument(documentId);

  return (
    <div data-knowledge-source-notes-panel="true">
      <p className="mb-2 select-none text-[9px] font-medium uppercase leading-none tracking-wider text-gray-400">
        Source Notes
      </p>
      {summaries.length === 0 ? (
        <p className="text-[11px] text-gray-500">No notes linked to this source yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {summaries.map((summary) => (
            <SourceNoteItem key={summary.targetPadletId} summary={summary} onOpenNote={onOpenNote} />
          ))}
        </ul>
      )}
    </div>
  );
}
