"use client";

import React from 'react';
import type { FreeformAlignmentGuideState } from '@/types/collabboard';
import {
  FREEFORM_SIGNED_WORLD_WIDTH,
  FREEFORM_SIGNED_WORLD_HEIGHT,
  FREEFORM_WORLD_MIN_X,
  FREEFORM_WORLD_MIN_Y,
} from '@/components/collabboard/canvas/engine/freeformStageGeometry';

interface FreeformAlignmentGuidesProps {
  guides: FreeformAlignmentGuideState;
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
export default function FreeformAlignmentGuides({ guides }: FreeformAlignmentGuidesProps) {
  if (guides.verticalX === null && guides.horizontalY === null) {
    return null;
  }

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
    </>
  );
}
