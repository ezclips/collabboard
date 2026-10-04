// @vitest-environment jsdom
//
// PATCH-277. `readSvgScene` runs against hand-built SVGs shaped like real AntV
// output, with a stubbed `SvgGeometry` giving the boxes, so no layout engine is
// needed. The stub is the only browser seam; DOMParser here is the real one.
import { describe, expect, it } from 'vitest';

import type { GeometryPoint, GeometryRect, SvgGeometry } from './geometry';
import { readSvgScene } from './readSvgScene';
import type { SceneElement } from './scene';

function svg(markup: string): Element {
  return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
}

function makeStyle(overrides: Record<string, string> = {}): CSSStyleDeclaration {
  const base: Record<string, string> = {
    display: 'inline',
    visibility: 'visible',
    opacity: '1',
    fill: '#000000',
    stroke: 'none',
    fillOpacity: '1',
    strokeOpacity: '1',
    strokeWidth: '1',
    strokeDasharray: 'none',
    color: '#000000',
    fontSize: '16px',
    fontFamily: 'Helvetica, sans-serif',
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'start',
    textAnchor: 'start',
    clipPath: 'none',
    mask: 'none',
    markerStart: 'none',
    markerEnd: 'none',
  };
  return { ...base, ...overrides } as unknown as CSSStyleDeclaration;
}

interface StubConfig {
  viewBox?: { width: number; height: number };
  boxes?: Record<string, GeometryRect>;
  textBoxes?: Record<string, GeometryRect>;
  outlines?: Record<string, GeometryPoint[]>;
  paths?: Record<string, GeometryPoint[][]>;
  styles?: Record<string, Record<string, string>>;
  rotated?: string[];
  symbols?: Record<string, SVGSymbolElement>;
}

function idOf(el: Element): string {
  return el.getAttribute('id') ?? '';
}

/** The first non-empty text node's parent, exactly like the browser impl. */
function firstTextHostOf(el: Element): Element | null {
  const walker = document.createTreeWalker(el, 4);
  let node = walker.nextNode();
  while (node) {
    if ((node.textContent ?? '').trim()) return node.parentElement;
    node = walker.nextNode();
  }
  return null;
}

function stub(config: StubConfig): SvgGeometry {
  return {
    viewBox: () => config.viewBox ?? { width: 200, height: 100 },
    box: (el) => config.boxes?.[idOf(el)] ?? null,
    rotated: (el) => (config.rotated ?? []).includes(idOf(el)),
    outline: (el) => config.outlines?.[idOf(el)] ?? null,
    textBox: (el) => config.textBoxes?.[idOf(el)] ?? config.boxes?.[idOf(el)] ?? null,
    textLineCount: () => 1,
    samplePath: (el) => config.paths?.[idOf(el)] ?? null,
    point: (_el, _root, x, y) => ({ x, y }),
    scale: () => 1,
    style: (el) => makeStyle(config.styles?.[idOf(el)]),
    firstTextHost: (el) => firstTextHostOf(el),
    symbol: (href) => config.symbols?.[href.replace(/^#/, '')] ?? null,
  };
}

function byKind(elements: SceneElement[], kind: SceneElement['kind']): SceneElement[] {
  return elements.filter((element) => element.kind === kind);
}

describe('PATCH-277 readSvgScene', () => {
  it('reads a badge-card item: rect + text + icon, in item group and document order', () => {
    const root = svg(`
      <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <g data-indexes="0">
          <rect id="card" x="10" y="10" width="80" height="40" rx="6"
            fill="#DCEEF5" stroke="#2C7DA0" stroke-width="2" />
          <foreignObject id="label" x="20" y="20" width="60" height="20">
            <div xmlns="http://www.w3.org/1999/xhtml">Item one</div>
          </foreignObject>
          <use id="icon" href="#ic" x="70" y="20" width="16" height="16" />
        </g>
      </svg>
    `);
    const symbol = svg(
      '<symbol id="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" /></symbol>',
    ) as unknown as SVGSymbolElement;
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: {
          card: { x: 10, y: 10, width: 80, height: 40 },
          icon: { x: 70, y: 20, width: 16, height: 16 },
        },
        textBoxes: { label: { x: 20, y: 20, width: 60, height: 20 } },
        styles: {
          card: { fill: 'rgb(220, 238, 245)', stroke: '#2C7DA0', strokeWidth: '2' },
          label: { color: '#374151' },
          icon: { color: '#2C7DA0' },
        },
        symbols: { ic: symbol },
      }),
    });

    expect(scene.elements.map((element) => element.kind)).toEqual(['rect', 'text', 'image']);
    const rect = byKind(scene.elements, 'rect')[0];
    expect(rect.groupIds).toEqual(['item:0', 'picture']);
    expect(scene.visibleShapes).toBe(1);
    expect(scene.resolvableIcons).toBe(1);
    expect(scene.skips).toEqual([]);
    const image = byKind(scene.elements, 'image')[0];
    if (image.kind !== 'image') throw new Error('expected image');
    expect(image.fromIcon).toBe(true);
    expect(image.dataURL.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const decoded = atob(image.dataURL.split(',')[1]);
    expect(decoded.toLowerCase()).toContain('#2c7da0');
    expect(decoded).not.toContain('currentColor');
  });

  it('reads a mind-map capsule: pill rect, badge ellipse and icon', () => {
    const root = svg(`
      <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <g data-indexes="1,0">
          <rect id="pill" x="0" y="0" width="80" height="40" rx="20" fill="#E0E7FF" stroke="#A5B4FC" />
          <ellipse id="badge" cx="90" cy="20" rx="10" ry="10" fill="#A5B4FC" />
          <use id="icon" href="#ic" width="16" height="16" />
        </g>
      </svg>
    `);
    const symbol = svg('<symbol id="ic" viewBox="0 0 24 24"><path d="M0 0 L1 1" stroke="currentColor" /></symbol>') as unknown as SVGSymbolElement;
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: {
          pill: { x: 0, y: 0, width: 80, height: 40 },
          badge: { x: 80, y: 10, width: 20, height: 20 },
          icon: { x: 100, y: 12, width: 16, height: 16 },
        },
        styles: { icon: { color: '#252E7A' } },
        symbols: { ic: symbol },
      }),
    });
    const pill = byKind(scene.elements, 'rect')[0];
    if (pill.kind !== 'rect') throw new Error('expected rect');
    expect(pill.pill).toBe(true);
    expect(pill.groupIds).toEqual(['item:1,0', 'picture']);
    expect(byKind(scene.elements, 'ellipse')).toHaveLength(1);
    expect(byKind(scene.elements, 'image')).toHaveLength(1);
  });

  it('reads a filled closed path as a filled polygon', () => {
    const root = svg(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <path id="slice" d="M50 50 L90 50 A40 40 0 0 1 50 90 Z" fill="#FDE68A" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { slice: { x: 50, y: 50, width: 40, height: 40 } },
        paths: {
          slice: [
            [
              { x: 50, y: 50 },
              { x: 90, y: 50 },
              { x: 50, y: 90 },
              { x: 50, y: 50 },
            ],
          ],
        },
        styles: { slice: { fill: '#FDE68A' } },
      }),
    });
    const poly = byKind(scene.elements, 'polyline')[0];
    if (poly.kind !== 'polyline') throw new Error('expected polyline');
    expect(poly.closed).toBe(true);
    expect(poly.filled).toBe(true);
    expect(poly.points.length).toBe(4);
  });

  it('joins tspans by y into newline-separated text', () => {
    const root = svg(`
      <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <text id="t" x="10" y="20" fill="#1F2937" font-size="14">
          <tspan x="10" y="20">Alpha</tspan>
          <tspan x="10" y="40">Beta</tspan>
        </text>
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { t: { x: 10, y: 10, width: 60, height: 34 } },
        textBoxes: { t: { x: 10, y: 10, width: 60, height: 34 } },
        styles: { t: { fill: '#1F2937', fontSize: '14px' } },
      }),
    });
    const text = byKind(scene.elements, 'text')[0];
    if (text.kind !== 'text') throw new Error('expected text');
    expect(text.text).toBe('Alpha\nBeta');
    expect(text.fontSize).toBe(14);
  });

  it('reads font-size and colour from the INNER element of a foreignObject', () => {
    // AntV puts size/colour/weight on the HTML element INSIDE the foreignObject;
    // the foreignObject itself only has inherited defaults (16px, black).
    const root = svg(`
      <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <foreignObject id="fo" x="10" y="10" width="100" height="30">
          <span id="inner" xmlns="http://www.w3.org/1999/xhtml">Seasonal plan</span>
        </foreignObject>
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { fo: { x: 10, y: 10, width: 100, height: 30 } },
        textBoxes: { fo: { x: 10, y: 10, width: 100, height: 30 } },
        styles: {
          // the outer element's own computed style: the inherited defaults
          fo: { fontSize: '16px', color: '#000000', fontWeight: '400' },
          inner: { fontSize: '24px', color: '#e9a23b', fontWeight: '700' },
        },
      }),
    });
    const text = byKind(scene.elements, 'text')[0];
    if (text.kind !== 'text') throw new Error('expected text');
    expect(text.fontSize).toBe(24);
    expect(text.color).toBe('#e9a23b');
    expect(text.lost.fontWeight).toBe(true);
    expect(text.mixedTextStyle).toBe(false);
  });

  it('uses the FIRST inner style and counts mixedTextStyle when spans differ', () => {
    const root = svg(`
      <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <foreignObject id="fo" x="10" y="10" width="120" height="40">
          <span id="a" xmlns="http://www.w3.org/1999/xhtml">24</span>
          <span id="b" xmlns="http://www.w3.org/1999/xhtml">40</span>
        </foreignObject>
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { fo: { x: 10, y: 10, width: 120, height: 40 } },
        textBoxes: { fo: { x: 10, y: 10, width: 120, height: 40 } },
        styles: {
          fo: { fontSize: '16px', color: '#000000' },
          a: { fontSize: '24px', color: '#e9a23b' },
          b: { fontSize: '12px', color: '#2c7da0' },
        },
      }),
    });
    const text = byKind(scene.elements, 'text')[0];
    if (text.kind !== 'text') throw new Error('expected text');
    expect(text.fontSize).toBe(24);
    expect(text.color).toBe('#e9a23b');
    expect(text.mixedTextStyle).toBe(true);
    expect(scene.losses.mixedTextStyle).toBe(1);
  });

  it('flattens a gradient fill at 0.5 and counts it', () => {
    const root = svg(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#000000" />
            <stop offset="1" stop-color="#ffffff" />
          </linearGradient>
        </defs>
        <rect id="r" x="0" y="0" width="50" height="50" fill="url(#g)" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({ boxes: { r: { x: 0, y: 0, width: 50, height: 50 } }, styles: { r: { fill: 'url(#g)' } } }),
    });
    const rect = byKind(scene.elements, 'rect')[0];
    if (rect.kind !== 'rect') throw new Error('expected rect');
    expect(rect.paint.fill).toBe('#808080');
    expect(scene.losses.gradientFlattened).toBe(1);
  });

  it('counts shadowIgnored for an element with a filter (drop shadow)', () => {
    const root = svg(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="f"><feDropShadow dx="0" dy="2" stdDeviation="2" /></filter>
        </defs>
        <rect id="shadowed" x="10" y="10" width="40" height="40" fill="#dceef5"
          filter="url(#f)" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { shadowed: { x: 10, y: 10, width: 40, height: 40 } },
        styles: { shadowed: { fill: '#dceef5' } },
      }),
    });
    expect(byKind(scene.elements, 'rect')).toHaveLength(1);
    expect(scene.losses.shadowIgnored).toBe(1);
  });

  it('skips hidden, invisible and editor-ui elements with the right reasons', () => {
    const root = svg(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect id="hidden" x="0" y="0" width="10" height="10" fill="#000" />
        <rect id="invisible" x="0" y="0" width="10" height="10" fill="none" stroke="none" />
        <rect id="btn" data-element-type="btn-add" x="0" y="0" width="10" height="10" fill="#000" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: {
          hidden: { x: 0, y: 0, width: 10, height: 10 },
          invisible: { x: 0, y: 0, width: 10, height: 10 },
          btn: { x: 0, y: 0, width: 10, height: 10 },
        },
        styles: {
          hidden: { display: 'none' },
          invisible: { fill: 'none', stroke: 'none' },
        },
      }),
    });
    const reasons = scene.skips.map((skip) => skip.reason).sort();
    expect(reasons).toEqual(['editor-ui', 'hidden', 'invisible']);
    expect(scene.skips.some((skip) => skip.reason === 'unknown')).toBe(false);
    expect(scene.elements).toHaveLength(0);
  });
});
