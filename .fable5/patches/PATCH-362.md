# PATCH-362 — People with access: see and remove who joined a board by link

## Why
Since PATCH-357/358/360, a share link adds people to a board: `board_collaborators`,
plus `kanban_board_members` for Kanban. The board owner cannot see who joined, cannot
remove anyone, and removing a collaborator in the database would leave their Kanban
row (and the reverse). Before timer and dot-voting sessions with guests, the owner
asked for both to be fixed.

## Design

### 1. Database: removal stays in sync (migration)
New `supabase/migrations/20261014160000_board_access_sync.sql`, one transaction:
- `public.sync_kanban_after_collaborator_change()`: plpgsql, SECURITY DEFINER,
  `SET search_path = public`, trigger AFTER DELETE OR UPDATE OF role ON
  `board_collaborators` FOR EACH ROW.
  - DELETE → `DELETE FROM kanban_board_members WHERE canvas_id = OLD.board_id AND user_id = OLD.user_id AND permission_level <> 'admin' AND coalesce(role,'') <> 'owner'`.
  - UPDATE of role → set that row's `permission_level` to editor → `edit`,
    commenter → `comment`, else `view`, with the same admin/owner exclusion.
- `public.sync_collaborator_after_kanban_member_delete()`: trigger AFTER DELETE ON
  `kanban_board_members` → `DELETE FROM board_collaborators WHERE board_id = OLD.canvas_id AND user_id = OLD.user_id`.
  Removing someone in the Kanban member screen also ends their board access.
- Both functions start with `IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;`
  (one trigger firing the other must not loop), then return NULL.
- `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon, authenticated` (trigger-only).
- `DROP TRIGGER IF EXISTS` before each `CREATE TRIGGER` (idempotent). Comment WHY.

### 2. API (server, admin client after an authority check)
`app/api/boards/[id]/collaborators/route.ts`, GET:
- session required (401);
- the caller must have `admin` on the board (use the same `getBoardPermission` +
  `boardPermissionSatisfies` the redeem route uses), else 403
  `{ error: 'Only the board owner can manage access.' }`;
- reads `board_collaborators` (user_id, role, created_at) for the board and
  `public.users` (id, email, full_name) for those ids;
- returns `{ people: [{ userId, name, email, role, isGuest, joinedAt }] }`:
  - `isGuest` = no email;
  - `name` = full_name, else email, else 'Guest';
  - `email` is null for guests.

  Sorted by `joinedAt`. Cap the list at 500 rows.

`app/api/boards/[id]/collaborators/[userId]/route.ts`, DELETE:
- same auth and authority checks;
- refuse removing the board owner (400);
- deletes the `board_collaborators` row with the admin client (the trigger removes
  the Kanban row);
- returns 200 `{ removed: true }`, or 404 when there was no row.

Put the pure parts (row → person mapping, sorting) in
`lib/domain/sharing/boardPeople.ts` with tests; route tests under
`lib/server/share/` (vitest globs).

### 3. UI: a "People" tab in Share canvas
`components/collabboard/canvas/ui/CanvasShareModal.tsx`: add a third tab, **People**,
next to the existing email and link tabs.
- On open, it loads `GET /api/boards/<id>/collaborators`.
- Each row shows the name, a small "Guest" badge for guests, the email for
  registered people, the role (Can edit / Can comment / Can view), and a **Remove**
  button.
- Remove asks inline ("Remove <name>?" with Remove and Cancel; no browser
  `confirm()`), then calls DELETE and drops the row on success. A failure shows an
  inline error; never swallowed.
- Empty state: "No one has joined through a share link yet."
- 403 → "Only the board owner can manage access."
- One help line under the list: "Removed people can join again while a share link is
  still valid."
- Loading and error states as in the rest of the modal. Use `data-board-people`,
  `data-person-row`, `data-person-remove` and `data-person-remove-confirm`
  attributes for live tests. Keep the modal's existing look (same tab style).

## Tests
Domain mapping (a guest without an email, the name fallbacks, sorting); GET 401 / 403 /
200; DELETE 403 / 400 for the owner / 404 / 200; and the modal: the tab renders rows,
inline confirm, a failed removal shows the error. Plus a source test for the
migration (both triggers, the depth guard, the admin/owner exclusion, the revokes).

## Allowed files
The migration (+ source test), the two route files, `lib/domain/sharing/boardPeople.ts`
(+ test), route tests in `lib/server/share/`, `CanvasShareModal.tsx` and its test
(create one under `components/` if none). Ask before touching anything else. No SQL
apply, no git. Run `npx tsc --noEmit` and the affected tests.

## Verification (PM, live, after the owner applies)
Throwaway Kanban board, edit link, one guest joins:
- The owner opens Share canvas → People and sees the guest with a "Guest" badge.
- The owner clicks Remove → confirm → the row disappears.
- The guest's `board_collaborators` AND `kanban_board_members` rows are gone.
- The guest's next read of the columns returns 0.
- Reverse path: a second guest joins; the owner deletes their Kanban member row via REST
  → the collaborator row is gone too.
- Delete the board.

## Addendum 1 — the live column is `added_at`
Live: GET /collaborators returned 500, "column board_collaborators.created_at does not exist".
The live columns, read from a real row, are `id, user_id, role, added_at, board_id`
(my spec guessed `created_at`). Use `added_at` everywhere the route and the mapping read
the join time, and update the tests' fixtures. `public.users` (live) has `id, email, name,
full_name, avatar_url, …`: let the name fall back as `full_name`, then `name`, then email,
then 'Guest'. Allowed files: the GET route, `boardPeople.ts` and their tests. No git.
