# PATCH-366 — Freeze board: the owner makes a board read-only for everyone else

**Status:** approved

## Goal
The board owner can freeze a board. While it is frozen, nobody but the owner (and
board admins) can add, move, edit, comment on, vote on or delete anything; everyone
sees why. Unfreezing restores normal access. Works on Freeform, Kanban and Gantt.

## Reason
Guest safety controls (owner's choice after the Padlet / Miro review). Padlet's
"Freeze board" is the standard way to end a session: the results stay visible, and
nobody can change them afterwards, guests included. It also blunts a guest who still
has a valid link after the session.

## Why now / why this order
Second of four: 365 guest links + QR → **366 freeze** → 367 approve guest posts →
368 hide names.

## Expected Outcome
- Share canvas, in the top "Canvas access" box, shows a **Freeze board** switch to the
  owner/admin only, with the hint "Nobody else can add or change anything until you
  unfreeze." Others don't see the switch.
- When frozen, every viewer except the owner/admin sees a slim banner at the top centre:
  "This board is frozen. You can look, but not change anything." The owner sees
  "Board frozen. Only you can change it." with an **Unfreeze** button.
- Freeform for a non-owner: editing controls are not offered (the existing
  `canEditBoardContent` path returns false). Kanban for a non-owner: read-only like a
  `view` member. Gantt: banner at least; read-only where the code already has a
  read-only switch (report what you found).
- Changes reach open tabs live (no reload): freezing makes the banner appear and editing
  stop within a few seconds for everyone on the board.
- The database refuses writes from non-owners while frozen, even if the UI is bypassed.

## Files to Create
- `supabase/migrations/20261014190000_board_freeze.sql` — ONE transaction:
  1. `ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS frozen_at timestamptz;`
     (null = open). Comment the column.
  2. `public.board_open_for_write(b uuid) RETURNS boolean`, plpgsql, STABLE,
     SECURITY DEFINER, `SET search_path = public`:
     - look up `frozen_at, user_id` from `boards` where `id = b`;
     - board not found → `true` (other policies decide); `frozen_at IS NULL` → `true`
       (this early return keeps the open-board cost to one PK lookup);
     - frozen → `true` only if `user_id = auth.uid()` OR
       `public.get_board_permission(b, auth.uid())::text = 'admin'`; else `false`.
     - `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated, service_role`.
  3. A DO block over a fixed list of `(table, board column)` pairs that FIRST checks
     each column exists in `information_schema.columns` (raise a clear exception
     naming the table if not), then for each table creates three RESTRICTIVE policies
     `TO authenticated` (drop-if-exists first):
     `board_frozen_no_insert` (WITH CHECK), `board_frozen_no_update` (USING and WITH
     CHECK), `board_frozen_no_delete` (USING), each
     `public.board_open_for_write(<col>)`.
     The list — padlets uses `coalesce(board_id, canvas_id)`:
     `padlets(board_id/canvas_id)`, `canvas_lines(board_id)`, `board_sections(board_id)`,
     `freeform_graph_edges(board_id)`, `kanban_cards(canvas_id)`,
     `kanban_columns(canvas_id)`, `kanban_swimlanes(canvas_id)`,
     `kanban_column_groups(canvas_id)`, `kanban_links(canvas_id)`,
     `kanban_comments(canvas_id)`, `kanban_votes(canvas_id)`,
     `kanban_card_assignees(canvas_id)`. (Verify each column against the repo
     migrations; the PM confirmed padlets and the three main kanban tables live.)
     NOT in the list: `kanban_board_members` (personal sort/group settings must keep
     working), `boards` itself.
  4. Trigger `boards_guard_frozen_at` BEFORE UPDATE OF frozen_at ON boards: if
     `NEW.frozen_at IS DISTINCT FROM OLD.frozen_at` and `auth.uid() IS NOT NULL` and
     the caller is neither `OLD.user_id` nor `get_board_permission(...) = 'admin'` →
     `RAISE EXCEPTION 'Only the board owner can freeze or unfreeze this board'
     USING ERRCODE = '42501'`. (Workspace editors can update `boards` by RLS today, so
     the column needs its own guard.) Service role (no `auth.uid()`) passes.
  5. Add `public.boards` to the `supabase_realtime` publication with the same guarded
     DO pattern as `20261013150000_realtime_publication.sql` (skip if already a member).
  6. A self-check DO block at the end: the function exists, 36 policies exist
     (12 tables × 3), the trigger exists, `boards` is in the publication.
  Header comment: why; owner/admin exempt; existing boards are open (null); service-role
  writes (AI routes) are not blocked by RLS — the app hides those for non-editors.
- `lib/domain/canvas/boardFreeze.ts` (+ test) — pure: `isBoardFrozen(row)`,
  `mayEditFrozenBoard({ frozen, isOwnerOrAdmin })`, banner text constants
  `FROZEN_BANNER_VISITOR`, `FROZEN_BANNER_OWNER`.
- `components/collabboard/canvas/hooks/useBoardFrozen.ts` (+ test) — given `boardId`
  and the initially loaded `frozen_at`, returns `{ frozenAt, setFrozen(next) }`:
  subscribes to `postgres_changes` UPDATE on `boards` with `filter: id=eq.<boardId>`
  and updates `frozenAt` from the payload's `new.frozen_at` (ignores other columns);
  `setFrozen` updates `boards.frozen_at` (now / null) with the session client,
  `.select('frozen_at')`, and surfaces errors (toast "Only the board owner can freeze
  this board." on 42501). Re-sync from the initial value when it changes (navigation).
- `components/collabboard/canvas/ui/FrozenBoardBanner.tsx` (+ test) — the banner;
  `data-frozen-banner`, owner variant with `data-frozen-unfreeze`.
- `components/collabboard/canvas/ui/BoardFreezeToggle.tsx` (+ test) — the switch for
  the Share modal; `role="switch"`, `aria-checked`, `data-board-freeze-toggle`.

## Files to Modify
- `lib/domain/canvas/boardEditAuthority.ts` — `canEditBoard` takes an optional
  `frozen?: boolean`; when true, only the owner may edit (an editor collaborator may
  not). Keep every existing guard and comment; add tests.
- `app/dashboard/canvas/[id]/CanvasClient.tsx` — minimal wiring only: call
  `useBoardFrozen(canvasId, canvas?.frozen_at)`, pass `frozen` into `canEditBoard`,
  render `FrozenBoardBanner` in the main, Kanban and Gantt returns (the presence stack
  lesson from PATCH-363: there are early returns). Pass the freeze state/handler to
  the share modal as needed. Report the exact lines touched.
- `components/collabboard/canvas/ui/CanvasShareModal.tsx` — render
  `BoardFreezeToggle` in the "Canvas access" box for owners/admins only (decide
  owner/admin the same way the app does elsewhere; report how).
- Kanban: the minimal change so a frozen board is read-only for a non-owner exactly
  like `permission_level === 'view'` (store.tsx computes `isReadonly` at ~910/975).
  Report the path you chose.
- Gantt: report whether a read-only switch exists; use it if it does, otherwise banner
  only (DB still refuses).
- `vitest.config.ts` only if a new test path is not matched.

## Files that MUST NOT be touched
`.claude/settings.json`, `lib/server/ai/providers/anthropic.test.ts`, earlier
migrations. No SQL apply, no git, no production build.

## Architecture Notes
- The database is the guard; the UI only stops offering what the DB will refuse.
- Restrictive policies only remove access, so nothing gets wider.
- `board_open_for_write` returns early for open boards — no `get_board_permission`
  call per row unless the board is frozen.
- The realtime event is a hint; the payload's `frozen_at` comes from the DB row the
  subscriber is allowed to read (realtime respects RLS on `boards`).

## Potential Risks
- Pending local edits when the freeze lands: the next write is refused; the UI must
  show the existing save-error path, not crash. Mention what happens in your report.
- `boards` updates are frequent (thumbnail, last_visited_at): the hook must ignore
  events where `frozen_at` did not change (no re-render storm).

## Commit
  Commit message:
  feat(sharing): freeze a board — read-only for everyone but the owner

## Rollback Plan
Drop the 36 policies, the trigger, the function; leave the column (harmless); remove
`boards` from the publication if wanted. Revert the app commit.

## Acceptance Criteria (PM, live, after the owner applies)
Throwaway Freeform board + guest (edit link) + Kanban board + guest:
1. Owner freezes → guest's tab shows the banner within seconds, no reload; guest
   insert/update/delete on padlets → refused (0 rows / 42501); owner can still add.
2. Kanban guest: card insert refused; UI read-only; owner still edits.
3. A non-owner trying `update boards set frozen_at = null` → refused.
4. Unfreeze → guest can write again, banner gone, no reload.
5. `npx tsc --noEmit` clean; affected tests pass.

## Required Tests
Domain (freeze rules, labels), `canEditBoard` frozen cases (owner yes, editor no,
unresolved no), hook (applies a frozen_at change, ignores unrelated updates, error
toast on 42501), banner variants, toggle (calls `setFrozen`, hidden for non-owners), a
migration source test (as `storageOwnerOnlyMigration.test.ts` does): 12 tables listed,
RESTRICTIVE, early return on `frozen_at IS NULL`, trigger present, publication guarded.

## Estimated Difficulty
medium-hard
