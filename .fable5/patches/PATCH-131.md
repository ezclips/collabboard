# PATCH-131 — Keep newly created posts and containers inside the visible canvas

**Status: OPEN · DIAGNOSIS INCOMPLETE · IMPLEMENTATION BLOCKED**

Authored 2026-08-02 by CTO (governance and diagnosis only). Starting HEAD verified at
**`5e03f44`** (`610c141` plus the documentation-only lessons commit). Worktree clean
apart from the five protected paths.

**PATCH-128, PATCH-129 and PATCH-130 are CLOSED. Do not modify or reopen them.**

---

## 1. Why this patch is BLOCKED rather than authorized

The **source map is complete** (§3) and four specific, arithmetically demonstrable
defects are identified (§5). That is normally enough to authorize a bounded repair.

**It is deliberately not enough here.**

PATCH-130 is the reason. There, `handleActivateSlide` read as a plausible, almost
correct handler; the real first failing layer was a `min-width: 2000px` stage set
**three components away** in `CanvasClient.tsx`, and it was found only by measuring
`appState.width` in a live browser — no amount of handler-reading would have surfaced
it. PATCH-131 touches the same file, the same stage and the same coordinate systems.

Authorizing a repair here from source reading alone would repeat precisely the mistake
PATCH-130 exists to prevent, and would violate the standard this patch family has
enforced since PATCH-128 §30k. **The suspected causes in §5 are hypotheses with strong
source support, not measured findings, and they are labelled as such throughout.**

**Reproduction was attempted and is incomplete** (§2). The next authorized action is
the bounded reproduction task in §11 — not implementation.

---

## 2. Reproduction status — attempted, incomplete

| Item | Result |
|---|---|
| Dev server | started, **port 3000, PID 8024**, confirmed listening before use |
| Freeform board identified | **`af02972f-dfde-4545-9fc8-5fcbccb007c3`** ("My Canvas", Freeform Layout) |
| Drawing board identified | **`0c65aa8e-99a0-4c82-9816-4c838526b838`** (Drawing Layout, 4 slides) |
| Both boards load authenticated | **yes** |
| Creation affordance located | **NO — blocker** |
| Object creation reproduced | **not performed** |
| Geometry measured | **not performed** |
| Server torn down | yes — orphan PID 8024 killed by port; **no listener remains** |

### 2a. The blocker

Neither layout exposes a discoverable creation control by `title`, `aria-label` or
button text. The Freeform board reports **14 buttons total**, none of which is an
add-post action; its creation tools sit behind a collapsible toolbar
(`aria-label="Collapse toolbar"`) and, per the standing repo lesson *"Discover
selectors live; never guess labels — sidebar tools and cards are `<div onClick>` with
tooltip-span labels"*, the tools are very likely non-semantic `div`s rather than
buttons. The Drawing board's exposed titles are Excalidraw's own tool palette plus
`Add Comment`, `Open Library`, `Present Frames`, `Insert Mermaid Diagram` — no
app-owned post/container creation entry among them.

**No creation was faked to work around this.** A database insert or a direct handler
call would have produced geometry numbers that prove nothing about the real UI path —
the §10 false-green list rejects exactly that substitution, and it would have been
substitution to satisfy my own deadline.

---

## 3. Source map — complete

Every app-owned creation path for Freeform and Drawing resolves into **two placement
computations, both in `CanvasClient.tsx`**.

| # | Concern | File · lines | Layout | Coordinate source |
|---|---|---|---|---|
| 1 | **`getNewPostPosition(cardWidth, cardHeight)`** — the general new-post placement helper | `CanvasClient.tsx:1105-1115` | Freeform (and other DOM-scrolled layouts) | `containerRef` `clientWidth/Height` + `scrollLeft/Top`, `canvasZoom` |
| 2 | **`onDrawingPlacementStart(draft)`** — Drawing container/post placement | `CanvasClient.tsx:1278-1292` | Drawing | `window.innerWidth/Height`, Excalidraw `zoom`/`scrollX/Y`/`offsetLeft/Top` |
| 3 | `handleCreateEmptyFreeformContainer` — duplicates helper 1's formula inline | `CanvasClient.tsx:2022-2035` | Freeform | same as 1, **re-implemented rather than reused** |
| 4 | `getCanvasPointFromClient` — pointer→scene conversion | `CanvasClient.tsx:1117-1129` | Freeform | `containerRef` rect + scroll + `canvasZoom` |
| 5 | Duplicate paths (`+20/+20` offset from source) | `CanvasClient.tsx:3535-3536`, `3612-3613` | both | copies source position; **does not use 1 or 2** |
| 6 | Stage sizing — `min-width: 2000px; min-height: 1500px` | `CanvasClient.tsx:6354` | Freeform **and Drawing** (fallback branch) | PATCH-130 §4a |
| 7 | Drawing usable-rect helper (PATCH-130) | `DrawingLayout.tsx:1550-1582` | Drawing | real DOM bounds − sidebar; **exists, unused by creation** |
| 8 | Measured sidebar inset | `DrawingLayout.tsx:913-951` | Drawing | `ResizeObserver`; `--drawing-visible-canvas-right-inset` |

Roughly 30 further `position_x: 0, position_y: 0` literals exist in `CanvasClient.tsx`
(e.g. L554, L1774, L1846, L4370) for **Wall/Grid/Columns/Kanban** layouts, where
position is ignored by the layout engine. **Those are out of scope** and must not be
"fixed".

### 3a. Answer to the governance question: is `CanvasClient.tsx` required?

**Yes. `DrawingLayout.tsx` alone is definitively insufficient.** Both placement
computations live in `CanvasClient.tsx`; `DrawingLayout.tsx` contains no app-owned post
or container placement arithmetic at all. §6 records the blast-radius consequence.

---

## 4. Measured geometry

**None recorded.** §2 explains why, and no numbers are asserted in this document that
were not measured. The one relevant measurement carried in from PATCH-130 §3c — that
`appState.width/height` is a viewport-independent **2000 × 1500** in Drawing Layout —
remains valid and is used in §5 only to state a hypothesis, not a finding.

---

## 5. Suspected root cause — hypotheses, classification **I** (more than one)

**Unverified. Each must be confirmed or rejected by §11's reproduction.**

### 5a. Drawing — suspected **C** (incorrect screen→scene conversion)

`CanvasClient.tsx:1285-1286`:

```js
const _centerX = ((window.innerWidth - _offsetLeft) / 2 / _zoom) - _scrollX;
const _centerY = ((window.innerHeight - _offsetTop) / 2 / _zoom) - _scrollY;
```

The correct conversion of a screen point to scene coordinates is
`(screenX - offsetLeft) / zoom - scrollX`. For the viewport centre that is
`((W / 2) - offsetLeft) / zoom - scrollX`. The code instead computes
`(W - offsetLeft) / 2 / zoom`, which **subtracts only half the offset**.

With `W = 1920`, `offsetLeft = 56`, `zoom = 1` (all values measured in PATCH-130 §3c):
correct `= 904`; actual `= 932`. **A 28 px error, exactly `offsetLeft / 2`.**

Small alone — but it is a real arithmetic defect and it scales with `offsetLeft`.

### 5b. Drawing — suspected **D** (object not offset by its own size)

The same expression assigns the viewport centre directly to `position_x/position_y`,
which are the object's **top-left corner**. **No `width / 2` or `height / 2` is
subtracted anywhere in this path.** A 350 × 300 container would therefore start at the
centre and extend 350 px right and 300 px down — pushing its right and bottom edges
toward or past the viewport edge, and directly under the Presentation panel when open.

This is the strongest candidate for the user's report, and it is the clearest
difference from the Freeform helper, which *does* subtract half the object size.

### 5c. Both — suspected **E** (occupied sidebar/panel geometry ignored)

Helper 1 uses `containerRef.clientWidth`; helper 2 uses `window.innerWidth`. **Neither
subtracts the Presentation panel, the left toolbar, or any overlay.** PATCH-130 §4b
established the panel is a 320 px `fixed` overlay that occludes without shrinking, and
that a measured inset already exists at `DrawingLayout.tsx:913-951` — **available and
unconsumed**, exactly as PATCH-130 found for navigation.

### 5d. Both — confirmed by inspection **F** (inconsistent paths)

| | Viewport source | Pan source | Zoom | Object size subtracted | Clamp |
|---|---|---|---|---|---|
| **Freeform** (1) | `containerRef.clientWidth/Height` | `scrollLeft/scrollTop` (DOM) | `canvasZoom` | **yes** (`− cardWidth/2`) | `Math.max(0, …)` |
| **Drawing** (2) | `window.innerWidth/Height` | `scrollX/scrollY` (Excalidraw) | `appState.zoom` | **no** | none |

These are **mathematically different algorithms over different coordinate systems.**
Freeform pans by DOM scroll; Drawing pans by Excalidraw scroll/zoom transform. §7
addresses what that means for a shared helper.

Note Freeform's `Math.max(0, …)`: it clamps to the **stage origin**, not to the visible
region. If a user scrolls to a region and the computed value is negative it snaps to
scene 0 — potentially far offscreen. A plausible contributor to "appears above the
visible viewport".

### 5e. Suspected **A** — probably NOT the cause, and worth stating

Neither placement path reads `appState.width` or `appState.height`. Helper 1 uses real
DOM bounds; helper 2 uses `window.innerWidth/Height`. **The 2000 × 1500 virtual stage
that caused PATCH-130 is very likely not the primary cause here.**

This is a useful negative: it means PATCH-131 is probably *not* a second instance of
PATCH-130, and the tempting analogy should not drive the repair. **§11 must test it
rather than assume it** — the stage may still affect Freeform's `containerRef` bounds
if that ref points at the 2000 px stage rather than the scrolling viewport. **That
single measurement is the highest-value item in the reproduction.**

### 5f. Not yet investigated

**B** (stale pointer position), **G** (reconciliation overwrites x/y), **H** (per-type
divergent paths). §11 must resolve all three. **G is the most consequential
unexamined risk**: if a refetch rewrites position, a placement-only repair is
worthless.

---

## 6. Blast radius — why this patch is not yet allowlisted

Both computations sit in `CanvasClient.tsx`, the 8.5 k-line file under active
strangulation. The two candidate scopes differ sharply:

- **Helper 2 (`onDrawingPlacementStart`, L1278-1292)** is Drawing-only. Narrow, and
  contains defects 5a and 5b outright.
- **Helper 1 (`getNewPostPosition`, L1105-1115)** is passed into a shared prop bag and
  its formula is duplicated at L2022-2035. Changing it touches **every DOM-scrolled
  layout**, not only Freeform. Its true consumer set must be enumerated before any
  allowlist is written.
- **`CanvasClient.tsx:6354`** (the stage) remains excluded, as in PATCH-130 §6a.

**No production allowlist is granted by this document.** §11's reproduction must
report helper 1's full consumer list so the allowlist can be scoped to a
responsibility rather than guessed — the PATCH-129 §15b lesson applied in advance.

---

## 7. Shared-helper feasibility — provisional

A **single arithmetic helper is feasible and desirable**; a single *input source* is
not. The two layouts genuinely differ in how pan is represented (DOM `scrollLeft` vs
Excalidraw `scrollX` + zoom transform), and §5d shows that difference is real, not
accidental.

Recommended shape — decide only after §11:

```
placeNewObjectInVisibleRect({
  usableScreenRect,     // measured per layout, sidebar/toolbar excluded
  offsetLeft, offsetTop, // 0 for the DOM-scrolled path
  scrollX, scrollY, zoom,
  objectWidth, objectHeight,
  screenPadding,
}) -> { x, y, oversized }
```

Each layout supplies its own measured `usableScreenRect` and pan/zoom in a common
form; **one function does the arithmetic**, per §5 of the brief's placement policy.
This satisfies "one shared geometry helper" without pretending the coordinate systems
are identical.

---

## 8. Placement policy (governed, unchanged from the brief)

```
usableSceneLeft   = (usableLeft   - offsetLeft) / zoom - scrollX
usableSceneTop    = (usableTop    - offsetTop)  / zoom - scrollY
usableSceneRight  = (usableRight  - offsetLeft) / zoom - scrollX
usableSceneBottom = (usableBottom - offsetTop)  / zoom - scrollY

candidateX = usableSceneCenterX - objectWidth  / 2
candidateY = usableSceneCenterY - objectHeight / 2
scenePadding = screenPadding / zoom

finalX = clamp(candidateX, usableSceneLeft + scenePadding, usableSceneRight  - objectWidth  - scenePadding)
finalY = clamp(candidateY, usableSceneTop  + scenePadding, usableSceneBottom - objectHeight - scenePadding)
```

`screenPadding` must be a **named constant**. Every inset must be **measured** — no
hard-coded 320 px panel or 56 px toolbar, per PATCH-130's standard.

### 8a. Oversized-object policy

If the object is larger than the usable viewport:

- **do not** distort or resize the stored object to make it fit;
- place it from a **reachable padded origin** — top-left at
  `(usableSceneLeft + scenePadding, usableSceneTop + scenePadding)`;
- **do not** centre it, which would put its top/left above the reachable origin —
  the PATCH-129 §4b unreachable-overflow failure in scene coordinates;
- a **one-time** navigation fit is permitted only if §11 shows oversized creation is a
  real user path; it must never repeat or force zoom afterward.

---

## 9. Expected product behaviour

Creating a post or container in either layout must place it inside the currently
visible usable canvas with all four edges visible when it can fit; preserve natural
dimensions; respect current zoom and pan; exclude sidebars, panels and overlays; never
place under the Presentation panel; use the real viewport rather than the 2000 × 1500
stage; select/activate the new object; persist exactly one final position matching the
visible one; survive refetch without jumping; require no manual panning; preserve the
user's zoom and pan; and never continuously recentre.

---

## 10. Acceptance tests — specified now, to be honoured by the implementing patch

New file only: **`e2e/characterization/patch-131-new-object-visibility.spec.ts`**.
**Do not modify the PATCH-128, PATCH-129 or PATCH-130 specs** — all three are closed.

Real UI creation paths only. Freeform and Drawing, each with at least one post and one
container; Drawing repeated with the Presentation panel open and closed; non-default
pan and non-default zoom in both. Viewports **1920×1080, 1440×900, 1366×768** plus one
narrower. Assert: a new stable ID appears; the live object exists; **all four
screen-space edges inside the usable canvas**; no overlap with the Presentation panel;
the object is selected/active; persisted `position_x/position_y` match the live
position; no jump after refetch.

**Viewport-dependence:** placement must differ appropriately across materially
different viewports while remaining visible in each. **A test that would still pass
using a constant virtual-stage centre does not cover this defect** — the PATCH-130 §10
rule, which caught the real signature there.

**Pan/zoom dependence:** changing `scrollX/scrollY` must change the computed insertion
scene coordinates; changing zoom must change scene-space padding correctly; the
screen-space result must stay inside the visible canvas in every case.

**False-green rejection:** object created but not visible; wrong object measured;
sidebar counted as usable; direct DB insert substituted for UI creation; test-injected
coordinates; canvas panned after creation to reveal the object; a user-observable
temporary offscreen position; persistence inferred from UI state; selection used in
place of geometry; screenshots without geometric assertions; object disappears after
refetch.

**Repeatability:** focused run once and under **`--repeat-each=3`**, with both
Freeform and Drawing scenarios in each repetition.

**Validation:** `npx tsc --noEmit`; focused Playwright ×1 and ×3; relevant unit tests;
`git diff --check`; a source grep proving no debug instrumentation remains;
protected-path hash comparison. **Do not run the production build** — the shared
`.next` corruption hazard is unresolved.

---

## 11. NEXT AUTHORIZED ACTION — bounded reproduction only

**Diagnosis task. No production file may be modified. No test file may be committed.**

1. **Locate the real creation affordances** in both layouts — read component source for
   the collapsible Freeform toolbar and the Drawing app-owned controls; do not guess
   labels. Report exact selectors.
2. **Reproduce creation** of one post and one container in each layout.
3. **Answer §5e first:** does `containerRef.current` in Freeform resolve to the
   scrolling viewport or to the 2000 × 1500 stage? Report `clientWidth/clientHeight`
   against `window.innerWidth/innerHeight`. **This single measurement decides whether
   PATCH-131 is a placement-arithmetic patch or a second stage patch.**
4. **Measure**, per creation: layout; object type; viewport; `zoom`; `scrollX/scrollY`;
   `offsetLeft/offsetTop`; `appState.width/height`; canvas DOM bounds; usable bounds;
   panel bounds; computed insertion scene coords; final live scene `x/y/width/height`;
   final screen-space bounds; all-four-edges-visible; selection state; persisted
   `position_x/position_y`; and **whether the object moves after refetch (§5f G)**.
5. **Cover** no-pan / up / down / left-right, zoomed in, zoomed out, panel open and
   closed, at 1920×1080, 1440×900, 1366×768 and one narrower viewport.
6. **Confirm or reject each of 5a–5f individually**, with numbers.
7. **Enumerate every consumer of `getNewPostPosition`** and of the L2022-2035 inline
   duplicate, so §6's allowlist can be scoped.
8. **Report which matrix cells were not measured.** Partial coverage is acceptable;
   **silently implying full coverage is not.**

**Dev-server rule (PATCH-130 §13, confirmed again this turn):** identify the listening
PID and port before measuring; point the base URL at the healthy server; after
finishing, stop the real child process and **verify no listener remains** — `TaskStop`
on `npm run dev` kills the wrapper and orphans the Next child, which happened again in
this session (PID 8024 survived and had to be killed by port). **Never delete `.next`
while a server process is alive.**

---

## 12. Hard stops

Stop and report rather than proceeding if: the creation affordance cannot be driven
through the real UI; correct placement needs `CanvasClient.tsx:6354`; a refetch rewrites
position (§5f G) — that becomes the primary defect and this patch must be re-scoped;
Freeform and Drawing prove to need genuinely different algorithms rather than different
inputs; or a repair cannot be bounded without enumerating helper 1's consumers.

**Do not modify or reopen PATCH-128, PATCH-129 or PATCH-130, or their accepted commits
(`400f056`, `56592ab`, `ea7775b`, `39e5578`, `0f8762f`, `2228641`, `0262405`).** Do not
call slide-frame navigation for new posts. Do not recentre the canvas to place a
normal-sized post. Do not move existing objects.

**Protected unrelated paths — preserve untouched and unstaged:** `.gitignore`,
`app/api/ai/classify-intent/route.ts`, `app/api/ai/convert-component/route.ts`,
`app/api/ai/generate-component/route.ts`, `scripts/live-access-login.mjs`.

Credentials only via `LIVE_ACCESS_EMAIL`/`LIVE_ACCESS_PASSWORD` and
`E2E_EMAIL`/`E2E_PASSWORD`; never printed, logged, committed or copied into a report.
`.env.local` must not be modified. Identities reported as **user ids only — never an
email, never a token, never cookies.** Do not modify `node_modules` or
`excalidraw_fork`. Do not begin PATCH-126/118/119. Do not resume PATCH-127.

---

## 13. Commit contract

Reproduction turn: **governance amendment only** recording measurements; no
implementation commit. Once authorized:

- Implementation: `fix(canvas): place new objects inside the visible canvas`
- Tests: `test(canvas): characterize new object visibility`

**Do not push. Do not close PATCH-131.**

---

## 14. Recorded diagnostic notes

- **A complete source map is not a diagnosis.** PATCH-130's handler read as nearly
  correct while the real cause sat three components away and surfaced only under
  measurement. Same file, same coordinate systems here — so §5 stays hypotheses.
- **Two placement algorithms already disagree on whether to subtract the object's own
  size** (§5d). Freeform does; Drawing does not. Divergence of that kind is usually the
  defect, not a design.
- **`(W - offset) / 2` is not `(W / 2) - offset`** (§5a) — an easy transposition that
  produces a plausible-looking, always-slightly-wrong centre scaling with the offset.
- **A useful negative finding is worth recording**: the 2000 × 1500 stage is probably
  *not* the cause here (§5e), and the analogy to PATCH-130 should not steer the repair.
- **Operational, now confirmed twice:** `TaskStop` on `npm run dev` orphans the Next
  child. It survived again this turn as PID 8024 and required an explicit kill by port.
  The PATCH-130 §13 rule holds and should be treated as standing procedure.

---

## 15. Status

**PATCH-131: OPEN · DIAGNOSIS INCOMPLETE · IMPLEMENTATION BLOCKED.**

Source map complete (§3); root cause **suspected, not measured** (§5); reproduction
attempted and blocked on creation-affordance discovery (§2). **No production allowlist
granted** (§6). Next action is §11's bounded reproduction.

**PATCH-130 / 129 / 128: CLOSED** — not modified or reopened.
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-130 / 129 / 128 / 125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Inherited debt still unowned:** the production-build failure `TypeError: Cannot read
properties of undefined (reading 'length')` (PATCH-128 §34m); the shared-`.next` hazard
between `next dev` and `next build`; and Drawing Layout's inherited 2000 × 1500 Freeform
stage at `CanvasClient.tsx:6354` (PATCH-130 §6a), now relevant to a second patch.
