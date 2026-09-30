# PATCH-227 — Drag a dot to connect two posts; lines meet what you see

Status: AUTHORIZED (owner, 2026-09-30: "Yes go and improve our graph line tool and bring it up to standard as
a PM").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-226 (`1846684d`)

## Why (CTO)
Today a connection needs a toolbar mode (Graph Line), a click on a "side" of the source, a click on a side of
the target, and switching the mode off again. The clicked side is stored (`style.sourceSide/targetSide`) but
never used: `routeEdge` picks sides itself. The industry pattern (Milanote, Miro, FigJam, React Flow) is a
handle on the selected item that you drag onto another item. We keep our renderer, data and Edge Settings
menu; we add that interaction. Live findings on the owner's frameless ellipse (`deecc023`) also show:
- lines aim at the invisible card box, not the drawing: box 144x111 vs drawing 125x91, plus `EDGE_GAP = 32`,
  so each line ends 30-40px away from the ellipse in empty space;
- selecting a post adds the Reactions Row (the "+"), the measured box grows, and lines jump ~30px.

## Design
### A. The connect dot (new `components/graph/GraphConnectHandle.tsx`)
- Shown for exactly ONE selected post when ALL hold: `isFreeformGraphMode`, `canUseFreeformEditButton`,
  the post is top-level (no `metadata.parentId`), it is not locked (`metadata.isLocked`), `isLineMode` and
  `isGraphConnectMode` are both false, and no post drag is in progress.
- Position: the middle of the post's RIGHT edge, half outside (`-right-2.5 top-1/2 -translate-y-1/2`),
  a 14px white circle with a 2px indigo-500 border, `cursor: crosshair`, `title="Drag to connect"`,
  `aria-label="Drag to connect to another post"`, `data-graph-connect-handle="true"`. (Not top-right as in
  Milanote: our comment badge lives at top-right.) Render it inside the post's outer wrapper in
  `FreeformPadletCards.tsx` next to the existing Board-AI drag handle (~1520-1537), so it moves with the post.
- The post wrapper's `onMouseDownCapture` (~1459) must ignore events whose target is inside
  `[data-graph-connect-handle="true"]` (same pattern as the comment-panel exclusion there), so pressing the
  dot never starts a post drag.
- Drag (Pointer Events + `setPointerCapture`; works for mouse, pen, touch):
  - pointerdown on the dot starts a connect drag; record the dot's screen centre;
  - while dragging, a portal to `document.body` draws a fixed full-viewport `<svg>` with
    `pointer-events: none`: a dashed indigo line from the dot centre to the pointer, and, if the pointer is
    over a valid target post, a 2px indigo rounded outline around that post's `getBoundingClientRect()`;
  - valid target = the first element from `document.elementsFromPoint(x, y)` that is (or is inside) a
    `[data-padlet-id]` whose id is NOT the source and whose post is top-level; implement it as a pure helper
    `findConnectTargetId(elements, sourceId, isTopLevel)` in new `lib/graph/connectTarget.ts`;
  - pointerup over a valid target → `onConnect(sourceId, targetId)`; over anything else → cancel, nothing is
    written; Escape during the drag cancels.

### B. Creating the line
- `onConnect` creates the edge through `createFreeformGraphRepo(boardId).upsertEdge` with: a new
  `crypto.randomUUID()` id, `board_id`, `source_post_id`, `target_post_id`, `relation_type: 'solid'`,
  `direction: 'forward'`, `label: null`, `style: { color: '#9ca3af' }`; then refresh the graph layer by
  bumping the existing `graphRefreshToken`. If FreeformPadletCards cannot set it, add ONE callback prop from
  CanvasClient (e.g. `onGraphEdgesChanged`) wired to `setGraphRefreshToken((t) => t + 1)`.
- If the pair is already connected (either direction; read with `repo.getEdges()`), write nothing and toast
  "These posts are already connected." The new flow never deletes.
- No "would cross an existing line" rule in the new flow: crossings are normal in every whiteboard.
- On success toast "Posts connected." On failure toast "Could not connect the posts." and log the error.
- The existing Graph Line toolbar mode stays exactly as it is in this patch.

### C. Lines meet what you see (`components/graph/FreeformGraphLayer.tsx` measurement, ~100-135)
- Extract the per-post rect choice into a helper `measureAnchorRect(el: HTMLElement, post)` in new
  `lib/graph/anchorRect.ts` (returns `{left, top, width, height}` in screen px, plus whether the visual anchor
  was used), keeping the existing comment/child-rect fallbacks. Two new rules:
  1. if `el` contains `[data-graph-anchor="visual"]` with a non-zero rect, use THAT element's rect;
  2. otherwise, if `el` contains a visible `[data-graph-anchor-exclude="true"]` whose top is inside the rect,
     cut the rect's bottom at that element's top (so the selection-only Reactions Row never moves a line).
- Mark the targets:
  - `components/collabboard/PostCardContent.tsx`, drawing branch: the preview `<img>` gets
    `data-graph-anchor="visual"` ONLY when `drawingFullView` is true;
  - `FreeformPadletCards.tsx` generic Reactions Row (~4584-4587): add `data-graph-anchor-exclude="true"`
    to that row's div. Do not change its className (census-pinned).
- Per-end gap: `lib/graph/edgeRouting.ts` `RouteEdgeOptions` gains optional `sourceGap` / `targetGap`
  (default = `gap`, the same `Math.max(6, …)` floor and the same smart clamping, per end). In the layer, an
  end whose post was measured via the visual anchor uses gap 6; every other end keeps `EDGE_GAP` (32).

## Tests
- `lib/graph/connectTarget.test.ts`: skips the source, skips non-post elements, climbs to the nearest
  `[data-padlet-id]`, rejects a child post (parentId), returns null when nothing matches.
- `lib/graph/anchorRect.test.ts` (jsdom, stub `getBoundingClientRect`): the visual anchor wins; the exclude
  row cuts the bottom; neither → the old rect; comment/child fallbacks unchanged.
- `edgeRouting` test (extend the existing one if present): `sourceGap`/`targetGap` move only their own end;
  omitted → output identical to today.
- `components/graph/GraphConnectHandle.test.tsx`: mock `elementsFromPoint` and the repo;
  drag to a valid post → one `upsertEdge` with the right ids/direction/style; drop on empty → none;
  drop on the source → none; existing pair → none + the toast; Escape → none; the preview svg is portalled
  to `document.body` during the drag and removed after.
- FreeformPadletCards wiring (a source test is acceptable: extend
  `lib/infra/canvas/freeformDrawingViewWiring.source.test.ts` or add `freeformGraphConnectHandle.source.test.ts`):
  the dot's show-conditions, the mousedown-capture exclusion, the Reactions Row data attribute.
- PostCardContent: a fullView drawing img has `data-graph-anchor="visual"`; a framed drawing img does not.
- **Mutations:** drop the handle exclusion in onMouseDownCapture → the wiring test fails; ignore the visual
  anchor in `measureAnchorRect` → its test fails; write on an empty drop → the handle test fails.

## Allowed files
```
components/graph/GraphConnectHandle.tsx (+ test)                  (new)
lib/graph/connectTarget.ts, lib/graph/anchorRect.ts (+ tests)     (new)
lib/graph/edgeRouting.ts (+ its test)                             (per-end gaps only)
components/graph/FreeformGraphLayer.tsx                           (use measureAnchorRect + per-end gap only)
components/collabboard/canvas/ui/FreeformPadletCards.tsx          (render the dot, the capture exclusion,
                                                                   the row data attribute, the refresh prop)
components/collabboard/PostCardContent.tsx                        (the one img attribute)
app/dashboard/canvas/[id]/CanvasClient.tsx                        (ONLY passing a refresh callback prop, if needed)
lib/infra/canvas/*.source.test.ts                                 (wiring pins)
```
Forbidden: the database / migrations, `package.json`, the existing Graph Line toolbar mode and its effect in
CanvasClient (~4737-4863), the Edge Settings menu. **Do not touch the comments inside
`isBlockingEditorModalOpen`.** Census tests on FreeformPadletCards / CanvasClient: if one pins markup you
must change, STOP and ask (spec line, code at file:line, proposed resolution).

Use the Read/Grep/Edit tools; `rg` with `timeout 30` if you need bash. Every test command is
`timeout 600 npx vitest run …`. REAL tool calls only. No `ls` on the repo root, no curl of the dev server,
no git writes, no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/graph components/graph lib/infra/canvas components/collabboard/PostCardContent components/collabboard/freeformFullViewFrame
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-227.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** select a post → the dot shows on its right edge; drag it to another post → a dashed preview
and the target outlined → a new grey arrow; drag to empty board → nothing; drag to an already-connected post
→ the toast, nothing written. The owner's ellipse: its three lines now end a few px from the drawing and do
not move when it is selected. The CTO deletes every line it creates.

## Commit message (verbatim)
```
feat(graph): drag a post's dot onto another post to connect them

Selecting a post shows a small dot on its right edge; dragging it onto
another post draws a line between them, with a dashed preview and the
target outlined on the way. No toolbar mode is needed. Lines to a
drawing whose post frame is hidden now meet the drawing itself, and a
selected post's emoji row no longer makes its lines jump.
```

## Addendum (CTO, 2026-09-30): live result
- Owner's ellipse (frame hidden): drawing 1209..1334 x 273..364; its three lines now end at x=1204/1205 and
  y=369, i.e. 4-5px from the drawing (before: 22-35px). Selecting it moves the ellipse ends by at most 1px
  (before ~30px); the far end of the YouTube line re-routes by 6px, accepted.
- The dot shows on the selected post only. A drop on empty board writes nothing. A drag to "Trump Image
  Post" shows the dashed preview + target outline and writes one edge (solid/forward/grey), toast "Posts
  connected."; repeating it writes nothing, toast "These posts are already connected.".
- The CTO's test edge `f85741d2-…` was deleted through its own "Delete Line" (DELETE by that id only).
- Gate `.opencode-vitest-227.json`: extra [] missing []; tsc clean; DeepSeek's three mutations confirmed.
