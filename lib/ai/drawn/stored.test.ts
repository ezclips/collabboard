import { describe, expect, it } from 'vitest';

import type { ScenePolylineElement } from '@/lib/ai/antv/toExcalidraw/scene';
import type { DrawnDiagramData } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';

import { parseDrawnPicture } from './format';
import { sceneFromStored } from './stored';

const CX = 300;
const CY = 300;
const OUTER_R = 160;

const ITEM_FILLS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed'];
const ITEM_VALUES = [24, 40, 26, 10, 50];

const outline: VisualOutline = {
  title: 'Budget',
  ordered: false,
  kind: 'parts',
  items: ITEM_VALUES.map((value, index) => ({ label: `Item ${index + 1}`, value })),
};

/** The stored picture the model wrote: wedges with NO angles, text with NO lines. */
const data: DrawnDiagramData = {
  type: 'diagram',
  subtype: 'drawn',
  renderer: 'drawn',
  title: 'Budget',
  kind: 'pie',
  seed: 1,
  outline,
  picture: {
    version: 1,
    width: 800,
    height: 600,
    background: '#ffffff',
    elements: [
      ...ITEM_FILLS.map((fill, item) => ({
        id: `wedge-${item}`,
        type: 'wedge' as const,
        item,
        cx: CX,
        cy: CY,
        r: OUTER_R,
        inner: 80,
        fill,
      })),
      {
        id: 'label',
        type: 'text' as const,
        text: 'A long card label that must wrap across several lines inside its box',
        x: 40,
        y: 480,
        w: 140,
        size: 16,
        color: '#111111',
      },
    ],
  },
};

function wedges(dataValue: DrawnDiagramData): ScenePolylineElement[] {
  return sceneFromStored(dataValue).elements.filter(
    (element): element is ScenePolylineElement =>
      element.kind === 'polyline' && element.closed && element.filled,
  );
}

/** Unwrapped angular span of a wedge's outer arc, in degrees. */
function spanDegrees(wedge: ScenePolylineElement): number {
  // The outer arc sits at OUTER_R; the inner arc at half that, so a 0.9*R floor
  // keeps the inner arc out despite float drift on the exact radius.
  const outer = wedge.points.filter(([x, y]) => Math.hypot(x - CX, y - CY) > OUTER_R * 0.9);
  const angle = ([x, y]: readonly [number, number]) => Math.atan2(y - CY, x - CX);
  let span = 0;
  for (let index = 1; index < outer.length; index += 1) {
    let delta = angle(outer[index]) - angle(outer[index - 1]);
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    span += delta;
  }
  return Math.abs((span * 180) / Math.PI);
}

describe('PATCH-284 Addendum 1 sceneFromStored', () => {
  it('repairs a pie whose wedges have no angles into slices proportional to the outline', () => {
    const total = ITEM_VALUES.reduce((sum, value) => sum + value, 0);
    const slices = wedges(data);

    expect(slices).toHaveLength(ITEM_VALUES.length);
    expect(slices.map((wedge) => wedge.paint.fill)).toEqual(ITEM_FILLS);
    slices.forEach((wedge, index) => {
      const expected = (ITEM_VALUES[index] / total) * 360;
      expect(spanDegrees(wedge)).toBeCloseTo(expected, 0);
    });
  });

  it('wraps a card text that arrived without lines', () => {
    const text = sceneFromStored(data).elements.find((element) => element.kind === 'text');
    expect(text?.kind).toBe('text');
    if (text?.kind === 'text') expect(text.lineCount).toBeGreaterThan(1);
  });

  it('is idempotent through a parser round-trip of the stored picture', () => {
    const roundTripped: DrawnDiagramData = {
      ...data,
      picture: parseDrawnPicture(data.picture).picture,
    };
    // The scene is compared by the SVG it produces, the renderer's visible output.
    const first = sceneFromStored(data).elements;
    const second = sceneFromStored(roundTripped).elements;
    expect(second).toEqual(first);
  });
});
