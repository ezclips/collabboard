# PATCH-131 — Keep newly created posts and containers inside the visible canvas

**Status: OPEN · NO USER-VISIBLE OFFSCREEN CREATION REPRODUCED IN MEASURED CASES ·
FREEFORM HOSTILE PAN/ZOOM PROVEN VISIBLE · DRAWING CENTRE-AS-TOP-LEFT ARITHMETIC PROVEN
BUT NOT USER-VISIBLE FAILURE · DRAWING ANTI-STACKING AND NAVIGATION PIPELINE
CHARACTERIZED · DATABASE PLACEMENT PRESERVED · TRANSIENT PRE-NAVIGATION VISIBILITY
UNPROVEN · USER-SPECIFIC REPRODUCTION REQUIRED · IMPLEMENTATION BLOCKED**

> Superseded in part by **§16** (bounded reproduction) and **§19** (follow-up
> diagnostic), both 2026-08-02. §3's "complete" source map and §5e's virtual-stage
> hypothesis are corrected in §16a/§16c; §5b is **proven but not a user-visible
> failure** (§19c); Freeform is **not defective on current evidence** (§19b). §1–§15 are
> retained unedited as the record of what was believed before measurement. **§20 stops
> autonomous diagnosis and requests a user reproduction.**

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

## 3. Source map — claimed complete; **CORRECTED BY §16a**

> **This heading was wrong.** §16a records three further production paths found by
> measurement — `usePadletSave`, `checkPlacementRequired`, and
> `handleDrawingNewContainer`'s anti-stacking loop — the last of which moves the final
> coordinate by ≈ +380 px per collision. This is a complete map of the two
> *centre-computation* sites, not of the placement pipeline. Read §16a with it.

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

---

## 16. Amendment — BOUNDED REPRODUCTION, PARTIAL (2026-08-02, CTO)

Result of the §11 bounded reproduction turn.

**Result: PARTIALLY REPRODUCED. Implementation remains BLOCKED.**

### 16a. §3's "complete" source map was not complete — corrected

§3 asserted a **complete** source map resolving all app-owned creation into two
placement computations. The reproduction found three further production paths that
materially affect the final coordinate and appear nowhere in that table:

| Path | Role |
|---|---|
| `usePadletSave` (`saveNote` et al.) | the actual caller of `getNewPostPosition`, per object type |
| `checkPlacementRequired` | gates `onDrawingPlacementStart` for new Drawing posts without `parentId` |
| `handleDrawingNewContainer` | applies an **anti-stacking displacement loop** after placement |

The last of these is decisive (§16f) and was missed entirely. **The §3 heading was
wrong and is corrected here: it was a complete map of the two *centre-computation*
sites, not of the placement pipeline.** A map that stops at the arithmetic and omits
what runs after it is not a map of where the coordinate comes from.

This is the second time in three patches that reading handlers produced a confident
and incomplete picture — the §1 and §14 caution against exactly this was correct, and
still understated.

### 16b. Freeform real UI paths — **PROVEN**

```
CanvasSidebar (non-semantic clickable div) → Note
  → handleToolClick("note") → NoteEditor → outside-click save
  → usePadletSave.saveNote → getNewPostPosition(280, 280)

CanvasSidebar (non-semantic clickable div) → Column
  → handleToolClick("container") → handleCreateEmptyFreeformContainer
```

**The toolbar creation controls are clickable `div` elements, not semantic buttons.**
That is precisely why §2a's button census returned 14 buttons and no creation action.
The §2a inference was right, and the standing repo lesson — *discover selectors live;
sidebar tools are `<div onClick>` with tooltip-span labels* — applied exactly as
written. **Recording that the blocker was a known, documented trap, not a novel one.**

### 16c. Freeform viewport classification — **DECIDED**

§11.3 named one measurement as the highest-value item in the reproduction, because it
would decide whether PATCH-131 is a placement-arithmetic patch or a second stage patch.
It was taken. At 1440×900:

| Property | Value |
|---|---|
| `containerRef` client area | ≈ **1440 × 900** |
| `scrollWidth` / `scrollHeight` | ≈ 10056 / 10024 |
| `overflow` | auto / auto |
| Inner stage | 2000 × 1500 |
| Inner-stage rect origin | ≈ left 56, top 24 |

**`containerRef` resolves to the real visible scrolling viewport.** The Freeform
placement formula is **not** reading the 2000 × 1500 stage.

**The §5e hypothesis is withdrawn: Freeform creation is not a recurrence of PATCH-130's
virtual-stage defect.** §5e predicted this as a negative and asked for the measurement
that would settle it; the prediction held. That is the one part of §5 that can now be
closed, and it closes as *not the cause* — which is worth as much as a positive finding,
because it stops the next turn chasing the PATCH-130 analogy.

Note also `scrollWidth ≈ 10056`, far larger than the 2000 px stage — the Freeform scroll
extent is its own thing, and the stage is not the boundary of the pannable area.

### 16d. Freeform neutral placement — **VISIBLE, not defective**

Created through the real UI at neutral scroll and zoom:

| Object | Persisted x, y | Size | Screen L, T → R, B |
|---|---|---|---|
| Note | 580, 310 | 280 × 280 | ≈ 636, 334 → 816, 414 |
| Container | 545, 300 | 350 × 300 | ≈ 601, 324 → 961, 474 |

Both match `x = viewportWidth/2 − objectWidth/2`, `y = viewportHeight/2 − objectHeight/2`.
**Both remained fully visible.**

**Neutral Freeform creation is not classified as defective**, and the user's reported
symptom was **not** reproduced in this case. §5b (object not offset by its own size)
is therefore **confirmed absent in Freeform** — the helper does subtract half the object
size, and the measurement proves it end-to-end rather than by reading.

### 16e. Freeform remaining risk — genuinely open

Freeform still appears to choose its centre without subtracting the ≈ 56 px occupied
left toolbar (consistent with the inner-stage origin at left 56 in §16c). But the
neutral objects stayed visible, hostile pan/zoom was not completed, and sidebar-open
and narrower viewports are unproven.

**Freeform is neither PASS nor a confirmed defect.** It must not be described as either
in the next turn.

### 16f. Drawing — real path partially proven, and confounded

```
CanvasSidebar Note → NoteEditor outside-click save
  → onDrawingPlacementStart → PlacementPrompt → New Container
  → handleDrawingNewContainer
```

Created: container at **x 4952, y 60**, 360 × 300, `childPadletIds` including the child;
child note at 0, 0, 300 × 200, `metadata.parentId` pointing at the new container. Live
container bounds after creation ≈ **877, 601 → 1235, 749.5**.

**The confound:** `handleDrawingNewContainer` applies an existing **anti-stacking loop**
displacing x by ≈ **+380 per conflict**. The persisted x is therefore the composition of

1. the initial placement input,
2. anti-stacking adjustment, and
3. later `scrollToContent` / navigation.

**x = 4952 cannot be attributed to the §5a/§5b arithmetic**, and no Drawing repair may
be authorized from this measurement. §5b remains a strong hypothesis for Drawing — the
formula still passes a scene-space centre straight into `position_x/position_y` without
subtracting half the object size — but it is **not established as the first failing
layer**, because two later stages can move the result.

This is the §16a miss doing real damage: had the anti-stacking loop been in §3, the
reproduction would have been designed to isolate it. §17.2 now requires choosing a
collision-free target area for exactly that reason.

### 16g. Consumer census — §11.7 satisfied

`getNewPostPosition` is consumed through **`usePadletSave`** for: note 280×280;
link 300×350; todo 300×350; table 400×300; container 350×300; comment 300×280;
card 180×220; image 300×200; drawing 400×300; AI component 500×400.

The shared prop bag passes from `CanvasClient` into `usePadletSave`. The **inline
duplicate formula is used only by `handleCreateEmptyFreeformContainer`**, and
`onDrawingPlacementStart` is invoked by `checkPlacementRequired` for new Drawing posts
without a `parentId`.

**This materially improves the allowlist picture** (§6): the blast radius of
`getNewPostPosition` is ten object types funnelled through **one** hook, not an
open-ended set of layouts. A single correction there reaches every type uniformly, and
the inline duplicate has exactly one caller. **The allowlist is still not granted** —
it should be written once §17 resolves whether Freeform needs changing at all.

### 16h. Reconciliation — **UNCLASSIFIED**, and now the top risk

After reload the new Drawing container remained persisted, but its live location was
not recovered in the current viewport without further navigation or panning. The run
did **not** determine whether reconciliation preserved x/y, whether the object was
merely outside the view, or whether the backing element and persisted post coordinates
diverged.

**§5f G remains unclassified.** §12 already names this as the condition that would
re-scope the patch: if a refetch rewrites position, a placement-only repair is
worthless. It is now the single most consequential unknown, and §17.6 must resolve it
before any implementation is considered.

### 16i. Status

**PATCH-131: OPEN · PARTIALLY REPRODUCED · FREEFORM NEUTRAL CREATION PROVEN VISIBLE ·
DRAWING REAL UI PATH PARTIALLY PROVEN · HOSTILE PAN/ZOOM UNPROVEN · DRAWING
ANTI-STACKING CONFOUNDS PLACEMENT · RECONCILIATION UNCLASSIFIED · IMPLEMENTATION
BLOCKED.**

Hypothesis ledger after this turn:

| Ref | Hypothesis | Status |
|---|---|---|
| 5a | Drawing screen→scene parenthesisation error | **unproven** — not isolated from §16f |
| 5b | Object not offset by its own size | **absent in Freeform** (§16d); **strong, unproven in Drawing** |
| 5c | Sidebar/toolbar geometry ignored | **plausible in Freeform** (§16e); unproven in Drawing |
| 5d | Inconsistent paths | **confirmed** by inspection and now by measured divergence |
| 5e | 2000 × 1500 virtual stage | **WITHDRAWN** (§16c) |
| 5f B | Stale pointer position | not investigated |
| 5f G | Reconciliation overwrites x/y | **unclassified — top risk** (§16h) |
| 5f H | Per-type divergent paths | partially addressed by §16g; ten types, one hook |
| — | **Anti-stacking displacement** | **NEW** (§16f) — not in the original diagnosis |

---

## 17. NEXT AUTHORIZED ACTION — one further bounded diagnostic turn

**Diagnosis only. No production file may be modified. No test file may be committed.
No implementation is authorized.**

1. **Drawing "Add to Existing"** path.
2. **Drawing free/new-container placement with a target area chosen to avoid
   anti-stacking collisions** — isolate the initial arithmetic from the ≈ +380
   displacement, and report the collision count observed.
3. **Hostile pan and zoom in both layouts** — the §11.5 matrix that was not completed.
4. **Drawing Presentation panel open versus closed.**
5. **Freeform left-toolbar and sidebar-open comparison** — resolve §16e.
6. **Initial live position vs persisted position vs post-refetch position** — resolve
   §16h / gate G.
7. **Exact scene coordinates before and after anti-stacking.**
8. **Whether the object is ever visibly offscreen before navigation moves the canvas** —
   a user-observable bad state is itself a defect even if the final position is correct.
9. **Whether normal creation can be reproduced offscreen in either layout** — the user's
   actual reported symptom, still not reproduced anywhere.
10. **Whether a shared repair remains safe, or the patch must split** into Freeform and
    Drawing patches.

**Report which matrix cells were not measured.** Partial coverage is acceptable and
expected; silently implying full coverage is not. §16 exists because the previous turn
reported honestly.

**Dev-server rule (PATCH-130 §13, now confirmed three times):** identify the listening
PID and port before measuring; confirm the base URL points at the healthy server; stop
the real child process afterward and verify no listener remains. `TaskStop` on
`npm run dev` orphans the Next child. Never delete `.next` while a server is alive.

**Standing prohibitions unchanged** (§12): do not modify or reopen PATCH-128, PATCH-129
or PATCH-130 or their accepted commits; do not call slide-frame navigation for new
posts; do not recentre the canvas to place a normal-sized post; do not move existing
objects; do not touch `CanvasClient.tsx:6354`; preserve the five protected paths
untouched and unstaged; credentials only via the named environment variables; identities
as **user ids only**.

---

## 18. Recorded diagnostic notes — this turn

- **A "complete" source map that stops at the arithmetic is not complete** (§16a). The
  anti-stacking loop runs *after* placement and moved x by thousands of pixels; omitting
  it made the original diagnosis structurally unable to reach a conclusion. **Map the
  whole pipeline from input to persisted value, not the formula.**
- **A confounded measurement is not weak evidence — it is no evidence for the confounded
  claim.** x = 4952 is a real number that says nothing about §5a/§5b, and treating it as
  support would have been the most natural error available this turn.
- **A withdrawn hypothesis is a result.** §5e cost one measurement and removed an entire
  wrong direction (§16c); naming it in advance as *probably not the cause*, with the
  measurement that would settle it, is what made it cheap.
- **The blocker in §2a was a documented trap, not a novel one** (§16b). The lesson
  existed and still cost a turn — evidence that a rule nobody re-reads at the moment of
  use does not function. Consider whether creation-affordance selectors belong in a
  reusable harness rather than a lesson.
- **The user's reported symptom has still not been reproduced anywhere.** Neutral
  Freeform creation is visible; Drawing is confounded. Until §17.9 reproduces an
  offscreen creation, this patch has a defect report and a set of suspicious formulas,
  **but no demonstrated failure.** That gap must stay visible in the status line.

---

## 19. Amendment — §17 FOLLOW-UP DIAGNOSTIC (2026-08-02, CTO)

Result of the §17 bounded diagnostic turn.

**Result: STILL PARTIALLY REPRODUCED. A user-visible offscreen creation was not
reproduced through any measured real UI path. Implementation remains BLOCKED.**

### 19a. The headline, stated plainly

Three diagnostic turns have now measured both layouts across neutral and hostile
scroll/zoom, panel open and closed, and after reload. **Every measured final
user-visible result stayed inside the usable canvas.**

The repository currently demonstrates:

- **no confirmed Freeform defect**;
- **no confirmed final Drawing visibility defect**;
- a **possible unmeasured transient** Drawing state before `scrollToContent`;
- **incomplete** stable-ID backing-element restoration evidence after reload.

This is a negative result, and it is recorded as one. §9's expected behaviour is
currently *met* in every case measured.

### 19b. Freeform — hostile pan/zoom proven visible, **no defect reproduced**

Real paths: `CanvasSidebar Note → NoteEditor → outside-click save →
getNewPostPosition(280, 280)`, and `CanvasSidebar Column →
handleCreateEmptyFreeformContainer`.

| Viewport | Scroll | Zoom | Persisted x, y | Screen bounds | Visible |
|---|---|---|---|---|---|
| 1920×1080 | 0 / 0 | 1.0 | 820, 400 | ≈ 876, 424 → 1056, 504 | **yes** |
| 1440×900 | 2500 / 1800 | 1.0 | 3045, 2100 | ≈ 601, 324 → 961, 474 | **yes** |
| 1366×768 | 4200 / 4200 | 1.2 | 3929, 3680 | ≈ 570.8, 240 → 786.8, 336 | **yes** |
| 1024×768 | 5000 / 2200 | 0.8 | 6715, 3080 | ≈ 428, 288 → 716, 408 | **yes** |

**All measured Freeform objects remained fully visible**, including under substantial
pan in both axes and at zoom 0.8 and 1.2.

**FREEFORM REPAIR NOT JUSTIFIED BY CURRENT EVIDENCE. Freeform must not appear in a
future implementation allowlist unless a real failing case is produced.**

This also resolves §16e: the ≈ 56 px left-toolbar inset that Freeform does not subtract
is real, but it does not produce a visibility failure at any measured state. **A
theoretical inset error that never puts an object offscreen is not a defect** — it is a
note.

### 19c. Drawing — the arithmetic is **PROVEN**, the defect is not

The §17.2 collision-free case isolated the initial arithmetic exactly as required:

| Input | Value |
|---|---|
| `scrollX` / `scrollY` | 0 / 0 |
| `zoom` | 1 |
| `offsetLeft` / `offsetTop` | 0 / 0 |
| Computed centre | **720, 450** |
| Anti-stacking attempts | **0** |
| Persisted container | **x 720, y 450**, 360 × 300 |
| Final visible bounds | ≈ 877, 601 → 1235, 749.5 |
| Usable canvas | ≈ 56, 0 → 1440, 900 |

**Persisted x/y equals the computed centre exactly. §5b is PROVEN: Drawing stores the
computed centre as the object's top-left, without subtracting half the object size.**

**And the object remained fully visible.**

Both halves matter. The arithmetic hypothesis I have carried since §5b is now
confirmed as arithmetic — and simultaneously shown *not* to produce the reported
symptom at the measured viewport. **"Centre stored as top-left" must not be promoted
from suspicious arithmetic to confirmed defect without an actual visibility failure.**

That distinction is the whole content of this turn. A wrong-looking formula whose
output is correct in every measured case is a latent risk, not a reproduced bug, and
repairing it would be repairing a hypothesis rather than a defect.

Note the clean case also had `offsetLeft = 0`, which means **§5a — the
`(W − offsetLeft) / 2` parenthesisation error — was not exercised**. At
`offsetLeft = 0` the wrong and right formulas coincide. §5a therefore remains
**unproven and untested**, not disproven.

### 19d. Drawing — anti-stacking and navigation characterized

- anti-stacking shifts x by ≈ **380 px per collision**;
- observed cases used between **1 and ≈ 8–12 iterations**;
- the final `scrollToContent` navigation **kept the created container visible**;
- persisted x is the composition of initial placement → anti-stacking → navigation.

**The anti-stacking pipeline must be preserved in any future diagnosis**, and any
future repair must account for it rather than assume placement is the last writer.
This is the §16a finding now fully characterized.

### 19e. Drawing — Presentation panel open vs closed

| State | Panel width | Usable right | Final bounds | Result |
|---|---|---|---|---|
| Closed | — | ≈ 1440 | ≈ 877, 601 → 1235, 749.5 | visible |
| Open | ≈ 320 | ≈ 1120 | ≈ 261, 601 → 619, 749.5 | **visible, no overlap** |

The initial placement arithmetic ignores the panel — §5c confirmed as written — **but
the measured final navigation kept the object visible and clear of the panel.** No
panel-related disappearance was reproduced.

The mechanism is worth noting: PATCH-130's navigation repair centres on the *usable*
canvas, so it is currently **compensating for** placement's panel-blindness. That is
fortunate rather than designed, and it means a future change to either could expose
the other.

### 19f. Add to Existing

Child note receives the selected container's `parentId`; child has independently
persisted x/y from the ghost drop; the parent container does not move; no root backing
element is expected for a parented child. **No disappearance reproduced.**

### 19g. Reconciliation — **gate G partially resolved**

- persisted database coordinates **matched the initial saved coordinates**;
- reload **preserved `position_x` and `position_y`**;
- **no database overwrite of placement was observed.**

Still unproven: stable-ID navigation back to the created object after reload, and the
exact restored backing-element geometry after reload.

**Classification: DATABASE PLACEMENT PRESERVED · BACKING-ELEMENT RESTORATION PARTIALLY
UNPROVEN.**

§16h named this the top risk on the grounds that a placement-only repair would be
worthless if refetch rewrote position. **It does not.** The top risk is retired, and
§5f G moves from unclassified to partially resolved.

### 19h. Temporal visibility — the one live possibility

The run did not sample the interval between scene insertion and `scrollToContent`
tightly enough to establish whether the user briefly sees an offscreen object.

**This is the only plausible visibility failure not ruled out by the measured final
states**, and it is a genuinely good fit for the user's report: an object that is
briefly wrong and then moves would read as "it wasn't created" or "I had to hunt for
it", while leaving every final-state measurement clean.

**Do not infer a transient defect without timing evidence.** §8's own prohibition on
user-observable temporary offscreen positions applies here, but it cannot be enforced
against an unmeasured interval.

### 19i. Root-cause ledger — current state

| Claim | Status |
|---|---|
| Freeform virtual-stage hypothesis (§5e) | **REJECTED** |
| Freeform hostile placement failure | **NOT REPRODUCED** |
| Drawing centre-as-top-left arithmetic (§5b) | **PROVEN** |
| Drawing user-visible offscreen result | **NOT REPRODUCED** |
| Drawing anti-stacking displacement | **PROVEN** |
| Drawing final navigation visibility | **PROVEN in measured cases** |
| Persistence overwrite (§5f G) | **NOT OBSERVED** |
| Drawing screen→scene parenthesisation (§5a) | **UNPROVEN — untested at `offsetLeft = 0`** |
| Transient pre-navigation visibility | **UNPROVEN — the only open candidate** |

### 19j. Shared repair decision — **NOT AUTHORIZED**

**A shared Freeform/Drawing repair is not authorized.** The layouts differ materially
in coordinate system, placement pipeline, anti-stacking behaviour, navigation behaviour
and persistence semantics. §7's provisional "one arithmetic helper, two input sources"
shape is **withdrawn as premature**: it was designed to unify two paths on the
assumption both were defective, and only one has proven arithmetic — which produces no
failure.

**If a future repair is justified, the likely scope is Drawing-only, and it must be
based on a reproduced failing case.**

### 19k. Status

**PATCH-131: OPEN · NO USER-VISIBLE OFFSCREEN CREATION REPRODUCED IN MEASURED CASES ·
FREEFORM HOSTILE PAN/ZOOM PROVEN VISIBLE · DRAWING CENTRE-AS-TOP-LEFT ARITHMETIC PROVEN
BUT NOT USER-VISIBLE FAILURE · DRAWING ANTI-STACKING AND NAVIGATION PIPELINE
CHARACTERIZED · DATABASE PLACEMENT PRESERVED · TRANSIENT PRE-NAVIGATION VISIBILITY
UNPROVEN · USER-SPECIFIC REPRODUCTION REQUIRED · IMPLEMENTATION BLOCKED.**

---

## 20. NEXT ACTION — stop autonomous diagnostics; request user reproduction

**Broad autonomous diagnosis is stopped.** Three turns have measured the plausible
matrix and found no failing case. Further unguided sweeps would spend effort at a
falling rate of return, and the remaining candidate (§19h) is a millisecond-scale
transient that only the reporter can point at.

**Required from the user before any further work:**

1. layout — **Freeform or Drawing**;
2. exact **object type**;
3. exact **creation action** taken;
4. whether a **panel/sidebar was open**;
5. current **zoom**;
6. approximate **pan position**;
7. whether the object **never appears**, or **appears briefly and then moves**;
8. a **screenshot or short screen recording** showing the full canvas before and after;
9. whether the object **appears after manually panning**;
10. whether it happens **every time or intermittently**.

Item 7 is the highest-value single answer: it discriminates directly between a
placement defect and the §19h transient, which is the only branch still open.

**After that evidence arrives, authorize only a narrow reproduction matching those
exact conditions.** Do not authorize implementation from the currently suspicious
formulas alone.

---

## 21. Recorded diagnostic notes — this turn

- **A proven wrong formula is not a proven defect.** §5b is now confirmed arithmetic —
  Drawing does store the centre as the top-left — and it produced a fully visible object
  in every measured case. Repairing it today would be repairing a hypothesis. **The
  standard is a reproduced failing case, and it does not relax because the code looks
  wrong.**
- **A clean isolating case can silently fail to exercise the thing it was meant to
  test.** The §17.2 collision-free run had `offsetLeft = 0`, where §5a's wrong and right
  formulas are numerically identical. The case proved §5b and said nothing about §5a —
  and would have read as exonerating it. **Check that the isolating conditions still
  exercise the hypothesis.**
- **One subsystem can be compensating for another's defect** (§19e). Placement ignores
  the panel; PATCH-130's navigation centres on the usable canvas and rescues it. Neither
  is safe to change in isolation without re-measuring the other.
- **Retiring the top risk is a result worth stating.** §16h called reconciliation the
  most consequential unknown; it is now measured and clean (§19g). Naming the top risk
  in advance is what made it the first thing checked.
- **Three diagnostic turns with no reproduction is itself information.** It shifts the
  probability toward a transient, an environment-specific condition, or a path not yet
  mapped — and it is the point at which asking the reporter beats sweeping further.
