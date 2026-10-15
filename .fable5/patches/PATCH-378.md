# PATCH-378 — Board AI: ready-made action chips on the Padlet layouts

**Status:** done

## Goal
On Wall, Columns, Grid, Timeline and Map, the Board AI drawer shows a row of ready-made
action chips above the input (Heptabase-style `/summarize`, `/group-by-theme`, …). One click
sends a well-written prompt; the answer is either an answer with citations (PATCH-371) or a
proposal list with Apply/Discard (PATCH-372). Typing `/` in the input lists the same actions.

## Reason
Owner (2026-10-15, Heptabase screenshot with chips `/create-skill`, `/break-down-book`,
`/setup-agent`…): "Is it possible to add in Board AI pre-configured prompts for the padlet
canvases that make sense, like you did in my demo?" The demo prompt ("Group these ideas into
columns by theme") is exactly such an action; people should not have to invent the wording.

## Design
### 1. Domain — `lib/domain/ai/boardAiPadletActions.ts` (+ test)
Pure list `PADLET_BOARD_AI_ACTIONS` with `{ id, slash, label, kind: 'answer'|'propose',
prompt(layoutNoun) }`, where `layoutNoun` is `{ one: 'column', many: 'columns' }` on
Columns/Grid and `{ one: 'card', many: 'cards' }` on Wall/Timeline/Map:
| id | slash | label | kind | prompt intent |
|---|---|---|---|---|
| summarize | /summarize | Summarize | answer | short summary per {one}, cite posts |
| group-by-theme | /group-by-theme | Group by theme | propose | group all posts into {many} by theme (new {many} + moves) |
| next-steps | /next-steps | Next steps | propose | a "Next steps" {one} with concrete action posts derived from the board |
| more-ideas | /more-ideas | More ideas | propose | 2–3 NEW ideas per {one}, not repeating existing posts |
| duplicates | /duplicates | Find duplicates | answer | list posts that say the same thing, grouped, cite them; never propose deletes |
| open-questions | /open-questions | Open questions | answer | what is unclear/undecided, cite posts |
| retro | /retro | Retro | propose | sort into "Went well", "To improve", "Actions" {many} (create the missing ones, move posts) |
Prompts are plain English, explicit about "propose, don't claim done" for `propose` kinds
(consistent with PATCH-372's instructions). `actionsForLayout(layout)`: Map → only `answer`
kinds; the four others → all. Wording lives ONLY here.

### 2. UI — `components/collabboard/BoardAiActionChips.tsx` (+ test)
A horizontally scrollable chip row (like the existing PATCH-164 starter-question chips,
reuse their look) above the input; `data-board-ai-action="<id>"`, chip text = the slash
form. Click → sends `prompt(noun)` through the drawer's existing `send` (the same path the
starter-question chips use). Disabled while a reply is streaming. The `/` menu: when the
input's text starts with `/`, show the filtered actions in a small list above the input
(`data-board-ai-action-menu`); ↑/↓/Enter/Escape and click choose; choosing PUTS the prompt
into the input (editable) instead of sending.
### 3. Wiring
`BoardAiChatDrawer.tsx`: render the chips only when the host passes `actionLayout` (new
optional prop); `CanvasClient.tsx`: pass the layout on the five Padlet layouts only.
Freeform, Kanban, the PDF reader drawer: unchanged.

## Files
Create: `boardAiPadletActions.ts` (+test), `BoardAiActionChips.tsx` (+test). Modify:
`BoardAiChatDrawer.tsx`, `CanvasClient.tsx` (one prop). Tests of the components you change
may be edited without asking; ask before touching anything else. No SQL, no git, no build.

## Commit
  feat(ai): ready-made Board AI action chips on the Padlet layouts

## Acceptance Criteria (PM, live — real model calls, owner's key)
Columns board with ~8 mixed posts: chips visible above the input; `/group-by-theme` →
proposals → Apply works; `/summarize` → an answer citing posts; typing `/ne` shows
`/next-steps`, Enter puts its prompt into the input. Wall board: chip prompts say "cards".
Map board: only the answer chips. Freeform and Kanban drawers show no chips. tsc clean;
per-test gate unchanged.

## Required Tests
Per-layout action lists (Map answer-only), noun substitution, every propose prompt contains
the "propose, don't claim" wording; chips send the right text; streaming disables them;
`/` menu filtering + keyboard + insert-not-send; drawer renders chips only with
`actionLayout`.

## Estimated Difficulty
medium
