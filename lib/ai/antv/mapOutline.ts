/**
 * PATCH-241. The pure bridge between our stored outline and AntV's data model:
 * outline -> options, and an AntV `options:change` back to a NEW outline.
 * No AntV import lives here (it must stay out of the main bundle), no DOM, no
 * mutation of the input.
 */

import { isVisualIconName } from '@/lib/ai/visualIcons';
import { addItemChild, insertItem, removeItem, removeItemChild } from '@/lib/ai/infographic/edit';
import {
  OUTLINE_LIMITS,
  type VisualOutline,
  type VisualOutlineChild,
  type VisualOutlineItem,
  type VisualSide,
} from '@/lib/ai/outline';
import type { VisualThemeId } from '@/lib/ai/visualThemes';
import { ANTV_ICON_PREFIX } from './icons';

export interface AntvDatum {
  label: string;
  desc?: string;
  icon?: string;
  /** PATCH-243. The side a mind-map branch sits on, when one was stored. */
  side?: VisualSide;
  children?: AntvDatum[];
}

export interface AntvOptions {
  template: string;
  theme: AntvThemeName;
  /** The registered palette id; AntV reads it through `themeConfig.palette`. */
  palette: string;
  themeConfig: { palette: string };
  data: { title: string; items: AntvDatum[] };
  /** PATCH-243. Swaps the structure to our side-stable mind map. */
  design?: { structure: { type: string; [key: string]: unknown } };
}

export type AntvThemeName = 'light' | 'dark' | 'hand-drawn';

export interface AntvThemeChoice {
  theme: AntvThemeName;
  palette: string;
}

const ANTV_PALETTE_PREFIX = 'patch241-';

/** The name our palettes are registered under (see `setup.ts`). */
export function antvPaletteName(themeId: VisualThemeId): string {
  return `${ANTV_PALETTE_PREFIX}${themeId}`;
}

/**
 * Our theme -> AntV's theme + a palette from our theme's six stroke colours.
 * `hand-drawn` keeps its rough style but borrows the classic palette, so it
 * still reads as ours. Unknown ids fall back to classic/light.
 */
export function antvThemeFor(themeId?: VisualThemeId | null): AntvThemeChoice {
  switch (themeId) {
    case 'teal-night':
    case 'midnight':
      return { theme: 'dark', palette: antvPaletteName(themeId) };
    case 'hand-drawn':
      return { theme: 'hand-drawn', palette: antvPaletteName('classic') };
    case 'ocean':
    case 'sunset':
    case 'forest':
    case 'mono':
      return { theme: 'light', palette: antvPaletteName(themeId) };
    default:
      return { theme: 'light', palette: antvPaletteName('classic') };
  }
}

/** Hierarchy templates carry one root whose children are the outline items. */
export function isHierarchyTemplate(name: string): boolean {
  return name.startsWith('hierarchy-');
}

/** PATCH-243. Our side-stable copy of AntV's `hierarchy-mindmap` structure. */
export const STABLE_MINDMAP_STRUCTURE = 'stable-hierarchy-mindmap';

/** PATCH-243. The mind-map family whose branches keep their stored side. */
export function isMindmapTemplate(name: string): boolean {
  return name.startsWith('hierarchy-mindmap-');
}

/**
 * PATCH-243. The structure parameters AntV's built-in mind-map templates use,
 * reproduced so that swapping in `stable-hierarchy-mindmap` keeps the exact
 * colours/geometry ("branch" vs "level" colouring, gradient edges, the two
 * `edgeAlign` variants). Mirrors @antv/infographic 0.2.20
 * `templates/hierarchy-mindmap.ts`.
 */
export function mindmapStructureConfig(name: string): { type: string; [key: string]: unknown } {
  const config: { type: string; [key: string]: unknown } = {
    type: STABLE_MINDMAP_STRUCTURE,
    edgeType: 'curved',
    edgeColorMode: 'gradient',
    edgeWidth: 2,
    levelGap: 80,
    nodeGap: 18,
    colorMode: name.includes('-level-gradient-') ? 'level' : 'branch',
  };
  if (name.endsWith('-lined-palette')) config.edgeAlign = 'bottom';
  else if (name.endsWith('-circle-progress')) config.edgeAlign = 0.4;
  return config;
}

export function isCompareTemplate(name: string): boolean {
  return name.startsWith('compare-');
}

function datumForItem(item: VisualOutlineItem, withChildren: boolean): AntvDatum {
  const datum: AntvDatum = { label: item.label };
  if (item.detail) datum.desc = item.detail;
  if (item.icon) datum.icon = `${ANTV_ICON_PREFIX}${item.icon}`;
  if (item.side) datum.side = item.side;
  if (withChildren && item.children?.length) {
    datum.children = item.children.map((child) => ({ label: child.label }));
  }
  return datum;
}

/**
 * Our outline -> the exact options AntV needs. Flat templates get one item per
 * outline item; hierarchy/mind-map templates get one root (the title) whose
 * children are the outline items; compare templates keep each side's children.
 */
export function toAntvOptions(
  outline: VisualOutline,
  templateName: string,
  themeId?: VisualThemeId | null,
): AntvOptions {
  const choice = antvThemeFor(themeId);
  let items: AntvDatum[];

  if (isHierarchyTemplate(templateName)) {
    const root: AntvDatum = { label: outline.title };
    const children = outline.items.map((item) => datumForItem(item, true));
    if (children.length) root.children = children;
    items = [root];
  } else if (isCompareTemplate(templateName)) {
    items = outline.items.map((item) => datumForItem(item, true));
  } else {
    items = outline.items.map((item) => datumForItem(item, false));
  }

  const options: AntvOptions = {
    template: templateName,
    theme: choice.theme,
    palette: choice.palette,
    themeConfig: { palette: choice.palette },
    data: { title: outline.title, items },
  };
  if (isMindmapTemplate(templateName)) {
    options.design = { structure: mindmapStructureConfig(templateName) };
  }
  return options;
}

// ── PATCH-243. AntV's on-picture + / − buttons -> an outline edit ────────────

export type AntvButtonOp = 'add' | 'remove';

export interface AntvButtonEdit {
  op: AntvButtonOp;
  kind: 'item' | 'child';
  /** For `child`: the parent item. For `item`: the position being changed. */
  itemIndex: number;
  /** Insertion/removal position (item position, or child position). */
  index: number;
}

function parseIndexPath(indexes: number[] | undefined): number[] | null {
  if (!indexes || indexes.length === 0) return null;
  if (!indexes.every((value) => Number.isInteger(value) && value >= 0)) return null;
  return indexes;
}

/**
 * PATCH-243. Maps AntV's `data-indexes` on a `btn-add`/`btn-remove` to the
 * outline change it means. Hierarchy templates keep a single root
 * (`[0, i, j]`), flat templates have no root (`[i]`, `[i, j]`); anything else
 * (or the root/title itself) is not an edit. Pure.
 */
export function mapAntvButton(
  indexes: number[] | undefined,
  op: AntvButtonOp,
  templateName: string,
): AntvButtonEdit | null {
  const path = parseIndexPath(indexes);
  if (!path) return null;

  if (isHierarchyTemplate(templateName)) {
    if (path[0] !== 0) return null;
    if (path.length === 1) return null; // the title / root is never edited
    if (path.length === 2) return { op, kind: 'item', itemIndex: path[1], index: path[1] };
    if (path.length === 3) return { op, kind: 'child', itemIndex: path[1], index: path[2] };
    return null;
  }

  if (path.length === 1) return { op, kind: 'item', itemIndex: path[0], index: path[0] };
  if (path.length === 2) return { op, kind: 'child', itemIndex: path[0], index: path[1] };
  return null;
}

/**
 * PATCH-243. Applies an AntV button edit to the outline with the PATCH-242
 * freezing helpers. Out-of-range or impossible edits return the SAME outline
 * (no change), so the renderer can skip `onChange`.
 */
export function applyAntvButton(
  outline: VisualOutline,
  indexes: number[] | undefined,
  op: AntvButtonOp,
  templateName: string,
): VisualOutline {
  const edit = mapAntvButton(indexes, op, templateName);
  if (!edit) return outline;

  if (edit.kind === 'item') {
    if (edit.op === 'add') {
      if (outline.items.length >= OUTLINE_LIMITS.items) return outline;
      if (edit.index < 0 || edit.index > outline.items.length) return outline;
      return insertItem(outline, edit.index);
    }
    if (outline.items.length <= OUTLINE_LIMITS.minItems) return outline;
    if (edit.index < 0 || edit.index >= outline.items.length) return outline;
    return removeItem(outline, edit.index);
  }

  const item = outline.items[edit.itemIndex];
  if (!item) return outline;
  if (edit.op === 'add') {
    const count = item.children?.length ?? 0;
    if (count >= OUTLINE_LIMITS.children) return outline;
    if (edit.index < 0 || edit.index > count) return outline;
    return addItemChild(outline, edit.itemIndex, edit.index);
  }
  if (!item.children || edit.index < 0 || edit.index >= item.children.length) return outline;
  return removeItemChild(outline, edit.itemIndex, edit.index);
}

// ── Change handling ──────────────────────────────────────────────────────────

export interface AntvChange {
  op: 'update' | 'add' | 'remove' | string;
  path?: string;
  indexes?: number[];
  value?: unknown;
  role?: string;
}

export interface AntvChangeEvent {
  type?: string;
  changes?: AntvChange[];
}

type Target =
  | { kind: 'title' }
  | { kind: 'item'; i: number }
  | { kind: 'child'; i: number; j: number }
  | null;

/** Where an AntV datum index points in OUR outline, unwrapping the root. */
function resolveTarget(indexes: number[] | undefined, templateName: string): Target {
  if (!indexes || indexes.length === 0) return null;
  if (isHierarchyTemplate(templateName)) {
    if (indexes[0] !== 0) return null;
    if (indexes.length === 1) return { kind: 'title' };
    if (indexes.length === 2) return { kind: 'item', i: indexes[1] };
    if (indexes.length === 3) return { kind: 'child', i: indexes[1], j: indexes[2] };
    return null;
  }
  if (indexes.length === 1) return { kind: 'item', i: indexes[0] };
  if (indexes.length === 2) return { kind: 'child', i: indexes[0], j: indexes[1] };
  return null;
}

function trimTo(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

/** An AntV icon value (`'lucide/x'` or `{ data: 'lucide/x' }`) -> our icon name. */
function iconNameFrom(value: unknown): { present: boolean; name: string | null } {
  let raw: unknown = value;
  if (value && typeof value === 'object' && 'data' in value) {
    raw = (value as { data?: unknown }).data;
  }
  if (typeof raw !== 'string') return { present: false, name: null };
  const name = raw.startsWith(ANTV_ICON_PREFIX) ? raw.slice(ANTV_ICON_PREFIX.length) : raw;
  return { present: true, name: isVisualIconName(name) ? name : null };
}

function cloneItem(item: VisualOutlineItem): VisualOutlineItem {
  const next: VisualOutlineItem = { label: item.label };
  if (item.detail !== undefined) next.detail = item.detail;
  if (item.date !== undefined) next.date = item.date;
  if (item.icon !== undefined) next.icon = item.icon;
  if (item.color !== undefined) next.color = item.color;
  if (item.children !== undefined) next.children = item.children.map((child) => ({ label: child.label }));
  return next;
}

function cloneOutline(outline: VisualOutline): VisualOutline {
  return {
    ...outline,
    items: outline.items.map(cloneItem),
  };
}

function patchItem(item: VisualOutlineItem, value: unknown): VisualOutlineItem {
  if (!value || typeof value !== 'object') return item;
  const raw = value as { label?: unknown; desc?: unknown; icon?: unknown };
  const next = cloneItem(item);
  if (raw.label !== undefined) {
    const label = trimTo(raw.label, OUTLINE_LIMITS.label);
    if (label) next.label = label;
  }
  if (raw.desc !== undefined) {
    const detail = trimTo(raw.desc, OUTLINE_LIMITS.detail);
    if (detail) next.detail = detail;
    else delete next.detail;
  }
  if (raw.icon !== undefined) {
    const icon = iconNameFrom(raw.icon);
    if (icon.present) {
      if (icon.name) next.icon = icon.name;
      else delete next.icon;
    }
  }
  return next;
}

function itemFromDatum(value: unknown): VisualOutlineItem | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { label?: unknown; desc?: unknown; icon?: unknown; children?: unknown };
  const label = trimTo(raw.label, OUTLINE_LIMITS.label) || 'New point';
  const item: VisualOutlineItem = { label };
  const detail = trimTo(raw.desc, OUTLINE_LIMITS.detail);
  if (detail) item.detail = detail;
  const icon = iconNameFrom(raw.icon);
  if (icon.present && icon.name) item.icon = icon.name;
  if (Array.isArray(raw.children)) {
    const children: VisualOutlineChild[] = raw.children
      .map((child) => trimTo((child as { label?: unknown })?.label, OUTLINE_LIMITS.label))
      .filter(Boolean)
      .slice(0, OUTLINE_LIMITS.children)
      .map((childLabel) => ({ label: childLabel }));
    if (children.length) item.children = children;
  }
  return item;
}

function normaliseChanges(change: AntvChange | AntvChangeEvent | null | undefined): AntvChange[] {
  if (!change) return [];
  if (Array.isArray((change as AntvChangeEvent).changes)) return (change as AntvChangeEvent).changes ?? [];
  return [change as AntvChange];
}

function isItemsPath(path: string | undefined): boolean {
  return path === undefined || path === '' || path === 'data.items' || path.startsWith('data.items.');
}

/**
 * Applies an AntV change (or a whole `options:change` event) to the outline,
 * returning a NEW outline. Honour limits: never below 2 or above 8 items, never
 * above 6 children. Unknown ops/paths are ignored.
 */
export function applyAntvChange(
  outline: VisualOutline,
  templateName: string,
  change: AntvChange | AntvChangeEvent | null | undefined,
): VisualOutline {
  let next = cloneOutline(outline);

  for (const entry of normaliseChanges(change)) {
    if (entry.op === 'update' && entry.path === 'data.title') {
      const title = trimTo(entry.value, OUTLINE_LIMITS.title);
      if (title) next = { ...next, title };
      continue;
    }
    if (!isItemsPath(entry.path)) continue;

    const target = resolveTarget(entry.indexes, templateName);
    if (!target) continue;

    if (target.kind === 'title') {
      if (entry.op === 'update') {
        const title = trimTo(entry.value, OUTLINE_LIMITS.title);
        if (title) next = { ...next, title };
      }
      continue;
    }

    if (target.kind === 'item') {
      const items = next.items.map(cloneItem);
      const i = target.i;
      if (entry.op === 'update') {
        if (i < 0 || i >= items.length) continue;
        items[i] = patchItem(items[i], entry.value);
      } else if (entry.op === 'remove') {
        if (items.length <= OUTLINE_LIMITS.minItems || i < 0 || i >= items.length) continue;
        items.splice(i, 1);
      } else if (entry.op === 'add') {
        const incoming = Array.isArray(entry.value) ? entry.value : [entry.value];
        const mapped = incoming.map(itemFromDatum).filter((item): item is VisualOutlineItem => item !== null);
        if (mapped.length === 0) continue;
        const at = Math.max(0, Math.min(i, items.length));
        if (items.length + mapped.length > OUTLINE_LIMITS.items) continue;
        items.splice(at, 0, ...mapped);
      } else {
        continue;
      }
      next = { ...next, items };
      continue;
    }

    // target.kind === 'child'
    const items = next.items.map(cloneItem);
    const { i, j } = target;
    const parent = items[i];
    if (!parent) continue;
    const children = (parent.children ?? []).map((child) => ({ label: child.label }));
    if (entry.op === 'update') {
      if (j < 0 || j >= children.length) continue;
      const label = trimTo((entry.value as { label?: unknown })?.label, OUTLINE_LIMITS.label);
      if (!label) continue;
      children[j] = { label };
    } else if (entry.op === 'remove') {
      if (j < 0 || j >= children.length) continue;
      children.splice(j, 1);
    } else if (entry.op === 'add') {
      const incoming = Array.isArray(entry.value) ? entry.value : [entry.value];
      const labels = incoming
        .map((child) => trimTo((child as { label?: unknown })?.label, OUTLINE_LIMITS.label) || 'New point')
        .slice(0, OUTLINE_LIMITS.children - children.length);
      if (labels.length === 0) continue;
      const at = Math.max(0, Math.min(j, children.length));
      children.splice(at, 0, ...labels.map((label) => ({ label })));
    } else {
      continue;
    }
    if (children.length) parent.children = children;
    else delete parent.children;
    next = { ...next, items };
  }

  return next;
}
