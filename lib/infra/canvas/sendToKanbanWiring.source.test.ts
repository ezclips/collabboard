// PATCH-340. CanvasClient is the whole board shell and cannot be mounted, so
// this pins the Send-to-Kanban wiring at the source level (the same approach
// the other CanvasClient wiring guards use): the send writes cards, then links
// ONLY the created ones through the immediate save, reports partial failure,
// and the ?openCard= path reaches the Kanban board.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const CLIENT = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const PAGE = read('app/dashboard/canvas/[id]/page.tsx');
const SHELL = read('components/collabboard/canvas/ui/KanbanShell.tsx');

describe('PATCH-340 CanvasClient send wiring', () => {
  it('sends the batch, then links only the notes whose card was created', () => {
    expect(CLIENT).toContain('sendNotesToKanban({');
    expect(CLIENT).toContain('for (const { noteId, cardId } of result.created) {');
    expect(CLIENT).toContain('updatePadletMetadataNow(noteId, { kanbanLink: { boardId: selection.boardId, cardId } });');
  });

  it('reports success with an Open board action, and partial failure honestly', () => {
    expect(CLIENT).toContain('added to ${selection.boardTitle}');
    expect(CLIENT).toContain("action: { label: 'Open board'");
    expect(CLIENT).toContain('cards created');
  });

  it('renders the dialog and threads the chip data to the canvas', () => {
    expect(CLIENT).toContain('<SendToKanbanDialog');
    expect(CLIENT).toContain('kanbanLinkStatus={kanbanLinkStatus}');
    expect(CLIENT).toContain('onOpenKanbanCard={openKanbanCard}');
  });

  it('Addendum 1: the dialog receives the candidate notes and returns the ticked ids', () => {
    expect(CLIENT).toContain('notes={sendToKanban.notes}');
    expect(CLIENT).toContain('preselectedIds={sendToKanban.preselectedIds}');
    expect(CLIENT).toContain('linkedCount={sendToKanban.skippedLinked}');
    // Only the ticked notes are sent.
    expect(CLIENT).toContain('batch.notes.filter((note) => selection.noteIds.includes(note.id))');
  });

  it('Addendum 2: candidates are ALL the board\'s unlinked notes, not just the selection', () => {
    // The candidate list is the whole board's unlinked notes.
    expect(CLIENT).toContain('partitionSendableNotes(padlets)');
    expect(CLIENT).not.toContain('partitionSendableNotes(selection)');
    // The clicked note (or the whole multi-selection) is pre-ticked.
    expect(CLIENT).toContain('selectedPadletIds.includes(note.id)');
  });
});

describe('PATCH-340 openCard path', () => {
  it('page.tsx reads openCard and passes it down', () => {
    expect(PAGE).toContain('openCard?: string');
    expect(PAGE).toContain('openCardId={openCard}');
  });

  it('the Kanban board opens the card once loaded and ignores an unknown id', () => {
    expect(SHELL).toContain('function KanbanOpenCard');
    expect(SHELL).toContain('data.cards.some((card) => card.id === cardId)');
    expect(SHELL).toContain('actions.setActiveCard(cardId)');
    // PATCH-341 Addendum 1: it loads JUST the card's column, never a board
    // reset (which races the lazy per-column load and drops cards).
    expect(SHELL).toContain('actions.loadCardColumnId(cardId)');
    expect(SHELL).toContain('actions.loadCardsForColumn(columnId)');
    expect(SHELL).not.toContain('actions.refetchFromServer()');
    // An unknown id never opens anything and never reports an error.
    expect(SHELL).not.toContain("toast.error('This card no longer exists')");
  });
});
