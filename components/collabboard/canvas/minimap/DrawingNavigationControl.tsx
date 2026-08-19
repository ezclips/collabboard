"use client";

import React, { useCallback, useState } from 'react';
import { ChevronsDown, ChevronsUp, Minus, Plus } from 'lucide-react';
import DrawingMinimap from './DrawingMinimap';
import type { DrawingMinimapExcalidrawAPI } from './drawingMinimapNavigation';

export interface DrawingNavigationControlProps {
  // Zoom: DrawingLayout's own applyZoom/zoomPercent remain the sole
  // authority. This component only presents the existing handlers/value --
  // same contract ZoomControls already accepted (canvasZoom as a 0-1
  // fraction, zero-argument minus/reset/plus handlers), reused rather than
  // reimplemented.
  canvasZoom: number;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
  handleZoomIn: () => void;
  // Minimap: passed straight through to DrawingMinimap, which continues to
  // own all geometry/projection/pointer math unchanged.
  excalidrawAPI: DrawingMinimapExcalidrawAPI | null | undefined;
}

/**
 * PATCH DRAWING-MINIMAP-C -- single bottom-right navigation control
 * combining the zoom row and the Drawing minimap into one shell, visually
 * matching the (frozen, untouched) FreeformNavigationControl this mirrors.
 * Owns only local expand/collapse UI state; zoom state and minimap
 * geometry/projection both remain owned exactly where they already were
 * (DrawingLayout's applyZoom/zoomPercent, DrawingMinimap's own hooks).
 */
export default function DrawingNavigationControl({
  canvasZoom,
  handleZoomOut,
  handleZoomReset,
  handleZoomIn,
  excalidrawAPI,
}: DrawingNavigationControlProps) {
  const [expanded, setExpanded] = useState(true);

  // Isolates the shell (header background + minimap padding) from the
  // Excalidraw canvas's own pointer/wheel/context-menu handling underneath,
  // mirroring FreeformNavigationControl's own isolateEvent pattern. Buttons
  // inside still receive their own onClick normally -- stopping propagation
  // here only prevents the event from continuing past this shell.
  const isolateEvent = useCallback((event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return (
    <div
      data-drawing-navigation-control="true"
      className="pointer-events-auto absolute bottom-6 right-[var(--drawing-zoom-controls-right,1.5rem)] z-[130] w-[176px] overflow-hidden rounded-lg border border-gray-200 bg-background shadow-md"
      onMouseDown={isolateEvent}
      onClick={isolateEvent}
      onDoubleClick={isolateEvent}
      onWheel={isolateEvent}
      onContextMenu={isolateEvent}
    >
      <div data-drawing-navigation-header="true" className="flex h-9 items-center">
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
        <div data-drawing-navigation-minimap-slot="true" className="border-t border-gray-100">
          <DrawingMinimap embedded excalidrawAPI={excalidrawAPI} />
        </div>
      )}
    </div>
  );
}
