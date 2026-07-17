# PATCH-073 — Per-Slide Presentation Menu Pointer Reachability (Stage 0: Deterministic Pointer Characterization)

**Status:** AUTHORIZED — **diagnosis-only (Stage 0)**. Stage 1 (any
product fix) is CONTINGENT on Stage 0's outcome and is NOT designed or
authorized by this document; activating it requires a named amendment
with fresh bindings.

**Base commit (bind, verify before editing):**
`27e4018f2f83ad33b592ef85773aa240f1a7c9ca`
(`fix(presentation): align fullscreen slide order with panel order (PATCH-072)`)

**Bound Stage 0 commit message (verbatim):**
`test(presentation): characterize per-slide menu pointer reachability (PATCH-073 Stage 0)`

**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent, read-only,
uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

---

## 1. Defect hypothesis and existing evidence (census at `27e4018`)

**Hypothesis: the top items of the per-slide ⋮ menu in the
presentation panel ("Start presentation", "Share presentation") are
visually clipped and pointer-unreachable for real mouse users, on
every slide row.**

Existing evidence (PATCH-072 §0.3.2, gathered live during the 072
verification — this is why the 072 e2e uses keyboard activation):

- A real Chromium hit-test (Playwright actionability, 401+ stable
  retries) at the "Start presentation" menu item's click point
  repeatedly returned the ADJACENT row's `SlideThumbnail` preview
  `<img>` (`SlideThumbnail.tsx:26-31`) — not the menu item — while the
  item itself was reported visible/enabled/stable and present in the
  accessibility tree.
- Source geometry: the menu (`absolute right-0 bottom-full mb-1 w-52
  z-50`, `PresentationPanel.tsx:402-406`) is a positioned DESCENDANT
  of the slide-card div whose class list includes `overflow-hidden`
  (`PresentationPanel.tsx:341-348`); the menu's containing-block chain
  passes through that card, so the card clips the menu at its top
  edge. The menu (7 items, ≈290 px) is taller than the card (≈215 px),
  so the topmost items extend above the card and are clipped.
- Keyboard activation of the same button works and reaches the real
  React `onClick` (proven live, PATCH-072 named launches).

**What is NOT yet proven — the reason this is diagnosis-only:** real
mouse-user impact. The Playwright interception is strong evidence but
was measured incidentally, at one viewport, on one row, for one item.
Stage 0 must verify with `document.elementFromPoint` and GENUINE
pointer interaction, per item and per row, and freeze the result.

**Owner boundary (recorded now, binding for any Stage 1):** the owner
is `PresentationPanel.tsx`'s inline, non-portaled menu rendered inside
the overflow-hidden card. `SlideThumbnail.tsx` is an innocent
interceptor (it merely occupies the screen space above the card) and
must NOT be modified. This is a single-component menu-placement
defect, not a broad menu-architecture problem.

## 2. Stage 0 — bound observables (all recorded in one characterization)

Fixture: reuse the FENCED `drawingBridgeHarness` UNMODIFIED (same
seeded two-frame board and `patch-064-harness-presentation-` prefix,
same cleanup helpers and cleanup assertions as the presentation spec).
Viewport: Playwright default (1280×720); record viewport in the
annotation.

- **O1** — board opens; Present Frames panel opens; both slide rows
  render in canonical order [Landscape, Portrait].
- **O2** — for EACH row (Landscape, Portrait): open the row's real ⋮
  trigger with a genuine pointer click (this trigger is unclipped —
  proven reachable in 072); the menu opens; enumerate all seven menu
  items by accessible name.
- **O3** — for EACH menu item: record its bounding box; compute its
  visible fraction relative to the card's clip rect
  (`getBoundingClientRect` intersection with the `rounded-xl
  overflow-hidden` card ancestor); call `document.elementFromPoint` at
  the item's center and record the hit element's identity (tag,
  alt/text, class) and whether it is the item itself (or a descendant)
  versus an interceptor.
- **O4** — genuine pointer-click ATTEMPT on the TOP item ("Start
  presentation") with a short bounded trial (`click({ trial: false,
  timeout: 3000 })` wrapped in try/catch — no force, no dispatchEvent,
  no coordinates): record `pointer-activated` or
  `pointer-intercepted`. The test FREEZES the observed result — either
  outcome passes; assertions bind the RECORDED classification, not a
  wished-for one. If intercepted, assert fullscreen did NOT open; if
  activated, close it deterministically (End presentation).
- **O5** — keyboard control path on the same item (focus →
  `toBeFocused` → Enter, the 072 technique): MUST open fullscreen on
  the correct slide (Portrait row → Slide 2/2, Landscape row → Slide
  1/2) and be closed with End presentation. If the keyboard path
  fails, STOP — that is a different, worse defect; report, do not
  adapt.
- **O6** — bound annotation `patch-073-menu-pointer-reachability`:
  per-row, per-item matrix `{ name, bbox, visibleFraction,
  hitTestTarget, pointerResult }`; `keyboardControl` results;
  `interceptorIdentity` (exact); `viewport`; `ownerHypothesis:
  'presentation-panel-inline-menu-clipped-by-card-overflow'`; final
  `exactClassification` — exactly one of
  `pointer-intercepted-top-items` / `pointer-reachable-all-items` /
  `mixed-per-row` (whichever is OBSERVED).

Prohibited in the spec: `click({ force: true })`, `dispatchEvent`,
coordinate clicks, direct callback invocation, retry loops, arbitrary
`waitForTimeout`, timeout inflation (standard 60 s waits only; the 3 s
bounded trial click in O4 is the single exception and is part of the
measurement).

## 3. Scope — allowed files (exactly one)

| File | Pre-edit state (bind, at `27e4018`) | Authorized change |
|---|---|---|
| `e2e/characterization/presentation-menu-pointer.spec.ts` | ABSENT (verified) | NEW characterization, §2 exactly |

No second file. Prohibited outright: `PresentationPanel.tsx`
(`926f43ce…`, IMMUTABLE in Stage 0), `SlideThumbnail.tsx`
(`b26524ae…`, IMMUTABLE), all five PATCH-072 files (frozen, §4),
`drawingBridgeHarness.ts` and every bridge/test-only module, all
planner/resolver/thumbnail/fork files, `DrawingLayout.tsx`,
config/dependencies, `.fable5/**` during implementation.

## 4. Immutable fences — 54 unique paths

The PATCH-072 49-path set carried verbatim, PLUS the five PATCH-072
files frozen at their committed hashes:

```
lib/infra/presentation/slideOrder.ts e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts 2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
components/presentation/FullscreenPresentation.tsx 655244b443c3869173996cb21a77f7d67c41c64b
components/collabboard/canvas/layouts/DrawingLayout.tsx b470a888e4015e57b757ba0c57a041f1b7d8adb9
e2e/characterization/drawing-presentation.spec.ts e6e84823b2d4e04fd329086317fd6dc5f8f67420
```

**All 54 verified 54/54 at base `27e4018` during authoring** (54
unique paths, no duplicates; `PresentationPanel.tsx` and
`SlideThumbnail.tsx` were already members and stay IMMUTABLE). Verify
before editing and before the commit.

## 5. Baselines (bind; ALL re-verified fresh at `27e4018` this session)

Helper 7/1; sanitizer 9/1; focused drawing 59/2; full Vitest
**448/43** (Stage 0 adds NO unit files — totals unchanged); setup 1;
duplication 2-with-deps / 1-no-deps; line 4; presentation 2 passed / 2
approved skips; credential-off duplication 2 / line 4 / presentation 4
skipped; cleanup zeros for `patch-064-harness-%`, `patch-071-…`,
`patch-072-…`, `patch-073-…` prefixes (boards/padlets/canvasLines);
zero production imports of bridge/harness modules; repo clean and
synced.

**New spec bound expectations:** with dependencies **2 passed** (setup
+ 1 characterization); `--no-deps` **1 passed**; credential-off **2
skipped**. Every carried suite unchanged.

## 6. Stage 1 gate (bind — exactly one outcome)

1. **CONFIRMED** (`pointer-intercepted-top-items` or `mixed-per-row`
   with real hit-test proof): a named amendment MAY activate Stage 1 —
   a `PresentationPanel.tsx`-owned menu placement fix (portal,
   positioning, or overflow strategy — design bound at activation),
   with `SlideThumbnail.tsx` untouched, no all-menu redesign, and the
   Stage 0 spec flipping to the fixed state.
2. **NOT confirmed** (`pointer-reachable-all-items`): close PATCH-073
   as characterization-only; record that the 072 trace interception
   was environment-specific; no product change.
3. **Amendment required** (evidence contradicts the §1 hypothesis in
   some other way): stop and report.

## 7. Environment contract (binding, unchanged)

Self-started `npm run dev` + explicit `PW_BASE_URL`; port discipline
(inspect → attribute → stop only your own → verify free); auth state
only via `--project=setup`; no credential contents anywhere;
sequential `verify`/`build`, never under a dev server; never commit
generated artifacts.

## 8. Cleanup contract

Harness helpers + in-test cleanup assertions (zeros for the fixture);
post-run prefix-scoped residue checks
(`patch-064-harness-presentation-%`) must be zero. If a run is killed
by test timeout, prefix-scoped residue MUST be swept and reported (the
known in-body-`finally` leak — census follow-up #2 — is NOT fixed in
this patch; do not modify the harness for it here).

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, the §4 fences (54/54), or the new-file absence differs;
- a SECOND file is required, or the harness must be modified;
- any production file must change (Stage 0 is test-only);
- `force`/`dispatchEvent`/coordinates would be needed to record an
  outcome (the outcome is then `pointer-intercepted` — record it, do
  not work around it);
- the KEYBOARD control path fails (different defect — report);
- the fixture or menu enumeration is nondeterministic at the bound
  viewport;
- cleanup becomes nondeterministic;
- a second defect surfaces (report only).

## 10. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted diff (re-runs the new spec and carried gates,
re-derives hashes, extracts the annotation from a JSON-reporter run);
explicit PASS required; then commit with the bound message and push;
Fable closes or activates Stage 1 via amendment.

## 11. Required final report

New-file hash; per-row per-item reachability matrix verbatim
(`patch-073-menu-pointer-reachability` annotation); interceptor
identity; pointer vs keyboard outcomes; final classification; all §5
gate totals; cleanup proof; 54-fence result; production-import grep;
commit hash + push status after Sonnet PASS.
