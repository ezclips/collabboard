// @vitest-environment jsdom
//
// PATCH-252. When the side panel is open the editor widens the modal and docks
// a `data-ai-side-panel-host` column on the right, into which the panel portals.
// Closing the panel shrinks the modal and removes the host.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIComponentEditor from './AIComponentEditor';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
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

const OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }, { label: 'Precipitation' }],
};

const CHART = {
  mode: 'diagram',
  version: 1,
  data: { type: 'diagram', subtype: 'pie_chart', renderer: 'chart', title: 'Budget', dataPoints: [] },
  meta: { renderer: 'chart', subtype: 'pie_chart', prompt: 'p' },
};

const DRAWN_PICTURE = {
  version: 1,
  width: 800,
  height: 600,
  background: '#ffffff',
  elements: [{ id: 'r', type: 'rect', x: 0, y: 0, w: 160, h: 90, fill: '#aabbcc', stroke: '#000000' }],
};

function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/ai/generate-outline') {
      return new Response(
        JSON.stringify({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === '/api/ai/draw-picture') {
      return new Response(JSON.stringify({ picture: DRAWN_PICTURE, kind: 'flowchart', seed: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(CHART), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openGallery(c: HTMLElement) {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle for 7th grade');
  click(buttonContaining(c, 'Generate'));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
}

function modal(c: HTMLElement): HTMLElement {
  const all = Array.from(c.querySelectorAll('div')) as HTMLElement[];
  const found = all.find(
    (el) => el.className.includes('max-w-[96vw]') && (el.className.includes('w-[980px]') || el.className.includes('w-[1320px]')),
  );
  expect(found, 'modal not found').toBeTruthy();
  return found!;
}

describe('PATCH-252 AIComponentEditor docked side panel', () => {
  it('widens the modal, docks a host column and portals the panel into it; closing restores 980px', async () => {
    stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c);

    // The panel is open on Designs and lives inside the docked host (portal).
    const host = c.querySelector('[data-ai-side-panel-host]') as HTMLElement;
    expect(host).not.toBeNull();
    const panel = host.querySelector('[data-ai-side-panel="designs"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('[data-ai-outline-tiles="true"]')).not.toBeNull();

    // The host must NOT force its own full height (the modal only has
    // max-height, so h-full grows the host with its content and the list can
    // never scroll). The flex row's default stretch gives it the row height,
    // and the portalled panel fills it absolutely.
    expect(host.className.split(/\s+/)).toContain('relative');
    expect(host.className.split(/\s+/)).not.toContain('h-full');
    expect(panel.className.split(/\s+/)).toContain('absolute');
    expect(panel.className.split(/\s+/)).toContain('inset-0');
    expect(panel.className.split(/\s+/)).not.toContain('h-full');

    // The scrolling body is height-bounded so it scrolls instead of growing.
    const body = panel.querySelector('[data-ai-outline-tiles="true"]') as HTMLElement;
    expect(body.className.split(/\s+/)).toContain('overflow-y-auto');
    expect(body.className.split(/\s+/)).toContain('min-h-0');

    expect(modal(c).className).toContain('w-[1320px]');

    // The host is a full-height sibling of the whole preview COLUMN (which
    // carries p-6), not of the dashed picture box, and it comes after it in the
    // row -- so it docks to the right rather than landing below the preview.
    const previewColumn = Array.from(c.querySelectorAll('div')).find(
      (el) => el.className.includes('flex-1') && el.className.includes('flex-col') && el.className.includes('p-6'),
    ) as HTMLElement;
    expect(previewColumn).not.toBeNull();
    expect(host.parentElement).toBe(previewColumn.parentElement);
    expect(
      previewColumn.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const dashed = c.querySelector('.border-dashed') as HTMLElement;
    expect(dashed).not.toBeNull();
    expect(dashed.contains(host)).toBe(false);

    // The × closes the panel, empties the host and shrinks the modal again.
    click(host.querySelector('[data-ai-side-panel-close="true"]')!);
    expect(c.querySelector('[data-ai-side-panel-host]')).toBeNull();
    expect(c.querySelector('[data-ai-side-panel]')).toBeNull();
    expect(modal(c).className).toContain('w-[980px]');
  });
});
