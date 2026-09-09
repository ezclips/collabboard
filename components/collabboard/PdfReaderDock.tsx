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
 * The reader's compact header control shape, borrowed rather than invented:
 * it is the same 28px rounded square the PDF header's own tab controls use, so
 * Library and AI sit in that row as members of it instead of as two large
 * blocks in a strip of their own.
 */
const DOCK_BUTTON_CLASS =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent '
  + 'text-gray-500 transition hover:bg-white hover:text-gray-800 '
  + 'focus:outline-none focus-visible:ring-2';

/**
 * Library and AI, in the PDF header, immediately before its close control.
 *
 * Extracted rather than copied into each host, because two docks that drift
 * apart is exactly the "two different PDF experiences" this consolidation
 * exists to end. Active state is carried by a quiet tint in each panel's own
 * colour -- blue for Library, purple for AI -- which reads at this size where
 * a filled block only shouted.
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
    <div data-pdf-reader-dock="true" className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        data-pdf-workspace-dock="library"
        aria-pressed={panel === 'library'}
        aria-label="Library"
        title="Library"
        className={`${DOCK_BUTTON_CLASS} focus-visible:ring-blue-300${
          panel === 'library' ? ' border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-50 hover:text-blue-700' : ''}`}
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
          className={`${DOCK_BUTTON_CLASS} focus-visible:ring-purple-300${
            panel === 'ai' ? ' border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-50 hover:text-purple-700' : ''}`}
          onClick={() => toggle('ai')}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
