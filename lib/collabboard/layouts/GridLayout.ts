// lib/collabboard/layouts/LayoutManager.ts
import { LayoutType, PadletPosition } from '../types';

// Import all layout functions
import { calculatePositions as calculateWallPositions } from './WallLayout';
import { calculatePositions as calculateColumnsPositions } from './ColumnsLayout';
import { calculatePositions as calculateGridPositions } from './GridLayout';
import { calculatePositions as calculateTablePositions } from './TableLayout';
import { calculatePositions as calculateFreeformPositions } from './FreeformLayout';
import { calculatePositions as calculateTimelinePositions } from './timeline-calculations';
import { calculatePositions as calculateStreamPositions } from './StreamLayout';
import { calculatePositions as calculateMapPositions } from './MapLayout';

// Type definition for layout calculation function
type CalculatePositionsFunction = (
  count: number,
  containerWidth: number,
  containerHeight: number,
  existingPositions?: PadletPosition[]
) => PadletPosition[];

// Layout function registry with proper error handling
const layoutFunctions: Record<LayoutType, CalculatePositionsFunction> = {
  wall: calculateWallPositions,
  columns: calculateColumnsPositions,
  grid: calculateGridPositions,
  table: calculateTablePositions,
  freeform: calculateFreeformPositions,
  timeline: calculateTimelinePositions,
  stream: calculateStreamPositions,
  map: calculateMapPositions,
};

// Default fallback function for missing layouts
const defaultCalculatePositions: CalculatePositionsFunction = (
  count: number,
  containerWidth: number,
  containerHeight: number
) => {
  console.warn(`Layout function not implemented, using default grid layout`);
  
  // Simple grid fallback
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const itemWidth = Math.floor(containerWidth / cols) - 20;
  const itemHeight = Math.floor(containerHeight / rows) - 20;
  
  return Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    
    return {
      x: col * (itemWidth + 20) + 10,
      y: row * (itemHeight + 20) + 10,
      width: itemWidth,
      height: itemHeight,
    };
  });
};

export class LayoutManager {
  /**
   * Calculate positions for padlets based on layout type
   */
  static calculatePositions(
    layoutType: LayoutType,
    count: number,
    containerWidth: number,
    containerHeight: number,
    existingPositions?: PadletPosition[]
  ): PadletPosition[] {
    try {
      const calculateFn = layoutFunctions[layoutType];
      
      if (!calculateFn || typeof calculateFn !== 'function') {
        console.warn(`Layout function for '${layoutType}' not found or not a function, using default`);
        return defaultCalculatePositions(count, containerWidth, containerHeight, existingPositions);
      }
      
      return calculateFn(count, containerWidth, containerHeight, existingPositions);
    } catch (error) {
      console.error(`Error calculating positions for layout '${layoutType}':`, error);
      return defaultCalculatePositions(count, containerWidth, containerHeight, existingPositions);
    }
  }

  /**
   * Get available layout types
   */
  static getAvailableLayouts(): LayoutType[] {
    return Object.keys(layoutFunctions) as LayoutType[];
  }

  /**
   * Check if a layout is implemented
   */
  static isLayoutImplemented(layoutType: LayoutType): boolean {
    const fn = layoutFunctions[layoutType];
    return fn && typeof fn === 'function';
  }

  /**
   * Get layout display name
   */
  static getLayoutDisplayName(layoutType: LayoutType): string {
    const displayNames: Record<LayoutType, string> = {
      wall: 'Wall',
      columns: 'Columns',
      grid: 'Grid',
      table: 'Table',
      freeform: 'Freeform',
      timeline: 'Timeline',
      stream: 'Stream',
      map: 'Map',
    };
    
    return displayNames[layoutType] || layoutType;
  }

  /**
   * Get layout description
   */
  static getLayoutDescription(layoutType: LayoutType): string {
    const descriptions: Record<LayoutType, string> = {
      wall: 'Brick-like masonry arrangement',
      columns: 'Drag & drop columns (like Trello)',
      grid: 'Equal-sized grid arrangement',
      table: 'Tabular data presentation',
      freeform: 'Free positioning anywhere',
      timeline: 'Horizontal chronological layout',
      stream: 'Vertical list/feed layout',
      map: 'Geographic or mind-map positioning',
    };
    
    return descriptions[layoutType] || 'Custom layout';
  }
}

// Export individual functions for direct use
export {
  calculateWallPositions,
  calculateColumnsPositions,
  calculateGridPositions,
  calculateTablePositions,
  calculateFreeformPositions,
  calculateTimelinePositions,
  calculateStreamPositions,
  calculateMapPositions,
};

// Export the class as default
export default LayoutManager;