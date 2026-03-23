// lib/collabboard/layouts/StreamLayout.ts
import { PadletPosition } from '../types';

/**
 * Stream Layout - Vertical list/feed layout
 * Arranges padlets in a vertical stream like a social media feed
 */
export function calculatePositions(
  count: number,
  containerWidth: number,
  containerHeight: number,
  existingPositions?: PadletPosition[]
): PadletPosition[] {
  if (count === 0) return [];

  const itemWidth = Math.min(600, containerWidth - 100); // Max width with padding
  const itemHeight = 200;
  const padding = 20;
  const verticalSpacing = 15;

  // Center items horizontally
  const itemX = (containerWidth - itemWidth) / 2;

  const positions: PadletPosition[] = [];
  let currentY = padding;

  for (let i = 0; i < count; i++) {
    positions.push({
      x: itemX,
      y: currentY,
      width: itemWidth,
      height: itemHeight,
    });

    currentY += itemHeight + verticalSpacing;
  }

  return positions;
}

/**
 * Calculate stream dimensions
 */
export function getStreamDimensions(
  count: number,
  containerWidth: number,
  itemHeight: number = 200
) {
  const padding = 20;
  const verticalSpacing = 15;
  const itemWidth = Math.min(600, containerWidth - 100);
  
  const totalHeight = count > 0 
    ? (count * itemHeight) + ((count - 1) * verticalSpacing) + (padding * 2)
    : containerWidth;

  return {
    itemWidth,
    itemHeight,
    totalHeight,
    itemX: (containerWidth - itemWidth) / 2,
  };
}

/**
 * Get stream layout with variable heights
 */
export function calculateVariableHeightPositions(
  count: number,
  containerWidth: number,
  containerHeight: number,
  itemHeights: number[]
): PadletPosition[] {
  if (count === 0) return [];

  const itemWidth = Math.min(600, containerWidth - 100);
  const padding = 20;
  const verticalSpacing = 15;
  const itemX = (containerWidth - itemWidth) / 2;

  const positions: PadletPosition[] = [];
  let currentY = padding;

  for (let i = 0; i < count; i++) {
    const height = itemHeights[i] || 200;
    
    positions.push({
      x: itemX,
      y: currentY,
      width: itemWidth,
      height,
    });

    currentY += height + verticalSpacing;
  }

  return positions;
}

/**
 * Get stream with different item widths (responsive)
 */
export function calculateResponsiveStreamPositions(
  count: number,
  containerWidth: number,
  containerHeight: number,
  breakpoints: { mobile: number; tablet: number; desktop: number } = {
    mobile: 480,
    tablet: 768,
    desktop: 1024
  }
): PadletPosition[] {
  if (count === 0) return [];

  let itemWidth: number;
  let horizontalPadding: number;

  // Determine item width based on container width
  if (containerWidth <= breakpoints.mobile) {
    itemWidth = containerWidth - 40;
    horizontalPadding = 20;
  } else if (containerWidth <= breakpoints.tablet) {
    itemWidth = containerWidth - 80;
    horizontalPadding = 40;
  } else {
    itemWidth = Math.min(600, containerWidth - 100);
    horizontalPadding = (containerWidth - itemWidth) / 2;
  }

  const itemHeight = 200;
  const verticalSpacing = 15;
  const verticalPadding = 20;

  const positions: PadletPosition[] = [];
  let currentY = verticalPadding;

  for (let i = 0; i < count; i++) {
    positions.push({
      x: horizontalPadding,
      y: currentY,
      width: itemWidth,
      height: itemHeight,
    });

    currentY += itemHeight + verticalSpacing;
  }

  return positions;
}

/**
 * Get infinite scroll metadata
 */
export function getScrollMetadata(
  count: number,
  containerWidth: number,
  itemHeight: number = 200,
  itemsPerPage: number = 10
) {
  const { totalHeight, itemWidth, itemX } = getStreamDimensions(count, containerWidth, itemHeight);
  const pageHeight = itemsPerPage * (itemHeight + 15);
  const totalPages = Math.ceil(count / itemsPerPage);

  return {
    totalHeight,
    itemWidth,
    itemX,
    pageHeight,
    totalPages,
    itemsPerPage,
  };
}

/**
 * Get visible items in viewport
 */
export function getVisibleItems(
  scrollTop: number,
  viewportHeight: number,
  itemHeight: number = 200,
  verticalSpacing: number = 15,
  padding: number = 20
): { startIndex: number; endIndex: number; count: number } {
  const itemTotalHeight = itemHeight + verticalSpacing;
  
  const startIndex = Math.floor(Math.max(0, scrollTop - padding) / itemTotalHeight);
  const endIndex = Math.ceil((scrollTop + viewportHeight + padding) / itemTotalHeight);
  
  return {
    startIndex,
    endIndex,
    count: endIndex - startIndex,
  };
}

/**
 * Calculate stream with categories/sections
 */
export function calculateCategorizedStreamPositions(
  categories: Array<{ name: string; items: any[] }>,
  containerWidth: number,
  containerHeight: number
): PadletPosition[] {
  const itemWidth = Math.min(600, containerWidth - 100);
  const itemHeight = 200;
  const categoryHeaderHeight = 60;
  const padding = 20;
  const verticalSpacing = 15;
  const categorySpacing = 40;
  const itemX = (containerWidth - itemWidth) / 2;

  const positions: PadletPosition[] = [];
  let currentY = padding;

  categories.forEach((category, categoryIndex) => {
    // Add space for category header
    currentY += categoryHeaderHeight + verticalSpacing;

    // Add items in this category
    category.items.forEach((item, itemIndex) => {
      positions.push({
        x: itemX,
        y: currentY,
        width: itemWidth,
        height: itemHeight,
      });

      currentY += itemHeight + verticalSpacing;
    });

    // Add spacing between categories
    if (categoryIndex < categories.length - 1) {
      currentY += categorySpacing;
    }
  });

  return positions;
}