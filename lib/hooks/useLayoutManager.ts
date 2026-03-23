import { useState, useCallback, useRef, RefObject, useEffect } from 'react';
import type { LayoutType, LayoutSettings } from '@/types/collabboard';

interface Layout {
  id: LayoutType;
  name: string;
  description: string;
  icon?: string;
}

interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseLayoutManagerResult {
  layoutManager: {
    positions: Position[];
    updatePositions: (updates: Position[]) => void;
  };
  currentLayout: LayoutType;
  currentSettings: LayoutSettings;
  switchLayout: (newLayout: LayoutType) => void;
  updateSettings: (settings: LayoutSettings) => void;
  calculatePositions: (items: any[]) => Position[];
  availableLayouts: Layout[];
}

export function useLayoutManager(
  initialLayout: LayoutType = 'wall',
  containerRef: RefObject<HTMLElement>
): UseLayoutManagerResult {
  const [currentLayout, setCurrentLayout] = useState<LayoutType>(initialLayout);
  const [currentSettings, setCurrentSettings] = useState<LayoutSettings>({
    columns: 3,
    spacing: 16,
    direction: 'horizontal'
  });
  const [positions, setPositions] = useState<Position[]>([]);

  const availableLayouts: Layout[] = [
    {
      id: 'wall',
      name: 'Wall',
      description: 'A scrollable wall of padlets',
      icon: '📜'
    },
    {
      id: 'freeform',
      name: 'Freeform',
      description: 'Freely position padlets anywhere',
      icon: '🎨'
    },
    {
      id: 'grid',
      name: 'Grid',
      description: 'Organized grid layout',
      icon: '📊'
    },
    {
      id: 'columns',
      name: 'Columns',
      description: 'Vertical columns of padlets',
      icon: '📑'
    },
    {
      id: 'timeline',
      name: 'Timeline',
      description: 'Chronological layout',
      icon: '⏱️'
    }
  ];

  const calculatePositions = useCallback((items: any[]): Position[] => {
    if (!items.length) return [];
    
    const container = containerRef.current;
    if (!container) return [];

    const containerWidth = container.clientWidth - 48; // Account for padding
    const baseItemWidth = 280; // Default padlet width
    const baseItemHeight = 250; // Default padlet height
    const gap = currentSettings.spacing || 16;

    switch (currentLayout) {
      case 'grid': {
        const columns = currentSettings.columns || 3;
        const columnWidth = (containerWidth - (gap * (columns - 1))) / columns;
        
        return items.map((_, index) => ({
          x: (index % columns) * (columnWidth + gap),
          y: Math.floor(index / columns) * (baseItemHeight + gap),
          width: columnWidth,
          height: baseItemHeight
        }));
      }

      case 'columns': {
        const columns = currentSettings.columns || 3;
        const columnWidth = (containerWidth - (gap * (columns - 1))) / columns;
        
        return items.map((_, index) => ({
          x: (index % columns) * (columnWidth + gap),
          y: Math.floor(index / columns) * (baseItemHeight + gap / 2),
          width: columnWidth,
          height: baseItemHeight
        }));
      }

      case 'timeline': {
        return items.map((_, index) => ({
          x: 50,
          y: index * (baseItemHeight + gap),
          width: containerWidth - 100,
          height: baseItemHeight
        }));
      }

      case 'freeform':
        // Return existing positions or default positions
        return items.map((item, index) => ({
          x: item.position_x || 50 + (index % 4) * (baseItemWidth + gap),
          y: item.position_y || 50 + Math.floor(index / 4) * (baseItemHeight + gap),
          width: item.width || baseItemWidth,
          height: item.height || baseItemHeight
        }));

      case 'wall':
      default:
        // Wall layout positions are handled by the WallLayout component
        return [];
    }
  }, [currentLayout, currentSettings, containerRef]);

  const switchLayout = useCallback((newLayout: LayoutType) => {
    setCurrentLayout(newLayout);
  }, []);

  const updateSettings = useCallback((settings: LayoutSettings) => {
    setCurrentSettings(prev => ({ ...prev, ...settings }));
  }, []);

  const layoutManager = {
    positions,
    updatePositions: setPositions
  };

  // Recalculate positions when layout or settings change
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        // Add debounce here if needed
        setPositions(prev => calculatePositions(prev));
      });
      
      resizeObserver.observe(containerRef.current);
      
      return () => resizeObserver.disconnect();
    }
  }, [containerRef, calculatePositions]);

  return {
    layoutManager,
    currentLayout,
    currentSettings,
    switchLayout,
    updateSettings,
    calculatePositions,
    availableLayouts
  };
}
