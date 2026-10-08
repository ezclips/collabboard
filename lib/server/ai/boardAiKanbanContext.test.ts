import { describe, expect, it } from 'vitest';

import {
  isKanbanBoard,
  readKanbanBoardBlock,
  readKanbanCardBlock,
  type BoardAiKanbanSupabaseClient,
} from './boardAiKanbanContext';
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
const CARD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CARD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CARD_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COL_TODO = 'c0111111-1111-4111-8111-111111111111';
const COL_DONE = 'c0222222-2222-4222-8222-222222222222';
const ROW_HIGH = 'd0111111-1111-4111-8111-111111111111';
const ROW_LOW = 'd0222222-2222-4222-8222-222222222222';
const USER_A = 'e0111111-1111-4111-8111-111111111111';
const USER_B = 'e0222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

/**
 * The board-members RPC's shape, NOT the `kanban_board_members` table: that
 * table carries no `display_name`, which is why the reader takes names from the
 * RPC the Kanban store itself uses.
 */
const MEMBERS: Row[] = [
  { user_id: USER_A, display_name: 'Ada', email: 'ada@example.com' },
  { user_id: USER_B, display_name: 'Bo', email: 'bo@example.com' },
];

/**
 * A client that records the FILTERS each query applied, keyed by table.
 *
 * The board scope is the property under test -- a card on another board must
 * simply not be there for `eq('canvas_id', boardId)` -- so what matters is the
 * filter the reader asked for, not that a hand-written fake happened to return
 * a row.
 */
function fakeClient(tables: Record<string, Row[]>, members: Row[] = MEMBERS) {
  const filters: Record<string, Record<string, unknown>[]> = {};
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          const eq: Record<string, unknown> = {};
          const inFilter: Record<string, unknown[]> = {};
          let orderColumn: string | null = null;
          let ascending = true;
          let limitCount: number | null = null;
          // Recorded per query: a table is read more than once (a card, then the
          // link targets), so the LAST filter is not the one under test.
          (filters[table] ??= []).push(eq);
          const rows = tables[table] ?? [];
          const matched = () => rows.filter((row) =>
            Object.entries(eq).every(([key, value]) => row[key] === value)
            && Object.entries(inFilter).every(([key, values]) => values.includes(row[key])));
          const query: Record<string, unknown> = {
            eq(column: string, value: unknown) { eq[column] = value; return query; },
            in(column: string, values: readonly unknown[]) { inFilter[column] = [...values]; return query; },
            order(column: string, options: { ascending: boolean }) {
              orderColumn = column;
              ascending = options.ascending;
              return query;
            },
            limit(count: number) { limitCount = count; return query; },
            maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
            then(resolve: (value: { data: Row[]; error: null }) => unknown) {
              let out = matched();
              if (orderColumn !== null) {
                const column = orderColumn;
                const compare = (a: Row, b: Row) => {
                  const left = a[column];
                  const right = b[column];
                  return typeof left === 'number' && typeof right === 'number'
                    ? left - right
                    : String(left).localeCompare(String(right));
                };
                out = [...out].sort((a, b) => compare(a, b) * (ascending ? 1 : -1));
              }
              if (limitCount !== null) out = out.slice(0, limitCount);
              return Promise.resolve({ data: out, error: null }).then(resolve);
            },
          };
          return query;
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return { data: members, error: null };
    },
  };
  return { client: client as unknown as BoardAiKanbanSupabaseClient, filters, rpcCalls };
}

/** A Kanban board, plus a non-Kanban board and a card that lives elsewhere. */
function kanbanTables(over: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
    boards: [
      { id: BOARD, layout: 'kanban' },
      { id: OTHER, layout: 'grid' },
    ],
    kanban_columns: [
      { id: COL_TODO, name: 'To do', order_index: 0, canvas_id: BOARD },
      { id: COL_DONE, name: 'Done', order_index: 1, canvas_id: BOARD },
    ],
    kanban_swimlanes: [
      { id: ROW_HIGH, name: 'High', order_index: 0, canvas_id: BOARD },
      { id: ROW_LOW, name: 'Low', order_index: 1, canvas_id: BOARD },
    ],
    kanban_cards: [
      {
        id: CARD_A, title: 'Ship the release', content: 'Cut the release branch.',
        column_id: COL_DONE, swimlane_id: ROW_HIGH, priority: 3, status: 'in-progress',
        project_id: 'proj-1', score: 60, date_started: '2026-10-01T00:00:00+00:00',
        date_due: '2026-10-10T00:00:00+00:00', assignee_id: null, order_index: 1, canvas_id: BOARD,
      },
      {
        id: CARD_B, title: 'Write docs', content: 'Body of B',
        column_id: COL_TODO, swimlane_id: ROW_LOW, priority: 1, status: 'todo',
        project_id: null, score: null, date_started: null, date_due: null,
        assignee_id: null, order_index: 0, canvas_id: BOARD,
      },
      {
        id: CARD_C, title: 'Foreign card', content: 'Not on this board.',
        column_id: null, swimlane_id: null, priority: 0, status: null,
        project_id: null, score: null, date_started: null, date_due: null,
        assignee_id: null, order_index: 0, canvas_id: OTHER,
      },
    ],
    kanban_links: [
      { from_card_id: CARD_A, to_card_id: CARD_B, relation: 'blocks' },
    ],
    kanban_comments: [
      { card_id: CARD_A, user_id: USER_A, text: 'First comment', created_at: '2026-10-02T00:00:00+00:00' },
      { card_id: CARD_A, user_id: USER_B, text: 'Second comment', created_at: '2026-10-03T00:00:00+00:00' },
    ],
    kanban_card_assignees: [
      { card_id: CARD_A, user_id: USER_B },
    ],
    ...over,
  };
}

describe('PATCH-322 the board must actually be a Kanban board', () => {
  it('true only for boards.layout = kanban', async () => {
    const { client } = fakeClient(kanbanTables());
    const kanban = await isKanbanBoard(client, BOARD);
    expect(kanban.ok && kanban.value).toBe(true);
    const grid = await isKanbanBoard(client, OTHER);
    expect(grid.ok && grid.value).toBe(false);
  });

  it('an unreadable board reads as no board at all', async () => {
    const { client } = fakeClient(kanbanTables({ boards: [] }));
    const result = await isKanbanBoard(client, BOARD);
    expect(result.ok && result.value).toBe(false);
  });
});

describe('PATCH-322 one attached card', () => {
  it('reads the card through the caller, scoped to the route board', async () => {
    const { client, filters } = fakeClient(kanbanTables());
    const result = await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    // The card row is only ever asked for WITH the route board.
    expect(filters.kanban_cards).toContainEqual({ id: CARD_A, canvas_id: BOARD });
    expect(result.value).toMatchObject({
      type: 'kanban-card', cardId: CARD_A, label: 'Ship the release',
    });
  });

  it('carries column, row, dates, priority, status, progress, people, links and comments', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    const text = result.value.text;
    expect(text).toContain('Ship the release');
    expect(text).toContain('Column: Done');
    expect(text).toContain('Row: High');
    expect(text).toContain('Dates: 2026-10-01 → 2026-10-10');
    expect(text).toContain('Priority: high');
    expect(text).toContain('Status: in-progress');
    expect(text).toContain('Progress: 60%');
    expect(text).toContain('People: Bo');
    expect(text).toContain('Cut the release branch.');
    expect(text).toContain('blocks');
    expect(text).toContain('Write docs');
    // Newest last.
    expect(text.indexOf('First comment')).toBeLessThan(text.indexOf('Second comment'));
  });

  it('NEVER carries another card’s own text', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(result.ok && result.value !== null && result.value.text).not.toContain('Body of B');
  });

  it('a card on another board resolves to nothing', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await readKanbanCardBlock(client, BOARD, CARD_C);
    expect(result.ok && result.value).toBeNull();
  });

  it('a card on a NON-Kanban board resolves to nothing', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await readKanbanCardBlock(client, OTHER, CARD_C);
    expect(result.ok && result.value).toBeNull();
  });

  it('a missing column or comment degrades that line, not the turn', async () => {
    const { client } = fakeClient(kanbanTables({
      kanban_columns: [], kanban_comments: [], kanban_card_assignees: [],
    }));
    const result = await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    expect(result.value.text).not.toContain('Column:');
    expect(result.value.text).not.toContain('Comments:');
    // The card itself still arrives.
    expect(result.value.text).toContain('Ship the release');
  });
});

describe('PATCH-322 the whole-board overview', () => {
  it('orders by column, then row, then card', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await readKanbanBoardBlock(client, BOARD, 0);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    const text = result.value.text;
    expect(text.indexOf('Write docs')).toBeLessThan(text.indexOf('Ship the release'));
    expect(text).toContain('[S1.1] Write docs');
    expect(text).toContain('[S1.2] Ship the release');
    expect(text).toContain(' · To do · Low · no dates · low · todo · —');
  });

  it('passages map sub-tokens to the right card ids, in line order', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await readKanbanBoardBlock(client, BOARD, 0);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    expect(result.value.passages?.map((passage) => passage.cardId)).toEqual([CARD_B, CARD_A]);
    expect(result.value.passages?.[0]).toMatchObject({ source: 'kanban-card', label: 'Write docs' });
  });

  it('the sub-token base follows the block’s position in the request', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await readKanbanBoardBlock(client, BOARD, 2);
    expect(result.ok && result.value !== null && result.value.text).toContain('[S3.1]');
  });

  it('fits the budget and says loudly how many cards were left out', async () => {
    const many = Array.from({ length: 500 }, (_, index) => ({
      id: `card-${index}`, title: `Card number ${index}`,
      column_id: COL_TODO, swimlane_id: null, priority: 0, status: null,
      date_started: null, date_due: null, order_index: index, canvas_id: BOARD,
    }));
    const { client } = fakeClient(kanbanTables({ kanban_cards: many }));
    const result = await readKanbanBoardBlock(client, BOARD, 0);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    const text = result.value.text;
    expect(text.length).toBeLessThanOrEqual(6_000);
    const omitted = Number(/\(\+(\d+) more cards not shown\)/.exec(text)?.[1] ?? '0');
    expect(omitted).toBeGreaterThan(0);
    expect(result.value.passages!.length + omitted).toBe(500);
  });

  it('an empty board is a truthful empty overview, not an error', async () => {
    const { client } = fakeClient(kanbanTables({ kanban_cards: [] }));
    const result = await readKanbanBoardBlock(client, BOARD, 0);
    expect(result.ok && result.value !== null && result.value.text).toBe('No cards on this board.');
    expect(result.ok && result.value !== null && result.value.passages).toBeUndefined();
  });

  it('a non-Kanban board resolves to nothing', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await readKanbanBoardBlock(client, OTHER, 0);
    expect(result.ok && result.value).toBeNull();
  });
});

describe('PATCH-322 the resolver wires Kanban in without widening anything else', () => {
  it('a kanban-card and a kanban-board both reach the model, in order', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await resolveBoardAiChatContext(
      client as unknown as BoardAiContextSupabaseClient,
      BOARD,
      [{ type: 'kanban-card', cardId: CARD_A }, { type: 'kanban-board' }],
      neverReads,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((block) => block.type)).toEqual(['kanban-card', 'kanban-board']);
    // The overview is the SECOND block, so its first sub-token is S2.1.
    expect(result.value[1].text).toContain('[S2.1]');
  });

  it('an unresolvable Kanban item is DROPPED, not refused -- the turn still runs', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await resolveBoardAiChatContext(
      client as unknown as BoardAiContextSupabaseClient,
      BOARD,
      [{ type: 'kanban-card', cardId: CARD_C }],
      neverReads,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('on a NON-Kanban board both Kanban types resolve to nothing', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await resolveBoardAiChatContext(
      client as unknown as BoardAiContextSupabaseClient,
      OTHER,
      [{ type: 'kanban-card', cardId: CARD_C }, { type: 'kanban-board' }],
      neverReads,
    );
    expect(result.ok && result.value).toEqual([]);
  });

  it('history re-resolves a kanban-card but never re-runs a kanban-board', async () => {
    const { client } = fakeClient(kanbanTables());
    const blocks = await resolveHistoricalBoardAiChatContext(
      client as unknown as BoardAiContextSupabaseClient,
      BOARD,
      [{ type: 'kanban-board' }, { type: 'kanban-card', cardId: CARD_A }],
    );
    expect(blocks.map((block) => block.type)).toEqual(['kanban-card']);
  });
});

describe('PATCH-322 the reader reads only through the caller and holds no admin client', () => {
  it('touches only the kanban tables, and names no privileged client', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const raw = fs.readFileSync(path.join(process.cwd(), 'lib/server/ai/boardAiKanbanContext.ts'), 'utf8');
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(source).not.toContain('getSupabaseAdmin');
    expect(source).not.toContain('service_role');
    const tables = new Set(source.match(/from\('(\w+)'\)/g) ?? []);
    expect([...tables].sort()).toEqual([
      "from('boards')",
      "from('kanban_card_assignees')",
      "from('kanban_cards')",
      "from('kanban_columns')",
      "from('kanban_comments')",
      "from('kanban_links')",
      "from('kanban_swimlanes')",
    ]);
    // Names come from the RPC, never a direct read of `kanban_board_members`,
    // which has no `display_name` to read.
    expect(source).toContain("rpc('get_board_members_with_profile'");
    expect(source).not.toMatch(/from\('kanban_board_members'\)/);
  });
});

// ---------------------------------------------------------------------------
// Addendum 1, fix 1: a link target must stay on this board
// ---------------------------------------------------------------------------
describe('PATCH-322 Addendum 1 the link target is scoped to this board', () => {
  it('asks for the target WITH the route board', async () => {
    const { client, filters } = fakeClient(kanbanTables());
    await readKanbanCardBlock(client, BOARD, CARD_A);
    // The target-title lookup carries the board filter, so a card on another
    // board is simply not there.
    expect(filters.kanban_cards).toContainEqual({ canvas_id: BOARD });
  });

  it('a same-board target shows its title', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(result.ok && result.value !== null && result.value.text).toContain('→ Write docs');
  });

  it('a target on ANOTHER board is "another card", never its raw id', async () => {
    const { client } = fakeClient(kanbanTables({
      kanban_links: [{ from_card_id: CARD_A, to_card_id: CARD_C, relation: 'blocks' }],
    }));
    const result = await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    expect(result.value.text).toContain('→ another card');
    expect(result.value.text).not.toContain(CARD_C);
    // And the foreign card's title is never borrowed either.
    expect(result.value.text).not.toContain('Foreign card');
  });
});

// ---------------------------------------------------------------------------
// Addendum 1, fix 2: the NEWEST 20 comments
// ---------------------------------------------------------------------------
describe('PATCH-322 Addendum 1 comments are the newest 20, oldest first', () => {
  it('drops the oldest beyond 20 and reads the kept ones oldest -> newest', async () => {
    const comments = Array.from({ length: 25 }, (_, index) => ({
      card_id: CARD_A, user_id: USER_A,
      text: `comment ${index}`,
      // ISO strings sort lexicographically, so index 24 is the newest.
      created_at: `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00+00:00`,
    }));
    const { client } = fakeClient(kanbanTables({ kanban_comments: comments }));
    const result = await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    const text = result.value.text;
    // The oldest five are gone; comments 5..24 remain.
    expect(text).not.toContain('comment 4');
    expect(text).not.toContain('comment 0');
    expect(text).toContain('comment 5');
    expect(text).toContain('comment 24');
    expect(text.indexOf('comment 5')).toBeLessThan(text.indexOf('comment 24'));
  });
});

// ---------------------------------------------------------------------------
// Addendum 1, fix 3: names, never emails or user ids
// ---------------------------------------------------------------------------
describe('PATCH-322 Addendum 1 people are display names, never identities', () => {
  it('reads members through the RPC with the route board id', async () => {
    const { client, rpcCalls } = fakeClient(kanbanTables());
    await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(rpcCalls).toContainEqual({ fn: 'get_board_members_with_profile', args: { board_id: BOARD } });
  });

  it('uses display_name for assignees and comment authors', async () => {
    const { client } = fakeClient(kanbanTables());
    const result = await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(result.ok && result.value !== null && result.value.text).toContain('People: Bo');
    expect(result.ok && result.value !== null && result.value.text).toContain('Ada: First comment');
  });

  it('a member with no display_name is "a board member", never an id or email', async () => {
    const { client } = fakeClient(
      kanbanTables(),
      [{ user_id: USER_B }, { user_id: USER_A, display_name: '   ' }],
    );
    const result = await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    const text = result.value.text;
    expect(text).toContain('People: a board member');
    expect(text).toContain('a board member: First comment');
    for (const leak of [USER_A, USER_B, 'ada@example.com', 'bo@example.com']) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it('the overview never writes a user id or an email either', async () => {
    const { client } = fakeClient(
      kanbanTables(),
      [{ user_id: USER_B }, { user_id: USER_A, email: 'ada@example.com' }],
    );
    const result = await readKanbanBoardBlock(client, BOARD, 0);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    const text = result.value.text;
    expect(text).toContain('a board member');
    for (const leak of [USER_A, USER_B, 'ada@example.com']) {
      expect(text, leak).not.toContain(leak);
    }
  });
});

// ---------------------------------------------------------------------------
// Addendum 2: a display_name can ITSELF be an email
// ---------------------------------------------------------------------------
describe('PATCH-322 Addendum 2 an email display_name is not a name', () => {
  it('treats a display_name containing "@" as missing, id and email included', async () => {
    const { client } = fakeClient(kanbanTables(), [
      { user_id: USER_B, display_name: 'codex.scrawny@example.com' },
      { user_id: USER_A, display_name: '   codex@example.com   ' },
    ]);
    const result = await readKanbanCardBlock(client, BOARD, CARD_A);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    const text = result.value.text;
    // Assignees and comment authors alike.
    expect(text).toContain('People: a board member');
    expect(text).toContain('a board member: First comment');
    for (const leak of [
      'codex.scrawny@example.com', 'codex@example.com', USER_A, USER_B,
    ]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it('the overview people column refuses an email display_name too', async () => {
    const { client } = fakeClient(kanbanTables(), [
      { user_id: USER_B, display_name: 'x@y.z' },
    ]);
    const result = await readKanbanBoardBlock(client, BOARD, 0);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    expect(result.value.text).toContain('a board member');
    expect(result.value.text).not.toContain('x@y.z');
  });
});
