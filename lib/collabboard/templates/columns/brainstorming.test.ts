import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { BRAINSTORMING } from './brainstorming';

describe('Brainstorming Board', () => {
  it('validates against the board template schema and names itself', () => {
    expect(boardTemplateSchema.safeParse(BRAINSTORMING).success).toBe(true);
    expect(BRAINSTORMING.id).toBe('brainstorming');
    expect(BRAINSTORMING.name).toBe('Brainstorming Board');
    expect(BRAINSTORMING.layout).toBe('columns');
    expect(BRAINSTORMING.previewUrl).toBe('/templates/columns/brainstorming/preview.jpg');
  });

  it('lists the five sections in order', () => {
    const sections = BRAINSTORMING.posts.filter((post) => post.kind === 'section');
    expect(sections.map((section) => section.title)).toEqual([
      'The question',
      'Ideas',
      'Questions',
      'Resources',
      'Next steps',
    ]);
  });

  it('places the expected number of root posts in each section', () => {
    const sections = BRAINSTORMING.posts.filter((post) => post.kind === 'section');
    const counts = sections.map(
      (section) =>
        BRAINSTORMING.posts.filter(
          (post) => post.kind !== 'section' && post.kind !== 'column' && post.section === section.key,
        ).length,
    );
    expect(counts).toEqual([3, 4, 4, 3, 2]);
  });

  it('marks only the first plan task done', () => {
    const todo = BRAINSTORMING.posts.find((post) => post.kind === 'todo');
    expect(todo && todo.kind === 'todo' ? todo.tasks.filter((task) => task.done).length : 0).toBe(1);
  });

  it('prepends the note title to the body so the name is visible', () => {
    const titles = [
      'Plant a school garden',
      'Bike to school week',
      'Swap shop',
      'Who waters the garden in summer?',
      'Where do we start?',
      'Useful contacts',
    ];
    for (const title of titles) {
      const note = BRAINSTORMING.posts.find((post) => post.kind === 'note' && post.title === title);
      const html = note && note.kind === 'note' ? note.html : '';
      expect(html.startsWith(`<p><strong>${title}</strong></p>`), title).toBe(true);
    }
  });
});
