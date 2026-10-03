/**
 * PATCH-261. Applying a per-element colour override to the DOM. Split out of
 * `elementOverrides.ts` (which must stay under the 800-line ceiling): it is pure
 * DOM work, no AntV engine, and keeps AntV's own values in `data-ai-base-*` so a
 * reset or a removed override restores them exactly (idempotent).
 */

import type { ElementOverride } from './elementOverrides';

const BASE_FILL = 'data-ai-base-fill';
const BASE_STROKE = 'data-ai-base-stroke';
const BASE_COLOR = 'data-ai-base-color';

const ICON_TYPES = new Set(['item-icon', 'item-icon-group']);
const TEXT_TYPES = new Set(['title', 'item-label', 'item-value', 'item-desc', 'label', 'desc']);

function styleOf(el: Element): CSSStyleDeclaration | null {
  const styled = el as Element & { style?: CSSStyleDeclaration };
  return styled.style ?? null;
}

/** PATCH-261. An icon (`<use>` or the group around it) draws with currentColor. */
export function isIconElement(el: Element | null): boolean {
  if (!el) return false;
  const type = el.getAttribute('data-element-type');
  return (type !== null && ICON_TYPES.has(type)) || el.tagName.toLowerCase() === 'use';
}

/** PATCH-261. A text element: a `<text>`, a `foreignObject`, or a text type. */
export function isTextElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'text' || tag === 'foreignobject') return true;
  const type = el.getAttribute('data-element-type');
  return type !== null && TEXT_TYPES.has(type);
}

/** Remember AntV's own attribute/colour before the first override touches it. */
function rememberAttr(el: Element, base: string, name: string): void {
  if (el.getAttribute(base) === null) el.setAttribute(base, el.getAttribute(name) ?? '');
}

function restoreAttr(el: Element, base: string, name: string): void {
  const stored = el.getAttribute(base);
  if (stored === null) return;
  if (stored) el.setAttribute(name, stored);
  else el.removeAttribute(name);
  el.removeAttribute(base);
}

function setColourAttr(el: Element, name: 'fill' | 'stroke', value: string): void {
  rememberAttr(el, name === 'fill' ? BASE_FILL : BASE_STROKE, name);
  el.setAttribute(name, value);
}

function restoreColourAttr(el: Element, name: 'fill' | 'stroke'): void {
  restoreAttr(el, name === 'fill' ? BASE_FILL : BASE_STROKE, name);
}

/** CSS `color`, so an icon's inherited `currentColor` resolves to the override. */
function setElementColor(el: Element, value: string): void {
  if (el.getAttribute(BASE_COLOR) === null) el.setAttribute(BASE_COLOR, styleOf(el)?.color ?? '');
  const style = styleOf(el);
  if (style) style.color = value;
}

function restoreElementColor(el: Element): void {
  const stored = el.getAttribute(BASE_COLOR);
  if (stored === null) return;
  const style = styleOf(el);
  if (style) style.color = stored;
  el.removeAttribute(BASE_COLOR);
}

function referencedIconRoots(el: Element): Element[] {
  const uses = el.tagName.toLowerCase() === 'use' ? [el] : Array.from(el.querySelectorAll('use'));
  const roots: Element[] = [];
  for (const use of uses) {
    const href = use.getAttribute('href') ?? use.getAttribute('xlink:href');
    if (!href || !href.startsWith('#')) continue;
    const id = href.slice(1);
    // The sprite may be a document-level element (getElementById) or a `<defs>`
    // inside the picture's own SVG (a detached subtree has no document lookup).
    const target =
      use.ownerDocument?.getElementById(id) ??
      (use as SVGElement).ownerSVGElement?.querySelector(`[id="${id.replace(/"/g, '\\"')}"]`) ??
      null;
    if (target) roots.push(target);
  }
  return roots;
}

/** PATCH-261. A lucide icon draws with `stroke="currentColor"`, so `fill` is its line colour. */
function isStrokeDrawnIcon(el: Element): boolean {
  for (const root of referencedIconRoots(el)) {
    if (root.querySelector('[stroke="currentColor"], [stroke="currentcolor"]')) return true;
  }
  return false;
}

/** The node that actually carries text: the inner node of a foreignObject, or a `<text>`. */
function textTarget(el: Element): Element | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'text') return el;
  if (tag === 'foreignobject') return el.firstElementChild ?? el;
  const foreign = el.querySelector('foreignObject');
  if (foreign) return foreign.firstElementChild ?? foreign;
  const text = el.querySelector('text');
  if (text) return text;
  return el.firstElementChild ?? el;
}

function applyTextColour(el: Element, value: string): void {
  if (!isTextElement(el)) return;
  const target = textTarget(el);
  if (!target) return;
  if (target.tagName.toLowerCase() === 'text') setColourAttr(target, 'fill', value);
  else setElementColor(target, value);
}

function restoreTextColour(el: Element): void {
  if (!isTextElement(el)) return;
  const target = textTarget(el);
  if (!target) return;
  if (target.tagName.toLowerCase() === 'text') restoreColourAttr(target, 'fill');
  else restoreElementColor(target);
}

/** PATCH-261. Apply the fill/stroke/text a `fill`-style override carries. */
export function applyElementColours(el: Element, override: ElementOverride): void {
  const icon = isIconElement(el);
  const stroke = override.stroke ?? (icon && override.fill && isStrokeDrawnIcon(el) ? override.fill : undefined);

  if (override.fill) {
    setColourAttr(el, 'fill', override.fill);
    if (icon) setElementColor(el, override.fill);
  } else {
    restoreColourAttr(el, 'fill');
    if (icon) restoreElementColor(el);
  }

  if (stroke) setColourAttr(el, 'stroke', stroke);
  else restoreColourAttr(el, 'stroke');

  if (override.text) applyTextColour(el, override.text);
  else restoreTextColour(el);
}

/** Put every colour we may have set back to AntV's own value. */
export function restoreElementColours(el: Element): void {
  restoreColourAttr(el, 'fill');
  restoreColourAttr(el, 'stroke');
  restoreElementColor(el);
  restoreTextColour(el);
}
