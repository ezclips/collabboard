/**
 * PATCH-241. The pure bridge between our stored outline and AntV's data model:
 * outline -> options, and an AntV `options:change` back to a NEW outline.
 * No AntV import lives here (it must stay out of the main bundle), no DOM, no
 * mutation of the input.
 */

import { isVisualIconName } from '@/lib/ai/visualIcons';
import {
  addItemChild,
  insertItem,
  removeItem,
  removeItemChild,
  type OutlineSideRule,
} from '@/lib/ai/infographic/edit';
import {
  isSafeTextColor,
  OUTLINE_LIMITS,
  sanitizeTextStyle,
  type TextStyle,
  type VisualOutline,
  type VisualOutlineChild,
  type VisualOutlineItem,
  type VisualOutlineItemTextStyle,
  type VisualSide,
} from '@/lib/ai/outline';
import { themeById, type VisualThemeId } from '@/lib/ai/visualThemes';
import { fontStack, type VisualFont, type VisualStyle } from '@/lib/ai/visualStyle';
import { ANTV_ICON_PREFIX } from './icons';

/** PATCH-244. AntV's own text attribute names (fill, font-size, …). */
export type AntvTextAttributes = Record<string, unknown>;

export interface AntvDatum {
  label: string;
  desc?: string;
  icon?: string;
  /** PATCH-248. A numeric value the text gave, read by chart templates. */
  value?: number;
  /** PATCH-243. The side a mind-map branch sits on, when one was stored. */
  side?: VisualSide;
  /** PATCH-244. Stored text styles AntV applies on a redraw. */
  attributes?: { label?: AntvTextAttributes; desc?: AntvTextAttributes; icon?: { fill?: string } };
  children?: AntvDatum[];
}

/** PATCH-253. The `themeConfig` keys our styles set, in AntV's own names. */
export interface AntvThemeConfig {
  /** The registered palette id, or an explicit colour array when a style gave one. */
  palette: string | string[];
  colorBg?: string;
  title?: AntvTextAttributes;
  desc?: AntvTextAttributes;
  item?: { label?: AntvTextAttributes; desc?: AntvTextAttributes };
}

export interface AntvOptions {
  template: string;
  theme: AntvThemeName;
  /** The registered palette id; AntV reads it through `themeConfig.palette`. */
  palette: string;
  themeConfig: AntvThemeConfig;
  data: {
    title: string;
    items: AntvDatum[];
    /** PATCH-244. The picture's title text attributes. */
    attributes?: { title?: AntvTextAttributes };
  };
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

/**
 * PATCH-244. Our stored `TextStyle` -> AntV's attribute names. AntV encodes the
 * font family itself on the way out, so the decoded family is passed through.
 */
function antvTextAttributes(style: TextStyle | undefined): AntvTextAttributes | undefined {
  if (!style) return undefined;
  const attrs: AntvTextAttributes = {};
  if (style.fill !== undefined) attrs.fill = style.fill;
  if (style.fontSize !== undefined) attrs['font-size'] = style.fontSize;
  if (style.fontFamily !== undefined) attrs['font-family'] = style.fontFamily;
  if (style.align !== undefined) attrs['data-horizontal-align'] = style.align.toUpperCase();
  return Object.keys(attrs).length ? attrs : undefined;
}

/** PATCH-253. A stored font -> AntV's own `font-family` / `font-weight` keys. */
function antvFontAttributes(font: VisualFont | undefined): AntvTextAttributes | undefined {
  if (!font) return undefined;
  return { 'font-family': fontStack(font.family), 'font-weight': font.weight };
}

/** PATCH-244. An item's stored parts -> the `datum.attributes` AntV reads. */
function datumAttributes(item: VisualOutlineItem): AntvDatum['attributes'] | undefined {
  const style = item.textStyle;
  if (!style) return undefined;
  const attributes: NonNullable<AntvDatum['attributes']> = {};
  const label = antvTextAttributes(style.label);
  if (label) attributes.label = label;
  const desc = antvTextAttributes(style.detail);
  if (desc) attributes.desc = desc;
  if (style.icon?.fill) attributes.icon = { fill: style.icon.fill };
  return Object.keys(attributes).length ? attributes : undefined;
}

function datumForItem(item: VisualOutlineItem, withChildren: boolean): AntvDatum {
  const datum: AntvDatum = { label: item.label };
  if (item.detail) datum.desc = item.detail;
  if (item.icon) datum.icon = `${ANTV_ICON_PREFIX}${item.icon}`;
  // PATCH-248. Charts read `value`; other templates ignore it.
  if (item.value !== undefined) datum.value = item.value;
  if (item.side) datum.side = item.side;
  const attributes = datumAttributes(item);
  if (attributes) datum.attributes = attributes;
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
  style?: VisualStyle,
): AntvOptions {
  const choice = antvThemeFor(themeId);
  const hierarchy = isHierarchyTemplate(templateName);
  const titleAttributes = antvTextAttributes(outline.titleStyle);
  let items: AntvDatum[];

  if (hierarchy) {
    const root: AntvDatum = { label: outline.title };
    // The hierarchy root is itself an item-label, so BOTH the stored title style
    // (PATCH-244) and the style's title font (PATCH-253, Addendum C) go there.
    // A stored title style still wins for the keys it sets.
    const rootLabel = { ...antvFontAttributes(style?.fonts?.title), ...titleAttributes };
    if (Object.keys(rootLabel).length) root.attributes = { label: rootLabel };
    const children = outline.items.map((item) => datumForItem(item, true));
    if (children.length) root.children = children;
    items = [root];
  } else if (isCompareTemplate(templateName)) {
    items = outline.items.map((item) => datumForItem(item, true));
  } else {
    items = outline.items.map((item) => datumForItem(item, false));
  }

  const themeConfig: AntvThemeConfig = { palette: choice.palette };
  // PATCH-259. Dark themes paint AntV's own background in its near-black
  // default, so a black box sits inside our coloured frame. Use the theme's own
  // background instead; a custom style background still wins (PATCH-253).
  const theme = themeById(themeId);
  if (theme.dark && !style?.background) themeConfig.colorBg = theme.background;
  if (style) {
    if (style.background) themeConfig.colorBg = style.background;
    if (style.colors?.length) themeConfig.palette = style.colors;
    const titleFont = antvFontAttributes(style.fonts?.title);
    if (titleFont) themeConfig.title = titleFont;
    const labelFont = antvFontAttributes(style.fonts?.label);
    const descFont = antvFontAttributes(style.fonts?.desc);
    if (descFont) themeConfig.desc = descFont;
    if (labelFont || descFont) {
      themeConfig.item = {
        ...(labelFont ? { label: labelFont } : {}),
        ...(descFont ? { desc: descFont } : {}),
      };
    }
  }

  const options: AntvOptions = {
    template: templateName,
    theme: choice.theme,
    palette: choice.palette,
    themeConfig,
    data: { title: outline.title, items },
  };
  // The flat templates draw `data.title` as a separate title element.
  if (!hierarchy && titleAttributes) options.data.attributes = { title: titleAttributes };
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

  // PATCH-245 Addendum 3. A side-less AntV mind map is drawn even -> left, so
  // freezing must use that rule or the first edit flips every branch.
  const sideRule: OutlineSideRule = isMindmapTemplate(templateName) ? 'antv-mindmap' : 'hub';

  if (edit.kind === 'item') {
    if (edit.op === 'add') {
      if (outline.items.length >= OUTLINE_LIMITS.items) return outline;
      if (edit.index < 0 || edit.index > outline.items.length) return outline;
      return insertItem(outline, edit.index, { rule: sideRule });
    }
    if (outline.items.length <= OUTLINE_LIMITS.minItems) return outline;
    if (edit.index < 0 || edit.index >= outline.items.length) return outline;
    return removeItem(outline, edit.index, sideRule);
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

/** PATCH-244. AntV's element update value: `{ attributes: {...} }`. */
function attributesOf(value: unknown): AntvTextAttributes | null {
  if (!value || typeof value !== 'object') return null;
  const attributes = (value as { attributes?: unknown }).attributes;
  if (!attributes || typeof attributes !== 'object') return null;
  return attributes as AntvTextAttributes;
}

/**
 * PATCH-244. Which text style an AntV attribute path targets:
 * `data.items[0].attributes.label` (an item part) or `data.attributes.title`.
 */
function attributePathTarget(path: string | undefined): { scope: 'item' | 'title'; key: string } | null {
  if (!path) return null;
  const parts = path.split('.');
  if (parts.length < 3 || parts[parts.length - 2] !== 'attributes') return null;
  const key = parts[parts.length - 1];
  const segment = parts[1] ?? '';
  if (segment === 'attributes') return { scope: 'title', key };
  if (segment === 'items' || segment.startsWith('items[')) return { scope: 'item', key };
  return null;
}

/** PATCH-244. AntV's own horizontal align (`LEFT`) -> our stored alignment. */
function antvAlign(value: unknown): 'left' | 'center' | 'right' | undefined {
  if (typeof value !== 'string') return undefined;
  const lower = value.toLowerCase();
  return lower === 'left' || lower === 'center' || lower === 'right' ? lower : undefined;
}

/** PATCH-244. Merges a validated patch into a `TextStyle`, keeping old keys. */
function mergeStyle(style: TextStyle | undefined, patch: TextStyle): TextStyle {
  return { ...(style ?? {}), ...patch };
}

/**
 * PATCH-244. Applies an AntV text-attribute update to an outline. `scope`
 * 'title' is `data.attributes.title`; otherwise `target` resolves the item
 * (including a mind map's root, which is the title).
 */
function applyTextAttributes(
  outline: VisualOutline,
  target: Target,
  scope: 'item' | 'title',
  key: string,
  attributes: AntvTextAttributes,
): VisualOutline {
  if (scope === 'title') {
    if (key !== 'title') return outline;
    const patch = sanitizeTextStyle({
      fill: attributes.fill,
      fontSize: attributes['font-size'],
      fontFamily: attributes['font-family'],
      align: antvAlign(attributes['data-horizontal-align']),
    });
    if (!patch) return outline;
    return { ...outline, titleStyle: mergeStyle(outline.titleStyle, patch) };
  }

  if (!target || target.kind === 'child') return outline;
  if (target.kind === 'title') {
    const patch = sanitizeTextStyle({
      fill: attributes.fill,
      fontSize: attributes['font-size'],
      fontFamily: attributes['font-family'],
      align: antvAlign(attributes['data-horizontal-align']),
    });
    if (!patch) return outline;
    return { ...outline, titleStyle: mergeStyle(outline.titleStyle, patch) };
  }

  const items = outline.items.map(cloneItem);
  const item = items[target.i];
  if (!item) return outline;

  const textStyle: VisualOutlineItemTextStyle = { ...(item.textStyle ?? {}) };
  if (key === 'icon') {
    if (!isSafeTextColor(attributes.fill)) return outline;
    textStyle.icon = { ...(textStyle.icon ?? {}), fill: attributes.fill };
  } else if (key === 'label' || key === 'desc') {
    const patch = sanitizeTextStyle({
      fill: attributes.fill,
      fontSize: attributes['font-size'],
      fontFamily: attributes['font-family'],
      align: antvAlign(attributes['data-horizontal-align']),
    });
    if (!patch) return outline;
    if (key === 'label') textStyle.label = mergeStyle(textStyle.label, patch);
    else textStyle.detail = mergeStyle(textStyle.detail, patch);
  } else {
    return outline;
  }

  items[target.i] = { ...item, textStyle };
  return { ...outline, items };
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
  if (item.value !== undefined) next.value = item.value;
  if (item.side !== undefined) next.side = item.side;
  if (item.textStyle !== undefined) next.textStyle = item.textStyle;
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
  const raw = value as { label?: unknown; desc?: unknown; icon?: unknown; value?: unknown; children?: unknown };
  const label = trimTo(raw.label, OUTLINE_LIMITS.label) || 'New point';
  const item: VisualOutlineItem = { label };
  const detail = trimTo(raw.desc, OUTLINE_LIMITS.detail);
  if (detail) item.detail = detail;
  // PATCH-248. Keep a numeric value AntV sends back; charts are not edited yet.
  if (typeof raw.value === 'number' && Number.isFinite(raw.value) && raw.value >= 0) item.value = raw.value;
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
    // PATCH-244: an element update (`{ attributes }`) is a text style, not text.
    if (entry.op === 'update') {
      const attributes = attributesOf(entry.value);
      const parsed = attributePathTarget(entry.path);
      if (attributes && parsed) {
        if (parsed.scope === 'title') {
          next = applyTextAttributes(next, null, 'title', parsed.key, attributes);
        } else {
          next = applyTextAttributes(
            next,
            resolveTarget(entry.indexes, templateName),
            'item',
            parsed.key,
            attributes,
          );
        }
        continue;
      }
    }

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

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => deepEqual(left[key], right[key]));
}

/**
 * PATCH-244. Structural equality, ignoring key order. The renderer uses it to
 * skip `onChange` for a toolbar action we do not store, so an unmapped action
 * never triggers a redraw that would wipe what AntV just drew.
 */
export function outlinesEqual(a: VisualOutline, b: VisualOutline): boolean {
  return deepEqual(a, b);
}
