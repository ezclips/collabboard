// @vitest-environment jsdom
//
// PATCH-281 Addendum 2. A filled closed path whose sampled points do NOT repeat
// the first point must still export as a valid Excalidraw polygon, or the fork's
// `restoreElements` (library load / saved-drawing reopen) drops the fill. The
// second test runs the real fork restore, not a fixture.
import { describe, expect, it } from 'vitest';

import { loadExcalidraw } from './loadExcalidraw';
import type { PictureScene, SceneElement } from './scene';
import { toSkeleton } from './toSkeleton';

const paint = {
  fill: '#fde68a',
  stroke: '#d97706',
  strokeWidth: 2,
  strokeStyle: 'solid' as const,
  opacity: 100,
  blended: false,
};

/** An open ring as AntV samples a pie wedge: first [0,2], last [0,48]. */
const OPEN_WEDGE: SceneElement = {
  id: 'wedge',
  kind: 'polyline',
  points: [
    [0, 2],
    [120, 0],
    [140, 100],
    [0, 48],
  ],
  closed: true,
  filled: true,
  arrowStart: false,
  arrowEnd: false,
  paint,
  clipIgnored: false,
  groupIds: ['picture'],
  source: { tag: 'path' },
};

function scene(elements: SceneElement[]): PictureScene {
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
      iconsAsStrokes: 0,
      mixedTextStyle: 0,
      shadowIgnored: 0,
      pathFallback: 0,
      patternIgnored: 0,
    },
  };
}

describe('PATCH-281 Addendum 2 closed polygons', () => {
  it('appends the first point so a filled closed polyline ends where it starts', () => {
    const { elements } = toSkeleton(scene([OPEN_WEDGE]));
    const line = elements[1] as unknown as { type: string; polygon: boolean; points: number[][] };
    expect(line.type).toBe('line');
    expect(line.polygon).toBe(true);
    const first = line.points[0];
    const last = line.points[line.points.length - 1];
    expect(last).toEqual(first);
    expect(line.points.length).toBeGreaterThan(3);
  });

  it('survives the fork restoreElements with polygon and fill intact', { timeout: 30000 }, async () => {
    const { convertToExcalidrawElements, restoreElements, setCustomTextMetricsProvider } = await loadExcalidraw();
    setCustomTextMetricsProvider({
      getLineWidth: (text: string, fontString: string) =>
        text.length * (Number.parseFloat(fontString) || 16) * 0.5,
    });
    const skeleton = toSkeleton(scene([OPEN_WEDGE])).elements;
    const converted = convertToExcalidrawElements(skeleton, { regenerateIds: false });
    const restored = restoreElements(converted, null);
    const line = restored.find((element) => element.type === 'line') as
      | { polygon?: boolean; backgroundColor?: string }
      | undefined;
    expect(line).toBeDefined();
    expect(line?.polygon).toBe(true);
    expect(line?.backgroundColor).toBe('#fde68a');
  });
});
