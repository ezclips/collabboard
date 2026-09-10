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
 * row exactly as CanvasClient joins them, feeding the gate that shows or hides
 * the PDF selection's Save as Note. That gate, and no other control -- see
 * boardEditAuthorityWiring.source.test.ts for the fence around its scope.
 *
 * Every rendered value is appended to `renders`, so a test can assert not just
 * where the gate ENDS UP but that it was never briefly open on the way there.
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
  renders.push(`${boardId}|${userId}|${canEdit ? 'can-edit' : 'cannot-edit'}`);
  return <div data-testid="gate">{canEdit ? 'can-edit' : 'cannot-edit'}</div>;
}

/** Every value the gate has rendered, in order, since the last reset. */
const renders: string[] = [];

/**
 * The hook's OWN answer, unjoined.
 *
 * `canEditBoard` independently refuses a stamp that names another scope, so a
 * gate assertion alone stays green even if the hook let a superseded request
 * write to state. That redundancy is deliberate in production and useless in
 * a test: it would hide exactly the defect this suite exists to catch. This
 * probe therefore asserts on what the hook itself returns.
 */
let lastAuthority: ReturnType<typeof useBoardCollaboratorAuthority> = null;

function AuthorityProbe({ boardId, userId }: { boardId: string; userId: string | null }) {
  lastAuthority = useBoardCollaboratorAuthority(boardId, userId);
  return <div data-testid="probe">{lastAuthority ? `${lastAuthority.userId}|${lastAuthority.boardId}|${lastAuthority.role}` : 'unresolved'}</div>;
}

function probe(): string {
  return screen.getByTestId('probe').textContent ?? '';
}

function gate(): string {
  return screen.getByTestId('gate').textContent ?? '';
}

beforeEach(() => {
  pending.clear();
  renders.length = 0;
  lastAuthority = null;
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

// ============================================================================
// PDF_SELECTION_TO_NOTE_BOARD_AUTHORITY_SCOPE_FIX_1 -- the accepted LOW:
// a request from a SUPERSEDED scope that completes LATE
// ============================================================================

/**
 * The cases above switch scope and then resolve the new scope's request. This
 * suite covers the harder ordering: the OLD scope's request is still in
 * flight when the switch happens, the new scope resolves first, and only
 * afterwards does the old one come back.
 *
 * The first promise is genuinely left unresolved until after the switch --
 * nothing here stands in an already-completed request and calls it stale.
 */
describe('a request from a superseded scope completes late and is ignored', () => {
  it('account AND board both change; the old answer lands last and changes nothing', async () => {
    // 1. Scope A/X. A is an editor there -- but the read has not come back.
    const { rerender } = render(
      <BoardEditGate boardId={BOARD} userId={A} boardOwnerId={'someone-else'} />,
    );
    expect(gate()).toBe('cannot-edit');
    expect(pending.has(`${BOARD}|${A}`)).toBe(true);

    // 2. Switch to B/Y before A/X resolves. Note the ORDER: the A/X promise
    //    is still outstanding at this point, and stays outstanding.
    await act(async () => {
      rerender(
        <BoardEditGate
          boardId={OTHER_BOARD}
          userId={B}
          boardOwnerId={'someone-else'}
          boardRowId={OTHER_BOARD}
        />,
      );
    });
    expect(gate()).toBe('cannot-edit');

    // 3. B/Y resolves: B is only a viewer on Y.
    await resolveRoleFor(OTHER_BOARD, B, 'viewer');
    expect(gate()).toBe('cannot-edit');

    // 4. NOW the superseded A/X request finally comes back -- as an editor,
    //    the most dangerous answer it could carry.
    await resolveRoleFor(BOARD, A, 'editor');

    // A/X cannot replace B/Y's authority.
    expect(gate()).toBe('cannot-edit');
    // The current scope is still B/Y, and it is still the one being asked.
    expect(renders[renders.length - 1]).toBe(`${OTHER_BOARD}|${B}|cannot-edit`);
    // ...and the gate was never briefly open at any point in the sequence.
    expect(renders.filter((r) => r.endsWith('can-edit'))).toEqual([]);
  });

  it('account only changes; the old account\'s late editor answer is ignored', async () => {
    const { rerender } = render(
      <BoardEditGate boardId={BOARD} userId={A} boardOwnerId={'someone-else'} />,
    );
    expect(pending.has(`${BOARD}|${A}`)).toBe(true);

    await act(async () => {
      rerender(<BoardEditGate boardId={BOARD} userId={B} boardOwnerId={'someone-else'} />);
    });
    await resolveRoleFor(BOARD, B, null);
    expect(gate()).toBe('cannot-edit');

    // A's editor role on this same board arrives late. It is A's, not B's.
    await resolveRoleFor(BOARD, A, 'editor');
    expect(gate()).toBe('cannot-edit');
    expect(renders.filter((r) => r.endsWith('can-edit'))).toEqual([]);
  });

  it('board only changes; the previous board\'s late editor answer is ignored', async () => {
    const { rerender } = render(
      <BoardEditGate boardId={BOARD} userId={B} boardOwnerId={'someone-else'} />,
    );
    expect(pending.has(`${BOARD}|${B}`)).toBe(true);

    await act(async () => {
      rerender(
        <BoardEditGate
          boardId={OTHER_BOARD}
          userId={B}
          boardOwnerId={'someone-else'}
          boardRowId={OTHER_BOARD}
        />,
      );
    });
    await resolveRoleFor(OTHER_BOARD, B, 'viewer');
    expect(gate()).toBe('cannot-edit');

    // B really is an editor -- on the board they navigated AWAY from.
    await resolveRoleFor(BOARD, B, 'editor');
    expect(gate()).toBe('cannot-edit');
    expect(renders.filter((r) => r.endsWith('can-edit'))).toEqual([]);
  });

  it('a late FAILURE from the old scope cannot disturb the new scope either', async () => {
    // The new scope has resolved and granted; the old scope then errors. An
    // error handler that wrote to shared state would revoke a live grant.
    const { rerender } = render(
      <BoardEditGate boardId={BOARD} userId={A} boardOwnerId={'someone-else'} />,
    );
    expect(pending.has(`${BOARD}|${A}`)).toBe(true);

    await act(async () => {
      rerender(
        <BoardEditGate
          boardId={OTHER_BOARD}
          userId={B}
          boardOwnerId={'someone-else'}
          boardRowId={OTHER_BOARD}
        />,
      );
    });
    await resolveRoleFor(OTHER_BOARD, B, 'editor');
    expect(gate()).toBe('can-edit');

    await failReadFor(BOARD, A);
    expect(gate()).toBe('can-edit');
    expect(renders[renders.length - 1]).toBe(`${OTHER_BOARD}|${B}|can-edit`);
  });

  it('the new scope resolving AFTER the old one still wins', async () => {
    // The reverse interleaving, for completeness: old lands first this time,
    // then the current scope's own answer arrives.
    const { rerender } = render(
      <BoardEditGate boardId={BOARD} userId={A} boardOwnerId={'someone-else'} />,
    );
    await act(async () => {
      rerender(
        <BoardEditGate
          boardId={OTHER_BOARD}
          userId={B}
          boardOwnerId={'someone-else'}
          boardRowId={OTHER_BOARD}
        />,
      );
    });

    await resolveRoleFor(BOARD, A, 'editor');
    expect(gate()).toBe('cannot-edit');

    await resolveRoleFor(OTHER_BOARD, B, 'editor');
    expect(gate()).toBe('can-edit');
  });
});

// ============================================================================
// The hook's own cancellation, asserted directly
// ============================================================================

describe('the hook itself discards a superseded scope\'s late completion', () => {
  it('a late A/X success never becomes the hook\'s answer for B/Y', async () => {
    const { rerender } = render(<AuthorityProbe boardId={BOARD} userId={A} />);
    expect(probe()).toBe('unresolved');
    expect(pending.has(`${BOARD}|${A}`)).toBe(true);

    // Switch while A/X is still outstanding.
    await act(async () => {
      rerender(<AuthorityProbe boardId={OTHER_BOARD} userId={B} />);
    });
    expect(probe()).toBe('unresolved');

    await resolveRoleFor(OTHER_BOARD, B, 'viewer');
    expect(probe()).toBe(`${B}|${OTHER_BOARD}|viewer`);

    // The superseded request returns 'editor', late. It must not reach state
    // at all -- not as a wrong answer, and not as a right one for the wrong
    // scope.
    await resolveRoleFor(BOARD, A, 'editor');
    expect(probe()).toBe(`${B}|${OTHER_BOARD}|viewer`);
    expect(lastAuthority).toEqual({ userId: B, boardId: OTHER_BOARD, role: 'viewer' });
  });

  it('a late A/X success cannot overwrite an unresolved B/Y', async () => {
    // The window that matters most: B/Y has NOT answered yet, so a stale
    // write would be the only value present and would look authoritative.
    const { rerender } = render(<AuthorityProbe boardId={BOARD} userId={A} />);
    await act(async () => {
      rerender(<AuthorityProbe boardId={OTHER_BOARD} userId={B} />);
    });

    await resolveRoleFor(BOARD, A, 'editor');
    expect(probe()).toBe('unresolved');
    expect(lastAuthority).toBeNull();

    // B/Y's own answer still lands normally afterwards.
    await resolveRoleFor(OTHER_BOARD, B, 'editor');
    expect(lastAuthority).toEqual({ userId: B, boardId: OTHER_BOARD, role: 'editor' });
  });

  it('a late A/X failure cannot disturb B/Y either', async () => {
    const { rerender } = render(<AuthorityProbe boardId={BOARD} userId={A} />);
    await act(async () => {
      rerender(<AuthorityProbe boardId={OTHER_BOARD} userId={B} />);
    });
    await resolveRoleFor(OTHER_BOARD, B, 'editor');
    expect(lastAuthority).toEqual({ userId: B, boardId: OTHER_BOARD, role: 'editor' });

    await failReadFor(BOARD, A);
    expect(lastAuthority).toEqual({ userId: B, boardId: OTHER_BOARD, role: 'editor' });
    // The superseded scope's error is not even logged as the current one's.
    expect(probe()).toBe(`${B}|${OTHER_BOARD}|editor`);
  });
});
