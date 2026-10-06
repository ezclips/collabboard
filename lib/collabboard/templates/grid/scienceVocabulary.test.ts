import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { SCIENCE_VOCABULARY } from './scienceVocabulary';

describe('Science Vocabulary', () => {
  it('validates against the board template schema and names itself', () => {
    expect(boardTemplateSchema.safeParse(SCIENCE_VOCABULARY).success).toBe(true);
    expect(SCIENCE_VOCABULARY.id).toBe('science-vocabulary');
    expect(SCIENCE_VOCABULARY.name).toBe('Science Vocabulary');
    expect(SCIENCE_VOCABULARY.layout).toBe('grid');
    expect(SCIENCE_VOCABULARY.previewUrl).toBe('/templates/grid/science-vocabulary/preview.jpg');
  });

  it('lists the two rows', () => {
    const sections = SCIENCE_VOCABULARY.posts.filter((post) => post.kind === 'section');
    expect(sections.map((section) => section.title)).toEqual(['Living things', 'Earth and water']);
  });

  it('lists the eight word cards with their row', () => {
    const containers = SCIENCE_VOCABULARY.posts.filter((post) => post.kind === 'column');
    expect(containers.map((container) => container.title)).toEqual([
      'Habitat',
      'Photosynthesis',
      'Pollination',
      'Migration',
      'Erosion',
      'Evaporation',
      'Water cycle',
      'Ecosystem',
    ]);
    expect(containers.map((container) => container.section)).toEqual([
      'living',
      'living',
      'living',
      'living',
      'earth',
      'earth',
      'earth',
      'earth',
    ]);
  });

  it('gives every word card its expected children', () => {
    const containers = SCIENCE_VOCABULARY.posts.filter((post) => post.kind === 'column');
    const counts = containers.map(
      (container) =>
        SCIENCE_VOCABULARY.posts.filter(
          (post) => post.kind !== 'column' && post.kind !== 'section' && post.parent === container.key,
        ).length,
    );
    expect(counts).toEqual([3, 3, 2, 2, 2, 2, 2, 2]);
  });
});
