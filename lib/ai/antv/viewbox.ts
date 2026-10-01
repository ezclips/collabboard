/**
 * PATCH-245. Pure viewBox/fit math shared by `PictureStage` and the AntV zoom
 * path. No AntV import, no DOM: the stage reads the SVG's viewBox string, feeds
 * it through here, and writes the result back, exactly like AntV's own
 * `ZoomWheel` / `DragCanvas` / `ResetViewBox` plugins do (see
 * `src/utils/viewbox.ts` in `@antv/infographic`).
 */

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The stage's manual zoom range (25%–400%). */
export const STAGE_MIN_ZOOM = 0.25;
export const STAGE_MAX_ZOOM = 4;

/** The automatic Fit clamp (25%–200%). */
export const STAGE_FIT_MIN = 0.25;
export const STAGE_FIT_MAX = 2;

/** One control step (the board's ~10%). */
export const STAGE_ZOOM_STEP = 1.1;

export function parseViewBox(raw: string | null | undefined): ViewBox | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

export function viewBoxToString(box: ViewBox): string {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(STAGE_MAX_ZOOM, Math.max(STAGE_MIN_ZOOM, zoom));
}

/**
 * The Fit scale: the picture's intrinsic size fitted inside the stage, clamped
 * to 25%–200% so a small picture is drawn BIG rather than microscopic.
 */
export function fitScale(
  stageWidth: number,
  stageHeight: number,
  pictureWidth: number,
  pictureHeight: number,
): number {
  if (
    !(stageWidth > 0) ||
    !(stageHeight > 0) ||
    !(pictureWidth > 0) ||
    !(pictureHeight > 0)
  ) {
    return 1;
  }
  const scale = Math.min(stageWidth / pictureWidth, stageHeight / pictureHeight);
  return Math.min(STAGE_FIT_MAX, Math.max(STAGE_FIT_MIN, scale));
}

/**
 * AntV's zoom math (`calculateZoomedViewBox`): `factor < 1` shrinks the box
 * around `pivot` (zoom in); `factor > 1` grows it (zoom out). Kept identical so
 * AntV's own state and a direct attribute write agree.
 */
export function scaleViewBox(box: ViewBox, factor: number, pivot: { x: number; y: number }): ViewBox {
  return {
    x: pivot.x - (pivot.x - box.x) * factor,
    y: pivot.y - (pivot.y - box.y) * factor,
    width: box.width * factor,
    height: box.height * factor,
  };
}

/** AntV's pan math (`DragCanvas`): move the box against the drag. */
export function panViewBox(box: ViewBox, dx: number, dy: number): ViewBox {
  return { x: box.x - dx, y: box.y - dy, width: box.width, height: box.height };
}
