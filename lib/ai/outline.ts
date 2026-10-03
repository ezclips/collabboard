import { z } from 'zod';

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
   * PATCH-242. The side this item was placed on, so adding/removing an item
   * never moves the others. Only the hub design uses it; every other design
   * ignores it. Kept leniently by `parseOutline`.
   */
  side?: VisualSide;
  /** PATCH-244. AntV-toolbar text style, kept only for AntV designs. */
  textStyle?: VisualOutlineItemTextStyle;
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
}

/**
 * PATCH-244. The bounds a stored `fontSize` must fall in. Values outside are
 * dropped rather than rejecting the post.
 */
export const OUTLINE_FONT_SIZE_MIN = 8;
export const OUTLINE_FONT_SIZE_MAX = 72;

/**
 * PATCH-244. The font families AntV's toolbar can set: its five registered
 * faces plus our two system-only stacks (see `antv/setup.ts`). A family outside
 * this list is dropped.
 */
const TEXT_STYLE_FONT_FAMILIES = new Set<string>([
  'Alibaba PuHuiTi',
  'Source Han Sans',
  'Source Han Serif',
  'LXGW WenKai',
  '851tegakizatsu',
  'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  "'Segoe Print', 'Comic Sans MS', 'Bradley Hand', cursive",
]);

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
  if (typeof input.fontFamily === 'string' && TEXT_STYLE_FONT_FAMILIES.has(input.fontFamily)) {
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
  children: z.array(OutlineChildSchema).optional(),
});

const OutlineSchema = z.object({
  title: z.string().optional(),
  kind: z.string().optional(),
  ordered: z.boolean().optional(),
  titleStyle: z.unknown().optional(),
  items: z.array(OutlineItemSchema).optional(),
});

function trimTo(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeItem(raw: z.infer<typeof OutlineItemSchema>): VisualOutlineItem | null {
  const label = trimTo(raw.label, OUTLINE_LIMITS.label);
  if (!label) return null;

  const item: VisualOutlineItem = { label };

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
export function parseOutline(raw: unknown): VisualOutline {
  const parsed = OutlineSchema.safeParse(raw);
  if (!parsed.success) {
    throw new OutlineParseError('The AI outline did not match the expected shape.');
  }

  const data = parsed.data;
  const items = (data.items ?? [])
    .map(normalizeItem)
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

  return {
    title,
    ordered,
    items,
    kind,
    ...(titleStyle ? { titleStyle } : {}),
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
 * PATCH-257. Returns a NEW outline where every item without a `value` gets an
 * equal example share (`round(100 / items.length)`, the last taking the rest so
 * the sum is 100), flagged `valuesExample: true`. Items that already have a
 * value keep it. The input is never mutated.
 */
export function withExampleValues(outline: VisualOutline): VisualOutline {
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
    return { ...item, value };
  });
  return { ...outline, items, valuesExample: true };
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
