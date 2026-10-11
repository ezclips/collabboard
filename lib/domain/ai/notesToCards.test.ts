import { describe, expect, it } from 'vitest';
import {
  NOTES_TO_CARDS_CARD_DESCRIPTION_MAX,
  NOTES_TO_CARDS_CARD_TITLE_MAX,
  NOTES_TO_CARDS_MAX_CARDS,
  NOTES_TO_CARDS_PROMPT,
  notesToCardsRef,
  parseNotesToCardsResponse,
} from './notesToCards';

const known = ['N1', 'N2', 'N3'];

describe('PATCH-342 notesToCards prompt', () => {
  it('states the title/description/card caps', () => {
    expect(NOTES_TO_CARDS_PROMPT).toContain(String(NOTES_TO_CARDS_CARD_TITLE_MAX));
    expect(NOTES_TO_CARDS_PROMPT).toContain(String(NOTES_TO_CARDS_CARD_DESCRIPTION_MAX));
    expect(NOTES_TO_CARDS_PROMPT).toContain(String(NOTES_TO_CARDS_MAX_CARDS));
    expect(NOTES_TO_CARDS_PROMPT).toContain('Return ONLY {"cards":[{"title","description","sourceRefs"}]}.');
  });

  it('builds N1.. refs', () => {
    expect(notesToCardsRef(0)).toBe('N1');
    expect(notesToCardsRef(39)).toBe('N40');
  });
});

describe('PATCH-342 parseNotesToCardsResponse', () => {
  it('parses a valid body', () => {
    const raw = JSON.stringify({
      cards: [
        { title: 'Book the venue', description: 'Call three places.', sourceRefs: ['N1', 'N2'] },
        { title: 'Send invites', description: 'Email the list.', sourceRefs: ['N3'] },
      ],
    });
    expect(parseNotesToCardsResponse(raw, known)).toEqual([
      { title: 'Book the venue', description: 'Call three places.', sourceRefs: ['N1', 'N2'] },
      { title: 'Send invites', description: 'Email the list.', sourceRefs: ['N3'] },
    ]);
  });

  it('extracts JSON wrapped in prose / a fence', () => {
    const raw = 'Sure!\n```json\n{"cards":[{"title":"Do it","description":"","sourceRefs":["N1"]}]}\n```\nHope that helps.';
    expect(parseNotesToCardsResponse(raw, known)).toEqual([
      { title: 'Do it', description: '', sourceRefs: ['N1'] },
    ]);
  });

  it('drops unknown refs (and cards left with none) and de-dupes', () => {
    const raw = JSON.stringify({
      cards: [
        { title: 'Keep', description: '', sourceRefs: ['N1', 'N1', 'N9'] },
        { title: 'Drop', description: '', sourceRefs: ['N9'] },
      ],
    });
    expect(parseNotesToCardsResponse(raw, known)).toEqual([
      { title: 'Keep', description: '', sourceRefs: ['N1'] },
    ]);
  });

  it('drops empty titles and trims to the card cap', () => {
    const emptyTitle = JSON.stringify({ cards: [{ title: '   ', description: '', sourceRefs: ['N1'] }] });
    expect(parseNotesToCardsResponse(emptyTitle, known)).toBeNull();

    const many = { cards: Array.from({ length: 25 }, (_, i) => ({ title: `C${i}`, description: '', sourceRefs: ['N1'] })) };
    expect(parseNotesToCardsResponse(JSON.stringify(many), known)).toHaveLength(NOTES_TO_CARDS_MAX_CARDS);
  });

  it('returns null for garbage', () => {
    expect(parseNotesToCardsResponse('not json at all', known)).toBeNull();
    expect(parseNotesToCardsResponse('{"cards":"nope"}', known)).toBeNull();
    expect(parseNotesToCardsResponse('{"cards":[]}', known)).toBeNull();
    expect(parseNotesToCardsResponse('', known)).toBeNull();
  });
});
