'use client';

/**
 * PATCH-346. The modern header for the PDF reader's right panel (Library / AI).
 *
 * Extracted from `KnowledgeSourceReaderDrawer.tsx` so that 1,300-line file
 * shrinks, and so the two hosts share ONE header. It replaces three stacked
 * layers of chrome with a file card and a segmented switch; the "Used in Notes"
 * list is gone (the Library tab's own Notes section already lists them), and
 * the count stays in the meta line.
 */
import React from 'react';
import { FileText, Library, Sparkles } from 'lucide-react';

export type KnowledgeReaderPanel = 'library' | 'ai';
export type KnowledgeReaderDocumentKind = 'pdf' | 'transcript' | 'text';

interface KnowledgeReaderPanelHeaderProps {
  filename: string;
  /** Drives the file-card badge (PDF vs text). */
  kind: KnowledgeReaderDocumentKind;
  /** e.g. "1 page"; null when unknown. */
  pageSummary: string | null;
  noteCount: number;
  panel: KnowledgeReaderPanel;
  aiAvailable: boolean;
  /**
   * PATCH-346 Addendum 1. False hides the Library | AI switch: a host with no
   * panel open (the reading pane when the side panel is closed) shows only the
   * file card.
   */
  showPanelSwitch?: boolean;
  /**
   * Absent when the note count has nowhere to go: the "used in N notes" meta
   * then reads as plain text rather than a dead button.
   */
  onSelectPanel?: (panel: KnowledgeReaderPanel) => void;
}

const TAB_ACTIVE = 'bg-white shadow-sm text-gray-900 font-medium';
const TAB_IDLE = 'text-gray-500 hover:text-gray-800';

export interface KnowledgeReaderPanelSwitchProps {
  panel: KnowledgeReaderPanel;
  aiAvailable: boolean;
  onSelectPanel?: (panel: KnowledgeReaderPanel) => void;
}

/**
 * PATCH-346 Addendum 3. The segmented Library | AI switch on its own, so BOTH
 * panel headers use it: the reader's side panel and the full-screen workspace's
 * panel. Extracted rather than copied -- two switches that drift apart is the
 * same defect the single dock toggle ended.
 */
export function KnowledgeReaderPanelSwitch({ panel, aiAvailable, onSelectPanel }: KnowledgeReaderPanelSwitchProps) {
  return (
    <div
      role="tablist"
      data-knowledge-reader-panel-title={panel === 'library' ? 'Library' : 'AI'}
      className="flex w-full rounded-lg bg-gray-100 p-0.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={panel === 'library'}
        onClick={() => onSelectPanel?.('library')}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
          panel === 'library' ? TAB_ACTIVE : TAB_IDLE
        }`}
      >
        <Library size={14} aria-hidden="true" />
        Library
      </button>
      {aiAvailable ? (
        <button
          type="button"
          role="tab"
          aria-selected={panel === 'ai'}
          onClick={() => onSelectPanel?.('ai')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
            panel === 'ai' ? TAB_ACTIVE : TAB_IDLE
          }`}
        >
          <Sparkles size={14} aria-hidden="true" />
          AI
        </button>
      ) : null}
    </div>
  );
}

export function KnowledgeReaderPanelHeader({
  filename,
  kind,
  pageSummary,
  noteCount,
  panel,
  aiAvailable,
  showPanelSwitch = true,
  onSelectPanel,
}: KnowledgeReaderPanelHeaderProps) {
  const isPdf = kind === 'pdf';

  return (
    <header className="shrink-0 space-y-3 border-b border-gray-100 px-4 pb-3 pt-3">
      <div className="flex items-center gap-3">
        <span
          data-knowledge-reader-kind={kind}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
            isPdf ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
          }`}
        >
          {isPdf ? 'PDF' : <FileText size={16} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            data-knowledge-library-filename="true"
            className="truncate text-sm font-semibold text-gray-900"
            title={filename}
          >
            {filename}
          </h2>
          <p className="text-xs text-gray-500">
            {pageSummary !== null ? (
              <span data-knowledge-library-pagecount="true">{pageSummary}</span>
            ) : null}
            {noteCount > 0 ? (
              <>
                {pageSummary !== null ? ' · ' : ''}
                {onSelectPanel ? (
                  <button
                    type="button"
                    data-knowledge-library-note-count="true"
                    onClick={() => onSelectPanel('library')}
                    className="hover:text-gray-800 hover:underline"
                  >
                    used in {noteCount} {noteCount === 1 ? 'note' : 'notes'}
                  </button>
                ) : (
                  <span data-knowledge-library-note-count="true">
                    used in {noteCount} {noteCount === 1 ? 'note' : 'notes'}
                  </span>
                )}
              </>
            ) : null}
          </p>
        </div>
      </div>

      {showPanelSwitch ? (
        <KnowledgeReaderPanelSwitch panel={panel} aiAvailable={aiAvailable} onSelectPanel={onSelectPanel} />
      ) : null}
    </header>
  );
}

export default KnowledgeReaderPanelHeader;
