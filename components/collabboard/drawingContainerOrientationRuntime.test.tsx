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
