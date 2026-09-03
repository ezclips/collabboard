import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TEXT_ANNOTATION_EDGE_MARGIN,
  clampTextAnnotationTop,
  measureTextAnnotationBox,
} from './imageTextAnnotationBox';
import {
  applyRedo,
  applyUndo,
  insertRectAt,
  isStrokeAction,
  type DrawingAction,
  type DrawnRect,
} from './imageDrawingHistory';

/**
 * R6F -- popup stacking, the text box's vertical bound, and rectangle deletion.
 *
 * The stacking part is asserted as an ORDERING between numbers read out of the
 * real source, not as "contains z-[60200]": the defect was never a wrong
 * literal, it was two literals that stopped being in the right relationship
 * when R6D moved one of them.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const drawingLayer = read('components/collabboard/editors/ImageDrawingLayer.tsx');
const drawingPopups = read('components/collabboard/editors/DrawingPopups.tsx');
const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

/** Every `z-[N]` in a source file, as numbers. */
function zTiers(source: string): number[] {
  return [...source.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]));
}

/** The single tier the drawing subtool's popups declare. */
function popupTier(): number {
  const match = /IMAGE_SUBTOOL_POPUP_Z_CLASS = 'z-\[(\d+)\]'/.exec(drawingPopups);
  expect(match, 'DrawingPopups must export one popup tier').not.toBeNull();
  return Number(match![1]);
}

/** The Draw-on-top modal root's own tier. */
function drawModalTier(): number {
  const match = /className="fixed inset-0 z-\[(\d+)\] bg-black/.exec(drawingLayer);
  expect(match, 'the drawing modal root must declare a tier').not.toBeNull();
  return Number(match![1]);
}

/** The retained image editor overlay's tier. */
function imageOverlayTier(): number {
  // Anchored on the overlay's own data-ui, not on its classes: several centred
  // black scrims in this file share the same class shape.
  const at = freeform.indexOf('data-ui="freeform-image-editor-overlay"');
  expect(at, 'the image overlay must exist').toBeGreaterThan(-1);
  const match = /className="fixed inset-0 z-\[(\d+)\]/.exec(freeform.slice(Math.max(0, at - 400), at));
  expect(match, 'the image overlay must declare a tier').not.toBeNull();
  return Number(match![1]);
}

describe('R6F-1..10: Draw-on-top popups paint above the modal that owns them', () => {
  it('R6F-1: the draw modal still sits above the retained image overlay (R6D kept)', () => {
    expect(drawModalTier()).toBeGreaterThan(imageOverlayTier());
    expect(drawModalTier()).toBe(60100);
    expect(imageOverlayTier()).toBe(60000);
  });

  it('R6F-2..7: every popup surface is ABOVE the modal, via one shared tier', () => {
    // THE defect: these portals mount under <body>, so their z-index competes
    // directly with the modal's. R6D raised the modal to 60100 and left the
    // popups at 220, which put all six controls behind an opaque backdrop.
    expect(popupTier()).toBeGreaterThan(drawModalTier());

    // All six surfaces -- Brush Size and Color (DrawingPopups) plus Font Size,
    // Text Color, Box Border Color and Background Opacity (local) -- reference
    // the one constant, so they cannot drift apart again.
    const localUses = drawingLayer.match(/\$\{IMAGE_SUBTOOL_POPUP_Z_CLASS\}/g) ?? [];
    const sharedUses = drawingPopups.match(/\$\{IMAGE_SUBTOOL_POPUP_Z_CLASS\}/g) ?? [];
    expect(localUses).toHaveLength(4);
    expect(sharedUses).toHaveLength(3);
    expect(drawingLayer).toContain("IMAGE_SUBTOOL_POPUP_Z_CLASS } from './DrawingPopups'");
  });

  it('R6F-2b: no portalled popup surface is left below the modal', () => {
    // Only the PORTALLED surfaces matter. z-[210] is the drawing toolbar, which
    // lives inside the modal's own stacking context and is correctly unrelated
    // to this ordering -- raising it would be exactly the "scatter unrelated
    // z-index changes" the brief warns against.
    for (const [name, source] of [['ImageDrawingLayer', drawingLayer], ['DrawingPopups', drawingPopups]] as const) {
      const popupContentTiers = [...source.matchAll(/<Popover\.Content[\s\S]{0,200}?z-\[(\d+)\]/g)]
        .map((m) => Number(m[1]));
      expect(popupContentTiers, `${name} has a Popover.Content below the modal`).toEqual([]);
      // Comments are prose -- and this fix's own comments name the tier it removed.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
      expect(code, `${name} still declares the stale 220 tier`).not.toContain('z-[220]');
    }
    // ...and the toolbar deliberately keeps its in-modal tier.
    expect(zTiers(drawingLayer)).toContain(210);
  });

  it('R6F-8,9: popups keep the modal open and the annotation selected', () => {
    // Radix portals escape the modal's DOM subtree, so the modal's own
    // stopPropagation cannot help -- the guarantee has to come from the
    // triggers not stealing focus/selection in the first place. R6E put these
    // in; R6F must not have disturbed them.
    expect(drawingLayer.match(/onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/g) ?? []).toHaveLength(4);
    expect(drawingLayer.match(/onOpenAutoFocus=\{\(e\) => e\.preventDefault\(\)\}/g) ?? []).toHaveLength(4);
    // And nothing in the popup path closes the drawing modal.
    expect(drawingLayer).not.toMatch(/Popover\.Content[\s\S]{0,400}onCancel\(\)/);
  });

  it('R6F-10: DrawingPopups has exactly one caller, so raising it changes one contract', () => {
    // The prompt's caution: a shared popup module must not be globally raised.
    // It is not shared -- this is the check that keeps that true.
    const callers = ['components', 'app', 'lib']
      .flatMap((dir) => walk(dir))
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.endsWith('DrawingPopups.tsx'))
      .filter((file) => /from '.*DrawingPopups'/.test(fs.readFileSync(file, 'utf8')));
    expect(callers.map((f) => f.replace(/\\/g, '/'))).toEqual([
      'components/collabboard/editors/ImageDrawingLayer.tsx',
    ]);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'excalidraw_fork') continue;
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

// --- Text bounds ----------------------------------------------------------

describe('R6F-11..20: a text annotation stays inside the image vertically', () => {
  /** The reported case: an image 300 tall, text near the bottom. */
  const IMAGE_HEIGHT = 300;
  /** 0.5em per character, the same believable measurer the R6D tests use. */
  const measure = (fontSize: number) => (line: string) => line.length * fontSize * 0.5;

  /** "Hallo World" forced to wrap into two lines by the available width. */
  function halloWorldBox(fontSize = 24, maxBoxWidth = 100) {
    return measureTextAnnotationBox('Hallo World', fontSize, measure(fontSize), maxBoxWidth);
  }

  it('R6F-11: two-line bottom-edge text is moved up until it fully fits', () => {
    const box = halloWorldBox();
    expect(box.lines).toEqual(['Hallo', 'World']);

    // Placed near the bottom, the SECOND line would fall outside the image.
    const requestedTop = 280;
    expect(requestedTop + box.boxHeight).toBeGreaterThan(IMAGE_HEIGHT);

    const top = clampTextAnnotationTop(requestedTop, box.boxHeight, IMAGE_HEIGHT);
    expect(top).toBeLessThan(requestedTop);
    expect(top + box.boxHeight).toBeLessThanOrEqual(IMAGE_HEIGHT - TEXT_ANNOTATION_EDGE_MARGIN);
    // The complete second line is inside: its baseline row ends at the box
    // bottom, which is now within bounds.
    const secondLineBottom = top + box.padding + 2 * box.lineHeight;
    expect(secondLineBottom).toBeLessThanOrEqual(IMAGE_HEIGHT);
  });

  it('R6F-12: a third line moves it up again -- the rule is re-applied, not once', () => {
    const two = halloWorldBox();
    const three = measureTextAnnotationBox('Hallo World Again', 24, measure(24), 100);
    expect(three.lines).toEqual(['Hallo', 'World', 'Again']);

    const topTwo = clampTextAnnotationTop(280, two.boxHeight, IMAGE_HEIGHT);
    const topThree = clampTextAnnotationTop(280, three.boxHeight, IMAGE_HEIGHT);
    expect(topThree).toBeLessThan(topTwo);
    expect(topThree + three.boxHeight).toBeLessThanOrEqual(IMAGE_HEIGHT - TEXT_ANNOTATION_EDGE_MARGIN);
  });

  it('R6F-13: y clamps upward as height grows, monotonically', () => {
    let previous = Infinity;
    for (const lineCount of [1, 2, 3, 4]) {
      const box = measureTextAnnotationBox(
        Array.from({ length: lineCount }, () => 'Hallo').join('\n'), 24, measure(24),
      );
      const top = clampTextAnnotationTop(280, box.boxHeight, IMAGE_HEIGHT);
      expect(top).toBeLessThanOrEqual(previous);
      expect(top + box.boxHeight).toBeLessThanOrEqual(IMAGE_HEIGHT);
      previous = top;
    }
  });

  it('R6F-14: never a negative y, and never NaN', () => {
    expect(clampTextAnnotationTop(-40, 50, IMAGE_HEIGHT)).toBe(0);
    expect(clampTextAnnotationTop(Number.NaN, 50, IMAGE_HEIGHT)).toBe(0);
    expect(clampTextAnnotationTop(280, Number.NaN, IMAGE_HEIGHT)).not.toBeNaN();
    expect(clampTextAnnotationTop(280, 50, Number.NaN)).not.toBeNaN();
  });

  it('R6F-14b: an annotation taller than the image pins to the top, it does not go negative', () => {
    // The extreme case: no position fits. Hiding the FIRST line by resolving to
    // a negative y would be the worse failure.
    const top = clampTextAnnotationTop(120, IMAGE_HEIGHT + 200, IMAGE_HEIGHT);
    expect(top).toBe(0);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it('R6F-15: right-edge narrowing wraps more, and the extra height still fits', () => {
    // Near the right edge the available width shrinks, so the same string wraps
    // into more lines -- which is exactly the interaction that used to clip.
    const narrow = measureTextAnnotationBox('Hallo World', 24, measure(24), 90);
    const wide = measureTextAnnotationBox('Hallo World', 24, measure(24), 400);
    expect(narrow.lines.length).toBeGreaterThan(wide.lines.length);

    const top = clampTextAnnotationTop(285, narrow.boxHeight, IMAGE_HEIGHT);
    expect(top + narrow.boxHeight).toBeLessThanOrEqual(IMAGE_HEIGHT - TEXT_ANNOTATION_EDGE_MARGIN);
  });

  it('R6F-16: increasing the font size re-clamps vertically', () => {
    const small = halloWorldBox(24);
    const large = measureTextAnnotationBox('Hallo World', 40, measure(40), 100);
    expect(large.boxHeight).toBeGreaterThan(small.boxHeight);

    const topSmall = clampTextAnnotationTop(280, small.boxHeight, IMAGE_HEIGHT);
    const topLarge = clampTextAnnotationTop(280, large.boxHeight, IMAGE_HEIGHT);
    expect(topLarge).toBeLessThan(topSmall);
    expect(topLarge + large.boxHeight).toBeLessThanOrEqual(IMAGE_HEIGHT - TEXT_ANNOTATION_EDGE_MARGIN);
  });

  it('R6F-19: text that already fits is not moved at all', () => {
    const box = halloWorldBox();
    for (const top of [0, 10, 100]) {
      expect(clampTextAnnotationTop(top, box.boxHeight, IMAGE_HEIGHT)).toBe(top);
    }
  });

  it('R6F-19b: an unmeasured container is "no bound known", not a zero-height image', () => {
    // On the first render pass the container has no layout. Clamping against 0
    // would slam every annotation to the top of the image.
    expect(clampTextAnnotationTop(280, 90, 0)).toBe(280);
    expect(clampTextAnnotationTop(280, 90, -1)).toBe(280);
    // A negative y is still corrected, because that is never right.
    expect(clampTextAnnotationTop(-5, 90, 0)).toBe(0);
  });
});

// --- Rectangle history ----------------------------------------------------

describe('R6F-21..27: deleting one rectangle, and undoing that deletion', () => {
  const rect = (id: string): DrawnRect => ({
    id, x1: 0, y1: 0, x2: 10, y2: 10, color: '#ef4444', strokeWidth: 5, path: `M0 0 ${id}`,
  });
  const A = rect('A');
  const B = rect('B');
  const C = rect('C');

  it('R6F-25,26: delete A, then undo restores it to its original index; redo removes it', () => {
    // The reported scenario, plus the ordering that made LIFO undo wrong: A is
    // not the last thing that happened.
    const afterDraw = [A, B, C];
    const action: DrawingAction = { type: 'rect-delete', rect: A, index: 0 };

    const afterDelete = [B, C];
    const undone = applyUndo(afterDelete, action);
    expect(undone.map((r) => r.id)).toEqual(['A', 'B', 'C']);
    expect(undone).toEqual(afterDraw);

    const redone = applyRedo(undone, action);
    expect(redone.map((r) => r.id)).toEqual(['B', 'C']);
  });

  it('R6F-25b: a restored rectangle returns to its position, not to the end', () => {
    const undone = applyUndo([A, C], { type: 'rect-delete', rect: B, index: 1 });
    expect(undone.map((r) => r.id)).toEqual(['A', 'B', 'C']);
  });

  it('R6F-24: undoing a DRAW removes that specific rectangle, leaving the others', () => {
    const undone = applyUndo([A, B, C], { type: 'rect', rect: B });
    expect(undone.map((r) => r.id)).toEqual(['A', 'C']);
    expect(applyRedo(undone, { type: 'rect', rect: B }).map((r) => r.id)).toEqual(['A', 'C', 'B']);
  });

  it('R6F-24b: stroke actions never touch the rectangle list', () => {
    const rects = [A, B];
    expect(applyUndo(rects, { type: 'stroke' })).toEqual(rects);
    expect(applyRedo(rects, { type: 'stroke' })).toEqual(rects);
    expect(isStrokeAction({ type: 'stroke' })).toBe(true);
    expect(isStrokeAction({ type: 'rect', rect: A })).toBe(false);
    expect(isStrokeAction({ type: 'rect-delete', rect: A, index: 0 })).toBe(false);
  });

  it('R6F-24c: undo/redo never mutate the array they are handed', () => {
    const rects = [A, B];
    const frozen = Object.freeze([...rects]);
    expect(() => applyUndo(frozen, { type: 'rect', rect: A })).not.toThrow();
    expect(rects.map((r) => r.id)).toEqual(['A', 'B']);
  });

  it('R6F-23: an out-of-range restore index is tolerated rather than producing holes', () => {
    expect(insertRectAt([A], B, 99).map((r) => r.id)).toEqual(['A', 'B']);
    expect(insertRectAt([A], B, -5).map((r) => r.id)).toEqual(['B', 'A']);
    expect(insertRectAt([A], B, Number.NaN).map((r) => r.id)).toEqual(['A', 'B']);
  });

  it('the full reported sequence: draw A, stroke B, delete A -- B survives, undo brings A back', () => {
    let rects: DrawnRect[] = [];
    const undoStack: DrawingAction[] = [];

    rects = [...rects, A];
    undoStack.push({ type: 'rect', rect: A });
    undoStack.push({ type: 'stroke' });               // stroke B

    const index = rects.findIndex((r) => r.id === 'A');
    const deletion: DrawingAction = { type: 'rect-delete', rect: A, index };
    rects = rects.filter((r) => r.id !== 'A');
    undoStack.push(deletion);

    expect(rects).toEqual([]);                         // only A went
    expect(undoStack).toHaveLength(3);                 // the stroke is untouched

    const last = undoStack.pop()!;
    rects = applyUndo(rects, last);
    expect(rects.map((r) => r.id)).toEqual(['A']);     // Undo restores A
    // ...and the stroke is still the next thing that would be undone.
    expect(undoStack[undoStack.length - 1]).toEqual({ type: 'stroke' });

    rects = applyRedo(rects, last);
    expect(rects).toEqual([]);                         // Redo deletes it again
  });
});

describe('R6F-28..32: rectangle selection does not take over the drawing surface', () => {
  it('R6F-32: the rectangle SVG root never intercepts pointer events', () => {
    const layer = /data-testid="completed-rect-layer"[\s\S]{0,400}?>/.exec(drawingLayer);
    expect(layer, 'rect layer not found').not.toBeNull();
    expect(drawingLayer).toMatch(/className=\{`absolute inset-0 w-full h-full pointer-events-none/);
  });

  it('R6F-28..31: only the border band opts in, and only under the Square tool', () => {
    // A full-surface catcher here would swallow every Pencil/Highlighter/Eraser
    // stroke crossing a rectangle. `pointerEvents: 'stroke'` on a transparent
    // fat stroke makes the BORDER the target and leaves the interior inert.
    expect(drawingLayer).toContain("style={{ pointerEvents: 'stroke', cursor: 'pointer' }}");
    expect(drawingLayer).toMatch(/\{tool === 'square' && \([\s\S]{0,600}data-testid=\{`rect-hit-/);
    // The visible path itself is never a target.
    expect(drawingLayer).not.toMatch(/stroke=\{r\.color\}[\s\S]{0,200}pointerEvents: 'auto'/);
    // The hit band is deliberately forgiving.
    expect(drawingLayer).toContain('RECT_HIT_STROKE_WIDTH');
  });

  it('selection is cleared by every event that should end it', () => {
    for (const site of [
      'const handleToolSelect',        // switching tools
      'handleShapePointerDown',        // starting a new rectangle
      'handleCanvasClick',             // placing/selecting text
    ]) {
      const at = drawingLayer.indexOf(site);
      expect(at, `${site} not found`).toBeGreaterThan(-1);
      expect(drawingLayer.slice(at, at + 700), site).toContain('setSelectedRectId(null)');
    }
    // Undo/redo and deletion clear it too.
    expect(drawingLayer).toMatch(/handleDeleteSelectedRect[\s\S]{0,700}setSelectedRectId\(null\)/);
  });
});
