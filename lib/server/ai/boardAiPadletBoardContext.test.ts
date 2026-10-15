import { describe, expect, it } from 'vitest';

import {
  PADLET_BOARD_LAYOUTS,
  readPadletBoardBlock,
  type BoardAiPadletBoardSupabaseClient,
} from './boardAiPadletBoardContext';
import {
  resolveBoardAiChatContext,
  resolveHistoricalBoardAiChatContext,
  type BoardAiContextSupabaseClient,
} from './boardAiChatContext';
import { err } from '../../domain/core/result';
import { domainError } from '../../domain/core/errors';

const neverReads = {
  download: async () => err(domainError('unavailable', 'no byte read expected in this file')),
};

const BOARD = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';

type Row = Record<string, unknown>;

/** A client that records the filters each query applied, keyed by table. */
function fakeClient(tables: Record<string, Row[]>) {
  const filters: Record<string, Record<string, unknown>[]> = {};
  const client = {
    from(table: string) {
      return {
        select() {
          const eq: Record<string, unknown> = {};
          let orderColumn: string | null = null;
          let ascending = true;
          (filters[table] ??= []).push(eq);
          const rows = tables[table] ?? [];
          const matched = () => rows.filter((row) => Object.entries(eq).every(([key, value]) => row[key] === value));
          const query: Record<string, unknown> = {
            eq(column: string, value: unknown) { eq[column] = value; return query; },
            order(column: string, options: { ascending: boolean }) {
              orderColumn = column;
              ascending = options.ascending;
              return query;
            },
            maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
            then(resolve: (value: { data: Row[]; error: null }) => unknown) {
              let out = matched();
              if (orderColumn !== null) {
                const column = orderColumn;
                const compare = (a: Row, b: Row) => (typeof a[column] === 'number' && typeof b[column] === 'number'
                  ? (a[column] as number) - (b[column] as number)
                  : String(a[column]).localeCompare(String(b[column])));
                out = [...out].sort((a, b) => compare(a, b) * (ascending ? 1 : -1));
              }
              return Promise.resolve({ data: out, error: null }).then(resolve);
            },
          };
          return query;
        },
      };
    },
  };
  return { client: client as unknown as BoardAiPadletBoardSupabaseClient, filters };
}

const note = (id: string, title: string, metadata: Row = {}, content = ''): Row =>
  ({ id, type: 'note', title, content, metadata, board_id: BOARD });
const container = (id: string, title: string, childPadletIds: string[], metadata: Row = {}): Row =>
  ({ id, type: 'container', title, content: '', metadata: { childPadletIds, ...metadata }, board_id: BOARD });

describe('PATCH-371 readPadletBoardBlock', () => {
  it('exists only for the five Padlet-style layouts', () => {
    expect(PADLET_BOARD_LAYOUTS).toEqual(['wall', 'columns', 'grid', 'timeline', 'map']);
  });

  it('Columns: sections in order, root posts by sectionPosition, a container nests its children', async () => {
    // `board_sections.id` is a BIGINT live (e.g. 197), and posts store
    // `metadata.sectionId` as a STRING ("197") -- the app compares them loosely.
    // A fixture with STRING section ids encodes the wrong assumption and can
    // never fail, which is exactly how the live bug shipped.
    const { client, filters } = fakeClient({
      boards: [{ id: BOARD, layout: 'columns', title: 'Retro' }, { id: OTHER, layout: 'kanban', title: 'K' }],
      board_sections: [
        { id: 197, title: 'Went well', position: 0, board_id: BOARD },
        { id: 198, title: 'To improve', position: 1, board_id: BOARD },
        { id: 199, title: 'Empty', position: 2, board_id: BOARD },
      ],
      padlets: [
        note('p1', 'Shipping', { sectionId: '197', sectionPosition: 0 }, '<p>Fast</p>'),
        note('p2', 'Team', { sectionId: '197', sectionPosition: 1 }),
        container('c1', 'Risks', ['p3'], { sectionId: '198', sectionPosition: 0 }),
        note('p3', 'Flaky tests', { parentId: 'c1' }, 'CI'),
      ],
    });

    const result = await readPadletBoardBlock(client, BOARD, 0);
    expect(result.ok).toBe(true);
    const block = result.ok ? result.value : null;
    expect(block?.type).toBe('padlet-board');

    const text = block?.text ?? '';
    expect(text).toContain('Board "Retro" (columns)');
    expect(text).toContain('Panel "Went well":');
    expect(text).toContain('Panel "To improve":');
    expect(text).toContain('[S1.1] note · Shipping · Fast');
    expect(text).toContain('[S1.2] note · Team');
    expect(text).toContain('[S1.3] container · Risks');
    expect(text).toContain('  [S1.4] note · Flaky tests · CI');
    // Every panel is listed, including an empty one.
    expect(text).toContain('Panel "Empty": (no posts)');
    // Order: the three sections, their posts, the container then its child.
    expect(text.indexOf('S1.1')).toBeLessThan(text.indexOf('S1.2'));
    expect(text.indexOf('S1.2')).toBeLessThan(text.indexOf('S1.3'));
    expect(text.indexOf('S1.3')).toBeLessThan(text.indexOf('S1.4'));
    // One citable passage per post, in order, naming only the post.
    expect(block?.passages?.map((p) => p.padletId)).toEqual(['p1', 'p2', 'c1', 'p3']);
    expect(block?.passages?.every((p) => p.source === 'post')).toBe(true);
    expect(block?.passages?.[0].label).toContain('Went well');
    // Board-scoped read, and sections read only for columns/grid.
    expect(filters.padlets.some((f) => f.board_id === BOARD)).toBe(true);
    expect(filters.board_sections.some((f) => f.board_id === BOARD)).toBe(true);
  });

  it('labels a title-less post from its text, then its type -- never "Untitled"', async () => {
    const { client } = fakeClient({
      boards: [{ id: BOARD, layout: 'columns', title: 'Retro' }],
      board_sections: [{ id: 197, title: 'Ideas', position: 0, board_id: BOARD }],
      padlets: [
        note('p1', '', { sectionId: '197', sectionPosition: 0 }, '<p>Improve the onboarding flow for new teams</p>'),
        { id: 'p2', type: 'image', title: '', content: '', metadata: { sectionId: '197', sectionPosition: 1 }, board_id: BOARD },
      ],
    });

    const result = await readPadletBoardBlock(client, BOARD, 0);
    const block = result.ok ? result.value : null;
    const text = block?.text ?? '';
    expect(text).not.toContain('Untitled');
    // The label is the panel + the first six words of the post's text.
    expect(block?.passages?.[0].label).toBe('Ideas · Improve the onboarding flow for new…');
    // A title-less, text-less post falls back to its type.
    expect(block?.passages?.[1].label).toBe('Ideas · Image');
  });

  it('Wall: a panel per root container by wallPosition, children as its posts', async () => {
    const { client, filters } = fakeClient({
      boards: [{ id: BOARD, layout: 'wall', title: 'Wall' }],
      padlets: [
        container('w2', 'Second', ['p2'], { wallPosition: 1 }),
        container('w1', 'First', ['p1'], { wallPosition: 0 }),
        note('p1', 'One'),
        note('p2', 'Two'),
      ],
    });

    const result = await readPadletBoardBlock(client, BOARD, 1);
    const text = result.ok ? result.value?.text ?? '' : '';
    expect(text).toContain('Board "Wall" (wall)');
    // Block index 1 -> S2.x.
    expect(text.indexOf('Panel "First":')).toBeLessThan(text.indexOf('Panel "Second":'));
    expect(text).toContain('[S2.1] note · One');
    expect(text).toContain('[S2.2] note · Two');
    // No sections read on Wall.
    expect(filters.board_sections).toBeUndefined();
  });

  it('Timeline: containers by position_in_timeline, with the timelineLabel date field', async () => {
    const { client } = fakeClient({
      boards: [{ id: BOARD, layout: 'timeline', title: 'Roadmap' }],
      padlets: [
        container('t1', 'Q1', ['p1'], { position_in_timeline: 0, timelineLabel: 'Jan–Mar' }),
        note('p1', 'Kickoff'),
      ],
    });

    const result = await readPadletBoardBlock(client, BOARD, 0);
    const text = result.ok ? result.value?.text ?? '' : '';
    expect(text).toContain('Panel "Jan–Mar · Q1":');
    expect(text).toContain('[S1.1] note · Kickoff');
  });

  it('Map: a panel per located post, plus Unplaced', async () => {
    const { client } = fakeClient({
      boards: [{ id: BOARD, layout: 'map', title: 'Places' }],
      padlets: [
        { ...container('m1', 'Berlin pin', ['p1']), location_label: 'Berlin', location_lat: 52.52, location_lng: 13.405 },
        note('p1', 'Note in Berlin'),
        { ...note('p2', 'No label'), location_lat: 40.7123, location_lng: -74.0067 },
        note('p3', 'Nowhere'),
      ],
    });

    const result = await readPadletBoardBlock(client, BOARD, 0);
    const text = result.ok ? result.value?.text ?? '' : '';
    expect(text).toContain('Panel "Berlin":');
    expect(text).toContain('[S1.1] note · Note in Berlin');
    // No label -> lat/lng rounded to 2 decimals.
    expect(text).toContain('Panel "40.71, -74.01":');
    expect(text).toContain('[S1.2] note · No label');
    expect(text).toContain('Panel "Unplaced":');
    expect(text).toContain('[S1.3] note · Nowhere');
  });

  it('resolves to null on a non-Padlet layout and on an unreadable board', async () => {
    const { client } = fakeClient({
      boards: [{ id: BOARD, layout: 'kanban', title: 'K' }, { id: OTHER, layout: 'freeform', title: 'F' }],
    });
    const kanban = await readPadletBoardBlock(client, BOARD, 0);
    expect(kanban.ok && kanban.value).toBeNull();
    const freeform = await readPadletBoardBlock(client, OTHER, 0);
    expect(freeform.ok && freeform.value).toBeNull();
    const missing = await readPadletBoardBlock(client, 'ffffffff-ffff-4fff-8fff-ffffffffffff', 0);
    expect(missing.ok && missing.value).toBeNull();
  });

  it('never puts ids, emails or createdBy into the text', async () => {
    const { client } = fakeClient({
      boards: [{ id: BOARD, layout: 'columns', title: 'Retro' }],
      board_sections: [{ id: 197, title: 'Went well', position: 0, board_id: BOARD }],
      padlets: [
        { ...note('p1', 'Shipping', { sectionId: '197', sectionPosition: 0, createdBy: 'e0111111-1111-4111-8111-111111111111' }), },
        { ...note('p2', 'Team', { sectionId: '197', sectionPosition: 1 }), },
      ],
    });
    const result = await readPadletBoardBlock(client, BOARD, 0);
    const text = result.ok ? result.value?.text ?? '' : '';
    expect(text).not.toContain('p1');
    expect(text).not.toContain('e0111111');
    expect(text).not.toContain('createdBy');
    expect(text).not.toContain('@');
  });

  it('truncates with a loud note rather than clipping it', async () => {
    const many: Row[] = [];
    for (let i = 0; i < 400; i += 1) many.push(note(`p${i}`, `Post ${i}`, { sectionId: '197', sectionPosition: i }, 'x'.repeat(60)));
    const { client } = fakeClient({
      boards: [{ id: BOARD, layout: 'columns', title: 'Big' }],
      board_sections: [{ id: 197, title: 'All', position: 0, board_id: BOARD }],
      padlets: many,
    });
    const result = await readPadletBoardBlock(client, BOARD, 0);
    const text = result.ok ? result.value?.text ?? '' : '';
    expect(text).toMatch(/\(\d+ more posts not shown\)$/);
    expect(text.length).toBeLessThanOrEqual(6000);
  });
});

describe('PATCH-371 padlet-board wiring', () => {
  const { client } = fakeClient({
    boards: [{ id: BOARD, layout: 'columns', title: 'Retro' }],
    board_sections: [{ id: 197, title: 'All', position: 0, board_id: BOARD }],
    padlets: [note('p1', 'Shipping', { sectionId: '197', sectionPosition: 0 })],
  });

  it('the dispatcher routes padlet-board like kanban-board', async () => {
    const result = await resolveBoardAiChatContext(
      client as unknown as BoardAiContextSupabaseClient,
      BOARD,
      [{ type: 'padlet-board' }],
      neverReads,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.map((block) => block.type)).toEqual(['padlet-board']);
  });

  it('history never re-runs a padlet-board overview', async () => {
    const blocks = await resolveHistoricalBoardAiChatContext(
      client as unknown as BoardAiContextSupabaseClient,
      BOARD,
      [{ type: 'padlet-board' }, { type: 'padlet', padletId: 'p1' }],
    );
    expect(blocks.map((block) => block.type)).toEqual(['padlet']);
  });
});
