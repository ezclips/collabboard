// PATCH-340. Behavioural tests for the "Send to Kanban" data layer, run with a
// hand-rolled chainable fake so no Supabase client is constructed.
import { describe, expect, it } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { loadKanbanLinkStatuses, sendNotesToKanban } from '@/lib/kanban/sendNotesToKanban';

type Resolver = (args: { table: string; payload?: unknown; method: string }) => unknown;

function makeClient(resolver: Resolver) {
  const from = (table: string) => {
    const query: any = {
      payload: undefined as unknown,
      select: () => query,
      eq: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      is: () => query,
      insert: (payload: unknown) => { query.payload = payload; return query; },
      maybeSingle: () => Promise.resolve(resolver({ table, method: 'maybeSingle' })),
      then: (onF: any, onR: any) =>
        Promise.resolve(resolver({ table, payload: query.payload, method: 'select' })).then(onF, onR),
    };
    return query;
  };
  return { from } as any;
}

function note(id: string, title: string, content: string, position_y: number): Padlet {
  return {
    id, board_id: 'fb', title, content, type: 'text',
    position_x: 0, position_y, width: 100, height: 100,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as unknown as Padlet;
}

describe('PATCH-340 sendNotesToKanban', () => {
  it('inserts one card per note at the end of the column, in reading order', async () => {
    const notes = [note('n2', 'Second', 'b', 50), note('n1', 'First', 'a', 0)];
    let inserted: any[] = [];
    const client = makeClient(({ table, payload }) => {
      if (table === 'kanban_cards' && payload === undefined) return { data: [{ order_index: 4 }], error: null };
      if (table === 'kanban_cards' && payload) {
        inserted = Array.isArray(payload) ? payload : [payload];
        return { data: inserted.map((row) => ({ id: row.id })), error: null };
      }
      return { data: null, error: null };
    });

    const result = await sendNotesToKanban(
      { boardId: 'kb', columnId: 'c1', swimlaneId: 's1', notes, userId: 'u1' },
      client,
    );

    expect(result.total).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.created.map((c) => c.noteId)).toEqual(['n1', 'n2']);
    expect(inserted.map((row) => row.order_index)).toEqual([5, 6]);
    expect(inserted.map((row) => row.title)).toEqual(['First', 'Second']);
    expect(inserted[0]).toMatchObject({ canvas_id: 'kb', column_id: 'c1', swimlane_id: 's1', creator_id: 'u1' });
  });

  it('reports the honest created/failed split when the batch is refused', async () => {
    const notes = [note('n1', 'Keep', 'a', 0), note('n2', 'Drop', 'b', 10)];
    const client = makeClient(({ table, payload }) => {
      if (table === 'kanban_cards' && payload === undefined) return { data: [], error: null };
      if (table === 'kanban_cards' && payload) {
        if (Array.isArray(payload)) return { data: null, error: { message: 'batch refused' } };
        const row = payload as { id: string; title: string };
        return row.title === 'Keep'
          ? { data: [{ id: row.id }], error: null }
          : { data: null, error: { message: 'row refused' } };
      }
      return { data: null, error: null };
    });

    const result = await sendNotesToKanban(
      { boardId: 'kb', columnId: 'c1', swimlaneId: null, notes, userId: 'u1' },
      client,
    );

    expect(result.created.map((c) => c.noteId)).toEqual(['n1']);
    expect(result.failed).toBe(1);
  });
});

describe('PATCH-340 loadKanbanLinkStatuses', () => {
  it('returns the column title for a live card and marks a missing one unavailable', async () => {
    const client = makeClient(({ table }) => {
      if (table === 'boards') return { data: { id: 'kb', title: 'Roadmap' } };
      if (table === 'kanban_cards') return { data: [{ id: 'kc1', column_id: 'c1' }] };
      if (table === 'kanban_columns') return { data: [{ id: 'c1', name: 'In progress' }] };
      return { data: [] };
    });

    const statuses = await loadKanbanLinkStatuses(
      [
        { noteId: 'n1', boardId: 'kb', cardId: 'kc1' },
        { noteId: 'n2', boardId: 'kb', cardId: 'kc-gone' },
      ],
      client,
    );

    expect(statuses.get('kc1')).toEqual({
      boardId: 'kb',
      boardTitle: 'Roadmap',
      columnTitle: 'In progress',
      available: true,
    });
    expect(statuses.get('kc-gone')).toEqual({
      boardId: 'kb',
      boardTitle: 'Roadmap',
      columnTitle: '',
      available: false,
    });
  });
});
