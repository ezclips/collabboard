# PATCH-072 - Align Fullscreen Slide Order with the Canonical Panel Order

**Status:** AUTHORIZED — fix (single stage). The defect is deterministic,
fully characterized, and the owner is exact; no diagnosis stage is needed.

**Base commit (bind, verify before editing):**
`3b863d55ee6ae6ce9af0c7747c1bda1a82500e71`
(`fix(drawing): sanitize membership metadata on canvas clone (PATCH-071)`)

**Bound implementation commit message (verbatim):**
`fix(presentation): align fullscreen slide order with panel order (PATCH-072)`

**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent, read-only,
uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

---

## 1. Defect statement (fresh census at `3b863d5`)

**The fullscreen presentation walks the slides in RAW SCENE ORDER while
every other presentation surface uses the sorted panel order.**

- Canonical order rule (production): `PresentationPanel.tsx:71-81` sorts
  slides by `order ?? +Infinity` → `y` → `x`. The panel's slide LIST, the
  **PDF export**, and the **PPTX export** (`:156-158`, `:179`) all
  consume this `sortedSlides` array. On the drawing canvas `FrameSlide.order`
  is always `null` (DrawingLayout `frames` derivation binds `order: null`),
  so the effective canonical order today is spatial `y → x`.
- The divergent surface: `FullscreenPresentation.tsx` consumes its
  `slides` prop AS GIVEN — start index by `findIndex` (`:78-82`),
  `currentSlide = slides[currentIdx]` (`:114`), Next/Prev = index ±1
  (`:215`, `:363-364`) — with NO sort. Its sole mount site passes RAW
  scene order: `DrawingLayout.tsx:3047-3056` (`slides={frames}`).
- Deterministic reproduction (frozen in the net): the PATCH-065 fixture
  seeds portrait FIRST in the scene; the e2e spec asserts sidebar
  `[Landscape, Portrait]` yet fullscreen Slide 1 = portrait
  (`drawing-presentation.spec.ts:918-920` explicitly freezes
  `slideTitles ≠ seededFrameTitles`; `:938-942` freezes portrait-first
  fullscreen; `:952-953` reaches landscape only via Next).
- User-visible impact: the slide numbers and sequence the user sees and
  arranges in the panel are NOT the sequence fullscreen plays; exports
  and the panel agree with each other and disagree with fullscreen.

**Product ruling (CTO, recorded here):** the canonical presentation
order IS the panel order (`order ?? ∞ → y → x`). Evidence: three of four
surfaces already use it (panel list, PDF export, PPTX export); fullscreen
is the sole raw-order surface; the user-facing "Slide N / M" numbering
must mean the same slide everywhere.

Bridge-contract note: `presentationBridge`'s pure
`characterizeSlideOrdering` (panel rule) and `characterizeFrameSlides`
(raw discovery order) both remain correct descriptions of the two
computations and stay byte-untouched; only WHICH computation fullscreen
consumes changes.

## 2. Accepted design — sort at the fullscreen boundary via one pure helper

1. **NEW pure helper** `lib/infra/presentation/slideOrder.ts`
   (new directory; P7-neutral naming): export
   `sortSlidesByPresentationOrder<T extends { order?: number | null; y: number; x: number }>(slides: readonly T[]): T[]`
   — returns a NEW array sorted by exactly the panel comparator:
   `order ?? Number.POSITIVE_INFINITY` ascending, then `y` ascending,
   then `x` ascending; ties preserve input relative order (stable sort);
   input never mutated. Structural generic type — NO import from
   components (no cross-layer import needed).
2. **NEW unit tests** `lib/infra/presentation/slideOrder.test.ts` —
   exactly N = 7 `it` blocks (§5).
3. **`components/presentation/FullscreenPresentation.tsx`** (pre-edit
   `caea11414929b0291e8d5d54513d50f55daf73b3`): import the helper; derive
   `const orderedSlides = useMemo(() => sortSlidesByPresentationOrder(slides), [slides]);`
   and use `orderedSlides` everywhere the component currently reads
   `slides` (start-index lookup, currentSlide, prefetch, cache
   invalidation, Next/Prev bounds, "Slide N / M" label). No other
   behavior change: props, runtime path, PNG cache logic, overlay math,
   keyboard handling, close behavior all byte-preserved.
4. **`e2e/characterization/drawing-presentation.spec.ts`** (pre-edit
   `19d6e86495dc06f677d6efd88a59e6e07566f02c`): flip the fullscreen
   sequence to the canonical order (§6) while keeping every
   PATCH-069/070/071-era invariant green.

**PresentationPanel duality ruling (P6):** the panel's inline comparator
(`:71-81`) stays byte-untouched — swapping it is bundled cleanup, out of
scope. The temporary duality (inline comparator + helper) is authorized
ONLY under the §5 parity-lock test (PATCH-062's duality-with-parity
precedent) and its consolidation is queued as a follow-up.

**Rejected alternatives:** sorting in `DrawingLayout.tsx` (fenced
hotspot, never-grow rule); replacing the panel's inline comparator in
this patch (bundled refactor); mutating persisted scene/frame order
(data change for a presentation-layer defect); changing
`characterizeFrameSlides` or any bridge/test-only module; introducing a
user-facing slide-reorder feature (`order` field authoring — future
product work); touching planner/resolver/thumbnail files.

## 3. Scope — allowed files (exactly four)

| File | Pre-edit state (bind, at `3b863d5`) | Authorized change |
|---|---|---|
| `lib/infra/presentation/slideOrder.ts` | ABSENT (dir `lib/infra/presentation/` also absent — verified) | NEW pure helper, §2.1 exactly |
| `lib/infra/presentation/slideOrder.test.ts` | ABSENT (verified) | NEW, exactly the §5 matrix |
| `components/presentation/FullscreenPresentation.tsx` | `caea11414929b0291e8d5d54513d50f55daf73b3` | §2.3 exactly: one import + one memoized sort + `slides` → `orderedSlides` reads |
| `e2e/characterization/drawing-presentation.spec.ts` | `19d6e86495dc06f677d6efd88a59e6e07566f02c` | §6 flip |

No fifth file. Prohibited outright: `DrawingLayout.tsx`,
`PresentationPanel.tsx`, `planSlideComposition.ts`,
`resolveSlidePadlets.ts`, `RuntimeSlideRenderer.tsx`, all thumbnail
files, all bridge/harness/test-only modules, all PATCH-071 files, fork,
schema, config, dependencies, `.fable5/**` during implementation.

## 4. Immutable fences — 50 unique paths

The PATCH-071 48-path set carried, MINUS the two files above moving to
authorized-change (`FullscreenPresentation.tsx`,
`drawing-presentation.spec.ts`), PLUS the four PATCH-071 files frozen at
their committed hashes:

```
lib/infra/collabboard/clonedPostMetadata.ts 7d6b6ee6e127a0db8161c09afdf31a54f44ac575
lib/infra/collabboard/clonedPostMetadata.test.ts 5b53e839d66e399c1357a7656109496c65a2e5d1
components/collabboard/canvas/hooks/useCanvasActions.ts b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
e2e/characterization/drawing-duplication.spec.ts 28023cf08388d9c732a592c82da8506a9e77c03d
```

All 50 verified 50/50 at base `3b863d5` during authoring (no duplicate
paths). `PresentationPanel.tsx` (`926f43ce…`) remains IMMUTABLE. Verify
before editing and before the commit.

## 5. Bound unit-test matrix (exact N = 7)

`slideOrder.test.ts` contains EXACTLY these seven `it` blocks:

1. sorts by explicit `order` first (numbered slides ahead of spatial);
2. `null`/`undefined` order sorts AFTER all numbered slides;
3. `y` breaks order ties (smaller y first);
4. `x` breaks order+y ties (smaller x first);
5. fully tied slides keep their input relative order (stability);
6. returns a new array and never mutates the input (identity + deep
   equality of the source);
7. **parity lock:** on a mixed matrix (numbered, null-order, y-tied,
   x-tied entries) the helper's output order equals the
   PresentationPanel comparator semantics
   (`order ?? +Infinity → y → x`) — the §2 duality authorization.

**Updated bound totals:** helper gate
`npx vitest run lib/infra/presentation/slideOrder.test.ts` = 7 passed /
1 file; sanitizer gate unchanged 9/1; focused drawing gate unchanged
59/2; full Vitest becomes **448 passed / 43 files** (441+7, 42+1).

## 6. E2E flip — canonical fullscreen sequence

Fixture unchanged (portrait seeded first; sidebar `[Landscape,
Portrait]`). Bound expectations after the fix:

- Sidebar assertions UNCHANGED (`Slides (2)`, title order
  `[Landscape, Portrait]`, and `slideTitles ≠ seededFrameTitles` — the
  sidebar-vs-seeded divergence is intended and stays);
- NEW invariant: the fullscreen visit sequence EQUALS the sidebar
  sequence — fullscreen open shows **Slide 1 / 2 = LANDSCAPE** (child A
  visible, child C visible, uploaded image visible, child B NOT
  visible); Next → **Slide 2 / 2 = PORTRAIT** (child B visible);
- the landscape observation window (Stage-0 probe reset, fullscreen PNG
  census, the PATCH-070 fixed-state above/below-band assertions and
  pixel analysis) re-anchors from the post-Next position to the
  fullscreen-OPEN position; recorded `slideIndex` for the landscape
  fullscreen entries becomes 1 (was 2); the probe reset moves to
  immediately BEFORE the Start-presentation click;
- per-slide start keeps working: the existing spec flow that relies on
  `startSlideId` (if exercised) must still land on the named slide;
- ALL carried invariants stay green: persisted scene matches seed,
  Node-side plan (`nativeBelowIds=[]`,
  `nativeAboveIds=[text-landscape, shape-landscape]`), thumbnail N5
  (landscape thumbnail slideIndex stays 1 — panel order unchanged),
  above-band raster fixed-state (one below + one above PNG, non-zero
  pixel analysis), extra runtime padlet legitimacy, uploaded-image and
  AI-image approved skips, credential-off skip proof, harness cleanup;
- annotations: existing `patch-070-native-raster-fix` fields update
  mechanically where they carry slide indexes; ADD
  `patch-072-presentation-order` recording: seeded scene order, sidebar
  order, fullscreen visit order, their equality post-fix, the canonical
  ruling (`panel order: order ?? ∞ → y → x`), and
  `previousBehavior: 'fullscreen-followed-raw-scene-order'`.

## 7. Baselines (bind; ALL verified fresh at `3b863d5` this session)

Sanitizer 9/1; focused drawing 59/2; full 441/42 (becomes 448/43);
setup 1; duplication 2-with-deps / 1-no-deps; line 4; presentation
2 passed / 2 approved skips (same counts post-fix, flipped content);
credential-off duplication 2 / line 4 / presentation 4 skipped; cleanup
zeros (harness-scoped AND patch-071-scoped queries); zero production
imports of `lineBridge`/`presentationBridge`/`drawingBridgeHarness`;
`tsc`, boundaries, sequential `verify`/`build` green.

## 8. Environment contract (binding, unchanged)

Self-started `npm run dev` + explicit `PW_BASE_URL` for diagnostic
Playwright; port discipline (inspect → attribute → stop only your own →
verify free); auth state only via `--project=setup`; no credential
contents anywhere; sequential `verify`/`build`, never under a dev
server; never commit generated artifacts.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §3 pre-edit hash, or any of the 50 fences differs;
- either new file already exists at base;
- the fix requires touching `DrawingLayout.tsx`,
  `PresentationPanel.tsx`, any bridge/planner/resolver/thumbnail file,
  or ANY fifth file;
- sidebar order, PDF/PPTX export order, or panel behavior changes;
- the parity-lock test cannot hold without changing the panel;
- per-slide `startSlideId` start breaks;
- any PATCH-069/070/071-era invariant cannot be kept green;
- the presentation spec's test COUNT changes (2 active + 2 approved
  skips must remain);
- cleanup becomes nondeterministic;
- a second defect surfaces (fix nothing else — report).

## 10. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews the
uncommitted diff (re-runs gates, re-derives hashes, extracts annotations
from a JSON reporter run); explicit PASS required; then commit with the
bound message and push; Fable closes in CURRENT_TASK.md.

## 11. Rollback

One commit; revert restores raw-order fullscreen behavior. No schema,
no persisted-scene writes, no data impact.

## 12. Required final report

Files + pre/post hashes; helper semantics proof (7/1); fullscreen
sequence evidence (Slide 1 = landscape, Slide 2 = portrait, sidebar
equality); re-anchored PATCH-070 fixed-state evidence at slideIndex 1;
`patch-072-presentation-order` annotation verbatim; all gate totals
(§7); cleanup proof; 50-fence result; production-import grep; commit
hash + push status after Sonnet PASS.
