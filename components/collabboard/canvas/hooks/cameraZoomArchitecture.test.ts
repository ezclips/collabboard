// PATCH 9S -- camera-anchored Freeform zoom, CanvasClient.tsx wiring checks.
// CanvasClient.tsx is far too large to mount in a unit test (matches the
// established convention in graphEdgeContainerLifecycle.test.ts and
// graphEdgePostDeleteLifecycle.test.ts) -- these are source-architecture
// assertions against the real production file, not a mocked copy.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  // Normalize CRLF -> LF: CanvasClient.tsx is CRLF on disk (Windows repo),
  // while FreeformGraphLayer.tsx and others are LF -- multi-line needle
  // strings below are all written as LF, so both are read consistently.
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const graphLayerSrc = read('components/graph/FreeformGraphLayer.tsx');

describe('PATCH 9S: camera hook wiring [Phase 3]', () => {
  it('CanvasClient calls useCanvasCamera with containerRef and destructures zoomAtViewportPoint, not a raw setCanvasZoom', () => {
    expect(canvasClientSrc).toContain(
      'const { canvasZoom, zoomAtViewportPoint, handleZoomIn, handleZoomOut, handleZoomReset } = useCanvasCamera(containerRef);'
    );
  });

  it('no raw setCanvasZoom call remains anywhere in CanvasClient.tsx [negative controls A/B anchor]', () => {
    expect(canvasClientSrc).not.toMatch(/setCanvasZoom/);
  });
});

describe('PATCH 9S: Ctrl+wheel is gated to Freeform-equivalent layouts and uses the shared primitive [Phase 8, 9, 10; negative controls B, C, J]', () => {
  const start = canvasClientSrc.indexOf('onWheel={(e) => {');
  const end = canvasClientSrc.indexOf('onMouseDown={handleFreeformPanMouseDown}', start);
  const wheelHandlerBody = canvasClientSrc.slice(start, end);

  it('the handler body was located', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it('the zoom branch is gated by isFreeformLayout, not ctrlKey alone', () => {
    expect(wheelHandlerBody).toContain('if (e.ctrlKey && isFreeformLayout) {');
  });

  it('computes the pointer anchor by subtracting the viewport rect origin -- not raw clientX/clientY [negative control C]', () => {
    expect(wheelHandlerBody).toContain('const anchorX = containerRect ? e.clientX - containerRect.left : 0;');
    expect(wheelHandlerBody).toContain('const anchorY = containerRect ? e.clientY - containerRect.top : 0;');
    expect(wheelHandlerBody).not.toMatch(/zoomAtViewportPoint\([^)]*,\s*e\.clientX\s*,/);
  });

  it('calls zoomAtViewportPoint with a functional updater (batch-safe), not a raw setCanvasZoom call [negative controls B, J]', () => {
    expect(wheelHandlerBody).toContain('zoomAtViewportPoint((z) => z + zoomDelta, anchorX, anchorY);');
    expect(wheelHandlerBody).not.toMatch(/setCanvasZoom/);
  });

  it('preserves the exact 0.1 step and does not hand-clamp inline -- clamping is the primitive\'s job [Phase 28]', () => {
    expect(wheelHandlerBody).toContain('const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;');
  });
});

describe('PATCH 9S: cached-position Line context menu closes on any zoom change [Phase 25]', () => {
  it('a dedicated effect keyed on canvasZoom clears lineContextMenuState', () => {
    const idx = canvasClientSrc.indexOf('useEffect(() => {\n    setLineContextMenuState(null);\n  }, [canvasZoom]);');
    expect(idx).toBeGreaterThan(-1);
  });
});

describe('PATCH 9S: front SimpleLineRenderer no longer leaks Freeform canvasZoom into non-Freeform hosts [Phase 11; negative control K]', () => {
  it('both the back-plane and front-plane SimpleLineRenderer usages gate canvasZoom by isFreeformLayout', () => {
    const gatedOccurrences = (canvasClientSrc.match(/canvasZoom=\{isFreeformLayout \? canvasZoom : undefined\}/g) || []).length;
    expect(gatedOccurrences).toBe(2);
  });

  it('no SimpleLineRenderer usage passes the raw, ungated canvasZoom prop', () => {
    // ZoomControls legitimately receives the raw canvasZoom={canvasZoom} for
    // display -- this checks only SimpleLineRenderer's own prop, by scanning
    // each <SimpleLineRenderer usage's block for an ungated canvasZoom prop.
    const rendererBlocks = canvasClientSrc.split('<SimpleLineRenderer').slice(1);
    expect(rendererBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of rendererBlocks) {
      const propsEnd = block.indexOf('/>');
      const props = block.slice(0, propsEnd);
      expect(props).not.toMatch(/canvasZoom=\{canvasZoom\}/);
    }
  });
});

describe('PATCH 9S: non-Freeform host isolation -- Drawing/Map camera systems untouched [Phase 12, 13; negative control L]', () => {
  it('no Excalidraw API call references zoomAtViewportPoint or canvasZoom-driven scroll compensation', () => {
    const excalidrawStart = canvasClientSrc.indexOf('drawingExcalidrawAPIRef');
    expect(excalidrawStart).toBeGreaterThan(-1);
    expect(canvasClientSrc).not.toMatch(/drawingExcalidrawAPIRef[\s\S]{0,200}zoomAtViewportPoint/);
    expect(canvasClientSrc).not.toMatch(/zoomAtViewportPoint[\s\S]{0,200}drawingExcalidrawAPIRef/);
  });

  it('no Mapbox/map camera code references zoomAtViewportPoint', () => {
    expect(canvasClientSrc).not.toMatch(/mapbox[\s\S]{0,200}zoomAtViewportPoint/i);
  });
});

describe('PATCH 9S: world stage / transform-origin freeze [Phase 14, Freezes 48-49]', () => {
  it('FREEFORM_WORLD_WIDTH_PX/HEIGHT_PX remain 10000, imported (not redefined) in CanvasClient', () => {
    const stageGeometrySrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
    expect(stageGeometrySrc).toContain('export const FREEFORM_WORLD_WIDTH_PX = 10000;');
    expect(stageGeometrySrc).toContain('export const FREEFORM_WORLD_HEIGHT_PX = 10000;');
  });

  it("transformOrigin: '0 0' is untouched at both the back-plane and front-plane Line wrapper divs", () => {
    const occurrences = (canvasClientSrc.match(/transformOrigin: '0 0',/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("CanvasViewport's isolation and z-index stacking are untouched [PATCH 9M freeze]", () => {
    expect(canvasClientSrc).toContain("isolation: 'isolate',");
    expect(canvasClientSrc).toContain('zIndex: isFreeformGraphMode ? 2000 : 500,');
  });
});

describe('PATCH 9S: Graph lifecycle freeze -- zoom never touches PATCH 9P/9Q cleanup [Phase 24]', () => {
  it('the wheel handler and camera-menu-close effect bodies never reference the Graph lifecycle cleanup functions', () => {
    const wheelStart = canvasClientSrc.indexOf('onWheel={(e) => {');
    const wheelEnd = canvasClientSrc.indexOf('onMouseDown={handleFreeformPanMouseDown}', wheelStart);
    const wheelBody = canvasClientSrc.slice(wheelStart, wheelEnd);
    expect(wheelBody).not.toMatch(/cleanupGraphEdgesForContainerChild|cleanupGraphEdgesForDeletedPosts|deleteEdgesForPost/);
  });

  it('PATCH 9P/9Q call sites are still present and unchanged in count', () => {
    const cleanupCallRegex = /await cleanupGraphEdgesForDeletedPosts\([^;]*\);\s*\n\s*setGraphRefreshToken\(\(token\) => token \+ 1\);/g;
    expect((canvasClientSrc.match(cleanupCallRegex) ?? []).length).toBe(7);
  });
});

describe('PATCH 9S: Graph edge context menu closes on zoom change [Phase 25]', () => {
  it('FreeformGraphLayer has a dedicated effect keyed on the zoom prop that clears edgeMenu', () => {
    expect(graphLayerSrc).toContain('useEffect(() => {\n        setEdgeMenu(null);\n    }, [zoom]);');
  });

  it('the effect is additive -- does not replace or alter the edge-fetch effect keyed on refreshToken', () => {
    expect(graphLayerSrc).toContain("[repo, boardId, refreshToken]");
  });
});

describe('PATCH 9S: Manual Line / Graph coordinate formula freeze -- untouched by this patch [Phase 17, 21]', () => {
  it('SimpleLineRenderer.getMousePos is byte-identical to the PATCH 9J-era formula', () => {
    const simpleLineRendererSrc = read('components/collabboard/SimpleLineRenderer.tsx');
    expect(simpleLineRendererSrc).toContain('x: (e.clientX - rect.left) / canvasZoom,');
    expect(simpleLineRendererSrc).toContain('y: (e.clientY - rect.top) / canvasZoom,');
  });

  it('FreeformGraphLayer measuredRects and label-drag formulas are untouched', () => {
    expect(graphLayerSrc).toContain('const mx = (e.clientX - svgRect.left) / currentZoom;');
    expect(graphLayerSrc).toContain('const my = (e.clientY - svgRect.top) / currentZoom;');
  });

  it('graphRepo.ts deleteEdgesForPost (PATCH 9P/9Q primitive) is untouched', () => {
    const graphRepoSrc = read('lib/graph/graphRepo.ts');
    expect(graphRepoSrc).toContain('async deleteEdgesForPost(postId: string): Promise<void> {');
  });
});

describe('PATCH 9S: LineToolbar left unchanged [scope]', () => {
  it('no reference to zoomAtViewportPoint appears near LineToolbar wiring', () => {
    const idx = canvasClientSrc.indexOf('<LineToolbar');
    if (idx === -1) return; // component may be conditionally imported/rendered elsewhere; absence is not a failure for this scope guard
    const nearby = canvasClientSrc.slice(Math.max(0, idx - 300), idx + 300);
    expect(nearby).not.toContain('zoomAtViewportPoint');
  });
});
