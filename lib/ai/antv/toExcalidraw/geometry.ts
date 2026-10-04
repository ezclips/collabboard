/**
 * PATCH-277. The ONE seam through which the reader touches browser geometry
 * (`getScreenCTM`, `getBBox`, Range client rects, `getPointAtLength`). Unit
 * tests replace it with a stub, so `readSvgScene` stays testable in jsdom
 * without a real layout engine. Every method returns root USER units already.
 */

import { samplePathD } from './pathSampler';

export interface GeometryRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeometryPoint {
  x: number;
  y: number;
}

export interface GeometrySize {
  width: number;
  height: number;
}

export interface GeometryMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface SvgGeometry {
  /** The root viewBox size in user units (not screen px). */
  viewBox(root: Element): GeometrySize | null;
  /** The element's own box transformed into root units, axis-aligned. */
  box(el: Element, root: Element): GeometryRect | null;
  /** True when the element's matrix into root is rotated or skewed. */
  rotated(el: Element, root: Element): boolean;
  /** The transformed outline of a rotated/skewed element, in root units. */
  outline(el: Element, root: Element): GeometryPoint[] | null;
  /** The rendered text block box (Range client rects), in root units. */
  textBox(el: Element, root: Element): GeometryRect | null;
  /**
   * Addendum 4. The number of RENDERED lines in the source (distinct line tops
   * from the Range client rects). Used to keep the source line count when
   * converting. At least 1 for non-empty text.
   */
  textLineCount(el: Element, root: Element): number;
  /** A `<path>` sampled into subpath point lists, in root units. */
  samplePath(el: Element, root: Element): GeometryPoint[][] | null;
  /** Maps a local user-unit point through the element's matrix into root. */
  point(el: Element, root: Element, x: number, y: number): GeometryPoint;
  /** Uniform-ish scale factor from the element's matrix into root. */
  scale(el: Element, root: Element): number;
  /** Computed style of an element. */
  style(el: Element): CSSStyleDeclaration;
  /**
   * The element that DIRECTLY contains the first non-empty text node of
   * `el` (Addendum 2). For a `foreignObject`, AntV puts font-size/colour/
   * weight on the inner HTML element, so this is where those are read from.
   * `null` when there is no non-empty text node.
   */
  firstTextHost(el: Element): Element | null;
  /** Resolve a `<symbol>` by id, within the document or the root subtree. */
  symbol(id: string, root: Element): SVGSymbolElement | null;
  /**
   * PATCH-278 A.1. How many paths fell back to `getPointAtLength` because their
   * `d` could not be parsed analytically. Optional so test stubs stay simple.
   */
  pathFallbackCount?(): number;
}

function boundingRectOf(points: readonly GeometryPoint[]): GeometryRect | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseViewBox(raw: string | null): GeometrySize | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  return { width: parts[2], height: parts[3] };
}

/** The real browser implementation. Never imported by tests. */
export function browserSvgGeometry(): SvgGeometry {
  // PATCH-278 A.1. Paths whose `d` could not be parsed analytically, counted so
  // the report can tell whether the fast sampler actually handled the picture.
  let pathFallback = 0;

  function matrixIntoRoot(root: Element, el: Element): DOMMatrix | null {
    const rootEl = root as SVGGraphicsElement;
    const targetEl = el as SVGGraphicsElement;
    const rootCTM = typeof rootEl.getScreenCTM === 'function' ? rootEl.getScreenCTM() : null;
    const elCTM = typeof targetEl.getScreenCTM === 'function' ? targetEl.getScreenCTM() : null;
    if (!rootCTM || !elCTM) return null;
    return rootCTM.inverse().multiply(elCTM);
  }

  function transform(matrix: DOMMatrix | null, x: number, y: number): GeometryPoint {
    if (!matrix) return { x, y };
    const point = new DOMPoint(x, y).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }

  function localBox(el: Element): GeometryRect | null {
    const box = (el as SVGGraphicsElement).getBBox?.();
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
  }

  function boxOf(el: Element, root: Element): GeometryRect | null {
    const local = localBox(el);
    if (!local) return null;
    const matrix = matrixIntoRoot(root, el);
    if (!matrix) return local;
    return boundingRectOf([
      transform(matrix, local.x, local.y),
      transform(matrix, local.x + local.width, local.y),
      transform(matrix, local.x, local.y + local.height),
      transform(matrix, local.x + local.width, local.y + local.height),
    ]);
  }

  function legacySamplePath(path: SVGPathElement, matrix: DOMMatrix | null): GeometryPoint[][] | null {
    if (typeof path.getTotalLength !== 'function') return null;
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return null;
    // Addendum 4: spacing of at most 4 units (was a flat 96-point cap), so a
    // long road path's tight arcs survive; cap 4000 for safety. Straight runs
    // are collapsed later by Ramer–Douglas–Peucker in toSkeleton.
    const n = clampInt(Math.ceil(length / 4), 8, 4000);
    const samples: GeometryPoint[] = [];
    for (let i = 0; i <= n; i += 1) {
      const point = path.getPointAtLength((i / n) * length);
      samples.push(transform(matrix, point.x, point.y));
    }
    // `getPointAtLength` walks every subpath continuously, so a subpath break
    // shows up as a jump much larger than the spacing. Split there. (A dense
    // parse of `d` would be exact; this is the closest cheap version.)
    const jump = Math.max(2, length * 0.25);
    const subpaths: GeometryPoint[][] = [];
    let current: GeometryPoint[] = [];
    for (const point of samples) {
      const prev = current[current.length - 1];
      if (prev && Math.hypot(point.x - prev.x, point.y - prev.y) > jump) {
        if (current.length) subpaths.push(current);
        current = [];
      }
      current.push(point);
    }
    if (current.length) subpaths.push(current);
    return subpaths;
  }

  function samplePathOf(el: Element, root: Element): GeometryPoint[][] | null {
    const path = el as SVGPathElement;
    const matrix = matrixIntoRoot(root, el);
    const d = path.getAttribute?.('d');
    if (d) {
      const parsed = samplePathD(d, { spacing: 4 });
      if (parsed) {
        return parsed.map((subpath) => subpath.map((point) => transform(matrix, point.x, point.y)));
      }
      pathFallback += 1;
    }
    return legacySamplePath(path, matrix);
  }

  function textBoxOf(el: Element, root: Element): GeometryRect | null {
    const rootEl = root as SVGGraphicsElement;
    const rootCTM = typeof rootEl.getScreenCTM === 'function' ? rootEl.getScreenCTM() : null;
    let rects: DOMRectList | null = null;
    try {
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      rects = range.getClientRects();
    } catch {
      rects = null;
    }
    if (!rects || rects.length === 0) return boxOf(el, root);
    const rootInverse = rootCTM ? rootCTM.inverse() : null;
    const points: GeometryPoint[] = [];
    for (let i = 0; i < rects.length; i += 1) {
      const rect = rects[i];
      points.push(transform(rootInverse, rect.left, rect.top));
      points.push(transform(rootInverse, rect.right, rect.bottom));
    }
    return boundingRectOf(points);
  }

  function textLineCountOf(el: Element): number {
    let rects: DOMRectList | null = null;
    try {
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      rects = range.getClientRects();
    } catch {
      rects = null;
    }
    if (rects && rects.length > 0) {
      const tops = new Set<number>();
      for (let i = 0; i < rects.length; i += 1) {
        const rect = rects[i];
        if (rect.width === 0 && rect.height === 0) continue;
        tops.add(Math.round(rect.top));
      }
      if (tops.size > 0) return tops.size;
    }
    if (el.tagName.toLowerCase() === 'text') {
      const tspans = Array.from(el.querySelectorAll('tspan'));
      const ys = new Set<string>();
      for (const tspan of tspans) {
        const y = tspan.getAttribute('y') ?? tspan.getAttribute('dy');
        if (y !== null) ys.add(y);
      }
      if (ys.size > 0) return ys.size;
    }
    return 1;
  }

  function outlineOf(el: Element, root: Element): GeometryPoint[] | null {
    const matrix = matrixIntoRoot(root, el);
    const tag = el.tagName.toLowerCase();
    if (tag === 'ellipse' || tag === 'circle') {
      const local = localBox(el);
      if (!local) return null;
      const rx = local.width / 2;
      const ry = local.height / 2;
      const cx = local.x + rx;
      const cy = local.y + ry;
      const points: GeometryPoint[] = [];
      for (let i = 0; i < 24; i += 1) {
        const angle = (i / 24) * Math.PI * 2;
        points.push(transform(matrix, cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)));
      }
      return points;
    }
    if (tag === 'path') {
      const subpaths = samplePathOf(el, root);
      return subpaths && subpaths.length ? subpaths.flat() : null;
    }
    const local = localBox(el);
    if (!local) return null;
    return [
      transform(matrix, local.x, local.y),
      transform(matrix, local.x + local.width, local.y),
      transform(matrix, local.x + local.width, local.y + local.height),
      transform(matrix, local.x, local.y + local.height),
    ];
  }

  return {
    viewBox(root) {
      const parsed = parseViewBox(root.getAttribute('viewBox'));
      if (parsed) return parsed;
      const width = Number(root.getAttribute('width'));
      const height = Number(root.getAttribute('height'));
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return { width, height };
      }
      const box = localBox(root);
      return box ? { width: box.width, height: box.height } : null;
    },
    box: boxOf,
    rotated(el, root) {
      const matrix = matrixIntoRoot(root, el);
      if (!matrix) return false;
      return Math.abs(matrix.b) > 1e-6 || Math.abs(matrix.c) > 1e-6;
    },
    outline: outlineOf,
    textBox: textBoxOf,
    textLineCount: (el) => textLineCountOf(el),
    samplePath: samplePathOf,
    point(el, root, x, y) {
      return transform(matrixIntoRoot(root, el), x, y);
    },
    scale(el, root) {
      const matrix = matrixIntoRoot(root, el);
      if (!matrix) return 1;
      const sx = Math.hypot(matrix.a, matrix.b);
      const sy = Math.hypot(matrix.c, matrix.d);
      const scale = (sx + sy) / 2;
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    },
    style(el) {
      return window.getComputedStyle(el);
    },
    firstTextHost(el) {
      const doc = el.ownerDocument;
      if (!doc || typeof doc.createTreeWalker !== 'function') return null;
      const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
      let node = walker.nextNode();
      while (node) {
        if ((node.textContent ?? '').trim()) return node.parentElement;
        node = walker.nextNode();
      }
      return null;
    },
    symbol(id, root) {
      const clean = id.replace(/^#/, '');
      if (!clean) return null;
      const doc = root.ownerDocument;
      const found = doc ? doc.getElementById(clean) : null;
      if (found && found.tagName.toLowerCase() === 'symbol') {
        return found as unknown as SVGSymbolElement;
      }
      const scoped = root.querySelector(`[id="${clean.replace(/"/g, '\\"')}"]`);
      return scoped && scoped.tagName.toLowerCase() === 'symbol'
        ? (scoped as unknown as SVGSymbolElement)
        : null;
    },
    pathFallbackCount() {
      return pathFallback;
    },
  };
}
