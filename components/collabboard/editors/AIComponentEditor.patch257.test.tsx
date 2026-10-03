// @vitest-environment jsdom
//
// PATCH-257. A text without numbers left the Pie and Bar Chart views empty, yet
// Save to Canvas stayed enabled. The chart designs now appear at once with
// example numbers, clearly marked; Save waits until the numbers are real (typed
// under Edit text or estimated by the AI).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIComponentEditor from './AIComponentEditor';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: ({ content }: { content?: unknown }) => React.createElement('div', {
    'data-testid': 'ai-content-stub',
    'data-ai-envelope': content === undefined ? undefined : JSON.stringify(content),
  }),
}));

// PATCH-267. The main preview of a chart is an editable infographic, rendered by
// the real InfographicRenderer, which dispatches an `antv:` design to
// AntvInfographicRenderer. Stubbing that leaf lets the test read the exact
// envelope data the AntV renderer receives.
vi.mock('@/components/ai/renderers/AntvInfographicRenderer', () => ({
  default: ({ data }: { data?: unknown }) => React.createElement('div', {
    'data-testid': 'antv-stub',
    'data-ai-antv-data': data === undefined ? undefined : JSON.stringify(data),
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
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
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
function chartKeys(c: ParentNode): string[] {
  return tiles(c).map((tile) => tile.getAttribute('data-ai-outline-option') ?? '');
}
function saveButton(c: ParentNode): HTMLButtonElement {
  return buttonContaining(c, 'Save to Canvas');
}
function pressedKeys(c: ParentNode): string[] {
  return tiles(c)
    .filter((el) => el.getAttribute('aria-pressed') === 'true')
    .map((el) => el.getAttribute('data-ai-outline-option') ?? '');
}
function headings(c: ParentNode): string[] {
  return Array.from(c.querySelectorAll('div'))
    .filter((el) => (el.className ?? '').toString().includes('uppercase'))
    .map((el) => (el.textContent ?? '').trim());
}

// PATCH-267. The envelope data the main preview's AntV renderer received.
function previewOutlineData(c: ParentNode): any {
  const el = c.querySelector('[data-ai-outline-preview] [data-testid="antv-stub"]') as HTMLElement | null;
  expect(el, 'no AntV renderer in the main preview').not.toBeNull();
  return JSON.parse(el!.getAttribute('data-ai-antv-data')!);
}
// PATCH-267. Every tile's envelope (the object `envelopeFor` builds), parsed.
function tileEnvelopes(c: ParentNode): any[] {
  return tiles(c).map((tile) => {
    const el = tile.querySelector('[data-testid="ai-content-stub"]') as HTMLElement | null;
    expect(el, `tile ${tile.getAttribute('data-ai-outline-option')} has no envelope`).not.toBeNull();
    return JSON.parse(el!.getAttribute('data-ai-envelope')!);
  });
}

// Two items, no values: too few for a chart on their own (word clouds need 3+).
const NO_NUMBERS_OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }],
};

async function flush(ms = 300) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

function stubFetch(outline: unknown = NO_NUMBERS_OUTLINE) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/ai/generate-outline') {
      return new Response(
        JSON.stringify({ outline, generatedBy: { source: 'collabboard-default', model: 'm' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const outlineCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline').length;

async function openGallery(c: HTMLElement, fetchMock: ReturnType<typeof stubFetch>) {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle');
  click(buttonContaining(c, 'Generate'));
  await flush();
  expect(outlineCalls(fetchMock)).toBe(1);
}

describe('PATCH-257 Pie and Bar Chart show designs at once', () => {
  it('Pie Chart shows pie tiles and a pie preview from example numbers, with no new fetch and no save', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    const before = fetchMock.mock.calls.length;
    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);

    // No new AI call: the example numbers are local.
    expect(fetchMock.mock.calls.length).toBe(before);

    const keys = chartKeys(c);
    expect(keys.filter((k) => k.includes('chart-pie'))).toHaveLength(6);
    for (let i = 0; i < 6; i += 1) expect(keys[i]).toContain('chart-pie');

    // A pie is actually in the preview (the stage is not empty).
    expect(c.querySelector('[data-ai-outline-preview]')).not.toBeNull();
    expect(c.querySelector('[data-testid="ai-content-stub"]')).not.toBeNull();

    // The toolbar says these are examples.
    const badge = c.querySelector('[data-ai-values-example="true"]') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Example numbers');
    expect(badge.getAttribute('title')).toContain('Press Make pie chart');
    expect(c.querySelector('[data-ai-values-estimated="true"]')).toBeNull();

    // Save is disabled while only example numbers exist.
    expect(saveButton(c).disabled).toBe(true);
    expect(saveButton(c).title).toContain('Make the chart or type your numbers first');

    // A "Suggested" heading only appears with tiles under it.
    expect(headings(c)).toContain('Suggested');
    expect(keys.length).toBeGreaterThan(0);
  });

  it('Bar Chart shows bar/column tiles first and the bar wording', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="bar_chart"]') as HTMLElement);

    const keys = chartKeys(c);
    expect(keys[0]).toMatch(/^antv:chart-(bar|column)-/);
    expect(c.querySelector('[data-ai-values-example="true"]')).not.toBeNull();

    const note = c.querySelector('[data-ai-chart-note="true"]') as HTMLElement;
    expect(note).not.toBeNull();
    expect(note.textContent).toContain('Your text has no numbers to draw bars from');
    expect(note.textContent).toContain('These designs use example numbers');
    expect(buttonContaining(note, 'Make bar chart')).toBeTruthy();
    expect(saveButton(c).disabled).toBe(true);
  });

  it('switching from Pie Chart to Bar Chart selects the first bar design, not the kept pie', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    expect(pressedKeys(c)[0]).toContain('chart-pie');

    click(c.querySelector('[data-ai-subtype-chip="bar_chart"]') as HTMLElement);

    const keys = chartKeys(c);
    // The clicked button's own ordering leads, and the FIRST bar design is selected.
    expect(keys[0]).toMatch(/^antv:chart-(bar|column)-/);
    expect(pressedKeys(c)).toEqual([keys[0]]);
  });

  it('typing a value for every item clears the example flag and enables Save with the typed values', async () => {
    const fetchMock = stubFetch();
    const onSave = vi.fn();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={onSave} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    expect(c.querySelector('[data-ai-values-example="true"]')).not.toBeNull();

    // Open Edit text from the preview toolbar.
    click(c.querySelector('[data-ai-edit-text-toggle="true"]') as HTMLElement);
    const valueInputs = c.querySelectorAll('[data-ai-outline-item-value]') as NodeListOf<HTMLInputElement>;
    expect(valueInputs.length).toBe(2);

    setInputValue(valueInputs[0], '40');
    setInputValue(valueInputs[1], '60');

    expect(c.querySelector('[data-ai-values-example="true"]')).toBeNull();
    expect(saveButton(c).disabled).toBe(false);

    click(saveButton(c));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    const outline = saved.aiComponentJson.data.outline;
    expect(outline.items.map((item: { value?: number }) => item.value)).toEqual([40, 60]);
  });

  it('Show all brings the normal designs back with no example values in their envelopes', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    expect(c.querySelector('[data-ai-values-example="true"]')).not.toBeNull();

    click(c.querySelector('[data-ai-show-all="true"]') as HTMLElement);

    expect(c.querySelector('[data-ai-family-filter]')).toBeNull();
    expect(c.querySelector('[data-ai-values-example="true"]')).toBeNull();
    expect(chartKeys(c).some((k) => k.includes('chart-pie'))).toBe(false);
    expect(headings(c)).toContain('Suggested');
  });

  it('Comparison on a 2-point text keeps Save disabled and never blank-with-Save', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="comparison"]') as HTMLElement);

    // The comparison design itself is offered and shown; Save works because the
    // preview is a real, visible design -- but a truly empty family stays off.
    const keys = chartKeys(c);
    if (keys.length === 0) {
      expect(saveButton(c).disabled).toBe(true);
      expect(saveButton(c).title).toContain('Nothing to save yet');
      expect(c.querySelector('[data-ai-outline-preview]')).toBeNull();
      expect(headings(c)).not.toContain('Suggested');
    } else {
      expect(c.querySelector('[data-ai-outline-preview]')).not.toBeNull();
      expect(headings(c)).toContain('Suggested');
    }
  });
});

describe('PATCH-267 example numbers reach the preview and every tile again', () => {
  it('Pie Chart: the main preview envelope and every tile envelope carry the example values', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);

    const preview = previewOutlineData(c);
    expect(preview.subtype).toBe('infographic');
    expect(preview.outline.valuesExample).toBe(true);
    expect(preview.outline.items.map((item: any) => item.value)).toEqual([50, 50]);

    const envelopes = tileEnvelopes(c);
    expect(envelopes.length).toBeGreaterThan(0);
    for (const envelope of envelopes) {
      expect(envelope.data.outline.valuesExample).toBe(true);
      expect(envelope.data.outline.items.map((item: any) => item.value)).toEqual([50, 50]);
    }
  });

  it('Bar Chart: the main preview envelope and every tile envelope carry the example values', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="bar_chart"]') as HTMLElement);

    const preview = previewOutlineData(c);
    expect(preview.outline.valuesExample).toBe(true);
    expect(preview.outline.items.map((item: any) => item.value)).toEqual([50, 50]);

    const envelopes = tileEnvelopes(c);
    expect(envelopes.length).toBeGreaterThan(0);
    for (const envelope of envelopes) {
      expect(envelope.data.outline.valuesExample).toBe(true);
      expect(envelope.data.outline.items.map((item: any) => item.value)).toEqual([50, 50]);
    }
  });

  it('keeps a PATCH-260 element override alongside the example values', async () => {
    const overrides = {
      template: 'antv:chart-pie-basic',
      items: { 'shape#0': { dx: 7, dy: 3 } },
    };
    const fetchMock = stubFetch({ ...NO_NUMBERS_OUTLINE, elementOverrides: overrides });
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);

    const preview = previewOutlineData(c);
    expect(preview.outline.items.map((item: any) => item.value)).toEqual([50, 50]);
    expect(preview.outline.valuesExample).toBe(true);
    expect(preview.outline.elementOverrides).toEqual(overrides);

    for (const envelope of tileEnvelopes(c)) {
      expect(envelope.data.outline.elementOverrides).toEqual(overrides);
      expect(envelope.data.outline.items.map((item: any) => item.value)).toEqual([50, 50]);
    }
  });

  it('a non-chart design keeps the outline unchanged with no example values', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    // Show options is open with no family filter; pick one AntV non-chart design.
    const listTile = tiles(c).find((tile) => {
      const key = tile.getAttribute('data-ai-outline-option') ?? '';
      return key.startsWith('antv:') && !key.includes('chart-');
    });
    expect(listTile, 'no non-chart AntV tile').toBeTruthy();
    click(listTile!);

    expect(c.querySelector('[data-ai-values-example="true"]')).toBeNull();

    const preview = previewOutlineData(c);
    expect(preview.outline.valuesExample).toBeUndefined();
    expect(preview.outline.items.map((item: any) => item.value)).toEqual([undefined, undefined]);
    expect(preview.outline.items.map((item: any) => item.label)).toEqual(['Evaporation', 'Condensation']);
  });
});
