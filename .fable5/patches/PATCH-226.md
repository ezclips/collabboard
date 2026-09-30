# PATCH-226 — The graph line's right-click menu opens where you clicked

Status: AUTHORIZED (owner, 2026-09-30: "I had a right click function for the Graph Line Post which lets it
change the line color ... but it is not working").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-225 (`630c5170`)

## Why (CTO, measured live)
Right-clicking a graph line DOES open "Edge Settings", but off-screen. Live at board zoom 80%, a right-click at
client (1238, 458) rendered the menu at (2942, 1191) on a 1600x1000 viewport.
Cause: `components/graph/FreeformGraphLayer.tsx` ~482-487 renders the menu as `position: fixed` with
`left/top = clientX/clientY`, but the layer is mounted inside FreeformPadletCards' world stage
(`data-freeform-world-layer="posts"`, `transform: scale(zoom)`, offset by `worldOriginLeft/Top`). A
transformed ancestor becomes the containing block for `fixed` descendants, so the menu is scaled and
shifted by the world origin, and lands far away from the mouse.

## Design
1. Render the Edge Settings menu through `createPortal(…, document.body)` (from `react-dom`), so `fixed`
   is relative to the viewport again. Keep its markup, classes, handlers and `z-[7000]` unchanged.
   Guard SSR: only portal when `typeof document !== 'undefined'`.
2. Keep it on screen: clamp `left` to `[8, window.innerWidth - 260 - 8]` and `top` to
   `[8, window.innerHeight - <menu height> - 8]` (use a measured height via a ref after mount, or a
   conservative 320px constant — state which). Pure helper `clampMenuPosition(x, y, w, h, vw, vh)` in the
   same file or `lib/graph/`, unit-tested.
3. Closing behaviour must not change: clicks inside the menu keep it open (its `onMouseDown`/
   `onPointerDown` stopPropagation still prevent the outside-mousedown close at ~166-170 — verify this
   still holds through the portal, since the portal lives under `body`); an outside mousedown closes it;
   a zoom change closes it (existing `freeformGraphEdgeMenuZoomClose.test.tsx`).

## Tests
- Extend `components/graph/freeformGraphEdgeMenuZoomClose.test.tsx` (or a new `freeformGraphEdgeMenuPortal.test.tsx`):
  - render the layer inside a wrapper `div` with `style.transform = 'scale(0.8)'`; open the menu via a
    `contextmenu` on the hit path → the "Edge Settings" element's parent chain reaches `document.body`
    WITHOUT passing through the transformed wrapper;
  - a mousedown inside the menu (e.g. on a colour swatch) does not close it; a mousedown on `document.body`
    outside does;
  - clicking a colour swatch still calls the repo upsert (mock the repo as the existing tests do).
- `clampMenuPosition`: inside → unchanged; past the right/bottom edge → pulled in; negative → 8.
- Existing graph tests stay green.
- **Mutation:** remove the portal → the "parent chain" test fails.

## Allowed files
```
components/graph/FreeformGraphLayer.tsx       (the menu render + the clamp helper)
components/graph/*.test.tsx                   (extend or add)
lib/graph/ (only if the clamp helper goes there, + its test)
```
Forbidden: FreeformPadletCards.tsx, CanvasClient.tsx, the database, package.json. If an existing census
pins the menu markup location, STOP and ask.
Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/graph lib/graph
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-226.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** right-click the owner's new line (ellipse → watson.ch post) at 80% zoom → the menu appears
next to the mouse, on screen; pick a colour → the line changes; set it back to grey. Also at 100% zoom.

## Commit message (verbatim)
```
fix(graph): a line's right-click menu opens where you clicked

The Edge Settings menu was positioned with page coordinates but rendered
inside the zoomed, shifted board layer, so it appeared far off-screen and
right-clicking a line seemed to do nothing. It now renders at page level,
next to the mouse, and stays inside the window.
```

## Addendum (CTO, 2026-09-30): live result
At board zoom 80%, right-click on the owner's new line (ellipse → watson.ch post) at (1238, 458): the menu
renders at (1238, 457), 260x371, on screen next to the mouse (before: (2942, 1191), off-screen). Red applied
(#ef4444) with the menu staying open; set back to grey (#9ca3af); an outside click closes it. Gate on
`.opencode-vitest-226.json`: extra [] missing []; tsc clean. 100% zoom not separately checked live.
