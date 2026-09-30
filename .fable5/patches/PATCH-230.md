# PATCH-230 — Connect dots on all four sides of a post

Status: AUTHORIZED (owner, 2026-09-30: "Put the round circles on all 4 sides").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-229 (`3c644882`)

## Design
- `components/graph/GraphConnectHandle.tsx` renders FOUR dots instead of one: the middle of the top, right,
  bottom and left edges, each half outside the post:
  - top: `left-1/2 -top-2.5 -translate-x-1/2`
  - right: `-right-2.5 top-1/2 -translate-y-1/2` (today's position)
  - bottom: `left-1/2 -bottom-2.5 -translate-x-1/2`
  - left: `-left-2.5 top-1/2 -translate-y-1/2`
  Same look, cursor, title, aria-label and `data-graph-connect-handle="true"` on each, plus
  `data-graph-connect-side="top"|"right"|"bottom"|"left"`.
- Pressing ANY of the four starts the same connect drag; the dashed preview starts at the centre of the dot that
  was pressed (pointer capture on that dot). Everything after the drop is unchanged (one write, the duplicate
  toast, empty drop = nothing). The side is NOT stored: the line router still picks the sides itself.
- Show conditions (FreeformPadletCards, PATCH-229) are unchanged: all four dots appear wherever the one dot
  appeared.
- The post-drag exclusion in `onMouseDownCapture` already matches `[data-graph-connect-handle="true"]`, so it
  covers all four; confirm, change nothing there.

## Tests
- Extend `components/graph/GraphConnectHandle.test.tsx`: four dots render with the four sides; a drag started
  from the top dot and from the left dot each write one edge to the dropped-on post; the preview line starts at
  the pressed dot's centre (stub its `getBoundingClientRect`).
- Existing tests that query the single dot keep passing (select by side where needed, e.g. `right`).
- **Mutation:** render only the right dot → the "four dots" test fails.

## Allowed files
```
components/graph/GraphConnectHandle.tsx
components/graph/GraphConnectHandle.test.tsx
lib/infra/canvas/*.source.test.ts            (only if a wiring pin needs the side attribute)
```
Forbidden: everything else. If a test outside these pins the single dot, STOP and ask.
Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/graph components/graph lib/infra/canvas
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-230.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** Graph Line on → each connectable post shows 4 dots; drag from a top and a left dot → a line each;
test lines deleted.

## Commit message (verbatim)
```
feat(graph): connect dots on all four sides of a post
```

## Addendum (CTO, 2026-09-30): live result
Graph Line on → 96 dots (24 connectable posts x 4 sides). From Trump Image Post: top dot → P10 step7 crop,
left dot → Basic Chess Openings, bottom dot → P10: one edge write each. All CTO test edges (7620be0f,
57cdb4a1, ab600ad9) deleted; the owner's 5 lines (incl. their new 9b4cbc81) untouched.
Gate `.opencode-vitest-230.json`: extra [] missing []; tsc clean.
