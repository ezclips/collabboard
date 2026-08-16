import { describe, expect, it } from 'vitest';
import {
  getContainerCrossAxis,
  getContainerCrossCoordinate,
  getContainerCrossSize,
  getContainerPrimaryAxis,
  getContainerPrimaryCoordinate,
  getContainerPrimarySize,
  resolveContainerChildren,
  resolveContainerOrientation,
} from './containerModel';

type FixturePadlet = {
  id: string;
  metadata?: { childPadletIds?: unknown; parentId?: unknown };
};

const child = (id: string, parentId?: string): FixturePadlet => ({
  id,
  metadata: parentId ? { parentId } : {},
});

describe('container orientation model', () => {
  it.each([
    [undefined, 'vertical'],
    [null, 'vertical'],
    [{}, 'vertical'],
    [{ orientation: 'vertical' }, 'vertical'],
    [{ orientation: 'horizontal' }, 'horizontal'],
    [{ orientation: 'diagonal' }, 'vertical'],
    [{ orientation: 42 }, 'vertical'],
  ])('resolves %j as %s', (metadata, expected) => {
    expect(resolveContainerOrientation(metadata as never)).toBe(expected);
  });

  it('is pure and does not add a default metadata field', () => {
    const metadata = { cardColor: '#fff' };
    expect(resolveContainerOrientation(metadata)).toBe('vertical');
    expect(metadata).toEqual({ cardColor: '#fff' });
  });
});

describe('container membership model', () => {
  it('preserves canonical order and appends linked-only children', () => {
    const container = { id: 'container', metadata: { childPadletIds: ['b', 'a', 'b', 'missing'] } };
    const padlets = [child('a', 'container'), child('b', 'container'), child('c', 'container'), child('other', 'other')];

    expect(resolveContainerChildren(container, padlets).map((padlet) => padlet.id)).toEqual(['b', 'a', 'c']);
  });

  it('handles absent and empty childPadletIds without mutation', () => {
    const container = { id: 'container', metadata: {} };
    const padlets = [child('a', 'container')];
    const before = JSON.stringify(container);

    expect(resolveContainerChildren(container, padlets).map((padlet) => padlet.id)).toEqual(['a']);
    expect(JSON.stringify(container)).toBe(before);
  });

  it('omits stale IDs, excludes unrelated posts, and does not duplicate backlinks', () => {
    const container = { id: 'container', metadata: { childPadletIds: ['a', 'deleted', 'a'] } };
    const padlets = [child('a', 'container'), child('b', 'other'), child('c')];

    expect(resolveContainerChildren(container, padlets).map((padlet) => padlet.id)).toEqual(['a']);
  });

  it('keeps a listed child in canonical order even when its backlink differs', () => {
    const container = { id: 'container', metadata: { childPadletIds: ['a'] } };
    const padlets = [child('a', 'other'), child('b', 'container')];

    expect(resolveContainerChildren(container, padlets).map((padlet) => padlet.id)).toEqual(['a', 'b']);
  });
});

describe('container axis model', () => {
  const rect = { x: 10, y: 20, width: 30, height: 40 };

  it('maps vertical to y-primary and x-cross', () => {
    expect(getContainerPrimaryAxis('vertical')).toBe('y');
    expect(getContainerPrimaryCoordinate(rect, 'vertical')).toBe(20);
    expect(getContainerPrimarySize(rect, 'vertical')).toBe(40);
    expect(getContainerCrossAxis('vertical')).toBe('x');
    expect(getContainerCrossCoordinate(rect, 'vertical')).toBe(10);
    expect(getContainerCrossSize(rect, 'vertical')).toBe(30);
  });

  it('maps horizontal to x-primary and y-cross without rendering it', () => {
    expect(getContainerPrimaryAxis('horizontal')).toBe('x');
    expect(getContainerPrimaryCoordinate(rect, 'horizontal')).toBe(10);
    expect(getContainerPrimarySize(rect, 'horizontal')).toBe(30);
    expect(getContainerCrossAxis('horizontal')).toBe('y');
    expect(getContainerCrossCoordinate(rect, 'horizontal')).toBe(20);
    expect(getContainerCrossSize(rect, 'horizontal')).toBe(40);
  });
});
