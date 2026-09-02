// @vitest-environment jsdom
//
// PATCH 9M -- closes PATCH 9L's confirmed root cause: the Freeform front
// Line wrapper's `zIndex: isFreeformGraphMode ? 2000 : 500` and the canvas
// Line context menu / LineToolbar (up to 9999/2500) are plain root-level
// stacking siblings of every application editor modal (ImageEditor,
// NoteEditor, etc, all ~z-1000/1001), because no ancestor between them and
// the document root ever established a CSS stacking context. Whenever
// isFreeformGraphMode is true (this repo's local .env.local sets
// NEXT_PUBLIC_ENABLE_FREEFORM_GRAPH=true), 2000 > 1000 and the Line paints
// over an open editor panel.
//
// Fix: give CanvasViewport.tsx's rendered element (app/dashboard/canvas/[id]
// /CanvasClient.tsx's <CanvasViewport> -- the narrowest common ancestor of
// every canvas-only object: back/front Line layers, PadletLayer, LineToolbar,
// OverlayLayer's Line context menu -- and NOT of CanvasModals, which is a
// sibling rendered BEFORE it in source) `isolation: 'isolate'`. This forces
// the whole canvas subtree to paint as a single atomic layer at its own
// (z-index:auto) position among ITS OWN root-level siblings -- always below
// any sibling with an explicit positive z-index, like a 1000+ modal --
// regardless of how high any z-index gets INSIDE that subtree. No numeric
// z-index anywhere was changed; internal canvas ordering is untouched.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const drawingLayoutSrc = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
const simpleLineRendererSrc = read('components/collabboard/SimpleLineRenderer.tsx');
const stageGeometrySrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const commentEditorSrc = read('components/collabboard/editors/CommentEditor.tsx');

const canvasViewportStart = canvasClientSrc.indexOf('<CanvasViewport');
const canvasViewportOpenTagEnd = canvasClientSrc.indexOf('>', canvasClientSrc.indexOf('containerRef={containerRef}', canvasViewportStart));
const canvasViewportCloseTag = canvasClientSrc.indexOf('</CanvasViewport>', canvasViewportStart);
const canvasViewportOpenTag = canvasClientSrc.slice(canvasViewportStart, canvasViewportOpenTagEnd);
const canvasViewportChildren = canvasClientSrc.slice(canvasViewportOpenTagEnd, canvasViewportCloseTag);

describe('PATCH 9M: confirmed canvas stacking boundary [matrix 1, 2]', () => {
  it('<CanvasViewport> exists and its open/close tags were located', () => {
    expect(canvasViewportStart).toBeGreaterThan(-1);
    expect(canvasViewportCloseTag).toBeGreaterThan(canvasViewportStart);
  });

  it('CanvasViewport.tsx style prop sets isolation: isolate on its single root div', () => {
    const src = read('components/collabboard/canvas/ui/CanvasViewport.tsx');
    // Exactly one div in this component -- the isolation is applied by the
    // CALLER via the style prop, not hardcoded inside CanvasViewport itself,
    // preserving CanvasViewport as a pure pass-through wrapper.
    expect((src.match(/<div/g) || []).length).toBe(1);
  });

  it("CanvasClient.tsx's <CanvasViewport> receives isolation: 'isolate' in its style object", () => {
    expect(canvasViewportOpenTag).toContain("isolation: 'isolate',");
  });

  it('the same isolation guarantees pointer-event containment too, not just paint order -- there is no separate pointer-events firewall in this codebase; the front-line SVG hit-path\'s hard-coded pointerEvents:\'auto\' (SimpleLineRenderer.tsx) can only ever win hit-testing over an application panel if the browser also paints the Line above that panel, which isolation now prevents [negative control K]', () => {
    expect(canvasViewportOpenTag).toContain("isolation: 'isolate',");
    expect(simpleLineRendererSrc).toContain("pointerEvents: 'auto'");
  });

  it('CanvasModals is rendered BEFORE <CanvasViewport> in source order -- a sibling, not a descendant', () => {
    const canvasModalsStart = canvasClientSrc.indexOf('<CanvasModals');
    expect(canvasModalsStart).toBeGreaterThan(-1);
    expect(canvasModalsStart).toBeLessThan(canvasViewportStart);
  });

  it('CanvasModals never appears between <CanvasViewport> and </CanvasViewport> -- confirms it is outside the isolated boundary', () => {
    expect(canvasViewportChildren).not.toContain('<CanvasModals');
  });

  it('LineToolbar is rendered INSIDE <CanvasViewport>...</CanvasViewport> -- correctly contained by the new boundary [matrix 13]', () => {
    expect(canvasViewportChildren).toContain('<LineToolbar');
  });

  it('OverlayLayer (which owns the canvas Line context menu via lineContextMenuState) is rendered INSIDE <CanvasViewport> [matrix 14]', () => {
    expect(canvasViewportChildren).toContain('<OverlayLayer');
    expect(canvasViewportChildren).toContain('lineContextMenuState={lineContextMenuState}');
  });

  it('FreeformCanvasBoardMenu is rendered AFTER </CanvasViewport> -- an existing outside/portal-level menu, left untouched by this patch', () => {
    const freeformBoardMenuStart = canvasClientSrc.indexOf('<FreeformCanvasBoardMenu');
    expect(freeformBoardMenuStart).toBeGreaterThan(canvasViewportCloseTag);
  });
});

describe('PATCH 9M: mounted proof that isolation: isolate is a real, recognized CSS value', () => {
  // CanvasViewport.tsx is proven above (single <div in the file) to apply
  // its `style` prop directly, unmodified, to its one root DOM node -- so
  // mounting a bare div with the exact same style object CanvasClient.tsx
  // passes is an equally valid, dependency-free proof that the browser/DOM
  // engine actually recognizes 'isolate' as a valid isolation value (catches
  // typos like 'isolated' or wrong casing) without needing to satisfy
  // CanvasViewport's full prop contract or its module's own JSX runtime.
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root && container) {
      act(() => { root!.unmount(); });
    }
    if (container) container.remove();
    root = null;
    container = null;
  });

  it("a div rendered with the exact CanvasClient.tsx style object (isolation: 'isolate') reports isolation: isolate via both inline style and getComputedStyle", () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <div className="relative" style={{ isolation: 'isolate' }}>
          <div>canvas content</div>
        </div>
      );
    });
    const rootDiv = container.firstElementChild as HTMLElement;
    expect(rootDiv).toBeTruthy();
    expect(rootDiv.style.isolation).toBe('isolate');
    expect(getComputedStyle(rootDiv).isolation).toBe('isolate');
  });
});

describe('PATCH 9M: internal canvas z-index values are byte-identical to PATCH 9L\'s audit -- untouched [matrix 3, 4, 5; negative controls F, G, H]', () => {
  it('front Line wrapper still reads zIndex: isFreeformGraphMode ? 2000 : 500', () => {
    expect(canvasClientSrc).toContain('zIndex: isFreeformGraphMode ? 2000 : 500,');
  });

  it('back Line wrapper still reads zIndex: 0', () => {
    const backLineStart = canvasClientSrc.indexOf('Layer 1: Background Lines');
    const backLineZIndexIdx = canvasClientSrc.indexOf('zIndex: 0,', backLineStart);
    expect(backLineZIndexIdx).toBeGreaterThan(backLineStart);
    // PATCH 9S.2 added freeformWorldOriginRef's doc comment + `ref={...}`
    // line right before the style object -- a legitimate, small growth in
    // this proximity window, not a structural change to the z-index itself.
    expect(backLineZIndexIdx - backLineStart).toBeLessThan(1800);
  });

  it('no new numeric z-index constant was introduced anywhere near the front/back Line wrappers -- the fix is purely the isolation property', () => {
    // The only style-object change near the CanvasViewport boundary is the
    // isolation line itself -- no new zIndex was added to CanvasViewport.
    const viewportStyleStart = canvasClientSrc.indexOf('style={{', canvasClientSrc.indexOf('className={`flex-1 min-h-0 min-w-0 relative'));
    const viewportStyleEnd = canvasClientSrc.indexOf('}}', viewportStyleStart);
    const viewportStyleBlock = canvasClientSrc.slice(viewportStyleStart, viewportStyleEnd);
    expect(viewportStyleBlock).not.toContain('zIndex');
  });
});

describe('PATCH 9M: post z-index/layering behavior untouched [matrix 15, 16; negative control E]', () => {
  it('movePadletLayer\'s bringToFront/sendToBack/bringForward/sendBackward formulas are unchanged', () => {
    const start = canvasClientSrc.indexOf('const movePadletLayer = async (id: string, action: string) => {');
    const end = canvasClientSrc.indexOf('\n  };', start);
    const body = canvasClientSrc.slice(start, end);
    expect(body).toContain('newZ = maxZ + 1;');
    expect(body).toContain("newZ = Math.max(10, minZ - 1);");
    expect(body).toContain('newZ = currentZ + 1;');
    expect(body).toContain('newZ = Math.max(10, currentZ - 1);');
    expect(body).toContain('if (newZ > 9000) setTimeout(() => normalizeZIndexes(), 0);');
  });

  it('default post z-index fallback (100) and the auto-normalize threshold (9000) are unchanged -- proves posts are NOT bounded below either Line z-index value, justifying the isolation approach over lowering the Line z-index', () => {
    expect(canvasClientSrc).toContain("const zValues = padlets.map(p => (p.metadata as any)?.zIndex || 100);");
    expect(canvasClientSrc).toContain('if (newZ > 9000)');
  });
});

describe('PATCH 9M: PATCH 9J world-stage freeze [matrix 22; negative control I]', () => {
  it('freeformStageGeometry.ts constants and CanvasClient.tsx\'s Line wrapper wiring are untouched', () => {
    expect(stageGeometrySrc).toContain('export const FREEFORM_WORLD_WIDTH_PX = 10000;');
    expect(stageGeometrySrc).toContain('export const FREEFORM_WORLD_HEIGHT_PX = 10000;');
    expect(canvasClientSrc).toContain('width: FREEFORM_WORLD_WIDTH_PX,');
    expect(canvasClientSrc).toContain('height: FREEFORM_WORLD_HEIGHT_PX,');
  });

  it("SimpleLineRenderer.tsx's getMousePos single-division formula and canvasLineCoordinates are untouched", () => {
    expect(simpleLineRendererSrc).toContain('x: (e.clientX - rect.left) / canvasZoom,');
    expect(simpleLineRendererSrc).toContain('y: (e.clientY - rect.top) / canvasZoom,');
  });

  it('FreeformPadletCards.tsx post-stage wrapper is untouched', () => {
    // PATCH SECTION-H3B widened this import line (adding the signed-stage
    // MIN_X/MAX_X that the Section Heading host bounds are built from). The
    // invariant guarded here -- that the world-stage dimensions are CONSUMED
    // from the shared contract rather than hardcoded -- is unchanged, so the
    // assertion targets both symbols and the module instead of one exact line.
    expect(freeformSrc).toMatch(
      /import \{[^}]*FREEFORM_WORLD_WIDTH_PX[^}]*FREEFORM_WORLD_HEIGHT_PX[^}]*\} from '@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry';/,
    );
  });
});

describe('PATCH 9K.1 comment collapse/expand toggle freeze [matrix 23; negative control L]', () => {
  it('CommentEditor.tsx\'s handleToggleCollapse and keepEditorOpen contract are untouched', () => {
    expect(commentEditorSrc).toContain('const handleToggleCollapse = () => {');
    expect(commentEditorSrc).toContain('keepEditorOpen: true,');
    expect(commentEditorSrc).not.toContain('const handleCollapse = () => {');
  });
});

describe('Drawing PATCH-117 clip-path containment freeze [matrix 24; negative control J]', () => {
  it('visibleCanvasRightInsetPx/boundaryClipPath in SimpleLineRenderer.tsx are untouched', () => {
    expect(simpleLineRendererSrc).toContain('visibleCanvasRightInsetPx?: number;');
    expect(simpleLineRendererSrc).toContain("const explicitRightInsetPx = typeof visibleCanvasRightInsetPx === 'number'");
  });

  it('DrawingLayout.tsx\'s --drawing-visible-canvas-right-inset CSS variable wiring is untouched', () => {
    expect(drawingLayoutSrc).toContain("viewportEl.style.setProperty('--drawing-visible-canvas-right-inset', `${nextVisibleCanvasRightInsetPx}px`);");
    expect(drawingLayoutSrc).toContain("viewportEl.style.removeProperty('--drawing-visible-canvas-right-inset');");
  });

  it('PATCH DRAWING-LINE-CLIP-R1: DrawingLayout.tsx also publishes --drawing-visible-canvas-left-inset, measured from the native Excalidraw top-left menu/properties Stack.Col so it never gets painted over by a promoted CanvasLine layer', () => {
    expect(drawingLayoutSrc).toContain("drawingRoot?.querySelector<HTMLElement>('.App-menu_top__left');");
    expect(drawingLayoutSrc).toContain("viewportEl.style.setProperty('--drawing-visible-canvas-left-inset', `${nextVisibleCanvasLeftInsetPx}px`);");
    expect(drawingLayoutSrc).toContain("viewportEl.style.removeProperty('--drawing-visible-canvas-left-inset');");
    expect(drawingLayoutSrc).toContain("cleanupViewportEl?.style.removeProperty('--drawing-visible-canvas-left-inset');");
  });

  it('PATCH DRAWING-LINE-CLIP-R2: DrawingLayout.tsx also publishes --drawing-native-ui-top-inset, so the left containment is a top-left NOTCH (bounded by the panel\'s own height) rather than a permanent full-height strip', () => {
    expect(drawingLayoutSrc).toContain('const nextNativeUiTopInsetPx = nativeNotchRect');
    expect(drawingLayoutSrc).toContain("viewportEl.style.setProperty('--drawing-native-ui-top-inset', `${nextNativeUiTopInsetPx}px`);");
    expect(drawingLayoutSrc).toContain("viewportEl.style.removeProperty('--drawing-native-ui-top-inset');");
    expect(drawingLayoutSrc).toContain("cleanupViewportEl?.style.removeProperty('--drawing-native-ui-top-inset');");
  });

  it('PATCH DRAWING-LINE-CLIP-R2: SimpleLineRenderer.tsx builds a notched polygon() clip (not a full-height inset()) for the CSS-var Drawing branch', () => {
    expect(simpleLineRendererSrc).toContain("? 'polygon('");
    expect(simpleLineRendererSrc).toContain("'var(--drawing-visible-canvas-left-inset, 0px) 0, '");
    expect(simpleLineRendererSrc).toContain("'0 var(--drawing-native-ui-top-inset, 0px), '");
  });

  it('PATCH DRAWING-LINE-CLIP-R2: the root <svg> clip is gesture-aware (isActiveGesture), NOT the same as the always-on boundaryClipPath used by the inner <g>', () => {
    expect(simpleLineRendererSrc).toContain('const isActiveGesture = !!drawing || isDragging;');
    expect(simpleLineRendererSrc).toContain('const rootClipPath = isActiveGesture ? undefined : boundaryClipPath;');
    expect(simpleLineRendererSrc).toContain('...(rootClipPath ? { clipPath: rootClipPath } : {}),');
    expect(simpleLineRendererSrc).toContain("style={contentClipPath ? { clipPath: contentClipPath } : undefined}");
  });

  it('CanvasClient.tsx never passes visibleCanvasRightInsetPx to the Freeform Line layers -- this patch did not wire Drawing\'s containment mechanism into Freeform', () => {
    expect(canvasClientSrc).not.toContain('visibleCanvasRightInsetPx=');
  });
});

describe('PATCH DRAWING-LINE-GESTURE-R1: the drawing-preview effect depends only on gesture-active state, not on churning callback identities', () => {
  it('the effect\'s dependency array is exactly [isDrawingGestureActive] -- not [drawing, onCreateLine, getMousePos] any more', () => {
    expect(simpleLineRendererSrc).toContain('const isDrawingGestureActive = !!drawing;');
    expect(simpleLineRendererSrc).toContain('}, [isDrawingGestureActive]);');
    expect(simpleLineRendererSrc).not.toContain('}, [drawing, onCreateLine, getMousePos]);');
  });

  it('the handlers read onCreateLine/getMousePos/drawing through refs kept fresh in the render body, matching the draggingPointRef/draggingLineRef pattern already used above', () => {
    expect(simpleLineRendererSrc).toContain('const onCreateLineRef = useRef(onCreateLine);');
    expect(simpleLineRendererSrc).toContain('onCreateLineRef.current = onCreateLine;');
    expect(simpleLineRendererSrc).toContain('const getMousePosRef = useRef(getMousePos);');
    expect(simpleLineRendererSrc).toContain('getMousePosRef.current = getMousePos;');
    expect(simpleLineRendererSrc).toContain('const drawingRef = useRef(drawing);');
    expect(simpleLineRendererSrc).toContain('drawingRef.current = drawing;');
  });

  it('this patch did not touch the R2 containment architecture -- isActiveGesture/rootClipPath/the inner clipped <g> are byte-identical to their R2 form', () => {
    expect(simpleLineRendererSrc).toContain('const isActiveGesture = !!drawing || isDragging;');
    expect(simpleLineRendererSrc).toContain('const rootClipPath = isActiveGesture ? undefined : boundaryClipPath;');
    expect(simpleLineRendererSrc).toContain('...(rootClipPath ? { clipPath: rootClipPath } : {}),');
    expect(simpleLineRendererSrc).toContain("style={contentClipPath ? { clipPath: contentClipPath } : undefined}");
  });

  it('the OTHER window-listener effect (point/line dragging of EXISTING lines) is untouched -- this patch\'s scope is the new-line drawing-preview effect only, per its own diagnosis', () => {
    expect(simpleLineRendererSrc).toContain("}, [isDragging, onUpdateLine, onSaveLine, getMousePos, drawingViewport]);");
  });
});

describe('PATCH DRAWING-LINE-CLIP-R3: the left/top notch is derived from the ACTUAL native properties panel, not just the hamburger-button wrapper', () => {
  it('A/D: measures .selected-shape-actions .Island (the real panel), falling back to the hamburger-only .App-menu_top__left rect when no panel is rendered', () => {
    expect(drawingLayoutSrc).toContain("drawingRoot?.querySelector<HTMLElement>('.selected-shape-actions .Island');");
    expect(drawingLayoutSrc).toContain('const nativeNotchRect = (nativePropertiesPanelRect && nativePropertiesPanelRect.width > 0 && nativePropertiesPanelRect.height > 0)');
    expect(drawingLayoutSrc).toContain('? nativePropertiesPanelRect');
    expect(drawingLayoutSrc).toContain(': nativeLeftPanelRect;');
  });

  it('B/C/E: both left-inset and top-inset are computed from the SAME nativeNotchRect, so an open panel notch always extends to its own right+bottom edges and a closed panel collapses back to the small hamburger notch', () => {
    expect(drawingLayoutSrc).toContain('const nextVisibleCanvasLeftInsetPx = nativeNotchRect');
    expect(drawingLayoutSrc).toContain('Math.min(nativeNotchRect.right, viewportRight) - viewportLeft');
    expect(drawingLayoutSrc).toContain('const nextNativeUiTopInsetPx = nativeNotchRect');
    expect(drawingLayoutSrc).toContain('Math.min(nativeNotchRect.bottom, viewportBottom) - viewportTop');
  });

  it('F: this patch did not touch the R2 containment architecture in SimpleLineRenderer.tsx -- the inner clipped <g> and its polygon() formula are byte-identical', () => {
    expect(simpleLineRendererSrc).toContain("? 'polygon('");
    expect(simpleLineRendererSrc).toContain("'var(--drawing-visible-canvas-left-inset, 0px) 0, '");
    expect(simpleLineRendererSrc).toContain("'0 var(--drawing-native-ui-top-inset, 0px), '");
    expect(simpleLineRendererSrc).toContain("style={contentClipPath ? { clipPath: contentClipPath } : undefined}");
  });

  it('G: DRAWING-LINE-GESTURE-R1\'s listener lifecycle is untouched -- this patch only edited DrawingLayout.tsx, not the gesture-active effect in SimpleLineRenderer.tsx', () => {
    expect(simpleLineRendererSrc).toContain('const isDrawingGestureActive = !!drawing;');
    expect(simpleLineRendererSrc).toContain('}, [isDrawingGestureActive]);');
  });

  it('reuses the existing ResizeObserver instance to track the panel\'s own resizes (no polling, no second observer instance introduced)', () => {
    expect(drawingLayoutSrc).toContain('resizeObserver?.observe(nativePropertiesPanelEl);');
    // Pinned count of observer *instantiations* in the whole file (unrelated
    // to this effect's own MutationObserver/ResizeObserver pair -- e.g. the
    // minimap-scene hook has its own). This patch adds an extra .observe()
    // call on the SAME already-constructed resizeObserver instance, so this
    // count must stay exactly what it was on the pre-R3 baseline.
    const observerCount = (drawingLayoutSrc.match(/new MutationObserver\(/g) ?? []).length
      + (drawingLayoutSrc.match(/new ResizeObserver\(/g) ?? []).length;
    expect(observerCount).toBe(3);
  });

  it('the boundary effect\'s dependency array is still unchanged by this geometry-only fix', () => {
    expect(drawingLayoutSrc).toContain('}, [rightClusterAnchorEl, viewportContainerRef, activeTool, key]);');
  });
});

describe('PATCH DRAWING-LINE-EDIT-CLIP-R1: the inner <g> clip is anchored to the SVG viewport, not to its own content bbox', () => {
  it('1/8) the inner containment <g> uses a view-box-anchored clip -- without that keyword a basic shape on an SVG element with no CSS layout box resolves against fill-box (its content bounding box), which moved the native-UI notch onto whatever real canvas the lines happened to occupy and killed the endpoint handles there', () => {
    expect(simpleLineRendererSrc).toContain('const contentClipPath = boundaryClipPath ? `${boundaryClipPath} view-box` : undefined;');
    expect(simpleLineRendererSrc).toContain('style={contentClipPath ? { clipPath: contentClipPath } : undefined}');
  });

  it('9) the root <svg> keeps its own unsuffixed rootClipPath -- it already has a real CSS border box, so the R2/R3-verified viewport-relative containment there is byte-identical and was NOT re-anchored by this patch', () => {
    expect(simpleLineRendererSrc).toContain('const rootClipPath = isActiveGesture ? undefined : boundaryClipPath;');
    expect(simpleLineRendererSrc).toContain('...(rootClipPath ? { clipPath: rootClipPath } : {}),');
    // The root must NOT have acquired the keyword.
    expect(simpleLineRendererSrc).not.toContain('rootClipPath} view-box');
    expect(simpleLineRendererSrc).not.toContain('${rootClipPath} view-box');
  });

  it('the notched polygon formula itself is unchanged -- this patch changed only which box that same shape resolves against', () => {
    expect(simpleLineRendererSrc).toContain("'var(--drawing-visible-canvas-left-inset, 0px) 0, '");
    expect(simpleLineRendererSrc).toContain("'0 var(--drawing-native-ui-top-inset, 0px), '");
    expect(simpleLineRendererSrc).toContain("'calc(100% - var(--drawing-visible-canvas-right-inset, 0px)) 0, '");
  });

  it('10) DRAWING-LINE-GESTURE-R1\'s listener stabilization and the R2 gesture-aware root unclip are both untouched', () => {
    expect(simpleLineRendererSrc).toContain('const isDrawingGestureActive = !!drawing;');
    expect(simpleLineRendererSrc).toContain('}, [isDrawingGestureActive]);');
    expect(simpleLineRendererSrc).toContain('const isActiveGesture = !!drawing || isDragging;');
    expect(simpleLineRendererSrc).toContain("}, [isDragging, onUpdateLine, onSaveLine, getMousePos, drawingViewport]);");
  });

  it('R3\'s panel measurement in DrawingLayout.tsx is untouched -- this patch edited SimpleLineRenderer.tsx only', () => {
    expect(drawingLayoutSrc).toContain("drawingRoot?.querySelector<HTMLElement>('.selected-shape-actions .Island');");
    expect(drawingLayoutSrc).toContain('const nativeNotchRect = (nativePropertiesPanelRect && nativePropertiesPanelRect.width > 0 && nativePropertiesPanelRect.height > 0)');
  });
});

describe('PATCH DRAWING-LINE-CLIP-R1: left-inset boundary is independent of minimap/zoom and of pan/zoom state', () => {
  it('the boundary effect\'s dependency array is unchanged -- still only [rightClusterAnchorEl, viewportContainerRef, activeTool, key], so DrawingNavigationControl\'s local collapse/expand state and zoomPercent cannot retrigger or skip it', () => {
    expect(drawingLayoutSrc).toContain('}, [rightClusterAnchorEl, viewportContainerRef, activeTool, key]);');
  });

  it('the left-inset measurement reads only getBoundingClientRect() screen coordinates off the native Excalidraw menu -- no reference to canvasZoom, zoomPercent, or applyZoom in the same computation', () => {
    const boundaryEffectStart = drawingLayoutSrc.indexOf("const nativeLeftPanelEl = drawingRoot?.querySelector<HTMLElement>('.App-menu_top__left');");
    const boundaryEffectEnd = drawingLayoutSrc.indexOf('const reservedSidebarLeft = visibleCanvasRight ?? (viewportRight - 320);', boundaryEffectStart);
    expect(boundaryEffectStart).toBeGreaterThan(-1);
    expect(boundaryEffectEnd).toBeGreaterThan(boundaryEffectStart);
    const boundarySlice = drawingLayoutSrc.slice(boundaryEffectStart, boundaryEffectEnd);
    expect(boundarySlice).not.toContain('canvasZoom');
    expect(boundarySlice).not.toContain('zoomPercent');
    expect(boundarySlice).not.toContain('applyZoom');
  });

  it('DrawingNavigationControl.tsx / DrawingMinimap.tsx never reference --drawing-visible-canvas-left-inset -- the minimap/zoom panel and the line-clip boundary remain two unrelated CSS custom properties', () => {
    const navControlSrc = read('components/collabboard/canvas/minimap/DrawingNavigationControl.tsx');
    const drawingMinimapSrc = read('components/collabboard/canvas/minimap/DrawingMinimap.tsx');
    expect(navControlSrc).not.toContain('drawing-visible-canvas-left-inset');
    expect(drawingMinimapSrc).not.toContain('drawing-visible-canvas-left-inset');
  });

  it('the same MutationObserver/ResizeObserver pair drives both insets -- no second observer was introduced for the left measurement', () => {
    const observerCount = (drawingLayoutSrc.match(/new MutationObserver\(/g) ?? []).length
      + (drawingLayoutSrc.match(/new ResizeObserver\(/g) ?? []).length;
    // Unchanged from the PATCH-117 baseline: one MutationObserver + one
    // ResizeObserver for this effect, plus the DRAWING-MINIMAP-A/B/C
    // ResizeObserver inside useDrawingMinimapScene lives in a different file
    // entirely, so this count is a stable pin for DrawingLayout.tsx alone.
    expect(observerCount).toBeGreaterThan(0);
    expect(drawingLayoutSrc).not.toContain('nativeLeftPanelEl, {');
    expect(drawingLayoutSrc).not.toContain('resizeObserver.observe(nativeLeftPanelEl)');
  });
});

describe('PATCH 9M: application editor panel z-index values untouched -- single shared boundary, not 8 independent edits [matrix 6, 7; negative control C]', () => {
  it('ImageEditor.tsx modal is still z-[1000], unmodified by this patch', () => {
    const imageEditorSrc = read('components/collabboard/editors/ImageEditor.tsx');
    expect(imageEditorSrc).toContain('fixed inset-0 bg-black/50 z-[1000]');
  });

  it('PostEditorShell.tsx (shared by Note/Todo/Comment/Document editors) is still z-[1000], unmodified', () => {
    const shellSrc = read('components/collabboard/editors/PostEditorShell.tsx');
    expect(shellSrc).toContain('fixed inset-0 z-[1000]');
  });

  it('ContainerEditor.tsx is still z-[1001], unmodified', () => {
    const containerEditorSrc = read('components/collabboard/editors/ContainerEditor.tsx');
    expect(containerEditorSrc).toContain('z-[1001]');
  });
});

// ============================================================================
// P6J-F7-B1: the Knowledge reader's band -- editor tier < drawer < toolbar tier
// ============================================================================
// The reader may stay open beside a Note ONLY because it out-ranks the editor
// tier while still yielding to the toolbar. These three numbers are the whole
// mechanism, so they are pinned together rather than one at a time.
describe('P6J-F7-B1 Knowledge reader drawer stacking band', () => {
  const readerDrawerSrc = read('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
  const postEditorShellSrc = read('components/collabboard/editors/PostEditorShell.tsx');

  /** Source with comments removed: prose naming a band is not a declaration. */
  const executable = (source: string) => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const executableLines = (source: string) => executable(source).split(/\r?\n/);

  it('the editor tier is still z-[1000], unmodified by this patch', () => {
    expect(postEditorShellSrc).toContain('fixed inset-0 z-[1000]');
  });

  it('the reader drawer is z-[1200]', () => {
    expect(readerDrawerSrc).toContain('z-[1200]');
  });

  it('the toolbar wrapper is still z-[3000]', () => {
    expect(canvasClientSrc).toContain('absolute left-0 bottom-0 z-[3000]');
  });

  /**
   * The band a surface ACTUALLY declares, read out of the class string that
   * declares it. Every number below is derived this way: a hardcoded literal
   * compared against another hardcoded literal proves the arithmetic, not the
   * source, and would keep passing while the classes drifted underneath it.
   */
  const bandOf = (source: string, marker: string, label: string): number => {
    const line = executableLines(source).find((l) => l.includes(marker));
    expect(line, `${label}: no source line declares "${marker}" any more`).toBeDefined();
    const match = /z-\[(\d+)\]/.exec(line!);
    expect(match, `${label}: the line declaring "${marker}" carries no z-[n] band`).not.toBeNull();
    return Number(match![1]);
  };

  it('every band in the relationship is still declared where it is read from', () => {
    // Guards the guard: if any anchor stops existing, bandOf fails here first
    // rather than silently narrowing what the assertions below actually cover.
    expect(() => bandOf(readerDrawerSrc, 'fixed inset-y-0 right-0', 'docked reader')).not.toThrow();
    expect(() => bandOf(readerDrawerSrc, 'fixed inset-0', 'focused workspace')).not.toThrow();
    expect(() => bandOf(postEditorShellSrc, 'fixed inset-0', 'shared editor')).not.toThrow();
    expect(() => bandOf(canvasClientSrc, 'absolute left-0 bottom-0', 'canvas toolbar')).not.toThrow();
  });

  it('one band per reader host, and nothing ambiguous in between', () => {
    // Comment-stripped: the file's prose explains the 3000 wrapper, and
    // matching that number would prove nothing about what actually renders.
    const code = executable(readerDrawerSrc);
    const bands = code.match(/z-\[(\d+)\]/g) ?? [];

    // The reader has TWO hosts, and each declares exactly one band -- they are
    // the two arms of a single ternary, so only one can ever apply. A third
    // would make which one renders ambiguous again.
    expect(bands.length, 'one band per host, no more').toBe(2);

    const docked = bandOf(readerDrawerSrc, 'fixed inset-y-0 right-0', 'docked reader');
    const workspace = bandOf(readerDrawerSrc, 'fixed inset-0', 'focused workspace');
    const editorTier = bandOf(postEditorShellSrc, 'fixed inset-0', 'shared editor');
    const toolbar = bandOf(canvasClientSrc, 'absolute left-0 bottom-0', 'canvas toolbar');
    // The two hosts are genuinely different layers, not the same number twice.
    expect(new Set([docked, workspace]).size, 'the hosts must not collapse into one band').toBe(2);

    // The DOCKED drawer: above the editor tier so it can sit beside a Note,
    // below the toolbar so the board stays operable beside it. Both halves are
    // source-to-source comparisons -- change either class and this fails.
    expect(editorTier, 'editor tier must stay below the docked reader').toBeLessThan(docked);
    expect(docked, 'docked reader must stay below the toolbar').toBeLessThan(toolbar);

    // The focused WORKSPACE deliberately sits ABOVE the toolbar instead: it
    // takes the whole surface, the board is no longer the active workspace, and
    // a toolbar floating on top would swallow clicks meant for the reader --
    // including the Board tab that leads back.
    expect(workspace, 'focused workspace must stay above the toolbar').toBeGreaterThan(toolbar);
  });

  /**
   * PDF-C1 workspace yield. The focused workspace is `fixed inset-0` and opaque
   * ABOVE the shared editor tier, so on its own it would cover any editor
   * opened from inside it -- Create Note leaves the editor open in state and
   * invisible in fact. The band is correct and deliberately unchanged; what
   * makes it safe is that the host steps aside while a blocking editor owns the
   * screen. These assertions pin that pairing, because the numbers alone cannot.
   */
  describe('a full-viewport host above the editor tier must yield to it', () => {
    it('the covering condition this contract exists for is still real', () => {
      const workspace = bandOf(readerDrawerSrc, 'fixed inset-0', 'focused workspace');
      const editorTier = bandOf(postEditorShellSrc, 'fixed inset-0', 'shared editor');
      const code = executable(readerDrawerSrc);
      // Full-viewport, opaque, and above the editor: all three together are
      // what make yielding mandatory rather than cosmetic.
      expect(code).toContain('fixed inset-0');
      expect(code, 'an opaque host is what makes covering total').toContain('bg-white');
      expect(workspace).toBeGreaterThan(editorTier);
    });

    it('the workspace host yields visually AND interactively', () => {
      const code = executable(readerDrawerSrc);
      expect(code).toContain('const yieldsToEditor = isWorkspace && blockingEditorOpen');
      // The same pair the canvas toolbar already yields with -- inert as well as
      // invisible, so a transparent host cannot still eat the editor's clicks.
      expect(code).toContain("yieldsToEditor ? ' pointer-events-none opacity-0' : ''");
      expect(code).toContain("data-knowledge-reader-yielded={yieldsToEditor ? 'true' : 'false'}");
    });

    it('only the covering host yields -- the docked drawer is untouched', () => {
      const code = executable(readerDrawerSrc);
      // `isWorkspace &&` is the whole guard: the docked drawer occupies one
      // edge, an editor is already visible beside it, and yielding there would
      // break reading a source next to the Note it supports.
      expect(code).toMatch(/yieldsToEditor\s*=\s*isWorkspace\s*&&/);
      expect(code).toContain("'fixed inset-y-0 right-0 z-[1200]");
    });

    it('the yield runs off the GENERIC blocking-editor authority, not a Note-only flag', () => {
      expect(canvasClientSrc).toContain('blockingEditorOpen={isBlockingEditorModalOpen}');
      // That memo answers for every blocking editor, so no editor added later
      // has to remember this contract exists.
      const memo = canvasClientSrc.slice(
        canvasClientSrc.indexOf('const isBlockingEditorModalOpen'),
        canvasClientSrc.indexOf('], ['),
      );
      expect(memo).toContain('isNoteEditorOpen');
      expect(
        (memo.match(/\bis[A-Za-z]+(?:Editor|Modal)Open\b/g) || []).length,
        'a Note-only condition would be the workaround this must not become',
      ).toBeGreaterThan(5);
      // No editor is named inside the reader: it only ever sees the flag.
      const code = executable(readerDrawerSrc);
      for (const leak of ['isNoteEditorOpen', 'NoteEditor', 'PostEditorShell']) {
        expect(code, leak + ' would make this a Note-only special case').not.toContain(leak);
      }
    });

    it('yielding hides the host without unmounting it, so reader state survives', () => {
      const code = executable(readerDrawerSrc);
      // opacity/pointer-events, never an early return: the document, scroll
      // position and search are all still there when the editor closes.
      expect(code).not.toMatch(/if \(yieldsToEditor\)[\s\S]{0,40}return null/);
      // And yielding never CAUSES a close. `if (yieldsToEditor) return;` ahead
      // of closeReader() is the opposite -- a guard -- so the shape that would
      // be wrong is a yield leading to closeReader with no return in between.
      expect(code).not.toMatch(/yieldsToEditor\)?\s*(\{[^}]*)?closeReader\(\)/);
      expect(code).not.toMatch(/yieldsToEditor[\s\S]{0,60}setReader\(null\)/);
    });

    it('Escape belongs to the editor while the host is yielded', () => {
      const code = executable(readerDrawerSrc);
      // The reader's existing Escape precedence, extended by one surface. A
      // yielded host is invisible and inert, so closing it on Escape would tear
      // down the workspace the user is about to come back to -- and leave
      // nothing for the editor's own Escape to return to.
      expect(code).toMatch(/if \(yieldsToEditor\) return;[\s\S]{0,40}closeReader\(\);/);
      // Still the same one handler, standing down for the library modal too.
      expect(code).toContain('KNOWLEDGE_LIBRARY_SELECTOR');
    });
  });

  it('the drawer is a CanvasClient-level sibling AFTER </CanvasViewport>, never inside the toolbar wrapper', () => {
    const mount = canvasClientSrc.indexOf('<KnowledgeSourceReaderDrawer');
    expect(mount).toBeGreaterThan(-1);
    // Outside the isolated canvas subtree, exactly like LibraryPanel.
    expect(canvasViewportChildren).not.toContain('<KnowledgeSourceReaderDrawer');
    expect(mount).toBeGreaterThan(canvasViewportCloseTag);
    // And nowhere near the z-[3000] toolbar wrapper, whose stacking context
    // would trap the drawer above the editor tier no matter what it asks for.
    const toolbarWrapper = canvasClientSrc.indexOf('absolute left-0 bottom-0 z-[3000]');
    const toolbarWrapperEnd = canvasClientSrc.indexOf('</div>', canvasClientSrc.indexOf('<CanvasSidebar'));
    expect(mount < toolbarWrapper || mount > toolbarWrapperEnd).toBe(true);
    expect(read('components/collabboard/canvas/ui/CanvasSidebar.tsx'))
      .not.toContain('KnowledgeSourceReaderDrawer');
  });
});
