"use client";

import React from 'react';
import type { FreeformSpacingGuideState } from '@/types/collabboard';

// PATCH SPACE-P1: zoom-tier display thresholds -- a screen-space visibility
// concern (how legible the bracket/number stay at the current zoom), kept
// here beside the component that consumes them rather than in
// freeformStageGeometry.ts, mirroring FreeformAlignmentGuides.tsx's own
// ADJACENCY_MARKER_LENGTH/THICKNESS precedent. DETECTION constants (e.g.
// FREEFORM_SPACING_GUIDE_MAX_DISTANCE_SCREEN_PX, which decides whether a
// neighbour qualifies at all) live in the geometry engine instead; this
// component only ever reads the ALREADY-resolved guides it is handed.
const SPACING_GUIDE_MIN_ZOOM_TO_SHOW = 0.5;
const SPACING_GUIDE_MIN_ZOOM_TO_SHOW_NUMBER = 0.7;

// World-unit sizes -- same "no zoom math here, let the ambient
// transform: scale(canvasZoom) wrapper handle it" convention
// FreeformAlignmentGuides.tsx's own adjacency marker uses.
const SPACING_TICK_LENGTH = 14;
const SPACING_LINE_THICKNESS = 1.5;
const SPACING_TICK_THICKNESS = 1.5;
const SPACING_LABEL_FONT_SIZE = 11;

type SpacingAxisGuide = NonNullable<FreeformSpacingGuideState['horizontalGap']>;

interface FreeformSpacingGuidesProps {
  guides: FreeformSpacingGuideState;
  canvasZoom: number;
}

/**
 * PATCH SPACE-P1: renders the spacing-gap measurement bracket(s) -- a thin
 * line spanning the actual positive gap between the dragged post and its
 * nearest non-overlapping neighbour on an axis, short perpendicular ticks at
 * both facing edges, and (at high enough zoom) a rounded world-unit distance
 * label. Measurement only, exactly like FreeformAlignmentGuides is for
 * alignment lines: this component never influences drag position,
 * Snap-to-Grid, or anything else -- it only draws whatever the caller's
 * already-resolved `guides` state hands it.
 */
export default function FreeformSpacingGuides({ guides, canvasZoom }: FreeformSpacingGuidesProps) {
  if (canvasZoom < SPACING_GUIDE_MIN_ZOOM_TO_SHOW) return null;
  if (guides.horizontalGap === null && guides.verticalGap === null) return null;

  const showNumber = canvasZoom >= SPACING_GUIDE_MIN_ZOOM_TO_SHOW_NUMBER;

  return (
    <>
      {guides.horizontalGap && <HorizontalSpacingBracket gap={guides.horizontalGap} showNumber={showNumber} />}
      {guides.verticalGap && <VerticalSpacingBracket gap={guides.verticalGap} showNumber={showNumber} />}
    </>
  );
}

// HORIZONTAL gap: a side-by-side (left/right neighbour) pair -- the bracket
// itself is drawn spanning horizontally: `[ A ]  <--20-->  [ B ]`.
function HorizontalSpacingBracket({ gap, showNumber }: { gap: SpacingAxisGuide; showNumber: boolean }) {
  const { gapStart, gapEnd, crossCenter, distance } = gap;
  return (
    <>
      <div
        data-freeform-spacing-guide="horizontal-line"
        className="absolute bg-blue-500"
        style={{
          left: gapStart,
          top: crossCenter - SPACING_LINE_THICKNESS / 2,
          width: gapEnd - gapStart,
          height: SPACING_LINE_THICKNESS,
          pointerEvents: 'none',
        }}
      />
      <div
        data-freeform-spacing-guide="horizontal-tick-start"
        className="absolute bg-blue-500"
        style={{
          left: gapStart - SPACING_TICK_THICKNESS / 2,
          top: crossCenter - SPACING_TICK_LENGTH / 2,
          width: SPACING_TICK_THICKNESS,
          height: SPACING_TICK_LENGTH,
          pointerEvents: 'none',
        }}
      />
      <div
        data-freeform-spacing-guide="horizontal-tick-end"
        className="absolute bg-blue-500"
        style={{
          left: gapEnd - SPACING_TICK_THICKNESS / 2,
          top: crossCenter - SPACING_TICK_LENGTH / 2,
          width: SPACING_TICK_THICKNESS,
          height: SPACING_TICK_LENGTH,
          pointerEvents: 'none',
        }}
      />
      {showNumber && (
        <div
          data-freeform-spacing-guide="horizontal-label"
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-white px-1 text-blue-600 shadow-sm"
          style={{
            left: (gapStart + gapEnd) / 2,
            top: crossCenter,
            fontSize: SPACING_LABEL_FONT_SIZE,
            lineHeight: 1.4,
            pointerEvents: 'none',
          }}
        >
          {Math.round(distance)}
        </div>
      )}
    </>
  );
}

// VERTICAL gap: a stacked (top/bottom neighbour) pair -- the bracket itself
// is drawn spanning vertically.
function VerticalSpacingBracket({ gap, showNumber }: { gap: SpacingAxisGuide; showNumber: boolean }) {
  const { gapStart, gapEnd, crossCenter, distance } = gap;
  return (
    <>
      <div
        data-freeform-spacing-guide="vertical-line"
        className="absolute bg-blue-500"
        style={{
          left: crossCenter - SPACING_LINE_THICKNESS / 2,
          top: gapStart,
          width: SPACING_LINE_THICKNESS,
          height: gapEnd - gapStart,
          pointerEvents: 'none',
        }}
      />
      <div
        data-freeform-spacing-guide="vertical-tick-start"
        className="absolute bg-blue-500"
        style={{
          left: crossCenter - SPACING_TICK_LENGTH / 2,
          top: gapStart - SPACING_TICK_THICKNESS / 2,
          width: SPACING_TICK_LENGTH,
          height: SPACING_TICK_THICKNESS,
          pointerEvents: 'none',
        }}
      />
      <div
        data-freeform-spacing-guide="vertical-tick-end"
        className="absolute bg-blue-500"
        style={{
          left: crossCenter - SPACING_TICK_LENGTH / 2,
          top: gapEnd - SPACING_TICK_THICKNESS / 2,
          width: SPACING_TICK_LENGTH,
          height: SPACING_TICK_THICKNESS,
          pointerEvents: 'none',
        }}
      />
      {showNumber && (
        <div
          data-freeform-spacing-guide="vertical-label"
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-white px-1 text-blue-600 shadow-sm"
          style={{
            left: crossCenter,
            top: (gapStart + gapEnd) / 2,
            fontSize: SPACING_LABEL_FONT_SIZE,
            lineHeight: 1.4,
            pointerEvents: 'none',
          }}
        >
          {Math.round(distance)}
        </div>
      )}
    </>
  );
}
