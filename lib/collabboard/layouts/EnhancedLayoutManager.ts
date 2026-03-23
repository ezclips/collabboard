// lib/collabboard/layouts/EnhancedLayoutManager.ts

import { PadletPosition } from '../types';

interface Padlet {
  id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  [key: string]: any;
}

// ✅ Enhanced Wall Layout - Respects individual padlet heights
export function calculateWallLayout(
  padlets: Padlet[], 
  containerWidth: number = 800,
  settings: Record<string, any> = {}
): PadletPosition[] {
  const columnWidth = settings.columnWidth || 300;
  const gap = settings.gap || 20;
  const padding = 20;
  
  const availableWidth = containerWidth - (padding * 2);
  const columns = Math.max(1, Math.floor((availableWidth + gap) / (columnWidth + gap)));
  
  // Track the current height of each column
  const columnHeights: number[] = new Array(columns).fill(padding);
  
  return padlets.map((padlet, index) => {
    // Find the shortest column
    const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
    
    const x = padding + (shortestColumnIndex * (columnWidth + gap));
    const y = columnHeights[shortestColumnIndex];
    
    // ✅ Use padlet's actual dimensions, but constrain width to column
    const width = Math.min(padlet.width || columnWidth, columnWidth);
    const height = padlet.height || 200; // Use actual height!
    
    // Update column height
    columnHeights[shortestColumnIndex] += height + gap;
    
    console.log(`Wall Layout - Padlet ${index}: ${width}x${height} at (${x}, ${y})`);
    
    return { x, y, width, height };
  });
}

// ✅ Enhanced Grid Layout - Maintains aspect ratios
export function calculateGridLayout(
  padlets: Padlet[], 
  containerWidth: number = 800,
  settings: Record<string, any> = {}
): PadletPosition[] {
  const columns = settings.columns || Math.max(1, Math.floor(containerWidth / 320));
  const gap = settings.gap || 20;
  const padding = 20;
  
  const availableWidth = containerWidth - (padding * 2) - ((columns - 1) * gap);
  const columnWidth = availableWidth / columns;
  
  return padlets.map((padlet, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    
    const x = padding + (col * (columnWidth + gap));
    
    // ✅ Calculate y position by summing heights of padlets above
    let y = padding;
    for (let i = row * columns + col; i > 0; i -= columns) {
      const prevPadletIndex = i - columns;
      if (prevPadletIndex >= 0 && prevPadletIndex < index) {
        y += (padlets[prevPadletIndex]?.height || 200) + gap;
      }
    }
    
    // ✅ Use actual dimensions but fit to grid
    const width = columnWidth;
    const height = padlet.height || 200; // Preserve original height!
    
    console.log(`Grid Layout - Padlet ${index}: ${width}x${height} at (${x}, ${y})`);
    
    return { x, y, width, height };
  });
}

// ✅ Enhanced Columns Layout - Natural heights in columns
export function calculateColumnsLayout(
  padlets: Padlet[], 
  containerWidth: number = 800,
  settings: Record<string, any> = {}
): PadletPosition[] {
  const columnWidth = settings.columnWidth || 300;
  const gap = settings.gap || 20;
  const padding = 20;
  
  const availableWidth = containerWidth - (padding * 2);
  const columns = Math.max(1, Math.floor((availableWidth + gap) / (columnWidth + gap)));
  
  // Track column heights to stack padlets naturally
  const columnHeights: number[] = new Array(columns).fill(padding + 60); // Extra space for column headers
  
  return padlets.map((padlet, index) => {
    // Distribute padlets across columns (round-robin)
    const columnIndex = index % columns;
    
    const x = padding + (columnIndex * (columnWidth + gap));
    const y = columnHeights[columnIndex];
    
    // ✅ Use padlet's actual dimensions
    const width = Math.min(padlet.width || columnWidth - 20, columnWidth - 20);
    const height = padlet.height || 200; // Keep original height!
    
    // Update column height for next padlet
    columnHeights[columnIndex] += height + gap;
    
    console.log(`Columns Layout - Padlet ${index}: ${width}x${height} at (${x}, ${y})`);
    
    return { x, y, width, height };
  });
}

// ✅ Timeline Layout - Horizontal flow with natural heights
export function calculateTimelineLayout(
  padlets: Padlet[], 
  containerWidth: number = 800,
  settings: Record<string, any> = {}
): PadletPosition[] {
  const timelineHeight = settings.timelineHeight || 200;
  const gap = settings.gap || 30;
  const padding = 20;
  
  let currentX = padding;
  
  return padlets.map((padlet, index) => {
    const x = currentX;
    const y = padding + (index % 2) * (timelineHeight + gap); // Alternate top/bottom
    
    // ✅ Use actual padlet dimensions
    const width = padlet.width || 280;
    const height = padlet.height || timelineHeight;
    
    // Move X position for next padlet
    currentX += width + gap;
    
    console.log(`Timeline Layout - Padlet ${index}: ${width}x${height} at (${x}, ${y})`);
    
    return { x, y, width, height };
  });
}

// ✅ Stream Layout - Vertical flow with natural widths
export function calculateStreamLayout(
  padlets: Padlet[], 
  containerWidth: number = 800,
  settings: Record<string, any> = {}
): PadletPosition[] {
  const streamWidth = settings.streamWidth || Math.min(600, containerWidth - 40);
  const gap = settings.gap || 20;
  const padding = 20;
  
  let currentY = padding;
  const centerX = (containerWidth - streamWidth) / 2;
  
  return padlets.map((padlet, index) => {
    const x = centerX;
    const y = currentY;
    
    // ✅ Use actual padlet dimensions, but constrain width to stream
    const width = Math.min(padlet.width || streamWidth, streamWidth);
    const height = padlet.height || 200; // Preserve original height!
    
    // Move Y position for next padlet
    currentY += height + gap;
    
    console.log(`Stream Layout - Padlet ${index}: ${width}x${height} at (${x}, ${y})`);
    
    return { x, y, width, height };
  });
}

// ✅ Table Layout - Tabular with consistent widths but natural heights
export function calculateTableLayout(
  padlets: Padlet[], 
  containerWidth: number = 800,
  settings: Record<string, any> = {}
): PadletPosition[] {
  const columns = settings.columns || 3;
  const gap = settings.gap || 2;
  const padding = 20;
  
  const availableWidth = containerWidth - (padding * 2) - ((columns - 1) * gap);
  const columnWidth = availableWidth / columns;
  
  // Track row heights (each row can have different height based on tallest item)
  const rowHeights: number[] = [];
  
  return padlets.map((padlet, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    
    const x = padding + (col * (columnWidth + gap));
    
    // ✅ Calculate y position by summing previous row heights
    let y = padding;
    for (let r = 0; r < row; r++) {
      y += (rowHeights[r] || 200) + gap;
    }
    
    // ✅ Use actual dimensions
    const width = columnWidth;
    const height = padlet.height || 200; // Keep original height!
    
    // Track maximum height in this row
    if (!rowHeights[row] || height > rowHeights[row]) {
      rowHeights[row] = height;
    }
    
    console.log(`Table Layout - Padlet ${index}: ${width}x${height} at (${x}, ${y})`);
    
    return { x, y, width, height };
  });
}

// ✅ Freeform Layout - Complete freedom (already works)
export function calculateFreeformLayout(
  padlets: Padlet[], 
  containerWidth: number = 800,
  settings: Record<string, any> = {}
): PadletPosition[] {
  return padlets.map((padlet, index) => {
    // ✅ Use exact padlet dimensions and positions
    const x = padlet.position_x || 50 + (index * 20);
    const y = padlet.position_y || 50 + (index * 20);
    const width = padlet.width || 280;
    const height = padlet.height || 200;
    
    console.log(`Freeform Layout - Padlet ${index}: ${width}x${height} at (${x}, ${y})`);
    
    return { x, y, width, height };
  });
}

// ✅ Map Layout - Scattered positioning with natural sizes
export function calculateMapLayout(
  padlets: Padlet[], 
  containerWidth: number = 800,
  settings: Record<string, any> = {}
): PadletPosition[] {
  const centerX = containerWidth / 2;
  const centerY = 300; // Assume container height
  const radius = settings.radius || 200;
  
  return padlets.map((padlet, index) => {
    const angle = (index / padlets.length) * 2 * Math.PI;
    const x = centerX + Math.cos(angle) * radius - (padlet.width || 280) / 2;
    const y = centerY + Math.sin(angle) * radius - (padlet.height || 200) / 2;
    
    // ✅ Use actual padlet dimensions
    const width = padlet.width || 280;
    const height = padlet.height || 200;
    
    console.log(`Map Layout - Padlet ${index}: ${width}x${height} at (${x}, ${y})`);
    
    return { x, y, width, height };
  });
}

// ✅ Layout Manager with enhanced functions
export const LAYOUT_FUNCTIONS = {
  wall: calculateWallLayout,
  grid: calculateGridLayout,
  columns: calculateColumnsLayout,
  timeline: calculateTimelineLayout,
  stream: calculateStreamLayout,
  table: calculateTableLayout,
  freeform: calculateFreeformLayout,
  map: calculateMapLayout,
};

export type LayoutType = keyof typeof LAYOUT_FUNCTIONS;