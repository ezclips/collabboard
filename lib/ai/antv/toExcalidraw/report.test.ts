import { describe, expect, it } from 'vitest';

import { buildReport, type ReportElement } from './report';
import type { PictureScene, SceneElement } from './scene';

const paint = {
  fill: '#dceef5',
  stroke: '#2c7da0',
  strokeWidth: 2,
  strokeStyle: 'solid' as const,
  opacity: 100,
  blended: false,
};

const rect: SceneElement = {
  id: 'r1',
  kind: 'rect',
  box: { x: 10, y: 10, width: 80, height: 40 },
  radius: 0,
  pill: false,
  paint,
  clipIgnored: false,
  groupIds: ['picture'],
  source: { tag: 'rect' },
};

const text: Extract<SceneElement, { kind: 'text' }> = {
  id: 't1',
  kind: 'text',
  text: 'Hello world',
  box: { x: 15, y: 15, width: 60, height: 20 },
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
};

function scene(elements: SceneElement[], extra: Partial<PictureScene> = {}): PictureScene {
  return {
    version: 1,
    width: 200,
    height: 100,
    background: '#ffffff',
    elements,
    skips: [],
    visibleShapes: elements.filter((el) => el.kind === 'rect' || el.kind === 'ellipse' || el.kind === 'polyline').length,
    resolvableIcons: 0,
    losses: {
      blended: 1,
      gradientFlattened: 0,
      clipIgnored: 0,
      lostFontWeight: 0,
      lostFontStyle: 0,
      iconsAsImage: 0,
      mixedTextStyle: 0,
      shadowIgnored: 0,
      pathFallback: 0,
    },
    ...extra,
  };
}

function output(): ReportElement[] {
  return [
    {
      id: 'background',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      backgroundColor: '#ffffff',
      strokeColor: 'transparent',
      customData: { antvId: 'background' },
    },
    {
      id: 'r1',
      type: 'rectangle',
      x: 10,
      y: 10,
      width: 80,
      height: 40,
      backgroundColor: '#dceef5',
      strokeColor: '#2c7da0',
      customData: { antvId: 'r1' },
    },
    {
      id: 't1',
      type: 'text',
      x: 15,
      y: 15,
      width: 60,
      height: 20,
      backgroundColor: 'transparent',
      strokeColor: '#374151',
      customData: { antvId: 't1' },
      text: 'Hello world',
    } as ReportElement & { text: string },
  ];
}

function textElement(id: string, value: string, y = 15): SceneElement {
  return {
    ...text,
    id,
    text: value,
    box: { ...text.box, y },
  };
}

function textOutput(id: string, value: string, y = 15): ReportElement & { text: string } {
  return {
    id,
    type: 'text',
    x: 15,
    y,
    width: 60,
    height: 20,
    backgroundColor: 'transparent',
    strokeColor: '#374151',
    customData: { antvId: id },
    text: value,
  };
}

describe('PATCH-277 report', () => {
  it('reports full coverage for a faithful conversion', () => {
    const report = buildReport({
      scene: scene([rect, text]),
      elements: output(),
      files: {},
      conversionMs: 42,
      template: 'list-grid-badge-card',
      theme: 'classic',
    });
    expect(report.textCoverage.ratio).toBe(1);
    expect(report.textCoverage.missing).toEqual([]);
    expect(report.textCoverage.extra).toEqual([]);
    expect(report.shapeCoverage.ratio).toBe(1);
    expect(report.colourFidelity.ratio).toBe(1);
    expect(report.geometry.ratio).toBe(1);
    expect(report.passedTime).toBe(true);
    expect(report.passed).toBe(true);
    expect(report.elementCount).toBe(3);
    expect(report.losses.pillApproximated).toBe(0);
  });

  it('passes a LEGITIMATE duplicate: the same string twice in and twice out', () => {
    // Addendum 1: a title and a root node both read "Seasonal plan".
    const duplicated = scene([textElement('t1', 'Seasonal plan'), textElement('t2', 'Seasonal plan', 40)]);
    const report = buildReport({
      scene: duplicated,
      elements: [textOutput('t1', 'Seasonal plan'), textOutput('t2', 'Seasonal plan', 40)],
      files: {},
      conversionMs: 5,
    });
    expect(report.textCoverage.total).toBe(2);
    expect(report.textCoverage.missing).toEqual([]);
    expect(report.textCoverage.extra).toEqual([]);
    expect(report.textCoverage.passed).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('fails a REAL duplicate: one source string but two output texts', () => {
    const once = scene([textElement('t1', 'Seasonal plan')]);
    const report = buildReport({
      scene: once,
      elements: [textOutput('t1', 'Seasonal plan'), textOutput('tX', 'Seasonal plan', 40)],
      files: {},
      conversionMs: 5,
    });
    expect(report.textCoverage.extra).toEqual(['Seasonal plan']);
    expect(report.textCoverage.missing).toEqual([]);
    expect(report.textCoverage.passed).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('flags a deliberate text miss, a shape miss and an unknown skip', () => {
    // Deliberate: the text says something else and the rect is missing.
    const broken = output().map((element) =>
      element.id === 't1' ? ({ ...element, text: 'Nope' } as ReportElement) : element,
    );
    const brokenScene = scene([rect, text], {
      skips: [{ id: 's1', tag: 'path', reason: 'unknown' }],
      visibleShapes: 2,
    });
    const report = buildReport({
      scene: brokenScene,
      elements: broken.filter((element) => element.id !== 'r1'),
      files: {},
      conversionMs: 300,
    });
    expect(report.textCoverage.missing).toEqual(['Hello world']);
    expect(report.textCoverage.extra).toEqual(['Nope']);
    expect(report.textCoverage.passed).toBe(false);
    expect(report.shapeCoverage.converted).toBe(0);
    expect(report.shapeCoverage.passed).toBe(false);
    expect(report.shapeCoverage.unknown).toBe(1);
    expect(report.geometry.passed).toBe(false);
    expect(report.passedTime).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('treats an all-transparent fill as transparent and counts a pill approximation', () => {
    const pill: SceneElement = { ...rect, id: 'p1', pill: true, radius: 20, paint: { ...paint, fill: 'none' } };
    const report = buildReport({
      scene: scene([pill]),
      elements: [
        {
          id: 'p1',
          type: 'rectangle',
          x: 10,
          y: 10,
          width: 80,
          height: 40,
          backgroundColor: 'transparent',
          strokeColor: '#2c7da0',
          customData: { antvId: 'p1' },
        },
      ],
      files: {},
      conversionMs: 1,
    });
    expect(report.colourFidelity.ratio).toBe(1);
    expect(report.losses.pillApproximated).toBe(1);
    expect(report.passed).toBe(true);
  });
});
