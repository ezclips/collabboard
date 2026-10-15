// PATCH-371. The Board AI tool: on the Padlet-style layouts only, when AI is on
// and the caller is not a guest. Freeform keeps its floating button; Kanban its
// rail button; no floating button is added here.
import { describe, expect, it } from 'vitest';

import { buildCanvasToolbarGroups } from './canvas/ui/canvasToolbarRegistry';

function boardAiTools(overrides: Record<string, unknown> = {}) {
  const groups = buildCanvasToolbarGroups({
    isMapLayout: false,
    isFreeformLayout: false,
    isFreeformGraphMode: false,
    isTimelineLayout: false,
    isWallLayout: false,
    isColumnsLayout: false,
    isGridLayout: false,
    enableBoardAiChat: false,
    isGuest: false,
    chronoMode: null,
    canManageCanvasShare: false,
    canUseFreeformEditButton: true,
    canCreateBoardContent: true,
    isDrawingLayout: false,
    isDirectPdfLayout: false,
    ...overrides,
  } as never);
  return groups.find((group) => group.id === 'board-ai')?.tools ?? [];
}

describe('PATCH-371 the Board AI toolbar tool', () => {
  it('is absent unless the feature flag is on', () => {
    expect(boardAiTools()).toEqual([]);
    expect(boardAiTools({ isWallLayout: true })).toEqual([]);
  });

  it('appears on each of the five Padlet-style layouts, with the board-ai type', () => {
    const layouts: Array<[string, Record<string, unknown>]> = [
      ['wall', { isWallLayout: true }],
      ['columns', { isColumnsLayout: true }],
      ['grid', { isGridLayout: true }],
      ['timeline', { isTimelineLayout: true }],
      ['map', { isMapLayout: true }],
    ];
    for (const [name, flags] of layouts) {
      const tools = boardAiTools({ enableBoardAiChat: true, ...flags });
      expect(tools.map((tool) => tool.type), name).toEqual(['board-ai']);
      expect(tools[0].label, name).toBe('Board AI');
    }
  });

  it('is hidden for a guest', () => {
    expect(boardAiTools({ enableBoardAiChat: true, isWallLayout: true, isGuest: true })).toEqual([]);
  });

  it('is not added to Freeform, Kanban or Drawing', () => {
    expect(boardAiTools({ enableBoardAiChat: true, isFreeformLayout: true })).toEqual([]);
    expect(boardAiTools({ enableBoardAiChat: true, isDrawingLayout: true })).toEqual([]);
    expect(boardAiTools({ enableBoardAiChat: true })).toEqual([]);
  });

  it('is a read: shown without board-content authority', () => {
    expect(boardAiTools({ enableBoardAiChat: true, isColumnsLayout: true, canCreateBoardContent: false })
      .map((tool) => tool.type)).toEqual(['board-ai']);
  });
});
