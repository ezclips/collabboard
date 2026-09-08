"use client";

import React, { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Files, Library, Plus, Sparkles, Upload, X } from 'lucide-react';
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

export type PdfWorkspaceRightPanel = 'closed' | 'library' | 'ai';

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

  const togglePanel = (panel: Exclude<PdfWorkspaceRightPanel, 'closed'>) => {
    onRightPanelChange(rightPanel === panel ? 'closed' : panel);
  };

  return (
    <aside
      data-pdf-workspace="true"
      data-pdf-workspace-right-panel={rightPanel}
      className="fixed inset-0 z-[3100] flex flex-col bg-white"
      role="complementary"
      aria-label="PDF workspace"
    >
      <KnowledgePdfUploader
        onDocumentUploaded={onUploadedDocument}
        onDocumentSettled={onDocumentSettled}
      />

      <header
        data-pdf-workspace-tabs="true"
        className="flex h-11 flex-none items-center gap-1 border-b border-gray-200 bg-gray-50 px-2"
      >
        <div
          ref={stripRef}
          data-pdf-workspace-tab-row="true"
          className="flex min-w-0 flex-1 flex-nowrap items-end gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none]"
          onScroll={updateScrollState}
        >
          {tabs.map((tab) => {
            const active = tab.documentId === activeDocumentId;
            return (
              <div
                key={tab.documentId}
                ref={active ? activeTabRef : undefined}
                data-pdf-workspace-tab={tab.documentId}
                data-pdf-workspace-tab-active={active ? 'true' : 'false'}
                className={`group flex max-w-[220px] shrink-0 items-center gap-1 rounded-t-md border px-2 py-1.5 text-xs ${
                  active
                    ? 'border-gray-200 border-b-white bg-white text-gray-900'
                    : 'border-transparent text-gray-500 hover:bg-white hover:text-gray-800'
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
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
                  className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
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
          data-pdf-workspace-scroll="left"
          aria-label="Reveal previous PDF tabs"
          title="Previous tabs"
          disabled={!canScrollLeft}
          className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
          onClick={() => reveal(-1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-pdf-workspace-scroll="right"
          aria-label="Reveal next PDF tabs"
          title="Next tabs"
          disabled={!canScrollRight}
          className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
          onClick={() => reveal(1)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-pdf-workspace-all-menu="true"
              aria-label="All open PDFs"
              title="All open PDFs"
              className="shrink-0 rounded p-1 text-gray-600 hover:bg-gray-100"
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
                className="rounded p-1 text-gray-700 hover:bg-gray-100"
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

        <button
          type="button"
          data-pdf-workspace-close="true"
          aria-label="Close PDF workspace"
          title="Close workspace"
          className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          onClick={onCloseWorkspace}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main data-pdf-workspace-main="true" className="min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
        <div
          data-pdf-workspace-dock-controls="true"
          className="flex w-12 shrink-0 flex-col items-center gap-2 border-l border-gray-100 bg-gray-50 px-1 py-3"
        >
          <button
            type="button"
            data-pdf-workspace-dock="library"
            aria-pressed={rightPanel === 'library'}
            aria-label="Library"
            title="Library"
            className={`rounded p-2 ${rightPanel === 'library' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
            onClick={() => togglePanel('library')}
          >
            <Library className="h-4 w-4" aria-hidden="true" />
          </button>
          {aiAvailable ? (
            <button
              type="button"
              data-pdf-workspace-dock="ai"
              aria-pressed={rightPanel === 'ai'}
              aria-label="AI"
              title="AI"
              className={`rounded p-2 ${rightPanel === 'ai' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => togglePanel('ai')}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {rightPanel !== 'closed' ? (
          <aside
            data-pdf-workspace-right-panel-content="true"
            className="flex min-h-0 w-[340px] shrink-0 flex-col border-l border-gray-200 bg-white"
            aria-label={`${rightPanel === 'library' ? 'Library' : 'AI'} for ${activeFilename}`}
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-700">{rightPanel === 'library' ? 'Library' : 'AI'}</div>
                <div data-pdf-workspace-panel-document="true" className="truncate text-[11px] text-gray-500" title={activeFilename}>
                  {activeFilename}
                </div>
              </div>
              <button
                type="button"
                data-pdf-workspace-panel-close="true"
                aria-label="Close right panel"
                title="Close"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
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
