'use client';

import React, { createContext, useContext } from 'react';

export type CanvasConfigState = {
  canvasZoom: number;
  canvasId: string | undefined;
  isFreeformGraphMode: boolean;
  canUseFreeformEditButton: boolean;
  isColumnsLayout: boolean;
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
