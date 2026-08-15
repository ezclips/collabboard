import type { Padlet } from '@/types/collabboard';

export const MINIMAP_WORLD_PADDING = 200;
export const MINIMAP_WORLD_PADDING_RATIO = 0.1;
export const MINIMAP_MIN_WORLD_WIDTH = 1600;
export const MINIMAP_MIN_WORLD_HEIGHT = 1000;

export interface WorldPoint {
  x: number;
  y: number;
}

export interface WorldRect extends WorldPoint {
  width: number;
  height: number;
}

export interface MinimapWorldItem extends WorldRect {
  id: string;
  type: Padlet['type'];
  kind: 'post' | 'container' | 'comment-pin';
}

export interface MinimapInnerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MinimapProjection {
  scale: number;
  offsetX: number;
  offsetY: number;
  displayBounds: WorldRect;
  innerRect: MinimapInnerRect;
}

export interface ViewportWorldRectInput {
  viewportRect: Pick<DOMRect, 'left' | 'top'>;
  clientLeft: number;
  clientTop: number;
  clientWidth: number;
  clientHeight: number;
  worldOriginRect: Pick<DOMRect, 'left' | 'top'>;
  zoom: number;
}

export function isValidWorldRect(rect: WorldRect): boolean {
  return Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

export function getMinimapDisplayBounds(items: readonly MinimapWorldItem[]): WorldRect | null {
  const validItems = items.filter(isValidWorldRect);
  if (validItems.length === 0) return null;

  const minX = Math.min(...validItems.map((item) => item.x));
  const minY = Math.min(...validItems.map((item) => item.y));
  const maxX = Math.max(...validItems.map((item) => item.x + item.width));
  const maxY = Math.max(...validItems.map((item) => item.y + item.height));
  const rawWidth = maxX - minX;
  const rawHeight = maxY - minY;
  const paddingX = Math.max(MINIMAP_WORLD_PADDING, rawWidth * MINIMAP_WORLD_PADDING_RATIO);
  const paddingY = Math.max(MINIMAP_WORLD_PADDING, rawHeight * MINIMAP_WORLD_PADDING_RATIO);
  const paddedWidth = rawWidth + paddingX * 2;
  const paddedHeight = rawHeight + paddingY * 2;
  const width = Math.max(paddedWidth, MINIMAP_MIN_WORLD_WIDTH);
  const height = Math.max(paddedHeight, MINIMAP_MIN_WORLD_HEIGHT);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function createMinimapProjection(
  displayBounds: WorldRect,
  innerRect: MinimapInnerRect,
): MinimapProjection | null {
  if (!isValidWorldRect(displayBounds)
    || !Number.isFinite(innerRect.left)
    || !Number.isFinite(innerRect.top)
    || !Number.isFinite(innerRect.width)
    || !Number.isFinite(innerRect.height)
    || innerRect.width <= 0
    || innerRect.height <= 0) {
    return null;
  }

  const scale = Math.min(
    innerRect.width / displayBounds.width,
    innerRect.height / displayBounds.height,
  );
  const fitWidth = displayBounds.width * scale;
  const fitHeight = displayBounds.height * scale;

  return {
    scale,
    offsetX: innerRect.left + (innerRect.width - fitWidth) / 2,
    offsetY: innerRect.top + (innerRect.height - fitHeight) / 2,
    displayBounds,
    innerRect,
  };
}

export function projectWorldPoint(point: WorldPoint, projection: MinimapProjection): WorldPoint {
  return {
    x: projection.offsetX + (point.x - projection.displayBounds.x) * projection.scale,
    y: projection.offsetY + (point.y - projection.displayBounds.y) * projection.scale,
  };
}

export function projectWorldRect(rect: WorldRect, projection: MinimapProjection): WorldRect {
  const point = projectWorldPoint(rect, projection);
  return {
    ...point,
    width: rect.width * projection.scale,
    height: rect.height * projection.scale,
  };
}

export function unprojectMinimapPoint(point: WorldPoint, projection: MinimapProjection): WorldPoint {
  return {
    x: projection.displayBounds.x + (point.x - projection.offsetX) / projection.scale,
    y: projection.displayBounds.y + (point.y - projection.offsetY) / projection.scale,
  };
}

export function getViewportWorldRect(input: ViewportWorldRectInput): WorldRect | null {
  if (!Number.isFinite(input.zoom) || input.zoom <= 0) return null;

  const values = [
    input.viewportRect.left,
    input.viewportRect.top,
    input.clientLeft,
    input.clientTop,
    input.clientWidth,
    input.clientHeight,
    input.worldOriginRect.left,
    input.worldOriginRect.top,
  ];
  if (values.some((value) => !Number.isFinite(value)) || input.clientWidth <= 0 || input.clientHeight <= 0) {
    return null;
  }

  const screenLeft = input.viewportRect.left + input.clientLeft;
  const screenTop = input.viewportRect.top + input.clientTop;

  return {
    x: (screenLeft - input.worldOriginRect.left) / input.zoom,
    y: (screenTop - input.worldOriginRect.top) / input.zoom,
    width: input.clientWidth / input.zoom,
    height: input.clientHeight / input.zoom,
  };
}
