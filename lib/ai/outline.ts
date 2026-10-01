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

export interface VisualOutlineItem {
  label: string;
  detail?: string;
  date?: string;
  /** PATCH-237. One icon name from VISUAL_ICON_NAMES, when one fits. */
  icon?: string;
  /** PATCH-240. A palette slot (0..5) overriding the item's index colour. */
  color?: number;
  children?: VisualOutlineChild[];
}

export interface VisualOutline {
  title: string;
  ordered: boolean;
  items: VisualOutlineItem[];
  kind: OutlineKind;
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
- Do not invent facts that are not in the text.
- Set "ordered" to true ONLY when the points are steps or a sequence in time.
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
  children: z.array(OutlineChildSchema).optional(),
});

const OutlineSchema = z.object({
  title: z.string().optional(),
  kind: z.string().optional(),
  ordered: z.boolean().optional(),
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

  return {
    title,
    ordered,
    items,
    kind,
  };
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
