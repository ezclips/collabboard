import { describe, expect, it } from 'vitest';

import {
  BOARD_AI_CHAT_SYSTEM_PROMPT,
  boardAiChatSystemPrompt,
} from './boardAiChatExecution';

/**
 * The prompt has three states and they differ in EXACTLY two sentences.
 *
 * Everything else must be identical, because the sentence that actually
 * constrains the model -- "Never claim or imply that you read, opened, searched
 * or inspected the board ... beyond what `explicitContext` contains" -- is a
 * guarantee on every turn. Weakening it globally to accommodate search would pay
 * for the minority of turns that searched with the majority that did not.
 */

const OFF_SENTENCE =
  'Nothing else from the board has been inspected. If `explicitContext` is empty you have been given no posts, no PDF and no page text at all.';

const RAN_SENTENCE =
  'The user turned on board search, so before answering this, the board searched its own Notes, text posts and PDF text with a query built from their message, and any passages it matched are in `explicitContext` marked as search results. Nothing else from the board has been inspected: images, links, drawings, tables and comments are not searched and have not been read, and a search that matched nothing means nothing from the board was read.';

const SKIPPED_SENTENCE =
  'The user turned on board search, but their own attachments took all the room in this request, so no search was run. Say so if answering would need more than they attached.';

const NEVER_CLAIM =
  'Never claim or imply that you read, opened, searched or inspected the board or any document beyond what `explicitContext` contains. If answering would need more than was attached, say plainly that it has not been shared with you.';

describe('the three prompt branches', () => {
  it('1. off is the prompt exactly as it was before this feature existed', () => {
    const off = boardAiChatSystemPrompt('off');
    expect(off).toContain(OFF_SENTENCE);
    expect(off).not.toContain('turned on board search');
    // The exported constant every other caller and test names is this branch,
    // so "the toggle is off" is provably identical to "the toggle does not
    // exist".
    expect(BOARD_AI_CHAT_SYSTEM_PROMPT).toBe(off);
    // And the default argument is off, so a caller that forgets cannot claim a
    // search ran.
    expect(boardAiChatSystemPrompt()).toBe(off);
  });

  it('2. a search that ran replaces those two sentences and nothing else', () => {
    const ran = boardAiChatSystemPrompt('ran');
    expect(ran).toContain(RAN_SENTENCE);
    expect(ran).not.toContain(OFF_SENTENCE);
    expect(ran).not.toContain(SKIPPED_SENTENCE);
    // It names both sources and is explicit about what is NOT searched, so a
    // silent gap cannot be read as coverage.
    expect(ran).toContain('its own Notes, text posts and PDF text');
    expect(ran).toContain('images, links, drawings, tables and comments are not searched');
    // The empty case is stated inside the prompt itself.
    expect(ran).toContain('a search that matched nothing means nothing from the board was read');
  });

  it('3. a search skipped for room says so, and does not claim one ran', () => {
    const skipped = boardAiChatSystemPrompt('skipped-no-room');
    expect(skipped).toContain(SKIPPED_SENTENCE);
    expect(skipped).not.toContain(OFF_SENTENCE);
    expect(skipped).not.toContain(RAN_SENTENCE);
    // It must not imply passages are present when none were fetched.
    expect(skipped).not.toContain('marked as search results');
  });

  it('the constraint sentence is identical in all three, and search does not weaken it', () => {
    for (const state of ['off', 'ran', 'skipped-no-room'] as const) {
      expect(boardAiChatSystemPrompt(state)).toContain(NEVER_CLAIM);
    }
    // It stays TRUE with search on precisely because the passages ARE in
    // explicitContext -- which is what the block's own label asserts.
  });

  it('the three differ ONLY in the search sentences', () => {
    const lines = (state: 'off' | 'ran' | 'skipped-no-room') =>
      boardAiChatSystemPrompt(state).split('\n');
    const off = lines('off');
    const ran = lines('ran');
    const skipped = lines('skipped-no-room');

    // Same line count: one sentence swapped for one sentence.
    expect(ran).toHaveLength(off.length);
    expect(skipped).toHaveLength(off.length);

    const differing = off.map((line, index) => (line === ran[index] ? null : index)).filter((x) => x !== null);
    expect(differing).toHaveLength(1);
    const skippedDiffering = off.map((line, index) => (line === skipped[index] ? null : index)).filter((x) => x !== null);
    expect(skippedDiffering).toEqual(differing);
  });
});
