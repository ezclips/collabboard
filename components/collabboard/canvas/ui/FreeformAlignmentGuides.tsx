"use client";

import React from 'react';
import type { FreeformAlignmentGuideKindState, FreeformAlignmentGuideState } from '@/types/collabboard';
import {
  FREEFORM_SIGNED_WORLD_WIDTH,
  FREEFORM_SIGNED_WORLD_HEIGHT,
  FREEFORM_WORLD_MIN_X,
  FREEFORM_WORLD_MIN_Y,
} from '@/components/collabboard/canvas/engine/freeformStageGeometry';

// PATCH ALIGN-E2: a 1px guide line sitting exactly on a touching post's edge
// can visually merge with that post's own selection border. The marker is a
// short bar perpendicular to the guide, at the dragged post's own center on
// the cross axis -- together with the guide line it reads as a small "+" at
// the actual contact point. WORLD units, same as every other size/position
// in this component -- no separate zoom conversion needed since the whole
// component already lives inside CanvasClient's scale(canvasZoom) wrapper.
const ADJACENCY_MARKER_LENGTH = 14;
const ADJACENCY_MARKER_THICKNESS = 3;

const NO_ADJACENCY: FreeformAlignmentGuideKindState = {
  verticalIsAdjacency: false,
  horizontalIsAdjacency: false,
  verticalMarkerY: null,
  horizontalMarkerX: null,
};

interface FreeformAlignmentGuidesProps {
  guides: FreeformAlignmentGuideState;
  // Optional and defaulted to "no adjacency anywhere" so every existing
  // caller/test that only ever passed `guides` keeps rendering the exact
  // same ordinary line, byte-for-byte, with no marker.
  kinds?: FreeformAlignmentGuideKindState;
}

/**
 * PATCH ALIGN-A: renders the Smart Alignment Guide foundation -- a single
 * vertical and/or horizontal line in WORLD coordinates. Mounted inside the
 * SAME `left/top: freeformWorldOriginLeft/Top` + `transform: scale(canvasZoom)`
 * wrapper CanvasClient already uses for the front Line plane, so no zoom/pan
 * math lives here -- a world-unit `left`/`top` is enough, and the ancestor
 * transform does the rest. Each line spans the full signed world extent
 * (MIN to MAX on the cross-axis) rather than just the legacy 0..10000
 * FREEFORM_WORLD_WIDTH/HEIGHT_PX region, since a guide is not anchored to
 * any one post's box.
 *
 * ALIGN-B decides WHEN a guide should show (edge/center alignment detection
 * against other root posts); this component only draws whatever it is
 * handed and renders nothing when both axes are null.
 */
export default function FreeformAlignmentGuides({ guides, kinds = NO_ADJACENCY }: FreeformAlignmentGuidesProps) {
  if (guides.verticalX === null && guides.horizontalY === null) {
    return null;
  }

  const showVerticalMarker = guides.verticalX !== null && kinds.verticalIsAdjacency && kinds.verticalMarkerY !== null;
  const showHorizontalMarker = guides.horizontalY !== null && kinds.horizontalIsAdjacency && kinds.horizontalMarkerX !== null;

  return (
    <>
      {guides.verticalX !== null && (
        <div
          data-freeform-alignment-guide="vertical"
          className="absolute bg-blue-500"
          style={{
            left: guides.verticalX,
            top: FREEFORM_WORLD_MIN_Y,
            width: 1,
            height: FREEFORM_SIGNED_WORLD_HEIGHT,
            pointerEvents: 'none',
          }}
        />
      )}
      {showVerticalMarker && (
        <div
          data-freeform-alignment-guide="vertical-adjacency-marker"
          className="absolute bg-blue-500"
          style={{
            left: (guides.verticalX as number) - ADJACENCY_MARKER_LENGTH / 2,
            top: (kinds.verticalMarkerY as number) - ADJACENCY_MARKER_THICKNESS / 2,
            width: ADJACENCY_MARKER_LENGTH,
            height: ADJACENCY_MARKER_THICKNESS,
            pointerEvents: 'none',
          }}
        />
      )}
      {guides.horizontalY !== null && (
        <div
          data-freeform-alignment-guide="horizontal"
          className="absolute bg-blue-500"
          style={{
            left: FREEFORM_WORLD_MIN_X,
            top: guides.horizontalY,
            width: FREEFORM_SIGNED_WORLD_WIDTH,
            height: 1,
            pointerEvents: 'none',
          }}
        />
      )}
      {showHorizontalMarker && (
        <div
          data-freeform-alignment-guide="horizontal-adjacency-marker"
          className="absolute bg-blue-500"
          style={{
            left: (kinds.horizontalMarkerX as number) - ADJACENCY_MARKER_THICKNESS / 2,
            top: (guides.horizontalY as number) - ADJACENCY_MARKER_LENGTH / 2,
            width: ADJACENCY_MARKER_THICKNESS,
            height: ADJACENCY_MARKER_LENGTH,
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
}
