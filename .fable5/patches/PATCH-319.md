# PATCH-319 — Kanban: editor dates, links, date format menu, new-column cards

## Why
Full live test of the Kanban (2026-10-07) found four bugs people hit first:
1. **Editor date boxes are empty** for any saved card after a reload or after
   moving its event in the calendar. `kanban_cards.date_started/date_due` are
   TIMESTAMPTZ, so loads return `2026-10-10T00:00:00+00:00`, and the calendar
   writes `toISOString()`. `<input type="date">` only accepts `YYYY-MM-DD`, so
   `value={formData.start_date}` renders blank. The card face is right because
   `Card.tsx` parses with `parseCardDate` and shows the LOCAL date.
2. **Links vanish from the editor after a reload.** `addLink` saves to
   `kanban_links` and loads put them in `state.data.links`
   (`masterId/slaveId`), but `Editor.tsx` shows `formData.links || card.links`,
   and `card.links` is never filled on load.
3. **The date format menu (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD) can't be used.**
   `.kanban-dropdown-overlay` sits on top of `.kanban-date-format-menu`
   (verified with elementFromPoint), so a click hits the overlay and only closes
   the menu. The priority and users menus do not have this problem.
4. **A column added in this session shows "Cards not loaded / Load cards"**, and
   a card added to it is saved but hidden until a reload. `Board.tsx` marks
   columns loaded only in the initial mount load (`loadedColumns`).

## Design
1. Move `parseCardDate` out of `Card.tsx` into a small shared module
   (e.g. `components/kanban-canvas/cardDate.ts`) and add
   `toDateInputValue(value?: string): string` → the LOCAL `YYYY-MM-DD` of
   `parseCardDate(value)`, or `''`. Card.tsx keeps its behaviour by importing it.
   Editor: `value={toDateInputValue(formData.start_date)}` (same for end).
   `onChange` still writes the picked `YYYY-MM-DD`; an untouched date keeps its
   original stored value (do not rewrite dates on Save). Make `getDisplayDate`
   use `parseCardDate` too, so a date-only value is not shifted by timezone.
2. Editor shows links from `state.data.links` where `masterId === card.id`
   (newest included right after add), not `formData.links || card.links`.
   Duplicate check uses the same list. Remove uses the existing
   `actions.deleteLink`. Keep the target label lookup as today.
3. Make the date format menu sit above its overlay, the same way the priority
   menu does (CSS z-index/stacking only). Picking a format must apply it
   (`actions.setDateFormat`) and close the menu.
4. When the user creates a column (toolbar Add Column and any other local
   create path), mark it loaded right away — it is new, so it has no cards.
   Keep the lazy "Load cards" path for columns that came from the server.

## Tests
- `cardDate` unit: `toDateInputValue('2026-10-10')`, an ISO midnight-UTC value,
  an ISO local-time value from the calendar, `''`/undefined/garbage.
- Editor: a card with `start_date: '2026-10-10T00:00:00+00:00'` renders the date
  input with a non-empty `YYYY-MM-DD`; saving without touching it keeps the
  original string.
- Editor: links come from store `data.links` for this card (render one link
  with `card.links` undefined).
- Source/CSS test: the date format menu's z-index is above the overlay's.
- Board: after Add Column, the new column does not render "Cards not loaded",
  and a card added to it renders.

## Verification
Focused tests pass; `npx tsc --noEmit` clean. List changed files.

## Allowed files
components/kanban-canvas/{Card,Editor,Board,Column,Toolbar,KanbanCanvas}.tsx,
components/kanban-canvas/store.tsx, components/kanban-canvas/*.css,
a new components/kanban-canvas/cardDate.ts, and their tests. No git writes,
no database changes.
