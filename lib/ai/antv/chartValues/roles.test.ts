// PATCH-287. `assignRoles` gives every converted element a stable role name so
// a later redraw can match old parts to new ones. The map must be deterministic
// and the background must be recognised.
import { describe, expect, it } from 'vitest';

import type { PictureScene, SceneElement } from '../toExcalidraw/scene';
import { assignRoles } from './roles';

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

function rect(id: string, source: SceneElement['source']): SceneElement {
  return {
    id,
    kind: 'rect',
    box: { x: 0, y: 0, width: 10, height: 10 },
    radius: 0,
    pill: false,
    paint: { fill: '#fff', stroke: '#000', strokeWidth: 1, strokeStyle: 'solid', opacity: 100, blended: false },
    clipIgnored: false,
    groupIds: ['picture'],
    source,
  };
}

function textEl(id: string, source: SceneElement['source']): SceneElement {
  return {
    id,
    kind: 'text',
    text: 'x',
    box: { x: 0, y: 0, width: 10, height: 10 },
    fontSize: 12,
    color: '#000000',
    align: 'left',
    monospace: false,
    mayDownload: false,
    lost: { fontWeight: false, fontStyle: false },
    svgText: false,
    mixedTextStyle: false,
    lineCount: 1,
    groupIds: ['picture'],
    source,
  };
}

describe('PATCH-287: assignRoles', () => {
  it('always gives the background the role "background"', () => {
    const roles = assignRoles(scene([]));
    expect(roles.get('background')).toBe('background');
  });

  it('numbers indexed roles by elementType@indexes, per prefix', () => {
    const roles = assignRoles(
      scene([
        textEl('a', { tag: 'text', indexes: [0], elementType: 'item-label' }),
        textEl('b', { tag: 'text', indexes: [0], elementType: 'item-label' }),
        textEl('c', { tag: 'text', indexes: [1], elementType: 'item-label' }),
      ]),
    );
    expect(roles.get('a')).toBe('item-label@0#0');
    expect(roles.get('b')).toBe('item-label@0#1');
    expect(roles.get('c')).toBe('item-label@1#0');
  });

  it('falls back to the kind when there is no elementType', () => {
    const roles = assignRoles(scene([textEl('a', { tag: 'text', indexes: [0] })]));
    expect(roles.get('a')).toBe('text@0#0');
  });

  it('numbers unindexed roles by type, in document order', () => {
    const roles = assignRoles(
      scene([
        rect('s0', { tag: 'path', elementType: 'slice' }),
        rect('s1', { tag: 'path', elementType: 'slice' }),
        rect('other', { tag: 'path' }),
      ]),
    );
    expect(roles.get('s0')).toBe('slice#0');
    expect(roles.get('s1')).toBe('slice#1');
    expect(roles.get('other')).toBe('rect#0');
  });

  it('is deterministic across two reads of the same scene', () => {
    const elements = [
      textEl('a', { tag: 'text', indexes: [0], elementType: 'item-label' }),
      rect('s0', { tag: 'path', elementType: 'slice' }),
    ];
    const first = assignRoles(scene(elements));
    const second = assignRoles(scene(elements));
    expect([...second.entries()]).toEqual([...first.entries()]);
  });
});
