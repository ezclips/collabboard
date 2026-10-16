# PATCH-381 — Padlet layouts: click the background to save, then "Where should this go?"

**Status:** done

## Goal
On Wall, Columns, Grid and Timeline, making a post is one clear path for owner, editors and
guests alike:
1. Make the post (Note, Image, Link, …).
2. **A click anywhere on the background saves it** — there is no Save button, so this click
   must never lose work.
3. **"Where should this go?"** always appears with **New Container** and **Add to Existing**.
   With no container on the board yet, "Add to Existing" stays VISIBLE but grayed out, and
   hovering (or tapping) it says "You need at least one container on the canvas first."
4. After that the post sits in a container. Plus two on-screen hints that are never saved as
   posts.

## Reason
Owner (2026-10-16). PM live run of PATCH-380: on Columns an Image upload went into the
"Add to Existing" drag, a click on the column's "+" made an EMPTY "New Container", and the
uploaded image was silently lost. People should never have to guess where a post goes, and
the first post on an empty board should not offer a choice that cannot work.

## Facts to establish FIRST (report before changing anything)
- **Container kinds.** Owner: Freeform has TWO container kinds, the Padlet layouts ONE. On the
  Padlet layouts a post taken OUT of its container is DELETED; on Freeform it goes back onto
  the canvas. Find both Freeform kinds and the Padlet kind in code (types/metadata, where the
  take-out behaviour lives) and report them with file:line. **Do not change take-out
  behaviour** in this patch; Freeform, Kanban and Map are out of scope.
- **Today's flow per layout** (Wall, Columns, Grid, Timeline): where a new post is edited,
  what currently saves it, and which prompt follows (`ColumnContainerCreationPrompt`,
  `WallPlacementPrompt`, `PlacementPrompt`, the "Click a container to place your post" drag
  in `CanvasClient`). Report it as a short table.

## Design
### 1. Click the background = save (all four layouts)
- While a new post is being edited, a pointer-down anywhere outside the post's editor saves
  it: a non-empty post is kept and placement starts (step 2); an EMPTY post (no title, no
  text, no media) is discarded silently. Clicks on the toolbar, on a modal, or inside the
  editor do NOT count as background.
- Escape = cancel. If the post has content, ask "Discard this post?" (Discard / Keep editing).
- An in-flight upload (image) is awaited before placement starts; if it fails, the editor
  stays open with the error text (no silent loss).
### 2. "Where should this go?" (one shared rule, every placement prompt)
- Pure helper `placementOptions({ containerCount, canCreateContainer })` in
  `lib/domain/canvas/` (+test) →
  `{ newContainer: 'enabled'|'hidden', addToExisting: 'enabled'|'disabled', hint?: string }`.
  `containerCount` = the containers in the current layout's scope (Columns: the board, or
  the target column if the prompt is column-scoped — report which).
- Disabled "Add to Existing": `aria-disabled`, gray, not clickable, with the hint as a
  tooltip on hover/focus AND as small text under the button on touch (`data-placement-hint`).
- New Container → creates the container in the place the post was made (Columns: that
  column; Wall/Grid/Timeline: the layout's normal next spot) and puts the post in it.
- Add to Existing → the existing "Click a container to place your post" step. A click that
  is NOT on a container returns to the prompt (never creates a container, never drops the
  post). Closing the prompt with × asks "Discard this post?" first.
- **Guests get New Container back** (reverses PATCH-380's hide): on the Padlet layouts a
  container is an ordinary post the guest owns (`padlets` row, rate limit 30/10 min, approval
  applies), not a column. Remove `canCreateContainer={!isGuestUser}` from these prompts;
  keep the props for the column/section tools that DO write `board_sections` (still
  forbidden for guests).
### 3. Hints that are never posts
- Empty column/area hint (UI only, `data-empty-hint`): "Click + or drag a post here".
- One-time tip bar (`data-first-tip`) on a viewer's first visit to a Padlet-layout board:
  "Click a post to edit it. Click the background to save." Close button; remembered per
  viewer in localStorage (try/catch; shows again if storage is unavailable — acceptable).
  Guests see it too.

## Files
Create: `lib/domain/canvas/placementOptions.ts` (+test). Modify: the three placement prompts
(+tests), `CanvasClient.tsx` (save-on-background, prompt wiring, guest prop removal), the
layout/editor files the fact-finding names (list them), a small `FirstTipBar` component
(+test). Tests of the files you change may be edited without asking; ask before touching
anything else. No SQL, no git, no build.

## Commit
  feat(canvas): click the background to save a post; clear "Where should this go?" step

## Acceptance Criteria (PM, live)
Throwaway Wall, Columns, Grid and Timeline boards, owner AND an anonymous guest:
1. Empty board: make a Note, click the background → saved; prompt shows New Container
   enabled, Add to Existing grayed with the hint on hover. New Container → the note is in a
   new container.
2. Second post: both options enabled; Add to Existing → click the container → the post is
   in it. A click on the column background during that step returns to the prompt, no empty
   container is created.
3. Image upload (guest with uploads on): background click waits for the upload; the image
   ends up in a container; cancelling asks "Discard this post?".
4. Empty post + background click → nothing created.
5. Guest can choose New Container; a guest still cannot add/rename/delete a column.
6. Tip bar shows once, closes, stays closed after reload. Freeform/Kanban/Map unchanged.
tsc clean; per-test gate unchanged.

## Required Tests
`placementOptions` (0/1+ containers, guest/owner); prompts render disabled + hint; background
click saves non-empty / discards empty / ignores toolbar+modal clicks; Escape confirm;
non-container click in "Add to Existing" returns to the prompt; tip bar once.

## Estimated Difficulty
hard

## Result (PM, 2026-10-16)
Fact-finding: the lost image was the column "+" button's click firing during "Add to Existing";
fixed by suppressing the click that follows a placement mouseup. PM decisions: Drawing and the
"+ Container" tool prompt out of scope; New Container keeps today's target column
(`activeSectionId || sections[0]`); all Timeline modes use the prompt; a new Timeline board
starts with one blank entry (PATCH-297), so Add to Existing is enabled there. The tip bar hides
the Columns onboarding hint while shown. Live `live-381.mjs` 22/22 (owner + guest; Columns,
Wall, Timeline, Freeform). tsc clean; gate 61 = 61 by name.
Remaining: Escape-discard confirm only in the Image editor (other editors have no Escape
handler); the empty hint only on Columns.
