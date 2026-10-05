/**
 * PATCH-281. Shared test kit for the `readSvgScene` line/gradient/icon tests:
 * a `SvgGeometry` stub (the same seam `readSvgScene.test.ts` uses) so the reader
 * runs in jsdom without a layout engine. Not a test file (no `.test` suffix).
 */

import type { GeometryPoint, GeometryRect, SvgGeometry } from './geometry';
import type { SceneElement } from './scene';

export function svg(markup: string): Element {
  return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
}

export function makeStyle(overrides: Record<string, string> = {}): CSSStyleDeclaration {
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
    strokeLinecap: 'butt',
    color: '#000000',
    clipPath: 'none',
    mask: 'none',
    markerStart: 'none',
    markerEnd: 'none',
  };
  return { ...base, ...overrides } as unknown as CSSStyleDeclaration;
}

export interface StubConfig {
  viewBox?: { width: number; height: number };
  boxes?: Record<string, GeometryRect>;
  outlines?: Record<string, GeometryPoint[]>;
  paths?: Record<string, GeometryPoint[][]>;
  styles?: Record<string, Record<string, string>>;
  symbols?: Record<string, SVGSymbolElement>;
}

function idOf(el: Element): string {
  return el.getAttribute('id') ?? '';
}

export function stub(config: StubConfig): SvgGeometry {
  return {
    viewBox: () => config.viewBox ?? { width: 200, height: 100 },
    box: (el) => config.boxes?.[idOf(el)] ?? null,
    rotated: () => false,
    outline: (el) => config.outlines?.[idOf(el)] ?? null,
    textBox: (el) => config.boxes?.[idOf(el)] ?? null,
    textLineCount: () => 1,
    samplePath: (el) => config.paths?.[idOf(el)] ?? null,
    point: (_el, _root, x, y) => ({ x, y }),
    scale: () => 1,
    style: (el) => makeStyle(config.styles?.[idOf(el)]),
    firstTextHost: () => null,
    symbol: (href) => config.symbols?.[href.replace(/^#/, '')] ?? null,
  };
}

export function polylines(elements: SceneElement[]): Array<Extract<SceneElement, { kind: 'polyline' }>> {
  return elements.filter((el): el is Extract<SceneElement, { kind: 'polyline' }> => el.kind === 'polyline');
}
