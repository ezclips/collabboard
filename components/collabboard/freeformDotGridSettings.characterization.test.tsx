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

  it('grid spacing is 20 world units, scaled by canvasZoom', () => {
    expect(backgroundStyleFn).toContain('const dotGridSizePx = 20 * canvasZoom;');
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
