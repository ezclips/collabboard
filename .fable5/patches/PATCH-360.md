# PATCH-360 — Share links open Kanban boards; guests never see member emails

## Why
Live probe (2026-10-14): a guest who joined a **Kanban** board by edit link saw an EMPTY
board. Every Kanban policy authorises through `kanban_board_members` (for example,
`kanban_columns_select`: a member row for `auth.uid()`;
`kanban_columns_write`: `permission_level IN ('edit','admin')`). PATCH-357's redeem only
writes `board_collaborators`, which Kanban never reads. So a share link to a Kanban
board grants nothing, for guests and registered visitors alike.

Second, the live `get_board_members_with_profile` (SECURITY DEFINER; callable by the
board owner or any Kanban member) returns `auth.users.email` for every member, and uses
the email as `display_name` when there is no name. Once guests become members, a
stranger with a link would see everyone's email. A guest's own `display_name` metadata
is not used either.

Live facts:
- `kanban_board_members`: `canvas_id uuid NOT NULL`, `user_id uuid NOT NULL`,
  `role text default 'member'`, `permission_level text NOT NULL default 'edit'`
  (values `view` | `comment` | `edit` | `admin`).
- Unique on `(canvas_id, user_id)`: `createBoard` upserts the owner's row with that
  `onConflict` for EVERY board layout.

## Design

### 1. Redeem also grants Kanban membership (app)
In `lib/domain/sharing/shareLinkGrant.ts` (pure, with tests), add:
- `kanbanPermissionForRole(role: 'editor' | 'commenter' | 'viewer')`: editor → `edit`,
  commenter → `comment`, viewer → `view`;
- `kanbanPermissionSatisfies(existing, wanted)`, ranking
  `view < comment < edit < admin`.

In `app/api/share-link/redeem/route.ts`, after the existing collaborator step, ensure
a `kanban_board_members` row for `(boardId, user.id)` with the admin client, for EVERY
board layout (the owner's row is created for every layout too, and a board can later
switch to Kanban):
- no row → insert `{ canvas_id, user_id, role: 'member', permission_level: kanbanPermissionForRole(role) }`;
- a row whose permission already satisfies → leave it (never downgrade; the owner's
  `admin` row is never touched);
- otherwise → update `permission_level` only.

This must ALSO run when the route currently returns early because the board permission
already satisfies the link (PATCH-357 collaborators from before this patch, and
workspace members). Restructure so that both steps always run; keep each step's
never-downgrade rule. A failure of the Kanban step → 500 with a clear error, logged,
never swallowed.
Tests (`lib/server/share/shareLinkRedeemRoute.test.ts`): insert when missing; no
downgrade of `admin`/`edit` by a view link; upgrade `view` → `edit`; runs on the
early-return path; 500 when the Kanban write fails.

### 2. Member list without emails for guests, with guest names (DB)
New migration `supabase/migrations/20261014140000_kanban_share_access.sql`, one transaction:
- Recreate `public.get_board_members_with_profile(board_id uuid)` from the LIVE body
  (given in the comment below, verbatim), with only these changes:
  - `email` → `CASE WHEN (select public.is_guest()) THEN NULL ELSE u.email END`;
  - `display_name` → `COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'display_name', CASE WHEN (select public.is_guest()) THEN 'Member' ELSE u.email END)`.

  Keep the signature, return table, `STABLE SECURITY DEFINER`,
  `SET search_path TO 'public', 'auth'`, and the access check unchanged. Afterwards,
  `REVOKE EXECUTE … FROM PUBLIC, anon` (as `20260916140000` did) and
  `GRANT EXECUTE … TO authenticated, service_role`.
- **Backfill:** insert a `kanban_board_members` row for every `board_collaborators`
  row that has none (`role 'member'`; editor → `edit`, commenter → `comment`,
  else `view`), `ON CONFLICT (canvas_id, user_id) DO NOTHING`.
- Header comment: why (the probe); registered members still see each other's emails
  (team feature, unchanged), guests never do.

Live body to start from:
```
CREATE OR REPLACE FUNCTION public.get_board_members_with_profile(board_id uuid)
 RETURNS TABLE(id uuid, canvas_id uuid, user_id uuid, role text, permission_level text, sort_by text, sort_order text, group_by text, date_format text, created_at timestamp with time zone, email text, display_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
    SELECT m.id, m.canvas_id, m.user_id, m.role, m.permission_level, m.sort_by, m.sort_order,
        m.group_by, m.date_format, m.created_at,
        u.email,
        COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', u.email) AS display_name,
        u.raw_user_meta_data->>'avatar_url' AS avatar_url
    FROM kanban_board_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.canvas_id = board_id
      AND (
          EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM kanban_board_members viewer
                     WHERE viewer.canvas_id = board_id AND viewer.user_id = auth.uid())
      );
$function$
```

### Out of scope
Removing a collaborator does not remove their Kanban row (there is no removal UI for
share-link collaborators yet). Workspace members without a Kanban row on someone
else's board are a separate, known gap.

## Allowed files
`lib/domain/sharing/shareLinkGrant.ts` (+ test), `app/api/share-link/redeem/route.ts`,
`lib/server/share/shareLinkRedeemRoute.test.ts`, the new migration, and a source
test for it in `lib/infra/` (email `CASE`, `display_name` fallback, revoke/grant,
backfill `ON CONFLICT`). No SQL apply, no git. Run `npx tsc --noEmit` and the
affected tests.

## Verification (PM, live, after the owner applies)
On a throwaway KANBAN board:
- An edit-link guest sees the columns, can add a column, and the members RPC gives
  them no email (names only).
- The owner's RPC shows the guest's name and still shows emails.
- A view-link guest sees the columns but cannot add one.
- A registered second account that redeems the link sees the columns.
- Delete the board.

## Addendum 1 — two redeems at once must not fail
Live: the guest's share page sent the redeem twice at the same moment (React dev
double-mount; in production a double click or two tabs would do the same). Both saw
"no Kanban row" and both inserted; the second hit
`kanban_board_members_canvas_id_user_id_key` (23505) → 500, and the guest stayed on the
share page.

Fix in `app/api/share-link/redeem/route.ts`: replace the plain `insert` with
`.upsert({...}, { onConflict: 'canvas_id,user_id', ignoreDuplicates: true })`
(ON CONFLICT DO NOTHING), so the request that loses the race succeeds. The
never-downgrade update path stays as it is. Add a route test: the insert reports
nothing to insert (the row already exists) → still 200. Keep the existing 500 test for a
real database error.
Allowed files: the route and its test. No git.
