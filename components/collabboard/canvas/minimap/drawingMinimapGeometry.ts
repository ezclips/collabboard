// PATCH DRAWING-MINIMAP-A: pure projection/geometry math for the Drawing
// canvas minimap. Deliberately independent from freeformMinimapGeometry.ts
// (no shared import) -- the Freeform layout-assist area is frozen, and this
// module's scene model (raw Excalidraw element bounds, appState-derived
// viewport) has nothing in common with Freeform's Padlet-based one beyond
// the shape of the math, so duplication here is the isolation boundary, not
// an oversight.

export const DRAWING_MINIMAP_WORLD_PADDING = 80;
export const DRAWING_MINIMAP_WORLD_PADDING_RATIO = 0.1;
export const DRAWING_MINIMAP_MIN_WORLD_WIDTH = 400;
export const DRAWING_MINIMAP_MIN_WORLD_HEIGHT = 300;

export interface WorldPoint {
  x: number;
  y: number;
}

export interface WorldRect extends WorldPoint {
  width: number;
  height: number;
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

/** Minimal shape read off a live Excalidraw element -- every element type
 * (rectangle, freedraw, arrow, frame, text, embeddable...) shares these base
 * geometry fields, so no per-type branching is needed for a footprint. */
export interface ExcalidrawElementLike {
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
}

/** Minimal shape read off `excalidrawAPI.getAppState()` -- only the fields
 * this minimap's viewport math needs. */
export interface ExcalidrawAppStateLike {
  scrollX?: number;
  scrollY?: number;
  zoom?: { value?: number } | null;
  width?: number;
  height?: number;
}

export function isValidWorldRect(rect: WorldRect): boolean {
  return Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

/** A single element's footprint, in scene units. Ignores angle/rotation --
 * precision is not important for a navigation minimap, only the element's
 * approximate position and extent. Normalizes Excalidraw's occasional
 * negative width/height (drawn right-to-left/bottom-to-top) into a
 * conventional top-left-anchored rect. */
export function getExcalidrawElementBounds(el: ExcalidrawElementLike | null | undefined): WorldRect | null {
  if (!el || el.isDeleted) return null;
  const { x, y, width, height } = el;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  const w = Math.abs(width);
  const h = Math.abs(height);
  if (w <= 0 || h <= 0) return null;
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: w,
    height: h,
  };
}

/** Scene bounds (minX/minY/maxX/maxY) padded and floored to a minimum
 * display size, mirroring the padding/floor shape of Freeform's own
 * minimap bounds but tuned to Excalidraw's typical (much smaller) scene
 * scale. Returns null for an empty scene -- callers hide the minimap then. */
export function getSceneDisplayBounds(elementRects: readonly WorldRect[]): WorldRect | null {
  const validRects = elementRects.filter(isValidWorldRect);
  if (validRects.length === 0) return null;

  const minX = Math.min(...validRects.map((r) => r.x));
  const minY = Math.min(...validRects.map((r) => r.y));
  const maxX = Math.max(...validRects.map((r) => r.x + r.width));
  const maxY = Math.max(...validRects.map((r) => r.y + r.height));
  const rawWidth = maxX - minX;
  const rawHeight = maxY - minY;
  const paddingX = Math.max(DRAWING_MINIMAP_WORLD_PADDING, rawWidth * DRAWING_MINIMAP_WORLD_PADDING_RATIO);
  const paddingY = Math.max(DRAWING_MINIMAP_WORLD_PADDING, rawHeight * DRAWING_MINIMAP_WORLD_PADDING_RATIO);
  const paddedWidth = rawWidth + paddingX * 2;
  const paddedHeight = rawHeight + paddingY * 2;
  const width = Math.max(paddedWidth, DRAWING_MINIMAP_MIN_WORLD_WIDTH);
  const height = Math.max(paddedHeight, DRAWING_MINIMAP_MIN_WORLD_HEIGHT);
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

/**
 * The area of the scene currently visible in the main Drawing canvas, in
 * scene (world) units -- derived from Excalidraw's own appState the same
 * way Excalidraw itself converts between viewport and scene coordinates
 * (see the installed fork's `viewportCoordsToSceneCoords`/
 * `sceneCoordsToViewportCoords` in packages/common/src/utils.ts):
 *   sceneX = clientX / zoom - scrollX
 * so for a container of `width` x `height` CSS px, the visible scene rect is
 *   x: -scrollX, y: -scrollY, width: width / zoom, height: height / zoom
 */
export function getDrawingViewportWorldRect(appState: ExcalidrawAppStateLike | null | undefined): WorldRect | null {
  if (!appState) return null;
  const zoom = appState.zoom?.value;
  const width = appState.width;
  const height = appState.height;
  if (!Number.isFinite(zoom) || !zoom || zoom <= 0) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || (width as number) <= 0 || (height as number) <= 0) {
    return null;
  }
  const scrollX = appState.scrollX ?? 0;
  const scrollY = appState.scrollY ?? 0;
  return {
    x: -scrollX,
    y: -scrollY,
    width: (width as number) / zoom,
    height: (height as number) / zoom,
  };
}
