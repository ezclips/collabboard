// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardCollaboratorAuthority } from './useBoardCollaboratorAuthority';
import { canEditBoard } from '@/lib/domain/canvas/boardEditAuthority';

/**
 * PDF_SELECTION_TO_NOTE_BOARD_AUTHORITY_FIX_2 -- the account/board switch,
 * driven through the real resolution path.
 *
 * The LOW finding: an account switch could briefly reuse the previous
 * account's cached authority. So the switch is performed the way the app
 * performs it -- a new user id arrives on a rerender, and the collaborator
 * role for that user is resolved asynchronously afterwards -- and what is
 * asserted is what the board-edit gate returns DURING that gap, not merely
 * after it.
 *
 * Nothing here substitutes an already-valid answer for B. B's answer is
 * resolved by the same hook, from the same read, on B's own schedule.
 */

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const BOARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_BOARD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/**
 * Deferred reads, one per (boardId, userId), settled by the test. Deferring
 * them is the point: the gap between "the user changed" and "this user's
 * authority is known" is exactly what these cases are about.
 */
const pending = new Map<string, (result: unknown) => void>();

vi.mock('@/lib/infra/canvas/canvasViewReads', () => ({
  findBoardCollaboratorRole: (boardId: string, userId: string) =>
    new Promise((resolveRead) => {
      pending.set(`${boardId}|${userId}`, resolveRead);
    }),
}));

/** Settles the outstanding read for one (board, user) pair with a role. */
async function resolveRoleFor(boardId: string, userId: string, role: string | null) {
  const settle = pending.get(`${boardId}|${userId}`);
  expect(settle, `no pending collaborator read for ${userId} on ${boardId}`).toBeDefined();
  await act(async () => {
    settle!({ ok: true, value: role });
  });
}

/** Settles it with a read failure instead. */
async function failReadFor(boardId: string, userId: string) {
  const settle = pending.get(`${boardId}|${userId}`);
  expect(settle, `no pending collaborator read for ${userId} on ${boardId}`).toBeDefined();
  await act(async () => {
    settle!({ ok: false, error: { kind: 'unavailable', message: 'network' } });
  });
}

/**
 * The production derivation, rendered: the hook's answer joined to the board
 * row exactly as CanvasClient joins them, feeding the one gate that shows or
 * hides every shared-board mutation control (Save as Note among them).
 */
function BoardEditGate({
  boardId,
  userId,
  boardOwnerId,
  boardRowId = BOARD,
}: {
  boardId: string;
  userId: string | null;
  boardOwnerId: string;
  boardRowId?: string;
}) {
  const collaboratorAuthority = useBoardCollaboratorAuthority(boardId, userId);
  const canEdit = canEditBoard({
    userId,
    boardId,
    board: { id: boardRowId, user_id: boardOwnerId },
    collaboratorAuthority,
  });
  return <div data-testid="gate">{canEdit ? 'can-edit' : 'cannot-edit'}</div>;
}

function gate(): string {
  return screen.getByTestId('gate').textContent ?? '';
}

beforeEach(() => {
  pending.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('account switch fails closed', () => {
  it('B does not inherit A\'s editor role while B\'s own is still resolving', async () => {
    // A is an editor collaborator on this board (A does not own it).
    const { rerender } = render(
      <BoardEditGate boardId={BOARD} userId={A} boardOwnerId={'owner-id-not-a'} />,
    );
    expect(gate()).toBe('cannot-edit'); // unresolved

    await resolveRoleFor(BOARD, A, 'editor');
    expect(gate()).toBe('can-edit');

    // The account switches. This rerender is the gap: B is the current user,
    // and A's resolved editor answer is still the value in state.
    await act(async () => {
      rerender(<BoardEditGate boardId={BOARD} userId={B} boardOwnerId={'owner-id-not-a'} />);
    });
    expect(gate()).toBe('cannot-edit');

    // B resolves with no collaborator row: still denied.
    await resolveRoleFor(BOARD, B, null);
    expect(gate()).toBe('cannot-edit');
  });

  it('B does not inherit A\'s board ownership', async () => {
    const { rerender } = render(<BoardEditGate boardId={BOARD} userId={A} boardOwnerId={A} />);
    expect(gate()).toBe('can-edit'); // owner, no collaborator read needed

    await act(async () => {
      rerender(<BoardEditGate boardId={BOARD} userId={B} boardOwnerId={A} />);
    });
    expect(gate()).toBe('cannot-edit');

    await resolveRoleFor(BOARD, B, 'viewer');
    expect(gate()).toBe('cannot-edit');
  });

  it('B, once resolved as an editor on this board, may edit', async () => {
    const { rerender } = render(<BoardEditGate boardId={BOARD} userId={A} boardOwnerId={A} />);
    expect(gate()).toBe('can-edit');

    await act(async () => {
      rerender(<BoardEditGate boardId={BOARD} userId={B} boardOwnerId={A} />);
    });
    expect(gate()).toBe('cannot-edit');

    await resolveRoleFor(BOARD, B, 'editor');
    expect(gate()).toBe('can-edit');
  });

  it('signing out revokes immediately, before anything is refetched', async () => {
    const { rerender } = render(<BoardEditGate boardId={BOARD} userId={A} boardOwnerId={A} />);
    expect(gate()).toBe('can-edit');

    await act(async () => {
      rerender(<BoardEditGate boardId={BOARD} userId={null} boardOwnerId={A} />);
    });
    expect(gate()).toBe('cannot-edit');
    // Nothing was even read for a user who is not there.
    expect(pending.has(`${BOARD}|null`)).toBe(false);
  });
});

describe('board switch fails closed', () => {
  it('an editor role on the previous board does not carry to the next one', async () => {
    const { rerender } = render(
      <BoardEditGate
        boardId={OTHER_BOARD}
        userId={B}
        boardOwnerId={'someone-else'}
        boardRowId={OTHER_BOARD}
      />,
    );
    await resolveRoleFor(OTHER_BOARD, B, 'editor');
    expect(gate()).toBe('can-edit');

    // Navigate to another board. The previous board's row and the previous
    // board's resolved editor role are both still in state.
    await act(async () => {
      rerender(
        <BoardEditGate
          boardId={BOARD}
          userId={B}
          boardOwnerId={'someone-else'}
          boardRowId={OTHER_BOARD}
        />,
      );
    });
    expect(gate()).toBe('cannot-edit');

    // B is only a viewer here.
    await resolveRoleFor(BOARD, B, 'viewer');
    expect(gate()).toBe('cannot-edit');
  });

  it('owning the previous board does not confer ownership of this one', async () => {
    const { rerender } = render(
      <BoardEditGate boardId={OTHER_BOARD} userId={B} boardOwnerId={B} boardRowId={OTHER_BOARD} />,
    );
    expect(gate()).toBe('can-edit');

    await act(async () => {
      rerender(
        <BoardEditGate boardId={BOARD} userId={B} boardOwnerId={B} boardRowId={OTHER_BOARD} />,
      );
    });
    expect(gate()).toBe('cannot-edit');
  });
});

describe('a failed read is not an answer', () => {
  it('stays unresolved -- a network error grants nobody and denies no owner', async () => {
    // A non-owner whose collaborator read fails: unresolved, so denied. It
    // must not be mistaken for a resolved "no collaborator row", and it must
    // certainly not be mistaken for a grant.
    const { rerender } = render(
      <BoardEditGate boardId={BOARD} userId={B} boardOwnerId={'someone-else'} />,
    );
    expect(gate()).toBe('cannot-edit');

    await failReadFor(BOARD, B);
    expect(gate()).toBe('cannot-edit');

    // The board's OWNER is unaffected by a collaborator read that fails --
    // ownership is decided on the board row alone, and never waits on this.
    await act(async () => {
      rerender(<BoardEditGate boardId={BOARD} userId={B} boardOwnerId={B} />);
    });
    expect(gate()).toBe('can-edit');
  });
});
