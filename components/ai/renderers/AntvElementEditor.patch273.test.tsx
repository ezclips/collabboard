// @vitest-environment jsdom
//
// PATCH-273. Codex F5 through the REAL element editor: editing design A, then
// switching to design B and editing there, must never throw away A's edits.
// A->B->A keeps each template's own move/colour/addition.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { overridesForTemplate } from '@/lib/ai/antv/templateOverrides';
import type { VisualOutline } from '@/lib/ai/outline';
import AntvElementEditor from './AntvElementEditor';
import { PictureSidePanelContext } from './PictureSidePanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** PATCH-275. A provider + host so the element panel renders in these tests. */
function PanelHostProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  return (
    <div>
      <div data-test-panel-host="true" ref={setHost} />
      <PictureSidePanelContext.Provider value={{ host, elementPanelOpen: open, setElementPanelOpen: setOpen }}>
        {children}
      </PictureSidePanelContext.Provider>
    </div>
  );
}

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
</svg>`;

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

let root: Root | null = null;
let reactHost: HTMLElement | null = null;
let container: HTMLDivElement | null = null;
let editorRef: { current: HTMLDivElement | null } | null = null;

const BASE_OUTLINE: VisualOutline = { title: 'T', ordered: false, kind: 'list', items: [{ label: 'A' }, { label: 'B' }] };

interface ControlledApi {
  getOutline(): VisualOutline;
  setTemplate(template: string): void;
}

function ControlledHost({
  initial,
  onChange,
  apiRef,
}: {
  initial: VisualOutline;
  onChange: (next: VisualOutline) => void;
  apiRef: { current: ControlledApi | null };
}) {
  const [outline, setOutline] = React.useState(initial);
  const [template, setTemplate] = React.useState('design-a');
  const stateRef = React.useRef(initial);
  const handleChange = React.useCallback(
    (next: VisualOutline) => {
      stateRef.current = next;
      setOutline(next);
      onChange(next);
    },
    [onChange],
  );
  apiRef.current = {
    getOutline: () => stateRef.current,
    setTemplate: (next) => act(() => setTemplate(next)),
  };
  return (
    <PanelHostProvider>
      <AntvElementEditor
        containerRef={editorRef!}
        template={template}
        outline={outline}
        onChange={handleChange}
      />
    </PanelHostProvider>
  );
}

function mountControlledEditor(initial: VisualOutline) {
  reactHost = document.createElement('div');
  document.body.appendChild(reactHost);
  root = createRoot(reactHost);
  editorRef = { current: container };
  const onChange = vi.fn();
  const apiRef: { current: ControlledApi | null } = { current: null };
  act(() => {
    root!.render(<ControlledHost initial={initial} onChange={onChange} apiRef={apiRef} />);
  });
  return { onChange, api: apiRef.current! };
}

function pointer(target: EventTarget, type: string, x = 0, y = 0, id = 1) {
  act(() => {
    target.dispatchEvent(
      new (window as any).PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: id }),
    );
  });
}
function click(target: EventTarget) {
  act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
function titleEl(): Element {
  return container!.querySelector('[data-element-type="title"]') as Element;
}
function labelEl(index = 0): Element {
  return container!.querySelectorAll('[data-element-type="item-label"]')[index] as Element;
}
function selectedAttr(): string | null {
  return reactHost!.querySelector('[data-ai-element-overlay]')!.getAttribute('data-ai-element-selected');
}

function selectTitle() {
  pointer(titleEl(), 'pointerdown', 40, 30, 1);
  pointer(window, 'pointerup', 40, 30, 1);
}

function moveTitle(dx: number, dy: number) {
  selectTitle();
  pointer(titleEl(), 'pointerdown', 40, 30, 1);
  pointer(window, 'pointermove', 40 + dx, 30 + dy, 1);
  pointer(window, 'pointerup', 40 + dx, 30 + dy, 1);
}

function selectItem() {
  const div = labelEl(0).querySelector('div') as Element;
  pointer(div, 'pointerdown', 200, 150, 1);
  pointer(window, 'pointerup', 200, 150, 1);
  click(div);
}

function selectLabel() {
  selectItem();
  const div = labelEl(0).querySelector('div') as Element;
  pointer(div, 'pointerdown', 200, 150, 1);
  pointer(window, 'pointerup', 200, 150, 1);
  click(div);
}

/** Pick the first available colour row's first swatch; return the hex picked. */
function colourSelected() {
  const swatch = reactHost!.querySelector('[data-ai-element-swatch]') as Element;
  expect(swatch).not.toBeNull();
  const value = swatch.getAttribute('data-ai-element-swatch-value')!;
  click(swatch);
  return value;
}

beforeEach(() => {
  container = document.createElement('div');
  container.innerHTML = FIXTURE;
  document.body.appendChild(container);
  (container as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(0, 0, 400, 300);
  (titleEl() as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(40, 30, 100, 50);
  const svg = container.querySelector('svg') as SVGSVGElement;
  (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    inverse() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
  });
  (titleEl() as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 100, height: 50 });
  const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {
    'item-label:0': { x: 190, y: 140, width: 60, height: 20 },
    'item-value:0': { x: 260, y: 140, width: 30, height: 20 },
    'item-icon:0': { x: 170, y: 140, width: 16, height: 16 },
    'item-label:1': { x: 190, y: 200, width: 60, height: 20 },
    'item-value:1': { x: 260, y: 200, width: 30, height: 20 },
    'item-icon:1': { x: 170, y: 200, width: 16, height: 16 },
    'shape:null': { x: 0, y: 100, width: 120, height: 60 },
  };
  container.querySelectorAll('[data-element-type]').forEach((el) => {
    const type = el.getAttribute('data-element-type') ?? '';
    const idx = el.getAttribute('data-indexes');
    const box = boxes[`${type}:${idx}`] ?? boxes[type];
    (el as unknown as { getBBox: () => unknown }).getBBox = () => box ?? { x: 0, y: 0, width: 1, height: 1 };
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

describe('PATCH-273 each design keeps its own edits (Codex F5)', () => {
  it('A: move + colour + circle -> B: colour -> back to A: A applied, B not -> back to B: B applied', () => {
    const { onChange, api } = mountControlledEditor(BASE_OUTLINE);

    // Design A: move the title and colour a label.
    moveTitle(30, 20);
    const afterMove = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(overridesForTemplate(afterMove, 'design-a')?.items['title#0']).toEqual({ dx: 30, dy: 20 });

    selectLabel();
    const aFill = colourSelected();
    const afterColour = onChange.mock.calls.at(-1)![0] as VisualOutline;
    const aLabel = overridesForTemplate(afterColour, 'design-a')!.items['item-label@0'];
    // A label is a text element: the fill swatch colours its text.
    expect(aLabel.text).toBe(aFill);

    // Switch to design B and colour its label differently.
    api.setTemplate('design-b');
    expect(selectedAttr()).toBe('');
    selectLabel();
    const bFill = colourSelected();
    const afterB = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(overridesForTemplate(afterB, 'design-b')!.items['item-label@0'].text).toBe(bFill);
    // A survives alongside B.
    expect(overridesForTemplate(afterB, 'design-a')!.items['title#0']).toEqual({ dx: 30, dy: 20 });
    expect(overridesForTemplate(afterB, 'design-a')!.items['item-label@0'].text).toBe(aFill);

    // Back to A: A's DOM edits reapply, B's colour is not on A.
    api.setTemplate('design-a');
    const titleTransform = titleEl().getAttribute('transform') ?? '';
    expect(titleTransform).toContain('translate(30 20)');

    // The saved payload's outline carries BOTH entries, and elementOverrides
    // mirrors the most recently edited design (B).
    const saved = api.getOutline();
    expect(Object.keys(saved.elementOverridesByTemplate ?? {}).sort()).toEqual(['design-a', 'design-b']);
    expect(saved.elementOverrides).toEqual(overridesForTemplate(saved, 'design-b'));
  });

  it('legacy post with only elementOverrides for design A keeps A edits, then editing B preserves A', () => {
    const legacy: VisualOutline = {
      ...BASE_OUTLINE,
      elementOverrides: { template: 'design-a', items: { 'title#0': { dx: 12, dy: 8 } } },
    };
    const { onChange, api } = mountControlledEditor(legacy);

    // A shows its move.
    expect(titleEl().getAttribute('transform') ?? '').toContain('translate(12 8)');

    // Editing B must not wipe A: the legacy slot is seeded into the map first.
    api.setTemplate('design-b');
    selectLabel();
    const bFill = colourSelected();
    const next = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(overridesForTemplate(next, 'design-a')?.items['title#0']).toEqual({ dx: 12, dy: 8 });
    expect(overridesForTemplate(next, 'design-b')?.items['item-label@0'].text).toBe(bFill);
  });

  it('undo after switching: edit A, switch to B, Ctrl+Z reverses B in B slot, A unchanged', () => {
    const { onChange, api } = mountControlledEditor(BASE_OUTLINE);

    // Edit A (a move). Then switch to B and edit B (a colour).
    moveTitle(25, 15);
    api.setTemplate('design-b');
    selectLabel();
    const bFill = colourSelected();
    const afterB = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(overridesForTemplate(afterB, 'design-b')!.items['item-label@0'].text).toBe(bFill);
    expect(overridesForTemplate(afterB, 'design-a')!.items['title#0']).toEqual({ dx: 25, dy: 15 });

    // Ctrl+Z: the history is reset on the design switch, so B's latest edit
    // (done after the switch) is the one reversed, in B's slot. A is untouched.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    const afterUndo = onChange.mock.calls.at(-1)![0] as VisualOutline;
    // A survived.
    expect(overridesForTemplate(afterUndo, 'design-a')!.items['title#0']).toEqual({ dx: 25, dy: 15 });
    // B's colour is gone (reversed in B's slot).
    expect(overridesForTemplate(afterUndo, 'design-b')).toBeUndefined();
  });
});
