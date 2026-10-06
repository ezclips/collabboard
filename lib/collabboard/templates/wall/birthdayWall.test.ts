import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { BIRTHDAY_WALL } from './birthdayWall';

describe('Birthday Wall', () => {
  it('validates against the board template schema and names itself', () => {
    expect(boardTemplateSchema.safeParse(BIRTHDAY_WALL).success).toBe(true);
    expect(BIRTHDAY_WALL.id).toBe('birthday-wall');
    expect(BIRTHDAY_WALL.name).toBe('Birthday Wall');
    expect(BIRTHDAY_WALL.layout).toBe('wall');
    expect(BIRTHDAY_WALL.previewUrl).toBe('/templates/wall/birthday-wall/preview.jpg');
  });

  it('has six groups with the expected titles', () => {
    const containers = BIRTHDAY_WALL.posts.filter((post) => post.kind === 'column');
    expect(containers.map((container) => container.title)).toEqual([
      'Happy birthday, Maya! 🎉',
      'From Leo',
      'From Ms. Ortiz',
      'From Sam and Ava',
      'Class gift',
      'Party photos',
    ]);
  });

  it('lists each group\u2019s children in order', () => {
    const containers = BIRTHDAY_WALL.posts.filter((post) => post.kind === 'column');
    const counts = containers.map(
      (container) =>
        BIRTHDAY_WALL.posts.filter(
          (post) => post.kind !== 'column' && post.kind !== 'section' && post.parent === container.key,
        ).length,
    );
    expect(counts).toEqual([3, 2, 2, 3, 2, 2]);
  });

  it('marks the first two gift tasks done', () => {
    const todo = BIRTHDAY_WALL.posts.find((post) => post.kind === 'todo');
    expect(todo && todo.kind === 'todo' ? todo.tasks.filter((task) => task.done).length : 0).toBe(2);
  });
});
