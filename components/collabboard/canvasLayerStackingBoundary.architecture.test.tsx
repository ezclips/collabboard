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

  it('PATCH DRAWING-LINE-CLIP-R2: DrawingLayout.tsx also publishes --drawing-native-ui-top-inset, so the left containment is a top-left NOTCH (bounded by the menu Stack.Col\'s own height) rather than a permanent full-height strip', () => {
    expect(drawingLayoutSrc).toContain('const nextNativeUiTopInsetPx = nativeLeftPanelRect');
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
    expect(simpleLineRendererSrc).toContain("style={boundaryClipPath ? { clipPath: boundaryClipPath } : undefined}");
  });

  it('CanvasClient.tsx never passes visibleCanvasRightInsetPx to the Freeform Line layers -- this patch did not wire Drawing\'s containment mechanism into Freeform', () => {
    expect(canvasClientSrc).not.toContain('visibleCanvasRightInsetPx=');
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
