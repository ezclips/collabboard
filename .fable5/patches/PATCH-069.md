# PATCH-069 - Diagnose Blank Native Raster in Presentation Slides

Status: APPROVED — diagnosis/characterization patch, TEST-ONLY.
No production change is authorized by this patch; if the diagnosis
proves a single smallest production cause, the FIX is a separate future
patch (PATCH-070) authorized by Fable on this patch's evidence, with a
fresh production census.
Approved by the Fable CTO 2026-07-15.
Role: implementation engineer after Fable approval; may NOT commit or
push. Independent Sonnet review of the uncommitted diff is required
with an explicit PASS before any commit. Fable closes the patch
afterward.
Base commit: `e2f0bbd2affdfe9215fa8ab2faa0780b8b0c1a6c`
(`fix(drawing): route selected line handles to context menu
(PATCH-068)`). Re-derive at pre-flight; if HEAD differs, STOP.

**Bound commit message (use verbatim):**

```
test(drawing): characterize blank native slide raster (PATCH-069)
```

## 1. Purpose — exactly one subsystem

The presentation fullscreen path renders native Excalidraw content
(text, shapes drawn on the Drawing canvas) into PNG band layers. For
the PATCH-064 seeded scene — genuinely visible content (text
`#111827`, rectangle stroke `#2563eb` / fill `#dbeafe`) placed INSIDE
the landscape frame — the frozen characterization proves the rendered
result is BLANK: `nativeRasterCounts` = `{text: 0, shape: 0, total: 0,
bounds: null}` across every `img[src^="data:image/png"]`, asserted as
the "current native PNG rendering defect"
(`drawing-presentation.spec.ts:118-124`). PATCH-069 produces a
deterministic diagnosis of WHERE the native content is lost, plus
honest characterization of each pipeline stage. Nothing is repaired.

## 2. Census (fresh, 2026-07-15, at base `e2f0bbd`)

### 2.1 The native raster pipeline (all files read-only, fenced)

1. **Scene source.** The harness seeds the scene via
   `seedPresentationScene` (`drawingBridgeHarness.ts:472-480`), raw
   scene order: portrait frame (idx 0), landscape frame (idx 1),
   `emb-slide-a` (idx 2, landscape), `emb-uploaded-image` (idx 3,
   landscape), `text-landscape` (idx 4, native text, x=80 y=80),
   `shape-landscape` (idx 5, native rectangle, x=80 y=150), and
   `emb-slide-b` (idx 6, portrait). The native elements carry
   `frameId: landscape` and visible colors (`:145-156` text
   `#111827`; `:185-199` rectangle `#2563eb`/`#dbeafe`) — NOT a
   white-on-white seed artifact.
2. **Composition plan.** `planSlideComposition`
   (`planSlideComposition.ts:17-55`): filters native frame members
   (`isNativeFrameMember` `:8-15` — non-deleted, not the frame, not a
   `padlet://` embeddable, `frameId === slideFrame.id`), then, when
   `resolvedPadlets` is non-empty, splits them into
   `nativeBelowElements` (scene index < first padlet zIndex, `:39-42`)
   and `nativeAboveElements` (scene index > last padlet zIndex,
   `:44-47`). **Census note (latent, bind in evidence): elements whose
   scene index falls BETWEEN the first and last padlet indexes are
   dropped from BOTH bands.** For the seeded landscape slide the
   padlet indexes are {2, 3} and the native elements sit at {4, 5} —
   the plan SHOULD place both in `nativeAboveElements`; the mid-band
   gap should NOT bite for this fixture. That prediction must be
   proven, not assumed.
3. **Export.** `renderExcalidrawSlideBase`
   (`renderExcalidrawSlideBase.ts:14-46`): dynamic-imports
   `exportToCanvas` from `@excalidraw/excalidraw` — which resolves to
   the vendored FORK build (`package.json:24`,
   `file:components/collabboard/canvas/excalidraw_fork/packages/excalidraw`)
   — and calls it with `exportingFrame: frameElement`, band elements,
   `files ?? null`, and `getDimensions` applying `opts.scale`.
4. **Fullscreen runtime consumer.** `RuntimeSlideRenderer.tsx:99-149`:
   renders the below band (white background, `:114-127`) and, ONLY if
   `nativeAboveElements.length > 0`, the above band (transparent
   background, `:130-145`); each `.then` writes
   `canvas.toDataURL("image/png")` into `belowPng`/`abovePng` state;
   **both promise chains swallow failures SILENTLY**
   (`.catch(() => { /* silent */ })`, `:127` and `:144`) — an export
   throw produces no console output, no error UI, and no PNG.
5. **Thumbnail/legacy consumers.** `createSlideRenderer.tsx:170/218/227`
   also call `renderExcalidrawSlideBase` (sidebar previews); the
   frozen zero-count assertion aggregates over ALL
   `img[src^="data:image/png"]` and takes the largest by nonwhite
   total (`drawing-presentation.spec.ts:15-68`), so it proves no PNG
   from ANY consumer contains the native content.

### 2.2 Why the blank is currently unexplained

A pure-white PNG of frame size is exactly what the BELOW band renders
when its element list is empty and `includeBackground` is true. The
seeded native elements should be in the ABOVE band, whose PNG (a)
might never be produced (silent export failure), (b) might be produced
empty (crop/dimension defect against `exportingFrame`), or (c) might
never be requested because the plan unexpectedly drops the elements
(mid-band gap or `isNativeFrameMember` mismatch against the REAL
persisted scene, e.g. a `frameId` normalization difference between
seed and load). The pipeline has no observable diagnostics at any of
these stages (silent catches; no dev logging in the presentation
path), so ONLY structured test-side evidence can discriminate.

### 2.3 Deterministic discriminators available test-only

- `planSlideComposition` and `resolveSlidePadlets` are PURE functions.
  The Playwright spec runs in Node and MAY import them directly (a
  read-only import of fenced production modules for evaluation — this
  is explicitly authorized and is NOT a production change) and execute
  them against the ACTUAL persisted scene fetched from the database
  via the existing harness client. This proves band placement
  deterministically.
- The browser side can enumerate EVERY `data:image/png` image (parent
  component context, natural dimensions, per-image nonwhite counts)
  to prove which bands/surfaces produced PNGs and which are absent.
- The DB scene row can be re-read to verify the persisted element
  properties (ids, types, frameId, coordinates, colors, isDeleted)
  match the seed — eliminating a load/persist mutation.

## 3. Classification table — exactly one row must be proven

With per-stage evidence (DB row + pure-function output + browser PNG
census):

- **N1 — plan drops the native elements.** The pure run of
  `planSlideComposition` on the persisted scene returns
  `nativeBelowElements` and `nativeAboveElements` that together do NOT
  contain `text-landscape`/`shape-landscape` for the landscape slide
  (mid-band gap `:39-47`, membership filter `:8-15`, or zIndex source
  divergence in `resolveSlidePadlets`). Record which filter step
  excludes them.
- **N2 — plan places them, but the band PNG is never produced.** Pure
  run shows the elements in a band; the browser PNG census shows NO
  image for that band (silent export failure at
  `RuntimeSlideRenderer.tsx:127/:144`, or the `.then` guard
  discarding). Evidence: enumerate all PNGs with sizes/contexts;
  the band's PNG absent while the other band's PNG exists.
- **N3 — band PNG produced but empty.** Pure run shows the elements in
  a band AND a PNG exists that corresponds to that band, with correct
  frame-scaled dimensions, yet zero nonwhite pixels in the region the
  elements occupy (export/crop defect: `exportingFrame` clipping,
  `getDimensions` scaling, or fork export ignoring the band
  elements). Record the PNG dimensions vs expected frame size.
- **N4 — persisted scene diverges from the seed.** The DB scene row
  lacks the native elements or stores them mutated (different
  `frameId`, `isDeleted: true`, moved coordinates, invisible colors).
  Census predicts this row does NOT apply (harness writes them
  verbatim) — must still be checked first, as the cheapest gate.
- **N5 — another narrowly evidenced cause.** Report precisely; if it
  cannot be reduced to direct evidence, STOP.

The diagnosis MUST record the proven row per surface (fullscreen
runtime AND sidebar thumbnails) — they use different consumers and may
fail at different stages.

## 4. Required characterization coverage (single allowed file)

Extend `drawing-presentation.spec.ts` (or add a sibling test in the
SAME file) to:

1. Re-read the persisted scene from the DB and assert the seeded
   native elements' identity properties (id, type, frameId,
   coordinates, colors, not deleted) — the N4 gate.
2. Execute the REAL `planSlideComposition` (and, as needed,
   `resolveSlidePadlets`) in-process on that persisted scene for the
   landscape slide; record the full band placement (which elements in
   below/above, padlet zIndex range) as an annotation; assert the
   deterministic outcome observed (freeze whatever the real function
   returns — if it drops the elements, that IS the frozen evidence for
   N1; do not "fix" the expectation to what should happen).
3. In the browser (fullscreen presentation on the seeded board),
   enumerate every `img[src^="data:image/png"]`: dimensions, nonwhite
   totals, bounding boxes, and surface context (fullscreen band vs
   thumbnail). Record which band PNGs exist.
4. Keep the existing frozen zero-count assertion INTACT AND HONEST: if
   the diagnosis run still observes blank output, the existing
   assertion stays as-is; if any surface unexpectedly renders content,
   freeze the NEW truth and say so explicitly (that would itself be
   R-class evidence of nondeterminism — report it).
5. Classify the result as exactly one of N1–N5 in a structured
   annotation (suggested type: `patch-069-native-raster-diagnosis`)
   recording: DB-scene check result, band placement result, PNG census
   result, proven row, and per-surface disposition.
6. No fabricated DOM, no z-index/pointer-events tampering, no direct
   state setting, no production-callback invocation (the pure-function
   import for evaluation is the single authorized exception), no
   production instrumentation, no changes to any production file.
7. All existing presentation coverage (frame discovery, sidebar
   titles/ordering assertions, slide navigation, uploaded-image
   rendering, reopen round-trip, the two approved skips) and the
   line-spec suite remain passing and unweakened.

## 5. Allowed files

- `e2e/characterization/drawing-presentation.spec.ts` — ONLY file.
  Authorized-change baseline:
  `c6bfb4f01b0b4e5bd7654ee1405b6070141fbc09`.

No other file may change. `drawingBridgeHarness.ts` remains fenced —
if the diagnosis appears to require new seed capabilities, STOP and
request an amendment. `drawing-line-bridge.spec.ts` is now IMMUTABLE
at its PATCH-068 hash.

## 6. Explicit exclusions

No production source changes of any kind (including the silent-catch
sites — adding logging there is a candidate FIX-adjacent change,
prohibited here); no fork changes; no harness changes; no new files;
no schema/config/dependency changes; no line-subsystem changes; no
frame-ordering or AI-image work (separate defects, separate patches);
no thumbnail redesign; no attempt to repair the raster while
characterizing it.

## 7. Baselines and fences

**Immutable fences — 40 unique paths** (freshly counted and verified
40/40 at `e2f0bbd`; re-verify at pre-flight and after gates): the
PATCH-068 §8 39-path set MINUS
`e2e/characterization/drawing-presentation.spec.ts` (moves to
authorized-change above) PLUS the two PATCH-068 landed files, now
frozen:

```text
components/collabboard/canvas/layouts/DrawingLayout.tsx 93e5900f8df6468a466f8bfd0318f813393336a1
e2e/characterization/drawing-line-bridge.spec.ts 3e690d20614dee1c0b6c60a791f4031e9aa53833
```

(the remaining 38 entries are verbatim from PATCH-068 §8 — re-derive
the full list from there at pre-flight; every hash was re-verified
matching at this base on 2026-07-15).

**Bound pre-flight baselines (all freshly reconfirmed at `e2f0bbd`,
2026-07-15, dev-server contract):** setup 1 passed; credentialed line
4 passed; credentialed presentation 2 passed / 2 approved skips;
credential-off line 4 skipped / presentation 4 skipped; focused Vitest
51/2; full Vitest 424/41; cleanup boards=0 / padlets=0 / canvasLines=0
(independent service-role query); zero production imports of
lineBridge / presentationBridge / drawingBridgeHarness.

## 8. Diagnostic environment contract (binding, unchanged)

Self-started `npm run dev`, explicit `PW_BASE_URL`, `next dev` +
`Ready` banner confirmed, LESSONS_LEARNED port discipline (inspect the
port, attribute listeners, never kill unrelated processes, stop only
your own server). The production `:3100` webServer remains unsupported
for diagnostic assertions. No credential/cookie contents in logs;
`.next` never staged. PATCH-066 Amendment 1's auth-regeneration
procedure remains in force.

## 9. Stop conditions

- HEAD ≠ `e2f0bbd` at pre-flight, or the presentation spec does not
  hash to `c6bfb4f0…` before editing;
- any of the 40 immutable fences differs at any point;
- baseline totals differ materially;
- the evidence cannot be reduced to one of N1–N5 per surface;
- the diagnosis would require ANY production change, new seed/harness
  capability, instrumentation, endpoint, flag, or hook;
- a second file appears necessary;
- the pure-function import cannot be made to run in the Playwright
  Node context without modifying production or config files;
- the line-spec suite or existing presentation assertions would need
  weakening;
- cleanup becomes nondeterministic, or a real user board would be
  touched;
- the blank-raster behavior turns out to be nondeterministic across
  two consecutive dev-contract runs (report as flake evidence — do
  not absorb with adaptive branching).

## 10. Verification gates

```bash
git status --short --branch
git rev-parse HEAD
git diff --check
npx vitest run lib/infra/drawing/lineBridge.test.ts lib/infra/drawing/presentationBridge.test.ts   # 51/2 unchanged
npx tsc --noEmit
npm run check:boundaries
npx vitest run                                                                                      # 424/41 unchanged (test-only patch)
npm run verify
npm run build
```

Diagnostic Playwright (dev-server contract): setup; credentialed
presentation spec (green including the new diagnosis coverage);
credentialed line spec (regression, untouched file, 4 passed);
credential-off proofs for both; cleanup zeros per spec and via an
independent query; 40-fence verification before/after;
production-import greps (zero); generated-artifact check.

Independent Sonnet review of the uncommitted diff; commit prohibited
until explicit PASS.

## 11. Rollback

Single test file; `git revert` of the implementation commit restores
the PATCH-068 tree (`e2f0bbd`) exactly.

## 12. Required final report

- the N4 gate result (persisted scene vs seed, property by property);
- the pure `planSlideComposition` band placement for the landscape
  slide (full element-to-band mapping, padlet zIndex range);
- the browser PNG census (every data-PNG: surface, dimensions,
  nonwhite totals, bounds);
- the proven N1–N5 row per surface (fullscreen and thumbnails), with
  the exact file:line of the implicated stage;
- the recommended smallest production fix for PATCH-070 (not
  implemented here);
- Playwright totals (credentialed + credential-off, both specs), unit
  totals, cleanup proof, 40-fence results, grep results;
- commit hash and push status, only after Sonnet PASS.
