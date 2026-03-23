// lib/collabboard/layouts/WallLayout.ts

import type { PadletPosition } from './layout-functions';

/**
 * Wall Layout - Pinterest-style masonry layout
 * Arranges padlets in columns with varying heights for visual interest
 */
export function calculateWallPositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number
): PadletPosition[] {
  const positions: PadletPosition[] = [];
  
  if (count === 0) return positions;

  // Masonry configuration
  const columns = 4;
  const columnWidth = 280;
  const padding = 20;
  const minHeight = 120;
  const maxHeight = 280;
  const cardSpacing = 16;
  
  // Calculate column positions
  const totalPadding = padding * (columns + 1);
  const availableWidth = canvasWidth - totalPadding;
  const actualColumnWidth = Math.min(columnWidth, availableWidth / columns);
  
  const columnXPositions = Array.from({ length: columns }, (_, i) => 
    padding + (i * (actualColumnWidth + padding))
  );

  // Track current height for each column (masonry effect)
  const columnHeights = Array.from({ length: columns }, () => padding);

  // Place padlets in shortest column (Pinterest-style masonry)
  for (let i = 0; i < count; i++) {
    // Find column with smallest height
    const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
    
    // Vary height for visual interest - create some patterns
    const heightOptions = [minHeight, minHeight + 60, minHeight + 120, maxHeight];
    const heightIndex = i % heightOptions.length;
    const cardHeight = heightOptions[heightIndex];
    
    positions.push({
      x: columnXPositions[shortestColumnIndex],
      y: columnHeights[shortestColumnIndex],
      width: actualColumnWidth,
      height: cardHeight
    });

    // Update column height
    columnHeights[shortestColumnIndex] += cardHeight + cardSpacing;
  }

  return positions;
}