import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const rowSource = read('components/collabboard/RowColumnContainerCard.tsx');
const freeformSource = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const editorSource = read('components/collabboard/editors/ContainerEditor.tsx');
const modalsSource = read('components/collabboard/canvas/ui/CanvasModals.tsx');

describe('O1C Freeform Container orientation architecture', () => {
  it('keeps vertical as the shared renderer default and makes horizontal explicit', () => {
    expect(rowSource).toContain("orientation = 'vertical'");
    expect(rowSource).toContain('const isHorizontal = orientation === \'horizontal\';');
    expect(freeformSource).toContain('orientation={resolveContainerOrientation(padlet.metadata)}');
  });

  it('uses a nowrap, top-aligned horizontal lane without horizontal scrolling', () => {
    expect(rowSource).toContain('flex flex-row flex-nowrap items-start gap-2');
    expect(rowSource).toContain('overflow-x-hidden');
    expect(rowSource).not.toMatch(/overflow-x-(auto|scroll)/);
  });

  it('uses child canonical widths only for horizontal flex sizing', () => {
    expect(rowSource).toContain('Number(child.width) || 180');
    expect(rowSource).toContain('flex: `0 0 ${Math.max(Number(child.width) || 180, 1)}px`');
    expect(rowSource).toContain('style={isHorizontal ?');
  });

  it('grows only the parent width and guards stable measurements', () => {
    expect(freeformSource).toContain('nextWidth <= currentWidth + 1');
    expect(freeformSource).toContain('fields: { width: nextWidth, updated_at: new Date().toISOString() }');
    expect(freeformSource).not.toContain('position_x: nextWidth');
    expect(rowSource).toContain('lastReportedWidthRef');
  });

  it('exposes orientation UI only through the Freeform capability gate', () => {
    expect(editorSource).toContain('allowOrientationControl = false');
    expect(editorSource).toContain('aria-pressed={orientation === option}');
    expect(modalsSource).toContain('allowOrientationControl={canvasLayout === \'freeform\'}');
    expect(modalsSource).toContain('metadata: { ...liveContainer.metadata, orientation }');
  });

  it('does not add a Drawing orientation prop or Drawing orientation UI', () => {
    const drawingSource = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
    expect(drawingSource).not.toContain('resolveContainerOrientation');
    expect(drawingSource).not.toContain('allowOrientationControl');
  });
});
