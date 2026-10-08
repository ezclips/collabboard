# PATCH-329 — Import calendar window: input warning + saved-link wording

## Why
Owner, 2026-10-09: opening Import shows the React console error "A component
is changing an uncontrolled input to be controlled"
(CalendarImportModal.tsx, the file input). Cause: the file tab and the link
tab each render `<div className="mb-3"> <input …>` at the same tree position,
so React reuses ONE input element for both — the controlled URL input
(`value={url}`) and the uncontrolled file input swap into each other when the
tab changes.

Also found: the link tab always says "The link is used once to read the
events and is not saved" (`calendarLinkNotSaved`), which is false when "Keep
this calendar updated" is ticked (PATCH-328 saves it, encrypted).

## Fix (components/kanban-canvas/CalendarImportModal.tsx only, + i18n strings)
1. Give the two branches distinct keys (`key="file-tab"` / `key="link-tab"`
   on their wrapper divs) so React mounts separate inputs. Nothing else
   about the inputs changes.
2. Show `calendarLinkNotSaved` only when `keepUpdated` is false. When it is
   true show a new string `calendarLinkSavedEncrypted`: "The link is saved
   encrypted so the board can update. Editors can disconnect it at any
   time." (English for all languages is fine.)

## Tests
- Switching file → link → file renders without React's controlled/
  uncontrolled warning (spy on console.error).
- Keep-updated on → the "saved encrypted" line; off → the "not saved" line.

## Allowed files
components/kanban-canvas/CalendarImportModal.tsx,
components/kanban-canvas/useKanbanI18n.ts, and the modal test. No git.
