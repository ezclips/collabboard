"use client";

import React from 'react';
import { Library, Sparkles } from 'lucide-react';
import {
  KNOWLEDGE_CONTROL_ACTIVE_BLUE,
  KNOWLEDGE_CONTROL_ACTIVE_PURPLE,
  KNOWLEDGE_ICON_BUTTON_CLASS,
  KNOWLEDGE_ICON_SIZE_CLASS,
} from '@/components/collabboard/knowledgeReaderControls';

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
 * Library and AI, in the PDF header, immediately before its close control.
 *
 * They are the reader's own compact controls -- the SAME shared class the
 * bottom toolbar's search, Create Note and Select area buttons are drawn
 * from, not a lookalike -- so the header and the footer read as one toolbar.
 * Turning one on only tints it, in that panel's colour; the shape never
 * changes.
 *
 * Extracted into one component rather than copied into each host, because two
 * docks that drift apart is exactly the "two different PDF experiences" this
 * consolidation exists to end.
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
        className={`${KNOWLEDGE_ICON_BUTTON_CLASS}${panel === 'library' ? KNOWLEDGE_CONTROL_ACTIVE_BLUE : ''}`}
        onClick={() => toggle('library')}
      >
        <Library className={KNOWLEDGE_ICON_SIZE_CLASS} aria-hidden="true" />
      </button>
      {aiAvailable ? (
        <button
          type="button"
          data-pdf-workspace-dock="ai"
          aria-pressed={panel === 'ai'}
          aria-label="AI"
          title="AI"
          className={`${KNOWLEDGE_ICON_BUTTON_CLASS}${panel === 'ai' ? KNOWLEDGE_CONTROL_ACTIVE_PURPLE : ''}`}
          onClick={() => toggle('ai')}
        >
          <Sparkles className={KNOWLEDGE_ICON_SIZE_CLASS} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
