# PATCH-303 — The "New board" page back to the mockup's size

Status: AUTHORIZED (owner, 2026-10-06, screenshot of `/dashboard/create-canvas` at 1918 px: "It is to large!! bring the
size back").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO)
The approved mockup (`.fable5/patches/PATCH-301-mockup.html`) puts the page in a centred frame: `.app {max-width:
1320px; margin: 0 auto; padding-inline: 16px}` and `.frame {border:1px solid; border-radius:14px; box-shadow; bg
white}`, with the top bar INSIDE the frame. `NewBoardPage.tsx` (L131–) instead stretches the bar and the grid across
the full window, so on a 1920 px screen every format tile is ~240 px wide (mockup ~150 px) and everything looks blown
up.

## Design (`components/collabboard/create/NewBoardPage.tsx` only)
- Outer: `min-h-screen bg-slate-50 px-4 py-4` (keep `font-sans text-slate-900`).
- Frame: `mx-auto w-full max-w-[1320px] overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm`.
  The top bar (`data-new-board-bar`) and the main/rail grid both go INSIDE the frame; the bar keeps its classes.
- The rail keeps `bg-slate-50` and its left border; its sticky `top-4` stays.
- Nothing else changes (no tile, stage or gallery changes).
Tests: `NewBoardPage.test.tsx` — the bar and the grid are inside an element with `max-w-[1320px]`; the page still has
exactly one "Create board" button.

## Allowed files
`components/collabboard/create/NewBoardPage.tsx` and `NewBoardPage.test.tsx`. Forbidden: everything else (PATCH-302 is
being edited in parallel in other files — do not touch them).
- Real tool calls only; no shell listing; never pipe vitest into anything; `timeout` on long commands.
- No git writes, no build, no browser, no curl. Do not read `.env` files. Never `cd`.
- Run only `NewBoardPage.test.tsx` and `npx tsc --noEmit`. Do not run the full suite.

## Commit message (verbatim)
```
fix(board): New board page at its designed size

The page sits in a centred frame again, as in the approved design,
instead of stretching across wide screens.
```

## Final result (CTO, 2026-10-06, live)
On a 1920 px window the page sits in a centred 1320 px frame with the bar inside it, as in the mockup; a format tile is 143 px wide (was ~240); one "Create board" button. `NewBoardPage.test.tsx` passes.
