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
const navControlSrc = read('components/collabboard/canvas/minimap/DrawingNavigationControl.tsx');

describe('PATCH DRAWING-MINIMAP-C: mounted in DrawingLayout as ONE combined control, gated like the two separate controls it replaces', () => {
  it('imports DrawingNavigationControl from its own new module, and no longer imports DrawingMinimap or ZoomControls directly', () => {
    expect(code(layoutSrc)).toContain(
      "import DrawingNavigationControl from '@/components/collabboard/canvas/minimap/DrawingNavigationControl';",
    );
    expect(code(layoutSrc)).not.toContain("from '@/components/collabboard/canvas/minimap/DrawingMinimap'");
    expect(code(layoutSrc)).not.toContain("from '@/components/collabboard/canvas/ui/ZoomControls'");
  });

  it('is portaled into the same screen-fixed viewportContainerRef, gated on isInitialViewportSettled -- same contract the two controls it replaces both had', () => {
    const mountBlock = slice(
      code(layoutSrc),
      '<DrawingNavigationControl',
      'viewportContainerRef.current\n      ) : null}',
    );
    expect(mountBlock).toContain('excalidrawAPI={excalidrawAPI}');
    const gate = slice(
      code(layoutSrc),
      'isInitialViewportSettled && viewportContainerRef?.current ? createPortal(\n        <DrawingNavigationControl',
      '/>',
    );
    expect(gate).toContain('excalidrawAPI={excalidrawAPI}');
  });

  it('reuses the SAME applyZoom/zoomPercent state DrawingLayout already had -- no new zoom logic', () => {
    const mountBlock = slice(code(layoutSrc), '<DrawingNavigationControl', '/>');
    expect(mountBlock).toContain('canvasZoom={zoomPercent / 100}');
    expect(mountBlock).toContain("handleZoomOut={() => applyZoom('out')}");
    expect(mountBlock).toContain("handleZoomReset={() => applyZoom('reset')}");
    expect(mountBlock).toContain("handleZoomIn={() => applyZoom('in')}");
  });

  it('passes no readOnly flag -- navigation is view-only regardless of edit permission, per the original patch\'s permissions contract', () => {
    const mountBlock = slice(code(layoutSrc), '<DrawingNavigationControl', '/>');
    expect(mountBlock).not.toMatch(/readOnly/);
  });
});

describe('PATCH DRAWING-MINIMAP-C: DrawingNavigationControl composition -- no duplicated zoom logic or navigation state', () => {
  it('renders DrawingMinimap embedded, passing excalidrawAPI straight through', () => {
    expect(code(navControlSrc)).toContain('<DrawingMinimap embedded excalidrawAPI={excalidrawAPI} />');
  });

  it('owns only local expand/collapse UI state -- no zoom state, no scene/viewport state of its own', () => {
    expect(code(navControlSrc)).toContain('const [expanded, setExpanded] = useState(true);');
    expect(code(navControlSrc)).not.toMatch(/useState.*zoom/i);
    expect(code(navControlSrc)).not.toMatch(/elementRects|viewportWorldRect|getSceneElements|getAppState/);
  });

  it('the zoom row buttons call the passed-in handlers directly -- no reimplementation of zoom math', () => {
    expect(code(navControlSrc)).toContain('onClick={handleZoomOut}');
    expect(code(navControlSrc)).toContain('onClick={handleZoomReset}');
    expect(code(navControlSrc)).toContain('onClick={handleZoomIn}');
    expect(code(navControlSrc)).not.toMatch(/Math\.min\(3|Math\.max\(0\.1/); // DrawingLayout's own applyZoom clamp math
  });

  it('collapsing hides the minimap slot entirely (unmounts DrawingMinimap) rather than just hiding it with CSS', () => {
    expect(code(navControlSrc)).toContain('{expanded && (');
    expect(code(navControlSrc)).not.toMatch(/display:\s*expanded/);
  });
});

describe('PATCH DRAWING-MINIMAP-A/C: isolation from the frozen Freeform minimap/navigation control', () => {
  it('none of the new Drawing minimap/navigation files import from the Freeform minimap module', () => {
    for (const src of [minimapSrc, geometrySrc, navigationSrc, sceneHookSrc, navControlSrc]) {
      expect(code(src)).not.toMatch(/freeformMinimap|useFreeformMinimap|FreeformNavigationControl/);
    }
  });

  it('DrawingMinimap.tsx does not import FreeformMinimap.tsx', () => {
    expect(code(minimapSrc)).not.toContain('FreeformMinimap');
  });

  it('the Freeform minimap and navigation-control modules themselves have no new reference to Drawing\'s', () => {
    const freeformSrc = read('components/collabboard/canvas/minimap/FreeformMinimap.tsx');
    const freeformGeometrySrc = read('components/collabboard/canvas/minimap/freeformMinimapGeometry.ts');
    const freeformNavControlSrc = read('components/collabboard/canvas/minimap/FreeformNavigationControl.tsx');
    expect(code(freeformSrc)).not.toMatch(/DrawingMinimap|drawingMinimap/);
    expect(code(freeformGeometrySrc)).not.toMatch(/DrawingMinimap|drawingMinimap/);
    expect(code(freeformNavControlSrc)).not.toMatch(/DrawingNavigationControl|drawingMinimap/);
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

describe('PATCH DRAWING-MINIMAP-C: DrawingMinimap gained an embedded mode, geometry/pointer math untouched', () => {
  it('has an optional embedded prop, mirroring FreeformMinimap\'s own (deliberately duplicated, not imported)', () => {
    expect(code(minimapSrc)).toContain('embedded?: boolean;');
    expect(code(minimapSrc)).toContain('embedded = false');
  });

  it('the embedded variant drops its own absolute positioning/z-index/border/background -- the composing control owns those now', () => {
    const embeddedClass = slice(code(minimapSrc), 'const EMBEDDED_HOST_CLASSNAME =', ';');
    expect(embeddedClass).not.toMatch(/absolute|z-\[|border|bg-white|shadow/);
    expect(embeddedClass).toContain('h-[112px] w-[176px]');
  });

  it('the standalone variant is untouched -- still self-positions bottom-right with its own chrome', () => {
    expect(code(minimapSrc)).toContain(
      "'pointer-events-auto absolute bottom-[84px] right-[var(--drawing-zoom-controls-right,1.5rem)] z-[130] hidden h-[112px] w-[176px] overflow-hidden rounded-md border border-gray-300 bg-white shadow-md md:block';",
    );
  });

  it('none of the geometry/projection/pointer-handler logic changed for this patch -- only the host classname selection did', () => {
    expect(code(minimapSrc)).toContain('className={embedded ? EMBEDDED_HOST_CLASSNAME : STANDALONE_HOST_CLASSNAME}');
    // Every pointer handler and the click/drag navigation helpers are called exactly as before.
    expect(code(minimapSrc)).toContain('onPointerDown={handlePointerDown}');
    expect(code(minimapSrc)).toContain('panDrawingViewportByWorldDelta(excalidrawAPI, targetWorld.x - currentCenter.x, targetWorld.y - currentCenter.y);');
  });
});
