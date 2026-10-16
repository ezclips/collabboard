// PATCH-379. The toolbar a GUEST sees.
//
// A guest is offered no tool the server refuses: the AI routes reject one
// (`GUEST_AI_REFUSAL`) and the upload routes reject one (`GUEST_UPLOAD_REFUSAL`),
// so a button for either could only produce an error. Everything a guest may
// actually use must survive the filter -- this file pins BOTH halves, because a
// filter that hides too much is as wrong as one that hides too little.
import { describe, expect, it } from 'vitest';

import {
  GUEST_FORBIDDEN_TOOL_TYPES,
  buildCanvasToolbarGroups,
} from './canvas/ui/canvasToolbarRegistry';

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

const groupsFor = (overrides: Record<string, unknown> = {}) =>
  buildCanvasToolbarGroups({ ...DEFAULTS, ...overrides } as never);

const typesFor = (overrides: Record<string, unknown> = {}) =>
  groupsFor(overrides).flatMap((group) => group.tools.map((tool) => tool.type));

const ALL_LAYOUTS: Array<[string, Record<string, unknown>]> = [
  ['freeform', { isFreeformLayout: true, isDirectPdfLayout: true }],
  ['wall', { canvasLayout: 'wall' }],
  ['columns', { canvasLayout: 'columns' }],
  ['grid', { canvasLayout: 'grid' }],
  ['timeline', { isTimelineLayout: true, canvasLayout: 'timeline' }],
  ['map', { isMapLayout: true, canvasLayout: 'map' }],
  ['drawing', { isDrawingLayout: true }],
];

describe('PATCH-379 the guest toolbar', () => {
  it('leaves the non-guest toolbar exactly as it was', () => {
    const types = typesFor({ isFreeformLayout: true, isDirectPdfLayout: true });
    for (const kept of ['ai-component', 'image', 'import', 'knowledge-pdf', 'library', 'link', 'note', 'draw']) {
      expect(types, kept).toContain(kept);
    }
  });

  it('offers a guest NONE of them, on any layout', () => {
    for (const [name, flags] of ALL_LAYOUTS) {
      const types = typesFor({ ...flags, isGuest: true });
      for (const forbidden of GUEST_FORBIDDEN_TOOL_TYPES) {
        expect(types, `${name}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('keeps every tool a guest may use', () => {
    const types = typesFor({ isFreeformLayout: true, isGuest: true });
    for (const allowed of ['note', 'document', 'todo', 'comment', 'table', 'section-heading', 'link', 'draw', 'line']) {
      expect(types, allowed).toContain(allowed);
    }
    // ...and the map tools on a Map board.
    expect(typesFor({ isMapLayout: true, canvasLayout: 'map', isGuest: true }))
      .toContain('map-sidebar');
  });

  it('offers no SECTION-creating tool: a guest cannot write board_sections', () => {
    // PATCH-379 Addendum 1. `container` is the "Column" tool -- the same grouping
    // a board_sections row is -- so it goes with the rest. The in-layout
    // "New section" items are hidden by `canAddSection` in RowLane and
    // ColumnsCanvasRow.
    expect(GUEST_FORBIDDEN_TOOL_TYPES.has('container')).toBe(true);
    for (const [name, flags] of ALL_LAYOUTS) {
      expect(typesFor({ ...flags, isGuest: true }), name).not.toContain('container');
    }
  });

  it('drops a group that the filter empties, rather than leaving a bare header', () => {
    // The Media group holds link (kept), image, knowledge-pdf and import (all
    // forbidden), so it survives -- but every group must still have a tool.
    for (const [name, flags] of ALL_LAYOUTS) {
      const groups = groupsFor({ ...flags, isGuest: true });
      for (const group of groups) {
        expect(group.tools.length, `${name}: ${group.id}`).toBeGreaterThan(0);
      }
      // The groups themselves are the ordinary ones, with no empty AI group.
      expect(groups.some((group) => group.id === 'board-ai'), name).toBe(false);
    }
  });

  it('leaves the guest toolbar empty of EVERY forbidden type across the whole set', () => {
    const guestTypes = new Set(ALL_LAYOUTS.flatMap(([, flags]) => typesFor({ ...flags, isGuest: true })));
    for (const forbidden of GUEST_FORBIDDEN_TOOL_TYPES) {
      expect(guestTypes.has(forbidden), forbidden).toBe(false);
    }
    // A sanity check that the filter did not simply return nothing.
    expect(guestTypes.size).toBeGreaterThan(8);
  });
});
