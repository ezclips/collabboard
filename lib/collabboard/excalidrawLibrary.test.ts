import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExcalidrawLibraryItem } from './excalidrawLibrary';

const hoisted = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: hoisted.getUser },
    from: hoisted.from,
  },
}));

function makeItem(id: string): ExcalidrawLibraryItem {
  return {
    id,
    name: `Item ${id}`,
    source: `https://libraries.excalidraw.com/x.excalidrawlib#${id}`,
    elements: [{ id: `el-${id}`, type: 'rectangle' }],
    created: 1,
  };
}

async function load() {
  return import('./excalidrawLibrary');
}

beforeEach(() => {
  vi.resetModules();
  hoisted.getUser.mockReset();
  hoisted.upsert.mockReset();
  hoisted.from.mockReset();
  hoisted.from.mockReturnValue({ upsert: hoisted.upsert });
  hoisted.upsert.mockResolvedValue({ error: null });
  hoisted.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('PATCH-299 addItemsToExcalidrawLibrary', () => {
  it('writes every row with user_id in one upsert and updates the cache', async () => {
    const { addItemsToExcalidrawLibrary, getExcalidrawLibrary } = await load();
    const items = [makeItem('a'), makeItem('b')];

    const result = await addItemsToExcalidrawLibrary(items);

    expect(hoisted.from).toHaveBeenCalledWith('excalidraw_library');
    expect(hoisted.upsert).toHaveBeenCalledTimes(1);
    const rows = hoisted.upsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.user_id === 'user-1')).toBe(true);
    expect(result).toEqual({ saved: 2, error: null });
    expect(getExcalidrawLibrary().map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('returns a database error instead of throwing or swallowing it, leaving the cache unchanged', async () => {
    hoisted.upsert.mockResolvedValue({
      error: { message: 'new row violates row-level security policy' },
    });
    const { addItemsToExcalidrawLibrary, getExcalidrawLibrary } = await load();

    const result = await addItemsToExcalidrawLibrary([makeItem('a')]);

    expect(result).toEqual({
      saved: 0,
      error: 'new row violates row-level security policy',
    });
    // Addendum 1: a failed save must not look saved -- nothing in the cache.
    expect(getExcalidrawLibrary()).toHaveLength(0);
  });

  it('does not upsert when signed out, but still updates the cache', async () => {
    hoisted.getUser.mockResolvedValue({ data: { user: null } });
    const { addItemsToExcalidrawLibrary, getExcalidrawLibrary } = await load();

    const result = await addItemsToExcalidrawLibrary([makeItem('c')]);

    expect(hoisted.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: 1, error: null });
    expect(getExcalidrawLibrary().some((i) => i.id === 'c')).toBe(true);
  });
});
