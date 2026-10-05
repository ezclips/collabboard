// @vitest-environment jsdom
//
// PATCH-281. The straight-line and gradient-stroke losses and the pattern skip,
// using the same `SvgGeometry` stub seam as `readSvgScene.test.ts`. The markup
// is the real AntV markup from the CTO's 276-design audit.
import { describe, expect, it } from 'vitest';

import { readSvgScene } from './readSvgScene';
import { buildReport, type ReportElement } from './report';
import { polylines, stub, svg } from './testGeometryStub';
import { toSkeleton } from './toSkeleton';

describe('PATCH-281 straight lines', () => {
  it('keeps a vertical path with a zero-width box: M4,0 L4,22', () => {
    const root = svg(`
      <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <path id="v" d="M4,0 L4,22" stroke-width="2" stroke="#e9a23b" fill="none" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { v: { x: 4, y: 0, width: 0, height: 22 } },
        paths: { v: [[{ x: 4, y: 0 }, { x: 4, y: 22 }]] },
      }),
    });
    const lines = polylines(scene.elements);
    expect(lines).toHaveLength(1);
    expect(lines[0].points).toEqual([[4, 0], [4, 22]]);
    expect(lines[0].closed).toBe(false);
    expect(lines[0].paint.stroke).toBe('#e9a23b');
    expect(lines[0].paint.strokeWidth).toBe(2);
    expect(scene.skips).toEqual([]);
  });

  it('keeps a horizontal path with a zero-height box: M324 426.8 L396 426.8', () => {
    const root = svg(`
      <svg viewBox="0 0 600 500" xmlns="http://www.w3.org/2000/svg">
        <path id="h" d="M 324 426.8 L 396 426.8" stroke="#E9A23B" stroke-width="2" fill="none" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { h: { x: 324, y: 426.8, width: 72, height: 0 } },
        paths: { h: [[{ x: 324, y: 426.8 }, { x: 396, y: 426.8 }]] },
      }),
    });
    const lines = polylines(scene.elements);
    expect(lines).toHaveLength(1);
    expect(lines[0].points).toEqual([[324, 426.8], [396, 426.8]]);
    expect(lines[0].paint.stroke).toBe('#e9a23b');
  });

  it('keeps a horizontal <line> with a zero-height box, opacity blended', () => {
    const root = svg(`
      <svg viewBox="0 0 600 100" xmlns="http://www.w3.org/2000/svg">
        <line id="l" x1="346" y1="73" x2="210" y2="73" stroke="#8E6AC8" stroke-width="1" opacity="0.8" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { l: { x: 210, y: 73, width: 136, height: 0 } },
        styles: { l: { opacity: '0.8' } },
      }),
    });
    const lines = polylines(scene.elements);
    expect(lines).toHaveLength(1);
    expect(lines[0].points).toEqual([[346, 73], [210, 73]]);
    // #8e6ac8 over white at 0.8 = #a588d3.
    expect(lines[0].paint.stroke).toBe('#a588d3');
    expect(lines[0].paint.blended).toBe(true);
  });

  it('keeps a path under transform="translate(0, 33)" with a zero-height box', () => {
    const root = svg(`
      <svg viewBox="0 0 134 80" xmlns="http://www.w3.org/2000/svg">
        <path id="u" d="M 0 1 L 134 1" stroke="#E9A23B" stroke-width="2" fill="none"
          transform="translate(0, 33)" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { u: { x: 0, y: 34, width: 134, height: 0 } },
        paths: { u: [[{ x: 0, y: 34 }, { x: 134, y: 34 }]] },
      }),
    });
    const lines = polylines(scene.elements);
    expect(lines).toHaveLength(1);
    expect(lines[0].points).toEqual([[0, 34], [134, 34]]);
    expect(lines[0].paint.stroke).toBe('#e9a23b');
  });

  it('keeps a blended stroke-opacity: M160 24 L160 212 at 0.08', () => {
    const root = svg(`
      <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
        <path id="g" d="M160 24 L160 212" stroke="#262626" stroke-opacity="0.08" fill="none" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { g: { x: 160, y: 24, width: 0, height: 188 } },
        paths: { g: [[{ x: 160, y: 24 }, { x: 160, y: 212 }]] },
      }),
    });
    const lines = polylines(scene.elements);
    expect(lines).toHaveLength(1);
    // #262626 at 0.08 over #ffffff.
    expect(lines[0].paint.stroke).toBe('#eeeeee');
    expect(lines[0].paint.blended).toBe(true);
  });

  it('still skips a zero-box shape with NO stroke', () => {
    const root = svg(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <path id="z" d="M0 0 L0 10" fill="none" stroke="none" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { z: { x: 0, y: 0, width: 0, height: 10 } },
        paths: { z: [[{ x: 0, y: 0 }, { x: 0, y: 10 }]] },
      }),
    });
    expect(scene.elements).toHaveLength(0);
    expect(scene.skips.map((skip) => skip.reason)).toEqual(['invisible']);
  });
});

describe('PATCH-281 gradient strokes', () => {
  const gradientMarkup = `
    <defs>
      <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="622" y1="239.5" x2="462" y2="117">
        <stop offset="0%" stop-color="#E9A23B" />
        <stop offset="100%" stop-color="#4F9D8F" />
      </linearGradient>
    </defs>
    <path id="c" d="M 622 239.5 C 542 239.5 542 117 462 117" stroke="url(#g)" stroke-width="3" fill="none" />
  `;

  function cubicStub() {
    return stub({
      boxes: { c: { x: 462, y: 117, width: 160, height: 122.5 } },
      paths: {
        c: [
          [
            { x: 622, y: 239.5 },
            { x: 542, y: 200 },
            { x: 500, y: 160 },
            { x: 462, y: 117 },
          ],
        ],
      },
    });
  }

  it('flattens a gradient STROKE (attribute form url(#g)) to the 0.5 mix', () => {
    const scene = readSvgScene(svg(`<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">${gradientMarkup}</svg>`), {
      background: '#ffffff',
      geometry: cubicStub(),
    });
    const lines = polylines(scene.elements);
    expect(lines).toHaveLength(1);
    expect(lines[0].paint.stroke).toBe('#9ca065');
    expect(scene.losses.gradientFlattened).toBe(1);
    expect(scene.skips.filter((skip) => skip.reason !== 'definition')).toEqual([]);
  });

  it('flattens a gradient STROKE in the computed form url("#g") with quotes', () => {
    const root = svg(`
      <svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="622" y1="239.5" x2="462" y2="117">
            <stop offset="0%" stop-color="#E9A23B" />
            <stop offset="100%" stop-color="#4F9D8F" />
          </linearGradient>
        </defs>
        <path id="c" d="M 622 239.5 C 542 239.5 542 117 462 117" fill="none" stroke-width="3" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({
        boxes: { c: { x: 462, y: 117, width: 160, height: 122.5 } },
        paths: {
          c: [
            [
              { x: 622, y: 239.5 },
              { x: 542, y: 200 },
              { x: 500, y: 160 },
              { x: 462, y: 117 },
            ],
          ],
        },
        styles: { c: { stroke: 'url("#g")', strokeWidth: '3' } },
      }),
    });
    const lines = polylines(scene.elements);
    expect(lines).toHaveLength(1);
    expect(lines[0].paint.stroke).toBe('#9ca065');
    expect(scene.losses.gradientFlattened).toBe(1);
  });
});

describe('PATCH-281 pattern fills', () => {
  it('skips a pattern-filled rect as a counted patternIgnored loss, not invisible', () => {
    const root = svg(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="p" patternUnits="userSpaceOnUse" width="4" height="4">
            <path d="M0 0 L4 4" stroke="#000000" stroke-opacity="0.03" />
          </pattern>
        </defs>
        <rect id="r" x="10" y="10" width="40" height="40" fill="url(#p)" />
      </svg>
    `);
    const scene = readSvgScene(root, {
      background: '#ffffff',
      geometry: stub({ boxes: { r: { x: 10, y: 10, width: 40, height: 40 } } }),
    });
    expect(scene.elements).toHaveLength(0);
    expect(scene.losses.patternIgnored).toBe(1);
    const reasons = scene.skips.map((skip) => skip.reason);
    expect(reasons).toContain('pattern');
    expect(reasons).not.toContain('invisible');
  });
});

// Addendum 1: zero-length stroked paths (the stairs/zigzag/circle-progress dots).
describe('PATCH-281 Addendum 1 dots', () => {
  const dotMarkup = (linecap: string) => `
    <svg viewBox="0 0 600 500" xmlns="http://www.w3.org/2000/svg">
      <path id="d" d="M 396 426.8 L 396 426.8" stroke="#E9A23B" stroke-width="6"${linecap} />
    </svg>
  `;

  function dotScene(attributes: string) {
    return readSvgScene(svg(dotMarkup(attributes)), {
      background: '#ffffff',
      geometry: stub({
        boxes: { d: { x: 396, y: 426.8, width: 0, height: 0 } },
        paths: { d: [[{ x: 396, y: 426.8 }, { x: 396, y: 426.8 }]] },
      }),
    });
  }

  it('round: a zero-length stroke becomes a filled ellipse of stroke width', () => {
    const scene = dotScene(' stroke-linecap="round"');
    expect(scene.elements).toHaveLength(1);
    const dot = scene.elements[0];
    if (dot.kind !== 'ellipse') throw new Error('expected ellipse');
    expect(dot.box).toEqual({ x: 393, y: 423.8, width: 6, height: 6 });
    expect(dot.paint.fill).toBe('#e9a23b');
    expect(dot.paint.stroke).toBe('none');
    expect(scene.skips).toEqual([]);
    const { elements } = toSkeleton(scene);
    const report = buildReport({
      scene,
      elements: elements as unknown as ReportElement[],
      files: {},
      conversionMs: 5,
    });
    expect(report.shapeCoverage.total).toBe(1);
    expect(report.shapeCoverage.converted).toBe(1);
  });

  it('square: becomes a filled square of stroke width', () => {
    const scene = dotScene(' stroke-linecap="square"');
    expect(scene.elements).toHaveLength(1);
    const dot = scene.elements[0];
    if (dot.kind !== 'rect') throw new Error('expected rect');
    expect(dot.box).toEqual({ x: 393, y: 423.8, width: 6, height: 6 });
    expect(dot.radius).toBe(0);
    expect(dot.paint.fill).toBe('#e9a23b');
    expect(dot.paint.stroke).toBe('none');
  });

  it('butt (default): skipped as hidden because it draws nothing', () => {
    const scene = dotScene('');
    expect(scene.elements).toHaveLength(0);
    expect(scene.skips.map((skip) => skip.reason)).toEqual(['hidden']);
  });
});
