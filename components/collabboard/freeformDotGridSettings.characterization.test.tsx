// @vitest-environment jsdom
// PATCH SNAP-GRID-A: source-string characterization of the Freeform dot-grid
// background computation and the new grid-preference toggles, following this
// repo's established convention (see postResizeB1.integration.test.tsx) for
// verifying logic embedded inside CanvasClient.tsx without mounting the
// entire component tree.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

/** Source with comments stripped (repo convention -- see sectionHeading tests). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const clientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const menuSrc = read('components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx');
const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const handleSrc = read('components/collabboard/canvas/ui/PostResizeHandle.tsx');

function slice(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start, `marker not found: ${startMarker}`).toBeGreaterThan(-1);
  const end = src.indexOf(endMarker, start);
  expect(end, `end marker not found after start: ${endMarker}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('PATCH SNAP-GRID-A dot grid: Freeform-only, scales/pans with world coordinates', () => {
  const backgroundStyleFn = slice(
    code(clientSrc),
    'const canvasBackgroundStyle = useMemo(',
    '}, [canvas, freeformBoardAppearance, isFreeformLayout, canvasZoom, freeformWorldOriginLeft, freeformWorldOriginTop]);',
  );

  it('the dot pattern is gated on isFreeformLayout, not on showDotGrid alone', () => {
    expect(backgroundStyleFn).toContain('const showDotGrid = isFreeformLayout && freeformBoardAppearance.showDotGrid;');
  });

  it('grid spacing is FREEFORM_SNAP_GRID_SIZE world units (shared with drag snap, PATCH SNAP-GRID-C), scaled by canvasZoom for rendering only', () => {
    expect(backgroundStyleFn).toContain('const dotGridSizePx = FREEFORM_SNAP_GRID_SIZE * canvasZoom;');
    expect(code(clientSrc)).toMatch(/import\s*\{[\s\S]*?FREEFORM_SNAP_GRID_SIZE[\s\S]*?\}\s*from\s*'@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry'/);
  });

  it('grid position tracks the same world-origin values the Freeform world layers use for pan', () => {
    expect(backgroundStyleFn).toContain(
      'const dotGridPosition = `${freeformWorldOriginLeft}px ${freeformWorldOriginTop}px`;',
    );
  });

  it('when showDotGrid is false, the returned style has no dot backgroundImage (plain existing background)', () => {
    // The color-background branch (the common no-canvas-background case) --
    // its false branch must be the bare backgroundColor object, no dotPattern.
    const colorBranch = slice(backgroundStyleFn, "if (bgType === 'color' && bgValue) {", "if (bgType === 'gradient'");
    expect(colorBranch).toMatch(/:\s*\{\s*backgroundColor:\s*bgValue\s*\}\s*;/);
  });

  it('the memo recomputes when canvasZoom or world origin change, so panning/zooming updates the grid', () => {
    expect(code(clientSrc)).toContain(
      '}, [canvas, freeformBoardAppearance, isFreeformLayout, canvasZoom, freeformWorldOriginLeft, freeformWorldOriginTop]);',
    );
  });
});

describe('PATCH SNAP-GRID-A grid preferences: personal, permission-free, write no post data', () => {
  const setterFn = slice(
    code(clientSrc),
    'const setFreeformGridPreference = useCallback(',
    '}, [canvasId]);',
  );

  it('setFreeformGridPreference has no canUseFreeformEditButton (or other permission) gate', () => {
    expect(setterFn).not.toMatch(/canUseFreeformEditButton/);
    expect(setterFn).not.toMatch(/toast\.error/);
  });

  it('setFreeformGridPreference never touches padlets/post data -- only localStorage + local appearance state', () => {
    expect(setterFn).not.toMatch(/setPadlets|updateFieldsById|position_x|position_y|createSetBoardBackgroundCommand/);
    expect(setterFn).toContain('window.localStorage.setItem');
    expect(setterFn).toContain('setFreeformBoardAppearance');
  });

  it('showDotGrid and snapToGrid persist to distinct localStorage keys', () => {
    expect(code(clientSrc)).toContain("`freeform-board-dot-grid:${boardId}`");
    expect(code(clientSrc)).toContain("`freeform-board-snap-grid:${boardId}`");
  });

  it('onToggleDotGrid and onToggleSnapToGrid update distinct, independent keys', () => {
    const dotToggle = slice(code(clientSrc), 'onToggleDotGrid={() => {', 'onToggleSnapToGrid={() => {');
    const snapToggle = slice(code(clientSrc), 'onToggleSnapToGrid={() => {', '/>');
    expect(dotToggle).toContain('setFreeformGridPreference({ showDotGrid: !freeformBoardAppearance.showDotGrid });');
    expect(dotToggle).not.toContain('snapToGrid');
    expect(snapToggle).toContain('setFreeformGridPreference({ snapToGrid: !freeformBoardAppearance.snapToGrid });');
    expect(snapToggle).not.toContain('showDotGrid:');
  });

  it('persistFreeformBoardAppearance (the permission-gated background writer) no longer mentions showDotGrid at all', () => {
    const persistFn = slice(
      code(clientSrc),
      'const persistFreeformBoardAppearance = useCallback(',
      '}, [canUseFreeformEditButton, canvasId, canvas?.background_type, canvas?.background_value, freeformBoardAppearance]);',
    );
    expect(persistFn).not.toMatch(/showDotGrid:\s*(updates|boolean)/);
  });
});

describe('PATCH SNAP-GRID-A scope: resize, selection, and Drawing are untouched', () => {
  it('FreeformPadletCards has no new grid/snap references (selection and resize untouched)', () => {
    expect(code(cardsSrc)).not.toMatch(/snapToGrid|showDotGrid|dotGridPosition|dotGridSizePx/);
  });

  it('PostResizeHandle has no new grid/snap references (resize math untouched)', () => {
    expect(code(handleSrc)).not.toMatch(/snapToGrid|showDotGrid|dotGrid/);
  });

  it('the dot grid computation makes no reference to Drawing/Excalidraw', () => {
    const backgroundStyleFn = slice(
      code(clientSrc),
      'const canvasBackgroundStyle = useMemo(',
      '}, [canvas, freeformBoardAppearance, isFreeformLayout, canvasZoom, freeformWorldOriginLeft, freeformWorldOriginTop]);',
    );
    expect(backgroundStyleFn).not.toMatch(/isDrawingLayout|[Ee]xcalidraw/);
  });

  it('the Freeform board menu exposes Show Dot Grid and Snap to Grid as independent, unlinked props', () => {
    const propsBlock = slice(code(menuSrc), 'type FreeformCanvasBoardMenuProps = {', '};');
    expect(propsBlock).toContain('showDotGrid: boolean;');
    expect(propsBlock).toContain('snapToGrid: boolean;');
    expect(propsBlock).toContain('onToggleDotGrid: () => void;');
    expect(propsBlock).toContain('onToggleSnapToGrid: () => void;');
  });
});

describe('PATCH ALIGN-D alignment guides preference: same personal-preference mechanism, default ON', () => {
  const setterFn = slice(
    code(clientSrc),
    'const setFreeformGridPreference = useCallback(',
    '}, [canvasId]);',
  );

  it('persists to its own distinct localStorage key, a third sibling of the dot-grid/snap-grid keys', () => {
    expect(code(clientSrc)).toContain("`freeform-board-alignment-guides:${boardId}`");
  });

  it('defaults to ON: absence of a stored value means true, only an explicit "false" turns it off', () => {
    const loadEffect = slice(
      code(clientSrc),
      'const alignmentGuidesStorageKey = getFreeformAlignmentGuidesStorageKey(canvas?.id);',
      'setFreeformBoardAppearance({',
    );
    expect(loadEffect).toContain('window.localStorage.getItem(alignmentGuidesStorageKey)');
    const assignment = slice(code(clientSrc), 'alignmentGuidesEnabled: storedAlignmentGuides', ',');
    expect(assignment).toContain("!== 'false'");
  });

  it('setFreeformGridPreference has no permission gate for the alignment-guides update either', () => {
    expect(setterFn).not.toMatch(/canUseFreeformEditButton/);
  });

  it('setFreeformGridPreference writes the alignment-guides key only when that specific update is present, independent of showDotGrid/snapToGrid', () => {
    expect(setterFn).toContain('updates.alignmentGuidesEnabled !== undefined');
    expect(setterFn).toContain('getFreeformAlignmentGuidesStorageKey(canvasId)');
  });

  it('onToggleAlignmentGuides updates only its own key, not showDotGrid or snapToGrid', () => {
    const toggle = slice(code(clientSrc), 'onToggleAlignmentGuides={() => {', '/>');
    expect(toggle).toContain(
      'setFreeformGridPreference({ alignmentGuidesEnabled: !freeformBoardAppearance.alignmentGuidesEnabled });',
    );
    expect(toggle).not.toContain('showDotGrid:');
    expect(toggle).not.toContain('snapToGrid:');
  });

  it('the Freeform board menu exposes Alignment Guides as its own independent prop, not derived from the other two toggles', () => {
    const propsBlock = slice(code(menuSrc), 'type FreeformCanvasBoardMenuProps = {', '};');
    expect(propsBlock).toContain('alignmentGuides: boolean;');
    expect(propsBlock).toContain('onToggleAlignmentGuides: () => void;');
  });

  it('is wired into useCanvasInteractions as alignmentGuidesEnabled, driving detection rather than board-appearance rendering', () => {
    expect(code(clientSrc)).toContain('alignmentGuidesEnabled: freeformBoardAppearance.alignmentGuidesEnabled,');
  });
});
