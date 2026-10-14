# PATCH-357 — Share links grant board access; permission function repaired

## Why
Owner wants workshop visitors (prerequisite for timer + dot-voting). The PM
assessment (2026-10-13) and two read-only DB snapshots the owner ran showed:

1. **The live `get_board_permission` is the OLD body**, not the repair in
   `supabase/migrations/20260916130000_repair_get_board_permission.sql`: it
   selects `canvases.workspace_id` (the live `canvases` table has NO such
   column — columns: id, title, …, settings, is_public, owner_id) and
   `canvas_collaborators.accepted_at/invited_at` (columns that do not exist).
   Every call errors → `/api/share-link` (which calls it via
   `getBoardPermission`) cannot work. The REVOKE from anon DID land.
2. `can_view_workspace_board` / `can_edit_workspace_board` are still
   EXECUTE-able by `anon` (snapshot: true) → an anonymous "can user X see
   board Y" oracle. The three `boards` policies that call them
   ("Workspace users can view/edit boards", "… delete boards") are `TO public`.
3. **A share link grants nothing**: `/share/[token]` only redirects to
   `/dashboard/canvas/<id>`; the link's permission is never applied.
4. `board_collaborators (id bigint, user_id uuid, role text, added_at, board_id
   uuid)` is the one collaborator path every post/section policy already
   honours (`padlets_*`, `board_sections`, `is_board_member` → `boards_select`):
   role `editor` reads+writes posts, `commenter`/`viewer` read. 0 rows today.
   Live counts: boards 234, canvases 1, canvas_collaborators 0.

Workspace-member access to OTHER people's boards' posts (the `padlets_*`
policies do not consult workspace membership) is a separate defect to be
confirmed end-to-end with the owner's second account first — NOT in this patch.

## Design

### 1. Migration `supabase/migrations/20261013140000_share_link_access.sql` (owner applies)
- `CREATE OR REPLACE FUNCTION public.get_board_permission(board_uuid uuid,
  user_uuid uuid DEFAULT auth.uid()) RETURNS board_permission_level` —
  STABLE SECURITY DEFINER, `SET search_path = public`, reading **`boards`**:
  null inputs → NULL; board missing → NULL; `boards.user_id = user` → admin;
  workspace role (via `get_workspace_role`) honouring
  `workspace_members.allowed_canvas_ids` (same rule as
  `can_view_workspace_board`): owner/admin → admin, member → editor (only if
  `can_edit_workspace_board` is true for that user, else reader when
  `can_view_workspace_board`), readonly → reader; then `board_collaborators`
  role (`editor`→editor, `commenter`→commenter, `viewer`→reader, unknown →
  NULL); else NULL. No `canvases`, no `canvas_collaborators`, no public branch.
  Keep the header comment style of 20260916130000 explaining the live drift.
- `REVOKE ALL ON FUNCTION public.get_board_permission(uuid, uuid) FROM PUBLIC, anon;`
  `GRANT EXECUTE … TO authenticated, service_role;` (idempotent).
- Re-create the three `boards` policies that call the workspace helpers
  **`TO authenticated`** (same names, same USING/CHECK), then
  `REVOKE EXECUTE ON FUNCTION public.can_view_workspace_board(uuid, uuid),
  public.can_edit_workspace_board(uuid, uuid) FROM PUBLIC, anon;` and grant to
  authenticated, service_role. (Order matters: policies first, so anon queries
  return no rows instead of "permission denied for function".)
- `CREATE UNIQUE INDEX IF NOT EXISTS board_collaborators_board_user_key ON
  public.board_collaborators (board_id, user_id);` (0 rows today, safe).
- Wrapped in BEGIN/COMMIT; idempotent where possible. **Do not apply.**

### 2. Redeem route — new `app/api/share-link/redeem/route.ts`
`POST { token, password? }`:
- 401 without a signed-in user. Rate limit per user (10/min).
- Load the link with the admin client (`lib/supabase/admin.ts`): unknown → 404;
  expired → 410; no `board_id` → 400 (post-only links are not board grants).
- Password-protected → require `password`, verify with
  `verifySharePassword` (`lib/server/share/sharePassword.ts`, same as
  `verify-password`); wrong → 403.
- Role from the link: `edit`→`editor`, `comment`→`commenter`, `view`→`viewer`.
- If `get_board_permission(board, user)` already satisfies that role
  (`boardPermissionSatisfies`) → no write. Else upsert `board_collaborators`
  `(board_id, user_id, role)` on conflict `(board_id, user_id)` — **never
  downgrade** an existing higher role.
- Record access (`access_count`, `last_accessed_at`).
- Return `{ boardId, padletId | null }`. Never return the token or hash.
- Domain helper (pure, tested): `shareLinkRole(permission)` and
  `shouldUpgradeCollaborator(existingRole, newRole)` in
  `lib/domain/sharing/shareLinkGrant.ts`.

### 3. Share page — `app/share/[token]/page.tsx` + `SharePageClient.tsx`
- Board / post-in-board links, no password: if NOT signed in → redirect to
  `/auth?redirect=/share/<token>`; if signed in → render a tiny client step
  that POSTs `/api/share-link/redeem` and then `router.replace`s to the board
  (`?openPadlet=` kept). Errors show the existing "Link not found / expired"
  style messages.
- Password-protected: after the password is accepted, the same redeem call
  (with the password) before redirecting.
- Post-only links unchanged.
- Check `/auth`'s `redirect` param only allows same-origin relative paths
  (`/…`, not `//…` or `http…`); if it does not, fix it in `app/auth/page.tsx`
  (open-redirect guard) and say so.

### 4. Fix `/api/share-link` (create)
It builds its client with `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`:
use `lib/supabase/admin.ts` (fail with 500 "Share links are not configured"
if no service key) — never silently fall back to the anon key.

## Tests
- `shareLinkGrant` (role mapping, never-downgrade matrix).
- Redeem route (mocked admin/session like other route tests): 401, 404, 410,
  400 post-only, password required/wrong/right, already-sufficient → no write,
  upsert with mapped role, no downgrade, response has no token/hash.
- Share page: unsigned → redirect to `/auth?redirect=/share/<token>`; signed in
  → redeem then replace; password path redeems with the password.
- `/auth` redirect guard (if touched).
- SQL is reviewed by the PM; no SQL tests.

## Verification (PM)
Owner applies the migration. Then live, with the owner's second test account
in an ISOLATED browser context (never the owner's session): owner creates an
`edit` share link on a THROWAWAY board with 2 posts → second account opens it →
lands on the board, sees both posts, adds a post (the owner sees it live) →
`board_collaborators` has one `editor` row; a `view` link → reader (cannot
add). Unsigned visitor → login page with redirect back. Clean up: delete the
board (cascade) — confirm the collaborator row is gone.

## Allowed files
New: `supabase/migrations/20261013140000_share_link_access.sql`,
`app/api/share-link/redeem/route.ts` (+ test under a vitest-included folder,
e.g. `lib/server/share/shareLinkRedeemRoute.test.ts`),
`lib/domain/sharing/shareLinkGrant.ts` (+ test).
Changed: `app/share/[token]/page.tsx`, `app/share/[token]/SharePageClient.tsx`,
`app/api/share-link/route.ts`, `app/auth/page.tsx` (redirect guard only, if
needed), their existing tests if any. No SQL apply, no git. Ask (question
tool) before touching anything else; check vitest include globs first.

## Addendum 1 — PM review: the migration must check the LIVE policies itself
Code review passed (redeem route, share page, `/auth` open-redirect guard —
good catch). One change to the migration: the repo's migration files are known
to differ from the live database (this whole patch exists because of that), so
the REVOKE of `can_view_workspace_board` / `can_edit_workspace_board` from
anon must not rely on the repo's list of callers. Right after `BEGIN;` add a
`DO $$ … $$` guard that looks in `pg_policies` for any policy whose `qual` or
`with_check` mentions `can_view_workspace_board` or `can_edit_workspace_board`
and whose `roles` include `public` or `anon`, EXCLUDING the three `boards`
policies this migration re-creates; if any exist, `RAISE EXCEPTION` naming
them ("…: re-target these TO authenticated first") so the whole transaction
rolls back and nothing changes. Add a comment explaining why.

Allowed files: `supabase/migrations/20261013140000_share_link_access.sql` only. No git.

## Addendum 2 — live updates were never switched on (record it as a migration)
The two-person live test found the owner's open tab did NOT show the second
account's post. Cause: Supabase refused the realtime subscription ("Unable to
subscribe to changes … table: padlets") because no table the app listens to was
in the `supabase_realtime` publication — and no migration in the repo ever
added one. The owner has already run the SQL below on the live database (it
returned all 10 tables). Record it so a fresh database gets the same.

New file `supabase/migrations/20261013150000_realtime_publication.sql`:
an idempotent `DO $$ … $$` block that, for each of `padlets`, `kanban_cards`,
`kanban_columns`, `kanban_swimlanes`, `kanban_column_groups`, `kanban_links`,
`kanban_comments`, `kanban_votes`, `kanban_card_assignees`,
`kanban_board_members`: skips it if `to_regclass('public.<t>')` is null or it is
already in `pg_publication_tables` for `supabase_realtime`/`public`; otherwise
`execute format('alter publication supabase_realtime add table public.%I', t)`.
Header comment: why (the live test above), that it is safe to re-run, and that
these are exactly the tables `postgres_changes` subscriptions in the app use —
a new subscription to another table must add it here too. No data changes.

Allowed files: that new migration file only. No SQL apply, no git.

## Addendum 3 — deletes do not reach other people live
Live re-test after Addendum 2 (two accounts, owner tab not reloaded): the second
account's new post appeared for the owner live (1 → 2) and a moved post moved
live — but a deleted post did NOT disappear (stayed 2). Supabase docs
(Realtime → Postgres Changes → Limitations → Delete events): "You can only
filter Delete events … if the table has the `replica identity` set to `full`."
Every subscription in the app is filtered (`board_id=eq.…` for posts,
`canvas_id=eq.…` for Kanban), so no delete event is ever delivered. The client
already handles DELETE (`useCanvasData` removes the post; Kanban reconciles).

New file `supabase/migrations/20261013160000_realtime_delete_events.sql`:
a `DO $$ … $$` block over the same 10 tables as Addendum 2 that, when
`to_regclass('public.<t>')` is not null, runs
`execute format('alter table public.%I replica identity full', t)` (naturally
idempotent). Header comment: why (the test above + the doc quote), the cost
(Postgres writes the whole old row to the WAL on every update/delete of these
tables — acceptable at this size), and that Supabase does NOT apply RLS to
DELETE events, so subscribers to a board receive the deleted row of that board
only (filter still applies) — no other board's rows.

Allowed files: that new migration file only. No SQL apply, no git.
