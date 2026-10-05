import { describe, expect, it } from 'vitest';

import type { PictureScene } from '@/lib/ai/antv/toExcalidraw/scene';

import { sceneToSvg } from './toSvg';

/**
 * PATCH-283 E. Pure string SVG. No foreignObject, scripts or external URLs;
 * every text run is XML-escaped.
 */

function scene(overrides: Partial<PictureScene> = {}): PictureScene {
  return {
    version: 1,
    width: 200,
    height: 100,
    background: '#ffffff',
    elements: [],
    skips: [],
    visibleShapes: 0,
    resolvableIcons: 0,
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
    ...overrides,
  };
}

const MALICIOUS = '<script>alert("x") & </script>';

describe('PATCH-283 sceneToSvg', () => {
  it('renders a viewBox and the background', () => {
    const svg = sceneToSvg(scene());
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).toContain('fill="#ffffff"');
  });

  it('escapes <script>, & and quotes in text', () => {
    const svg = sceneToSvg(
      scene({
        elements: [
          {
            id: 't',
            kind: 'text',
            text: MALICIOUS,
            box: { x: 10, y: 10, width: 180, height: 40 },
            fontSize: 16,
            color: '#111111',
            align: 'left',
            monospace: false,
            mayDownload: false,
            lost: { fontWeight: false, fontStyle: false },
            svgText: true,
            mixedTextStyle: false,
            lineCount: 1,
            groupIds: ['picture'],
            source: { tag: 'text' },
          },
        ],
      }),
    );
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&quot;');
  });

  it('stamps every element with its escaped data-drawn-id', () => {
    const svg = sceneToSvg(
      scene({
        elements: [
          {
            id: 'e3"/><script>alert(1)</script>',
            kind: 'rect',
            box: { x: 0, y: 0, width: 10, height: 10 },
            radius: 0,
            pill: false,
            paint: { fill: '#ffffff', stroke: '#000000', strokeWidth: 1, strokeStyle: 'solid', opacity: 100, blended: false },
            clipIgnored: false,
            groupIds: ['picture'],
            source: { tag: 'rect' },
          },
        ],
      }),
    );
    expect(svg).toMatch(/data-drawn-id="[A-Za-z0-9_.:-]+"/);
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('><script');
  });

  it('declares the SVG namespace and no external href', () => {
    const svg = sceneToSvg(
      scene({
        elements: [
          {
            id: 'img',
            kind: 'image',
            box: { x: 0, y: 0, width: 24, height: 24 },
            dataURL: 'data:image/svg+xml;base64,PHN2Zy8+',
            mimeType: 'image/svg+xml',
            fromIcon: true,
            groupIds: ['picture'],
            source: { tag: 'image' },
          },
          {
            id: 'bad-img',
            kind: 'image',
            box: { x: 0, y: 0, width: 24, height: 24 },
            dataURL: 'https://example.com/x.png',
            mimeType: 'image/png',
            fromIcon: false,
            groupIds: ['picture'],
            source: { tag: 'image' },
          },
        ],
      }),
    );
    expect(svg.toLowerCase()).not.toContain('foreignobject');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // The SVG namespace is the ONLY http occurrence in the output.
    expect(svg.split('http').length - 1).toBe(1);
    expect(svg).not.toContain('https://example.com');
    const hrefs = [...svg.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    expect(hrefs).toHaveLength(1);
    expect(hrefs.every((href) => href.startsWith('data:image/svg+xml'))).toBe(true);
    expect(svg).toContain('href="data:image/svg+xml;base64,PHN2Zy8+"');
  });
});
