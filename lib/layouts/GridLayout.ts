// lib/collabboard/layouts/GridLayout.ts

import type { PadletPosition } from './layout-functions';

/**
 * Grid Layout - Uniform grid arrangement
 * Places all padlets in a clean, evenly-spaced grid
 */
export function calculateGridPositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number
): PadletPosition[] {
  const positions: PadletPosition[] = [];
  
  if (count === 0) return positions;

  // Grid configuration
  const padding = 40;
  const cardSpacing = 20;
  const minCardWidth = 200;
  const minCardHeight = 150;
  
  // Calculate optimal grid dimensions
  const aspectRatio = canvasWidth / (canvasHeight || 600);
  let columns = Math.ceil(Math.sqrt(count * aspectRatio));
  
  // Ensure reasonable limits
  columns = Math.max(1, Math.min(columns, 6));
  const rows = Math.ceil(count / columns);
  
  // Calculate card dimensions
  const availableWidth = canvasWidth - (2 * padding) - ((columns - 1) * cardSpacing);
  const availableHeight = (canvasHeight || 600) - (2 * padding) - ((rows - 1) * cardSpacing);
  
  const cardWidth = Math.max(minCardWidth, availableWidth / columns);
  const cardHeight = Math.max(minCardHeight, Math.min(250, availableHeight / rows));
  
  // Center the grid
  const totalGridWidth = (columns * cardWidth) + ((columns - 1) * cardSpacing);
  const totalGridHeight = (rows * cardHeight) + ((rows - 1) * cardSpacing);
  
  const startX = Math.max(padding, (canvasWidth - totalGridWidth) / 2);
  const startY = Math.max(padding, ((canvasHeight || 600) - totalGridHeight) / 2);

  // Place padlets in grid
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    
    positions.push({
      x: startX + (col * (cardWidth + cardSpacing)),
      y: startY + (row * (cardHeight + cardSpacing)),
      width: cardWidth,
      height: cardHeight
    });
  }

  return positions;
}