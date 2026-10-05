// PATCH-287. The pure redraw core. Synthetic elements stand in for the
// converter's output: every element carries `customData.antvRole`, unindexed
// "slice" groups stand in for pie slices, indexed roles for item parts.
// These tests pin the old→new role mapping, the property carry-over, the
// anchor maths and the scene splice.
import { describe, expect, it } from 'vitest';

import { antvChartDataSchema, type AntvChartData } from './data';
import {
  buildNextData,
  carryOver,
  findSelectedChart,
  planRows,
  readCanvasTexts,
  replaceChartInScene,
  type ChartSceneElement,
} from './redraw';

interface TestElement extends ChartSceneElement {
  role?: string;
}

const GROUP = 'chart-group';

const SAMPLE_CHART = {
  v: 1,
  template: 'chart-pie-donut-pill-badge',
  theme: 'classic',
  title: 'Seasonal plan',
  items: Array.from({ length: 5 }, (_, i) => ({ label: `Item ${i}`, value: (i + 1) * 10 })),
};

function role(roleName: string): Record<string, unknown> {
  return { antvRole: roleName, antvChart: SAMPLE_CHART };
}

function text(id: string, roleName: string, textValue: string, box = { x: 0, y: 0, width: 80, height: 20 }): TestElement {
  return {
    id,
    type: 'text',
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    text: textValue,
    fontSize: 14,
    strokeColor: '#222222',
    customData: role(roleName),
    groupIds: [GROUP],
    role: roleName,
  };
}

function slice(id: string, roleName: string, color: string, box = { x: 300, y: 0, width: 60, height: 60 }, extra: Partial<TestElement> = {}): TestElement {
  return {
    id,
    type: 'line',
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    polygon: true,
    points: [
      [0, 0],
      [box.width, 0],
      [box.width / 2, box.height],
    ],
    backgroundColor: color,
    strokeColor: '#ffffff',
    strokeWidth: 2,
    customData: role(roleName),
    groupIds: [GROUP],
    role: roleName,
    ...extra,
  };
}

function background(extra: Partial<TestElement> = {}): TestElement {
  return {
    id: 'bg',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 720,
    height: 400,
    backgroundColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 1,
    customData: role('background'),
    groupIds: [GROUP],
    role: 'background',
    ...extra,
  };
}

const PALETTE = ['#111111', '#222222', '#333333', '#444444', '#555555'];

function render(count: number): TestElement[] {
  const elements: TestElement[] = [
    background(),
    text('title', 'title#0', 'Seasonal plan', { x: 10, y: 10, width: 120, height: 24 }),
  ];
  for (let i = 0; i < count; i += 1) {
    elements.push(text(`label-${i}`, `item-label@${i}#0`, `Item ${i}`, { x: 20, y: 40 + i * 30, width: 80, height: 20 }));
    elements.push(text(`value-${i}`, `item-value@${i}#0`, `${(i + 1) * 10}%`, { x: 120, y: 40 + i * 30, width: 40, height: 20 }));
    elements.push(slice(`slice-${i}`, `slice#${i}`, PALETTE[i], { x: 300, y: 40 + i * 30, width: 60, height: 60 }));
  }
  return elements;
}

function replace(list: TestElement[], id: string, patch: Partial<TestElement>): TestElement[] {
  return list.map((element) => (element.id === id ? { ...element, ...patch } : element));
}

function data(count: number): AntvChartData {
  const parsed = antvChartDataSchema.safeParse({
    v: 1,
    template: 'chart-pie-donut-pill-badge',
    theme: 'classic',
    title: 'Seasonal plan',
    items: Array.from({ length: count }, (_, i) => ({
      label: `Item ${i}`,
      value: (i + 1) * 10,
      detail: `Detail ${i}`,
      icon: 'sun',
    })),
  });
  if (!parsed.success) throw new Error('bad test data');
  return parsed.data;
}

describe('PATCH-287: findSelectedChart', () => {
  it('finds the whole chart when its group is selected', () => {
    const elements = render(5);
    const appState = { selectedElementIds: { 'slice-0': true } };
    const found = findSelectedChart(elements, appState);
    expect(found).not.toBeNull();
    expect(found?.groupId).toBe(GROUP);
    expect(found?.elements).toHaveLength(elements.length);
    expect(found?.data.template).toBe('chart-pie-donut-pill-badge');
  });

  it('returns null for a mixed selection (chart + a plain shape)', () => {
    const elements = [...render(5), { id: 'plain', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }];
    const found = findSelectedChart(elements, { selectedElementIds: { 'slice-0': true, plain: true } });
    expect(found).toBeNull();
  });

  it('returns null when the selected element has no chart data', () => {
    const elements = render(5);
    const found = findSelectedChart(elements, { selectedElementIds: { bg: false, plain: true } });
    expect(found).toBeNull();
  });

  it('ignores deleted elements', () => {
    const elements = render(5).map((element) => ({ ...element, isDeleted: true }));
    expect(findSelectedChart(elements, { selectedElementIds: { 'slice-0': true } })).toBeNull();
  });
});

describe('PATCH-287: readCanvasTexts', () => {
  it('reads title, labels and details and collapses wrapped text', () => {
    const elements = [
      text('title', 'title#0', 'Seasonal\n   plan'),
      text('label-0', 'item-label@0#0', 'Spring\n  blooms'),
      text('desc-0', 'item-desc@0#0', 'Planting\nand first blooms'),
    ];
    const texts = readCanvasTexts(elements);
    expect(texts.title).toBe('Seasonal plan');
    expect(texts.labels.get(0)).toBe('Spring blooms');
    expect(texts.details.get(0)).toBe('Planting and first blooms');
  });
});

describe('PATCH-287: planRows / buildNextData', () => {
  it('plans one row per stored item and prefers the canvas texts', () => {
    const data5 = data(5);
    const texts = readCanvasTexts([text('label-0', 'item-label@0#0', 'Renamed')]);
    const rows = planRows(data5, texts);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ from: 0, label: 'Renamed', value: 10 });
    expect(rows[1]).toMatchObject({ from: 1, label: 'Item 1', value: 20 });
  });

  it('keeps detail/icon with their from item and gives new rows neither; removed rows are gone', () => {
    const data5 = data(5);
    const base = planRows(data5, { labels: new Map(), details: new Map() });
    // remove row 0, add a new row at the end
    const rows = [
      ...base.filter((row) => row.from !== 0),
      { key: 'new', from: null, label: 'New slice', value: 5 },
    ];
    const next = buildNextData(data5, { labels: new Map(), details: new Map() }, rows);
    expect(antvChartDataSchema.safeParse(next).success).toBe(true);
    expect(next.items).toHaveLength(5);
    expect(next.items[0]).toMatchObject({ label: 'Item 1', value: 20, detail: 'Detail 1', icon: 'sun' });
    expect(next.items[4]).toEqual({ label: 'New slice', value: 5 });
  });
});

describe('PATCH-287: carryOver', () => {
  it('keeps the user colour on slice 1 when only the values changed', () => {
    const oldRender = render(5);
    const current = replace(oldRender, 'slice-1', { backgroundColor: '#ff0000' });
    const nextRender = render(5);
    const result = carryOver({ oldRender, current, nextRender, indexMap: [0, 1, 2, 3, 4], oldCount: 5, nextCount: 5 });
    const newSlice1 = result.find((element) => element.customData?.antvRole === 'slice#1');
    const newSlice0 = result.find((element) => element.customData?.antvRole === 'slice#0');
    expect(newSlice1?.backgroundColor).toBe('#ff0000');
    expect(newSlice0?.backgroundColor).toBe(PALETTE[0]);
  });

  it('lands the user slice-1 colour on new slice 0 when row 0 is deleted', () => {
    const oldRender = render(5);
    const current = replace(oldRender, 'slice-1', { backgroundColor: '#ff0000' });
    const nextRender = render(4);
    const result = carryOver({ oldRender, current, nextRender, indexMap: [null, 0, 1, 2, 3], oldCount: 5, nextCount: 4 });
    const newSlice0 = result.find((element) => element.customData?.antvRole === 'slice#0');
    const newSlice1 = result.find((element) => element.customData?.antvRole === 'slice#1');
    expect(newSlice0?.backgroundColor).toBe('#ff0000');
    expect(newSlice1?.backgroundColor).toBe(PALETTE[1]);
  });

  it('takes the new render value for a property the user did not change', () => {
    const oldRender = render(5);
    const current = render(5);
    const nextRender = render(5).map((element) =>
      element.customData?.antvRole === 'slice#0' ? { ...element, strokeWidth: 9 } : element,
    );
    const result = carryOver({ oldRender, current, nextRender, indexMap: [0, 1, 2, 3, 4], oldCount: 5, nextCount: 5 });
    const newSlice0 = result.find((element) => element.customData?.antvRole === 'slice#0');
    expect(newSlice0?.strokeWidth).toBe(9);
  });

  it('drops a part the user deleted', () => {
    const oldRender = render(5);
    const current = oldRender.filter((element) => element.id !== 'slice-2');
    const nextRender = render(5);
    const result = carryOver({ oldRender, current, nextRender, indexMap: [0, 1, 2, 3, 4], oldCount: 5, nextCount: 5 });
    expect(result.some((element) => element.customData?.antvRole === 'slice#2')).toBe(false);
  });

  it('places the new elements where the chart was moved and scaled', () => {
    const oldRender = render(5);
    const current = oldRender.map((element) => ({
      ...element,
      x: 300 + element.x * 2,
      y: 120 + element.y * 2,
      width: element.width * 2,
      height: element.height * 2,
    }));
    const nextRender = render(5);
    const result = carryOver({ oldRender, current, nextRender, indexMap: [0, 1, 2, 3, 4], oldCount: 5, nextCount: 5 });
    const bg = result.find((element) => element.customData?.antvRole === 'background');
    const newSlice0 = result.find((element) => element.customData?.antvRole === 'slice#0');
    expect(bg).toMatchObject({ x: 300, y: 120, width: 1440, height: 800 });
    expect(newSlice0).toMatchObject({ x: 900, y: 200, width: 120, height: 120 });
  });

  it('never copies text content from the current scene', () => {
    const oldRender = render(5);
    const current = replace(oldRender, 'title', { text: 'User title' });
    const nextRender = replace(render(5), 'title', { text: 'New title' });
    const result = carryOver({ oldRender, current, nextRender, indexMap: [0, 1, 2, 3, 4], oldCount: 5, nextCount: 5 });
    const title = result.find((element) => element.customData?.antvRole === 'title#0');
    expect(title?.text).toBe('New title');
  });

  it('gives fresh ids, fresh inner groups and the chart group as outer group; does not mutate inputs', () => {
    const oldRender = render(5).map((element) => ({ ...element, groupIds: ['inner-old', GROUP] }));
    const current = oldRender;
    const nextRender = render(5).map((element) => ({ ...element, groupIds: ['item:0', 'picture'] }));
    const oldSnapshot = JSON.stringify(oldRender);
    const nextSnapshot = JSON.stringify(nextRender);
    const result = carryOver({ oldRender, current, nextRender, indexMap: [0, 1, 2, 3, 4], oldCount: 5, nextCount: 5 });

    const ids = result.map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => oldRender.some((element) => element.id === id))).toBe(false);
    const slice = result.find((element) => element.customData?.antvRole === 'slice#0');
    expect(slice?.groupIds?.at(-1)).toBe(GROUP);
    expect(slice?.groupIds?.[0]).not.toBe('item:0');
    expect(JSON.stringify(oldRender)).toBe(oldSnapshot);
    expect(JSON.stringify(nextRender)).toBe(nextSnapshot);
  });
});

describe('PATCH-287: replaceChartInScene', () => {
  it('keeps z-order, replaces the chart in place and leaves others identical', () => {
    const before = { id: 'before', type: 'rectangle', x: 0, y: 0, width: 1, height: 1 };
    const after = { id: 'after', type: 'rectangle', x: 0, y: 0, width: 1, height: 1 };
    const chart = render(2);
    const scene = [before, ...chart, after] as ChartSceneElement[];
    const replacement = [{ id: 'n0', type: 'rectangle', x: 0, y: 0, width: 1, height: 1 }];
    const result = replaceChartInScene(scene, GROUP, replacement);
    expect(result[0]).toBe(before);
    expect(result[result.length - 1]).toBe(after);
    expect(result[1]).toBe(replacement[0]);
    expect(result.length).toBe(3);
  });
});

// ── Addendum 1 ────────────────────────────────────────────────────────────────
// The fixtures below copy the REAL roles from
// public/libraries/antv-diagrams.excalidrawlib (item 4), so the run detection is
// exercised against the shapes AntV actually emits.

const RUN_COLORS = ['#e9a23b', '#4f9d8f', '#d9644a', '#6a7fdb', '#8e6ac8'];
const LEGEND_COLORS = ['#f3f0f9', '#f0f2fb', '#fbefed', '#fdf6eb', '#edf5f4'];

function realElement(
  id: string,
  roleName: string,
  type: string,
  props: Partial<TestElement> = {},
): TestElement {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    groupIds: [GROUP],
    customData: role(roleName),
    role: roleName,
    ...props,
  };
}

function pieRender(count: number): TestElement[] {
  const elements = [background(), text('title', 'title#0', 'Seasonal plan', { x: 1, y: 1, width: 100, height: 20 })];
  for (let i = 0; i < count; i += 1) {
    elements.push(
      realElement(`slice-${i}`, `shape#${i}`, 'line', {
        polygon: true,
        backgroundColor: RUN_COLORS[i],
        strokeColor: '#ffffff',
      }),
    );
  }
  for (let i = 0; i < count; i += 1) {
    elements.push(
      realElement(`leader-${i}`, `shape#${count + i}`, 'line', {
        polygon: false,
        backgroundColor: 'transparent',
        strokeColor: '#ccbce6',
      }),
    );
  }
  for (let i = 0; i < count; i += 1) {
    elements.push(
      realElement(`legend-${i}`, `shape#${2 * count + i}`, 'line', {
        polygon: true,
        backgroundColor: LEGEND_COLORS[i],
        strokeColor: '#333333',
      }),
    );
  }
  for (let i = 0; i < count; i += 1) {
    elements.push(
      realElement(`value-${i}`, `item-value@${i}#0`, 'text', { text: `${(i + 1) * 10}%`, strokeColor: '#ffffff' }),
      realElement(`label-${i}`, `item-label@${i}#0`, 'text', { text: `Item ${i}`, strokeColor: '#262626' }),
    );
  }
  return elements;
}

function columnRender(count: number): TestElement[] {
  const elements = [background(), text('title', 'title#0', 'Sales', { x: 1, y: 1, width: 60, height: 20 })];
  for (let i = 0; i < count; i += 1) {
    elements.push(
      realElement(`bar-${i}`, `shape#${i}`, 'rectangle', {
        backgroundColor: RUN_COLORS[i],
        strokeColor: 'transparent',
      }),
      realElement(`bar-text-${i}`, `text#${i}`, 'text', { text: `${(i + 1) * 10}`, strokeColor: RUN_COLORS[i] }),
      realElement(`label-${i}`, `item-label@${i}#0`, 'text', { text: `Item ${i}`, strokeColor: '#262626' }),
    );
  }
  return elements;
}

function lineRender(count: number): TestElement[] {
  const elements = [background(), text('title', 'title#0', 'Trend', { x: 1, y: 1, width: 60, height: 20 })];
  for (let i = 0; i < 5; i += 1) {
    elements.push(realElement(`grid-${i}`, `shape#${i}`, 'line', { polygon: true, backgroundColor: '#ebebeb', strokeColor: '#eeeeee' }));
  }
  elements.push(
    realElement('axis-x', 'shape#5', 'line', { polygon: true, backgroundColor: '#000000', strokeColor: '#262626' }),
    realElement('axis-y', 'shape#6', 'line', { polygon: true, backgroundColor: '#000000', strokeColor: '#262626' }),
    realElement('series', 'shape#7', 'line', { polygon: false, backgroundColor: 'transparent', strokeColor: '#d9644a' }),
    realElement('area', 'shape#8', 'line', { polygon: true, backgroundColor: '#f8e3de', strokeColor: 'transparent' }),
  );
  for (let i = 0; i < count; i += 1) {
    elements.push(
      realElement(`point-${i}`, `shape#${9 + i}`, 'ellipse', { backgroundColor: RUN_COLORS[i], strokeColor: 'transparent' }),
    );
  }
  for (let i = 0; i < 5; i += 1) {
    elements.push(realElement(`axis-text-${i}`, `text#${i}`, 'text', { text: `${i}`, strokeColor: '#262626' }));
  }
  for (let i = 0; i < count; i += 1) {
    elements.push(realElement(`point-text-${i}`, `text#${5 + i}`, 'text', { text: `${i}`, strokeColor: RUN_COLORS[i] }));
  }
  return elements;
}

describe('PATCH-287 Addendum 1: item runs for unindexed parts', () => {
  it('pie delete row 0: the user slice-1 colour lands on new slice 0', () => {
    const oldRender = pieRender(5);
    const current = replace(oldRender, 'slice-1', { backgroundColor: '#ff0000' });
    const nextRender = pieRender(4);
    const result = carryOver({ oldRender, current, nextRender, indexMap: [null, 0, 1, 2, 3], oldCount: 5, nextCount: 4 });
    const newSlice0 = result.find((element) => element.customData?.antvRole === 'shape#0');
    const newSlice1 = result.find((element) => element.customData?.antvRole === 'shape#1');
    expect(newSlice0?.backgroundColor).toBe('#ff0000');
    expect(newSlice1?.backgroundColor).toBe(RUN_COLORS[1]);
  });

  it('line chart: the grid bands are never treated as items', () => {
    const oldRender = lineRender(5);
    const current = replace(oldRender, 'point-1', { backgroundColor: '#ff0000' });
    const nextRender = lineRender(4);
    const result = carryOver({ oldRender, current, nextRender, indexMap: [null, 0, 1, 2, 3], oldCount: 5, nextCount: 4 });
    const newPoint0 = result.find((element) => element.customData?.antvRole === 'shape#9');
    const newGrid0 = result.find((element) => element.customData?.antvRole === 'shape#0');
    // next shape#9 is run position 0 -> old item 1 -> old shape#10 (the recoloured point)
    expect(newPoint0?.backgroundColor).toBe('#ff0000');
    // a grid band (all #ebebeb) must never be mistaken for an item run
    expect(newGrid0?.backgroundColor).toBe('#ebebeb');
  });

  it('column bars follow their rows when a row is removed', () => {
    const oldRender = columnRender(5);
    const current = replace(oldRender, 'bar-1', { backgroundColor: '#ff0000' });
    const nextRender = columnRender(4);
    const result = carryOver({ oldRender, current, nextRender, indexMap: [null, 0, 1, 2, 3], oldCount: 5, nextCount: 4 });
    const newBar0 = result.find((element) => element.customData?.antvRole === 'shape#0');
    expect(newBar0?.backgroundColor).toBe('#ff0000');
  });
});

describe('PATCH-287 Addendum 1: background and lineHeight', () => {
  it('maps a changed background whatever the counts', () => {
    const oldRender = pieRender(5).concat(realElement('bg2', 'background#0', 'rectangle', { width: 800, height: 400 }));
    const current = replace(replace(oldRender, 'bg', { backgroundColor: '#123456' }), 'bg2', { backgroundColor: '#654321' });
    const nextRender = pieRender(4).concat(realElement('bg2', 'background#0', 'rectangle', { width: 800, height: 400 }));
    const result = carryOver({ oldRender, current, nextRender, indexMap: [null, 0, 1, 2, 3], oldCount: 5, nextCount: 4 });
    expect(result.find((element) => element.customData?.antvRole === 'background')?.backgroundColor).toBe('#123456');
    expect(result.find((element) => element.customData?.antvRole === 'background#0')?.backgroundColor).toBe('#654321');
  });

  it('scales fontSize but leaves the unitless lineHeight alone', () => {
    const oldRender: TestElement[] = [
      background(),
      { ...text('title', 'title#0', 'Hi'), lineHeight: 1.25 },
    ];
    const current = oldRender.map((element) => ({
      ...element,
      x: element.x * 2,
      y: element.y * 2,
      width: element.width * 2,
      height: element.height * 2,
    }));
    const nextRender: TestElement[] = [
      background(),
      { ...text('title', 'title#0', 'Hi'), lineHeight: 1.25 },
    ];
    const result = carryOver({ oldRender, current, nextRender, indexMap: [0], oldCount: 1, nextCount: 1 });
    const title = result.find((element) => element.customData?.antvRole === 'title#0');
    expect(title?.fontSize).toBe(28);
    expect(title?.lineHeight).toBe(1.25);
  });
});
