// @vitest-environment jsdom
//
// PDF_SELECTION_TO_NOTE_PERMISSION_CORRECTION_3 -- Set as cover is owner-only.
//
// The defect this closes: the structured layouts received `isEditable=
// {canEditBoardContent}` and an UNCONDITIONAL `onSetAsCover`, and RowLane /
// ColumnsCanvasRow then enabled the cover action from `isEditable`. But the
// cover mutation writes the BOARD row, whose policy names ownership only. So a
// non-owner collaborator editor -- entirely legitimately able to edit content
// on that board -- was handed an enabled action whose only possible outcome is
// the server refusing it.
//
// The two questions are answered by two predicates here, exactly as the
// component does it, and the props are DERIVED from real authority rather than
// hand-omitted: a test that simply passes `onSetAsCover={undefined}` would
// prove only that undefined is undefined.
//
// This mounts the real chain the reviewer found the bug through --
// RowCanvasDnD -> RowLane -> ColumnPostContextMenu -- and reads the props the
// menu actually receives. `ColumnPostContextMenu` is mocked to a recorder: it
// is the contract boundary, and the assertion is about what reaches it.
import { readFileSync } from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardSection, Padlet } from '@/types/collabboard';
import {
  canEditBoard,
  isBoardOwner,
  type BoardCollaboratorAuthority,
} from '@/lib/domain/canvas/boardEditAuthority';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface MenuProps {
  readonly padlet: Padlet;
  readonly onSetAsPadletCover?: () => void;
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
  readonly onDuplicate?: () => void;
  readonly disabled?: boolean;
}

const recorded: MenuProps[] = [];

vi.mock('@/components/collabboard/menus/ColumnPostContextMenu', () => ({
  // Children are deliberately NOT rendered: the card body is not what this
  // suite is about, and leaving it out keeps the mount to the permission path.
  ColumnPostContextMenu: (props: MenuProps) => {
    recorded.push(props);
    return null;
  },
}));

import RowCanvasDnD from './row/RowCanvasDnD';

const OWNER = '11111111-1111-4111-8111-111111111111';
const EDITOR = '22222222-2222-4222-8222-222222222222';
const VIEWER = '33333333-3333-4333-8333-333333333333';
const BOARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const board = { id: BOARD, user_id: OWNER };

const collaborator = (
  userId: string,
  role: BoardCollaboratorAuthority['role'],
): BoardCollaboratorAuthority => ({ userId, boardId: BOARD, role });

const SECTION = { id: 1, title: 'Lane', board_id: BOARD, position: 0 } as unknown as BoardSection;
const POST = {
  id: 'post-1',
  type: 'image',
  title: 'A picture',
  section_id: 1,
  board_id: BOARD,
  // `sectionId` is how RowCanvasDnD groups a post into a lane.
  metadata: { sectionId: 1, sectionPosition: 0, imageUrl: 'https://example.test/i.png' },
} as unknown as Padlet;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];

function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}

beforeEach(() => { recorded.length = 0; });
afterEach(() => {
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
});

const noop = () => {};

/**
 * CanvasClient's real derivation, for one viewer, in one place.
 *
 * Two questions, two predicates, two policies. `isEditable` answers for
 * `padlets`; the cover callback answers for the board row.
 */
function canvasClientProps(viewer: {
  readonly userId: string | null;
  readonly collaboratorAuthority: BoardCollaboratorAuthority | null;
}) {
  const canEditBoardContent = canEditBoard({
    userId: viewer.userId,
    boardId: BOARD,
    board,
    collaboratorAuthority: viewer.collaboratorAuthority,
  });
  const canManageBoardSettings = isBoardOwner(viewer.userId, BOARD, board);
  return { canEditBoardContent, canManageBoardSettings };
}

const setAsCoverSpy = vi.fn();

function renderRows(viewer: {
  readonly userId: string | null;
  readonly collaboratorAuthority: BoardCollaboratorAuthority | null;
}) {
  const { canEditBoardContent, canManageBoardSettings } = canvasClientProps(viewer);
  mount(
    <RowCanvasDnD
      isEditable={canEditBoardContent}
      sections={[SECTION]}
      padlets={[POST]}
      allPadlets={[POST]}
      onRename={noop}
      onDeleteSection={noop}
      onAddSectionLeft={noop}
      onAddSectionRight={noop}
      onMoveSectionLeft={noop}
      onMoveSectionRight={noop}
      onAddContainerAt={noop}
      onReorderPost={noop}
      onEditPost={noop}
      onDeletePost={noop}
      onOpenPost={noop}
      onOpenInNewTab={noop}
      onCopyLink={noop}
      onStartSlideshow={noop}
      onDownloadAttachment={noop}
      onCopyAttachmentLink={noop}
      onColorChange={noop}
      onAddBefore={noop}
      onAddAfter={noop}
      onDuplicate={noop}
      onCopyToAnotherPadlet={noop}
      onTransferToAnotherPadlet={noop}
      // THE fix, as CanvasClient writes it: the cover callback exists only for
      // a viewer the board's own policy authorises.
      onSetAsCover={canManageBoardSettings ? setAsCoverSpy : undefined}
      onPin={noop}
      onReport={noop}
    />,
  );
  const menu = recorded.find((p) => p.padlet?.id === POST.id);
  expect(menu, 'the post reached the context menu at all').toBeDefined();
  return { menu: menu as MenuProps, canEditBoardContent, canManageBoardSettings };
}

describe('structured layout: Set as cover is owner authority, content editing is not', () => {
  it('A. board owner (workspace role irrelevant) -- edits content AND may set cover', () => {
    const { menu, canEditBoardContent, canManageBoardSettings } = renderRows({
      userId: OWNER, collaboratorAuthority: collaborator(OWNER, null),
    });
    expect(canEditBoardContent).toBe(true);
    expect(canManageBoardSettings).toBe(true);
    expect(menu.onEdit, 'ordinary content edit').toBeTypeOf('function');
    expect(menu.onDelete, 'ordinary content delete').toBeTypeOf('function');
    expect(menu.onSetAsPadletCover, 'Set as cover').toBeTypeOf('function');
  });

  it('B/C. non-owner collaborator EDITOR -- edits content, but Set as cover is absent', () => {
    // The reported bad case. Workspace role is not a term in either predicate,
    // so it is not varied here; the sibling authority suites cover that.
    const { menu, canEditBoardContent, canManageBoardSettings } = renderRows({
      userId: EDITOR, collaboratorAuthority: collaborator(EDITOR, 'editor'),
    });
    expect(canEditBoardContent, 'may edit board content').toBe(true);
    expect(canManageBoardSettings, 'may NOT change board settings').toBe(false);

    // Content editing is untouched -- this correction must not cost a
    // collaborator editor the rights their policy really does give them.
    expect(menu.onEdit, 'ordinary content edit').toBeTypeOf('function');
    expect(menu.onDelete, 'ordinary content delete').toBeTypeOf('function');
    expect(menu.onDuplicate, 'ordinary duplicate').toBeTypeOf('function');
    expect(menu.disabled, 'the menu itself').toBeFalsy();

    // And the owner-only action is not merely disabled, it is not there.
    expect(menu.onSetAsPadletCover, 'Set as cover').toBeUndefined();
  });

  it('D. board viewer -- neither content mutation nor cover', () => {
    const { menu, canEditBoardContent, canManageBoardSettings } = renderRows({
      userId: VIEWER, collaboratorAuthority: collaborator(VIEWER, 'viewer'),
    });
    expect(canEditBoardContent).toBe(false);
    expect(canManageBoardSettings).toBe(false);
    expect(menu.onEdit, 'ordinary content edit').toBeUndefined();
    expect(menu.onDelete, 'ordinary content delete').toBeUndefined();
    expect(menu.onSetAsPadletCover, 'Set as cover').toBeUndefined();
  });

  it('unresolved identity denies both, rather than defaulting to either', () => {
    const { menu } = renderRows({ userId: null, collaboratorAuthority: collaborator(OWNER, null) });
    expect(menu.onEdit).toBeUndefined();
    expect(menu.onSetAsPadletCover).toBeUndefined();
  });

  it('Set as cover is INDEPENDENT of isEditable, in both directions', () => {
    // Availability must not be inherited from board-content authority. A
    // collaborator editor is the case that proves it: isEditable true, cover
    // absent. Nothing renders the reverse (ownership implies content
    // authority), so the component contract is asserted directly instead.
    const editor = renderRows({ userId: EDITOR, collaboratorAuthority: collaborator(EDITOR, 'editor') });
    expect(editor.canEditBoardContent).toBe(true);
    expect(editor.menu.onSetAsPadletCover).toBeUndefined();

    recorded.length = 0;
    // The other direction, and the one that fails before this correction:
    // `isEditable` FALSE with the callback supplied must still offer the
    // action, because the callback IS the authority. While RowLane gated on
    // `isEditable && onSetAsCover`, board-content authority was silently a
    // precondition for an owner-only action -- which is precisely how a
    // collaborator editor came to be offered it.
    mount(
      <RowCanvasDnD
        isEditable={false}
        sections={[SECTION]} padlets={[POST]} allPadlets={[POST]}
        onRename={noop} onDeleteSection={noop} onAddSectionLeft={noop} onAddSectionRight={noop}
        onMoveSectionLeft={noop} onMoveSectionRight={noop} onAddContainerAt={noop}
        onReorderPost={noop} onEditPost={noop} onDeletePost={noop} onOpenPost={noop}
        onOpenInNewTab={noop} onCopyLink={noop} onStartSlideshow={noop}
        onDownloadAttachment={noop} onCopyAttachmentLink={noop} onColorChange={noop}
        onAddBefore={noop} onAddAfter={noop} onDuplicate={noop}
        onCopyToAnotherPadlet={noop} onTransferToAnotherPadlet={noop}
        onSetAsCover={setAsCoverSpy}
        onPin={noop} onReport={noop}
      />,
    );
    const withCallback = recorded.find((p) => p.padlet?.id === POST.id);
    expect(withCallback?.onSetAsPadletCover, 'cover follows its own authority').toBeTypeOf('function');
    // ...while the content actions correctly follow isEditable, unchanged.
    expect(withCallback?.onEdit, 'ordinary content edit').toBeUndefined();
    expect(withCallback?.onDelete, 'ordinary content delete').toBeUndefined();
  });
});

// ============================================================================
// The reported bad case, end to end, with CanvasClient's OWN supply decision
// ============================================================================

/**
 * The two suites above mount the layout with the props CanvasClient is
 * supposed to pass. This one does not take that on trust: it reads how
 * CanvasClient ACTUALLY supplies `onSetAsCover` to the Rows layout, resolves
 * that expression for a given viewer, and mounts the real components with the
 * result.
 *
 * Before this correction the expression was `onSetAsCover={setAsPadletCover}`
 * -- unconditional -- so a non-owner collaborator editor received the callback,
 * RowLane saw `isEditable && onSetAsCover` satisfied, and the owner-only action
 * appeared. That is the case this test exists to fail on.
 */
const canvasClientSource = readFileSync('app/dashboard/canvas/[id]/CanvasClient.tsx', 'utf8');

/** How the Rows layout's `onSetAsCover` prop is written in production. */
function rowsCoverSupplyExpression(): string {
  const rows = canvasClientSource.slice(canvasClientSource.indexOf('<RowCanvasDnD'));
  const match = /onSetAsCover=\{([^}]*(?:\}[^}]*)*?)\}\r?\n/.exec(rows);
  expect(match, 'CanvasClient still passes onSetAsCover to RowCanvasDnD').not.toBeNull();
  return (match as RegExpExecArray)[1].trim();
}

/**
 * What that expression evaluates to for this viewer.
 *
 * Only two shapes are accepted, and an unrecognised one fails loudly rather
 * than being treated as safe: a gate this test cannot read is a gate it cannot
 * vouch for.
 */
function coverCallbackCanvasClientWouldPass(viewer: {
  readonly userId: string | null;
  readonly collaboratorAuthority: BoardCollaboratorAuthority | null;
}): (() => void) | undefined {
  const expression = rowsCoverSupplyExpression();
  const { canManageBoardSettings } = canvasClientProps(viewer);

  if (expression === 'setAsPadletCover') return setAsCoverSpy;          // ungated
  if (expression === 'canManageBoardSettings ? setAsPadletCover : undefined') {
    return canManageBoardSettings ? setAsCoverSpy : undefined;          // owner-gated
  }
  throw new Error(`unrecognised onSetAsCover supply expression: ${expression}`);
}

describe('BAD CASE: non-owner collaborator editor in a structured layout', () => {
  it('is never offered Set as cover -- the callback CanvasClient passes them is absent', () => {
    const viewer = { userId: EDITOR, collaboratorAuthority: collaborator(EDITOR, 'editor') };
    const { canEditBoardContent } = canvasClientProps(viewer);
    expect(canEditBoardContent, 'they really can edit this board').toBe(true);

    mount(
      <RowCanvasDnD
        isEditable={canEditBoardContent}
        sections={[SECTION]} padlets={[POST]} allPadlets={[POST]}
        onRename={noop} onDeleteSection={noop} onAddSectionLeft={noop} onAddSectionRight={noop}
        onMoveSectionLeft={noop} onMoveSectionRight={noop} onAddContainerAt={noop}
        onReorderPost={noop} onEditPost={noop} onDeletePost={noop} onOpenPost={noop}
        onOpenInNewTab={noop} onCopyLink={noop} onStartSlideshow={noop}
        onDownloadAttachment={noop} onCopyAttachmentLink={noop} onColorChange={noop}
        onAddBefore={noop} onAddAfter={noop} onDuplicate={noop}
        onCopyToAnotherPadlet={noop} onTransferToAnotherPadlet={noop}
        onSetAsCover={coverCallbackCanvasClientWouldPass(viewer)}
        onPin={noop} onReport={noop}
      />,
    );

    const menu = recorded.find((p) => p.padlet?.id === POST.id);
    expect(menu, 'the post reached the context menu').toBeDefined();
    // Content editing intact...
    expect(menu?.onEdit, 'ordinary content edit').toBeTypeOf('function');
    // ...and the owner-only action absent, not merely disabled.
    expect(menu?.onSetAsPadletCover, 'Set as cover').toBeUndefined();
  });

  it('the owner, in the same layout, still is', () => {
    const viewer = { userId: OWNER, collaboratorAuthority: collaborator(OWNER, null) };
    mount(
      <RowCanvasDnD
        isEditable={canvasClientProps(viewer).canEditBoardContent}
        sections={[SECTION]} padlets={[POST]} allPadlets={[POST]}
        onRename={noop} onDeleteSection={noop} onAddSectionLeft={noop} onAddSectionRight={noop}
        onMoveSectionLeft={noop} onMoveSectionRight={noop} onAddContainerAt={noop}
        onReorderPost={noop} onEditPost={noop} onDeletePost={noop} onOpenPost={noop}
        onOpenInNewTab={noop} onCopyLink={noop} onStartSlideshow={noop}
        onDownloadAttachment={noop} onCopyAttachmentLink={noop} onColorChange={noop}
        onAddBefore={noop} onAddAfter={noop} onDuplicate={noop}
        onCopyToAnotherPadlet={noop} onTransferToAnotherPadlet={noop}
        onSetAsCover={coverCallbackCanvasClientWouldPass(viewer)}
        onPin={noop} onReport={noop}
      />,
    );
    const menu = recorded.find((p) => p.padlet?.id === POST.id);
    expect(menu?.onSetAsPadletCover, 'Set as cover').toBeTypeOf('function');
  });
});
