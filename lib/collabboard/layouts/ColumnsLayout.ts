// lib/collabboard/layouts/ColumnsLayout.ts

import type { PadletPosition } from '../types';

/**
 * Columns Layout - Arranges padlets in vertical columns (Kanban-style)
 * ✅ Now uses actual padlet heights instead of fixed heights
 */
export function calculateColumnsLayout(
  padlets: any[], // ✅ Changed from count to actual padlets
  canvasWidth: number,
  settings: Record<string, any> = {}
): PadletPosition[] {
  const positions: PadletPosition[] = [];
  
  if (!padlets || padlets.length === 0) return positions;

  // Column configuration
  const columns = settings.columns || 3;
  const columnWidth = settings.columnWidth || 320;
  const columnSpacing = settings.columnSpacing || 40;
  const headerHeight = 60;
  const padletSpacing = 16;
  const padding = 20;
  
  // Calculate starting positions for each column
  const totalColumnsWidth = (columns * columnWidth) + ((columns - 1) * columnSpacing);
  const startX = Math.max(padding, (canvasWidth - totalColumnsWidth) / 2);
  
  const columnXPositions = Array.from({ length: columns }, (_, i) => 
    startX + (i * (columnWidth + columnSpacing))
  );

  // Track current Y position for each column
  const columnYPositions = Array.from({ length: columns }, () => headerHeight + 20);

  // ✅ Distribute padlets across columns using actual padlet data
  padlets.forEach((padlet, i) => {
    const columnIndex = i % columns;
    
    // ✅ Use actual padlet height instead of fixed height
    const actualHeight = padlet.height || 140; // Fallback to 140 if no height
    
    positions.push({
      x: columnXPositions[columnIndex] + 8, // Add small padding
      y: columnYPositions[columnIndex],
      width: columnWidth - 16, // Account for padding
      height: actualHeight // ✅ Use actual height!
    });

    // ✅ Update Y position using actual height
    columnYPositions[columnIndex] += actualHeight + padletSpacing;
  });

  console.log(`📋 Columns Layout: Generated ${positions.length} positions`);
  positions.forEach((pos, i) => {
    console.log(`  Column Padlet ${i}: ${pos.width}x${pos.height} at (${pos.x}, ${pos.y})`);
  });

  return positions;

}

// ✅ Keep the old function for backward compatibility
export function calculateColumnsPositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number
): PadletPosition[] {
  // Create dummy padlets for the old function
  const dummyPadlets = Array.from({ length: count }, (_, i) => ({
    id: i.toString(),
    height: 140, // Default height
    width: 300
  }));
  
  return calculateColumnsLayout(dummyPadlets, canvasWidth);
}