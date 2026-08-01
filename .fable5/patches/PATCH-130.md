# PATCH-130 — Presentation frame centering and fit in Drawing Layout

**Status: OPEN · DIAGNOSIS COMPLETE · REPRODUCED · IMPLEMENTATION AUTHORIZED (BOUNDED) · NOT STARTED**

Authored 2026-08-02 by CTO (governance and diagnosis only — no implementation in the
authoring turn). Starting HEAD verified at **`edd4154`** (PATCH-129 closed; the
lessons-learned commit was offered but never created, so `edd4154` is HEAD).

**PATCH-128 and PATCH-129 are CLOSED. Do not modify or reopen them.**

---

## 1. Observed defect (user report)

In Drawing Layout with the Presentation panel open:

1. creating a new slide does not reliably centre the new frame in the visible canvas;
2. clicking a slide thumbnail selects the correct slide, but the frame may remain
   substantially outside the visible viewport — far right or partly hidden behind the
   panel, with the canvas staying at 100 % zoom despite the frame not fitting.

**Both reproduced.** This is canvas navigation to presentation frames — not the
PATCH-129 preview-modal defect.

---

## 2. Reproduced paths and source map

| Property | Value |
|---|---|
| **Route** | `/dashboard/canvas/[id]` (canvas `0c65aa8e-99a0-4c82-9816-4c838526b838`, 4 slides) |
| **Layout** | Drawing Layout |
| **Panel entry** | toolbar **Present Frames** → `activeTool === 'present'` |

| Concern | Path |
|---|---|
| Panel mount (**320 px `fixed` overlay, `z-[500]`**) | `DrawingLayout.tsx:3355-3356` |
| Slide-card click → activate | `PresentationPanel.tsx` `onActivateSlide` → `DrawingLayout.tsx:2216-2226` `handleActivateSlide` |
| Create slide | `DrawingLayout.tsx:1548-1564` `handleAddSlide` |
| Create slide below | `DrawingLayout.tsx:1566-1581` `handleAddSlideBelow` |
| Existing measured sidebar inset | `DrawingLayout.tsx:913-951` (`--drawing-visible-canvas-right-inset`) |
| **Stage sizing (deeper cause)** | `app/dashboard/canvas/[id]/CanvasClient.tsx:6354` |

```js
// DrawingLayout.tsx:2216 — existing-slide navigation
const handleActivateSlide = useCallback((slideId: string) => {
  setActiveSlideId(slideId);
  const frameElement = elements.find((el: any) => el.id === slideId);   // React state
  if (excalidrawAPI && frameElement) {
    excalidrawAPI.scrollToContent([frameElement], { fitToContent: true, animate: true, duration: 500 });
  }
}, [elements, excalidrawAPI]);
```

---

## 3. Measured geometry

### 3a. Existing-slide click (path A) and new slide (path B)

Frame `idx0` = 800 × 452.9 at scene x 0; frame `idx3` = 1280 × 720 at scene x 4080.

| Viewport | Path | zoom | Frame screen L→R | Usable right | Offset from **usable** centre | Offset from **window** centre | Edges L/R/T/B | Under sidebar |
|---|---|---|---|---|---|---|---|---|
| 1920×1080 | A idx0 | 1.0 | 600 → 1400 | 1600 | (+200, +210) | (+40, +210) | ✓✓✓✓ | no |
| 1920×1080 | A idx3 | 1.0 | 360 → 1640 | 1600 | (+200, +210) | (+40, +210) | ✓✗✓✗ | **yes** |
| 1920×1080 | B new | 1.0 | 360 → 1640 | 1600 | (+200, +210) | (+40, +210) | ✓✗✓✗ | **yes** |
| 1440×900 | A idx0 | 1.0 | 600 → 1400 | 1120 | (+440, +300) | (+280, +300) | ✓✗✓✗ | **yes** |
| 1440×900 | A idx3 | 1.0 | 360 → 1640 | 1120 | (+440, +300) | (+280, +300) | ✓✗✓✗ | **yes** |
| 1440×900 | B new | 1.0 | 360 → 1640 | 1120 | (+440, +300) | (+280, +300) | ✓✗✓✗ | **yes** |
| 1366×768 | A idx0 | 1.0 | 600 → 1400 | 1046 | (+477, +366) | (+317, +366) | ✓✗✓✗ | **yes** |
| 1366×768 | A idx3 | 1.0 | 360 → 1640 | 1046 | (+477, +366) | (+317, +366) | ✓✗✓✗ | **yes** |
| 1366×768 | B new | 1.0 | 360 → 1640 | 1046 | (+477, +366) | (+317, +366) | ✓✗✓✗ | **yes** |

**The frame's final screen position is byte-identical across all three viewports.**
A correct centre/fit is necessarily viewport-dependent, so this alone proves the
navigation is not centring against anything the user can see. **Zoom never leaves
1.0**, even where a 1280 × 720 frame cannot fit a 1046 px usable width.

Re-clicking the same slide returns identical values — **no drift**, so §T7 is already
satisfied by the current code and must remain so.

### 3b. Navigation timeline after a slide click (1366×768)

| Sample | zoom | scrollX | `selectedElementIds` |
|---|---|---|---|
| pre-click | 1.0 | −2360 | `[]` |
| t+50 ms | 1.0 | −3162.9 | `[]` |
| t+100 ms | 1.0 | −3451.5 | `[]` |
| t+200 ms | 1.0 | −3579.6 | `[]` |
| t+400 ms | 1.0 | −3719.9 | `[]` |
| t+700 ms → t+6000 ms | 1.0 | **−3720 (stable)** | `[]` |

`scrollToContent` **does run** — the smooth 500 ms animation is visible — and its
result **is never overwritten**. So the defect is not a race and not a
later reconciliation.

**`selectedElementIds` remains empty throughout.** The frame is never selected in
Excalidraw; only the app-level `activeSlideId` changes.

### 3c. The decisive measurement — Excalidraw's own canvas bounds

| Viewport | `appState.width` × `height` | `offsetLeft` | `.excalidraw` box | Window |
|---|---|---|---|---|
| 1920×1080 | **2000 × 1500** | 56 | x 56 → 2056 | 1920 × 1080 |
| 1366×768 | **2000 × 1500** | 56 | x **−634** → 1366 | 1366 × 768 |

**Excalidraw believes its canvas is 2000 × 1500 at every viewport.** The container is
forced by an ancestor carrying inline `min-width: 2000px; min-height: 1500px`, inside
an `overflow-hidden` viewport. At 1366 px the stage hangs 634 px off the **left** of
the window.

---

## 4. Root cause — classification **H**, composed of **G + C + F**

### 4a. PRIMARY — **G**: the helper centres against canvas bounds that are fixed and far larger than the visible area

`CanvasClient.tsx:6354` sizes the post stage:

```js
: { minWidth: '2000px', minHeight: '1500px' }
```

This is the **Freeform "large stage"** branch. Drawing Layout is not wall, grid,
columns, timeline, kanban, scheduler or map, so it **falls through to that fallback
and inherits a stage sized for absolute post positioning.** Excalidraw renders
`absolute inset-0` inside it and therefore reports `appState.width/height` of
2000 × 1500.

Every viewport-relative Excalidraw operation — `scrollToContent`, `fitToContent`,
zoom-to-fit — is computed against that virtual 2000 × 1500 area. It is:

- **viewport-independent**, which is exactly what §3a measured;
- **larger than any real viewport**, so `fitToContent` concludes a 1280 × 720 frame
  already fits and **never adjusts zoom** (§3b);
- **positioned differently per viewport** (§3c), so "centred in the canvas" maps to a
  different, wrong window position at each size.

**This is the first failing layer.** Nothing downstream can be correct while the
helper's notion of the canvas is wrong.

### 4b. SECONDARY — **C**: the sidebar is never subtracted

The panel is a **320 px `fixed` overlay** (`DrawingLayout.tsx:3356`), so it occludes
the canvas without shrinking it. Even with correct canvas bounds, centring would
target the full width and place the frame ~160 px right of the usable centre.

**The usable rectangle is already measured and available.**
`DrawingLayout.tsx:913-951` computes the sidebar inset with a `ResizeObserver` and
publishes `--drawing-visible-canvas-right-inset`, but consumes it **only for zoom-
control placement** (`--drawing-zoom-controls-right`). The navigation path ignores it.

This materially lowers the cost of the repair: **the geometry exists; it is simply not
consumed.** No new measurement lifecycle is required.

### 4c. TERTIARY — **F**: creation and selection use inconsistent paths

| | Element source | Timing |
|---|---|---|
| `handleAddSlide` / `handleAddSlideBelow` | `excalidrawAPI.getSceneElements()` — **live scene** | `setTimeout(…, 50)` |
| `handleActivateSlide` | `elements` — **React state** | immediate |

`elements` is the PATCH-128 settled-propagation output, advanced on a 150 ms debounce.
A frame absent from React state yields **no navigation at all** — `handleActivateSlide`
silently does nothing when `frameElement` is undefined. The creation path avoids this
by reading the live scene, which is why the two paths behave differently.

**Not observed failing in §3** (path B navigated), but it is a real latent
inconsistency and the §10 contract requires unifying it.

### 4d. Additional finding — selection is never applied to Excalidraw

`selectedElementIds` stays `[]` through every navigation (§3b). `handleActivateSlide`
sets only the app-level `activeSlideId`. The user's report that the correct slide *is*
selected refers to the panel highlight, not canvas selection.

### 4e. Explicitly excluded

- **A** — a navigation call *does* occur and *does* take effect (§3b).
- **B** — path B navigated with the new frame present; frame counts went 4 → 5.
- **D** — not a settling race: the value converges by t+700 ms and holds to t+6000 ms.
- **E** — nothing overwrites the result; it is stable for at least 6 s.
- **I** — evidence is sufficient.

---

## 5. Fit / centering policy (governed)

```
usableCanvas = visible canvas rect
             − left toolbar inset (measured, 56 px observed)
             − presentation sidebar inset (measured; --drawing-visible-canvas-right-inset)

scale = min(
  usableWidth  / (frameWidth  + 2 * padding),
  usableHeight / (frameHeight + 2 * padding),
  MAX_SCALE          // intentional cap; the frame must not be enlarged past it
)

centre the frame within usableCanvas
```

- **Padding must be a single named constant**, stated in the implementation, not
  scattered magic numbers.
- **`MAX_SCALE` must be explicit** so a small frame is not blown up on a large display.
- **Zoom changes only when needed** — if the frame already fits entirely within the
  usable rect at the current zoom, do not change zoom.
- **Every deduction must be measured**, never assumed. `56` and `320` appear in this
  document as *observations*, not as constants to hard-code.

**Arbitrary fixed scroll offsets are not authorized.**

---

## 6. Production allowlist — bounded

| File | Permitted scope |
|---|---|
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | `handleActivateSlide`, `handleAddSlide`, `handleAddSlideBelow`, and a new shared navigation helper; may consume the existing measured sidebar inset |

**One production file.** An allowlist entry is permission, not an instruction.

### 6a. `CanvasClient.tsx:6354` is NOT authorized

The 2000 × 1500 stage is the deeper cause (§4a), and correcting it there would be the
more fundamental repair. **It is deliberately excluded from this patch.**

`CanvasClient.tsx` is the 8.5 k-line file under active strangulation, and line 6354 is
a shared fallback branch reached by **Freeform and every layout without its own
branch**. Changing it would alter post-stage geometry for those layouts, with a blast
radius far beyond presentation navigation and no characterization net covering it.

**The repair must therefore compute the correct target scroll/zoom explicitly from the
measured usable rectangle and apply it, rather than relying on `scrollToContent`'s
canvas-relative math.** Excalidraw's belief about its own size becomes irrelevant when
the target viewport transform is computed directly.

**Recorded for a future patch:** the Drawing Layout stage inherits Freeform sizing at
`CanvasClient.tsx:6354`; giving Drawing Layout its own branch is the correct long-term
fix and needs its own patch, characterization and blast-radius analysis. **Do not
begin it here.**

## 7. Test allowlist — bounded

| File | Status |
|---|---|
| `e2e/characterization/patch-130-slide-navigation.spec.ts` | **NEW — may be created** |

No existing test file may be modified. **`patch-128-slide-sync.spec.ts` and
`patch-129-preview-fit.spec.ts` are closed.**

---

## 8. Prohibited changes

The repair must not:

- change frame scene coordinates to make them visible, or move slides on the canvas;
- alter presentation order or slide thumbnails;
- change PATCH-128 synchronization or PATCH-129 preview-modal sizing;
- break manual pan/zoom, or recentre after the user begins navigating;
- force zoom on unrelated canvas selection;
- hide or close the Presentation panel;
- introduce polling;
- hard-code the 56 px toolbar or 320 px sidebar widths;
- modify `CanvasClient.tsx` (§6a).

---

## 9. Implementation contract

1. **One shared navigation helper** used by both existing-slide activation and slide
   creation — eliminating §4c.
2. It must **read the frame from the live scene** (`getSceneElements()`), not React
   `elements`, so a newly created frame is always present.
3. It must **compute the usable rectangle from measured geometry**, consuming the
   existing sidebar-inset measurement (§4b) rather than adding a second one.
4. It must **compute and apply the target scroll and zoom explicitly** per §5.
5. It must **not fire when the frame is absent**; instead retry on the next settled
   scene, or defer until the frame exists. **Silent no-op is not acceptable.**
6. **Repeated activation of the same slide must remain stable** (§3a shows no drift
   today; that property must survive).
7. Selection behaviour: if the frame is to be selected in Excalidraw, do so
   deliberately and state it. **Do not change selection semantics as a side effect.**

---

## 10. Acceptance tests — mandatory

`e2e/characterization/patch-130-slide-navigation.spec.ts`, geometric assertions only
(bounding boxes, `appState` scroll/zoom, computed usable rect) — **not screenshots**:

1. clicking an existing slide thumbnail navigates;
2. the correct frame ID becomes active;
3. all four frame edges lie inside the usable canvas region;
4. frame centre is close to the usable-canvas centre (stated tolerance);
5. the frame does not overlap the Presentation sidebar;
6. zoom is finite and appropriate;
7. re-clicking the same slide does not drift;
8. switching between distant slides centres each correctly;
9. creating a new slide centres and fits the new frame;
10. new-slide navigation waits until the live frame exists;
11. sidebar-open geometry is accounted for;
12. resize with the sidebar open recomputes where required;
13. manual pan after navigation is not immediately overwritten;
14. no page or console errors;
15. PATCH-128 thumbnail behaviour remains intact.

**Required viewports: 1920×1080, 1440×900, 1366×768.** At least one case must assert
a **viewport-dependent** result — that the same slide lands at different scroll values
at two viewport sizes. §3a's byte-identical rows are the defect's signature, and a
test that cannot detect them does not cover this patch.

**Carried from PATCH-128 §30k / §31b and PATCH-129 §10:** acceptance evidence must
live in the committed suite; the test must prove the navigation mechanism actually ran
— assert the scroll/zoom transform changed, and that the intended frame ID was the
target — **before** asserting centring; and it must pass under `--repeat-each=3`.

---

## 11. Hard stops

Stop and report rather than proceeding if:

- correct centring cannot be achieved without modifying `CanvasClient.tsx`;
- the usable rectangle cannot be measured without a second observer;
- a test passes only by weakening an assertion or widening a tolerance to hide an
  offset;
- manual pan/zoom regresses;
- the fit depends on a constant not derived from measured UI bands.

**Do not modify or reopen PATCH-128 or PATCH-129, or any of their accepted commits
(`400f056`, `56592ab`, `ea7775b`, `39e5578`, `0f8762f`, `2228641`).**

**Protected unrelated paths — preserve untouched and unstaged, never modify, never
stage:** `.gitignore`, `app/api/ai/classify-intent/route.ts`,
`app/api/ai/convert-component/route.ts`, `app/api/ai/generate-component/route.ts`,
`scripts/live-access-login.mjs`.

Credentials only via `LIVE_ACCESS_EMAIL` / `LIVE_ACCESS_PASSWORD` and `E2E_EMAIL` /
`E2E_PASSWORD`; never printed, logged, committed or copied into a report. `.env.local`
must not be modified. Identities reported as **user ids only — never an email, never a
token, never cookies.**

Do not modify `node_modules` or `excalidraw_fork`. Do not begin PATCH-126/118/119. Do
not resume PATCH-127.

---

## 12. Commit contract

- Implementation: `fix(drawing): center presentation frames in the usable canvas`
- Tests: `test(drawing): characterize slide frame centering`

**Do not push unless explicitly instructed. Do not close PATCH-130.**

---

## 13. Recorded diagnostic notes

- **A viewport-independent result from a viewport-relative operation is proof the
  operation is measuring something else.** §3a's identical rows across three viewports
  identified the failing layer before any source was read — the same signature as
  PATCH-129 §3b's constant 686.3 px height. **This is now twice in two patches; treat
  "constant where it should vary" as a primary diagnostic.**
- **A smooth, stable, correct-looking animation can still be centring against the
  wrong rectangle.** The navigation animates convincingly and never gets overwritten;
  only comparing against the *usable* rect exposed it.
- **Geometry that is already measured may still not be consumed.**
  `--drawing-visible-canvas-right-inset` has existed all along, used only for zoom-
  control placement. Check for an existing measurement before adding one.
- **A layout inheriting another layout's fallback branch** (`CanvasClient.tsx:6354`,
  Drawing falling into Freeform's large-stage case) is invisible at the call site and
  produced a defect three components away.
- **Operational:** `TaskStop` on `npm run dev` kills the wrapper but **orphans the Next
  child process**, which keeps port 3000 bound and serves from a deleted `.next`. The
  replacement server silently took port 3002 and the first measurements were taken
  against the broken orphan. Kill by port, and confirm the port in the dev log before
  measuring.

---

## 14. Status

**PATCH-130: OPEN · DIAGNOSIS COMPLETE · REPRODUCED · IMPLEMENTATION AUTHORIZED
(BOUNDED) · NOT STARTED.**

**PATCH-129: CLOSED. PATCH-128: CLOSED.** Neither modified nor reopened.
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Deferred to a future patch:** Drawing Layout's 2000 × 1500 stage inherited from the
Freeform fallback at `CanvasClient.tsx:6354` (§6a).

**Inherited debt still unowned:** the production-build failure `TypeError: Cannot read
properties of undefined (reading 'length')`, carried from PATCH-128 §34m; and the
shared-`.next` hazard between `next dev` and `next build`, now compounded by the
orphaned-process/port-reassignment failure recorded in §13.

---

## 15. Amendment — IMPLEMENTATION ACCEPTED; PATCH-130 CLOSED (2026-08-02, CTO)

Independent acceptance review of implementation commit **`0262405`** against the §5–§11
authorization.

**Result: ACCEPT WITH NON-BLOCKING FINDINGS. CLOSE PATCH-130.**

### 15a. Scope verified — exactly two files, deletions inspected

`0262405` changes exactly:

1. `components/collabboard/canvas/layouts/DrawingLayout.tsx` (+98 / −13)
2. `e2e/characterization/patch-130-slide-navigation.spec.ts` (new, +348)

**Confirmed unchanged:** `CanvasClient.tsx`; PATCH-128 and PATCH-129 files, tests and
governance; `PresentationPanel.tsx`; `RuntimeSlideRenderer.tsx`;
`FullscreenPresentation.tsx`; `getSlideRenderSignature.ts`; PATCH-124 scheduling;
presentation order logic; thumbnail generation; the five protected paths; package
files; `node_modules`; `excalidraw_fork`.

Per the §33a rule established in PATCH-128, the **13 deletions were read, not
assumed**. All thirteen are the three old `scrollToContent` navigation calls and their
dependency arrays — the exact code §9 required replacing. **No assertion, guard or
unrelated line was removed.**

**§6a held: `CanvasClient.tsx:6354` was not touched.** The deeper cause remains
deliberately deferred, and the implementer respected a boundary that would have been
the easier fix.

### 15b. Shared navigation helper — **PASS**

One helper, `navigateToPresentationFrame` (`DrawingLayout.tsx:1584-1626`), used by
existing-slide activation, new-slide creation and add-slide-below. **No divergent
centring algorithms remain**, resolving §4c.

It re-queries the target frame from the **live Excalidraw scene** (L1590-1592) rather
than React `elements` — the §9.2 requirement, and the precise inconsistency §4c
identified. It moves and resizes nothing, alters no presentation order, applies only
`appState` and selection, and uses `commitToHistory: false` (L1623) so navigation
never pollutes undo history.

### 15c. Usable-canvas geometry — **PASS**

`getPresentationNavigationUsableRect` (L1550-1582) derives the rectangle from
`viewportContainerRef` DOM bounds with a `drawingRootRef` fallback, subtracts the
sidebar via `presentationSidebarRef.getBoundingClientRect()` (L1557-1560), and applies
`offsetLeft` / `offsetTop` as **measured** insets (L1561-1566).

**No fixed 320 px or 56 px assumption appears anywhere** — §8's explicit prohibition,
and the §5 requirement that every deduction be measured rather than assumed.

Decisively: **the calculation does not read `appState.width` or `appState.height`.**
Those remain bound to the oversized 2000 × 1500 virtual stage (§4a), and the repair
simply stops asking Excalidraw what it thinks its canvas is. That is exactly the
strategy §6a mandated when it excluded `CanvasClient.tsx` — the wrong self-belief is
routed around rather than corrected, keeping the blast radius at one file.

### 15d. Zoom policy — **PASS**

```js
const PRESENTATION_FRAME_NAVIGATION_PADDING_PX = 48;   // L101
const PRESENTATION_FRAME_NAVIGATION_MAX_ZOOM = 1;      // L102

const fitZoom = Math.min(
  usableRect.width  / (liveFrame.width  + 2 * PADDING),
  usableRect.height / (liveFrame.height + 2 * PADDING),
  MAX_ZOOM,
);
const targetZoom = Math.min(finiteCurrentZoom, finiteFitZoom, MAX_ZOOM);
```

Both axes are consulted, the padding and cap are **named constants** per §5, and every
term is guarded for finiteness and positivity (L1605-1607). Zoom never exceeds 1, so
small frames are not enlarged; large frames scale down; aspect ratio is preserved
because a single scalar drives both axes; frame scene dimensions are untouched.

`Math.min(finiteCurrentZoom, …)` **retains an already-smaller zoom**, satisfying §5's
"zoom changes only when needed" and avoiding a jarring zoom-in on a user who has
deliberately zoomed out.

### 15e. Scroll policy — **PASS**

```js
scrollX: (usableRect.centerX - offsetLeft) / targetZoom - frameCenterX,   // L1616
scrollY: (usableRect.centerY - offsetTop)  / targetZoom - frameCenterY,   // L1617
```

This maps the frame centre onto the **usable-canvas** centre, accounts for Excalidraw's
offsets, excludes the sidebar, and — the property that defines this patch — **produces
a viewport-dependent result.** Frame scene coordinates are not altered, satisfying §8's
first prohibition.

### 15f. Frame selection — **PASS**

`selectedElementIds` is set to the intended live frame **only**, with `selectedGroupIds`
emptied, `selectedLinearElement` and `activeEmbeddable` nulled (L1618-1621). Frame
contents and unrelated elements are not selected, and both paths behave identically.

This resolves §4d, where selection was never applied to Excalidraw at all. §9.7 required
the change be deliberate and stated rather than incidental; it is.

### 15g. Existing-slide and new-slide paths — **PASS**

`handleActivateSlide` (L2309-2311) sets the active slide ID, attempts navigation
immediately from the live scene, and falls back to the bounded RAF path only if the
frame is not yet present. The old `scrollToContent` call is gone and nothing overwrites
the result afterward.

New-slide creation inserts the frame first, then calls the same helper through
`navigateToPresentationFrameSoon` (L1628-1635) — **at most two `requestAnimationFrame`
callbacks, no polling** (§8), re-querying the live scene each time. No second click is
required, and nothing is computed from a pre-creation scene.

### 15h. Manual navigation stability — **PASS**

Navigation runs only on explicit actions — slide activation, creation, add-below. It is
not an effect, does not run per render, does not recentre during sidebar churn, and
creates no continuous loop.

**The committed test verifies manual wheel pan survives an 800 ms observation window.**
This is the §8 "must not recentre after the user begins navigating" clause proven rather
than asserted, and it is the requirement most likely to regress silently in a future
refactor.

### 15i. Committed test coverage — **PASS**

`e2e/characterization/patch-130-slide-navigation.spec.ts` drives the real UI for both
paths and proves: panel open; intended slide active; intended live frame present;
frame-only selection; all four edges inside the usable canvas; no sidebar overlap;
**centre within 4 px of the usable centre**; finite positive zoom ≤ 1; no drift on
repeated selection; stability across distant-slide round trips; automatic centring of a
newly created frame; updated geometry after resize plus reselection; and manual pan
preserved.

**Viewport matrix: 1920×1080, 1440×900, 1366×768, 1180×760** — the three §10-required
sizes plus one narrower.

### 15j. Viewport-dependence regression — **PASS, and this is the gate that matters**

The committed test explicitly proves final scroll or zoom **differs between materially
different viewport sizes**.

§3a's signature was a frame landing at screen L360 → R1640 at zoom 1.0, **byte-identical
across 1920, 1440 and 1366**. §10 required a test capable of detecting exactly that, on
the reasoning that a suite blind to the defect's signature does not cover the patch. The
committed test would fail under the old behaviour. **The original defect is now a
committed regression test, not a fixed anecdote.**

### 15k. False-green protection — **PASS**

Live frames resolved by stable identity; geometry from live DOM and `appState`; usable
canvas excludes the sidebar; no screenshots as acceptance evidence; **the test does not
call the helper directly** and injects no synthetic `appState`; frame scene elements
unchanged; assertions wait for the new frame to exist; **manual pan/zoom is not used to
prepare passing geometry**; page and console errors classified and asserted.

The two strongest items are that the helper is exercised only through real UI, and that
no manual viewport manipulation stages the assertion — either shortcut would have
produced a green suite over an unrepaired product.

### 15l. Validation

`npx tsc --noEmit` **PASS**; relevant Vitest suites **69 tests PASS**; targeted
PATCH-130 Playwright **PASS**, and **`--repeat-each=3` PASS**; `git diff --check`
**PASS**; no production debug instrumentation remains; protected file hashes unchanged.

**The independent reviewer did not personally rerun the credentialed E2E scenario**,
having verified the committed implementation, source paths, assertions, scope,
TypeScript, Vitest and diff checks. Same posture as PATCH-129 §15j and PATCH-128
§32j/§34g: reviewed-but-not-re-run, recorded plainly, acceptable because the evidence is
committed and re-runnable.

**Dev-server cleanup evidence recorded:** test server on port 3003, PID 15116, stopped;
final port state `TIME_WAIT` only, no listener remaining. This is a direct response to
the §13 orphaned-process hazard, and the first time in this sequence that server
teardown was evidenced rather than assumed. **The §13 note did its job.**

### 15m. Non-blocking findings

1. **Frame scene coordinates are recorded but not asserted field-by-field.** The test
   captures live frame `x/y/width/height` without an explicit before-versus-after
   equality assertion per field. Non-blocking: the implementation modifies only
   `appState`, performs no scene-element update, all geometric assertions pass, and
   frame identity is stable. **The source establishes the invariant that the test
   merely observes** — acceptable, though a direct assertion would be strictly
   stronger.

2. **The second RAF callback ignores the helper's return value** (L1632). If the frame
   were still absent after two RAF cycles, navigation would **fail silently** — the
   precise failure mode §9.5 prohibited ("silent no-op is not acceptable"). Non-blocking
   because frame insertion is a synchronous `updateScene`, existing-slide navigation
   normally succeeds on the first attempt, the new-slide path is proven by committed
   E2E, and no observed scenario needed more than the bounded fallback.

   Recorded precisely because it is a **latent** instance of a pattern this patch
   family has already been burned by: the original `handleActivateSlide` also did
   nothing when its frame lookup failed (§4c), and that silence is why the
   creation/selection divergence went unnoticed. The bound is correct; only the
   unchecked final attempt is worth revisiting if a future report describes navigation
   that occasionally does nothing.

**No correction is required for closure.**

### 15n. Final status

**PATCH-130: CLOSED · IMPLEMENTATION ACCEPTED (`0262405`) · EXISTING AND NEW SLIDES
CENTERED IN VISIBLE CANVAS · SIDEBAR-AWARE VIEWPORT FIT PROVEN · REPEATABLE E2E
EVIDENCE COMMITTED.**

Accepted and retained, not to be squashed or amended:

| Commit | Role |
|---|---|
| `864e9ff` | governance authorization |
| `0262405` | implementation + committed navigation characterization |

**Not pushed.** The five protected unrelated dirty paths remain untouched.

**PATCH-128 and PATCH-129: CLOSED** — neither modified nor reopened.
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-130 / 129 / 128 / 125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Deferred, now with two patches' worth of evidence behind it:** Drawing Layout inherits
Freeform's 2000 × 1500 stage at `CanvasClient.tsx:6354` (§4a, §6a). PATCH-130 routes
around it rather than correcting it. **Any future work on canvas viewport geometry
should start there**, and should expect the blast radius §6a describes.

**Recorded debt from PATCH-130.** Added: **route around a wrong invariant rather than
correcting it when the correction's blast radius exceeds the patch** — computing the
target transform directly made `appState.width/height` irrelevant and kept the change
to one file (§15c); **a bounded retry whose final attempt ignores its result is a
silent-failure risk**, even when currently unreachable (§15m.2); **evidence the dev
server was actually torn down** belongs in the implementation report, following the
orphaned-process incident (§13, §15l); **"constant where it should vary" is now a
primary diagnostic** — it located the failing layer in PATCH-129 (686.3 px) and
PATCH-130 (L360→R1640) before any source was read, in two consecutive patches; **a
smooth, stable, never-overwritten animation can still be centring against the wrong
rectangle**; **check for an existing measurement before adding one** —
`--drawing-visible-canvas-right-inset` already existed and was consumed only for
zoom-control placement (§4b). Retained and still in force: acceptance evidence must live
in the committed suite; prove the mechanism under test was entered before claiming the
system handled it; a test must be able to detect the defect's own signature; repeat-run
evidence is required; once a commit contains any deletion, read it; bound allowlists by
file and responsibility, not line range; a review finding must be checked against the
source on the same terms as an implementer's claim.

**Inherited and still unowned:** the production-build failure `TypeError: Cannot read
properties of undefined (reading 'length')`, carried from PATCH-128 §34m through
PATCH-129; and the shared-`.next` hazard between `next dev` and `next build`.

**END OF PATCH-130.**
