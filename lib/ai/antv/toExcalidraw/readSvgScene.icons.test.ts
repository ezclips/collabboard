// @vitest-environment jsdom
//
// PATCH-281. `icons: 'strokes'` mode and the 2-point vertical polyline skeleton,
// using the shared stub kit (`testGeometryStub.ts`).
import { describe, expect, it } from 'vitest';

import type { SvgGeometry } from './geometry';
import { readSvgScene } from './readSvgScene';
import { buildReport, type ReportElement } from './report';
import type { PictureScene, SceneElement } from './scene';
import { polylines, stub, svg } from './testGeometryStub';
import { toSkeleton } from './toSkeleton';

function sunRoot(): Element {
  return svg(`
    <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
      <use id="icon" href="#sun" x="100" y="50" width="24" height="24" />
    </svg>
  `);
}

function sunSymbol(): SVGSymbolElement {
  return svg(`
    <symbol id="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1 L12 3" />
    </symbol>
  `) as unknown as SVGSymbolElement;
}

function sunStub(): SvgGeometry {
  return stub({
    boxes: { icon: { x: 100, y: 50, width: 24, height: 24 } },
    styles: { icon: { color: '#2C7DA0' } },
    symbols: { sun: sunSymbol() },
  });
}

describe('PATCH-281 icons as strokes', () => {
  it('emits the symbol geometry as strokes in the <use> box', () => {
    const scene = readSvgScene(sunRoot(), { background: '#ffffff', icons: 'strokes', geometry: sunStub() });
    expect(scene.elements.some((el) => el.kind === 'image')).toBe(false);
    const ellipses = scene.elements.filter((el) => el.kind === 'ellipse');
    expect(ellipses).toHaveLength(1);
    if (ellipses[0].kind !== 'ellipse') throw new Error('expected ellipse');
    expect(ellipses[0].box).toEqual({ x: 107, y: 57, width: 10, height: 10 });
    expect(ellipses[0].paint.stroke).toBe('#2c7da0');
    expect(ellipses[0].paint.strokeWidth).toBe(2);
    const lines = polylines(scene.elements);
    expect(lines).toHaveLength(1);
    expect(lines[0].points).toEqual([[112, 51], [112, 53]]);
    // Excalidraw groupIds are innermost-first: the icon group comes FIRST.
    expect(scene.elements.every((el) => el.groupIds[0] === 'icon:0')).toBe(true);
    expect(scene.elements.every((el) => el.groupIds[1] === 'picture')).toBe(true);
    expect(scene.losses.iconsAsImage).toBe(0);
    expect(scene.losses.iconsAsStrokes).toBe(1);
    expect(scene.skips).toEqual([]);
  });

  it('keeps image mode unchanged by default', () => {
    const scene = readSvgScene(sunRoot(), { background: '#ffffff', geometry: sunStub() });
    expect(scene.elements.filter((el) => el.kind === 'image')).toHaveLength(1);
    expect(scene.losses.iconsAsImage).toBe(1);
    expect(scene.losses.iconsAsStrokes).toBe(0);
  });

  it('counts an icon converted in strokes mode in the report icon coverage', () => {
    const scene = readSvgScene(sunRoot(), { background: '#ffffff', icons: 'strokes', geometry: sunStub() });
    const { elements } = toSkeleton(scene);
    const report = buildReport({
      scene,
      elements: elements as unknown as ReportElement[],
      files: {},
      conversionMs: 5,
    });
    expect(report.iconCoverage.total).toBe(1);
    expect(report.iconCoverage.converted).toBe(1);
    expect(report.iconCoverage.ratio).toBe(1);
  });
});

describe('PATCH-281 skeleton line', () => {
  function scene(elements: SceneElement[]): PictureScene {
    return {
      version: 1,
      width: 100,
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
        iconsAsStrokes: 0,
        mixedTextStyle: 0,
        shadowIgnored: 0,
        pathFallback: 0,
        patternIgnored: 0,
      },
    };
  }

  it('turns a 2-point vertical polyline into a valid line with width 0', () => {
    const { elements } = toSkeleton(
      scene([
        {
          id: 'v',
          kind: 'polyline',
          points: [[5, 0], [5, 20]],
          closed: false,
          filled: false,
          arrowStart: false,
          arrowEnd: false,
          paint: { fill: 'none', stroke: '#e9a23b', strokeWidth: 2, strokeStyle: 'solid', opacity: 100, blended: false },
          clipIgnored: false,
          groupIds: ['picture'],
          source: { tag: 'path' },
        },
      ]),
    );
    const line = elements[1] as unknown as { type: string; width: number; height: number; points: number[][] };
    expect(line.type).toBe('line');
    expect(line.width).toBe(0);
    expect(line.height).toBe(20);
    expect(line.points).toHaveLength(2);
  });
});
