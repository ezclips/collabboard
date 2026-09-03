// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImageDrawingLayer from './ImageDrawingLayer';

const exportImage = vi.fn(async () => 'data:image/png;base64,stub');
const exportPaths = vi.fn(async () => []);
const eraseMode = vi.fn();
const undo = vi.fn();
const redo = vi.fn();
const loadPaths = vi.fn();

vi.mock('react-sketch-canvas', async () => {
  const React = (await import('react')) as typeof import('react');
  return {
    ReactSketchCanvas: React.forwardRef((_props, ref) => {
      React.useImperativeHandle(ref, () => ({
        exportImage,
        exportPaths,
        eraseMode,
        undo,
        redo,
        loadPaths,
      }));
      return <div data-testid="sketch-canvas" />;
    }),
  };
});

const imageUrl = 'data:image/png;base64,stub';

function mockCanvasMetrics() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 12 }),
  }) as unknown as CanvasRenderingContext2D);
}

function renderLayer() {
  return render(
    <ImageDrawingLayer
      imageUrl={imageUrl}
      initialTextElements={[
        {
          id: 'text-1',
          x: 40,
          y: 40,
          content: 'Hello',
          fontSize: 24,
          color: '#ffffff',
          borderColor: undefined,
          bgOpacity: 40,
        },
      ]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

function openTextToolbar() {
  fireEvent.click(screen.getByTitle('Add Text'));
}

async function clickBodyButtonByText(text: string) {
  await waitFor(() => {
    const buttons = Array.from(document.body.querySelectorAll('button')).filter((button) => button.textContent?.trim() === text);
    expect(buttons.length, `missing button text ${text}`).toBeGreaterThan(0);
  });
  const buttons = Array.from(document.body.querySelectorAll('button')).filter((button) => button.textContent?.trim() === text);
  fireEvent.click(buttons[buttons.length - 1] as HTMLButtonElement);
}

function selectSwatch(color: string) {
  const button = Array.from(document.body.querySelectorAll('button')).find((candidate) => {
    return getComputedStyle(candidate).backgroundColor === color;
  }) as HTMLButtonElement | undefined;
  expect(button, `missing color swatch ${color}`).toBeTruthy();
  fireEvent.click(button!);
}

function selectBorderSwatch(color: string) {
  const panels = Array.from(document.body.querySelectorAll('div')).filter((candidate) => candidate.textContent?.includes('None'));
  const panel = panels[panels.length - 1] as HTMLElement | undefined;
  expect(panel, 'missing border color panel').toBeTruthy();
  const button = Array.from(panel!.querySelectorAll('button')).find((candidate) => getComputedStyle(candidate).backgroundColor === color) as HTMLButtonElement | undefined;
  expect(button, `missing border swatch ${color}`).toBeTruthy();
  fireEvent.click(button!);
}

beforeEach(() => {
  mockCanvasMetrics();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ImageDrawingLayer', () => {
  it('auto-grows wrapped text so the second line stays visible while editing', async () => {
    renderLayer();

    openTextToolbar();

    const textarea = screen.getByPlaceholderText('Type here...') as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    fireEvent.input(textarea, { target: { value: 'Hello World' } });

    await waitFor(() => {
      expect(parseFloat(textarea.style.height)).toBeGreaterThan(70);
    });
    expect(textarea.style.whiteSpace).toBe('pre-wrap');
  });

  it('keeps the selected annotation live when using Medium, A, border color, and opacity controls', async () => {
    renderLayer();

    openTextToolbar();

    const textarea = screen.getByPlaceholderText('Type here...') as HTMLTextAreaElement;
    fireEvent.focus(textarea);

    expect(screen.getByTitle('Font Size').textContent).toContain('Medium');
    fireEvent.click(screen.getByTitle('Font Size'));
    await clickBodyButtonByText('Large');
    await waitFor(() => expect(textarea.style.fontSize).toBe('32px'));

    fireEvent.click(screen.getByTitle('Text Color'));
    selectSwatch('rgb(239, 68, 68)');
    await waitFor(() => expect(textarea.style.color).toBe('rgb(239, 68, 68)'));

    fireEvent.click(screen.getByTitle('Box Border Color'));
    selectBorderSwatch('rgb(34, 197, 94)');
    await waitFor(() => expect(textarea.style.borderColor).toBe('rgb(34, 197, 94)'));

    fireEvent.click(screen.getByTitle('Background Opacity'));
    const slider = document.body.querySelector('input[type="range"]') as HTMLInputElement | null;
    expect(slider).not.toBeNull();
    fireEvent.change(slider!, { target: { value: '80' } });
    await waitFor(() => expect(textarea.style.backgroundColor).toContain('0.8'));
  });
});


// --- R6F ------------------------------------------------------------------
//
// The three defects, exercised against the real component: popups that opened
// underneath the modal they belong to, text that wrapped off the bottom of the
// image, and rectangles that could only be removed by undoing everything after
// them.

/** The image container's measured size. jsdom reports 0 for both by default. */
function mockContainerSize(width = 400, height = 300) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => height });
}

/** x=280 leaves 100px of width, which wraps "Hallo World" into two lines. */
function renderBottomText(y = 280, x = 280) {
  return render(
    <ImageDrawingLayer
      imageUrl={imageUrl}
      initialTextElements={[{
        id: 'bottom-1', x, y, content: 'Hallo World',
        fontSize: 24, color: '#ffffff', borderColor: undefined, bgOpacity: 40,
      }]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

const boxTop = (textarea: HTMLTextAreaElement) => parseFloat((textarea.parentElement as HTMLElement).style.top);
const boxHeight = (textarea: HTMLTextAreaElement) => parseFloat(textarea.style.height || '0');

describe('R6F popups: the six controls open ABOVE the drawing modal', () => {
  beforeEach(() => { mockContainerSize(); });

  /** The tier the modal root paints at, read off the rendered element. */
  function modalTier(): number {
    const root = Array.from(document.body.querySelectorAll('div'))
      .find((d) => /^fixed inset-0 z-\[\d+\] bg-black/.test(d.className));
    expect(root, 'modal root not rendered').toBeTruthy();
    const match = /z-\[(\d+)\]/.exec(root!.className);
    expect(match, 'modal root has no tier').not.toBeNull();
    return Number(match![1]);
  }

  /** The tier of the popup surface currently open, read off the rendered node. */
  function openPopupTier(): number {
    const surfaces = Array.from(document.body.querySelectorAll('div'))
      .filter((el) => /z-\[\d+\]/.test(el.className) && el.className.includes('bg-white'));
    expect(surfaces.length, 'no popup surface rendered').toBeGreaterThan(0);
    const match = /z-\[(\d+)\]/.exec((surfaces[surfaces.length - 1] as HTMLElement).className);
    expect(match, 'popup surface has no tier').not.toBeNull();
    return Number(match![1]);
  }

  it('R6F-4,5,6,7: each text control renders above the modal, and stays open', async () => {
    renderLayer();
    openTextToolbar();
    const textarea = screen.getByPlaceholderText('Type here...') as HTMLTextAreaElement;
    fireEvent.focus(textarea);

    for (const control of ['Font Size', 'Text Color', 'Box Border Color', 'Background Opacity']) {
      fireEvent.click(screen.getByTitle(control));
      await waitFor(() => expect(openPopupTier(), control).toBeGreaterThan(modalTier()));
      // R6F-8/9: opening it neither tore the modal down nor dropped the
      // annotation that the control is about to act on.
      expect(screen.queryByTitle(control), control).toBeTruthy();
      expect(screen.queryByPlaceholderText('Type here...'), control).toBeTruthy();
      fireEvent.keyDown(document.body, { key: 'Escape' });
    }
  });

  it('R6F-2,3: Brush Size and Color render above the modal too', async () => {
    renderLayer();
    for (const control of ['Brush Size', 'Color']) {
      fireEvent.click(screen.getByTitle(control));
      await waitFor(() => expect(openPopupTier(), control).toBeGreaterThan(modalTier()));
      fireEvent.keyDown(document.body, { key: 'Escape' });
    }
  });
});

describe('R6F text bounds: wrapped text near the bottom stays on the image', () => {
  beforeEach(() => { mockContainerSize(400, 300); });

  it('R6F-11: "Hallo World" wrapping at the bottom edge is pulled up so both lines fit', () => {
    // The reported screenshot: placed at y=280 on a 300px-tall image, the second
    // line used to fall off the bottom and be cropped by the flatten step.
    renderBottomText(280);
    const textarea = screen.getByDisplayValue('Hallo World') as HTMLTextAreaElement;

    expect(boxTop(textarea)).toBeLessThan(280);
    expect(boxTop(textarea) + boxHeight(textarea)).toBeLessThanOrEqual(300);
    // Two lines' worth of height -- it really did wrap.
    expect(boxHeight(textarea)).toBeGreaterThan(24 * 1.2 + 24);
  });

  it('R6F-11b,13: the box moves up further as a third line appears WHILE typing', async () => {
    renderBottomText(280);
    const textarea = screen.getByDisplayValue('Hallo World') as HTMLTextAreaElement;
    const twoLineTop = boxTop(textarea);

    fireEvent.focus(textarea);
    fireEvent.input(textarea, { target: { value: 'Hallo World Again' } });

    await waitFor(() => expect(boxTop(textarea)).toBeLessThan(twoLineTop));
    expect(boxTop(textarea) + boxHeight(textarea)).toBeLessThanOrEqual(300);
    expect(boxTop(textarea)).toBeGreaterThanOrEqual(0);
  });

  it('R6F-16: increasing the font size re-clamps -- not only typing does', async () => {
    renderBottomText(280);
    openTextToolbar();
    const textarea = screen.getByDisplayValue('Hallo World') as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    const before = boxTop(textarea);

    fireEvent.click(screen.getByTitle('Font Size'));
    await clickBodyButtonByText('Large');

    await waitFor(() => expect(textarea.style.fontSize).toBe('32px'));
    await waitFor(() => expect(boxTop(textarea)).toBeLessThan(before));
    expect(boxTop(textarea) + boxHeight(textarea)).toBeLessThanOrEqual(300);
  });

  it('R6F-19: text that already fits is not moved', () => {
    renderBottomText(20);
    const textarea = screen.getByDisplayValue('Hallo World') as HTMLTextAreaElement;
    expect(boxTop(textarea)).toBe(20);
  });

  it('R6F-14: an annotation taller than the image pins to the top rather than going negative', () => {
    mockContainerSize(400, 60);
    renderBottomText(50);
    const textarea = screen.getByDisplayValue('Hallo World') as HTMLTextAreaElement;
    expect(boxTop(textarea)).toBe(0);
    expect(boxTop(textarea)).toBeGreaterThanOrEqual(0);
  });
});

describe('R6F save: the composite and the persisted geometry match the editor', () => {
  let fillTextCalls: Array<{ text: string; x: number; y: number }> = [];

  beforeEach(() => {
    mockContainerSize(400, 300);
    fillTextCalls = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      font: '', textBaseline: '', lineCap: '', lineJoin: '',
      strokeStyle: '', fillStyle: '', lineWidth: 0,
      measureText: (text: string) => ({ width: text.length * 12 }),
      fillText: (text: string, x: number, y: number) => { fillTextCalls.push({ text, x, y }); },
      drawImage: () => {}, save: () => {}, restore: () => {},
      beginPath: () => {}, roundRect: () => {}, fill: () => {}, stroke: () => {},
    }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,SAVED');
    // jsdom never fires load for a data: URL, and handleSave awaits it.
    class LoadedImage {
      width = 400; height = 300;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = '';
      set src(_value: string) { setTimeout(() => this.onload?.(), 0); }
    }
    vi.stubGlobal('Image', LoadedImage);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('R6F-17,18: every wrapped line is painted inside the image, and the corrected y is what gets persisted', async () => {
    const onSave = vi.fn();
    render(
      <ImageDrawingLayer
        imageUrl={imageUrl}
        initialTextElements={[{
          id: 'bottom-1', x: 280, y: 280, content: 'Hallo World',
          fontSize: 24, color: '#ffffff', borderColor: undefined, bgOpacity: 40,
        }]}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    const textarea = screen.getByDisplayValue('Hallo World') as HTMLTextAreaElement;
    const liveTop = boxTop(textarea);

    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    // Both lines reached the canvas...
    expect(fillTextCalls.map((c) => c.text)).toEqual(['Hallo', 'World']);
    // ...and neither was painted past the bottom edge.
    for (const call of fillTextCalls) {
      expect(call.y, `"${call.text}" painted outside the image`).toBeLessThan(300);
      expect(call.y).toBeGreaterThanOrEqual(0);
    }

    // R6F-18: the geometry handed back is the corrected one, so reopening the
    // editor starts where the user last saw it -- live == composite == reopened.
    const [, , savedTextElements] = onSave.mock.calls[0];
    expect(savedTextElements[0].y).toBeLessThan(280);
    expect(savedTextElements[0].y).toBeCloseTo(liveTop, 5);
  });
});

describe('R6F rectangles: one can be selected and deleted on its own', () => {
  beforeEach(() => {
    mockContainerSize(400, 300);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  /** The full-surface overlay the Square tool draws on. */
  function squareSurface(): HTMLElement {
    const surface = document.body.querySelector('.cursor-crosshair.touch-none') as HTMLElement | null;
    expect(surface, 'square drawing surface not rendered').not.toBeNull();
    return surface!;
  }

  function drawRect(x1: number, y1: number, x2: number, y2: number) {
    const surface = squareSurface();
    fireEvent.pointerDown(surface, { clientX: x1, clientY: y1, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: x2, clientY: y2, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: x2, clientY: y2, pointerId: 1 });
  }

  const hitBands = () => Array.from(document.body.querySelectorAll('[data-testid^="rect-hit-"]'));
  const rectCount = () => document.body.querySelectorAll('[data-testid="completed-rect-layer"] > g').length;

  function startSquareTool() {
    renderLayer();
    fireEvent.click(screen.getByTitle('Square'));
  }

  it('R6F-21,22,23: a completed rectangle is selectable and shows a Delete control', () => {
    startSquareTool();
    drawRect(10, 10, 100, 100);
    expect(rectCount()).toBe(1);

    // R6F-27: drawing it did not select it, and nothing was auto-deleted.
    expect(screen.queryByTitle('Delete rectangle')).toBeNull();

    fireEvent.pointerDown(hitBands()[0]);
    // Selected state is visible...
    expect(document.body.querySelector('[data-testid^="rect-selected-"]')).not.toBeNull();
    // ...and the affordance appears.
    expect(screen.queryByTitle('Delete rectangle')).toBeTruthy();
  });

  it('R6F-24,25,26: deleting one leaves the other, and Undo/Redo behave', () => {
    startSquareTool();
    drawRect(10, 10, 100, 100);   // A
    drawRect(150, 10, 250, 100);  // B
    expect(rectCount()).toBe(2);

    // Select and delete A -- the FIRST one, not the last thing that happened.
    fireEvent.pointerDown(hitBands()[0]);
    fireEvent.click(screen.getByTitle('Delete rectangle'));

    expect(rectCount()).toBe(1);                       // only A went
    expect(screen.queryByTitle('Delete rectangle')).toBeNull();

    fireEvent.click(screen.getByTitle('Undo'));
    expect(rectCount()).toBe(2);                       // A is back

    fireEvent.click(screen.getByTitle('Redo'));
    expect(rectCount()).toBe(1);                       // deleted again
  });

  it('R6F-28: drawing another rectangle still works after a deletion', () => {
    startSquareTool();
    drawRect(10, 10, 100, 100);
    fireEvent.pointerDown(hitBands()[0]);
    fireEvent.click(screen.getByTitle('Delete rectangle'));
    expect(rectCount()).toBe(0);

    drawRect(20, 20, 120, 120);
    expect(rectCount()).toBe(1);
  });

  it('R6F-32: rectangles expose no hit target outside the Square tool', () => {
    // This is what keeps Pencil/Highlighter/Eraser usable over a rectangle: with
    // another tool active there is nothing of the rectangle to click at all.
    startSquareTool();
    drawRect(10, 10, 100, 100);
    expect(hitBands()).toHaveLength(1);

    fireEvent.click(screen.getByTitle('Pencil'));
    expect(hitBands()).toHaveLength(0);
    expect(rectCount()).toBe(1);                       // still drawn, just inert
    expect(document.body.querySelector('[data-testid="completed-rect-layer"]')!.getAttribute('class'))
      .toContain('pointer-events-none');
  });

  it('R6F-29,30,31: switching to Pencil/Highlighter/Eraser still drives the canvas', () => {
    startSquareTool();
    drawRect(10, 10, 100, 100);
    fireEvent.pointerDown(hitBands()[0]);
    expect(screen.queryByTitle('Delete rectangle')).toBeTruthy();

    // Selection does not survive a tool change, and eraser mode still toggles.
    fireEvent.click(screen.getByTitle('Eraser'));
    expect(eraseMode).toHaveBeenLastCalledWith(true);
    expect(screen.queryByTitle('Delete rectangle')).toBeNull();

    fireEvent.click(screen.getByTitle('Highlighter'));
    expect(eraseMode).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByTitle('Pencil'));
    expect(eraseMode).toHaveBeenLastCalledWith(false);
  });
});
