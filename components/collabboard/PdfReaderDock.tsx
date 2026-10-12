"use client";

import React from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import {
  KNOWLEDGE_CONTROL_ACTIVE_BLUE,
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
 * PATCH-346 Addendum 2. ONE show/hide toggle, not a Library button and an AI
 * button: the panel's own Library | AI switch does the switching, and the top
 * bar only opens and closes the panel. Two icons here duplicated that switch,
 * which is what the owner saw ("you have the same button twice").
 *
 * The control is the SAME shared icon-button class the bottom toolbar's search,
 * Create Note and Select area buttons are drawn from, not a lookalike, so the
 * header and the footer read as one toolbar. Open, it tints in the panel blue;
 * the shape never changes.
 *
 * Reopening restores the panel that was open LAST, so a reader who was on AI,
 * closed it and reopened it lands back on AI rather than losing their place.
 */
export default function PdfReaderDock({
  panel,
  aiAvailable = false,
  onPanelChange,
}: PdfReaderDockProps) {
  // Remembered while the panel is open; 'library' until then. A ref, not state:
  // it must not re-render the dock, and it must survive the panel closing.
  const lastOpenPanelRef = React.useRef<Exclude<PdfReaderPanel, 'closed'>>('library');
  if (panel !== 'closed') lastOpenPanelRef.current = panel;

  const isOpen = panel !== 'closed';
  const toggle = () => {
    if (isOpen) {
      onPanelChange('closed');
      return;
    }
    // Board AI can be withdrawn between sessions; a remembered 'ai' must not
    // reopen a panel that is no longer offered.
    const remembered = lastOpenPanelRef.current;
    onPanelChange(remembered === 'ai' && !aiAvailable ? 'library' : remembered);
  };

  return (
    <div data-pdf-reader-dock="true" className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        data-pdf-workspace-dock="toggle"
        aria-pressed={isOpen}
        aria-label={isOpen ? 'Hide side panel' : 'Show side panel'}
        title={isOpen ? 'Hide side panel' : 'Show side panel'}
        className={`${KNOWLEDGE_ICON_BUTTON_CLASS}${isOpen ? KNOWLEDGE_CONTROL_ACTIVE_BLUE : ''}`}
        onClick={toggle}
      >
        {isOpen
          ? <PanelRightClose className={KNOWLEDGE_ICON_SIZE_CLASS} aria-hidden="true" />
          : <PanelRightOpen className={KNOWLEDGE_ICON_SIZE_CLASS} aria-hidden="true" />}
      </button>
    </div>
  );
}
