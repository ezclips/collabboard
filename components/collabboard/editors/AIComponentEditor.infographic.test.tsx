// @vitest-environment jsdom
//
// PATCH-236 -- opening a stored infographic shows its designs (its template
// preselected) with NO AI call; picking another design and saving passes that
// infographic envelope with the outline.
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

const OUTLINE = {
  title: 'Heading levels',
  ordered: false,
  kind: 'levels',
  items: [{ label: 'H1' }, { label: 'H2' }, { label: 'H3' }],
};

// A "steps" outline defaults to the stairs design, NOT pyramid -- so only a
// genuine preferKey pass can put pyramid first.
const STEPS_OUTLINE = {
  title: 'Steps',
  ordered: true,
  kind: 'steps',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};

const STORED = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Heading levels',
    template: 'pyramid',
    outline: OUTLINE,
  },
  meta: { renderer: 'infographic', subtype: 'infographic', prompt: 'p' },
};

const STORED_TEAL = { ...STORED, data: { ...STORED.data, theme: 'teal-night' } };

describe('PATCH-236 AIComponentEditor stored infographic', () => {
  it('opens the designs with its template selected and makes NO fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const c = mount(<AIComponentEditor isOpen initialContent={STORED} initialPrompt="Heading levels" onClose={() => {}} onSave={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(fetchMock).not.toHaveBeenCalled();
    const pyramid = c.querySelector('[data-ai-outline-option="infographic:pyramid"]') as HTMLElement;
    expect(pyramid).not.toBeNull();
    expect(pyramid.getAttribute('aria-pressed')).toBe('true');
  });

  it('saving another design passes an infographic envelope carrying the outline', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onSave = vi.fn();

    const c = mount(<AIComponentEditor isOpen initialContent={STORED} initialPrompt="Heading levels" onClose={() => {}} onSave={onSave} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    const stairs = c.querySelector('[data-ai-outline-option="infographic:stairs"]') as HTMLElement;
    click(stairs);
    click(buttonContaining(c, 'Save to Canvas'));

    const saved = onSave.mock.calls[0][0];
    expect(saved.aiComponentJson.data.subtype).toBe('infographic');
    expect(saved.aiComponentJson.data.template).toBe('stairs');
    expect(saved.aiComponentJson.data.outline).toEqual(OUTLINE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Diagram mode shows no "Infographic" subtype chip', async () => {
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    click(buttonContaining(c, 'Diagram'));
    // The chip grid lists every subtype EXCEPT infographic.
    const labels = Array.from(c.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(labels.some((l) => l.includes('Flowchart'))).toBe(true);
    expect(labels.some((l) => l.trim().startsWith('Infographic'))).toBe(false);
  });

  it('Addendum 4: a tile preview is scaled DOWN (<1) and contains the svg', async () => {
    const c = mount(<AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    const scaled = c.querySelector('[data-ai-thumb-scale]') as HTMLElement;
    expect(scaled).not.toBeNull();
    const scale = Number(scaled.getAttribute('data-ai-thumb-scale'));
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(1);
  });

  it('Addendum 4: the tiles list is the scroll container, not the whole panel', async () => {
    const c = mount(<AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    const panel = c.querySelector('[data-ai-outline-options]') as HTMLElement;
    const preview = c.querySelector('[data-ai-outline-preview]') as HTMLElement;
    const tiles = c.querySelector('[data-ai-outline-tiles]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(tiles).not.toBeNull();
    // The whole panel does NOT scroll; only the tiles area does.
    expect(panel.className).toContain('overflow-hidden');
    expect(tiles.className).toContain('overflow-auto');
    // The preview is a sibling BEFORE the tiles, so it stays put above them.
    expect(tiles.contains(preview)).toBe(false);
    expect(preview.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('PATCH-237: Edit text changes the outline with NO fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const c = mount(<AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    click(c.querySelector('[data-ai-edit-text-toggle="true"]') as HTMLElement);
    const label0 = c.querySelector('[data-ai-outline-item-label="0"]') as HTMLInputElement;
    expect(label0).not.toBeNull();

    setInputValue(label0, 'H1 renamed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('PATCH-237: Customize Apply calls the outline route with options', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const c = mount(<AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    click(c.querySelector('[data-ai-customize-toggle="true"]') as HTMLElement);
    click(c.querySelector('[data-ai-customize-detail="summary"]') as HTMLElement);
    click(c.querySelector('[data-ai-customize-keep-wording="true"]') as HTMLElement);
    setInputValue(c.querySelector('[data-ai-customize-hint="true"]') as HTMLInputElement, 'pyramid');
    click(c.querySelector('[data-ai-customize-apply="true"]') as HTMLElement);

    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ai/generate-outline');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.options).toEqual({ detail: 'summary', keepWording: true, visualHint: 'pyramid' });
  });

  it('PATCH-237: changing Flow direction makes no fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const c = mount(<AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    // PATCH-251: Flow direction now lives inside the Customize popover.
    click(c.querySelector('[data-ai-customize-toggle="true"]') as HTMLElement);
    const select = c.querySelector('[data-ai-flow-direction="true"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(select, 'TD');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('PATCH-237 Addendum 1: an Apply hint ranks the named design first, with Best match', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ outline: STEPS_OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const c = mount(<AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    click(c.querySelector('[data-ai-customize-toggle="true"]') as HTMLElement);
    setInputValue(c.querySelector('[data-ai-customize-hint="true"]') as HTMLInputElement, 'pyramid');
    click(c.querySelector('[data-ai-customize-apply="true"]') as HTMLElement);

    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    const first = c.querySelector('[data-ai-outline-option]') as HTMLElement;
    expect(first.getAttribute('data-ai-outline-option')).toBe('infographic:pyramid');
    expect(first.textContent).toContain('Best match');
  });

  it('PATCH-237 Addendum 1: preview is capped at 60% and the tiles keep a 220px min-height', async () => {
    const c = mount(<AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    const preview = c.querySelector('[data-ai-outline-preview]') as HTMLElement;
    const tiles = c.querySelector('[data-ai-outline-tiles]') as HTMLElement;
    expect(preview.style.maxHeight).toBe('60%');
    expect(tiles.style.minHeight).toBe('220px');
  });

  it('PATCH-238: choosing a theme makes NO fetch and Save stores it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onSave = vi.fn();
    const c = mount(<AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={onSave} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    // PATCH-251: the swatches now live inside the Colours popover.
    click(c.querySelector('[data-ai-colours-toggle="true"]') as HTMLElement);
    const teal = c.querySelector('[data-ai-theme="teal-night"]') as HTMLElement;
    expect(teal.getAttribute('aria-pressed')).toBe('false');
    click(teal);
    expect(teal.getAttribute('aria-pressed')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();

    click(buttonContaining(c, 'Save to Canvas'));
    const saved = onSave.mock.calls[0][0];
    expect(saved.aiComponentJson.data.theme).toBe('teal-night');
  });

  it('PATCH-238: reopening a stored themed infographic preselects its swatch', async () => {
    const c = mount(<AIComponentEditor isOpen initialContent={STORED_TEAL} initialPrompt="p" onClose={() => {}} onSave={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    // PATCH-251: the swatches now live inside the Colours popover.
    click(c.querySelector('[data-ai-colours-toggle="true"]') as HTMLElement);
    const teal = c.querySelector('[data-ai-theme="teal-night"]') as HTMLElement;
    expect(teal.getAttribute('aria-pressed')).toBe('true');
  });
});
