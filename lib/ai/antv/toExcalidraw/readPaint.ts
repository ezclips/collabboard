/**
 * PATCH-277. The DOM-reading paint helpers used by `readSvgScene`: resolve a
 * fill/stroke (including `url(#gradient)` chains) to an opaque hex, parse a
 * dash array into an Excalidraw stroke style, and read a `<use>` icon's colour.
 * Split out of `readSvgScene` purely to keep each file under the line ceiling.
 */

import { parseColor, resolvePaint, type GradientStop } from './paint';
import type {
  PictureSceneLosses,
  ScenePaint,
  SceneStrokeStyle,
  SceneSkip,
  SceneElement,
} from './scene';
import type { SvgGeometry } from './geometry';

const XLINK = 'http://www.w3.org/1999/xlink';

export function lower(el: Element): string {
  return el.tagName.toLowerCase();
}

export function attr(el: Element, name: string): string | null {
  return el.getAttribute(name) ?? el.getAttributeNS(XLINK, name);
}

export function num(value: string | null, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function opacityOf(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(1, parsed));
}

export function isNone(value: string): boolean {
  return !value || value.trim().toLowerCase() === 'none';
}

/** The mutable part of the reader state these helpers need. */
export interface PaintState {
  root: Element;
  geometry: SvgGeometry;
  background: string;
  losses: PictureSceneLosses;
}

/**
 * Addendum 4. The dash array may live on the ATTRIBUTE or in the computed
 * style; read both (attribute first). `"8 8"` with width 3 is `dashed`; only
 * every dash <= 2x the width is `dotted`.
 */
export function strokeStyleOf(el: Element, style: CSSStyleDeclaration): SceneStrokeStyle {
  const raw = attr(el, 'stroke-dasharray') ?? style.strokeDasharray ?? 'none';
  const dash = raw.trim();
  if (!dash || dash === 'none') return 'solid';
  const values = dash.split(/[\s,]+/).map(Number).filter((value) => Number.isFinite(value));
  if (values.length === 0) return 'solid';
  const width = num(attr(el, 'stroke-width') ?? style.strokeWidth, 1) || 1;
  const everyDashTiny = values.every((value) => value <= 2 * width);
  return everyDashTiny ? 'dotted' : 'dashed';
}

function gradientStops(root: Element, ref: string): GradientStop[] | null {
  const id = ref.slice(ref.indexOf('#') + 1, ref.lastIndexOf(')'));
  if (!id) return null;
  const seen = new Set<string>();
  let node: Element | null = root.ownerDocument.getElementById(id) ?? root.querySelector(`[id="${id}"]`);
  while (node) {
    const tag = lower(node);
    if (tag !== 'lineargradient' && tag !== 'radialgradient') return null;
    const stops = Array.from(node.children)
      .filter((child) => lower(child) === 'stop')
      .map((stop): GradientStop | null => {
        const offsetRaw = attr(stop, 'offset') ?? '0';
        const offset = offsetRaw.trim().endsWith('%')
          ? Number.parseFloat(offsetRaw) / 100
          : Number.parseFloat(offsetRaw);
        const colorRaw = attr(stop, 'stop-color') ?? (stop as SVGElement).style?.stopColor ?? '';
        const color = parseColor(colorRaw);
        if (!color || !Number.isFinite(offset)) return null;
        const stopOpacity = num(attr(stop, 'stop-opacity'), 1);
        return { offset, color: { ...color, a: color.a * stopOpacity } };
      })
      .filter((stop): stop is GradientStop => stop !== null);
    if (stops.length) return stops;
    const href = attr(node, 'href');
    if (!href || seen.has(href)) break;
    seen.add(href);
    node = root.ownerDocument.getElementById(href.replace(/^#/, ''));
  }
  return null;
}

export function resolveProperty(
  state: PaintState,
  raw: string,
  alpha: number,
): { color: string; blended: boolean } {
  const ref = /^url\(/i.test(raw.trim()) ? raw : null;
  let stops: GradientStop[] | undefined;
  if (ref) {
    const resolvedStops = gradientStops(state.root, ref);
    if (resolvedStops) {
      state.losses.gradientFlattened += 1;
      stops = resolvedStops;
    }
  }
  const resolved = resolvePaint(raw, alpha, state.background, stops);
  if (resolved.blended) state.losses.blended += 1;
  return resolved;
}

export function paintFor(
  state: PaintState,
  el: Element,
  style: CSSStyleDeclaration,
  alphaBase: number,
): { paint: ScenePaint; fillEmpty: boolean; strokeEmpty: boolean } {
  const fillRaw = attr(el, 'fill') ?? style.fill ?? 'none';
  const strokeRaw = attr(el, 'stroke') ?? style.stroke ?? 'none';
  const fillAlpha = alphaBase * opacityOf(attr(el, 'fill-opacity') ?? style.fillOpacity);
  const strokeAlpha = alphaBase * opacityOf(attr(el, 'stroke-opacity') ?? style.strokeOpacity);
  const fill = resolveProperty(state, fillRaw, fillAlpha);
  const stroke = resolveProperty(state, strokeRaw, strokeAlpha);
  const scale = state.geometry.scale(el, state.root);
  const strokeWidthRaw = num(attr(el, 'stroke-width') ?? style.strokeWidth, 1);
  const paint: ScenePaint = {
    fill: fill.color,
    stroke: stroke.color,
    strokeWidth: Math.max(0.5, strokeWidthRaw * scale),
    strokeStyle: strokeStyleOf(el, style),
    opacity: 100,
    blended: fill.blended || stroke.blended,
  };
  return { paint, fillEmpty: fill.color === 'none', strokeEmpty: stroke.color === 'none' };
}

export function clipOrMask(el: Element, style: CSSStyleDeclaration): boolean {
  const clip = attr(el, 'clip-path') ?? style.clipPath ?? 'none';
  const mask = attr(el, 'mask') ?? style.mask ?? 'none';
  return !isNone(clip) || !isNone(mask);
}

/** Addendum 4. True when the element carries a (non-none) `filter`/shadow. */
export function hasFilter(el: Element, style: CSSStyleDeclaration): boolean {
  const filter = attr(el, 'filter') ?? style.filter ?? 'none';
  return !isNone(filter);
}

export function isMarkerSet(
  el: Element,
  style: CSSStyleDeclaration,
  which: 'marker-start' | 'marker-end',
): boolean {
  const value = attr(el, which) ?? (which === 'marker-start' ? style.markerStart : style.markerEnd) ?? 'none';
  return !isNone(value);
}

export function symbolColor(
  state: PaintState,
  el: Element,
  style: CSSStyleDeclaration,
  alpha: number,
): string {
  // The `<use>`'s own fill wins; otherwise the computed `color` (what Lucide's
  // `currentColor` strokes resolve to). The inherited `fill` is often `none`
  // or black and must not mask a real colour.
  const ownFill = attr(el, 'fill');
  const raw = ownFill && !isNone(ownFill) ? ownFill : style.color;
  const resolved = resolveProperty(state, raw, alpha);
  if (resolved.color !== 'none') return resolved.color;
  return resolveProperty(state, style.fill, alpha).color;
}

export type { SceneElement, SceneSkip };
