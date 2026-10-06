import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { HISTORY_OF_FLIGHT } from './historyOfFlight';

describe('History of Flight', () => {
  it('validates against the board template schema and names itself', () => {
    expect(boardTemplateSchema.safeParse(HISTORY_OF_FLIGHT).success).toBe(true);
    expect(HISTORY_OF_FLIGHT.id).toBe('history-of-flight');
    expect(HISTORY_OF_FLIGHT.name).toBe('History of Flight');
    expect(HISTORY_OF_FLIGHT.layout).toBe('timeline');
    expect(HISTORY_OF_FLIGHT.previewUrl).toBe('/templates/timeline/history-of-flight/preview.jpg');
  });

  it('lists the seven entries in order', () => {
    const containers = HISTORY_OF_FLIGHT.posts.filter((post) => post.kind === 'column');
    expect(containers.map((container) => container.title)).toEqual([
      'The first hot-air balloon flight',
      'Gliding like a bird',
      'The first powered flight',
      'Across the Atlantic alone',
      'The jet age',
      'People on the Moon',
      'A home in orbit',
    ]);
  });

  it('gives each entry its year as the timeline badge label', () => {
    const containers = HISTORY_OF_FLIGHT.posts.filter((post) => post.kind === 'column');
    expect(containers.map((container) => container.timelineLabel)).toEqual([
      '1783',
      '1891',
      '1903',
      '1927',
      '1958',
      '1969',
      '1998',
    ]);
  });

  it('gives every entry its expected children', () => {
    const containers = HISTORY_OF_FLIGHT.posts.filter((post) => post.kind === 'column');
    const counts = containers.map(
      (container) =>
        HISTORY_OF_FLIGHT.posts.filter(
          (post) => post.kind !== 'column' && post.kind !== 'section' && post.parent === container.key,
        ).length,
    );
    expect(counts).toEqual([2, 2, 3, 2, 2, 3, 2]);
  });
});
