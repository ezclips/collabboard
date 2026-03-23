// lib/collabboard/layouts/useLayoutManager.ts
import { useState, useEffect, useCallback, RefObject } from 'react';

// Import the actual production layout functions
import { calculateWallPositions } from './WallLayout';
import { calculatePositions as calculateTablePositions } from './TableLayout';
// import { calculateGridPositions } from './GridLayout';
// import { calculateColumnsPositions } from './ColumnsLayout';
// etc. for other layouts

export type LayoutType = 'wall' | 'columns' | 'grid' | 'table' | 'freeform' | 'timeline' | 'stream' | 'map';

export interface PadletPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Convert preview positions to useLayoutManager format
const convertPreviewPosition = (previewPos: { top: number; left: number; width: number; height: number }): PadletPosition => ({
  x: previewPos.left,
  y: previewPos.top,
  width: previewPos.width,
  height: previewPos.height
});

// Production layout calculators using your preview logic
const layoutCalculators = {
  // 🎯 WALL - Simple masonry-style positioning
wall: (count: number, width: number, height: number): PadletPosition[] => {
  const positions: PadletPosition[] = [];
  const itemWidth = 280;
  const itemHeight = 200;
  const gap = 20;
  const columns = Math.floor(width / (itemWidth + gap));
  
  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    
    positions.push({
      x: col * (itemWidth + gap) + gap,
      y: row * (itemHeight + gap) + gap,
      width: itemWidth,
      height: itemHeight
    });
  }
  
  return positions;
},

  // 🎯 TABLE - Using your working TableLayout.tsx logic  
  table: (count: number, width: number, height: number): PadletPosition[] => {
    const previewPositions = calculateTablePositions(count, width, height);
    return (previewPositions as any[]).map(convertPreviewPosition);
  },

  // 🎯 COLUMNS - Temporary simplified version (replace with your ColumnsLayout.tsx when ready)
  columns: (count: number, width: number, height: number): PadletPosition[] => {
    const columnCount = 3;
    const columnWidth = Math.floor(width / columnCount) - 20;
    const itemHeight = 150;
    
    return Array.from({ length: count }, (_, i) => {
      const column = i % columnCount;
      const itemsInColumn = Math.floor(i / columnCount);
      
      return {
        x: column * (columnWidth + 20) + 10,
        y: itemsInColumn * (itemHeight + 15) + 10,
        width: columnWidth,
        height: itemHeight
      };
    });
  },

  // 🎯 GRID - Temporary simplified version (replace with your GridLayout.tsx when ready)
  grid: (count: number, width: number, height: number): PadletPosition[] => {
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const itemWidth = Math.floor((width - 40) / cols);
    const itemHeight = Math.floor((height - 40) / rows);
    
    return Array.from({ length: count }, (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      
      return {
        x: col * itemWidth + 20,
        y: row * itemHeight + 20,
        width: Math.max(itemWidth - 10, 150),
        height: Math.max(itemHeight - 10, 120)
      };
    });
  },

  // 🎯 FREEFORM - Random positioning
  freeform: (count: number, width: number, height: number): PadletPosition[] => {
    return Array.from({ length: count }, (_, i) => ({
      x: Math.random() * (width - 250) + 20,
      y: Math.random() * (height - 180) + 20,
      width: 250,
      height: 180
    }));
  },

  // 🎯 TIMELINE - Alternating timeline
  timeline: (count: number, width: number, height: number): PadletPosition[] => {
    const itemWidth = 280;
    const itemHeight = 200;
    const timelineY = height / 2;
    const spacing = Math.max(60, (width - 100) / Math.max(count, 1));
    
    return Array.from({ length: count }, (_, i) => {
      const isTop = i % 2 === 0;
      return {
        x: 50 + i * spacing,
        y: isTop ? timelineY - itemHeight - 40 : timelineY + 40,
        width: itemWidth,
        height: itemHeight
      };
    });
  },

  // 🎯 STREAM - Vertical stream
  stream: (count: number, width: number, height: number): PadletPosition[] => {
    const itemWidth = Math.min(600, width - 100);
    const itemHeight = 200;
    const x = (width - itemWidth) / 2;
    
    return Array.from({ length: count }, (_, i) => ({
      x,
      y: 20 + i * (itemHeight + 15),
      width: itemWidth,
      height: itemHeight
    }));
  },

  // 🎯 MAP - Radial arrangement
  map: (count: number, width: number, height: number): PadletPosition[] => {
    const centerX = width / 2;
    const centerY = height / 2;
    const itemWidth = 220;
    const itemHeight = 160;
    
    if (count === 1) {
      return [{
        x: centerX - itemWidth / 2,
        y: centerY - itemHeight / 2,
        width: itemWidth,
        height: itemHeight
      }];
    }
    
    return Array.from({ length: count }, (_, i) => {
      if (i === 0) {
        return {
          x: centerX - itemWidth / 2,
          y: centerY - itemHeight / 2,
          width: itemWidth,
          height: itemHeight
        };
      }
      
      const angle = (2 * Math.PI * (i - 1)) / (count - 1);
      const radius = 200;
      
      return {
        x: centerX + radius * Math.cos(angle) - itemWidth / 2,
        y: centerY + radius * Math.sin(angle) - itemHeight / 2,
        width: itemWidth,
        height: itemHeight
      };
    });
  }
};

/**
 * React hook for managing canvas layouts
 */
export function useLayoutManager(
  initialLayout: LayoutType = 'wall',
  containerRef?: RefObject<HTMLElement>
) {
  const [currentLayout, setCurrentLayout] = useState<LayoutType>(initialLayout);
  const [currentSettings, setCurrentSettings] = useState<Record<string, any>>({});
  const [containerDimensions, setContainerDimensions] = useState({
    width: 1200,
    height: 800
  });
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableLayouts = Object.keys(layoutCalculators).map(id => ({
    id: id as LayoutType,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    description: `${id.charAt(0).toUpperCase() + id.slice(1)} layout`
  }));

  // Update container dimensions from ref
  const updateDimensions = useCallback(() => {
    if (containerRef?.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newDimensions = {
        width: rect.width || 1200,
        height: rect.height || 800
      };
      
      // Only update if dimensions actually changed
      setContainerDimensions(prev => {
        if (prev.width !== newDimensions.width || prev.height !== newDimensions.height) {
          return newDimensions;
        }
        return prev;
      });
    }
  }, []);

  // Set up resize observer
  useEffect(() => {
    if (!containerRef?.current) return;

    updateDimensions();
    
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [containerRef, updateDimensions]);

  // Calculate positions function using production preview logic
  const calculatePositions = useCallback((
    padlets: any[]
  ): PadletPosition[] => {
    const itemCount = Array.isArray(padlets) ? padlets.length : 0;
    
    setIsCalculating(true);
    setError(null);

    try {
      console.log(`🎯 Using production ${currentLayout} layout for ${itemCount} items`);

      const layoutFn = layoutCalculators[currentLayout];
      
      if (!layoutFn || typeof layoutFn !== 'function') {
        throw new Error(`Layout function for '${currentLayout}' not found`);
      }

      const positions = layoutFn(
        itemCount,
        containerDimensions.width,
        containerDimensions.height
      );

      console.log(`✅ Generated ${positions.length} positions using production ${currentLayout} logic`);
      
      // Validate all positions are positive and reasonable
      const validatedPositions = positions.map(pos => ({
        x: Math.max(0, pos.x),
        y: Math.max(0, pos.y),
        width: Math.max(150, pos.width),
        height: Math.max(120, pos.height)
      }));

      return validatedPositions;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown layout calculation error';
      console.error(`❌ Production layout calculation failed for ${currentLayout}:`, err);
      setError(errorMessage);
      
      // Return fallback positions to prevent crashes
      return Array.from({ length: itemCount }, (_, i) => ({
        x: (i % 3) * 200 + 20,
        y: Math.floor(i / 3) * 150 + 20,
        width: 180,
        height: 130
      }));
      
    } finally {
      setIsCalculating(false);
    }
  }, [currentLayout]); // Removed containerDimensions dependency to prevent loops

  // Switch layout function
  const switchLayout = useCallback((newLayout: LayoutType) => {
    console.log(`🔄 Switching to production ${newLayout} layout`);
    
    const supportedLayouts = availableLayouts.map(l => l.id);
    if (!supportedLayouts.includes(newLayout)) {
      const errorMsg = `Layout '${newLayout}' is not supported`;
      console.warn(`⚠️ ${errorMsg}`);
      setError(errorMsg);
      return;
    }

    setCurrentLayout(newLayout);
    setError(null);
  }, [currentLayout, availableLayouts]);

  // Update settings function
  const updateSettings = useCallback((newSettings: Record<string, any>) => {
    setCurrentSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  // Check if layout is supported
  const isLayoutSupported = useCallback((layout: LayoutType) => {
    return availableLayouts.some(l => l.id === layout);
  }, [availableLayouts]);

  // Layout manager object for compatibility
  const layoutManager = {
    calculatePositions,
    currentLayout,
    containerDimensions,
    isCalculating,
    error
  };

  return {
    layoutManager,
    calculatePositions,
    availableLayouts,
    isLayoutSupported,
    switchLayout,
    updateSettings,
    currentLayout,
    currentSettings,
    containerDimensions,
    isCalculating,
    error
  };
}

export default useLayoutManager;