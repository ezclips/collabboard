# PATCH-325 — Kanban, Gantt and Scheduler: each view can fill the page

## Why
Owner decision 2026-10-08. Today the Kanban is always shown and the Gantt and
Scheduler can only be stacked under it at ~250px each (the Gantt is on by
default), so every view is cramped. New model: three equal views, K / G / S,
each toggled from the left rail; whatever is open shares the page.

## Behaviour
- Rail buttons, in this order: **K** (Kanban), **G** (Gantt), **S** (Scheduler).
  K uses the same look as the existing G/S buttons: label `K-`/`K+`, title and
  aria-label `Hide Kanban` / `Show Kanban`. K is shown only when Gantt or
  Scheduler is enabled (`enableGantt || enableScheduler`); otherwise the board
  is plain Kanban as today.
- **One view open → it fills the whole board area** (no resize handle).
- **Two or three open → stacked top to bottom in the order K, G, S.** The
  top-most open view takes the remaining height (`flex: 1`); each view below
  it has a height state and a resize handle above it, as today. Defaults: one
  lower panel 320px; two lower panels 250px each; min 200px (existing
  MIN_HEIGHT). Keep the existing drag behaviour; it must work for every
  combination (K+G, K+S, G+S, K+G+S).
- **At least one view always stays open.** The button of the last open view is
  disabled (`disabled`, `aria-disabled="true"`, title
  `At least one view stays open`) and clicking it does nothing.
- **Default for a board with no saved choice: Kanban only.**
- **Remembered per board, per browser**: `localStorage` key
  `kanban-views:<boardId>` = `{"kanban":bool,"gantt":bool,"scheduler":bool}`.
  Put read/write in a new `lib/kanban/kanbanViewPrefs.ts`:
  `readKanbanViews(boardId)` returns the default on missing / unparsable /
  all-false / non-boolean values; `writeKanbanViews(boardId, v)`. Every storage
  access in try/catch (private windows throw). Read it on mount in an effect
  (not during render) so server and client render the same first frame.
  A disabled feature flag wins: if `enableGantt` is false the Gantt is never
  shown even if storage says so (and the same for the Scheduler); if that
  leaves nothing open, show the Kanban.
- After any visibility change, dispatch `window` `resize` (already done in the
  split for G/S — include the Kanban flag) so dhtmlx and the calendar redraw at
  their new size.

## The card editor must work while the Kanban is hidden
`KanbanCanvas` renders the card `Editor` modal (`ui.activeCardId`) and the
Escape-to-close shortcut. Board AI citations and "Save as card" open a card via
`actions.setActiveCard` (PATCH-323 bridge). If the Kanban view is hidden,
nothing renders the editor. Fix:
- New `components/kanban-canvas/KanbanCardEditorHost.tsx`: renders the Editor
  for `ui.activeCardId` (same props as today: card, `onClose` →
  `setActiveCard(null)`, `readonly`) plus the Escape-to-close key handler.
- `KanbanCanvas` uses the host instead of its inline Editor block and drops the
  Escape branch from its key handler (undo/redo stay where they are). No
  visible change while the Kanban is open.
- `KanbanGanttSchedulerSplit` renders `<KanbanCardEditorHost />` itself when
  the Kanban view is hidden (never two editors at once).

## Code shape
- `CanvasClient.tsx`: add `isKanbanVisible`; initial state for all three =
  Kanban only (`useState(true)`, `false`, `false`) — note today the Gantt
  starts `true`; then the mount effect applies `readKanbanViews(canvasId)`, and
  a change effect writes it back (skip the write until the read has run). Pass
  `isKanbanVisible`/`setIsKanbanVisible` to `KanbanShell`. Touch only this
  state and the KanbanShell props.
- `KanbanShell.tsx`: K button; "last open view" disabling for all three
  buttons; pass `showKanban` to the split. Use the split whenever Gantt or
  Scheduler is enabled (as now).
- `KanbanGanttSchedulerSplit.tsx`: `showKanban` prop; layout rules above.
  Hidden views must not be mounted unless needed for state — the Gantt and
  Scheduler are currently kept mounted at height 0; keep that for them (dhtmlx
  re-init is costly), but the Kanban view may unmount when hidden.

## Tests
- `kanbanViewPrefs`: default when missing / bad JSON / all false / wrong types;
  round-trip; storage that throws → default, no throw.
- KanbanShell: K/G/S buttons render; clicking toggles; the last open view's
  button is disabled; K hidden when neither Gantt nor Scheduler is enabled.
- Split: for K only, G only, S only → that view fills (no separator); for
  G+S → Gantt is flex-1 with one separator; K+G+S → two separators.
- Kanban hidden + `setActiveCard(id)` → the Editor renders; Escape closes it;
  Kanban shown → exactly one Editor.
- Feature flag off beats stored true.

## Verification
Focused tests; full vitest gate (26-file baseline); `npx tsc --noEmit`.
I verify live: each single view full page, every pair, all three, resize,
reload keeps the choice, Board AI citation opens a card with the Kanban hidden.

## Allowed files
app/dashboard/canvas/[id]/CanvasClient.tsx (Kanban view state + KanbanShell
props only), components/collabboard/canvas/ui/KanbanShell.tsx,
components/scheduler-canvas/KanbanGanttSchedulerSplit.tsx,
components/kanban-canvas/KanbanCanvas.tsx, new
components/kanban-canvas/KanbanCardEditorHost.tsx, new
lib/kanban/kanbanViewPrefs.ts, and tests. No git writes, no database changes.
