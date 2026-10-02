// @vitest-environment jsdom
//
// PATCH-248 -- the Diagram subtype buttons jump to the matching designs in the
// gallery (local, no new AI call), Show options restores all, and a chart with
// no chart designs offers the "make a chart" button.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pictureFamily } from '@/lib/ai/pictureFamilies';
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
function pressedKeys(c: ParentNode): string[] {
  return tiles(c)
    .filter((el) => el.getAttribute('aria-pressed') === 'true')
    .map((el) => el.getAttribute('data-ai-outline-option') ?? '');
}

const OUTLINE = {
  title: 'Water cycle',
  ordered: true,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }, { label: 'Precipitation' }],
};

// Addendum 1: two items means no chart design at all (word clouds need 3+), so
// the chart family is genuinely empty.
const NO_CHART_OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }],
};

const CHART = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'pie_chart',
    renderer: 'chart',
    title: 'Budget',
    dataPoints: [{ label: 'A', value: 60 }, { label: 'B', value: 40 }],
  },
  meta: { renderer: 'chart', subtype: 'pie_chart', prompt: 'p' },
};

const STORED_FLOW = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'flowchart',
    renderer: 'diagram_code',
    title: 'Flow',
    code: 'flowchart TD\n  A --> B',
  },
  meta: { renderer: 'diagram_code', subtype: 'flowchart', prompt: 'p' },
};

function stubFetch(outline: unknown = OUTLINE) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === '/api/ai/generate-outline') {
      return new Response(
        JSON.stringify({ outline, generatedBy: { source: 'collabboard-default', model: 'm' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify(CHART), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openGallery(c: HTMLElement, fetchMock: ReturnType<typeof stubFetch>) {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle for 7th grade');
  click(buttonContaining(c, 'Generate'));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline')).toHaveLength(1);
}

describe('PATCH-248 AIComponentEditor subtype buttons drive the designs', () => {
  it('with designs on screen, clicking Timeline filters locally, selects a timeline design, and scrolls to top', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    const before = fetchMock.mock.calls.length;
    const all = tiles(c);
    expect(all.length).toBeGreaterThan(0);
    const scroller = c.querySelector('[data-ai-outline-tiles]') as HTMLElement;
    scroller.scrollTop = 400;

    click(c.querySelector('[data-ai-subtype-chip="timeline"]') as HTMLElement);

    // No new AI call: the filter is local.
    expect(fetchMock.mock.calls.length).toBe(before);
    const shown = tiles(c);
    expect(shown.length).toBeGreaterThan(0);
    for (const tile of shown) {
      const key = tile.getAttribute('data-ai-outline-option') ?? '';
      expect(pictureFamily({ key })).toBe('timeline');
    }
    expect(pressedKeys(c).some((key) => pictureFamily({ key }) === 'timeline')).toBe(true);
    expect(scroller.scrollTop).toBe(0);
    // The clicked button looks selected.
    expect((c.querySelector('[data-ai-subtype-chip="timeline"]') as HTMLElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('Show options restores every design and keeps the current selection', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    const total = tiles(c).length;
    click(c.querySelector('[data-ai-subtype-chip="timeline"]') as HTMLElement);
    expect(tiles(c).length).toBeLessThan(total);
    const selected = pressedKeys(c)[0];
    expect(selected).toBeTruthy();

    click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
    expect(tiles(c).length).toBe(total);
    expect(pressedKeys(c)).toContain(selected);
  });

  it('clicking Mindmap before Generate opens on mind-map designs', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);

    click(buttonContaining(c, 'Diagram'));
    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle for 7th grade');
    click(c.querySelector('[data-ai-subtype-chip="mindmap"]') as HTMLElement);
    expect((c.querySelector('[data-ai-subtype-chip="mindmap"]') as HTMLElement).getAttribute('aria-pressed')).toBe('true');

    click(buttonContaining(c, 'Generate'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline')).toHaveLength(1);
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/ai/generate-component')).toBe(false);
    const shown = tiles(c);
    expect(shown.length).toBeGreaterThan(0);
    for (const tile of shown) {
      const key = tile.getAttribute('data-ai-outline-option') ?? '';
      expect(pictureFamily({ key })).toBe('mindmap');
    }
    expect(pressedKeys(c).some((key) => pictureFamily({ key }) === 'mindmap')).toBe(true);
  });

  it('Comparison never runs the old single-picture generator', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="comparison"]') as HTMLElement);
    click(buttonContaining(c, 'Regenerate'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/ai/generate-component')).toBe(false);
  });

  it('Pie Chart with no chart designs shows the note in place of the empty stage; Make pie chart asks for estimated values', async () => {
    const fetchMock = stubFetch(NO_CHART_OUTLINE);
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);

    expect(c.querySelectorAll('[data-ai-outline-option]')).toHaveLength(0);
    expect(c.querySelector('[data-ai-chart-note="true"]')).not.toBeNull();
    expect(c.textContent).toContain('Your text has no numbers');
    // No empty dotted picture stage: the note replaces the preview.
    expect(c.querySelector('[data-ai-outline-preview]')).toBeNull();
    const make = c.querySelector('[data-ai-make-chart="pie"]') as HTMLElement;
    expect(make).not.toBeNull();
    expect(make.textContent).toContain('Make pie chart');

    click(make);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    // PATCH-250: this button now asks the outline route to estimate values; the
    // old single-picture generator is never called from here.
    const estimateCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/ai/generate-outline'
        && JSON.parse(String(call[1]?.body)).options?.estimateValues === true,
    );
    expect(estimateCall).toBeTruthy();
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/ai/generate-component')).toBe(false);
  });

  it('Bar Chart offers Make bar chart and asks for estimated values', async () => {
    const fetchMock = stubFetch(NO_CHART_OUTLINE);
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="bar_chart"]') as HTMLElement);
    const make = c.querySelector('[data-ai-make-chart="bar"]') as HTMLElement;
    expect(make).not.toBeNull();
    expect(make.textContent).toContain('Make bar chart');

    click(make);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    const estimateCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/ai/generate-outline'
        && JSON.parse(String(call[1]?.body)).options?.estimateValues === true,
    );
    expect(estimateCall).toBeTruthy();
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/ai/generate-component')).toBe(false);
  });

  it('the family chip appears for a family and disappears under Show all', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    expect(c.querySelector('[data-ai-family-filter]')).toBeNull();

    click(c.querySelector('[data-ai-subtype-chip="timeline"]') as HTMLElement);
    // PATCH-251: the old "Showing: ... · Show all" line is now a compact chip.
    const chip = c.querySelector('[data-ai-family-filter="true"]') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain('Timeline');

    click(c.querySelector('[data-ai-show-all="true"]') as HTMLElement);
    expect(c.querySelector('[data-ai-family-filter]')).toBeNull();
  });

  it('clicking a subtype before Generate shows the pre-Generate message and makes no fetch', () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);

    click(buttonContaining(c, 'Diagram'));
    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);

    expect(c.textContent).toContain('Pie Chart selected');
    expect(c.textContent).toContain('press Generate');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('regenerating a locked stored flowchart still runs the old generator', async () => {
    const fetchMock = stubFetch();
    const c = mount(
      <AIComponentEditor
        isOpen
        lockedMode="diagram"
        lockedSubtype="flowchart"
        initialContent={STORED_FLOW}
        initialPrompt="p"
        onClose={() => {}}
        onSave={() => {}}
      />,
    );

    click(buttonContaining(c, 'Regenerate'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    const componentCall = fetchMock.mock.calls.find((call) => call[0] === '/api/ai/generate-component');
    expect(componentCall).toBeTruthy();
    expect(JSON.parse(String(componentCall![1]?.body)).subtype).toBe('flowchart');
    expect(c.querySelector('[data-ai-family-filter]')).toBeNull();
    expect(c.querySelector('[data-ai-subtype-chip]')).toBeNull();
  });
});

describe('PATCH-248 Addendum 2 chart ordering, note and helper line', () => {
  const VALUED_OUTLINE = {
    title: 'Budget',
    ordered: false,
    items: [
      { label: 'Venue', value: 40 },
      { label: 'Food', value: 30 },
      { label: 'Travel', value: 20 },
      { label: 'Activities', value: 10 },
    ],
  };

  function chartKeys(c: ParentNode): string[] {
    return tiles(c).map((tile) => tile.getAttribute('data-ai-outline-option') ?? '');
  }

  it('Pie Chart leads with the six pie designs and puts word clouds last', async () => {
    const fetchMock = stubFetch(VALUED_OUTLINE);
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);

    const keys = chartKeys(c);
    expect(keys.filter((k) => k.includes('chart-pie'))).toHaveLength(6);
    for (let i = 0; i < 6; i += 1) expect(keys[i]).toContain('chart-pie');
    expect(keys[keys.length - 2]).toContain('chart-wordcloud');
    expect(keys[keys.length - 1]).toContain('chart-wordcloud');
    // The best design of the clicked chart type is selected in the preview.
    expect(pressedKeys(c)).toEqual([keys[0]]);
  });

  it('Bar Chart leads with bar/column, then line, then pies; word clouds last', async () => {
    const fetchMock = stubFetch(VALUED_OUTLINE);
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="bar_chart"]') as HTMLElement);

    const keys = chartKeys(c);
    expect(keys[0]).toMatch(/^antv:chart-(bar|column)-/);
    const firstLine = keys.findIndex((k) => k.includes('chart-line'));
    const firstPie = keys.findIndex((k) => k.includes('chart-pie'));
    const firstCloud = keys.findIndex((k) => k.includes('chart-wordcloud'));
    expect(firstLine).toBeGreaterThanOrEqual(0);
    expect(firstPie).toBeGreaterThan(firstLine);
    expect(firstCloud).toBeGreaterThan(firstPie);
  });

  it('with no numbers but word clouds, the note sits above the word clouds', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);

    const note = c.querySelector('[data-ai-chart-note="true"]') as HTMLElement;
    expect(note).not.toBeNull();
    // The word clouds still get the preview (not replaced by the note).
    expect(c.querySelector('[data-ai-outline-preview]')).not.toBeNull();
    const cloud = tiles(c).find((tile) =>
      (tile.getAttribute('data-ai-outline-option') ?? '').includes('chart-wordcloud'),
    )!;
    expect(cloud).toBeTruthy();
    expect(note.compareDocumentPosition(cloud) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(c.querySelector('[data-ai-make-chart="pie"]')).not.toBeNull();
  });

  it('the helper line under the prompt follows the selected button', async () => {
    const fetchMock = stubFetch(VALUED_OUTLINE);
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);
    const helper = () => (c.querySelector('[data-ai-prompt-helper]') as HTMLElement)?.textContent ?? '';

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    expect(helper()).toContain('Part-to-whole chart for proportions.');
    expect(helper()).not.toContain('Step-by-step process visualization.');

    click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
    expect(helper()).toContain('Draw the same content several ways and pick one.');
  });
});
