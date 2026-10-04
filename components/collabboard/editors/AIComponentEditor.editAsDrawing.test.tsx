// @vitest-environment jsdom
//
// PATCH-278 E (generator). "Edit as drawing" appears only for an AntV design,
// is disabled exactly when Save is, reads the SELECTED preview layer while a tile
// is hovered, and calls onEditAsDrawing with the converted data.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIComponentEditor from './AIComponentEditor';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

// A fake AntV engine (as PATCH-260's test): it paints an svg into the container,
// so the selected preview layer really carries a `[data-antv-container] svg`.
const h = vi.hoisted(() => {
  class FakeInfographic {
    listeners = new Map<string, Array<(payload: unknown) => void>>();
    constructor(public options: any) {}
    on(event: string, listener: (payload: unknown) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
    }
    emit(event: string, payload?: unknown) {
      for (const listener of this.listeners.get(event) ?? []) listener(payload);
    }
    render() {
      const container = this.options.container as HTMLElement;
      container.innerHTML = '<svg viewBox="0 0 400 300"><g data-element-type="title"><text>T</text></g></svg>';
      this.emit('rendered');
      this.emit('loaded');
    }
    update() {}
    destroy() {}
  }
  return {
    lastGetSvg: null as null | (() => SVGSVGElement | null),
    mocks: { Infographic: FakeInfographic },
  };
});
vi.mock('@/lib/ai/antv/load', () => ({ loadAntv: async () => h.mocks }));

vi.mock('@/components/ai/renderers/EditAsDrawingButton', () => ({
  default: ({ getSvg, disabledReason, onDrawing }: any) => {
    h.lastGetSvg = getSvg;
    return React.createElement('button', {
      'data-ai-edit-as-drawing': 'true',
      'data-disabled': disabledReason ?? '',
      onClick: () => onDrawing({ drawingData: 'D' }),
    });
  },
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}
function drawButton(c: ParentNode): HTMLButtonElement | null {
  return c.querySelector('[data-ai-edit-as-drawing="true"]') as HTMLButtonElement | null;
}
function saveButton(c: ParentNode): HTMLButtonElement {
  return buttonContaining(c, 'Save to Canvas');
}
function tiles(c: ParentNode): HTMLElement[] {
  return Array.from(c.querySelectorAll('[data-ai-outline-option]')) as HTMLElement[];
}

const OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }, { label: 'Precipitation' }],
};

function stubFetch() {
  const fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function flush(ms = 300) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

async function openGallery(c: HTMLElement, text = 'Water cycle for 7th grade') {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, text);
  click(buttonContaining(c, 'Generate'));
  await flush();
}

/** Selects the first AntV design tile, returning its key. */
async function selectAntvTile(c: HTMLElement): Promise<string> {
  const antv = tiles(c).find((t) => (t.getAttribute('data-ai-outline-option') ?? '').startsWith('antv:'));
  expect(antv, 'no AntV tile offered').toBeTruthy();
  click(antv!);
  await flush();
  return antv!.getAttribute('data-ai-outline-option')!;
}

describe('PATCH-278 generator Edit as drawing', () => {
  it('appears only for an AntV design', async () => {
    stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} onEditAsDrawing={() => {}} />);
    await openGallery(c);

    // A non-AntV design selected -> no button.
    const ours = tiles(c).find((t) => (t.getAttribute('data-ai-outline-option') ?? '').startsWith('infographic:'));
    if (ours) {
      click(ours);
      await flush();
      expect(drawButton(c)).toBeNull();
    }

    await selectAntvTile(c);
    expect(drawButton(c)).not.toBeNull();
  });

  it('is absent when onEditAsDrawing is not given', async () => {
    stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c);
    await selectAntvTile(c);
    expect(drawButton(c)).toBeNull();
  });

  it('is disabled exactly when Save is (example values)', async () => {
    stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} onEditAsDrawing={() => {}} />);
    await openGallery(c);
    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    await flush();
    await selectAntvTile(c);

    // Example values present: Save is gated and so is the drawing button.
    expect(saveButton(c).disabled).toBe(true);
    expect(drawButton(c)).not.toBeNull();
    expect(drawButton(c)!.getAttribute('data-disabled')).toContain('chart');
  });

  it('reads the selected layer while a tile is hovered', async () => {
    stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} onEditAsDrawing={() => {}} />);
    await openGallery(c);
    await selectAntvTile(c);
    expect(drawButton(c)).not.toBeNull();

    const selectedSvg = c.querySelector(
      '[data-ai-preview-selected-layer] [data-antv-container] svg',
    );
    expect(selectedSvg, 'selected preview layer svg').not.toBeNull();
    selectedSvg!.setAttribute('data-source', 'selected');

    const hoverSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    hoverSvg.setAttribute('data-source', 'hover');
    const hoverContainer = document.createElement('div');
    hoverContainer.setAttribute('data-antv-container', 'hover-template');
    hoverContainer.appendChild(hoverSvg);
    const hoverLayer = document.createElement('div');
    hoverLayer.setAttribute('data-ai-preview-hover-layer', 'true');
    hoverLayer.appendChild(hoverContainer);
    // The hover layer sits BEFORE the selected layer in this fixture, so a naive
    // querySelector('svg') would win if the selector dropped the selected layer.
    const preview = c.querySelector('[data-ai-outline-preview="true"]')!;
    preview.insertBefore(hoverLayer, preview.firstChild);

    // Reads the live DOM at call time: the SELECTED layer, never the hover one.
    expect(typeof h.lastGetSvg).toBe('function');
    const resolved = h.lastGetSvg!();
    expect(resolved?.getAttribute('data-source')).toBe('selected');
  });

  it('clicking calls onEditAsDrawing', async () => {
    stubFetch();
    const onEditAsDrawing = vi.fn();
    const c = mount(
      <AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} onEditAsDrawing={onEditAsDrawing} />,
    );
    await openGallery(c);
    await selectAntvTile(c);
    click(drawButton(c)!);
    expect(onEditAsDrawing).toHaveBeenCalledTimes(1);
    expect(onEditAsDrawing.mock.calls[0][0]).toEqual({ drawingData: 'D' });
  });
});
