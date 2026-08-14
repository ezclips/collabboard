import { describe, expect, it } from 'vitest';
import {
  canvasLinePersistencePayload,
  createCanvasLineGeometryFromLayerCoords,
  drawingLineDragPersistenceIntent,
  duplicateCanvasLineWithOffset,
  mapGeoCanvasLinePersistencePayload,
  layerToScene,
  normalizeCanvasLineForPersistence,
  sceneGroupTransform,
  sceneToLayer,
  type DrawingViewport,
} from './canvasLineCoordinates';
import type { CanvasLine } from '@/types/collabboard';

const point = { x: 123.456, y: -78.9 };
const viewports: DrawingViewport[] = [
  { zoom: 0.5, scrollX: -1932, scrollY: 84.25, originOffsetX: 17, originOffsetY: -23 },
  { zoom: 1, scrollX: 45.5, scrollY: -120.25, originOffsetX: -31, originOffsetY: 19 },
  { zoom: 2, scrollX: -72.125, scrollY: 240, originOffsetX: 13.5, originOffsetY: 27.25 },
];

describe('canvas line Drawing coordinate conversions', () => {
  it.each(viewports)('sceneToLayer uses zoom, scroll, and non-zero origin offsets at zoom $zoom', (viewport) => {
    expect(sceneToLayer(point, viewport)).toEqual({
      x: (point.x + viewport.scrollX) * viewport.zoom + viewport.originOffsetX,
      y: (point.y + viewport.scrollY) * viewport.zoom + viewport.originOffsetY,
    });
  });

  it.each(viewports)('layerToScene uses zoom, scroll, and non-zero origin offsets at zoom $zoom', (viewport) => {
    const layerPoint = { x: 512.75, y: -240.125 };
    expect(layerToScene(layerPoint, viewport)).toEqual({
      x: (layerPoint.x - viewport.originOffsetX) / viewport.zoom - viewport.scrollX,
      y: (layerPoint.y - viewport.originOffsetY) / viewport.zoom - viewport.scrollY,
    });
  });

  it.each(viewports)('round-trips within 0.01 scene units at zoom $zoom', (viewport) => {
    const roundTrip = layerToScene(sceneToLayer(point, viewport), viewport);
    expect(Math.abs(roundTrip.x - point.x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(roundTrip.y - point.y)).toBeLessThanOrEqual(0.01);
  });

  it('uses an SVG group transform algebraically equivalent to sceneToLayer', () => {
    const viewport = viewports[2];
    const [translateX, translateY, scale] = sceneGroupTransform(viewport).match(/translate\(([^,]+), ([^)]+)\) scale\(([^)]+)\)/)!.slice(1);
    const transformed = {
      x: Number(translateX) + point.x * Number(scale),
      y: Number(translateY) + point.y * Number(scale),
    };
    expect(transformed).toEqual(sceneToLayer(point, viewport));
  });

  it('does not ignore non-zero origin offsets', () => {
    const viewport = viewports[0];
    const withoutOffset = sceneToLayer(point, { ...viewport, originOffsetX: 0, originOffsetY: 0 });
    const withOffset = sceneToLayer(point, viewport);
    expect(withOffset.x - withoutOffset.x).toBe(viewport.originOffsetX);
    expect(withOffset.y - withoutOffset.y).toBe(viewport.originOffsetY);
  });

  it('supports the real-board negative scrollX case', () => {
    expect(sceneToLayer({ x: 2000, y: 100 }, viewports[0])).toEqual({ x: 51, y: 69.125 });
  });
});

function canvasLine(overrides: Partial<CanvasLine> = {}): CanvasLine {
  return {
    id: 'line-1',
    board_id: 'board-1',
    start_x: 100,
    start_y: 200,
    control_x: 150,
    control_y: 175,
    end_x: 220,
    end_y: 260,
    points: [
      { x: 100, y: 200, type: 'smooth', lng: 1, lat: 2 },
      { x: 160, y: 180, type: 'corner' },
      { x: 220, y: 260, type: 'smooth', lng: 3, lat: 4 },
    ],
    color: '#374151',
    stroke_width: 2,
    layer_plane: 'front',
    start_arrow: false,
    end_arrow: true,
    dashed: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('canvas line Drawing legacy policy decisions', () => {
  it('T13 converts every geometry field and coord_space in one Drawing persistence payload', () => {
    const legacyLine = canvasLine({ coord_space: null });
    const viewport = viewports[1];
    const payload = canvasLinePersistencePayload(legacyLine, {
      convertLegacyToScene: true,
      drawingViewport: viewport,
    });

    expect(payload).toMatchObject({
      start_x: layerToScene({ x: legacyLine.start_x, y: legacyLine.start_y }, viewport).x,
      start_y: layerToScene({ x: legacyLine.start_x, y: legacyLine.start_y }, viewport).y,
      control_x: layerToScene({ x: legacyLine.control_x, y: legacyLine.control_y }, viewport).x,
      control_y: layerToScene({ x: legacyLine.control_x, y: legacyLine.control_y }, viewport).y,
      end_x: layerToScene({ x: legacyLine.end_x, y: legacyLine.end_y }, viewport).x,
      end_y: layerToScene({ x: legacyLine.end_x, y: legacyLine.end_y }, viewport).y,
      coord_space: 'scene',
    });
    expect(payload.points).toEqual(
      legacyLine.points!.map((legacyPoint) => ({
        ...legacyPoint,
        ...layerToScene({ x: legacyPoint.x, y: legacyPoint.y }, viewport),
      })),
    );
    expect(Object.keys(payload)).toEqual(expect.arrayContaining([
      'start_x',
      'start_y',
      'control_x',
      'control_y',
      'end_x',
      'end_y',
      'points',
      'coord_space',
    ]));
  });

  it('T14 treats pointer-move frames as local-only: no persistence intent and no conversion marker', () => {
    const intent = drawingLineDragPersistenceIntent({
      phase: 'move',
      drawingViewport: viewports[0],
    });
    const legacyLine = canvasLine({ coord_space: null });

    expect(intent).toEqual({ shouldPersist: false, convertLegacyToScene: false });
    expect(normalizeCanvasLineForPersistence(legacyLine, { convertLegacyToScene: false, drawingViewport: viewports[0] }))
      .toBe(legacyLine);
    expect(canvasLinePersistencePayload(legacyLine, { convertLegacyToScene: false, drawingViewport: viewports[0] }).coord_space)
      .toBeNull();
  });

  it('T15 keeps Freeform legacy lines in legacy coordinates when no Drawing viewport is present', () => {
    const legacyLine = canvasLine({ coord_space: null });
    const payload = canvasLinePersistencePayload(legacyLine, { convertLegacyToScene: true });

    expect(payload).toMatchObject({
      start_x: legacyLine.start_x,
      start_y: legacyLine.start_y,
      control_x: legacyLine.control_x,
      control_y: legacyLine.control_y,
      end_x: legacyLine.end_x,
      end_y: legacyLine.end_y,
      coord_space: null,
    });
    expect(payload.points).toEqual(legacyLine.points);
  });

  it('T16 leaves Map/geo creation and persistence on the legacy path without scene conversion', () => {
    const created = createCanvasLineGeometryFromLayerCoords({
      rawStartX: 100,
      rawStartY: 200,
      rawEndX: 300,
      rawEndY: 400,
      geoPoints: { startLng: 7, startLat: 8, endLng: 9, endLat: 10 },
    });
    const geoPoints = [
      { x: 100, y: 200, type: 'smooth' as const, lng: 7, lat: 8 },
      { x: 300, y: 400, type: 'smooth' as const, lng: 9, lat: 10 },
    ];
    const persisted = mapGeoCanvasLinePersistencePayload(canvasLine({ ...created, coord_space: null }), geoPoints);

    expect('coord_space' in created).toBe(false);
    expect(created.points).toEqual(geoPoints);
    expect(persisted).toEqual({
      start_x: 100,
      start_y: 200,
      end_x: 300,
      end_y: 400,
      control_x: 200,
      control_y: 150,
      points: geoPoints,
    });
    expect('coord_space' in persisted).toBe(false);
  });

  it('creates Drawing lines in scene space from the measured Drawing viewport on the initial payload', () => {
    const viewport = viewports[2];
    const created = createCanvasLineGeometryFromLayerCoords({
      rawStartX: 640,
      rawStartY: 480,
      rawEndX: 760,
      rawEndY: 540,
      drawingViewport: viewport,
    });
    const expectedStart = layerToScene({ x: 640, y: 480 }, viewport);
    const expectedEnd = layerToScene({ x: 760, y: 540 }, viewport);

    expect(created).toMatchObject({
      start_x: expectedStart.x,
      start_y: expectedStart.y,
      control_x: (expectedStart.x + expectedEnd.x) / 2,
      control_y: Math.min(expectedStart.y, expectedEnd.y) - 50,
      end_x: expectedEnd.x,
      end_y: expectedEnd.y,
      coord_space: 'scene',
      points: [
        { x: expectedStart.x, y: expectedStart.y, type: 'smooth' },
        { x: expectedEnd.x, y: expectedEnd.y, type: 'smooth' },
      ],
    });
  });

  it('PATCH 9J: Drawing pointer coordinates depend only on the Drawing viewport, not on canvasZoom -- there is no canvasZoom field on CanvasLineCreationOptions to double-divide by anymore', () => {
    const viewport = viewports[0];
    const created = createCanvasLineGeometryFromLayerCoords({
      rawStartX: 640,
      rawStartY: 480,
      rawEndX: 760,
      rawEndY: 540,
      drawingViewport: viewport,
    });

    expect(created.start_x).toBe(layerToScene({ x: 640, y: 480 }, viewport).x);
    expect(created.start_y).toBe(layerToScene({ x: 640, y: 480 }, viewport).y);
    // A pre-halved input (as a stray extra division would have produced)
    // must NOT match -- proves the Drawing branch consumes rawStartX/Y
    // as-is, with no hidden zoom division anywhere in this helper.
    expect(created.start_x).not.toBe(layerToScene({ x: 320, y: 240 }, viewport).x);
    expect(created.start_y).not.toBe(layerToScene({ x: 320, y: 240 }, viewport).y);
  });

  it('PATCH 9J: the legacy (Freeform/Map, no drawingViewport) branch is a pure pass-through -- this helper no longer divides by canvasZoom at all, since SimpleLineRenderer.getMousePos already divides exactly once before calling it', () => {
    const created = createCanvasLineGeometryFromLayerCoords({
      rawStartX: 500,
      rawStartY: 300,
      rawEndX: 800,
      rawEndY: 700,
    });

    expect(created.start_x).toBe(500);
    expect(created.start_y).toBe(300);
    expect(created.end_x).toBe(800);
    expect(created.end_y).toBe(700);
    expect(created.control_x).toBe((500 + 800) / 2);
    expect(created.control_y).toBe(Math.min(300, 700) - 50);
  });

  it('PATCH 9J: CanvasLineCreationOptions no longer accepts a canvasZoom field (TypeScript proof via object shape, negative controls D/E anchor here)', () => {
    const options: Parameters<typeof createCanvasLineGeometryFromLayerCoords>[0] = {
      rawStartX: 1,
      rawStartY: 2,
      rawEndX: 3,
      rawEndY: 4,
    };
    expect('canvasZoom' in options).toBe(false);
  });

  it.each([
    ['NULL remains NULL', { coord_space: null } satisfies Partial<CanvasLine>, true, null],
    ['undefined remains absent', {} satisfies Partial<CanvasLine>, false, undefined],
    ["'scene' remains 'scene'", { coord_space: 'scene' as const } satisfies Partial<CanvasLine>, true, 'scene'],
  ])('T17 duplication copies coord_space verbatim: %s', (_label, override, hasMarker, expected) => {
    const duplicated = duplicateCanvasLineWithOffset(canvasLine(override), 20);

    expect('coord_space' in duplicated).toBe(hasMarker);
    expect(duplicated.coord_space).toBe(expected);
    expect(duplicated.start_x).toBe(120);
    expect(duplicated.points?.[0]).toMatchObject({ x: 120, y: 220, lng: 1, lat: 2 });
  });
});
