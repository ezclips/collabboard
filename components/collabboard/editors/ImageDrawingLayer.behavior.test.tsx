// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImageDrawingLayer from './ImageDrawingLayer';

const exportImage = vi.fn(async () => 'data:image/png;base64,stub');
const exportPaths = vi.fn(async () => []);
const eraseMode = vi.fn();
const undo = vi.fn();
const redo = vi.fn();
const loadPaths = vi.fn();
/** R6G. The component's onChange, captured so a stroke can be simulated. */
let lastOnChange: ((paths: unknown[]) => void) | null = null;

vi.mock('react-sketch-canvas', async () => {
  const React = (await import('react')) as typeof import('react');
  return {
    ReactSketchCanvas: React.forwardRef((props: { onChange?: (paths: unknown[]) => void }, ref) => {
      lastOnChange = props.onChange ?? null;
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


// --- R6G ------------------------------------------------------------------
//
// The four runtime defects the user's screenshots showed after R6F passed:
// text boxes collapsing to one or two characters per line, a toolbar that
// changed length with the tool, no way to erase a rectangle, and Undo/Redo
// that appeared dead.

/** The editor with no pre-existing annotations, so "the" text box is unambiguous. */
function renderEmptyLayer() {
  return render(
    <ImageDrawingLayer imageUrl={imageUrl} initialTextElements={[]} onSave={vi.fn()} onCancel={vi.fn()} />
  );
}

/** A fresh text annotation, created through the real Add Text flow. */
function createTextAnnotation() {
  const surface = document.body.querySelector('.cursor-text.touch-none') as HTMLElement | null;
  expect(surface, 'text placement surface not rendered').not.toBeNull();
  fireEvent.click(surface!);
  const boxes = screen.getAllByPlaceholderText('Type here...');
  return boxes[boxes.length - 1] as HTMLTextAreaElement;
}

const widthOf = (textarea: HTMLTextAreaElement) => parseFloat(textarea.style.width);

describe('R6G text width: the box no longer collapses onto what you have typed', () => {
  beforeEach(() => { mockContainerSize(900, 600); });

  it('R6G-1,2,3,4: width never drops below the fresh box width as characters arrive', () => {
    renderEmptyLayer();
    openTextToolbar();
    const textarea = createTextAnnotation();

    // THE regression: an empty box measured the placeholder and looked fine,
    // then the first keystroke dropped the placeholder and collapsed the box to
    // the 50px floor -- about 22px of content box -- so the textarea's own soft
    // wrap produced "h / a".
    const initialWidth = widthOf(textarea);
    expect(initialWidth).toBeGreaterThanOrEqual(160);
    expect(initialWidth).toBeLessThanOrEqual(220);

    for (const value of ['H', 'Ha', 'Hal', 'Hallo', 'Hallo World']) {
      fireEvent.input(textarea, { target: { value } });
      expect(widthOf(textarea), `width collapsed at "${value}"`).toBeGreaterThanOrEqual(initialWidth);
    }
  });

  it('R6G-4b: "Hallo World" has room to stay horizontal rather than stacking characters', () => {
    renderEmptyLayer();
    openTextToolbar();
    const textarea = createTextAnnotation();
    fireEvent.input(textarea, { target: { value: 'Hallo World' } });

    // 11 characters at the test measurer's 12px each = 132px of text; the box
    // must be able to hold that on one line, plus its padding.
    expect(widthOf(textarea)).toBeGreaterThanOrEqual(132 + 24);
  });

  it('R6G-5: extra lines grow the HEIGHT, not a narrower box', () => {
    renderEmptyLayer();
    openTextToolbar();
    const textarea = createTextAnnotation();
    fireEvent.input(textarea, { target: { value: 'one' } });
    const oneLine = { w: widthOf(textarea), h: parseFloat(textarea.style.height) };

    fireEvent.input(textarea, { target: { value: 'one\ntwo\nthree' } });
    expect(widthOf(textarea)).toBeGreaterThanOrEqual(oneLine.w);
    expect(parseFloat(textarea.style.height)).toBeGreaterThan(oneLine.h);
  });

  it('R6G-7: changing the font size does not collapse the width', async () => {
    renderEmptyLayer();
    openTextToolbar();
    const textarea = createTextAnnotation();
    fireEvent.input(textarea, { target: { value: 'Hallo' } });
    fireEvent.focus(textarea);
    const before = widthOf(textarea);

    fireEvent.click(screen.getByTitle('Font Size'));
    await clickBodyButtonByText('Large');
    await waitFor(() => expect(textarea.style.fontSize).toBe('32px'));

    expect(widthOf(textarea)).toBeGreaterThanOrEqual(before);
  });

  it('R6G-8: a manual resize wins, and is not snapped back by later typing', () => {
    renderEmptyLayer();
    openTextToolbar();
    const textarea = createTextAnnotation();
    const handle = document.body.querySelector('[data-testid^="text-resize-"]') as HTMLElement;
    expect(handle, 'no resize grip').not.toBeNull();

    const start = widthOf(textarea);
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 40 });   // drag 60px narrower
    fireEvent.mouseUp(window);

    const resized = widthOf(textarea);
    expect(resized).toBeLessThan(start);
    expect(resized).toBeGreaterThanOrEqual(60);

    // Typing must not restore the default width over their choice.
    fireEvent.input(textarea, { target: { value: 'ab' } });
    expect(widthOf(textarea)).toBe(resized);
  });

  it('R6G-6: the R6F bottom clamp still applies to the taller wrapped box', () => {
    mockContainerSize(400, 300);
    renderBottomText(280);
    const textarea = screen.getByDisplayValue('Hallo World') as HTMLTextAreaElement;
    expect(boxTop(textarea) + parseFloat(textarea.style.height)).toBeLessThanOrEqual(300);
    expect(boxTop(textarea)).toBeGreaterThanOrEqual(0);
  });
});

describe('R6G toolbar: one width in every tool state', () => {
  beforeEach(() => { mockContainerSize(900, 600); });

  const toolbarWidth = () =>
    (document.body.querySelector('[data-testid="draw-toolbar"]') as HTMLElement).style.width;

  it('R6G-10..15: switching tools never changes the toolbar width', () => {
    renderLayer();
    const widths: Record<string, string> = {};

    widths.initial = toolbarWidth();
    for (const tool of ['Add Text', 'Pencil', 'Highlighter', 'Eraser']) {
      fireEvent.click(screen.getByTitle(tool));
      widths[tool] = toolbarWidth();
    }
    // Square only exists outside the text tool, so reach it from Pencil.
    fireEvent.click(screen.getByTitle('Pencil'));
    fireEvent.click(screen.getByTitle('Square'));
    widths.Square = toolbarWidth();

    // Text WITH an annotation selected is the widest state -- four styling
    // controls appear -- and is what used to stretch the bar.
    fireEvent.click(screen.getByTitle('Add Text'));
    fireEvent.focus(screen.getByPlaceholderText('Type here...'));
    widths.selectedText = toolbarWidth();

    const distinct = [...new Set(Object.values(widths))];
    expect(distinct, `toolbar width varied by state: ${JSON.stringify(widths)}`).toHaveLength(1);
    expect(distinct[0]).toBe('720px');
  });

  it('the width is a property of the toolbar, not of whatever is mounted in it', () => {
    // `w-fit` is what made the bar size itself around its current children.
    renderLayer();
    const shell = document.body.querySelector('[data-testid="draw-toolbar"]') as HTMLElement;
    expect(shell.className).not.toContain('w-fit');
    expect(shell.style.width).toBe('720px');
    // ...and it still degrades on a narrow viewport rather than overflowing.
    expect(shell.style.maxWidth).toContain('100vw');
  });
});

describe('R6G eraser: the Eraser removes a rectangle', () => {
  beforeEach(() => {
    mockContainerSize(900, 600);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  const hitBands = () => Array.from(document.body.querySelectorAll('[data-testid^="rect-hit-"]'));
  const rectCount = () => document.body.querySelectorAll('[data-testid="completed-rect-layer"] > g').length;

  function drawSquare(x1: number, y1: number, x2: number, y2: number) {
    const surface = document.body.querySelector('.cursor-crosshair.touch-none') as HTMLElement;
    fireEvent.pointerDown(surface, { clientX: x1, clientY: y1, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: x2, clientY: y2, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: x2, clientY: y2, pointerId: 1 });
  }

  it('R6G-16,17,20,21,22: erasing one rectangle leaves the others, and undoes', () => {
    renderLayer();
    fireEvent.click(screen.getByTitle('Square'));
    drawSquare(10, 10, 100, 100);
    drawSquare(200, 10, 300, 100);
    expect(rectCount()).toBe(2);

    fireEvent.click(screen.getByTitle('Eraser'));
    // The Eraser gets a border target of its own -- that is the R6G change.
    expect(hitBands()).toHaveLength(2);

    fireEvent.pointerDown(hitBands()[0]);
    expect(rectCount()).toBe(1);                       // only the one hit

    fireEvent.click(screen.getByTitle('Undo'));
    expect(rectCount()).toBe(2);                       // R6G-21
    fireEvent.click(screen.getByTitle('Redo'));
    expect(rectCount()).toBe(1);                       // R6G-22
  });

  it('R6G-19: erasing a rectangle does not disturb text annotations', () => {
    renderLayer();                                     // renders with text-1
    fireEvent.click(screen.getByTitle('Square'));
    drawSquare(10, 10, 100, 100);
    fireEvent.click(screen.getByTitle('Eraser'));
    fireEvent.pointerDown(hitBands()[0]);

    expect(rectCount()).toBe(0);
    expect(screen.getByDisplayValue('Hello')).toBeTruthy();
  });

  it('R6G-23,24: Square select/trash still works, and drawing tools keep the surface', () => {
    renderLayer();
    fireEvent.click(screen.getByTitle('Square'));
    drawSquare(10, 10, 100, 100);
    fireEvent.pointerDown(hitBands()[0]);
    expect(screen.queryByTitle('Delete rectangle')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Delete rectangle'));
    expect(rectCount()).toBe(0);

    // Pencil/Highlighter still own the whole surface: no rectangle target.
    fireEvent.click(screen.getByTitle('Undo'));
    expect(rectCount()).toBe(1);
    for (const drawTool of ['Pencil', 'Highlighter']) {
      fireEvent.click(screen.getByTitle(drawTool));
      expect(hitBands(), drawTool).toHaveLength(0);
    }
  });
});

describe('R6G history: the two toolbar buttons are the one authority', () => {
  beforeEach(() => {
    mockContainerSize(900, 600);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  const rectCount = () => document.body.querySelectorAll('[data-testid="completed-rect-layer"] > g').length;
  const textCount = () => document.body.querySelectorAll('textarea').length;
  const undoBtn = () => screen.getByTitle('Undo') as HTMLButtonElement;
  const redoBtn = () => screen.getByTitle('Redo') as HTMLButtonElement;

  function drawSquare(x1: number, y1: number, x2: number, y2: number) {
    const surface = document.body.querySelector('.cursor-crosshair.touch-none') as HTMLElement;
    fireEvent.pointerDown(surface, { clientX: x1, clientY: y1, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: x2, clientY: y2, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: x2, clientY: y2, pointerId: 1 });
  }

  function addText() {
    fireEvent.click(screen.getByTitle('Add Text'));
    const surface = document.body.querySelector('.cursor-text.touch-none') as HTMLElement;
    fireEvent.click(surface);
  }

  it('R6G-28: adding a text annotation is undoable -- it was not recorded at all before', () => {
    // THE reason the buttons looked dead: text never entered the history, so
    // the most common thing to undo did nothing.
    renderLayer();
    const before = textCount();
    addText();
    expect(textCount()).toBe(before + 1);

    fireEvent.click(undoBtn());
    expect(textCount()).toBe(before);
    fireEvent.click(redoBtn());
    expect(textCount()).toBe(before + 1);
  });

  it('R6G-26: creating a rectangle is undoable and redoable', () => {
    renderLayer();
    fireEvent.click(screen.getByTitle('Square'));
    drawSquare(10, 10, 100, 100);
    expect(rectCount()).toBe(1);
    fireEvent.click(undoBtn());
    expect(rectCount()).toBe(0);
    fireEvent.click(redoBtn());
    expect(rectCount()).toBe(1);
  });

  it('R6G-29: a mixed sequence undoes in the user\'s chronological order', () => {
    renderLayer();
    const baseText = textCount();

    fireEvent.click(screen.getByTitle('Square'));
    drawSquare(10, 10, 100, 100);            // A: rectangle
    addText();                               // C: text
    expect(rectCount()).toBe(1);
    expect(textCount()).toBe(baseText + 1);

    fireEvent.click(undoBtn());              // undoes the TEXT, not the rect
    expect(textCount()).toBe(baseText);
    expect(rectCount()).toBe(1);

    fireEvent.click(undoBtn());              // then the rectangle
    expect(rectCount()).toBe(0);

    fireEvent.click(redoBtn());              // and forward again, in order
    expect(rectCount()).toBe(1);
    fireEvent.click(redoBtn());
    expect(textCount()).toBe(baseText + 1);
  });

  it('R6G-30: a new action after an undo clears the redo stack', () => {
    renderLayer();
    fireEvent.click(screen.getByTitle('Square'));
    drawSquare(10, 10, 100, 100);
    fireEvent.click(undoBtn());
    expect(redoBtn().disabled).toBe(false);

    drawSquare(200, 10, 300, 100);           // branch
    expect(redoBtn().disabled).toBe(true);
    expect(rectCount()).toBe(1);             // the old one is not resurrected
  });

  it('R6G-31: the disabled states are truthful', () => {
    renderLayer();
    expect(undoBtn().disabled).toBe(true);
    expect(redoBtn().disabled).toBe(true);

    fireEvent.click(screen.getByTitle('Square'));
    drawSquare(10, 10, 100, 100);
    expect(undoBtn().disabled).toBe(false);
    expect(redoBtn().disabled).toBe(true);

    fireEvent.click(undoBtn());
    expect(undoBtn().disabled).toBe(true);
    expect(redoBtn().disabled).toBe(false);
  });

  it('R6G-25,32: a stroke reaches the sketch canvas through the same buttons', () => {
    // The stroke payload belongs to react-sketch-canvas, so the history records
    // THAT a stroke happened and forwards undo/redo to it. Driving the mock's
    // onChange is what proves the button is wired to that path at all.
    renderLayer();
    const sketch = screen.getByTestId('sketch-canvas');
    fireEvent.click(sketch);                 // no-op; the mock exposes onChange below
    act(() => { lastOnChange?.([{ id: 1 }]); });

    expect(undoBtn().disabled).toBe(false);
    fireEvent.click(undoBtn());
    expect(undo).toHaveBeenCalled();

    fireEvent.click(redoBtn());
    expect(redo).toHaveBeenCalled();
  });
});
