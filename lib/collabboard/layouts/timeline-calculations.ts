// lib/collabboard/layouts/TimelineLayout.ts
import { PadletPosition } from '../types';

/**
 * Timeline Layout - Horizontal chronological layout
 * Arranges padlets in a timeline format with alternating positions
 */
export function calculatePositions(
  count: number,
  containerWidth: number,
  containerHeight: number,
  existingPositions?: PadletPosition[]
): PadletPosition[] {
  if (count === 0) return [];

  const itemWidth = 280;
  const itemHeight = 200;
  const timelineHeight = 60;
  const verticalSpacing = 40;
  const horizontalSpacing = 60;
  const padding = 50;

  // Calculate timeline position (center of container)
  const timelineY = containerHeight / 2 - timelineHeight / 2;
  
  // Calculate available width for timeline
  const availableWidth = containerWidth - (padding * 2);
  const itemSpacing = Math.max(horizontalSpacing, availableWidth / Math.max(count, 1));

  const positions: PadletPosition[] = [];

  for (let i = 0; i < count; i++) {
    const x = padding + i * itemSpacing;
    
    // Alternate between top and bottom of timeline
    const isTop = i % 2 === 0;
    const y = isTop 
      ? timelineY - itemHeight - verticalSpacing
      : timelineY + timelineHeight + verticalSpacing;

    positions.push({
      x,
      y,
      width: itemWidth,
      height: itemHeight,
    });
  }

  return positions;
}

/**
 * Get timeline metadata for rendering
 */
export function getTimelineMetadata(
  count: number,
  containerWidth: number,
  containerHeight: number
) {
  const timelineHeight = 60;
  const padding = 50;
  const availableWidth = containerWidth - (padding * 2);
  const itemSpacing = Math.max(60, availableWidth / Math.max(count, 1));

  return {
    timelineY: containerHeight / 2 - timelineHeight / 2,
    timelineHeight,
    timelineWidth: availableWidth,
    itemSpacing,
    startX: padding,
    endX: padding + (count - 1) * itemSpacing,
  };
}

/**
 * Generate timeline markers/points
 */
export function generateTimelineMarkers(
  count: number,
  containerWidth: number,
  containerHeight: number
): Array<{ x: number; y: number; index: number }> {
  const metadata = getTimelineMetadata(count, containerWidth, containerHeight);
  const markers = [];

  for (let i = 0; i < count; i++) {
    const x = metadata.startX + i * metadata.itemSpacing;
    const y = metadata.timelineY + metadata.timelineHeight / 2;
    
    markers.push({ x, y, index: i });
  }

  return markers;
}

/**
 * Calculate timeline connector positions
 */
export function getTimelineConnectors(
  count: number,
  containerWidth: number,
  containerHeight: number
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const metadata = getTimelineMetadata(count, containerWidth, containerHeight);
  const connectors = [];
  const timelineCenterY = metadata.timelineY + metadata.timelineHeight / 2;

  for (let i = 0; i < count; i++) {
    const x = metadata.startX + i * metadata.itemSpacing;
    const isTop = i % 2 === 0;
    const itemY = isTop 
      ? metadata.timelineY - 40 - 200  // item height + vertical spacing
      : metadata.timelineY + metadata.timelineHeight + 40;

    connectors.push({
      x1: x + 140, // center of item (itemWidth / 2)
      y1: itemY + (isTop ? 200 : 0), // bottom of top item or top of bottom item
      x2: x + 140,
      y2: timelineCenterY,
    });
  }

  return connectors;
}

/**
 * Get optimal container dimensions for timeline
 */
export function getOptimalTimelineDimensions(count: number): { width: number; height: number } {
  const minWidth = 800;
  const itemWidth = 280;
  const horizontalSpacing = 60;
  const padding = 50;
  
  const calculatedWidth = (count * (itemWidth + horizontalSpacing)) + (padding * 2);
  const width = Math.max(minWidth, calculatedWidth);
  const height = 600; // Fixed height for timeline

  return { width, height };
}

/**
 * Sort items by date (utility function)
 */
export function sortByDate(items: any[], dateField: string = 'created_at'): any[] {
  return [...items].sort((a, b) => {
    const dateA = new Date(a[dateField]);
    const dateB = new Date(b[dateField]);
    return dateA.getTime() - dateB.getTime();
  });
}