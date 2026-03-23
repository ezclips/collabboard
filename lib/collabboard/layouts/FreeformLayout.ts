// lib/collabboard/layouts/FreeformLayout.ts
import { PadletPosition } from '../types';

/**
 * Freeform Layout - Free positioning anywhere
 * Maintains user-defined positions or places items randomly if no existing positions
 */
export function calculatePositions(
  count: number,
  containerWidth: number,
  containerHeight: number,
  existingPositions?: PadletPosition[]
): PadletPosition[] {
  if (count === 0) return [];

  // Only use existing positions, fallback to (0,0) if missing
  const defaultWidth = 250;
  const defaultHeight = 180;
  const positions: PadletPosition[] = [];

  for (let i = 0; i < count; i++) {
    if (existingPositions && existingPositions[i]) {
      positions.push({
        x: existingPositions[i].x,
        y: existingPositions[i].y,
        width: existingPositions[i].width || defaultWidth,
        height: existingPositions[i].height || defaultHeight,
      });
    } else {
      positions.push({
        x: 0,
        y: 0,
        width: defaultWidth,
        height: defaultHeight,
      });
    }
  }

  return positions;
}

/**
 * Generate a random position that doesn't overlap with existing items
 */
function generateRandomPosition(
  containerWidth: number,
  containerHeight: number,
  itemWidth: number,
  itemHeight: number,
  padding: number,
  existingPositions: PadletPosition[]
): PadletPosition {
  const maxAttempts = 50;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const x = Math.random() * (containerWidth - itemWidth - padding * 2) + padding;
    const y = Math.random() * (containerHeight - itemHeight - padding * 2) + padding;
    
    const newPosition = { x, y, width: itemWidth, height: itemHeight };
    
    // Check for overlaps
    const hasOverlap = existingPositions.some(pos => 
      isOverlapping(newPosition, pos)
    );
    
    if (!hasOverlap) {
      return newPosition;
    }
    
    attempts++;
  }

  // If we can't find a non-overlapping position, place it anyway
  return {
    x: Math.random() * (containerWidth - itemWidth - padding * 2) + padding,
    y: Math.random() * (containerHeight - itemHeight - padding * 2) + padding,
    width: itemWidth,
    height: itemHeight,
  };
}

/**
 * Check if two positions overlap
 */
function isOverlapping(pos1: PadletPosition, pos2: PadletPosition): boolean {
  return !(
    pos1.x + pos1.width < pos2.x ||
    pos2.x + pos2.width < pos1.x ||
    pos1.y + pos1.height < pos2.y ||
    pos2.y + pos2.height < pos1.y
  );
}

/**
 * Snap position to grid (optional utility)
 */
export function snapToGrid(
  position: PadletPosition,
  gridSize: number = 20
): PadletPosition {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
    width: position.width,
    height: position.height,
  };
}

/**
 * Ensure position is within container bounds
 */
export function constrainToContainer(
  position: PadletPosition,
  containerWidth: number,
  containerHeight: number
): PadletPosition {
  const x = Math.max(0, Math.min(position.x, containerWidth - position.width));
  const y = Math.max(0, Math.min(position.y, containerHeight - position.height));
  
  return {
    x,
    y,
    width: position.width,
    height: position.height,
  };
}

/**
 * Get optimal canvas size for freeform layout
 */
export function getOptimalCanvasSize(positions: PadletPosition[]): { width: number; height: number } {
  if (positions.length === 0) {
    return { width: 1200, height: 800 };
  }

  let maxX = 0;
  let maxY = 0;

  positions.forEach(pos => {
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  });

  return {
    width: Math.max(maxX + 50, 1200),
    height: Math.max(maxY + 50, 800),
  };
}