-- Migration: Enable RLS on tables where it was never turned on at all.
-- These 12 tables are currently readable/writable by anyone holding the
-- public anon key, with zero ownership or membership checks. Policies below
-- reuse the same patterns already established for canvases/padlets/board_sections:
--   - canvas_id-scoped tables check canvases.owner_id / canvases.is_public / canvas_collaborators
--   - board_id-scoped tables check boards.user_id / board_collaborators

-- ============================================================================
-- canvas_collaborators: this table itself grants permissions, so writes are
-- restricted to the canvas owner or existing admin-level members. Any member
-- can see the roster; a user can always see their own membership row.
--
-- The admin check is done via a SECURITY DEFINER function rather than a
-- subquery on canvas_collaborators itself -- a policy that queries its own
-- table directly causes Postgres to raise "infinite recursion detected in
-- policy for relation canvas_collaborators". A SECURITY DEFINER function
-- runs with the privileges of its owner and bypasses RLS internally, so it
-- can safely check the table without triggering the policy recursively.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."is_canvas_admin"("canvas_uuid" uuid, "user_uuid" uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM canvas_collaborators
    WHERE canvas_id = canvas_uuid
      AND user_id = user_uuid
      AND board_permission = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION "public"."is_canvas_admin"(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_canvas_admin"(uuid, uuid) TO authenticated;

ALTER TABLE "public"."canvas_collaborators" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_collaborators_select"
ON "public"."canvas_collaborators" FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR public.is_canvas_admin(canvas_id, auth.uid())
);

CREATE POLICY "canvas_collaborators_insert"
ON "public"."canvas_collaborators" FOR INSERT
TO authenticated
WITH CHECK (
  canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR public.is_canvas_admin(canvas_id, auth.uid())
);

CREATE POLICY "canvas_collaborators_update"
ON "public"."canvas_collaborators" FOR UPDATE
TO authenticated
USING (
  canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR public.is_canvas_admin(canvas_id, auth.uid())
);

CREATE POLICY "canvas_collaborators_delete"
ON "public"."canvas_collaborators" FOR DELETE
TO authenticated
USING (
  canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR public.is_canvas_admin(canvas_id, auth.uid())
);

-- ============================================================================
-- canvas_activity: append-only activity log. Any collaborator/owner can read
-- and add their own entries; no update/delete (default-deny keeps it tamper-proof).
-- ============================================================================

ALTER TABLE "public"."canvas_activity" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_activity_select"
ON "public"."canvas_activity" FOR SELECT
TO authenticated
USING (
  canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid())
);

CREATE POLICY "canvas_activity_insert"
ON "public"."canvas_activity" FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
    OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid())
  )
);

-- ============================================================================
-- canvas_comments: read follows canvas visibility; write requires at least
-- commenter-level access; only the author or a canvas owner/admin can
-- edit/delete/resolve.
-- ============================================================================

ALTER TABLE "public"."canvas_comments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_comments_select"
ON "public"."canvas_comments" FOR SELECT
TO authenticated
USING (
  canvas_id IN (SELECT id FROM canvases WHERE is_public = true OR owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid())
);

CREATE POLICY "canvas_comments_insert"
ON "public"."canvas_comments" FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
    OR canvas_id IN (
      SELECT canvas_id FROM canvas_collaborators
      WHERE user_id = auth.uid() AND board_permission IN ('commenter', 'editor', 'moderator', 'admin')
    )
  )
);

CREATE POLICY "canvas_comments_update"
ON "public"."canvas_comments" FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid() AND board_permission IN ('moderator', 'admin'))
);

CREATE POLICY "canvas_comments_delete"
ON "public"."canvas_comments" FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid() AND board_permission IN ('moderator', 'admin'))
);

-- ============================================================================
-- canvas_items / canvas_sections: canvas content. Read follows canvas
-- visibility; write requires editor-level access or ownership.
-- ============================================================================

ALTER TABLE "public"."canvas_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_items_select"
ON "public"."canvas_items" FOR SELECT
TO authenticated
USING (
  canvas_id IN (SELECT id FROM canvases WHERE is_public = true OR owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid())
);

CREATE POLICY "canvas_items_write"
ON "public"."canvas_items" FOR ALL
TO authenticated
USING (
  canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid() AND board_permission IN ('editor', 'moderator', 'admin'))
)
WITH CHECK (
  canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid() AND board_permission IN ('editor', 'moderator', 'admin'))
);

ALTER TABLE "public"."canvas_sections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_sections_select"
ON "public"."canvas_sections" FOR SELECT
TO authenticated
USING (
  canvas_id IN (SELECT id FROM canvases WHERE is_public = true OR owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid())
);

CREATE POLICY "canvas_sections_write"
ON "public"."canvas_sections" FOR ALL
TO authenticated
USING (
  canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid() AND board_permission IN ('editor', 'moderator', 'admin'))
)
WITH CHECK (
  canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid() AND board_permission IN ('editor', 'moderator', 'admin'))
);

-- ============================================================================
-- canvas_presence: cursor/online tracking. Any collaborator/owner of the
-- canvas can see who else is present; a user can only write their own
-- presence row, and only for a canvas they actually have access to.
-- ============================================================================

ALTER TABLE "public"."canvas_presence" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_presence_select"
ON "public"."canvas_presence" FOR SELECT
TO authenticated
USING (
  canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
  OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid())
);

CREATE POLICY "canvas_presence_write"
ON "public"."canvas_presence" FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  AND (
    canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
    OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND (
    canvas_id IN (SELECT id FROM canvases WHERE owner_id = auth.uid())
    OR canvas_id IN (SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid())
  )
);

-- ============================================================================
-- boards: same ownership model as canvases. Collaborators (board_collaborators)
-- can view; only the owner can rename/delete/change settings (editing board
-- *content* like padlets/posts/canvas_lines is governed by their own policies).
--
-- boards and board_collaborators each need to check membership in the other,
-- which is exactly the mutual-recursion trap Postgres RLS disallows (evaluating
-- boards' policy would require evaluating board_collaborators' policy, which
-- requires evaluating boards' policy again). Breaking the cycle with a
-- SECURITY DEFINER function, same approach as is_canvas_admin above.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."is_board_member"("board_uuid" uuid, "user_uuid" uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_collaborators
    WHERE board_id = board_uuid
      AND user_id = user_uuid
  );
$$;

REVOKE ALL ON FUNCTION "public"."is_board_member"(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_board_member"(uuid, uuid) TO authenticated;

ALTER TABLE "public"."boards" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boards_select"
ON "public"."boards" FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_board_member(id, auth.uid())
);

CREATE POLICY "boards_insert"
ON "public"."boards" FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "boards_update"
ON "public"."boards" FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "boards_delete"
ON "public"."boards" FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- board_collaborators: mirrors canvas_collaborators -- this table grants
-- access to boards, so only the board owner manages it. A user can always
-- see their own membership row. This side can safely query boards directly
-- (not via the function) since boards' own policy no longer queries
-- board_collaborators directly -- it goes through is_board_member(), which
-- bypasses RLS internally, so there's no cycle.
-- ============================================================================

ALTER TABLE "public"."board_collaborators" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "board_collaborators_select"
ON "public"."board_collaborators" FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
);

CREATE POLICY "board_collaborators_write"
ON "public"."board_collaborators" FOR ALL
TO authenticated
USING (board_id IN (SELECT id FROM boards WHERE user_id = auth.uid()))
WITH CHECK (board_id IN (SELECT id FROM boards WHERE user_id = auth.uid()));

-- ============================================================================
-- posts / canvas_lines: board content, same board_id-based ownership/
-- collaborator model as padlets.
-- ============================================================================

ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_select"
ON "public"."posts" FOR SELECT
TO authenticated
USING (
  board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
  OR board_id IN (SELECT board_id FROM board_collaborators WHERE user_id = auth.uid())
);

CREATE POLICY "posts_write"
ON "public"."posts" FOR ALL
TO authenticated
USING (
  board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
  OR board_id IN (SELECT board_id FROM board_collaborators WHERE user_id = auth.uid() AND role = 'editor')
)
WITH CHECK (
  board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
  OR board_id IN (SELECT board_id FROM board_collaborators WHERE user_id = auth.uid() AND role = 'editor')
);

ALTER TABLE "public"."canvas_lines" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_lines_select"
ON "public"."canvas_lines" FOR SELECT
TO authenticated
USING (
  board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
  OR board_id IN (SELECT board_id FROM board_collaborators WHERE user_id = auth.uid())
);

CREATE POLICY "canvas_lines_write"
ON "public"."canvas_lines" FOR ALL
TO authenticated
USING (
  board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
  OR board_id IN (SELECT board_id FROM board_collaborators WHERE user_id = auth.uid() AND role = 'editor')
)
WITH CHECK (
  board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
  OR board_id IN (SELECT board_id FROM board_collaborators WHERE user_id = auth.uid() AND role = 'editor')
);

-- ============================================================================
-- user_subscriptions: billing state. Not referenced anywhere in the app code
-- (looks unused/legacy vs. the `subscriptions` table), so read-only self
-- access only -- writes should only ever come from a service-role billing
-- webhook, which bypasses RLS entirely and is unaffected by this.
-- ============================================================================

ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_subscriptions_select"
ON "public"."user_subscriptions" FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- notification_push_subscriptions: a correct migration for this already
-- exists (20260315_120000_create_notification_push_subscriptions.sql) but
-- never made it to production. Reapplying it here verbatim.
-- ============================================================================

ALTER TABLE "public"."notification_push_subscriptions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON "public"."notification_push_subscriptions";
DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON "public"."notification_push_subscriptions";
DROP POLICY IF EXISTS "Users can update own push subscriptions" ON "public"."notification_push_subscriptions";
DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON "public"."notification_push_subscriptions";

CREATE POLICY "Users can view own push subscriptions"
ON "public"."notification_push_subscriptions" FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
ON "public"."notification_push_subscriptions" FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions"
ON "public"."notification_push_subscriptions" FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
ON "public"."notification_push_subscriptions" FOR DELETE
USING (auth.uid() = user_id);
