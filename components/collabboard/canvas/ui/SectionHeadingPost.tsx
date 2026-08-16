"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Padlet } from '@/types/collabboard';
import {
  SECTION_HEADING_ACCENT_WIDTH_PX,
  SECTION_HEADING_DEFAULT_WIDTH,
  SECTION_HEADING_HANDLE_HIT_PX,
  SECTION_HEADING_LEVEL_TEXT_CLASS,
  SECTION_HEADING_MAX_LENGTH,
  SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX,
  getSectionHeadingAccentColor,
  getSectionHeadingBackgroundColor,
  getSectionHeadingHeight,
  getSectionHeadingLevel,
  getSectionHeadingText,
  resizeSectionHeadingLeftEdge,
  resizeSectionHeadingRightEdge,
  type SectionHeadingResizeOrigin,
  type SectionHeadingWorldBounds,
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
   * PATCH SECTION-H3B Phase 6/7 -- the host's client -> world converter.
   *
   * This is the ONLY thing the heading needs to know about the canvas it is
   * living on. It asks "which world point is under this client position?" and
   * the host answers using whatever camera model it owns: Freeform passes its
   * canonical `getCanvasPointFromClient`, a Drawing host would pass
   * `toSceneCoords(clientX, clientY, appState)`. No zoom, scroll, world
   * origin or scene offset is ever named here.
   */
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  /** Phase 3: how far left/right the HOST's world extends. */
  worldBounds: SectionHeadingWorldBounds;
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
  clientToWorld,
  worldBounds,
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
  // PATCH SECTION-H3B.2 Phase 17/18: a heading ALWAYS renders its own
  // persisted height, never one freshly recomputed from its level on every
  // render -- that is what keeps a pre-existing heading's on-screen size
  // agreeing with drag/minimap/bounds code that also reads padlet.height
  // directly, with no silent DOM-vs-canonical divergence. The level-aware
  // resolver is used ONLY as the fallback for genuinely missing/invalid
  // persisted geometry, in place of the old flat default.
  const height = Number(padlet.height) > 0 ? Number(padlet.height) : getSectionHeadingHeight(padlet);
  const accentColor = getSectionHeadingAccentColor(padlet);
  const surfaceColor = getSectionHeadingBackgroundColor(padlet);
  const textStyle = resolveSectionHeadingTextStyle(padlet);

  // The drag origin is captured once so every frame derives from the ORIGINAL
  // rect. Accumulating frame-to-frame deltas instead would let rounding and
  // clamping compound, and would let the "fixed" edge creep.
  const sizingRef = useRef<{ edge: SectionHeadingEdge; origin: SectionHeadingResizeOrigin } | null>(null);

  const rectFor = useCallback((edge: SectionHeadingEdge, clientX: number): SectionHeadingRect | null => {
    const gesture = sizingRef.current;
    if (!gesture) return null;
    // The host resolves the ABSOLUTE world point under the pointer. There is
    // deliberately no arithmetic on the camera here -- no zoom division, no
    // scroll offset -- which is exactly why the same gesture behaves
    // identically on any engine and at any scale.
    const pointerWorldX = clientToWorld(clientX, 0).x;
    return edge === 'right'
      ? resizeSectionHeadingRightEdge(gesture.origin, pointerWorldX, worldBounds)
      : resizeSectionHeadingLeftEdge(gesture.origin, pointerWorldX, worldBounds);
  }, [clientToWorld, worldBounds]);

  const handleSizingStart = useCallback((edge: SectionHeadingEdge) => (event: React.PointerEvent) => {
    if (!canEdit || !canResize) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    sizingRef.current = {
      edge,
      origin: {
        rect: { x: Number(padlet.position_x) || 0, width },
        pointerWorldX: clientToWorld(event.clientX, 0).x,
      },
    };
  }, [canEdit, canResize, clientToWorld, padlet.position_x, width]);

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
    const origin = sizingRef.current.origin.rect;
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

  // Constant screen-space grab target, derived from the SAME host converter
  // rather than a camera scalar: measuring how much world a 100px client span
  // covers yields the scale on any engine, so the handle stays comfortably
  // clickable at 10% instead of shrinking to a 1px sliver.
  const worldPerClientPx = (() => {
    const scale = Math.abs(clientToWorld(100, 0).x - clientToWorld(0, 0).x) / 100;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  })();
  const handleHitWidth = SECTION_HEADING_HANDLE_HIT_PX * worldPerClientPx;
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
        style={{ width: 4 * worldPerClientPx, height: Math.min(height * 0.5, 24 * worldPerClientPx) }}
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
      onClick={(event) => {
        // SECTION-H3B.1: every other root post stops a click here so it never
        // reaches the canvas viewport's blank-space handler. Without this, a
        // heading selected on mousedown was deselected a moment later by its
        // own click bubbling up and being read as "clicked empty canvas".
        event.stopPropagation();
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
        // PATCH SECTION-H3B.3 Phase 5: square surface -- a Section Heading is
        // a board-structure marker, not a card, and CollabBoard's design
        // requirement for it is square outer corners. No `rounded*` class of
        // any kind on this element (resting OR selected).
        className={`relative flex items-center overflow-visible ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
        style={{ width, height, backgroundColor: surfaceColor }}
        onDoubleClick={() => { if (canEdit) setIsEditing(true); }}
      >
        {/* Left accent stripe (H1 Phase 10) -- never a top stripe, so the
            heading stays visually compact as it stretches horizontally.
            PATCH SECTION-H3B.3 Phase 6: no rounded cap -- it runs flush from
            the surface's (now square) top edge to its bottom edge. */}
        <div
          data-section-heading-accent="true"
          aria-hidden="true"
          className="h-full shrink-0"
          style={{ width: SECTION_HEADING_ACCENT_WIDTH_PX, backgroundColor: accentColor }}
        />
        {/* PATCH SECTION-H3B.3 Phase 10/12: the ONE optical offset, applied to
            the wrapper both the resting button AND the editing input live
            inside -- so both states move together and there is never a
            visible jump switching between them. */}
        <div
          className="min-w-0 flex-1 overflow-hidden px-3"
          style={{ transform: `translateY(-${SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX}px)` }}
        >
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
            no top, bottom, corner or rotation affordance -- height is never
            drag-resized (SECTION-H3B.2: it follows the heading LEVEL instead),
            and there is no rotation model. */}
        {showHandles && renderHandle('left')}
        {showHandles && renderHandle('right')}
      </div>
    </div>
  );
}
