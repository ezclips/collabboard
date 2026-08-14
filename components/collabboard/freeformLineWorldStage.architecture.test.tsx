import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

// PATCH 9J -- closes PATCH 9I's confirmed root cause: the Freeform Line
// interaction layers (CanvasClient.tsx's back/front SimpleLineRenderer
// wrappers) sized their unscaled box against `inset-0` (the viewport-sized
// CanvasViewport box) instead of the same world-stage size
// FreeformPadletCards.tsx's own post wrapper uses -- so the reachable Line
// world-coordinate range stayed capped at ~viewport CSS pixels regardless of
// canvasZoom. Both wrappers must now derive their world-stage width/height
// from ONE shared source (freeformStageGeometry.ts), not independently
// typed literals that could drift apart again.

const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const stageGeometrySrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');

describe('PATCH 9J: shared Freeform world-stage source of truth [test 1]', () => {
  it('freeformStageGeometry.ts exports exactly one width and one height constant', () => {
    expect(stageGeometrySrc.match(/export const FREEFORM_WORLD_WIDTH_PX/g)?.length).toBe(1);
    expect(stageGeometrySrc.match(/export const FREEFORM_WORLD_HEIGHT_PX/g)?.length).toBe(1);
  });
});

describe('PATCH 9J: post wrapper uses the shared stage dimensions [test 2, negative controls A/B/C anchor here]', () => {
  it('FreeformPadletCards.tsx imports FREEFORM_WORLD_WIDTH_PX/HEIGHT_PX from the shared module', () => {
    expect(freeformSrc).toContain(
      "import { FREEFORM_WORLD_WIDTH_PX, FREEFORM_WORLD_HEIGHT_PX } from '@/components/collabboard/canvas/engine/freeformStageGeometry';",
    );
  });

  it('the post stage wrapper sets width/height from the imported constants, not a hardcoded literal', () => {
    const wrapperStart = freeformSrc.indexOf('className="absolute inset-0 transform-origin-top-left"');
    expect(wrapperStart).toBeGreaterThan(-1);
    const wrapper = freeformSrc.slice(wrapperStart, wrapperStart + 300);
    expect(wrapper).toContain('width: FREEFORM_WORLD_WIDTH_PX,');
    expect(wrapper).toContain('height: FREEFORM_WORLD_HEIGHT_PX,');
  });

  it('no hardcoded w-[10000px]/h-[10000px] literal remains in FreeformPadletCards.tsx (it must come from the shared constant, not be independently retyped)', () => {
    expect(freeformSrc).not.toContain('w-[10000px]');
    expect(freeformSrc).not.toContain('h-[10000px]');
  });
});

describe('PATCH 9J: Freeform Line wrappers use the same shared stage dimensions [tests 3, 4]', () => {
  it('CanvasClient.tsx imports FREEFORM_WORLD_WIDTH_PX/HEIGHT_PX from the shared module', () => {
    expect(canvasClientSrc).toContain(
      "import { FREEFORM_WORLD_WIDTH_PX, FREEFORM_WORLD_HEIGHT_PX } from '@/components/collabboard/canvas/engine/freeformStageGeometry';",
    );
  });

  it('the back-plane (Layer 1) Line wrapper sets world-stage width/height only for Freeform, mirroring FreeformPadletCards', () => {
    const layer1Comment = canvasClientSrc.indexOf('Layer 1: Background Lines');
    const layer1Svg = canvasClientSrc.indexOf('<SimpleLineRenderer', layer1Comment);
    const layer1Wrapper = canvasClientSrc.slice(layer1Comment, layer1Svg);

    expect(layer1Wrapper).toMatch(/isFreeformLayout\s*\r?\n\s*\?\s*\{\s*\r?\n\s*width:\s*FREEFORM_WORLD_WIDTH_PX,\s*\r?\n\s*height:\s*FREEFORM_WORLD_HEIGHT_PX,\s*\r?\n\s*transform:\s*`scale\(\$\{canvasZoom\}\)`,\s*\r?\n\s*transformOrigin:\s*'0 0',/);
  });

  it('the front-plane (Layer 3) Line wrapper sets world-stage width/height only for Freeform, mirroring FreeformPadletCards', () => {
    const layer3Comment = canvasClientSrc.indexOf('Layer 3: Foreground Lines');
    const layer3Svg = canvasClientSrc.indexOf('<SimpleLineRenderer', layer3Comment);
    const layer3Wrapper = canvasClientSrc.slice(layer3Comment, layer3Svg);

    expect(layer3Wrapper).toMatch(/isFreeformLayout\s*\r?\n\s*\?\s*\{\s*\r?\n\s*width:\s*FREEFORM_WORLD_WIDTH_PX,\s*\r?\n\s*height:\s*FREEFORM_WORLD_HEIGHT_PX,\s*\r?\n\s*transform:\s*`scale\(\$\{canvasZoom\}\)`,\s*\r?\n\s*transformOrigin:\s*'0 0',/);
  });

  it('both Line wrappers still fall back to an empty style object (no width/height/transform) outside Freeform', () => {
    const layer1Comment = canvasClientSrc.indexOf('Layer 1: Background Lines');
    const layer1Svg = canvasClientSrc.indexOf('<SimpleLineRenderer', layer1Comment);
    const layer1Wrapper = canvasClientSrc.slice(layer1Comment, layer1Svg);
    const layer3Comment = canvasClientSrc.indexOf('Layer 3: Foreground Lines');
    const layer3Svg = canvasClientSrc.indexOf('<SimpleLineRenderer', layer3Comment);
    const layer3Wrapper = canvasClientSrc.slice(layer3Comment, layer3Svg);

    expect(layer1Wrapper).toMatch(/:\s*\{\}\)/);
    expect(layer3Wrapper).toMatch(/:\s*\{\}\)/);
  });
});

describe('PATCH 9J: host gating -- Drawing and Map do not inherit Freeform world-stage sizing [tests 5, 6; negative controls H, I]', () => {
  it('the width/height override on both Line wrappers is nested strictly inside the pre-existing isFreeformLayout conditional -- not applied unconditionally', () => {
    const layer1StyleStart = canvasClientSrc.indexOf('style={{', canvasClientSrc.indexOf('Layer 1: Background Lines'));
    const layer1Svg = canvasClientSrc.indexOf('<SimpleLineRenderer', layer1StyleStart);
    const layer1Style = canvasClientSrc.slice(layer1StyleStart, layer1Svg);
    const layer3StyleStart = canvasClientSrc.indexOf('style={{', canvasClientSrc.indexOf('Layer 3: Foreground Lines'));
    const layer3Svg = canvasClientSrc.indexOf('<SimpleLineRenderer', layer3StyleStart);
    const layer3Style = canvasClientSrc.slice(layer3StyleStart, layer3Svg);

    // Anchored on the style={{...}} block itself (past the explanatory JSX
    // comment, which also mentions the constant names in prose) -- the
    // width/height keys must appear strictly between "isFreeformLayout" and
    // the "? {" that opens the Freeform-only branch, i.e. inside the
    // ternary's true-branch, not hoisted out to the unconditional style object.
    for (const style of [layer1Style, layer3Style]) {
      const gateIdx = style.indexOf('isFreeformLayout');
      const widthIdx = style.indexOf('FREEFORM_WORLD_WIDTH_PX');
      expect(gateIdx).toBeGreaterThan(-1);
      expect(widthIdx).toBeGreaterThan(gateIdx);
    }
  });

  it('Drawing layout (isDrawingLayout) is never referenced by the world-stage sizing branch -- Drawing keeps its own drawingViewport/scene-space system untouched', () => {
    const layer1Comment = canvasClientSrc.indexOf('Layer 1: Background Lines');
    const layer1Svg = canvasClientSrc.indexOf('<SimpleLineRenderer', layer1Comment);
    const layer1Wrapper = canvasClientSrc.slice(layer1Comment, layer1Svg);
    expect(layer1Wrapper).not.toContain('isDrawingLayout');
  });

  it('Map layout is never granted the Freeform world-stage size -- isMapLayout is not part of the sizing gate', () => {
    const layer1Comment = canvasClientSrc.indexOf('Layer 1: Background Lines');
    const layer1Svg = canvasClientSrc.indexOf('<SimpleLineRenderer', layer1Comment);
    const layer1Wrapper = canvasClientSrc.slice(layer1Comment, layer1Svg);
    expect(layer1Wrapper).not.toContain('isMapLayout');
  });
});

describe('PATCH 9J: post and Line stages are provably equivalent, not independently drifting [stage-equivalence proof]', () => {
  it('every FREEFORM_WORLD_WIDTH_PX/HEIGHT_PX reference across both files resolves to the same single import source', () => {
    const freeformImportCount = (freeformSrc.match(/from '@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry'/g) || []).length;
    const canvasClientImportCount = (canvasClientSrc.match(/from '@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry'/g) || []).length;
    expect(freeformImportCount).toBe(1);
    expect(canvasClientImportCount).toBe(1);
  });

  it('no file defines a second, independent FREEFORM_WORLD_WIDTH_PX/HEIGHT_PX constant', () => {
    expect(freeformSrc).not.toMatch(/const FREEFORM_WORLD_WIDTH_PX\s*=/);
    expect(canvasClientSrc).not.toMatch(/const FREEFORM_WORLD_WIDTH_PX\s*=/);
  });
});

describe('PATCH 9J: scope guard -- no speculative scrollLeft/scrollTop compensation added to SimpleLineRenderer [negative control J]', () => {
  it('getMousePos does not reference scrollLeft/scrollTop -- PATCH 9I/9J characterized but did not prove this is defective (the SVG measures its own, possibly-already-scroll-relative, getBoundingClientRect), so no speculative fix belongs in this patch', () => {
    const simpleLineRendererSrc = read('components/collabboard/SimpleLineRenderer.tsx');
    const getMousePosStart = simpleLineRendererSrc.indexOf('const getMousePos = useCallback');
    const getMousePosEnd = simpleLineRendererSrc.indexOf('}, [canvasZoom]);', getMousePosStart);
    const getMousePosBody = simpleLineRendererSrc.slice(getMousePosStart, getMousePosEnd);

    expect(getMousePosStart).toBeGreaterThan(-1);
    expect(getMousePosBody).not.toContain('scrollLeft');
    expect(getMousePosBody).not.toContain('scrollTop');
  });
});
