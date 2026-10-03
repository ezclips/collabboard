// @vitest-environment jsdom
//
// PATCH-260. The element editor. Defect fixes: screen-delta resize (1), SVG
// geometry for 0x0-client-rect icons (2), whole-item first click (3).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyElementOverrides } from '@/lib/ai/antv/elementOverrides';
import type { VisualOutline } from '@/lib/ai/outline';
import AntvElementEditor from './AntvElementEditor';
import { PictureZoomContext } from './PictureStage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof (window as any).PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  (window as any).PointerEvent = PointerEventPolyfill;
}

const FIXTURE = `
<svg viewBox="0 0 400 300">
  <g data-element-type="background"><rect width="400" height="300"/></g>
  <g data-element-type="title"><text>Title</text></g>
  <g data-element-type="items-group">
    <rect data-element-type="shape"/>
    <use data-element-type="item-icon" data-indexes="0" href="#i"/>
    <foreignObject data-element-type="item-label" data-indexes="0"><div>One</div></foreignObject>
    <foreignObject data-element-type="item-value" data-indexes="0"><div>10</div></foreignObject>
    <rect data-element-type="shape"/>
    <use data-element-type="item-icon" data-indexes="1" href="#i"/>
    <foreignObject data-element-type="item-label" data-indexes="1"><div>Two</div></foreignObject>
    <foreignObject data-element-type="item-value" data-indexes="1"><div>20</div></foreignObject>
  </g>
  <g data-element-type="items-group">
    <rect data-element-type="shape"/>
    <use data-element-type="item-icon" data-indexes="2" href="#i"/>
    <foreignObject data-element-type="item-label" data-indexes="2"><div>Three</div></foreignObject>
    <foreignObject data-element-type="item-value" data-indexes="2"><div>30</div></foreignObject>
  </g>
  <g data-element-type="btns-group">
    <g data-element-type="btn-add" data-indexes="0"><rect/></g>
    <g data-element-type="btn-remove" data-indexes="0"><rect/></g>
  </g>
</svg>`;

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

let root: Root | null = null;
let reactHost: HTMLElement | null = null;
let container: HTMLDivElement | null = null;
let editorRef: { current: HTMLDivElement | null } | null = null;

const BASE_OUTLINE: VisualOutline = { title: 'T', ordered: false, kind: 'list', items: [{ label: 'A' }, { label: 'B' }] };

function renderEditor(onChange: (next: VisualOutline) => void, outline: VisualOutline = BASE_OUTLINE) {
  act(() => {
    root!.render(
      <AntvElementEditor
        containerRef={editorRef!}
        template="list-grid-badge-card"
        outline={outline}
        onChange={onChange}
      />,
    );
  });
}

function mountEditor(onChange: (next: VisualOutline) => void, outline: VisualOutline = BASE_OUTLINE) {
  reactHost = document.createElement('div');
  document.body.appendChild(reactHost);
  root = createRoot(reactHost);
  editorRef = { current: container };
  renderEditor(onChange, outline);
}

function mountEditorInZoom(
  zoom: number,
  onChange: (next: VisualOutline) => void,
  outline: VisualOutline = BASE_OUTLINE,
) {
  reactHost = document.createElement('div');
  document.body.appendChild(reactHost);
  root = createRoot(reactHost);
  editorRef = { current: container };
  act(() => {
    root!.render(
      <PictureZoomContext.Provider value={zoom}>
        <AntvElementEditor
          containerRef={editorRef!}
          template="list-grid-badge-card"
          outline={outline}
          onChange={onChange}
        />
      </PictureZoomContext.Provider>,
    );
  });
}

function rerenderEditor(outline: VisualOutline, onChange: (next: VisualOutline) => void) {
  renderEditor(onChange, outline);
}

/** PATCH-261 fix. The exact selector PictureStage's pan handler blocks on. */
const PAN_BLOCK_SELECTOR =
  '[data-ai-edit-ref],[data-ai-edit-add],[data-ai-edit-remove],[data-ai-edit-shape],input,[data-element-type],[data-picture-control]';

let stageCaptures = 0;

/**
 * PATCH-261 fix. Renders the editor inside a stage-like wrapper that captures the
 * pointer for a pan unless the press landed on a picture control, exactly like
 * PictureStage. A NATIVE capture listener models the real setPointerCapture: it
 * runs before React's synthetic handlers, so a React `stopPropagation` cannot
 * hide a missing `data-picture-control`.
 */
function mountEditorInStage(onChange: (next: VisualOutline) => void, outline: VisualOutline = BASE_OUTLINE) {
  stageCaptures = 0;
  reactHost = document.createElement('div');
  document.body.appendChild(reactHost);
  root = createRoot(reactHost);
  editorRef = { current: container };
  act(() => {
    root!.render(
      <div
        data-test-stage="true"
        onPointerDown={(event) => {
          const target = event.target as Element | null;
          if (target?.closest?.(PAN_BLOCK_SELECTOR)) return;
          stageCaptures += 1;
        }}
      >
        <AntvElementEditor
          containerRef={editorRef!}
          template="list-grid-badge-card"
          outline={outline}
          onChange={onChange}
        />
      </div>,
    );
  });
  const stage = reactHost.querySelector('[data-test-stage="true"]') as HTMLElement;
  stage.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target as Element | null;
      if (target?.closest?.(PAN_BLOCK_SELECTOR)) return;
      stageCaptures += 1;
    },
    true,
  );
}

function svgOf(): SVGSVGElement {
  return container!.querySelector('svg') as SVGSVGElement;
}
function titleEl(): Element {
  return container!.querySelector('[data-element-type="title"]') as Element;
}
function labelEl(index = 0): Element {
  return container!.querySelectorAll('[data-element-type="item-label"]')[index] as Element;
}
function labelDiv(index = 0): Element {
  return labelEl(index).querySelector('div') as Element;
}
function iconEl(index = 0): Element {
  return container!.querySelectorAll('[data-element-type="item-icon"]')[index] as Element;
}
function shapeEl(index = 0): Element {
  return container!.querySelectorAll('[data-element-type="shape"]')[index] as Element;
}

function pointer(target: EventTarget, type: string, x = 0, y = 0, id = 1) {
  act(() => {
    target.dispatchEvent(
      new (window as any).PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: id }),
    );
  });
}
function click(target: EventTarget) {
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}
function keydown(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}
function selectedAttr(): string | null {
  return reactHost!.querySelector('[data-ai-element-overlay]')!.getAttribute('data-ai-element-selected');
}

function selectTitle() {
  pointer(titleEl(), 'pointerdown', 40, 30, 1);
  pointer(window, 'pointerup', 40, 30, 1);
}
function selectItem() {
  // Chrome fires pointerdown with the innermost element as the target: the
  // <div> inside the foreignObject, not the foreignObject itself.
  pointer(labelDiv(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
  pointer(window, 'pointerup', ITEM_X, ITEM_Y, 1);
  click(labelDiv(0));
}

const ITEM_X = 200;
const ITEM_Y = 150;

let currentCtm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function setCtmScale(scale: number) {
  currentCtm = { a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 };
}

beforeEach(() => {
  container = document.createElement('div');
  container.innerHTML = FIXTURE;
  document.body.appendChild(container);
  (container as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(0, 0, 400, 300);
  (titleEl() as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(40, 30, 100, 50);
  setCtmScale(1);
  const svg = svgOf();
  (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
    ...currentCtm,
    inverse() {
      const s = currentCtm.a || 1;
      return { a: 1 / s, b: 0, c: 0, d: 1 / s, e: 0, f: 0 };
    },
  });
  (titleEl() as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 100, height: 50 });
  // Give every item part a distinct small box so smallest-area hit-testing and
  // geometry measurement work exactly as they do live.
  const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {
    title: { x: 0, y: 0, width: 100, height: 50 },
    'item-label:0': { x: 190, y: 140, width: 60, height: 20 },
    'item-value:0': { x: 260, y: 140, width: 30, height: 20 },
    'item-icon:0': { x: 170, y: 140, width: 16, height: 16 },
    'item-label:1': { x: 190, y: 200, width: 60, height: 20 },
    'item-value:1': { x: 260, y: 200, width: 30, height: 20 },
    'item-icon:1': { x: 170, y: 200, width: 16, height: 16 },
    // Item 2's card sits at (0, 100..160), far from item 0/1's parts.
    'shape:null': { x: 0, y: 100, width: 120, height: 60 },
    'item-label:2': { x: 20, y: 120, width: 60, height: 20 },
    'item-value:2': { x: 90, y: 120, width: 26, height: 20 },
    'item-icon:2': { x: 2, y: 120, width: 16, height: 16 },
  };
  container!.querySelectorAll('[data-element-type]').forEach((el) => {
    const type = el.getAttribute('data-element-type') ?? '';
    const idx = el.getAttribute('data-indexes');
    const box = boxes[`${type}:${idx}`] ?? boxes[type];
    (el as unknown as { getBBox: () => unknown }).getBBox = () =>
      box ?? { x: 0, y: 0, width: 1, height: 1 };
  });
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = null;
  reactHost?.remove();
  container?.remove();
  reactHost = null;
  container = null;
});

describe('PATCH-260 AntvElementEditor', () => {
  it('a first click on a title selects the element: box, 8 handles and the bar appear', () => {
    mountEditor(vi.fn());
    selectTitle();
    expect(selectedAttr()).toBe('title#0');
    expect(reactHost!.querySelectorAll('[data-ai-element-handle]')).toHaveLength(8);
    expect(reactHost!.querySelector('[data-ai-element-bar]')).not.toBeNull();
  });

  it('a drag over 4px commits a {dx,dy} override', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectTitle();
    pointer(titleEl(), 'pointerdown', 40, 30, 1);
    pointer(window, 'pointermove', 60, 45, 1);
    pointer(window, 'pointerup', 60, 45, 1);

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(next.elementOverrides?.items['title#0']).toEqual({ dx: 20, dy: 15 });
  });

  it('does not commit a sub-threshold move', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectTitle();
    pointer(titleEl(), 'pointerdown', 40, 30, 1);
    pointer(window, 'pointermove', 42, 32, 1);
    pointer(window, 'pointerup', 42, 32, 1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a corner drag gives old + delta on each axis (defect 1)', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectTitle();

    const handle = reactHost!.querySelector('[data-ai-element-handle="se"]') as Element;
    pointer(handle, 'pointerdown', 40, 30, 7);
    pointer(window, 'pointermove', 200, 130, 7);
    pointer(window, 'pointerup', 200, 130, 7);

    expect(onChange).toHaveBeenCalledTimes(1);
    const override = onChange.mock.calls.at(-1)![0].elementOverrides.items['title#0'];
    // start 100x50, delta 160x100 -> 260x150.
    expect(100 * override.sx).toBeCloseTo(260, 6);
    expect(50 * override.sy).toBeCloseTo(150, 6);
  });

  it('resizes exactly at a non-1 screen CTM (129x52 + 40x30 = 169x82)', () => {
    // Local 64.5x26 at CTM scale 2 -> 129x52 on screen.
    (titleEl() as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(0, 0, 0, 0);
    (titleEl() as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 64.5, height: 26 });
    (titleEl() as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });

    const onChange = vi.fn();
    mountEditor(onChange);
    selectTitle();
    const handle = reactHost!.querySelector('[data-ai-element-handle="se"]') as Element;
    pointer(handle, 'pointerdown', 0, 0, 9);
    pointer(window, 'pointermove', 40, 30, 9);
    pointer(window, 'pointerup', 40, 30, 9);

    const override = onChange.mock.calls.at(-1)![0].elementOverrides.items['title#0'];
    expect(129 * override.sx).toBeCloseTo(169, 6);
    expect(52 * override.sy).toBeCloseTo(82, 6);
  });

  it('Delete hides the element, Undo restores it and Redo hides it again', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectTitle();

    click(reactHost!.querySelector('[data-ai-element-delete]') as Element);
    expect(onChange.mock.calls.at(-1)![0].elementOverrides.items['title#0'].hidden).toBe(true);

    click(reactHost!.querySelector('[data-ai-element-undo]') as Element);
    expect(onChange.mock.calls.at(-1)![0].elementOverrides).toBeUndefined();

    click(reactHost!.querySelector('[data-ai-element-redo]') as Element);
    expect(onChange.mock.calls.at(-1)![0].elementOverrides.items['title#0'].hidden).toBe(true);
  });

  it('Escape deselects', () => {
    mountEditor(vi.fn());
    selectTitle();
    expect(selectedAttr()).toBe('title#0');
    keydown('Escape');
    expect(selectedAttr()).toBe('');
  });

  it('a click without movement on an item-label is not stopped', () => {
    mountEditor(vi.fn());
    const spy = vi.fn();
    svgOf().addEventListener('click', spy);
    click(labelEl(0));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a pointerdown on empty space deselects', () => {
    mountEditor(vi.fn());
    selectTitle();
    pointer(container!, 'pointerdown', 380, 280, 1);
    pointer(window, 'pointerup', 380, 280, 1);
    expect(selectedAttr()).toBe('');
  });

  // ── Defect 3: whole-item first ─────────────────────────────────────────────

  it('first click selects the whole item, the second click drills into the element', () => {
    mountEditor(vi.fn());
    selectItem();
    expect(selectedAttr()).toBe('item@0');
    expect(
      reactHost!.querySelector('[data-ai-element-overlay]')!.getAttribute('data-ai-element-members'),
    ).toBe('shape@0#0,item-icon@0,item-label@0,item-value@0');

    pointer(labelEl(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointerup', ITEM_X, ITEM_Y, 1);
    expect(selectedAttr()).toBe('item-label@0');
    expect(
      reactHost!.querySelector('[data-ai-element-overlay]')!.getAttribute('data-ai-element-members'),
    ).toBeNull();
  });

  it('an item move writes the same dx/dy to every member in one history entry, leaves item 1, and Undo restores all', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    pointer(labelEl(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointermove', ITEM_X + 60, ITEM_Y + 40, 1);
    pointer(window, 'pointerup', ITEM_X + 60, ITEM_Y + 40, 1);

    expect(onChange).toHaveBeenCalledTimes(1);
    const items = onChange.mock.calls.at(-1)![0].elementOverrides.items;
    expect(new Set(Object.keys(items))).toEqual(
      new Set(['shape@0#0', 'item-icon@0', 'item-label@0', 'item-value@0']),
    );
    for (const key of Object.keys(items)) expect(items[key]).toMatchObject({ dx: 60, dy: 40 });
    // Item 1 must be untouched.
    for (const key of Object.keys(items)) expect(key).not.toMatch(/@1\b/);

    click(reactHost!.querySelector('[data-ai-element-undo]') as Element);
    expect(onChange.mock.calls.at(-1)![0].elementOverrides).toBeUndefined();
  });

  it('a drag on an already-selected item moves the WHOLE item (defect 4.1)', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectItem();
    expect(selectedAttr()).toBe('item@0');

    pointer(labelEl(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointermove', ITEM_X + 60, ITEM_Y + 40, 1);
    pointer(window, 'pointerup', ITEM_X + 60, ITEM_Y + 40, 1);

    const items = onChange.mock.calls.at(-1)![0].elementOverrides.items;
    expect(new Set(Object.keys(items))).toEqual(
      new Set(['shape@0#0', 'item-icon@0', 'item-label@0', 'item-value@0']),
    );
  });

  it('a drag on an unselected item selects it and moves the whole item (defect 4.1)', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    pointer(labelEl(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointermove', ITEM_X + 60, ITEM_Y + 40, 1);
    pointer(window, 'pointerup', ITEM_X + 60, ITEM_Y + 40, 1);

    expect(selectedAttr()).toBe('item@0');
    const items = onChange.mock.calls.at(-1)![0].elementOverrides.items;
    expect(new Set(Object.keys(items))).toEqual(
      new Set(['shape@0#0', 'item-icon@0', 'item-label@0', 'item-value@0']),
    );
  });

  it('a drag on a narrowed single element moves only that element (defect 4.1)', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectItem();
    // A no-move click narrows to the label.
    pointer(labelEl(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointerup', ITEM_X, ITEM_Y, 1);
    expect(selectedAttr()).toBe('item-label@0');

    onChange.mockClear();
    pointer(labelEl(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointermove', ITEM_X + 60, ITEM_Y + 40, 1);
    pointer(window, 'pointerup', ITEM_X + 60, ITEM_Y + 40, 1);

    const items = onChange.mock.calls.at(-1)![0].elementOverrides.items;
    expect(Object.keys(items)).toEqual(['item-label@0']);
  });

  // ── Defect 2: icons ────────────────────────────────────────────────────────

  it('selects an icon whose client rect is 0x0, using SVG geometry for the box', () => {
    const icon = iconEl();
    (icon as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(0, 0, 0, 0);
    (icon as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 10, y: 20, width: 24, height: 24 });
    (icon as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 100, f: 200 });

    mountEditor(vi.fn());
    pointer(icon, 'pointerdown', 130, 245, 1);
    pointer(window, 'pointerup', 130, 245, 1);
    pointer(icon, 'pointerdown', 130, 245, 1);
    pointer(window, 'pointerup', 130, 245, 1);

    expect(selectedAttr()).toBe('item-icon@0');
    const box = reactHost!.querySelector('[data-ai-element-box]') as HTMLElement;
    // 48x48 screen px over a 400x300 container.
    expect(box.style.width).toBe('12%');
    expect(box.style.height).toBe('16%');
  });

  // ── Defect 4.2: smallest-box hit testing ───────────────────────────────────

  it('clicking an icon under a big overlapping title box picks the icon, never the title', () => {
    // The title covers the whole items area; the icon is a small box inside it.
    (titleEl() as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 400, height: 300 });
    const icon = iconEl();
    (icon as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 190, y: 140, width: 20, height: 20 });

    mountEditor(vi.fn());
    // First pointerdown on the icon: selects the whole item.
    pointer(icon, 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointerup', ITEM_X, ITEM_Y, 1);
    expect(selectedAttr()).toBe('item@0');

    // Second: narrows to the icon, not the title.
    pointer(icon, 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointerup', ITEM_X, ITEM_Y, 1);
    expect(selectedAttr()).toBe('item-icon@0');
  });

  // ── Defect 5.1: narrowing on a real click (innermost target) ────────────────

  it('narrows item@0 to the label on a real pointerdown/up/click, using the inline <div> target', () => {
    mountEditor(vi.fn());
    selectItem();
    expect(selectedAttr()).toBe('item@0');

    // Chrome: target is the <div> inside the foreignObject; the click follows.
    pointer(labelDiv(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointerup', ITEM_X, ITEM_Y, 1);
    click(labelDiv(0));
    expect(selectedAttr()).toBe('item-label@0');
  });

  it('narrows on the click alone when pointerup never reaches window', () => {
    mountEditor(vi.fn());
    selectItem();
    expect(selectedAttr()).toBe('item@0');

    pointer(labelDiv(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    // No window pointerup: only the real click arrives.
    click(labelDiv(0));
    expect(selectedAttr()).toBe('item-label@0');
  });

  // ── Defect 5.3: zoom-aware move ─────────────────────────────────────────────

  it('commits a dx scaled by the CURRENT screen CTM, not one cached before a zoom', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectItem();
    expect(selectedAttr()).toBe('item@0');

    // Start the drag at scale 1, then the stage zooms to scale 2 MID-drag: the
    // matrix must be recomputed per pointermove, so 50 screen px from the start
    // maps through the new scale, not the one cached at pointerdown.
    pointer(labelDiv(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    setCtmScale(2);
    pointer(window, 'pointermove', ITEM_X + 50, ITEM_Y, 1);
    pointer(window, 'pointerup', ITEM_X + 50, ITEM_Y, 1);

    const items = onChange.mock.calls.at(-1)![0].elementOverrides.items;
    expect(items['item-label@0'].dx).toBeCloseTo(25, 6);
    expect(items['item-label@0'].dy).toBeCloseTo(0, 6);
  });

  // ── Defect 6.1: text double-click reaches AntV ─────────────────────────────

  it('a double-click on a label is not stopped by our layer', () => {
    mountEditor(vi.fn());
    const svg = svgOf();
    const dbl = vi.fn();
    svg.addEventListener('dblclick', dbl);

    // Real order: two down/up/click pairs, then dblclick.
    pointer(labelDiv(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointerup', ITEM_X, ITEM_Y, 1);
    click(labelDiv(0));
    pointer(labelDiv(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointerup', ITEM_X, ITEM_Y, 1);
    const second = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { labelDiv(0).dispatchEvent(second); });
    const dblEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
    act(() => { labelDiv(0).dispatchEvent(dblEvent); });

    expect(dbl).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
    expect(dblEvent.defaultPrevented).toBe(false);
  });

  // ── Defect 6.4: a click on a different item selects that whole item ─────────

  it('clicking a different item selects that whole item, never narrows it', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    // Select item 0 first.
    selectItem();
    expect(selectedAttr()).toBe('item@0');

    // Click item 2's label: a different item -> select item@2, no narrowing.
    const label2 = labelEl(2);
    pointer(label2.querySelector('div') as Element, 'pointerdown', 30, 125, 1);
    pointer(window, 'pointerup', 30, 125, 1);
    click(label2.querySelector('div') as Element);
    expect(selectedAttr()).toBe('item@2');

    // Delete then hides every member of item 2, not just one element.
    click(reactHost!.querySelector('[data-ai-element-delete]') as Element);
    const items = onChange.mock.calls.at(-1)![0].elementOverrides.items;
    expect(new Set(Object.keys(items))).toEqual(
      new Set(['shape@2#0', 'item-icon@2', 'item-label@2', 'item-value@2']),
    );
  });

  // ── Defect 7.2: selection after zoom uses the CURRENT geometry ──────────────

  it('selects item 2 after the screen CTM changed (zoom), using fresh geometry', () => {
    mountEditor(vi.fn());
    // First select something else.
    selectItem();
    expect(selectedAttr()).toBe('item@0');

    // The stage zooms: the svg CTM scale becomes 3. The click arrives on the
    // CONTAINER (as when the pointer is over our overlay chrome), so only fresh
    // geometry can identify item 2. item-label:2 base (20,120,60,20) ->
    // screen (60,360,180,60); centre (150, 390).
    setCtmScale(3);
    pointer(container!, 'pointerdown', 150, 390, 1);
    pointer(window, 'pointerup', 150, 390, 1);
    expect(selectedAttr()).toBe('item@2');
  });

  // ── Defect 7.3: a double-click on text after another element is selected ───

  it('a double-click on item 2 after item-icon@1 is selected reaches the svg and calls no onChange', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    // Select the icon of item 1.
    const icon1 = iconEl(1);
    (icon1 as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 170, y: 200, width: 16, height: 16 });
    pointer(icon1, 'pointerdown', 178, 208, 1);
    pointer(window, 'pointerup', 178, 208, 1);
    expect(selectedAttr()).toBe('item@1');
    pointer(icon1, 'pointerdown', 178, 208, 1);
    pointer(window, 'pointerup', 178, 208, 1);
    expect(selectedAttr()).toBe('item-icon@1');

    const svg = svgOf();
    const dbl = vi.fn();
    svg.addEventListener('dblclick', dbl);

    // Double-click item 2's label: the first click selects item@2, the second
    // narrows, then the dblclick must still reach the svg.
    const label2Div = labelEl(2).querySelector('div') as Element;
    pointer(label2Div, 'pointerdown', 30, 125, 1);
    pointer(window, 'pointerup', 30, 125, 1);
    click(label2Div);
    pointer(label2Div, 'pointerdown', 30, 125, 1);
    pointer(window, 'pointerup', 30, 125, 1);
    click(label2Div);
    const dblEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
    act(() => { label2Div.dispatchEvent(dblEvent); });

    expect(dbl).toHaveBeenCalledTimes(1);
    expect(dblEvent.defaultPrevented).toBe(false);
    // Selection alone must never produce an outline change.
    expect(onChange).not.toHaveBeenCalled();
  });

  // ── Defect 1: a resize must not corrupt the committed override ─────────────

  it('a handle press with no movement changes nothing, and a se drag keeps the committed dx/dy', () => {
    const onChange = vi.fn();
    // The committed move is the editor's own local state (it mounted with it).
    const committed = { template: 'list-grid-badge-card', items: { 'shape@0#0': { dx: 187.64, dy: -49.45 } } };
    const outline: VisualOutline = { ...BASE_OUTLINE, elementOverrides: committed };
    mountEditor(onChange, outline);
    applyElementOverrides(container!, committed, 'list-grid-badge-card');
    // All fixture shapes share the same mocked box; keep the other items' shapes
    // away from the click point so the smallest-box hit test lands on item 0's.
    for (const extra of [1, 2]) {
      (shapeEl(extra) as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 1, height: 1 });
    }

    // Select item 0, then narrow to the shape.
    selectItem();
    pointer(shapeEl(), 'pointerdown', 100, 150, 1);
    pointer(window, 'pointerup', 100, 150, 1);
    click(shapeEl());
    expect(selectedAttr()).toBe('shape@0#0');
    const beforeHandle = shapeEl().getAttribute('transform');
    expect(beforeHandle).toContain('translate(187.64 -49.45');

    // Pressing a handle with no movement must change nothing.
    const handle = reactHost!.querySelector('[data-ai-element-handle="se"]') as Element;
    pointer(handle, 'pointerdown', 100, 150, 7);
    expect(shapeEl().getAttribute('transform')).toBe(beforeHandle);

    // The drag then changes only the scale; the committed dx/dy are kept.
    pointer(window, 'pointermove', 130, 170, 7);
    pointer(window, 'pointerup', 130, 170, 7);

    const override = onChange.mock.calls.at(-1)![0].elementOverrides.items['shape@0#0'];
    expect(override.dx).toBeCloseTo(187.64, 6);
    expect(override.dy).toBeCloseTo(-49.45, 6);
    expect(override.sx).not.toBeCloseTo(1, 6);
    expect(override.sy).not.toBeCloseTo(1, 6);
  });

  it('does not let a late/foreign outline prop clobber the committed overrides', () => {
    const onChange = vi.fn();
    const committed = { template: 'list-grid-badge-card', items: { 'title#0': { dx: 20, dy: 15 } } };
    mountEditor(onChange, { ...BASE_OUTLINE, elementOverrides: committed });

    // The parent re-renders with an outline that lost the overrides (the live
    // defect). The editor must keep what the user committed.
    rerenderEditor({ ...BASE_OUTLINE }, onChange);

    selectTitle();
    pointer(titleEl(), 'pointerdown', 40, 30, 1);
    pointer(window, 'pointermove', 60, 45, 1);
    pointer(window, 'pointerup', 60, 45, 1);

    const override = onChange.mock.calls.at(-1)![0].elementOverrides.items['title#0'];
    expect(override.dx).toBeCloseTo(40, 6);
    expect(override.dy).toBeCloseTo(30, 6);
  });

  // ── Defect 2: the selection overlay follows a zoom / viewBox rewrite ─────────

  it('recomputes the selection box when the picture viewBox changes (defect 2)', async () => {
    mountEditor(vi.fn());
    selectItem();
    const before = reactHost!.querySelector('[data-ai-element-box]') as HTMLElement;
    expect(before.style.width).toBe('72.5%');

    // The stage zooms: the CTM scales and the svg viewBox is rewritten. The
    // MutationObserver callback is a microtask, so await it inside act().
    setCtmScale(3);
    await act(async () => {
      svgOf().setAttribute('viewBox', '0 0 200 150');
      await Promise.resolve();
    });

    const after = reactHost!.querySelector('[data-ai-element-box]') as HTMLElement;
    expect(after.style.top).toBe('100%');
    expect(parseFloat(after.style.width)).toBeCloseTo(217.5, 6);
    expect(after.style.height).toBe('60%');
  });

  // ── Defect 3: never interfere with AntV's inline text editor ────────────────

  it('does not hide an element while AntV inline text editing is active (defect 3)', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectTitle();
    expect(selectedAttr()).toBe('title#0');

    const inline = document.createElement('div');
    inline.setAttribute('contenteditable', 'true');
    inline.className = 'infographic-inline-text-editor';
    container!.appendChild(inline);

    keydown('Backspace');
    keydown('Delete');
    expect(onChange).not.toHaveBeenCalled();
  });

  // ── Defect 4: the drag end must survive swallowed/captured pointer events ───

  it('commits a drag when a listener on the svg stops pointerup propagation', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectTitle();
    onChange.mockClear();

    // AntV's own interactions live on the svg and can stop the bubble phase.
    svgOf().addEventListener('pointerup', (event) => event.stopPropagation());

    pointer(titleEl(), 'pointerdown', 40, 30, 5);
    pointer(window, 'pointermove', 60, 45, 5);
    pointer(titleEl(), 'pointerup', 60, 45, 5);

    expect(onChange).toHaveBeenCalledTimes(1);
    const override = onChange.mock.calls.at(-1)![0].elementOverrides.items['title#0'];
    expect(override.dx).toBeCloseTo(20, 6);
    expect(override.dy).toBeCloseTo(15, 6);
  });

  it('commits a drag when the pointer is captured and pointerup is retargeted', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectTitle();
    onChange.mockClear();

    // The pointerdown target captures the pointer: pointerup is retargeted to it
    // and never reaches window. Only `lostpointercapture` reveals the drop.
    const title = titleEl();
    (title as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture = () => {};
    (title as unknown as { hasPointerCapture?: (id: number) => boolean }).hasPointerCapture = () => true;

    pointer(title, 'pointerdown', 40, 30, 6);
    pointer(window, 'pointermove', 60, 45, 6);
    // The captured element fires lostpointercapture on release, not pointerup.
    act(() => {
      title.dispatchEvent(new (window as any).PointerEvent('lostpointercapture', { bubbles: true, cancelable: true, pointerId: 6 }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const override = onChange.mock.calls.at(-1)![0].elementOverrides.items['title#0'];
    expect(override.dx).toBeCloseTo(20, 6);
    expect(override.dy).toBeCloseTo(15, 6);
  });

  it('commits an open drag when only the trailing click arrives', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectTitle();
    onChange.mockClear();

    pointer(titleEl(), 'pointerdown', 40, 30, 7);
    pointer(window, 'pointermove', 60, 45, 7);
    // No pointerup at all: only the trailing click reaches the page.
    click(titleEl());

    expect(onChange).toHaveBeenCalledTimes(1);
    const override = onChange.mock.calls.at(-1)![0].elementOverrides.items['title#0'];
    expect(override.dx).toBeCloseTo(20, 6);
    expect(override.dy).toBeCloseTo(15, 6);
  });
});

// ── PATCH-261: per-element colour menu ───────────────────────────────────────

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Shape 0 is the big box at (100,150); the other shapes shrink away. */
function shrinkOtherShapes() {
  for (const extra of [1, 2]) {
    (shapeEl(extra) as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 1, height: 1 });
  }
}

function selectShape() {
  selectItem();
  shrinkOtherShapes();
  pointer(shapeEl(), 'pointerdown', 100, 150, 1);
  pointer(window, 'pointerup', 100, 150, 1);
  click(shapeEl());
}

function selectIcon() {
  // icon:0 base box (170,140,16,16); two down/up pairs: item, then the icon.
  pointer(iconEl(), 'pointerdown', 178, 148, 1);
  pointer(window, 'pointerup', 178, 148, 1);
  pointer(iconEl(), 'pointerdown', 178, 148, 1);
  pointer(window, 'pointerup', 178, 148, 1);
}

function selectLabel() {
  selectItem();
  pointer(labelDiv(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
  pointer(window, 'pointerup', ITEM_X, ITEM_Y, 1);
  click(labelDiv(0));
}

function openColour() {
  click(reactHost!.querySelector('[data-ai-element-colour-toggle]') as Element);
}

function colourPopover(): Element | null {
  return reactHost!.querySelector('[data-ai-element-colour]');
}

describe('PATCH-261 AntvElementEditor colour menu', () => {
  it('a shape shows a Colour button; picking a Fill swatch commits {fill}', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectShape();
    openColour();
    expect(colourPopover()).not.toBeNull();

    const swatch = reactHost!.querySelector('[data-ai-element-swatch="fill"]') as HTMLElement;
    const value = swatch.getAttribute('data-ai-element-swatch-value')!;
    click(swatch);

    const override = onChange.mock.calls.at(-1)![0].elementOverrides.items['shape@0#0'];
    expect(override.fill).toBe(value);
  });

  it('a hex field #ABC commits the normalised #aabbcc', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectShape();
    openColour();

    const hex = reactHost!.querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement;
    setInputValue(hex, '#ABC');

    expect(onChange.mock.calls.at(-1)![0].elementOverrides.items['shape@0#0'].fill).toBe('#aabbcc');
  });

  it('an invalid hex shows a red outline and commits nothing', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectShape();
    openColour();
    onChange.mockClear();

    const hex = reactHost!.querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement;
    setInputValue(hex, 'red');

    expect(onChange).not.toHaveBeenCalled();
    expect(hex.getAttribute('data-ai-element-hex-invalid')).toBe('true');
  });

  it('a text element shows only the Text row', () => {
    mountEditor(vi.fn());
    selectLabel();
    openColour();
    expect(reactHost!.querySelector('[data-ai-element-hex="text"]')).not.toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-hex="fill"]')).toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-hex="border"]')).toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-hex="icon"]')).toBeNull();
  });

  it('an icon shows only the Icon colour row', () => {
    mountEditor(vi.fn());
    selectIcon();
    openColour();
    expect(reactHost!.querySelector('[data-ai-element-hex="icon"]')).not.toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-hex="fill"]')).toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-hex="border"]')).toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-hex="text"]')).toBeNull();
  });

  it('double-click on a shape opens the popover', () => {
    mountEditor(vi.fn());
    shrinkOtherShapes();
    // Select the shape first so the geometry is measured live.
    pointer(shapeEl(), 'pointerdown', 100, 150, 1);
    pointer(window, 'pointerup', 100, 150, 1);
    act(() => {
      shapeEl().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 100, clientY: 150 }));
    });
    expect(colourPopover()).not.toBeNull();
  });

  it('double-click on text does not open the popover and still reaches the svg', () => {
    mountEditor(vi.fn());
    const svg = svgOf();
    const dbl = vi.fn();
    svg.addEventListener('dblclick', dbl);

    const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: ITEM_X, clientY: ITEM_Y });
    act(() => { labelDiv(0).dispatchEvent(event); });

    expect(dbl).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    expect(colourPopover()).toBeNull();
  });

  it('Reset colour removes fill/stroke/text from the element override', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectShape();
    openColour();
    click(reactHost!.querySelector('[data-ai-element-swatch="fill"]') as Element);
    click(reactHost!.querySelector('[data-ai-element-colour-reset]') as Element);

    const override = onChange.mock.calls.at(-1)![0].elementOverrides?.items['shape@0#0'];
    expect(override?.fill).toBeUndefined();
    expect(override?.stroke).toBeUndefined();
    expect(override?.text).toBeUndefined();
  });

  it('undo restores the previous colour', () => {
    const onChange = vi.fn();
    const committed = { template: 'list-grid-badge-card', items: { 'shape@0#0': { fill: '#111111' } } };
    mountEditor(onChange, { ...BASE_OUTLINE, elementOverrides: committed });

    selectShape();
    openColour();
    click(reactHost!.querySelector('[data-ai-element-swatch="fill"]') as Element);
    const picked = onChange.mock.calls.at(-1)![0].elementOverrides.items['shape@0#0'].fill;
    expect(picked).not.toBe('#111111');

    click(reactHost!.querySelector('[data-ai-element-undo]') as Element);
    expect(onChange.mock.calls.at(-1)![0].elementOverrides.items['shape@0#0'].fill).toBe('#111111');
  });

  it('sets user-select none on the body for the duration of a drag, then restores it', () => {
    mountEditor(vi.fn());
    selectTitle();

    pointer(titleEl(), 'pointerdown', 40, 30, 1);
    pointer(window, 'pointermove', 60, 45, 1);
    expect(document.body.style.userSelect).toBe('none');

    pointer(window, 'pointerup', 60, 45, 1);
    expect(document.body.style.userSelect).toBe('');
  });

  it('ignores AntV\'s transient-container overlay: a click on the card selects the item, the next narrows to the shape', () => {
    // AntV's editor appends its selection/hover overlay group LAST; its highlight
    // rect covers item 0's card. It is not part of the picture.
    const transient = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    transient.setAttribute('data-element-type', 'transient-container');
    const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    transient.appendChild(highlight);
    svgOf().appendChild(transient);
    (transient as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 100, width: 120, height: 60 });
    (transient as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(0, 100, 120, 60);

    shrinkOtherShapes();
    mountEditor(vi.fn());

    // (10,145) is inside item 0's card and under the transient highlight.
    pointer(svgOf(), 'pointerdown', 10, 145, 1);
    pointer(window, 'pointerup', 10, 145, 1);
    expect(selectedAttr()).toBe('item@0');

    pointer(svgOf(), 'pointerdown', 10, 145, 1);
    pointer(window, 'pointerup', 10, 145, 1);
    expect(selectedAttr()).toBe('shape@0#0');
  });
});

// ── PATCH-261 fix: a press on the bar or popover is a picture control ─────────

describe('PATCH-261 colour controls vs PictureStage pan capture', () => {
  it('a real pointerdown on the Colour button is not captured, opens the popover and keeps the selection', () => {
    const onChange = vi.fn();
    mountEditorInStage(onChange);
    selectShape();
    expect(selectedAttr()).toBe('shape@0#0');

    const toggle = reactHost!.querySelector('[data-ai-element-colour-toggle]') as Element;
    pointer(toggle, 'pointerdown', 0, 0, 1);
    pointer(window, 'pointerup', 0, 0, 1);
    click(toggle);

    expect(stageCaptures).toBe(0);
    expect(colourPopover()).not.toBeNull();
    expect(selectedAttr()).toBe('shape@0#0');
  });

  it('a pointerdown on the bar Undo and on a popover swatch is not captured by the stage', () => {
    mountEditorInStage(vi.fn());
    selectShape();

    pointer(reactHost!.querySelector('[data-ai-element-undo]') as Element, 'pointerdown', 0, 0, 1);
    pointer(window, 'pointerup', 0, 0, 1);
    expect(stageCaptures).toBe(0);

    click(reactHost!.querySelector('[data-ai-element-colour-toggle]') as Element);
    pointer(reactHost!.querySelector('[data-ai-element-swatch="fill"]') as Element, 'pointerdown', 0, 0, 1);
    pointer(window, 'pointerup', 0, 0, 1);
    expect(stageCaptures).toBe(0);
  });

  it('a pointerdown inside the colour popover does not deselect', () => {
    mountEditorInStage(vi.fn());
    selectShape();
    click(reactHost!.querySelector('[data-ai-element-colour-toggle]') as Element);
    expect(colourPopover()).not.toBeNull();

    pointer(colourPopover() as Element, 'pointerdown', 0, 0, 1);
    pointer(window, 'pointerup', 0, 0, 1);
    expect(selectedAttr()).toBe('shape@0#0');
  });
});

// ── PATCH-261 fix: a text selection clears AntV's toolbar above it ───────────

function barTopPercent(): number {
  const bar = reactHost!.querySelector('[data-ai-element-bar]') as HTMLElement;
  const match = /([\d.]+)%/.exec(bar.style.top);
  return match ? Number(match[1]) : Number.NaN;
}

function boxBottomPercent(): number {
  const box = reactHost!.querySelector('[data-ai-element-box]') as HTMLElement;
  return parseFloat(box.style.top) + parseFloat(box.style.height);
}

describe('PATCH-261 text selection bar placement', () => {
  it("places the bar BELOW the box for a text selection (clear of AntV's toolbar)", () => {
    mountEditor(vi.fn());
    selectLabel();
    expect(selectedAttr()).toBe('item-label@0');

    const bar = reactHost!.querySelector('[data-ai-element-bar]') as HTMLElement;
    expect(bar.getAttribute('data-ai-element-bar-placement')).toBe('below');
    expect(barTopPercent()).toBeGreaterThanOrEqual(boxBottomPercent() - 0.001);
  });

  it('keeps the bar ABOVE the box for a shape selection', () => {
    mountEditor(vi.fn());
    selectShape();

    const bar = reactHost!.querySelector('[data-ai-element-bar]') as HTMLElement;
    expect(bar.getAttribute('data-ai-element-bar-placement')).toBe('above');
    expect(barTopPercent()).toBeLessThan(boxBottomPercent());
  });

  it('opens the colour popover below the bar for a text selection', () => {
    mountEditor(vi.fn());
    selectLabel();
    openColour();

    const popover = colourPopover() as HTMLElement;
    expect(popover).not.toBeNull();
    const match = /([\d.]+)%/.exec(popover.style.top);
    // jsdom rounds a calc() percentage to ~4 decimals, so allow a small epsilon.
    expect(match ? Number(match[1]) : Number.NaN).toBeGreaterThanOrEqual(boxBottomPercent() - 0.01);
  });
});

// ── PATCH-263: the resize handles sit outside a small selection ──────────────

const SCREEN_W = 400;
const SCREEN_H = 300;
/** Tailwind h-2.5 = 10px; counterScale is 1 without a PictureStage. */
const HANDLE_HALF = 5;

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function handleNames(): string[] {
  return Array.from(reactHost!.querySelectorAll('[data-ai-element-handle]')).map(
    (el) => el.getAttribute('data-ai-element-handle') as string,
  );
}

/** Each rendered handle's on-screen rect, read from its inline percent position. */
function handleRects(): Array<{ name: string } & ScreenRect> {
  return Array.from(reactHost!.querySelectorAll('[data-ai-element-handle]')).map((el) => {
    const name = el.getAttribute('data-ai-element-handle') as string;
    const cx = (parseFloat((el as HTMLElement).style.left) / 100) * SCREEN_W;
    const cy = (parseFloat((el as HTMLElement).style.top) / 100) * SCREEN_H;
    return { name, left: cx - HANDLE_HALF, top: cy - HANDLE_HALF, right: cx + HANDLE_HALF, bottom: cy + HANDLE_HALF };
  });
}

function selectionScreenBox(): ScreenRect {
  const box = reactHost!.querySelector('[data-ai-element-box]') as HTMLElement;
  const left = (parseFloat(box.style.left) / 100) * SCREEN_W;
  const top = (parseFloat(box.style.top) / 100) * SCREEN_H;
  const width = (parseFloat(box.style.width) / 100) * SCREEN_W;
  const height = (parseFloat(box.style.height) / 100) * SCREEN_H;
  return { left, top, right: left + width, bottom: top + height };
}

/** Strict interior overlap: touching edges is not an intersection. */
function intersectsInterior(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function selectTitleAt(x: number, y: number) {
  pointer(titleEl(), 'pointerdown', x, y, 1);
  pointer(window, 'pointerup', x, y, 1);
}

describe('PATCH-263 handles clear the selection box', () => {
  it('a 100x14 selection hides n/s and no handle overlaps the interior', () => {
    (titleEl() as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 100, height: 14 });
    mountEditor(vi.fn());
    selectTitleAt(40, 7);
    expect(selectedAttr()).toBe('title#0');

    const names = handleNames();
    expect(names).not.toContain('n');
    expect(names).not.toContain('s');
    expect(new Set(names)).toEqual(new Set(['nw', 'ne', 'e', 'se', 'sw', 'w']));

    const box = selectionScreenBox();
    expect(box.right - box.left).toBeCloseTo(100, 6);
    expect(box.bottom - box.top).toBeCloseTo(14, 6);
    for (const handle of handleRects()) {
      expect(intersectsInterior(handle, box), `${handle.name} overlaps the box`).toBe(false);
    }
  });

  it('a 100x100 selection keeps all 8 handles and none overlaps the interior', () => {
    (titleEl() as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 100, height: 100 });
    mountEditor(vi.fn());
    selectTitleAt(40, 30);
    expect(selectedAttr()).toBe('title#0');

    expect(new Set(handleNames())).toEqual(new Set(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']));
    const box = selectionScreenBox();
    for (const handle of handleRects()) {
      expect(intersectsInterior(handle, box), `${handle.name} overlaps the box`).toBe(false);
    }
  });

  it('a click at the centre of a small selected label reaches the svg and narrows to the label', () => {
    // Item 0's label shrinks to 100x14 centred exactly on ITEM_X/ITEM_Y.
    (labelEl(0) as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 150, y: 143, width: 100, height: 14 });
    mountEditor(vi.fn());
    const svgClicks = vi.fn();
    svgOf().addEventListener('click', svgClicks);

    selectItem();
    expect(selectedAttr()).toBe('item@0');
    svgClicks.mockClear();

    pointer(labelDiv(0), 'pointerdown', ITEM_X, ITEM_Y, 1);
    pointer(window, 'pointerup', ITEM_X, ITEM_Y, 1);
    click(labelDiv(0));

    expect(selectedAttr()).toBe('item-label@0');
    expect(svgClicks).toHaveBeenCalledTimes(1);
  });

  it('a dblclick at the centre of a selected small text element reaches the svg untouched', () => {
    (labelEl(0) as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 150, y: 143, width: 100, height: 14 });
    mountEditor(vi.fn());
    selectLabel();
    expect(selectedAttr()).toBe('item-label@0');

    const dbl = vi.fn();
    svgOf().addEventListener('dblclick', dbl);
    const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: ITEM_X, clientY: ITEM_Y });
    act(() => { labelDiv(0).dispatchEvent(event); });

    expect(dbl).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });
});

// ── PATCH-263 Addendum 2: the chrome uses the layer's real counter-scale ─────

describe('PATCH-263 Addendum 2 editor chrome scale', () => {
  function transformScale(el: HTMLElement): number {
    const match = /scale\(([\d.]+)\)/.exec(el.style.transform);
    return match ? Number(match[1]) : Number.NaN;
  }

  it('sizes the handles and bar from the layer real scale, not the context zoom', () => {
    mountEditorInZoom(0.5, vi.fn());
    selectTitle();
    expect(selectedAttr()).toBe('title#0');

    const handle = reactHost!.querySelector('[data-ai-element-handle="se"]') as HTMLElement;
    const bar = reactHost!.querySelector('[data-ai-element-bar]') as HTMLElement;
    // The layer is not css-scaled (rect === offsetWidth), so the real scale is
    // 1: the 0.5 context zoom must be ignored.
    Object.defineProperty(container!, 'offsetWidth', { value: 400, configurable: true });
    act(() => { window.dispatchEvent(new Event('resize')); });

    expect(10 * transformScale(handle)).toBeCloseTo(10, 6);
    expect(transformScale(bar)).toBeCloseTo(1, 6);
  });
});

// ── PATCH-263 Addendum 3: the popover stays inside the preview ───────────────

describe('PATCH-263 Addendum 3 popover clamp', () => {
  it('clamps the colour popover left so its right edge stays inside the preview', () => {
    (titleEl() as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 360, y: 0, width: 40, height: 40 });
    mountEditor(vi.fn());
    selectTitleAt(380, 20);
    expect(selectedAttr()).toBe('title#0');
    openColour();

    const popover = colourPopover() as HTMLElement;
    expect(popover).not.toBeNull();
    const overlay = reactHost!.querySelector('[data-ai-element-overlay]') as HTMLElement;
    (overlay as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () =>
      rect(0, 0, 400, 300);
    Object.defineProperty(popover, 'offsetWidth', { value: 300, configurable: true });
    act(() => { window.dispatchEvent(new Event('resize')); });

    const left = parseFloat(popover.style.left);
    const renderedWidthPercent = (300 / 400) * 100;
    expect(left + renderedWidthPercent).toBeLessThanOrEqual(100.0001);
    expect(left).toBeCloseTo(25, 3);
  });
});
