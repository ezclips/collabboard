import { describe, expect, it } from 'vitest';
import { conversationTokenTotals, type ConversationTokenMessage } from './conversationTokens';

const msg = (over: Partial<ConversationTokenMessage>): ConversationTokenMessage => ({ role: 'assistant', ...over });

describe('PATCH-345 conversationTokenTotals', () => {
  it('sums only assistant messages with both counts', () => {
    const totals = conversationTokenTotals([
      msg({ role: 'user' }),
      msg({ inputTokens: 100, outputTokens: 20 }),
      msg({ role: 'user', inputTokens: 999, outputTokens: 999 }),
      msg({ inputTokens: 50, outputTokens: 5 }),
    ]);
    expect(totals).toEqual({ input: 150, output: 25, total: 175, counted: 2, uncounted: 0 });
  });

  it('counts an assistant message with missing counts as uncounted', () => {
    const totals = conversationTokenTotals([
      msg({ inputTokens: 10, outputTokens: 2 }),
      msg({ inputTokens: null, outputTokens: null }),
      msg({ inputTokens: 10 }),
      msg({ outputTokens: 2 }),
    ]);
    expect(totals).toEqual({ input: 10, output: 2, total: 12, counted: 1, uncounted: 3 });
  });

  it('is all zeroes for an empty or user-only conversation', () => {
    expect(conversationTokenTotals([])).toEqual({ input: 0, output: 0, total: 0, counted: 0, uncounted: 0 });
    expect(conversationTokenTotals([msg({ role: 'user' })])).toEqual({ input: 0, output: 0, total: 0, counted: 0, uncounted: 0 });
  });
});
