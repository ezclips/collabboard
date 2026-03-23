"use client";

import { useCallback, useState } from 'react';

export function useCanvasCamera() {
  const [canvasZoom, setCanvasZoom] = useState(1);
  const handleZoomIn = useCallback(() => setCanvasZoom(z => Math.min(z + 0.1, 3)), []);
  const handleZoomOut = useCallback(() => setCanvasZoom(z => Math.max(z - 0.1, 0.1)), []);
  const handleZoomReset = useCallback(() => setCanvasZoom(1), []);

  return {
    canvasZoom,
    setCanvasZoom,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
  };
}
