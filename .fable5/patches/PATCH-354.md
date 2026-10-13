# PATCH-354 — AI on notes (2/3): Group by theme

## Why
Part 2 of the Klaxoon-inspired "AI on notes" plan (owner approved, PM's call).
After a brainstorm, the AI sorts the ticked notes into named themes; the user
reviews (and may rename themes); **Arrange on board** moves the notes into one
labelled column per theme. Everything can be undone.

## Facts (PM, verified in code)
- PATCH-353 (`49f5660b`) built the dialog (`components/collabboard/NotesAiDialog.tsx`,
  tabs Summary | Action plan), the hook (`useNotesAi.ts`, `buildNotesAiNotes`,
  open/pre-tick rule, limits), the domain (`lib/domain/ai/notesAi.ts`), the
  route (`app/api/boards/[id]/ai/notes-actions/route.ts`, feature `notes_ai`,
  1 credit) and the shared pipeline (`lib/server/ai/boardNotesAiRun.ts`).
- The board has NO general undo (only "undo paste"). Undo here = a toast action.
- Moving a post: optimistic `setPadlets` + `createUpdatePostPositionCommand(
  createPostsRepository())({ postId, positionX, positionY }, { userId: null })`,
  rolled back on `!result.ok` (drag-end path, `CanvasClient.tsx` ~10397;
  `lib/domain/canvas/posts.ts:468`). Clamp with
  `clampRectPositionToFreeformBounds` (`components/collabboard/canvas/engine/freeformStageGeometry.ts`).
- Section heading post: `type: 'section_heading'`, `title` = text,
  `metadata: { headingLevel, zIndex }`, defaults in
  `components/collabboard/canvas/engine/sectionHeading.ts` (width 500, height
  derived from the level); built in `handleCreateSectionHeading`
  (`CanvasClient.tsx` ~4540). On Freeform a heading does not own posts.
- A post inside a column has `metadata.parentId`; its position belongs to the
  column, so it cannot be arranged freely.
- A note's STORED width/height is ignored unless `metadata.manualSize === true`
  (`isManuallySizedPost`, `lib/domain/canvas/postResizePolicy.ts`); a plain note
  renders at the default size with auto height. Layout must use RENDERED sizes:
  `lib/collabboard/freeformOccupancy.ts` reads DOM rects in world units (but
  `readFreeformOccupiedRects` skips posts outside the viewport).
- Camera: `boardRevealRequest` (`CanvasClient.tsx` ~2272, set like
  `revealKnowledgeBacklinkTargetOnBoard` ~9406) pans Freeform to a post.

## Design

### 1. Domain — `lib/domain/ai/notesAi.ts`
- `NotesAiAction` gains `'themes'`. Prompt: sort the notes into 2–8 themes,
  each with a short title (≤ 40 chars, in the notes' language); EVERY note in
  exactly one theme; notes that fit nowhere go to a theme titled "Other" (in
  the notes' language). JSON: `{"themes": [{"title": "...", "noteRefs": ["N1"]}]}`.
- Parser: zod; unknown refs dropped; a ref already used keeps its FIRST theme;
  refs the model left out go to an "Other" theme (created if missing); empty
  themes dropped; > 8 themes → the smallest are merged into "Other"; fewer
  than 1 non-empty theme → `null`.
- Route: accept `action: 'themes'` (same limits, credit, feature).

### 2. Layout (pure) — new `lib/domain/canvas/themeArrangement.ts`
`arrangeThemes({ themes: [{ title, noteIds }], sizes: Map<id, {width,height}>,
origin: {x,y}, headingHeight })` → `{ headings: [{ themeIndex, x, y, width }],
notes: [{ id, x, y }], bounds }`:
- One column per theme, left to right in theme order; column width =
  max(widest note in the theme, 220); gap between columns 48.
- Heading at the column top (width = column width); notes stacked below it,
  gap 16, in the order the notes had on the board (reading order).
- `slideClear(bounds, obstacles)`: if `bounds` overlaps any obstacle rect,
  move the whole arrangement right to that obstacle's right edge + 48 and
  repeat (max 50 steps) → the final dx. Pure, tested.

### 3. Client
- `freeformOccupancy.ts`: add `readFreeformPostRects(container, toWorld, ids?)`
  → `Map<id, WorldRect>` for posts whether or not they are in the viewport
  (no viewport filter).
- `useNotesAi.ts`: themes tab state; `onArrange(themes)`:
  1. Candidates for the themes tab = free notes only (no `metadata.parentId`);
     the dialog says "N notes inside columns are left out" when N > 0.
  2. Sizes = rendered rects (injected `readPostRects(ids)`), falling back to
     stored width/height. Origin = top-left of the ticked notes' rendered
     bounding box. Obstacles = rendered rects of all OTHER posts. Apply
     `slideClear`.
  3. Create one `section_heading` per theme (level 3, `title` = theme title,
     `metadata: { headingLevel: 3, zIndex }`) via the injected `onAddPost`.
  4. Move every note (optimistic + `createUpdatePostPositionCommand`, clamped,
     rounded) through an injected `onMovePosts(moves)`; record each note's old
     position first.
  5. If any step fails: automatically undo what was done (step 6) and show
     "Couldn't arrange the notes — nothing was changed." Never leave a half
     arrangement.
  6. Success: toast "Arranged N notes into M themes" with an **Undo** action
     (sonner `action`, 20 s): moves every note back to its recorded position and
     deletes the created headings (`onDeletePost`). After undo: "Arrangement
     undone".
  7. Reveal the first heading (`onReveal(id)` → `boardRevealRequest`).
- `NotesAiDialog.tsx`: third tab **Group by theme**; preview = each theme as a
  block with an editable title input (≤ 40 chars) and its notes' first lines
  (muted, max 5 shown + "+N more"); button **Arrange on board** (replaces
  "Add to board" on this tab). Hooks: `data-notes-ai-tab="themes"`,
  `data-notes-ai-theme`, `data-notes-ai-theme-title`, `data-notes-ai-arrange`.
  Keep the file ≤ 400 lines; move the preview into `NotesAiPreview.tsx` if it
  grows past that.
- Wiring in `CanvasClient.tsx` (≤ 15 lines): pass `readPostRects`,
  `onMovePosts`, `onDeletePost`, `onReveal` to `useNotesAi`. Keep the
  position-update logic in the hook or a small new module, not in CanvasClient.

## Tests
- Domain: themes prompt rules; parser (valid, duplicate ref first wins,
  missing refs → "Other", > 8 themes merged, empty → null, unknown refs).
- `themeArrangement`: columns left to right, widths, stacking order, gaps;
  `slideClear` with 0, 1 and chained obstacles.
- Route: `themes` accepted, parsed result returned.
- Hook/dialog: themes tab shows only free notes + the "left out" message;
  rename a theme → the heading gets the new title; Arrange creates M headings
  and N moves with the computed positions; failure → automatic undo + message;
  Undo restores every old position and deletes the headings.

## Verification (PM)
tsc, focused tests, full gate. Live, real model, THROWAWAY Freeform board with
12 seeded notes from 3 obvious topics + 1 unrelated post placed where the
arrangement would land: Group by theme → 3–4 sensible themes → rename one →
Arrange → headings + notes in columns, the unrelated post NOT covered (DOM
rects), the camera shows the result; Undo → every note back at its old
position (DB), headings gone.

## Allowed files
`lib/domain/ai/notesAi.ts` (+ test), new `lib/domain/canvas/themeArrangement.ts`
(+ test), `app/api/boards/[id]/ai/notes-actions/route.ts`,
`lib/server/ai/notesActionsRoute.test.ts`, `lib/collabboard/freeformOccupancy.ts`
(+ its test if one exists), `components/collabboard/useNotesAi.ts`,
`components/collabboard/NotesAiDialog.tsx`, new
`components/collabboard/NotesAiPreview.tsx`,
`components/collabboard/NotesAiDialog.test.tsx`, a new small module for the
moves if needed (`components/collabboard/notesAiArrange.ts` + test),
`app/dashboard/canvas/[id]/CanvasClient.tsx` (wiring). No SQL, no git.

## Addendum 1 — PM review + live check (real model, 2026-10-13)
Live: themes were exactly right (Food & Catering 4, Venue 3, Entertainment &
Music 3, Budget 2), rename worked, the unrelated to-do was NOT covered, the
camera showed the result, Undo restored 12/12 notes and removed all headings.
Three fixes:

1. **Notes drop far below their headings when the arrangement slides right.**
   `useNotesAi.ts` `onArrange`: `y: note.y + dx` — the horizontal slide `dx`
   is added to Y as well (live: headings at y=200, notes ~548 lower). Use
   `y: note.y`. Add a hook-level test with an obstacle (dx > 0) asserting each
   note's y is the arrangement's y and the first note sits directly under its
   heading (heading.y + headingHeight + 16).
2. **Rollback/Undo failures are swallowed** (P3 / "no silent catch"):
   `onMovePosts(oldMoves)` results are ignored and heading deletes are
   `catch { /* best effort */ }`, then "Arrangement undone" is shown anyway.
   Track both: if restoring positions returns false or any heading delete
   throws, `console.error` the failure and show
   `toast.error("Couldn't fully undo the arrangement — some notes or headings may need moving back by hand.")`
   instead of the success message (same for the automatic rollback after a
   failed arrange: then the error says "Couldn't arrange the notes, and the
   rollback was incomplete — …"). Tests for both.
3. **Long theme titles are cut off** ("Entertainment & Mu…"): column width =
   max(widest note, 220, an estimate of the title's width at heading level 3:
   `title.length * 11 + 32`), capped at 420. Test it in `themeArrangement`.

Allowed files: `components/collabboard/useNotesAi.ts`,
`lib/domain/canvas/themeArrangement.ts` (+ test),
`components/collabboard/NotesAiDialog.test.tsx` (or a new
`components/collabboard/useNotesAi.test.tsx` for the hook tests). No git.
