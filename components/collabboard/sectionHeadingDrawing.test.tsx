// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildCanvasToolbarGroups } from '@/components/collabboard/canvas/ui/canvasToolbarRegistry';

/**
 * PATCH SECTION-H3C -- Section Heading is now also supported in Drawing,
 * using the SAME canonical data model, renderer (SectionHeadingPost),
 * toolbar (SectionHeadingToolbar) and engine (engine/sectionHeading.ts) as
 * Freeform. Nothing here re-implements any of that; every check either
 * exercises the SHARED module (already covered end-to-end by
 * sectionHeading*.test.tsx) or verifies DrawingLayout.tsx's own adapter
 * wiring at the source level.
 *
 * DrawingSectionHeadingCard and the other Drawing-internal pieces
 * (SectionHeadingSelectionStore, startSectionHeadingBodyDrag,
 * SECTION_HEADING_DRAWING_FRAME_PADDING_PX) are module-private -- not
 * exported, matching every other card component in this file
 * (DrawingEmbeddableCard is likewise never unit-mounted elsewhere in this
 * codebase). Behavioral correctness for the adapter was verified via a real
 * isolated-fixture browser pass (see the RETURN report); these tests lock
 * the underlying wiring in place as a source-level regression guard, the
 * same style already established for FreeformPadletCards.tsx's own wiring
 * in sectionHeadingContextMenu.test.tsx.
 */

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const drawingSrc = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const registrySrc = read('components/collabboard/canvas/ui/canvasToolbarRegistry.tsx');
const canvasContextMenuSrc = read('components/collabboard/canvas/ui/CanvasContextMenu.tsx');
const engineSrc = read('components/collabboard/canvas/engine/sectionHeading.ts');
const headingSrc = read('components/collabboard/canvas/ui/SectionHeadingPost.tsx');
const toolbarSrc = read('components/collabboard/canvas/ui/SectionHeadingToolbar.tsx');
const cameraSrc = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
const stageSrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
const navSrc = read('components/collabboard/canvas/minimap/FreeformNavigationControl.tsx');
const minimapGeometrySrc = read('components/collabboard/canvas/minimap/freeformMinimapGeometry.ts');
const forkDir = 'components/collabboard/canvas/excalidraw_fork';

const FLAGS = {
  isMapLayout: false, isFreeformLayout: false, isFreeformGraphMode: false,
  isTimelineLayout: false, chronoMode: null, canManageCanvasShare: false,
  canUseFreeformEditButton: true, isDrawingLayout: false,
};
function toolTypes(flags: Partial<typeof FLAGS>): string[] {
  return buildCanvasToolbarGroups({ ...FLAGS, ...flags } as never).flatMap((g) => g.tools.map((t) => t.type));
}

// ============================================================ TOOLBAR + CREATION [1-10]
describe('SECTION-H3C toolbar gating and creation [1-10]', () => {
  it('1. H is visible on Freeform', () => {
    expect(toolTypes({ isFreeformLayout: true })).toContain('section-heading');
  });

  it('1b. H is visible on Drawing', () => {
    expect(toolTypes({ isDrawingLayout: true })).toContain('section-heading');
  });

  it('2. Drawing creation produces a canonical section_heading', () => {
    const start = canvasClient.indexOf('const handleCreateSectionHeading = useCallback(async () => {');
    const end = canvasClient.indexOf('}, [canvasId, isFreeformLayout, isDrawingLayout,', start);
    expect(start).toBeGreaterThan(-1);
    const body = canvasClient.slice(start, end);
    expect(body).toContain("type: 'section_heading'");
    expect(body).toContain('if (!canvasId || !(isFreeformLayout || isDrawingLayout)) return;');
  });

  it('3. default H2 = 56, default width 500', () => {
    const start = canvasClient.indexOf('const handleCreateSectionHeading = useCallback(async () => {');
    const end = canvasClient.indexOf('}, [canvasId, isFreeformLayout, isDrawingLayout,', start);
    const body = canvasClient.slice(start, end);
    expect(body).toContain('const width = SECTION_HEADING_DEFAULT_WIDTH;');
    expect(body).toContain('const height = SECTION_HEADING_DEFAULT_HEIGHT;');
    expect(body).toContain('headingLevel: SECTION_HEADING_DEFAULT_LEVEL');
  });

  it('4. exactly one embeddable per heading -- reuses the SAME generic reconciliation every other post type uses, no heading-specific creation path', () => {
    // insertPadletEmbeddable / the reconciliation effect key off `nonDrawingRootPadlets`,
    // which Section Heading padlets satisfy generically (type !== "drawing", no parentId) --
    // no separate insertion function exists for it.
    expect(drawingSrc).not.toMatch(/insertSectionHeadingEmbeddable|createSectionHeadingEmbeddable/);
    expect(drawingSrc).toContain('const nonDrawingRootPadlets = padlets.filter((p) => p.type !== "drawing" && !p.metadata?.parentId);');
  });

  it('5. padlet:// canonical join is unchanged and generic', () => {
    expect(drawingSrc).toContain('link: `padlet://${padlet.id}`');
    expect(drawingSrc).toContain('validateEmbeddable={(link: string) => link.startsWith(\'padlet://\')}');
  });

  it('6. Drawing placement does not use the Freeform signed-world helper or its clamp', () => {
    const start = canvasClient.indexOf('const handleCreateSectionHeading = useCallback(async () => {');
    const end = canvasClient.indexOf('}, [canvasId, isFreeformLayout, isDrawingLayout,', start);
    const body = canvasClient.slice(start, end);
    expect(body).toContain('if (isDrawingLayout) {');
    expect(body).not.toMatch(/clampRectPositionToFreeformBounds/);
  });

  it('7. Drawing creation is immediate (no PlacementPrompt/Container-attach flow)', () => {
    const start = canvasClient.indexOf('const handleCreateSectionHeading = useCallback(async () => {');
    const end = canvasClient.indexOf('}, [canvasId, isFreeformLayout, isDrawingLayout,', start);
    const body = canvasClient.slice(start, end);
    expect(body).not.toMatch(/onDrawingPlacementStart|setDrawingContainerPromptOpen|checkPlacementRequired/);
  });

  it('8. structured layouts (Wall/Columns/Grid/Timeline/Map) still do not expose H', () => {
    expect(toolTypes({ isFreeformLayout: false, isDrawingLayout: false })).not.toContain('section-heading');
    expect(toolTypes({ isFreeformLayout: false, isTimelineLayout: true })).not.toContain('section-heading');
    expect(toolTypes({ isFreeformLayout: false, isMapLayout: true })).not.toContain('section-heading');
  });

  it('9. registry condition is the single shared gate (no duplicate H entry)', () => {
    const matches = registrySrc.match(/type: "section-heading"/g) ?? [];
    expect(matches.length).toBe(1);
    expect(registrySrc).toContain('...(isFreeformLayout || isDrawingLayout ? [');
  });

  it('10. Drawing does not introduce a native/parallel semantic model for headings', () => {
    expect(code(drawingSrc)).not.toMatch(/DrawingSectionHeading['"]|section_heading_native|type SectionHeadingElement/);
  });
});

// ============================================================ SHARED RENDERER / ADAPTER [11-20]
describe('SECTION-H3C shared renderer and host adapter [11-20]', () => {
  it('11. Drawing imports and uses the SAME SectionHeadingPost as Freeform', () => {
    expect(drawingSrc).toContain("import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';");
    expect(drawingSrc).toMatch(/<SectionHeadingPost\b/);
  });

  it('12. Drawing imports and uses the SAME SectionHeadingToolbar as Freeform', () => {
    expect(drawingSrc).toContain("import SectionHeadingToolbar from '@/components/collabboard/canvas/ui/SectionHeadingToolbar';");
    expect(drawingSrc).toMatch(/<SectionHeadingToolbar\b/);
  });

  it('13. Section Heading is routed to its own adapter instead of the generic DrawingEmbeddableCard', () => {
    expect(drawingSrc).toContain('if (isSectionHeading(padlet)) {');
    expect(drawingSrc).toContain('<DrawingSectionHeadingCard');
  });

  it('14. the host adapter supplies clientToWorld via toSceneCoords (Drawing\'s own client->scene converter), not Freeform math', () => {
    const start = drawingSrc.indexOf('function DrawingSectionHeadingCard(');
    const end = drawingSrc.indexOf('\ntype DrawingEmbeddableCardProps', start);
    const body = drawingSrc.slice(start, end);
    expect(body).toContain('return toSceneCoords(clientX, clientY, appStateRef.current);');
    expect(body).not.toMatch(/FREEFORM_WORLD|freeformStageGeometry|clampRectPositionToFreeformBounds/);
  });

  it('15. worldBounds is the unbounded contract, not a finite Freeform-style bound', () => {
    expect(drawingSrc).toContain('worldBounds={SECTION_HEADING_UNBOUNDED_WORLD}');
  });

  it('16. viewportRevision is provided and only bumps while a heading is actually selected (bounded re-render cost)', () => {
    expect(drawingSrc).toContain('viewportRevision={sectionHeadingViewportRevision}');
    const guardStart = drawingSrc.indexOf('if (selectedSectionHeadingIdRef.current) {');
    const bumpIndex = drawingSrc.indexOf('setSectionHeadingViewportRevision((rev) => rev + 1);', guardStart);
    expect(guardStart).toBeGreaterThan(-1);
    expect(bumpIndex).toBeGreaterThan(guardStart);
    expect(bumpIndex - guardStart).toBeLessThan(600);
  });

  it('17. the shared engine/sectionHeading.ts module has no Drawing/Excalidraw knowledge', () => {
    expect(code(engineSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
  });

  it('18. SectionHeadingPost.tsx has no Drawing/Excalidraw knowledge (still true after SECTION-H3C)', () => {
    expect(code(headingSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
  });

  it('19. SectionHeadingToolbar.tsx has no Drawing/Excalidraw knowledge', () => {
    expect(code(toolbarSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
  });

  it('20. onContextMenu stays the renderer-neutral forwarded callback -- no menu-shaped API leaked into the shared renderer', () => {
    expect(headingSrc).toContain('onContextMenu?: (event: React.MouseEvent, padletId: string) => void;');
    expect(code(headingSrc)).not.toMatch(/PositionedContextMenu|CanvasContextMenu/);
  });
});

// ============================================================ LEVEL / VISUAL PARITY [21-30]
describe('SECTION-H3C level and visual parity (all via the shared engine, no Drawing override) [21-30]', () => {
  it('21-24. H1-H4 heights are the canonical shared map, not duplicated in DrawingLayout', () => {
    expect(engineSrc).toContain('1: 64,');
    expect(engineSrc).toContain('2: 56,');
    expect(engineSrc).toContain('3: 48,');
    expect(engineSrc).toContain('4: 40,');
    // No restated level->height map literal anywhere in Drawing.
    expect(code(drawingSrc)).not.toMatch(/SECTION_HEADING_LEVEL_HEIGHT\s*[:=]|1:\s*64,\s*\n?\s*2:\s*56/);
  });

  it('25. width is preserved across level changes (onChangeLevel writes only headingLevel+height, atomically)', () => {
    const start = drawingSrc.indexOf('onChangeLevel={(padletId, level: SectionHeadingLevel) => {');
    const end = drawingSrc.indexOf('onChangeTextStyle=', start);
    const body = drawingSrc.slice(start, end);
    expect(body).toContain('headingLevel: level');
    expect(body).toContain('height: getSectionHeadingHeight(level)');
    expect(body).not.toMatch(/width:/);
  });

  it('26/27. square surface and square accent are inherited unchanged from SectionHeadingPost (no Drawing-side rounding override)', () => {
    expect(headingSrc).not.toMatch(/rounded-md|rounded-l-md/);
    const start = drawingSrc.indexOf('function DrawingSectionHeadingCard(');
    const end = drawingSrc.indexOf('\ntype DrawingEmbeddableCardProps', start);
    const body = code(drawingSrc.slice(start, end));
    expect(body).not.toMatch(/rounded-md|rounded-l-md|border-radius/);
  });

  it('28. the single shared optical text offset is inherited unchanged', () => {
    const matches = headingSrc.match(/translateY\(-\$\{SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX\}px\)/g) ?? [];
    expect(matches.length).toBe(1);
    expect(code(drawingSrc)).not.toMatch(/OPTICAL_OFFSET|translateY\(-\d/);
  });

  it('29. Appearance X is inherited unchanged (no second close-button implementation)', () => {
    const appearanceSrc = read('components/collabboard/canvas/ui/SectionHeadingAppearancePanel.tsx');
    expect(appearanceSrc).toContain('title="Close"');
    expect(code(drawingSrc)).not.toMatch(/title=.Close./);
  });

  it('30. min width 200 is the canonical shared constant, not restated in Drawing', () => {
    expect(engineSrc).toContain('export const SECTION_HEADING_MIN_WIDTH = 200;');
    expect(code(drawingSrc)).not.toMatch(/MIN_WIDTH|minWidth.*200/);
  });
});

// ============================================================ SELECTION / EDIT [31-40]
describe('SECTION-H3C selection and edit [31-40]', () => {
  it('31. selection is Drawing-host-owned state, an external store subscribed to via useSyncExternalStore', () => {
    expect(drawingSrc).toContain('class SectionHeadingSelectionStore {');
    expect(drawingSrc).toContain('useSyncExternalStore(');
  });

  it('32. the store\'s identity is stable -- Context value never changes reference because of selection (empirically required to avoid the tunnel-rat update loop)', () => {
    const start = drawingSrc.indexOf('const sectionHeadingContextValue = useMemo(');
    const end = drawingSrc.indexOf(');', start);
    const body = drawingSrc.slice(start, end);
    expect(body).not.toMatch(/selectedSectionHeadingId(?!Ref)/);
  });

  it('33. renderEmbeddable\'s own identity never depends on selection', () => {
    const start = drawingSrc.indexOf('const renderEmbeddable = useCallback((element: any) => {');
    const depsStart = drawingSrc.indexOf('}, [canvasId, commentAccessMode', start);
    const depsLine = drawingSrc.slice(depsStart, drawingSrc.indexOf(');', depsStart) + 2);
    expect(depsLine).not.toMatch(/selectedSectionHeadingId|sectionHeadingSelectionStore/);
  });

  it('34. handleChange (ExcalidrawWrapper onChange) reads selection via a ref, never as a reactive dependency, for the same reason', () => {
    const start = drawingSrc.indexOf('const handleChange = useCallback((elements: readonly any[], newAppState: any, files: any) => {');
    const depsStart = drawingSrc.indexOf('}, [onDeletePadlet, performSave, publishDrawingViewport, readOnly, schedulePadletPositionSave]);', start);
    expect(depsStart).toBeGreaterThan(start);
    const body = drawingSrc.slice(start, depsStart);
    expect(body).toContain('selectedSectionHeadingIdRef.current');
    expect(depsStart).toBeGreaterThan(-1);
  });

  it('35. the viewport-revision bump only fires when the camera actually moved (breaks the feedback loop where handleChange re-fires as a side effect of its own bump)', () => {
    expect(drawingSrc).toContain('lastSectionHeadingViewportRef');
    expect(drawingSrc).toMatch(/lastViewport\.zoom !== nextZoom \|\| lastViewport\.scrollX !== nextScrollX \|\| lastViewport\.scrollY !== nextScrollY/);
  });

  it('36. blank-canvas click deselects -- a plain onClick on the Drawing root, relying on SectionHeadingPost\'s own click stopPropagation (SECTION-H3B.1, unchanged) to exclude clicks on the heading itself', () => {
    // PATCH POST-RESIZE-B3.2: the same blank-canvas onClick now ALSO
    // deselects a selected Container (setSelectedContainerId(null)) -- still
    // one handler, still relying on the identical portaled-content
    // reasoning; Section Heading's own deselection call is untouched.
    // PATCH POST-RESIZE-B3.2.2: both calls are now guarded by
    // BlankDeselectGuard (a spurious-click suppression proven necessary
    // live -- see the guard's own comment), so they are no longer adjacent
    // on one line; assert they both still exist in the SAME handler.
    expect(drawingSrc).toMatch(/setSelectedSectionHeadingId\(null\);\s*setSelectedContainerId\(null\);/);
    const matches = code(headingSrc).match(/onClick=\{\(event\) => \{[\s\S]{0,120}?event\.stopPropagation\(\);/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('37. double-click / F2 / Enter / Escape edit entry and commit are inherited unchanged (no Drawing override)', () => {
    expect(code(drawingSrc)).not.toMatch(/onDoubleClick.*setIsEditing|key === .F2.|key === .Enter.|key === .Escape./);
  });

  it('38. input isolation (mousedown does not start a canvas/body drag while editing) is inherited: SectionHeadingPost\'s own onMouseDownCapture bail-out is untouched', () => {
    expect(code(headingSrc)).toMatch(/if \(isEditing\) return;\s*\n\s*onMouseDownCapture\(event, padlet\.id\);/);
  });

  it('39. resize handles own their own gesture -- the adapter\'s body-drag guard explicitly excludes them', () => {
    expect(drawingSrc).toContain("if (targetEl.closest?.('[data-section-heading-handle]')) return;");
  });

  it('40. right mouse button never starts a resize (shared, frozen guard from SECTION-H3B.4)', () => {
    expect(code(headingSrc)).toMatch(/if \(!canEdit \|\| !canResize \|\| event\.button === 2\) return;/);
  });
});

// ============================================================ RESIZE / NATIVE HANDLES [41-50]
describe('SECTION-H3C resize and native-handle suppression [41-50]', () => {
  it('41. the embeddable is locked for Section Heading (unchanged) and, as of PATCH POST-RESIZE-B3.2, also for Container -- never any other type', () => {
    expect(drawingSrc).toContain("locked: isSectionHeading(padlet) || padlet.type === 'container',");
  });

  it('42. the frame is padded horizontally so the shared resize handles are not clipped by the fork\'s overflow:hidden embeddable container -- Drawing-only accommodation, canonical geometry untouched', () => {
    expect(drawingSrc).toContain('const SECTION_HEADING_DRAWING_FRAME_PADDING_PX = 40;');
    expect(drawingSrc).toMatch(/x: padlet\.position_x - framePadding/);
    expect(drawingSrc).toMatch(/width: \(padlet\.width \?\? 320\) \+ framePadding \* 2/);
  });

  it('43. reconciliation mirrors the SAME padding on every pass, not just at creation', () => {
    expect(drawingSrc).toMatch(/const framePadding = isSectionHeading\(linkedPadlet\) \? SECTION_HEADING_DRAWING_FRAME_PADDING_PX : 0;/);
  });

  it('44. resize commit pushes the scene element directly (immediate consistency), then writes canonical position_x/width -- not CSS-only, not reliant solely on the passive reconciliation pass', () => {
    const start = drawingSrc.indexOf('onResizeCommit={(padletId, rect) => {');
    const end = drawingSrc.indexOf('}}\n        />\n      </div>', start);
    const body = drawingSrc.slice(start, end);
    expect(body).toContain('excAPI.updateScene(');
    expect(body).toContain('void onUpdatePadlet(padletId, { position_x: rect.x, width: rect.width });');
  });

  it('45. resize math itself is the SAME shared engine functions, not reimplemented for Drawing', () => {
    expect(engineSrc).toContain('export function resizeSectionHeadingRightEdge(');
    expect(engineSrc).toContain('export function resizeSectionHeadingLeftEdge(');
    expect(code(drawingSrc)).not.toMatch(/function resizeSectionHeading/);
  });

  it('46. height is never touched by resize (only x/width) -- the commit payload proves it', () => {
    const start = drawingSrc.indexOf('onResizeCommit={(padletId, rect) => {');
    const end = drawingSrc.indexOf('}}\n        />\n      </div>', start);
    const body = drawingSrc.slice(start, end);
    expect(body).not.toMatch(/height: rect/);
  });

  it('47. no per-element resize/rotation suppression touches the vendored Excalidraw fork', () => {
    expect(fs.existsSync(path.join(process.cwd(), forkDir))).toBe(true);
    // git-tracked diff proof lives in the RETURN report / git diff itself;
    // this asserts the suppression mechanism used (the `locked` element flag)
    // is a pre-existing fork feature consumed as-is, not a fork edit.
    expect(code(drawingSrc)).not.toMatch(/excalidraw_fork/);
  });

  it('48. the drag mechanism (body move) is a Drawing-only reimplementation of the SAME scene-mirroring approach the existing embeddable strip already uses -- not shared code duplicated blindly, but the same technique, documented as such', () => {
    expect(drawingSrc).toContain('function startSectionHeadingBodyDrag(');
    expect(drawingSrc).toMatch(/Same underlying mechanism as DrawingEmbeddableCard's drag-handle strip/);
  });

  it('49. drag-end un-pads the scene-frame x before it reaches canonical position_x', () => {
    expect(drawingSrc).toContain('const canonicalX = x + SECTION_HEADING_DRAWING_FRAME_PADDING_PX;');
  });

  it('50. canonical position/size authority: DrawingSectionHeadingCard never treats Excalidraw scene x/y/width as an independent source of truth -- every write path ends in onUpdatePadlet', () => {
    const start = drawingSrc.indexOf('function DrawingSectionHeadingCard(');
    const end = drawingSrc.indexOf('\ntype DrawingEmbeddableCardProps', start);
    const body = drawingSrc.slice(start, end);
    const updateCalls = body.match(/void onUpdatePadlet\(/g) ?? [];
    expect(updateCalls.length).toBeGreaterThanOrEqual(2); // title commit + resize commit
  });
});

// ============================================================ CONTEXT MENU [51-56]
describe('SECTION-H3C context menu [51-56]', () => {
  it('51. Section Heading gets its own minimal action set inside the SAME generic CanvasContextMenu (not a second menu system)', () => {
    expect(canvasContextMenuSrc).toContain('const isSectionHeadingType = padlet.type === "section_heading";');
    expect(canvasContextMenuSrc).toContain('{isSectionHeadingType ? (');
  });

  it('52. exact labels/order: Copy, Paste, Delete, separator, Bring to Front, Send to Back', () => {
    const start = canvasContextMenuSrc.indexOf('{isSectionHeadingType ? (');
    const end = canvasContextMenuSrc.indexOf(') : (', start);
    const body = canvasContextMenuSrc.slice(start, end);
    const labels = ['Copy', 'Paste', 'Delete', 'Bring to Front', 'Send to Back'];
    let cursor = -1;
    for (const label of labels) {
      const idx = body.indexOf(label, cursor + 1);
      expect(idx, `expected "${label}" to appear in order`).toBeGreaterThan(cursor);
      cursor = idx;
    }
    // Nothing else besides these five labels appears as row text (no Cut/
    // Duplicate/Rename/PNG export/forward-backward granularity).
    expect(body).not.toMatch(/>Cut<|>Duplicate<|>Rename<|PNG|backward|forward/i);
    expect(body).toMatch(/<PositionedContextMenuSeparator \/>/);
  });

  it('53. Copy/Paste/Delete reuse the exact same generic handlers every other post type\'s menu uses (onCopy/onPaste/onDelete props, not new functions)', () => {
    const start = canvasContextMenuSrc.indexOf('{isSectionHeadingType ? (');
    const end = canvasContextMenuSrc.indexOf(') : (', start);
    const body = canvasContextMenuSrc.slice(start, end);
    expect(body).toContain('onSelect={() => onCopy(padlet)}');
    expect(body).toContain('onSelect={() => onPaste(x, y)}');
    expect(body).toContain('onSelect={() => onDelete(padlet)}');
  });

  it('54. Bring to Front / Send to Back use metadata.zIndex (canonical), NOT Excalidraw scene-array reordering -- the generic Drawing path (handleBringToFront/handleSendToBack) is explicitly bypassed for this type', () => {
    expect(drawingSrc).toContain("onBringToFront={(p) => { if (isSectionHeading(p)) { void moveSectionHeadingZOrder(p, 'bringToFront'); } else { handleBringToFront(p); } setContextMenu(null); }}");
    expect(drawingSrc).toContain("onSendToBack={(p) => { if (isSectionHeading(p)) { void moveSectionHeadingZOrder(p, 'sendToBack'); } else { handleSendToBack(p); } setContextMenu(null); }}");
  });

  it('55. the z-order write is a single metadata.zIndex update via canonical onUpdatePadlet, matching Freeform\'s own max+1 / max(10,min-1) formula', () => {
    const start = drawingSrc.indexOf('const moveSectionHeadingZOrder = useCallback(');
    const end = drawingSrc.indexOf('}, [padlets, onUpdatePadlet]);', start);
    const body = drawingSrc.slice(start, end);
    expect(body).toContain("action === 'bringToFront' ? maxZ + 1 : Math.max(10, minZ - 1)");
    expect(body).toContain('await onUpdatePadlet(padlet.id, { metadata: { ...padlet.metadata, zIndex: newZ } });');
  });

  it('56. no direct Supabase/repository access inside the menu component', () => {
    expect(code(canvasContextMenuSrc)).not.toMatch(/supabase|createClient|Repository\(/i);
  });
});

// ============================================================ EXCLUSIONS + FREEZES [57-63]
describe('SECTION-H3C exclusions and freeze checks [57-63]', () => {
  it('57. Container exclusion holds by construction: Drawing creation never enters the Container-attach/placement-prompt flow at all for this type', () => {
    const start = canvasClient.indexOf('const handleCreateSectionHeading = useCallback(async () => {');
    const end = canvasClient.indexOf('}, [canvasId, isFreeformLayout, isDrawingLayout,', start);
    const body = canvasClient.slice(start, end);
    expect(body).not.toMatch(/parentId|childPadletIds|isContainer/);
  });

  it('58. Graph exclusion holds: Graph does not exist in Drawing at all (isFreeformGraphMode is Freeform-only), so there is nothing to gate', () => {
    expect(canvasClient).toContain('isFreeformGraphMode = isFreeformLayout &&');
  });

  it('59. no second realtime channel -- Drawing reuses the same generic onUpdatePadlet/onAddPadlet/onDeletePadlet props every other post type already flows through', () => {
    expect(code(drawingSrc)).not.toMatch(/supabase\.channel|\.subscribe\(\)/);
  });

  it('60. existing Drawings with no Section Heading are not rewritten merely because H support now exists (no migration/normalization write on load)', () => {
    expect(code(drawingSrc)).not.toMatch(/migrat|normalizeSectionHeading|backfillSectionHeading/i);
  });

  it('61. camera is unchanged', () => {
    expect(cameraSrc).toContain('const ZOOM_STEP = 0.1;');
    expect(cameraSrc).not.toMatch(/section_heading|SectionHeading/);
  });

  it('62. navigator/minimap are unchanged (Drawing navigation remains Excalidraw-owned, no Freeform minimap added to Drawing)', () => {
    expect(navSrc).not.toMatch(/section_heading|SectionHeading/);
    expect(minimapGeometrySrc).not.toMatch(/section_heading/);
    expect(code(drawingSrc)).not.toMatch(/FreeformMinimap|FreeformNavigationControl/);
  });

  it('63. Freeform signed-stage geometry is unchanged', () => {
    expect(stageSrc).not.toMatch(/section_heading|SectionHeading/);
    expect(code(drawingSrc)).not.toMatch(/-\s*5000|\b15000\b|FREEFORM_WORLD_MIN_X =/);
  });
});

// ============================================================ FREEFORM FREEZE [64-70]
describe('SECTION-H3C Freeform freeze -- unchanged from 4667783 [64-70]', () => {
  const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

  it('64. Freeform H1-H4 heights unchanged', () => {
    expect(engineSrc).toContain('1: 64,');
    expect(engineSrc).toContain('4: 40,');
  });

  it('65. Freeform selection stopPropagation guard unchanged (exactly once)', () => {
    const matches = code(headingSrc).match(/onClick=\{\(event\) => \{[\s\S]{0,120}?event\.stopPropagation\(\);/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('66. Freeform Section Heading context menu (SectionHeadingContextMenu.tsx) is untouched by this patch', () => {
    const menuSrc = read('components/collabboard/menus/SectionHeadingContextMenu.tsx');
    expect(menuSrc).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
  });

  it('67. FreeformPadletCards.tsx\'s own Section Heading wiring (handleSectionHeadingContextMenu, isSectionHeading split-render) is untouched', () => {
    expect(cardsSrc).toContain('const handleSectionHeadingContextMenu = React.useCallback');
    expect(cardsSrc).toContain('rootPadlets.filter(padlet => isSectionHeading(padlet)).map');
  });

  it('68. Freeform horizontal resize math unchanged', () => {
    expect(engineSrc).toContain('export function resizeSectionHeadingRightEdge(');
    expect(engineSrc).toContain('export function resizeSectionHeadingLeftEdge(');
  });

  it('69. Freeform Library/Group-into-Column/other post menus untouched', () => {
    const noteMenuSrc = read('components/collabboard/menus/NotePostContextMenu.tsx');
    expect(noteMenuSrc).not.toMatch(/SectionHeading|section-heading/);
  });

  it('70. Container-child and Graph-endpoint exclusion predicates are unchanged', () => {
    expect(engineSrc).toContain('export function canBeContainerChild(post: Pick<Padlet, \'type\'> | null | undefined): boolean {');
    expect(engineSrc).toContain('export function canBeGraphEndpoint(post: Pick<Padlet, \'type\'> | null | undefined): boolean {');
  });
});

// ============================================================ SECTION-H3C.1 CLOSURE -- NEW INVARIANTS [71-77]
describe('SECTION-H3C.1 closure -- invariants not directly covered by the H3C suite [71-77]', () => {
  it('71. no rotation is ever persisted for Section Heading -- resize commit never writes an angle, and the shared renderer has no rotation handle', () => {
    const start = drawingSrc.indexOf('onResizeCommit={(padletId, rect) => {');
    const end = drawingSrc.indexOf('}}\n        />\n      </div>', start);
    const body = drawingSrc.slice(start, end);
    expect(body).not.toMatch(/angle:/);
    expect(code(headingSrc)).not.toMatch(/rotation-handle|rotate\(/);
  });

  it('72. Excalidraw customData carries only the generic renderSignature -- no semantic heading fields are duplicated into the scene element (canonical ownership stays with the padlet)', () => {
    const start = drawingSrc.indexOf('const createEmbeddableElementForPadlet = useCallback((padlet: Padlet) => {');
    const end = drawingSrc.indexOf('}, [getPadletRenderSignature]);', start);
    const body = drawingSrc.slice(start, end);
    expect(body).toContain('customData: {\n        renderSignature: getPadletRenderSignature(padlet),\n      },');
    expect(body).not.toMatch(/headingLevel|titleStyle|accentColor/);
  });

  it('73. Container horizontal/vertical orientation is not implemented in this patch (explicit SECTION-H3C/H3C.1 scope boundary) -- no orientation field exists anywhere in DrawingLayout', () => {
    expect(code(drawingSrc)).not.toMatch(/containerOrientation|orientation:\s*['"](horizontal|vertical)['"]/);
  });

  it('74. body drag ends by writing through the SAME canonical position path every other Drawing post uses (savePadletPositionWithLock), un-padding the scene-frame offset first', () => {
    expect(drawingSrc).toContain('deps.onDragEnd?.(padletId, newX, newY);');
    const start = drawingSrc.indexOf('onDragEnd={(id, x, y) => {');
    const end = drawingSrc.indexOf('}}\n        />', start);
    const body = drawingSrc.slice(start, end);
    expect(body).toContain('const canonicalX = x + SECTION_HEADING_DRAWING_FRAME_PADDING_PX;');
    expect(body).toContain('savePadletPositionWithLock(id, canonicalX, y);');
  });

  it('75. the frame-padding offset is the same 40px constant everywhere it is used -- creation, reconciliation, drag-end and resize-commit never restate a different literal', () => {
    const paddingUses = drawingSrc.match(/SECTION_HEADING_DRAWING_FRAME_PADDING_PX/g) ?? [];
    expect(paddingUses.length).toBeGreaterThanOrEqual(5);
    expect(drawingSrc).toContain('const SECTION_HEADING_DRAWING_FRAME_PADDING_PX = 40;');
  });

  it('76. ordinary (non-heading, non-Container) embeddables are never locked -- the locked flag is gated exclusively by isSectionHeading / padlet.type === \'container\', never a hardcoded true', () => {
    expect(drawingSrc).toContain("locked: isSectionHeading(padlet) || padlet.type === 'container',");
    // Reconciliation mirrors the same two-condition gate on every pass (PATCH POST-RESIZE-B3.2).
    expect(drawingSrc).toContain("const nextLocked = isSectionHeading(linkedPadlet) || linkedPadlet.type === 'container';");
    expect(drawingSrc).not.toMatch(/locked:\s*true\b/);
  });

  it('77. the one-embeddable-per-padlet invariant is enforced structurally: insertion checks for an existing link before creating, and reconciliation computes missing-vs-existing by link before creating any', () => {
    expect(drawingSrc).toContain('const alreadyExists = currentElements.some(');
    expect(drawingSrc).toContain('if (alreadyExists) return;');
    expect(drawingSrc).toContain('.filter((p) => !existingLinks.has(`padlet://${p.id}`))');
  });
});
