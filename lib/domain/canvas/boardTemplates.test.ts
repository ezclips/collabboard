import { describe, expect, it, vi } from 'vitest';
import type { PostsRepository } from './posts';
import { domainError } from '../core/errors';
import { err, ok } from '../core/result';
import {
  boardTemplateSchema,
  buildTemplateRows,
  createApplyBoardTemplateCommand,
  type BoardTemplate,
} from './boardTemplates';
import { PROJECT_PLAN } from '@/lib/collabboard/templates/freeform/projectPlan';

const TEMPLATE: BoardTemplate = {
  id: 'sample',
  name: 'Sample',
  layout: 'freeform',
  posts: [
    { kind: 'column', key: 'col', title: 'Col', x: 0, y: 0, width: 340, height: 800 },
    { kind: 'note', title: 'Note', html: '<p>hi</p>', parent: 'col' },
    { kind: 'todo', title: 'Todo', tasks: [{ text: 'a', done: true }, { text: 'b', done: false }], parent: 'col' },
    { kind: 'table', title: 'Table', rows: [['H1', 'H2'], ['r1c1', 'r1c2']], parent: 'col' },
    { kind: 'image', title: 'Pic', src: '/templates/freeform/project-plan/latte-art.jpg', x: 100, y: 100, width: 200, height: 150 },
    { kind: 'clipart', title: 'Art', svg: '/templates/freeform/project-plan/rocket.svg', iconBgColor: '#bfdbfe', parent: 'col' },
  ],
};

function counterNewId() {
  let n = 0;
  return () => `id-${++n}`;
}

function rowsFor(template: BoardTemplate) {
  return buildTemplateRows('board-1', template, counterNewId()) as Array<Record<string, any>>;
}

describe('boardTemplateSchema', () => {
  it('accepts a well-formed template', () => {
    expect(boardTemplateSchema.safeParse(TEMPLATE).success).toBe(true);
  });

  it('accepts the Project Plan template', () => {
    expect(boardTemplateSchema.safeParse(PROJECT_PLAN).success).toBe(true);
  });

  it('rejects an outside image src', () => {
    const bad = {
      ...TEMPLATE,
      posts: [{ kind: 'image', title: 'x', src: 'https://evil.example/x.png', x: 1, y: 1 }],
    };
    expect(boardTemplateSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a parent naming no column', () => {
    const bad = {
      ...TEMPLATE,
      posts: [TEMPLATE.posts[0], { kind: 'note', title: 'n', html: '<p>x</p>', parent: 'nope' }],
    };
    expect(boardTemplateSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects duplicate column keys', () => {
    const bad = {
      ...TEMPLATE,
      posts: [TEMPLATE.posts[0], { kind: 'column', key: 'col', title: 'Other', x: 1, y: 1, width: 340 }],
    };
    expect(boardTemplateSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a child carrying both parent and x', () => {
    const bad = {
      ...TEMPLATE,
      posts: [TEMPLATE.posts[0], { kind: 'note', title: 'n', html: '<p>x</p>', parent: 'col', x: 4 }],
    };
    expect(boardTemplateSchema.safeParse(bad).success).toBe(false);
  });
});

describe('buildTemplateRows', () => {
  it('puts the columns first', () => {
    const rows = rowsFor(TEMPLATE);
    expect(rows[0].type).toBe('container');
    expect(rows[0].title).toBe('Col');
  });

  it('gives every child its column id as parentId', () => {
    const rows = rowsFor(TEMPLATE);
    const column = rows[0];
    for (const key of ['col']) void key;
    const children = rows.filter((r) => r.metadata?.parentId);
    expect(children.length).toBe(4);
    for (const child of children) expect(child.metadata.parentId).toBe(column.id);
  });

  it('lists each column child in order in childPadletIds', () => {
    const rows = rowsFor(TEMPLATE);
    const column = rows[0];
    const childIds = column.metadata.childPadletIds as string[];
    expect(childIds).toHaveLength(4);
    const parented = rows.filter((r) => r.metadata?.parentId === column.id);
    expect(childIds).toEqual(parented.map((r) => r.id));
  });

  it('writes a note as type text with its HTML in content', () => {
    const note = rowsFor(TEMPLATE).find((r) => r.type === 'text')!;
    expect(note.content).toBe('<p>hi</p>');
  });

  it('writes a todo as JSON tasks with completed', () => {
    const todo = rowsFor(TEMPLATE).find((r) => r.type === 'todo')!;
    const tasks = JSON.parse(todo.content) as Array<{ id: string; text: string; completed: boolean }>;
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ text: 'a', completed: true });
    expect(tasks[1]).toMatchObject({ text: 'b', completed: false });
    expect(new Set(tasks.map((t) => t.id)).size).toBe(2);
  });

  it('mirrors the todo tasks and title into metadata for the renderer', () => {
    const todo = rowsFor(TEMPLATE).find((r) => r.type === 'todo')!;
    expect(todo.metadata.tasks).toEqual(JSON.parse(todo.content));
    expect(todo.metadata.todoTitle).toBe('Todo');
  });

  it('writes a table as JSON the TableEditor parser reads', () => {
    const table = rowsFor(TEMPLATE).find((r) => r.type === 'table')!;
    const parsed = JSON.parse(table.content) as { rows: string[][]; columns: string[] };
    expect(parsed.columns).toEqual(['H1', 'H2']);
    expect(parsed.rows).toEqual([['r1c1', 'r1c2']]);
  });

  it('writes an image with file_url and metadata.imageUrl', () => {
    const image = rowsFor(TEMPLATE).find((r) => r.type === 'image')!;
    expect(image.file_url).toBe('/templates/freeform/project-plan/latte-art.jpg');
    expect(image.metadata.imageUrl).toBe(image.file_url);
    expect(image.position_x).toBe(100);
    expect(image.position_y).toBe(100);
  });

  it('writes clipart as a card with svgUrl', () => {
    const card = rowsFor(TEMPLATE).find((r) => r.type === 'card')!;
    expect(card.metadata.svgUrl).toBe('/templates/freeform/project-plan/rocket.svg');
    expect(card.width).toBe(180);
    expect(card.height).toBe(220);
  });

  it('stamps every row with the board id', () => {
    for (const row of rowsFor(TEMPLATE)) expect(row.board_id).toBe('board-1');
  });

  it('never repeats a row id', () => {
    const ids = rowsFor(TEMPLATE).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildTemplateRows manualSize (Addendum 2 defect 2)', () => {
  const rows = () =>
    buildTemplateRows('board-1', PROJECT_PLAN, counterNewId()) as Array<Record<string, any>>;

  it('marks a column as manually sized', () => {
    const column = rows().find((row) => row.type === 'container')!;
    expect(column.metadata.manualSize).toBe(true);
  });

  it('marks a free image as manually sized', () => {
    const hero = rows().find((row) => row.type === 'image' && !row.metadata.parentId)!;
    expect(hero.metadata.manualSize).toBe(true);
  });

  it('marks a free table as manually sized', () => {
    const budget = rows().find((row) => row.type === 'table' && !row.metadata.parentId)!;
    expect(budget.metadata.manualSize).toBe(true);
  });

  it('does not mark a child inside a column', () => {
    const child = rows().find((row) => row.type === 'text' && row.metadata.parentId)!;
    expect(child.metadata.manualSize).toBeUndefined();
  });
});

describe('buildTemplateRows startExpanded (Addendum 3)', () => {
  it('marks every column as start-expanded', () => {
    const rows = buildTemplateRows('board-1', PROJECT_PLAN, counterNewId()) as Array<Record<string, any>>;
    const columns = rows.filter((row) => row.type === 'container');
    expect(columns).toHaveLength(3);
    for (const column of columns) expect(column.metadata.startExpanded).toBe(true);
  });
});

function fakeRepository(failAt?: number) {
  const inserts: Array<Record<string, any>> = [];
  const deletes: string[][] = [];
  let call = 0;
  const repository = {
    insert: vi.fn(async (row: object) => {
      call += 1;
      if (failAt !== undefined && call === failAt) return err(domainError('unavailable', 'boom'));
      inserts.push(row as Record<string, any>);
      return ok(undefined);
    }),
    deleteByIds: vi.fn(async (ids: readonly string[]) => {
      deletes.push([...ids]);
      return ok(undefined);
    }),
  } as unknown as PostsRepository;
  return { repository, inserts, deletes };
}

describe('createApplyBoardTemplateCommand', () => {
  it('inserts every row and reports the count', async () => {
    const { repository, inserts } = fakeRepository();
    const command = createApplyBoardTemplateCommand(repository);
    const result = await command({ boardId: 'board-1', template: TEMPLATE }, { userId: null });
    expect(result).toEqual({ ok: true, value: 6 });
    expect(inserts).toHaveLength(6);
  });

  it('rolls back the rows it inserted when a later insert fails', async () => {
    const { repository, deletes } = fakeRepository(3);
    const command = createApplyBoardTemplateCommand(repository);
    const result = await command({ boardId: 'board-1', template: TEMPLATE }, { userId: null });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('template_apply_failed');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toHaveLength(2);
  });

  it('rejects invalid input without inserting', async () => {
    const { repository, inserts } = fakeRepository();
    const command = createApplyBoardTemplateCommand(repository);
    const result = await command(
      { boardId: 'board-1', template: { ...TEMPLATE, posts: [{ kind: 'image', title: 'x', src: 'https://evil.example/x.png', x: 1, y: 1 }] } },
      { userId: null },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('validation');
    expect(inserts).toHaveLength(0);
  });
});
