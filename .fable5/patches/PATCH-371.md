# PATCH-371 — Board AI on Wall, Columns, Grid, Timeline and Map

**Status:** approved

## Goal
Board AI works on the Padlet-style layouts like it does on Kanban: a Board AI button in
the left toolbar opens the existing drawer, the model receives a structured overview of
the board's panels and posts, and its citations jump to the cited post. (Step 1 of 2:
PATCH-372 lets the AI propose posts into panels with Apply/Discard.)

## Reason
Owner (2026-10-15): "add AI like you did in Kanban — AI fills panels — to the Padlet
canvases". Today the Board AI button is Freeform-only (`showBoardAssistantButtons =
!!canvas && isFreeformLayout`, PATCH-300, owner decision 2026-10-06: floating buttons
covered other layouts' top-right controls). The drawer itself is already mounted in
the main return, so only the entry point and a layout-aware context are missing.
Kanban solved the same problem with a rail button (PATCH-323) and a whole-board
overview block `kanban-board` with sub-tokens `S<block>.<n>` (PATCH-322) — copy that.

## Design
### 1. Entry point
- Add a **Board AI** tool to the left canvas toolbar (`canvasToolbarRegistry.tsx`) for
  layouts `wall`, `columns`, `grid`, `timeline`, `map` only, shown when
  `enableBoardAiChat` and the user is not a guest (guests have no AI — PATCH-358).
  `data-toolbar-tool="board-ai"`. It toggles the existing `BoardAiChatDrawer`.
  Freeform keeps its floating button unchanged; Kanban keeps its rail button; no
  floating button is added to these layouts.
- When opened on these layouts, the drawer auto-attaches `{ type: 'padlet-board' }`
  (the analogue of `KANBAN_BOARD_AI_AUTO_CONTEXT`).

### 2. Context type `padlet-board`
- `lib/domain/ai/boardAiChatContext.ts`: add `'padlet-board'` to
  `BOARD_AI_CONTEXT_TYPES` and `PadletBoardContextRequest`; request parsing like
  `kanban-board`. Current-turn only (filtered from history like `kanban-board`).
- New `lib/server/ai/boardAiPadletBoardContext.ts` (+ test), modelled on
  `boardAiKanbanContext.ts`: reads, with the CALLER'S client (RLS decides; no admin
  client), the board row (`layout`, `title`), `board_sections`, and the board's
  `padlets`; builds ONE overview block for layouts `wall | columns | grid | timeline |
  map` (any other layout → `null`, dropped, like `kanban-board` on a non-Kanban board):
  - **Panels** in the layout's own order:
    - Columns / Grid: each section by `position` (its title), with the ROOT posts whose
      `metadata.sectionId == section.id` in `metadata.sectionPosition` order; a
      container lists its `childPadletIds` posts nested under it.
    - Wall: each root container (by `metadata.wallPosition`) is a panel; its children are
      its posts.
    - Timeline: each root container by `metadata.position_in_timeline` is a panel (include
      its date field if one exists in metadata — find the key, report it); children nested.
    - Map: one panel per post with a location (`location_label`, else lat/lng rounded to
      2 decimals) — plus "Unplaced" for posts without a location.
  - Each post line: a sub-token `S<blockIndex>.<n>` (same scheme and resolver as
    Kanban), its type, its title and its plain text (strip HTML, bounded per post), and
    the panel it is in. Never include user ids, emails or `createdBy`; no author names.
  - Budget: reuse `BOARD_AI_CONTEXT_MAX_SINGLE_CHARS` and a post cap (e.g. 300 posts);
    when truncated say "(N more posts not shown)".
  - Citable passages: one per post (post id + label "Column ‘Ideas’ · ‘Post title’"),
    so the existing citation layer resolves `S2.5` → that post.
- `boardAiChatContext.ts` server dispatcher: route `padlet-board` like `kanban-board`
  (with `blockIndex`).

### 3. Citations open the post
On these layouts a cited post scrolls into view and highlights: reuse PATCH-370's
`[data-post-card-id]` scroll + 2 s ring (extract that into a small shared helper in
CanvasClient if it is inline). Freeform citations are unchanged.

### 4. Prompt
The Kanban turn adds a short system note describing the overview. Add the equivalent for
`padlet-board`: "The board overview lists its panels (columns, sections, cards,
timeline items or map places) in order, each post with a token; cite posts by token."
No change to models, credits or features (same `board_ai_chat` charge as today).

## Files
Create: `lib/server/ai/boardAiPadletBoardContext.ts` (+ test). Modify:
`lib/domain/ai/boardAiChatContext.ts` (+ test), `lib/server/ai/boardAiChatContext.ts`
(+ test), the prompt builder that adds the Kanban note (find it, report), the request
parsing/route test that covers `kanban-board`, `canvasToolbarRegistry.tsx` (+ test),
`CanvasClient.tsx` (minimal: auto-context for these layouts, the toolbar handler, the
citation scroll), `vitest.config.ts` only if needed. Ask before touching anything else.
No SQL, no git, no production build.

## Commit
  Commit message:
  feat(ai): Board AI on Wall, Columns, Grid, Timeline and Map

## Acceptance Criteria (PM, live — real model call with the owner's key, as for 322)
On a throwaway Columns board with 3 sections and ~8 posts, and a Wall board with 2
cards: the toolbar shows Board AI (not for a guest); asking "What is in each column?"
answers per column with citations; clicking a citation scrolls to and highlights the
post; the overview contains no ids/emails (unit-tested). Freeform and Kanban Board AI
unchanged. tsc clean; per-test gate unchanged.

## Required Tests
Overview builder per layout (order, nesting, sub-tokens, truncation note, no ids/emails,
non-padlet layout → null), request parsing + history filtering of `padlet-board`,
dispatcher routing, toolbar tool visibility (layouts, guest hidden), citation scroll
helper.

## Estimated Difficulty
medium-hard
