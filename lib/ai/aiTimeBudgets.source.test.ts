import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AI_TIME_BUDGETS } from './aiTimeBudgets';

/**
 * THE BINDING THAT STOPS THE CLIENT TABLE FROM DRIFTING.
 *
 * `AI_TIME_BUDGETS` is a RESTATEMENT of deadlines that live on the server,
 * because the Add-provider dialog is a client bundle and cannot import them.
 * This test reads each server file and asserts the literal equals the table's
 * value, so changing a timeout without changing the table -- or the reverse --
 * fails here rather than misleading a person choosing a model.
 *
 * It matches on the literal text the files use, which is deliberate: a rename
 * of a constant is fine as long as the NUMBER stays bound, and this is the
 * number a user is shown.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const budgetFor = (feature: string): number => {
  const found = AI_TIME_BUDGETS.find((budget) => budget.feature === feature);
  if (!found) throw new Error(`no AI_TIME_BUDGETS entry for ${feature}`);
  return found.seconds;
};

describe('AI_TIME_BUDGETS is bound to the server deadlines', () => {
  it('the text-action route waits 20 s, as the table says', () => {
    const source = read('app/api/ai/text-action/route.ts');
    const match = /setTimeout\(\s*\(\)\s*=>\s*controller\.abort\(\),\s*([\d_]+)\s*\)/.exec(source);
    expect(match, 'no abort timeout found in the text-action route').not.toBeNull();
    expect(Number((match![1]).replace(/_/g, '')) / 1000)
      .toBe(budgetFor('Source AI and Edit & Rewrite (quick actions)'));
  });

  it('Board Chat waits 20 s, as the table says', () => {
    const source = read('lib/server/ai/boardAiChatExecution.ts');
    const match = /BOARD_AI_CHAT_TIMEOUT_MS\s*=\s*([\d_]+)/.exec(source);
    expect(match).not.toBeNull();
    expect(Number((match![1]).replace(/_/g, '')) / 1000).toBe(budgetFor('Board Chat'));
  });

  it('AI cards (generate and convert) wait 25 s, as the table says', () => {
    for (const path of [
      'app/api/ai/generate-component/route.ts',
      'app/api/ai/convert-component/route.ts',
    ]) {
      const match = /timeoutMs:\s*([\d_]+)/.exec(read(path));
      expect(match, path).not.toBeNull();
      expect(Number((match![1]).replace(/_/g, '')) / 1000, path)
        .toBe(budgetFor('AI cards (generate and convert)'));
    }
  });

  it('the Auto mode classifier waits 10 s, as the table says', () => {
    const match = /timeoutMs:\s*([\d_]+)/.exec(read('app/api/ai/classify-intent/route.ts'));
    expect(match).not.toBeNull();
    expect(Number((match![1]).replace(/_/g, '')) / 1000).toBe(budgetFor('Auto mode classifier'));
  });

  it('Board wiki waits 60 s, as the table says', () => {
    const match = /WIKI_COMPILE_TIMEOUT_MS\s*=\s*([\d_]+)/.exec(read('lib/server/ai/boardWikiCompilation.ts'));
    expect(match).not.toBeNull();
    expect(Number((match![1]).replace(/_/g, '')) / 1000).toBe(budgetFor('Board wiki'));
  });

  it('the table names every feature exactly once, with a positive whole-second budget', () => {
    const features = AI_TIME_BUDGETS.map((budget) => budget.feature);
    expect(new Set(features).size).toBe(features.length);
    for (const budget of AI_TIME_BUDGETS) {
      expect(Number.isInteger(budget.seconds)).toBe(true);
      expect(budget.seconds).toBeGreaterThan(0);
    }
  });
});
