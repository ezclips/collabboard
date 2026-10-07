// PATCH-320 §5. Kanban attachment objects under `kanban/<cardId>/` are removed
// with what owns them; a path outside the card's own prefix is never deleted.
import { describe, expect, it, vi } from 'vitest';
import {
  kanbanAttachmentPathFromUrl,
  removeKanbanAttachmentByUrl,
  removeKanbanCardAttachments,
  removeKanbanCardAttachmentsForCards,
} from '@/lib/kanban/kanbanAttachmentStorage';

function fakeStorage(items: Record<string, string[]> = {}) {
  const removed: string[][] = [];
  const storage = {
    from: () => ({
      list: async (prefix: string) => ({ data: (items[prefix] ?? []).map((name) => ({ name })), error: null }),
      remove: async (paths: string[]) => {
        removed.push(paths);
        return { error: null };
      },
    }),
  };
  return { storage, removed };
}

const publicUrl = (path: string) =>
  `https://proj.supabase.co/storage/v1/object/public/padlet-files/${path}`;

describe('PATCH-320: kanban attachment storage', () => {
  it('parses a path only under this card prefix', () => {
    expect(kanbanAttachmentPathFromUrl(publicUrl('kanban/card-1/123-a.png'), 'card-1')).toBe('kanban/card-1/123-a.png');
    expect(kanbanAttachmentPathFromUrl(publicUrl('kanban/card-2/123-a.png'), 'card-1')).toBeNull();
    expect(kanbanAttachmentPathFromUrl('https://example.com/whatever.png', 'card-1')).toBeNull();
    expect(kanbanAttachmentPathFromUrl(null, 'card-1')).toBeNull();
  });

  it('remove by URL deletes exactly that object, and nothing outside the prefix', async () => {
    const { storage, removed } = fakeStorage();
    await removeKanbanAttachmentByUrl(storage, publicUrl('kanban/card-1/123-a.png'), 'card-1');
    expect(removed).toEqual([['kanban/card-1/123-a.png']]);

    await removeKanbanAttachmentByUrl(storage, publicUrl('kanban/card-2/123-a.png'), 'card-1');
    expect(removed).toHaveLength(1);
  });

  it('removes every object under the card prefix', async () => {
    const { storage, removed } = fakeStorage({ 'kanban/card-1/': ['a.png', 'b.pdf'] });
    await removeKanbanCardAttachments(storage, 'card-1');
    expect(removed).toEqual([['kanban/card-1/a.png', 'kanban/card-1/b.pdf']]);
  });

  it('removes each card folder for a list of cards', async () => {
    const { storage, removed } = fakeStorage({
      'kanban/card-1/': ['a.png'],
      'kanban/card-2/': ['b.png'],
    });
    await removeKanbanCardAttachmentsForCards(storage, ['card-1', 'card-2']);
    expect(removed).toEqual([['kanban/card-1/a.png'], ['kanban/card-2/b.png']]);
  });

  it('logs and swallows a storage failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = {
      from: () => ({
        list: async () => {
          throw new Error('boom');
        },
        remove: async () => ({ error: null }),
      }),
    };
    await expect(removeKanbanCardAttachments(storage, 'card-1')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
