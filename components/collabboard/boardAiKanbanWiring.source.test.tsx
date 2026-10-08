// PATCH-323. The Kanban branch of CanvasClient renders the SAME Board AI drawer
// the Freeform branch does, with the whole-board overview on every turn, and no
// Board Wiki surface.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

const kanbanBranch = (() => {
  const start = source.indexOf('if (isKanbanLayout)');
  const end = source.indexOf('if (isGanttLayout)');
  return source.slice(start, end);
})();

describe('PATCH-323 CanvasClient wires Board AI into the Kanban branch', () => {
  it('the overview is one kanban-board request', () => {
    expect(source).toContain('const KANBAN_BOARD_AI_AUTO_CONTEXT');
    expect(source).toMatch(/KANBAN_BOARD_AI_AUTO_CONTEXT[^=]*=\s*\[\{\s*type:\s*'kanban-board'\s*\}\]/);
  });

  it('the Kanban branch renders the SAME drawer with the overview and the card actions', () => {
    expect(kanbanBranch).toContain('<BoardAiChatDrawer');
    expect(kanbanBranch).toContain('autoContextRequests={KANBAN_BOARD_AI_AUTO_CONTEXT}');
    expect(kanbanBranch).toContain('onOpenCitation={openBoardAiCitation}');
    expect(kanbanBranch).toContain('canSaveAssistantAsCard={canEditBoardContent}');
    expect(kanbanBranch).toContain('onSaveAssistantAsCard={canEditBoardContent ? saveBoardAiAnswerAsCard : undefined}');
  });

  it('the Kanban branch renders NO Board Wiki surface', () => {
    expect(kanbanBranch).not.toContain('data-board-wiki-open');
    expect(kanbanBranch).not.toContain('<BoardWikiDrawer');
    expect(kanbanBranch).not.toContain('openBoardWiki');
  });

  it('the Freeform drawer does NOT pass an auto context', () => {
    const lastDrawer = source.lastIndexOf('<BoardAiChatDrawer');
    const freeformDrawer = source.slice(lastDrawer, source.indexOf('/>', lastDrawer));
    expect(freeformDrawer).not.toContain('autoContextRequests');
  });

  it('a kanban-card citation opens the card through the bridge', () => {
    expect(source).toContain('kanbanBoardAiBridgeRef.current?.openCard(request.cardId)');
  });
});
