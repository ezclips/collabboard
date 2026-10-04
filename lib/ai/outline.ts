import { z } from 'zod';

import { sanitizeElementOverrides, type ElementOverrides } from './antv/elementOverrides';
import { sanitizeElementOverridesByTemplate } from './antv/templateOverrides';
import { VISUAL_ICON_NAMES, isVisualIconName } from './visualIcons';

/**
 * PATCH-233. The "Show options" outline: the STRUCTURE of the user's text, once,
 * which `outlineToVisuals` then draws several ways. Napkin-style -- the AI does
 * not draw, it extracts title/points/details/order.
 */

export interface VisualOutlineChild {
  label: string;
}

/** PATCH-242. Which side of a hub/tree picture an item sits on. */
export type VisualSide = 'left' | 'right';

/** PATCH-244. The three horizontal alignments AntV's text toolbar offers. */
export type TextStyleAlign = 'left' | 'center' | 'right';

/**
 * PATCH-244. A small, validated text style AntV's text toolbar can change. Only
 * AntV pictures read it; our own layouts and the mind-map tree ignore it.
 */
export interface TextStyle {
  fill?: string;
  fontSize?: number;
  fontFamily?: string;
  align?: TextStyleAlign;
}

/** PATCH-244. Per-part styles: label, detail and the icon's fill. */
export interface VisualOutlineItemTextStyle {
  label?: TextStyle;
  detail?: TextStyle;
  icon?: { fill?: string };
}

export interface VisualOutlineItem {
  label: string;
  detail?: string;
  date?: string;
  /** PATCH-237. One icon name from VISUAL_ICON_NAMES, when one fits. */
  icon?: string;
  /** PATCH-240. A palette slot (0..5) overriding the item's index colour. */
  color?: number;
  /**
   * PATCH-248. A plain number the text gave for this point (40% -> 40), so a
   * chart can be drawn. Kept only when finite and >= 0. Never invented.
   */
  value?: number;
  /**
   * PATCH-268. Set ONLY locally by `withExampleValues` on a value it invented.
   * Never read from the model (`parseOutline` drops it) and never saved:
   * `withoutExampleValues` strips the value and this flag from every item.
   */
  valueExample?: true;
  /**
   * PATCH-242. The side this item was placed on, so adding/removing an item
   * never moves the others. Only the hub design uses it; every other design
   * ignores it. Kept leniently by `parseOutline`.
   */
  side?: VisualSide;
  /** PATCH-244. AntV-toolbar text style, kept only for AntV designs. */
  textStyle?: VisualOutlineItemTextStyle;
  /**
   * PATCH-274. A stable identity for this item, so a presentation edit (a
   * colour, move or hide) follows the item when others are added, removed or
   * reordered. Assigned by `withItemIds` when an outline enters editing; the
   * model never sets one and the model path of `parseOutline` drops it.
   * `6..12` lower-case letters/digits.
   */
  id?: string;
  children?: VisualOutlineChild[];
}

export interface VisualOutline {
  title: string;
  ordered: boolean;
  items: VisualOutlineItem[];
  kind: OutlineKind;
  /** PATCH-244. AntV-toolbar text style for the picture's title. */
  titleStyle?: TextStyle;
  /**
   * PATCH-250. Set by the server when the AI estimated the values; never read
   * from the model.
   */
  valuesEstimated?: boolean;
  /**
   * PATCH-257. Set locally when the chart family shows example numbers; never
   * sent by the server or read from the model. `parseOutline` drops it like
   * `valuesEstimated`.
   */
  valuesExample?: boolean;
  /**
   * PATCH-260. Per-element move/resize/delete overrides, stored INSIDE the
   * outline so every save path carries them. The model never sets it: the
   * outline route strips it, and `parseOutline` keeps only a sanitized copy.
   * PATCH-273. Always mirrors the entry of the most recently edited design, so
   * every existing reader keeps working.
   */
  elementOverrides?: ElementOverrides;
  /**
   * PATCH-273. One edit map per design, keyed by template, so switching designs
   * never loses another design's work. The model never sets it: the generate
   * routes strip it, and `parseOutline` keeps only a sanitized copy (stored
   * path) or drops it (model path). At most 12 entries, by recency.
   */
  elementOverridesByTemplate?: Record<string, ElementOverrides>;
}

/**
 * PATCH-244. The bounds a stored `fontSize` must fall in. Values outside are
 * dropped rather than rejecting the post.
 */
export const OUTLINE_FONT_SIZE_MIN = 8;
export const OUTLINE_FONT_SIZE_MAX = 72;

export interface TextStyleFontFamily {
  /** The exact stored value AntV reads. */
  value: string;
  /** A short, readable name for a picker. */
  label: string;
}

/**
 * PATCH-244/275. The font families AntV's toolbar can set: its five registered
 * faces plus our two system-only stacks (see `antv/setup.ts`). A family outside
 * this list is dropped. Exported so the element panel can offer them by name.
 */
export const TEXT_STYLE_FONT_FAMILIES: readonly TextStyleFontFamily[] = [
  { value: 'Alibaba PuHuiTi', label: 'Alibaba PuHuiTi' },
  { value: 'Source Han Sans', label: 'Source Han Sans' },
  { value: 'Source Han Serif', label: 'Source Han Serif' },
  { value: 'LXGW WenKai', label: 'LXGW WenKai' },
  { value: '851tegakizatsu', label: '851tegakizatsu' },
  {
    value: 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
    label: 'System',
  },
  {
    value: "'Segoe Print', 'Comic Sans MS', 'Bradley Hand', cursive",
    label: 'Handwriting',
  },
] as const;

const TEXT_STYLE_FONT_FAMILY_VALUES = new Set(TEXT_STYLE_FONT_FAMILIES.map((family) => family.value));

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_COLOR =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9]*\.?[0-9]+)\s*)?\)$/i;

/**
 * PATCH-244. True only for a real, self-contained colour literal: hex or
 * rgb(a) with every number in range. No `url(`, no trailing `;`.
 */
export function isSafeTextColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (HEX_COLOR.test(value)) return true;
  const match = RGB_COLOR.exec(value);
  if (!match) return false;
  const channels = [match[1], match[2], match[3]];
  if (channels.some((channel) => Number(channel) > 255)) return false;
  if (match[4] !== undefined && Number(match[4]) > 1) return false;
  return true;
}

/**
 * PATCH-244. The one shared, pure text-style validator. Keeps a real colour,
 * an integer size in range, a known font family and a known alignment; drops
 * everything else. Returns `undefined` for an empty/absent style. Never throws.
 */
export function sanitizeTextStyle(raw: unknown): TextStyle | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as { fill?: unknown; fontSize?: unknown; fontFamily?: unknown; align?: unknown };
  const style: TextStyle = {};
  if (isSafeTextColor(input.fill)) style.fill = input.fill;
  if (
    typeof input.fontSize === 'number' &&
    Number.isInteger(input.fontSize) &&
    input.fontSize >= OUTLINE_FONT_SIZE_MIN &&
    input.fontSize <= OUTLINE_FONT_SIZE_MAX
  ) {
    style.fontSize = input.fontSize;
  }
  if (typeof input.fontFamily === 'string' && TEXT_STYLE_FONT_FAMILY_VALUES.has(input.fontFamily)) {
    style.fontFamily = input.fontFamily;
  }
  if (input.align === 'left' || input.align === 'center' || input.align === 'right') {
    style.align = input.align;
  }
  return Object.keys(style).length ? style : undefined;
}

/** PATCH-244. Sanitises an item's `textStyle`; an empty result is removed. */
export function sanitizeItemTextStyle(raw: unknown): VisualOutlineItemTextStyle | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as { label?: unknown; detail?: unknown; icon?: unknown };
  const style: VisualOutlineItemTextStyle = {};
  const label = sanitizeTextStyle(input.label);
  if (label) style.label = label;
  const detail = sanitizeTextStyle(input.detail);
  if (detail) style.detail = detail;
  if (input.icon && typeof input.icon === 'object') {
    const fill = (input.icon as { fill?: unknown }).fill;
    if (isSafeTextColor(fill)) style.icon = { fill };
  }
  return Object.keys(style).length ? style : undefined;
}

/**
 * PATCH-236. WHAT KIND of text this is. Napkin's AI never draws; it says the
 * SHAPE, and the design library suggests templates that can hold it.
 */
export type OutlineKind =
  | 'list'
  | 'steps'
  | 'levels'
  | 'cycle'
  | 'parts'
  | 'comparison'
  | 'timeline'
  | 'cause_effect';

export const OUTLINE_KINDS: readonly OutlineKind[] = [
  'list',
  'steps',
  'levels',
  'cycle',
  'parts',
  'comparison',
  'timeline',
  'cause_effect',
];

export const OUTLINE_LIMITS = {
  title: 80,
  label: 40,
  detail: 140,
  date: 24,
  items: 8,
  minItems: 2,
  children: 6,
} as const;

/** PATCH-274. A stable item id: 6..12 lower-case letters/digits. */
const ITEM_ID_PATTERN = /^[a-z0-9]{6,12}$/;

/** PATCH-274. True only for a well-formed stable item id. Never throws. */
export function isValidItemId(value: unknown): value is string {
  return typeof value === 'string' && ITEM_ID_PATTERN.test(value);
}

const ITEM_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** PATCH-274. A fresh random 10-character id (pattern-conformant). */
function randomItemId(): string {
  let id = '';
  for (let i = 0; i < 10; i += 1) {
    id += ITEM_ID_CHARS[Math.floor(Math.random() * ITEM_ID_CHARS.length)];
  }
  return id;
}

/**
 * PATCH-274. A NEW outline where every item without a valid id gets a fresh
 * random one. Existing valid ids are kept; a duplicate id keeps its FIRST
 * occurrence and later duplicates get new ids. Children get no ids in this
 * patch. Pure apart from randomness; identity when every id is already valid
 * and unique.
 */
export function withItemIds(outline: VisualOutline): VisualOutline {
  const used = new Set<string>();
  let changed = false;
  const items = outline.items.map((item) => {
    if (isValidItemId(item.id) && !used.has(item.id)) {
      used.add(item.id);
      return item;
    }
    changed = true;
    let id = randomItemId();
    while (used.has(id)) id = randomItemId();
    used.add(id);
    return { ...item, id };
  });
  return changed ? { ...outline, items } : outline;
}

/** Thrown when the model's outline has too little usable content to draw. */
export class OutlineParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutlineParseError';
  }
}

export const OUTLINE_SYSTEM_PROMPT = `
You extract the STRUCTURE of the user's text so it can be drawn as a diagram.
Return valid JSON only, matching this exact shape:
{
  "title": "Short title (<= 80 characters)",
  "kind": "list",
  "ordered": false,
  "items": [
    {
      "label": "Main point (<= 40 characters)",
      "detail": "Optional one-line detail (<= 140 characters)",
      "date": "Optional date as written, only when the text gives one",
      "value": 40,
      "children": [{ "label": "Optional sub-point (<= 40 characters)" }]
    }
  ]
}
"kind" says what KIND of text this is. Pick exactly one:
- "list": a plain set of points with no order.
- "steps": a process or sequence to follow in order.
- "levels": ranked or nested levels, from broad to specific (headings, tiers).
- "cycle": a process that repeats back to its start.
- "parts": the components of one whole.
- "comparison": two or more things compared side by side.
- "timeline": points in time, usually with dates.
- "cause_effect": one thing causes another.
Rules:
- Give 2 to 8 items. Keep every label short.
- If the text is very short or has only one idea, still return at least 2 items: split it into its parts (for example the main subject, its source or link, and what it says).
- Do not invent facts that are not in the text.
- Set "ordered" to true ONLY when the points are steps or a sequence in time.
- When the text gives a number, amount or percentage for a point, put it in "value" as a plain number (40% → 40). Never invent a value.
- Include "children" only when a point genuinely has sub-points.
- "icon" is optional: when a fitting icon exists, use ONE of these exact names, otherwise omit it.
  Allowed icons: ${VISUAL_ICON_NAMES.join(', ')}.
- Do not include any explanation outside the JSON structure.
`.trim();

const OutlineChildSchema = z.object({
  label: z.string().optional(),
});

const OutlineItemSchema = z.object({
  label: z.string().optional(),
  detail: z.string().optional(),
  date: z.string().optional(),
  icon: z.string().optional(),
  color: z.number().optional(),
  value: z.unknown().optional(),
  side: z.unknown().optional(),
  textStyle: z.unknown().optional(),
  // PATCH-274. Read only on the stored-data path; the model path drops it.
  id: z.unknown().optional(),
  children: z.array(OutlineChildSchema).optional(),
});

const OutlineSchema = z.object({
  title: z.string().optional(),
  kind: z.string().optional(),
  ordered: z.boolean().optional(),
  titleStyle: z.unknown().optional(),
  elementOverrides: z.unknown().optional(),
  // PATCH-273. Read only on the stored-data path; the model path drops it.
  elementOverridesByTemplate: z.unknown().optional(),
  // PATCH-272. Read only on the stored-data path; the model path drops it.
  valuesEstimated: z.unknown().optional(),
  items: z.array(OutlineItemSchema).optional(),
});

/**
 * PATCH-272. Which pipeline an outline is being validated for. `'model'`
 * (default) treats every server-only field as untrusted and drops it. `'stored'`
 * treats data the app itself wrote as trusted: `valuesEstimated` (the provenance
 * of AI-estimated numbers) survives, while example flags (`valuesExample` /
 * `valueExample`) are still dropped because examples are never real data.
 */
export interface ParseOutlineOptions {
  source?: 'model' | 'stored';
}

function trimTo(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeItem(raw: z.infer<typeof OutlineItemSchema>, keepId: boolean): VisualOutlineItem | null {
  const label = trimTo(raw.label, OUTLINE_LIMITS.label);
  if (!label) return null;

  const item: VisualOutlineItem = { label };

  // PATCH-274. Stable item ids survive the stored-data path only; the model can
  // never set one.
  if (keepId && isValidItemId(raw.id)) item.id = raw.id;

  const detail = trimTo(raw.detail, OUTLINE_LIMITS.detail);
  if (detail) item.detail = detail;

  const date = trimTo(raw.date, OUTLINE_LIMITS.date);
  if (date) item.date = date;

  // PATCH-237: keep only a listed icon; an unknown one is dropped, never throws.
  if (isVisualIconName(raw.icon)) item.icon = raw.icon;

  // PATCH-240: keep only an integer palette slot 0..5; anything else is dropped.
  if (typeof raw.color === 'number' && Number.isInteger(raw.color) && raw.color >= 0 && raw.color <= 5) {
    item.color = raw.color;
  }

  // PATCH-248: keep only a finite number >= 0; a string like "40%" is dropped.
  if (typeof raw.value === 'number' && Number.isFinite(raw.value) && raw.value >= 0) {
    item.value = raw.value;
  }

  // PATCH-242: keep only a valid side; anything else is dropped, never throws.
  if (raw.side === 'left' || raw.side === 'right') item.side = raw.side;

  // PATCH-244: keep only a validated text style; an empty one is removed.
  const textStyle = sanitizeItemTextStyle(raw.textStyle);
  if (textStyle) item.textStyle = textStyle;

  const children = (raw.children ?? [])
    .map((child) => trimTo(child.label, OUTLINE_LIMITS.label))
    .filter(Boolean)
    .slice(0, OUTLINE_LIMITS.children)
    .map((childLabel) => ({ label: childLabel }));
  if (children.length > 0) item.children = children;

  return item;
}

/**
 * Validates a model's outline, trimming over-long strings rather than failing
 * and dropping empty children. Throws a typed error only when fewer than two
 * usable items remain -- too little to draw anything.
 */
export function parseOutline(raw: unknown, options: ParseOutlineOptions = {}): VisualOutline {
  const parsed = OutlineSchema.safeParse(raw);
  if (!parsed.success) {
    throw new OutlineParseError('The AI outline did not match the expected shape.');
  }

  const data = parsed.data;
  const keepIds = options.source === 'stored';
  const items = (data.items ?? [])
    .map((item) => normalizeItem(item, keepIds))
    .filter((item): item is VisualOutlineItem => item !== null)
    .slice(0, OUTLINE_LIMITS.items);

  if (items.length < OUTLINE_LIMITS.minItems) {
    throw new OutlineParseError('The AI outline needs at least two usable points.');
  }

  const title = trimTo(data.title, OUTLINE_LIMITS.title) || 'Untitled';
  const ordered = data.ordered === true;
  const kind = resolveKind(data.kind, ordered, items);

  // PATCH-244: keep a validated title style; absent when there is none.
  const titleStyle = sanitizeTextStyle(data.titleStyle);

  // PATCH-260: keep only a sanitized override map; absent when there is none.
  const elementOverrides = sanitizeElementOverrides(data.elementOverrides);

  // PATCH-273. Only the stored path treats the per-design map as data the app
  // itself wrote; the model path drops it like the flat slot.
  const elementOverridesByTemplate =
    options.source === 'stored' ? sanitizeElementOverridesByTemplate(data.elementOverridesByTemplate) : undefined;

  // PATCH-272. The stored-data path keeps the server-set estimate provenance;
  // the model path never does.
  const keepValuesEstimated = options.source === 'stored' && data.valuesEstimated === true;

  return {
    title,
    ordered,
    items,
    kind,
    ...(titleStyle ? { titleStyle } : {}),
    ...(elementOverrides ? { elementOverrides } : {}),
    ...(elementOverridesByTemplate ? { elementOverridesByTemplate } : {}),
    ...(keepValuesEstimated ? { valuesEstimated: true } : {}),
  };
}

/**
 * PATCH-250. Returns a NEW outline carrying the estimate flag, without touching
 * the input. The model can never set this flag itself; only the route does, and
 * only when the caller asked for estimated values.
 */
export function withValuesEstimated(outline: VisualOutline): VisualOutline {
  return { ...outline, valuesEstimated: true };
}

/**
 * PATCH-268. True when an AntV suggestion key names a pie chart. The editor uses
 * it for the all-zero-pie save rule; kept here so the oversized editor only
 * carries wiring.
 */
export function isPieChartKey(key: string): boolean {
  const name = key.startsWith('antv:') ? key.slice('antv:'.length) : key;
  return name.startsWith('chart-pie-');
}

/**
 * PATCH-257/268. Returns a NEW outline where every item without a `value` gets
 * an example value, flagged `valueExample: true`, and the outline is flagged
 * `valuesExample: true` (the badge). Items that already have a value keep it
 * (no flag). The input is never mutated.
 *
 * PATCH-268. When at least one real value exists, each missing item gets the
 * rounded mean of the real values (min 1) instead of a share of 100, so a real
 * number is never scaled down to make the examples fit a 100 total. With no
 * real values at all the old equal-share behaviour is kept.
 */
export function withExampleValues(outline: VisualOutline): VisualOutline {
  const existing = outline.items
    .map((item) => item.value)
    .filter((value): value is number => typeof value === 'number');

  if (existing.length > 0) {
    const mean = Math.max(1, Math.round(existing.reduce((sum, value) => sum + value, 0) / existing.length));
    const items = outline.items.map((item) =>
      typeof item.value === 'number' ? item : { ...item, value: mean, valueExample: true as const },
    );
    return { ...outline, items, valuesExample: true };
  }

  const count = outline.items.length;
  const share = count > 0 ? Math.round(100 / count) : 0;
  let assigned = 0;
  let lastMissing = -1;
  outline.items.forEach((item, index) => {
    if (typeof item.value !== 'number') lastMissing = index;
  });
  const items = outline.items.map((item, index) => {
    if (typeof item.value === 'number') return item;
    const value = index === lastMissing ? 100 - assigned : share;
    assigned += value;
    return { ...item, value, valueExample: true as const };
  });
  return { ...outline, items, valuesExample: true };
}

/**
 * PATCH-268. Returns a NEW outline with every example value removed: each item
 * flagged `valueExample` loses BOTH its `value` and the flag, and the
 * outline-level `valuesExample` is dropped. Items the user made real (no flag)
 * are untouched. Identity-preserving when nothing is flagged, and the input is
 * never mutated.
 */
export function withoutExampleValues(outline: VisualOutline): VisualOutline {
  const flagged = outline.valuesExample === true || outline.items.some((item) => item.valueExample === true);
  if (!flagged) return outline;

  const items = outline.items.map((item) => {
    if (item.valueExample !== true) return item;
    const { value: _value, valueExample: _valueExample, ...rest } = item;
    return rest;
  });
  const { valuesExample: _valuesExample, ...rest } = outline;
  return { ...rest, items };
}

/**
 * PATCH-236. A known `kind` wins; a missing or unknown one falls back by rule:
 * a dated ordered outline is a timeline, an ordered one is steps, else a list.
 * Never throws for `kind`.
 */
function resolveKind(raw: unknown, ordered: boolean, items: VisualOutlineItem[]): OutlineKind {
  if (typeof raw === 'string' && (OUTLINE_KINDS as readonly string[]).includes(raw)) {
    return raw as OutlineKind;
  }
  if (ordered && items.some((item) => typeof item.date === 'string' && item.date.length > 0)) {
    return 'timeline';
  }
  if (ordered) return 'steps';
  return 'list';
}
