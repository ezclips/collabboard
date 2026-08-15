'use client';

import React, { createContext, useContext } from 'react';

export type CanvasConfigState = {
  canvasZoom: number;
  canvasId: string | undefined;
  isFreeformGraphMode: boolean;
  canUseFreeformEditButton: boolean;
  isColumnsLayout: boolean;
  // PATCH 9V.2A: layout-pixel position of logical world (0,0). This includes
  // both the viewport-sized camera gutter and the scaled signed-stage lead-in.
  worldOriginLeft: number;
  worldOriginTop: number;
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
