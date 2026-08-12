import { describe, expect, it, vi } from 'vitest';
import {
  type Comment,
  editCommentText,
  removeComment,
  toggleCommentStrikethrough,
  setCommentTextColor,
  setCommentBackgroundColor,
  resolveCommentAccessMode,
  guardCommentMutation,
} from './comments';

function makeComments(): Comment[] {
  return [
    { id: 'a', text: 'first', userId: 'u1', userName: 'Alice', timestamp: 100 },
    { id: 'b', text: 'second', userId: 'u2', userName: 'Bob', timestamp: 200, isStrikethrough: false },
    { id: 'c', text: 'third', userId: 'u1', userName: 'Alice', timestamp: 300, textColor: '#111111' },
  ];
}

describe('comment domain -- editCommentText', () => {
  it('changes only the targeted comment', () => {
    const input = makeComments();
    const result = editCommentText(input, 'b', 'edited');
    expect(result.find((c) => c.id === 'b')?.text).toBe('edited');
    expect(result.find((c) => c.id === 'a')?.text).toBe('first');
    expect(result.find((c) => c.id === 'c')?.text).toBe('third');
  });

  it('preserves ordering, ids, timestamps, and unrelated fields', () => {
    const input = makeComments();
    const result = editCommentText(input, 'a', 'changed');
    expect(result.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(result.map((c) => c.timestamp)).toEqual([100, 200, 300]);
    expect(result.find((c) => c.id === 'c')?.textColor).toBe('#111111');
  });

  it('never mutates the input array or original comment objects', () => {
    const input = makeComments();
    const originalArray = [...input];
    const originalA = input[0];
    const result = editCommentText(input, 'a', 'changed');
    expect(input).toEqual(originalArray);
    expect(input[0]).toBe(originalA);
    expect(originalA.text).toBe('first');
    expect(result).not.toBe(input);
    expect(result[0]).not.toBe(originalA);
  });
});

describe('comment domain -- removeComment', () => {
  it('removes only the target comment', () => {
    const input = makeComments();
    const result = removeComment(input, 'b');
    expect(result.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = makeComments();
    const originalLength = input.length;
    removeComment(input, 'a');
    expect(input).toHaveLength(originalLength);
  });
});

describe('comment domain -- toggleCommentStrikethrough', () => {
  it('flips isStrikethrough only for the target comment', () => {
    const input = makeComments();
    const result = toggleCommentStrikethrough(input, 'b');
    expect(result.find((c) => c.id === 'b')?.isStrikethrough).toBe(true);
    expect(result.find((c) => c.id === 'a')?.isStrikethrough).toBeUndefined();
  });

  it('toggling twice returns to the original value', () => {
    const input = makeComments();
    const once = toggleCommentStrikethrough(input, 'a');
    const twice = toggleCommentStrikethrough(once, 'a');
    expect(twice.find((c) => c.id === 'a')?.isStrikethrough).toBe(false);
  });

  it('does not mutate the original comment object', () => {
    const input = makeComments();
    const originalB = input[1];
    toggleCommentStrikethrough(input, 'b');
    expect(originalB.isStrikethrough).toBe(false);
  });
});

describe('comment domain -- setCommentTextColor', () => {
  it('sets textColor only for the target comment, leaving others untouched', () => {
    const input = makeComments();
    const result = setCommentTextColor(input, 'a', '#ff0000');
    expect(result.find((c) => c.id === 'a')?.textColor).toBe('#ff0000');
    expect(result.find((c) => c.id === 'b')?.textColor).toBeUndefined();
  });

  it('does NOT write the legacy color field unless mirrorLegacyColor is explicitly requested (site B policy)', () => {
    const input = makeComments();
    const result = setCommentTextColor(input, 'a', '#ff0000');
    expect(result.find((c) => c.id === 'a')?.color).toBeUndefined();
  });

  it('mirrors textColor into the legacy color field when mirrorLegacyColor is true (site A/C policy)', () => {
    const input = makeComments();
    const result = setCommentTextColor(input, 'a', '#ff0000', { mirrorLegacyColor: true });
    const updated = result.find((c) => c.id === 'a');
    expect(updated?.textColor).toBe('#ff0000');
    expect(updated?.color).toBe('#ff0000');
  });

  it('preserves unrelated fields (backgroundColor) on the updated comment', () => {
    const input: Comment[] = [
      { id: 'a', text: 'x', userId: 'u1', userName: 'A', timestamp: 1, backgroundColor: '#eeeeee' },
    ];
    const result = setCommentTextColor(input, 'a', '#ff0000');
    expect(result[0].backgroundColor).toBe('#eeeeee');
  });
});

describe('comment domain -- setCommentBackgroundColor', () => {
  it('sets backgroundColor only for the target comment', () => {
    const input = makeComments();
    const result = setCommentBackgroundColor(input, 'c', '#fef08a');
    expect(result.find((c) => c.id === 'c')?.backgroundColor).toBe('#fef08a');
    expect(result.find((c) => c.id === 'a')?.backgroundColor).toBeUndefined();
  });

  it('accepts undefined to clear the highlight (transparent sentinel resolved by the caller)', () => {
    const input: Comment[] = [
      { id: 'a', text: 'x', userId: 'u1', userName: 'A', timestamp: 1, backgroundColor: '#fef08a' },
    ];
    const result = setCommentBackgroundColor(input, 'a', undefined);
    expect(result[0].backgroundColor).toBeUndefined();
  });

  it('does not mutate the input array or original objects', () => {
    const input = makeComments();
    const originalC = input[2];
    setCommentBackgroundColor(input, 'c', '#fef08a');
    expect(originalC.backgroundColor).toBeUndefined();
  });
});

describe('comment domain -- resolveCommentAccessMode (PATCH 8O.1)', () => {
  it('resolves read when WorkspaceRole is readonly', () => {
    expect(resolveCommentAccessMode('readonly')).toBe('read');
  });

  it('resolves read when effective BoardPermission is reader, regardless of workspace role', () => {
    expect(resolveCommentAccessMode('member', 'reader')).toBe('read');
    expect(resolveCommentAccessMode(null, 'reader')).toBe('read');
  });

  it('resolves manage for owner/admin/member workspace roles with no board permission override', () => {
    expect(resolveCommentAccessMode('owner')).toBe('manage');
    expect(resolveCommentAccessMode('admin')).toBe('manage');
    expect(resolveCommentAccessMode('member')).toBe('manage');
  });

  it('resolves manage when neither signal is read-only, including null/undefined role', () => {
    expect(resolveCommentAccessMode(null)).toBe('manage');
    expect(resolveCommentAccessMode(undefined)).toBe('manage');
    expect(resolveCommentAccessMode('member', 'editor')).toBe('manage');
    expect(resolveCommentAccessMode('member', 'commenter')).toBe('manage');
  });

  it('readonly workspace role wins even if boardPermission looks writable', () => {
    // A workspace-level read-only restriction must not be overridable by any
    // board-level permission value -- readonly is the stricter, outer bound.
    expect(resolveCommentAccessMode('readonly', 'admin')).toBe('read');
  });

  it('does not treat commenter as read-only (product-intended to permit commenting -- see COMMENTER PERSISTENCE note)', () => {
    expect(resolveCommentAccessMode('member', 'commenter')).toBe('manage');
  });
});

describe('comment domain -- guardCommentMutation (PATCH 8O.1)', () => {
  it('invokes the wrapped handler when accessMode is manage', () => {
    const handler = vi.fn();
    const guarded = guardCommentMutation('manage', handler);
    guarded('a', 1);
    expect(handler).toHaveBeenCalledWith('a', 1);
  });

  it('never invokes the wrapped handler when accessMode is read', () => {
    const handler = vi.fn();
    const guarded = guardCommentMutation('read', handler);
    guarded('a', 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('swallows the call silently in read mode -- no throw, no return value leak', () => {
    const handler = vi.fn(() => 'should never run');
    const guarded = guardCommentMutation('read', handler as unknown as () => void);
    expect(() => guarded()).not.toThrow();
    expect(guarded()).toBeUndefined();
  });

  it('supports async handlers -- the promise is not awaited by the caller but the handler still never runs in read mode', async () => {
    const asyncHandler = vi.fn(async () => {
      throw new Error('must not run in read mode');
    });
    const guarded = guardCommentMutation('read', asyncHandler);
    expect(() => guarded()).not.toThrow();
    expect(asyncHandler).not.toHaveBeenCalled();
  });
});
