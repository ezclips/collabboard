import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const stageGeometrySrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');

function sharedSurface(): string {
  const start = canvasClientSrc.indexOf("data-freeform-world-surface={isFreeformLayout ? 'true' : undefined}");
  const end = canvasClientSrc.indexOf('</PadletLayer>', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return canvasClientSrc.slice(start, end);
}

describe('PATCH 9J/9S.7: shared Freeform world-stage source of truth', () => {
  it('exports exactly one width and height constant', () => {
    expect(stageGeometrySrc.match(/export const FREEFORM_WORLD_WIDTH_PX/g)?.length).toBe(1);
    expect(stageGeometrySrc.match(/export const FREEFORM_WORLD_HEIGHT_PX/g)?.length).toBe(1);
  });

  it('keeps posts on the shared stage constants without hardcoded 10000px classes', () => {
    expect(freeformSrc).toContain("import { FREEFORM_WORLD_WIDTH_PX, FREEFORM_WORLD_HEIGHT_PX } from '@/components/collabboard/canvas/engine/freeformStageGeometry';");
    expect(freeformSrc).toContain('data-freeform-world-layer="posts"');
    expect(freeformSrc).toContain('width: FREEFORM_WORLD_WIDTH_PX,');
    expect(freeformSrc).toContain('height: FREEFORM_WORLD_HEIGHT_PX,');
    expect(freeformSrc).not.toContain('w-[10000px]');
    expect(freeformSrc).not.toContain('h-[10000px]');
  });

  it('places the back Line/ref, post/Graph stage, and front Line under one marked PadletLayer surface', () => {
    const surface = sharedSurface();
    expect(surface).toContain('ref={freeformWorldOriginRef}');
    expect(surface).toContain('data-freeform-world-layer="back"');
    expect(surface).toContain('<FreeformPadletCards');
    expect(surface).toContain('data-freeform-world-layer="front"');
  });

  it('gives each Freeform Line plane the exact post-stage gutter, dimensions, scale, and transform origin', () => {
    const surface = sharedSurface();
    for (const layer of ['back', 'front']) {
      const start = surface.indexOf(`data-freeform-world-layer="${layer}"`);
      const wrapper = surface.slice(start, surface.indexOf('<SimpleLineRenderer', start));
      expect(start).toBeGreaterThan(-1);
      expect(wrapper).toContain('left: gutterX,');
      expect(wrapper).toContain('top: gutterY,');
      expect(wrapper).toContain('width: FREEFORM_WORLD_WIDTH_PX,');
      expect(wrapper).toContain('height: FREEFORM_WORLD_HEIGHT_PX,');
      expect(wrapper).toContain('transform: `scale(${canvasZoom})`,');
      expect(wrapper).toContain("transformOrigin: '0 0',");
    }
  });

  it('gates the marked surface and both world planes to Freeform, leaving Drawing and Map outside this coordinate system', () => {
    const surface = sharedSurface();
    for (const layer of ['back', 'front']) {
      const marker = surface.indexOf(`data-freeform-world-layer="${layer}"`);
      const gate = surface.lastIndexOf('{isFreeformLayout && (', marker);
      const wrapper = surface.slice(gate, surface.indexOf('<SimpleLineRenderer', marker));
      expect(gate).toBeGreaterThan(-1);
      expect(wrapper).not.toContain('isDrawingLayout');
      expect(wrapper).not.toContain('isMapLayout');
    }
  });

  it('uses the same single shared geometry import in post and canvas hosts', () => {
    expect((freeformSrc.match(/from '@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry'/g) || []).length).toBe(1);
    expect((canvasClientSrc.match(/from '@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry'/g) || []).length).toBe(1);
    expect(freeformSrc).not.toMatch(/const FREEFORM_WORLD_WIDTH_PX\s*=/);
    expect(canvasClientSrc).not.toMatch(/const FREEFORM_WORLD_WIDTH_PX\s*=/);
  });

  it('does not add speculative scroll compensation to SimpleLineRenderer.getMousePos', () => {
    const lineSrc = read('components/collabboard/SimpleLineRenderer.tsx');
    const start = lineSrc.indexOf('const getMousePos = useCallback');
    const end = lineSrc.indexOf('}, [canvasZoom]);', start);
    const body = lineSrc.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(body).not.toContain('scrollLeft');
    expect(body).not.toContain('scrollTop');
  });
});
