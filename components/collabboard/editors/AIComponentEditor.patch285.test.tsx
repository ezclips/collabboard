// @vitest-environment jsdom
//
// PATCH-285. The drawn generator preview is editable: clicking an object opens
// one panel, edits are kept per option key (and dropped with a Shuffle), Save
// stores the edited picture, and the type buttons read as selected. Also re-adds
// the PATCH-279 title rule and the "type buttons never call the old generator"
// guarantee whose tests were removed in PATCH-284.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIComponentEditor from './AIComponentEditor';

vi.mock('@/components/ai/renderers/PictureStage', () => ({
  default: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

// The real conversion is not the subject; expose the chosen title for the
// re-added PATCH-279 rule.
vi.mock('@/components/ai/renderers/EditAsDrawingButton', () => ({
  default: ({ title, onDrawing }: { title?: string; onDrawing: (data: unknown) => void }) =>
    React.createElement('button', {
      'data-ai-edit-as-drawing': 'true',
      'data-title': title ?? '',
      onClick: () => onDrawing({ drawingData: 'D' }),
    }),
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
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}
function generateButton(root: ParentNode): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => /^(Generate|Regenerate)$/.test((b.textContent ?? '').trim()));
  expect(found, 'no Generate button').toBeTruthy();
  return found as HTMLButtonElement;
}
function tiles(c: ParentNode): HTMLElement[] {
  return Array.from(c.querySelectorAll('[data-ai-outline-option]')) as HTMLElement[];
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

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 320)); });
}

async function openDrawn(c: HTMLElement) {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'first A then B then C');
  click(buttonContaining(c, 'Generate'));
  await settle();
}

function selectFirst(c: HTMLElement) {
  click(tiles(c)[0]);
}
function showDesigns(c: HTMLElement) {
  click(c.querySelector('[data-ai-designs-toggle]') as Element);
}
function editFillToBlack(c: HTMLElement) {
  click(c.querySelector('[data-ai-preview-selected-layer] [data-drawn-id="r"]') as Element);
  const swatch = c.querySelector('[data-drawn-swatch="fill"][data-drawn-swatch-value="#000000"]') as Element;
  expect(swatch, 'edge panel did not open').not.toBeNull();
  click(swatch);
}

describe('PATCH-285 AI post drawn editing', () => {
  it('marks the clicked type button selected while drawn pictures are on screen', async () => {
    stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openDrawn(c);

    const options = c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement;
    expect(options.getAttribute('aria-pressed')).toBe('true');

    click(c.querySelector('[data-ai-subtype-chip="flowchart"]') as HTMLElement);
    await settle();

    expect(c.querySelector('[data-ai-subtype-chip="flowchart"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(options.getAttribute('aria-pressed')).toBe('false');
  });

  it('editing the selected option and Save stores the edited picture', async () => {
    stubFetch();
    const onSave = vi.fn();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={onSave} />);
    await openDrawn(c);
    selectFirst(c);
    editFillToBlack(c);

    click(buttonContaining(c, 'Save to Canvas'));
    const saved = onSave.mock.calls[0][0].aiComponentJson.data.picture;
    expect(saved.elements.find((el: { id: string }) => el.id === 'r').fill).toBe('#000000');
  });

  it('keeps an edit when switching options and back', async () => {
    stubFetch();
    const onSave = vi.fn();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={onSave} />);
    await openDrawn(c);
    selectFirst(c);
    editFillToBlack(c);

    showDesigns(c);
    click(tiles(c)[1]);
    await settle();
    click(tiles(c)[0]);
    await settle();
    click(buttonContaining(c, 'Save to Canvas'));

    const saved = onSave.mock.calls[0][0].aiComponentJson.data.picture;
    expect(saved.elements.find((el: { id: string }) => el.id === 'r').fill).toBe('#000000');
  });

  it('Shuffle drops edits of the replaced options', async () => {
    stubFetch();
    const onSave = vi.fn();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={onSave} />);
    await openDrawn(c);
    selectFirst(c);
    editFillToBlack(c);

    showDesigns(c);
    click(c.querySelector('[data-ai-drawn-shuffle="true"]') as HTMLElement);
    await settle();
    selectFirst(c);
    click(buttonContaining(c, 'Save to Canvas'));

    const saved = onSave.mock.calls[0][0].aiComponentJson.data.picture;
    expect(saved.elements.find((el: { id: string }) => el.id === 'r').fill).toBe('#aabbcc');
  });

  it('PATCH-279: a drawn option takes the outline title, and a typed Post name wins', async () => {
    stubFetch();
    const c = mount(
      <AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} onEditAsDrawing={() => {}} />,
    );
    await openDrawn(c);
    selectFirst(c);

    let button = c.querySelector('[data-ai-edit-as-drawing="true"]') as HTMLButtonElement;
    expect(button.getAttribute('data-title')).toBe('Launch');

    setInputValue(c.querySelector('input[placeholder="Post name"]') as HTMLInputElement, 'My post');
    button = c.querySelector('[data-ai-edit-as-drawing="true"]') as HTMLButtonElement;
    expect(button.getAttribute('data-title')).toBe('My post');
  });

  it('no type button ever calls the old single-picture generator', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openDrawn(c);

    for (const chip of ['flowchart', 'mindmap', 'pie_chart', 'bar_chart', 'timeline', 'comparison']) {
      click(c.querySelector(`[data-ai-subtype-chip="${chip}"]`) as HTMLElement);
      await settle();
    }

    // And a full Generate after choosing a type button still takes the outline path.
    click(c.querySelector('[data-ai-subtype-chip="flowchart"]') as HTMLElement);
    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'first A then B then C');
    click(generateButton(c));
    await settle();

    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/ai/generate-component')).toBe(false);
  });
});
