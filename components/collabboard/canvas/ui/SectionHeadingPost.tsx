"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Padlet } from '@/types/collabboard';
import {
  SECTION_HEADING_ACCENT_WIDTH_PX,
  SECTION_HEADING_DEFAULT_HEIGHT,
  SECTION_HEADING_DEFAULT_WIDTH,
  SECTION_HEADING_HANDLE_HIT_PX,
  SECTION_HEADING_LEVEL_TEXT_CLASS,
  SECTION_HEADING_MAX_LENGTH,
  getSectionHeadingAccentColor,
  getSectionHeadingBackgroundColor,
  getSectionHeadingLevel,
  getSectionHeadingText,
  resizeSectionHeadingLeftEdge,
  resizeSectionHeadingRightEdge,
  resolveSectionHeadingTextStyle,
  sanitizeSectionHeadingText,
  type SectionHeadingRect,
} from '@/components/collabboard/canvas/engine/sectionHeading';

/**
 * PATCH SECTION-H1 -- the Freeform Section Heading renderer.
 * PATCH SECTION-H2 -- adds horizontal-only sizing and whole-heading styling.
 *
 * Owns its ENTIRE presentation rather than borrowing the generic post card:
 * no Note chrome, no title/content split, no footer, no comment badge. It
 * renders the same positioned `[data-padlet-id]` wrapper every other root
 * uses, which is what makes canonical drag, selection, z-order and minimap
 * measurement apply with no type-specific plumbing.
 *
 * Deliberately imports nothing from Excalidraw/Drawing (H1 Phase 34) so the
 * semantic model stays reusable by SECTION-H3's Drawing adapter.
 */

export type SectionHeadingEdge = 'left' | 'right';

export interface SectionHeadingPostProps {
  padlet: Padlet;
  isSelected: boolean;
  canEdit: boolean;
  isDraggingThis: boolean;
  onMouseDownCapture: (event: React.MouseEvent, padletId: string) => void;
  /** Canonical stamped title write (useCanvasData.updatePadletTitle). */
  onCommitText: (padletId: string, text: string) => void;
  /**
   * PATCH SECTION-H2: live camera scale. Consumed read-only so the grab
   * targets keep a constant SCREEN size; no camera math is defined here.
   */
  canvasZoom?: number;
  /**
   * Phase 20: suppressed while the heading is part of a multi-selection, so
   * the group-drag model and the single-object sizing model never overlap.
   */
  canResize?: boolean;
  /** Phase 17: local preview during the drag -- no write per pointermove. */
  onResizePreview?: (padletId: string, rect: SectionHeadingRect) => void;
  /**
   * Phase 17: the single canonical persistence call, on pointerup. The rect
   * the gesture STARTED from is handed back alongside the result, because
   * this component is the only place that still knows it -- local state has
   * been showing previews since the first pointermove -- and the caller needs
   * it to roll back honestly if the write fails.
   */
  onResizeCommit?: (padletId: string, rect: SectionHeadingRect, originRect: SectionHeadingRect) => void;
}

export default function SectionHeadingPost({
  padlet,
  isSelected,
  canEdit,
  isDraggingThis,
  onMouseDownCapture,
  onCommitText,
  canvasZoom = 1,
  canResize = true,
  onResizePreview,
  onResizeCommit,
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
  const accentColor = getSectionHeadingAccentColor(padlet);
  const surfaceColor = getSectionHeadingBackgroundColor(padlet);
  const textStyle = resolveSectionHeadingTextStyle(padlet);

  // The drag origin is captured once so every frame derives from the ORIGINAL
  // rect. Accumulating frame-to-frame deltas instead would let rounding and
  // clamping compound, and would let the "fixed" edge creep.
  const sizingRef = useRef<{ edge: SectionHeadingEdge; startClientX: number; rect: SectionHeadingRect } | null>(null);

  const zoom = Number.isFinite(canvasZoom) && Number(canvasZoom) > 0 ? Number(canvasZoom) : 1;

  const rectFor = useCallback((edge: SectionHeadingEdge, clientX: number): SectionHeadingRect | null => {
    const origin = sizingRef.current;
    if (!origin) return null;
    // Screen pixels -> world units, divided by the zoom EXACTLY ONCE.
    const worldDeltaX = (clientX - origin.startClientX) / zoom;
    return edge === 'right'
      ? resizeSectionHeadingRightEdge(origin.rect, worldDeltaX)
      : resizeSectionHeadingLeftEdge(origin.rect, worldDeltaX);
  }, [zoom]);

  const handleSizingStart = useCallback((edge: SectionHeadingEdge) => (event: React.PointerEvent) => {
    if (!canEdit || !canResize) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    sizingRef.current = {
      edge,
      startClientX: event.clientX,
      rect: { x: Number(padlet.position_x) || 0, width },
    };
  }, [canEdit, canResize, padlet.position_x, width]);

  const handleSizingMove = useCallback((edge: SectionHeadingEdge) => (event: React.PointerEvent) => {
    if (!sizingRef.current || sizingRef.current.edge !== edge) return;
    event.preventDefault();
    event.stopPropagation();
    const next = rectFor(edge, event.clientX);
    if (next) onResizePreview?.(padlet.id, next);
  }, [rectFor, onResizePreview, padlet.id]);

  const handleSizingEnd = useCallback((edge: SectionHeadingEdge) => (event: React.PointerEvent) => {
    if (!sizingRef.current || sizingRef.current.edge !== edge) return;
    event.preventDefault();
    event.stopPropagation();
    const next = rectFor(edge, event.clientX);
    const origin = sizingRef.current.rect;
    sizingRef.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    // A gesture that ended exactly where it started writes nothing at all.
    if (next && (next.x !== origin.x || next.width !== origin.width)) {
      onResizeCommit?.(padlet.id, next, origin);
    }
  }, [rectFor, onResizeCommit, padlet.id]);

  const handleSizingCancel = useCallback((event: React.PointerEvent) => {
    // Phase 17/18: an aborted gesture leaves the last previewed geometry in
    // local state and simply writes nothing -- the object never gets stuck
    // mid-drag, and no half-finished value reaches the database.
    sizingRef.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }, []);

  // Constant screen-space grab target: dividing by the live zoom means the
  // handle is still comfortably clickable at 10% instead of a 1px sliver.
  const handleHitWidth = SECTION_HEADING_HANDLE_HIT_PX / zoom;
  const showHandles = isSelected && canEdit && canResize;

  const renderHandle = (edge: SectionHeadingEdge) => (
    <div
      data-no-drag="true"
      data-section-heading-handle={edge}
      role="separator"
      aria-orientation="vertical"
      aria-label={edge === 'left' ? 'Resize section heading from the left' : 'Resize section heading from the right'}
      onPointerDown={handleSizingStart(edge)}
      onPointerMove={handleSizingMove(edge)}
      onPointerUp={handleSizingEnd(edge)}
      onPointerCancel={handleSizingCancel}
      className="absolute top-0 flex h-full cursor-ew-resize items-center justify-center"
      style={{
        width: handleHitWidth,
        [edge]: -handleHitWidth / 2,
      } as React.CSSProperties}
    >
      {/* A slim vertical pill, so a width handle can never be mistaken for
          the accent stripe it sits next to (Phase 36). */}
      <div
        className="rounded-full border border-white bg-blue-500 shadow-sm"
        style={{ width: 4 / zoom, height: Math.min(height * 0.5, 24 / zoom) }}
      />
    </div>
  );

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
        className={`relative flex items-center overflow-visible rounded-md ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
        style={{ width, height, backgroundColor: surfaceColor }}
        onDoubleClick={() => { if (canEdit) setIsEditing(true); }}
      >
        {/* Left accent stripe (H1 Phase 10) -- never a top stripe, so the
            heading stays visually compact as it stretches horizontally. */}
        <div
          data-section-heading-accent="true"
          aria-hidden="true"
          className="h-full shrink-0 rounded-l-md"
          style={{ width: SECTION_HEADING_ACCENT_WIDTH_PX, backgroundColor: accentColor }}
        />
        <div className="min-w-0 flex-1 overflow-hidden px-3">
          {isEditing ? (
            <input
              ref={inputRef}
              data-section-heading-input="true"
              aria-label="Section heading text"
              className={`w-full bg-transparent outline-none ${SECTION_HEADING_LEVEL_TEXT_CLASS[level]}`}
              style={textStyle}
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
              // Keyboard-reachable by construction (H1 Phase 30) rather than a
              // bare div with a click handler.
              className={`block w-full truncate text-left ${SECTION_HEADING_LEVEL_TEXT_CLASS[level]} ${canEdit ? '' : 'cursor-default'}`}
              style={textStyle}
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

        {/* Phase 9: LEFT and RIGHT width handles only. There is deliberately
            no top, bottom, corner or rotation affordance -- a Section Heading
            has a fixed height contract and no rotation model. */}
        {showHandles && renderHandle('left')}
        {showHandles && renderHandle('right')}
      </div>
    </div>
  );
}
