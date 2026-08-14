'use client';

import React, { createContext, useContext } from 'react';

export type CanvasConfigState = {
  canvasZoom: number;
  canvasId: string | undefined;
  isFreeformGraphMode: boolean;
  canUseFreeformEditButton: boolean;
  isColumnsLayout: boolean;
  // PATCH 9S.2: camera gutter (screen px, unscaled) -- see useCanvasCamera.ts.
  // The Freeform world-stage wrapper positions itself at (gutterX, gutterY)
  // instead of (0,0) so native scroll can represent a camera focused
  // anywhere in the world, even near its edges, at any zoom.
  gutterX: number;
  gutterY: number;
};

const CanvasConfigContext = createContext<CanvasConfigState | null>(null);

export function CanvasConfigProvider({
  value,
  children,
}: {
  value: CanvasConfigState;
  children: React.ReactNode;
}) {
  return (
    <CanvasConfigContext.Provider value={value}>
      {children}
    </CanvasConfigContext.Provider>
  );
}

export function useCanvasConfig(): CanvasConfigState {
  const context = useContext(CanvasConfigContext);
  if (!context) {
    throw new Error('useCanvasConfig must be used within a CanvasConfigProvider');
  }
  return context;
}
