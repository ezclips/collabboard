import { describe, expect, it } from 'vitest';
import { DOT_GRID_UNIT_PX, IMAGE_CROP_TO_GRID_HEIGHT_PX, findContainerOverlappingRect, getEligibleContainerDestinations } from './utils';
import type { Padlet } from '@/types/collabboard';

function padlet(overrides: Partial<Padlet> & { id: string }): Padlet {
  return {
    id: overrides.id,
    type: overrides.type ?? 'note',
    title: overrides.title ?? '',
    content: overrides.content ?? '',
    position_x: overrides.position_x ?? 0,
    position_y: overrides.position_y ?? 0,
    width: overrides.width ?? 200,
    height: overrides.height ?? 150,
    metadata: overrides.metadata ?? {},
  } as unknown as Padlet;
}

describe('getEligibleContainerDestinations', () => {
  it('returns container-type padlets only', () => {
    const containerA = padlet({ id: 'c1', type: 'container' });
    const note = padlet({ id: 'p1', type: 'note' });

    const result = getEligibleContainerDestinations([containerA, note], 'p1');

    expect(result).toEqual([containerA]);
  });

  it('excludes the post itself (self-containment guard)', () => {
    const selfContainer = padlet({ id: 'c1', type: 'container' });

    const result = getEligibleContainerDestinations([selfContainer], 'c1');

    expect(result).toEqual([]);
  });

  it('excludes containers already nested inside another container', () => {
    const rootContainer = padlet({ id: 'c1', type: 'container' });
    const nestedContainer = padlet({ id: 'c2', type: 'container', metadata: { parentId: 'c1' } });
    const post = padlet({ id: 'p1', type: 'note' });

    const result = getEligibleContainerDestinations([rootContainer, nestedContainer, post], 'p1');

    expect(result).toEqual([rootContainer]);
  });

  it('recognizes metadata-flagged containers (kind/isContainer), not just type === "container"', () => {
    const flaggedContainer = padlet({ id: 'c1', type: 'note', metadata: { kind: 'container' } });
    const post = padlet({ id: 'p1', type: 'note' });

    const result = getEligibleContainerDestinations([flaggedContainer, post], 'p1');

    expect(result).toEqual([flaggedContainer]);
  });

  it('returns an empty list when no containers exist', () => {
    const post = padlet({ id: 'p1', type: 'note' });

    expect(getEligibleContainerDestinations([post], 'p1')).toEqual([]);
  });
});

describe('findContainerOverlappingRect (post-refactor regression)', () => {
  it('still finds the overlapping eligible container', () => {
    const container = padlet({ id: 'c1', type: 'container', position_x: 0, position_y: 0, width: 300, height: 300 });
    const dragged = padlet({ id: 'p1' });

    const result = findContainerOverlappingRect(
      [container, dragged],
      { x: 50, y: 50, width: 100, height: 100 },
      'p1',
    );

    expect(result).toEqual(container);
  });

  it('still excludes nested containers from overlap results', () => {
    const nestedContainer = padlet({
      id: 'c2',
      type: 'container',
      position_x: 0,
      position_y: 0,
      width: 300,
      height: 300,
      metadata: { parentId: 'c1' },
    });
    const dragged = padlet({ id: 'p1' });

    const result = findContainerOverlappingRect(
      [nestedContainer, dragged],
      { x: 50, y: 50, width: 100, height: 100 },
      'p1',
    );

    expect(result).toBeNull();
  });
});

describe('DOT_GRID_UNIT_PX / IMAGE_CROP_TO_GRID_HEIGHT_PX (PATCH 9B)', () => {
  it('matches CanvasClient.tsx\'s canonical dot-grid background pattern spacing', () => {
    expect(DOT_GRID_UNIT_PX).toBe(18);
  });

  it('the image crop-to-grid height is a whole multiple of the grid unit', () => {
    expect(IMAGE_CROP_TO_GRID_HEIGHT_PX % DOT_GRID_UNIT_PX).toBe(0);
    expect(IMAGE_CROP_TO_GRID_HEIGHT_PX).toBe(216);
  });
});
