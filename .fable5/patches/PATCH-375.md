# PATCH-375 — Board AI: same button and spot as Freeform on the Padlet layouts

**Status:** done

## Goal
On Wall, Columns, Grid, Timeline and Map, Board AI opens from the SAME floating button
Freeform uses — the `Bot` icon at the top-right (`data-board-ai-chat-open`, `fixed right-4
top-4`) — and the toolbar "AI / Board AI" Sparkles entry added by PATCH-371 is removed.

## Reason
Owner (2026-10-15): "We should use the same icon and spot on the canvas for the Board AI as
in freeform — to add the same icon twice in the toolbar is not good." The PATCH-371 tool
(`data-toolbar-tool="board-ai"`, Sparkles, group "AI") sits right above the CREATE group's
Sparkles tool, so the left toolbar shows the same icon twice; and Freeform users know Board
AI as the top-right Bot button.

## Design
1. `canvasToolbarRegistry.tsx`: remove the `board-ai` group/tool and the flags that only fed
   it (keep anything another tool still uses). Freeform/Kanban unchanged.
2. `CanvasClient.tsx`: the floating Board AI button (~12536) renders on Freeform AND the five
   Padlet layouts (`isPadletBoardAiLayout`) — same markup, icon, position, z-index, hide
   rules (editor modal / drawer / reader / wiki open). Keep it hidden for guests on the Padlet
   layouts (PATCH-371 rule: Board AI is not offered to guests there); Freeform's rule unchanged.
   Remove the toolbar's `case 'board-ai'`. The Board WIKI button stays Freeform-only.
3. COLLISIONS (the reason PATCH-300 removed floating buttons from other layouts — "they
   covered each layout's own top-right controls, Drawing library trigger, Timeline layout
   button"): on each of the five layouts find what sits in the top-right ~140×60 px
   (e.g. the Timeline layout button, Map zoom/controls, the presence stack, the timer pill
   from PATCH-374, the frozen banner, the pending-posts pill) and make sure nothing overlaps
   the Bot button and the Bot button covers nothing. If something collides, move THAT
   layout's control or offset the button for that layout only — report what you found per
   layout and what you changed.
4. Copy fix (from the PATCH-372 frozen live run): `PadletMessageProposals` shows "Only
   editors can apply changes." also on a FROZEN board, where the person IS an editor. Pass
   the reason: frozen → "This board is frozen. Changes can't be applied."; otherwise keep
   the current text. Kanban's proposals are out of scope.

## Files
Modify: `canvasToolbarRegistry.tsx`, `CanvasClient.tsx`, `PadletMessageProposals.tsx`,
`BoardAiChatDrawer.tsx` (only if needed to pass the frozen reason), and the tests that
asserted the toolbar tool (`canvasToolbarBoardAi.test.tsx`, `boardAiKanbanWiring.source.test.tsx`
— update them to assert the floating button instead). Ask before touching anything else.
No SQL, no git, no production build.

## Commit
  fix(ai): Board AI uses the Freeform button on the Padlet layouts

## Acceptance Criteria (PM, live)
On a throwaway board of each layout (Wall, Columns, Grid, Timeline, Map) and Freeform:
exactly one Board AI entry point (the top-right Bot button; no `data-toolbar-tool="board-ai"`);
`elementFromPoint` at the button's centre is the button; every pre-existing top-right control
on that layout is still the top element at its own centre; the button opens the drawer with
"Board overview · always included". A guest sees no Bot button on the Padlet layouts. On a
frozen board an editor's proposals note says the board is frozen. tsc clean; per-test gate
unchanged.

## Required Tests
Registry no longer yields a board-ai tool on any layout; floating button rendered for the
five layouts + Freeform, not for guests on the five, not on Kanban's canvas route; proposals
note text for frozen vs not-editor.

## Estimated Difficulty
easy
