// lib/collabboard/layouts/ColumnsLayout.ts

import type { PadletPosition } from './layout-functions';

/**
 * Columns Layout - Arranges padlets in vertical columns (Kanban-style)
 * Creates 3 columns: "To Do", "In Progress", "Done"
 */
export function calculateColumnsPositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number
): PadletPosition[] {
  const positions: PadletPosition[] = [];
  
  if (count === 0) return positions;

  // Column configuration
  const columns = 3;
  const columnWidth = 320;
  const columnSpacing = 40;
  const headerHeight = 60;
  const padletHeight = 140;
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

  // Distribute padlets across columns evenly
  for (let i = 0; i < count; i++) {
    const columnIndex = i % columns;
    
    positions.push({
      x: columnXPositions[columnIndex] + 8, // Add small padding
      y: columnYPositions[columnIndex],
      width: columnWidth - 16, // Account for padding
      height: padletHeight
    });

    // Update Y position for next padlet in this column
    columnYPositions[columnIndex] += padletHeight + padletSpacing;
  }

  return positions;
}