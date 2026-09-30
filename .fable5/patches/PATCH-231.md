# PATCH-231 — Small filled half-knobs on the visible edges of a post

Status: AUTHORIZED (owner, 2026-09-30: "On some posts you have the circle on top and on some below and they are
way too big! I want half knobs attached to the side where possible and filled. These don't need to be that big
either").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-230 (`df485275`)

## Why (CTO, live screenshot at 80%)
The four dots are positioned with CSS against the post's outer `[data-padlet-id]` wrapper. That wrapper is not
always the visible card: some are taller/shorter or collapsed (the line code already knows this and measures
with `measureAnchorRect` in `lib/graph/anchorRect.ts`), and a hidden-frame drawing's visible part is its image.
So some dots float above or below the card. They are also large outlined circles (14px, 2px border).

## Design (`components/graph/GraphConnectHandle.tsx`; new prop only where stated)
1. **Place the knobs on the SAME box the lines attach to.** GraphConnectHandle gets a new prop `post: Padlet`
   (FreeformPadletCards passes `padlet` — the only change allowed there). On mount and whenever the wrapper
   resizes or mutates (a `ResizeObserver` on the wrapper found via `rootRef.current.closest('[data-padlet-id]')`,
   plus a `requestAnimationFrame` re-measure after the first render), compute
   `a = measureAnchorRect(wrapper, post)` and the wrapper's rect `w`; derive the world scale as
   `scale = w.width / wrapper.offsetWidth` (fallback 1); the local box is
   `{ left: (a.left - w.left)/scale, top: (a.top - w.top)/scale, width: a.width/scale, height: a.height/scale }`.
   Render one absolutely positioned container at that local box with `pointer-events: none`; the four knobs sit
   on its edges. Until the first measurement, render nothing (no flash at the wrong place).
2. **Half-knobs, filled, small.** Each knob is a filled semicircle whose flat side lies ON the edge and whose
   round side points outward: visible size 12px along the edge × 6px outward, `background: #6366f1`
   (indigo-500), no border; top knob `rounded-t-full` sitting just above the top edge, bottom `rounded-b-full`
   below the bottom edge, left `rounded-l-full` left of the left edge, right `rounded-r-full` right of the right
   edge (for left/right the visible size is 6px × 12px). Hover: `#4f46e5` (indigo-600). Centred on the edge's
   midpoint.
3. **Easy to grab although small:** each knob has a transparent hit area of 20px × 14px (14px × 20px for
   left/right) centred on the visible knob, with `pointer-events: auto`, which carries the existing
   attributes (`data-graph-connect-handle="true"`, `data-graph-connect-side`, title, aria-label, cursor
   crosshair, `touch-action: none`) and the pointer handlers.
4. Drag behaviour, the preview (starting at the pressed knob's visible centre), drop rules and show conditions:
   unchanged.

## Tests
- Extend `components/graph/GraphConnectHandle.test.tsx`:
  - with a stubbed wrapper rect, `offsetWidth` and a stubbed `measureAnchorRect` result (or a visual-anchor
    child), the container's local box equals the computed one; at scale 0.8 the division is applied;
  - before measurement nothing renders; after it, four knobs with their sides;
  - each visible knob is filled (`#6366f1` background, no border) and 12x6 / 6x12;
  - the existing drag tests keep passing (press the hit area).
- Wiring pin: FreeformPadletCards passes `post={padlet}` to GraphConnectHandle.
- **Mutation:** position the container at the wrapper box (ignore `measureAnchorRect`) → the box test fails.

## Allowed files
```
components/graph/GraphConnectHandle.tsx (+ test)
components/collabboard/canvas/ui/FreeformPadletCards.tsx   (ONLY adding post={padlet} to <GraphConnectHandle>)
lib/infra/canvas/*.source.test.ts                          (the wiring pin)
```
Forbidden: `lib/graph/anchorRect.ts` (reuse, do not change), FreeformGraphLayer, CanvasClient, the database,
package.json. If a test outside these pins the old dot classes, STOP and ask.
Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/graph components/graph lib/infra/canvas
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-231.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** Graph Line on at 80%: every post's four knobs sit on its visible card edges (the owner's ellipse:
on the drawing's edges); a drag from a knob still connects; test lines deleted.

## Commit message (verbatim)
```
feat(graph): small filled half-knobs on the visible edges of a post

The connect dots were large outlined circles placed on each post's outer
box, which on some posts is not the visible card, so a dot could float
above or below it. They are now small filled half-circles sitting on the
visible card's edges (on a frameless drawing, the drawing's edges), with
a larger invisible grab area.
```

## Addendum (CTO, 2026-09-30): live result
At 80%, Graph Line on: 96 knobs; close-up crops show small filled indigo half-circles on the visible card edges
(YouTube, PDF, image cards) and on the owner's ellipse's drawing edges. Left and bottom knob drags each wrote one
edge; both test edges (1f53df02, fc5aeb27) deleted; the owner's 5 lines untouched.
Gate `.opencode-vitest-231.json`: extra [] missing []; tsc clean.
