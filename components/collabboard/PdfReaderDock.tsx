"use client";

import React from 'react';
import { Library, Sparkles } from 'lucide-react';

/**
 * Which panel the PDF reader's right side is showing, in either host.
 *
 * One vocabulary for both the focused workspace and the docked side panel:
 * the two hosts differ in geometry, never in what the dock can express.
 */
export type PdfReaderPanel = 'closed' | 'library' | 'ai';

export interface PdfReaderDockProps {
  readonly panel: PdfReaderPanel;
  /** Withheld where Board AI is off, so no dead control is mounted. */
  readonly aiAvailable?: boolean;
  readonly onPanelChange: (panel: PdfReaderPanel) => void;
}

/**
 * The narrow fixed dock beside a PDF: Library, then AI.
 *
 * Extracted from PdfWorkspaceChrome rather than copied into the side panel,
 * because two docks that drift apart is exactly the "two different PDF
 * experiences" this consolidation exists to end. The markup, the data
 * attributes and both active colours are the workspace's own, unchanged --
 * blue for Library, purple for AI -- so the focused workspace renders byte for
 * byte what it rendered before.
 */
export default function PdfReaderDock({
  panel,
  aiAvailable = false,
  onPanelChange,
}: PdfReaderDockProps) {
  // Clicking the open panel's own button closes it: the dock is a toggle, and
  // the PDF beside it stays visible and usable either way.
  const toggle = (next: Exclude<PdfReaderPanel, 'closed'>) => {
    onPanelChange(panel === next ? 'closed' : next);
  };

  return (
    <div
      data-pdf-workspace-dock-controls="true"
      className="flex w-12 shrink-0 flex-col items-center gap-2 border-l border-gray-200 bg-slate-50 px-1 py-3"
    >
      <button
        type="button"
        data-pdf-workspace-dock="library"
        aria-pressed={panel === 'library'}
        aria-label="Library"
        title="Library"
        className={`rounded-lg p-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${panel === 'library' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-800'}`}
        onClick={() => toggle('library')}
      >
        <Library className="h-4 w-4" aria-hidden="true" />
      </button>
      {aiAvailable ? (
        <button
          type="button"
          data-pdf-workspace-dock="ai"
          aria-pressed={panel === 'ai'}
          aria-label="AI"
          title="AI"
          className={`rounded-lg p-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${panel === 'ai' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-800'}`}
          onClick={() => toggle('ai')}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
