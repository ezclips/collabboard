# PATCH-340 — "Send to Kanban": turn Freeform notes into Kanban cards, with a live status chip

## Why
Owner, 2026-10-11, after reviewing Wrike Whiteboard ("Convert stickies to
work items", status shown back on the sticky): yes to step 1 — select notes
on a Freeform board, send them to a Kanban board as cards, and keep a live
link back. Today a brainstorm (Freeform) and the plan (Kanban) do not know
about each other. Step 2 (AI-suggested structure) and step 3 (card → "Open
brainstorm") are NOT in this patch.

## What exists (read before coding)
- Freeform note posts have `NotePostContextMenu`
  (components/collabboard/menus/NotePostContextMenu.tsx); "Group into Column"
  (`GroupIntoColumnMenuItem`) is the pattern for a destination submenu row.
  Freeform multi-selection: `selectedPadletIds` in CanvasClient.
- `kanban_cards` (canvas_id, column_id, swimlane_id, title, content,
  order_index numeric, status, creator_id, …). RLS: SELECT for any
  `kanban_board_members` row of that board; INSERT/UPDATE for members with
  `permission_level in ('edit','admin')`. `kanban_columns` same read rule.
  `lib/kanban/supabaseAdapter.ts` has the card save/mapping; read it so the
  inserted row matches what the Kanban store writes for a new card
  (order_index at the end of the column, status, defaults).
- Board page `/dashboard/canvas/[id]?openPadlet=<id>` opens a post.

## Design
### 1. The action (Freeform, editors only)
- Note context menu gains **"Send to Kanban"**. If the right-clicked note is
  part of a multi-selection, it acts on every selected **note** (other post
  types in the selection are skipped and counted: "2 notes sent, 1 item
  skipped (not a note)"); otherwise on that one note.
- A note that is already linked shows **"Open card"** instead (opens the link,
  see 3) — no second card from the same note. In a multi-selection, linked
  notes are skipped and counted.
- Opens a small dialog "Send to Kanban":
  - **Board**: the user's Kanban boards they can edit (member with edit/admin),
    most recently updated first, searchable if more than 8. If none: a short
    message "You have no Kanban board you can edit yet." + "Create a Kanban
    board" link to /dashboard/create-canvas.
  - **Column**: that board's columns in board order; default the first.
    (Swimlane: the board's first swimlane, or none.)
  - Shows "N cards will be created" and the button **Create N cards**.
- Card fields: **title** = note title if set, else the note's first line of
  plain text (HTML stripped), max 200 chars, "Untitled note" if empty;
  **content** = the note's plain text (HTML stripped, ≤ 10 000 chars);
  appended at the end of the column in the notes' on-canvas reading order
  (top-to-bottom, then left-to-right). `creator_id` = the user.
- Writes go through the user's own Supabase client (RLS decides; no service
  role). Insert the cards first (one batch); only for cards that were
  created, write the link into each note's metadata:
  `kanbanLink: { boardId, cardId }` (immediate save, PATCH-337 path, not the
  debounced one). Partial failure is reported honestly ("2 of 3 cards
  created"); a note is linked only to a card that exists.
- Success toast: "3 cards added to <board title>" with an **Open board** action.

### 2. Live status chip on the note
- A linked note shows a small chip at its bottom-left: Kanban icon + the
  card's **current column title** (e.g. "In progress"); title attribute
  "Open the card in <board title>". Reads the linked cards in ONE query per
  board load (`kanban_cards` by ids, with column titles), refreshed when the
  window regains focus and every 60 s while the tab is visible. No realtime
  subscription in this patch.
- Card gone or not readable (RLS returns nothing either way): chip
  "Card not available" (grey) and the context menu offers **"Unlink card"**
  (removes `kanbanLink`) so the note can be sent again.
- The chip and the menu items are visible to viewers too, but the dialog,
  "Unlink card" and sending are editors only.

### 3. Opening the card
Chip click / "Open card" → `/dashboard/canvas/<boardId>?openCard=<cardId>`.
Add `openCard` to the board page's search params and pass it through to the
Kanban board, which opens that card's editor once the cards are loaded
(ignore an unknown id silently). Same tab.

## Privacy / safety
Only the user's own client and RLS. Note text goes only into the card the
user asked for. No AI call. Nothing on the target board is changed except the
new cards.

## Tests
- Pure helpers (new `lib/domain/canvas/noteToKanbanCard.ts` or similar):
  title/content from note (title set, first line, HTML stripped, empty →
  "Untitled note", length caps); reading order sort; skip/count rules.
- Dialog: lists only editable Kanban boards; column default; "Create N
  cards" count; empty state.
- Send: inserts cards then links only created ones; partial failure message;
  linked notes skipped; non-notes skipped.
- Chip: column title shown; missing card → "Card not available" + Unlink.
- `openCard` opens the card editor on the Kanban board; unknown id ignored.

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I verify live with
throwaway boards only (a Freeform with 3 notes, a Kanban I create): send 2
selected notes → 2 cards at the end of the chosen column, chips show the
column; move a card on the Kanban → chip updates on focus; chip opens the
card; delete a card → "Card not available" → Unlink. Both boards deleted
afterwards.

## Allowed files
components/collabboard/menus/NotePostContextMenu.tsx, new
components/collabboard/SendToKanbanDialog.tsx, new
lib/domain/canvas/noteToKanbanCard.ts (+ test), new
lib/kanban/sendNotesToKanban.ts (or inside supabaseAdapter.ts),
app/dashboard/canvas/[id]/CanvasClient.tsx (wiring, selection, chip data),
the Freeform note card component that renders the chip
(components/collabboard/canvas/ui/FreeformPadletCards.tsx or the note
renderer it uses), app/dashboard/canvas/[id]/page.tsx (openCard),
components/collabboard/canvas/ui/KanbanShell.tsx and
components/kanban-canvas/store.tsx / Board (only to open a card by id), and
tests. No SQL (metadata + existing tables only), no git.

## Addendum 1 — live finding: Freeform has no multi-select gesture
Live: Shift-click (and Ctrl-click) do not add a post to the selection on
Freeform; `selectedPadletIds` is only set by "Select all" and paste. So "select
several notes, right-click, Send to Kanban" is not something a user can do.
PM decision — do NOT change Freeform selection; put the choice in the dialog:
- The dialog lists the board's **unlinked note posts** (reading order) with a
  checkbox each (`data-send-kanban-note="<id>"`), label = the card title the
  note would produce (`noteToKanbanCard`), ≤ 60 chars. The right-clicked note
  is pre-ticked; if the right-click came with a multi-selection ("Select all"),
  all selected notes are pre-ticked. A "Select all / none" toggle on top
  (`data-send-kanban-select-all`). The list scrolls (max-height ~240 px).
- Already-linked notes are not listed (a line "N notes already on a board" if
  any). Non-note posts never appear.
- "Create N cards" counts the ticked notes; disabled at 0.
- The dialog therefore receives the candidate notes (not just a count) and
  returns the chosen note ids with the board/column.
Tests: pre-tick rules (right-clicked note; whole selection), select all/none,
count follows ticks, confirm returns exactly the ticked ids.

## Addendum 2 — live findings (two bugs)
1. **The dialog lists only the selection, not the board's unlinked notes.**
   `openSendToKanban` passes `partitionSendableNotes(selection)` as the
   candidates. Candidates must be ALL unlinked note posts on this board
   (`partitionSendableNotes(padlets)`), with `preselectedIds` = the clicked
   note, or the whole multi-selection's notes. The "N notes already on a
   board" line counts the board's linked notes. Test: board with 3 unlinked
   notes, right-click one → 3 listed, 1 ticked.
2. **The chip does not open the card on the first click.** Live, on a note
   that is not selected: one real click on `[data-kanban-link-chip]` (the hit
   test at its centre IS the chip's span) → no navigation after 45 s. In an
   earlier run a second click did navigate. So the note's own
   pointer/mouse handling (select / start drag on mousedown — possibly a
   native window/document listener in `useCanvasInteractions` that React's
   `stopPropagation` cannot stop, or the post re-rendering/pointer-events
   change between mousedown and click) swallows the first click. Find the
   real cause and fix it so ONE click opens the card on an unselected and on a
   selected note, without starting a drag or changing the selection. Likely
   fix: mark the chip as an interactive child the canvas ignores (the same way
   the canvas already ignores other in-post buttons — find that mechanism,
   e.g. a `data-*` attribute or a `closest('button, …')` guard) and/or open on
   `pointerup`. Test: a behaviour test where a mousedown/pointerdown + click
   on the chip of an unselected note calls `onOpenKanbanCard` exactly once and
   does not select the post.

## Addendum 3 — card description repeats the title
Live: a note without a title, "Book the venue / Call three places", becomes
title "Book the venue" and content "Book the venue\nCall three places". When the
title is taken from the first line, the content is the REST of the text
(trimmed; empty if nothing is left). When the note has its own title, content
stays the full text. Test both in noteToKanbanCard.test.ts.
