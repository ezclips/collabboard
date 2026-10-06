import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { WORLD_VOLCANOES } from './worldVolcanoes';

describe('World Volcanoes', () => {
  it('validates against the board template schema and names itself', () => {
    expect(boardTemplateSchema.safeParse(WORLD_VOLCANOES).success).toBe(true);
    expect(WORLD_VOLCANOES.id).toBe('world-volcanoes');
    expect(WORLD_VOLCANOES.name).toBe('World Volcanoes');
    expect(WORLD_VOLCANOES.layout).toBe('map');
  });

  it('places the five pins at their exact coordinates', () => {
    const containers = WORLD_VOLCANOES.posts.filter((post) => post.kind === 'column');
    expect(containers.map((container) => container.title)).toEqual([
      'Mount Fuji, Japan',
      'Mount Vesuvius, Italy',
      'Kīlauea, Hawaii, USA',
      'Mount Etna, Italy',
      'Reykjanes Peninsula, Iceland',
    ]);
    expect(containers.map((container) => [container.location?.lat, container.location?.lng])).toEqual([
      [35.3606, 138.7274],
      [40.8214, 14.426],
      [19.4069, -155.2834],
      [37.751, 14.9934],
      [63.88, -22.4],
    ]);
  });

  it('gives every pin its expected children', () => {
    const containers = WORLD_VOLCANOES.posts.filter((post) => post.kind === 'column');
    const counts = containers.map(
      (container) =>
        WORLD_VOLCANOES.posts.filter(
          (post) => post.kind !== 'column' && post.kind !== 'section' && post.parent === container.key,
        ).length,
    );
    expect(counts).toEqual([3, 2, 3, 2, 2]);
  });
});
