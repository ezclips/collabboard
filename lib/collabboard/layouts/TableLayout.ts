// lib/collabboard/layouts/TableLayout.ts
import { PadletPosition } from '../types';

/**
 * Table Layout - Tabular data presentation
 * Arranges padlets in a table format with consistent rows and columns
 */
export function calculatePositions(
  count: number,
  containerWidth: number,
  containerHeight: number,
  existingPositions?: PadletPosition[]
): PadletPosition[] {
  if (count === 0) return [];

  // Table configuration
  const cols = 4;
  const padding = 20;
  const headerHeight = 80; // Increased to account for your header
  const rowHeight = 180;
  const columnSpacing = 10;
  const rowSpacing = 10;

  // Calculate column width
  const availableWidth = containerWidth - (padding * 2) - (columnSpacing * (cols - 1));
  const colWidth = Math.max(Math.floor(availableWidth / cols), 250); // Minimum width of 250px

  const positions: PadletPosition[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    
    const x = padding + col * (colWidth + columnSpacing);
    const y = headerHeight + padding + row * (rowHeight + rowSpacing); // FIXED: Ensure positive Y
    
    positions.push({
      x,
      y,
      width: colWidth,
      height: rowHeight,
    });
  }

  return positions;
}

/**
 * Calculate table dimensions
 */
export function getTableDimensions(
  count: number,
  containerWidth: number,
  cols: number = 4
) {
  const actualCols = Math.min(cols, count);
  const rows = Math.ceil(count / actualCols);
  const headerHeight = 80;
  const rowHeight = 180;
  const padding = 20;
  const columnSpacing = 10;
  const rowSpacing = 10;

  const availableWidth = containerWidth - (padding * 2) - (columnSpacing * (actualCols - 1));
  const colWidth = Math.max(Math.floor(availableWidth / actualCols), 250);
  const totalHeight = headerHeight + (padding * 2) + (rows * rowHeight) + ((rows - 1) * rowSpacing);

  return {
    cols: actualCols,
    rows,
    colWidth,
    rowHeight,
    headerHeight,
    totalHeight,
  };
}

/**
 * Get cell position in table
 */
export function getCellPosition(
  index: number,
  cols: number,
  colWidth: number,
  rowHeight: number,
  headerHeight: number = 80,
  padding: number = 20,
  columnSpacing: number = 10,
  rowSpacing: number = 10
) {
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  return {
    x: padding + col * (colWidth + columnSpacing),
    y: headerHeight + padding + row * (rowHeight + rowSpacing), // FIXED: Ensure positive Y
    width: colWidth,
    height: rowHeight,
  };
}

/**
 * Generate table headers (for display purposes)
 */
export function generateTableHeaders(cols: number): string[] {
  const headers = [];
  for (let i = 0; i < cols; i++) {
    headers.push(`Column ${String.fromCharCode(65 + i)}`); // A, B, C, D...
  }
  return headers;
}

/**
 * Utility function to convert between coordinate systems if needed
 */
export function convertToTopLeftFormat(positions: PadletPosition[]): Array<{top: number, left: number, width: number, height: number}> {
  return positions.map(pos => ({
    top: pos.y,
    left: pos.x,
    width: pos.width,
    height: pos.height
  }));
}