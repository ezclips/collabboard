// lib/collabboard/layouts/TimelineLayout.ts

import type { PadletPosition } from './layout-functions';

/**
 * Timeline Layout - Chronological timeline with alternating sides
 * Creates a vertical timeline with padlets alternating left and right
 */
export function calculateTimelinePositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number
): PadletPosition[] {
  const positions: PadletPosition[] = [];
  
  if (count === 0) return positions;

  // Timeline configuration
  const timelineLineX = Math.max(80, canvasWidth * 0.1); // Timeline line position (10% from left, min 80px)
  const cardWidth = Math.min(320, (canvasWidth - timelineLineX - 100) / 2); // Max width based on available space
  const cardHeight = 130;
  const verticalSpacing = 40;
  const horizontalOffset = 30; // Distance from timeline line to card
  const padding = 60;
  
  // Calculate starting Y position
  const startY = padding;
  
  // Place padlets alternating left and right of timeline
  for (let i = 0; i < count; i++) {
    const yPosition = startY + (i * (cardHeight + verticalSpacing));
    
    // Alternate between left and right sides of timeline
    const isLeftSide = i % 2 === 0;
    
    let xPosition: number;
    if (isLeftSide) {
      // Left side: card ends before timeline line
      xPosition = timelineLineX - horizontalOffset - cardWidth;
    } else {
      // Right side: card starts after timeline line
      xPosition = timelineLineX + horizontalOffset;
    }
    
    // Ensure cards don't go off screen
    xPosition = Math.max(20, Math.min(xPosition, canvasWidth - cardWidth - 20));
    
    positions.push({
      x: xPosition,
      y: yPosition,
      width: cardWidth,
      height: cardHeight
    });
  }

  return positions;
}