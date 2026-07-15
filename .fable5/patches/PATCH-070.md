# PATCH-070 - Restore Fullscreen Native Above-Band Raster (staged, diagnosis-first)

**Status:** AUTHORIZED — **Stage 0 only** (runtime discrimination probe).
Stage 1 (the production fix) is **LOCKED** until a named CTO amendment binds
exactly one decision row from §3 to exactly one design from §5.

**Base commit (bind, verify before editing):**
`05e913ef84c802b999bc4411d960873e4b21bb23`
(`test(drawing): characterize blank native slide raster (PATCH-069)`)

**Bound commit messages (use verbatim):**

- Stage 0: `test(drawing): probe fullscreen above-band export runtime (PATCH-070 Stage 0)`
- Stage 1 (reserved; re-bound by the Stage-1 amendment):
  `fix(presentation): restore fullscreen native raster (PATCH-070)`

**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent, read-only,
uncommitted diff, explicit PASS required before each stage's commit).
**Closure:** Fable (CTO) after each stage lands.

---

## 1. Purpose — exactly one subsystem

PATCH-069 proved (classification **N2**, live evidence, Sonnet PASS):

- persisted scene matches seed exactly (text `text-landscape` scene index 4,
  shape `shape-landscape` scene index 5; visible, non-deleted, opaque,
  non-zero size);
- the pure composition plan over the **persisted** scene returns
  `nativeBelowIds=[]`, `nativeAboveIds=[text-landscape, shape-landscape]`,
  padlet range 2..3, expected native band `above`, nothing dropped;
- fullscreen shows exactly one loaded data PNG — the **below** band
  (1280×720, blank for the native regions); the required **above-band PNG
  never materializes in the DOM**;
- the thumbnail surface (N5) renders the same native content correctly,
  proving the content is exportable.

PATCH-070 restores the fullscreen above-band raster. The census below
(§2) narrows the failure to the fullscreen runtime path but **cannot
discriminate the exact mechanism from source alone** — three live
mechanisms survive. Per governance, this patch is therefore **staged**:
Stage 0 adds a deterministic, test-only runtime probe that maps the live
behavior onto exactly one decision row (§3); a named amendment then
authorizes the row-bound smallest fix (§5) as Stage 1.

No production file may change in Stage 0. No fix may be attempted before
the amendment.

---

## 2. Census (fresh, 2026-07-15, at base `05e913e`; all files below are
fenced except the two authorized-change files in §6)

### 2.A RuntimeSlideRenderer lifecycle
(`components/presentation/runtime-slide/RuntimeSlideRenderer.tsx`,
233 lines, hash `a407cccc…`)

- Props (`:12-19`): `slide: FrameSlide | undefined`,
  `sceneElements: readonly any[]`, `allPadlets: Padlet[]`, `files: any`,
  `vpW`, `vpH`.
- Composition plan (`:53-61`): `useMemo` calling the real
  `planSlideComposition(slide, sceneElements, allPadlets)`; deps
  `[slide?.id, sceneElements, allPadlets]` (array identity).
- State (`:42-45`): `belowPng`, `abovePng` (both `string | null`),
  `hasCommittedInitialBase`, `isPadletLayerReady`.
- Export effect (`:99-149`): deps `[compositionPlan, files, scale]`.
  Each run claims a monotonic token (`renderTokenRef`, `:49`, `:104`) and
  a per-run `cancelled` flag; cleanup sets `cancelled = true` (`:147`).
- **Below and above exports are fully independent promise chains**
  (`:114-127` and `:130-145`), each with its own
  `.catch(() => { /* silent */ })` (`:127`, `:144`). **One band's failure
  cannot structurally suppress the other** — design class 1 of the
  original candidate list ("shared try/catch loses the second export")
  is IMPOSSIBLE in this code and is closed by census.
- The above export **starts only if**
  `compositionPlan.nativeAboveElements.length > 0` (`:130`).
- Commit guards (three per band, `:123`, `:140`):
  `!cancelled && canvas && renderTokenRef.current === token`.
- Old PNGs are deliberately NOT cleared on plan change (`:112-113`
  comment) — stale previous-slide rasters persist transiently by design.
- Above-band `<img>` is conditionally mounted `{abovePng && (…)}`
  (`:213`) at `zIndex: 3` (`:227`); below at `zIndex: 1` (`:188`).
  PATCH-069's "above PNG absent from DOM" therefore means **`setAbovePng`
  was never called with a value**, not "present but blank".
- Exhaustive absence mechanisms (this list is closed):
  1. `nativeAboveElements` empty at runtime → export never starts (§3 F4);
  2. the above export promise rejects → silent catch (§3 F1);
  3. `canvas.toDataURL` throws inside `.then` → rejection → same silent
     catch (§3 F2);
  4. commit suppressed by `cancelled`/token mismatch on every run whose
     above export resolves (§3 F3);
  5. zero-area/invalid export bounds (§3 F6 — would usually still mount a
     degenerate img; discriminated by dimensions).

### 2.B renderExcalidrawSlideBase
(`components/presentation/slide-renderer/renderExcalidrawSlideBase.ts`,
hash `8e088e9f…`, fenced)

- Returns `null` ONLY when `!frameElement && elements.length === 0 &&
  !includeBackground` (`:21-23`). With a live frame element it can never
  return null for the above band — the `canvas` truthiness commit guard
  is not the suppressor when the frame resolves.
- Dynamically imports `exportToCanvas` from `@excalidraw/excalidraw`
  (`:25`) → the vendored fork (`package.json:24`, `file:` dependency).
- `appState` (`:29-33`): above band gets `exportBackground: false`,
  `viewBackgroundColor: "transparent"`; `exportingFrame: frameElement`
  (`:35`); `getDimensions` multiplies by `opts.scale` (`:36-43`);
  `exportPadding: opts.paddingPx ?? 0` (`:44`) — neutralized anyway by
  the fork for frame exports (§2.C).
- Accepts `slide` but never uses it. No special-casing of empty element
  arrays beyond the null gate; text and rectangle enter identically.
  **The above-band input differs from the (succeeding) thumbnail
  above-band input only in the numeric `opts.scale`** (thumbnail's
  `paddingPx: 20` is discarded for frame exports).
- No error handling — rejections propagate to the caller.

### 2.C exportToCanvas fork path

- Wrapper (`…/excalidraw_fork/packages/utils/src/export.ts:40-100`,
  hash `e29e3963…`): `restoreElements(elements, null,
  { deleteInvisibleElements: true })` + `restoreAppState`, then delegates
  to the scene implementation with a `createCanvas` honoring
  `getDimensions`.
- Core (`…/packages/excalidraw/scene/export.ts:172-276`, hash
  `7cf111f6…`):
  - `await loadFonts()` FIRST (`:196-201`), default
    `Fonts.loadElementsFonts(elements)`. Empty element array (below
    band) → zero families → no-op. Rectangle carries no font; only the
    text element induces font loading.
  - `prepareElementsForRender` with `exportingFrame` →
    `getElementsOverlappingFrame(elements, frame)` (`:159-160`).
  - Canvas sized from the FRAME's bounds when `exportingFrame` is set
    (`:224-227`) — this is why PATCH-069's below PNG measured exactly
    1280×720 at scale 1, which **proves `compositionPlan.frameElement`
    resolved live at fullscreen time** (the frame was present in the
    live element array).
  - `exportPadding` forced to 0 for frame exports (`:220-222`).
  - `updateImageCache` is a no-op without image elements.
  - `renderStaticScene` is synchronous (`:241-273`); any throw inside it
    rejects the async `exportToCanvas`.
- Frame membership filter
  (`…/packages/element/src/frame.ts:920-934`, hash `3c820995…`):
  geometric bbox overlap plus `!el.frameId || el.frameId === frame.id`.
  The frame element does NOT need to be inside `elements`. Elements
  outside frame bounds are excluded (would yield a present-but-blank
  above PNG — contradicted by the absent img, so not the live shape).
- **Font loading cannot reject the export**
  (`…/packages/excalidraw/fonts/Fonts.ts:237-271`, hash `195fb51f…`):
  each `document.fonts.load` is wrapped in try/catch that
  `console.error`s and continues ("don't let it all fail if just one
  font fails to load", `:260`). Text with an unloaded font renders with
  fallback metrics — visible, not blank, not a rejection.

### 2.D Fullscreen versus thumbnail path

- Thumbnail (`components/presentation/slide-renderer/
  createSlideRenderer.tsx:216-235`, hash `ce236e91…`, fenced): calls the
  SAME `planSlideComposition` and the SAME `renderExcalidrawSlideBase`
  for below AND above inside one `Promise.all`, merges via
  `mergeSlideLayers`. A rejection of ANY band rejects the whole
  thumbnail. PATCH-069's thumbnail EXISTS and shows the native content;
  since the below band is empty for this fixture, **the visible native
  text+shape in the thumbnail can only have come from the above-band
  canvas** → the shared export pipeline demonstrably succeeds for these
  exact elements under thumbnail-time conditions.
- Data sources: thumbnail getters read React state directly
  (`DrawingLayout.tsx:1903-1907` — `() => elements`, `() => padlets`);
  the fullscreen `runtimeSlideHelpers` read refs (`:1916-1920`) that are
  re-synced from the SAME state on every DrawingLayout render
  (`:695-697`). Same data, different indirection — not stale by
  construction. `FullscreenPresentation.tsx:229-231` (hash `caea1141…`)
  invokes the getters on every render; `RuntimeSlideRenderer` memoizes
  the plan on prop identity.
- Timing: thumbnails are generated once at panel-mount settle
  (double-RAF, `useSlideThumbnails.ts:87-100`) and CACHED by render
  signature; the fullscreen plan is computed at fullscreen-open. Any
  scene mutation between those moments diverges the two plans while the
  thumbnail stays stale-good.
- `handleStartPresentation` (`DrawingLayout.tsx:1503-1508`) is pure
  state (`setPresentationStartId`/`setPresentationActive`) — no scene
  mutation at open.
- Harness-seeded elements carry `index: null`
  (`drawingBridgeHarness.ts:101/:136/:167/:209`); Excalidraw restore
  assigns fractional indices in array order, so initial live order =
  persisted order. A later reorder could only come from a live
  `onChange`/scene reconciliation (e.g., the documented one-shot
  embeddable refresh) — unproven either way from source.
- Error-handling asymmetry: a thumbnail-path rejection is VISIBLE
  (missing thumbnail — none observed); a fullscreen-path rejection is
  silently swallowed.
- Consequence for the plan-divergence hypothesis (F4): the only
  runtime-plan shape consistent with BOTH the blank below PNG and the
  absent above PNG is the **mid-band gap** (natives ordered strictly
  between the first and last padlet index at runtime → dropped from
  BOTH bands). Natives migrating to the below band would have appeared
  in the below PNG — excluded by the observed blank.

### 2.E Font CORS evidence — ruling

The live run recorded a Virgil font CORS failure from unpkg.com plus one
`net::ERR_FAILED`. Source census (§2.C) proves the fork's font loader
swallows load failures; a font failure cannot reject the export, and
text renders with fallback. **Ruling: unrelated noise for the
missing-PNG defect** (at most a cosmetic glyph-fidelity contributor).
Row F5 is retained in §3 only as a cross-check; it can be reopened only
by Stage-0 evidence directly contradicting this census (which would be
an anomaly → STOP).

### 2.F Silent failure boundary — closed enumeration

Given §2.A–2.D, the above-band PNG can be absent only via:
`(i)` plan-empty at runtime (never starts) — F4;
`(ii)` export promise rejects — F1;
`(iii)` `toDataURL` throws — F2;
`(iv)` commit suppressed by `cancelled`/token on every resolving run — F3;
`(v)` degenerate bounds — F6.
Font readiness (F5) is closed at source. Nothing else in the pipeline
can produce this symptom without contradicting an observed fact (frame
dims prove frame resolution; thumbnail proves element exportability).
**Which of (i)–(iv) is live is NOT source-determinable** — hence Stage 0.

---

## 3. Decision table — Stage 0 must prove exactly one row

Stage 0 binds these observables (all test-only, gathered in the existing
sole allowed spec file via Playwright `addInitScript`/`evaluate`/network
interception — no production instrumentation):

- **O1** — every `HTMLCanvasElement.prototype.toDataURL` invocation
  inside the fullscreen window (probe log reset immediately before
  entering fullscreen): timestamp, canvas width/height, success or
  thrown error.
- **O2** — deterministic evidence whether the above-band
  `exportToCanvas` invocation BEGAN in the fullscreen window (probe
  design is implementer latitude — e.g., export-canvas creation/dimension
  tracing at the `document.createElement("canvas")`/property level —
  but Sonnet must verify it discriminates deterministically and cannot
  be confused by unrelated canvases; scoping the log window and
  filtering by canvas dimensions are the expected tools).
- **O3** — post-run persisted-scene re-fetch (Node side, service role):
  element order compared to seed order, plus a rerun of the real
  `planSlideComposition` against the post-run persisted scene.
- **O4** — `document.fonts.load` call/result log (cross-check only).
- **O5** — the existing above-img DOM census (presence + dimensions).

| Row | Meaning | Bound discrimination |
|---|---|---|
| **F1** | above export promise rejects | O2: above export began; O1: exactly one successful `toDataURL` (below); O5: absent |
| **F2** | export succeeds, `toDataURL` fails | O1: a second `toDataURL` invocation recorded as THROWN; O5: absent |
| **F3** | `setAbovePng` suppressed by cancellation/stale token | O1: ≥2 successful `toDataURL` (above canvas produced a data URL); O5: absent |
| **F4** | above input invalid / runtime plan divergence (incl. mid-band gap live) | O2: above export never began; corroborated by O3 order divergence and/or plan rerun dropping the natives |
| **F5** | font readiness (closed by §2.C census) | reopened ONLY if O4 shows a load failure PROPAGATING as a rejection — treat as anomaly, STOP |
| **F6** | crop/bounds produce invalid export | O1: second `toDataURL` on a zero-area canvas, or O5: img present with invalid dimensions |
| **F7** | another narrow deterministic cause | only with explicit probe evidence naming the mechanism |

**Any result not mapping cleanly onto exactly one row, or mapping onto
two rows simultaneously → STOP. Do not guess. Report and wait for an
amendment.**

Stage 0 must record the proven row (and the raw observables) in a
structured annotation `patch-070-stage0-probe` and must leave every
existing PATCH-069 assertion intact and green (the defect is still
present during Stage 0; N2/N5, all-zero `nativeRasterCounts`, and the
band censuses still hold).

---

## 4. Stage protocol

1. **Stage 0 (authorized now):** GPT-5.5 edits ONLY
   `e2e/characterization/drawing-presentation.spec.ts` to add the probe
   (§3). Must reproduce PATCH-069's N2 behavior first (stop condition if
   not). Sonnet reviews the uncommitted diff; on PASS, GPT-5.5 commits
   with the bound Stage-0 message and pushes. Fable records the proven
   row.
2. **Amendment gate:** the CTO issues a named amendment binding the
   proven row to exactly one Stage-1 design (§5), re-verifying the
   `RuntimeSlideRenderer.tsx` authorized hash. No production edit before
   this amendment exists.
3. **Stage 1 (locked):** GPT-5.5 implements the bound fix in
   `components/presentation/runtime-slide/RuntimeSlideRenderer.tsx` and
   evolves the spec into the post-fix regression (§7). Sonnet reviews;
   on PASS, commit with the bound Stage-1 message; push; Fable closes.

---

## 5. Stage-1 design classes — bound per row (accepted/rejected)

Accepted, one per row (the amendment picks exactly one):

- **F3 → lifecycle-race fix only** (design class 5): correct the proven
  suppression (e.g., commit-guard/token interaction), preserving
  cleanup, stale-slide protection, and the no-blank-frames behavior.
- **F1/F2 → root-repair at the proven throwing site's INPUT** (design
  class 2): normalize only the export input inside
  `RuntimeSlideRenderer.tsx` (never mutate persisted scene, preserve
  element IDs/geometry). Note: blanket error isolation is already
  structurally present (§2.A) and is NOT an accepted fix on its own.
- **F4 → STOP at amendment level**: the CTO decides between export-input
  normalization inside `RuntimeSlideRenderer.tsx` (class 2) and a
  planner ruling — `planSlideComposition.ts` remains PROHIBITED under
  this patch and would require its own authorization if census then
  proves planner output wrong.
- **F5 → font-readiness fix** (class 3: await the same readiness path the
  thumbnail uses; no sleeps; no remote-font dependency) — only if Stage 0
  overturns the §2.E census; treat as anomaly first.
- **F6 → bounds correction for the fullscreen band export only**
  (class 4): preserve slide coordinates; no frame-order work.

Rejected explicitly:

- any speculative combination of the above;
- splitting/reworking the promise chains "for safety" (already isolated);
- removing the silent `.catch` in favor of user-facing errors (out of
  scope; escalate separately if desired);
- frame ordering, AI-image, uploaded-image cleanup, slide-overlap
  fallback, mid-band planner gap repair, ANY thumbnail-path change;
- retry loops, arbitrary timeouts, or `setTimeout`-based sequencing.

---

## 6. Scope — allowed files

**Stage 0 (now):** exactly one file:

- `e2e/characterization/drawing-presentation.spec.ts`
  — authorized pre-edit hash `3ddcc987d894703144ede9c19b2aae0cdf6fe53b`

**Stage 1 (locked until amendment):** exactly two files:

- `components/presentation/runtime-slide/RuntimeSlideRenderer.tsx`
  — authorized pre-edit hash `a407cccc230ca74a36a443b5f701767856754230`
  (IMMUTABLE during Stage 0; any Stage-0 drift is a stop condition)
- `e2e/characterization/drawing-presentation.spec.ts` (hash re-bound by
  the amendment to the committed Stage-0 state)

No helper or unit-test file is authorized: the census found none
necessary (the probe lives in the spec; the fix is a component-local
lifecycle/input change testable through the existing e2e regression). If
implementation proves one necessary → STOP and report.

Prohibited outright (fenced, §8): `planSlideComposition.ts` (unless a
future census proves planner output wrong — separate authorization),
every Excalidraw fork file, the thumbnail/preview path
(`createSlideRenderer.tsx`, `useSlideThumbnails.ts`,
`SlideThumbnail.tsx`, `PresentationPreviewModal.tsx`),
`presentationBridge.ts` + tests, `drawingBridgeHarness.ts`,
`drawing-line-bridge.spec.ts`, `DrawingLayout.tsx`,
`SimpleLineRenderer.tsx`, `CanvasClient.tsx`, `LineContextMenu.tsx`,
`e2e/helpers/env.ts`, schema/config/dependencies, new
endpoints/flags/hooks, all line-related files.

---

## 7. Required fixed behavior and regression (Stage 1)

After Stage 1, on the seeded landscape fixture:

**Fullscreen:** below-band PNG present as before; **above-band PNG
present, loaded, valid non-zero dimensions**; native text and shape
visible — meaningful pixel analysis non-zero, seeded text/shape regions
non-blank, seeded colors detectable where deterministic; no duplicate
raster; no blank overlay; no stale previous-slide raster.

**Thumbnail:** unchanged, still shows native content (N5 invariants).
**Planner:** unchanged. **Persisted scene:** unchanged. **Ordering:**
unchanged, even if currently divergent.

Regression requirements (evolve the PATCH-069 characterization; the
N2-era assertions that characterize the DEFECT — absent above img,
all-zero `nativeRasterCounts`, `primaryRow === 'N2'` — must FLIP to
their fixed-state counterparts; thumbnail N5 assertions stay):

- persisted scene still matches seed;
- plan still returns `nativeAboveIds = [text-landscape, shape-landscape]`;
- fullscreen now has BOTH required band PNGs; above-band PNG loaded with
  valid dimensions; above-band pixel analysis shows meaningful content;
  seeded text and shape regions non-blank; seeded colors detected where
  deterministic;
- thumbnail remains visible and unchanged;
- no duplicate PNGs;
- no new frame-order assertions beyond existing coverage; no AI-image or
  uploaded-image changes;
- structured history preserved: `patch-069-*` annotations may be kept or
  superseded, and `patch-069-classification` evolves into
  **`patch-070-native-raster-fix`** recording: original diagnosis N2,
  proven root cause (decision row + evidence), fixed production path,
  fullscreen band count, above-band PNG dimensions, pixel analysis,
  thumbnail invariant, planner invariant, persisted-scene invariant.

Stage-0 probe scaffolding that would contradict the fixed state is
removed or evolved in Stage 1; probe evidence needed by the regression
may remain.

---

## 8. Baselines and fences

**Authorized-change baselines (bind, verify before editing):**

| File | Pre-edit hash | Editable in |
|---|---|---|
| `e2e/characterization/drawing-presentation.spec.ts` | `3ddcc987d894703144ede9c19b2aae0cdf6fe53b` | Stage 0 (+ Stage 1 after amendment) |
| `components/presentation/runtime-slide/RuntimeSlideRenderer.tsx` | `a407cccc230ca74a36a443b5f701767856754230` | Stage 1 ONLY (immutable during Stage 0) |

**Immutable fences — 43 unique paths** (freshly hashed and verified at
base `05e913e`; 39 carried from PATCH-069 — its 40 minus
`RuntimeSlideRenderer.tsx`, now authorized-change — plus 4 fork files
newly read in this census):

```
lib/infra/drawing/bridge.ts ed26c312610a386711f658662e82d29dd48c5890
lib/infra/drawing/bridge.test.ts b6f3e674328e06304e08d6f079a553df4d36464e
components/presentation/slide-renderer/resolveSlidePadlets.ts 5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 9524e6397e623fef905f213e80953b2a22e2423d
components/presentation/slide-renderer/getSlideRenderSignature.ts da903ed4c9b7cd9b9ff86657fa2c44fa27e4665d
components/presentation/slide-renderer/createSlideRenderer.tsx ce236e91196ef36c5491a053072acc3e981ed80d
components/presentation/slide-renderer/mergeSlideLayers.ts 91ab266825b8b47b1035c09c6072e6cb23d69620
components/presentation/slide-renderer/renderExcalidrawSlideBase.ts 8e088e9f2da6bbe6f6e565104a4a8cf90c5eb1f7
components/presentation/slide-renderer/PresentationContainerCard.tsx 3876eeba810484fcf01437d477fe682dec2aa32b
components/presentation/slide-renderer/PresentationPadletCard.tsx bbcef06c8b8de29e455ec4748e7ea2762f0c1052
components/presentation/PresentationPanel.tsx 926f43cec98fadc610976081b58cb246ba00d501
components/presentation/useSlideThumbnails.ts 19801ae2c2b0ddc8841e358ad0fbc7cde96708f3
components/presentation/FullscreenPresentation.tsx caea11414929b0291e8d5d54513d50f55daf73b3
components/presentation/runtime-slide/RuntimePadletLayer.tsx 7baee436b9a63313cbb157444ff846b2bd1c26aa
components/presentation/runtime-slide/expandRuntimeContainerItems.ts 14e7573c53e2ab85c36d74d2e1afe22cf64c8da1
components/presentation/runtime-slide/resolveRuntimeContainerChildren.ts 71a878350b66b464bd693960e778b6a4fa73a4a0
components/presentation/PresentationPreviewModal.tsx 5116031b27f73bb7616f4024b197824c6718aa17
components/presentation/SlideThumbnail.tsx b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/collabboard/SimpleLineRenderer.tsx a38572a499d6aadf3002fa34f7a8e0e321220ea6
components/collabboard/canvas/ui/FreeformPadletCards.tsx 1c12d24a42c45a279efb4da0de785b478e4ca385
components/collabboard/canvas/ui/OverlayLayer.tsx 8940a6b1baa1e825139a026c3bb8f37e04ee7afb
components/collabboard/canvas/hooks/useCanvasLines.ts 8a7459966d5ed2e74f873e0ff9fd0e8e7557fb3c
components/collabboard/canvas/hooks/useCanvasData.ts 2e158f1278a395b5028083e8f387a22e4daf5b60
lib/infra/canvas/linesRepository.ts 1bb11907dfe58ed5ab116f94936304e9ca2ea1be
lib/domain/canvas/lines.ts 96594d2d8b7dc4fee04a641e5ae9f5ff4d488fe5
types/collabboard.ts ea46b79cf0e4392f7141017943c74733e1e87be2
components/collabboard/canvas/excalidraw_fork/packages/element/src/binding.ts 8a977611d22d9c6cb7f50f1c7c245c31d9764cea
components/collabboard/canvas/excalidraw_fork/packages/element/src/arrows/focus.ts fa8018adbe2ea3279836371c4466e8e64d091a3c
components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/App.tsx cd34ff6ddb838e1bc3f21a7d01bf82106556d362
lib/infra/drawing/lineBridge.ts f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/lineBridge.test.ts 559087550bf4a0304501ad479555ab4f4ad636a4
lib/infra/drawing/presentationBridge.ts b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/presentationBridge.test.ts dff458de747d673868b1eae2b695e41b4c3424d2
e2e/helpers/env.ts 9514723cde157f7ae6e6815d4c142a0f430a1292
e2e/characterization/drawingBridgeHarness.ts 85a6566dbb8cd16f19151133ed33b9872a97ff11
app/dashboard/canvas/[id]/CanvasClient.tsx 1c6864b46e1c5c9a52f9e771ee2e51793898ecd8
components/collabboard/menus/LineContextMenu.tsx aaf16af230a76139377c4250f93485824000593e
components/collabboard/canvas/layouts/DrawingLayout.tsx 93e5900f8df6468a466f8bfd0318f813393336a1
e2e/characterization/drawing-line-bridge.spec.ts 3e690d20614dee1c0b6c60a791f4031e9aa53833
components/collabboard/canvas/excalidraw_fork/packages/excalidraw/fonts/Fonts.ts 195fb51f47d3c36bdd00e6f391e96edbf0f9b850
components/collabboard/canvas/excalidraw_fork/packages/excalidraw/scene/export.ts 7cf111f6ce57920a40252786d782c81d572a0105
components/collabboard/canvas/excalidraw_fork/packages/utils/src/export.ts e29e396300cdf360e040fa52db62e9536f238ee7
components/collabboard/canvas/excalidraw_fork/packages/element/src/frame.ts 3c8209954616f57f45e7060e4d54a7affbfcc68b
```

Verify every fence before editing and again before each commit.

**Bound pre-flight baselines (all reconfirmed green at `05e913e` during
the PATCH-069 acceptance review):** focused Vitest 51 passed / 2
skipped; full Vitest 424 passed / 41 skipped; Playwright setup 1 passed;
line spec 4 passed; presentation spec 2 passed / 2 approved skips;
credential-off line 4 skipped; credential-off presentation 4 skipped;
cleanup zeros (`boards=0, padlets=0, canvasLines=0`, independent
service-role query); zero production imports of
`lineBridge`/`presentationBridge`/`drawingBridgeHarness` outside `e2e/`.

---

## 9. Diagnostic environment contract (binding, unchanged)

- Self-start `npm run dev`; confirm the `next dev` + `Ready` banner.
- Run all diagnostic Playwright with explicit `PW_BASE_URL` (no
  Playwright-managed `next start` webServer for diagnostics; its
  failures are environment errors, not evidence).
- Port discipline: inspect the target port first; attribute listeners
  (`Get-NetTCPConnection`/`Get-CimInstance`); never kill an unrelated
  process; stop only the server you started; verify the port is free
  afterward.
- `e2e/.auth/user.json` regenerates ONLY via
  `npx playwright test --project=setup`; never hand-edit; never log or
  print credential/cookie contents anywhere (reports, annotations,
  probe logs included).
- `verify`/`build` run sequentially, never concurrently, never under a
  running dev server.
- Never commit generated artifacts (`.next`, test-results,
  playwright-report, auth state, screenshots/videos/traces/logs).

---

## 10. Stop conditions

STOP immediately, report, do not commit, if:

- base commit or any authorized pre-edit hash differs;
- any of the 43 immutable fences differs at any point;
- `RuntimeSlideRenderer.tsx` differs from `a407cccc…` at any point
  during Stage 0;
- PATCH-069's N2 behavior cannot be reproduced BEFORE adding the probe;
- the probe result maps onto zero rows or more than one row of §3;
- Stage 1 is attempted without a named amendment binding the row;
- the root cause remains ambiguous after Stage 0;
- any additional production file appears necessary;
- a fork change appears necessary;
- a planner (`planSlideComposition.ts`) change appears necessary;
- thumbnail behavior must change;
- a font/network dependency cannot be made deterministic;
- the fix would affect frame ordering, or AI-image/uploaded-image scope
  appears;
- cleanup becomes nondeterministic, or a real user board would be
  touched;
- a second defect would ride along.

---

## 11. Verification gates (each stage, all bound)

1. Fence + authorized-hash verification (§8) before editing and before
   committing.
2. `npx playwright test --project=setup` (1 passed) under the §9
   contract, then the line spec (4 passed — untouched-file regression)
   and the presentation spec (2 passed / 2 approved skips) with
   credentials; credential-off proofs (4 skipped / 4 skipped).
3. Focused Vitest (51/2), full Vitest (424/41), `tsc --noEmit`,
   `npm run check:boundaries`, `npm run verify` (sequential) — all green.
4. Independent cleanup verification via service-role query
   (`patch-064-harness-%` prefixes): boards=0, padlets=0, canvasLines=0.
5. Zero production imports of the test-only bridge modules outside `e2e/`.
6. `git status` clean except the allowed file(s); repository level with
   `origin/main` after push.
7. Stage 0 additionally: the `patch-070-stage0-probe` annotation present
   with raw observables + exactly one proven row; all PATCH-069
   assertions still green. Stage 1 additionally: the flipped fixed-state
   assertions of §7 green and the `patch-070-native-raster-fix`
   annotation complete.

---

## 12. Review and commit flow (bind)

- GPT-5.5 implements each stage WITHOUT committing.
- Sonnet independently reviews the uncommitted diff (read-only; reruns
  all gates; re-derives all hashes; extracts annotations from a JSON
  reporter run rather than trusting prose).
- Explicit Sonnet PASS required per stage; only then GPT-5.5 commits
  with the stage's bound message and pushes.
- Fable (CTO) closes each stage in `CURRENT_TASK.md`; the Stage-1
  amendment is CTO-only and precedes any production edit.

---

## 13. Rollback

Each stage is one commit touching at most the allowed files; revert the
stage commit to roll back. Stage 0 carries zero production risk (test
file only). Stage 1's revert restores `a407cccc…` behavior (silent
above-band absence) without data impact — no schema, no persisted-scene
writes anywhere in this patch.

---

## 14. Required final report (per stage)

- exact files changed with pre/post hashes;
- Stage 0: raw O1–O5 observables, the proven decision row, and the
  verbatim `patch-070-stage0-probe` annotation content;
- Stage 1: the bound row + amendment reference, the exact production
  diff summary, above-band PNG dimensions and pixel analysis,
  thumbnail/planner/persisted-scene invariants;
- all gate totals (setup/line/presentation/credential-off, focused/full
  Vitest, tsc/boundaries/verify), cleanup proof, 43-fence results,
  production-import grep;
- commit hash and push status, only after Sonnet PASS.
