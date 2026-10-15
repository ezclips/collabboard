// PATCH-375. The Board AI toolbar tool is GONE.
//
// PATCH-371 added a `board-ai` group to the Padlet-style layouts' toolbar, which
// put the same Sparkles icon on screen twice (it sat directly above Create's
// Sparkles). Board AI is now the floating top-right Bot button Freeform already
// used, on every layout, and CanvasClient owns that gate -- so these assertions
// read the registry for its ABSENCE and the host for the button's gate. The
// button's own behaviour lives in boardAiChatWiring.test.tsx.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildCanvasToolbarGroups } from './canvas/ui/canvasToolbarRegistry';

const CLIENT = fs.readFileSync(
  path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');

const DEFAULTS = {
  isMapLayout: false,
  isFreeformLayout: false,
  isFreeformGraphMode: false,
  isTimelineLayout: false,
  isGuest: false,
  canFacilitate: false,
  canvasLayout: null as string | null,
  chronoMode: null as string | null,
  canManageCanvasShare: false,
  canUseFreeformEditButton: true,
  canCreateBoardContent: true,
  isDrawingLayout: false,
  isDirectPdfLayout: false,
};

function groupsFor(overrides: Record<string, unknown> = {}) {
  return buildCanvasToolbarGroups({ ...DEFAULTS, ...overrides } as never);
}

const EVERY_LAYOUT: Array<[string, Record<string, unknown>]> = [
  ['freeform', { isFreeformLayout: true }],
  ['wall', { canvasLayout: 'wall' }],
  ['columns', { canvasLayout: 'columns' }],
  ['grid', { canvasLayout: 'grid' }],
  ['timeline', { isTimelineLayout: true, canvasLayout: 'timeline' }],
  ['map', { isMapLayout: true, canvasLayout: 'map' }],
  ['drawing', { isDrawingLayout: true }],
  ['scheduler', { canvasLayout: 'scheduler' }],
];

describe('PATCH-375 the Board AI toolbar tool is removed', () => {
  it('yields no board-ai tool and no AI group on any layout', () => {
    for (const [name, flags] of EVERY_LAYOUT) {
      const groups = groupsFor(flags);
      expect(groups.some((group) => group.id === 'board-ai'), name).toBe(false);
      expect(groups.flatMap((group) => group.tools).some((tool) => tool.type === 'board-ai'), name).toBe(false);
    }
  });

  it('leaves no trace of the tool in the host either', () => {
    expect(CLIENT).not.toContain("type: 'board-ai'");
    expect(CLIENT).not.toContain("case 'board-ai'");
    expect(CLIENT).not.toContain('data-toolbar-tool="board-ai"');
  });
});

describe('PATCH-375 the floating button is the one entry point', () => {
  it('is gated by ONE flag, over Freeform and the five Padlet layouts', () => {
    // The five, pinned as the one list the button and the `padlet-board`
    // auto-context share.
    expect(CLIENT).toContain(
      'const isPadletBoardAiLayout = isWallLayout || isColumnsLayout || isGridLayout || isTimelineLayout || isMapLayout;');
    // Freeform keeps the PATCH-300 flag it always had; the five are added.
    expect(CLIENT).toContain('const showBoardAssistantButtons = !!canvas && isFreeformLayout;');
    expect(CLIENT).toContain('const showBoardAiLauncher = enableBoardAiChat');
    expect(CLIENT).toContain('&& (showBoardAssistantButtons || (isPadletBoardAiLayout && !isGuestUser));');
    // And it is the flag the button renders on.
    expect(CLIENT).toContain('{showBoardAiLauncher && !isBlockingEditorModalOpen');
  });

  it('renders exactly one launcher', () => {
    expect((CLIENT.match(/data-board-ai-chat-open="true"/g) ?? []).length).toBe(1);
  });

  it('excludes a guest on the five, and not on Freeform', () => {
    // The guest exclusion is INSIDE the Padlet arm only, so Freeform's rule is
    // untouched (a guest on a freeform board keeps the button it always had).
    expect(CLIENT).toContain('(isPadletBoardAiLayout && !isGuestUser)');
    expect(CLIENT).not.toContain('(showBoardAssistantButtons && !isGuestUser)');
  });

  it('is not on Kanban\'s canvas route', () => {
    // Kanban returns its own tree before the launcher's call site, so the branch
    // cannot reach it. Read the branch itself, not just its position.
    const kanban = CLIENT.indexOf('if (isKanbanLayout) {');
    const gantt = CLIENT.indexOf('if (isGanttLayout) {');
    expect(kanban).toBeGreaterThan(-1);
    expect(gantt).toBeGreaterThan(kanban);
    expect(CLIENT.slice(kanban, gantt)).not.toContain('data-board-ai-chat-open');
  });
});
