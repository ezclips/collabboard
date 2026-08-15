"use client";

import React, { useCallback, useState } from 'react';
import { ChevronsDown, ChevronsUp, Minus, Plus } from 'lucide-react';
import type { Padlet } from '@/types/collabboard';
import FreeformMinimap from './FreeformMinimap';

export interface FreeformNavigationControlProps {
  // Zoom: the camera remains the sole authority. This component only
  // presents the existing handlers/value -- it reuses ZoomControls'
  // accepted minus/plus/reset behavior rather than reimplementing it.
  canvasZoom: number;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
  handleZoomIn: () => void;
  // Minimap: passed straight through to FreeformMinimap, which continues to
  // own all geometry/projection/pointer math unchanged.
  rootPosts: readonly Padlet[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  worldOriginRef: React.RefObject<HTMLDivElement | null>;
  panByWorldDelta: (dxWorld: number, dyWorld: number) => void;
}

/**
 * PATCH 9W -- single bottom-left navigation control combining the zoom row
 * and the Freeform minimap into one shell. Owns only local expand/collapse
 * UI state; camera position, minimap geometry, and world projection all
 * remain owned by useCanvasCamera / FreeformMinimap exactly as before.
 */
export default function FreeformNavigationControl({
  canvasZoom,
  handleZoomOut,
  handleZoomReset,
  handleZoomIn,
  rootPosts,
  containerRef,
  worldOriginRef,
  panByWorldDelta,
}: FreeformNavigationControlProps) {
  const [expanded, setExpanded] = useState(true);

  // Isolates the shell (header background + minimap padding) from the
  // canvas's own pan/select handlers, mirroring FreeformMinimap's own
  // long-standing isolateEvent pattern. Buttons inside still receive their
  // own onClick normally -- stopping propagation here only prevents the
  // event from continuing past this shell toward the canvas.
  const isolateEvent = useCallback((event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return (
    <div
      data-freeform-navigation-control="true"
      // PATCH 9W Phase 26: unlike the standalone minimap, this shell must
      // NOT hide below the md breakpoint -- the old bottom-right
      // ZoomControls it replaces had no such rule, and always stayed
      // visible on narrow viewports. Only the minimap body (rendered via
      // FreeformMinimap's own `embedded` styling below) keeps that policy,
      // so the zoom row survives on mobile exactly as it does today.
      className="pointer-events-auto absolute bottom-4 left-[72px] z-40 w-[168px] overflow-hidden rounded-lg border border-gray-200 bg-background shadow-md"
      onMouseDown={isolateEvent}
      onClick={isolateEvent}
      onDoubleClick={isolateEvent}
      onWheel={isolateEvent}
      onContextMenu={isolateEvent}
    >
      <div data-freeform-navigation-header="true" className="flex h-9 items-center">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? 'Hide minimap' : 'Show minimap'}
          title={expanded ? 'Hide minimap' : 'Show minimap'}
          className="flex h-full w-8 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100 border-r border-gray-100"
        >
          {expanded ? <ChevronsDown size={14} /> : <ChevronsUp size={14} />}
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
          className="flex h-full w-8 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={handleZoomReset}
          aria-label="Reset zoom"
          title="Reset zoom"
          className="h-full flex-1 text-center font-mono text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          {Math.round(canvasZoom * 100)}%
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label="Zoom in"
          title="Zoom in"
          className="flex h-full w-8 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100 border-l border-gray-100"
        >
          <Plus size={14} />
        </button>
      </div>
      {expanded && (
        <div data-freeform-navigation-minimap-slot="true" className="border-t border-gray-100">
          <FreeformMinimap
            embedded
            rootPosts={rootPosts}
            containerRef={containerRef}
            worldOriginRef={worldOriginRef}
            canvasZoom={canvasZoom}
            panByWorldDelta={panByWorldDelta}
          />
        </div>
      )}
    </div>
  );
}
