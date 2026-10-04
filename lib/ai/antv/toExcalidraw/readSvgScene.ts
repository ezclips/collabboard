/**
 * PATCH-277. Reads a rendered AntV `<svg>` into a `PictureScene` (scene.ts).
 * Every browser geometry call goes through the injectable `SvgGeometry`, so
 * this runs in jsdom with a stub. Reads the LIVE DOM, so it converts exactly
 * what the user sees, overrides included. Paint/gradient helpers live in
 * `readPaint.ts`; this module walks the tree and emits scene elements.
 */

import { browserSvgGeometry, type SvgGeometry } from './geometry';
import {
  attr,
  clipOrMask,
  hasFilter,
  isMarkerSet,
  isNone,
  lower,
  num,
  opacityOf,
  paintFor,
  resolveProperty,
  symbolColor,
  type PaintState,
} from './readPaint';
import {
  PICTURE_GROUP_ID,
  PICTURE_SCENE_VERSION,
  type PictureScene,
  type SceneElement,
  type ScenePaint,
  type ScenePoint,
  type SceneRect,
  type SceneSkip,
  type SceneSkipReason,
  type SceneSource,
  type SceneTextAlign,
} from './scene';

export interface ReadSvgSceneOptions {
  /** The theme ground, for alpha blending. */
  background: string;
  /** Test seam; defaults to the real browser geometry. */
  geometry?: SvgGeometry;
}

const DEFINITION_TAGS = new Set(['defs', 'clippath', 'mask', 'marker', 'symbol']);
const SHAPE_TAGS = new Set(['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line']);
const VISUAL_TAGS = new Set([...SHAPE_TAGS, 'use', 'image', 'text', 'foreignobject']);

function parseIndexes(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length === 0 || parts.some((value) => !Number.isInteger(value) || value < 0)) {
    return undefined;
  }
  return parts;
}

function nearestIndexes(el: Element, root: Element): number[] | undefined {
  let node: Element | null = el;
  while (node && node !== root.parentElement) {
    const parsed = parseIndexes(node.getAttribute('data-indexes'));
    if (parsed) return parsed;
    if (node === root) break;
    node = node.parentElement;
  }
  return undefined;
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

function encodeSvgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

interface ReaderState extends PaintState {
  pictureGroup: string;
  elements: SceneElement[];
  skips: SceneSkip[];
  visibleShapes: number;
  resolvableIcons: number;
  counter: number;
}

function nextId(state: ReaderState): string {
  const id = `e${state.counter}`;
  state.counter += 1;
  return id;
}

function recordSkip(state: ReaderState, el: Element, reason: SceneSkipReason): void {
  state.skips.push({ id: nextId(state), tag: lower(el), reason, indexes: nearestIndexes(el, state.root) });
}

function groupIdsFor(state: ReaderState, el: Element): string[] {
  const indexes = nearestIndexes(el, state.root);
  return indexes ? [`item:${indexes.join(',')}`, state.pictureGroup] : [state.pictureGroup];
}

function sourceOf(state: ReaderState, el: Element): SceneSource {
  const indexes = nearestIndexes(el, state.root);
  return indexes ? { tag: lower(el), indexes } : { tag: lower(el) };
}

function captionPoints(
  state: ReaderState,
  el: Element,
  local: Array<{ x: number; y: number }>,
): ScenePoint[] {
  return local.map((point) => {
    const mapped = state.geometry.point(el, state.root, point.x, point.y);
    return [mapped.x, mapped.y] as ScenePoint;
  });
}

/** Distance below which the shape is considered closed (path ends meet). */
const CLOSE_EPSILON = 0.5;

function emitShape(
  state: ReaderState,
  el: Element,
  style: CSSStyleDeclaration,
  box: SceneRect,
  paint: ScenePaint,
): void {
  const clipIgnored = clipOrMask(el, style);
  if (clipIgnored) state.losses.clipIgnored += 1;
  const base = {
    id: nextId(state),
    groupIds: groupIdsFor(state, el),
    source: sourceOf(state, el),
    clipIgnored,
  };
  const tag = lower(el);

  if (state.geometry.rotated(el, state.root)) {
    const outline = state.geometry.outline(el, state.root);
    if (outline && outline.length >= 3) {
      state.elements.push({
        ...base,
        kind: 'polyline',
        points: outline.map((point) => [point.x, point.y] as ScenePoint),
        closed: true,
        filled: paint.fill !== 'none',
        arrowStart: false,
        arrowEnd: false,
        paint,
      });
      state.visibleShapes += 1;
      return;
    }
  }

  if (tag === 'rect') {
    const scale = state.geometry.scale(el, state.root);
    const radius = Math.max(num(attr(el, 'rx'), num(attr(el, 'ry'), 0)), 0) * scale;
    const pill = radius >= Math.min(box.width, box.height) / 2 - CLOSE_EPSILON;
    state.elements.push({ ...base, kind: 'rect', box, radius, pill, paint });
    state.visibleShapes += 1;
    return;
  }

  if (tag === 'circle' || tag === 'ellipse') {
    state.elements.push({ ...base, kind: 'ellipse', box, paint });
    state.visibleShapes += 1;
    return;
  }

  // path / polygon / polyline / line
  let subpaths: ScenePoint[][] = [];
  let closed = false;
  if (tag === 'path') {
    const sampled = state.geometry.samplePath(el, state.root);
    subpaths = (sampled ?? []).map((points) => points.map((point) => [point.x, point.y] as ScenePoint));
    closed = paint.fill !== 'none';
  } else if (tag === 'polygon') {
    subpaths = [captionPoints(state, el, parsePoints(attr(el, 'points')))];
    closed = true;
  } else if (tag === 'polyline') {
    subpaths = [captionPoints(state, el, parsePoints(attr(el, 'points')))];
  } else {
    const local = [
      { x: num(attr(el, 'x1'), 0), y: num(attr(el, 'y1'), 0) },
      { x: num(attr(el, 'x2'), 0), y: num(attr(el, 'y2'), 0) },
    ];
    subpaths = [captionPoints(state, el, local)];
  }
  subpaths = subpaths.filter((points) => points.length >= 2);
  if (subpaths.length === 0) {
    recordSkip(state, el, 'hidden');
    return;
  }
  const arrowStart = isMarkerSet(el, style, 'marker-start');
  const arrowEnd = isMarkerSet(el, style, 'marker-end');
  for (const [index, points] of subpaths.entries()) {
    const first = points[0];
    const last = points[points.length - 1];
    const isClosed = closed || Math.hypot(last[0] - first[0], last[1] - first[1]) <= CLOSE_EPSILON;
    state.elements.push({
      ...base,
      id: index === 0 ? base.id : `${base.id}:${index}`,
      kind: 'polyline',
      points,
      closed: isClosed,
      filled: paint.fill !== 'none',
      arrowStart,
      arrowEnd,
      paint,
    });
    state.visibleShapes += 1;
  }
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

function emitIcon(state: ReaderState, el: Element, style: CSSStyleDeclaration, alphaBase: number): void {
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

function emitImage(state: ReaderState, el: Element, box: SceneRect | null): void {
  const href = attr(el, 'href') ?? '';
  if (!href.startsWith('data:')) {
    recordSkip(state, el, 'external-image');
    return;
  }
  const semi = href.indexOf(';');
  const mimeType = semi > 5 ? href.slice(5, semi) : 'image/png';
  if (!box || box.width <= 0 || box.height <= 0) {
    recordSkip(state, el, 'hidden');
    return;
  }
  state.elements.push({
    id: nextId(state),
    kind: 'image',
    box,
    dataURL: href,
    mimeType,
    fromIcon: false,
    groupIds: groupIdsFor(state, el),
    source: sourceOf(state, el),
  });
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

function emitText(state: ReaderState, el: Element, style: CSSStyleDeclaration, alphaBase: number): void {
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

function isEditorUi(el: Element): boolean {
  const type = el.getAttribute('data-element-type');
  return (
    type === 'btns-group' ||
    type === 'btn-add' ||
    type === 'btn-remove' ||
    el.hasAttribute('data-picture-control')
  );
}

function visit(state: ReaderState, el: Element, chainOpacity: number): void {
  const tag = lower(el);
  if (DEFINITION_TAGS.has(tag)) {
    recordSkip(state, el, 'definition');
    return;
  }
  if (isEditorUi(el)) {
    recordSkip(state, el, 'editor-ui');
    return;
  }
  const style = state.geometry.style(el);
  const opacity = opacityOf(style.opacity);
  const hidden = style.display === 'none' || style.visibility === 'hidden' || opacity <= 0;
  if (hidden) {
    if (VISUAL_TAGS.has(tag) || SHAPE_TAGS.has(tag)) recordSkip(state, el, 'hidden');
    return;
  }
  const alphaBase = chainOpacity * opacity;
  // Addendum 4: a drop shadow (SVG `filter`) is not converted; count it.
  if (VISUAL_TAGS.has(tag) && hasFilter(el, style)) state.losses.shadowIgnored += 1;

  if (tag === 'text' || tag === 'foreignobject') {
    emitText(state, el, style, alphaBase);
    return;
  }
  if (SHAPE_TAGS.has(tag)) {
    const box = state.geometry.box(el, state.root);
    const { paint, fillEmpty, strokeEmpty } = paintFor(state, el, style, alphaBase);
    if (fillEmpty && strokeEmpty) {
      recordSkip(state, el, 'invisible');
      return;
    }
    if (!box || box.width <= 0 || box.height <= 0) {
      recordSkip(state, el, 'hidden');
      return;
    }
    emitShape(state, el, style, box, paint);
    return;
  }
  if (tag === 'use') {
    emitIcon(state, el, style, alphaBase);
    return;
  }
  if (tag === 'image') {
    emitImage(state, el, state.geometry.box(el, state.root));
    return;
  }
  for (const child of Array.from(el.children)) {
    visit(state, child, alphaBase);
  }
}

/** Reads the root `<svg>` described by the options into a `PictureScene`. */
export function readSvgScene(root: Element, options: ReadSvgSceneOptions): PictureScene {
  const geometry = options.geometry ?? browserSvgGeometry();
  const view = geometry.viewBox(root) ?? { width: 0, height: 0 };
  const state: ReaderState = {
    root,
    geometry,
    background: options.background,
    pictureGroup: PICTURE_GROUP_ID,
    elements: [],
    skips: [],
    losses: {
      blended: 0,
      gradientFlattened: 0,
      clipIgnored: 0,
      lostFontWeight: 0,
      lostFontStyle: 0,
      iconsAsImage: 0,
      mixedTextStyle: 0,
      shadowIgnored: 0,
    },
    visibleShapes: 0,
    resolvableIcons: 0,
    counter: 0,
  };
  for (const child of Array.from(root.children)) {
    visit(state, child, 1);
  }
  return {
    version: PICTURE_SCENE_VERSION,
    width: view.width,
    height: view.height,
    background: options.background,
    elements: state.elements,
    skips: state.skips,
    visibleShapes: state.visibleShapes,
    resolvableIcons: state.resolvableIcons,
    losses: state.losses,
  };
}

export { isNone };
