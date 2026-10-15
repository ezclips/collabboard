# PATCH-373 — Columns and Grid sections update live for everyone

**Status:** approved

## Goal
When anyone adds, renames, reorders or deletes a column (Columns) or section (Grid),
every other open tab sees it without reloading — the same way posts already move live.

## Reason
Found in the PATCH-372 live run: Board AI created 3 columns and moved 8 posts into them;
the second viewer saw nothing until reload — the posts were moved into columns its page
did not know. It is not an AI bug: a manual "Add section" behaves the same. Cause:
`board_sections` is not in the `supabase_realtime` publication
(`20261013150000_realtime_publication.sql` lists padlets + kanban tables; PATCH-366 added
`boards`) and `useCanvasData` subscribes to `padlets` only (`useCanvasData.ts:317`).

## Design
### 1. Migration — `supabase/migrations/20261015120000_board_sections_realtime.sql`
Idempotent, the same guarded pattern as `20261014190000_board_freeze.sql:167`: add
`public.board_sections` to `supabase_realtime` only if not already published. No data
change, no policy change (postgres_changes INSERT/UPDATE respect the existing SELECT RLS).
The owner applies it; do not run it.

### 2. Subscription — `components/collabboard/canvas/hooks/useCanvasData.ts`
On the existing `canvas-${canvasId}` channel (do not open a second channel with the same
topic — two channels with one topic drop events), add `postgres_changes` handlers for
`board_sections` filtered `board_id=eq.${canvasId}`:
- INSERT: add the row to `sections` unless one with the same id (compare with
  `String(id)` — the id is a BIGINT) is already there (our own create already added it);
  keep the list sorted by `position`.
- UPDATE: replace the row with the same id (title, description, position, …), re-sort.
- DELETE: DELETE events cannot be filtered by `board_id` (only the primary key is in the
  old record), so subscribe unfiltered and drop the section whose `String(id)` matches
  `payload.old.id`; ignore ids not on this board.
Immutable updates only. No change to how posts are handled.

## Files
Create: the migration. Modify: `useCanvasData.ts` (+ a focused test, e.g.
`useCanvasData.sections.test.ts`, driving the handlers with a fake channel). Ask before
touching anything else. No SQL execution, no git, no production build.

## Commit
  feat(canvas): columns and sections update live for every viewer

## Acceptance Criteria (PM, live — after the owner applies the SQL)
Two tabs on a throwaway Columns board: tab A adds a column, renames it, and moves a post
into it → tab B shows the column, the new name and the post within ~5 s, no reload;
tab A deletes the column → it disappears in tab B. Then the PATCH-372 Columns run: tab B
shows the AI's new columns with their posts live. tsc clean; per-test gate unchanged.

## Required Tests
INSERT adds once (own echo with a numeric id vs a string id is not duplicated), sorted by
position; UPDATE replaces + re-sorts; DELETE removes by id and ignores unknown ids; the
handlers are registered on the existing channel with the board filter for INSERT/UPDATE.

## Estimated Difficulty
easy
