// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeDocumentPageRegionSelector from './KnowledgeDocumentPageRegionSelector';
import type { NormalizedPageRegion } from '@/lib/domain/knowledge/knowledgePageRegionGeometry';

/**
 * P6J-F9-B2 selector proofs. A4 (595 x 842 points) drawn with the 1px border the
 * page image carries: BORDER box 502 x 702 at (100, 200), CONTENT box 500 x 700
 * at (101, 201). Every expected region is hand-computed from the locked
 * display->source formulas, never by calling the production transform.
 */
const A4 = { widthPoints: 595, heightPoints: 842 };

interface Box { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
const PORTRAIT: Box = { left: 101, top: 201, width: 500, height: 700 };
const LANDSCAPE: Box = { left: 101, top: 201, width: 700, height: 500 };

/** Naturals agreeing with the stored geometry: portrait, and its quarter-turn transpose. */
const PORTRAIT_NATURAL = { naturalWidth: 1000, naturalHeight: 1415 };
const LANDSCAPE_NATURAL = { naturalWidth: 1415, naturalHeight: 1000 };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

const define = (t: object, k: string, v: unknown) => Object.defineProperty(t, k, { value: v, configurable: true });

/** Gives the jsdom <img> the layout a browser would have measured. */
function layOut(image: HTMLImageElement, box: Box,
  natural: { naturalWidth: number; naturalHeight: number }, overrides: Record<string, unknown> = {}) {
  const layout: Record<string, unknown> = {
    complete: true, naturalWidth: natural.naturalWidth, naturalHeight: natural.naturalHeight,
    clientLeft: 1, clientTop: 1, clientWidth: box.width, clientHeight: box.height,
    offsetLeft: 0, offsetTop: 0, ...overrides,
  };
  for (const [key, value] of Object.entries(layout)) define(image, key, value);
  image.getBoundingClientRect = () => ({
    left: box.left - 1, top: box.top - 1, width: box.width + 2, height: box.height + 2,
    right: box.left + box.width + 1, bottom: box.top + box.height + 1,
    x: box.left - 1, y: box.top - 1, toJSON: () => ({}) }) as DOMRect;
}

function mount(
  props: Partial<React.ComponentProps<typeof KnowledgeDocumentPageRegionSelector>> = {},
  box: Box = PORTRAIT,
  natural = PORTRAIT_NATURAL,
  overrides: Record<string, unknown> = {},
) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const onArm = vi.fn();
  const onClear = vi.fn();
  const render = (extra: Partial<React.ComponentProps<typeof KnowledgeDocumentPageRegionSelector>> = {}) => {
    act(() => { root!.render(
      <KnowledgeDocumentPageRegionSelector
        boardId="board-1" documentId="doc-1" pageNumber={1} originalFilename="synthetic.pdf"
        widthPoints={A4.widthPoints} heightPoints={A4.heightPoints} rotation={0}
        enabled armedRegion={null} onArm={onArm} onClear={onClear}
        {...props} {...extra}
      />); });
  };
  render();
  const image = host.querySelector('img') as HTMLImageElement;
  layOut(image, box, natural, overrides);
  // The real signal: the image finished decoding. React propagates it here.
  act(() => { image.dispatchEvent(new Event('load', { bubbles: false })); });
  return { container: host, onArm, onClear, image, render };
}

const layer = (c: HTMLElement) => c.querySelector('[data-knowledge-region-layer]');
const rectangle = (c: HTMLElement) => c.querySelector('[data-knowledge-region-rectangle]');

/** jsdom has no PointerEvent constructor, so the pointer fields are added by hand. */
function firePointer(target: Element, type: string, init: Record<string, unknown> = {}) {
  const { clientX = 0, clientY = 0, pointerId = 1, isPrimary = true, pointerType = 'mouse', button = 0 } = init;
  const event = new MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: clientX as number, clientY: clientY as number, button: button as number,
  });
  define(event, 'pointerId', pointerId);
  define(event, 'isPrimary', isPrimary);
  define(event, 'pointerType', pointerType);
  act(() => { target.dispatchEvent(event); });
}

/** Viewport coordinates for a normalised point inside the CONTENT box. */
const at = (nx: number, ny: number, b: Box) => ({ clientX: b.left + nx * b.width, clientY: b.top + ny * b.height });

type Harness = ReturnType<typeof mount>;
type Corner = readonly [number, number];

/** The drag every rotation case uses: display rect (0.1, 0.1, 0.4, 0.5). */
function drag(harness: Harness, box: Box, from: Corner = [0.1, 0.1], to: Corner = [0.5, 0.6]) {
  const hit = layer(harness.container)!;
  firePointer(hit, 'pointerdown', at(from[0], from[1], box));
  firePointer(hit, 'pointermove', at(to[0], to[1], box));
  firePointer(hit, 'pointerup', at(to[0], to[1], box));
}

const armedRegionOf = (h: Harness) => h.onArm.mock.calls[0][0] as NormalizedPageRegion;

function expectRegion(actual: NormalizedPageRegion, expected: NormalizedPageRegion) {
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(actual[k], k).toBeCloseTo(expected[k], 9);
}

/** Percentages are floats: 1 - 0.5 - 0.4 is 0.09999999999999998, not 0.1. */
function expectDrawn(drawn: HTMLElement, expected: readonly number[]) {
  [drawn.style.left, drawn.style.top, drawn.style.width, drawn.style.height]
    .forEach((value, index) => expect(Number.parseFloat(value)).toBeCloseTo(expected[index], 6));
}

describe('P6J-F9-B2 mode and readiness', () => {
  it('S1: mode OFF renders the image and no hit layer at all', () => {
    const harness = mount({ enabled: false });
    expect(harness.container.querySelectorAll('img')).toHaveLength(1);
    expect(layer(harness.container)).toBeNull();
  });

  it('S2: mode ON over a ready image renders the hit layer on the CONTENT box', () => {
    const harness = mount();
    const hit = layer(harness.container) as HTMLElement;
    // Inset by the border, not stretched over it.
    expect([hit.style.left, hit.style.top, hit.style.width, hit.style.height])
      .toEqual(['1px', '1px', '500px', '700px']);
    expect(hit.style.touchAction).toBe('none');
  });

  it.each([
    ['S3 an image that has not decoded', { complete: false }],
    ['S4 a zero natural width', { naturalWidth: 0 }],
    ['S4 a zero natural height', { naturalHeight: 0 }],
    ['a collapsed layout box', { clientWidth: 0 }],
  ])('ignores pointerdown on %s', (_label, override) => {
    const harness = mount();
    const hit = layer(harness.container)!;
    // Readiness is re-proved at pointerdown, not trusted from mount.
    for (const [key, value] of Object.entries(override)) define(harness.image, key, value);
    drag(harness, PORTRAIT);
    expect(harness.onArm).not.toHaveBeenCalled();
    expect(rectangle(hit as HTMLElement)).toBeNull();
  });

  it.each([
    ['S24 a raster that disagrees with the stored geometry', LANDSCAPE_NATURAL, A4],
    ['missing page width', PORTRAIT_NATURAL, { widthPoints: null, heightPoints: 842 }],
    ['a zero page height', PORTRAIT_NATURAL, { widthPoints: 595, heightPoints: 0 }],
    ['a rotation that is not canonical', PORTRAIT_NATURAL, { rotation: 45 }],
  ])('disables selection for %s', (_label, natural, props) => {
    // Without geometry the server accepts, the write would certainly fail.
    expect(layer(mount(props as never, PORTRAIT, natural).container)).toBeNull();
  });
});

describe('P6J-F9-B2 drag, threshold and cancellation', () => {
  it('S7: a forward drag paints a live rectangle in display percentages', () => {
    const harness = mount();
    const hit = layer(harness.container)!;
    firePointer(hit, 'pointerdown', at(0.1, 0.1, PORTRAIT));
    firePointer(hit, 'pointermove', at(0.5, 0.6, PORTRAIT));
    expectDrawn(rectangle(hit as HTMLElement) as HTMLElement, [10, 10, 40, 50]);
    // S15: the live rectangle is not a write; only pointerup arms, exactly once.
    expect(harness.onArm).not.toHaveBeenCalled();
    firePointer(hit, 'pointerup', at(0.5, 0.6, PORTRAIT));
    expect(harness.onArm).toHaveBeenCalledTimes(1);
  });

  it('S8: a reverse drag yields the same rectangle as the forward one', () => {
    const forward = mount();
    drag(forward, PORTRAIT, [0.1, 0.1], [0.5, 0.6]);
    const reverse = mount();
    drag(reverse, PORTRAIT, [0.5, 0.6], [0.1, 0.1]);
    expectRegion(armedRegionOf(reverse), armedRegionOf(forward));
    expectRegion(armedRegionOf(forward), { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
  });

  it.each([
    ['S9 the left edge', [-2, 0.2], [0.4, 0.7], { x: 0, y: 0.2, width: 0.4, height: 0.5 }],
    ['S10 the right edge', [0.6, 0.2], [3, 0.7], { x: 0.6, y: 0.2, width: 0.4, height: 0.5 }],
    ['S11 the top edge', [0.2, -2], [0.7, 0.4], { x: 0.2, y: 0, width: 0.5, height: 0.4 }],
    ['S12 the bottom edge', [0.2, 0.6], [0.7, 3], { x: 0.2, y: 0.6, width: 0.5, height: 0.4 }],
  ])('clamps a drag that runs past %s', (_label, from, to, expected) => {
    const harness = mount();
    drag(harness, PORTRAIT, from as never, to as never);
    expectRegion(armedRegionOf(harness), expected as NormalizedPageRegion);
  });

  it.each([
    ['S13 narrower than 8 CSS px', [0.5, 0.5], [0.51, 0.9]],
    ['S14 shorter than 8 CSS px', [0.5, 0.2], [0.9, 0.21]],
    ['a click that never moved', [0.4, 0.4], [0.4, 0.4]],
  ])('discards a drag %s', (_label, from, to) => {
    const harness = mount();
    drag(harness, PORTRAIT, from as never, to as never);
    expect(harness.onArm).not.toHaveBeenCalled();
  });

  it.each([
    ['S16 pointercancel', 'pointercancel'],
    ['S17 lostpointercapture', 'lostpointercapture'],
  ])('%s abandons the drag instead of arming it', (_label, type) => {
    const harness = mount();
    const hit = layer(harness.container)!;
    firePointer(hit, 'pointerdown', at(0.1, 0.1, PORTRAIT));
    firePointer(hit, 'pointermove', at(0.5, 0.6, PORTRAIT));
    firePointer(hit, type, at(0.5, 0.6, PORTRAIT));
    expect(rectangle(hit as HTMLElement)).toBeNull();
    firePointer(hit, 'pointerup', at(0.5, 0.6, PORTRAIT));
    expect(harness.onArm).not.toHaveBeenCalled();
  });

  it.each([
    ['a secondary pointer', { isPrimary: false }, {}],
    ['a non-primary mouse button', { button: 2 }, {}],
    ['a different pointer finishing the gesture', {}, { pointerId: 9 }],
  ])('ignores %s', (_label, down, rest) => {
    const harness = mount();
    const hit = layer(harness.container)!;
    firePointer(hit, 'pointerdown', { ...at(0.1, 0.1, PORTRAIT), ...down });
    firePointer(hit, 'pointermove', { ...at(0.5, 0.6, PORTRAIT), ...rest });
    firePointer(hit, 'pointerup', { ...at(0.5, 0.6, PORTRAIT), ...rest });
    expect(harness.onArm).not.toHaveBeenCalled();
  });

  /** Stands in for the reader's own bubbled Escape handler. */
  const pressEscape = () => {
    const reader = vi.fn();
    document.addEventListener('keydown', reader);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    document.removeEventListener('keydown', reader);
    return reader;
  };

  it('S18: Escape clears an armed rectangle instead of closing the reader', () => {
    const harness = mount({ armedRegion: { x: 0.1, y: 0.1, width: 0.4, height: 0.5 } });
    const reader = pressEscape();
    expect(harness.onClear).toHaveBeenCalledTimes(1);
    expect(reader).not.toHaveBeenCalled();
  });

  it('S18: with nothing armed, Escape still reaches the reader unchanged', () => {
    mount();
    expect(pressEscape()).toHaveBeenCalledTimes(1);
  });

  it('S19: mode OFF stops drawing the armed rectangle and the hit layer', () => {
    const harness = mount({ armedRegion: { x: 0.1, y: 0.1, width: 0.4, height: 0.5 } });
    expect(rectangle(harness.container)).not.toBeNull();
    harness.render({ enabled: false });
    expect(layer(harness.container)).toBeNull();
    expect(rectangle(harness.container)).toBeNull();
  });

  it('S20: a new drag replaces the armed rectangle rather than adding one', () => {
    const harness = mount({ armedRegion: { x: 0.6, y: 0.6, width: 0.2, height: 0.2 } });
    drag(harness, PORTRAIT);
    expect(harness.onClear).toHaveBeenCalledTimes(1);
    expect(harness.onArm).toHaveBeenCalledTimes(1);
  });

  it('S25: an image failure drops the armed rectangle and the hit layer', () => {
    const harness = mount({ armedRegion: { x: 0.1, y: 0.1, width: 0.4, height: 0.5 } });
    act(() => {
      define(harness.image, 'naturalWidth', 0);
      harness.image.dispatchEvent(new Event('error', { bubbles: false }));
    });
    expect(harness.onClear).toHaveBeenCalledTimes(1);
    expect(layer(harness.container)).toBeNull();
  });
});

describe('P6J-F9-B2 rotation and the callback contract', () => {
  it.each([
    ['S21 90', 90, LANDSCAPE, LANDSCAPE_NATURAL, { x: 0.1, y: 0.5, width: 0.5, height: 0.4 }],
    ['S22 270', 270, LANDSCAPE, LANDSCAPE_NATURAL, { x: 0.4, y: 0.1, width: 0.5, height: 0.4 }],
    ['180', 180, PORTRAIT, PORTRAIT_NATURAL, { x: 0.5, y: 0.4, width: 0.4, height: 0.5 }],
  ])('%s degrees persists the hand-computed SOURCE rectangle', (_l, rotation, box, natural, expected) => {
    // Display rect is (0.1, 0.1, 0.4, 0.5) in every case. By the locked rules:
    //  90: x=dy=0.1, y=1-dx-dw=0.5, w=dh=0.5, h=dw=0.4
    // 270: x=1-dy-dh=0.4, y=dx=0.1, w=dh=0.5, h=dw=0.4
    // 180: x=1-dx-dw=0.5, y=1-dy-dh=0.4, w=dw=0.4, h=dh=0.5
    const harness = mount({ rotation }, box as Box, natural);
    drag(harness, box as Box);
    expectRegion(armedRegionOf(harness), expected as NormalizedPageRegion);
    expect(harness.onArm.mock.calls[0][1]).toBe(rotation);
  });

  it('S23: a NULL stored rotation is upright, and is reported as 0', () => {
    const harness = mount({ rotation: null });
    drag(harness, PORTRAIT);
    expectRegion(armedRegionOf(harness), { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
    expect(harness.onArm.mock.calls[0][1]).toBe(0);
  });

  it('S28: the armed rectangle differs from the display one it was drawn as', () => {
    // The proof that a display rectangle was not passed through unchanged.
    const harness = mount({ rotation: 90 }, LANDSCAPE, LANDSCAPE_NATURAL);
    drag(harness, LANDSCAPE);
    expect(armedRegionOf(harness)).not.toEqual({ x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
  });

  it('S29/S30: the callback carries a rectangle and a rotation, and nothing else', () => {
    const harness = mount();
    drag(harness, PORTRAIT);
    const [region, appliedRotation, ...extra] = harness.onArm.mock.calls[0];
    expect(Object.keys(region as object).sort()).toEqual(['height', 'width', 'x', 'y']);
    expect(typeof appliedRotation).toBe('number');
    expect(extra).toEqual([]);
  });

  it('draws an armed rectangle back at the place it was drawn', () => {
    // The inverse transform, exercised where a user would see it fail.
    const harness = mount(
      { rotation: 90, armedRegion: { x: 0.1, y: 0.5, width: 0.5, height: 0.4 } },
      LANDSCAPE, LANDSCAPE_NATURAL);
    expectDrawn(rectangle(harness.container) as HTMLElement, [10, 10, 40, 50]);
  });
});

describe('P6J-F9-B2 isolation', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'components/collabboard/KnowledgeDocumentPageRegionSelector.tsx'), 'utf8');

  it('S26/S27: emits no drag payload and renders no page text root', () => {
    const harness = mount();
    drag(harness, PORTRAIT);
    expect(harness.container.querySelector('[data-knowledge-page-text-root]')).toBeNull();
    for (const forbidden of ['dataTransfer', 'KNOWLEDGE_SOURCE_CLIP_MIME', 'onDragStart', 'draggable']) {
      expect(source, `the selector must not mention ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('claims no Storage, PDF or crop authority, and no rotation algebra', () => {
    // Named APIs rather than the word "crop", which the file's own comment uses
    // to say it does none: a substring guard that trips on prose gets deleted.
    for (const forbidden of [
      'supabase', 'storagePath', 'storage_path', 'createSignedUrl', 'pdfjs', '.webp',
      'getContext', 'toDataURL', 'drawImage', 'createElement',
    ]) {
      expect(source, `the selector must not mention ${forbidden}`).not.toContain(forbidden);
    }
    expect(source).toContain('rect.left + image.clientLeft');
    expect(source).toContain('rect.top + image.clientTop');
    expect(source).toContain('displayRegionToSourceRegion');
    expect(source).not.toMatch(/1 - [a-z]+\.(x|y|width|height)/);
    expect(source).not.toMatch(/(width|height):\s*rect\.(width|height)/);
  });
});
