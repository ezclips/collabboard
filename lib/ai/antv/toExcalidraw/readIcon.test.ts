// @vitest-environment jsdom
//
// PATCH-283. The optional `iconName` recovered for an AntV `<use>` icon, so the
// AI-drawn example converter can turn an icon picture back into a DrawnIcon.
import { describe, expect, it } from 'vitest';

import type { SvgGeometry } from './geometry';
import { readSvgScene } from './readSvgScene';
import { stub, svg } from './testGeometryStub';

function root(href: string): Element {
  return svg(`
    <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
      <use id="icon" href="${href}" x="100" y="50" width="24" height="24" />
    </svg>
  `);
}

function symbolWithId(id: string): SVGSymbolElement {
  return svg(`
    <symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="5" />
    </symbol>
  `) as unknown as SVGSymbolElement;
}

function stubFor(href: string, symbol: SVGSymbolElement): SvgGeometry {
  return stub({
    boxes: { icon: { x: 100, y: 50, width: 24, height: 24 } },
    styles: { icon: { color: '#2C7DA0' } },
    symbols: { [href.replace(/^#/, '')]: symbol },
  });
}

describe('PATCH-283 readIcon iconName', () => {
  it('keeps a direct symbol id that is a known icon name', () => {
    const scene = readSvgScene(root('#sun'), { background: '#ffffff', geometry: stubFor('#sun', symbolWithId('sun')) });
    const image = scene.elements.find((element) => element.kind === 'image');
    if (image?.kind !== 'image') throw new Error('expected image');
    expect(image.iconName).toBe('sun');
  });

  it('recovers the icon name from an AntV rsc- hash id', () => {
    // Java String.hashCode of JSON.stringify({source:'custom',data:'lucide/sun'}).
    const href = '#rsc-2007113385';
    const scene = readSvgScene(root(href), { background: '#ffffff', geometry: stubFor(href, symbolWithId(href.slice(1))) });
    const image = scene.elements.find((element) => element.kind === 'image');
    if (image?.kind !== 'image') throw new Error('expected image');
    expect(image.iconName).toBe('sun');
  });

  it('leaves iconName undefined for an unknown id', () => {
    const href = '#rsc-1';
    const scene = readSvgScene(root(href), { background: '#ffffff', geometry: stubFor(href, symbolWithId('rsc-1')) });
    const image = scene.elements.find((element) => element.kind === 'image');
    if (image?.kind !== 'image') throw new Error('expected image');
    expect(image.iconName).toBeUndefined();
  });
});
