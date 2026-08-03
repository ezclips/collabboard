# PATCH-137 — PATCH-124 PRIVATE MUTATION REMOVAL: FEASIBILITY AND GOVERNANCE

**Status:** **CLOSED** · OPTION A (TEST-ONLY MIGRATION) IMPLEMENTED AND INDEPENDENTLY VERIFIED
AT `dad2784` · **CLASSIFICATION 2 — PASS WITH NON-BLOCKING OBSERVATIONS** · ZERO PRODUCTION
FILES · ONE TEST FILE, 285/360 LINES · 21/21 CLEAN RUNS · NEGATIVE CONTROL CONFIRMED ·
**PATCH-138 RELEASED** · SEE §21 (authorization) AND §22 (closure review) · NOT PUSHED
**Authored:** 2026-08-03 (CTO). **Base:** `c852d95`. **Re-authorized:** 2026-08-03 at `f8671aa`.
**Closed:** 2026-08-04 (independent governance review at `dad2784`, see §22).
**Predecessors:** PATCH-124 (closed) · PATCH-136 (closed, §18f split this patch out) ·
PATCH-142 / PATCH-144 / PATCH-145 (closed prerequisites; PATCH-142 released this patch at §24k).

## 1. Why this patch exists

PATCH-136 migrated four characterization specs onto the observation-only production bridge
and deliberately refused to expose mutation. `patch-124-slide-thumbnail-refresh.spec.ts` was
excluded and left byte-identical because it injects scene elements through the mutable
development debug harness. It is now **the only characterization spec still bound to
`window.h`**.

## 2. Mutation census — complete, from full source

`e2e/characterization/patch-124-slide-thumbnail-refresh.spec.ts` (293 lines).

| Line | Construct |
|---|---|
| `:170` | `addRectToFrame(page, frameId, id, color, x, y)` — the only mutation helper |
| `:174` | Type requires `h.app.updateScene(scene)` |
| `:178-179` | `const app = target.h?.app; const elements = target.h?.elements ?? []` |
| `:180` | Hard failure: `if (!app?.updateScene) throw new Error('Excalidraw updateScene harness unavailable')` |
| `:181-208` | Literal element construction — 27 fields |
| `:209-213` | **Whole-scene replacement**: `app.updateScene({ elements: [...elements.filter(e => e.id !== elementId), nextElement], appState: { selectedElementIds: {} }, commitToHistory: true })` |

**Invariant across every injected element:** `type: 'rectangle'` · `width: 120` · `height: 80` ·
`strokeColor === backgroundColor === <colour>` · `fillStyle: 'solid'` · `strokeWidth: 2` ·
`strokeStyle: 'solid'` · **`roughness: 0`** · `opacity: 100` · `seed: 124` · `angle: 0` ·
`groupIds: []` · `boundElements: null` · `roundness: null` · `locked: false` ·
`index: 'z' + Date.now() + Math.random()` · `frameId` set **explicitly**.

**Five call sites:**

| Line | Frame | Scene x,y | Colour | Purpose |
|---|---|---|---|---|
| `:263` | `frame-landscape` | 260,420 | `#dc2626` red | **Positive** — A refreshes |
| `:268` | `frame-portrait` | 1520,520 | `#16a34a` green | **Positive** — B refreshes; also the **negative control** for A (`:270`) |
| `:272` | `frame-landscape` | 460,430 | `#7c3aed` purple | **Positive** — A refreshes a second time |
| `:284` | `frame-landscape` | 620,420 | `#f97316` orange | **Rapid pair, first** |
| `:285` | `frame-landscape` | 760,420 | `#14b8a6` teal | **Rapid pair, second** |

`:265-266` samples B immediately after the A mutation and asserts `hash` equality — the
cross-frame negative control. `:270` does the mirror for A by `src` equality.

**Timing between calls:** `:284` → `:285` are adjacent `await`s with no intervening wait —
two scene commits within single-digit milliseconds. Everything else is separated by a
`waitForThumbnailChange` poll (up to 60 s).

### 2a. A second, unrecorded harness dependency

`waitForHarness` (`:163-168`) polls for `window.h.app` and `Array.isArray(window.h.elements)`.
**PATCH-124 depends on the debug harness for readiness as well as mutation.** The brief
describes only the mutation path. The consequence is concrete: **PATCH-124 cannot run against
a production build at all today**, mutation aside. Any migration must replace this with
`waitForE2EBridge` from `e2e/characterization/e2eBridge.ts`.

## 3. Feature claims — derived from source, not from the brief's list

The brief's eight suggested claims are close but not exact. The spec proves **thirteen**:

| # | Claim | Evidence |
|---|---|---|
| C1 | Both slides render a PNG thumbnail with natural dimensions > 100 px | `:257-260` |
| C2 | A shape added inside frame A appears in A's thumbnail (> 12 matching pixels) | `:263-264`, `:144` |
| C3 | **A change to frame A does not alter B's thumbnail** (`hash` identity) | `:265-266` |
| C4 | A shape added to frame B refreshes B | `:268-269` |
| C5 | **A change to frame B does not alter A's thumbnail** (`src` identity) | `:270` |
| C6 | A further change to A refreshes A again | `:272-273` |
| C7 | **Manual refresh produces a genuinely new render for both slides even when content is unchanged** | `:275-277` |
| C8 | The refresh cycle terminates — "Generating previews..." disappears | `:278`, `:148-150` |
| C9 | Thumbnails contain no transient chrome (checkbox, menu, context menu, `.excalidraw`) | `:280-281`, `:217-220` |
| C10 | After two rapid successive changes the settled thumbnail contains **both** colours | `:283-288` |
| C11 | No React "state update / unmounted / act()" console errors across the whole flow | `:291`, `:228-231` |
| C12 | Exact colour content: ±20 per channel, alpha > 160, **> 12 pixels** | `:107-111`, `:144` |
| C13 | Frame targeting is by `frameId` | `:203`; enforced downstream by `planSlideComposition.ts:17,51` |

C7 is only provable because `installThumbnailStamp` (`:36-52`) writes a per-`toDataURL` serial
into the bottom-right 3×3 px, and the content hash excludes the bottom-right 4×4 (`:102`).
Renders are therefore distinguishable by `src` while remaining comparable by `hash`. Any
migration must keep both mechanisms intact.

### 3a. What PATCH-124 does **not** prove — and a latent race

**There is no coalescing assertion.** The words "coalesce", "debounce" and "250" appear
nowhere in the spec. No render is counted. C10 asserts only that the *settled* thumbnail
contains both colours, which holds whether the two commits coalesce into one render or produce
two sequential ones.

**But the 250 ms window is load-bearing for determinism.** `waitForThumbnailChange`
(`:131-145`) polls until `changed: true` and matches `colorHits: expect.any(Number)` — which
**accepts 0** — then re-samples and hard-asserts `colorHits.teal > 12` at `:144`. If the two
changes produced two separate refresh passes, the poll can exit on the orange-only render and
the teal assertion then races the second pass.

Today the two `updateScene` calls are milliseconds apart, `scheduleRefresh` (`useSlideThumbnails.ts:149-152`)
clears and restarts the timer, one pass runs, and both colours land together. The race never
fires. **This is a pre-existing latent defect in PATCH-124 that private mutation conceals**,
and any migration that widens the gap will expose it. Recorded here because it changes what a
correct migration must do: not merely reproduce the actions, but close the race.

## 4. Pixel-colour contract

| Colour | Hex | RGB | Tailwind | Used at |
|---|---|---|---|---|
| red | `#dc2626` | 220,38,38 | red-600 | `:263` |
| green | `#16a34a` | 22,163,74 | green-600 | `:268` |
| purple | `#7c3aed` | 124,58,237 | violet-600 | `:272` |
| orange | `#f97316` | 249,115,22 | orange-500 | `:284` |
| teal | `#14b8a6` | 20,184,166 | teal-500 | `:285` |

**These are Tailwind values, not Excalidraw palette values** (the fork's red is `#e03131`).
No swatch in the default picker produces them; only the hex input can.

- **Threshold:** `> 12` matching pixels (`:144`, `:287-288`).
- **Sampling area:** the **entire** decoded thumbnail — `getImageData(0, 0, naturalWidth, naturalHeight)` (`:89`). Measured 569 px wide.
- **Tolerance:** `|Δr|,|Δg|,|Δb| ≤ 20` **and** `alpha > 160` (`:108`). Anti-aliased edge pixels inside that band are counted.
- **Fill vs stroke:** measured — a 120×80 rectangle in a 1280-wide frame scaled to a 569-wide thumbnail projects to ≈53×35 ≈ 1 855 px. Observed hit counts were **1 843–1 901**. **The fill supplies essentially all matching pixels; the 2 px stroke is negligible.** The threshold of 12 therefore carries a ~150× margin.

## 5. Fill-style contract

`DEFAULT_ELEMENT_PROPS` (`packages/common/src/constants.ts:424-427`) already sets
`fillStyle: "solid"` and `strokeWidth: 2`, matching the injected elements — but
`backgroundColor: COLOR_PALETTE.transparent` and **`roughness: ROUGHNESS.artist` (1)**, which
does **not** match the injected `roughness: 0`.

**Measured UI behaviour** (spike, §7):

| Probe | Result |
|---|---|
| `[data-testid="fill-solid"]` before any tool is active | **0** |
| after selecting the rectangle tool | **0** |
| after setting a background colour | **1** |

**The Fill radio group is hidden while the background is `transparent`.** Ordering is
therefore mandatory: choose the tool → set **background** → the Fill control appears → confirm
Solid. Stroke and background are set independently through separate triggers
(`data-openpopup="elementStroke"` / `"elementBackground"`).

**Roughness divergence — resolved empirically, not by argument.** Real-UI rectangles are drawn
with `roughness: 1`. Sloppiness is a real UI control and could be set to Architect, but the
measurement makes it unnecessary: at roughness 1 the observed hit counts were 1 843–1 901
against a threshold of 12. Rough.js perturbs edges, not the solid fill interior. **Recorded as
an accepted, evidenced divergence** — the migration may leave sloppiness at its default and
must not silently claim byte-identical elements.

## 6. Coordinate model — measured

`sceneToScreen` is already proven in `patch-128-slide-sync.spec.ts:162-173`:

```
screenX = (sceneX + scrollX) * zoom.value + offsetLeft
screenY = (sceneY + scrollY) * zoom.value + offsetTop
```

All five inputs are supplied by the bridge's `getViewport()` — the projection was designed for
exactly this.

**Measured with the presentation sidebar open, `devices['Desktop Chrome']`:**

| Quantity | Value |
|---|---|
| `scrollX`, `scrollY` | 0, 0 |
| `zoom.value` | 1 |
| `offsetLeft`, `offsetTop` | 56, 0 |
| `window.innerWidth × innerHeight` | 1280 × 720 |
| interactive canvas bounding box | x 56, y 0, 2000 × 1500 |
| `frame-landscape` | 0, 0, 1280 × 720 |
| `frame-portrait` | 1400, 0, 720 × 1280 |

**Occlusion map** (`document.elementsFromPoint`, topmost element):

| Screen point | Topmost |
|---|---|
| 356, 460 | `DIV.excalidraw__embeddable__outer` — **blocked** |
| 356, 600 | blocked (embeddable overlay extends down) |
| 676, 460 · 956, 460 · 400, 650 · 900, 650 | `CANVAS.excalidraw__canvas` — **clear** |
| any point while a colour popup is open | `DIV.color-picker-content--default` — **blocked** |

Three hard constraints follow, all discovered by failure during the spike:

1. **The properties Island occupies screen x 72–272, y 76–741** when a tool is active.
2. **The seeded embeddables overlay the canvas** around scene x 360–720, y 120–~600. Pointer events there never reach Excalidraw.
3. **The colour popup must be closed before drawing.** The first two spike attempts created nothing because the popup covered the drag origin, and `Escape` needs verifying, not assuming.

**Usable band with the sidebar open:** the sidebar (`w-80`) covers screen x 960–1280, so the
drawable region is screen x ≈ 300–950, y ≈ 400–700, i.e. **scene x ≈ 250–890, y ≈ 400–700** —
inside `frame-landscape`, below the embeddables, clear of the Island. Four of PATCH-124's five
rectangles already sit in that band; the portrait rectangle at scene 1520,520 is **off-screen
at zoom 1** and needs an explicit real-UI viewport change (scroll or zoom-to-fit) before it can
be drawn.

**Frame membership is not heuristic guesswork here.** `planSlideComposition.ts:17,51` filters
strictly by `element.frameId === slideFrame.id`. Excalidraw assigned `frameId:
"frame-landscape"` on pointer-up in **10 of 10** spike runs with no inset tuning — the
rectangles sat ≥ 300 px from the nearest frame edge, which is far inside any containment
margin.

## 7. Real-UI spike — method and results

**Deviation from the brief, stated up front.** The brief asked for an isolated scratch
worktree. I used a **temporary untracked spec** (`e2e/characterization/zz-p137-spike.spec.ts`)
in the main worktree instead: the characterization project's `testDir` is
`./e2e/characterization` and its `dependencies: ['setup']` supply the authenticated storage
state, and a second worktree would have required duplicating `node_modules` and a second
multi-minute production build for no additional safety. **No tracked file was modified.** The
spike file was deleted, `test-results/` removed, and the ordinary production artifact rebuilt
and re-verified afterwards (§13).

The spike ran against a **clean `E2E_BRIDGE_BUILD=1` production artifact** and used the
PATCH-136 bridge for all observation. **No `updateScene`, no `window.h`, no raw API, no direct
handler, no database insertion.**

### 7a. Selector census — all stable, all pre-existing

| Purpose | Selector | Note |
|---|---|---|
| Rectangle tool | `label.ToolIcon:has([data-testid="toolbar-rectangle"])` | `Actions.tsx:1150` renders `data-testid={`toolbar-${value}`}`. **The radio input itself is not clickable** — `.ToolIcon__icon` intercepts pointer events; the enclosing label is the real pointer target |
| Stroke picker | `[data-openpopup="elementStroke"]` | `ColorPicker.tsx:261` |
| Background picker | `[data-openpopup="elementBackground"]` | same |
| Hex input | `input.color-picker-input` | `ColorInput.tsx:77`; `onChange` applies per keystroke |
| Solid fill | `[data-testid="fill-solid"]` | `actionProperties.tsx:515` |
| Popup open | `.color-picker-content--default` | used to prove closure before drawing |

**No production selector needs to be added.** Every hook already exists in the vendored fork.

### 7b. Element fidelity — 10/10 runs

```
x 620 · y 420 · w 120 · h 80 · frameId "frame-landscape"
strokeColor "#dc2626" · backgroundColor "#dc2626"
fillStyle "solid" · strokeWidth 2 · roughness 1
```

Geometry is **exact** — a 4-step pointer drag between two computed scene points produced
120 × 80 at the requested origin every time, with no rounding drift. Colour is **exact**: the
hex input accepts the Tailwind values and applies them to stroke and background
independently.

### 7c. Thumbnail pixels — 10 runs

| Stage | `colorHits.red` |
|---|---|
| before drawing | **0** in 10/10 |
| after one real-UI rectangle | **1 843, 1 850, 1 855, 1 863, 1 868, 1 875, 1 888, 1 901, 0\*, 1 846** |
| after a duplicate pair | **2 536–2 598** |

\* One run sampled 0 — see §9. Thumbnail width 569 px in every run.

**C12 is satisfied with a ~150× margin at the existing threshold of 12.** No threshold change
is needed or authorized.

### 7d. Timing — the decisive measurement

| Operation | Measured |
|---|---|
| Stroke colour via hex input | 85, 86 ms |
| Background colour via hex input | 94, 96 ms |
| **Hex entry alone, isolated** | **266 ms** |
| Palette swatch path (no typing) | 179 ms |
| Pointer drag alone | 120–128 ms |
| **Full style-and-draw cycle** | **874, 891, 1 009, 1 044, 2 085, 2 142 ms** |
| **Two `Ctrl+D` duplicates, back to back** | **40, 40, 41, 41, 42, 42, 44, 44, 45, 55 ms** |

**A single hex entry already exceeds the 250 ms debounce window.** Two differently-coloured
real-UI rectangles are separated by **874–2 142 ms** — three to eight times the window. There
is no sequencing, no batching and no ordering of the existing controls that closes that gap.

**Duplication commits two scene changes 40–55 ms apart** — comfortably inside the window, and
`Ctrl+D` is a first-class, documented Excalidraw action, not a test affordance.

## 8. Strategy evaluation

| | Strategy | Real user path? | Exact colours? | Preserves 250 ms claim? | Deterministic frame targeting? | Changes the assertion? |
|---|---|---|---|---|---|---|
| **A** | Full UI for every property and every rectangle | Yes | **Yes** | **No** — 874–2 142 ms per rectangle | Yes | Only C10 |
| **B** | Configure style once, draw several shapes rapidly | Yes | Yes | Only for **same-coloured** shapes | Yes | C10 loses its two-colour property |
| **C** | Style one shape through the UI, then duplicate | Yes — `Ctrl+D` | Yes, inherited | **Yes** — 40–55 ms | Yes — duplicates keep `frameId` (measured) | C10 loses its two-colour property |

No strategy preserves C10 whole, because C10 conflates two independent properties: *two
different exact colours* and *two changes close together*. The UI can deliver either, never
both.

**Rejected outright:** clipboard paste (adds OS-clipboard flakiness for no gain) and any
approach that reduces the two commits to one selection dragged in together (that is one scene
change, and would silently destroy the property C10 exists to test).

## 9. Repeat-run results — 10 runs, one failure, categorised

| Category | Failures |
|---|---|
| Tool selection | 0/10 |
| Colour entry | 0/10 |
| Fill style | 0/10 |
| Coordinate placement | 0/10 |
| Frame membership | 0/10 |
| Pixel threshold | 0/10 whenever the thumbnail had refreshed |
| Debounce timing (duplicate pair) | 0/10 — 40–55 ms, never above 55 |
| **Thumbnail readiness** | **1/10** |

The single failure is honest and worth its own line: run 3 of the second batch read
`colorHits.red === 0` after drawing, then 2 598 after the duplicate pair. The rectangle existed
and carried the correct `frameId`. **The cause is my spike harness, not the product**: the
spike used a fixed `waitForTimeout(3000)` where PATCH-124 uses `waitForThumbnailChange`, a
60-second poll. The failure mode is eliminated by construction in the real spec.

I record it rather than re-running until clean, because "9/10 with a known-attributable cause"
is a truthful basis for a decision and "10/10 after discarding a run" is not.

**Not yet measured:** a constrained-CPU run and an alternate viewport. Both are listed as
implementation-phase gates in §11, not claimed here.

## 10. Classification

### **OPTION B — REAL-UI MIGRATION FEASIBLE WITH EXPLICIT TEST-SEMANTIC AMENDMENT**

Option A is not available, and the reason is precise: **C10 is not one claim but two**, and
real UI can satisfy either but not both simultaneously. Option C is not needed — no test-only
fixture command is required, and it remains prohibited. Option D is wrong — twelve of thirteen
claims migrate with no semantic change at all.

### 10a. The exact semantic change

**C10 is split into two assertions, each strictly stronger than the conflated original.**

**C10a — coalescing (new capability, currently unproven).** Draw one styled rectangle, select
it, press `Ctrl+D` twice within the debounce window (measured 40–55 ms). Assert that the
settled thumbnail contains all three shapes **and that exactly one new thumbnail render
occurred**. The render count is directly observable through the existing `toDataURL` serial
stamp. **This proves coalescing, which PATCH-124 never asserted at all.**

**C10b — two colours (preserved, race removed).** Draw orange, then teal, then poll until
**both** `colorHits.orange > 12` **and** `colorHits.teal > 12`. This keeps the original
property and closes the §3a race, which the current implementation would hit as soon as the
inter-commit gap widened.

**What is lost:** the *incidental* fact that two differently-coloured changes arrived inside
one debounce window. Nothing asserted it, and it is replaced by a stronger, explicit
coalescing proof. **What is gained:** an actual coalescing assertion, a closed race, and a
spec that runs against a production artifact.

**What must not happen:** C10b must not be turned into two independent "did it refresh" checks,
and the 250 ms production constant must not be touched. It stays covered by the unit test at
`lib/infra/presentation/slideThumbnailRefresh.test.ts:24`.

## 11. Semantic-equivalence contract for the implementation

Preserved unchanged: the disposable fixture and its cleanup · both frames and slide titles ·
the exact target frames · **the five exact hex colours** · solid fill · **the `> 12` pixel
threshold, the ±20 tolerance and the alpha > 160 gate** · both cross-frame negative controls
(C3, C5) · the manual-refresh new-render proof (C7) and its serial stamp · the transient-chrome
assertion (C9) · the console-error assertion (C11) · `frameId`-based targeting (C13) · the
250 ms production debounce.

Changed, and only this: **the action mechanism** (private `updateScene` → real pointer and
toolbar actions), **readiness** (`window.h` → `waitForE2EBridge`), **C10** as specified in
§10a, and **`roughness` 0 → 1** as evidenced in §5.

Additional implementation-phase gates before PATCH-137 may close:

1. The portrait rectangle (scene 1520,520) requires a real-UI viewport change; prove it lands in `frame-portrait`.
2. A constrained-CPU run.
3. An alternate supported viewport.
4. `--repeat-each=3` green on the migrated spec, plus a negative control proving the spec fails when the rectangle is drawn outside the frame.

## 12. Allowlists — provisional, to be confirmed at implementation

**Production: none.** The spike required no production change. Every selector already exists.
**No bridge file, no `DrawingLayout` change, no vendored source, and the bridge API is not
broadened** — PATCH-137 uses `getSceneElements`, `getViewport` and `subscribeToSceneChange`
exactly as PATCH-136 authorized them.

**Test — at most 3 files:**

| File | Change |
|---|---|
| `e2e/characterization/patch-124-slide-thumbnail-refresh.spec.ts` | Replace `waitForHarness` and `addRectToFrame`; apply §10a |
| `e2e/characterization/drawingUiActions.ts` | **NEW, only if a second spec needs it** — tool selection, hex colour entry with verified popup closure, solid-fill confirmation, scene→screen drag with a clear-canvas precondition. **No assertions, no fixture logic, no bridge wrapping. ≤ 90 lines** |
| `e2e/characterization/e2eBridge.ts` | **Read-only** — no change expected |

A single-consumer helper is not justified; if PATCH-124 remains the only caller, the actions
stay in the spec.

## 13. Spike cleanup — verified

Temporary spec deleted · `test-results/` removed · E2E-enabled `.next` deleted per PATCH-136
§17h.14 · ordinary production build rebuilt clean · `assertBridgeExclusion.mjs` re-run · no
`.next/E2E_BRIDGE_BUILD` marker · disposable Supabase fixtures removed by
`registerDrawingCleanup` · working tree contains only the five protected pre-existing paths.

## 14. `build:e2e` portability — **Option B**

`"build:e2e": "set E2E_BRIDGE_BUILD=1&& next build"` is Windows-`cmd` only. **PATCH-137's
implementation does not need it fixed**: this spike ran on Windows, and so will the migration.

Deciding factor: on POSIX the script silently yields an *ordinary* build, the bridge is absent,
and the specs fail loudly at `waitForE2EBridge` — the failure is safe and legible. That makes
it a **CI prerequisite, not a PATCH-137 blocker**.

**Disposition: a separate small tooling patch before any non-Windows CI run.** Scope:
`cross-env` or a node runner, plus `package.json`. **Not touched here** — this patch adds no
script and no dependency.

## 15. PATCH-128 Gate G — recorded, not actioned

PATCH-136 §21m.2 recorded that Gate G's `unchangedRevisionOnChangeCalls` became structurally
unreachable once it consumed the monotonic bridge revision. **Both counters remain unasserted,
so nothing is currently false-green.**

**Disposition: deferred.** `patch-128-slide-sync.spec.ts` is **not** on this patch's allowlist
and must not be edited here. It belongs to whichever patch next has a legitimate reason to
open that file. Folding it in merely because it was discovered nearby is how allowlists
erode.

## 16. Hard stops — evaluated against measurement

| Stop | Result |
|---|---|
| Exact custom colours cannot be entered reliably | **NOT TRIGGERED** — 10/10 exact on stroke and background |
| Solid fill cannot be produced through stable UI | **NOT TRIGGERED** — `[data-testid="fill-solid"]`, once a background is set |
| Frame targeting is not deterministic | **NOT TRIGGERED** — `frameId` correct 10/10, no inset tuning |
| Scene-to-screen conversion drifts materially | **NOT TRIGGERED** — exact 120 × 80 at the requested origin, 10/10 |
| **The two rapid changes cannot occur within the debounce window** | **TRIGGERED for two-colour changes** (874–2 142 ms vs 250 ms) · **NOT TRIGGERED for duplication** (40–55 ms). This is what makes the outcome B rather than A |
| Thumbnail pixel thresholds become unstable | **NOT TRIGGERED** — 1 843–1 901 against a threshold of 12 |
| The only stable path is raw `updateScene` | **NOT TRIGGERED** |
| Migration requires broad production changes | **NOT TRIGGERED** — no production change at all |
| Repeated runs show material flakiness | **NOT TRIGGERED** — the single failure is attributable to the spike's fixed sleep, absent from the real design |

## 17. False-green protection for the implementation

Reject the migration if: the spec still reaches `updateScene` under any name · a helper wraps
private mutation · exact colours are swapped for palette approximations · transparent or
hachure fill is accepted · a shape lands outside the intended frame · **C10a's two commits are
not measured and asserted to be under 250 ms apart** · C10b passes on a single-colour render ·
pixel assertions are relaxed · source inspection replaces real thumbnail rendering · database
rows replace UI actions · the production debounce is altered · the `toDataURL` serial stamp or
the hash exclusion window is removed · `waitForHarness` survives in any form.

## 18. Status

**OPEN · REAL-UI MIGRATION FEASIBLE · SEMANTIC AMENDMENT REQUIRED FOR ONE ASSERTION ·
OPTION B · IMPLEMENTATION AUTHORIZED SUBJECT TO §11 GATES · NOT PUSHED.**

Twelve of thirteen claims migrate unchanged. C10 splits into two assertions that are together
stronger than the original. No production change. No bridge change. No new mutation surface.

## 19. Recorded diagnostic notes

- **A conflated assertion is discovered by trying to reproduce it, not by reading it.** C10
  looked like one claim for as long as private mutation could satisfy both halves at once.
  Real UI forced the two apart.
- **"The test asserts X" and "the test depends on X" are different questions.** PATCH-124
  never asserts coalescing, yet coalescing is what keeps it deterministic. Auditing only the
  `expect` calls would have missed the race entirely.
- **Occlusion is the first thing to check when a synthetic pointer does nothing.** Two spike
  iterations were lost to a colour popup and an embeddable overlay sitting above the canvas.
  `document.elementsFromPoint` at the drag origin answers in one call what retry logs never
  will.
- **Measure the cost of the interaction, not the intent.** A hex entry costs 266 ms — the whole
  feasibility verdict turned on that one number, and no amount of reasoning about "rapid UI
  actions" would have produced it.
- **Report the failing run.** 9/10 with a named, attributable cause is evidence; 10/10 after
  quietly re-running is not.

## 20. Amendment — C5 CLASSIFIED; CROSS-FRAME THUMBNAIL DEFECT ISOLATED (2026-08-03, CTO)

**Trigger:** the real-UI migration was implemented, ran, and **correctly hard-stopped at C5**
rather than weakening the assertion. No commit, nothing pushed, no production, bridge or
governance file changed.

### 20a. What the attempted implementation established

It replaced `window.h` readiness, `h.app.updateScene`, whole-scene replacement and private
emitter access with the PATCH-136 bridge, real rectangle-tool selection, exact stroke and
background hex entry, solid-fill selection, real pointer drawing and real `Ctrl+D`
duplication. It removed the permissive `expect.any(Number)` colour gate, split C10 per §10a,
passed typecheck and `git diff --check`, and left **no private mutation pattern**.

**§7's feasibility findings are confirmed by an independent implementation.** The blocker is
not the drawing path.

### 20b. Clean revert — verified

`git diff --exit-code 8031aa1 -- e2e/characterization/patch-124-slide-thumbnail-refresh.spec.ts`
→ **clean**. `test-results/` removed. Both generated build directories
`.next.partial-20260803090257` and `.next.stale-20260803085826` removed (`rm -rf`; the
suggested `cmd /c rmdir` opened an interactive shell under this harness and did nothing).
Ports 3000–3003 and 3100 free. Worktree holds only the five protected paths.

**Evidence preserved outside the repository** in
`…/scratchpad/p137-evidence/`: the attempted diff (443 insertions, 76 deletions), the full
attempted spec (660 lines), the Playwright error context, both failing thumbnails decoded to
PNG, the C5 diagnostic spec, and the 20-run, 3-run and 2-run logs.

### 20c. The exact failure, decoded

The failing assertion is C5 at attempted-line 605:
`expect(await sampleThumbnail(slideA, colors)).toMatchObject({ src: afterA.src })`.

Both values were extracted from the preserved artifact and **decoded to raw RGBA**, not
compared as strings:

| | expected (`afterA`) | received (after the portrait edit) |
|---|---|---|
| data-URL length | 13 626 | 65 190 |
| dimensions | **569 × 320** | **569 × 320** |
| decoded bytes | 728 320 | 728 320 |
| pixel hash | `2250605e530af152` | `b71441712824c77c` |
| non-white pixels | **4 378** | **21 737** |
| red hits | **1 858** | **813** |
| green hits | **0** | **0** |

Rendered side by side, the difference is unambiguous. The **expected** image contains only
the native text, the blue seeded rectangle and the red rectangle. The **received** image
contains those *plus* the two embeddable padlet cards and the uploaded moodboard image — and
one of those cards overlaps the red rectangle, which is why the red count more than halved.

**The baseline was an incomplete render.** The later image is the more complete one. This is
not a case of the landscape thumbnail being corrupted by a portrait edit.

### 20d. Diagnostic — 20 focused repetitions

A temporary diagnostic (observation-only, bridge for all scene reads, real UI for all
actions, single worker, `Desktop Chrome`, clean `E2E_BRIDGE_BUILD=1` artifact, disposable
fixture per run) measured two phases: **settling with zero edits**, then a **portrait-only
edit** with the landscape thumbnail watched for 10 s. Decoded pixel hashes throughout — no
`src`-string evidence.

| Measurement | Result |
|---|---|
| Landscape thumbnail changed **with no edit at all**, after the repo's own settled waiter returned | **5 / 20** (first change 568–971 ms later) |
| Landscape thumbnail changed **after a portrait-only edit** | **20 / 20** (2.0–2.8 s after the commit) |
| Green rectangle actually created in `frame-portrait` | 20 / 20 |
| **Green pixels ever present in the landscape thumbnail** | **0 / 20** |
| Final landscape hash equal to the pre-edit hash | **0 / 20** |

Non-white levels for a landscape thumbnail with identical scene content clustered at
**≈2 381**, **≈18 927** and **≈20 620**, and after the portrait edit at **≈19 180 / ≈19 480**
— PNG payload 63 KB before, 53–55 KB after. **The same slide renders materially different
content at different moments.**

### 20e. The landscape slide's own inputs do not change

Captured through the bridge immediately before the portrait edit, immediately after, and
after settling (3 runs, full detail):

```
emb-slide-a         v2 / vn unchanged
emb-uploaded-image  v2 / vn unchanged
shape-landscape     v1 / vn1  unchanged
text-landscape      v1 / vn1  unchanged
members: 4 → 4 → 4
```

Every element with `frameId === 'frame-landscape'` is **byte-identical in id, type, version,
versionNonce and frameId** across the edit. `nativeSceneSignature` therefore cannot have
changed.

The other signature input is `embeddableOverlaySignature`, which folds in
`buildPadletRenderState` — including each padlet's `updated_at`. All **eight** padlet rows on
the board were queried before and after the portrait edit (2 runs): **every `updated_at`
unchanged**, including the drawing master padlet.

**Every input to `getSlideRenderSignature` for the landscape slide is unchanged, and the
landscape thumbnail is re-rendered anyway, with different pixels, in 20 of 20 runs.**

### 20f. Mechanism — the leading explanation, and what would confirm it

`selectSlidesForThumbnailRefresh` (`slideThumbnailRefresh.ts:44`) skips a slide when
`renderedKeys[slide.id] === cacheKey`. `renderedRef.current[slide.id]` is written **only when
`shouldAccept` is true** (`useSlideThumbnails.ts:115`), and `shouldAcceptSlideThumbnailRender`
rejects a completed render whose cache key no longer matches the current one
(`slideThumbnailRefresh.ts:98-110`).

So: a landscape render that starts while padlet data is still arriving completes against a
**changed** key, is rejected, the PNG is discarded — **and `renderedRef` is never updated**.
From that moment the landscape slide is permanently "dirty": `renderedKeys['frame-landscape']`
can never equal its current key, and **every subsequent refresh pass re-renders it, whichever
slide actually changed.**

This accounts for all four observations at once: the 20/20 cross-frame re-render; identical
scene and padlet inputs; different pixels each time (each re-render captures whatever overlay
content happens to be loaded); and the fact that the landscape stays quiet during the 12-second
no-edit watch (nothing schedules a pass, because `scheduleRefresh` fires only on
`slideSignature` change, `useSlideThumbnails.ts:205-208`).

**This is the leading mechanism, not a confirmed one.** It is consistent with every
measurement and no measurement contradicts it, but `renderedRef` and the `shouldAccept`
outcome were not directly observed. **Instrumenting those two values is the first task of the
production patch**, and this patch does not assert the mechanism as settled fact.

### 20g. Classification

### **F — ANOTHER IDENTIFIED CONDITION** (compound)

Not A: the landscape content is not incorrect and no portrait content leaks — green is 0 in
20/20. Not B: pixels differ materially, so the re-render is not redundant-but-identical. Not
C: identity is not the issue; decoded pixels differ. Not G: the evidence is sufficient.

**D and E are both present, and neither alone is sufficient:**

1. **Invalidation over-reach (D-flavoured).** A portrait-only edit re-renders the landscape slide, 20/20, with all of that slide's inputs unchanged.
2. **Render non-determinism (the part D does not cover).** Successive renders of an *unchanged* slide produce materially different images, because asynchronous embeddable/padlet overlay content may or may not have loaded when the raster is taken. This is what makes (1) *visible*; without it, over-invalidation would be mere wasted work.
3. **Insufficient settled contract (E-flavoured).** `waitForStableThumbnail` — unchanged across one 750 ms gap, five attempts — returned an incomplete render in **5/20** runs with no edits at all. A quiet interval is not evidence that the render pipeline is idle.

### 20h. What C5 was intended to prove

PATCH-124's governance and the test itself describe cross-frame isolation, not render
accounting. The production design supports that reading: `selectSlidesForThumbnailRefresh`
exists precisely so unchanged slides are skipped, and `getSlideRenderSignature` is built
strictly per-slide.

- **C5a — visual isolation:** *intended.* A frame-B edit must not alter what frame A's thumbnail shows.
- **C5b — invalidation isolation:** *intended by the architecture*, and currently violated. It was never asserted, because `src` identity happened to imply it.
- **C5c — `src` identity:** **not a product contract.** Nothing in the production code promises a stable data-URL string, and the manual-refresh assertion (C7) depends on `src` deliberately *changing* for identical content.

**`src` was a proxy** — a convenient single comparison that, under private mutation,
simultaneously implied "not re-rendered" and "content unchanged". It is not a supported
contract, and it is the **only** assertion in the spec that conflates the two.

**But it must not be replaced merely because it now fails.** It fails because it is detecting
something real.

### 20i. Production-defect decision

Both findings are production behaviour, not test artefacts:

| Finding | Category |
|---|---|
| Unrelated-slide re-render on any scene change | **3 — performance defect.** The cache/invalidation contract is explicit in the code and is not being honoured |
| A render can capture partially-loaded overlay content, so an unchanged slide yields different images | **4-adjacent — rendering-completeness defect.** The output is not wrong-content-for-the-wrong-slide, but it is not a function of the slide state either, and an incomplete thumbnail can be cached and shown to a user |

**PATCH-137 must not disguise either by changing the test.** Reserving:

> **PATCH-142 — slide thumbnail invalidation scope and render completeness.**
> Deliverables: instrument `renderedRef` / `shouldAccept` to confirm §20f; ensure a rejected
> render cannot leave a slide permanently uncached; define and enforce a render-readiness
> precondition so a raster is not taken while overlay content is still resolving; add unit
> coverage to `slideThumbnailRefresh.test.ts` for the rejected-render path. **Production
> patch. Not authorized to change any characterization assertion.**

The document sequence shifts: PATCH-138–141 unchanged; **PATCH-142** is new and is a
prerequisite for closing PATCH-137.

### 20j. C5 option decision

**Option A (keep strict `src`)** — rejected: `src` is not a product contract, and C7 requires
`src` to change for identical content.

**Option B (assert pixel identity)** — **not available.** Pixel identity fails 20/20 for
reasons unrelated to the portrait edit. Selecting B would convert a product defect into a
flaky test.

**Option D (fix production first)** — correct for the invalidation half, and reserved as
PATCH-142.

**Selected: Option C — SPLIT C5, gated behind PATCH-142.**

- **C5a — semantic isolation (assertable today).** After a frame-B edit, the frame-A thumbnail contains **zero** frame-B colour pixels and **retains** its own expected content above threshold. Both hold 20/20 today.
- **C5b — invalidation isolation (measured, not yet asserted).** Record whether the unrelated slide was re-rendered. **After PATCH-142 this becomes an assertion; until then it is recorded as a known deviation with a linked patch.**

**C5b must not be quietly dropped.** A measurement with no owner is how a defect becomes
folklore. It is assertable only when the product actually satisfies it.

### 20k. Settling contract — corrected definition

"Settled" for a slide thumbnail requires **all** of:

1. the expected colour threshold for that slide's own content is reached;
2. the decoded pixel hash is stable across at least two polls spanning **≥ 1.5 s** (the observed late change was 568–971 ms after the current waiter returned);
3. no thumbnail render is in flight (`Generating previews…` absent);
4. no debounce timer is pending;
5. the image has been `decode()`d;
6. the non-white pixel count is at or above the level expected once overlay content is present — the discriminator between the ≈2 381 / ≈18 927 / ≈20 620 states.

**A fixed delay alone is insufficient, and so is the current waiter.** Condition 6 is the one
that actually separates a complete render from an incomplete one, and no existing helper
checks it.

### 20l. Real-UI versus `updateScene` — why this surfaced now

| | private `updateScene` | real UI |
|---|---|---|
| Scene commits per rectangle | 1 | pointerdown transient → geometry updates → pointerup finalisation → frame-membership assignment → selection change |
| `onChange` notifications | one shape | many |
| Tool/selection state | untouched | changes |
| Elapsed time per rectangle | ~ms | 874–2 142 ms (§7d) |

The old test never exercised the production event sequence, and — more importantly — it moved
through the whole flow so fast that its baselines were captured inside a narrow window where
the incomplete-render state happened to persist on both sides of each comparison. **The defect
predates the migration; the migration only slowed the test down enough to see it.**

This is worth stating plainly: PATCH-124 has been passing while a cross-frame re-render
occurred on every edit.

### 20m. C10 status

Recorded as demonstrated by the attempted implementation but **not independently authorized**:
exact colour entry, solid fill, real pointer drawing, correct frame membership, strengthened
two-colour polling, and the real duplication path.

**C10a still requires:** measured proof that the two duplicate commits occur < 250 ms apart
(§7d measured 40–55 ms in the spike, not yet in the migrated spec) **and** render
instrumentation proving the governed coalescing result. **C5 must be resolved before the
overall migration can commit** — no partial authorization.

### 20n. Allowlists — revised

**PATCH-137 production: none.** Unchanged. The invalidation and completeness fixes belong to
**PATCH-142** and must not be pulled forward into this patch.

**PATCH-137 test — at most 3 files**, unchanged from §12, with the C5 wording replaced by
§20j.

**PATCH-142 (reserved, not authorized here):** `components/presentation/useSlideThumbnails.ts`
· `lib/infra/presentation/slideThumbnailRefresh.ts` · `lib/infra/presentation/slideThumbnailRefresh.test.ts`.
**No characterization assertion may change in PATCH-142.**

### 20o. Hard stops — updated

| Stop | Result |
|---|---|
| Exact colours / solid fill / frame targeting / coordinates | **NOT TRIGGERED** — reconfirmed by an independent implementation |
| Rapid two-colour changes inside 250 ms | **TRIGGERED** (§16) — resolved by the §10a split |
| **Unrelated-frame thumbnail re-render on any edit** | **TRIGGERED — NEW.** 20/20. Blocks C5 until PATCH-142 |
| **Thumbnail render is not a function of slide state** | **TRIGGERED — NEW.** ≈2 381 / ≈18 927 / ≈20 620 for identical content. Blocks any pixel-identity assertion |
| Thumbnail pixel thresholds unstable | **NOT TRIGGERED** for a slide's *own* content — red 1 843–1 901 against a threshold of 12 (§7c) |
| The only stable path is raw `updateScene` | **NOT TRIGGERED** |
| Migration requires broad production changes | **NOT TRIGGERED** for PATCH-137; PATCH-142 is a separate narrow patch |

### 20p. Status

**OPEN · REAL-UI DRAWING PATH PROVEN · C5 CLASSIFIED (F, COMPOUND) · CROSS-FRAME RE-RENDER
CONFIRMED 20/20 WITH UNCHANGED INPUTS · RENDER NON-DETERMINISM CONFIRMED · PATCH-124 MIGRATION
BLOCKED BY THUMBNAIL INVALIDATION DEFECT · PATCH-142 RESERVED · NOT PUSHED.**

### 20q. Recorded diagnostic notes

- **Decode before concluding.** The `src` diff looked like a 13 KB → 65 KB explosion, which
  reads as corruption. Decoded, it was an incomplete render versus a complete one — the
  opposite story. String evidence about images is not evidence.
- **A test that passes can still be observing a defect.** PATCH-124 was green for its whole
  life while an unrelated slide re-rendered on every edit. The assertion had the right target
  and the wrong instrument, and the fast path hid the gap.
- **When a proxy assertion starts failing, find out what it is detecting before replacing it.**
  `src` identity conflated "not re-rendered" with "content unchanged"; both mattered, and only
  one was true.
- **"Stable for 750 ms" is not "idle".** Five of twenty settled waits returned an incomplete
  render. Any settled contract over asynchronous content needs a completeness discriminator,
  not just a quiet interval.
- **Prove the negative directly.** The single most valuable number here is *green = 0 in
  20/20*: it separates "the wrong content appeared" from "the right content was re-rendered
  differently", and it is what makes the classification defensible.

## 21. Amendment — PATCH-142 RELEASED; REAL-UI MIGRATION AUTHORIZED (2026-08-03, CTO)

**HEAD at authoring:** `f8671aa`. **Role:** lead PM, governance architect, patch author. No
implementation. Every census claim below was verified against source or measured live at this
HEAD; none is carried forward from §7's spike on trust.

### 21a. Blocker released

PATCH-142 closed at `f8671aa` (§24, classification 1). Its three §18 release conditions are
discharged and independently re-verified there: complete initial thumbnails with no user edit,
per-slide invalidation isolation (C5b, 10/10 against a live non-zero raster baseline), and a
deterministic accepted-render state. PATCH-144 (`021a0b6`) and PATCH-145 (`748d141`) are closed
prerequisites. **PATCH-137 resumes.**

**§20's obsolete assumptions are formally retired.** §20g classified the cross-frame re-render as
a compound production defect (F). PATCH-142 §22–§23 and PATCH-145 traced it to two causes in
sequence — first broken measurement instrumentation (a global serial and an aspect-ratio
classifier), then a genuine upstream hidden-embeddable height defect. **Neither was a failure of
the real-UI editing concept.** §20p's "PATCH-124 MIGRATION BLOCKED" is superseded. §7's spike
findings on selectors, colour entry, coordinates and frame membership stand and are corroborated
by PATCH-142's committed spec, which draws a real rectangle through the same controls and passed
20/20 across two independent sessions.

### 21b. Private-surface census — complete, measured

Searched repo-wide for `window.h`, exposed `updateScene`, scene-mutation bridges, test-only
globals, raw Excalidraw API access, and database scene mutation used to simulate drawing.

| # | Symbol | File | Owner | Callers | Ordinary build | E2E build | Still required | Disposition |
|---|---|---|---|---|---|---|---|---|
| M1 | `window.h` (`.app`, `.elements` get **and set**, `.scene`) | `excalidraw_fork/packages/excalidraw/components/App.tsx:12420-12446` (`createTestHook`) | **Vendored fork (upstream Excalidraw)** | `patch-124-…spec.ts:164-167, 174-214` — **the only Fable 5 caller** | **ABSENT** (measured) | **ABSENT** (measured) | **Yes — by the fork's own suite (8 test files)** | **Do not touch.** Migrate the caller |
| M2 | `__COLLABBOARD_E2E__` | `lib/e2e/bridgeRegistration.e2e.ts` | PATCH-136 | 8 characterization specs | absent (no-op module) | present | Yes | **Retain unchanged** — already read-only |
| M3 | `registerE2EBridge` no-op | `lib/e2e/bridgeRegistration.ts` | PATCH-136 | build-time alias target | present, no-op | replaced | Yes | Retain |
| M4 | `__patch128GateB/D/G` (`.invokeFetchData`, `.dispose`, `.snapshot`) | installed **by the spec** at `patch-128-slide-sync.spec.ts:820` et al. | PATCH-128 test | own spec | n/a | n/a | PATCH-128 property | **Out of scope** — test-installed, not production |
| M5 | `__patch070Stage0Probe`, `__patch114AppState`, `__patch065PointerRecords` | test specs only | test | own specs | n/a | n/a | own patches | **Out of scope** — optional-chained reads of test-installed probes |
| M6 | `__patch101TimeoutOverrideMs` | **read** at `createSlideRenderer.tsx:28-37` | PATCH-101 | test override | **gated out** (`NODE_ENV !== "production"`) | gated out | Yes | **Out of scope** — a config *read*, not a scene-mutation surface |
| M7 | `LayoutDebugger` | `lib/collabboard/layouts/LayoutDebug.ts:285` | Fable 5 | **none — module has zero importers** | only inside `interactive()` | same | No | **Out of scope**, recorded (§21j.2) |
| M8 | `EXCALIDRAW_ASSET_PATH` | `ExcalidrawWrapper.tsx:56` | Fable 5 | Excalidraw runtime | present | present | Yes | Legitimate library config, not a test surface |

**Legitimate internal production `updateScene` use — explicitly not test exposure.**
`DrawingLayout.tsx` (24 call sites), `CanvasClient.tsx:5040`, `CustomMermaidModal.tsx`,
`SimpleLineRenderer.tsx`, `useCanvasActions.ts`. All are ordinary editor behaviour on a private
API handle held in component scope, reachable from no global. **None is in scope.**

### 21c. The decisive measurement — M1 is already absent from every production build

`createTestHook()` is gated `isTestEnv() || isDevEnv()`, and `getEnvMode()` falls through to
`process.env.NODE_ENV` (`common/src/utils.ts:754-771`). Both builds are `NODE_ENV=production`.

Measured live at `f8671aa` against a clean `E2E_BRIDGE_BUILD=1` artifact:

```
windowH_typeof        "undefined"        windowH_hasApp   false
bridge_typeof         "object"           bridgeWriteMethods  []
bridgeKeys  [getInteractionState, getSceneElements, getSceneRevision,
             getViewport, instanceId, subscribeToSceneChange, version]
mutationAttemptResult "1400"   ← assigning x=999999 to a bridge-returned element was rejected
```

And, run against the same governed artifact, **PATCH-124's committed spec fails**: it times out
after 90 s at `waitForHarness` (`:164`) and the test aborts at 120 s.

> **Finding: PATCH-124 has no coverage in the governed artifact today.** It is runnable only
> against a dev server, where the fork installs `window.h`. §2a predicted this from source;
> it is now measured. **PATCH-137 is therefore not hygiene — it is restoration of lost
> coverage**, and its priority rises accordingly.

**The hook is shipped but inert, and that distinction matters.** `isTestEnv() || isDevEnv()` is a
**runtime** call, so bundlers cannot eliminate the branch: the literal `window.h=window.h`
assignment is present in the ordinary production bundle
(`.next/static/chunks/1927.*.js`, verified) and simply never executes. **`window.h`'s absence is
therefore a runtime environment property, not a build-time guarantee.** A change to `NODE_ENV`
handling, to Next.js env inlining, or to the fork's `getEnvMode()` would silently restore a
scene-mutation surface — with a working `elements` **setter** — to production, and no build-time
check would notice. This is precisely why §21i.2's permanent runtime assertion has regression
value rather than being a tautology.

**Consequences for the options.** M1 is not installed by Fable 5 production code, is absent from
production artifacts, and is load-bearing for the fork's own suite — so there is no production
global to delete. The bridge exposes no writes and deep-freezes its returns — so there is nothing
to remove there either. **The entire remaining surface is one test file.**

### 21d. PATCH-124 contract census — C1–C13 against §3

| # | Claim | Class | Basis |
|---|---|---|---|
| C1 | Both slides render a PNG thumbnail, natural dims > 100 px | **A** | PATCH-142 proves cold completeness for landscape and a live portrait raster (180×320) |
| C2 | A shape drawn in frame A appears in A's thumbnail (> 12 px) | **C** | PATCH-142 only ever asserts the *unrelated* slide is unchanged. **Never proven for the target slide** |
| C3 | A change to frame A does not alter B's thumbnail | **C** | PATCH-142 proved the **B→A** direction only; A→B is untested |
| C4 | A shape added to frame B refreshes B | **A** | PATCH-142 asserts the portrait thumbnail hash changes after a real portrait draw |
| C5 | A change to frame B does not alter A's thumbnail | **A** | PATCH-142 C5a + C5b, 10/10, strictly stronger than the original `src` proxy |
| C6 | A further change to A refreshes A again | **C** | not covered |
| C7 | Manual refresh yields a genuinely new render for both slides with unchanged content | **C** | PATCH-142 never touches the refresh button; needs the `toDataURL` serial stamp |
| C8 | The refresh cycle terminates ("Generating previews…" clears) | **C** | not covered |
| C9 | Thumbnails contain no transient chrome | **C** | not covered |
| C10 | Two rapid changes → settled thumbnail holds both colours | **C**, split per §10a into **C10a** (coalescing) / **C10b** (two colours) | not covered |
| C11 | No React state-update/unmounted/act() console errors | **C** | not covered |
| C12 | Exact colour content: ±20/channel, alpha > 160, > 12 px | **C** | rides on C2/C10 |
| C13 | Frame targeting is by `frameId` | **A (partial)** / **C** | PATCH-142 asserts membership of the drawn element; the *target-slide-renders-it* half is C |

**Class D (obsolete):** C5c — `src` identity as a contract. Retired by §20h and superseded by
PATCH-142's raster-count + hash evidence. **Class E (not reachable through real UI):** none —
C10's conflation is a *test-semantic* problem solved by the §10a split, not a product gap.

**Nine claims plus one split remain PATCH-137's to prove. No PATCH-142 assertion is duplicated:
PATCH-142 owns "the unrelated slide did not change"; PATCH-137 owns "the edited slide did."**

### 21e. Chosen option — **A — TEST-ONLY MIGRATION**

| Option | Verdict |
|---|---|
| **A — test-only migration** | **CHOSEN.** The only Fable 5 caller of the only mutation surface is one spec file. No production surface needs removal |
| B — remove production mutation bridge | **NOT APPLICABLE.** The bridge has zero write methods, deep-freezes returns, and a live mutation attempt was rejected (§21c) |
| C — remove a legacy PATCH-124 global | **NOT APPLICABLE.** `window.h` is upstream fork tooling, not installed by Fable 5, absent from production, and required by 8 of the fork's own test files. Deleting it would modify an excluded vendored tree and break upstream merges |
| D — product UI gap | **NOT APPLICABLE.** Twelve of thirteen claims migrate unchanged; C10 is a test-semantic issue, not a missing control (§8) |
| E — mixed removal and migration | **NOT APPLICABLE.** There is no production half |
| F — insufficient evidence | **NOT APPLICABLE.** The census is complete and measured |

### 21f. Real-UI characterization design

Migrate `patch-124-slide-thumbnail-refresh.spec.ts` **in place**. Keeping the filename preserves
PATCH-124's identity and renders the migration auditable as a single diff; a rename would obscure
coverage equivalence, which is the one thing this patch must not lose.

**Workflow, all through user-facing controls:**

1. Open a disposable seeded board (existing harness, unchanged) and `waitForE2EBridge`.
2. **Assert `typeof window.h === "undefined"`** — condition 7, and the spec that once required it
   now proves its absence.
3. Open the Slides panel; wait for both rows and for cold completeness.
4. Select the rectangle tool via the enclosing `label` (§7a — the radio input is not the pointer
   target), set **stroke** then **background** by hex, confirm **Solid** fill appears and is set.
5. Drag with `page.mouse` between two points converted from scene to screen through
   `getViewport()`. **Coordinates must be derived from the observed viewport, never assumed.**
6. Verify through the read-only bridge: element exists · `type === "rectangle"` · bounds within
   tolerance · `frameId` is the target frame · **and it resolves to no other frame**.
7. Assert the target thumbnail gains > 12 matching pixels (C2, C12).
8. Assert the unrelated thumbnail is unchanged — hash identity **and** zero pixels of the new
   colour (C3), plus its per-slide raster count did not increase after a stable baseline.
9. Repeat for the mirror direction (C4, C5, C6). Portrait requires a real viewport change; prove
   the element lands in `frame-portrait` (§11 gate 1).
10. Manual refresh → both `src` values change with unchanged content (C7); "Generating previews…"
    clears (C8); no transient chrome (C9); no React console errors (C11).
11. **C10a** — style one rectangle, select it, `Ctrl+D` twice inside the debounce window; assert
    all three shapes present **and exactly one new target-slide raster** (measured 40–55 ms, §7d).
    **C10b** — orange then teal, poll until **both** exceed threshold, closing the §3a race.

**Persistence: NOT required.** Derived from PATCH-124 §3/§7 — no reload, revisit or database
read-back appears in its thirteen claims. Adding it would widen the contract. Excluded.

**Prohibited in the design:** CSS implementation selectors where an accessible role/name exists ·
coordinates not anchored to observed geometry · sleeps as synchronization · any in-test repeat
loop · retries around a failed draw.

### 21g. PATCH-142 reuse — copy the technique, do not share the module

PATCH-142's exact-dimension per-slide raster attribution is directly applicable to C10a and to
step 8. **It must be copied, not extracted into a shared helper.** Both files are
*characterization* specs whose purpose is to freeze behaviour; a shared module would mean a future
edit to one silently changes the other's evidence, and PATCH-142's spec is frozen and may not be
modified. The technique is ~15 lines; the coupling cost far exceeds the duplication cost.

`e2eBridge.ts` (`waitForE2EBridge`) is already a shared PATCH-136 helper and **is** reused as-is.

**No `drawingUiActions.ts` helper is authorized.** §12 permitted one "only if a second spec needs
it". A second spec does draw through real UI — but it is PATCH-142's, which is frozen, so it
cannot become a consumer. With one consumer, the actions stay inline.

**No PATCH-142 test change is authorized.** Only a direct defect in it would reopen that.

### 21h. Allowlists and limits

**Production: NONE.** No production file is authorized. Explicitly excluded: the PATCH-136 bridge
and its contract · thumbnail ordering/signature/readiness files · `DrawingLayout.tsx` · the
Excalidraw fork (including `createTestHook`) · persistence and schema · `package.json` ·
PATCH-144 tooling · generic editor architecture.

**Test: exactly ONE file.**

| File | Change | Limit |
|---|---|---|
| `e2e/characterization/patch-124-slide-thumbnail-refresh.spec.ts` | Replace `waitForHarness` → `waitForE2EBridge`; delete `addRectToFrame` entirely; add real-UI actions; add the `window.h` absence assertion; apply the §10a C10 split; add per-slide raster counting for C10a | current 293 → **≤ 360 lines** |

No new bridge or type test: **PATCH-136's spec already asserts the exact 7-key surface, deep
freezing, `hasMutationSurface === false` and clone-unaffected** (`patch-136-production-readiness.spec.ts:107-120`).
Adding another would be duplicate coverage. The one genuinely unguarded condition — `window.h`
absence — becomes a single assertion inside the migrated spec.

### 21i. Removal safety, induced-failure plan and validation matrix

**Removal safety.** Callers of M1: one (`patch-124-…spec.ts`). Migrate it; then prove zero
remaining callers by repo-wide grep for `window.h` and `updateScene` outside the fork and outside
legitimate production use. No dead global, no compatibility alias, no "just in case" retention —
there is nothing in Fable 5 to retain.

**Induced-failure plan.**

1. **Legacy dependency — ALREADY PROVEN at `f8671aa` (§21c).** PATCH-124's spec times out at
   `waitForHarness` against the governed artifact. Re-run once at implementation to restate it.
2. **Surface absence.** `typeof window.h === "undefined"` in the E2E artifact — becomes a
   **permanent** assertion, not a one-off check, because §21c shows the guard is evaluated at
   runtime and the hook ships inert in the bundle. **No new API may be added to prove an old one
   is gone** — `typeof` on the existing global is sufficient.
3. **Post-migration positive.** The migrated spec passes against the same artifact.
4. **Negative control — mandatory.** Draw the rectangle **outside** the target frame and prove the
   spec fails. A membership assertion that cannot fail is not evidence (PATCH-142 §24e).
5. **Coverage-equivalence table.** Claim-by-claim C1–C13, old assertion → new assertion, in the
   closure record, so deleting `addRectToFrame` cannot silently drop coverage.

**Validation matrix.**

| Gate | Requirement |
|---|---|
| Clean environment | remove `dist/types` + `.next`; **one** `npm run typecheck` → exit 0, declarations regenerated |
| Build | clean ordinary `next build` → exit 0 |
| Exclusion | `assertBridgeExclusion.mjs` across all emitted files; **no** `E2E_BRIDGE_BUILD` marker |
| E2E build | clean `build:e2e` → exit 0; marker contains `1` |
| Units | 36 focused presentation tests still green; **250 ms constant untouched** |
| Characterization | one focused run, then **ten independent `npx playwright test` process invocations** |
| Draw reliability | a deterministic single-run setup failure is **blocking**. No retries, no sleeps to mask it. **PATCH-146 scope must not be consumed** |
| Negative control | passes (i.e. correctly fails) |
| Hygiene | `git diff --check` clean; ordinary `.next` restored; ports 3000–3003 and 3100 free |

### 21j. Hard stops — evaluated

| Stop | Result |
|---|---|
| A production feature depends on the private global | **NOT TRIGGERED** — `window.h` is absent from production and read by no Fable 5 code |
| No stable user-facing route exists for the edit | **NOT TRIGGERED** — §7a selectors all pre-existing; PATCH-142 draws through them 20/20 |
| Removing mutation access breaks non-test integration | **NOT TRIGGERED** — nothing is removed from production; one test helper is deleted |
| Real UI cannot satisfy PATCH-124's contract | **PARTIALLY TRIGGERED, RESOLVED** — C10 alone is unsatisfiable whole (§8); the §10a split replaces it with two strictly stronger assertions |
| More than a narrowly bounded production set required | **NOT TRIGGERED** — zero production files |
| The bridge cannot remain read-only | **NOT TRIGGERED** — it already is; measured, including a rejected mutation attempt |
| The test requires consuming PATCH-146 scope | **NOT TRIGGERED** — ten independent processes, no in-test loop |

**All clear. PATCH-137 is bounded and authorized to implementation.**

### 21j.2 Observations recorded, not authorized

1. **PATCH-124 is currently red against the governed artifact** and has been since the E2E
   production-build regime began. Any claim that it "runs unmodified and still green" holds only
   against a dev server. Not a new defect — the direct consequence of §2a — but it means the
   suite's green status has been reported against two different environments.
2. **`lib/collabboard/layouts/LayoutDebug.ts` has zero importers** and installs a `LayoutDebugger`
   global inside `interactive()`. Dead code, not a mutation surface, out of scope. Candidate for a
   future dead-code patch.
3. **`build:e2e` remains Windows-`cmd` only** (§14). Unchanged decision: a CI prerequisite, not a
   PATCH-137 blocker — on POSIX it silently yields an ordinary build and the specs fail loudly and
   legibly at `waitForE2EBridge`.

### 21k. False-green protection — additions to §17

Reject if: mutation is renamed rather than removed · `updateScene` remains reachable from any test
· any writable member appears on the bridge · the spec mutates the database to simulate drawing ·
frame ownership is inferred from coordinates without checking scene membership · a thumbnail
change is asserted without first proving the element exists · the unrelated-slide control is
dropped · bridge exclusion is skipped · any `window.h` caller remains · `addRectToFrame` is
deleted without the equivalence table · any PATCH-142 assertion is weakened · retries or sleeps
mask a draw failure · the 250 ms constant is touched · a new API is introduced to prove the old
one is absent.

### 21l. Status

**PATCH-137: OPEN · UNBLOCKED · PRIVATE-SURFACE CENSUS COMPLETE AND MEASURED · `window.h` PROVEN
ABSENT FROM BOTH PRODUCTION ARTIFACTS AND OWNED BY THE VENDORED FORK · BRIDGE PROVEN READ-ONLY
WITH ZERO WRITE METHODS · PATCH-124 PROVEN TO HAVE NO COVERAGE IN THE GOVERNED ARTIFACT · OPTION A
(TEST-ONLY MIGRATION) AUTHORIZED · ZERO PRODUCTION FILES · ONE TEST FILE, ≤ 360 LINES ·
IMPLEMENTATION AUTHORIZED · NOT PUSHED.**

**PATCH-142 / 144 / 145:** CLOSED prerequisites, frozen.
**PATCH-138–141:** deferred; resume only after PATCH-137 closes.
**PATCH-146 / 147:** reserved, non-blocking tooling debt. PATCH-137 must not consume PATCH-146's
scope; its ten-invocation strategy is precisely the approach PATCH-146 hypothesised.

### 21m. Recorded diagnostic notes

- **Find the owner of a global before authorizing its removal.** Three of the six options in this
  brief presupposed that Fable 5 installs the PATCH-124 mutation global. It is upstream
  Excalidraw's own dev/test hook, correctly gated, absent from production, and load-bearing for
  eight of the fork's own test files. The right disposition was to touch nothing and migrate the
  single caller — the opposite of what "remove the legacy global" would have produced.
- **A test that cannot run is not a passing test.** PATCH-124 was carried for several patches as
  covered behaviour. Running it once against the governed artifact showed it times out at
  readiness. **Coverage claims should be re-measured in the environment they are claimed for**,
  not inherited from the environment they were written in.
- **"Already correct" is a census result worth spending time on.** The bridge needed no change —
  but that was only knowable by reading it, listing its keys at runtime, and attempting a mutation
  through it. Assuming it was fine and assuming it was leaky would have cost the same and proven
  nothing.
- **Duplication between two characterization specs is cheaper than coupling them.** Both exist to
  freeze behaviour. A shared helper would let a future edit to one silently rewrite the other's
  evidence, which is exactly what a characterization suite must never allow.
- **"Absent from production" and "removed from the bundle" are different claims.** The fork's test
  hook ships in the production bundle and is held back only by a runtime environment check. Had
  the census stopped at "the guard excludes production", the permanent assertion would have looked
  redundant. It is the opposite: a runtime-only guard is exactly the kind that regresses silently.

## 22. Closure review — INDEPENDENT (2026-08-04, CTO / independent governance reviewer)

Performed at `HEAD = dad2784`, re-deriving every acceptance claim from the commit object,
the source tree and fresh execution. No implementation was read from the implementation
report and accepted on trust; each item below was re-measured. Nothing was implemented,
no production or test file was modified, `dad2784` was not amended, nothing was pushed.

### 22a. Implementation commit review

`git show --name-status dad2784` returns exactly one path:

| Check | Result |
|---|---|
| Files changed | **1** — `e2e/characterization/patch-124-slide-thumbnail-refresh.spec.ts` |
| Insertions / deletions | 180 / 188 |
| Final line count | **285** (governed maximum 360) |
| Production files changed | **none** |
| PATCH-136 bridge (`lib/e2e/*`) | unchanged — `git show dad2784 -- lib/e2e/` empty |
| PATCH-142 characterization | unchanged — empty diff |
| PATCH-145 characterization | unchanged — empty diff (and passes, §22j) |
| `package.json` | unchanged — empty diff |
| Vendored Excalidraw fork | unchanged — empty diff |
| Persistence / schema (`lib/infra/drawing/`) | unchanged — empty diff |

File scope is exactly as governed at §21h. **PASS.**

### 22b. Private-surface census after migration

Token census inside the migrated spec:

| Token | Occurrences | Disposition |
|---|---|---|
| `waitForHarness` | 0 | removed |
| `addRectToFrame` | 0 | removed |
| `window.h.app` | 0 | removed |
| `window.h.elements` | 0 | removed |
| `window.h.scene` | 0 | removed |
| `installThumbnailStamp` | 0 | removed (superseded by exact-dimension raster counting) |
| `updateScene` | 1 | **comment only**, line 161 (`no window.h, no updateScene, no raw API`) |

Repository-wide `window.h` census (excluding `node_modules`, `.next`, `dist`) returns
**23 hits, all accounted for**:

- **21 hits** inside `components/collabboard/canvas/excalidraw_fork/**` — the fork's own
  `createTestHook` (`App.tsx:12422,12424`, `:2981`) plus 8 of the fork's own test files
  and its `tests/helpers`. Upstream tooling, correctly untouched per §21b M1 and §21e
  Option C ("NOT APPLICABLE").
- **2 hits** are explanatory comments (`patch-124-...:12,161`; `patch-142-...:145`).
- The permanent assertion at `:204` uses `(window as unknown as { h?: unknown }).h` and is
  therefore not a `window.h` *call site* at all — it is a `typeof` probe.

**No Fable 5 caller remains, and no scene-mutation path is reachable from the spec.**
Every `page.evaluate` in the file was inspected individually (lines 75, 82, 85, 106, 204):
four are pure reads, one (`:106`) builds a *local* scratch canvas to sample pixels. **PASS.**

### 22c. Governed bridge

Bridge members referenced by the spec, extracted mechanically:

- `__COLLABBOARD_E2E__.getSceneElements`
- `__COLLABBOARD_E2E__.getViewport`

Nothing else. `lib/e2e/bridgeRegistration.e2e.ts` re-read in full: the returned object is
`Object.freeze`d, exposes 7 members, every element is `cloneFrozen` (deep clone → deep
freeze) before it leaves, and there is **no write method of any kind**. The surface was not
widened, no writable object escapes, `updateScene` does not appear, and no database
mutation is used as a substitute for UI. **PASS.**

### 22d. Real-UI control path review

Every edit in the spec is a genuine user interaction. Each selector was traced to its
defining source line:

| Control | Selector | Defined at | Verdict |
|---|---|---|---|
| Rectangle tool | `[data-testid="toolbar-rectangle"]` | `Actions.tsx:1150`, `ToolPopover.tsx:111`, `MobileToolBar.tsx:276` | app-owned test ID — **accepted** |
| Stroke / background trigger | `[data-openpopup="elementStroke"\|"elementBackground"]` | `ColorPicker.tsx:260` | app-owned data attribute — **accepted** |
| Hex entry | `input.color-picker-input` | `ColorInput.tsx:77` (+ `ColorPicker.scss:392`) | CSS class — **accepted, see O4** |
| Popover gate | `.color-picker-content` | ColorPicker markup | visibility gate only — **accepted** |
| Solid fill | `[data-testid="fill-solid"]` | `actionProperties.tsx:515` | app-owned test ID — **accepted** |
| Drawing | `page.mouse.move/down/move/up` | — | real pointer input — **accepted** |
| Duplicate | `ControlOrMeta+d` | — | real keyboard shortcut — **accepted** |
| Slide navigation | thumbnail `img[alt="Slide preview"]` click | app markup | user-facing — **accepted** |

None of these reach into internal Excalidraw *state*; they are all the controls a user
operates. **PASS.**

### 22e. Frame membership

`resolvesToFrame` (`:56-62`) was diffed against production
`lib/infra/drawing/frameMembership.ts::resolveFrameMembership` line by line:

| Production | Spec mirror | Match |
|---|---|---|
| `element.frameId !== null && !== undefined` → return it | identical guard, `:58` | ✔ |
| else centre = `x + width/2`, `y + height/2` | identical, `:59-60` | ✔ |
| strict `>` / `<` containment on all four edges | identical, `:61` | ✔ |

The proof is not coordinate-based: `drawStyledRectangle` (`:179-184`) polls the **live scene**
until an element exists that is (a) new, (b) `type === 'rectangle'`, (c) not deleted, and
(d) `resolvesToFrame(el, frameId)`. The created element itself is observed and its own
`frameId` carries the verdict; coordinates only position the pointer. Correct target frame
is proven positively, and non-membership of the unrelated frame is proven by §22g's
per-slide raster and hash isolation. **PASS.** (See O5 for a bounded divergence note.)

### 22f. Thumbnail attribution

| Requirement | Evidence | Verdict |
|---|---|---|
| Exact dimensions | `LANDSCAPE_DIMS = 569×320`, `PORTRAIT_DIMS = 180×320` (`:39-40`) | ✔ |
| No aspect-ratio classifier | `rasterCount` filters `e.width === w && e.height === h` (`:77`) | ✔ — PATCH-142 §22b defect not reintroduced |
| Per-slide counts | separate counters per dimension pair | ✔ |
| Non-zero baselines | `portraitRastersBeforeA` captured after cold load (`:224`); `landscapeBeforeManual` / `portraitBeforeManual` (`:245-246`); `landscapeRastersBeforeDup` (`:265`). Measured baseline in probe: **9** | ✔ |
| Target thumbnail visibly changes | `waitForThumbnailChange` requires hash change **and** `colorHits[colour] > 12` (`:132-138`) | ✔ |
| Unrelated thumbnail unchanged | hash equality (`:230`, `:237`) **and** raster-count equality (`:231`) | ✔ |
| `src` string alone not relied on | `src` is only used for the PNG prefix check at `:223`; every behavioural assertion uses decoded pixels | ✔ |

The sampler decodes the image into a scratch canvas and reads `getImageData`; it never calls
`toDataURL`, so **it does not pollute the raster counter** — confirmed by reading `:106-128`.
**PASS.**

### 22g. Mirror direction

| Direction | Mechanism | Assertion | Verdict |
|---|---|---|---|
| Landscape edit → landscape updates | real UI red draw, `:227` | `colorHits.red > 12`, `:228` | ✔ |
| … portrait unchanged | — | hash `:230` **and** raster count `:231` | ✔ |
| Portrait edit → portrait updates | real UI green draw, `:234` | `colorHits.green > 12`, `:235` | ✔ |
| … landscape unchanged | — | hash `:237` | ✔ |

Both directions use identical real-UI machinery; neither retains mutation or weaker
evidence. The A→B direction is in fact *stronger* than the B→A direction (it adds the
raster-count check), and PATCH-142 §24 independently owns the B→A raster case. **PASS.**

### 22h. C10a — coalescing

Sequence inspected at `:262-270`:

1. real orange draw, then `waitForThumbnailChange` — the baseline is taken **after** the
   draw has settled, not mid-flight (`:262-263`);
2. `beforeDup` scene length and `landscapeRastersBeforeDup` captured (`:264-265`);
3. two real `ControlOrMeta+d` presses (`:266-267`);
4. scene confirms **exactly two** new elements (`:268`);
5. raster count polled to increase, then asserted `=== baseline + 1` (`:269-270`).

The production 250 ms debounce is **not modified** — no timer patching, no fake clock, no
`page.clock` usage anywhere in the file. The 40–55 ms figure is a *measured property* of
back-to-back `keyboard.press` calls recorded at §7d; the spec contains **no** `waitForTimeout`
between the two presses, so it is not an arbitrary wait masking a race.

**Independently measured** with a temporary probe (copy of the spec, deleted afterwards)
sampling the landscape raster count at the assertion point and at +500/+1500/+3000 ms:

```
C10A_PROBE baseline=9 atAssertion=10 at500=10 at1500=10 at3000=10
```

The count is `baseline + 1` at the assertion point **and remains there for a full 3 s**.
Coalescing genuinely holds and the assertion reports the settled value. **PASS**, with
observation O1 recorded on the assertion's *future* discriminating power.

### 22i. C10b — two-colour polling

At `:274-280`: orange already present, a second real UI draw adds teal, then

```ts
await expect.poll(async () => {
  const sample = await sampleThumbnail(slideA, colors);
  return sample.colorHits.orange > 12 && sample.colorHits.teal > 12;
}, ...).toBe(true);
```

The predicate is a **conjunction**, so an intermediate one-colour thumbnail cannot satisfy
it — the original PATCH-124 race (accepting the first `hash`-changed sample as settled) is
structurally impossible, not merely unlikely. A final hash-inequality check (`:280`) confirms
the sample is not the pre-teal frame. No `src` identity shortcut is used. **PASS.**

### 22j. C1–C13 equivalence — independent table

Built by reading the assertions, not the claim-map comment, then cross-checked against it.

| Claim | Original contract | Where it now lives | Verdict |
|---|---|---|---|
| C1 | Both slides render a PNG thumbnail, natural dims > 100 px | `:221-223` PNG prefix (slide A); both slides sampled successfully; **exact** 569×320 / 180×320 rasters required by the polls at `:248-249` | **Retained, strengthened** — exact dimensions are strictly stronger than “> 100 px”. See **O2** |
| C2 | Shape in A appears in A's thumbnail (> 12 px) | `:227-228` real red draw + `colorHits.red > 12` | **Retained via real UI** |
| C3 | Change to A does not alter B | `:230` hash **+** `:231` raster count | **Retained, strengthened** |
| C4 | Shape in B refreshes B | `:234-235` real green draw | **Retained via real UI** |
| C5 | Change to B does not alter A | `:237` hash equality (original used `src`) | **Retained, strengthened**; PATCH-142 §24 owns the general case |
| C5c | `src` identity as a cross-frame contract | — | **Obsolete**, explicitly superseded by PATCH-142 §24; recorded at `:31` |
| C6 | Further change to A refreshes A again | `:240-241` real purple draw | **Retained via real UI** |
| C7 | Manual refresh → genuinely new render, content unchanged | `:244-254`: raster count increases for **both** slides, hash unchanged, both colours still present | **Retained, strengthened** — replaces the pixel-stamp hack with true render counting |
| C8 | Refresh cycle terminates | `:250` `waitForRefreshButtonIdle` | **Retained** |
| C9 | No transient chrome | `:257-258` both slides | **Retained** |
| C10 | Two rapid changes → both colours | **Split** per §10a: C10a `:262-270`, C10b `:274-280` | **Split, both proven** |
| C11 | No React state-update/unmounted/act() console errors | `:194-195` capture, `:283` assertion | **Retained** |
| C12 | ±20/channel, alpha > 160, > 12 px | `:124` predicate; thresholds at `:137`, `:252-253`, `:278` | **Retained** |
| C13 | Frame targeting by `frameId` | `resolvesToFrame` + creation poll `:181`, on **every** draw | **Retained, strengthened** |
| — | Persistence / reload | not required — no C1–C13 claim reloads or reads back | **Correctly absent** (§21f) |

**No claim was silently dropped.** The one textual reduction (C1's explicit `> 100 px`
assertion) is superseded by a stronger requirement; it is recorded as O2 rather than waved
through. The in-file claim map at `:12-32` matches this independently-derived table.
**PASS.**

### 22k. `window.h` absence

The spec asserts, at `:204`, immediately after `waitForE2EBridge` and **before any drawing**:

```ts
expect(await page.evaluate(() => typeof (window as unknown as { h?: unknown }).h)).toBe('undefined');
```

Run independently against the freshly built governed E2E artifact: **passes in all 21
executions** (§22m/§22n). The ordinary production bundle does not execute the vendored hook —
`assertBridgeExclusion.mjs` proves bridge exclusion across **891 emitted files** and the
`E2E_BRIDGE_BUILD` marker is absent (§22o steps 7 and 12–13); the hook itself remains held
back at runtime by `isTestEnv() || isDevEnv()`, exactly as censused at §21c. Deletion of the
vendored hook is **not** required under PATCH-137 and was not performed. **PASS.**

### 22l. Induced-failure review — all three points reproduced

**1. Parent-state PATCH-124 against the governed E2E artifact.** The pre-migration spec was
materialised from `f5520ad` into a temporary sibling file and executed:

```
Test timeout of 120000ms exceeded.
Error: page.waitForFunction: Test timeout of 120000ms exceeded.
  164 |   await page.waitForFunction(() => {
  165 |     const target = window as ... { h?: { app?: unknown; elements?: unknown[] } };
  166 |     return Boolean(target.h?.app && Array.isArray(target.h.elements));
  167 |   }, { timeout: 90_000 });
  at waitForHarness (__parent-state-probe.spec.ts:164:14)
```

Fails waiting for the private harness, as governed. This independently confirms §21c's
central finding: **PATCH-124 had already lost all coverage against the governed artifact
before this patch** — the migration restores coverage rather than merely relocating it.

**2. Current migrated test.** Passes through real UI (§22m).

**3. Temporary negative control.** A copy of the spec with the first draw relocated to
`(650,800)-(750,860)` — centre `(700, 830)`, below the landscape frame (height 720) and
outside the portrait frame's x range, therefore belonging to **no** frame:

```
Expected: true
Received: false
  at drawStyledRectangle (__negctl-probe.spec.ts:184:50)
  at __negctl-probe.spec.ts:229:5
```

Fails precisely at the frame-membership poll. The membership assertion is genuinely
sensitive to real ownership and is not vacuously true.

**Cleanup verified.** Both probes and the parent-state file were deleted, `test-results`
removed, and the committed spec confirmed **byte-identical** to `dad2784`
(`git diff --exit-code dad2784 -- <spec>` → clean). `git diff --check` exits 0. Neither
probe was committed. **PASS.**

### 22m. Focused run

One focused invocation against the governed artifact:

```
ok 2 [characterization] patch-124-slide-thumbnail-refresh.spec.ts:191:7 (30.4s)
2 passed (35.0s)
```

**PASS.**

### 22n. Ten independent process invocations — plus ten more

Ten **separate** `npx playwright test` CLI invocations (separate Node processes, not an
in-test loop — PATCH-146 scope deliberately not consumed), fresh board and browser state per
run, `retries: 0` locally, no `--repeat-each`:

| Run | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Result | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Duration | 32.3s | 32.4s | 31.7s | 33.2s | 36.5s | 34.4s | 30.0s | 30.3s | 31.4s | 34.3s |

**10/10, no setup failures, no retries.** Because an anomaly had been observed on a modified
copy (O3), a **second, unrequired batch of ten** was run to widen the denominator:

| Run | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|
| Result | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Duration | 35.7s | 34.6s | 36.7s | 35.4s | 35.1s | 34.3s | 32.4s | 30.2s | 34.1s | 34.5s |

**Observed flake rate on the governed spec: 0/21** (20 independent + 1 focused). Duration
spread 30.0–36.7 s is tight, with no drift across the batch. **PASS.**

### 22o. Clean-environment validation — all 13 steps

| # | Step | Result |
|---|---|---|
| 1 | remove vendored `dist/types` (excalidraw + common) | removed, absence confirmed |
| 2 | remove `.next` | removed, absence confirmed |
| 3 | **one** `npm run typecheck` | completed |
| 4 | fresh declarations generated | **410** `.d.ts` files (generator exits 1 on two pre-existing `SearchMenu.tsx` errors and emits 410 with no TS5055 — exactly PATCH-144's closed contract) |
| 5 | typecheck exits 0 | **exit 0**; re-confirmed authoritatively with a bare `npx tsc --noEmit` → **exit 0**, no output |
| 6 | ordinary `npx next build` | **exit 0** |
| 7 | `node scripts/e2e/assertBridgeExclusion.mjs` | **exit 0** — "Bridge exclusion proven across 891 emitted files"; `E2E_BRIDGE_BUILD` absent |
| 8 | remove `.next` | ordinary artifact set aside |
| 9 | clean E2E build (`npm run build:e2e`) | **exit 0** |
| 10 | marker contains `1` | `.next/E2E_BRIDGE_BUILD` → **`1`** |
| 11 | restore ordinary `.next` | restored |
| 12 | rerun exclusion | **exit 0** — 891 files |
| 13 | confirm no marker | `.next/E2E_BRIDGE_BUILD` **absent** |

**PASS.** Ordinary artifacts exclude the bridge; the E2E artifact carries it exactly once.

### 22p. Focused regression validation

| Suite | Result |
|---|---|
| Presentation unit tests (`lib/infra/presentation`) | **36/36 pass** — `slideOrder` 7, `slideThumbnailRefresh` 19, `waitForOverlayReadiness` 5, `slideRenderSignature` 5 |
| PATCH-136 bridge characterization | **3/3 pass** (selection, exclusion/containment, runtime bounded-frozen-cloned-revisioned) |
| PATCH-142 characterization | **1/1 pass** (20.8s) |
| PATCH-145 characterization | **1/1 pass** (15.7s) |
| Migrated PATCH-124 characterization | **21/21 pass** (§22m, §22n) |
| `git diff --check` | **exit 0** |

None of these files was modified — verified by empty diffs in §22a. **PASS.**

### 22q. Observations — classified

| # | Observation | Classification |
|---|---|---|
| **O1** | **C10a's `=== baseline + 1` is read immediately after the poll first sees *any* increase, with no settle window.** Measured directly (§22h): the count stays at `+1` through +3000 ms, so the claim is true and the assertion reports the settled value today. But as written, a future coalescing regression that emitted its second raster ~250 ms later could slip past, because the assertion samples before that window elapses. The scene-count `+2` precondition and the stable post-draw baseline keep the test from being vacuous. | **Non-blocking test-sensitivity observation.** Recommend a bounded settle window (e.g. re-assert after 500 ms) whenever this file is next opened. Not a defect in the proven property, and not grounds to withhold closure. |
| **O2** | **C1's explicit "natural dimensions > 100 px" assertion was dropped**; PNG-prefix is asserted for slide A only (`:223`), not B. | **Accepted implementation detail.** Superseded by a strictly stronger requirement — the polls at `:248-249` cannot pass unless rasters at exactly 569×320 **and** 180×320 occur — and `sampleThumbnail` throws on a zero-size canvas. Recorded so the reduction is not mistaken for an oversight. |
| **O3** | **One anomalous failure on a *modified copy* of the spec** (`colorHits.red = 0` vs `> 12`, ~11 s in). The copy's only edit was three `waitForTimeout` calls placed **after** the failure point, so the edit cannot have caused it through its own code path. It **did not reproduce**: the same probe passed on immediate re-run, and the governed spec then passed 21/21 consecutively. The run occurred immediately after the 2-minute parent-state timeout failure. | **Non-blocking, unreproduced anomaly — reported, not hidden.** Not a setup failure (auth setup passed). Not PATCH-146's many-cycle issue (single-cycle test). Residue from an aborted preceding run is a **plausible but unproven** mechanism and is explicitly *not* asserted as the cause. Bounded by a 0/21 observed flake rate on the governed file. If it recurs, open a patch against thumbnail-settling timing rather than re-litigating this closure. |
| **O4** | Hex entry uses `input.color-picker-input` (CSS class) although `ColorInput.tsx:77` also carries an `aria-label`. | **Accepted implementation detail.** The `aria-label` is i18n-derived and therefore locale-fragile; the class is load-bearing in `ColorPicker.scss:392` and used by the fork's own tests. The class is the more stable choice here, so §21f's "prefer accessible controls" preference is correctly overridden. |
| **O5** | `resolvesToFrame` tests containment against **one named frame**, whereas production resolves the **first match in array order** across a frame list. | **Accepted implementation detail.** Equivalent for this fixture: landscape `(0,0,1280,720)` and portrait `(1400,0,720,1280)` are disjoint, so no tie-break can arise. The divergence would only matter for overlapping frames, which this fixture does not create. |
| **O6** | Drawing requires coordinates in a region clear of the floating properties panel (`.Island`, measured x:72–272), and requires clicking the target slide's thumbnail first to pan/zoom the canvas to that frame. | **Non-blocking test fragility — explicitly permitted.** Coordinates are derived from the **live** `getViewport()` and validated through **observed frame membership**, which §"DRAW RELIABILITY" declares acceptable. Critically it **fails safe**: if the panel widened, the pointer would miss the canvas and the membership poll would time out loudly (exactly the negative control's signature) rather than pass on weaker evidence. |
| **O7** | The pixel sampler builds a scratch canvas at the thumbnail's natural size — the same 569×320 the raster counter filters on. | **Accepted, and worth recording.** It calls `getImageData`, **never** `toDataURL`, so it cannot inflate the raster counter. Verified by reading `:106-128`. Any future edit that switches the sampler to `toDataURL` would silently corrupt every count in the file. |

Governance directed that coordinate use must not be rejected merely for existing. It is not:
O6 is accepted on the stated grounds. No observation is classified as blocking reliance on
layout coordinates.

### 22r. Acceptance contract

| # | Criterion | Result |
|---|---|---|
| 1 | Old PATCH-124 private mutation dependency removed | **PASS** §22b |
| 2 | No replacement writable bridge or mutation hook introduced | **PASS** §22c |
| 3 | `window.h` absent in the governed E2E artifact | **PASS** §22k |
| 4 | Real UI creates the intended element | **PASS** §22d |
| 5 | Element membership proven from scene state | **PASS** §22e |
| 6 | Target thumbnail changes | **PASS** §22f |
| 7 | Unrelated thumbnail remains unchanged | **PASS** §22f |
| 8 | Both slide directions covered | **PASS** §22g |
| 9 | C10a coalescing passes | **PASS** §22h (+O1) |
| 10 | C10b two-colour polling passes | **PASS** §22i |
| 11 | Manual refresh / chrome / console claims remain covered | **PASS** §22j (C7, C8, C9, C11) |
| 12 | C1–C13 equivalence preserved or explicitly superseded | **PASS** §22j (+O2) |
| 13 | Ten independent process runs pass | **PASS** §22n — 20/20, plus focused |
| 14 | Negative control fails | **PASS** §22l |
| 15 | Ordinary artifacts exclude the bridge | **PASS** §22o |
| 16 | No production changes were required | **PASS** §22a |

All sixteen hold.

### 22s. Classification

**2 — PASS WITH NON-BLOCKING OBSERVATIONS.**

The migration achieves what §21e Option A set out to do, and does so on stronger evidence
than the original: PATCH-124's claims are now proven through the same controls a user
operates, observed only through a frozen read-only surface, against the artifact that
actually ships. The two findings that matter (O1's C10a settle window, O3's unreproduced
anomaly) were both **measured rather than argued** — O1's underlying property was verified
stable to 3 s, and O3 was bounded by doubling the required run count. Neither undermines a
claim the patch asserts.

Not classification 1, because O1 identifies a real, if latent, reduction in future
regression-detection power that a subsequent editor must know about, and O3 is an observed
failure that must remain visible rather than be smoothed into a clean record.

### 22t. Status and patch dependencies

- **PATCH-137: CLOSED** — Option A (test-only migration) implemented and independently
  verified at `dad2784`. Zero production files. One test file, 285/360 lines.
- **PATCH-138: RELEASED** — becomes the next active patch.
- **PATCH-139–141:** remain in their governed sequence, **not** closed by this review.
- **PATCH-146** (many-cycles-in-one-test ceiling): remains **RESERVED, non-blocking**. The
  evidence for it weakens further — 20 additional clean single-cycle process invocations
  with zero setup failures. O3 is explicitly **not** attributed to it.
- **PATCH-147** (Windows lifecycle `spawn npm ENOENT`): remains **RESERVED, non-blocking**.

### 22u. Reviewer's notes

- **"Absent from the artifact" was worth re-proving by execution.** The parent-state run did
  not merely fail — it failed at `waitForHarness` after 90 s, which is the signature of a
  capability that was never there, not of a flaky wait. Reading §21c would have told me the
  same thing; running it made the difference between a cited finding and a verified one.
- **A probe that fails once is data, not noise.** The cheapest response to O3 would have been
  to re-run until green and report the green. Doubling the run batch cost six minutes and
  converted an anecdote into a bounded rate (0/21), which is what a future reader actually
  needs in order to judge a recurrence.
- **Measure the settle window before calling a timing assertion sound.** O1 looked like a
  false-green when read statically. Sampling the raster count at +0/+500/+1500/+3000 ms
  showed the property genuinely holds — so the correct verdict was "weak future
  sensitivity", not "defective assertion". Static reading alone would have produced the
  wrong classification in both directions.
- **Check what the instrument touches.** The sampler allocates a canvas at exactly the
  dimensions the raster counter filters on. It happens to be safe only because it uses
  `getImageData`. That is one edit away from silently invalidating every count in the file,
  which is why it is recorded as O7 rather than left as an unstated coincidence.
