/**
 * PATCH-278 A.2. The `<use>`/`<symbol>` icon reading, split out of
 * `readSvgScene.ts` to keep each file under the ceiling.
 *
 * PATCH-281 adds `icons: 'strokes'`: instead of a data-URL image (which an
 * Excalidraw library cannot hold), the symbol's own geometry is mapped from its
 * `viewBox` into the `<use>` box and emitted as editable rect/ellipse/polyline
 * elements. Paths go through the analytic `samplePathD`.
 */

import { samplePathD } from './pathSampler';
import { attr, isNone, lower, num, resolveProperty, symbolColor } from './readPaint';
import { groupIdsFor, nextId, recordSkip, sourceOf, type ReaderState } from './readText';
import type { ScenePaint, ScenePoint, SceneRect } from './scene';

function encodeSvgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

const SYMBOL_PRESENTATION = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
];

function iconDataUrl(state: ReaderState, use: Element, style: CSSStyleDeclaration, alpha: number): string {
  const href = attr(use, 'href');
  const symbol = href ? state.geometry.symbol(href, state.root) : null;
  if (!symbol) return '';
  const color = symbolColor(state, use, style, alpha);
  const viewBox = symbol.getAttribute('viewBox') ?? '0 0 24 24';
  const width = attr(use, 'width') ?? viewBox.split(/\s+/)[2] ?? '24';
  const height = attr(use, 'height') ?? viewBox.split(/\s+/)[3] ?? '24';
  const attrs = SYMBOL_PRESENTATION.map((name) => {
    const value = symbol.getAttribute(name);
    return value ? ` ${name}="${value.replace(/"/g, '&quot;')}"` : '';
  }).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}"` +
    `${attrs}>${symbol.innerHTML}</svg>`;
  return encodeSvgDataUrl(svg.replace(/currentColor/gi, color));
}

// ---------------------------------------------------------------------------
// PATCH-281. Icons as strokes.
// ---------------------------------------------------------------------------

const STROKE_SYMBOL_TAGS = new Set(['path', 'circle', 'ellipse', 'line', 'rect', 'polyline', 'polygon']);

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function symbolViewBox(symbol: Element): ViewBox {
  const raw = symbol.getAttribute('viewBox') ?? '0 0 24 24';
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every((value) => Number.isFinite(value)) && parts[2] > 0 && parts[3] > 0) {
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }
  return { x: 0, y: 0, width: 24, height: 24 };
}

function parsePoints(raw: string | null): Array<{ x: number; y: number }> {
  if (!raw) return [];
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (Number.isFinite(parts[i]) && Number.isFinite(parts[i + 1])) {
      points.push({ x: parts[i], y: parts[i + 1] });
    }
  }
  return points;
}

/** The child's own fill; falls back to the symbol's, `currentColor` -> icon colour. */
function childFill(state: ReaderState, child: Element, symbol: Element, color: string, alpha: number): string {
  const raw = child.getAttribute('fill') ?? symbol.getAttribute('fill');
  if (!raw || isNone(raw)) return 'none';
  if (/currentcolor/i.test(raw.trim())) return color;
  return resolveProperty(state, raw, alpha).color;
}

function emitIconStrokes(
  state: ReaderState,
  use: Element,
  symbol: Element,
  style: CSSStyleDeclaration,
  alphaBase: number,
  box: SceneRect,
): void {
  const iconGroup = `icon:${state.resolvableIcons}`;
  // Excalidraw groupIds are innermost-first, so the icon group comes FIRST.
  const groups = [iconGroup, ...groupIdsFor(state, use)];
  const source = sourceOf(state, use);
  const color = symbolColor(state, use, style, alphaBase);
  const vb = symbolViewBox(symbol);
  const sx = box.width / vb.width;
  const sy = box.height / vb.height;
  const mapX = (x: number) => box.x + (x - vb.x) * sx;
  const mapY = (y: number) => box.y + (y - vb.y) * sy;
  const mapPoint = (x: number, y: number) => [mapX(x), mapY(y)] as ScenePoint;
  const symbolStroke = num(symbol.getAttribute('stroke-width'), 2) || 2;
  const strokeWidth = Math.max(1, symbolStroke * ((Math.abs(sx) + Math.abs(sy)) / 2));
  const paintFor = (fill: string): ScenePaint => ({
    fill,
    stroke: color,
    strokeWidth,
    strokeStyle: 'solid',
    opacity: 100,
    blended: false,
  });

  const pushPolyline = (points: ScenePoint[], closed: boolean, filled: boolean, paint: ScenePaint): void => {
    if (points.length < 2) return;
    state.elements.push({
      id: nextId(state),
      kind: 'polyline',
      points,
      closed,
      filled,
      arrowStart: false,
      arrowEnd: false,
      paint,
      clipIgnored: false,
      groupIds: groups,
      source,
    });
    state.visibleShapes += 1;
  };

  for (const child of Array.from(symbol.children)) {
    const tag = lower(child);
    if (!STROKE_SYMBOL_TAGS.has(tag)) continue;
    const fill = childFill(state, child, symbol, color, alphaBase);
    const paint = paintFor(fill);
    if (tag === 'path') {
      const d = child.getAttribute('d');
      const subpaths = d ? samplePathD(d) : null;
      if (!subpaths) continue;
      for (const local of subpaths) {
        const points = local.map((point) => mapPoint(point.x, point.y));
        const last = points[points.length - 1];
        const joins = points.length > 1 && Math.hypot(last[0] - points[0][0], last[1] - points[0][1]) <= 0.5;
        pushPolyline(points, fill !== 'none' || joins, fill !== 'none', paint);
      }
    } else if (tag === 'circle' || tag === 'ellipse') {
      const rx = tag === 'circle' ? num(child.getAttribute('r'), 0) : num(child.getAttribute('rx'), 0);
      const ry = tag === 'circle' ? num(child.getAttribute('r'), 0) : num(child.getAttribute('ry'), 0);
      if (rx <= 0 || ry <= 0) continue;
      const cx = num(child.getAttribute('cx'), 0);
      const cy = num(child.getAttribute('cy'), 0);
      state.elements.push({
        id: nextId(state),
        kind: 'ellipse',
        box: { x: mapX(cx - rx), y: mapY(cy - ry), width: 2 * rx * sx, height: 2 * ry * sy },
        paint,
        clipIgnored: false,
        groupIds: groups,
        source,
      });
      state.visibleShapes += 1;
    } else if (tag === 'rect') {
      const width = num(child.getAttribute('width'), 0);
      const height = num(child.getAttribute('height'), 0);
      if (width <= 0 || height <= 0) continue;
      const rectBox: SceneRect = {
        x: mapX(num(child.getAttribute('x'), 0)),
        y: mapY(num(child.getAttribute('y'), 0)),
        width: width * sx,
        height: height * sy,
      };
      const radius = num(child.getAttribute('rx'), num(child.getAttribute('ry'), 0)) * sx;
      state.elements.push({
        id: nextId(state),
        kind: 'rect',
        box: rectBox,
        radius,
        pill: radius >= Math.min(rectBox.width, rectBox.height) / 2 - 0.5,
        paint,
        clipIgnored: false,
        groupIds: groups,
        source,
      });
      state.visibleShapes += 1;
    } else if (tag === 'line') {
      pushPolyline(
        [
          mapPoint(num(child.getAttribute('x1'), 0), num(child.getAttribute('y1'), 0)),
          mapPoint(num(child.getAttribute('x2'), 0), num(child.getAttribute('y2'), 0)),
        ],
        false,
        false,
        paint,
      );
    } else {
      const points = parsePoints(child.getAttribute('points')).map((point) => mapPoint(point.x, point.y));
      pushPolyline(points, tag === 'polygon', fill !== 'none', paint);
    }
  }
  state.resolvableIcons += 1;
  state.losses.iconsAsStrokes += 1;
}

export function emitIcon(state: ReaderState, el: Element, style: CSSStyleDeclaration, alphaBase: number): void {
  const href = attr(el, 'href');
  const symbol = href ? state.geometry.symbol(href, state.root) : null;
  if (!symbol) {
    recordSkip(state, el, 'icon-unresolved');
    return;
  }
  const box = state.geometry.box(el, state.root);
  if (!box || box.width <= 0 || box.height <= 0) {
    recordSkip(state, el, 'hidden');
    return;
  }
  if (state.icons === 'strokes') {
    emitIconStrokes(state, el, symbol, style, alphaBase, box);
    return;
  }
  const dataURL = iconDataUrl(state, el, style, alphaBase);
  if (!dataURL) {
    recordSkip(state, el, 'icon-unresolved');
    return;
  }
  state.elements.push({
    id: nextId(state),
    kind: 'image',
    box,
    dataURL,
    mimeType: 'image/svg+xml',
    fromIcon: true,
    groupIds: groupIdsFor(state, el),
    source: sourceOf(state, el),
  });
  state.resolvableIcons += 1;
  state.losses.iconsAsImage += 1;
}
