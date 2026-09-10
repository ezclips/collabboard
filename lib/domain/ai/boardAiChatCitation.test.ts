import { describe, expect, it } from 'vitest';
import {
  BOARD_AI_CITATION_INSTRUCTIONS,
  BOARD_AI_CITATION_MAX_ITEMS,
  BOARD_AI_CITATION_VERSION,
  boardAiCitationIdentityKey,
  boardAiCitationSourceToken,
  boardAiCitationsFromStored,
  buildBoardAiCitationEnvelope,
  parseBoardAiCitationFooter,
} from './boardAiChatCitation';
import type { ResolvedBoardAiContextBlock } from './boardAiChatContext';

const DOC_A = 'cd308c08-39f9-46ca-a78a-bc8f91f791a3';
const DOC_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const PADLET = 'pppppppp-1111-4111-8111-111111111111';

const page = (documentId: string, pageNumber: number, label = 'Alpha.pdf'): ResolvedBoardAiContextBlock => ({
  type: 'knowledge-page', label, knowledgeDocumentId: documentId, pageNumber, text: 'page body text',
});
const selection = (documentId: string, pageNumber: number): ResolvedBoardAiContextBlock => ({
  type: 'knowledge-selection', label: 'Alpha.pdf', knowledgeDocumentId: documentId, pageNumber,
  charStart: 10, charEnd: 42, text: 'the selected words',
});

describe('the footer the model may write', () => {
  it('G: a valid final footer is read and removed from the visible answer', () => {
    const parsed = parseBoardAiCitationFooter('The answer body.\n\n[[COLLABBOARD_CITATIONS:S1,S3]]');
    expect(parsed.content).toBe('The answer body.');
    expect(parsed.tokens).toEqual(['S1', 'S3']);
  });

  it('E: repeated tokens are one token', () => {
    expect(parseBoardAiCitationFooter('Body [[COLLABBOARD_CITATIONS:S1,S1,s1]]').tokens).toEqual(['S1']);
  });

  it('reads NONE as "cited nothing", and keeps the answer', () => {
    const parsed = parseBoardAiCitationFooter('Body.\n[[COLLABBOARD_CITATIONS:NONE]]');
    expect(parsed).toEqual({ content: 'Body.', tokens: [] });
  });

  it('F: a malformed or missing footer leaves the answer untouched and cites nothing', () => {
    for (const answer of [
      'Just an answer.',
      'Answer [[COLLABBOARD_CITATIONS:S1]] with prose after it.',
      'Answer [[COLLABBOARD_CITATIONS S1]]',
      'Answer [[OTHER_CITATIONS:S1]]',
      'Answer [[COLLABBOARD_CITATIONS:',
    ]) {
      const parsed = parseBoardAiCitationFooter(answer);
      expect(parsed.tokens, answer).toEqual([]);
      expect(parsed.content, answer).toBe(answer.trim());
    }
  });

  it('D: identity written in prose or in the footer is not a token', () => {
    const hostile = `Per ${DOC_A} page 9, yes.\n[[COLLABBOARD_CITATIONS:${DOC_A},page 9,S1]]`;
    const parsed = parseBoardAiCitationFooter(hostile);
    // Only the token shape survives; the ids stay what they are -- prose.
    expect(parsed.tokens).toEqual(['S1']);
    expect(parsed.content).toContain(DOC_A);
  });

  it('states the contract to the model without asking it for identity', () => {
    const instructions = BOARD_AI_CITATION_INSTRUCTIONS.join('\n');
    expect(instructions).toContain('[[COLLABBOARD_CITATIONS:');
    expect(instructions).toContain('NONE');
    expect(instructions).toContain('sourceId');
    expect(boardAiCitationSourceToken(0)).toBe('S1');
    expect(boardAiCitationSourceToken(2)).toBe('S3');
  });
});

describe('tokens become citations of the SERVER own blocks', () => {
  it('B: a token maps to the block at its position, and to nothing else', () => {
    const envelope = buildBoardAiCitationEnvelope(['S1'], [page(DOC_A, 4), page(DOC_B, 2)]);
    expect(envelope).toEqual({
      version: BOARD_AI_CITATION_VERSION,
      items: [{ type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 4, label: 'Alpha.pdf' }],
    });
  });

  it('C: an unknown or out-of-range token yields no citation', () => {
    expect(buildBoardAiCitationEnvelope(['S999'], [page(DOC_A, 4)])).toBeNull();
    expect(buildBoardAiCitationEnvelope(['S2'], [page(DOC_A, 4)])).toBeNull();
  });

  it('E: one source cited twice is one citation', () => {
    const envelope = buildBoardAiCitationEnvelope(['S1', 'S2'], [page(DOC_A, 4), page(DOC_A, 4)]);
    expect(envelope?.items).toHaveLength(1);
  });

  it('I: a citation carries identity and a label -- never the source text', () => {
    const block = page(DOC_A, 4);
    const envelope = buildBoardAiCitationEnvelope(['S1'], [block]);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain(block.text);
    for (const forbidden of ['text', 'excerpt', 'selectedText', 'content']) {
      expect(serialized, forbidden).not.toContain(`"${forbidden}"`);
    }
  });

  it('keeps a selection\'s verified span, and a whole-document citation without a page', () => {
    const envelope = buildBoardAiCitationEnvelope(['S1', 'S2'], [
      selection(DOC_A, 4),
      { type: 'knowledge-document', label: 'Alpha.pdf', knowledgeDocumentId: DOC_B, text: 'whole doc' },
    ]);
    expect(envelope?.items[0]).toEqual({
      type: 'knowledge-selection', knowledgeDocumentId: DOC_A, pageNumber: 4, charStart: 10, charEnd: 42, label: 'Alpha.pdf',
    });
    // No page is invented for a source that was attached whole.
    expect(envelope?.items[1]).toEqual({ type: 'knowledge-document', knowledgeDocumentId: DOC_B, label: 'Alpha.pdf' });
    expect(envelope?.items[1]).not.toHaveProperty('pageNumber');
  });

  it('cites a post truthfully, and refuses a block with no identity to cite', () => {
    expect(buildBoardAiCitationEnvelope(['S1'], [
      { type: 'padlet', label: 'A note', padletId: PADLET, text: 'note body' },
    ])?.items[0]).toEqual({ type: 'padlet', padletId: PADLET, label: 'A note' });
    expect(buildBoardAiCitationEnvelope(['S1'], [
      { type: 'knowledge-page', label: 'Alpha.pdf', text: 'x' },
    ])).toBeNull();
  });

  it('is bounded, however many tokens are named', () => {
    const blocks = Array.from({ length: 20 }, (_, index) => page(DOC_A, index + 1));
    const tokens = blocks.map((_, index) => boardAiCitationSourceToken(index));
    expect(buildBoardAiCitationEnvelope(tokens, blocks)?.items.length).toBe(BOARD_AI_CITATION_MAX_ITEMS);
  });
});

describe('H: a stored envelope is read back strictly', () => {
  it('round-trips what the server itself built', () => {
    const built = buildBoardAiCitationEnvelope(['S1'], [page(DOC_A, 4)]);
    expect(boardAiCitationsFromStored(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });

  it('drops a hand-written item instead of trusting it, and keeps the good ones', () => {
    const stored = {
      version: BOARD_AI_CITATION_VERSION,
      items: [
        { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 4, label: 'Alpha.pdf', text: 'smuggled' },
        { type: 'knowledge-page', knowledgeDocumentId: DOC_B },
        { type: 'not-a-type', knowledgeDocumentId: DOC_B, label: 'x' },
        { type: 'knowledge-page', knowledgeDocumentId: DOC_B, pageNumber: 0, label: 'x' },
        'nonsense',
      ],
    };
    const parsed = boardAiCitationsFromStored(stored);
    expect(parsed?.items).toEqual([
      { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 4, label: 'Alpha.pdf' },
    ]);
    // An unknown field written beside a valid item does not travel onward.
    expect(JSON.stringify(parsed)).not.toContain('smuggled');
  });

  it('refuses a wrong version, a non-envelope, and an all-bad list', () => {
    expect(boardAiCitationsFromStored({ version: 99, items: [] })).toBeNull();
    expect(boardAiCitationsFromStored(null)).toBeNull();
    expect(boardAiCitationsFromStored('[[COLLABBOARD_CITATIONS:S1]]')).toBeNull();
    expect(boardAiCitationsFromStored([{ type: 'knowledge-page' }])).toBeNull();
    expect(boardAiCitationsFromStored({ version: BOARD_AI_CITATION_VERSION, items: [{ type: 'padlet' }] })).toBeNull();
  });

  it('names each cited source by identity, so duplicates collapse', () => {
    expect(boardAiCitationIdentityKey({ type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 4, label: 'a' }))
      .toBe(boardAiCitationIdentityKey({ type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 4, label: 'DIFFERENT' }));
  });
});
