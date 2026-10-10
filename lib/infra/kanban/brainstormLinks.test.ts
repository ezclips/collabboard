// PATCH-341. Behavioural tests for the "From brainstorm" reverse lookup, run
// with a hand-rolled chainable fake so no Supabase client is constructed.
import { describe, expect, it, vi } from 'vitest';
import { loadBrainstormLinks, NOTE_LABEL_MAX } from '@/lib/kanban/brainstormLinks';

function makeClient(resolver: (table: string) => { data?: unknown; error?: unknown }) {
  const from = (table: string) => {
    const query: any = {
      select: () => query,
      eq: () => query,
      in: () => query,
      then: (onF: any, onR: any) => Promise.resolve(resolver(table)).then(onF, onR),
    };
    return query;
  };
  return { from } as any;
}

const noteRow = (id: string, boardId: string, title: string | null, content: string | null, cardId: string) => ({
  id,
  board_id: boardId,
  title,
  content,
  metadata: { kanbanLink: { boardId: 'kanban-1', cardId } },
});

describe('PATCH-341 loadBrainstormLinks', () => {
  it('groups notes by card id and labels them from title or first line', async () => {
    const client = makeClient((table) => {
      if (table === 'padlets') {
        return {
          data: [
            noteRow('n1', 'fb-1', 'Venue', 'body', 'card-1'),
            noteRow('n2', 'fb-1', null, '<p>Book the venue</p><p>Call three places</p>', 'card-1'),
            noteRow('n3', 'fb-2', 'Other', 'x', 'card-2'),
          ],
        };
      }
      return {
        data: [
          { id: 'fb-1', title: 'Brainstorm A' },
          { id: 'fb-2', title: 'Brainstorm B' },
        ],
      };
    });

    const links = await loadBrainstormLinks('kanban-1', client);

    expect(Array.from(links.keys()).sort()).toEqual(['card-1', 'card-2']);
    expect(links.get('card-1')).toEqual([
      { noteId: 'n1', boardId: 'fb-1', boardTitle: 'Brainstorm A', noteLabel: 'Venue' },
      { noteId: 'n2', boardId: 'fb-1', boardTitle: 'Brainstorm A', noteLabel: 'Book the venue' },
    ]);
    expect(links.get('card-2')?.[0]).toMatchObject({ noteId: 'n3', boardTitle: 'Brainstorm B', noteLabel: 'Other' });
  });

  it('caps the note label and strips HTML', async () => {
    const longTitle = 'x'.repeat(200);
    const client = makeClient((table) => {
      if (table === 'padlets') return { data: [noteRow('n1', 'fb-1', null, `<b>${longTitle}</b>`, 'card-1')] };
      return { data: [{ id: 'fb-1', title: 'B' }] };
    });

    const links = await loadBrainstormLinks('kanban-1', client);
    expect(links.get('card-1')?.[0].noteLabel).toHaveLength(NOTE_LABEL_MAX);
    expect(links.get('card-1')?.[0].noteLabel).not.toContain('<');
  });

  it('returns an empty map when nothing is linked', async () => {
    const client = makeClient(() => ({ data: [] }));
    expect((await loadBrainstormLinks('kanban-1', client)).size).toBe(0);
  });

  it('returns an empty map (and logs no content) on a query error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = makeClient(() => ({ data: null, error: { message: 'boom', code: '42P01' } }));

    const links = await loadBrainstormLinks('kanban-1', client);

    expect(links.size).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
