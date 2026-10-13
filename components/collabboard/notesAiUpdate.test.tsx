// PATCH-355. The field-update runner behind "Apply translation". The posts
// command and its repository are stubbed, so this proves the runner, not the DB.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/lib/domain/canvas/posts', () => ({ createUpdatePostFieldsCommand: () => mocks.update }));
vi.mock('@/lib/infra/canvas/postsRepository', () => ({ createPostsRepository: () => ({}) }));

import { notesAiFieldUpdater, updateNotesForTranslate } from './notesAiUpdate';
import type { Padlet } from '@/types/collabboard';

beforeEach(() => { mocks.update.mockReset(); });

const post = (id: string, title: string, content: string): Padlet => ({
  id, board_id: 'b', title, content, type: 'note',
  position_x: 0, position_y: 0, width: 1, height: 1, created_at: 'n', updated_at: 'n',
});

describe('PATCH-355 notesAiFieldUpdater', () => {
  it('applies title/content and leaves other posts alone', () => {
    const next = notesAiFieldUpdater(new Map([['a', { title: 'T', content: 'C' }]]))([
      post('a', 'old', 'old'), post('b', 'x', 'y'),
    ]);
    expect(next[0]).toMatchObject({ id: 'a', title: 'T', content: 'C' });
    expect(next[1]).toMatchObject({ id: 'b', title: 'x', content: 'y' });
  });
});

describe('PATCH-355 updateNotesForTranslate', () => {
  const updates = [
    { id: 'a', title: 'T1', content: 'C1' },
    { id: 'b', title: 'T2', content: 'C2' },
  ];

  it('applies optimistically and persists each update', async () => {
    mocks.update.mockResolvedValue({ ok: true });
    const applied: Array<ReadonlyMap<string, { title: string; content: string }>> = [];
    const ok = await updateNotesForTranslate(updates, (fields) => applied.push(fields));
    expect(ok).toBe(true);
    expect(applied).toHaveLength(1);
    expect(applied[0].get('a')).toEqual({ title: 'T1', content: 'C1' });
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledWith(
      { postId: 'a', fields: { title: 'T1', content: 'C1' } },
      { userId: null },
    );
  });

  it('returns false when any persist fails', async () => {
    mocks.update.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    expect(await updateNotesForTranslate(updates, () => {})).toBe(false);
  });

  it('a thrown persist is a failure, not a crash', async () => {
    mocks.update.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true });
    expect(await updateNotesForTranslate(updates, () => {})).toBe(false);
  });

  it('an empty update list is a no-op success', async () => {
    expect(await updateNotesForTranslate([], () => {})).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
