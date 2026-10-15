# PATCH-377 — Switch between Wall/Timeline and Columns/Grid by converting the posts

**Status:** done

## Goal
In Canvas settings, any of Wall, Columns, Grid, Timeline can be chosen. A cross-family
switch CONVERTS the board so every post stays visible, the padlet.com way:
- Columns/Grid → Wall/Timeline: each section becomes a card (container) with the same
  title, holding that section's posts in the same order.
- Wall/Timeline → Columns/Grid: each card becomes a section with the same title, holding
  that card's posts in the same order.
Same-family switches stay as they are (only `boards.layout`).

## Reason
PATCH-376 live probe: a cross-family switch left the board looking empty (data intact), so
376 disabled those tiles as a stop-gap. The owner wants padlet.com-like boards; padlet.com
switches formats freely and keeps the posts.

## Facts (from PATCH-370/372/376 live work)
- Columns/Grid: `board_sections` rows (`id` BIGINT, `title`, `description`, `position`);
  posts carry `metadata.sectionId` (STRING of the id) + `metadata.sectionPosition`.
- Wall: root containers `type='container'`, `metadata.kind='container'`,
  `metadata.isContainer=true`, `metadata.childPadletIds` (ordered uuid strings),
  `metadata.wallPosition`; children carry `metadata.parentId`.
- Timeline: the same containers with `metadata.position_in_timeline` (+ optional
  `metadata.timelineLabel`, free text).
- `padlets.board_id` (some old rows: `canvas_id`) — use `coalesce(board_id, canvas_id)`.

## Design
### 1. Migration — `supabase/migrations/20261015150000_convert_board_layout.sql`
`public.convert_board_layout(b uuid, target text) RETURNS jsonb` — plpgsql, SECURITY
INVOKER (RLS and the PATCH-366 freeze policies apply to every write it makes), ONE
transaction (the function body), so a failure leaves the board untouched.
- Refuse unless `target` in (wall, columns, grid, timeline); refuse when the board is
  frozen (`NOT board_open_for_write(b)`) or the caller cannot edit the board (the UPDATE of
  `boards.layout` must hit 1 row — FOUND guard as in PATCH-374).
- Same family → only `boards.layout`.
- sections → cards: for each section by `position`: INSERT a container padlet
  (title = section title; `timelineLabel` = section description when target is timeline;
  order key `wallPosition` or `position_in_timeline` = index; `childPadletIds` = the
  section's posts ordered by `sectionPosition`, then created_at); UPDATE each post: set
  `parentId`, remove `sectionId`/`sectionPosition`. Posts whose `sectionId` matches no
  section go into a final card "Unsorted" (only if there are any). Then DELETE the board's
  sections. Then `boards.layout = target`.
- cards → sections: for each root container (no `parentId`) by its order key
  (`wallPosition` / `position_in_timeline`, then created_at): INSERT a section (title =
  card title or "Untitled"; `description` = `timelineLabel` when coming from timeline;
  `position` = index); children in `childPadletIds` order → set `sectionId` (text of the new
  id) + `sectionPosition`, remove `parentId`. Root NON-container posts go into a final
  section "Unsorted". Then DELETE the converted containers. Then `boards.layout`.
- Returns `{ "converted": bool, "panels": n, "posts": n }`.
- Grants: authenticated only. Self-check at the end. Do NOT run it; the owner applies it.

### 2. Domain — `lib/domain/canvas/layoutSwitchFamilies.ts` (extend) + test
`layoutSwitchPlan(from, to, counts)` → `{ kind: 'same-family' | 'convert', summary }` with the
plain sentence for the confirm step, e.g. "Your 3 columns become 3 cards. All 12 posts move
with them." / "Your 4 cards become 4 columns. All 9 posts move with them." Drop
`CROSS_FAMILY_NOTE` (no longer used).

### 3. UI — `CanvasLayoutTiles.tsx` + `CanvasSettingsModal.tsx`
All four tiles selectable. Choosing the other family shows the summary sentence under the row
plus "Comments on the cards themselves are not carried over." ONLY when a source card has
comments (count them from the loaded posts); `data-settings-layout-convert-summary`. Save
with a cross-family choice calls the RPC (not a plain `boards.layout` update), then reloads
the board data; an error shows a toast with the message and leaves the window open.

## Files
Create: the migration. Modify: `layoutSwitchFamilies.ts` (+test), `CanvasLayoutTiles.tsx`
(+test), `CanvasSettingsModal.tsx` (+test), and the place that passes counts/posts into the
modal (CanvasClient wiring only, if needed). Ask before touching anything else. Tests of the
components you change may be edited without asking. No SQL execution, no git, no build.

## Commit
  feat(canvas): switch Wall/Timeline <-> Columns/Grid by converting the posts

## Acceptance Criteria (PM, live, after the owner applies the SQL)
Throwaway boards: Columns (2 sections, 3 posts + 1 orphan) → Wall: 3 cards (2 + Unsorted),
every post visible in its card in order, no sections left; → Columns: 3 sections, every post
in its section in order, no containers left; Timeline (2 cards with labels) → Grid → Timeline
keeps the posts (labels round-trip via description). A frozen board refuses the conversion
for an editor. A second open tab follows the conversion without reload (PATCH-373/366
realtime). tsc clean; per-test gate unchanged.

## Required Tests
Plan sentences (singular/plural, both directions, same family), tiles all enabled, summary +
comments line shown only when relevant, Save calls the RPC for cross-family and the plain
update for same-family, error keeps the window open.

## Estimated Difficulty
hard
