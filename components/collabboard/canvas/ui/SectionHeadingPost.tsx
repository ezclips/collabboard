"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Padlet } from '@/types/collabboard';
import {
  SECTION_HEADING_ACCENT_WIDTH_PX,
  SECTION_HEADING_DEFAULT_HEIGHT,
  SECTION_HEADING_DEFAULT_WIDTH,
  SECTION_HEADING_MAX_LENGTH,
  getSectionHeadingLevel,
  getSectionHeadingText,
  sanitizeSectionHeadingText,
} from '@/components/collabboard/canvas/engine/sectionHeading';

/**
 * PATCH SECTION-H1 -- the Freeform Section Heading renderer.
 *
 * Owns its ENTIRE presentation rather than borrowing the generic post card:
 * no Note chrome, no title/content split, no footer, no comment badge, no
 * resize handles. It renders the same positioned `[data-padlet-id]` wrapper
 * every other root uses, which is what makes canonical drag, selection,
 * z-order and minimap measurement apply with no type-specific plumbing.
 *
 * Deliberately imports nothing from Excalidraw/Drawing (Phase 34) so the
 * semantic model stays reusable by SECTION-H3's Drawing adapter.
 */

/** Type-scale per semantic level. SECTION-H2 exposes the picker; the renderer already honours it. */
const LEVEL_TEXT_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: 'text-2xl font-bold',
  2: 'text-xl font-semibold',
  3: 'text-lg font-semibold',
  4: 'text-base font-medium',
};

export interface SectionHeadingPostProps {
  padlet: Padlet;
  isSelected: boolean;
  canEdit: boolean;
  isDraggingThis: boolean;
  onMouseDownCapture: (event: React.MouseEvent, padletId: string) => void;
  /** Canonical stamped title write (useCanvasData.updatePadletTitle). */
  onCommitText: (padletId: string, text: string) => void;
}

export default function SectionHeadingPost({
  padlet,
  isSelected,
  canEdit,
  isDraggingThis,
  onMouseDownCapture,
  onCommitText,
}: SectionHeadingPostProps) {
  const level = getSectionHeadingLevel(padlet);
  const text = getSectionHeadingText(padlet);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditing) setDraft(text);
  }, [text, isEditing]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const commit = useCallback(() => {
    setIsEditing(false);
    const next = sanitizeSectionHeadingText(draft);
    if (next !== text) onCommitText(padlet.id, next);
    setDraft(next);
  }, [draft, text, onCommitText, padlet.id]);

  const cancel = useCallback(() => {
    setIsEditing(false);
    setDraft(text);
  }, [text]);

  const width = Number(padlet.width) > 0 ? Number(padlet.width) : SECTION_HEADING_DEFAULT_WIDTH;
  const height = Number(padlet.height) > 0 ? Number(padlet.height) : SECTION_HEADING_DEFAULT_HEIGHT;
  const accentColor = (padlet.metadata as { accentColor?: string } | undefined)?.accentColor ?? '#0f766e';
  const surfaceColor = (padlet.metadata as { backgroundColor?: string } | undefined)?.backgroundColor;
  const textColor = (padlet.metadata as { textColor?: string } | undefined)?.textColor;

  return (
    <div
      key={padlet.id}
      data-padlet-id={padlet.id}
      data-section-heading="true"
      className="absolute"
      onMouseDownCapture={(event) => {
        // While editing, the input owns the pointer -- otherwise the drag
        // system would steal focus on every click into the text.
        if (isEditing) return;
        onMouseDownCapture(event, padlet.id);
      }}
      style={{
        left: padlet.position_x || 0,
        top: padlet.position_y || 0,
        cursor: canEdit ? (isDraggingThis ? 'grabbing' : 'grab') : 'default',
        zIndex: isDraggingThis ? Number.MAX_SAFE_INTEGER : ((padlet.metadata as { zIndex?: number } | undefined)?.zIndex || 1),
      }}
    >
      <div
        data-section-heading-surface="true"
        className={`flex items-center overflow-hidden rounded-md ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
        style={{ width, height, backgroundColor: surfaceColor ?? 'transparent' }}
        onDoubleClick={() => { if (canEdit) setIsEditing(true); }}
      >
        {/* Left accent stripe (Phase 10) -- never a top stripe, so the
            heading stays visually compact as it stretches horizontally. */}
        <div
          data-section-heading-accent="true"
          aria-hidden="true"
          className="h-full shrink-0 rounded-l-md"
          style={{ width: SECTION_HEADING_ACCENT_WIDTH_PX, backgroundColor: accentColor }}
        />
        <div className="min-w-0 flex-1 px-3">
          {isEditing ? (
            <input
              ref={inputRef}
              data-section-heading-input="true"
              aria-label="Section heading text"
              className={`w-full bg-transparent outline-none ${LEVEL_TEXT_CLASS[level]}`}
              style={textColor ? { color: textColor } : undefined}
              value={draft}
              maxLength={SECTION_HEADING_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={(event) => {
                // Plain-text only: a rich paste must never smuggle markup or
                // newlines into what is a single-line heading string.
                event.preventDefault();
                const pasted = sanitizeSectionHeadingText(event.clipboardData.getData('text/plain'));
                const target = event.currentTarget;
                const start = target.selectionStart ?? draft.length;
                const end = target.selectionEnd ?? draft.length;
                setDraft((draft.slice(0, start) + pasted + draft.slice(end)).slice(0, SECTION_HEADING_MAX_LENGTH));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); commit(); }
                else if (event.key === 'Escape') { event.preventDefault(); cancel(); }
              }}
              onBlur={commit}
            />
          ) : (
            <button
              type="button"
              data-section-heading-text="true"
              // Keyboard-reachable by construction (Phase 30) rather than a
              // bare div with a click handler.
              className={`block w-full truncate text-left ${LEVEL_TEXT_CLASS[level]} ${canEdit ? '' : 'cursor-default'}`}
              style={textColor ? { color: textColor } : undefined}
              disabled={!canEdit}
              onDoubleClick={() => { if (canEdit) setIsEditing(true); }}
              onKeyDown={(event) => {
                if (canEdit && (event.key === 'Enter' || event.key === 'F2')) {
                  event.preventDefault();
                  setIsEditing(true);
                }
              }}
            >
              {text}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
