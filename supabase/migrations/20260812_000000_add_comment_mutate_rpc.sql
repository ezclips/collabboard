-- ============================================================================
-- PATCH 8O.2 -- comment_mutate RPC (DRAFTED, NOT YET APPLIED)
-- PATCH 8O.2a -- hardened per DeepSeek security review (DRAFTED, NOT YET APPLIED)
-- ============================================================================
--
-- STATUS: This migration has been reviewed and written as part of PATCH 8O.2
-- ("Canonical Commenter Authorization") but has DELIBERATELY NOT been run
-- against the live database. There is no local Supabase instance or
-- pgTAP/db-test harness in this repository to validate it against (verified
-- via exhaustive search -- no supabase/config.toml, no db test scripts), so
-- the only way to test it would be to apply it to the real project. The user
-- explicitly chose "draft only, don't apply" for this patch, and again for
-- the 8O.2a hardening pass below.
--
-- WHAT THIS UNBLOCKS: until this (or an equivalent) migration is reviewed
-- and applied, a BoardPermission 'commenter' user sees the correct
-- 'comment'-mode UI (composer, own-comment Edit/Color/Link/Strikethrough/
-- Delete) but every attempted write fails cleanly with a
-- "function comment_mutate(...) does not exist" error, surfaced via
-- toast.error by lib/infra/canvas/commentMutations.ts -- fail-safe, not
-- fake-success. See that file's own header for the full rationale. Applying
-- this migration is what turns that error into a real, working write.
--
-- REQUIRED HUMAN REVIEW BEFORE APPLYING:
--   1. Confirm the permission-resolution logic below (steps 2-3) matches the
--      CURRENT padlets_update RLS policy and get_board_permission() at the
--      time of review -- both may have changed since this was written.
--   2. Confirm the STYLE_OWN_COMMENT partial-patch contract (see the comment
--      above that CASE branch) still matches lib/infra/canvas/
--      commentMutations.ts's actual call shapes.
--   3. Run this against a staging/non-production database first if one
--      exists, with a real 'commenter'-permission test account, and verify
--      the negative-control expectations in COMMENT_UI_CONTRACT_V1.md's
--      three-tier section (reader cannot write; commenter can only touch
--      their own comment via a named operation; commenter cannot rewrite
--      comment.userId, delete/edit another user's comment, or touch any
--      padlet field outside metadata.detachedComments).
--   4. Confirm EXECUTE privilege intent once more just before applying:
--      PUBLIC must have NO EXECUTE, anon must have NO EXECUTE (it never had
--      an explicit grant and does not inherit one from authenticated), and
--      authenticated must have EXECUTE. See the REVOKE/GRANT statements at
--      the bottom of this file.
--   5. Only after all of the above, apply via the project's normal migration
--      process and remove this "DRAFTED, NOT YET APPLIED" banner (and the
--      matching note in COMMENT_UI_CONTRACT_V1.md) in the commit that does so.
--
-- WHY A DEDICATED RPC AND NOT "GRANT commenter UPDATE ON padlets":
-- padlets.metadata is a single jsonb column holding the WHOLE post's
-- metadata (comments, colors, captions, reactions, container membership,
-- etc). A client-submitted UPDATE necessarily replaces the entire column
-- value it sends -- there is no column-level or key-level RLS in Postgres
-- for jsonb. Granting UPDATE would let a commenter submit ANY replacement
-- metadata object: rewrite another user's comment text, delete another
-- user's comment, forge comment.userId, or edit unrelated fields entirely
-- (cardColor, badgeColor, container membership...). This function instead
-- runs as SECURITY DEFINER, decides ONE narrow operation server-side using
-- auth.uid() (never a client-supplied identity), and patches only the
-- specific comment/field the operation names -- the padlets_update RLS
-- policy itself is NOT modified or weakened by this migration.
--
-- PERMISSION MODEL FOLLOW-UP -- WORKSPACE READONLY VS BOARD/CANVAS ROLE
-- (identified during the 8O.2a DeepSeek review, deliberately NOT solved
-- here): the CLIENT-side access contract (lib/domain/canvas/comments.ts's
-- resolveCommentAccessMode) treats a workspace member whose WorkspaceRole is
-- 'readonly' as forced to 'read' no matter what board/canvas permission they
-- hold -- this is the client's own outer bound. This RPC's server-side
-- permission resolution, however, mirrors get_board_permission() /
-- padlets_update RLS as they exist TODAY, and neither of those currently
-- re-checks workspace_role once a canvas_collaborators or board_collaborators
-- row grants a board-level permission. In other words: it is possible for a
-- workspace-readonly user who also holds an explicit 'commenter' (or higher)
-- canvas_collaborators row to be blocked by the CLIENT UI (which forces
-- 'read') while this RPC, if called directly (bypassing the UI), would still
-- honor the board-level grant. This is a pre-existing inconsistency in the
-- permission model, broader than comments (it would affect any future
-- server-side authorization that keys off get_board_permission() alone), and
-- is NOT introduced or worsened by this migration -- comment_mutate simply
-- inherits the same resolution get_board_permission() already uses
-- everywhere else. Fixing it (e.g. having get_board_permission() itself
-- clamp to 'reader' when workspace_role is 'readonly') is out of scope for
-- 8O.2/8O.2a and must not be bundled into a comments-only patch. Tracked here
-- as a named follow-up, not fixed.
--
-- COMMENT LENGTH: p_text is unbounded (matches DeepSeek's low-severity
-- row-growth finding). No canonical maximum comment length exists anywhere
-- in the current UI (CommentPopup.tsx, CommentEditor.tsx, CommentPost.tsx --
-- verified by search, none of them impose one), so no limit has been
-- invented here. Adding one is a product decision, not something to guess
-- at inside a security-hardening migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.comment_mutate(
    p_padlet_id uuid,
    p_operation text,
    p_comment_id uuid DEFAULT NULL,
    p_text text DEFAULT NULL,
    p_text_color text DEFAULT NULL,
    p_background_color text DEFAULT NULL,
    p_is_strikethrough boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_padlet RECORD;
    v_permission public.board_permission_level;
    v_is_manager boolean;
    v_user_name text;
    v_user_avatar text;
    v_comments jsonb;
    v_target jsonb;
    v_new_comment jsonb;
    v_new_comments jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    IF p_operation NOT IN ('ADD_COMMENT', 'EDIT_OWN_COMMENT', 'STYLE_OWN_COMMENT', 'DELETE_OWN_COMMENT') THEN
        RAISE EXCEPTION 'unknown comment_mutate operation: %', p_operation;
    END IF;

    -- Lock the row for the duration of this mutation -- two concurrent
    -- commenters editing the same padlet's comment list must not race and
    -- silently drop one write (the classic read-modify-write jsonb hazard).
    SELECT id, canvas_id, board_id, metadata
    INTO v_padlet
    FROM public.padlets
    WHERE id = p_padlet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'padlet not found: %', p_padlet_id;
    END IF;

    -- Resolve effective permission -- mirrors padlets_update RLS's own
    -- dual canvas_id / legacy board_id resolution (see
    -- supabase/baseline/schema_snapshot_2026-07-05.sql's padlets_update
    -- policy). get_board_permission already handles the canvas_id path
    -- (owner, workspace role, canvas_collaborators) via SECURITY DEFINER.
    -- See the "PERMISSION MODEL FOLLOW-UP" note above the header banner:
    -- this deliberately mirrors get_board_permission()'s existing behavior
    -- as-is, including its known workspace-readonly inconsistency, rather
    -- than attempting to fix that broader issue inside a comments-only RPC.
    IF v_padlet.canvas_id IS NOT NULL THEN
        v_permission := public.get_board_permission(v_padlet.canvas_id, v_user_id);
    ELSIF v_padlet.board_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.boards WHERE id = v_padlet.board_id AND user_id = v_user_id) THEN
            v_permission := 'admin'::public.board_permission_level;
        ELSE
            SELECT CASE role
                WHEN 'editor' THEN 'editor'::public.board_permission_level
                WHEN 'commenter' THEN 'commenter'::public.board_permission_level
                WHEN 'viewer' THEN 'reader'::public.board_permission_level
                ELSE NULL
            END
            INTO v_permission
            FROM public.board_collaborators
            WHERE board_id = v_padlet.board_id AND user_id = v_user_id
            ORDER BY added_at DESC
            LIMIT 1;
        END IF;
    ELSE
        RAISE EXCEPTION 'padlet % has neither canvas_id nor board_id', p_padlet_id;
    END IF;

    IF v_permission IS NULL OR v_permission = 'reader' THEN
        RAISE EXCEPTION 'insufficient permission to comment (resolved: %)', COALESCE(v_permission::text, 'none');
    END IF;

    -- 'editor'/'moderator'/'admin' retain full management rights over any
    -- comment (matches CommentPopup's own 'manage' semantics) -- this RPC's
    -- narrow-ownership rule below only constrains 'commenter'.
    v_is_manager := v_permission IN ('editor', 'moderator', 'admin');

    SELECT COALESCE(display_name, name, split_part(email, '@', 1), 'User'), avatar_url
    INTO v_user_name, v_user_avatar
    FROM public.profiles
    WHERE id = v_user_id;

    v_comments := COALESCE(v_padlet.metadata -> 'detachedComments', '[]'::jsonb);

    IF p_operation = 'ADD_COMMENT' THEN
        IF p_text IS NULL OR btrim(p_text) = '' THEN
            RAISE EXCEPTION 'comment text is required';
        END IF;
        v_new_comment := jsonb_build_object(
            'id', gen_random_uuid()::text,
            'text', p_text,
            -- Identity comes from auth.uid(), NEVER from a client-supplied
            -- argument -- this is the specific property that makes userId
            -- forgery (negative control C) impossible through this path.
            'userId', v_user_id::text,
            'userName', COALESCE(v_user_name, 'User'),
            'timestamp', floor(extract(epoch FROM now()) * 1000)
        );
        IF v_user_avatar IS NOT NULL THEN
            v_new_comment := v_new_comment || jsonb_build_object('userAvatar', v_user_avatar);
        END IF;
        v_new_comments := v_comments || jsonb_build_array(v_new_comment);

    ELSE
        IF p_comment_id IS NULL THEN
            RAISE EXCEPTION '% requires p_comment_id', p_operation;
        END IF;

        SELECT elem INTO v_target
        FROM jsonb_array_elements(v_comments) elem
        WHERE elem ->> 'id' = p_comment_id::text;

        IF v_target IS NULL THEN
            RAISE EXCEPTION 'comment not found: %', p_comment_id;
        END IF;

        IF NOT v_is_manager AND (v_target ->> 'userId') IS DISTINCT FROM v_user_id::text THEN
            RAISE EXCEPTION 'cannot % another user''s comment', p_operation;
        END IF;

        IF p_operation = 'DELETE_OWN_COMMENT' THEN
            SELECT jsonb_agg(elem) FILTER (WHERE elem ->> 'id' != p_comment_id::text)
            INTO v_new_comments
            FROM jsonb_array_elements(v_comments) elem;
            v_new_comments := COALESCE(v_new_comments, '[]'::jsonb);

        ELSIF p_operation = 'EDIT_OWN_COMMENT' THEN
            IF p_text IS NULL OR btrim(p_text) = '' THEN
                RAISE EXCEPTION 'comment text is required';
            END IF;
            SELECT jsonb_agg(
                CASE WHEN elem ->> 'id' = p_comment_id::text
                    THEN elem || jsonb_build_object('text', p_text)
                    ELSE elem
                END
            )
            INTO v_new_comments
            FROM jsonb_array_elements(v_comments) elem;

        ELSIF p_operation = 'STYLE_OWN_COMMENT' THEN
            -- Partial-patch contract matching lib/infra/canvas/
            -- commentMutations.ts's two distinct call shapes:
            --   toggleOwnCommentStrikethrough always passes a non-null
            --   p_is_strikethrough and nothing else -- touch ONLY that key.
            --   setOwnCommentColor always passes textColor+backgroundColor
            --   together (as a pair, even if one is null/clearing) and never
            --   isStrikethrough -- touch ONLY those two keys, together,
            --   matching the pre-8O.2 manage-mode callback's own semantics
            --   (`{ ...comment, textColor, backgroundColor }`, an
            --   unconditional pair overwrite, not a partial merge).
            -- If a future caller needs to combine both in one call, this
            -- branch must change to an explicit "which fields" signal
            -- instead of relying on which params are non-null.
            IF p_is_strikethrough IS NOT NULL THEN
                SELECT jsonb_agg(
                    CASE WHEN elem ->> 'id' = p_comment_id::text
                        THEN elem || jsonb_build_object('isStrikethrough', p_is_strikethrough)
                        ELSE elem
                    END
                )
                INTO v_new_comments
                FROM jsonb_array_elements(v_comments) elem;
            ELSE
                SELECT jsonb_agg(
                    CASE WHEN elem ->> 'id' = p_comment_id::text
                        THEN (elem - 'textColor' - 'backgroundColor') || jsonb_strip_nulls(jsonb_build_object('textColor', p_text_color, 'backgroundColor', p_background_color))
                        ELSE elem
                    END
                )
                INTO v_new_comments
                FROM jsonb_array_elements(v_comments) elem;
            END IF;
        END IF;
    END IF;

    -- Only ever touches metadata.detachedComments -- every other key in
    -- metadata (cardColor, badgeColor, captionStyle, container membership,
    -- ...) is left byte-identical. This is the property that makes
    -- "arbitrary padlet metadata cannot be changed through this path" true.
    UPDATE public.padlets
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{detachedComments}', v_new_comments),
        updated_at = now()
    WHERE id = p_padlet_id;

    RETURN v_new_comments;
END;
$$;

COMMENT ON FUNCTION public.comment_mutate(uuid, text, uuid, text, text, text, boolean) IS
'PATCH 8O.2/8O.2a -- narrowly-scoped, ownership-checked comment mutation for BoardPermission commenter (and above). See its own header banner: DRAFTED, NOT YET APPLIED as of this migration file''s creation -- do not assume this function exists in the live database without independently confirming it was actually run.';

-- EXECUTE privilege intent (8O.2a hardening -- SECURITY DEFINER functions are
-- PUBLIC-executable by default in Postgres unless explicitly revoked, which
-- the original 8O.2 draft missed):
--   PUBLIC:         NO EXECUTE (explicitly revoked below)
--   anon:           NO EXECUTE (never granted; does not inherit from
--                    authenticated or from the now-revoked PUBLIC grant)
--   authenticated:  EXECUTE (explicitly granted below)
REVOKE EXECUTE ON FUNCTION public.comment_mutate(uuid, text, uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comment_mutate(uuid, text, uuid, text, text, text, boolean) TO authenticated;
