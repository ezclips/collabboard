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

  it('the Freeform drawer does NOT pass the Kanban overview', () => {
    const lastDrawer = source.lastIndexOf('<BoardAiChatDrawer');
    const freeformDrawer = source.slice(lastDrawer, source.indexOf('/>', lastDrawer));
    // PATCH-371. The main-return drawer is shared by Freeform and the Padlet-
    // style layouts, so it carries a LAYOUT-CONDITIONAL auto context; what must
    // never appear there is the Kanban overview.
    expect(freeformDrawer).not.toContain('KANBAN_BOARD_AI_AUTO_CONTEXT');
  });

  it('PATCH-371: the shared drawer adds the padlet-board overview only on those layouts', () => {
    const lastDrawer = source.lastIndexOf('<BoardAiChatDrawer');
    const sharedDrawer = source.slice(lastDrawer, source.indexOf('/>', lastDrawer));
    expect(sharedDrawer).toContain('autoContextRequests={isPadletBoardAiLayout ? PADLET_BOARD_AI_AUTO_CONTEXT : undefined}');
    expect(sharedDrawer).toContain('onOpenPostCitation={isPadletBoardAiLayout ? scrollToPostCard : undefined}');
  });

  it('a kanban-card citation opens the card through the bridge', () => {
    expect(source).toContain('kanbanBoardAiBridgeRef.current?.openCard(request.cardId)');
  });

  it('PATCH-371 Addendum 2: the citation scroll rings the CARD SHELL, not the inner content', () => {
    expect(source).toContain("el.closest('[data-post-card-shell]')");
    // Every Padlet-style layout marks the card the user actually sees.
    const shell = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
    expect(shell('components/canvas/layouts/ColumnsCanvasRow.tsx')).toContain('data-post-card-shell');
    expect(shell('components/collabboard/row/RowLane.tsx')).toContain('data-post-card-shell');
    expect(shell('components/collabboard/RowColumnContainerCard.tsx')).toContain('data-post-card-shell');
    expect(shell('components/map/PostPopup.tsx')).toContain('data-post-card-shell');
  });
});
