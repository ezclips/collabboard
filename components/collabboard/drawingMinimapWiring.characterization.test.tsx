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

describe('PATCH DRAWING-MINIMAP-B: root-cause fix -- StrictMode-safe frame scheduling', () => {
  it('the scheduled-frame id is a plain per-effect local variable, not a useRef -- a useRef survives Strict Mode\'s ' +
    'mount->cleanup->remount and left the id permanently non-null after the first (discarded) cleanup, which made ' +
    'every later scheduleMeasure() call a silent no-op and the hook never left its empty initial state', () => {
    expect(code(sceneHookSrc)).toContain('let frameId: number | null = null;');
    expect(code(sceneHookSrc)).not.toMatch(/const\s+\w*[Rr]af\w*\s*=\s*useRef/);
    // useState/useEffect only -- useRef is no longer imported by this hook at all.
    expect(code(sceneHookSrc)).toMatch(/import\s*\{\s*useEffect,\s*useState\s*\}\s*from\s*'react';/);
  });

  it('the cleanup cancels the pending frame using the SAME local binding it was scheduled with', () => {
    const effectBody = slice(code(sceneHookSrc), 'useEffect(() => {', '}, [excalidrawAPI]);');
    expect(effectBody).toContain('if (frameId !== null) window.cancelAnimationFrame(frameId);');
  });
});

describe('PATCH DRAWING-MINIMAP-B: the minimap shell is never hidden', () => {
  it('the component no longer has an early return that hides the whole shell for empty/unavailable bounds', () => {
    expect(code(minimapSrc)).not.toMatch(/if\s*\(\s*!displayBounds\s*\|\|\s*!projection\s*\)\s*return\s*null;/);
  });

  it('displayBounds falls back to the current viewport, then to a fixed placeholder, when there are no elements', () => {
    const fallbackBlock = slice(code(minimapSrc), 'const displayBounds = useMemo(() => {', '}, [elementRects, viewportWorldRect]);');
    expect(fallbackBlock).toContain('if (elementRects.length > 0) return getSceneDisplayBounds(elementRects);');
    expect(fallbackBlock).toContain('if (viewportWorldRect) return getSceneDisplayBounds([viewportWorldRect]);');
    expect(fallbackBlock).toContain('return getSceneDisplayBounds([ORIGIN_PLACEHOLDER_RECT]);');
  });

  it('getSceneDisplayBounds itself (the pure geometry function) is untouched -- only its caller\'s input selection changed', () => {
    expect(code(geometrySrc)).toContain('export function getSceneDisplayBounds(elementRects: readonly WorldRect[]): WorldRect | null {');
    expect(code(geometrySrc)).toContain('if (validRects.length === 0) return null;');
  });

  it('the host shell now carries a visible border/background of its own, independent of the inner SVG surface rect', () => {
    expect(code(minimapSrc)).toMatch(/HOST_CLASSNAME[\s\S]{0,10}=[\s\S]{0,200}border[\s\S]{0,200}bg-white/);
  });
});
