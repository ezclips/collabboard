import { useEffect, useState } from 'react';
import type {
  BoardCollaboratorAuthority,
  BoardCollaboratorRole,
} from '@/lib/domain/canvas/boardEditAuthority';
import { findBoardCollaboratorRole } from '@/lib/infra/canvas/canvasViewReads';

/**
 * PDF_SELECTION_TO_NOTE_BOARD_AUTHORITY_FIX_2 -- this user's
 * `board_collaborators` role on THIS board: the half of the board-edit rule
 * that does not live on the board row.
 *
 * Returns `null` for UNRESOLVED, which denies. A resolved answer with
 * `role: null` means "no collaborator row on this board" and also denies --
 * but the two must stay distinguishable, because one is a not-yet and the
 * other is an answer.
 *
 * Every resolved answer is STAMPED with the identity and the board it was
 * resolved for. That stamp, not this hook's timing, is what makes an account
 * or board switch fail closed: React renders with the previous state before
 * this effect reruns, and on that render `canEditBoard` sees a stamp that
 * names somebody else -- or another board -- and ignores it. Clearing the
 * state below closes the window sooner; it is not what closes it.
 *
 * A failed read stays UNRESOLVED rather than resolving to "no role". A board
 * owner is unaffected either way, and nobody else should be granted or denied
 * on the strength of a network error.
 *
 * This is UX only: it decides what to offer. RLS remains the boundary.
 */
export function useBoardCollaboratorAuthority(
  boardId: string | null | undefined,
  userId: string | null | undefined,
): BoardCollaboratorAuthority | null {
  const [authority, setAuthority] = useState<BoardCollaboratorAuthority | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Drop the previous account's / previous board's answer immediately.
    setAuthority(null);

    if (!userId || !boardId) return;

    const resolve = async () => {
      const result = await findBoardCollaboratorRole(boardId, userId);
      if (cancelled) return;

      if (!result.ok) {
        console.error('Error resolving board collaborator role:', result.error);
        // Leave it unresolved: fail closed until a real answer arrives.
        return;
      }

      const role = result.value;
      setAuthority({
        userId,
        boardId,
        role: role === 'editor' || role === 'viewer' || role === 'commenter'
          ? (role as BoardCollaboratorRole)
          : null,
      });
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [boardId, userId]);

  return authority;
}
