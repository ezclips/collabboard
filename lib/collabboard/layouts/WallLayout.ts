// lib/collabboard/layouts/WallLayout.ts

import type { PadletPosition } from '../types';

/**
 * Wall Layout - Pinterest-style masonry layout
 * ✅ Now uses actual padlet heights instead of random heights
 */
export function calculateWallLayout(
  padlets: any[], // ✅ Changed from count to actual padlets
  canvasWidth: number,
  settings: Record<string, any> = {}
): PadletPosition[] {
  const positions: PadletPosition[] = [];
  
  if (!padlets || padlets.length === 0) return positions;

  // Masonry configuration
  const columns = settings.columns || 4;
  const columnWidth = settings.columnWidth || 280;
  const padding = 20;
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

  // ✅ Place padlets using actual heights
  padlets.forEach((padlet, i) => {
    // Find column with smallest height
    const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
    
    // ✅ Use actual padlet height instead of random height
    const actualHeight = padlet.height || 200; // Fallback to 200 if no height
    
    positions.push({
      x: columnXPositions[shortestColumnIndex],
      y: columnHeights[shortestColumnIndex],
      width: actualColumnWidth,
      height: actualHeight // ✅ Use actual height!
    });

    // ✅ Update column height using actual height
    columnHeights[shortestColumnIndex] += actualHeight + cardSpacing;
  });

  console.log(`🧱 Wall Layout: Generated ${positions.length} positions`);
  positions.forEach((pos, i) => {
    console.log(`  Wall Padlet ${i}: ${pos.width}x${pos.height} at (${pos.x}, ${pos.y})`);
  });

  return positions;
}

// ✅ Keep the old function for backward compatibility
export function calculateWallPositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number
): PadletPosition[] {
  // Create dummy padlets for the old function
  const dummyPadlets = Array.from({ length: count }, (_, i) => ({
    id: i.toString(),
    height: 200, // Default height
    width: 280
  }));
  
  return calculateWallLayout(dummyPadlets, canvasWidth);
}