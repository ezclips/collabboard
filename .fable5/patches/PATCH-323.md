# PATCH-323 — Board AI on Kanban boards (UI)

## Why
Owner decision 2026-10-08: Board AI on Kanban, "ask about cards", Board AI
button only (no Board Wiki button). PATCH-322 added the server side
(`kanban-card` and `kanban-board` context types, `kanban-card` citations).
Today the Kanban branch of `CanvasClient` (`if (isKanbanLayout) return
<KanbanShell …/>`, ~line 9075) returns before `<BoardAiChatDrawer>` (~11561)
is rendered, so Board AI does not exist on Kanban at all.

This is a deliberate exception to the 2026-10-06 rule "assistant buttons on
Freeform only" (PATCH-300): only the Board AI button, only on Kanban, and placed
in the Kanban left rail so it covers no Kanban control.

## Design
### 1. Button
In `KanbanShell`'s left rail (where Back, the Gantt/Scheduler toggles and Share
are), add a "Board AI" button (same icon as the Freeform Board AI button,
tooltip "Board AI", `data-board-ai-button`, `aria-label="Board AI"`). Visible to
everyone who can open the board (same rule as Freeform). It toggles the drawer.

### 2. Drawer on Kanban
Render the SAME `BoardAiChatDrawer`, with the same state and handlers
CanvasClient already uses for Freeform (`isBoardAiChatOpen`,
`closeBoardAiChat`, draft context, `onOpenCitation`, models, wiki proposal …),
in the Kanban branch too. Do not fork the drawer. Its presentation is the same
side panel (`[data-board-ai-chat]`); while it is open the Kanban area must not
be hidden under it (give the Kanban area right padding = panel width, or a flex
row — the board scrolls horizontally anyway).

### 3. Kanban overview on every turn
Add a drawer prop (e.g. `autoContextRequests?: readonly BoardAiContextRequestItem[]`)
that is appended to each send's context. On Kanban it is
`[{ type: 'kanban-board' }]`. Show it as a small fixed chip ("Kanban board")
that cannot be removed. Elsewhere the prop is absent → nothing changes.

### 4. A bridge into the Kanban store
`KanbanShell` owns `KanbanProvider`; CanvasClient cannot call store actions.
Add a small component rendered inside `KanbanProvider` (e.g.
`KanbanBoardAiBridge`) that registers, via a callback prop from CanvasClient:
- `openCard(cardId)` → `actions.setActiveCard(cardId)` (opens the card editor;
  if the card is gone, a toast "This card no longer exists").
- `createCardFromAnswer({ title, description })` → `actions.addCard` in the
  first column (first row if rows exist), at the bottom; returns the id.
- `cardSummary(cardId)` → `{ id, title }` for chips.

### 5. "Ask Board AI" on a card
Card menu (`CardMenu.tsx`) gets "Ask Board AI" (after "Edit Card"): adds a
`kanban-card` draft item (label = card title) and opens the drawer. Several
cards can be added this way (normal 4-slot limit and its existing "full"
feedback). Available to everyone who can use Board AI (not only editors).

### 6. Citations open the card
`openBoardAiCitation` handles `type === 'kanban-card'` → bridge
`openCard(cardId)` (and closes nothing else).

### 7. Save an answer as a card
On Kanban, the drawer's existing "Save as Note" action for an assistant answer
becomes "Save as card" (editors only — `canEditBoardContent`): bridge
`createCardFromAnswer` with title = first line of the answer (≤ 80 chars,
markdown stripped) and description = the full answer text. Toast "Saved as
card". Freeform keeps "Save as Note" unchanged.

## Tests
- KanbanShell renders the Board AI button; clicking calls the toggle.
- CanvasClient source/behaviour: the Kanban branch renders `BoardAiChatDrawer`
  with `autoContextRequests=[{type:'kanban-board'}]`; Freeform does not pass it;
  the Board Wiki button is NOT rendered on Kanban.
- Drawer: auto context is appended to the request and shown as a fixed chip.
- CardMenu: "Ask Board AI" adds a `kanban-card` draft item and opens the drawer.
- Citation `kanban-card` → bridge `openCard`.
- Save as card → `createCardFromAnswer` with trimmed title + full description;
  not offered to a viewer.

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I verify live.

## Allowed files
app/dashboard/canvas/[id]/CanvasClient.tsx (Kanban branch + citation handler
only), components/collabboard/canvas/ui/KanbanShell.tsx,
components/collabboard/BoardAiChatDrawer.tsx (the auto-context prop, its chip,
and the Save-as-card label/handler switch), components/kanban-canvas/
{CardMenu,Board,KanbanCanvas}.tsx, a new
components/kanban-canvas/KanbanBoardAiBridge.tsx, and tests. No server/domain
changes (PATCH-322 owns those), no git writes, no database changes.
