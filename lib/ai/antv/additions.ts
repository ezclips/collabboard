/**
 * PATCH-262. Shapes, icons and text a user adds ON an AntV picture. Stored with
 * the outline's `elementOverrides` (so every save path carries them), drawn as
 * DOM nodes under one `<g data-ai-additions>`, and keyed `ai-addition@<id>` so
 * the element editor's select/move/resize/colour/delete work on them.
 *
 * Pure data + DOM only: no AntV engine, no React. Constants and sanitize are
 * lenient and never throw.
 */

import { isVisualIconName, type VisualIconName } from '@/lib/ai/visualIcons';
import { VISUAL_PALETTE } from '@/lib/ai/visualPalette';

import type { VisualOutline } from '@/lib/ai/outline';

import { normalizeHex, type ElementOverrides } from './elementOverrides';
import { outlineWithTemplateOverrides, overridesForTemplate } from './templateOverrides';
import { iconNodeChildren, type IconNode } from './icons';

export type AdditionKind =
  | 'rect'
  | 'rounded'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'icon';

export interface Addition {
  /** `/^[a-z0-9]{6,16}$/`. */
  id: string;
  kind: AdditionKind;
  /** ViewBox units, bounded like PATCH-260 (|v| <= 5000, w/h > 0). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** `#rrggbb` lower-case, as PATCH-261. */
  fill?: string;
  stroke?: string;
  text?: string;
  /** kind 'text': <= 200 chars, plain text only. */
  label?: string;
  /** kind 'icon': a listed name. */
  icon?: VisualIconName;
  /** 8..72. */
  fontSize?: number;
}

export const ADDITION_MAX = 50;
export const ADDITION_ID_PATTERN = /^[a-z0-9]{6,16}$/;
export const ADDITION_KEY_PREFIX = 'ai-addition@';
export const ADDITION_TYPE = 'ai-addition';
export const ADDITION_LABEL_MAX = 200;
export const ADDITION_FONT_SIZE_MIN = 8;
export const ADDITION_FONT_SIZE_MAX = 72;
export const ADDITION_TRANSLATE_LIMIT = 5000;
export const DEFAULT_ADDITION_FILL = VISUAL_PALETTE[0].stroke;
export const DEFAULT_ADDITION_TEXT = '#111827';

/** The six shapes plus text and icon, in the Add panel's order. */
export const ADDITION_SHAPES: readonly AdditionKind[] = [
  'rect',
  'rounded',
  'circle',
  'triangle',
  'line',
  'arrow',
];

const ADDITION_KINDS = new Set<string>([...ADDITION_SHAPES, 'text', 'icon']);

const DIMENSIONS: Record<AdditionKind, { w: number; h: number }> = {
  rect: { w: 120, h: 80 },
  rounded: { w: 120, h: 80 },
  circle: { w: 120, h: 80 },
  triangle: { w: 120, h: 80 },
  line: { w: 120, h: 80 },
  arrow: { w: 120, h: 80 },
  text: { w: 200, h: 40 },
  icon: { w: 64, h: 64 },
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

function isBounded(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= ADDITION_TRANSLATE_LIMIT;
}

function isSize(value: unknown): value is number {
  return isBounded(value) && value > 0;
}

function cleanLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, '');
  const trimmed = stripped.trim().slice(0, ADDITION_LABEL_MAX);
  return trimmed.length ? trimmed : undefined;
}

function sanitizeAddition(raw: unknown): Addition | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  if (typeof input.id !== 'string' || !ADDITION_ID_PATTERN.test(input.id)) return undefined;
  if (typeof input.kind !== 'string' || !ADDITION_KINDS.has(input.kind)) return undefined;
  if (!isBounded(input.x) || !isBounded(input.y) || !isSize(input.w) || !isSize(input.h)) return undefined;

  const addition: Addition = {
    id: input.id,
    kind: input.kind as AdditionKind,
    x: input.x,
    y: input.y,
    w: input.w,
    h: input.h,
  };
  const fill = normalizeHex(input.fill);
  if (fill) addition.fill = fill;
  const stroke = normalizeHex(input.stroke);
  if (stroke) addition.stroke = stroke;
  const text = normalizeHex(input.text);
  if (text) addition.text = text;

  if (addition.kind === 'text') {
    const label = cleanLabel(input.label);
    if (label) addition.label = label;
    if (
      typeof input.fontSize === 'number' &&
      Number.isFinite(input.fontSize) &&
      input.fontSize >= ADDITION_FONT_SIZE_MIN &&
      input.fontSize <= ADDITION_FONT_SIZE_MAX
    ) {
      addition.fontSize = input.fontSize;
    }
  } else if (addition.kind === 'icon') {
    if (isVisualIconName(input.icon)) addition.icon = input.icon;
  }
  return addition;
}

/** PATCH-262. Lenient list sanitize: junk entries dropped, at most 50 kept. */
export function sanitizeAdditions(raw: unknown): Addition[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const additions: Addition[] = [];
  for (const entry of raw) {
    if (additions.length >= ADDITION_MAX) break;
    const addition = sanitizeAddition(entry);
    if (addition) additions.push(addition);
  }
  return additions.length ? additions : undefined;
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export function additionKey(id: string): string {
  return `${ADDITION_KEY_PREFIX}${id}`;
}

export function isAdditionKey(key: string | null | undefined): boolean {
  return typeof key === 'string' && key.startsWith(ADDITION_KEY_PREFIX);
}

export function additionIdFromKey(key: string | null | undefined): string | null {
  if (!isAdditionKey(key)) return null;
  const id = (key as string).slice(ADDITION_KEY_PREFIX.length);
  return ADDITION_ID_PATTERN.test(id) ? id : null;
}

/** The addition kind of a drawn addition element, or null for AntV content. */
export function additionKindOf(el: Element): string | null {
  return el.getAttribute('data-ai-addition-kind');
}

/** True for the additions group and everything inside it. */
export function isAdditionSubtree(el: Element | null): boolean {
  let node: Element | null = el;
  while (node) {
    if (node.getAttribute?.('data-ai-addition') !== null || node.getAttribute?.('data-ai-additions') !== null) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function findAdditionByKey(overrides: ElementOverrides | undefined, key: string): Addition | undefined {
  const id = additionIdFromKey(key);
  if (!id) return undefined;
  return (overrides?.additions ?? []).find((addition) => addition.id === id);
}

/** A NEW overrides map with `patch` merged into one addition (never mutates). */
export function updateAddition(
  overrides: ElementOverrides,
  key: string,
  patch: Partial<Addition>,
): ElementOverrides {
  const id = additionIdFromKey(key);
  const current = overrides.additions ?? [];
  if (!id) return overrides;
  return {
    ...overrides,
    additions: current.map((addition) => (addition.id === id ? { ...addition, ...patch } : addition)),
  };
}

/** A NEW overrides map without one addition. */
export function removeAddition(overrides: ElementOverrides, key: string): ElementOverrides {
  const id = additionIdFromKey(key);
  if (!id) return overrides;
  const next = (overrides.additions ?? []).filter((addition) => addition.id !== id);
  const base: ElementOverrides = { ...overrides, additions: next };
  return base;
}

/**
 * PATCH-262. A NEW outline with `addition` appended to this template's
 * `elementOverrides`, keeping any existing per-element overrides.
 */
export function appendAddition(
  outline: VisualOutline,
  template: string,
  addition: Addition,
): VisualOutline {
  const existing = overridesForTemplate(outline, template);
  const current = existing?.additions ?? [];
  if (current.length >= ADDITION_MAX) return outline;
  return outlineWithTemplateOverrides(outline, template, {
    template,
    items: existing ? { ...existing.items } : {},
    additions: [...current, addition],
  });
}

/** A NEW overrides map with one addition's colour reset (an icon keeps a fill). */
export function resetAdditionColour(overrides: ElementOverrides, key: string): ElementOverrides {
  const id = additionIdFromKey(key);
  if (!id) return overrides;
  return {
    ...overrides,
    additions: (overrides.additions ?? []).map((addition) => {
      if (addition.id !== id) return addition;
      const next = { ...addition };
      delete next.fill;
      delete next.stroke;
      delete next.text;
      if (next.kind === 'icon') next.fill = DEFAULT_ADDITION_FILL;
      return next;
    }),
  };
}

// ── Creating ─────────────────────────────────────────────────────────────────

function randomAdditionId(): string {
  const raw = Math.random().toString(36).slice(2).replace(/[^a-z0-9]/g, '');
  return (raw + '000000').slice(0, 10);
}

export interface AdditionOptions {
  id?: string;
  fill?: string;
  stroke?: string;
  text?: string;
  label?: string;
  icon?: VisualIconName;
  fontSize?: number;
}

/**
 * PATCH-262. A new addition centred on `centre` (viewBox units). Shapes are
 * 120x80, an icon 64x64 and text 200x40; shapes take the palette's first colour
 * by default, text takes the theme text colour and no fill.
 */
export function createAddition(
  kind: AdditionKind,
  centre: { x: number; y: number },
  options: AdditionOptions = {},
): Addition {
  const { w, h } = DIMENSIONS[kind];
  const addition: Addition = {
    id: options.id ?? randomAdditionId(),
    kind,
    x: Math.round((centre.x - w / 2) * 1000) / 1000,
    y: Math.round((centre.y - h / 2) * 1000) / 1000,
    w,
    h,
  };
  if (kind === 'text') {
    addition.label = options.label ?? 'Text';
    addition.text = options.text ?? DEFAULT_ADDITION_TEXT;
    addition.fontSize = options.fontSize ?? 18;
  } else if (kind === 'icon') {
    addition.icon = options.icon ?? 'star';
    addition.fill = options.fill ?? DEFAULT_ADDITION_FILL;
  } else {
    addition.fill = options.fill ?? DEFAULT_ADDITION_FILL;
    if (options.stroke) addition.stroke = options.stroke;
  }
  return addition;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function svgEl(doc: Document, tag: string): SVGElement {
  return doc.createElementNS(SVG_NS, tag);
}

function drawIcon(doc: Document, addition: Addition): Element {
  const wrapper = svgEl(doc, 'g');
  const size = 24;
  wrapper.setAttribute(
    'transform',
    `translate(${addition.x} ${addition.y}) scale(${addition.w / size} ${addition.h / size})`,
  );
  const colour = addition.stroke ?? addition.fill ?? DEFAULT_ADDITION_FILL;
  const children: IconNode = iconNodeChildren(addition.icon);
  for (const [tag, attrs] of children) {
    const el = svgEl(doc, tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'key') continue;
      el.setAttribute(name, String(value));
    }
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', colour);
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    wrapper.appendChild(el);
  }
  return wrapper;
}

function drawText(doc: Document, addition: Addition): Element {
  const foreign = svgEl(doc, 'foreignObject');
  foreign.setAttribute('x', String(addition.x));
  foreign.setAttribute('y', String(addition.y));
  foreign.setAttribute('width', String(addition.w));
  foreign.setAttribute('height', String(addition.h));
  const div = doc.createElementNS(XHTML_NS, 'div');
  div.setAttribute('xmlns', XHTML_NS);
  div.style.width = '100%';
  div.style.height = '100%';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.justifyContent = 'center';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordBreak = 'break-word';
  div.style.lineHeight = '1.2';
  div.style.fontSize = `${addition.fontSize ?? 18}px`;
  div.style.color = addition.text ?? DEFAULT_ADDITION_TEXT;
  // textContent, NEVER innerHTML: a label can never become markup.
  div.textContent = addition.label ?? '';
  foreign.appendChild(div);
  return foreign;
}

function drawAddition(doc: Document, addition: Addition): Element {
  const node = svgEl(doc, 'g');
  node.setAttribute('data-ai-addition', addition.id);
  node.setAttribute('data-element-type', ADDITION_TYPE);
  node.setAttribute('data-ai-addition-kind', addition.kind);
  // Fallback geometry (also what `elementLocalBox` reads when getBBox is absent).
  node.setAttribute('x', String(addition.x));
  node.setAttribute('y', String(addition.y));
  node.setAttribute('width', String(addition.w));
  node.setAttribute('height', String(addition.h));

  const fill = addition.fill ?? DEFAULT_ADDITION_FILL;
  const stroke = addition.stroke;

  if (addition.kind === 'icon') {
    node.appendChild(drawIcon(doc, addition));
    return node;
  }
  if (addition.kind === 'text') {
    node.appendChild(drawText(doc, addition));
    return node;
  }

  const x = addition.x;
  const y = addition.y;
  const w = addition.w;
  const h = addition.h;

  if (addition.kind === 'circle') {
    const ellipse = svgEl(doc, 'ellipse');
    ellipse.setAttribute('cx', String(x + w / 2));
    ellipse.setAttribute('cy', String(y + h / 2));
    ellipse.setAttribute('rx', String(w / 2));
    ellipse.setAttribute('ry', String(h / 2));
    ellipse.setAttribute('fill', fill);
    ellipse.setAttribute('stroke', stroke ?? 'none');
    node.appendChild(ellipse);
    return node;
  }

  if (addition.kind === 'triangle') {
    const path = svgEl(doc, 'path');
    path.setAttribute('d', `M ${x + w / 2} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`);
    path.setAttribute('fill', fill);
    path.setAttribute('stroke', stroke ?? 'none');
    node.appendChild(path);
    return node;
  }

  if (addition.kind === 'line' || addition.kind === 'arrow') {
    const line = svgEl(doc, 'line');
    line.setAttribute('x1', String(x));
    line.setAttribute('y1', String(y));
    line.setAttribute('x2', String(x + w));
    line.setAttribute('y2', String(y + h));
    line.setAttribute('stroke', addition.stroke ?? fill);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-linecap', 'round');
    node.appendChild(line);
    if (addition.kind === 'arrow') {
      const head = svgEl(doc, 'path');
      const angle = Math.atan2(h, w);
      const size = 16;
      const ax = x + w;
      const ay = y + h;
      const a1x = ax - size * Math.cos(angle - Math.PI / 6);
      const a1y = ay - size * Math.sin(angle - Math.PI / 6);
      const a2x = ax - size * Math.cos(angle + Math.PI / 6);
      const a2y = ay - size * Math.sin(angle + Math.PI / 6);
      head.setAttribute('d', `M ${a1x} ${a1y} L ${ax} ${ay} L ${a2x} ${a2y}`);
      head.setAttribute('fill', 'none');
      head.setAttribute('stroke', addition.stroke ?? fill);
      head.setAttribute('stroke-width', '3');
      head.setAttribute('stroke-linecap', 'round');
      head.setAttribute('stroke-linejoin', 'round');
      node.appendChild(head);
    }
    return node;
  }

  const rect = svgEl(doc, 'rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', String(h));
  if (addition.kind === 'rounded') {
    const rx = 0.12 * Math.min(w, h);
    rect.setAttribute('rx', String(rx));
    rect.setAttribute('ry', String(rx));
  }
  rect.setAttribute('fill', fill);
  rect.setAttribute('stroke', stroke ?? 'none');
  node.appendChild(rect);
  return node;
}

function findAdditionsGroup(svg: Element): Element | null {
  return Array.from(svg.children).find((child) => child.getAttribute('data-ai-additions') !== null) ?? null;
}

/**
 * PATCH-262. (Re)draws the additions under one group as the topmost picture
 * layer (under AntV's transient overlay when one is present). Idempotent; a
 * removed addition disappears; a missing/other-template map removes the group.
 */
export function applyAdditions(
  root: Element,
  overrides: ElementOverrides | undefined,
  template: string,
): void {
  const svg =
    root.tagName.toLowerCase() === 'svg' ? root : (root.querySelector('svg') as Element | null);
  if (!svg) return;
  const active = overrides && overrides.template === template ? overrides : undefined;
  const additions = active?.additions ?? [];
  const existing = findAdditionsGroup(svg);

  if (additions.length === 0) {
    existing?.remove();
    return;
  }

  const doc = svg.ownerDocument;
  const group = existing ?? svgEl(doc, 'g');
  if (!existing) group.setAttribute('data-ai-additions', '');

  const wanted = new Set(additions.map((addition) => addition.id));
  for (const child of Array.from(group.children)) {
    const id = child.getAttribute('data-ai-addition');
    if (!id || !wanted.has(id)) child.remove();
  }
  for (const addition of additions) {
    const selector = `[data-ai-addition="${addition.id.replace(/"/g, '\\"')}"]`;
    const current = group.querySelector(selector);
    const next = drawAddition(doc, addition);
    if (current) current.replaceWith(next);
    else group.appendChild(next);
  }

  // Keep AntV's transient overlay on top; otherwise the additions group is last.
  const transient = svg.querySelector('[data-element-type="transient-container"]');
  if (transient) svg.insertBefore(group, transient);
  else svg.appendChild(group);
}
