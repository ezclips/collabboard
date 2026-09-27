import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-196, §2.5 guard (D6), pinned from the SESSION side.
 *
 * A compiled page must NEVER take another wiki page as its source: that is the
 * error-compounding step -- one wrong answer becoming several wrong pages -- and
 * a board is shared by a team. `compileBoardWikiProposal` therefore tells the
 * search to SKIP the wiki leg (`{ includeWiki: false }`).
 *
 * This runs the REAL `compileBoardWikiProposal` with a stub reader that WOULD
 * return a wiki page, and proves (a) the wiki was never read and (b) no
 * `wiki-page` item reached the proposal's sources. The mutation "flip it to
 * includeWiki: true" makes `searchWikiPages` get called and fails this test.
 */

const mocks = vi.hoisted(() => ({
  canReadBoardKnowledge: vi.fn(),
  executeBoardWikiCompilation: vi.fn(),
}));

vi.mock('../knowledge/knowledgeBoardReadAuthorization', () => ({
  canReadBoardKnowledge: mocks.canReadBoardKnowledge,
}));

vi.mock('../ai/boardWikiCompilation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai/boardWikiCompilation')>()),
  executeBoardWikiCompilation: mocks.executeBoardWikiCompilation,
}));

import { compileBoardWikiProposal } from './boardWikiCompileSession';
import type { BoardAiSearchReader } from '../ai/boardAiChatSearch';
import { ok } from '../../domain/core/result';

const BOARD = '11111111-1111-4111-8111-111111111111';
const PAGE = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const DOC = '44444444-4444-4444-8444-444444444444';
const WIKI_PAGE = '55555555-5555-4555-8555-555555555555';

/** A fake client serving only what compileBoardWikiProposal reads. */
function fakeClient() {
  const client = {
    from(table: string) {
      if (table === 'board_wiki_pages') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { id: PAGE, content: 'old body' }, error: null }) }),
            }),
          }),
        };
      }
      if (table === 'board_wiki_page_proposals') {
        return {
          insert: () => ({
            select: () => ({ maybeSingle: async () => ({ data: { id: 'prop-1', created_at: 'now' }, error: null }) }),
          }),
          delete: () => ({ eq: () => ({ eq: () => ({ neq: async () => ({ data: null, error: null }) }) }) }),
        };
      }
      if (table === 'knowledge_documents') {
        // readCurrentSourceVersions reads the transcript scalar and hashes for the
        // cited document ids.
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [{ id: DOC, content_sha256: 'sha-1', transcript_mutation_revision: null, is_transcript: null, updated_at: '2026-01-01T00:00:00Z' }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'padlets') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [{ id: 'p1', updated_at: '2026-01-01T00:00:00Z' }],
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return client;
}

let wikiReads: number;

function stubReader(): BoardAiSearchReader {
  wikiReads = 0;
  return {
    async searchPosts() {
      return ok([{ padlet_id: 'p1', title: 'Plan', text: 'the oil plan body', rank: 0.9 }]);
    },
    async searchChunks() { return ok([]); },
    async readTranscriptRepresentations() { return ok(new Map()); },
    async searchWikiPages() {
      // This WOULD return a wiki page. The guard is that it is never reached.
      wikiReads += 1;
      return ok([{ id: WIKI_PAGE, title: 'Oil headlines', content: 'compiled [S1.1] body', sources: [], compiled_at: null }]);
    },
    async readCurrentSourceVersions() { return ok(new Map()); },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canReadBoardKnowledge.mockResolvedValue(true);
  // The compilation's output: one attributed sentence citing the post passage.
  mocks.executeBoardWikiCompilation.mockResolvedValue({
    text: 'The oil plan is set out here. [S1.1]',
    provider: 'deepseek',
    model: 'deepseek-flash',
    source: 'collabboard-default',
  });
});

describe('PATCH-196 a compile never records a wiki-page source', () => {
  it('skips the wiki read entirely and records only raw passages', async () => {
    const result = await compileBoardWikiProposal(
      fakeClient() as never,
      {
        searchReader: stubReader(),
        resolverDeps: { preferences: {} as never, credentials: {} as never },
        credits: {
          checkBoardAiCredits: async () => ({ kind: 'byok' as const }),
          recordBoardAiCreditUsage: async () => {},
        },
      },
      { boardId: BOARD, pageId: PAGE, userId: USER, topic: 'oil plan' },
    );

    expect(result.ok).toBe(true);
    // The wiki leg was never read.
    expect(wikiReads).toBe(0);
    // And no wiki-page item reached the recorded sources.
    const sources = result.ok ? result.value.sources : [];
    expect(sources.some((source) => source.item.type === 'wiki-page')).toBe(false);
    expect(sources.length).toBeGreaterThan(0);
  });
});
