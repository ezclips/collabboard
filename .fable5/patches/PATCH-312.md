# PATCH-312 — A new Kanban board starts with To Do / In Progress / Done

Status: AUTHORIZED (CTO as PM, under the owner's "you are the PM", 2026-10-07; found during PATCH-311).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO, live)
A Kanban board created on the New board page opens completely empty (GET kanban_columns → 0): no columns, no hint,
only "Add Column" in the toolbar; its scheduler cannot create a card either, because a card needs a column. The old
setup page had the same gap. `lib/collabboard/create/createBoard.ts` (~L114) seeds To Do / In Progress / Done only
when `layout === 'gantt'`.

## Design
Seed the same three columns for `layout === 'kanban'` too (same rows, same insert). Nothing else changes.

## Tests
`lib/collabboard/create/createBoard.test.ts`: creating a `kanban` board inserts exactly three `kanban_columns` rows
named To Do / In Progress / Done with order 0/1/2; `gantt` still does; `freeform` does not.

## Allowed files
`lib/collabboard/create/createBoard.ts` and its test. Same rules. Run only that test and `npx tsc --noEmit`.

## Commit message (verbatim)
```
fix(kanban): a new Kanban board starts with To Do, In Progress and Done

New Kanban boards opened with no columns at all, so nothing could be added
until a column was created by hand. They now get the same three columns a
new Gantt board gets.
```

## Final result (CTO, 2026-10-07, live)
A Kanban board created on the New board page loads with columns To Do / In Progress / Done. Test 14/14; tsc clean; board deleted.
