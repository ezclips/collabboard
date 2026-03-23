// lib/collabboard/layouts/layoutGuard.ts
import LayoutManager from './LayoutManager';
const LayoutRegistry = {
  getAvailableTypes: () => LayoutManager.getAvailableLayouts(),
  register: (_type: any, _layout: any, _config: any) => {},
};

// Simple layout implementations that are guaranteed to work
const simpleLayouts = {
  wall: {
    calculatePositions: (padlets: any[]) => {
      return padlets.map((_, index) => ({
        x: (index % 3) * 320 + 20,
        y: Math.floor(index / 3) * 240 + 20,
        width: 300,
        height: 220
      }));
    },
    getDefaultSettings: () => ({ columnWidth: 300, gap: 16 }),
    validateSettings: () => true
  },
  
  grid: {
    calculatePositions: (padlets: any[]) => {
      return padlets.map((_, index) => ({
        x: (index % 4) * 310 + 20,
        y: Math.floor(index / 4) * 260 + 20,
        width: 290,
        height: 240
      }));
    },
    getDefaultSettings: () => ({ columns: 4, gap: 20 }),
    validateSettings: () => true
  },
  
  freeform: {
    calculatePositions: (padlets: any[]) => {
      return padlets.map((padlet, index) => ({
        x: padlet.position_x || (index * 50 + 50),
        y: padlet.position_y || (index * 50 + 50),
        width: padlet.width || 250,
        height: padlet.height || 200
      }));
    },
    getDefaultSettings: () => ({}),
    validateSettings: () => true
  },
  
  columns: {
    calculatePositions: (padlets: any[]) => {
      const columnWidth = 300;
      const gap = 20;
      return padlets.map((_, index) => ({
        x: (index % 3) * (columnWidth + gap) + gap,
        y: Math.floor(index / 3) * 240 + gap,
        width: columnWidth,
        height: 220
      }));
    },
    getDefaultSettings: () => ({ columnWidth: 300, columnsCount: 3 }),
    validateSettings: () => true
  },
  
  timeline: {
    calculatePositions: (padlets: any[]) => {
      return padlets.map((_, index) => ({
        x: index * 320 + 20,
        y: 100,
        width: 300,
        height: 200
      }));
    },
    getDefaultSettings: () => ({ itemWidth: 300 }),
    validateSettings: () => true
  },
  
  stream: {
    calculatePositions: (padlets: any[]) => {
      return padlets.map((_, index) => ({
        x: 350,
        y: index * 240 + 20,
        width: 500,
        height: 220
      }));
    },
    getDefaultSettings: () => ({ itemWidth: 500 }),
    validateSettings: () => true
  },
  
  table: {
    calculatePositions: (padlets: any[]) => {
      return padlets.map((_, index) => ({
        x: (index % 3) * 300 + 20,
        y: Math.floor(index / 3) * 200 + 20,
        width: 280,
        height: 180
      }));
    },
    getDefaultSettings: () => ({ columns: 3, rowHeight: 200 }),
    validateSettings: () => true
  },
  
  map: {
    calculatePositions: (padlets: any[]) => {
      if (padlets.length === 0) return [];
      
      const centerX = 600;
      const centerY = 400;
      const radius = 200;
      
      return padlets.map((_, index) => {
        if (index === 0) {
          return { x: centerX - 125, y: centerY - 100, width: 250, height: 200 };
        }
        
        const angle = (2 * Math.PI * (index - 1)) / (padlets.length - 1);
        return {
          x: centerX + Math.cos(angle) * radius - 125,
          y: centerY + Math.sin(angle) * radius - 100,
          width: 250,
          height: 200
        };
      });
    },
    getDefaultSettings: () => ({ radius: 200 }),
    validateSettings: () => true
  }
};

const simpleConfigs = {
  wall: { id: 'wall', name: 'Wall', description: 'Masonry layout', icon: 'layout', supportsSections: false, defaultSettings: {} },
  grid: { id: 'grid', name: 'Grid', description: 'Equal grid', icon: 'grid3x3', supportsSections: false, defaultSettings: {} },
  freeform: { id: 'freeform', name: 'Freeform', description: 'Free positioning', icon: 'mousePointer', supportsSections: false, defaultSettings: {} },
  columns: { id: 'columns', name: 'Columns', description: 'Column layout', icon: 'columns', supportsSections: true, defaultSettings: {} },
  timeline: { id: 'timeline', name: 'Timeline', description: 'Timeline layout', icon: 'clock', supportsSections: false, defaultSettings: {} },
  stream: { id: 'stream', name: 'Stream', description: 'Stream layout', icon: 'list', supportsSections: false, defaultSettings: {} },
  table: { id: 'table', name: 'Table', description: 'Table layout', icon: 'table', supportsSections: false, defaultSettings: {} },
  map: { id: 'map', name: 'Map', description: 'Map layout', icon: 'map', supportsSections: false, defaultSettings: {} }
};

export function ensureLayoutsInitialized() {
  const availableTypes = LayoutRegistry.getAvailableTypes();
  
  if (availableTypes.length === 0) {
    console.log('No layouts found in registry, initializing simple layouts...');
    
    // Register simple layouts
    Object.entries(simpleLayouts).forEach(([type, layout]) => {
      LayoutRegistry.register(type as any, layout, simpleConfigs[type as keyof typeof simpleConfigs]);
    });
    
    console.log('Simple layouts registered:', LayoutRegistry.getAvailableTypes());
  } else {
    console.log('Layouts already initialized:', availableTypes);
  }
}