// @vitest-environment jsdom
// PATCH DRAWING-MINIMAP-A: source-string characterization pinning how the
// new Drawing minimap is wired into DrawingLayout.tsx, and that it stays
// fully isolated from the frozen Freeform minimap and from DrawingLayout's
// own persistence/undo pipeline. Follows this repo's established
// read/code/slice convention (see freeformFullViewFrame.test.tsx).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function slice(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start, `marker not found: ${startMarker}`).toBeGreaterThan(-1);
  const end = src.indexOf(endMarker, start);
  expect(end, `end marker not found after start: ${endMarker}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

const layoutSrc = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
const minimapSrc = read('components/collabboard/canvas/minimap/DrawingMinimap.tsx');
const geometrySrc = read('components/collabboard/canvas/minimap/drawingMinimapGeometry.ts');
const navigationSrc = read('components/collabboard/canvas/minimap/drawingMinimapNavigation.ts');
const sceneHookSrc = read('components/collabboard/canvas/minimap/useDrawingMinimapScene.ts');

describe('PATCH DRAWING-MINIMAP-A: mounted in DrawingLayout, gated and portaled like ZoomControls', () => {
  it('imports DrawingMinimap from its own new module', () => {
    expect(code(layoutSrc)).toContain(
      "import DrawingMinimap from '@/components/collabboard/canvas/minimap/DrawingMinimap';",
    );
  });

  it('is portaled into the same screen-fixed viewportContainerRef, gated on isInitialViewportSettled -- same contract as ZoomControls', () => {
    const mountBlock = slice(
      code(layoutSrc),
      '<DrawingMinimap',
      'viewportContainerRef.current\n      ) : null}',
    );
    expect(mountBlock).toContain('excalidrawAPI={excalidrawAPI}');
    const gate = slice(
      code(layoutSrc),
      'isInitialViewportSettled && viewportContainerRef?.current ? createPortal(\n        <DrawingMinimap',
      '/>',
    );
    expect(gate).toContain('excalidrawAPI={excalidrawAPI}');
  });

  it('passes no readOnly flag -- navigation is view-only regardless of edit permission, per the patch\'s permissions contract', () => {
    const mountBlock = slice(code(layoutSrc), '<DrawingMinimap', '/>');
    expect(mountBlock).not.toMatch(/readOnly/);
  });
});

describe('PATCH DRAWING-MINIMAP-A: isolation from the frozen Freeform minimap', () => {
  it('none of the new Drawing minimap files import from the Freeform minimap module', () => {
    for (const src of [minimapSrc, geometrySrc, navigationSrc, sceneHookSrc]) {
      expect(code(src)).not.toMatch(/freeformMinimap|useFreeformMinimap|FreeformNavigationControl/);
    }
  });

  it('DrawingMinimap.tsx does not import FreeformMinimap.tsx', () => {
    expect(code(minimapSrc)).not.toContain('FreeformMinimap');
  });

  it('the Freeform minimap module itself has no new reference to the Drawing minimap', () => {
    const freeformSrc = read('components/collabboard/canvas/minimap/FreeformMinimap.tsx');
    const freeformGeometrySrc = read('components/collabboard/canvas/minimap/freeformMinimapGeometry.ts');
    expect(code(freeformSrc)).not.toMatch(/DrawingMinimap|drawingMinimap/);
    expect(code(freeformGeometrySrc)).not.toMatch(/DrawingMinimap|drawingMinimap/);
  });
});

describe('PATCH DRAWING-MINIMAP-A: navigation stays out of persistence/undo/element-mutation paths', () => {
  it('the navigation module never calls a persistence, save, or fetch API', () => {
    expect(code(navigationSrc)).not.toMatch(/fetch\(|supabase|saveDrawingSnapshot|onUpdatePadlet|localStorage/);
  });

  it('the navigation module only ever calls excalidrawAPI.updateScene -- no mutateElement/resetScene/history calls', () => {
    expect(code(navigationSrc)).toContain('excalidrawAPI.updateScene(');
    expect(code(navigationSrc)).not.toMatch(/mutateElement|resetScene|\.history\./);
  });

  it('the scene-tracking hook only ever reads via getSceneElements/getAppState/onChange -- never calls a mutating method', () => {
    expect(code(sceneHookSrc)).not.toMatch(/updateScene|mutateElement|resetScene|addFiles/);
  });

  it('DrawingLayout\'s own handleChange/persistence pipeline has no new reference to the minimap', () => {
    const handleChangeBlock = slice(
      code(layoutSrc),
      'const handleChange = useCallback((elements: readonly any[], newAppState: any, files: any) => {',
      '}, [onDeletePadlet, performSave, publishDrawingViewport, readOnly, schedulePadletPositionSave]);',
    );
    expect(handleChangeBlock).not.toMatch(/DrawingMinimap|drawingMinimap/);
  });
});

describe('PATCH DRAWING-MINIMAP-A: element mutation surface', () => {
  it('drawingMinimapGeometry.ts only reads element geometry fields, never assigns into an element object', () => {
    // No `el.x =`, `el.width =`, etc. anywhere in the geometry module.
    expect(code(geometrySrc)).not.toMatch(/el\.\w+\s*=[^=]/);
  });
});
