import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const drawingSource = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
const modalsSource = read('components/collabboard/canvas/ui/CanvasModals.tsx');

describe('O1D Drawing Container orientation architecture', () => {
  it('uses the canonical resolver and shared renderer', () => {
    expect(drawingSource).toContain("import { resolveContainerOrientation } from '@/lib/domain/canvas/containerModel';");
    expect(drawingSource).toContain('orientation={resolveContainerOrientation(padlet.metadata)}');
    expect(drawingSource).toContain('onRequiredWidthChange={onRequiredWidthChange}');
    expect(drawingSource).not.toContain('DrawingHorizontalContainer');
  });

  it('keeps Drawing width growth parent-only and grow-only', () => {
    expect(drawingSource).toContain('const nextWidth = Math.max(existing.width ?? 0, Math.ceil(requiredWidth + chromePerSide * 2));');
    expect(drawingSource).toContain('onNaturalResize?.(padlet.id, { width: nextWidth });');
    expect(drawingSource).toContain('void onUpdatePadlet(id, { width: size.width });');
    expect(drawingSource).toContain('commitToHistory: false');
    expect(drawingSource).toContain('widthLocked');
  });

  it('measures Drawing chrome (own card + Excalidraw wrapper) from live DOM computed style, never a hardcoded constant', () => {
    // O1E.1: Excalidraw wraps this card in its own `.excalidraw__embeddable__outer`
    // element (this card's direct DOM parent), which carries its own padding
    // independent of this card's own border/`p-2` chrome. Read via computed
    // style off the live parentElement -- a stable CSS value, not a ratio
    // derived from the scene's own mutable width (which would create a
    // regrowth feedback loop) -- so it survives Excalidraw class/style
    // changes without depending on internal class names.
    expect(drawingSource).toContain('excalidrawWrapperPadding');
    expect(drawingSource).toContain('cardOuterRef.current?.parentElement');
    expect(drawingSource).toContain('const chromePerSide = outerBorder + contentPadding + excalidrawWrapperPadding;');
    // no hardcoded pixel fudge anywhere in the width calculation
    expect(drawingSource).not.toMatch(/requiredWidth\s*\+\s*\d+\)/);
    expect(drawingSource).not.toMatch(/chromePerSide\s*=\s*\d+/);
    // never derive chrome from the mutable scene width itself -- that's the
    // feedback loop this patch found and reverted during development.
    expect(drawingSource).not.toMatch(/existing\.width\s*as\s*number\)\s*-\s*cardOuterRef/);
  });

  it('keeps Drawing orientation control gated with Freeform', () => {
    expect(modalsSource).toContain("allowOrientationControl={canvasLayout === 'freeform' || canvasLayout === 'drawing'}");
  });

  it('does not introduce horizontal scrolling or child geometry writes', () => {
    const rowSource = read('components/collabboard/RowColumnContainerCard.tsx');
    expect(rowSource).not.toMatch(/overflow-x-(auto|scroll)/);
    expect(drawingSource).not.toContain('onUpdatePadlet(child.id, { position_x');
    expect(drawingSource).not.toContain('onUpdatePadlet(child.id, { position_y');
  });
});
