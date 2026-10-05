/**
 * PATCH-277. Reads a rendered AntV `<svg>` into a `PictureScene` (scene.ts).
 * Every browser geometry call goes through the injectable `SvgGeometry`, so
 * this runs in jsdom with a stub. Reads the LIVE DOM, so it converts exactly
 * what the user sees, overrides included. Paint/gradient helpers live in
 * `readPaint.ts`; text in `readText.ts`; icons in `readIcon.ts`.
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
} from './readPaint';
import { emitIcon } from './readIcon';
import {
  emitText,
  groupIdsFor,
  nextId,
  recordSkip,
  sourceOf,
  type ReaderState,
} from './readText';
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
} from './scene';

export interface ReadSvgSceneOptions {
  /** The theme ground, for alpha blending. */
  background: string;
  /**
   * PATCH-281. How to emit `<use>` icons: as a data-URL picture (default) or as
   * their own editable geometry. Default `'image'`, so nothing changes unless
   * asked (Excalidraw libraries cannot hold images).
   */
  icons?: 'image' | 'strokes';
  /** Test seam; defaults to the real browser geometry. */
  geometry?: SvgGeometry;
}

const DEFINITION_TAGS = new Set(['defs', 'clippath', 'mask', 'marker', 'symbol']);
const SHAPE_TAGS = new Set(['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line']);
const VISUAL_TAGS = new Set([...SHAPE_TAGS, 'use', 'image', 'text', 'foreignobject']);
/**
 * PATCH-281. Shapes that can render with a zero-width or zero-height box: a
 * perfectly straight line. They survive the zero-box rule when stroked; a
 * zero-box `rect`/`ellipse` is genuinely invisible and still skipped.
 */
const FLAT_SHAPE_TAGS = new Set(['path', 'polygon', 'polyline', 'line']);

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

/** Addendum 1. Points within this of each other are a zero-length dot. */
const DOT_DIAMETER = 0.5;

function isDot(points: readonly ScenePoint[]): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return Math.hypot(maxX - minX, maxY - minY) <= DOT_DIAMETER;
}

function lineCapOf(el: Element, style: CSSStyleDeclaration): string {
  return (attr(el, 'stroke-linecap') ?? style.strokeLinecap ?? 'butt').trim().toLowerCase();
}

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
  // Addendum 1. A zero-length stroked path is a dot, drawn with the stroke cap:
  // round -> circle, square -> square, butt -> nothing. `toSkeleton` would
  // collapse the polyline below 2 points and drop it, so emit the primitive.
  if (paint.stroke !== 'none' && subpaths.every(isDot)) {
    const cap = lineCapOf(el, style);
    if (cap === 'butt') {
      recordSkip(state, el, 'hidden');
      return;
    }
    const radius = paint.strokeWidth / 2;
    const dotPaint: ScenePaint = { ...paint, fill: paint.stroke, stroke: 'none' };
    for (const [index, points] of subpaths.entries()) {
      const [cx, cy] = points[0];
      const id = index === 0 ? base.id : `${base.id}:${index}`;
      const dotBox: SceneRect = {
        x: cx - radius,
        y: cy - radius,
        width: paint.strokeWidth,
        height: paint.strokeWidth,
      };
      if (cap === 'round') {
        state.elements.push({ ...base, id, kind: 'ellipse', box: dotBox, paint: dotPaint });
      } else {
        state.elements.push({ ...base, id, kind: 'rect', box: dotBox, radius: 0, pill: false, paint: dotPaint });
      }
      state.visibleShapes += 1;
    }
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
    const { paint, fillEmpty, strokeEmpty, patternFill } = paintFor(state, el, style, alphaBase);
    if (patternFill) state.losses.patternIgnored += 1;
    if (fillEmpty && strokeEmpty) {
      recordSkip(state, el, patternFill ? 'pattern' : 'invisible');
      return;
    }
    if (!box || box.width <= 0 || box.height <= 0) {
      // PATCH-281: a straight stroked line has a zero-height (or -width) box; it
      // is still painted, so only skip when there is no stroke to draw.
      if (strokeEmpty || !FLAT_SHAPE_TAGS.has(tag)) {
        recordSkip(state, el, 'hidden');
        return;
      }
    }
    emitShape(state, el, style, box as SceneRect, paint);
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
    icons: options.icons ?? 'image',
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
      iconsAsStrokes: 0,
      mixedTextStyle: 0,
      shadowIgnored: 0,
      pathFallback: 0,
      patternIgnored: 0,
    },
    visibleShapes: 0,
    resolvableIcons: 0,
    counter: 0,
  };
  for (const child of Array.from(root.children)) {
    visit(state, child, 1);
  }
  state.losses.pathFallback = geometry.pathFallbackCount?.() ?? 0;
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
