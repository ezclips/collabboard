// PATCH-323. The title a saved answer gives its new card.
import { describe, expect, it, vi } from 'vitest';

// The bridge module imports the Kanban store (and through it the Supabase
// browser client) at module load; the pure title helper does not need any of
// that, so the store is stubbed.
vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanData: () => ({ cards: [], columns: [], rows: [] }),
  useKanbanPersistence: () => ({}),
}));

import {
  boardAiAnswerCardTitle,
  KANBAN_BOARD_AI_CARD_TITLE_MAX,
} from '@/components/kanban-canvas/KanbanBoardAiBridge';

describe('PATCH-323 an answer becomes a card title + description', () => {
  it('uses the first line, markdown stripped', () => {
    expect(boardAiAnswerCardTitle('## Ship the release\n\nThe branch is cut.')).toBe('Ship the release');
    expect(boardAiAnswerCardTitle('- cut the branch\n- tag it')).toBe('cut the branch');
    expect(boardAiAnswerCardTitle('1. do the thing\n2. then rest')).toBe('do the thing');
    expect(boardAiAnswerCardTitle('The **release** is ready')).toBe('The release is ready');
  });

  it('skips leading blank lines to the first real one', () => {
    expect(boardAiAnswerCardTitle('\n\n   \nFirst real line\nsecond')).toBe('First real line');
  });

  it('clamps a long title and never runs past the ceiling', () => {
    const title = boardAiAnswerCardTitle('x'.repeat(200));
    expect(title.length).toBe(KANBAN_BOARD_AI_CARD_TITLE_MAX);
    expect(title.endsWith('…')).toBe(true);
  });

  it('an answer with no usable first line still names a card', () => {
    expect(boardAiAnswerCardTitle('   \n  ')).toBe('Board AI answer');
    expect(boardAiAnswerCardTitle('**')).toBeTruthy();
  });
});
