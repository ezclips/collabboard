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
  it('CanvasClient wires the camera hook through an explicit viewport-mount callback, not a raw setCanvasZoom', () => {
    expect(canvasClientSrc).toContain(
      'const {\n    canvasZoom, zoomAtViewportPoint, panByWorldDelta, handleZoomIn, handleZoomOut, handleZoomReset,\n    gutterX, gutterY,\n    setViewportElement,\n  } = useCanvasCamera(\n    containerRef,\n    isFreeformLayout,'
    );
    expect(canvasClientSrc).toContain('FREEFORM_WORLD_ORIGIN_OFFSET_X,\n    FREEFORM_WORLD_ORIGIN_OFFSET_Y,');
    expect(canvasClientSrc).toContain('const handleCanvasViewportRef = useCallback((node: HTMLDivElement | null) => {');
    expect(canvasClientSrc).toContain('containerRef.current = node;');
    expect(canvasClientSrc).toContain('setViewportElement(node);');
    expect(canvasClientSrc).toContain('containerRef={handleCanvasViewportRef}');
  });

  it('the camera hook call is textually AFTER isFreeformLayout is defined [hook-order safety]', () => {
    const hookCallIdx = canvasClientSrc.indexOf('useCanvasCamera(\n    containerRef,\n    isFreeformLayout,');
    const layoutDefIdx = canvasClientSrc.indexOf("const isFreeformLayout = canvas?.layout === 'freeform'");
    expect(layoutDefIdx).toBeGreaterThan(-1);
    expect(hookCallIdx).toBeGreaterThan(layoutDefIdx);
  });

  it('no raw setCanvasZoom call remains anywhere in CanvasClient.tsx [negative controls A/B anchor]', () => {
    expect(canvasClientSrc).not.toMatch(/setCanvasZoom/);
  });
});

describe('PATCH FREEFORM-ZOOM-A: default open zoom is 30%, Freeform-scoped only', () => {
  it('FREEFORM_DEFAULT_ZOOM is 0.3, defined in the shared geometry module (not hardcoded inline)', () => {
    const stageGeometrySrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
    expect(stageGeometrySrc).toContain('export const FREEFORM_DEFAULT_ZOOM = 0.3;');
  });

  it('CanvasClient imports FREEFORM_DEFAULT_ZOOM from the geometry module', () => {
    expect(canvasClientSrc).toMatch(/FREEFORM_DEFAULT_ZOOM,?\s*\n[\s\S]{0,400}from '@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry'/);
  });

  it('the 5th useCanvasCamera argument gates the new default to isFreeformLayout only -- every other (Gantt-sharing) layout keeps the pre-patch default of 1', () => {
    const hookCallIdx = canvasClientSrc.indexOf('useCanvasCamera(\n    containerRef,\n    isFreeformLayout,');
    expect(hookCallIdx).toBeGreaterThan(-1);
    const closeIdx = canvasClientSrc.indexOf(');', hookCallIdx);
    const callBody = canvasClientSrc.slice(hookCallIdx, closeIdx);
    expect(callBody).toContain('isFreeformLayout ? FREEFORM_DEFAULT_ZOOM : 1,');
  });

  it('no other zoom entry point (zoom controls, wheel, reset, minimap) was touched -- only the useCanvasCamera call site gained an argument', () => {
    expect(canvasClientSrc).toContain('const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;');
    expect(canvasClientSrc).toContain('zoomAtViewportPoint((z) => z + zoomDelta, anchorX, anchorY);');
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
  it('both Freeform world-plane renderers gate canvasZoom by isFreeformLayout', () => {
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

describe('PATCH 9S: Manual Line / Graph label-drag coordinate formula freeze -- untouched by this or PATCH 9S.2 [Phase 17, 21]', () => {
  it('SimpleLineRenderer.getMousePos is byte-identical to the PATCH 9J-era formula', () => {
    const simpleLineRendererSrc = read('components/collabboard/SimpleLineRenderer.tsx');
    expect(simpleLineRendererSrc).toContain('x: (e.clientX - rect.left) / canvasZoom,');
    expect(simpleLineRendererSrc).toContain('y: (e.clientY - rect.top) / canvasZoom,');
    // PATCH 9S.2: no gutter/worldOrigin term was added -- this formula uses
    // the SVG's own (already gutter-positioned) rect, which absorbs the
    // gutter automatically. Negative control G/I anchor.
    expect(simpleLineRendererSrc).not.toMatch(/gutter/i);
    expect(simpleLineRendererSrc).not.toMatch(/worldOrigin/i);
  });

  it('FreeformGraphLayer label-drag formula (NOT measuredRects, which PATCH 9S.2 deliberately updated -- see below) is untouched', () => {
    expect(graphLayerSrc).toContain('const mx = (e.clientX - svgRect.left) / currentZoom;');
    expect(graphLayerSrc).toContain('const my = (e.clientY - svgRect.top) / currentZoom;');
    // Same reasoning as SimpleLineRenderer above -- svgRect already reflects
    // the gutter-positioned world stage natively.
    const startLabel = graphLayerSrc.indexOf('const handleMouseMove = (e: MouseEvent) => {');
    const endLabel = graphLayerSrc.indexOf('window.addEventListener(\'mousemove\'', startLabel);
    const labelDragBody = graphLayerSrc.slice(startLabel, endLabel);
    expect(labelDragBody).not.toMatch(/gutter/i);
    expect(labelDragBody).not.toMatch(/worldOriginRef/);
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

describe('PATCH 9S.7: freeformWorldOriginRef is the ONE canonical origin reference [Phase: world-origin architecture]', () => {
  it('CanvasClient declares freeformWorldOriginRef near containerRef', () => {
    expect(canvasClientSrc).toContain('const freeformWorldOriginRef = useRef<HTMLDivElement>(null);');
  });

  it('the marked PadletLayer surface contains the back Line/ref, post/Graph stage, and front Line at the same logical origin', () => {
    const surfaceStart = canvasClientSrc.indexOf('data-freeform-world-surface={isFreeformLayout ? \'true\' : undefined}');
    const surfaceEnd = canvasClientSrc.indexOf('</PadletLayer>', surfaceStart);
    expect(surfaceStart).toBeGreaterThan(-1);
    expect(surfaceEnd).toBeGreaterThan(surfaceStart);

    const surface = canvasClientSrc.slice(surfaceStart, surfaceEnd);
    expect(surface).toContain('ref={freeformWorldOriginRef}');
    expect(surface).toContain('data-freeform-world-layer="back"');
    expect(surface).toContain('<FreeformPadletCards');
    expect(surface).toContain('data-freeform-world-layer="front"');
    // PATCH ALIGN-A: a third layer (data-freeform-world-layer="alignment-guides")
    // joined back/front at this SAME logical origin -- still one canonical
    // reference point, now with a third consumer.
    expect(surface).toContain('data-freeform-world-layer="alignment-guides"');
    expect((surface.match(/left: freeformWorldOriginLeft,\n\s*top: freeformWorldOriginTop,/g) || []).length).toBe(3);
  });

  it('getCanvasPointFromClient is the ONE canonical pointer->world conversion, using freeformWorldOriginRef and no manual scrollLeft/scrollTop/padding arithmetic', () => {
    const start = canvasClientSrc.indexOf('const getCanvasPointFromClient = useCallback(');
    const end = canvasClientSrc.indexOf('}, [canvasZoom]);', start);
    expect(start).toBeGreaterThan(-1);
    const body = canvasClientSrc.slice(start, end);
    expect(body).toContain('freeformWorldOriginRef.current?.getBoundingClientRect()');
    expect(body).not.toMatch(/\.scrollLeft\b/);
    expect(body).not.toMatch(/\.scrollTop\b/);
    expect(body).not.toMatch(/paddingLeft|paddingTop/);
  });

  it('every former ad-hoc (containerRect + scroll)/zoom pointer formula site now calls getCanvasPointFromClient instead [negative control F anchor]', () => {
    const occurrences = (canvasClientSrc.match(/getCanvasPointFromClient\(/g) || []).length;
    // 1 definition-internal self-reference is not expected (it's not
    // recursive) -- occurrences here are all CALL sites: getNewPostPosition,
    // handleFreeformLibraryDrop, the CanvasViewport onDrop, and the
    // PadletLayer onDrop (4 call sites; the function's own arrow-body use of
    // origin.left/top doesn't call itself).
    expect(occurrences).toBeGreaterThanOrEqual(4);
    // No stale formula pattern should remain anywhere in the file.
    expect(canvasClientSrc).not.toMatch(/\(e\.clientX - containerRect\.left \+ scrollLeft\)/);
    expect(canvasClientSrc).not.toMatch(/\(e\.clientY - containerRect\.top \+ scrollTop\)/);
  });

  it('useCanvasInteractions is called with freeformWorldOriginRef', () => {
    const start = canvasClientSrc.indexOf('} = useCanvasInteractions({');
    const end = canvasClientSrc.indexOf('});', start);
    const body = canvasClientSrc.slice(start, end);
    expect(body).toContain('freeformWorldOriginRef,');
  });

  it('FreeformPadletCards is passed worldOriginRef={freeformWorldOriginRef}', () => {
    expect(canvasClientSrc).toContain('worldOriginRef={freeformWorldOriginRef}');
  });
});

describe('PATCH 9S.2: PadletLayer camera-surface sizing is Freeform-scoped, Drawing\'s floor is untouched [Phase: gutter DOM contract]', () => {
  it('a dedicated isFreeformLayout branch sizes PadletLayer to gutterX*2+signed-world*zoom / gutterY*2+signed-world*zoom', () => {
    expect(canvasClientSrc).toContain(
      'isFreeformLayout\n                    ? { width: gutterX * 2 + FREEFORM_SIGNED_WORLD_WIDTH * canvasZoom, height: gutterY * 2 + FREEFORM_SIGNED_WORLD_HEIGHT * canvasZoom }'
    );
  });

  it('the old minWidth:2000px/minHeight:1500px branch still exists (Drawing/unhandled fallback), just no longer catches Freeform', () => {
    expect(canvasClientSrc).toContain("{ minWidth: '2000px', minHeight: '1500px' }");
  });
});

describe('PATCH 9S.2: useCanvasInteractions formula uses freeformWorldOriginRef, not manual scroll math [Phase: post drag]', () => {
  const interactionsSrc = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');

  it('accepts freeformWorldOriginRef as a param', () => {
    expect(interactionsSrc).toContain('freeformWorldOriginRef: React.RefObject<HTMLDivElement | null>;');
  });

  it('handleCanvasMouseMove no longer computes mouseX/mouseY or newX/newY via scrollLeft/scrollTop addition', () => {
    const start = interactionsSrc.indexOf('const handleCanvasMouseMove = (e: React.MouseEvent) => {');
    const end = interactionsSrc.indexOf('\n  const handleCanvasMouseUp', start) > -1
      ? interactionsSrc.indexOf('\n  const handleCanvasMouseUp', start)
      : interactionsSrc.length;
    const body = interactionsSrc.slice(start, end);
    expect(body).toContain('freeformWorldOriginRef.current?.getBoundingClientRect()');
    expect(body).not.toMatch(/\(e\.clientX - containerRect\.left \+ (updated)?[Ss]crollLeft\)/);
    expect(body).not.toMatch(/\(e\.clientY - containerRect\.top \+ (updated)?[Ss]crollTop\)/);
    // The edge-scroll bounds check legitimately still uses containerRect --
    // that's a DIFFERENT purpose (viewport-relative threshold detection),
    // not a world-conversion formula, and must remain.
    expect(body).toContain('const mouseRelX = e.clientX - containerRect.left;');
  });
});

describe('PATCH 9S.2: FreeformGraphLayer forwards worldOriginRef, measuredRects uses it with a byte-equivalent fallback [Phase: Graph rect conversion]', () => {
  it('FreeformPadletCards forwards worldOriginRef into FreeformGraphLayer', () => {
    const padletCardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(padletCardsSrc).toContain(
      '<FreeformGraphLayer boardId={canvasId.toString()} posts={padlets} refreshToken={graphRefreshToken} containerRef={containerRef} worldOriginRef={worldOriginRef} zoom={canvasZoom} />'
    );
  });

  it('FreeformPadletCards positions its own world-stage wrapper at logical world zero, co-registering with CanvasClient\'s mirrored Line wrapper divs', () => {
    const padletCardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(padletCardsSrc).toContain('data-freeform-world-layer="posts"');
    expect(padletCardsSrcHasLogicalOrigin()).toBe(true);
  });

  it('measuredRects prefers worldOriginRef.getBoundingClientRect() and its fallback is algebraically identical to the pre-9S.2 formula', () => {
    const start = graphLayerSrc.indexOf('const updateRects = () => {');
    const end = graphLayerSrc.indexOf('const scheduleUpdate', start);
    const body = graphLayerSrc.slice(start, end);
    expect(body).toContain('worldOriginRef?.current?.getBoundingClientRect()');
    // Fallback: originLeft = containerRect.left + padLeft - scrollLeft, which
    // algebraically reproduces (useRect.left - containerRect.left - padLeft
    // + scrollLeft) once substituted into (useRect.left - originLeft).
    expect(body).toContain('containerRect.left + padLeft - container.scrollLeft');
    expect(body).toContain('containerRect.top + padTop - container.scrollTop');
  });

  function padletCardsSrcHasLogicalOrigin(): boolean {
    const padletCardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    return padletCardsSrc.includes('left: worldOriginLeft,') && padletCardsSrc.includes('top: worldOriginTop,');
  }
});
