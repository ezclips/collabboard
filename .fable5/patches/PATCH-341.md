# PATCH-341 — Kanban card → "From brainstorm": open the note a card came from

## Why
Owner, 2026-10-11: after PATCH-340 ("Send to Kanban"), finish step 3 — the way
back from a card to the brainstorm it came from (Wrike: "attach a whiteboard to
a task"; links back to the board).

## Design (no schema change; one optional index at the end of the night's report)
The link lives only on the note (`metadata.kanbanLink = { boardId, cardId }`,
PATCH-340). The Kanban board finds its linked notes by a reverse lookup with the
user's own client, so RLS decides: a note on a board the user cannot read is
simply not found, and no badge is shown.

1. **One query per Kanban board load** (and on window focus, at most once per
   60 s): `padlets` where `metadata->kanbanLink->>boardId = <this kanban board
   id>`, selecting `id, board_id, title, content, metadata->kanbanLink` and the
   source board's title (`boards(title)` join if the FK exists, else a second
   `boards` query by the distinct ids). Map `cardId → [{ noteId, boardId,
   boardTitle, noteLabel }]` (a card made by AI from several notes has several).
   `noteLabel` = note title or first line of plain text, ≤ 60 chars.
   Put this in a small, tested module (e.g. `lib/kanban/brainstormLinks.ts`)
   with the query behind a parameter so it can be unit-tested.
2. **Card badge**: a card with links shows a small lightbulb/brainstorm icon
   next to its other badges, title "From a brainstorm on <board title>"
   (`data-kanban-brainstorm-badge`).
3. **Card editor**: a line "From brainstorm: <board title>" with one link per
   source note ("Open note: <noteLabel>") →
   `/dashboard/canvas/<boardId>?openPadlet=<noteId>` (same tab)
   (`data-kanban-brainstorm-link`). Up to 5 links, then "+N more".
4. If the note is later unlinked (PATCH-340 "Unlink card") or deleted, the
   badge disappears on the next load — the note is the single source of truth.
5. Viewers see the badge and links (read-only); nothing here writes.

## Tests
- Module: groups by cardId, several notes per card, label from title / first
  line / HTML stripped / length cap, empty result → empty map, query error →
  empty map (no throw, logged without content).
- Card: badge only when linked. Editor: links point to the right URL; "+N more".

## Verification
Focused tests, full gate, tsc. Live (throwaway boards only): send 2 notes from
a Freeform to a Kanban (PATCH-340), open the Kanban: 2 cards show the badge,
the editor link opens the Freeform board with that note opened.

## Allowed files
new lib/kanban/brainstormLinks.ts (+ test), components/kanban-canvas/store.tsx
(load + expose the map), components/kanban-canvas/Card.tsx (badge),
components/kanban-canvas/Editor.tsx (links), components/kanban-canvas/
useKanbanI18n.ts (strings), types/kanban-canvas.ts (if a type is needed), and
tests. No SQL, no git.

## Addendum 1 — PATCH-340's ?openCard sometimes drops a column's cards (fix here)
Live, same Kanban board, 8 plain loads vs 8 `?openCard=` loads (each after
visiting /dashboard): plain 8/8 correct; openCard 2/8 showed a column with 0
cards although the card exists (once the editor did not open either). Cause:
`KanbanOpenCard` (KanbanShell.tsx) calls `refetchFromServer` (=
`refetchAndReset` → full `loadKanbanData` → `actions.reset`) when the target
is not in `data.cards` yet — which is normal during the lazy per-column
initial load — so a full reset races the in-flight `loadCardsForColumn` /
`setColumnCards` calls and one overwrites the other.
Fix: never reset the board to open a card. If the card is not loaded yet,
read its `column_id` with ONE small query (`kanban_cards` by id, `canvas_id`
= this board; RLS applies; not found → give up silently) and call the
existing `loadCardsForColumn(columnId)` (atomic `setColumnCards`), then open
it when it appears. Open at most once. Test: with the card absent, the helper
calls loadCardsForColumn for its column and never refetchFromServer; unknown id
→ no load, no open. I re-run the 8×8 live loop: 0 missing cards required.
Allowed file added: components/collabboard/canvas/ui/KanbanShell.tsx.

## Addendum 2 — the editor block has no styles (live screenshot)
`kanban-editor-brainstorm-title`, `-links`, `-link`, `-more` (and PATCH-328's
`kanban-editor-calendar-note`) have NO rules in
components/kanban-canvas/kanban-canvas.css, so the block renders at the
browser default 16 px, larger than every label in the editor, and the "Open
note" links look like plain black text. Add rules next to `.kanban-editor-field
label` (the 14 px / 500 / #2b2b2b block near line 1901):
- title: exactly the field-label look (14 px, 500, #2b2b2b), margin 0;
- list: no bullets, no padding/margin, a column with 4 px gap;
- link: 13 px, the board's accent/link blue (reuse an existing variable if
  there is one, else #2563eb), no underline, underline on hover/focus-visible,
  visible focus ring; a 14 px lightbulb icon before the text (the same icon as
  the card badge) with 6 px gap;
- more: 13 px, #64748b;
- calendar note: 13 px, #64748b, margin 0.
Dark mode: if the file has a dark block for editor labels, add the matching
colours there. Test: a source test that the five classes have rules.
Allowed file added: components/kanban-canvas/kanban-canvas.css.
