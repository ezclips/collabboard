# PATCH-137 — PATCH-124 PRIVATE MUTATION REMOVAL: FEASIBILITY AND GOVERNANCE

**Status:** governance, source census and feasibility spike. **No final migration implemented.**
**Authored:** 2026-08-03 (CTO). **Base:** `c852d95`.
**Predecessors:** PATCH-124 (closed) · PATCH-136 (closed, §18f split this patch out).

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
