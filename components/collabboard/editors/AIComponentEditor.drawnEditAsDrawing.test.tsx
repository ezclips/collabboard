// @vitest-environment jsdom
//
// PATCH-284. A drawn option offers "Edit as drawing" and converts from its
// stored data (getScene), never the DOM.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DrawingPostData } from '@/lib/ai/antv/toExcalidraw/drawingPost';
import AIComponentEditor from './AIComponentEditor';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

vi.mock('@/lib/ai/antv/toExcalidraw/drawingPost', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/antv/toExcalidraw/drawingPost')>();
  return {
    ...actual,
    buildDrawingPostData: vi.fn(),
    buildDrawingPostDataFromScene: vi.fn(),
  };
});

import {
  buildDrawingPostData,
  buildDrawingPostDataFromScene,
} from '@/lib/ai/antv/toExcalidraw/drawingPost';

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
  vi.clearAllMocks();
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
  kind: 'steps',
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }],
};

const PICTURE = {
  version: 1,
  width: 800,
  height: 600,
  background: '#f8fafc',
  elements: [{ id: 'r', type: 'rect', x: 0, y: 0, w: 160, h: 90, fill: '#aabbcc', stroke: '#000000' }],
};

const DATA: DrawingPostData = {
  drawingData: 'DATA',
  drawingAppState: 'APP',
  drawingFiles: 'FILES',
  previewUrl: 'data:image/svg+xml;base64,AA==',
  title: 'Water cycle',
  size: { width: 500, height: 300 },
};

function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/ai/generate-outline') {
      return new Response(JSON.stringify({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/ai/draw-picture') {
      return new Response(JSON.stringify({ picture: PICTURE, kind: 'flowchart', seed: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PATCH-284 drawn Edit as drawing', () => {
  it('offers the button for a drawn option and converts from its data', async () => {
    vi.mocked(buildDrawingPostDataFromScene).mockResolvedValue(DATA);
    const onEditAsDrawing = vi.fn();
    stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} onEditAsDrawing={onEditAsDrawing} />);

    click(buttonContaining(c, 'Diagram'));
    click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle for 7th grade');
    click(buttonContaining(c, 'Generate'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 320)); });

    const tile = c.querySelector('[data-ai-outline-option]') as HTMLElement;
    expect(tile).not.toBeNull();
    click(tile);

    const button = c.querySelector('[data-ai-edit-as-drawing="true"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    click(button);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(buildDrawingPostData).not.toHaveBeenCalled();
    expect(vi.mocked(buildDrawingPostDataFromScene)).toHaveBeenCalledTimes(1);
    const [scene, opts] = vi.mocked(buildDrawingPostDataFromScene).mock.calls[0];
    expect(scene.width).toBe(800);
    expect(scene.background).toBe('#f8fafc');
    expect(opts).toMatchObject({ background: '#f8fafc' });
    expect(onEditAsDrawing).toHaveBeenCalledWith(DATA);
  });
});
