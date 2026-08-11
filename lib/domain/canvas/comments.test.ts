import { describe, expect, it } from 'vitest';
import {
  type Comment,
  editCommentText,
  removeComment,
  toggleCommentStrikethrough,
  setCommentTextColor,
  setCommentBackgroundColor,
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
