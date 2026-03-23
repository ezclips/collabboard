// lib/collabboard/layouts/index.ts
// Central export file for all layout-related functionality

// Export the main LayoutManager class
export { default as LayoutManager } from './LayoutManager';

// Export the React hook
export { useLayoutManager, default as useLayoutManagerHook } from './useLayoutManager';

// Export individual layout functions
export { calculateWallPositions } from './WallLayout';
export { calculateColumnsPositions } from './ColumnsLayout';
export { calculateGridPositions } from './GridLayout.tsx';
export { calculatePositions as calculateTablePositions } from './TableLayout';
export { calculatePositions as calculateFreeformPositions } from './FreeformLayout';
export { calculatePositions as calculateTimelinePositions } from './timeline-calculations';
export { calculatePositions as calculateStreamPositions } from './StreamLayout';
export { calculateMapPositions } from './MapLayout';

// Export types
export type { LayoutType, PadletPosition } from '../types';

// Re-export everything for convenience
export * from './LayoutManager';
export * from './useLayoutManager';
