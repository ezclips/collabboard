import type { CanvasLine } from '@/types/collabboard';

export interface DrawingViewport {
  /** Excalidraw appState.zoom.value */
  readonly zoom: number;
  /** Excalidraw appState.scrollX */
  readonly scrollX: number;
  /** Excalidraw appState.scrollY */
  readonly scrollY: number;
  /** excalidrawCanvasRect.left - lineLayerRect.left */
  readonly originOffsetX: number;
  /** excalidrawCanvasRect.top - lineLayerRect.top */
  readonly originOffsetY: number;
}

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export function sceneToLayer(point: Point2D, viewport: DrawingViewport): Point2D {
  return {
    x: (point.x + viewport.scrollX) * viewport.zoom + viewport.originOffsetX,
    y: (point.y + viewport.scrollY) * viewport.zoom + viewport.originOffsetY,
  };
}

export function layerToScene(point: Point2D, viewport: DrawingViewport): Point2D {
  return {
    x: (point.x - viewport.originOffsetX) / viewport.zoom - viewport.scrollX,
    y: (point.y - viewport.originOffsetY) / viewport.zoom - viewport.scrollY,
  };
}

/** SVG transform string equivalent to applying sceneToLayer to every child. */
export function sceneGroupTransform(viewport: DrawingViewport): string {
  return `translate(${viewport.originOffsetX + viewport.scrollX * viewport.zoom}, ${viewport.originOffsetY + viewport.scrollY * viewport.zoom}) scale(${viewport.zoom})`;
}

export interface CanvasLinePersistenceOptions {
  readonly convertLegacyToScene?: boolean;
  readonly drawingViewport?: DrawingViewport;
}

export interface CanvasLineCreationOptions {
  readonly rawStartX: number;
  readonly rawStartY: number;
  readonly rawEndX: number;
  readonly rawEndY: number;
  readonly canvasZoom: number;
  readonly drawingViewport?: DrawingViewport;
  readonly geoPoints?: {
    readonly startLng: number;
    readonly startLat: number;
    readonly endLng: number;
    readonly endLat: number;
  };
}

export interface CanvasLineDragPersistenceIntent {
  readonly shouldPersist: boolean;
  readonly convertLegacyToScene: boolean;
}

export function drawingLineDragPersistenceIntent(options: {
  readonly phase: 'move' | 'commit';
  readonly drawingViewport?: DrawingViewport;
  readonly isLabelDrag?: boolean;
}): CanvasLineDragPersistenceIntent {
  return {
    shouldPersist: options.phase === 'commit',
    convertLegacyToScene: options.phase === 'commit' && options.drawingViewport !== undefined && options.isLabelDrag !== true,
  };
}

export function convertCanvasLineGeometryToScene(line: CanvasLine, viewport: DrawingViewport): CanvasLine {
  const convert = (x: number, y: number) => layerToScene({ x, y }, viewport);
  const start = convert(line.start_x, line.start_y);
  const control = convert(line.control_x, line.control_y);
  const end = convert(line.end_x, line.end_y);

  return {
    ...line,
    start_x: start.x,
    start_y: start.y,
    control_x: control.x,
    control_y: control.y,
    end_x: end.x,
    end_y: end.y,
    points: line.points?.map((point) => ({ ...point, ...convert(point.x, point.y) })),
    coord_space: 'scene',
  };
}

export function normalizeCanvasLineForPersistence(
  line: CanvasLine,
  options?: CanvasLinePersistenceOptions,
): CanvasLine {
  const viewport = options?.drawingViewport;
  if (
    options?.convertLegacyToScene !== true
    || viewport === undefined
    || line.coord_space === 'scene'
  ) {
    return line;
  }

  return convertCanvasLineGeometryToScene(line, viewport);
}

export function canvasLinePersistencePayload(
  line: CanvasLine,
  options?: CanvasLinePersistenceOptions,
): Partial<CanvasLine> {
  const lineToPersist = normalizeCanvasLineForPersistence(line, options);

  return {
    start_x: lineToPersist.start_x,
    start_y: lineToPersist.start_y,
    control_x: lineToPersist.control_x,
    control_y: lineToPersist.control_y,
    end_x: lineToPersist.end_x,
    end_y: lineToPersist.end_y,
    points: lineToPersist.points,
    coord_space: lineToPersist.coord_space ?? null,
    start_post_id: lineToPersist.start_post_id,
    end_post_id: lineToPersist.end_post_id,
    color: lineToPersist.color,
    stroke_width: lineToPersist.stroke_width,
    dashed: lineToPersist.dashed,
    start_arrow: lineToPersist.start_arrow,
    end_arrow: lineToPersist.end_arrow,
    label: lineToPersist.label,
    label_position: lineToPersist.label_position,
    z_index: lineToPersist.z_index,
    layer_plane: lineToPersist.layer_plane ?? 'front',
    label_text_color: lineToPersist.label_text_color,
    label_background_color: lineToPersist.label_background_color,
  };
}

export function createCanvasLineGeometryFromLayerCoords(options: CanvasLineCreationOptions): Pick<
  CanvasLine,
  'start_x' | 'start_y' | 'control_x' | 'control_y' | 'end_x' | 'end_y' | 'points' | 'coord_space'
> {
  const legacyStart = { x: options.rawStartX / options.canvasZoom, y: options.rawStartY / options.canvasZoom };
  const legacyEnd = { x: options.rawEndX / options.canvasZoom, y: options.rawEndY / options.canvasZoom };
  const drawingStart = { x: options.rawStartX, y: options.rawStartY };
  const drawingEnd = { x: options.rawEndX, y: options.rawEndY };
  const start = options.drawingViewport ? layerToScene(drawingStart, options.drawingViewport) : legacyStart;
  const end = options.drawingViewport ? layerToScene(drawingEnd, options.drawingViewport) : legacyEnd;
  const controlX = (start.x + end.x) / 2;
  const controlY = Math.min(start.y, end.y) - 50;

  return {
    start_x: start.x,
    start_y: start.y,
    control_x: controlX,
    control_y: controlY,
    end_x: end.x,
    end_y: end.y,
    points: [
      { x: start.x, y: start.y, type: 'smooth', ...(options.geoPoints ? { lng: options.geoPoints.startLng, lat: options.geoPoints.startLat } : {}) },
      { x: end.x, y: end.y, type: 'smooth', ...(options.geoPoints ? { lng: options.geoPoints.endLng, lat: options.geoPoints.endLat } : {}) },
    ],
    ...(options.drawingViewport ? { coord_space: 'scene' as const } : {}),
  };
}

export function duplicateCanvasLineWithOffset(line: CanvasLine, offset: number): CanvasLine {
  return {
    ...line,
    start_x: line.start_x + offset,
    start_y: line.start_y + offset,
    end_x: line.end_x + offset,
    end_y: line.end_y + offset,
    control_x: line.control_x + offset,
    control_y: line.control_y + offset,
    points: line.points?.map((point) => ({ ...point, x: point.x + offset, y: point.y + offset })),
  };
}

export function mapGeoCanvasLinePersistencePayload(
  line: CanvasLine,
  points: NonNullable<CanvasLine['points']>,
): Partial<CanvasLine> {
  return {
    start_x: line.start_x,
    start_y: line.start_y,
    end_x: line.end_x,
    end_y: line.end_y,
    control_x: line.control_x,
    control_y: line.control_y,
    points,
  };
}
