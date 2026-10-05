// PATCH-287. `toSkeleton` writes the role map into `customData.antvRole` when
// one is passed; without it the output is exactly as before.
import { describe, expect, it } from 'vitest';

import type { PictureScene, SceneElement } from './scene';
import { toSkeleton } from './toSkeleton';

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

const rect: SceneElement = {
  id: 'r1',
  kind: 'rect',
  box: { x: 10, y: 10, width: 80, height: 40 },
  radius: 0,
  pill: false,
  paint: { fill: '#dceef5', stroke: '#2c7da0', strokeWidth: 2, strokeStyle: 'solid', opacity: 100, blended: false },
  clipIgnored: false,
  groupIds: ['item:0', 'picture'],
  source: { tag: 'rect', indexes: [0], elementType: 'item-label' },
};

function asRecord(value: unknown): Record<string, any> {
  return value as Record<string, any>;
}

describe('PATCH-287: toSkeleton roles', () => {
  it('writes antvRole from the passed map, including the background', () => {
    const roles = new Map([
      ['background', 'background'],
      ['r1', 'item-label@0#0'],
    ]);
    const { elements } = toSkeleton(scene([rect]), { roles });
    expect(asRecord(elements[0]).customData).toEqual({
      antvId: 'background',
      antvKind: 'background',
      antvRole: 'background',
    });
    expect(asRecord(elements[1]).customData).toEqual({
      antvId: 'r1',
      antvKind: 'rect',
      antvRole: 'item-label@0#0',
    });
  });

  it('omits antvRole when no map is passed', () => {
    const { elements } = toSkeleton(scene([rect]));
    expect(asRecord(elements[0]).customData).toEqual({ antvId: 'background', antvKind: 'background' });
    expect(asRecord(elements[1]).customData).toEqual({ antvId: 'r1', antvKind: 'rect' });
  });
});
