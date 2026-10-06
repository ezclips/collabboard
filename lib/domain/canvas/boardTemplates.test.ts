import { describe, expect, it, vi } from 'vitest';
import type { PostsRepository } from './posts';
import type { SectionInsertFields, SectionsRepository } from './sections';
import { domainError } from '../core/errors';
import { err, ok } from '../core/result';
import {
  boardTemplateSchema,
  buildTemplateRows,
  createApplyBoardTemplateCommand,
  type BoardTemplate,
  type TemplatePost,
} from './boardTemplates';
import { PROJECT_PLAN } from '@/lib/collabboard/templates/freeform/projectPlan';
import { BRAINSTORMING } from '@/lib/collabboard/templates/columns/brainstorming';
import { SCIENCE_VOCABULARY } from '@/lib/collabboard/templates/grid/scienceVocabulary';
import { BIRTHDAY_WALL } from '@/lib/collabboard/templates/wall/birthdayWall';
import { WORLD_VOLCANOES } from '@/lib/collabboard/templates/map/worldVolcanoes';
import { HISTORY_OF_FLIGHT } from '@/lib/collabboard/templates/timeline/historyOfFlight';
import { MOODBOARD } from '@/lib/collabboard/templates/freeform/moodboard';
import { CREATIVE_BRIEF } from '@/lib/collabboard/templates/freeform/creativeBrief';
import { CHARACTER_PROFILE } from '@/lib/collabboard/templates/freeform/characterProfile';
import { WEEKLY_PLAN } from '@/lib/collabboard/templates/freeform/weeklyPlan';
import { TRIP_PLANNER } from '@/lib/collabboard/templates/freeform/tripPlanner';
import { EVENT_PLAN } from '@/lib/collabboard/templates/freeform/eventPlan';
import { PRODUCT_LAUNCH } from '@/lib/collabboard/templates/freeform/productLaunch';

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

function fakeSectionsRepository() {
  const renames: Array<{ id: number; title: string }> = [];
  const inserts: SectionInsertFields[][] = [];
  const deletes: number[] = [];
  const repository = {
    insertSection: vi.fn(async () => ok(null)),
    insertSections: vi.fn(async (fields: SectionInsertFields[]) => {
      inserts.push([...fields]);
      return ok(fields.map((_field, index) => ({ id: 500 + index })));
    }),
    renameSection: vi.fn(async (id: number, fields: { title: string }) => {
      renames.push({ id, title: fields.title });
      return ok(undefined);
    }),
    updateSectionPosition: vi.fn(async () => ok(undefined)),
    deleteSection: vi.fn(async (id: number) => {
      deletes.push(id);
      return ok(undefined);
    }),
  } as unknown as SectionsRepository;
  return { repository, renames, inserts, deletes };
}

describe('createApplyBoardTemplateCommand', () => {
  it('inserts every row and reports the count', async () => {
    const { repository, inserts } = fakeRepository();
    const command = createApplyBoardTemplateCommand(repository, fakeSectionsRepository().repository);
    const result = await command({ boardId: 'board-1', template: TEMPLATE }, { userId: null });
    expect(result).toEqual({ ok: true, value: 6 });
    expect(inserts).toHaveLength(6);
  });

  it('rolls back the rows it inserted when a later insert fails', async () => {
    const { repository, deletes } = fakeRepository(3);
    const command = createApplyBoardTemplateCommand(repository, fakeSectionsRepository().repository);
    const result = await command({ boardId: 'board-1', template: TEMPLATE }, { userId: null });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('template_apply_failed');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toHaveLength(2);
  });

  it('rejects invalid input without inserting', async () => {
    const { repository, inserts } = fakeRepository();
    const command = createApplyBoardTemplateCommand(repository, fakeSectionsRepository().repository);
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

const COLUMNS_TEMPLATE: BoardTemplate = {
  id: 'sample-columns',
  name: 'Sample Columns',
  layout: 'columns',
  posts: [
    { kind: 'section', key: 'one', title: 'One' },
    { kind: 'section', key: 'two', title: 'Two' },
    { kind: 'note', title: 'Root one', html: '<p>1</p>', section: 'one' },
    { kind: 'note', title: 'Root two', html: '<p>2</p>', section: 'two' },
  ],
};

const GRID_TEMPLATE: BoardTemplate = {
  id: 'sample-grid',
  name: 'Sample Grid',
  layout: 'grid',
  posts: [
    { kind: 'section', key: 'row', title: 'Row' },
    { kind: 'column', key: 'card', title: 'Card', section: 'row' },
    { kind: 'note', title: 'Card note', html: '<p>x</p>', parent: 'card' },
  ],
};

const WALL_TEMPLATE: BoardTemplate = {
  id: 'sample-wall',
  name: 'Sample Wall',
  layout: 'wall',
  posts: [
    { kind: 'column', key: 'a', title: 'A' },
    { kind: 'column', key: 'b', title: 'B' },
    { kind: 'note', title: 'N', html: '<p>x</p>', parent: 'a' },
  ],
};

const TIMELINE_TEMPLATE: BoardTemplate = {
  id: 'sample-timeline',
  name: 'Sample Timeline',
  layout: 'timeline',
  posts: [
    { kind: 'column', key: 'a', title: 'A' },
    { kind: 'column', key: 'b', title: 'B' },
    { kind: 'note', title: 'N', html: '<p>x</p>', parent: 'a' },
  ],
};

const MAP_TEMPLATE: BoardTemplate = {
  id: 'sample-map',
  name: 'Sample Map',
  layout: 'map',
  posts: [
    { kind: 'column', key: 'pin', title: 'Pin', location: { lat: 10, lng: 20, label: 'Pin' } },
    { kind: 'note', title: 'N', html: '<p>x</p>', parent: 'pin' },
  ],
};

function issuesOf(value: unknown) {
  const result = boardTemplateSchema.safeParse(value);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues;
}

function paths(value: unknown): string[] {
  return issuesOf(value).map((issue) => issue.path.join('.'));
}

describe('boardTemplateSchema layout rules', () => {
  it('accepts a valid template for every layout', () => {
    for (const template of [PROJECT_PLAN, COLUMNS_TEMPLATE, GRID_TEMPLATE, WALL_TEMPLATE, TIMELINE_TEMPLATE, MAP_TEMPLATE]) {
      expect(boardTemplateSchema.safeParse(template).success, template.id).toBe(true);
    }
  });

  it('accepts the five new finished templates and the eight freeform ones', () => {
    const templates = [
      BIRTHDAY_WALL,
      BRAINSTORMING,
      SCIENCE_VOCABULARY,
      WORLD_VOLCANOES,
      HISTORY_OF_FLIGHT,
      PROJECT_PLAN,
      MOODBOARD,
      CREATIVE_BRIEF,
      CHARACTER_PROFILE,
      WEEKLY_PLAN,
      TRIP_PLANNER,
      EVENT_PLAN,
      PRODUCT_LAUNCH,
    ];
    for (const template of templates) {
      expect(boardTemplateSchema.safeParse(template).success, template.id).toBe(true);
    }
  });

  it('freeform rejects a section kind', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'freeform', posts: [{ kind: 'section', key: 's', title: 'S' }] })).toContain('posts.0.kind');
  });

  it('freeform rejects a container missing its width', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'freeform', posts: [{ kind: 'column', key: 'c', title: 'C', x: 0, y: 0 }] })).toContain('posts.0.width');
  });

  it('freeform rejects a container carrying a section', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'freeform', posts: [{ kind: 'column', key: 'c', title: 'C', x: 0, y: 0, width: 100, section: 's' }] })).toContain('posts.0.section');
  });

  it('columns rejects a free position', () => {
    expect(paths({ ...COLUMNS_TEMPLATE, posts: [{ kind: 'note', title: 'Root', html: '<p>x</p>', section: 'one', x: 5 }] })).toContain('posts.0.x');
  });

  it('columns rejects a root post without a section', () => {
    expect(paths({ ...COLUMNS_TEMPLATE, posts: [{ kind: 'note', title: 'Root', html: '<p>x</p>' }] })).toContain('posts.0.section');
  });

  it('columns rejects a child carrying a section', () => {
    const bad = {
      id: 'x',
      name: 'X',
      layout: 'columns',
      posts: [
        { kind: 'section', key: 'one', title: 'One' },
        { kind: 'column', key: 'c', title: 'C', section: 'one' },
        { kind: 'note', title: 'N', html: '<p>x</p>', parent: 'c', section: 'one' },
      ],
    };
    expect(paths(bad)).toContain('posts.2.section');
  });

  it('columns rejects a section naming no section', () => {
    expect(paths({ ...COLUMNS_TEMPLATE, posts: [{ kind: 'note', title: 'Root', html: '<p>x</p>', section: 'nope' }] })).toContain('posts.0.section');
  });

  it('grid rejects a container without a section', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'grid', posts: [{ kind: 'column', key: 'c', title: 'C' }] })).toContain('posts.0.section');
  });

  it('grid rejects a content post without a parent', () => {
    const bad = {
      id: 'x',
      name: 'X',
      layout: 'grid',
      posts: [
        { kind: 'section', key: 'r', title: 'R' },
        { kind: 'column', key: 'c', title: 'C', section: 'r' },
        { kind: 'note', title: 'N', html: '<p>x</p>' },
      ],
    };
    expect(paths(bad)).toContain('posts.2.parent');
  });

  it('wall rejects a section kind', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'wall', posts: [{ kind: 'section', key: 's', title: 'S' }] })).toContain('posts.0.kind');
  });

  it('wall rejects a section field', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'wall', posts: [{ kind: 'column', key: 'c', title: 'C', section: 's' }] })).toContain('posts.0.section');
  });

  it('wall rejects a content post without a parent', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'wall', posts: [{ kind: 'note', title: 'N', html: '<p>x</p>' }] })).toContain('posts.0.parent');
  });

  it('timeline rejects a free position', () => {
    expect(paths({ ...TIMELINE_TEMPLATE, posts: [{ kind: 'column', key: 'a', title: 'A', y: 1 }] })).toContain('posts.0.y');
  });

  it('timeline rejects a section field', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'timeline', posts: [{ kind: 'column', key: 'a', title: 'A', section: 's' }] })).toContain('posts.0.section');
  });

  it('map rejects a container without a location', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'map', posts: [{ kind: 'column', key: 'p', title: 'P' }] })).toContain('posts.0.location');
  });

  it('map rejects an out-of-range latitude', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'map', posts: [{ kind: 'column', key: 'p', title: 'P', location: { lat: 91, lng: 0, label: 'P' } }] })).toContain('posts.0.location.lat');
  });

  it('map rejects an out-of-range longitude', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'map', posts: [{ kind: 'column', key: 'p', title: 'P', location: { lat: 0, lng: 181, label: 'P' } }] })).toContain('posts.0.location.lng');
  });

  it('map rejects an empty label', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'map', posts: [{ kind: 'column', key: 'p', title: 'P', location: { lat: 0, lng: 0, label: '  ' } }] })).toContain('posts.0.location.label');
  });

  it('map rejects a content post without a parent', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'map', posts: [{ kind: 'column', key: 'p', title: 'P', location: { lat: 0, lng: 0, label: 'P' } }, { kind: 'note', title: 'N', html: '<p>x</p>' }] })).toContain('posts.1.parent');
  });
});

describe('buildTemplateRows for non-freeform layouts', () => {
  it('numbers wall containers with wallPosition 0..n-1', () => {
    const rows = buildTemplateRows('board-1', WALL_TEMPLATE, counterNewId()) as Array<Record<string, any>>;
    const containers = rows.filter((row) => row.type === 'container');
    expect(containers.map((row) => row.metadata.wallPosition)).toEqual([0, 1]);
    expect(containers.map((row) => row.title)).toEqual(['A', 'B']);
  });

  it('numbers timeline containers with position_in_timeline and a transparent strip', () => {
    const rows = buildTemplateRows('board-1', TIMELINE_TEMPLATE, counterNewId()) as Array<Record<string, any>>;
    const containers = rows.filter((row) => row.type === 'container');
    expect(containers.map((row) => row.metadata.position_in_timeline)).toEqual([0, 1]);
    for (const container of containers) {
      expect(container.metadata.topStrip).toBe('transparent');
      expect(container.width).toBe(280);
      expect(container.height).toBe(200);
    }
  });

  it('writes map pins with location columns and metadata.mapLocation', () => {
    const rows = buildTemplateRows('board-1', MAP_TEMPLATE, counterNewId()) as Array<Record<string, any>>;
    const pin = rows.find((row) => row.type === 'container')!;
    expect(pin.location_lat).toBe(10);
    expect(pin.location_lng).toBe(20);
    expect(pin.location_label).toBe('Pin');
    expect(pin.metadata.mapLocation).toEqual({ lng: 20, lat: 10, label: 'Pin' });
    expect(pin.width).toBe(320);
    expect(pin.height).toBe(220);
  });

  it('assigns column sections by id string and sectionPosition', () => {
    const rows = buildTemplateRows('board-1', COLUMNS_TEMPLATE, counterNewId(), { one: 11, two: 22 }) as Array<Record<string, any>>;
    const texts = rows.filter((row) => row.type === 'text');
    expect(texts.map((row) => row.metadata.sectionId)).toEqual(['11', '22']);
    expect(texts.map((row) => row.metadata.sectionPosition)).toEqual([0, 0]);
  });

  it('assigns grid sections to containers', () => {
    const rows = buildTemplateRows('board-1', GRID_TEMPLATE, counterNewId(), { row: 7 }) as Array<Record<string, any>>;
    const container = rows.find((row) => row.type === 'container')!;
    expect(container.metadata.sectionId).toBe('7');
    expect(container.metadata.sectionPosition).toBe(0);
  });

  it('orders sectionPosition per section in array order', () => {
    const template: BoardTemplate = {
      id: 'two-per',
      name: 'Two per',
      layout: 'columns',
      posts: [
        { kind: 'section', key: 's', title: 'S' },
        { kind: 'note', title: 'a', html: '<p>a</p>', section: 's' },
        { kind: 'note', title: 'b', html: '<p>b</p>', section: 's' },
      ],
    };
    const rows = buildTemplateRows('board-1', template, counterNewId(), { s: 3 }) as Array<Record<string, any>>;
    const texts = rows.filter((row) => row.type === 'text');
    expect(texts.map((row) => row.metadata.sectionPosition)).toEqual([0, 1]);
  });

  it('marks every non-freeform container start-expanded and omits manualSize', () => {
    for (const template of [WALL_TEMPLATE, TIMELINE_TEMPLATE, MAP_TEMPLATE, GRID_TEMPLATE]) {
      const rows = buildTemplateRows('board-1', template, counterNewId(), { row: 1 }) as Array<Record<string, any>>;
      for (const row of rows) {
        expect(row.metadata.manualSize, template.id).toBeUndefined();
        if (row.type === 'container') expect(row.metadata.startExpanded, template.id).toBe(true);
        else expect(row.metadata.startExpanded, template.id).toBeUndefined();
      }
    }
  });

  it('keeps every child parentId', () => {
    const rows = buildTemplateRows('board-1', WALL_TEMPLATE, counterNewId()) as Array<Record<string, any>>;
    const child = rows.find((row) => row.type === 'text')!;
    expect(child.metadata.parentId).toBe(rows.find((row) => row.type === 'container')!.id);
  });
});

function fiveSectionTemplate(): BoardTemplate {
  const keys = ['a', 'b', 'c', 'd', 'e'];
  const posts: TemplatePost[] = [];
  keys.forEach((key, index) => {
    posts.push({ kind: 'section', key, title: `S${index + 1}` });
    posts.push({ kind: 'note', title: `N${index + 1}`, html: '<p>x</p>', section: key });
  });
  return { id: 'five-sections', name: 'Five', layout: 'columns', posts };
}

function existingSections(count: number) {
  return Array.from({ length: count }, (_value, index) => ({
    id: index + 1,
    title: `Old ${index + 1}`,
    position: index,
  }));
}

function commandHarness(options: { failPostAt?: number } = {}) {
  const events: string[] = [];
  let postCalls = 0;
  const posts = {
    insert: vi.fn(async () => {
      postCalls += 1;
      events.push('post-insert');
      if (options.failPostAt !== undefined && postCalls === options.failPostAt) {
        return err(domainError('unavailable', 'boom'));
      }
      return ok(undefined);
    }),
    deleteByIds: vi.fn(async () => {
      events.push('post-delete');
      return ok(undefined);
    }),
  } as unknown as PostsRepository;
  const sections = {
    insertSection: vi.fn(async () => ok(null)),
    insertSections: vi.fn(async (fields: SectionInsertFields[]) => {
      events.push('section-insert');
      return ok(fields.map((_field, index) => ({ id: 500 + index })));
    }),
    renameSection: vi.fn(async () => {
      events.push('section-rename');
      return ok(undefined);
    }),
    updateSectionPosition: vi.fn(async () => ok(undefined)),
    deleteSection: vi.fn(async () => {
      events.push('section-delete');
      return ok(undefined);
    }),
  } as unknown as SectionsRepository;
  return { posts, sections, events };
}

describe('createApplyBoardTemplateCommand sections', () => {
  it('reuses three existing sections and inserts two, deleting none', async () => {
    const { posts, sections } = commandHarness();
    const command = createApplyBoardTemplateCommand(posts, sections);
    const result = await command({ boardId: 'board-1', template: fiveSectionTemplate(), existingSections: existingSections(3) }, { userId: null });
    expect(result.ok).toBe(true);
    const renameCalls = (sections.renameSection as any).mock.calls as Array<[number, { title: string }]>;
    const insertCalls = (sections.insertSections as any).mock.calls as Array<[SectionInsertFields[]]>;
    const deleteCalls = (sections.deleteSection as any).mock.calls as Array<[number]>;
    expect(renameCalls).toHaveLength(3);
    expect(renameCalls.map((call) => call[1].title)).toEqual(['S1', 'S2', 'S3']);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][0].map((field) => field.title)).toEqual(['S4', 'S5']);
    expect(deleteCalls).toHaveLength(0);
  });

  it('renames five and deletes the two surplus only after every post insert', async () => {
    const { posts, sections, events } = commandHarness();
    const command = createApplyBoardTemplateCommand(posts, sections);
    const result = await command({ boardId: 'board-1', template: fiveSectionTemplate(), existingSections: existingSections(7) }, { userId: null });
    expect(result.ok).toBe(true);
    expect((sections.renameSection as any).mock.calls).toHaveLength(5);
    expect((sections.insertSections as any).mock.calls).toHaveLength(0);
    expect((sections.deleteSection as any).mock.calls).toHaveLength(2);
    expect(events.indexOf('section-delete')).toBeGreaterThan(events.lastIndexOf('post-insert'));
  });

  it('rolls posts and created sections back and restores renamed sections on failure', async () => {
    const { posts, sections } = commandHarness({ failPostAt: 2 });
    const command = createApplyBoardTemplateCommand(posts, sections);
    const result = await command({ boardId: 'board-1', template: fiveSectionTemplate(), existingSections: existingSections(3) }, { userId: null });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('template_apply_failed');
    expect((posts.deleteByIds as any).mock.calls).toHaveLength(1);
    const deletes = (sections.deleteSection as any).mock.calls as Array<[number]>;
    expect(deletes.map((call) => call[0])).toEqual([500, 501]);
    const renames = (sections.renameSection as any).mock.calls as Array<[number, { title: string }]>;
    expect(renames.slice(3).map((call) => call[1].title)).toEqual(['Old 3', 'Old 2', 'Old 1']);
  });

  it('never touches sections for wall, map, timeline or freeform', async () => {
    for (const template of [WALL_TEMPLATE, MAP_TEMPLATE, TIMELINE_TEMPLATE, PROJECT_PLAN]) {
      const { posts, sections } = commandHarness();
      const command = createApplyBoardTemplateCommand(posts, sections);
      const result = await command({ boardId: 'board-1', template, existingSections: existingSections(3) }, { userId: null });
      expect(result.ok, template.id).toBe(true);
      expect((sections.renameSection as any).mock.calls, template.id).toHaveLength(0);
      expect((sections.insertSections as any).mock.calls, template.id).toHaveLength(0);
      expect((sections.deleteSection as any).mock.calls, template.id).toHaveLength(0);
    }
  });
});

describe('createApplyBoardTemplateCommand replacePostIds', () => {
  it('deletes the placeholders only after every insert succeeded', async () => {
    const { posts, sections, events } = commandHarness();
    const command = createApplyBoardTemplateCommand(posts, sections);
    const result = await command(
      { boardId: 'board-1', template: TIMELINE_TEMPLATE, replacePostIds: ['placeholder-1'] },
      { userId: null },
    );
    expect(result.ok).toBe(true);
    expect((posts.deleteByIds as any).mock.calls).toHaveLength(1);
    expect((posts.deleteByIds as any).mock.calls[0][0]).toEqual(['placeholder-1']);
    expect(events.indexOf('post-delete')).toBeGreaterThan(events.lastIndexOf('post-insert'));
  });

  it('keeps the placeholders when a post insert fails', async () => {
    const { posts, sections } = commandHarness({ failPostAt: 2 });
    const command = createApplyBoardTemplateCommand(posts, sections);
    const result = await command(
      { boardId: 'board-1', template: TIMELINE_TEMPLATE, replacePostIds: ['placeholder-1'] },
      { userId: null },
    );
    expect(result.ok).toBe(false);
    const deletedBatches = (posts.deleteByIds as any).mock.calls.map((call: any[]) => call[0] as string[]);
    for (const ids of deletedBatches) expect(ids).not.toContain('placeholder-1');
  });
});

const TIMELINE_LABELLED: BoardTemplate = {
  id: 'sample-timeline-label',
  name: 'Sample Timeline Label',
  layout: 'timeline',
  posts: [
    { kind: 'column', key: 'a', title: 'A', timelineLabel: '1783' },
    { kind: 'note', title: 'N', html: '<p>x</p>', parent: 'a' },
  ],
};

describe('boardTemplateSchema timelineLabel', () => {
  it('accepts timelineLabel on a timeline container', () => {
    expect(boardTemplateSchema.safeParse(TIMELINE_LABELLED).success).toBe(true);
  });

  it('rejects timelineLabel in every other layout', () => {
    expect(paths({ id: 'x', name: 'X', layout: 'wall', posts: [{ kind: 'column', key: 'a', title: 'A', timelineLabel: '1783' }] })).toContain('posts.0.timelineLabel');
    expect(paths({ id: 'x', name: 'X', layout: 'freeform', posts: [{ kind: 'column', key: 'a', title: 'A', x: 0, y: 0, width: 100, timelineLabel: '1783' }] })).toContain('posts.0.timelineLabel');
    expect(paths({ id: 'x', name: 'X', layout: 'map', posts: [{ kind: 'column', key: 'a', title: 'A', location: { lat: 0, lng: 0, label: 'A' }, timelineLabel: '1783' }] })).toContain('posts.0.timelineLabel');
    expect(paths({ id: 'x', name: 'X', layout: 'columns', posts: [{ kind: 'section', key: 's', title: 'S' }, { kind: 'column', key: 'a', title: 'A', section: 's', timelineLabel: '1783' }] })).toContain('posts.1.timelineLabel');
    expect(paths({ id: 'x', name: 'X', layout: 'grid', posts: [{ kind: 'section', key: 's', title: 'S' }, { kind: 'column', key: 'a', title: 'A', section: 's', timelineLabel: '1783' }] })).toContain('posts.1.timelineLabel');
  });
});

describe('buildTemplateRows timelineLabel', () => {
  it('copies timelineLabel into the container metadata', () => {
    const rows = buildTemplateRows('board-1', TIMELINE_LABELLED, counterNewId()) as Array<Record<string, any>>;
    const container = rows.find((row) => row.type === 'container')!;
    expect(container.metadata.timelineLabel).toBe('1783');
  });

  it('omits timelineLabel metadata when the container does not state one', () => {
    const rows = buildTemplateRows('board-1', TIMELINE_TEMPLATE, counterNewId()) as Array<Record<string, any>>;
    const container = rows.find((row) => row.type === 'container')!;
    expect(container.metadata.timelineLabel).toBeUndefined();
  });
});
