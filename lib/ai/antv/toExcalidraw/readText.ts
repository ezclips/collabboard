/**
 * PATCH-278 A.2. The reader's shared plumbing and text handling, split out of
 * `readSvgScene.ts` to keep each file under the 400-line folder ceiling.
 * Behaviour is unchanged: this is the same walk, the same id/group/skip bookkeeping,
 * and the same Addendum-2 "read the inner text host" rule.
 */

import { attr, lower, num, resolveProperty, type PaintState } from './readPaint';
import type { SceneElement, ScenePoint, SceneSkip, SceneSkipReason, SceneTextAlign } from './scene';

export interface ReaderState extends PaintState {
  pictureGroup: string;
  elements: SceneElement[];
  skips: SceneSkip[];
  visibleShapes: number;
  resolvableIcons: number;
  counter: number;
}

export function nextId(state: ReaderState): string {
  const id = `e${state.counter}`;
  state.counter += 1;
  return id;
}

export function parseIndexes(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length === 0 || parts.some((value) => !Number.isInteger(value) || value < 0)) {
    return undefined;
  }
  return parts;
}

export function nearestIndexes(el: Element, root: Element): number[] | undefined {
  let node: Element | null = el;
  while (node && node !== root.parentElement) {
    const parsed = parseIndexes(node.getAttribute('data-indexes'));
    if (parsed) return parsed;
    if (node === root) break;
    node = node.parentElement;
  }
  return undefined;
}

export function recordSkip(state: ReaderState, el: Element, reason: SceneSkipReason): void {
  state.skips.push({ id: nextId(state), tag: lower(el), reason, indexes: nearestIndexes(el, state.root) });
}

export function groupIdsFor(state: ReaderState, el: Element): string[] {
  const indexes = nearestIndexes(el, state.root);
  return indexes ? [`item:${indexes.join(',')}`, state.pictureGroup] : [state.pictureGroup];
}

export function sourceOf(state: ReaderState, el: Element): SceneElement['source'] {
  const indexes = nearestIndexes(el, state.root);
  return indexes ? { tag: lower(el), indexes } : { tag: lower(el) };
}

function textString(el: Element): string {
  if (lower(el) === 'foreignobject') {
    const node = el as HTMLElement;
    const inner = typeof node.innerText === 'string' ? node.innerText : (node.textContent ?? '');
    return inner
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }
  const tspans = Array.from(el.querySelectorAll('tspan'));
  if (tspans.length === 0) return (el.textContent ?? '').trim();
  const lines: string[] = [];
  let lastY: string | null = null;
  let current = '';
  for (const tspan of tspans) {
    const y = tspan.getAttribute('y') ?? tspan.getAttribute('dy');
    if (lastY !== null && y !== null && y !== lastY) {
      lines.push(current.trim());
      current = '';
    }
    current += tspan.textContent ?? '';
    if (y !== null) lastY = y;
  }
  lines.push(current.trim());
  return lines.map((line) => line.replace(/\s+/g, ' ')).filter(Boolean).join('\n');
}

function alignOf(el: Element, style: CSSStyleDeclaration): SceneTextAlign {
  const raw = lower(el) === 'text' ? attr(el, 'text-anchor') ?? style.textAnchor : style.textAlign;
  const value = (raw ?? '').toLowerCase();
  if (value === 'middle' || value === 'center') return 'center';
  if (value === 'end' || value === 'right') return 'right';
  return 'left';
}

/**
 * Addendum 2. The style the FIRST inner text node actually carries. AntV
 * foreignObjects put font-size/colour/weight on an HTML element INSIDE the
 * foreignObject, so reading the foreignObject's own computed style only sees
 * inherited defaults (16px, black). For SVG `<text>` the same applies across
 * `<tspan>`s, so the first tspan's computed style is preferred when present.
 */
function firstTextStyle(
  state: ReaderState,
  el: Element,
): { style: CSSStyleDeclaration; mixed: boolean } {
  const host = state.geometry.firstTextHost(el);
  const base = state.geometry.style(el);
  const style = host && host !== el ? state.geometry.style(host) : base;
  return { style, mixed: stylesDisagree(state, el, host) };
}

const INNER_TEXT_SELECTOR = 'span, div, p, b, strong, i, em, a, tspan';

/** True when the inner text hosts disagree on font-size or colour. */
function stylesDisagree(state: ReaderState, el: Element, firstHost: Element | null): boolean {
  if (!firstHost || firstHost === el) return false;
  const hosts = Array.from(el.querySelectorAll(INNER_TEXT_SELECTOR)).filter(
    (node) => (node.textContent ?? '').trim().length > 0,
  );
  if (hosts.length <= 1) return false;
  const first = state.geometry.style(firstHost);
  const signature = (s: CSSStyleDeclaration) => `${s.fontSize}|${s.color}|${s.fontWeight}`;
  const base = signature(first);
  return hosts.some((host) => signature(state.geometry.style(host)) !== base);
}

export function emitText(
  state: ReaderState,
  el: Element,
  style: CSSStyleDeclaration,
  alphaBase: number,
): void {
  const text = textString(el);
  if (!text) return;
  const box = state.geometry.textBox(el, state.root);
  if (!box || box.width <= 0 || box.height <= 0) {
    recordSkip(state, el, 'hidden');
    return;
  }
  const svgText = lower(el) === 'text';
  // Addendum 2: for a `foreignObject` the size/colour live on the INNER HTML
  // element, so read that (first text host). For SVG `<text>` keep the current
  // behaviour (the `<text>` computed style, attributes included). `mixed`
  // records inner nodes that disagree.
  const { style: inner, mixed } = firstTextStyle(state, el);
  const effective = !svgText && inner !== style ? inner : style;
  const scale = state.geometry.scale(el, state.root);
  const fontSize = Math.max(1, Math.round(num(effective.fontSize, 16) * scale * 2) / 2);
  const colorRaw = svgText
    ? attr(el, 'fill') ?? effective.fill ?? effective.color
    : effective.color;
  const color = resolveProperty(state, colorRaw, alphaBase).color;
  if (color === 'none') {
    recordSkip(state, el, 'invisible');
    return;
  }
  const family = (effective.fontFamily ?? '').toLowerCase();
  const monospace = /mono|consol|courier|cascadia|menlo/.test(family);
  const lostWeight = num(effective.fontWeight, 400) >= 600;
  const lostStyle = /italic|oblique/.test((effective.fontStyle ?? '').toLowerCase());
  if (lostWeight) state.losses.lostFontWeight += 1;
  if (lostStyle) state.losses.lostFontStyle += 1;
  if (mixed) state.losses.mixedTextStyle += 1;
  state.elements.push({
    id: nextId(state),
    kind: 'text',
    text,
    box,
    fontSize,
    color,
    align: alignOf(el, effective),
    monospace,
    mayDownload: monospace,
    lost: { fontWeight: lostWeight, fontStyle: lostStyle },
    svgText,
    mixedTextStyle: mixed,
    lineCount: state.geometry.textLineCount(el, state.root),
    groupIds: groupIdsFor(state, el),
    source: sourceOf(state, el),
  });
}

export type { ScenePoint };
