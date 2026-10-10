// PATCH-340. A mounted render of the 6k-line Freeform canvas is impractical, so
// this guards the note-chip wiring at the source level (same approach as the
// other FreeformPadletCards wiring guards): the chip is note-only, reads the
// live status map, shows the column title / "Card not available", and opens the
// card through CanvasClient's handler.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const cards = fs.readFileSync(path.join(ROOT, 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'), 'utf8');

describe('PATCH-340 note kanban chip (source wiring)', () => {
  it('renders the chip only for a linked note', () => {
    expect(cards).toContain('data-kanban-link-chip="true"');
    expect(cards).toMatch(/if \(!isNotePost\(padlet\)\) return null;/);
    expect(cards).toContain('const link = readKanbanLink(padlet);');
  });

  it('shows the live column title, or "Card not available" when the card is gone', () => {
    expect(cards).toContain('kanbanLinkStatus?.get(link.cardId)');
    expect(cards).toContain("'Card not available'");
    expect(cards).toContain('status?.columnTitle');
  });

  it('opens the card through the host handler', () => {
    expect(cards).toContain('onOpenKanbanCard?.(link)');
  });

  it('passes the send/open/unlink items to the note menu, note-gated', () => {
    expect(cards).toContain('kanbanLink={isNotePost(padlet) ? readKanbanLink(padlet) : null}');
    expect(cards).toMatch(/onSendToKanban=\{isNotePost\(padlet\) && onSendToKanban/);
    expect(cards).toMatch(/onUnlinkKanban=\{isNotePost\(padlet\) && onUnlinkKanban/);
    expect(cards).toContain('onOpenKanbanCard={onOpenKanbanCard}');
  });
});
