import { describe, expect, it } from 'vitest';

import {
  BOARD_AI_MESSAGE_CONTENT_MAX,
  BOARD_AI_MESSAGE_ROLES,
  BOARD_AI_THREAD_TITLE_MAX,
  isBoardAiMessageContentValid,
  isBoardAiMessageRole,
  normalizeBoardAiThreadTitle,
} from './boardAiChat';

describe('Board AI chat message roles', () => {
  it('persists exactly the two roles a user owns', () => {
    expect(BOARD_AI_MESSAGE_ROLES).toEqual(['user', 'assistant']);
  });

  it('does not accept system as a persisted role', () => {
    // A system prompt is built per request by the execution layer; it is not
    // conversation, so it is neither stored nor addressable here.
    expect(isBoardAiMessageRole('system')).toBe(false);
    expect(isBoardAiMessageRole('tool')).toBe(false);
    expect(isBoardAiMessageRole('')).toBe(false);
    expect(isBoardAiMessageRole(null)).toBe(false);
    expect(isBoardAiMessageRole(undefined)).toBe(false);
    expect(isBoardAiMessageRole(1)).toBe(false);
  });

  it('accepts the two it does persist', () => {
    expect(isBoardAiMessageRole('user')).toBe(true);
    expect(isBoardAiMessageRole('assistant')).toBe(true);
  });
});

describe('Board AI chat message content', () => {
  it('refuses content that carries no message', () => {
    expect(isBoardAiMessageContentValid('')).toBe(false);
    expect(isBoardAiMessageContentValid('   ')).toBe(false);
    expect(isBoardAiMessageContentValid('\n\t ')).toBe(false);
  });

  it('accepts ordinary content and refuses an unbounded row', () => {
    expect(isBoardAiMessageContentValid('What does page 3 say?')).toBe(true);
    expect(isBoardAiMessageContentValid('a'.repeat(BOARD_AI_MESSAGE_CONTENT_MAX))).toBe(true);
    expect(isBoardAiMessageContentValid('a'.repeat(BOARD_AI_MESSAGE_CONTENT_MAX + 1))).toBe(false);
  });

  it('measures the cap on the raw string, not the trimmed one', () => {
    // Padding must not become a way to exceed the ceiling.
    const padded = ' '.repeat(10) + 'a'.repeat(BOARD_AI_MESSAGE_CONTENT_MAX);
    expect(isBoardAiMessageContentValid(padded)).toBe(false);
  });
});

describe('Board AI thread title', () => {
  it('collapses every "unnamed" spelling to one stored value', () => {
    expect(normalizeBoardAiThreadTitle(undefined)).toBeNull();
    expect(normalizeBoardAiThreadTitle(null)).toBeNull();
    expect(normalizeBoardAiThreadTitle('')).toBeNull();
    expect(normalizeBoardAiThreadTitle('   ')).toBeNull();
  });

  it('trims and bounds a real title', () => {
    expect(normalizeBoardAiThreadTitle('  Reading notes  ')).toBe('Reading notes');
    const long = 'x'.repeat(BOARD_AI_THREAD_TITLE_MAX + 50);
    expect(normalizeBoardAiThreadTitle(long)).toHaveLength(BOARD_AI_THREAD_TITLE_MAX);
  });

  it('ignores a non-string title rather than coercing it', () => {
    expect(normalizeBoardAiThreadTitle(42 as unknown as string)).toBeNull();
    expect(normalizeBoardAiThreadTitle({} as unknown as string)).toBeNull();
  });
});
