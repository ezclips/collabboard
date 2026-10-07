# PATCH-309 — No stacking-order writes when a board just opens

Status: AUTHORIZED (owner, 2026-10-07: "yes please" to looking into the writes found in the PATCH-308 review).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO, live 2026-10-07)
On a Scheduler board with one event and one Note in it, simply reloading the page sends
`PATCH padlets?id=eq.<note>` with `{ metadata: { …, zIndex: 100 } }` — no user action. Source:
`app/dashboard/canvas/[id]/CanvasClient.tsx` ~L6582, the "One-time migration for existing posts": on the first
non-empty load it writes `zIndex = 100 + i` to every post without one.
- It runs on EVERY layout and for EVERY visitor (a viewer's write is refused silently).
- It is not one-time in practice: many create paths insert posts without `zIndex` (the scheduler Note did), so every
  board with such a post writes on open, again for each visitor whose write is refused.
- `zIndex` is read only by Freeform and Drawing (`FreeformPadletCards.tsx`, `DrawingLayout.tsx`,
  `canvas/engine/zIndex.ts`, `FreeformGraphLayer.tsx`).
- A failed write `throw`s inside an un-awaited async function → an unhandled promise rejection.

## Design (CanvasClient.tsx, that effect only)
- Run only when `(isFreeformLayout || isDrawingLayout) && canEditBoardContent`. Check these BEFORE setting
  `zIndexMigrationDoneRef.current = true`, so the migration still runs once authority resolves after the first load;
  add `isFreeformLayout`, `isDrawingLayout`, `canEditBoardContent` to the dependency list.
- Failures: `console.error('[canvas] zIndex migration failed', …)` and stop; never throw out of the async function.
- Nothing else changes (same values `100 + i`, same local state update for the posts that were written).

## Tests
A source test `lib/domain/canvas/zIndexMigrationScope.source.test.ts` (pattern: the other `*.source.test.ts` there):
the migration effect is gated on `isFreeformLayout || isDrawingLayout` and on `canEditBoardContent` before the
done-ref is set; its async body contains no `throw`.

## Allowed files
`app/dashboard/canvas/[id]/CanvasClient.tsx` (that effect only) and the new test. Same rules as before. Run only the
new test and `npx tsc --noEmit`.

## Commit message (verbatim)
```
fix(board): opening a board no longer writes stacking order to its posts

A migration gave every post without a stacking order one, on every
layout and for every visitor, so boards such as a Scheduler wrote to
their posts each time they opened, and a viewer's refused write failed
silently. It now runs only on Freeform and Drawing boards, whose posts
can overlap, and only for people who can edit the board.
```

## Final result (CTO, 2026-10-07, live)
Scheduler test board with an event and a Note: two reloads and opening the posts send NO padlets writes (before: a `zIndex: 100` PATCH to the Note on every load). Only the board's last_visited_at and Next dev-overlay requests remain (expected). Gate `.opencode-vitest-309.json` 26 = 26; tsc clean. Test board deleted.
