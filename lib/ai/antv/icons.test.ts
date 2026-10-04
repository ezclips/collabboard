// @vitest-environment jsdom
//
// PATCH-276. AntV's `parseSVG` uses `DOMParser(image/svg+xml)`, so the symbol we
// hand it MUST carry the SVG namespace: without `xmlns` its children are created
// in the null namespace and the browser never draws the `<use>`. These tests use
// a REAL DOMParser, exactly as the live resource loader does.
import { describe, expect, it } from 'vitest';

import { VISUAL_ICON_NAMES } from '@/lib/ai/visualIcons';
import { iconNodeChildren, iconSymbolSvg } from './icons';

const SVG_NS = 'http://www.w3.org/2000/svg';
const UNKNOWN = iconSymbolSvg('definitely-not-an-icon');

function parseSymbol(svg: string): Element {
  return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
}

describe('PATCH-241 icon symbols', () => {
  it('builds a stroke symbol with the icon geometry', () => {
    const svg = iconSymbolSvg('sun');
    expect(svg.startsWith('<symbol')).toBe(true);
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('key=');
  });

  it('falls back to a neutral dot for unknown names, never empty', () => {
    expect(UNKNOWN).toContain('<symbol');
    expect(UNKNOWN).toContain('<circle cx="12" cy="12" r="3"');
  });

  it('resolves every name in VISUAL_ICON_NAMES to real geometry', () => {
    for (const name of VISUAL_ICON_NAMES) {
      const svg = iconSymbolSvg(name);
      expect(svg, `${name} must build`).toContain('<symbol');
      expect(svg, `${name} must not be the fallback`).not.toBe(UNKNOWN);
    }
  });

  it('PATCH-262 exposes the raw node list, with the neutral dot as fallback', () => {
    expect(iconNodeChildren('sun').some(([tag]) => tag === 'circle')).toBe(true);
    expect(iconNodeChildren(null)).toEqual([['circle', { cx: 12, cy: 12, r: 3 }]]);
  });
});

describe('PATCH-276 icon symbols live in the SVG namespace', () => {
  it('the parsed root is an SVGSymbolElement in the SVG namespace', () => {
    const root = parseSymbol(iconSymbolSvg('sun'));
    expect(root.tagName.toLowerCase()).toBe('symbol');
    expect(root.namespaceURI).toBe(SVG_NS);
    expect(root.constructor.name).toBe('SVGSymbolElement');
  });

  it('every child is created in the SVG namespace', () => {
    const root = parseSymbol(iconSymbolSvg('sun'));
    const children = Array.from(root.children);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      expect(child.namespaceURI).toBe(SVG_NS);
    }
  });

  it('the fallback dot for an unknown name is in the SVG namespace too', () => {
    const root = parseSymbol(UNKNOWN);
    expect(root.namespaceURI).toBe(SVG_NS);
    expect(root.constructor.name).toBe('SVGSymbolElement');
    for (const child of Array.from(root.children)) {
      expect(child.namespaceURI).toBe(SVG_NS);
    }
  });
});
