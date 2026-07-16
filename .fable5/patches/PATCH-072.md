# PATCH-072 - Align Fullscreen Slide Order with the Canonical Panel Order

**Status:** AUTHORIZED — fix (single stage), **Amendment 1 applied**
(2026-07-16) after the first implementation attempt stopped correctly
under §9. Where Amendment 1 (§0.1) and the original sections conflict,
**Amendment 1 wins**. The defect is deterministic, fully characterized,
and now has TWO exact owner sites (§0.1.2); no diagnosis stage is
needed.

**Base commit (bind, verify before editing):** the Amendment-1
governance commit (successor of `a59526e74dd03d1873901e252a8d2786d0eddf60`,
which touched only `.fable5/**`). All §0.1.6 source hashes were
measured fresh at `a59526e` and are unchanged by governance-only
commits; the implementer MUST re-verify every pre-edit hash and the
§0.1.7 fence set (49/49) before editing.
(Original authoring base: `3b863d55ee6ae6ce9af0c7747c1bda1a82500e71`.)

**Bound implementation commit message (verbatim):**
`fix(presentation): align fullscreen slide order with panel order (PATCH-072)`

**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent, read-only,
uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

---

## 0.1 Amendment 1 (2026-07-16) — blocked attempt; start-target ownership; DrawingLayout authorized

### 0.1.1 Blocked implementation attempt (record)

The first implementation run STOPPED correctly under the bound §9 stop
conditions. No code was retained, no implementation commit exists, the
worktree was reverted clean and stayed level with `origin/main`
(`a59526e`). The failure was discovered by the LIVE Playwright gate,
not by review:

- With the authorized four-file change in place (helper + fullscreen
  sort + spec flip), `drawing-presentation.spec.ts` failed at the bound
  fullscreen-open assertion: the fullscreen portal was present but
  displayed PORTRAIT content with counter **Slide 2 / 2**; the bound
  fixed state requires LANDSCAPE, **Slide 1 / 2**.
- Root cause of the block: the bottom **Start presentation** button
  (`PresentationPanel.tsx:509`) calls `onStartPresentation?.()` with NO
  slide id. `DrawingLayout.tsx` `handleStartPresentation`
  (`:1503-1508`) resolves the absent id to `activeFrames[0].id` —
  **raw scene order** (portrait in the fixture) — and passes it as
  `startSlideId` (`:3050`). `FullscreenPresentation` must preserve
  named-`startSlideId` semantics, so it correctly resolves that
  portrait id to ordered index 1. A fullscreen-only sort can never
  satisfy the bound default-start behavior; the producer of the default
  id lives upstream in `DrawingLayout`, which §3 prohibited.
- Cleanup residue: one EMPTY untracked directory
  `lib/infra/presentation/` (git-invisible) survived the revert; the
  CTO removed it during this amendment. Both new files verified ABSENT;
  `git status --porcelain` = 0 entries.

### 0.1.2 Ownership re-census (all entry paths traced fresh at `a59526e`)

- **Bottom Start button** (`PresentationPanel.tsx:509`):
  `onStartPresentation?.()` — no id → DrawingLayout fallback
  `activeFrames[0].id` (`:1506`) → RAW scene order. **Defective.**
- **Per-slide "Start presentation"** (`PresentationPanel.tsx:409`):
  `onStartPresentation?.(slide.id)` — explicit id of the row the user
  clicked (rows render in canonical `sortedSlides` order). Correct
  intent; must keep opening exactly that slide.
- **`handleStartPresentation` callers:** exactly ONE — the
  `onStartPresentation` prop wiring at `DrawingLayout.tsx:3041`. No
  keyboard shortcut, deep link, or other opener exists
  (`setPresentationActive(true)` appears only at `:1507`; `false` only
  at the overlay's `onClose`, `:3052`).
- **`presentationStartId` producer/consumers:** produced only at
  `:1506`; consumed only by the `FullscreenPresentation` mount
  (`:3050`). `PresentationPanel` and `FullscreenPresentation` are each
  mounted ONLY by `DrawingLayout` (repo-wide grep).
- **Navigation after open** (`FullscreenPresentation.tsx`): start index
  `findIndex` over the slides array (`:78-82`), `currentSlide =
  slides[currentIdx]` (`:114`), keyboard ±1 (`:210-224`), Prev/Next
  buttons ±1 (`:347`, `:363`), counter `Slide {currentIdx+1} /
  {slides.length}` (`:358`).

**Defect ruling: ONE coherent defect — "presentation playback ignores
the canonical panel order" — with TWO owner sites** (Task-2 outcome 3):

1. the fullscreen **sequence** (FullscreenPresentation walks its
   `slides` prop raw), and
2. the **default start target** (DrawingLayout's no-id fallback picks
   the raw-first frame).

Neither half alone reaches a coherent contract: sequence-only produces
exactly the live failure above (default opens Slide 2/2); target-only
(canonical first id into a raw sequence) opens landscape labeled
**Slide 2 / 2** with Prev leading to portrait — still divergent from
the panel numbering. Explicit named launches need NO third change: once
the sequence is canonical, `findIndex` by id lands the named slide at
its canonical index.

### 0.1.3 Outcome: OPTION A — amend PATCH-072 as one two-owner fix

- Not Option B (split): the two halves share one contract, one product
  ruling, one fixture, one spec, and are NOT independently shippable to
  coherent end states (each half alone ships a new inconsistency).
- Not Option C (diagnosis-only): every entry path is traced above with
  exact lines; the intended default-start semantics are evidenced in
  §0.1.4. Nothing remains uncertain.

### 0.1.4 Product ruling — default-start contract (bound)

1. **No explicit slide id** (bottom Start button): open canonical
   `orderedSlides[0]` — **Slide 1 / M**.
2. **Explicit slide id** (per-slide menu, any future named launch):
   open exactly that slide, at its canonical index (counter shows its
   canonical position).
3. **Navigation** (Prev/Next buttons, ArrowLeft/ArrowRight/PageUp/
   PageDown/Space): follows canonical order.

Evidence: the bottom button sits directly beneath the canonically
sorted slide list whose visible numbering is `Slide ${idx + 1}` over
`sortedSlides` (`PresentationPanel.tsx:321-323`); the per-slide menu
item belongs to the specific row the user clicked; the fullscreen
counter must mean the same slide as the panel numbering. "Start
presentation" with nothing selected can only coherently mean "play the
deck I see, from its first slide."

### 0.1.5 DrawingLayout authorization — smallest safe change

`DrawingLayout.tsx` IS now authorized, restricted to exactly:

1. ONE import of the same pure helper:
   `import { sortSlidesByPresentationOrder } from "@/lib/infra/presentation/slideOrder";`
2. Inside `handleStartPresentation` (`:1503-1508`) ONLY, replace the
   fallback so the no-id branch resolves the canonical first frame:
   `setPresentationStartId(fromSlideId ?? sortSlidesByPresentationOrder(activeFrames)[0].id);`
   The explicit-`fromSlideId` path stays behaviorally identical; the
   dependency array (`[elements]`) is unchanged.

Structural fit: raw Excalidraw frame elements carry numeric `x`/`y` and
no `order` property (`undefined` → `?? +Infinity`), so the helper's
effective order over frames is `y → x` — identical to the panel's
semantics for `frames` (which bind `order: null`, `:1944`). No
comparator duplication is introduced (same helper; parity already
locked by unit test §5.7).

Net growth: ≤ 2 lines on an over-ceiling file — explicitly authorized
here as a bound never-grow exception; nothing else in the file may
change. Prohibited within `DrawingLayout.tsx`: any global reordering of
`activeFrames` or `frames`, any change to the `frames` derivation
(`:1934-1956`), the reconciliation effect, the panel/fullscreen mount
JSX, planner/resolver/thumbnail wiring, any other handler.

**Rejected alternatives:** passing `sortedSlides[0].id` from the
PresentationPanel bottom button (the panel is IMMUTABLE-fenced, and it
would leave the defective raw fallback live in the producer for any
future no-id caller); sorting `frames` at the mount site (global
reorder — §9 stop condition; also perturbs thumbnail/panel inputs);
duplicating the comparator inline in DrawingLayout (rejected
duplication).

### 0.1.6 Amended scope — exactly FIVE files (hashes measured fresh at `a59526e`)

| File | Pre-edit state (bind) | Authorized change |
|---|---|---|
| `lib/infra/presentation/slideOrder.ts` | ABSENT (dir removed; verified) | NEW pure helper, §2.1 exactly (unchanged) |
| `lib/infra/presentation/slideOrder.test.ts` | ABSENT (verified) | NEW, exactly the §5 matrix N=7 (unchanged) |
| `components/presentation/FullscreenPresentation.tsx` | `caea11414929b0291e8d5d54513d50f55daf73b3` | §2.3 exactly (unchanged) |
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | `93e5900f8df6468a466f8bfd0318f813393336a1` | §0.1.5 exactly — one import + one fallback expression |
| `e2e/characterization/drawing-presentation.spec.ts` | `19d6e86495dc06f677d6efd88a59e6e07566f02c` | §6 flip + §0.1.8 named-launch proofs |

No SIXTH file. `PresentationPanel.tsx`
(`926f43cec98fadc610976081b58cb246ba00d501`) remains IMMUTABLE. All
other §3 prohibitions stand.

### 0.1.7 Amended fences — 49 unique paths

The §4 50-path set MINUS `DrawingLayout.tsx` (moved to
authorized-change). **Verified 49/49 at `a59526e`** during this
amendment (no duplicate paths). Verify before editing and before the
commit.

### 0.1.8 Amended e2e design (extends §6; test COUNT unchanged: 2 active + 2 approved skips)

Inside the existing main active test, the bound matrix becomes:

1. persisted raw scene order remains `[Portrait, Landscape]` (existing
   `seededFrameTitles` + persisted-scene invariants, unchanged);
2. canonical panel/sidebar order remains `[Landscape, Portrait]`
   (existing assertions unchanged, incl.
   `slideTitles ≠ seededFrameTitles`);
3. **bottom Start (no id) opens LANDSCAPE, Slide 1 / 2** (child A
   visible, child C visible, uploaded image visible, child B NOT
   visible) — the §6 flip, now satisfiable;
4. Next → PORTRAIT, Slide 2 / 2 (child B visible); Prev → back to
   landscape Slide 1 / 2; End presentation closes;
5. **NEW named-launch proofs** (after the End click, before the
   back-to-dashboard reopen): via the per-slide ⋮ menu → "Start
   presentation" on the PORTRAIT row → fullscreen opens PORTRAIT,
   **Slide 2 / 2** (child B visible); End; same flow on the LANDSCAPE
   row → fullscreen opens LANDSCAPE, **Slide 1 / 2** (child A visible,
   child B not); End;
6. all carried 069/070/071 invariants stay green exactly as §6 binds
   (probe reset before the Start click; landscape observation window
   anchored at fullscreen-open/slideIndex 1; thumbnail N5; planner
   plan; persisted scene; cleanup zeros);
7. the `patch-072-presentation-order` annotation additionally records
   `defaultStartTarget: { before: 'raw-activeFrames[0]', after:
   'canonical-orderedSlides[0]' }` and the two named-launch results
   (slide title + counter each).

### 0.1.9 Expected totals (unchanged by this amendment)

Helper 7/1; sanitizer 9/1; focused 59/2; full **448/43**; presentation
spec 2 active + 2 approved skips; all other §7 baselines as bound.

### 0.1.10 Amended stop conditions (in addition to §9, which stands except its DrawingLayout clause)

STOP immediately, report, do not commit, if:

- satisfying the default target requires globally reordering
  `activeFrames`, the `frames` derivation, or any persisted scene
  order;
- explicit named `startSlideId` launches regress (either per-slide
  menu row);
- any caller beyond the single `onStartPresentation` wiring
  (`:3041`) requires a behavior change;
- `PresentationPanel.tsx` must change at all;
- PDF/PPTX export order, sidebar order, or thumbnail order changes;
- a SIXTH file is required;
- planner/resolver/thumbnail code is required;
- the presentation spec's test COUNT changes;
- a second defect surfaces (fix nothing else — report).

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

**Rejected alternatives:** sorting the fullscreen SEQUENCE in
`DrawingLayout.tsx` (fenced hotspot, never-grow rule — note: Amendment
1 authorizes a separate, minimal DrawingLayout edit for the DEFAULT
START TARGET only, §0.1.5; the sequence sort stays in
FullscreenPresentation); replacing the panel's inline comparator in
this patch (bundled refactor); mutating persisted scene/frame order
(data change for a presentation-layer defect); changing
`characterizeFrameSlides` or any bridge/test-only module; introducing a
user-facing slide-reorder feature (`order` field authoring — future
product work); touching planner/resolver/thumbnail files.

## 3. Scope — allowed files (exactly four) — SUPERSEDED by §0.1.6 (exactly FIVE; DrawingLayout.tsx authorized per §0.1.5)

| File | Pre-edit state (bind, at `3b863d5`) | Authorized change |
|---|---|---|
| `lib/infra/presentation/slideOrder.ts` | ABSENT (dir `lib/infra/presentation/` also absent — verified) | NEW pure helper, §2.1 exactly |
| `lib/infra/presentation/slideOrder.test.ts` | ABSENT (verified) | NEW, exactly the §5 matrix |
| `components/presentation/FullscreenPresentation.tsx` | `caea11414929b0291e8d5d54513d50f55daf73b3` | §2.3 exactly: one import + one memoized sort + `slides` → `orderedSlides` reads |
| `e2e/characterization/drawing-presentation.spec.ts` | `19d6e86495dc06f677d6efd88a59e6e07566f02c` | §6 flip |

No fifth file *(superseded: §0.1.6 authorizes `DrawingLayout.tsx` as
the fifth file, restricted to §0.1.5)*. Prohibited outright:
`PresentationPanel.tsx`, `planSlideComposition.ts`,
`resolveSlidePadlets.ts`, `RuntimeSlideRenderer.tsx`, all thumbnail
files, all bridge/harness/test-only modules, all PATCH-071 files, fork,
schema, config, dependencies, `.fable5/**` during implementation.

## 4. Immutable fences — 50 unique paths — SUPERSEDED by §0.1.7 (49 paths: DrawingLayout.tsx moved to authorized-change)

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

- base commit, any §0.1.6 pre-edit hash, or any of the 49 fences
  (§0.1.7) differs;
- either new file already exists at base;
- the fix requires touching `PresentationPanel.tsx`, any
  bridge/planner/resolver/thumbnail file, or any SIXTH file
  (*superseded clause: `DrawingLayout.tsx` is authorized per §0.1.5,
  restricted edits only*);
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

Files + pre/post hashes (all FIVE, §0.1.6); helper semantics proof
(7/1); fullscreen sequence evidence (Slide 1 = landscape, Slide 2 =
portrait, sidebar equality); DEFAULT-START evidence (bottom button →
landscape Slide 1 / 2) and BOTH named-launch results (§0.1.8.5);
re-anchored PATCH-070 fixed-state evidence at slideIndex 1;
`patch-072-presentation-order` annotation verbatim (incl.
`defaultStartTarget`); all gate totals (§7/§0.1.9); cleanup proof;
**49**-fence result (§0.1.7); production-import grep; commit hash +
push status after Sonnet PASS.
