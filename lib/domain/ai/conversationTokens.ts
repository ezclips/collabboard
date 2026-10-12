/**
 * PATCH-345. Per-conversation token totals for the Board AI credit bar.
 *
 * Pure: only ASSISTANT messages carry usage, and only a message with BOTH
 * counts is "counted". Messages without counts (user turns, or older answers
 * stored before this patch) are counted as `uncounted` so the surface can say
 * the total is partial rather than pretend it is complete.
 */

export interface ConversationTokenMessage {
  readonly role: string;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
}

export interface ConversationTokenTotals {
  readonly input: number;
  readonly output: number;
  readonly total: number;
  /** Assistant messages with both counts. */
  readonly counted: number;
  /** Assistant messages without usable counts. */
  readonly uncounted: number;
}

export function conversationTokenTotals(
  messages: readonly ConversationTokenMessage[],
): ConversationTokenTotals {
  let input = 0;
  let output = 0;
  let counted = 0;
  let uncounted = 0;

  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    if (typeof message.inputTokens === 'number' && typeof message.outputTokens === 'number') {
      input += message.inputTokens;
      output += message.outputTokens;
      counted += 1;
    } else {
      uncounted += 1;
    }
  }

  return { input, output, total: input + output, counted, uncounted };
}
