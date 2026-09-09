"use client";

import React, { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Files, Plus, Upload, X } from 'lucide-react';
import PdfReaderDock, { type PdfReaderPanel } from '@/components/collabboard/PdfReaderDock';
import KnowledgeExistingPdfPicker from '@/components/collabboard/KnowledgeExistingPdfPicker';
import KnowledgePdfUploader, {
  KNOWLEDGE_PDF_INPUT_ID,
  type KnowledgePdfPlacementSource,
  type KnowledgePdfProcessingStatus,
  type KnowledgePdfUploadResult,
} from '@/components/collabboard/KnowledgePdfUploader';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** The dock's own vocabulary, shared with the docked side-panel reader. */
export type PdfWorkspaceRightPanel = PdfReaderPanel;

export interface PdfWorkspaceTab {
  readonly documentId: string;
  readonly originalFilename: string;
  readonly pageCount?: number | null;
}

export interface PdfWorkspaceChromeProps {
  readonly boardId: string;
  readonly tabs: readonly PdfWorkspaceTab[];
  readonly activeDocumentId: string;
  readonly rightPanel: PdfWorkspaceRightPanel;
  readonly aiAvailable?: boolean;
  /**
   * The board's OWN blocking-editor authority, forwarded unchanged.
   *
   * This host is `fixed inset-0` and opaque, so a Note opened FROM it -- via
   * Create Note, or any other editor the board raises -- would sit at the
   * shared editor tier underneath a surface covering the whole viewport: open
   * in state, invisible in fact. Yielding is the same answer the canvas
   * toolbar already gives on this flag, and it changes no z-index anywhere.
   *
   * Hidden and inert rather than closed: the workspace stays MOUNTED, so the
   * open PDF, its page, the right panel and the document-scoped Board AI
   * session are still there when the editor goes away. Nothing is restored
   * because nothing was torn down.
   */
  readonly yieldsToEditor?: boolean;
  readonly children: React.ReactNode;
  readonly rightPanelContent?: React.ReactNode;
  readonly onActivateTab: (documentId: string) => void;
  readonly onCloseTab: (documentId: string) => void;
  readonly onCloseWorkspace: () => void;
  readonly onRightPanelChange: (panel: PdfWorkspaceRightPanel) => void;
  readonly onUploadedDocument: (document: KnowledgePdfUploadResult) => void;
  readonly onOpenExistingDocument: (document: KnowledgePdfPlacementSource) => Promise<boolean> | boolean;
  readonly onDocumentSettled?: (documentId: string, status: KnowledgePdfProcessingStatus) => void;
}

export default function PdfWorkspaceChrome({
  boardId,
  tabs,
  activeDocumentId,
  rightPanel,
  aiAvailable = false,
  yieldsToEditor = false,
  children,
  rightPanelContent,
  onActivateTab,
  onCloseTab,
  onCloseWorkspace,
  onRightPanelChange,
  onUploadedDocument,
  onOpenExistingDocument,
  onDocumentSettled,
}: PdfWorkspaceChromeProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const activeTab = tabs.find((tab) => tab.documentId === activeDocumentId) ?? tabs[0];
  const activeFilename = activeTab?.originalFilename || 'Document';

  const updateScrollState = () => {
    const el = stripRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useLayoutEffect(() => {
    activeTabRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    updateScrollState();
  }, [activeDocumentId, tabs.length]);

  const reveal = (direction: -1 | 1) => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.65), behavior: 'smooth' });
    window.setTimeout(updateScrollState, 180);
  };

  return (
    <aside
      data-pdf-workspace="true"
      data-pdf-workspace-right-panel={rightPanel}
      data-pdf-workspace-yielded={yieldsToEditor ? 'true' : 'false'}
      // The same band, and the same transition, as before: stepping aside is
      // not a restacking, and invisible alone is not enough -- an opaque
      // full-viewport host that stayed clickable would still swallow every
      // click meant for the editor.
      className={`fixed inset-0 z-[3100] flex flex-col bg-white transition-opacity duration-150${
        yieldsToEditor ? ' pointer-events-none opacity-0' : ''}`}
      role="complementary"
      aria-label="PDF workspace"
    >
      <KnowledgePdfUploader
        onDocumentUploaded={onUploadedDocument}
        onDocumentSettled={onDocumentSettled}
      />

      <header
        data-pdf-workspace-tabs="true"
        className="flex h-11 flex-none items-center gap-1 border-b border-gray-200 bg-slate-50 px-2"
      >
        <button
          type="button"
          data-pdf-workspace-scroll="left"
          aria-label="Reveal previous PDF tabs"
          title="Previous tabs"
          disabled={!canScrollLeft}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition hover:bg-white hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-30"
          onClick={() => reveal(-1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div
          ref={stripRef}
          data-pdf-workspace-tab-row="true"
          role="tablist"
          aria-label="Open PDFs"
          className="flex min-w-0 flex-1 flex-nowrap items-end gap-1 overflow-x-auto whitespace-nowrap scroll-smooth pb-px [scrollbar-width:none]"
          onScroll={updateScrollState}
        >
          {tabs.map((tab) => {
            const active = tab.documentId === activeDocumentId;
            return (
              <div
                key={tab.documentId}
                ref={active ? activeTabRef : undefined}
                role="presentation"
                data-pdf-workspace-tab={tab.documentId}
                data-pdf-workspace-tab-active={active ? 'true' : 'false'}
                className={`group flex max-w-[220px] shrink-0 items-center gap-1 rounded-t-lg border px-2 py-1.5 text-xs transition-colors ${
                  active
                    ? 'border-gray-200 border-b-white bg-white text-gray-950 shadow-sm'
                    : 'border-transparent text-gray-500 hover:border-gray-200 hover:bg-white hover:text-gray-800'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="min-w-0 flex-1 truncate rounded-sm text-left font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                  title={tab.originalFilename || 'Document'}
                  onClick={() => onActivateTab(tab.documentId)}
                >
                  {tab.originalFilename || 'Document'}
                </button>
                <button
                  type="button"
                  data-pdf-workspace-tab-close={tab.documentId}
                  aria-label={`Close ${tab.originalFilename || 'PDF tab'}`}
                  title="Close tab"
                  className="shrink-0 rounded p-0.5 text-gray-400 opacity-70 transition hover:bg-gray-100 hover:text-gray-700 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.documentId);
                  }}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          data-pdf-workspace-scroll="right"
          aria-label="Reveal next PDF tabs"
          title="Next tabs"
          disabled={!canScrollRight}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition hover:bg-white hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-30"
          onClick={() => reveal(1)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <div data-pdf-workspace-fixed-tab-controls="true" className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-pdf-workspace-all-menu="true"
                aria-label="All open PDFs"
                title="All open PDFs"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-600 transition hover:bg-white hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                <Files className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[3200] max-h-72 w-72 overflow-y-auto">
              {tabs.map((tab) => (
                <DropdownMenuItem key={tab.documentId} onSelect={() => onActivateTab(tab.documentId)}>
                  <span className="min-w-0 truncate">{tab.originalFilename || 'Document'}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-pdf-workspace-add="true"
                  aria-label="Add PDF"
                  title="Add PDF"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-700 transition hover:bg-white hover:text-gray-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[3200] w-48">
                <DropdownMenuItem asChild>
                  <label htmlFor={KNOWLEDGE_PDF_INPUT_ID} className="flex cursor-pointer items-center">
                    <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                    Upload PDF
                  </label>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
                  <Files className="mr-2 h-4 w-4" aria-hidden="true" />
                  Open existing PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="absolute right-0 top-10">
              <KnowledgeExistingPdfPicker
                isOpen={pickerOpen}
                boardId={boardId}
                placedDocumentIds={[]}
                onClose={() => setPickerOpen(false)}
                onPlace={onOpenExistingDocument}
              />
            </div>
          </div>

          {/* The reader's two panels, in the header row they belong to and
              immediately before the control that closes the whole thing. */}
          <PdfReaderDock
            panel={rightPanel}
            aiAvailable={aiAvailable}
            onPanelChange={onRightPanelChange}
          />

          <button
            type="button"
            data-pdf-workspace-close="true"
            aria-label="Close PDF workspace"
            title="Close workspace"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition hover:bg-white hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            onClick={onCloseWorkspace}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 bg-slate-100">
        <main data-pdf-workspace-main="true" className="min-w-0 flex-1 overflow-hidden bg-white transition-all duration-150">
          {children}
        </main>
        {rightPanel !== 'closed' ? (
          <aside
            data-pdf-workspace-right-panel-content="true"
            className="flex min-h-0 w-[clamp(360px,28vw,400px)] shrink-0 flex-col border-l border-gray-200 bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.06)]"
            aria-label={`${rightPanel === 'library' ? 'Library' : 'AI'} for ${activeFilename}`}
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div data-pdf-workspace-panel-title="true" className="text-xs font-semibold text-gray-800">{rightPanel === 'library' ? 'Library' : 'AI'}</div>
                <div data-pdf-workspace-panel-document="true" className="truncate text-[11px] text-gray-500" title={activeFilename}>
                  {activeFilename}
                </div>
              </div>
              <button
                type="button"
                data-pdf-workspace-panel-close="true"
                aria-label="Close right panel"
                title="Close"
                className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                onClick={() => onRightPanelChange('closed')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              {rightPanelContent}
            </div>
          </aside>
        ) : null}
      </div>
    </aside>
  );
}
