import { describe, expect, it } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import {
  NOTE_CARD_CONTENT_MAX,
  NOTE_CARD_TITLE_MAX,
  UNTITLED_NOTE_TITLE,
  isLinkedNote,
  isNotePost,
  noteToKanbanCard,
  partitionSendableNotes,
  readKanbanLink,
  sendSummaryMessage,
  sortNotesForSend,
  stripHtmlToText,
} from './noteToKanbanCard';

function padlet(over: Partial<Padlet> & { metadata?: any } = {}): Padlet {
  return {
    id: 'p1',
    board_id: 'b1',
    title: '',
    content: '',
    type: 'text',
    position_x: 0,
    position_y: 0,
    width: 100,
    height: 100,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as unknown as Padlet;
}

describe('PATCH-340 noteToKanbanCard', () => {
  it('identifies note posts only', () => {
    expect(isNotePost(padlet({ type: 'text' }))).toBe(true);
    expect(isNotePost(padlet({ type: 'note' } as any))).toBe(true);
    expect(isNotePost(padlet({ type: 'image' }))).toBe(false);
    expect(isNotePost(null)).toBe(false);
  });

  it('strips HTML, turning block ends into newlines', () => {
    expect(stripHtmlToText('<p>Hello</p><p>World</p>')).toBe('Hello\nWorld');
    expect(stripHtmlToText('A<br>B')).toBe('A\nB');
    expect(stripHtmlToText('<b>bold</b> &amp; <i>it</i>')).toBe('bold & it');
    expect(stripHtmlToText('  <div>x</div>  ')).toBe('x');
  });

  it('uses an explicit title when set', () => {
    expect(noteToKanbanCard(padlet({ title: '  Roadmap  ', content: '<p>body</p>' }))).toEqual({
      title: 'Roadmap',
      content: 'body',
    });
  });

  it('falls back to the first non-empty line of the body, without repeating it in the content', () => {
    expect(noteToKanbanCard(padlet({ content: '<p></p><p>First real line</p><p>Second</p>' }))).toEqual({
      title: 'First real line',
      content: 'Second',
    });
  });

  it('Addendum 3: a first-line title leaves only the rest as content', () => {
    expect(noteToKanbanCard(padlet({ content: 'Book the venue\nCall three places' }))).toEqual({
      title: 'Book the venue',
      content: 'Call three places',
    });
    // A one-line note has no remaining content.
    expect(noteToKanbanCard(padlet({ content: 'Just one line' }))).toEqual({
      title: 'Just one line',
      content: '',
    });
  });

  it('Addendum 3: an explicit title keeps the FULL text as content', () => {
    expect(noteToKanbanCard(padlet({ title: 'Venue', content: 'Book the venue\nCall three places' }))).toEqual({
      title: 'Venue',
      content: 'Book the venue\nCall three places',
    });
  });

  it('falls back to "Untitled note" when there is no title or text', () => {
    expect(noteToKanbanCard(padlet({ content: '<p>  </p>' })).title).toBe(UNTITLED_NOTE_TITLE);
  });

  it('caps the title and content lengths', () => {
    const long = 'x'.repeat(20_000);
    const card = noteToKanbanCard(padlet({ title: long, content: long }));
    expect(card.title).toHaveLength(NOTE_CARD_TITLE_MAX);
    expect(card.content).toHaveLength(NOTE_CARD_CONTENT_MAX);
  });

  it('reads a well-formed kanban link and rejects malformed ones', () => {
    expect(readKanbanLink(padlet({ metadata: { kanbanLink: { boardId: 'kb', cardId: 'kc' } } }))).toEqual({
      boardId: 'kb',
      cardId: 'kc',
    });
    expect(isLinkedNote(padlet({ metadata: { kanbanLink: { boardId: 'kb', cardId: 'kc' } } }))).toBe(true);
    expect(readKanbanLink(padlet({ metadata: { kanbanLink: { boardId: 'kb' } } }))).toBeNull();
    expect(readKanbanLink(padlet({ metadata: {} }))).toBeNull();
  });

  it('sorts top-to-bottom then left-to-right', () => {
    const a = padlet({ id: 'a', position_x: 100, position_y: 0 });
    const b = padlet({ id: 'b', position_x: 0, position_y: 0 });
    const c = padlet({ id: 'c', position_x: 0, position_y: 50 });
    expect(sortNotesForSend([a, c, b]).map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  it('partitions a selection, counting non-notes and already-linked notes', () => {
    const note = padlet({ id: 'n', type: 'text' });
    const image = padlet({ id: 'i', type: 'image' });
    const linked = padlet({ id: 'l', type: 'text', metadata: { kanbanLink: { boardId: 'kb', cardId: 'kc' } } });
    const { sendable, skippedNotNote, skippedLinked } = partitionSendableNotes([image, note, linked]);
    expect(sendable.map((p) => p.id)).toEqual(['n']);
    expect(skippedNotNote).toBe(1);
    expect(skippedLinked).toBe(1);
  });

  it('summarises skips in plain words', () => {
    expect(sendSummaryMessage(2, 1, 0)).toBe('2 notes sent, 1 item skipped (not a note)');
    expect(sendSummaryMessage(1, 0, 1)).toBe('1 note sent, 1 note skipped (already linked)');
  });
});
