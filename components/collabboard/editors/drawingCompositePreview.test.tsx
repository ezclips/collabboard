// @vitest-environment jsdom
//
// R6H-C1 -- show the composite immediately, swap to the clean original.
//
// The private PDF-area route answers `private, no-store`, so opening Draw is a
// real round trip every time (~1.9s cold). The modal's opaque backdrop was
// simply showing through for that whole time. The already-flattened composite
// is a `data:` URL in memory, so it can fill that gap for free -- but only if
// the live overlays stay unpainted while it does, or every annotation would
// appear twice: once baked into the composite, once drawn live on top.

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ImageDrawingLayer from './ImageDrawingLayer';

const exportImage = vi.fn(async () => 'data:image/png;base64,stub');
const exportPaths = vi.fn(async () => []);
const eraseMode = vi.fn();
const loadPaths = vi.fn();

vi.mock('react-sketch-canvas', async () => {
  const ReactModule = (await import('react')) as typeof import('react');
  return {
    ReactSketchCanvas: ReactModule.forwardRef((_props, ref) => {
      ReactModule.useImperativeHandle(ref, () => ({
        exportImage, exportPaths, eraseMode, loadPaths, undo: vi.fn(), redo: vi.fn(),
      }));
      return <div data-testid="sketch-canvas" />;
    }),
  };
});

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const drawingLayer = read('components/collabboard/editors/ImageDrawingLayer.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const serveRoute = read('lib/server/knowledge/knowledgePdfAreaImageServeRoute.ts');

/** The authenticated private route -- slow, and never cached. */
const PRIVATE_ORIGINAL = '/api/boards/b1/padlets/p1/image';
/** The flattened composite already in metadata: available instantly. */
const COMPOSITE = 'data:image/png;base64,COMPOSITE';

const SAVED_TEXT = [{
  id: 't1', x: 20, y: 20, content: 'existing note',
  fontSize: 24, color: '#ffffff', borderColor: undefined, bgOpacity: 40,
}];

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    font: '', measureText: (t: string) => ({ width: t.length * 12 }),
  }) as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true, get: () => false,
  });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderDraw(opts: { composite?: string } = {}) {
  return render(
    <ImageDrawingLayer
      imageUrl={PRIVATE_ORIGINAL}
      initialDrawing={opts.composite}
      initialTextElements={SAVED_TEXT}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

const preview = () => document.body.querySelector('[data-testid="drawing-composite-preview"]') as HTMLImageElement | null;
const base = () => document.body.querySelector('[data-testid="drawing-base-image"]') as HTMLImageElement;
const settleBase = () => fireEvent.load(base());
const textLayer = () =>
  (screen.getByDisplayValue('existing note').closest('.absolute.inset-0') as HTMLElement);

describe('R6H-C1-1..5: the composite fills the gap, then hands over cleanly', () => {
  it('R6H-C1-1: the composite is on screen from the first render', () => {
    renderDraw({ composite: COMPOSITE });
    expect(preview()).not.toBeNull();
    expect(preview()!.getAttribute('src')).toBe(COMPOSITE);
    // ...and the image area is therefore not empty black.
    expect(preview()!.className).toContain('object-contain');
  });

  it('R6H-C1-2: the live overlays are NOT painted while the composite is showing', () => {
    // The composite already contains these annotations. Painting them live at
    // the same time would show every one of them twice.
    renderDraw({ composite: COMPOSITE });
    expect(textLayer().className).toContain('opacity-0');
    const canvasWrapper = screen.getByTestId('sketch-canvas').parentElement as HTMLElement;
    expect(canvasWrapper.className).toContain('opacity-0');
    expect(canvasWrapper.className).toContain('pointer-events-none');
  });

  it('R6H-C1-3,4: once the original lands, it takes over and the overlays paint once', () => {
    renderDraw({ composite: COMPOSITE });
    settleBase();

    // The temporary preview is gone -- so the annotations cannot be doubled.
    expect(preview()).toBeNull();
    expect(base().getAttribute('src')).toBe(PRIVATE_ORIGINAL);
    expect(base().className).not.toContain('opacity-0');
    expect(textLayer().className).not.toContain('opacity-0');
    // Exactly one copy of the saved annotation.
    expect(screen.getAllByDisplayValue('existing note')).toHaveLength(1);
  });

  it('R6H-C1-5: both images share one layout box, so the swap cannot resize anything', () => {
    renderDraw({ composite: COMPOSITE });
    const before = { max: preview()!.style.maxWidth, maxH: preview()!.style.maxHeight, cls: preview()!.className };
    settleBase();
    expect(base().style.maxWidth).toBe(before.max);
    expect(base().style.maxHeight).toBe(before.maxH);
    // Same fit mode and sizing utilities on both.
    for (const token of ['block', 'w-full', 'h-auto', 'object-contain']) {
      expect(before.cls, token).toContain(token);
      expect(base().className, token).toContain(token);
    }
    expect(drawingLayer).toContain('const BASE_IMAGE_STYLE: React.CSSProperties');
  });

  it('an error hands over too, rather than sitting on a stale preview forever', () => {
    renderDraw({ composite: COMPOSITE });
    fireEvent.error(base());
    expect(preview()).toBeNull();
  });
});

describe('R6H-C1-15..18: editing waits for the pristine base', () => {
  it('R6H-C1-15: no drawing surface accepts input while the composite is showing', () => {
    // Input is refused outright, not buffered and replayed onto a base that
    // was not what the user was looking at.
    renderDraw({ composite: COMPOSITE });
    fireEvent.click(screen.getByTitle('Square'));
    expect(document.body.querySelector('.cursor-crosshair.touch-none')).toBeNull();
    fireEvent.click(screen.getByTitle('Add Text'));
    expect(document.body.querySelector('.cursor-text.touch-none')).toBeNull();
  });

  it('R6H-C1-16,17,18: Pencil, Text and Rectangle all work once the original is ready', () => {
    renderDraw({ composite: COMPOSITE });
    settleBase();

    // Pencil: the sketch surface accepts pointer events again.
    fireEvent.click(screen.getByTitle('Pencil'));
    const canvasWrapper = screen.getByTestId('sketch-canvas').parentElement as HTMLElement;
    expect(canvasWrapper.className).toContain('pointer-events-auto');

    fireEvent.click(screen.getByTitle('Square'));
    expect(document.body.querySelector('.cursor-crosshair.touch-none')).not.toBeNull();

    fireEvent.click(screen.getByTitle('Add Text'));
    expect(document.body.querySelector('.cursor-text.touch-none')).not.toBeNull();
  });

  it('the sketch canvas stays MOUNTED through phase 1, so saved paths still load', () => {
    // Gating it on readiness instead would be worse: the initialPaths loader
    // retries for only ~1s after mount, and a cold private image outlasts that.
    renderDraw({ composite: COMPOSITE });
    expect(screen.getByTestId('sketch-canvas')).toBeTruthy();
  });
});

describe('R6H-C1-14: an image with no composite falls back rather than inventing one', () => {
  it('renders no preview, and the base carries the layout on its own', () => {
    renderDraw();
    expect(preview()).toBeNull();
    expect(base().className).not.toContain('opacity-0');
    expect(base().getAttribute('src')).toBe(PRIVATE_ORIGINAL);
  });

  it('a composite identical to the original is not treated as a preview', () => {
    // resolveImagePostDisplaySrc falls back to imageUrl when a post has no
    // drawing. Rendering that as a second <img> would be a second
    // authenticated GET for bytes already in flight.
    renderDraw({ composite: PRIVATE_ORIGINAL });
    expect(preview()).toBeNull();
    expect(document.body.querySelectorAll(`img[src="${PRIVATE_ORIGINAL}"]`)).toHaveLength(1);
  });
});

describe('R6H-C1-10..13: cost and security are unchanged', () => {
  it('R6H-C1-10: exactly one element ever requests the authenticated original', () => {
    renderDraw({ composite: COMPOSITE });
    expect(document.body.querySelectorAll(`img[src="${PRIVATE_ORIGINAL}"]`)).toHaveLength(1);
    settleBase();
    expect(document.body.querySelectorAll(`img[src="${PRIVATE_ORIGINAL}"]`)).toHaveLength(1);
  });

  it('R6H-C1-11: no manual fetch, preload, hidden duplicate or cache-buster', () => {
    const code = drawingLayer.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    for (const forbidden of ['fetch(', 'XMLHttpRequest', 'preload', 'createObjectURL', 'cache-bust']) {
      expect(code, forbidden).not.toContain(forbidden);
    }
    // handleSave's two `new Image()` calls (the original and the exported
    // strokes) predate this slice and run at SAVE time, not on open. The point
    // is that the RENDER path did not gain one.
    expect((code.match(/new Image\(/g) ?? [])).toHaveLength(2);
    const save = code.slice(code.indexOf('const handleSave'), code.indexOf('const handleUndo'));
    expect((save.match(/new Image\(/g) ?? [])).toHaveLength(2);
    // The swap is driven by the base element's own load event.
    expect(drawingLayer).toContain('onLoad: handleBaseSettled');
    expect(drawingLayer).toContain('onError: handleBaseSettled');
  });

  it('R6H-C1-12,13: the private route and its headers are untouched', () => {
    // This slice edits presentation only; the serving contract is not its
    // business, and relaxing no-store would trade revocation for latency.
    expect(serveRoute).toContain('no-store');
    expect(serveRoute).toContain('private');
    const code = drawingLayer.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    for (const forbidden of [
      'getPublicUrl', 'createSignedUrl', 'padlet-files', 'storage/v1',
      'Cache-Control', 'localStorage', 'sessionStorage', 'indexedDB',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('R6H-C1-20: the editor still receives the base image, not the composite, to edit', () => {
    // R6D's D5 contract: drawing on an already-flattened composite would bake
    // every pass in permanently.
    expect(canvasClient).toContain("imageUrl={drawingPadlet.metadata?.imageUrl || ''}");
    expect(canvasClient).toContain('initialDrawing={drawingPadlet.metadata?.drawing}');
    // ...and the preview is only ever used as a preview.
    expect(drawingLayer).toContain('const previewSrc = initialDrawing && initialDrawing !== imageUrl');
    expect(drawingLayer).not.toMatch(/originalImg\.src = (previewSrc|initialDrawing)/);
  });
});
