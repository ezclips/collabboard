import { describe, expect, it } from 'vitest';

import {
  resolveBoardAiChatContext,
  type BoardAiContextSupabaseClient,
} from './boardAiChatContext';

import { err } from '../../domain/core/result';
import { domainError } from '../../domain/core/errors';

/**
 * BOARD_SEARCH_INDEX_1 -- THE PROJECTION CONTRACT.
 *
 * `padlets_search_gin` indexes what `public.plain_text_from_post_content` makes
 * of a post body, and the resolver feeds the model what
 * `plainTextFromPostContent` makes of the same bytes. Two implementations of one
 * transform: if they drift, the index and the model see different words for the
 * same post, and a search that should match stops matching for reasons nobody
 * can see from either side alone.
 *
 * TypeScript is the definition and SQL is the port, so these fixtures record
 * what the LIVE TypeScript does -- including what is arguably wrong about it.
 * `&amp;lt;` decodes twice and ends as `<`, because `&amp;` is decoded before
 * `&lt;`. That is the behaviour the model has been shown for as long as the
 * feature has existed; conforming the index to it is a smaller change than
 * altering what the model sees.
 *
 * WHY THROUGH THE RESOLVER, AND NOT BY EXPORTING THE FUNCTION. The projection is
 * internal, and widening a module's public surface to make it testable is a
 * change to the thing under test. `resolveBoardAiChatContext` already reaches it
 * on the path production uses. The post below carries an EMPTY title on purpose:
 * the resolver prefixes `${title}\n\n` only when a title exists, so with none the
 * returned block's `text` is the projection and nothing else.
 *
 * The same eleven pairs are asserted in SQL by
 * supabase/production-rollouts/20260918120000_board_search_config_verify.sql.
 * The two lists must stay identical -- a fixture added here belongs there too.
 */

const BOARD = '11111111-1111-4111-8111-111111111111';
const PAD = '33333333-3333-4333-8333-333333333333';

/** No fixture is an image, so a byte read here would mean the wrong branch ran. */
const neverReads = {
  download: async () => err(domainError('unavailable', 'no byte read expected in this file')),
};

/** One text post whose body is the fixture, and whose title is deliberately empty. */
function clientWithPost(content: string): BoardAiContextSupabaseClient {
  const query: Record<string, unknown> = {
    eq() { return query; },
    in() { return query; },
    order() { return query; },
    limit() { return query; },
    maybeSingle: async () => ({ data: { id: PAD, type: 'text', title: '', content }, error: null }),
  };
  return { from: () => ({ select: () => query }) } as unknown as BoardAiContextSupabaseClient;
}

async function projectionOf(content: string): Promise<string> {
  const result = await resolveBoardAiChatContext(
    clientWithPost(content),
    BOARD,
    [{ type: 'padlet', padletId: PAD }],
    neverReads,
  );
  // A refusal is never a passing case here: every fixture yields non-empty text,
  // so the resolver's empty-post guard must not be what answered.
  if (!result.ok) throw new Error(`resolver refused the fixture: ${result.error.code}`);
  return result.value[0]!.text;
}

/**
 * INPUT -> EXPECTED. The eleventh pair exists because `<br />` is the only case
 * that proves the whitespace class in the SQL br pattern matches anything at
 * all: `<p>a<br>b</p>` would pass even if that class matched nothing.
 */
const FIXTURES: readonly (readonly [string, string])[] = [
  ['<p>Hello &amp; bye</p>', 'Hello & bye'],
  ['<p>R&amp;D</p>', 'R&D'],
  ['<p>a</p><p>b</p>', 'a\nb'],
  ['<p>&lt;script&gt;</p>', '<script>'],
  ['<p>&amp;lt;</p>', '<'],
  ['<p>don&#39;t</p>', "don't"],
  ['<p>a&nbsp;b</p>', 'a b'],
  ['<p>foo<strong>bar</strong></p>', 'foobar'],
  ['<p>a<br>b</p>', 'a\nb'],
  ['<p>a<br />b</p>', 'a\nb'],
  ['<p>a</p><p></p><p></p><p>b</p>', 'a\n\nb'],
];

describe('BOARD_SEARCH_INDEX_1: the TS projection is the contract the SQL port must meet', () => {
  for (const [input, expected] of FIXTURES) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, async () => {
      expect(await projectionOf(input)).toBe(expected);
    });
  }

  it('covers every pair the SQL verify file asserts', () => {
    // A guard against half-updating one list: the count is stated in both files.
    expect(FIXTURES).toHaveLength(11);
  });
});
