import { describe, expect, it } from 'vitest';

import type { DrawnPicture } from './format';
import { drawnToScene } from './compile';
import { PICTURE_GROUP_ID } from '@/lib/ai/antv/toExcalidraw/scene';

/**
 * PATCH-283 D. DrawnPicture -> PictureScene, the one internal format that both
 * renders as SVG and converts to Excalidraw.
 */

describe('PATCH-283 drawnToScene', () => {
  const picture: DrawnPicture = {
    version: 1,
    width: 800,
    height: 600,
    background: '#ffffff',
    elements: [
      { id: 'card', type: 'rect', x: 10, y: 10, w: 100, h: 60, fill: '#aabbcc', stroke: '#000000', radius: 6, item: 3 },
      { id: 'label', type: 'text', text: 'Hello world', x: 10, y: 10, w: 80, size: 16, color: '#111111', in: 'card', item: 3 },
      {
        id: 'donut',
        type: 'wedge',
        item: 0,
        cx: 300,
        cy: 200,
        r: 100,
        inner: 50,
        fill: '#ff0000',
        startAngle: 0,
        endAngle: Math.PI / 2,
      },
      { id: 'bar', type: 'bar', item: 1, x: 500, y: 100, w: 40, h: 120, orient: 'v', fill: '#00ff00' },
      { id: 'line', type: 'line', points: [[0, 0], [50, 50]], stroke: '#333333', arrow: 'end' },
      { id: 'icon', type: 'icon', name: 'sun', x: 600, y: 300, size: 24, color: '#123456' },
    ],
  };

  it('uses the picture dimensions and background', () => {
    const scene = drawnToScene(picture);
    expect(scene.version).toBe(1);
    expect(scene.width).toBe(800);
    expect(scene.height).toBe(600);
    expect(scene.background).toBe('#ffffff');
  });

  it('compiles a donut wedge to a closed filled polyline with an inner arc', () => {
    const scene = drawnToScene(picture);
    const wedge = scene.elements.find((element) => element.id === 'donut');
    if (wedge?.kind !== 'polyline') throw new Error('expected a polyline wedge');
    expect(wedge.closed).toBe(true);
    expect(wedge.filled).toBe(true);
    const distances = wedge.points.map(([x, y]) => Math.round(Math.hypot(x - 300, y - 200)));
    expect(Math.max(...distances)).toBeGreaterThanOrEqual(99);
    expect(Math.min(...distances)).toBeLessThanOrEqual(51);
  });

  it('compiles an icon to an SVG data URL image containing the symbol', () => {
    const scene = drawnToScene(picture);
    const icon = scene.elements.find((element) => element.id === 'icon');
    if (icon?.kind !== 'image') throw new Error('expected an image icon');
    expect(icon.fromIcon).toBe(true);
    expect(icon.dataURL.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const svg = atob(icon.dataURL.split(',')[1]);
    expect(svg).toContain('<circle');
    expect(svg).toContain('#123456');
  });

  it('adds the item group id plus the picture group id', () => {
    const scene = drawnToScene(picture);
    const card = scene.elements.find((element) => element.id === 'card');
    expect(card?.groupIds).toEqual(['item:3', PICTURE_GROUP_ID]);
    const icon = scene.elements.find((element) => element.id === 'icon');
    expect(icon?.groupIds).toEqual([PICTURE_GROUP_ID]);
  });

  it('compiles text to a SceneTextElement with a wrapped line count', () => {
    const scene = drawnToScene(picture);
    const label = scene.elements.find((element) => element.id === 'label');
    if (label?.kind !== 'text') throw new Error('expected text');
    expect(label.svgText).toBe(true);
    expect(label.lineCount).toBeGreaterThanOrEqual(1);
    expect(label.box.height).toBeGreaterThan(0);
    expect(label.groupIds).toEqual(['item:3', PICTURE_GROUP_ID]);
  });

  it('compiles a bar to a rect and a line to an arrowed polyline', () => {
    const scene = drawnToScene(picture);
    const bar = scene.elements.find((element) => element.id === 'bar');
    expect(bar?.kind).toBe('rect');
    const line = scene.elements.find((element) => element.id === 'line');
    if (line?.kind !== 'polyline') throw new Error('expected polyline');
    expect(line.arrowEnd).toBe(true);
    expect(line.arrowStart).toBe(false);
  });
});
