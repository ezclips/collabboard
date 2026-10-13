// PATCH-354. The move runner behind "Arrange on board". The posts command and
// its repository are stubbed, so this proves the runner, not the DB.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/lib/domain/canvas/posts', () => ({ createUpdatePostPositionCommand: () => mocks.update }));
vi.mock('@/lib/infra/canvas/postsRepository', () => ({ createPostsRepository: () => ({}) }));

import { moveNotesForArrangement, notesAiPositionUpdater } from './notesAiArrange';
import type { Padlet } from '@/types/collabboard';

beforeEach(() => { mocks.update.mockReset(); });

const post = (id: string, x: number, y: number): Padlet => ({
  id, board_id: 'b', title: '', content: '', type: 'note',
  position_x: x, position_y: y, width: 1, height: 1, created_at: 'n', updated_at: 'n',
});

describe('PATCH-354 notesAiPositionUpdater', () => {
  it('applies the given positions and leaves other posts alone', () => {
    const next = notesAiPositionUpdater(new Map([['a', { x: 10, y: 20 }]]))([post('a', 0, 0), post('b', 5, 5)]);
    expect(next[0]).toMatchObject({ id: 'a', position_x: 10, position_y: 20 });
    expect(next[1]).toMatchObject({ id: 'b', position_x: 5, position_y: 5 });
  });
});

describe('PATCH-354 moveNotesForArrangement', () => {
  const moves = [{ id: 'a', x: 10, y: 20 }, { id: 'b', x: 30, y: 40 }];

  it('applies optimistically and persists each move', async () => {
    mocks.update.mockResolvedValue({ ok: true });
    const applied: Array<ReadonlyMap<string, { x: number; y: number }>> = [];
    const ok = await moveNotesForArrangement(moves, (positions) => applied.push(positions));
    expect(ok).toBe(true);
    expect(applied).toHaveLength(1);
    expect(applied[0].get('a')).toEqual({ x: 10, y: 20 });
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledWith({ postId: 'a', positionX: 10, positionY: 20 }, { userId: null });
  });

  it('returns false when any persist fails', async () => {
    mocks.update.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    expect(await moveNotesForArrangement(moves, () => {})).toBe(false);
  });

  it('a thrown persist is a failure, not a crash', async () => {
    mocks.update.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true });
    expect(await moveNotesForArrangement(moves, () => {})).toBe(false);
  });

  it('an empty move list is a no-op success', async () => {
    expect(await moveNotesForArrangement([], () => {})).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
