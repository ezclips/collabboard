import { describe, expect, it } from 'vitest';

import type { PictureScene, SceneElement } from '@/lib/ai/antv/toExcalidraw/scene';

import { sceneToDrawn } from './fromScene';
import type { DrawnElement } from './format';

/**
 * PATCH-283 G. PictureScene -> DrawnPicture, used only to build prompt examples
 * from AntV templates. Pure; numbers rounded; tiny elements dropped.
 */

function scene(elements: SceneElement[]): PictureScene {
  return {
    version: 1,
    width: 400,
    height: 300,
    background: '#ffffff',
    elements,
    skips: [],
    visibleShapes: elements.length,
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
  };
}

const PAINT = { fill: '#aabbcc', stroke: '#000000', strokeWidth: 1, strokeStyle: 'solid' as const, opacity: 100, blended: false };

function circlePoints(cx: number, cy: number, r: number, count: number): [number, number][] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return [Math.round(cx + r * Math.cos(angle)), Math.round(cy + r * Math.sin(angle))] as [number, number];
  });
}

function zigzagPoints(count: number): [number, number][] {
  return Array.from({ length: count }, (_, i) => [i * 5, i % 2 === 0 ? 0 : 8] as [number, number]);
}

describe('PATCH-283 sceneToDrawn', () => {
  it('converts rect and ellipse as is with integer numbers', () => {
    const drawn = sceneToDrawn(
      scene([
        { id: 'r', kind: 'rect', box: { x: 1.4, y: 2.6, width: 10.2, height: 20.5 }, radius: 0, pill: false, paint: PAINT, clipIgnored: false, groupIds: ['picture'], source: { tag: 'rect' } },
        { id: 'e', kind: 'ellipse', box: { x: 30, y: 40, width: 12, height: 8 }, paint: PAINT, clipIgnored: false, groupIds: ['picture'], source: { tag: 'ellipse' } },
      ]),
    );
    const rect = drawn.elements.find((element) => element.id === 'r');
    if (rect?.type !== 'rect') throw new Error('expected rect');
    expect(rect.x).toBe(1);
    expect(rect.y).toBe(3);
    expect(rect.w).toBe(10);
    expect(rect.h).toBe(21);
    const ellipse = drawn.elements.find((element) => element.id === 'e');
    expect(ellipse?.type).toBe('ellipse');
  });

  it('turns a closed filled polyline into a simplified polygon', () => {
    const drawn = sceneToDrawn(
      scene([
        { id: 'p', kind: 'polyline', points: circlePoints(100, 100, 60, 60), closed: true, filled: true, arrowStart: false, arrowEnd: false, paint: PAINT, clipIgnored: false, groupIds: ['picture'], source: { tag: 'polygon' } },
      ]),
    );
    const polygon = drawn.elements.find((element) => element.id === 'p');
    if (polygon?.type !== 'polygon') throw new Error('expected polygon');
    expect(polygon.points.length).toBeLessThanOrEqual(24);
    expect(polygon.points.length).toBeGreaterThan(2);
    for (const [x, y] of polygon.points) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
    }
  });

  it('drops a polygon that needs more than 24 points after RDP', () => {
    const drawn = sceneToDrawn(
      scene([
        { id: 'p', kind: 'polyline', points: zigzagPoints(60), closed: true, filled: true, arrowStart: false, arrowEnd: false, paint: PAINT, clipIgnored: false, groupIds: ['picture'], source: { tag: 'polygon' } },
      ]),
    );
    expect(drawn.elements.find((element) => element.id === 'p')).toBeUndefined();
  });

  it('turns an open polyline into a line', () => {
    const drawn = sceneToDrawn(
      scene([
        { id: 'l', kind: 'polyline', points: [[0, 0], [40, 30], [80, 10]], closed: false, filled: false, arrowStart: false, arrowEnd: true, paint: PAINT, clipIgnored: false, groupIds: ['picture'], source: { tag: 'line' } },
      ]),
    );
    const line = drawn.elements.find((element) => element.id === 'l');
    if (line?.type !== 'line') throw new Error('expected line');
    expect(line.arrow).toBe('end');
  });

  it('turns an icon image with an iconName into an icon', () => {
    const drawn = sceneToDrawn(
      scene([
        { id: 'i', kind: 'image', box: { x: 5, y: 6, width: 24, height: 24 }, dataURL: 'data:image/svg+xml;base64,PHN2Zy8+', mimeType: 'image/svg+xml', fromIcon: true, iconName: 'sun', groupIds: ['picture'], source: { tag: 'image' } },
      ]),
    );
    const icon = drawn.elements.find((element) => element.id === 'i');
    if (icon?.type !== 'icon') throw new Error('expected icon');
    expect(icon.name).toBe('sun');
    expect(icon.size).toBe(24);
  });

  it('drops a plain (non-icon) image and an element smaller than 2px', () => {
    const drawn = sceneToDrawn(
      scene([
        { id: 'img', kind: 'image', box: { x: 0, y: 0, width: 24, height: 24 }, dataURL: 'data:image/png;base64,AAAA', mimeType: 'image/png', fromIcon: false, groupIds: ['picture'], source: { tag: 'image' } },
        { id: 'tiny', kind: 'rect', box: { x: 0, y: 0, width: 1, height: 40 }, radius: 0, pill: false, paint: PAINT, clipIgnored: false, groupIds: ['picture'], source: { tag: 'rect' } },
      ]),
    );
    expect(drawn.elements).toHaveLength(0);
  });

  it('turns text into a text element using its box', () => {
    const drawn = sceneToDrawn(
      scene([
        { id: 't', kind: 'text', text: 'Hello', box: { x: 10, y: 20, width: 60, height: 18 }, fontSize: 16, color: '#111111', align: 'center', monospace: false, mayDownload: false, lost: { fontWeight: false, fontStyle: false }, svgText: true, mixedTextStyle: false, lineCount: 1, groupIds: ['item:2', 'picture'], source: { tag: 'text' } },
      ]),
    );
    const text = drawn.elements[0];
    if (text.type !== 'text') throw new Error('expected text');
    expect(text.text).toBe('Hello');
    expect(text.w).toBe(60);
    expect(text.size).toBe(16);
    expect(text.item).toBe(2);
  });
});

describe('PATCH-283 sceneToDrawn item grouping', () => {
  it('reads the item index from groupIds', () => {
    const drawn = sceneToDrawn(
      scene([
        { id: 'r', kind: 'rect', box: { x: 0, y: 0, width: 40, height: 40 }, radius: 0, pill: false, paint: PAINT, clipIgnored: false, groupIds: ['item:4', 'picture'], source: { tag: 'rect' } },
      ]),
    );
    const rect = drawn.elements[0] as DrawnElement;
    if (rect.type !== 'rect') throw new Error('expected rect');
    expect(rect.item).toBe(4);
  });
});
