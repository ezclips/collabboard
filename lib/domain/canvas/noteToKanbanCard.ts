/**
 * PATCH-340. Pure helpers for "Send to Kanban": turn Freeform note posts into
 * Kanban card fields, and decide which of a selection can be sent. No React,
 * no Supabase, no DOM.
 */
import type { Padlet } from '@/types/collabboard';

export const NOTE_CARD_TITLE_MAX = 200;
export const NOTE_CARD_CONTENT_MAX = 10_000;
export const UNTITLED_NOTE_TITLE = 'Untitled note';

export interface KanbanLink {
  boardId: string;
  cardId: string;
}

/** A note post (the type the Send-to-Kanban action applies to). */
export function isNotePost(padlet: Padlet | null | undefined): boolean {
  const type = (padlet as { type?: unknown } | null | undefined)?.type;
  return type === 'text' || type === 'note';
}

/** The stored link back to a Kanban card, or null when the note is unlinked. */
export function readKanbanLink(padlet: Padlet | null | undefined): KanbanLink | null {
  const link = (padlet?.metadata as { kanbanLink?: unknown } | null | undefined)?.kanbanLink as
    | Partial<KanbanLink>
    | undefined;
  if (!link || typeof link.boardId !== 'string' || typeof link.cardId !== 'string') return null;
  if (link.boardId.length === 0 || link.cardId.length === 0) return null;
  return { boardId: link.boardId, cardId: link.cardId };
}

export function isLinkedNote(padlet: Padlet | null | undefined): boolean {
  return readKanbanLink(padlet) !== null;
}

const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/**
 * HTML -> plain text. Block-level ends become newlines so the "first line" of a
 * note is a real line, then tags are dropped and the handful of entities a note
 * editor emits are decoded.
 */
export function stripHtmlToText(html: string | null | undefined): string {
  if (typeof html !== 'string' || html.length === 0) return '';
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (entity) => NAMED_ENTITIES[entity] ?? entity)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The note's body as plain text. */
export function notePlainText(padlet: Padlet): string {
  return stripHtmlToText((padlet as { content?: unknown })?.content as string | undefined);
}

/**
 * The card title/content a note produces: title set, else first line, else
 * "Untitled note".
 *
 * PATCH-340 Addendum 3: when the title IS the first line, the content must not
 * repeat it -- it is the REST of the text (trimmed, empty if nothing is left).
 * When the note has its own title, the content stays the full text.
 */
export function noteToKanbanCard(padlet: Padlet): { title: string; content: string } {
  const text = notePlainText(padlet);
  const explicitTitle = typeof padlet.title === 'string' ? padlet.title.trim() : '';
  const lines = text.split('\n');
  const firstLineIndex = lines.findIndex((line) => line.trim().length > 0);
  const firstLine = firstLineIndex >= 0 ? lines[firstLineIndex].trim() : '';
  const rawTitle = explicitTitle || firstLine || UNTITLED_NOTE_TITLE;
  const contentText = explicitTitle
    ? text
    : firstLineIndex >= 0
      ? lines.slice(firstLineIndex + 1).join('\n').trim()
      : '';
  return {
    title: rawTitle.slice(0, NOTE_CARD_TITLE_MAX),
    content: contentText.slice(0, NOTE_CARD_CONTENT_MAX),
  };
}

/**
 * On-canvas reading order: top-to-bottom, then left-to-right. Id is the final
 * tiebreak so the order is stable when two notes sit on the same spot.
 */
export function sortNotesForSend(notes: Padlet[]): Padlet[] {
  return [...notes].sort((a, b) => {
    const ay = Number(a.position_y) || 0;
    const by = Number(b.position_y) || 0;
    if (ay !== by) return ay - by;
    const ax = Number(a.position_x) || 0;
    const bx = Number(b.position_x) || 0;
    if (ax !== bx) return ax - bx;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Split a selection into the notes that can be sent and the two skip reasons,
 * each preserving reading order. Linked notes are skipped (one card per note),
 * and non-note posts in the selection are skipped and counted.
 */
export function partitionSendableNotes(notes: Padlet[]): {
  sendable: Padlet[];
  skippedNotNote: number;
  skippedLinked: number;
} {
  const ordered = sortNotesForSend(notes);
  const sendable: Padlet[] = [];
  let skippedNotNote = 0;
  let skippedLinked = 0;
  for (const note of ordered) {
    if (!isNotePost(note)) {
      skippedNotNote += 1;
      continue;
    }
    if (isLinkedNote(note)) {
      skippedLinked += 1;
      continue;
    }
    sendable.push(note);
  }
  return { sendable, skippedNotNote, skippedLinked };
}

/** "2 notes sent, 1 item skipped (not a note)" / "1 note sent, 1 note skipped (already linked)". */
export function sendSummaryMessage(sent: number, skippedNotNote: number, skippedLinked: number): string {
  const parts = [`${sent} ${sent === 1 ? 'note' : 'notes'} sent`];
  if (skippedNotNote > 0) {
    parts.push(`${skippedNotNote} ${skippedNotNote === 1 ? 'item' : 'items'} skipped (not a note)`);
  }
  if (skippedLinked > 0) {
    parts.push(`${skippedLinked} ${skippedLinked === 1 ? 'note' : 'notes'} skipped (already linked)`);
  }
  return parts.join(', ');
}
