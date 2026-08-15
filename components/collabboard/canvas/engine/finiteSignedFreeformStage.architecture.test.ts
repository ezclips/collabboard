import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

const canvas = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const cards = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const camera = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
const interactions = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');
const graph = read('components/graph/FreeformGraphLayer.tsx');
const line = read('components/collabboard/SimpleLineRenderer.tsx');

describe('PATCH 9V.2A: finite signed Freeform stage architecture', () => {
  it('uses the signed dimensions only for the physical native-scroll footprint', () => {
    expect(canvas).toContain('gutterX * 2 + FREEFORM_SIGNED_WORLD_WIDTH * canvasZoom');
    expect(canvas).toContain('gutterY * 2 + FREEFORM_SIGNED_WORLD_HEIGHT * canvasZoom');
  });

  it('places logical zero at the one canonical scaled stage offset', () => {
    expect(canvas).toContain('const freeformWorldOriginLeft = gutterX + FREEFORM_WORLD_ORIGIN_OFFSET_X * canvasZoom;');
    expect(canvas).toContain('const freeformWorldOriginTop = gutterY + FREEFORM_WORLD_ORIGIN_OFFSET_Y * canvasZoom;');
    expect((canvas.match(/left: freeformWorldOriginLeft,/g) || []).length).toBe(2);
    expect((canvas.match(/top: freeformWorldOriginTop,/g) || []).length).toBe(2);
    expect(cards).toContain('left: worldOriginLeft,');
    expect(cards).toContain('top: worldOriginTop,');
    expect(canvas).toContain('ref={freeformWorldOriginRef}');
  });

  it('keeps raw signed and legacy-positive post coordinates as render coordinates', () => {
    expect(cards).toContain('left: padlet.position_x || 0,');
    expect(cards).toContain('top: padlet.position_y || 0,');
    expect(cards).not.toMatch(/left:\s*Math\.(max|min)/);
    expect(cards).not.toMatch(/top:\s*Math\.(max|min)/);
  });

  it('keeps transformOrigin 0 0 on all Freeform coordinate planes', () => {
    expect((canvas.match(/transformOrigin: '0 0',/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(cards).toContain("transformOrigin: '0 0'");
  });

  it('changes only the initial camera seed; anchored zoom and pan stay native-scroll based', () => {
    expect(camera).toContain('measuredX + initialWorldOriginOffsetX * zoomRef.current');
    expect(camera).toContain('measuredY + initialWorldOriginOffsetY * zoomRef.current');
    expect(camera).toContain('const worldX = (oldScrollLeft + anchorX - gx) / oldZoom;');
    expect(camera).toContain('left: worldX * newZoom + gx - anchorX,');
    expect(camera).toContain('left: (pending?.left ?? container.scrollLeft) + dxWorld * zoom,');
    expect(camera).not.toMatch(/const \[camera[XY]/);
  });

  it('keeps Manual Line pointer conversion byte-equivalent', () => {
    expect(line).toContain('x: (e.clientX - rect.left) / canvasZoom,');
    expect(line).toContain('y: (e.clientY - rect.top) / canvasZoom,');
  });

  it('allows signed Graph presentation without changing its label formula', () => {
    expect(graph).toContain('className="absolute inset-0 h-full w-full overflow-visible"');
    expect(graph).toContain('const mx = (e.clientX - svgRect.left) / currentZoom;');
    expect(graph).toContain('const my = (e.clientY - svgRect.top) / currentZoom;');
  });
});

describe('PATCH 9V.2A: user placement remains zero-clamped', () => {
  it('keeps single-root and multi-root drag clamps', () => {
    expect(interactions).toContain('const clampedX = Math.max(0, newX);');
    expect(interactions).toContain('const clampedY = Math.max(0, newY);');
    expect(interactions).toContain('position_x: Math.max(0, start.x + dx),');
    expect(interactions).toContain('position_y: Math.max(0, start.y + dy),');
  });

  it('keeps canonical pointer/create clamps', () => {
    expect(canvas).toContain('x: Math.max(0, Math.round((clientX - origin.left) / canvasZoom)),');
    expect(canvas).toContain('y: Math.max(0, Math.round((clientY - origin.top) / canvasZoom)),');
    expect(canvas).toContain('x: Math.max(0, Math.round(center.x - cardWidth / 2)),');
    expect(canvas).toContain('y: Math.max(0, Math.round(center.y - cardHeight / 2)),');
  });

  it('keeps library-drop, detach, and HTML5-reposition clamps', () => {
    expect(canvas).toContain('position_x: Math.max(0, x),');
    expect(canvas).toContain('position_y: Math.max(0, y),');
    expect(canvas).toContain('{ postId: padletId, positionX: Math.max(0, x), positionY: Math.max(0, y), metadata: newMetadata }');
    expect(canvas).toContain('const newX = Math.max(0, dropX - offsetX);');
    expect(canvas).toContain('const newY = Math.max(0, dropY - offsetY);');
  });
});
