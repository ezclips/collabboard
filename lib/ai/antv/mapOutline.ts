/**
 * PATCH-241. The pure bridge between our stored outline and AntV's data model:
 * outline -> options, and an AntV `options:change` back to a NEW outline.
 * No AntV import lives here (it must stay out of the main bundle), no DOM, no
 * mutation of the input.
 */

import { isVisualIconName } from '@/lib/ai/visualIcons';
import { OUTLINE_LIMITS, type VisualOutline, type VisualOutlineChild, type VisualOutlineItem } from '@/lib/ai/outline';
import type { VisualThemeId } from '@/lib/ai/visualThemes';
import { ANTV_ICON_PREFIX } from './icons';

export interface AntvDatum {
  label: string;
  desc?: string;
  icon?: string;
  children?: AntvDatum[];
}

export interface AntvOptions {
  template: string;
  theme: AntvThemeName;
  /** The registered palette id; AntV reads it through `themeConfig.palette`. */
  palette: string;
  themeConfig: { palette: string };
  data: { title: string; items: AntvDatum[] };
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

export function isCompareTemplate(name: string): boolean {
  return name.startsWith('compare-');
}

function datumForItem(item: VisualOutlineItem, withChildren: boolean): AntvDatum {
  const datum: AntvDatum = { label: item.label };
  if (item.detail) datum.desc = item.detail;
  if (item.icon) datum.icon = `${ANTV_ICON_PREFIX}${item.icon}`;
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

  return {
    template: templateName,
    theme: choice.theme,
    palette: choice.palette,
    themeConfig: { palette: choice.palette },
    data: { title: outline.title, items },
  };
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
