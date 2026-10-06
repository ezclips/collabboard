import { describe, expect, it } from 'vitest';
import { BOARD_FORMATS, BOARD_FORMAT_GROUPS, formatById } from './formatCatalog';

/**
 * PATCH-301. The format catalog's exact copy and shape.
 */
describe('formatCatalog', () => {
  it('lists ten formats across two groups', () => {
    expect(BOARD_FORMATS).toHaveLength(10);
    expect(BOARD_FORMAT_GROUPS).toHaveLength(2);
    expect(BOARD_FORMAT_GROUPS[0].label).toBe('Collect and arrange');
    expect(BOARD_FORMAT_GROUPS[1].label).toBe('Plan, track and draw');
    expect(BOARD_FORMAT_GROUPS[0].formats).toHaveLength(6);
    expect(BOARD_FORMAT_GROUPS[1].formats).toHaveLength(4);
  });

  it('uses the existing layout ids in order', () => {
    expect(BOARD_FORMATS.map((format) => format.id)).toEqual([
      'freeform',
      'wall',
      'columns',
      'grid',
      'timeline',
      'map',
      'kanban',
      'gantt',
      'scheduler',
      'drawing',
    ]);
  });

  it('uses the exact copy', () => {
    expect(BOARD_FORMATS.map((format) => [format.name, format.description])).toEqual([
      ['Freeform', 'Your research board: notes, PDFs and pictures anywhere.'],
      ['Wall', 'Cards in a tidy, flowing wall.'],
      ['Columns', 'Sort posts into named columns.'],
      ['Grid', 'Even rows of equal cards.'],
      ['Timeline', 'Posts in date order along a line.'],
      ['Map', 'Pin posts to places on a world map.'],
      ['Kanban', 'Move tasks through stages.'],
      ['Gantt', 'Schedule tasks and their dependencies.'],
      ['Scheduler', 'Events on a calendar.'],
      ['Drawing', 'One big whiteboard to draw on.'],
    ]);
  });

  it('never calls Map a mind map', () => {
    const copy = BOARD_FORMATS.map((format) => `${format.name} ${format.description}`).join(' ');
    expect(copy).not.toMatch(/mind map/i);
  });

  it('gives only Freeform a tag, "Board AI + wiki"', () => {
    const tagged = BOARD_FORMATS.filter((format) => format.tag);
    expect(tagged).toHaveLength(1);
    expect(tagged[0].id).toBe('freeform');
    expect(tagged[0].tag).toBe('Board AI + wiki');
  });

  it('finds a format by id and returns undefined for an unknown one', () => {
    expect(formatById('freeform')?.name).toBe('Freeform');
    expect(formatById(null)).toBeUndefined();
    expect(formatById('nope' as never)).toBeUndefined();
  });
});
