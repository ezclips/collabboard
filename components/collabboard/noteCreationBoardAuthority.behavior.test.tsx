// @vitest-environment jsdom
//
// PDF_SELECTION_TO_NOTE_PERMISSION_CORRECTION_2 -- ordinary Note creation asks
// the BOARD, exactly as selection -> Note already does.
//
// The defect this closes: `selection -> Note` was corrected to the board's own
// edit authority while ordinary Note creation stayed on the workspace role. So
// on one board a user could save a PDF selection as a Note and, standing
// beside it, find no way to create an ordinary one -- one user, one board, one
// `padlets` policy, two different answers, and only one of them matching the
// database.
//
// This suite does NOT model that as a synthetic boolean. It reads how
// CanvasClient actually supplies the toolbar's authority, resolves those real
// expressions for each viewer, and builds the REAL toolbar registry with the
// result. An unrecognised wiring shape throws rather than being assumed safe.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canEditBoard,
  type BoardCollaboratorAuthority,
} from '@/lib/domain/canvas/boardEditAuthority';
import { canEditWorkspace, type WorkspaceRole } from '@/lib/workspace/context';
import {
  BOARD_CONTENT_TOOL_TYPES,
  SHARED_BOARD_CONTENT_TOOL_TYPES,
  buildCanvasToolbarGroups,
  WORKSPACE_CANVAS_TOOL_TYPES,
} from '@/components/collabboard/canvas/ui/canvasToolbarRegistry';

const OWNER = '11111111-1111-4111-8111-111111111111';
const EDITOR = '22222222-2222-4222-8222-222222222222';
const VIEWER = '33333333-3333-4333-8333-333333333333';
const BOARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const board = { id: BOARD, user_id: OWNER };

const collaborator = (
  userId: string,
  role: BoardCollaboratorAuthority['role'],
): BoardCollaboratorAuthority => ({ userId, boardId: BOARD, role });

const canvasClient = readFileSync(
  resolve(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

interface Viewer {
  readonly name: string;
  readonly userId: string | null;
  readonly collaboratorAuthority: BoardCollaboratorAuthority | null;
  readonly workspaceRole: WorkspaceRole | null;
}

/** The two capabilities CanvasClient derives, for one viewer. */
function capabilities(viewer: Viewer) {
  return {
    boardEdit: canEditBoard({
      userId: viewer.userId,
      boardId: BOARD,
      board,
      collaboratorAuthority: viewer.collaboratorAuthority,
    }),
    workspaceEdit: canEditWorkspace(viewer.workspaceRole),
  };
}

/**
 * Is the toolbar container reachable, as CanvasClient decides it?
 *
 * Read from the source rather than restated here: a test that restates the
 * rule passes whatever the component does.
 */
function toolbarReachable(viewer: Viewer): boolean {
  const match = /const canUseCanvasToolbar = ([^;]+);/.exec(canvasClient);
  if (!match) throw new Error('CANVAS_TOOLBAR_CAPABILITY_NOT_FOUND');
  const expression = match[1].trim();
  const { boardEdit, workspaceEdit } = capabilities(viewer);
  if (expression === 'canUseFreeformEditButton') return workspaceEdit;
  if (expression === 'canUseFreeformEditButton || canEditBoardContent') return workspaceEdit || boardEdit;
  throw new Error(`UNRECOGNISED_TOOLBAR_CAPABILITY: ${expression}`);
}

/**
 * What CanvasClient passes as the Create group's authority.
 *
 * Before this correction the registry had no such flag at all and the group was
 * unconditional, so the container's authority was the whole gate -- which is
 * the state this suite has to fail on.
 */
function createGroupAuthority(viewer: Viewer): boolean {
  if (canvasClient.includes('canCreateBoardContent: canEditBoardContent,')) {
    return capabilities(viewer).boardEdit;
  }
  if (!canvasClient.includes('canCreateBoardContent')) return toolbarReachable(viewer);
  throw new Error('UNRECOGNISED_CREATE_GROUP_AUTHORITY');
}

type Layout = 'freeform' | 'map' | 'graph';

/** The real toolbar this viewer would be shown, or null when unreachable. */
function toolbarFor(viewer: Viewer, layout: Layout = 'freeform') {
  if (!toolbarReachable(viewer)) return null;
  return buildCanvasToolbarGroups({
    isMapLayout: layout === 'map',
    isFreeformLayout: layout !== 'map',
    isFreeformGraphMode: layout === 'graph',
    isTimelineLayout: false,
    chronoMode: null,
    canManageCanvasShare: capabilities(viewer).workspaceEdit,
    canUseFreeformEditButton: capabilities(viewer).workspaceEdit,
    canCreateBoardContent: createGroupAuthority(viewer),
    isDrawingLayout: false,
    isDirectPdfLayout: false,
  });
}

/** Every tool type this viewer is offered, on this layout. */
function toolTypesFor(viewer: Viewer, layout: Layout = 'freeform'): string[] {
  return (toolbarFor(viewer, layout) ?? []).flatMap((group) => group.tools.map((tool) => tool.type));
}

/** The workspace-governed half of executeToolAction's guard, from source. */
function executeToolActionAllowsWorkspaceTool(viewer: Viewer, toolType: string): boolean {
  const guard = 'if (WORKSPACE_CANVAS_TOOL_TYPES.has(toolType) && !canUseFreeformEditButton) return;';
  if (!canvasClient.includes(guard)) return true; // pre-correction: no guard at all
  if (!WORKSPACE_CANVAS_TOOL_TYPES.has(toolType)) return true;
  return capabilities(viewer).workspaceEdit;
}

/** AI answer -> Note, as CanvasClient gates it. */
function canSaveAiAnswerAsNote(viewer: Viewer): boolean {
  if (canvasClient.includes('canSaveAssistantAsNote={canEditBoardContent}')) {
    return capabilities(viewer).boardEdit;
  }
  if (canvasClient.includes('canSaveAssistantAsNote={canUseCanvasToolbar}')) {
    return toolbarReachable(viewer); // the state this correction replaces
  }
  throw new Error('UNRECOGNISED_AI_NOTE_AUTHORITY');
}

/** Ask AI publishes nothing, so it answers to neither mutation capability. */
function askAiIsUngated(): boolean {
  const reader = readFileSync(
    resolve(process.cwd(), 'components/collabboard/KnowledgeDocumentDetails.tsx'), 'utf8',
  );
  const at = reader.indexOf('data-knowledge-selection-add-to-chat');
  const button = reader.slice(at, at + 900);
  return at > 0
    && !button.includes('canEditBoardContent')
    && !button.includes('canUseCanvasToolbar')
    && !button.includes('canEditWorkspace');
}

/** Can this viewer reach the ordinary Note tool? */
function canCreateOrdinaryNote(viewer: Viewer): boolean {
  const groups = toolbarFor(viewer);
  if (!groups) return false;
  return groups.some((group) => group.tools.some((tool) => tool.type === 'note'));
}

/**
 * The shared creation callback's own guard, as CanvasClient writes it.
 *
 * Hiding the control is what stops a tool being clicked; this is what stops one
 * being executed from the freeform board menu or any later entry point.
 */
function executeToolActionAllows(viewer: Viewer, toolType: string): boolean {
  const guard = 'if (BOARD_CONTENT_TOOL_TYPES.has(toolType) && !canEditBoardContent) return;';
  if (!canvasClient.includes(guard)) return true; // pre-correction: no guard at all
  // The guarded set is the production classification itself, not a set
  // reconstructed from one group -- the toolbar and the callback read the same
  // export, and this asks the very thing they read.
  expect(BOARD_CONTENT_TOOL_TYPES.size, 'the guarded set is not empty').toBeGreaterThan(0);
  if (!BOARD_CONTENT_TOOL_TYPES.has(toolType)) return true;
  return capabilities(viewer).boardEdit;
}

/**
 * One shared-content handler's own early return, as CanvasClient writes it.
 *
 * These are the LAST line before a write, and they read the live authority ref
 * rather than a closed-over boolean -- which is what makes a permission lost
 * while a flow is open still refuse the commit.
 */
function handlerRefusesWithoutBoardEdit(handler: string): boolean {
  const at = canvasClient.indexOf(`const ${handler} = `);
  if (at < 0) throw new Error(`HANDLER_NOT_FOUND: ${handler}`);
  const head = canvasClient.slice(at, at + 1400);
  return head.includes('if (!canEditBoardContentRef.current) return');
}

/** Selection -> Note, which this correction must leave exactly as it is. */
function canSaveSelectionAsNote(viewer: Viewer): boolean {
  if (!canvasClient.includes('const canSavePdfSelectionAsNote = canEditBoardContent;')) {
    throw new Error('SELECTION_SAVE_CAPABILITY_CHANGED');
  }
  return capabilities(viewer).boardEdit;
}

const MATRIX: readonly Viewer[] = [
  { name: 'A. board OWNER + workspace editable', userId: OWNER, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'member' },
  { name: 'B. board OWNER + workspace READONLY', userId: OWNER, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'readonly' },
  { name: 'C. board EDITOR + workspace READONLY', userId: EDITOR, collaboratorAuthority: collaborator(EDITOR, 'editor'), workspaceRole: 'readonly' },
  { name: 'D. workspace EDITABLE + board VIEWER', userId: VIEWER, collaboratorAuthority: collaborator(VIEWER, 'viewer'), workspaceRole: 'member' },
  { name: 'E. board VIEWER + workspace readonly', userId: VIEWER, collaboratorAuthority: collaborator(VIEWER, 'viewer'), workspaceRole: 'readonly' },
];

const EXPECTED: Record<string, boolean> = {
  'A. board OWNER + workspace editable': true,
  'B. board OWNER + workspace READONLY': true,
  'C. board EDITOR + workspace READONLY': true,
  'D. workspace EDITABLE + board VIEWER': false,
  'E. board VIEWER + workspace readonly': false,
};

describe('ordinary Note creation and selection -> Note share the board authority', () => {
  for (const viewer of MATRIX) {
    const expected = EXPECTED[viewer.name];
    it(`${viewer.name} -> Note create ${expected ? 'YES' : 'NO'}, selection save ${expected ? 'YES' : 'NO'}`, () => {
      expect(canCreateOrdinaryNote(viewer), 'ordinary Note creation').toBe(expected);
      expect(canSaveSelectionAsNote(viewer), 'selection -> Note').toBe(expected);
      // Not merely equal by coincidence: the same answer, and it is the board's.
      expect(canCreateOrdinaryNote(viewer)).toBe(canSaveSelectionAsNote(viewer));
      expect(canSaveSelectionAsNote(viewer)).toBe(capabilities(viewer).boardEdit);
    });
  }

  it('CASE B is the reported defect: a readonly workspace role does not close the board', () => {
    const ownerReadonly = MATRIX[1];
    expect(capabilities(ownerReadonly).workspaceEdit, 'workspace says no').toBe(false);
    expect(capabilities(ownerReadonly).boardEdit, 'the board says yes').toBe(true);
    expect(canCreateOrdinaryNote(ownerReadonly)).toBe(true);
  });

  it('CASE D: an editable workspace role does not open a board the user only views', () => {
    const workspaceEditorBoardViewer = MATRIX[3];
    expect(capabilities(workspaceEditorBoardViewer).workspaceEdit).toBe(true);
    // The toolbar is still reachable -- the other groups are theirs -- but the
    // group that writes `padlets` is not there.
    expect(toolbarFor(workspaceEditorBoardViewer)).not.toBeNull();
    expect(canCreateOrdinaryNote(workspaceEditorBoardViewer)).toBe(false);
  });

  it('a board viewer with no workspace edit sees no toolbar at all', () => {
    expect(toolbarFor(MATRIX[4])).toBeNull();
    expect(canCreateOrdinaryNote(MATRIX[4])).toBe(false);
  });
});

describe('the creation callback refuses what the toolbar refuses to render', () => {
  it('a board viewer cannot execute a create tool, whatever their workspace role', () => {
    for (const viewer of [MATRIX[3], MATRIX[4]]) {
      expect(executeToolActionAllows(viewer, 'note'), `${viewer.name} note`).toBe(false);
      expect(executeToolActionAllows(viewer, 'document'), `${viewer.name} document`).toBe(false);
      expect(executeToolActionAllows(viewer, 'todo'), `${viewer.name} todo`).toBe(false);
    }
  });

  it('a board owner or editor can, including with a readonly workspace role', () => {
    for (const viewer of [MATRIX[0], MATRIX[1], MATRIX[2]]) {
      expect(executeToolActionAllows(viewer, 'note'), viewer.name).toBe(true);
    }
  });

  it('the guard is scoped to board content -- unrelated tools are not caught by it', () => {
    // Corrected: `library` is NOT an innocent chooser. Its drop places the item
    // on the board -- a `padlets` insert -- so it is board content and the gate
    // is exactly the thing that must decide it. Map style still is not: it
    // writes `boards`, and keeps the workspace authority.
    expect(executeToolActionAllows(MATRIX[3], 'library')).toBe(false);
    expect(executeToolActionAllows(MATRIX[3], 'map-style')).toBe(true);
    expect(BOARD_CONTENT_TOOL_TYPES.has('map-style')).toBe(false);
    expect(BOARD_CONTENT_TOOL_TYPES.has('graph-line')).toBe(false);
    expect(BOARD_CONTENT_TOOL_TYPES.has('line')).toBe(false);
  });

  it('every shared-content tool is refused for a board viewer and allowed for a board editor', () => {
    for (const toolType of SHARED_BOARD_CONTENT_TOOL_TYPES) {
      for (const viewer of [WORKSPACE_EDITOR_BOARD_VIEWER, BOARD_VIEWER]) {
        expect(executeToolActionAllows(viewer, toolType), `${viewer.name} ${toolType}`).toBe(false);
      }
      for (const viewer of [MATRIX[0], OWNER_READONLY, BOARD_EDITOR_ONLY]) {
        expect(executeToolActionAllows(viewer, toolType), `${viewer.name} ${toolType}`).toBe(true);
      }
    }
  });

  it('the eight locked shared-content actions are all classified as board content', () => {
    for (const toolType of [
      'section-heading', 'library', 'link', 'image', 'upload', 'import', 'draw', 'knowledge-pdf',
    ]) {
      expect(BOARD_CONTENT_TOOL_TYPES.has(toolType), toolType).toBe(true);
    }
  });
});

describe('the final write handlers refuse without CURRENT board authority', () => {
  // The named mutation handlers, each the last thing before a write. A guard
  // here is what stops a flow that was opened while authorised from committing
  // after the authority went away.
  for (const handler of [
    'handleCreateSectionHeading',
    'handleFreeformLibraryDrop',
    'handleKnowledgePdfUploaded',
    'handlePaste',
  ]) {
    it(`${handler} returns early without board authority`, () => {
      expect(handlerRefusesWithoutBoardEdit(handler)).toBe(true);
    });
  }

  it('the section heading refuses BEFORE it mints an id or shows an optimistic card', () => {
    const at = canvasClient.indexOf('const handleCreateSectionHeading = ');
    const body = canvasClient.slice(at, at + 1400);
    const guard = body.indexOf('if (!canEditBoardContentRef.current) return');
    expect(guard).toBeGreaterThan(-1);
    expect(guard, 'guard precedes crypto.randomUUID()').toBeLessThan(body.indexOf('crypto.randomUUID()'));
  });

  it('the PDF placement refuses before any placement is requested or inserted', () => {
    const at = canvasClient.indexOf('const handleKnowledgePdfUploaded = ');
    const body = canvasClient.slice(at, at + 2600);
    const guard = body.indexOf('if (!canEditBoardContentRef.current) return');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('requestPlacementIfRequiredRef.current'));
  });

  it('the editors commit through a board-gated save, not the raw hook', () => {
    // usePadletSave is deliberately untouched: the fence is a wrapper at the
    // boundary. Link, Image (Upload and Import finish here too) and Draw.
    expect(canvasClient).toContain('saveLink={saveLinkIfBoardEditable}');
    expect(canvasClient).toContain('saveImage={saveImageIfBoardEditable}');
    expect(canvasClient).toContain('saveDrawing={saveDrawingIfBoardEditable}');
    expect(canvasClient).toContain('if (!canEditBoardContentRef.current) return;');
    // The raw callbacks are not handed to the modal host any more.
    expect(canvasClient).not.toContain('saveLink={saveLink}');
    expect(canvasClient).not.toContain('saveImage={saveImage}');
    expect(canvasClient).not.toContain('saveDrawing={saveDrawing}');
  });

  it('the live ref mirrors the canonical capability and never re-derives it', () => {
    expect(canvasClient).toContain('const canEditBoardContentRef = useRef(canEditBoardContent);');
    expect(canvasClient).toContain('canEditBoardContentRef.current = canEditBoardContent;');
  });
});

describe('the surfaces beside Note creation keep their own authority', () => {
  it('Canvas settings and Share stay on the workspace capabilities', () => {
    // A board editor with a readonly workspace role reaches the toolbar for
    // Note creation, and finds neither of these -- they write `boards` and the
    // workspace respectively, and this correction does not touch either.
    const boardEditorOnly = MATRIX[2];
    const groups = toolbarFor(boardEditorOnly);
    expect(groups).not.toBeNull();
    const ids = (groups ?? []).map((group) => group.id);
    expect(ids).toContain('create');
    expect(ids).not.toContain('settings');
    expect(ids).not.toContain('share');
  });

  it('a workspace editor keeps their workspace surfaces and no board content', () => {
    const workspaceEditorBoardViewer = MATRIX[3];
    const ids = (toolbarFor(workspaceEditorBoardViewer) ?? []).map((group) => group.id);
    expect(ids).toContain('settings');
    expect(ids).toContain('share');
    expect(ids).toContain('canvas');
    // CORRECTED: these three write `padlets`, so a board VIEWER does not get
    // them however editable their workspace membership is.
    for (const withheld of ['create', 'structure', 'media', 'draw']) {
      expect(ids, withheld).not.toContain(withheld);
    }
  });
});

// CORRECTION_3 -- the union opens a container, never a permission.
const OWNER_READONLY = MATRIX[1];
const BOARD_EDITOR_ONLY = MATRIX[2];
const WORKSPACE_EDITOR_BOARD_VIEWER = MATRIX[3];
const BOARD_VIEWER = MATRIX[4];
const UNRESOLVED: Viewer = {
  name: 'F. non-owner whose collaborator authority has not resolved',
  userId: EDITOR,
  collaboratorAuthority: null,
  workspaceRole: 'readonly',
};

describe('a board editor with a readonly workspace role reaches every board-content group', () => {
  for (const layout of ['freeform', 'map', 'graph'] as const) {
    it(`${layout}: the board-content groups are present, the workspace ones are not`, () => {
      const groups = toolbarFor(BOARD_EDITOR_ONLY, layout);
      expect(groups, 'the toolbar container is reachable').not.toBeNull();
      const ids = (groups ?? []).map((group) => group.id);

      // CORRECTED: a readonly workspace membership does not close this board.
      // Everything that writes `padlets` is theirs.
      for (const present of ['create', 'structure', 'media', 'draw']) {
        expect(ids, present).toContain(present);
      }
      for (const withheld of ['canvas', 'settings', 'share']) {
        expect(ids, withheld).not.toContain(withheld);
      }
      // The workspace-backed controls, by tool type rather than by group.
      const types = toolTypesFor(BOARD_EDITOR_ONLY, layout);
      for (const withheld of ['map-style', 'graph-line', 'line']) {
        expect(types, withheld).not.toContain(withheld);
      }
      expect(types, 'the Note they came for').toContain('note');
      expect(types, 'and the drawing they may also make').toContain('draw');
    });
  }

  it('a workspace editor who only views the board gets no board-content group', () => {
    for (const layout of ['freeform', 'map', 'graph'] as const) {
      const ids = (toolbarFor(WORKSPACE_EDITOR_BOARD_VIEWER, layout) ?? []).map((group) => group.id);
      for (const kept of ['canvas', 'settings', 'share']) {
        expect(ids, `${layout} ${kept}`).toContain(kept);
      }
      // CORRECTED: structure/media/draw are board content, not workspace tools.
      for (const withheld of ['create', 'structure', 'media', 'draw']) {
        expect(ids, `${layout} ${withheld}`).not.toContain(withheld);
      }
      const types = toolTypesFor(WORKSPACE_EDITOR_BOARD_VIEWER, layout);
      for (const withheld of SHARED_BOARD_CONTENT_TOOL_TYPES) {
        expect(types, `${layout} ${withheld}`).not.toContain(withheld);
      }
    }
    // The workspace role keeps everything that is genuinely the workspace's.
    expect(toolTypesFor(WORKSPACE_EDITOR_BOARD_VIEWER, 'map')).toContain('map-style');
    expect(toolTypesFor(WORKSPACE_EDITOR_BOARD_VIEWER, 'graph')).toContain('graph-line');
  });

  it('F. an unresolved non-owner authority hides every shared-content control', () => {
    const types = toolTypesFor(UNRESOLVED);
    for (const withheld of SHARED_BOARD_CONTENT_TOOL_TYPES) {
      expect(types, withheld).not.toContain(withheld);
    }
    for (const toolType of SHARED_BOARD_CONTENT_TOOL_TYPES) {
      expect(executeToolActionAllows(UNRESOLVED, toolType), toolType).toBe(false);
    }
  });

  it('Settings and Share keep their own, distinct policies', () => {
    // Settings follows the workspace capability, Share canManageCanvasShare;
    // neither is the board's content authority.
    expect((toolbarFor(MATRIX[0]) ?? []).map((g) => g.id))
      .toEqual(expect.arrayContaining(['settings', 'share', 'create']));
    const readonlyOwner = (toolbarFor(OWNER_READONLY) ?? []).map((g) => g.id);
    expect(readonlyOwner).not.toContain('settings');
    expect(readonlyOwner).not.toContain('share');
  });
});

describe('the toolbar and the freeform context menu agree about permission', () => {
  const boardMenu = readFileSync(
    resolve(process.cwd(), 'components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx'), 'utf8',
  );

  it('the menu opens only for board-content authority, and so do its items', () => {
    expect(canvasClient).toContain('if (!isFreeformLayout || isAnyEditorOpen || !canEditBoardContent) return;');
    expect(canvasClient).toContain('isEditable={canEditBoardContent}');
    expect(boardMenu).toContain('disabled={!isEditable}');
  });

  it('every shared-content item the menu offers is board-gated on BOTH routes', () => {
    // The menu routes its items through the same callback the toolbar does, so
    // the callback guard is the single answer for both entry points.
    expect(canvasClient).toContain('onToolAction={(toolType) => {');
    for (const toolType of SHARED_BOARD_CONTENT_TOOL_TYPES) {
      if (!boardMenu.includes(`type: '${toolType}'`)) continue;
      expect(executeToolActionAllows(WORKSPACE_EDITOR_BOARD_VIEWER, toolType), toolType).toBe(false);
      expect(executeToolActionAllows(BOARD_EDITOR_ONLY, toolType), toolType).toBe(true);
    }
  });

  it('the menu adds no shared-content action the toolbar does not classify', () => {
    const menuTypes = Array.from(boardMenu.matchAll(/type: '([a-z-]+)'/g)).map((m) => m[1]);
    expect(menuTypes.length).toBeGreaterThan(0);
    for (const toolType of menuTypes) {
      // Each menu item is either board content or a workspace canvas tool --
      // never an unclassified write.
      const classified = BOARD_CONTENT_TOOL_TYPES.has(toolType)
        || WORKSPACE_CANVAS_TOOL_TYPES.has(toolType)
        || toolType === 'line'
        || toolType === 'container';
      expect(classified, `${toolType} is classified`).toBe(true);
    }
  });
});

describe('Map style and Graph Line are refused at the action, not only hidden', () => {
  it('the workspace capability decides, for every viewer and both tools', () => {
    for (const toolType of ['map-style', 'graph-line']) {
      for (const viewer of [BOARD_EDITOR_ONLY, OWNER_READONLY]) {
        expect(executeToolActionAllowsWorkspaceTool(viewer, toolType), `${viewer.name} ${toolType}`).toBe(false);
      }
      expect(executeToolActionAllowsWorkspaceTool(WORKSPACE_EDITOR_BOARD_VIEWER, toolType), toolType).toBe(true);
    }
    // Scoped: it does not catch board content, so Note is decided elsewhere.
    expect(executeToolActionAllowsWorkspaceTool(BOARD_EDITOR_ONLY, 'note')).toBe(true);
    expect(WORKSPACE_CANVAS_TOOL_TYPES.has('note')).toBe(false);
  });
});

describe('AI -> Note publication answers to the board, as every Note save does', () => {
  // The same five viewers as the Note matrix, on the same expectations, plus
  // the unresolved case: one table, so the three paths cannot drift apart.
  const EXPECTED_AI: ReadonlyArray<readonly [Viewer, boolean]> = [
    ...MATRIX.map((viewer) => [viewer, EXPECTED[viewer.name]] as const),
    [UNRESOLVED, false] as const,
  ];

  for (const [viewer, expected] of EXPECTED_AI) {
    it(`${viewer.name} -> AI save ${expected ? 'YES' : 'NO'}`, () => {
      expect(canSaveAiAnswerAsNote(viewer)).toBe(expected);
      // The three Note paths give one answer, and it is the board's.
      expect(canSaveAiAnswerAsNote(viewer)).toBe(canSaveSelectionAsNote(viewer));
      expect(canSaveAiAnswerAsNote(viewer)).toBe(canCreateOrdinaryNote(viewer));
    });
  }

  it('a reader may still ask privately; only publication is gated', () => {
    expect(askAiIsUngated(), 'Ask AI answers to no mutation capability').toBe(true);
    expect(canSaveAiAnswerAsNote(WORKSPACE_EDITOR_BOARD_VIEWER), 'publication').toBe(false);
  });
});
