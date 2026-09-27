import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBoardAiProvenanceProof } from '../ai/boardAiProvenanceProof';
import {
  BOARD_AI_CITATION_VERSION,
  boardAiCitationIdentityKey,
  type BoardAiCitationItem,
} from '../../domain/ai/boardAiChatCitation';
import type { BoardWikiPageSource } from '../../domain/wiki/boardWikiPageSources';
import {
  boardWikiAnswerContent,
  boardWikiAnswerHeading,
  boardWikiAnswerSources,
  buildBoardWikiAnswerProposal,
  type StoredAnswerRow,
} from './boardWikiAnswerProposal';

/**
 * PATCH-197. The "Save to wiki" server module, with stubbed clients.
 *
 * The security argument is the note-provenance route's, copied: the server
 * reads the signed answer itself and verifies its provenance; the sources are
 * the VERIFIED citations minus every wiki page (D6). No model, no credits.
 */

const TEST_KEY = Buffer.alloc(32, 7).toString('base64');
const ENV_VAR = 'BOARD_AI_PROVENANCE_SIGNING_KEY';

const BOARD = 'board-1';
const THREAD = 'thread-1';
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PADLET = 'pppppppp-1111-4111-8111-111111111111';
const WIKI_ID = 'wwwwwwww-3333-4333-8333-333333333333';

let originalKey: string | undefined;
beforeEach(() => { originalKey = process.env[ENV_VAR]; process.env[ENV_VAR] = TEST_KEY; });
afterEach(() => {
  if (originalKey === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = originalKey;
  vi.restoreAllMocks();
});

const pageCitation: BoardAiCitationItem = { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 3, label: 'slides.pdf — page 3' };
const postCitation: BoardAiCitationItem = { type: 'padlet', padletId: PADLET, label: 'Weekly plan' };
const wikiCitation: BoardAiCitationItem = { type: 'wiki-page', wikiPageId: WIKI_ID, label: 'Oil headlines' };

/**
 * A signed assistant row whose citations carry a real proof.
 *
 * The PROOF is over the DE-DUPLICATED items, because `boardAiCitationsFromStored`
 * de-duplicates and the module verifies over that sanitized list. The stored
 * `items` keep whatever the caller passed (duplicates included), so a duplicate
 * test exercises the sanitizer honestly rather than a hand-deduped fixture.
 */
function signedMessage(content: string, items: readonly BoardAiCitationItem[]): StoredAnswerRow {
  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    const key = boardAiCitationIdentityKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const proof = deduped.length === 0 ? undefined : createBoardAiProvenanceProof({
    messageId: 'm1', threadId: THREAD, boardId: BOARD, content,
    citationItems: deduped as unknown as readonly Record<string, unknown>[],
  });
  return {
    id: 'm1', threadId: THREAD, boardId: BOARD, role: 'assistant', content,
    citations: { version: BOARD_AI_CITATION_VERSION, items, ...(proof ? { proof } : {}) },
  };
}

/** A version for every source, so none is dropped. */
function versionsFor(items: readonly BoardAiCitationItem[]) {
  return new Map(items.map((item) => [
    boardAiCitationIdentityKey(item),
    { kind: 'document' as const, contentSha256: 'sha', updatedAt: '2026-01-01T00:00:00Z' },
  ]));
}

function build(message: StoredAnswerRow | null, question: string | null, pageContent = '') {
  const written: { content: string; sources: readonly BoardWikiPageSource[]; basedOnContent: string }[] = [];
  return {
    written,
    result: buildBoardWikiAnswerProposal({
      boardId: BOARD, pageId: 'page-1', userId: 'user-1', messageId: 'm1',
      pageContent, message, question,
      readVersions: async (items) => versionsFor(items),
      writeProposal: async (input) => {
        written.push(input);
        return { id: 'prop-1', content: input.content, sources: input.sources, basedOnContent: input.basedOnContent, createdAt: 'now' };
      },
    }),
  };
}

describe('PATCH-197 sources are the verified citations minus wiki pages', () => {
  it('keeps raw citations and drops a wiki-page citation (D6)', async () => {
    const { result, written } = build(signedMessage('answer', [pageCitation, postCitation, wikiCitation]), 'q');
    const built = await result;
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const keys = written[0].sources.map((source) => boardAiCitationIdentityKey(source.item));
    expect(keys).toContain(boardAiCitationIdentityKey(pageCitation));
    expect(keys).toContain(boardAiCitationIdentityKey(postCitation));
    expect(keys).not.toContain(`wiki-page:${WIKI_ID}`);
  });

  it('collapses duplicate citations by identity', async () => {
    const { result, written } = build(signedMessage('answer', [postCitation, postCitation]), 'q');
    await result;
    expect(written[0].sources).toHaveLength(1);
  });

  it('an answer citing ONLY wiki pages gives a proposal with no sources', async () => {
    const { result, written } = build(signedMessage('answer', [wikiCitation]), 'q');
    const built = await result;
    expect(built.ok).toBe(true);
    expect(written[0].sources).toHaveLength(0);
  });

  it('an answer that cited nothing gives a proposal with no sources, not an error', async () => {
    const { result, written } = build(signedMessage('answer', []), 'q');
    const built = await result;
    expect(built.ok).toBe(true);
    expect(written[0].sources).toHaveLength(0);
  });
});

describe('PATCH-197 refuses what it cannot verify', () => {
  it('a forged/unsigned envelope gives 403 and no row', async () => {
    const message = signedMessage('answer', [pageCitation]);
    // Strip the proof: the classic hand-written row.
    (message as { citations: unknown }).citations = { version: BOARD_AI_CITATION_VERSION, items: [pageCitation] };
    const { result, written } = build(message, 'q');
    const built = await result;
    expect(built).toEqual({ ok: false, status: 403, reason: 'unsigned_or_forged' });
    expect(written).toHaveLength(0);
  });

  it('a user row, an unknown message, or no message gives 404 and no row', async () => {
    for (const message of [null, { ...signedMessage('x', []), role: 'user' }]) {
      const { result, written } = build(message as StoredAnswerRow | null, 'q');
      expect((await result)).toEqual({ ok: false, status: 404, reason: 'message_not_found' });
      expect(written).toHaveLength(0);
    }
  });
});

describe('PATCH-197 content and baseline', () => {
  it('content is the page content, then the heading, then the answer without its footer', async () => {
    const answer = 'The answer body.\n\n[[COLLABBOARD_CITATIONS:S1.1]]';
    const { result, written } = build(signedMessage(answer, [postCitation]), 'What is the oil plan?', 'Existing page text.');
    await result;
    expect(written[0].content).toBe('Existing page text.\n\n## What is the oil plan?\n\nThe answer body.');
    expect(written[0].content).not.toContain('COLLABBOARD_CITATIONS');
  });

  it('based_on_content equals the current page content', async () => {
    const { result, written } = build(signedMessage('answer', []), 'q', 'Current body.');
    await result;
    expect(written[0].basedOnContent).toBe('Current body.');
  });

  it('an empty page starts the content at the heading', () => {
    expect(boardWikiAnswerContent('', null, 'answer')).toBe('## From Board AI\n\nanswer');
  });

  it('the heading is the question first line, capped, or "From Board AI"', () => {
    expect(boardWikiAnswerHeading('First line\nsecond line')).toBe('First line');
    expect(boardWikiAnswerHeading(null)).toBe('From Board AI');
    expect(boardWikiAnswerHeading('   ')).toBe('From Board AI');
    expect(boardWikiAnswerHeading('x'.repeat(200)).length).toBeLessThanOrEqual(120);
  });
});

describe('PATCH-197 boardWikiAnswerSources', () => {
  it('drops wiki pages and de-duplicates, keeping order', () => {
    const kept = boardWikiAnswerSources([wikiCitation, postCitation, postCitation, pageCitation]);
    expect(kept.map((item) => item.type)).toEqual(['padlet', 'knowledge-page']);
  });
});
