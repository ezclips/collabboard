// @vitest-environment jsdom
//
// PATCH-287. `readSvgScene` must record the nearest `data-element-type` on the
// source, exactly as it records `data-indexes`, so roles can name each part.
import { describe, expect, it } from 'vitest';

import type { SvgGeometry } from './geometry';
import { readSvgScene } from './readSvgScene';

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

function stub(boxes: Record<string, { x: number; y: number; width: number; height: number }>): SvgGeometry {
  const idOf = (el: Element) => el.getAttribute('id') ?? '';
  return {
    viewBox: () => ({ width: 200, height: 100 }),
    box: (el) => boxes[idOf(el)] ?? null,
    rotated: () => false,
    outline: () => null,
    textBox: (el) => boxes[idOf(el)] ?? null,
    textLineCount: () => 1,
    samplePath: () => null,
    point: (_el, _root, x, y) => ({ x, y }),
    scale: () => 1,
    style: () => makeStyle(),
    firstTextHost: () => null,
    symbol: () => null,
  };
}

describe('PATCH-287: readSvgScene elementType', () => {
  it('records the nearest data-element-type next to the indexes', () => {
    const root = svg(`
      <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <g data-element-type="item-label" data-indexes="0">
          <rect id="r" x="10" y="10" width="80" height="40" fill="#DCEEF5" />
        </g>
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({ r: { x: 10, y: 10, width: 80, height: 40 } }),
    });
    expect(scene.elements[0].source).toEqual({ tag: 'rect', indexes: [0], elementType: 'item-label' });
  });

  it('takes the elementType from an ancestor when the element has none', () => {
    const root = svg(`
      <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <g data-element-type="item-value">
          <g data-indexes="1">
            <rect id="r" x="0" y="0" width="10" height="10" fill="#000000" />
          </g>
        </g>
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({ r: { x: 0, y: 0, width: 10, height: 10 } }),
    });
    expect(scene.elements[0].source.elementType).toBe('item-value');
    expect(scene.elements[0].source.indexes).toEqual([1]);
  });

  it('leaves elementType absent when the SVG has none', () => {
    const root = svg(`
      <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <rect id="r" x="0" y="0" width="10" height="10" fill="#000000" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({ r: { x: 0, y: 0, width: 10, height: 10 } }),
    });
    expect(scene.elements[0].source.elementType).toBeUndefined();
  });
});
