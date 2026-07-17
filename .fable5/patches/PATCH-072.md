# PATCH-072 - Align Fullscreen Slide Order with the Canonical Panel Order

**Status:** **DONE** (2026-07-17; closed in CURRENT_TASK.md).
Implementation commit `27e4018f2f83ad33b592ef85773aa240f1a7c9ca`
(`fix(presentation): align fullscreen slide order with panel order
(PATCH-072)`), Sonnet PASS, no required changes, one non-blocking
follow-up note (comparator NaN/-Infinity parity — recorded in the
closure log). History: Amendment 1 (§0.1, two-owner scope), §0.2
verification rebind, §0.3 keyboard-activation correction, §0.4
semantic persisted-scene invariant. Where Amendment 1 (§0.1) and the
original sections conflict, **Amendment 1 wins**.

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

## 0.2 Verification-state rebind (2026-07-16) — E2E hash drift after locator tightening

### 0.2.1 Drift record

- The initial five-file implementation report bound
  `drawing-presentation.spec.ts` at
  `b25158f2efd42104d5e4a31ed2abc68122f263e1`.
- The file was subsequently edited during locator tightening (after the
  first incomplete Playwright attempt). Its current hash is
  `1866f1a9f2362cc936a8f683ea4546c36c3b8da9`.
- The earlier implementation packet is therefore STALE for that file.
  **No acceptance review may use the old E2E hash.**
- No commit is authorized yet; PATCH-072 is NOT done.
- The last presentation run (against the PRE-correction file) returned
  1 failed / 1 passed / 2 skipped; the main presentation test timed out
  after 240000 ms.
- Generated `test-results/` artifacts from that run existed and were
  removed by the CTO during this rebind (§0.2.6).

### 0.2.2 Delta reconstruction and current-file review

The exact byte delta `b25158f2 → 1866f1a9` is NOT reconstructible: the
old blob was never staged (absent from the git object database, incl.
dangling objects) and no editor local history holds the file. The
ruling basis is instead a FULL review of the current file against HEAD
(`19d6e86 → 1866f1a9`, 106 insertions / 13 deletions), which strictly
supersedes the stale packet — every byte of the change was re-reviewed,
not just the correction. Findings:

- **Named-launch driver** (the tightened part): a single
  `openNamedPresentation(slideTitle)` helper — resolve the slide card
  by exact title → `xpath=ancestor::div[contains(@class,"rounded-xl")][1]`
  (the card container) → `locator('button').last()` (with the menu
  closed, the card's buttons are exactly [thumbnail, ⋮]; last = the ⋮
  trigger) → `getByRole('button', { name: 'Start presentation',
  exact: true }).first()` (two exact-name matches exist once the menu
  is open: the menu item, which precedes the bottom Start button in DOM
  order, and the bottom button; `.first()` deterministically selects
  the menu item). Narrow and deterministic.
- **Assertions:** NOT weakened — strengthened. Added:
  `slideTwoHasLandscapeChild === false` on the portrait slide, both
  named-launch counter/content proofs, counter-absence checks after
  each End click.
- **Timeouts:** unchanged policy — every new wait reuses the file's
  standard `60_000`; the test-level timeout was NOT raised; no
  `waitForTimeout`, no sleeps, no retry loops.
- **Cleanup logic:** untouched (no diff in the finally block or the
  cleanup assertions).
- **PATCH-069/070/071 assertions:** bodies untouched except the
  §6-AUTHORIZED changes: fullscreen census/annotation `slideIndex`
  re-anchor 2 → 1, probe reset moved to immediately before the Start
  click, and the bottom-start sequence flip (landscape first). The
  `patch-070-native-raster-fix` annotation structure is unchanged.
- **Scope:** everything in the diff maps to §6 + §0.1.8 (incl. the
  bound `patch-072-presentation-order` annotation with
  `defaultStartTarget` before/after, both named-launch results, and
  classification
  `fullscreen-slide-order-aligned-with-canonical-panel-order`). No
  out-of-scope edit found.

### 0.2.3 Timeout classification: **B — E2E locator/state-management failure** (pre-correction file)

Evidence (`test-results/.../error-context.md` page snapshot at
timeout, captured before cleanup):

- Sidebar open in canonical order [Landscape, Portrait]; the PORTRAIT
  row's ⋮ menu OPEN with the "Start presentation" item rendered and
  enabled; NO fullscreen portal anywhere in the snapshot; page alive
  and settled (not an environment hang → not C).
- The test died in the NAMED-LAUNCH phase, which means the entire
  bottom-start sequence — flip to landscape Slide 1/2, Next → portrait
  2/2, Prev, End — had already PASSED live in that same run: the
  production fix behavior was confirmed up to that point (→ not A/D;
  no product assertion failed, and the reachable UI exposes the launch
  action a manual click would trigger).
- **Last confirmed successful step:** opening the Portrait per-slide ⋮
  menu. **Pending operation at timeout:** activating the per-slide
  "Start presentation" menu item (menu still open + no portal ⇒ the
  click never landed; the pre-correction locator failed to resolve or
  targeted an unclickable match). Caveat, stated honestly: the
  pre-correction file bytes are unrecoverable, so the exact pending
  Playwright call is inferred from the snapshot, not quoted from a
  call log.

### 0.2.4 Ruling: **OPTION A** — accept the current hash as the verification base

`e2e/characterization/drawing-presentation.spec.ts` is bound at
**`1866f1a9f2362cc936a8f683ea4546c36c3b8da9`** for verification and
review. No source correction is authorized; **no production edit is
authorized** (the timeout does not evidence a product defect). The four
other implementation files were re-verified unchanged:

```
lib/infra/presentation/slideOrder.ts                     e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts                2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
components/presentation/FullscreenPresentation.tsx       655244b443c3869173996cb21a77f7d67c41c64b
components/collabboard/canvas/layouts/DrawingLayout.tsx  b470a888e4015e57b757ba0c57a041f1b7d8adb9
e2e/characterization/drawing-presentation.spec.ts        1866f1a9f2362cc936a8f683ea4546c36c3b8da9
```

DrawingLayout diff re-checked against §0.1.5: exactly one import + the
fallback expression
`fromSlideId ?? sortSlidesByPresentationOrder(activeFrames)[0]?.id ?? null`
(defensively equivalent under the length guard); deps unchanged;
nothing else.

### 0.2.5 Refreshed verification packet (bind)

- Verify the five §0.2.4 hashes EXACTLY before anything else; any
  further drift → stop.
- Fences 49/49 (§0.1.7) re-verified before and after the run.
- One fresh SELF-STARTED `npm run dev` (port discipline per §8); then:
  `PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/drawing-presentation.spec.ts --workers=1 --reporter=line`
  — one worker, no concurrent suites, NO source edits during the first
  clean rerun. Annotation extraction afterwards via a `--reporter=json`
  run.
- If the 240 s timeout recurs: capture and retain full evidence
  (reporter output + error context; enable `--trace on` for the retry
  only), report, STOP — do not edit sources to chase it.
- The first clean rerun MUST report: exit code; exact totals (expected
  2 passed / 2 skipped); exact last successful UI step; the verbatim
  `patch-072-presentation-order` annotation; every generated artifact;
  dev-server PID ownership/stop; port free afterward.
- Only after the presentation spec passes may the remaining gates run
  (helper 7/1, sanitizer 9/1, focused 59/2, full 448/43, remaining
  Playwright suites, cred-off proofs, cleanup zeros, production-import
  grep, tsc/boundaries, sequential verify/build), then Sonnet review,
  then the bound commit.

### 0.2.6 Artifact cleanup (executed during this rebind)

Removed: `test-results/` (contained only `.last-run.json` and the main
test's `error-context.md`). `playwright-report/` absent; no
screenshots, videos, or traces existed. `e2e/.auth/user.json` LEFT in
place (gitignored; NOT created by the failed run — its totals contained
no setup pass; regenerate only via `--project=setup` if auth expires).
No source or tracked file altered. Post-cleanup `git status`: exactly
the three modified implementation files + untracked
`lib/infra/presentation/` (the two new files).

### 0.2.7 Stop conditions (additional, this phase)

STOP and report if: any of the five §0.2.4 hashes drifts again before
verification; the current file still hangs on a fresh clean run; a
production file must change; a sixth file is required; any 069/070/071
assertion weakens; artifacts cannot be cleaned safely; another defect
enters scope.

---

## 0.3 Named-launch test correction (2026-07-17) — pointer interception proven; keyboard activation authorized

### 0.3.1 Repeated verification stop (record)

- The accepted spec at `1866f1a9f2362cc936a8f683ea4546c36c3b8da9` still
  fails DETERMINISTICALLY: both the first clean rerun and the traced
  retry (same command + `--trace=on`) returned exit 1, 1 failed /
  1 passed / 2 skipped, main test timing out at 240000 ms at
  `drawing-presentation.spec.ts:1258` inside `openNamedPresentation`.
- The locator
  `page.getByRole('button', { name: 'Start presentation', exact: true }).first()`
  RESOLVES the intended per-slide menu item (visible, enabled, stable —
  401+ actionability retries all pass), but **click delivery is blocked
  by pointer interception**.
- Before the named-launch phase, the SAME run passed live: bottom
  Start → landscape Slide 1/2 → Next → portrait 2/2 → Previous →
  landscape 1/2 → End. The production fix behavior is again confirmed
  up to the named-launch phase.
- No production file changed; the four non-E2E hashes re-verified
  identical (§0.2.4). No new implementation hash exists yet. No commit
  is authorized. PATCH-072 is NOT done.

### 0.3.2 Trace-based interceptor identity (CTO-inspected, trace.zip parsed)

The trace's interception message (two variants differing only in the
thumbnail's base64 payload — the preview re-rendered between retry
batches) names the interceptor exactly:

`<img draggable="false" alt="Slide preview" class="absolute inset-0
w-full h-full object-contain" src="data:image/png;base64,…"/> from
<div class="group flex items-start gap-2">…</div> subtree intercepts
pointer events`

That is `SlideThumbnail`'s preview `<img>` (`SlideThumbnail.tsx:26-31`)
inside a slide ROW wrapper. Source-level geometry: the per-slide menu
(`absolute right-0 bottom-full mb-1 w-52 z-50`,
`PresentationPanel.tsx:402-406`) is a DOM descendant of the slide CARD
div, whose class list includes `overflow-hidden`
(`PresentationPanel.tsx:341-348`); the menu's containing-block chain
passes through that card, so the menu is CLIPPED at the card's top
edge. "Start presentation" is the TOPMOST menu item; its click point
lies above the card's top edge, in screen space painted by the
adjacent row's preview image — `elementFromPoint` therefore returns
the preview `<img>` on every retry. The interception is geometric and
permanent (401+ retries over the full wait, element always reported
"visible, enabled and stable"; no animation or transition involved —
Option D rejected: there is nothing to settle or clear).

**Classification: E2E locator/state-management failure — pointer
interception.** Not established as a product ordering,
FullscreenPresentation, DrawingLayout, comparator, or `startSlideId`
semantic defect: no product assertion failed, and the menu item's
real click handler is intact and keyboard-reachable.

**Flag for the next census (out of PATCH-072 scope, no production edit
authorized):** the same geometry implies the top per-slide menu items
may be pointer-unreachable for mouse users in the real UI (the card's
`overflow-hidden` clips the upward-opening menu). Recorded as a
candidate UI concern for the PATCH-073+ census; it does NOT block
PATCH-072's bound behavior, which is provable through the real
accessible keyboard path.

### 0.3.3 Ruling: OPTION A — keyboard activation (preferred order honored)

Keyboard activation exercises the REAL application command: the menu
item is a genuine `<button>`; focusing it and pressing Enter triggers
the browser-native button activation → the same React `onClick` →
`onStartPresentation?.(slide.id)`. No pointer layer involved, no
force, no synthetic dispatch, no test seam. `.focus()` does not fire
`mousedown`, so the panel's outside-mousedown menu-close listener
cannot fire. Options B/C rejected while a preferred, more truthful
path exists; Option D rejected per §0.3.2 (no transient state to
wait out).

### 0.3.4 Bound correction (exactly one, test-only)

- File: `e2e/characterization/drawing-presentation.spec.ts`
- Pre-correction hash (bind):
  `1866f1a9f2362cc936a8f683ea4546c36c3b8da9`
- Region: the `openNamedPresentation` helper only (currently
  `:1251-1259`).
- OLD action (verbatim):

```ts
const menuStart = page.getByRole('button', { name: 'Start presentation', exact: true }).first();
await expect(menuStart).toBeVisible({ timeout: 60_000 });
await menuStart.click();
```

- REPLACEMENT (verbatim; the only permitted change):

```ts
const menuStart = slideCard.getByRole('button', { name: 'Start presentation', exact: true });
await expect(menuStart).toHaveCount(1);
await expect(menuStart).toBeVisible({ timeout: 60_000 });
await expect(menuStart).toBeEnabled();
await menuStart.focus();
await expect(menuStart).toBeFocused();
await page.keyboard.press('Enter');
```

  Rationale for the locator rescope: `slideCard`-scoping makes the
  match EXACTLY ONE element (the bottom Start button lives outside the
  cards) and proves row association (Task-5 cardinality + row
  requirements); the accessible name stays exact. The ⋮-opening click
  (`slideCard.locator('button').last().click()`) is pointer-reachable
  (footer region, unclipped — proven by both runs reaching the open
  menu) and stays UNCHANGED.
- Everything else FROZEN: no assertion changes, no fixture changes, no
  annotation changes beyond mechanical line drift, no timeout-policy
  change, no sleeps/retries, no production change, no additional file.
- The NEW file hash MUST be measured and reported immediately after
  the correction, before any run.

### 0.3.5 Rejected workarounds (binding)

Direct `useCanvasActions`/DrawingLayout handler calls; direct React
callback invocation; DB insertion to simulate launch; removing or
weakening named-launch assertions; substituting the bottom Start
button for the per-slide path; `test.skip`; retry loops; arbitrary
`waitForTimeout`; timeout increases; unscoped `.first()` without
cardinality proof; coordinate clicks; `click({ force: true })` and
`dispatchEvent('click')` (available under the preferred option — not
needed); ANY production CSS/z-index/pointer-events change; editing
`PresentationPanel.tsx` or `SlideThumbnail.tsx`; any sixth file.

### 0.3.6 Verification contract after the correction

1. Generated artifacts of the failed runs were removed by the CTO
   AFTER capturing the evidence into this section (`test-results/`:
   `.last-run.json`, `error-context.md`, both `trace.zip` files, incl.
   the setup trace). Nothing tracked was altered.
2. Re-verify the four non-E2E hashes (§0.2.4) unchanged; apply ONLY
   §0.3.4; report the new E2E hash.
3. One fresh self-started dev server (§8 port discipline), then:
   `PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/drawing-presentation.spec.ts --workers=1 --reporter=line`
   — expected **exit 0, 2 passed / 2 approved skips**.
4. Fresh `--reporter=json` pass; extract the complete
   `patch-072-presentation-order` annotation verbatim.
5. Only after the presentation spec passes: the remaining bound
   Playwright and deterministic gates (§0.2.5 list), fences 49/49,
   then Sonnet review, then the bound commit.

### 0.3.7 Stop conditions (this correction)

STOP and return to governance if: keyboard activation still times out;
the scoped locator does not resolve exactly one intended menu item;
the item is not visible/enabled/focusable; Portrait vs Landscape
launches cannot be distinguished deterministically; a production
change is required; PresentationPanel/SlideThumbnail code is required;
any assertion must weaken; a sixth file is required; timeout policy
must change; another defect enters scope.

---

## 0.4 Persisted-scene drift investigation (2026-07-17) — classification B; semantic invariant replaces byte-length

### 0.4.1 Record (new stop, distinct from the locator defect)

- The §0.3 keyboard-activation correction is VALIDATED: the first clean
  presentation run at spec `a687c99904f0d61b7630667940cf92429620bd23`
  passed (exit 0, 2 passed / 2 approved skips); pointer interception is
  resolved and closed.
- The required fresh JSON-reporter rerun then failed at `:1097`:
  `expect(postRunPersistedScene.rawContentLength).toBe(persistedScene.rawContentLength)`
  — expected **3435**, received **3534** (+99 bytes). Failure at 20.8 s
  into the main test; the setup project passed.
- No commit is authorized; no Sonnet acceptance review is authorized;
  PATCH-072 is NOT done. No source edit occurred before this
  classification.

### 0.4.2 Evidence and CTO live diagnosis

- JSON reporter + error context inspected. Decisive same-run facts: the
  three assertions immediately BEFORE the failure PASSED —
  `preRunElementOrder === postRunElementOrder` (`:1094`) and both
  native plan-band comparisons (`:1095-1096`). Element count stayed 7,
  IDs and order identical, plan identical. The failing run's scene
  bytes are unrecoverable from artifacts (assertion-failed runs DO run
  their `finally` cleanup, which deleted the fixture).
- Pre-run snapshot provenance: `persistedScene` is read at `:794`
  BEFORE the browser opens the board — it is the seeded content.
  Seeded baseline = **3435 bytes / 7 elements** (`frame-portrait`,
  `frame-landscape`, `emb-slide-a`, `emb-uploaded-image`,
  `text-landscape`, `shape-landscape`, `emb-slide-b`; all `version 1`,
  1-digit `versionNonce`, no `customData`), CONFIRMED LIVE twice.
- CTO diagnosis (no source edits; scratch DB watcher polling the
  harness master padlet's `content` every 250 ms under a self-started
  dev server): TWO full diagnostic spec runs, BOTH passed (35.2 s /
  14.8 s), and in BOTH the fixture's scene had exactly ONE persisted
  version — the seeded 3435 bytes. Passing runs write NOTHING; the
  +99 write is a rare, timing-dependent event.

### 0.4.3 Residue discovery and cleanup (side finding, not causal)

The watcher found FIVE leaked `patch-064-harness-presentation-%`
boards predating the diagnosis (timestamps `…5836768-9ffc6p`,
`…6082624-piu9mc`, `…6209168-iscnpx`, `…6560151-nr7mao`,
`…9665684-jy5ng7`) — fixtures of the earlier 240 s TIMEOUT runs: a
test killed by timeout never completes its in-body `finally` cleanup,
while assertion-failed runs do. NOT causal for the +99
(`fetchPersistedScene` is `masterPadletId`-scoped). Their scenes
captured the app's FULL flush signature: **8 elements** (7 seeded + 1
reconciliation-inserted embeddable, `frameId: null`, `padlet://`
link), `version 2/3`, 9-10-digit `versionNonce`, `renderSignature`
(285-299 chars) added to every `padlet://` embeddable — len ≈
5447-5451 (+ ≈ 2015). CTO deleted the residue prefix-scoped: **5
boards / 40 padlets / 0 canvas_lines; zero remaining (verified)**.
Flagged for the next census (harness change NOT authorized now): the
harness should survive test-timeout aborts (prefix-scoped pre-run
sweep or teardown-phase cleanup).

### 0.4.4 Semantic before/after for the failing run

rawContentLength 3435 → 3534; element count 7 → 7; ordered ID list
IDENTICAL (proven in-run, `:1094`); native below/above bands IDENTICAL
(`:1095-1096`); no element added or removed (an insertion flush is
EXCLUDED — it changes count/order, as the residue scenes show); frame
membership unchanged (plan equality); the Container C runtime
embeddable remained live-only; no presentation-order field exists in
or was written to persisted elements. Field-level split of the +99 is
not byte-recoverable (fixture deleted), but is bounded by the measured
flush signature: app-managed metadata growth on the SAME 7 elements
(1-digit → 9/10-digit `versionNonce` ≈ +63 across 7 elements, plus
small app-added serialization fields), i.e. a PARTIAL metadata flush
landing before the `:1030` read.

### 0.4.5 Ownership

`slideOrder.ts` is pure (no imports, no side effects, new array);
`FullscreenPresentation.tsx` renders with a `useMemo` sort (no
persistence); the DrawingLayout change is one fallback expression
feeding `setPresentationStartId`. NONE can write scene content. The
active writer in this flow is the PRE-EXISTING DrawingLayout
load-stability machinery (documented 2026-03-19): embeddable
reconciliation bumps `version`/`versionNonce`/`updated`, adds
`customData.renderSignature`, may insert missing embeddables; its
persistence timing relative to the `:1030` read is nondeterministic
(observed: 0 writes in three passing runs; partial +99 flush in the
one failing run; full flush in long/hung sessions).

### 0.4.6 Classification: **B** — pre-existing reconciliation/autosave behavior exposed by rerunning the spec

Not A: PATCH-072 paths are read-only and semantic membership was
stable in the failing run. Not C: reads are fixture-id-scoped; the
residue is real but non-causal; the failing run's own fixture was
fresh, and the preceding passing run's cleanup was assertion-verified.
Not D-alone: the byte-length proxy IS brittle, but a real pre-existing
write occurs — B is the root cause; the governance action below
replaces the brittle proxy. Not E: the writer's exact signature was
measured live.

### 0.4.7 Ruling: OPTION B — one E2E-only assertion correction (bound)

- File: `e2e/characterization/drawing-presentation.spec.ts`; current
  hash (bind): `a687c99904f0d61b7630667940cf92429620bd23`; region:
  line `:1097` ONLY.
- OLD (verbatim):
  `expect(postRunPersistedScene.rawContentLength).toBe(persistedScene.rawContentLength);`
- NEW (verbatim):
  `expect(postRunPersistedScene.sceneElements).toEqual(persistedScene.sceneElements);`
- **Invariant fields (explicit):** via `coerceSceneElement`
  (`:211-230`) the compared arrays carry id, type, x, y, width,
  height, frameId, strokeColor, backgroundColor, opacity, isDeleted,
  text, originalText, name, link — deep-equal in exact order and
  count. **Excluded (app-managed metadata, already outside the
  coercion):** version, versionNonce, updated, customData (incl.
  renderSignature), serialization-only fields.
- This is STRICTLY STRONGER than byte-length on everything semantic:
  any added/removed/reordered element (incl. a persisted runtime
  embeddable), any geometry/link/text/color/name/deletion drift on any
  seeded element FAILS it; only byte-count equality (which forbade the
  documented legitimate metadata persistence) is dropped. `:1094-1096`
  stay byte-untouched; the annotation's `rawContentLengthBefore/After`
  stays as report-only observability; no fixture change, no other
  assertion change, no production change, no additional file. The new
  file hash MUST be measured and reported immediately after the edit.
- Task-7 protections all hold: seeded membership stable, no native
  lost, no unexpected persisted runtime embeddable, raw order
  [Portrait, Landscape] stable, planner untouched, raster assertions
  untouched, live-only runtime padlet understanding unchanged.

### 0.4.8 Artifact handling (executed)

Evidence extracted into this section, then removed:
`.codex-patch072-playwright.json`, `test-results/` (error-context);
`playwright-report/` absent. CTO scratch scripts (scene watcher,
residue cleanup) deleted, never tracked. Diagnostic dev server: own
PIDs attributed by command line (npm wrapper + surviving
`next start-server.js` child) and stopped; **port 3000 verified
free**. Snapshot data retained only in the session scratchpad.

### 0.4.9 Refreshed verification contract

1. Apply §0.4.7 exactly; report the new E2E hash; re-verify the four
   non-E2E hashes (§0.2.4) unchanged.
2. Fresh self-started dev server; line-reporter presentation run
   (expected exit 0, 2 passed / 2 approved skips).
3. Fresh JSON pass; extract the complete
   `patch-072-presentation-order` annotation verbatim.
4. Then the remaining §0.2.5 gates, fences 49/49, Sonnet review, bound
   commit.
5. STOP back to governance if: the NEW semantic assertion fails on a
   fresh run (that is a REAL persisted-membership signal, not a tweak
   target); any hash drifts; a production change is needed; a sixth
   file is needed; any assertion must weaken; another defect enters
   scope.

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
