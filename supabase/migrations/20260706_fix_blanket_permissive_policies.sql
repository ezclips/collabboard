-- Migration: Remove leftover blanket USING(true)/WITH CHECK(true) policies
-- These were added during early development and are additive (OR'd) with the
-- properly-scoped policies added later, meaning they currently override every
-- ownership/collaborator check on these tables. share_links is intentionally
-- NOT included here -- see follow-up migration once its access model is confirmed.

-- ============================================================================
-- canvases: already has correct owner_id-based policies; just drop the two
-- blanket ones that currently bypass them.
-- ============================================================================

DROP POLICY IF EXISTS "Allow all for authenticated users" ON "public"."canvases";
DROP POLICY IF EXISTS "Allow public create and read access on canvases" ON "public"."canvases";

-- ============================================================================
-- users: keep "view own profile" / "update own profile"; tighten the
-- insert-for-new-users policy so it can't be used to create rows for
-- arbitrary other user ids.
-- ============================================================================

DROP POLICY IF EXISTS "Allow public insert for new users" ON "public"."users";

CREATE POLICY "Users can insert own profile"
ON "public"."users" FOR INSERT
WITH CHECK (auth.uid() = id);

-- ============================================================================
-- padlets: had ONLY the two blanket policies (no real policy existed).
-- Access is modeled on whichever parent the padlet belongs to:
--   - canvas_id -> canvases (owner_id / is_public / canvas_collaborators membership)
--   - board_id  -> boards (user_id ownership / board_collaborators membership)
-- canvas_users is NOT used here: it has no app-code reads/writes anywhere in
-- the codebase besides an owner-only auto-insert trigger, so it carries no
-- real collaborator data. canvas_collaborators is the table the app's
-- getBoardPermission()/RPC layer actually reads and writes.
-- Write access requires ownership or an editor-level collaborator role.
-- ============================================================================

DROP POLICY IF EXISTS "Allow all for authenticated users" ON "public"."padlets";
DROP POLICY IF EXISTS "Allow public create and read access on padlets" ON "public"."padlets";

CREATE POLICY "padlets_select"
ON "public"."padlets" FOR SELECT
TO authenticated
USING (
  (canvas_id IS NOT NULL AND canvas_id IN (
    SELECT id FROM canvases WHERE is_public = true OR owner_id = auth.uid()
  ))
  OR (canvas_id IS NOT NULL AND canvas_id IN (
    SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid()
  ))
  OR (board_id IS NOT NULL AND board_id IN (
    SELECT id FROM boards WHERE user_id = auth.uid()
  ))
  OR (board_id IS NOT NULL AND board_id IN (
    SELECT board_id FROM board_collaborators WHERE user_id = auth.uid()
  ))
);

CREATE POLICY "padlets_insert"
ON "public"."padlets" FOR INSERT
TO authenticated
WITH CHECK (
  (canvas_id IS NOT NULL AND canvas_id IN (
    SELECT id FROM canvases WHERE owner_id = auth.uid()
  ))
  OR (canvas_id IS NOT NULL AND canvas_id IN (
    SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid() AND board_permission IN ('editor', 'moderator', 'admin')
  ))
  OR (board_id IS NOT NULL AND board_id IN (
    SELECT id FROM boards WHERE user_id = auth.uid()
  ))
  OR (board_id IS NOT NULL AND board_id IN (
    SELECT board_id FROM board_collaborators WHERE user_id = auth.uid() AND role = 'editor'
  ))
);

CREATE POLICY "padlets_update"
ON "public"."padlets" FOR UPDATE
TO authenticated
USING (
  (canvas_id IS NOT NULL AND canvas_id IN (
    SELECT id FROM canvases WHERE owner_id = auth.uid()
  ))
  OR (canvas_id IS NOT NULL AND canvas_id IN (
    SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid() AND board_permission IN ('editor', 'moderator', 'admin')
  ))
  OR (board_id IS NOT NULL AND board_id IN (
    SELECT id FROM boards WHERE user_id = auth.uid()
  ))
  OR (board_id IS NOT NULL AND board_id IN (
    SELECT board_id FROM board_collaborators WHERE user_id = auth.uid() AND role = 'editor'
  ))
);

CREATE POLICY "padlets_delete"
ON "public"."padlets" FOR DELETE
TO authenticated
USING (
  (canvas_id IS NOT NULL AND canvas_id IN (
    SELECT id FROM canvases WHERE owner_id = auth.uid()
  ))
  OR (canvas_id IS NOT NULL AND canvas_id IN (
    SELECT canvas_id FROM canvas_collaborators WHERE user_id = auth.uid() AND board_permission IN ('editor', 'moderator', 'admin')
  ))
  OR (board_id IS NOT NULL AND board_id IN (
    SELECT id FROM boards WHERE user_id = auth.uid()
  ))
  OR (board_id IS NOT NULL AND board_id IN (
    SELECT board_id FROM board_collaborators WHERE user_id = auth.uid() AND role = 'editor'
  ))
);

-- ============================================================================
-- kanban_* tables: had ONLY a blanket "_auth_all" policy each (no real policy
-- existed). Modeled on kanban_board_members, the same pattern already used
-- for kanban_comments/kanban_votes in 20260217_board_members_permission_level.sql.
-- ============================================================================

-- kanban_board_members: any member can see the roster; only admins manage it.
DROP POLICY IF EXISTS "kanban_board_members_auth_all" ON "public"."kanban_board_members";

CREATE POLICY "kanban_board_members_select"
ON "public"."kanban_board_members" FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM kanban_board_members m
    WHERE m.canvas_id = kanban_board_members.canvas_id AND m.user_id = auth.uid()
  )
);

CREATE POLICY "kanban_board_members_insert"
ON "public"."kanban_board_members" FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM kanban_board_members m
    WHERE m.canvas_id = kanban_board_members.canvas_id
      AND m.user_id = auth.uid()
      AND m.permission_level = 'admin'
  )
);

CREATE POLICY "kanban_board_members_update"
ON "public"."kanban_board_members" FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM kanban_board_members m
    WHERE m.canvas_id = kanban_board_members.canvas_id
      AND m.user_id = auth.uid()
      AND m.permission_level = 'admin'
  )
);

CREATE POLICY "kanban_board_members_delete"
ON "public"."kanban_board_members" FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM kanban_board_members m
    WHERE m.canvas_id = kanban_board_members.canvas_id
      AND m.user_id = auth.uid()
      AND m.permission_level = 'admin'
  )
);

-- kanban_cards / kanban_columns / kanban_links / kanban_swimlanes / kanban_card_assignees:
-- any board member can read; edit/admin members can write.

DROP POLICY IF EXISTS "kanban_cards_auth_all" ON "public"."kanban_cards";

CREATE POLICY "kanban_cards_select"
ON "public"."kanban_cards" FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_cards.canvas_id AND m.user_id = auth.uid())
);

CREATE POLICY "kanban_cards_write"
ON "public"."kanban_cards" FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_cards.canvas_id AND m.user_id = auth.uid() AND m.permission_level IN ('edit', 'admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_cards.canvas_id AND m.user_id = auth.uid() AND m.permission_level IN ('edit', 'admin'))
);

DROP POLICY IF EXISTS "kanban_columns_auth_all" ON "public"."kanban_columns";

CREATE POLICY "kanban_columns_select"
ON "public"."kanban_columns" FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_columns.canvas_id AND m.user_id = auth.uid())
);

CREATE POLICY "kanban_columns_write"
ON "public"."kanban_columns" FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_columns.canvas_id AND m.user_id = auth.uid() AND m.permission_level IN ('edit', 'admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_columns.canvas_id AND m.user_id = auth.uid() AND m.permission_level IN ('edit', 'admin'))
);

DROP POLICY IF EXISTS "kanban_links_auth_all" ON "public"."kanban_links";

CREATE POLICY "kanban_links_select"
ON "public"."kanban_links" FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_links.canvas_id AND m.user_id = auth.uid())
);

CREATE POLICY "kanban_links_write"
ON "public"."kanban_links" FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_links.canvas_id AND m.user_id = auth.uid() AND m.permission_level IN ('edit', 'admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_links.canvas_id AND m.user_id = auth.uid() AND m.permission_level IN ('edit', 'admin'))
);

DROP POLICY IF EXISTS "kanban_swimlanes_auth_all" ON "public"."kanban_swimlanes";

CREATE POLICY "kanban_swimlanes_select"
ON "public"."kanban_swimlanes" FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_swimlanes.canvas_id AND m.user_id = auth.uid())
);

CREATE POLICY "kanban_swimlanes_write"
ON "public"."kanban_swimlanes" FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_swimlanes.canvas_id AND m.user_id = auth.uid() AND m.permission_level IN ('edit', 'admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_swimlanes.canvas_id AND m.user_id = auth.uid() AND m.permission_level IN ('edit', 'admin'))
);

DROP POLICY IF EXISTS "kanban_card_assignees_auth_all" ON "public"."kanban_card_assignees";

CREATE POLICY "kanban_card_assignees_select"
ON "public"."kanban_card_assignees" FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_card_assignees.canvas_id AND m.user_id = auth.uid())
);

CREATE POLICY "kanban_card_assignees_write"
ON "public"."kanban_card_assignees" FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_card_assignees.canvas_id AND m.user_id = auth.uid() AND m.permission_level IN ('edit', 'admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM kanban_board_members m WHERE m.canvas_id = kanban_card_assignees.canvas_id AND m.user_id = auth.uid() AND m.permission_level IN ('edit', 'admin'))
);

-- ============================================================================
-- share_links: row-level policies are LEFT AS-IS for now. The API routes that
-- write to this table (app/api/share-link/route.ts, app/api/share-link/padlet/route.ts,
-- app/share/[token]/page.tsx) use a client that falls back to the anon key
-- when SUPABASE_SERVICE_ROLE_KEY isn't set, meaning auth.uid() is NULL for
-- those requests -- an ownership-based row policy (created_by = auth.uid())
-- would silently break share-link creation/viewing until that env var is
-- confirmed set. Instead, lock down at the COLUMN level, which is safe
-- regardless of which key is in play: hide password_hash entirely from the
-- anon/authenticated roles (closing the direct-REST-read gap Finding 3's API
-- fix didn't cover), and restrict UPDATE to only the two columns the public
-- view-tracking flow actually needs to touch.
--
-- Follow-up once SUPABASE_SERVICE_ROLE_KEY is confirmed set in production:
-- tighten INSERT/UPDATE/SELECT to real created_by/token-based row policies.
-- ============================================================================

REVOKE SELECT ON "public"."share_links" FROM "anon", "authenticated";
GRANT SELECT ("id", "padlet_id", "token", "created_by", "permission", "expires_at", "created_at", "access_count", "last_accessed_at", "board_id")
  ON "public"."share_links" TO "anon", "authenticated";

REVOKE UPDATE ON "public"."share_links" FROM "anon", "authenticated";
GRANT UPDATE ("access_count", "last_accessed_at") ON "public"."share_links" TO "anon", "authenticated";
