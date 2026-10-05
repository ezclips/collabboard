// @vitest-environment jsdom
//
// PATCH-278 B. `buildDrawingPostData` uses the REAL `convertToExcalidrawElements`
// and the REAL `exportToSvg` from the lazily-loaded Excalidraw module (the fork
// runs its own export tests in jsdom, so neither is stubbed here; the text
// metrics provider is the only jsdom seam, because jsdom has no canvas).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { drawnToScene } from '@/lib/ai/drawn/compile';
import type { DrawnPicture } from '@/lib/ai/drawn/format';

import { buildDrawingPostData, buildDrawingPostDataFromScene, DrawingConversionError } from './drawingPost';
import { loadExcalidraw } from './loadExcalidraw';

beforeAll(async () => {
  const mod = await loadExcalidraw();
  mod.setCustomTextMetricsProvider({
    getLineWidth: (text: string, fontString: string) =>
      text.length * (Number.parseFloat(fontString) || 16) * 0.5,
  });
});

let containers: HTMLElement[] = [];
afterEach(() => {
  for (const container of containers) container.remove();
  containers = [];
});

const SHAPE_SELECTOR = 'rect, circle, ellipse, path, line, polygon, polyline, use, image, text, foreignObject';

function mountSvg(markup: string): SVGSVGElement {
  const container = document.createElement('div');
  container.innerHTML = markup;
  document.body.appendChild(container);
  containers.push(container);
  const svg = container.querySelector('svg') as SVGSVGElement;
  svg.querySelectorAll(SHAPE_SELECTOR).forEach((el) => {
    (el as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ x: 0, y: 0, width: 80, height: 80 }) as DOMRect;
  });
  (svg as unknown as { getBBox: () => DOMRect }).getBBox = () =>
    ({ x: 0, y: 0, width: 100, height: 100 }) as DOMRect;
  return svg;
}

const PICTURE = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect id="r" x="10" y="10" width="80" height="80" fill="#dceef5" stroke="#2c7da0" stroke-width="2" />
  </svg>`;

describe('PATCH-278 buildDrawingPostData', () => {
  it('returns the DrawingEditor onSave field names with JSON round-tripping', async () => {
    const svg = mountSvg(PICTURE);
    const data = await buildDrawingPostData(svg, { background: '#123456', title: 'My picture' });

    expect(Object.keys(data).sort()).toEqual(
      ['drawingAppState', 'drawingData', 'drawingFiles', 'previewUrl', 'size', 'title'].sort(),
    );
    expect(data.title).toBe('My picture');
    const elements = JSON.parse(data.drawingData);
    expect(Array.isArray(elements)).toBe(true);
    expect(elements.length).toBeGreaterThanOrEqual(1);
    expect(typeof data.drawingFiles).toBe('string');
    expect(JSON.parse(data.drawingFiles)).toBeTypeOf('object');
    expect(data.size.width).toBe(500);
  });

  it('stores the background as the drawing viewBackgroundColor', async () => {
    const svg = mountSvg(PICTURE);
    const data = await buildDrawingPostData(svg, { background: '#123456' });
    expect(JSON.parse(data.drawingAppState).viewBackgroundColor).toBe('#123456');
  });

  it('clamps the height from the picture viewBox between 200 and 900', async () => {
    const tall = mountSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 3000"><rect id="r" fill="#fff" stroke="#000" /></svg>',
    );
    const tallData = await buildDrawingPostData(tall, { background: '#ffffff' });
    expect(tallData.size.height).toBe(900);

    const wide = mountSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 100"><rect id="r" fill="#fff" stroke="#000" /></svg>',
    );
    const wideData = await buildDrawingPostData(wide, { background: '#ffffff' });
    expect(wideData.size.height).toBe(200);
  });

  it('builds a base64 data:image/svg+xml preview', async () => {
    const svg = mountSvg(PICTURE);
    const data = await buildDrawingPostData(svg, { background: '#ffffff' });
    expect(data.previewUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const decoded = atob(data.previewUrl.split(',')[1]);
    expect(decoded).toContain('<svg');
  });

  it('throws DrawingConversionError on an empty svg', async () => {
    const svg = mountSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>');
    await expect(buildDrawingPostData(svg, { background: '#ffffff' })).rejects.toBeInstanceOf(
      DrawingConversionError,
    );
  });

  it('throws DrawingConversionError when the svg is missing', async () => {
    await expect(buildDrawingPostData(null, { background: '#ffffff' })).rejects.toBeInstanceOf(
      DrawingConversionError,
    );
  });
});

describe('PATCH-284 buildDrawingPostDataFromScene', () => {
  const PIE: DrawnPicture = {
    version: 1,
    width: 800,
    height: 600,
    background: '#f8fafc',
    elements: Array.from({ length: 5 }, (_, index) => ({
      id: `wedge-${index}`,
      type: 'wedge' as const,
      item: index,
      cx: 300,
      cy: 300,
      r: 160,
      inner: 80,
      fill: ['#aabbcc', '#bbccdd', '#ccddee', '#ddeeff', '#eef0ff'][index],
      startAngle: (index * 2 * Math.PI) / 5,
      endAngle: ((index + 1) * 2 * Math.PI) / 5,
    })),
  };

  it('turns a drawn pie into closed filled wedges and keeps the icon images', async () => {
    const scene = drawnToScene({
      ...PIE,
      elements: [...PIE.elements, { id: 'icon', type: 'icon', name: 'sun', x: 600, y: 60, size: 32, color: '#123456' }],
    });
    const data = await buildDrawingPostDataFromScene(scene, { background: '#f8fafc' });
    const { restoreElements } = await loadExcalidraw();
    const restored = restoreElements(JSON.parse(data.drawingData), null);

    const wedges = restored.filter((element) => element.type === 'line' && (element as { polygon?: boolean }).polygon);
    expect(wedges).toHaveLength(5);
    for (const wedge of wedges) {
      expect((wedge as { backgroundColor?: string }).backgroundColor).not.toBe('transparent');
    }

    const files = JSON.parse(data.drawingFiles) as Record<string, { dataURL?: string; mimeType?: string }>;
    expect(Object.values(files).some((file) => file.mimeType === 'image/svg+xml')).toBe(true);
  });

  it('throws DrawingConversionError for a scene with no elements', async () => {
    await expect(
      buildDrawingPostDataFromScene(
        { ...drawnToScene(PIE), elements: [] },
        { background: '#ffffff' },
      ),
    ).rejects.toBeInstanceOf(DrawingConversionError);
  });
});
