// @vitest-environment jsdom
//
// PATCH-284 -- the AI post draws its own pictures: Show options and the type
// buttons ask /api/ai/draw-picture for three pictures, Shuffle asks for three
// more, and Save stores the drawn envelope.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { kindForOutline } from '@/lib/ai/drawn/prompt';
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
function tiles(c: ParentNode): HTMLElement[] {
  return Array.from(c.querySelectorAll('[data-ai-outline-option]')) as HTMLElement[];
}
function tileKeys(c: ParentNode): string[] {
  return tiles(c).map((tile) => tile.getAttribute('data-ai-outline-option') ?? '');
}

const OUTLINE = {
  title: 'Launch',
  ordered: true,
  kind: 'steps',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};

const PICTURE = {
  version: 1,
  width: 800,
  height: 600,
  background: '#ffffff',
  elements: [{ id: 'r', type: 'rect', x: 0, y: 0, w: 160, h: 90, fill: '#aabbcc', stroke: '#000000' }],
};

function stubFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/ai/generate-outline') {
      return new Response(JSON.stringify({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/ai/draw-picture') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({ picture: PICTURE, kind: body.kind, seed: body.seed }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function callsTo(fetchMock: ReturnType<typeof stubFetch>, url: string) {
  return fetchMock.mock.calls.filter((call) => call[0] === url);
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320));
  });
}

async function openShowOptions(c: HTMLElement, fetchMock: ReturnType<typeof stubFetch>) {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'first A then B then C');
  click(buttonContaining(c, 'Generate'));
  await settle();
  expect(callsTo(fetchMock, '/api/ai/generate-outline')).toHaveLength(1);
  expect(callsTo(fetchMock, '/api/ai/draw-picture')).toHaveLength(3);
}

describe('PATCH-284 AI post drawn options', () => {
  it('Show options draws three pictures of kindForOutline and offers no AntV option', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openShowOptions(c, fetchMock);

    const draws = callsTo(fetchMock, '/api/ai/draw-picture');
    const bodies = draws.map((call) => JSON.parse(String(call[1]?.body)));
    expect(new Set(bodies.map((body) => body.seed)).size).toBe(3);
    expect(bodies.every((body) => body.kind === kindForOutline(OUTLINE as never))).toBe(true);

    const keys = tileKeys(c);
    expect(keys).toHaveLength(3);
    expect(keys.every((key) => key.startsWith('drawn:'))).toBe(true);
    expect(keys.some((key) => key.startsWith('antv:') || key.startsWith('infographic:'))).toBe(false);
  });

  it('the Pie Chart button draws pie and asks the outline route to estimate values', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    click(buttonContaining(c, 'Diagram'));
    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'venue is the biggest cost, then food');
    click(buttonContaining(c, 'Generate'));
    await settle();

    const outlineCalls = callsTo(fetchMock, '/api/ai/generate-outline');
    expect(outlineCalls).toHaveLength(1);
    expect(JSON.parse(String(outlineCalls[0][1]?.body)).options?.estimateValues).toBe(true);

    const bodies = callsTo(fetchMock, '/api/ai/draw-picture').map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies).toHaveLength(3);
    expect(bodies.every((body) => body.kind === 'pie')).toBe(true);
  });

  it('a second type button with an outline on screen draws without another outline call', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openShowOptions(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="comparison"]') as HTMLElement);
    await settle();

    expect(callsTo(fetchMock, '/api/ai/generate-outline')).toHaveLength(1);
    const bodies = callsTo(fetchMock, '/api/ai/draw-picture').map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies).toHaveLength(6);
    expect(bodies.slice(3).every((body) => body.kind === 'comparison')).toBe(true);
  });

  it('Shuffle draws three more with fresh seeds and no outline call', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openShowOptions(c, fetchMock);

    click(c.querySelector('[data-ai-drawn-shuffle="true"]') as HTMLElement);
    await settle();

    expect(callsTo(fetchMock, '/api/ai/generate-outline')).toHaveLength(1);
    const seeds = callsTo(fetchMock, '/api/ai/draw-picture').map(
      (call) => JSON.parse(String(call[1]?.body)).seed as number,
    );
    expect(seeds).toHaveLength(6);
    expect(new Set(seeds).size).toBe(6);
  });

  it('Save stores the selected drawn envelope with its picture', async () => {
    const fetchMock = stubFetch();
    const onSave = vi.fn();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={onSave} />);
    await openShowOptions(c, fetchMock);

    click(tiles(c)[0]);
    click(buttonContaining(c, 'Save to Canvas'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.aiComponentJson.data.subtype).toBe('drawn');
    expect(saved.aiComponentJson.data.picture).toBeTruthy();
    expect(saved.aiComponentJson.data.picture.elements.length).toBeGreaterThan(0);
  });
});
