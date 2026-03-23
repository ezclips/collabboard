// lib/collabboard/layouts/TableLayout.ts

import type { PadletPosition } from './layout-functions';

/**
 * Table Layout - Spreadsheet-style rows and columns
 * Arranges padlets in a structured table format
 */
export function calculateTablePositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number
): PadletPosition[] {
  const positions: PadletPosition[] = [];
  
  if (count === 0) return positions;

  // Table configuration
  const headerHeight = 50;
  const rowHeight = 70;
  const padding = 30;
  const rowSpacing = 4;
  
  // Calculate available space
  const availableWidth = canvasWidth - (2 * padding);
  
  // Calculate starting position
  const startX = padding;
  const startY = padding + headerHeight + 20; // Space for header

  // Place padlets as table rows (full width rows)
  for (let i = 0; i < count; i++) {
    const yPosition = startY + (i * (rowHeight + rowSpacing));
    
    positions.push({
      x: startX,
      y: yPosition,
      width: availableWidth,
      height: rowHeight
    });
  }

  return positions;
}