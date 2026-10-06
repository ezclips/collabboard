import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { PROJECT_PLAN } from './projectPlan';

describe('Project Plan', () => {
  it('validates against the board template schema', () => {
    const result = boardTemplateSchema.safeParse(PROJECT_PLAN);
    expect(result.success).toBe(true);
  });

  it('names itself and its layout', () => {
    expect(PROJECT_PLAN.id).toBe('project-plan');
    expect(PROJECT_PLAN.name).toBe('Project Plan');
    expect(PROJECT_PLAN.layout).toBe('freeform');
    expect(PROJECT_PLAN.previewUrl).toBe('/templates/freeform/project-plan/preview.jpg');
  });

  it('has three columns, each with four children in order', () => {
    const columns = PROJECT_PLAN.posts.filter((post) => post.kind === 'column');
    expect(columns.map((column) => column.key)).toEqual(['brief', 'inspiration', 'design']);
    for (const column of columns) {
      const children = PROJECT_PLAN.posts.filter((post) => post.kind !== 'column' && post.parent === column.key);
      expect(children).toHaveLength(4);
    }
  });

  it('has one to-do list with exactly two tasks done', () => {
    const todos = PROJECT_PLAN.posts.filter((post) => post.kind === 'todo');
    expect(todos).toHaveLength(1);
    if (todos[0].kind !== 'todo') throw new Error('expected a todo');
    expect(todos[0].tasks.filter((task) => task.done)).toHaveLength(2);
  });

  it('has the budget table and the two free posts', () => {
    const table = PROJECT_PLAN.posts.find((post) => post.kind === 'table');
    expect(table && table.kind === 'table' ? table.rows[0] : null).toEqual(['Phase', 'Hours', 'Cost']);
    const free = PROJECT_PLAN.posts.filter((post) => post.kind !== 'column' && post.parent === undefined);
    expect(free).toHaveLength(2);
  });

  it('sizes the columns to width 360 at x 60 / 460 / 860', () => {
    const columns = PROJECT_PLAN.posts.filter((post) => post.kind === 'column');
    expect(columns.map((column) => [column.x, column.width])).toEqual([
      [60, 360],
      [460, 360],
      [860, 360],
    ]);
  });

  it('places the free posts at x 1260', () => {
    const free = PROJECT_PLAN.posts.filter((post) => post.kind !== 'column' && post.parent === undefined);
    for (const post of free) expect(post.x).toBe(1260);
  });

  it('gives the budget table a height of 240 so it is manually sized', () => {
    const table = PROJECT_PLAN.posts.find((post) => post.kind === 'table');
    expect(table && table.kind === 'table' ? table.height : null).toBe(240);
  });

  it('prepends the note title to the body so the name is visible', () => {
    const note = PROJECT_PLAN.posts.find((post) => post.kind === 'note' && post.title === 'Fern & Fig Café — new website');
    expect(note && note.kind === 'note' ? note.html : '').toMatch(/^<p><strong>Fern & Fig Café — new website<\/strong><\/p>/);
  });
});
