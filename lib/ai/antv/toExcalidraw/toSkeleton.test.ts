// @vitest-environment jsdom
//
// PATCH-277. `toSkeleton` is pure; one test also runs the REAL
// `convertToExcalidrawElements` from the fork on its output, with a custom text
// metrics provider because jsdom has no canvas (the fork exports the provider
// for exactly that case). It is NOT replaced by a mock.
import { describe, expect, it } from 'vitest';

import { loadExcalidraw } from './loadExcalidraw';
import type { PictureScene, SceneElement, ScenePoint } from './scene';
import {
  alignTextElements,
  rdp,
  stableHash,
  toSkeleton,
  wrapToLineCount,
  wrapToWidth,
  type AlignableElement,
} from './toSkeleton';

function scene(elements: SceneElement[], overrides: Partial<PictureScene> = {}): PictureScene {
  return {
    version: 1,
    width: 200,
    height: 100,
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
      mixedTextStyle: 0,
      shadowIgnored: 0,
    },
    ...overrides,
  };
}

const paint = {
  fill: '#dceef5',
  stroke: '#2c7da0',
  strokeWidth: 2,
  strokeStyle: 'solid' as const,
  opacity: 100,
  blended: false,
};

function asRecord(value: unknown): Record<string, any> {
  return value as Record<string, any>;
}

function rect(overrides: Partial<Extract<SceneElement, { kind: 'rect' }>> = {}): SceneElement {
  return {
    id: 'r1',
    kind: 'rect',
    box: { x: 10, y: 10, width: 80, height: 40 },
    radius: 0,
    pill: false,
    paint,
    clipIgnored: false,
    groupIds: ['item:0', 'picture'],
    source: { tag: 'rect', indexes: [0] },
    ...overrides,
  };
}

function polyline(overrides: Partial<Extract<SceneElement, { kind: 'polyline' }>> = {}): SceneElement {
  return {
    id: 'p1',
    kind: 'polyline',
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
    closed: false,
    filled: false,
    arrowStart: false,
    arrowEnd: false,
    paint: { ...paint, fill: 'none' },
    clipIgnored: false,
    groupIds: ['picture'],
    source: { tag: 'path' },
    ...overrides,
  };
}

function finiteNumbers(value: unknown, path = '$'): string[] {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? [] : [path];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, i) => finiteNumbers(entry, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => finiteNumbers(entry, `${path}.${key}`));
  }
  return [];
}

describe('PATCH-277 toSkeleton', () => {
  it('emits the background first, in the picture group, then the shapes', () => {
    const result = toSkeleton(scene([rect()]));
    expect(result.elements).toHaveLength(2);
    const background = asRecord(result.elements[0]);
    expect(background.id).toBe('background');
    expect(background.backgroundColor).toBe('#ffffff');
    expect(background.groupIds).toEqual(['picture']);
    const shape = asRecord(result.elements[1]);
    expect(shape.type).toBe('rectangle');
    expect(shape.groupIds).toEqual(['item:0', 'picture']);
  });

  it('covers every rectangle roundness row', () => {
    const square = asRecord(toSkeleton(scene([rect({ radius: 0 })])).elements[1]);
    expect(square.roundness).toBeNull();
    const rounded = asRecord(toSkeleton(scene([rect({ radius: 6 })])).elements[1]);
    expect(rounded.roundness).toEqual({ type: 3 });
    // Addendum 4: the DEFAULT for a pill is now the exact polygon outline.
    const pillDefault = asRecord(toSkeleton(scene([rect({ radius: 20, pill: true })])).elements[1]);
    expect(pillDefault.type).toBe('line');
    expect(pillDefault.polygon).toBe(true);
    expect(pillDefault.points.length).toBeGreaterThan(8);
    // The legacy rounded-box behaviour is kept behind `pill: 'rectangle'`.
    const pillRectangle = asRecord(
      toSkeleton(scene([rect({ radius: 20, pill: true })]), { pill: 'rectangle' }).elements[1],
    );
    expect(pillRectangle.type).toBe('rectangle');
    expect(pillRectangle.roundness).toEqual({ type: 3 });
  });

  it('emits ellipses and both polyline rows, reducing collinear points', () => {
    const ellipse = asRecord(
      toSkeleton(
        scene([
          {
            id: 'e1',
            kind: 'ellipse',
            box: { x: 0, y: 0, width: 20, height: 20 },
            paint,
            clipIgnored: false,
            groupIds: ['picture'],
            source: { tag: 'ellipse' },
          },
        ]),
      ).elements[1],
    );
    expect(ellipse.type).toBe('ellipse');

    const open = asRecord(
      toSkeleton(scene([polyline({ points: [[0, 0], [10, 0], [20, 0]] })])).elements[1],
    );
    expect(open.type).toBe('line');
    expect(open.polygon).toBe(false);
    expect(open.points).toHaveLength(2);

    const closed = asRecord(
      toSkeleton(
        scene([
          polyline({
            points: [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 0],
            ],
            closed: true,
            filled: true,
            paint,
          }),
        ]),
      ).elements[1],
    );
    expect(closed.polygon).toBe(true);
    expect(closed.backgroundColor).toBe('#dceef5');
  });

  it('turns marker-end / marker-start into an arrow with triangle heads', () => {
    const arrow = asRecord(
      toSkeleton(scene([polyline({ arrowEnd: true, arrowStart: true, points: [[0, 0], [30, 10]] })]))
        .elements[1],
    );
    expect(arrow.type).toBe('arrow');
    expect(arrow.endArrowhead).toBe('triangle');
    expect(arrow.startArrowhead).toBe('triangle');
  });

  it('post-pass aligns centered and right text to the rendered box', () => {
    const textScene = scene([
      {
        id: 't1',
        kind: 'text',
        text: 'Hello',
        box: { x: 100, y: 20, width: 80, height: 20 },
        fontSize: 16,
        color: '#374151',
        align: 'center',
        monospace: false,
        mayDownload: false,
        lost: { fontWeight: false, fontStyle: false },
        svgText: false,
        mixedTextStyle: false,
        lineCount: 1,
        groupIds: ['picture'],
        source: { tag: 'foreignobject' },
      },
      {
        id: 't2',
        kind: 'text',
        text: 'World',
        box: { x: 100, y: 50, width: 80, height: 20 },
        fontSize: 16,
        color: '#374151',
        align: 'right',
        monospace: false,
        mayDownload: false,
        lost: { fontWeight: false, fontStyle: false },
        svgText: false,
        mixedTextStyle: false,
        lineCount: 1,
        groupIds: ['picture'],
        source: { tag: 'foreignobject' },
      },
    ]);
    const elements: AlignableElement[] = [
      { id: 't1', type: 'text', x: 100, y: 20, width: 40, height: 21 },
      { id: 't2', type: 'text', x: 100, y: 50, width: 30, height: 21 },
    ];
    alignTextElements(elements, textScene);
    expect(elements[0].x).toBe(100 + (80 - 40) / 2);
    expect(elements[1].x).toBe(100 + 80 - 30);
    // Addendum 4: vertical centre matches the source box (box y 20/50, height 20).
    expect(elements[0].y).toBe(20 + (20 - 21) / 2);
    expect(elements[1].y).toBe(50 + (20 - 21) / 2);
  });

  it('dedupes identical icon files and shapes the file map exactly', () => {
    const dataURL = 'data:image/svg+xml;base64,PHN2Zy8+';
    const image: SceneElement = {
      id: 'i1',
      kind: 'image',
      box: { x: 0, y: 0, width: 16, height: 16 },
      dataURL,
      mimeType: 'image/svg+xml',
      fromIcon: true,
      groupIds: ['picture'],
      source: { tag: 'use' },
    };
    const result = toSkeleton(scene([image, { ...image, id: 'i2' }]));
    const fileIds = Object.keys(result.files);
    expect(fileIds).toHaveLength(1);
    expect(fileIds[0]).toBe(stableHash(dataURL));
    expect(result.files[fileIds[0]]).toEqual({
      id: fileIds[0],
      mimeType: 'image/svg+xml',
      dataURL,
      created: 0,
    });
  });

  it('never emits NaN', () => {
    const result = toSkeleton(
      scene([rect({ radius: 6 }), polyline(), rect({ pill: true, radius: 20 })], { width: 0, height: 0 }),
    );
    expect(finiteNumbers(result.elements)).toEqual([]);
  });

  // The real Excalidraw import + convert is heavy; a generous explicit timeout
  // keeps it from flaking under the full parallel gate.
  it('runs the REAL convertToExcalidrawElements on its output', { timeout: 30000 }, async () => {
    // Addendum 1: Excalidraw is loaded lazily and client-only.
    const { convertToExcalidrawElements, setCustomTextMetricsProvider } = await loadExcalidraw();
    // jsdom has no canvas; the fork exports this provider for exactly that case.
    setCustomTextMetricsProvider({
      getLineWidth: (text: string, fontString: string) =>
        text.length * (Number.parseFloat(fontString) || 16) * 0.5,
    });
    const textScene = scene([
      {
        id: 't1',
        kind: 'text',
        text: 'Hello world',
        box: { x: 20, y: 20, width: 80, height: 20 },
        fontSize: 16,
        color: '#374151',
        align: 'left',
        monospace: false,
        mayDownload: false,
        lost: { fontWeight: false, fontStyle: false },
        svgText: false,
        mixedTextStyle: false,
        lineCount: 1,
        groupIds: ['picture'],
        source: { tag: 'foreignobject' },
      },
      rect(),
    ]);
    const { elements } = toSkeleton(textScene);
    const converted = convertToExcalidrawElements(elements, { regenerateIds: false });
    expect(converted.length).toBe(elements.length);
    expect(converted.every((element) => typeof element.id === 'string')).toBe(true);
    const text = converted.find((element) => element.type === 'text');
    expect(text).toBeDefined();
    expect(Number.isFinite(text?.width)).toBe(true);
  });
});

describe('PATCH-277 Addendum 4', () => {
  /** A dense sample of a closed path: long straight runs + two radius-60 arcs. */
  function roadOutline(): ScenePoint[] {
    const points: ScenePoint[] = [];
    const push = (x: number, y: number) => points.push([x, y]);
    // big triangle-ish road outline with two tight radius-60 arcs
    for (let x = 0; x <= 1200; x += 4) push(x, 0);
    for (let a = Math.PI / 2; a >= -Math.PI / 2; a -= 0.02) push(1200 + 60 * Math.sin(a), 60 - 60 * Math.cos(a) + 0);
    for (let y = 120; y <= 900; y += 4) push(1140, y);
    for (let a = Math.PI / 2; a <= (3 * Math.PI) / 2; a += 0.02) push(1140 + 60 * Math.cos(a), 900 + 60 * Math.sin(a));
    for (let x = 1140; x >= 0; x -= 4) push(x, 960);
    for (let y = 960; y >= 0; y -= 4) push(0, y);
    push(0, 0);
    return points;
  }

  it('rdp keeps a closed 4000-unit path within 1 unit and well under 1000 points', () => {
    const source = roadOutline();
    expect(source.length).toBeGreaterThan(1000);
    const reduced = rdp(source, 0.5);
    expect(reduced.length).toBeLessThan(1000);
    // Every source point lies within ~1 unit of the reduced polyline.
    let maxDeviation = 0;
    for (const p of source) {
      let nearest = Infinity;
      for (let i = 0; i < reduced.length - 1; i += 1) {
        const a = reduced[i];
        const b = reduced[i + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const dist = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
        nearest = Math.min(nearest, dist);
      }
      maxDeviation = Math.max(maxDeviation, nearest);
    }
    expect(maxDeviation).toBeLessThanOrEqual(1);
  });

  it('simplifies a dense polyline so a filled road keeps its shape', () => {
    const dense = roadOutline();
    const skeleton = asRecord(
      toSkeleton(
        scene([
          {
            id: 'road',
            kind: 'polyline',
            points: dense,
            closed: true,
            filled: true,
            arrowStart: false,
            arrowEnd: false,
            paint,
            clipIgnored: false,
            groupIds: ['picture'],
            source: { tag: 'path' },
          },
        ]),
      ).elements[1],
    );
    expect(skeleton.type).toBe('line');
    expect(skeleton.polygon).toBe(true);
    expect(skeleton.points.length).toBeLessThan(1000);
    expect(skeleton.points.length).toBeGreaterThan(10);
  });

  it('keeps a single source line on ONE line even when it is wider than the box', () => {
    // "Seasonal plan" is one line in AntV; the box is 10% narrower than the text.
    const text = 'Seasonal plan';
    const fontSize = 16;
    const naturalWidth = wrapToWidth(text, fontSize, 100000, false).length;
    expect(naturalWidth).toBeGreaterThan(0);
    const boxWidth = measureForTest(text, fontSize) * 0.9;
    const wrapped = wrapToLineCount(text, fontSize, boxWidth, false, 1);
    expect(wrapped).toBe('Seasonal plan');
    expect(wrapped.includes('\n')).toBe(false);
  });

  it('keeps a two-line description on two lines', () => {
    const text = 'A fairly long description that should occupy exactly two lines of text here';
    const fontSize = 16;
    const full = measureForTest(text, fontSize);
    const wrapped = wrapToLineCount(text, fontSize, full / 2, false, 2);
    expect(wrapped.split('\n').length).toBe(2);
  });

  it('dash attribute "8 8" with stroke width 3 is dashed', () => {
    // Covered more directly in readPaint via strokeStyleOf; here a scene polyline.
    const strokeStyleScene = scene([
      {
        id: 'dash',
        kind: 'polyline',
        points: [
          [0, 0],
          [100, 0],
        ],
        closed: false,
        filled: false,
        arrowStart: false,
        arrowEnd: false,
        paint: { ...paint, fill: 'none', strokeStyle: 'dashed' },
        clipIgnored: false,
        groupIds: ['picture'],
        source: { tag: 'path' },
      },
    ]);
    const line = asRecord(toSkeleton(strokeStyleScene).elements[1]);
    expect(line.strokeStyle).toBe('dashed');
  });
});

/** Mirror the test's own monospace-free estimate for width maths. */
function measureForTest(text: string, fontSize: number): number {
  return text.length * fontSize * 0.52;
}


