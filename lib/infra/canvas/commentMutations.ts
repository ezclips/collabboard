// PATCH 8O.2 -- persistence path for 'comment'-mode comment mutations,
// deliberately distinct from the existing updatePadletMetadata /
// commitPadletMeta bulk-metadata-write path every 'manage'-mode comment
// callback still uses, unchanged.
//
// Why a separate path: commitPadletMeta (app/dashboard/canvas/[id]/
// CanvasClient.tsx) swallows every persistence error silently by design (a
// pre-existing, deliberate, whole-app pattern -- see its own comment there),
// and updatePadletMetadata applies its optimistic local update SYNCHRONOUSLY
// before that debounced write even starts. Combined, a 'comment'-mode user
// whose write is rejected by the database (padlets_update RLS has no
// 'commenter' grant today -- see COMMENT_UI_CONTRACT_V1.md's COMMENTER
// PERSISTENCE section) would see FAKE local success: the UI shows the
// comment as posted/edited/deleted while the database silently discarded it.
// That is worse than not shipping 'comment'-mode UI at all -- it misleads an
// honest commenter, not just a hypothetical attacker.
//
// Every handler below instead:
//   1. Never optimistically mutates local state before persistence resolves.
//   2. Calls the narrowly-scoped `comment_mutate` RPC (drafted in
//      supabase/migrations/20260812_000000_add_comment_mutate_rpc.sql --
//      NOT YET APPLIED to the live database as of this patch, see that
//      file's own header) instead of the whole-metadata-object update path,
//      so a commenter's write can only ever affect the ONE comment
//      operation it names, never arbitrary padlet metadata.
//   3. On success, applies the RPC's returned comment list as the new local
//      state -- server truth, not a client-computed guess.
//   4. On failure, leaves local state completely untouched and surfaces the
//      failure via the SAME toast.error mechanism already used elsewhere in
//      this codebase (deletePadletById, handleChronoModeChange) -- no new
//      notification system introduced.
//
// Until the migration is reviewed and applied, every call here fails
// immediately with a clean "function comment_mutate(...) does not exist"
// Postgres error -- exactly the fail-SAFE, fail-LOUD behavior this module is
// designed to produce instead of commitPadletMeta's silent swallow. The
// per-comment OWNERSHIP check itself is not duplicated here: callers wrap
// these functions with `guardOwnCommentMutation` (lib/domain/canvas/
// comments.ts) at the JSX boundary, the same defense-in-depth pattern 8O.1
// established for `guardCommentMutation` -- this module trusts that gate and
// focuses purely on "how a comment-mode mutation is persisted".
//
// Deliberately a plain factory function, not a React hook: the logic itself
// has no hook dependency (no state, no effect, no context) beyond stable
// function identity, which a caller can get the same way usePadletSave.ts
// already gets its supabase client -- `useMemo(() => createCommentModeMutations(...), [...])`.
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import type { Comment } from '@/lib/domain/canvas/comments';
import type { Padlet } from '@/types/collabboard';

export type CommentMutationOperation =
  | 'ADD_COMMENT'
  | 'EDIT_OWN_COMMENT'
  | 'STYLE_OWN_COMMENT'
  | 'DELETE_OWN_COMMENT';

export interface CommentMutationRpcArgs {
  padletId: string;
  operation: CommentMutationOperation;
  commentId?: string;
  text?: string;
  textColor?: string;
  backgroundColor?: string;
  isStrikethrough?: boolean;
}

export type CommentMutationRpcResult =
  | { ok: true; comments: Comment[] }
  | { ok: false; error: string };

export async function callCommentMutationRpc(
  supabase: SupabaseClient,
  args: CommentMutationRpcArgs
): Promise<CommentMutationRpcResult> {
  const { data, error } = await supabase.rpc('comment_mutate', {
    p_padlet_id: args.padletId,
    p_operation: args.operation,
    p_comment_id: args.commentId ?? null,
    p_text: args.text ?? null,
    p_text_color: args.textColor ?? null,
    p_background_color: args.backgroundColor ?? null,
    p_is_strikethrough: args.isStrikethrough ?? null,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, comments: Array.isArray(data) ? (data as Comment[]) : [] };
}

export interface CreateCommentModeMutationsParams {
  supabase: SupabaseClient;
  setPadlets: Dispatch<SetStateAction<Padlet[]>>;
}

export interface CommentModeMutations {
  submitOwnComment: (padletId: string, text: string) => void;
  editOwnComment: (padletId: string, commentId: string, text: string) => void;
  removeOwnComment: (padletId: string, commentId: string) => void;
  toggleOwnCommentStrikethrough: (padletId: string, commentId: string, nextIsStrikethrough: boolean) => void;
  setOwnCommentColor: (padletId: string, commentId: string, textColor?: string, backgroundColor?: string) => void;
}

export function createCommentModeMutations({
  supabase,
  setPadlets,
}: CreateCommentModeMutationsParams): CommentModeMutations {
  const applyResult = (padletId: string, comments: Comment[]) => {
    setPadlets((prev) =>
      prev.map((p) =>
        p.id === padletId
          ? { ...p, metadata: { ...(p.metadata || {}), detachedComments: comments, comments } }
          : p
      )
    );
  };

  const runMutation = async (
    padletId: string,
    operation: CommentMutationOperation,
    args: Omit<CommentMutationRpcArgs, 'padletId' | 'operation'>,
    failureMessage: string
  ) => {
    const result = await callCommentMutationRpc(supabase, { padletId, operation, ...args });
    if (!result.ok) {
      console.error(`[commentMutations] ${operation} failed for padlet ${padletId}:`, result.error);
      toast.error(failureMessage);
      return;
    }
    applyResult(padletId, result.comments);
  };

  return {
    submitOwnComment: (padletId, text) => {
      void runMutation(padletId, 'ADD_COMMENT', { text }, 'Failed to post comment');
    },
    editOwnComment: (padletId, commentId, text) => {
      void runMutation(padletId, 'EDIT_OWN_COMMENT', { commentId, text }, 'Failed to update comment');
    },
    removeOwnComment: (padletId, commentId) => {
      void runMutation(padletId, 'DELETE_OWN_COMMENT', { commentId }, 'Failed to delete comment');
    },
    toggleOwnCommentStrikethrough: (padletId, commentId, nextIsStrikethrough) => {
      void runMutation(
        padletId,
        'STYLE_OWN_COMMENT',
        { commentId, isStrikethrough: nextIsStrikethrough },
        'Failed to update comment'
      );
    },
    setOwnCommentColor: (padletId, commentId, textColor, backgroundColor) => {
      void runMutation(
        padletId,
        'STYLE_OWN_COMMENT',
        { commentId, textColor, backgroundColor },
        'Failed to update comment'
      );
    },
  };
}
