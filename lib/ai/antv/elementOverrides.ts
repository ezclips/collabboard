/**
 * PATCH-260. Per-element overrides for an AntV picture: a small, pure record of
 * how the user moved, resized or deleted ONE element, stored INSIDE the outline
 * (`VisualOutline.elementOverrides`) so every existing save path carries it.
 *
 * The model never sets this: the outline route strips whatever it returns. The
 * renderer applies it after every draw; the editor writes it on each commit.
 * Nothing here depends on the AntV engine at runtime -- only on the DOM shape
 * AntV happens to draw (`data-element-type` / `data-indexes`).
 */

import type { VisualOutline } from '@/lib/ai/outline';

import {
  ADDITION_ID_PATTERN,
  ADDITION_KEY_PREFIX,
  ADDITION_TYPE,
  applyAdditions,
  isAdditionSubtree,
  sanitizeAdditions,
  type Addition,
} from './additions';
import { applyElementColours, restoreElementColours } from './elementColours';

export interface ElementOverride {
  /** Translation in viewBox units, |v| <= 5000. */
  dx?: number;
  dy?: number;
  /** Scale around the element's own top-left, 0.1..10. */
  sx?: number;
  sy?: number;
  /** Deleted. */
  hidden?: true;
  /** PATCH-261. The element's fill, `#rrggbb` lower-case. */
  fill?: string;
  /** PATCH-261. The element's stroke (border / icon line), `#rrggbb`. */
  stroke?: string;
  /** PATCH-261. The element's text colour, `#rrggbb`. */
  text?: string;
}

/** The named template these overrides belong to; `<= 300` keys. */
export interface ElementOverrides {
  template: string;
  items: Record<string, ElementOverride>;
  /** PATCH-262. Shapes/icons/text drawn on top; at most 50. */
  additions?: Addition[];
}

export const ELEMENT_OVERRIDE_MAX_KEYS = 300;
export const ELEMENT_TRANSLATE_LIMIT = 5000;
export const ELEMENT_SCALE_MIN = 0.1;
export const ELEMENT_SCALE_MAX = 10;

const TEMPLATE_MAX = 120;

/**
 * PATCH-260. The stable shape of an element key: `type`, an optional `@indexes`
 * and an optional `#ordinal`. Lenient by design -- sanitize never throws.
 */
export const ELEMENT_OVERRIDE_KEY_PATTERN = /^[a-z-]{1,40}(@[0-9]{1,3}(,[0-9]{1,3}){0,3})?(#[0-9]{1,4})?$/;

const INDEXES_PATTERN = /^[0-9]+(,[0-9]+)*$/;

const HEX6_PATTERN = /^#[0-9a-f]{6}$/;
const HEX3_PATTERN = /^#[0-9a-f]{3}$/;

/**
 * PATCH-261. A plain hex colour (`#rgb` / `#rrggbb`, any case) to the stored
 * lower-case `#rrggbb`, or `undefined` for anything else (`red`, `url(x)`,
 * `#12`, `#1234567`). Never throws.
 */
export function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase();
  if (HEX6_PATTERN.test(trimmed)) return trimmed;
  if (HEX3_PATTERN.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return undefined;
}

function isTranslation(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= ELEMENT_TRANSLATE_LIMIT;
}

function isScale(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= ELEMENT_SCALE_MIN && value <= ELEMENT_SCALE_MAX;
}

function sanitizeOverride(raw: unknown): ElementOverride | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  const override: ElementOverride = {};
  if (isTranslation(input.dx)) override.dx = input.dx;
  if (isTranslation(input.dy)) override.dy = input.dy;
  if (isScale(input.sx)) override.sx = input.sx;
  if (isScale(input.sy)) override.sy = input.sy;
  if (input.hidden === true) override.hidden = true;
  const fill = normalizeHex(input.fill);
  if (fill) override.fill = fill;
  const stroke = normalizeHex(input.stroke);
  if (stroke) override.stroke = stroke;
  const text = normalizeHex(input.text);
  if (text) override.text = text;
  return Object.keys(override).length ? override : undefined;
}

/**
 * PATCH-260. Validates stored overrides leniently: a real `template` string, a
 * map of keys matching `ELEMENT_OVERRIDE_KEY_PATTERN` with finite in-bounds
 * numbers. Unknown fields are dropped, junk keys skipped, at most 300 kept.
 * An empty (or unusable) result is `undefined`; it never throws.
 */
export function sanitizeElementOverrides(raw: unknown): ElementOverrides | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const input = raw as { template?: unknown; items?: unknown };
  if (typeof input.template !== 'string') return undefined;
  const template = input.template.trim().slice(0, TEMPLATE_MAX);
  if (!template) return undefined;
  if (!input.items || typeof input.items !== 'object' || Array.isArray(input.items)) return undefined;

  const source = input.items as Record<string, unknown>;
  const items: Record<string, ElementOverride> = {};
  let kept = 0;
  for (const key of Object.keys(source)) {
    if (kept >= ELEMENT_OVERRIDE_MAX_KEYS) break;
    if (!ELEMENT_OVERRIDE_KEY_PATTERN.test(key)) continue;
    const override = sanitizeOverride(source[key]);
    if (!override) continue;
    items[key] = override;
    kept += 1;
  }
  // PATCH-262. Additions live beside the per-element overrides and are enough
  // on their own to keep the map.
  const additions = sanitizeAdditions((input as { additions?: unknown }).additions);
  if (kept === 0 && !additions) return undefined;
  return additions ? { template, items, additions } : { template, items };
}

/** PATCH-260. A NEW outline without `elementOverrides` (never mutates input). */
export function withoutElementOverrides(outline: VisualOutline): VisualOutline {
  if (outline.elementOverrides === undefined) return outline;
  const next: VisualOutline = { ...outline };
  delete next.elementOverrides;
  return next;
}

/**
 * PATCH-260. A NEW outline carrying `overrides`. An empty/absent map removes the
 * field, so a reset outline is indistinguishable from one never changed.
 */
export function outlineWithOverrides(
  outline: VisualOutline,
  overrides: ElementOverrides | undefined,
): VisualOutline {
  const clean = withoutElementOverrides(outline);
  const empty =
    !overrides ||
    (Object.keys(overrides.items).length === 0 && (overrides.additions?.length ?? 0) === 0);
  if (empty) return clean;
  return { ...clean, elementOverrides: overrides };
}

// ── Keys ─────────────────────────────────────────────────────────────────────

/** Element types that are never separately selectable. */
const NON_SELECTABLE_TYPES = new Set(['background', 'items-group', 'btns-group', 'btn-icon-defs']);

function isNonSelectableType(type: string): boolean {
  return NON_SELECTABLE_TYPES.has(type) || type.startsWith('btn-');
}

/**
 * PATCH-261 fix. AntV's editor appends its own overlay group
 * (`<g data-element-type="transient-container">`, the selection/hover highlight
 * rects) to the picture's svg. It is not part of the picture: it and everything
 * inside it is never selectable or keyed, and the keying passes skip the whole
 * subtree so real keys never shift when AntV adds or removes it.
 */
const TRANSIENT_CONTAINER_TYPE = 'transient-container';

export function isTransientElement(el: Element | null): boolean {
  let node: Element | null = el;
  while (node) {
    if (node.getAttribute?.('data-element-type') === TRANSIENT_CONTAINER_TYPE) return true;
    node = node.parentElement;
  }
  return false;
}

function validIndexesValue(raw: string | null): string | null {
  return raw && INDEXES_PATTERN.test(raw) ? raw : null;
}

function ownIndexes(el: Element): string | null {
  return validIndexesValue(el.getAttribute('data-indexes'));
}

/**
 * PATCH-260, defect 2. True when an element can carry its own key. Icons
 * (`item-icon`) inside an `item-icon-group` ARE selectable now: their client
 * rect is 0x0, but `elementScreenBox` reads real SVG geometry for them.
 */
export function isSelectableElement(el: Element): boolean {
  const type = el.getAttribute('data-element-type');
  return Boolean(type) && !isNonSelectableType(type as string) && !isTransientElement(el);
}

/**
 * PATCH-260. The nearest ancestor scope that holds exactly ONE item's indexes
 * (the item group around a label), or `null` when the element sits at the root
 * next to several items (a title, a pie slice).
 */
/** The distinct item indexes carried by any descendant of `node`. */
function distinctIndexes(node: Element): Set<string> {
  const distinct = new Set<string>();
  for (const candidate of Array.from(node.querySelectorAll('[data-indexes]'))) {
    if (isTransientElement(candidate)) continue;
    const value = ownIndexes(candidate);
    if (value) distinct.add(value);
    if (distinct.size > 1) break;
  }
  return distinct;
}

/**
 * The scope a per-item wrapper gives: the nearest ancestor that carries one
 * index itself, or whose subtree carries exactly one distinct index. `multi`
 * is true when the walk stopped at a common ancestor holding SEVERAL items
 * (e.g. the flat `items-group` of `list-grid-badge-card`).
 */
function scanItemScope(el: Element, root: Element): { scope: string | null; multi: boolean } {
  let node: Element | null = el.parentElement;
  while (node && node !== root) {
    const own = ownIndexes(node);
    if (own) return { scope: own, multi: false };
    const distinct = distinctIndexes(node);
    if (distinct.size === 1) return { scope: [...distinct][0], multi: false };
    if (distinct.size > 1) return { scope: null, multi: true };
    node = node.parentElement;
  }
  return { scope: null, multi: false };
}

/**
 * PATCH-260, defect 3. In a FLAT layout the items are siblings under one group,
 * so an unindexed shape carries no scope of its own; assign it to the next
 * indexed element in document order (the card it belongs to). Anything that is
 * not a shape (a title, a line) stays scope-less and selects individually.
 */
function nextIndexesAfter(el: Element, root: Element): string | null {
  const all = Array.from(root.querySelectorAll('[data-element-type]'));
  for (let i = all.indexOf(el) + 1; i < all.length; i += 1) {
    if (isTransientElement(all[i])) continue;
    const value = ownIndexes(all[i]);
    if (value) return value;
  }
  return null;
}

/**
 * PATCH-260, defect 3. The item an element belongs to: its own `data-indexes`
 * when it has them; else its per-item wrapper's index; else, for an unindexed
 * shape in a flat group, the item whose indexed elements follow it. `null` for
 * a title, a pie slice or a line outside any item.
 */
export function elementItemScope(el: Element, root: Element): string | null {
  // PATCH-262. An addition belongs to no item, even though the picture's single
  // item-index set is an ancestor of it.
  if (el.getAttribute('data-element-type') === ADDITION_TYPE) return null;
  const own = ownIndexes(el);
  if (own) return own;
  const scan = scanItemScope(el, root);
  if (scan.scope) return scan.scope;
  if (scan.multi && el.getAttribute('data-element-type') === 'shape') {
    return nextIndexesAfter(el, root);
  }
  return null;
}

/** PATCH-260. Position of an unindexed element among its own type and scope. */
function unindexedOrdinal(el: Element, root: Element, type: string, scope: string | null): number {
  let ordinal = 0;
  for (const candidate of Array.from(root.querySelectorAll(`[data-element-type="${type}"]`))) {
    if (candidate === el) return ordinal;
    if (!isSelectableElement(candidate)) continue;
    if (ownIndexes(candidate)) continue;
    if (elementItemScope(candidate, root) === scope) ordinal += 1;
  }
  return ordinal;
}

/**
 * PATCH-260. The stable name of an AntV element (or `null` when it is never
 * selectable):
 *   - with `data-indexes` -> `type@indexes`, `#n` when several share it;
 *   - without -> its item scope -> `type@scope#n`;
 *   - otherwise -> `type#n`, its global document-order ordinal.
 */
export function elementKey(
  el: Element,
  root: Element = (el as SVGElement).ownerSVGElement ?? el,
): string | null {
  const type = el.getAttribute('data-element-type');
  if (!type || !isSelectableElement(el)) return null;

  // PATCH-262. An addition is keyed by its own stable id, not by numeric
  // indexes, so the same id round-trips through save/reload.
  if (type === ADDITION_TYPE) {
    const id = el.getAttribute('data-ai-addition');
    return id && ADDITION_ID_PATTERN.test(id) ? `${ADDITION_KEY_PREFIX}${id}` : null;
  }

  const own = ownIndexes(el);
  if (own) {
    const base = `${type}@${own}`;
    const same = Array.from(root.querySelectorAll(`[data-element-type="${type}"][data-indexes="${own}"]`)).filter(
      (candidate) => !isTransientElement(candidate),
    );
    if (same.length <= 1) return base;
    const ordinal = same.indexOf(el);
    return ordinal >= 0 ? `${base}#${ordinal}` : base;
  }

  const scope = elementItemScope(el, root);
  const base = scope ? `${type}@${scope}` : type;
  return `${base}#${unindexedOrdinal(el, root, type, scope)}`;
}

/**
 * PATCH-260, defect 3. Every selectable key of an item, OUTERMOST first: an
 * element nested inside another member of the same scope is skipped, so a move
 * is never applied twice to a child that already rides its parent's transform.
 */
export function itemMemberKeys(scope: string, root: Element): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const el of Array.from(root.querySelectorAll('[data-element-type]'))) {
    if (!isSelectableElement(el)) continue;
    if (elementItemScope(el, root) !== scope) continue;

    let nested = false;
    let node = el.parentElement;
    while (node && node !== root) {
      if (isSelectableElement(node) && elementItemScope(node, root) === scope) {
        nested = true;
        break;
      }
      node = node.parentElement;
    }
    if (nested) continue;

    const key = elementKey(el, root);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

// ── Applying ─────────────────────────────────────────────────────────────────

function overrideTransform(el: Element, override: ElementOverride): string {
  const dx = override.dx ?? 0;
  const dy = override.dy ?? 0;
  const sx = override.sx ?? 1;
  const sy = override.sy ?? 1;
  const { x, y } = baseTopLeft(el);
  return `translate(${dx} ${dy}) translate(${x} ${y}) scale(${sx} ${sy}) translate(${-x} ${-y})`;
}

/**
 * PATCH-260, defect 7.1. The element's top-left in its OWN base state. In Chrome
 * `getBBox()` of a `<rect>` returns its x/y/width/height in the element's own
 * user space and IGNORES its own `transform`, so `elementLocalBox` is always the
 * base geometry. We read it fresh (no cache: a cached value could go stale after
 * a reload or an AntV re-render that drops the attributes).
 */
function baseTopLeft(el: Element): { x: number; y: number } {
  const box = elementLocalBox(el);
  return box ? { x: box.x, y: box.y } : { x: 0, y: 0 };
}

function styleOf(el: Element): CSSStyleDeclaration | null {
  const styled = el as Element & { style?: CSSStyleDeclaration };
  return styled.style ?? null;
}

/** PATCH-260. Put an element back to AntV's own transform / visibility / colours. */
function restoreElement(el: Element): void {
  const base = el.getAttribute('data-ai-base-transform');
  if (base !== null) {
    if (base) el.setAttribute('transform', base);
    else el.removeAttribute('transform');
  }
  if (el.getAttribute('data-ai-element-hidden') !== null) {
    const style = styleOf(el);
    if (style) style.display = '';
    el.removeAttribute('data-ai-element-hidden');
  }
  restoreElementColours(el);
}

/**
 * PATCH-260. Applies `overrides` to every matching element of `root`, in place.
 * Only elements get a transform when the template matches; either way every
 * keyable element is stamped with `data-ai-element-key` so the live DOM shows
 * exactly which key the renderer computes. The element's original transform is
 * kept in `data-ai-base-transform` and composed with ours, so applying twice
 * gives the same DOM (idempotent). Removed/unknown keys restore the base, and a
 * missing/other-template map restores every element we previously touched.
 */
export function applyElementOverrides(
  root: Element,
  overrides: ElementOverrides | undefined,
  template: string,
): void {
  const active = overrides && overrides.template === template ? overrides : undefined;

  for (const el of Array.from(root.querySelectorAll('[data-element-type]'))) {
    // PATCH-261 fix. AntV's editor overlay is not part of the picture: never
    // stamp or touch it (nor anything inside it).
    if (isTransientElement(el)) continue;
    // PATCH-262. Additions have their own renderer below; never treat them as
    // AntV elements (that would clobber the shape we just drew).
    if (isAdditionSubtree(el)) continue;
    const key = elementKey(el, root);
    if (key) el.setAttribute('data-ai-element-key', key);

    if (!active || !key) {
      restoreElement(el);
      continue;
    }
    const override = active.items[key];
    if (!override) {
      restoreElement(el);
      continue;
    }

    if (el.getAttribute('data-ai-base-transform') === null) {
      el.setAttribute('data-ai-base-transform', el.getAttribute('transform') ?? '');
    }

    if (override.hidden) {
      const style = styleOf(el);
      if (style) style.display = 'none';
      el.setAttribute('data-ai-element-hidden', '');
      continue;
    }

    const style = styleOf(el);
    if (el.getAttribute('data-ai-element-hidden') !== null) {
      if (style) style.display = '';
      el.removeAttribute('data-ai-element-hidden');
    }
    const base = el.getAttribute('data-ai-base-transform') ?? '';
    const composed = overrideTransform(el, override);
    el.setAttribute('transform', base ? `${base} ${composed}` : composed);
    applyElementColours(el, override);
  }

  // PATCH-262. Additions are a separate top layer, redrawn after every pass.
  applyAdditions(root, overrides, template);
}

// ── Geometry shared with the editor (still DOM-only, no React) ───────────────

export type ElementHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ViewBoxPoint {
  x: number;
  y: number;
}

/**
 * PATCH-260. Screen point -> viewBox units through the SVG's own screen CTM.
 * Falls back to the raw screen point when there is no CTM (jsdom / detached).
 */
export function screenToViewBox(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): ViewBoxPoint {
  if (!svg) return { x: clientX, y: clientY };
  const withCtm = svg as unknown as { getScreenCTM?: () => DOMMatrix | null };
  if (typeof withCtm.getScreenCTM !== 'function') return { x: clientX, y: clientY };

  let ctm: DOMMatrix | null = null;
  try {
    ctm = withCtm.getScreenCTM();
  } catch {
    ctm = null;
  }
  if (!ctm) return { x: clientX, y: clientY };

  let inverse: DOMMatrix = ctm;
  try {
    if (typeof ctm.inverse === 'function') inverse = ctm.inverse();
  } catch {
    inverse = ctm;
  }
  return {
    x: inverse.a * clientX + inverse.c * clientY + inverse.e,
    y: inverse.b * clientX + inverse.d * clientY + inverse.f,
  };
}

export interface ElementBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Local (user-space) box from getBBox, else from x/y/width/height attributes. */
export function elementLocalBox(el: Element): ElementBox | null {
  const withBox = el as unknown as {
    getBBox?: () => { x: number; y: number; width: number; height: number };
  };
  if (typeof withBox.getBBox === 'function') {
    try {
      const box = withBox.getBBox();
      const finite = [box.x, box.y, box.width, box.height].every((value) => Number.isFinite(value));
      // Defect 6.3: a `<use>` reports a finite but EMPTY 0x0 bbox in Chrome, so a
      // zero-area box must fall through to the x/y/width/height attributes.
      if (finite && box.width > 0 && box.height > 0) {
        return { x: box.x, y: box.y, w: box.width, h: box.height };
      }
    } catch {
      /* jsdom has no getBBox: fall through to the attributes. */
    }
  }
  const number = (name: string): number | null => {
    const raw = el.getAttribute(name);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const x = number('x');
  const y = number('y');
  const w = number('width');
  const h = number('height');
  if (x === null || y === null || w === null || h === null) return null;
  return { x, y, w, h };
}

type Matrix2D = { a: number; b: number; c: number; d: number; e: number; f: number };

function screenCtm(el: Element): Matrix2D | null {
  const withCtm = el as unknown as { getScreenCTM?: () => DOMMatrix | null };
  if (typeof withCtm.getScreenCTM === 'function') {
    try {
      const matrix = withCtm.getScreenCTM();
      if (matrix) return matrix;
    } catch {
      /* detached / jsdom. */
    }
  }
  const svg = (el as SVGElement).ownerSVGElement;
  const svgCtm = svg as unknown as { getScreenCTM?: () => DOMMatrix | null } | null;
  if (svgCtm && typeof svgCtm.getScreenCTM === 'function') {
    try {
      return svgCtm.getScreenCTM();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * PATCH-260, defect 2. An element's box in SCREEN pixels, from its SVG geometry
 * (getBBox -> getScreenCTM), so elements with a 0x0 client rect (icons, `<use>`)
 * still measure. Falls back to getBoundingClientRect, then to nothing.
 */
export function elementScreenBox(el: Element): ScreenBox | null {
  const box = elementLocalBox(el);
  const ctm = screenCtm(el);
  if (box && ctm) {
    const xs: number[] = [];
    const ys: number[] = [];
    const corners: Array<[number, number]> = [
      [box.x, box.y],
      [box.x + box.w, box.y],
      [box.x, box.y + box.h],
      [box.x + box.w, box.y + box.h],
    ];
    for (const [x, y] of corners) {
      xs.push(ctm.a * x + ctm.c * y + ctm.e);
      ys.push(ctm.b * x + ctm.d * y + ctm.f);
    }
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  if (typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
  }
  return null;
}

/**
 * PATCH-260, defect 7.1. The element's base box (its own user-space geometry),
 * read fresh from `elementLocalBox`. Chrome's `getBBox` ignores the element's own
 * transform, so this is the original geometry even after a move/scale.
 */
export function elementBaseBox(el: Element): ElementBox {
  return elementLocalBox(el) ?? { x: 0, y: 0, w: 0, h: 0 };
}

/** PATCH-260, defect 3. The union of several screen boxes (an item's box). */
export function unionScreenBoxes(boxes: Array<ScreenBox | null>): ScreenBox | null {
  const present = boxes.filter((box): box is ScreenBox => box !== null);
  if (present.length === 0) return null;
  const left = Math.min(...present.map((box) => box.left));
  const top = Math.min(...present.map((box) => box.top));
  const right = Math.max(...present.map((box) => box.left + box.width));
  const bottom = Math.max(...present.map((box) => box.top + box.height));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * PATCH-260, defect 4.2. The keyable element under a screen point, choosing the
 * one with the SMALLEST SVG box among those that contain it (ties: the later one
 * in document order). A big title `foreignObject` that covers the whole item
 * area therefore loses to the small icon/label under the pointer.
 */
export function elementAtPoint(root: Element, clientX: number, clientY: number): Element | null {
  let best: Element | null = null;
  let bestArea = Infinity;
  for (const el of Array.from(root.querySelectorAll('[data-element-type]'))) {
    if (!isSelectableElement(el)) continue;
    if (!elementKey(el, root)) continue;
    const box = elementScreenBox(el);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    if (clientX < box.left || clientX > box.left + box.width) continue;
    if (clientY < box.top || clientY > box.top + box.height) continue;
    const area = box.width * box.height;
    if (area <= bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

export interface ResizeMember {
  key: string;
  baseBox: ElementBox;
  override: ElementOverride;
}

export interface GroupResizeInput {
  handle: ElementHandle;
  /** The selected group's on-screen box at pointerdown, in px. */
  startScreenBox: { width: number; height: number };
  /** Screen px moved since pointerdown. */
  delta: { dx: number; dy: number };
  members: ResizeMember[];
  /** 8 px. */
  minScreenSize: number;
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(value, ELEMENT_SCALE_MIN), ELEMENT_SCALE_MAX);
}

/**
 * PATCH-260, defect 1. The per-axis scale an edge/corner drag produces, from the
 * SCREEN pointer delta: each dragged edge follows the pointer, so the new
 * on-screen size is the old size plus the delta. Shared by `resizeOverrides` and
 * the editor's live box.
 */
export function resizeFactors(
  handle: ElementHandle,
  startW: number,
  startH: number,
  delta: { dx: number; dy: number },
  minScreenSize: number,
): { fx: number; fy: number } {
  const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw';
  const movesRight = handle === 'ne' || handle === 'e' || handle === 'se';
  const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne';
  const movesBottom = handle === 'sw' || handle === 's' || handle === 'se';
  const hasX = movesLeft || movesRight;
  const hasY = movesTop || movesBottom;

  let left = 0;
  let right = startW;
  let top = 0;
  let bottom = startH;
  if (movesLeft) left += delta.dx;
  if (movesRight) right += delta.dx;
  if (movesTop) top += delta.dy;
  if (movesBottom) bottom += delta.dy;

  let fx = hasX && startW > 0 ? Math.abs(right - left) / startW : 1;
  let fy = hasY && startH > 0 ? Math.abs(bottom - top) / startH : 1;
  if (hasX && startW > 0) fx = Math.max(fx, minScreenSize / startW);
  if (hasY && startH > 0) fy = Math.max(fy, minScreenSize / startH);
  return { fx: clampScale(fx), fy: clampScale(fy) };
}

/**
 * PATCH-260, defect 8. The overrides a resize drag should produce. The scale
 * factor comes from the SCREEN delta (exact at any zoom), but the dx/dy
 * compensation is derived in the ELEMENT'S OWN USER SPACE from the composed
 * matrix, never from a screen/root-space box:
 *   - right/bottom handles (`e`, `s`, `se`) keep the left/top edge fixed, so
 *     dx/dy do NOT change at all — the base-box pivot already holds the corner;
 *   - left/top handles (`w`, `n`, `nw`, `ne`, `sw`) keep the opposite edge
 *     fixed: `dx_new = dx + w*(sx_old - sx_new)` (and the y analogue), derived
 *     from the user-space width/height, not a screen box.
 */
export function resizeOverrides(input: GroupResizeInput): Record<string, ElementOverride> {
  const { handle, startScreenBox, delta, members, minScreenSize } = input;
  const { fx, fy } = resizeFactors(handle, startScreenBox.width, startScreenBox.height, delta, minScreenSize);

  const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw';
  const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne';

  const out: Record<string, ElementOverride> = {};
  for (const m of members) {
    const sx0 = m.override.sx ?? 1;
    const sy0 = m.override.sy ?? 1;
    const sx = clampScale(sx0 * fx);
    const sy = clampScale(sy0 * fy);
    const next: ElementOverride = { ...m.override, sx, sy };
    // The opposite edge stays fixed. Right/bottom handles never move dx/dy, so
    // they keep the base value explicitly (0 when the element had no move yet).
    next.dx = m.override.dx ?? 0;
    next.dy = m.override.dy ?? 0;
    if (movesLeft) next.dx = (m.override.dx ?? 0) + m.baseBox.w * (sx0 - sx);
    if (movesTop) next.dy = (m.override.dy ?? 0) + m.baseBox.h * (sy0 - sy);
    out[m.key] = next;
  }
  return out;
}
