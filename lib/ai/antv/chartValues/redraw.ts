/**
 * PATCH-287. The pure redraw core: find the selected chart, read the texts the
 * user edited in Excalidraw, plan the panel rows, and rebuild the chart from a
 * fresh AntV render while carrying over the edits the user made (colours, and
 * any style Excalidraw already changed) onto the new parts. No DOM, no AntV, no
 * Excalidraw import — the browser shell is `redrawChart.ts`.
 */

import { parseAntvChartData, type AntvChartData } from './data';
import { BACKGROUND_ROLE, parseRole } from './roles';

/** The structural slice of an Excalidraw element this module needs. */
export interface ChartSceneElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  groupIds?: readonly string[];
  customData?: Record<string, unknown> | null;
  isDeleted?: boolean;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  fontFamily?: number;
  fontSize?: number;
  lineHeight?: number;
  points?: ReadonlyArray<readonly [number, number]>;
  text?: string;
  [key: string]: unknown;
}

export interface SelectedChart<E extends ChartSceneElement = ChartSceneElement> {
  groupId: string;
  data: AntvChartData;
  elements: E[];
}

export interface CanvasTexts {
  title?: string;
  labels: Map<number, string>;
  details: Map<number, string>;
}

export interface ChartRow {
  key: string;
  from: number | null;
  label: string;
  value: number;
}

function roleOf(element: ChartSceneElement): string | null {
  const raw = element.customData?.antvRole;
  return typeof raw === 'string' ? raw : null;
}

function dataOf(element: ChartSceneElement): AntvChartData | null {
  return parseAntvChartData(element.customData?.antvChart);
}

/** The `groupIds` entry Excalidraw regenerates per inserted library item. */
export function outermostGroupId(element: ChartSceneElement): string | null {
  const groups = element.groupIds;
  if (!groups || groups.length === 0) return null;
  return groups[groups.length - 1];
}

/**
 * The chart the selection names: every selected element is a live chart part,
 * all share one outermost group, and the chart is every live element of that
 * group carrying parsable chart data. `null` otherwise (e.g. after ungrouping).
 */
export function findSelectedChart<E extends ChartSceneElement>(
  elements: readonly E[],
  appState: { selectedElementIds?: Record<string, boolean> } | null | undefined,
): SelectedChart<E> | null {
  const selectedIds = appState?.selectedElementIds;
  if (!selectedIds) return null;
  const selected = elements.filter((element) => !element.isDeleted && selectedIds[element.id] === true);
  if (selected.length === 0) return null;

  const dataList = selected.map(dataOf);
  if (dataList.some((data) => data === null)) return null;
  const groupIds = selected.map(outermostGroupId);
  if (groupIds.some((groupId) => groupId === null)) return null;
  const groupId = groupIds[0];
  if (!groupId || groupIds.some((candidate) => candidate !== groupId)) return null;

  const chart = elements.filter(
    (element) =>
      !element.isDeleted && outermostGroupId(element) === groupId && dataOf(element) !== null,
  );
  if (chart.length === 0) return null;
  return { groupId, data: dataList[0] as AntvChartData, elements: chart };
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The current title / per-item label and detail, from the canvas text roles. */
export function readCanvasTexts(chartElements: readonly ChartSceneElement[]): CanvasTexts {
  const texts: CanvasTexts = { labels: new Map(), details: new Map() };
  for (const element of chartElements) {
    if (element.type !== 'text' || typeof element.text !== 'string') continue;
    const role = roleOf(element);
    if (!role) continue;
    const parsed = parseRole(role);
    if (!parsed) continue;
    const value = collapse(element.text);
    if (!value) continue;
    if (parsed.type === 'title') {
      texts.title = value;
    } else if (parsed.type === 'item-label' && parsed.indexes[0] !== undefined) {
      texts.labels.set(parsed.indexes[0], value);
    } else if (parsed.type === 'item-desc' && parsed.indexes[0] !== undefined) {
      texts.details.set(parsed.indexes[0], value);
    }
  }
  return texts;
}

/** One editable row per stored item, seeded from the stored data + canvas texts. */
export function planRows(data: AntvChartData, texts: CanvasTexts): ChartRow[] {
  return data.items.map((item, index) => ({
    key: `item-${index}`,
    from: index,
    label: texts.labels.get(index) ?? item.label,
    value: item.value,
  }));
}

/**
 * The next chart data: title and details from the canvas texts, labels and
 * values from the rows. A row's detail/icon follow its `from` item; a brand new
 * row (`from: null`) has neither. The input is never mutated.
 */
export function buildNextData(data: AntvChartData, texts: CanvasTexts, rows: readonly ChartRow[]): AntvChartData {
  const items = rows.map((row) => {
    const source = row.from !== null ? data.items[row.from] : undefined;
    const detail =
      row.from !== null ? texts.details.get(row.from) ?? source?.detail : undefined;
    const icon = source?.icon;
    return {
      label: row.label,
      value: row.value,
      ...(detail ? { detail } : {}),
      ...(icon ? { icon } : {}),
    };
  });
  return {
    v: 1,
    template: data.template,
    theme: data.theme,
    title: texts.title ?? data.title,
    items,
  };
}

const COPIED_PROPS = [
  'strokeColor',
  'backgroundColor',
  'fillStyle',
  'strokeWidth',
  'strokeStyle',
  'roughness',
  'opacity',
  'fontFamily',
] as const;

interface ItemRun {
  /** The role at each run position; index = item position. */
  roles: string[];
  /** Role -> run position. */
  position: Map<string, number>;
}

/** The colour that distinguishes run members: stroke for text, fill otherwise. */
function runColor(element: ChartSceneElement): string {
  return String(element.type === 'text' ? element.strokeColor ?? '' : element.backgroundColor ?? '');
}

/**
 * Addendum 1, item 4. Within one unindexed role type, the item run is the FIRST
 * contiguous window of exactly `itemCount` elements sharing an Excalidraw `type`
 * and `polygon` flag whose colours (backgroundColor, or strokeColor for text)
 * are all different and never `transparent`. Run position `j` is item `j`.
 * AntV (real library layouts) emits slices/bars/points this way, while grid
 * bands (one repeated colour) and the background never qualify.
 */
function runForType(list: readonly ChartSceneElement[], itemCount: number): ItemRun | null {
  if (itemCount <= 0) return null;
  for (let start = 0; start + itemCount <= list.length; start += 1) {
    const window = list.slice(start, start + itemCount);
    const first = window[0];
    if (!first) continue;
    if (!window.every((element) => element.type === first.type && element.polygon === first.polygon)) {
      continue;
    }
    const colors = window.map(runColor);
    if (new Set(colors).size !== colors.length) continue;
    if (!colors.every((color) => color !== '' && color !== 'transparent')) continue;
    const roles = window.map((element) => roleOf(element) as string);
    return { roles, position: new Map(roles.map((role, index) => [role, index])) };
  }
  return null;
}

/** The item run of every unindexed role type in one render (Addendum 1 item 4). */
function itemRuns(elements: readonly ChartSceneElement[], itemCount: number): Map<string, ItemRun> {
  const byType = new Map<string, ChartSceneElement[]>();
  for (const element of elements) {
    const role = roleOf(element);
    if (!role) continue;
    const parsed = parseRole(role);
    if (!parsed || parsed.indexed || parsed.type === BACKGROUND_ROLE) continue;
    const list = byType.get(parsed.type) ?? [];
    list.push(element);
    byType.set(parsed.type, list);
  }
  const runs = new Map<string, ItemRun>();
  for (const [type, list] of byType) {
    const run = runForType(list, itemCount);
    if (run) runs.set(type, run);
  }
  return runs;
}

export interface CarryOverInput<E extends ChartSceneElement> {
  oldRender: readonly E[];
  current: readonly E[];
  nextRender: readonly E[];
  indexMap: ReadonlyArray<number | null>;
  oldCount: number;
  nextCount: number;
  nextData?: AntvChartData;
}

/**
 * Rebuild the chart's elements from the new render, mapped onto the old parts,
 * carrying the user's changed properties and keeping the chart's place, size and
 * group. Pure: the inputs are never mutated and every output element is new.
 */
export function carryOver<E extends ChartSceneElement>(input: CarryOverInput<E>): E[] {
  const { oldRender, current, nextRender, indexMap, oldCount, nextCount, nextData } = input;

  const oldByRole = new Map<string, E>();
  for (const element of oldRender) {
    const role = roleOf(element);
    if (role) oldByRole.set(role, element);
  }
  const currentByRole = new Map<string, E>();
  for (const element of current) {
    const role = roleOf(element);
    if (role) currentByRole.set(role, element);
  }

  const chartGroupId =
    current.map(outermostGroupId).find((groupId): groupId is string => groupId !== null) ?? '';

  // Anchor: the largest-area current element whose role also exists in the old
  // render, so the chart's move and scale are transferred to the new parts.
  let anchorRole: string | null = null;
  let anchorArea = -1;
  for (const element of current) {
    const role = roleOf(element);
    if (!role || !oldByRole.has(role)) continue;
    const area = element.width * element.height;
    if (area > anchorArea) {
      anchorArea = area;
      anchorRole = role;
    }
  }
  const anchorOld = anchorRole ? oldByRole.get(anchorRole) : undefined;
  const anchorCurrent = anchorRole ? currentByRole.get(anchorRole) : undefined;
  const scale =
    anchorOld && anchorCurrent && anchorOld.width !== 0 && anchorCurrent.width !== 0
      ? anchorCurrent.width / anchorOld.width
      : 1;
  const anchor = {
    oldX: anchorOld?.x ?? 0,
    oldY: anchorOld?.y ?? 0,
    currentX: anchorCurrent?.x ?? 0,
    currentY: anchorCurrent?.y ?? 0,
  };

  const oldRuns = itemRuns(oldRender, oldCount);
  const nextRuns = itemRuns(nextRender, nextCount);

  const runId = Math.random().toString(36).slice(2, 8);
  let counter = 0;
  const freshId = (tag: string): string => `${tag}-${runId}-${counter++}`;
  const groupRemap = new Map<string, string>();
  const freshGroup = (original: string): string => {
    const existing = groupRemap.get(original);
    if (existing) return existing;
    const mapped = freshId('g');
    groupRemap.set(original, mapped);
    return mapped;
  };

  const mapToOldRole = (role: string): string | null => {
    const parsed = parseRole(role);
    if (!parsed) return null;
    // Addendum 1, item 5: the background always maps, whatever the counts.
    if (parsed.type === BACKGROUND_ROLE) return role;
    if (parsed.indexed) {
      const nextIndex = parsed.indexes[0];
      const oldIndex = indexMap.findIndex((value) => value === nextIndex);
      if (oldIndex < 0) return null;
      return `${parsed.type}@${oldIndex}#${parsed.n}`;
    }
    // Addendum 1, item 4: an element inside a next-render item run maps through
    // the run position and the index map; outside a run it is carried 1:1 only
    // when the counts are equal.
    const nextRun = nextRuns.get(parsed.type);
    const position = nextRun?.position.get(role);
    if (nextRun && position !== undefined) {
      const oldIndex = indexMap.findIndex((value) => value === position);
      if (oldIndex < 0) return null;
      const oldRun = oldRuns.get(parsed.type);
      return oldRun?.roles[oldIndex] ?? null;
    }
    if (oldCount === nextCount) return role;
    return null;
  };

  const result: E[] = [];
  for (const element of nextRender) {
    const role = roleOf(element);
    const sourceRole = role ? mapToOldRole(role) : null;
    const oldElement = sourceRole ? oldByRole.get(sourceRole) : undefined;
    const currentElement = sourceRole ? currentByRole.get(sourceRole) : undefined;
    if (oldElement && !currentElement) continue; // the user deleted this part

    const next = {
      ...element,
      id: freshId('e'),
      x: anchor.currentX + scale * (element.x - anchor.oldX),
      y: anchor.currentY + scale * (element.y - anchor.oldY),
      width: element.width * scale,
      height: element.height * scale,
    } as E;

    if (Array.isArray(element.points)) {
      (next as ChartSceneElement).points = element.points.map(
        ([px, py]) => [px * scale, py * scale] as [number, number],
      );
    }
    if (typeof element.fontSize === 'number') (next as ChartSceneElement).fontSize = element.fontSize * scale;
    // Addendum 1, item 6: `lineHeight` is a unitless multiplier; fontSize scales,
    // lineHeight does not.

    if (oldElement && currentElement) {
      for (const prop of COPIED_PROPS) {
        if (currentElement[prop] !== oldElement[prop]) {
          (next as Record<string, unknown>)[prop] = currentElement[prop];
        }
      }
    }

    const groups = element.groupIds ?? [];
    (next as ChartSceneElement).groupIds =
      groups.length === 0
        ? [chartGroupId]
        : groups.map((groupId, index) =>
            index === groups.length - 1 ? chartGroupId : freshGroup(groupId),
          );

    (next as ChartSceneElement).customData = {
      ...(element.customData ?? {}),
      ...(nextData ? { antvChart: nextData } : {}),
    };

    result.push(next);
  }

  return result;
}

/**
 * Replace the chart's elements with the new ones, inserting them where the first
 * old element sat so z-order is kept; every other element is returned unchanged
 * (same object identity).
 */
export function replaceChartInScene<E extends ChartSceneElement>(
  sceneElements: readonly E[],
  chartGroupId: string,
  newElements: readonly E[],
): E[] {
  const out: E[] = [];
  let inserted = false;
  for (const element of sceneElements) {
    if (outermostGroupId(element) === chartGroupId) {
      if (!inserted) {
        out.push(...newElements);
        inserted = true;
      }
      continue;
    }
    out.push(element);
  }
  if (!inserted) out.push(...newElements);
  return out;
}
