# PATCH-117 — Application Chrome and Editor Overlay Containment

**Status:** **AUTHORIZED FOR IMPLEMENTATION (2026-07-27).**

Authored by the CTO under PATCH-115 §21e (routing), §23c (scope) and §24d
(sequencing). PATCH-115's implementation has landed
(`215ea811869360f4f689745c84ece0abefe73110`) so the worktree is clean and
every hunk this patch produces is unambiguously its own.

**PATCH-115 remains OPEN and BLOCKED. This patch is one of its two closure
prerequisites.**

---

## 0. The defect

Two symptoms, one root cause: **the Drawing editor overlay and the fixed
right-side application chrome have no shared definition of where the
visible canvas ends.**

### 0a. Symptom A — the editor CanvasLine layer paints over, and
intercepts clicks intended for, fixed chrome

`SimpleLineRenderer.tsx:656`:

```
zIndex: layer === 'back' ? 0 : (isLineMode || selectedLineId || isEditMode) ? 1000 : 10,
```

with `className="absolute inset-0 overflow-visible"` at `:650`. The
presentation sidebar is `fixed top-0 right-0 bottom-0 w-80 z-[500]`
(`DrawingLayout.tsx:3288`). **1000 > 500**, so whenever a line is
selected, or line mode or edit mode is active, the front line layer is
promoted above the sidebar. When none of those hold it sits at `z-10`,
safely below — which is why the defect is intermittent.

**This is functional, not cosmetic.** Live diagnosis (PATCH-115 §21b)
proved a `data-line-renderer="front"` / `data-line-role="hit-path"`
element **intercepted the Apply-layout interaction**. A transparent hit
path above chrome swallows clicks meant for the sidebar and its controls.

### 0b. Symptom B — zoom controls hidden behind the same sidebar

`DrawingLayout.tsx:3085-3094` portals `ZoomControls` into
`viewportContainerRef.current` with
`className="absolute bottom-6 right-6 z-[130] …"`. Same right edge,
`130 < 500`, so the controls are occluded whenever the panel is open.

They are **bottom-right-anchored, not centred** — the report of "centred
across the full browser width" is inaccurate, and this matters: the
minimal correct fix reserves the chrome width on the right offset. Any
move to centre-in-remaining-area is a **design change** and is out of
scope for this patch.

### 0c. The unifying cause

The sidebar is `fixed` and **overlays** the canvas without insetting it.
The canvas keeps its full width underneath, so both the editor overlay and
the canvas-anchored chrome believe they own screen space the sidebar has
taken. Fixing the two symptoms with two independent calculations would
create two competing notions of "visible canvas area" — explicitly
prohibited by §4.

### 0d. Implementation base commit (bind)

Build on the **current governance HEAD of `main` when implementation
starts** — not any hash written in this document, since the commit
publishing this file advances HEAD. Convention since PATCH-106 §0a.
**Hard stop:** do not check out a historical commit.

### 0e. Pre-existing unrelated worktree paths (bind)

Out of scope. Do not stage, revert, stash, reformat, or touch:
`.gitignore`, `app/api/ai/classify-intent/route.ts`,
`app/api/ai/convert-component/route.ts`,
`app/api/ai/generate-component/route.ts`, `scripts/live-access-login.mjs`.

The worktree must contain **exactly these 5 dirty entries** before
implementation begins (§8).

---

## 1. Required behavior

1. **One chrome boundary, defined once.** A single measured value
   describes where fixed right-side chrome begins. Both the editor overlay
   containment and the zoom-control placement consume **that same value**.
2. **Visual containment.** No CanvasLine ink — path, arrowhead, label, or
   handle — may paint beyond the chrome boundary, in any mode, on either
   layer.
3. **Pointer containment.** No CanvasLine hit path may receive a pointer
   event beyond the chrome boundary. Clicks in that region must reach the
   chrome element underneath the cursor.
4. **Editing preserved.** Within the visible canvas area, handles must
   remain above ordinary canvas content and fully interactive: selection,
   line mode, edit mode, front and back layers, handle dragging, endpoint
   editing, and keyboard editing all behave exactly as today.
5. **Boundary absence is a valid state.** When no fixed right-side chrome
   is open — and on every layout that has none — behavior must be
   **identical to today**. This is what protects Freeform and Map (§7).
6. **Reactivity.** The boundary must re-resolve on panel open, close,
   and window resize.

---

## 2. Preferred approach (source-backed)

Reuse the mechanism that already solves this problem in the same file.
`DrawingLayout.tsx:855-900` positions the top-right floating cluster by
measuring:

```
const viewportRight = viewportContainerRef?.current?.getBoundingClientRect().right ?? window.innerWidth;
const reservedSidebarLeft = presentationSidebarRef.current?.getBoundingClientRect().left ?? (viewportRight - 320);
```

under a `MutationObserver` on the anchor and a `ResizeObserver` observing
both the viewport container and `presentationSidebarRef` itself
(`:896-897`). It already handles the panel being absent via the `??`
fallback.

**Extract that measurement into one boundary value** and feed it to (a)
the existing cluster positioning, unchanged in behavior, (b) the
`ZoomControls` right offset, and (c) the line layer's containment. Do not
write a second measurement. Do not introduce a new observer where an
existing one already fires.

**Chrome band census (measured, bind).** `DrawingLayout.tsx` uses
`z-[130]` (zoom controls), `z-[500]` (presentation sidebar), `z-[9998]`
(a `fixed inset-0` backdrop, `:3323`), and `z-[10010]` (a `fixed inset-0`
modal, `:3048`). `SimpleLineRenderer.tsx` uses `0` (back), `10` (front,
idle), `1000` (front, promoted). The patch must state where the line
layer sits relative to **all four** Drawing chrome bands, and must not fix
one collision while leaving the modal bands (`9998`, `10010`) unaddressed
in its reasoning — even though those already exceed 1000 and so are
expected to need no change.

---

## 3. Production allowlist (bind) — maximum 3

| # | File | Authorized change |
|---|---|---|
| 1 | `components/collabboard/SimpleLineRenderer.tsx` | The layer container at `:650-658` — stacking, overflow, and pointer containment, driven by an optional chrome-boundary input. **PATCH-115 §6 prohibits this file; PATCH-117 explicitly authorizes it.** |
| 2 | `components/collabboard/canvas/layouts/DrawingLayout.tsx` | The boundary extraction around `:855-900`, the `ZoomControls` portal call site at `:3085-3094`, and passing the boundary to the line layer. |
| 3 | `components/collabboard/canvas/ui/ZoomControls.tsx` | **Only if** source proves the default `className` must change. |

**File 3 is expected to be unnecessary.** The caller passes a complete
`className` (`absolute bottom-6 right-6 z-[130] …`) that overrides the
component's default entirely, so the offset can be changed at the call
site. If the implementer touches this file, the report must state the
source reason. If it is not needed, **the production cap is 2**.

**A fourth production file is a HARD STOP requiring amendment.** Do not
add one. Do not "fix while you're in there".

**Prohibited files (non-exhaustive; the allowlist is the authority):**
`planSlideComposition.ts`, `getSlideRenderSignature.ts`,
`createSlideRenderer.tsx`, `renderCanvasLinePrimitive.tsx`,
`RuntimeSlideRenderer.tsx`, `FullscreenPresentation.tsx`,
`canvasLineSlideMembership.ts`, `frameMembership.ts`,
`canvasLineCoordinates`, `useCanvasLines`, `useCanvasData`,
`CanvasClient.tsx`, `PresentationPanel.tsx`, `SlideLayoutModal.tsx`,
`MapCanvas.tsx`, any `canvas_lines` persistence module, any migration,
`vitest.config.ts`, `package.json`, `package-lock.json`, and the five
paths in §0e.

**Prohibited changes, by kind:**

- Blind global reduction of the line layer's promoted z-index.
- Global escalation of sidebar or modal z-index.
- Blanket `pointer-events: none` on a line layer (it disables editing).
- Any second/competing calculation of the visible canvas area.
- Any change to PATCH-115 presentation rendering, thumbnails, or
  invalidation.
- Any change to CanvasLine persistence, geometry, or `coord_space`.
- Any change to slide membership or layout movement (that is PATCH-118).
- Any change to Map or Freeform behavior (§7).

---

## 4. Test allowlist (bind) — maximum 3

| # | File | Status |
|---|---|---|
| 1 | `components/collabboard/SimpleLineRenderer.test.tsx` | **Exists and is runner-included.** Extend it. |
| 2–3 | Two further files, each verified runner-included before writing | Optional |

**Runner inclusion is measured, not assumed.** `vitest.config.ts`
`include` is:

```
['lib/domain/**/*.test.ts', 'lib/infra/**/*.test.ts', 'scripts/harness/**/*.test.ts', 'components/collabboard/*.test.tsx']
```

Note the last glob is **non-recursive** — a test placed in a
subdirectory of `components/collabboard/` is **not** run. Per the standing
PATCH-114 ruling, a test file the runner does not execute satisfies no
test contract and constitutes a **false green**. `vitest.config.ts` is
**prohibited** from modification, so a new test must land in an
already-included location.

**At least one runner-included automated test is mandatory**, and it must
cover, at minimum:

- **T1** — with **no** chrome boundary supplied, rendered output is
  identical to today for both layers across idle, selected, line-mode and
  edit-mode states. This is the Freeform/Map protection (§7) and is the
  single most important test in this patch.
- **T2** — with a boundary supplied, the front layer is contained both
  visually and for pointer purposes, in all three promoted states.
- **T3** — the back layer's stacking is unchanged.
- **T4** — handles remain rendered and interactive within the visible
  area when a boundary is supplied.

---

## 5. Acceptance matrix (bind) — 21 rows

Every row must be asserted. Live rows require **full-page** screenshots
(PATCH-115 §18a: an element-scoped screenshot cannot show a defect that
consists of painting *outside* that element).

| # | Case | Assertion |
|---|---|---|
| 1 | Line not selected, sidebar closed | Renders normally to the true canvas edge |
| 2 | Line not selected, sidebar open | No ink past the boundary |
| 3 | Selected line, sidebar open | Handles interactive inside; **no ink past the boundary** |
| 4 | Line mode, sidebar open | As row 3 |
| 5 | Edit mode, sidebar open | As row 3 |
| 6 | Front layer | Correct band; contained |
| 7 | Back layer | Behind canvas content; contained; stacking unchanged |
| 8 | Modal open | No ink over the modal or its backdrop |
| 9 | **Apply-layout button click** | Reaches the button, **never** a hit path |
| 10 | **Sidebar slide-card click** | Reaches the card |
| 11 | **Checkbox click** | Reaches the checkbox |
| 12 | **Overflow (⋮) menu click** | Reaches the menu trigger and its items |
| 13 | **No hit-path interception outside the visible canvas area** | `document.elementFromPoint` at sampled points across the chrome region never returns `data-line-role="hit-path"` |
| 14 | Handle dragging | Works, sidebar open and closed |
| 15 | Endpoint editing | Works, sidebar open and closed |
| 16 | Keyboard editing | Works, sidebar open and closed |
| 17 | Zoom controls, sidebar closed | Visible, clickable, **position unchanged from today** |
| 18 | Zoom controls, sidebar open | Fully visible and clickable, not occluded |
| 19 | Zoom controls after resize, and after open→close→open | Re-resolve correctly; no drift |
| 20 | PATCH-115 behavior unchanged | CanvasLine still renders in thumbnail and runtime fullscreen; invalidation still fires |
| 21 | `coord_space` unchanged | Still `'scene'` for every touched row; no preview- or chrome-driven geometry mutation |

**Rows 9–13 are the primary acceptance criteria.** This defect is
interaction-blocking; a purely visual gate would pass while clicks are
still swallowed. Row 13 must be a programmatic `elementFromPoint` sweep,
not a visual judgement.

**Live gate rules (unchanged, bind):** `PW_BASE_URL` set; `--no-deps`; no
`npm run build` while the dev server is live; health-probe **both** `/`
and `/auth`; storage state written outside the repo and deleted after;
credentials referenced only via `LIVE_ACCESS_EMAIL`/`LIVE_ACCESS_PASSWORD`
and never printed; `.env.local` never modified; all real board data
restored.

---

## 6. Validation gates (bind)

```
git diff --check
npx tsc --noEmit
npx vitest run                     # expect 55+ files; 592+ tests; zero failures
npx vitest run components/collabboard/SimpleLineRenderer.test.tsx
npx eslint <each touched file>
```

ESLint gate: **no candidate-introduced findings.** Pre-existing findings
in touched files are acceptable and **must not** be fixed here. Report
actual output, never a summary.

---

## 7. Freeform / Map ruling — EXPLICIT

**PATCH-115's structural exemption does NOT carry forward, and the
argument that justified it is unavailable here.**

Measured: `SimpleLineRenderer` is rendered at `CanvasClient.tsx:6324` and
`:7154`, **outside** the `isDrawingLayout` branch. Drawing-specific props
are passed conditionally (`excalidrawAPIRef={isDrawingLayout ? … :
undefined}`, `:6339-6340` and `:7170-7171`), but the **component itself
mounts for Freeform, Map, and every other layout.** PATCH-115 could argue
non-participation by construction because its files were unreachable from
those layouts; that is **false** for this patch. Freeform and Map execute
this exact code.

**Ruling — a two-stage gate. The exemption is NOT granted in advance.**

**Stage 1 — structural protection, mandatory and testable.** The
containment must be driven by a chrome boundary that is **absent** on
layouts with no fixed right-side chrome. The presentation sidebar lives in
`DrawingLayout`; Freeform and Map have no such element, so the boundary
resolves absent and §1.5 requires byte-identical behavior. **Test T1
(§4) must prove this** — with no boundary supplied, output identical to
today across both layers and all four modes. Without T1 passing, this
patch does not proceed to any Freeform/Map ruling at all.

**Stage 2 — fixture decision, deferred until Stage 1 evidence exists.**
`.env.local` defines no `PATCH114_LIVE_FREEFORM_CANVAS_ID`,
`PATCH114_LIVE_MAP_CANVAS_ID`, or PATCH-115/117 equivalents, and the
authenticated production account owns no accessible Freeform or Map
canvas. Creating, converting, or relabelling a production board to
manufacture a fixture remains **prohibited**. Therefore:

- **If real Freeform and Map fixtures become available**, live evidence is
  **required**: rows 1, 3, 6, 7, 14, 15, 16 of §5 on each layout.
- **If they remain unavailable**, the implementer must report that fact
  with evidence and **stop**. The CTO will then consider a **new, narrowly
  justified** unavailable-fixture ruling based on T1 plus the diff — it
  will not be granted automatically, it will not cite PATCH-115 as
  precedent, and it will be PATCH-117-specific.

**Neither layout may be recorded as PASS without live execution.**

---

## 8. Repository safety gates (bind)

**Before implementation:**

```
git status --porcelain            # expect exactly 5 entries
git status --porcelain | wc -l    # expect 5
```

The 5 are the §0e protected paths. Anything else — **hard stop**.

**After implementation, and again after any live run:**

```
git status --porcelain
git status --porcelain | wc -l    # expect 5 + touched allowlist files only
git diff --cached --name-only     # expect empty
```

**Blast-radius rule (standing, from PATCH-115 §21a).** Report the dirty
path count **and the full list** before and after every phase. Any delta
beyond the allowlist plus the 5 protected paths is a failure of the run
**regardless of its findings**.

**Prohibited operations:** `git clean` in any form · `git reset --hard` ·
`git stash` · worktree creation (requires separate authorization; if ever
granted, teardown must never be issued with a path that could resolve to
the main checkout) · recursive deletion outside a named generated
directory (`.next` only) · `npm run build` while the dev server is live ·
`npm ci`/`npm install`/dependency changes · `--fix` of any kind ·
modifying `.env.local` · committing, pushing, or staging.

Leave the implementation candidate **uncommitted**.

---

## 9. Roles (bind)

- **Author / governance owner:** Sonnet (CTO). Does not implement and does
  not review its own authored work.
- **Implementer:** Codex / GPT-5.5.
- **Independent reviewer:** DeepSeek V4 Pro (primary), or Kepler /
  Gemini 3.1 Pro. Must not be the implementer.

---

## 10. Bound implementation commit message

Used **verbatim** when — and only when — the CTO authorizes the commit
after independent review:

```
fix(canvas): contain the Drawing editor line overlay and zoom controls within the visible canvas area (PATCH-117)
```

---

## 11. Phase order

1. **Phase 1 (uncommitted):** implement §3, add §4 tests, run §6 gates,
   run §8 safety gates. Report actual output.
2. **Phase 2:** live acceptance matrix §5, including the row 9–13 pointer
   sweep and the §7 Stage 1/Stage 2 determination.
3. Independent review.
4. CTO closure ruling and commit authorization.

**Do not begin PATCH-118.** Do not touch PATCH-115's landed code beyond
what §3 authorizes.

---

## 12. Relationship to PATCH-115 and PATCH-118

**PATCH-115** is OPEN and BLOCKED; its implementation landed at
`215ea811869360f4f689745c84ece0abefe73110`. It closes only after
PATCH-117 **and** PATCH-118 land and the full workflow is re-verified
across six dimensions: presence · containment · completeness ·
interaction safety · layout stability · persistence after reload.
PATCH-117 supplies **interaction safety** and part of **containment**.

**PATCH-118** — slide membership, layout movement, persistence, and
thumbnail completeness — remains **RESERVED and UNAUTHORIZED**. It must
open with a characterization phase (PATCH-115 §21d: a harness result
contradicted source, and that must be resolved before any fix is
designed).

**PATCH-116** is **CANCELLED and retired**; its number is never reused.

---

## 13. Endpoint-handle live failure — focused ruling (2026-07-27, CTO)

Issued at governance HEAD `d192154dc617d86bcc51fec9b4fa3f77536adeb2`.
Diagnosis is authorized; **no implementation change is authorized yet.**

### 13a. Candidate scope check — PASS

`git status --porcelain` returns **9** entries: the 5 protected paths of
§0e plus 2 production and 2 test files. Production: 2 of a maximum 3 —
`ZoomControls.tsx` was **not** touched, exactly as §3 predicted (the call
site's `className` fully overrides the component default), so the
production cap is **2**. Test: 2 of 3 —
`components/collabboard/SimpleLineRenderer.test.tsx` (runner-included,
confirmed) and `e2e/characterization/drawing-overlay-containment.spec.ts`,
which lies inside the Playwright project `testDir: './e2e/characterization'`
(`playwright.config.ts:43`) and is therefore runner-included for its own
runner. **No allowlist violation.**

The implementation follows §2: one boundary computed once in
`DrawingLayout.tsx`, published as two CSS custom properties
(`--drawing-visible-canvas-right-inset`, `--drawing-zoom-controls-right`)
on the viewport element, consumed by both the zoom-control offset and the
line layer's `clipPath: inset(0 Npx 0 0)`. `reservedSidebarLeft` now reads
from the same derived value, so the pre-existing top-right cluster keeps
one shared definition rather than a competing one. That is the required
architecture.

### 13b. Classification: **A**, with **G** as the contributing factor.
**H is not excluded but is unlikely.** Production behavior is **not**
believed to have regressed.

The source fact that drives this, at `SimpleLineRenderer.tsx:875-877`:

```
{isEditMode && isSelected && (
  <>
    {line.points ? (
      … data-line-role="point-handle" …      // :889
      … data-line-role="midpoint-handle" …   // :915
    ) : (
      … start-handle / control-handle / end-handle …
    )}
```

**`point-handle` renders only when `line.points` is truthy.** A line
stored in the legacy three-parameter form — `start_x/y`, `control_x/y`,
`end_x/y` with **no** `points` array — renders
`start-handle` / `control-handle` / `end-handle` instead. It can never
produce a `point-handle`, in any mode, with or without this patch.

The spec waited 30 seconds for `[data-line-role="point-handle"]`. If the
temporary fixture was created as an ordinary quadratic line — which is
what the line tool produces, and what the user's real Arrow Post is — then
**the spec asserted a selector its own fixture cannot emit.** The wait
could only ever time out. That is a harness defect, not a product defect.

**Two further source facts narrow the alternatives:**

- **C is unlikely.** Double-clicking the hit path calls
  `handlePathDoubleClick` (`:759` → `:609-615`), which calls
  `onToggleEditMode(lineId)` directly. The transition exists and is wired.
- **D and E are unlikely, and for a reason worth stating.** `clip-path`
  removes nothing from the DOM, and Playwright's actionability/visibility
  check evaluates bounding box and CSS visibility — **it does not evaluate
  `clip-path`**. A handle that rendered but was clipped would therefore
  most likely have **satisfied** a default `waitForSelector`, not timed
  out. A 30-second timeout points at *absence from the DOM*, which is what
  a wrong selector produces and what clipping does not.

**This is a strong hypothesis, not a finding.** It is not bound as the
answer. The diagnosis must confirm it, and the confirming check is a
single step (§13c step 2).

### 13d. Scope ruling — conditional, decided in advance

So the outcome cannot be argued after the fact:

- **If the fixture's `points` is null/absent and `start-handle` was
  present in the DOM** → classification **A/G**, harness-only.
  **Spec-only correction authorized. No production change.** The spec must
  assert the role set the fixture actually emits — or create a
  multi-point line if `point-handle` is genuinely the intended target —
  and the **full 21-row matrix must rerun from the beginning**, not resume
  from the failure point.
- **If handles are absent from the DOM for a reason unrelated to the
  selector** → classification C or H. **Stop and return to the CTO.** No
  correction authorized without a fresh ruling.
- **If handles are present in the DOM but the new containment hides or
  blocks them** → classification E or F, a genuine candidate regression.
  **The narrowest correction inside the existing two production files is
  authorized**, subject to all four of: chrome containment preserved;
  pointer safety preserved; handle editing preserved; and the
  `elementFromPoint` chrome criterion (row 13) **not weakened** in any
  way. A third production file remains a hard stop.

**No governance amendment is required** for any of these paths — §3's
allowlist already covers the production case and §4's cap already covers
the spec case. An amendment becomes necessary only if a third production
file, a fourth test file, or a change to `vitest.config.ts` or
`playwright.config.ts` is proposed.

### 13c. Required diagnosis (bind) — read-only

Do **not** increase any timeout before the failed state transition is
located. Do **not** mutate the user's real Arrow Post.

1. Recreate the temporary line on the temporary Drawing fixture. Record
   its exact `data-line-id`, and assert the hit-path selector count for
   that id is exactly **1**.
2. **Decisive step — run this first.** Read the fixture row's `points`
   field (null/absent vs array) and, immediately after the double-click,
   dump **every** `data-line-role` value present in the DOM for that
   `data-line-id`. If `points` is null and `start-handle` /
   `control-handle` / `end-handle` are present while `point-handle` is
   absent, classification **A/G** is confirmed and steps 6–8 are
   unnecessary.
3. Record `selectedLineId` and `isEditMode` before any interaction.
4. Single-click; record both again.
5. Double-click; record click target, event count, `selectedLineId`,
   `isEditMode`, and the count of **each** handle role.
6. If no handle role appears at all: determine whether the handles are
   absent from the DOM or present-but-clipped.
7. If present-but-clipped: neutralize **only** the new containment by
   read-only DOM styling (`clipPath: none` on the layer). Handles appear →
   candidate regression (E/F). Handles still absent → harness or
   pre-existing (A/C/G).
8. Compare against `main` without the candidate **without disturbing it**
   — a second checkout on a non-3000 port, or read-only source comparison.
   **No worktree may be created** (§8); if one is judged necessary, stop
   and request authorization. Teardown must never be issued with a path
   that could resolve to the main checkout.
9. Report `git status --porcelain` **count and full list** before and
   after. Expect **9** entries throughout. Any delta is a run failure
   regardless of findings.

### 13e. Freeform / Map — unchanged

Fixtures remain unavailable. **Neither is PASS.** The §7 Stage 2
unavailable-fixture ruling is **not granted** and will not be considered
until the Drawing 21-row matrix completes end to end.

### 13f. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed;
candidate not committed. Phase 1 static validation is accepted as reported
(tsc clean, 55 files / 605 tests, focused 20, zero candidate-introduced
ESLint findings); Phase 2 is **incomplete** — rows 14–21 did not run.

**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 14. §13 post-diagnosis correction ruling (2026-07-27, CTO)

Issued at governance HEAD `3a41634db6c3fe4ebe61bfdd26bb9d67524c6e7a`.
Candidate verified unchanged: **9** worktree entries, uncommitted,
unstaged, no production file touched during diagnosis.

### 14a. Classification G — ACCEPTED

**G — live-spec interaction/targeting issue. No production regression.**

The evidence is complete and settles it. On the temporary fixture the
double-click **did** enter edit mode and the handles **did** render:
`hit-path` 1, `visible-path` 1, `label-handle` 1, `point-handle` **2**,
`midpoint-handle` 1 — with `display:inline`, `visibility:visible`,
`opacity:1`, `pointer-events:auto`, and topmost at their centre points.
The clip path was **active** throughout, and read-only
`clipPath: none` neutralization changed nothing relevant.

That last fact is the load-bearing one: it is a controlled substitution
test, and it independently clears the candidate. **Containment is correct
and handle editing is intact.**

### 14b. Correction to §13b — my hypothesis was falsified on the fact

§13b predicted the fixture's `points` would be **null**, making
`point-handle` unrenderable and the selector unsatisfiable. **The fixture's
`points` is an array, and two `point-handle` circles rendered.** The
selector was correct; the failure was targeting, not selection.

What did hold: `clip-path` was correctly excluded as the cause (D/E), on
the stated reasoning that it removes nothing from the DOM and Playwright's
visibility check does not evaluate it; and C was correctly excluded, since
the double-click path does reach `onToggleEditMode`. The classification
landed in the right family — harness, not product — but the mechanism I
named was wrong, and §13b was explicit that it was a hypothesis requiring
step 2 to confirm. Step 2 refuted it, which is what that step existed to
do.

The `line.points` branch at `SimpleLineRenderer.tsx:875-877` remains real
and is still worth defending against — hence requirement 6 below survives
into the correction even though this fixture takes the array branch.

### 14c. Spec-only correction — AUTHORIZED

**Exactly one file may change:**

```
e2e/characterization/drawing-overlay-containment.spec.ts
```

**No production file may change.** `SimpleLineRenderer.tsx` and
`DrawingLayout.tsx` are **frozen** for this correction — their current
candidate hunks are validated and must be preserved byte-for-byte.
`SimpleLineRenderer.test.tsx` is likewise frozen; its 20 focused tests
must continue to pass untouched.

The corrected spec must:

1. Target the temporary line by its exact `data-line-id`.
2. Assert its hit-path count is exactly **1** before interacting.
3. Single-click, then **verify selection** before proceeding.
4. Double-click at a point **proven to be inside that exact hit path** —
   the targeting failure is the root cause, so this step must verify the
   click coordinate hits the intended element (e.g. via
   `elementFromPoint` at the chosen coordinate) rather than assume it.
5. Wait for **edit-mode evidence**, not for a handle. Edit mode is the
   state transition; handles are its consequence. Waiting on the
   consequence is what turned a targeting miss into an opaque 30-second
   timeout.
6. **Branch handle expectations by fixture shape**, read from the row, not
   guessed: `points` array ⇒ expect `point-handle` **and**
   `midpoint-handle`; `points` null/absent ⇒ expect `start-handle`,
   `control-handle` **and** `end-handle`.
7. **Never** wait generically for `point-handle` without first reading
   `points`.
8. Use no broad or positional selectors — every assertion scoped by
   `data-line-id` and `data-line-role`.
9. **Preserve every existing containment and `elementFromPoint`
   assertion unchanged.** Row 13's chrome sweep is the patch's primary
   criterion and may not be weakened, narrowed, or made conditional.
10. Support rerunning the **complete 21-row matrix from row 1**, not
    resuming at the failure point.

**Do not increase any timeout** unless a specific remaining wait is proven
necessary, and then only that wait, with the reason reported. The previous
failure was a masked targeting bug; a longer timeout would have hidden it
for longer, not fixed it.

### 14d. No governance amendment required

The correction stays inside §4's test allowlist (2 of 3 files used, and
this changes one that already exists). Production remains at **2 of 3**
files — `ZoomControls.tsx` still untouched. Nothing in §3, §4, §5, §7 or
§8 needs amending. An amendment becomes necessary only if a third
production file, a fourth test file, or a change to `vitest.config.ts` or
`playwright.config.ts` is proposed.

### 14e. Static validation (bind)

```
git diff --check
npx tsc --noEmit
npx vitest run                                                   # expect 55 files / 605 tests
npx vitest run components/collabboard/SimpleLineRenderer.test.tsx # expect 20
npx playwright test --list e2e/characterization/drawing-overlay-containment.spec.ts
npx eslint <each touched file>                                   # no candidate-introduced findings
```

Plus a diff-scope proof: `git diff --stat` must show
`SimpleLineRenderer.tsx` and `DrawingLayout.tsx` **byte-identical to their
pre-correction candidate state**, and `git status --porcelain | wc -l`
must remain **9**.

### 14f. Live requirement — full 21-row matrix from row 1

Rows 14–21 alone are **not** sufficient. The earlier run's passing rows
were observed under a spec that has since changed; re-running only the
tail would certify rows 1–13 on the strength of a superseded artifact.

All primary rows re-asserted: Apply-layout click · slide-card click ·
checkbox click · overflow-menu click · `elementFromPoint` chrome sweep ·
endpoint handle editing · whole-line drag · keyboard editing · zoom
controls with sidebar closed, open, and after resize · the PATCH-115
thumbnail and runtime-fullscreen regression check · stored geometry and
`coord_space` unchanged.

Standing live rules unchanged: `PW_BASE_URL` set; `--no-deps`; no build
while the dev server is live; probe **both** `/` and `/auth`; full-page
screenshots; scratch state outside the repo; credentials never printed;
`.env.local` untouched; real board data restored; **no worktree creation**;
and `git status --porcelain` count **and full list** reported before and
after — expect **9** throughout, any delta being a run failure regardless
of findings.

### 14g. Freeform / Map — Stage 2 still NOT granted

Unchanged. Neither is PASS. If and when the Drawing matrix passes **in
full**, report fixture availability for Freeform and Map and **stop** —
the Stage 2 decision is a fresh CTO ruling and may not be assumed,
inferred, or taken from PATCH-115.

### 14h. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
Production candidate frozen at 2 files; spec-only correction authorized.
Phase 2 incomplete until the full 21-row matrix passes.

**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 15. Row 3 selection-proof failure — focused ruling (2026-07-27, CTO)

Issued at governance HEAD `bdfbd01e4d38fafc7b8fd79273d3d28620ce9a5e`.
Candidate verified: **9** dirty paths, 2 production + 2 test files,
uncommitted, unstaged, production hashes frozen and unchanged.

### 15a. Classification: **B** — the line selected; the DOM proof was wrong

Source settles this without needing the live probes. The observed log
`line-drag-start:drag-branch` is emitted at
`SimpleLineRenderer.tsx:373-376`. Seven lines later, with **no early
return, no branch, and no await between them**:

```
:370  e.preventDefault();
:371  e.stopPropagation();
:373  logLineEventDiagnostics('line-drag-start:drag-branch', …);   ← observed
:377  const pos = getMousePos(e);
:378  dragOffsetRef.current = { x: pos.x, y: pos.y };
:379  setDraggingLine({ lineId });
:380  onSelectLine(lineId);                                        ← selection fires
```

**The diagnostic the run captured is itself proof that `onSelectLine` was
called.** Reaching `:373` and not reaching `:380` is not a reachable
state.

**Exact event where selection becomes true: `mousedown`**, synchronously
inside `handleLineDragStart`'s drag branch, propagated to the parent's
`selectedLineId` and re-rendered on the next React commit. Not click, not
drag-end, not mouseup.

Note also `:370-371`: the handler calls `preventDefault()` **and**
`stopPropagation()`. `preventDefault()` on mousedown suppresses the
subsequent synthetic `click`, so a spec that waits for click-derived
evidence after a real mousedown is waiting for something the product
deliberately suppresses. Selection is a **mousedown-time** fact.

**A, C, D, E and F are excluded:** A and D are refuted by `:380` being
unconditionally reached from the observed log; C is refuted because the
call is synchronous and the run waited far longer than one commit; E is
refuted because the hit path demonstrably received the interaction; F is
refuted below.

### 15b. Root cause: there is no `data-*` attribute that represents
selection

This is the finding that matters, and it is a real gap in the DOM
contract — not a spec author's oversight.

Every selection-dependent DOM change in `SimpleLineRenderer.tsx`:

| Signal | Location | Usable as a proof? |
|---|---|---|
| Dashed selection `<rect>` | `:731-746` | **No** — carries **no `data-line-id` and no `data-line-role`**; reachable only positionally inside `<g key={hit-…}>`, which §14c requirement 8 prohibits. Also renders only when `!isEditMode`. |
| `filter: drop-shadow(…)` on the visible path | `:815` | **YES** — on an element carrying both `data-line-id` and `data-line-role="visible-path"` (`:804-806`) |
| `cursor` on the hit path | `:755` | **No** — `(isEditMode && isSelected) ? 'cell' : (isEditMode ? 'default' : 'move')`. Outside edit mode the value is `move` **whether or not the line is selected**, so it carries no selection information in the state row 3 tests. |
| Label border colour | `:851` | **No** — requires the line to have a label; not present on a bare fixture. |

**Authoritative selection signal (bind):**

```
[data-line-id="<id>"][data-line-role="visible-path"]
→ computed style `filter` contains "drop-shadow"   when selected
→ computed style `filter` === "none"               when not selected
```

**One trap that must be handled.** That element carries
`className="transition-all duration-200"` (`:813`). The filter **animates
over 200 ms**, so a single computed-style read taken immediately after
mousedown can catch an intermediate or still-`none` value. The spec must
**poll** until the computed filter contains `drop-shadow`, with a short
bounded wait — not assert once, and not extend the global timeout.

### 15c. Containment does not participate in selection; no regression

**Containment affects selection: NO. Production regressed: NO.**

Already proven by evidence in hand, before any comparison run: the clip
path governs paint and hit-testing only, and **the hit path demonstrably
received the interaction** — the `line-drag-start:drag-branch` log cannot
be emitted otherwise. The candidate's production diff touches only the
SVG container's `clipPath` and a `data-line-containment` marker; nothing
on the selection path, the mousedown handler, or the `visible-path`
element.

The §15d step-6 controlled comparison remains **required but
confirmatory**. If — contrary to source — selection behaves differently
with the clip path neutralized, that is classification **F**: stop
immediately and return for a production correction ruling. Chrome
containment and row 13 may not be weakened in any circumstance.

### 15d. Required diagnosis (bind) — read-only, one disposable fixture

Source has already answered the classification; these steps exist to
**confirm on the live surface** and to hand the spec author a measured
signal rather than an inferred one. Keep it short.

Every probe uses a **short bounded wait (≤ 2 s)** and dumps state
immediately on failure. **Do not wait four minutes. Do not raise any
timeout.**

1. Record before interaction: temporary line id; hit-path count (expect
   1); `selectedLineId`; and the computed `filter` on that line's
   `visible-path`.
2. **pointerdown without movement** → record `selectedLineId`, the
   `visible-path` computed `filter`, emitted diagnostics, role counts,
   and whether drag state is active.
3. **mouseup** → record the same set.
4. **click** (full down/up) → record the same set.
5. **Minimal 1–2 px drag** → record the same set, and whether stored
   geometry changed (it must be restored afterwards).
6. **Controlled comparison:** repeat step 2 with the line-layer clip path
   neutralized by read-only DOM styling (`clipPath: none`). Unchanged ⇒
   containment excluded, proceed. Selection works **only** with
   containment disabled ⇒ **classification F, stop and report.**
7. Report the **first** event at which `selectedLineId` changes, and the
   settling time of the `drop-shadow` filter after that event.

`force: true` clicking is permitted **as diagnosis only** and must never
appear in the corrected spec — it masks targeting defects, which is the
failure mode §14 already corrected once. **No worktree, no second
checkout.** Do not mutate the real Arrow Post. Report
`git status --porcelain` count **and full list** before and after; expect
**9** throughout.

### 15e. Ruling path — decided in advance

- **Expected (B confirmed):** **spec-only correction authorized**, in
  `e2e/characterization/drawing-overlay-containment.spec.ts` and nothing
  else. The spec must wait on the **direct signal of §15b** — the
  `visible-path` computed `filter`, polled — and **inferred visual
  selectors are prohibited**: no anonymous `<rect>`, no positional or
  nth-child lookup, no screenshot comparison, no cursor check.
- **If selection proves to require mouseup or a small drag:** spec-only
  **interaction** correction authorized, matching the real product
  sequence. **Directly mutating application state to fake selection is
  prohibited** — a spec that sets `selectedLineId` itself proves nothing
  about the product.
- **If containment changes selection (F):** stop. Production correction
  ruling required from the CTO. Do not weaken containment or row 13.
- **If the fixture itself is invalid:** narrowest fixture correction only;
  no production change.

**No governance amendment is required** on any path. Production stays at
**2 of 3** files; the test allowlist stays at **2 of 3**, and the
correction modifies a file that already exists. An amendment becomes
necessary only for a third production file, a fourth test file, or a
change to `vitest.config.ts` or `playwright.config.ts`.

### 15f. Recommended follow-up — NOT authorized here

The absence of any `data-*` selection attribute is a genuine testability
gap: it forces every automated proof of CanvasLine selection onto a CSS
filter, which is brittle and will break on any styling change. A
`data-line-selected` attribute on the `visible-path` element would fix
this permanently.

**I am not authorizing it.** §14c froze the production candidate, the
current defect is correctable in the spec alone, and adding a production
change to a patch mid-live-run is exactly the scope drift this model
exists to prevent. It is recorded as a candidate for a later patch — not
PATCH-117, and not PATCH-118 unless that patch's own characterization
independently needs it.

### 15g. Certification status of the earlier rows

**None of rows 1, 2, 4, 8–13, 17 or 18 may be certified** from the
incomplete run, and this is now the second incomplete matrix. The full
21-row matrix must run **from row 1** after the correction, per §14f. No
row carries forward from any superseded artifact.

### 15h. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
Production candidate frozen at 2 files and unchanged by this ruling.
Phase 2 incomplete.

**Freeform/Map: Stage 2 NOT granted**; neither is PASS; not considered
until the Drawing matrix passes in full.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 16. Final spec-only correction ruling (2026-07-27, CTO)

Issued at governance HEAD `1bc148376df9699d4c97731048b995bfbd42cf0f`.
Candidate verified unchanged: **9** dirty paths, uncommitted, unstaged,
production and unit-test hashes unaltered, no file touched during
diagnosis.

### 16a. Classification B — ACCEPTED

Selection becomes true on **mousedown** from the exact temporary line's
hit path, exactly as §15a derived from source. The diagnosis confirms it
on the live surface and adds the measurement the spec needs:

| interaction | filter settling |
|---|---|
| pointerdown | 1 ms |
| normal click | 7 ms |
| minimal drag | 1 ms |
| `clipPath: none` comparison | 1 ms |

Hit-path count 1; `elementFromPoint` resolved the intended element; no
`force: true` used; geometry restored exactly after the drag probe;
`coord_space` remained `'scene'`; the real Arrow Post untouched.

**Containment does not affect selection. No production regression
exists.** The `clipPath: none` comparison returning an identical 1 ms
settling time closes classification **F** by measurement, not inference —
the §15c source argument and the live result agree.

### 16b. Spec-only correction — AUTHORIZED

**Exactly one file may change:**

```
e2e/characterization/drawing-overlay-containment.spec.ts
```

**No production file and no unit-test file may change.**
`SimpleLineRenderer.tsx` and `DrawingLayout.tsx` remain frozen
byte-for-byte at their validated candidate state, as does
`SimpleLineRenderer.test.tsx` with its 20 passing focused tests. The
production cap stands at **2 of 3** — `ZoomControls.tsx` still untouched.

The corrected selection proof must:

1. Target the temporary line by its exact `data-line-id`.
2. Assert that line's hit-path count is exactly **1** before interacting.
3. Prove the chosen coordinate resolves through `elementFromPoint` to that
   exact hit path — **before** dispatching the interaction, not after.
4. Use normal pointer interaction. **No `force: true`.**
5. Poll the computed `filter` on
   `[data-line-id="<id>"][data-line-role="visible-path"]`.
6. Require that value to **contain `drop-shadow`**. Assert the
   pre-interaction value is `none` first, so the proof is a transition and
   not a pre-existing state.
7. Use the §16c bounded wait.
8. Use **none** of: anonymous selection rectangles · positional selectors
   · `nth-child` · cursor style · screenshot comparison · direct
   application-state mutation · `force: true`.
9. Preserve row 13's `elementFromPoint` chrome sweep **unchanged** — not
   weakened, narrowed, reordered, or made conditional.
10. Preserve every existing containment assertion unchanged.

### 16c. Bounded wait rule (bind)

**Poll interval ≤ 50 ms. Overall bound 2000 ms. Do not raise either.**

2000 ms is ~285× the measured worst case (7 ms) — ample for machine and CI
variance, and still short enough that a genuine defect surfaces in
seconds rather than after a four-minute stall. The element carries
`transition-all duration-200` (`SimpleLineRenderer.tsx:813`), so 2000 ms
also clears the full transition window ten times over.

Raising this bound requires a fresh CTO ruling. A longer timeout has
never once been the fix in this patch — it was the thing that hid the
defect in §13 and again in §15.

**Failure must be diagnostic (bind).** On timeout the spec must dump, at
minimum: the observed computed `filter` value, the hit-path count for that
`data-line-id`, the element returned by `elementFromPoint` at the chosen
coordinate, and every `data-line-role` present for that line. Two full
cycles have now been spent because a bare timeout reported nothing about
the state it timed out in. A third is not acceptable, and this
requirement is what prevents it.

### 16d. No governance amendment required

Production stays at 2 of 3 files; the test allowlist stays at 2 of 3, and
this correction modifies a file that already exists. Nothing in §3, §4,
§5, §7 or §8 needs amending. An amendment becomes necessary only for a
third production file, a fourth test file, or a change to
`vitest.config.ts` or `playwright.config.ts`.

### 16e. Post-correction requirements

**Static validation:**

```
git diff --check
npx tsc --noEmit
npx vitest run                                                    # 55 files / 605 tests
npx vitest run components/collabboard/SimpleLineRenderer.test.tsx  # 20
npx playwright test --list e2e/characterization/drawing-overlay-containment.spec.ts
npx eslint <each touched file>                                    # no candidate-introduced findings
```

Plus a scope proof: `git diff --stat` must show `SimpleLineRenderer.tsx`,
`DrawingLayout.tsx` and `SimpleLineRenderer.test.tsx` **byte-identical**
to their pre-correction state, and `git status --porcelain | wc -l` must
remain **9**.

**Live: the full 21-row Drawing matrix, from row 1.** No row may be
carried forward from either incomplete run — every earlier passing row was
observed under a spec that has since changed twice. Standing live rules
unchanged: `PW_BASE_URL` set; `--no-deps`; no build while the dev server
is live; probe **both** `/` and `/auth`; full-page screenshots; scratch
outside the repo; credentials never printed; `.env.local` untouched; real
board data restored; **no worktree or second checkout**; `git status
--porcelain` count **and full list** before and after, expecting **9**
throughout — any delta is a run failure regardless of findings.

### 16f. Freeform / Map — check only after Drawing completes

**Stage 2 remains NOT granted.** Neither layout is PASS. Only if the
Drawing matrix passes **in full** does the implementer report Freeform and
Map fixture availability and **stop**. The Stage 2 decision is a fresh CTO
ruling; it may not be assumed, inferred, or inherited from PATCH-115.

### 16g. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed; the
candidate is not to be committed. Production frozen at 2 files.

**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 17. Row 5/14 handle-topmost failure — focused ruling (2026-07-27, CTO)

Issued at governance HEAD `2cc3c6d7d31ea979f6e67ca3983fa1a98ca651bb`.
Candidate verified: **9** dirty paths, 2 production + 2 test files,
uncommitted, unstaged, frozen hashes unchanged.

### 17a. What this section can and cannot answer

The requested return list includes the element at the handle centre, the
full `elementsFromPoint` stack, the nearest line-owned ancestor, whether
pointerdown reaches the handle, whether the drag succeeds, and the
geometry before and after. **Those are outputs of the diagnosis, which is
not yet run and which the CTO does not execute.** They will come from the
§17d run. Stating them now would be fabrication.

What this section decides definitively is the **topmost criterion**
(§17e), which is the part that does not depend on the diagnosis outcome.

### 17b. Leading classification: **H**, with **A** as the most likely
mechanism. Provisional — the diagnosis decides.

§13b is the reason this is labelled provisional rather than bound: a
confident source-derived mechanism was falsified there. The classification
is not bound until §17d confirms it.

**Excluded by source, with evidence:**

- **The label `<foreignObject>` is not the blocker.** It carries
  `pointerEvents: 'none'` (`SimpleLineRenderer.tsx:828-829`), and its
  wrapper `<div className="group relative">` sets no `pointer-events`, so
  it inherits `none`. Only the inner label div re-enables
  `pointerEvents: 'auto'` (`:852`). `document.elementFromPoint` skips
  non-hit-testable elements, so neither the `foreignObject` nor its
  wrapper can be returned. This rules out the most obvious form of **E**.
- **F is unlikely.** The report states the handle was **visible**, so it
  lies inside the clip region. `clip-path` cannot remove hit-testing from
  geometry it is not clipping. §16a already closed F by measurement on the
  selection path; §17d step 2 re-tests it on the handle path.
- **G is unlikely.** Every handle sets `pointerEvents: 'auto'` explicitly
  (`:890`, `:917`, `:930-932`).

**Material finding — the Drawing surface routes line pointer events
through a bridge.** `DrawingLayout.tsx:3033-3041` is the layout's **root
container** — `className="flex-1 w-full h-full absolute inset-0
bg-transparent"` — carrying `onPointerDownCapture`,
`onMouseDownCapture`, `onClickCapture`, `onDoubleClickCapture` and
`onContextMenuCapture`. It resolves an interactive line target and
re-dispatches to it, with a documented role priority in
`lib/infra/drawing/lineBridge.ts:4-12`:
`point-handle → midpoint-handle → start-handle → control-handle →
end-handle → label-handle → hit-path`.

Two consequences that matter for the ruling:

1. It is an **ancestor with capture-phase handlers**, not an element
   stacked above the handles. So it should not itself be returned by
   `elementFromPoint` while a hit-testable descendant exists — and a
   returned node's `closest('[data-line-id]')` chain is therefore
   meaningful rather than coincidental.
2. **Handle interaction on Drawing does not require the handle to be the
   `elementFromPoint` result.** The bridge exists precisely to resolve a
   target that the raw hit test does not return directly
   (`resolveBackLineContextMenuDispatchTarget`, `:2853-2867`, explicitly
   redirects `point-handle`/`midpoint-handle` hits to the same line's
   `hit-path`). A spec asserting raw-topmost identity is modelling a
   dispatch path this product deliberately does not use.

That is why **H** leads: the criterion encodes an assumption the
architecture contradicts. **A** is the most likely concrete mechanism —
`elementFromPoint` returning a node whose `closest('[data-line-id]')` is
the correct handle — and the §17d point-stack dump settles it in one step.

### 17c. Topmost criterion — RULING (binding, independent of §17d)

The current criterion — *the exact `elementFromPoint` node must carry
`data-line-id` equal to the temporary line* — is **rejected as an
acceptance criterion for handle interaction.** It is a proxy for
interactability, and on this surface the proxy is wrong: the line bridge
makes raw-topmost identity neither necessary nor sufficient for a handle
to work.

**Replacement criterion (bind). All three parts required:**

1. **Ownership** — the node returned by `document.elementFromPoint` at the
   handle centre, **or its nearest ancestor carrying `data-line-id`**,
   must be the exact temporary line, and the resolved
   `data-line-role` must be the expected handle role.
2. **Behavior** — a **real, normal pointer drag** (no `force: true`) on
   that handle must change the **intended** geometry: the targeted
   endpoint or point moves, and the line as a whole does not translate
   instead. Geometry is recorded before and after and restored.
3. **Non-interception guard** — the `elementsFromPoint` stack at the
   handle centre must contain **no fixed application chrome** above the
   line layer: no presentation sidebar, no modal, no backdrop, no zoom
   controls. This is what preserves the protection the original criterion
   was reaching for.

Part 2 is the substantive test. Part 1 without part 2 proves only DOM
shape; part 2 without part 3 could pass while chrome overlays the handle
in some other state.

**Row 13 is untouched and stays strict.** Its assertion is **negative** —
that no CanvasLine hit path appears anywhere in the fixed-chrome region —
and negative assertions are unaffected by bridge indirection: an ancestor
that re-dispatches cannot make a line element absent from a region where
it is present. Row 13 must **not** adopt ancestor resolution, must not be
narrowed, reordered, or made conditional. **This ruling relaxes the
handle-interaction criterion only.**

### 17d. Required diagnosis (bind) — read-only, one disposable fixture

No source edit, no spec edit. No `force: true`. No worktree or second
checkout. Do not mutate the real Arrow Post. Bounded waits per §16c —
**do not raise any timeout.**

Enter edit mode using the §16 proven selection signal, then:

1. **Handle census.** For every handle of the exact temporary line record:
   `data-line-role`, tag name, `outerHTML` summary, bounding rect,
   computed transform, `pointer-events`, `visibility`, `opacity`,
   `clip-path`, and centre coordinate.
2. **Point stacks.** At the centre and at several points inside the handle
   radius record: `document.elementFromPoint`; the full
   `document.elementsFromPoint` stack; tag name; `data-line-id`;
   `data-line-role`; nearest ancestor with `data-line-id`; nearest
   ancestor with `data-line-role`.
3. **Real interaction.** Normal pointerdown then a minimal drag on the
   exact handle. Record whether the handle's handler fires (its
   diagnostics), geometry before and after, whether the **intended**
   point moved, whether the **line** moved instead, and whether another
   element received the event. Restore geometry exactly.
4. **Controlled comparison.** Repeat steps 2 and 3 with **only** the
   candidate line-layer `clipPath` neutralized by read-only DOM styling.

**Interpretation, decided in advance:**

- Same stack **and** drag succeeds ⇒ **H/A confirmed. Spec-only
  correction authorized** to the §17c criterion.
- Drag succeeds **only** with `clipPath: none` ⇒ **F, production
  regression.** Stop and return for a narrow production ruling. Do not
  weaken containment or row 13.
- Drag never succeeds and a non-line element is above ⇒ identify the exact
  blocker and stop.
- Event reaches the handle but geometry does not change ⇒ handler/state
  failure; identify it and stop.

Report `git status --porcelain` count **and full list** before and after —
expect **9** throughout; any delta is a run failure regardless of
findings.

### 17e. Correction scope and amendment

**Expected path (H/A): spec-only**, in
`e2e/characterization/drawing-overlay-containment.spec.ts` and nothing
else. `SimpleLineRenderer.tsx`, `DrawingLayout.tsx` and
`SimpleLineRenderer.test.tsx` remain **frozen byte-for-byte**. Production
stays at **2 of 3**.

**A governance amendment IS required** on this path — but only to §5, and
only for the criterion text: **rows 5 and 14 must be rebound to the §17c
three-part criterion.** That amendment is issued in this section: §17c is
the bound text and supersedes any earlier reading of rows 5 and 14 that
required raw-topmost identity. No allowlist, cap, or file-scope amendment
is needed, and §3, §4, §7 and §8 are unchanged.

If the diagnosis returns **F**, no correction is authorized and a fresh
production ruling is required.

### 17f. Certification status

**No row may be certified from this run.** This is the third incomplete
matrix. The rows reported passing before the hard stop were observed under
a criterion that §17c now supersedes, so they must be re-observed under
the corrected spec. The full 21-row matrix runs **from row 1** after the
correction.

### 17g. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed;
candidate not to be committed. Production frozen at 2 files.
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 18. Post-§17 correction ruling (2026-07-27, CTO)

Issued at governance HEAD `5b1f5cc7cf2c1b99a291db10e07db6451e3152c7`.
Candidate verified: **9** dirty paths, uncommitted, unstaged, production
and unit-test hashes unchanged, nothing edited during diagnosis.

### 18a. Classification H — ACCEPTED

The handle is a `<circle>` carrying `data-line-role="point-handle"` and
the exact `data-line-id`, `pointer-events: auto`, visible, opaque, and
topmost at its centre and four further sampled points. The
`elementsFromPoint` stack held the handle, the same line's hit path, and
Excalidraw/layout containers — **no fixed chrome above the line-owned
target**.

A real drag moved the **targeted endpoint** `(1160, 300) → (1136, 312)`
without translating the whole line, and persisted to the disposable row.
The `clipPath: none` comparison produced the same result on every count.

**Containment does not impair handle interaction. No production
regression. No production correction authorized.**

### 18b. Residual: the diagnosis did not reproduce the original failure

**This must be recorded rather than glossed.** The matrix run reported
`elementFromPoint` returning a node with `data-line-id: null`; the
diagnosis found the handle **topmost at five sampled points**. Those two
observations do not agree, and the discrepancy is unexplained.

It does not block the correction — the §17c criterion is right on the
merits, and part 2 (behavior) is substantive rather than a proxy. But it
means a recurrence is possible from whatever the matrix did differently:
a coordinate derived from a stale bounding rect, a different handle role,
or a transient state between edit-mode entry and the probe.

**Therefore the corrected spec must record, for rows 5 and 14, how the
handle coordinate was derived** — the chosen handle's `data-line-role`,
its bounding rect at the moment of sampling, the computed centre, and
whether the rect was re-read immediately before the probe. Combined with
the §16c diagnostic-failure dump, a recurrence will then be diagnosable in
one run instead of costing another cycle. Three cycles have already been
spent on opaque live failures; this is the mechanism that stops a fourth.

### 18c. Spec-only correction — AUTHORIZED

**Exactly one file may change:**

```
e2e/characterization/drawing-overlay-containment.spec.ts
```

**No production file and no unit-test file may change.**
`SimpleLineRenderer.tsx`, `DrawingLayout.tsx` and
`SimpleLineRenderer.test.tsx` remain **frozen byte-for-byte**; the 20
focused tests must continue to pass untouched. Production stays at **2 of
3** — `ZoomControls.tsx` still not needed.

Rows 5 and 14 adopt the §17c three-part criterion, all parts required:

**1. Ownership.** At the chosen handle coordinate, the
`document.elementFromPoint` result **or its nearest `[data-line-id]`
ancestor** must be the exact temporary line, and the resolved
`data-line-role` must be the expected handle role. **The raw returned node
is not required to carry `data-line-id`.**

**2. Behavior.** A real, normal pointer drag — **no `force: true`** —
must produce: the intended point/endpoint changes; the whole line does
**not** translate; the persisted disposable row reflects the intended
change; geometry restored afterward where cleanup requires it.

**3. Non-interception.** `document.elementsFromPoint` at the handle
coordinate must contain no fixed chrome above the line-owned target.

Plus the §18b derivation record.

### 18d. Fixed chrome — binding definition, plus checklist

**The binding rule is property-based, not a selector list.** In the
`elementsFromPoint` stack, treat as fixed chrome any entry that is **not**
line-owned (no `data-line-id` on itself or an ancestor within the line
layer) **and** satisfies either:

- computed `position: fixed`; or
- a computed `z-index` ≥ the front line layer's active value (`1000` when
  selected / line mode / edit mode, else `10`).

A property rule is bound rather than a class list because Tailwind class
strings change under refactors and a stale selector list fails **open** —
it silently stops detecting the very interception the row exists to catch.

**Known Drawing chrome, as a cross-check (measured, current tree).** If
any of these appears above a line-owned target the row fails; if the
property rule ever matches something absent from this list, report it:

| Element | Anchor |
|---|---|
| Presentation sidebar | `DrawingLayout.tsx:3305` — `fixed top-0 right-0 bottom-0 w-80 z-[500]`, `ref={presentationSidebarRef}` |
| Modal | `:3065` — `fixed inset-0 z-[10010] … bg-black/50` |
| Modal backdrop | `:3340` — `fixed inset-0 z-[9998]` |
| Zoom controls | `:3112` — `absolute bottom-6 right-[var(--drawing-zoom-controls-right,1.5rem)] z-[130]` |
| Top floating toolbar | `:2983` — `absolute top-4 z-[130] pointer-events-none` |
| Slide controls | inside the sidebar subtree (`PresentationPanel`) — covered by the sidebar entry |

Note the floating toolbar is `pointer-events-none` at its container, so it
will not normally appear in an `elementsFromPoint` stack; it is listed
because its **children** may re-enable pointer events.

### 18e. Row 13 unchanged

Row 13 remains the **strict negative** chrome-region sweep: no CanvasLine
hit path anywhere in the fixed-chrome region. It **must not** adopt
ancestor resolution, must not be narrowed, reordered, or made conditional.
The §17c relaxation applies to the handle-interaction rows **only** —
negative assertions are immune to bridge indirection, so nothing about
this diagnosis justifies loosening them.

### 18f. No further governance amendment

None beyond the §17 rebinding of rows 5 and 14, which §17c already
issued and this section restates. §3, §4, §7 and §8 are unchanged;
production remains 2 of 3 and the test allowlist 2 of 3, with the
correction editing a file that already exists.

### 18g. Post-correction requirements

**Static:**

```
git diff --check
npx tsc --noEmit
npx vitest run                                                    # 55 files / 605 tests
npx vitest run components/collabboard/SimpleLineRenderer.test.tsx  # 20
npx playwright test --list e2e/characterization/drawing-overlay-containment.spec.ts
npx eslint <touched file>                                         # no candidate-introduced findings
```

Scope proof: `git diff --stat` shows the three frozen files
**byte-identical**; `git status --porcelain | wc -l` remains **9**.

**Live: the full 21-row Drawing matrix from row 1.** **No evidence carries
forward** from any of the three incomplete runs. Standing rules unchanged:
`PW_BASE_URL` set; `--no-deps`; no build while the dev server is live;
probe **both** `/` and `/auth`; full-page screenshots; scratch outside the
repo; credentials never printed; `.env.local` untouched; real board data
restored; **no worktree or second checkout**; bounded waits per §16c with
**no timeout increase**; status count **and full list** before and after,
expecting **9** — any delta is a run failure regardless of findings.

**Freeform/Map:** check fixture availability **only** after every Drawing
row passes, then **stop**. Stage 2 remains **NOT granted**; neither layout
is PASS; the decision is a fresh CTO ruling and is never inherited from
PATCH-115.

### 18h. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed;
candidate not to be committed.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 19. Row 5 ownership failure and the missing diagnostic payload (2026-07-27, CTO)

Issued at governance HEAD `4b5bc5a2ea2b2b47f56d7fdde732fb78acccb0d6`.
Candidate verified: **9** dirty paths, uncommitted, unstaged, production
and unit-test hashes unchanged.

### 19a. Classification: **I — unresolved.** Deliberately.

A–H cannot be distinguished, exactly as the report states, because the
payload that would distinguish them was never emitted. **I will not guess
among them.** §13b is the precedent: a confident source-derived mechanism
was asserted there and falsified. The cost of a wrong classification here
is another full cycle; the cost of `I` is one honest run.

What source *does* narrow, without deciding: the probe coordinate is
computed from `getBoundingClientRect()` **inside the same `evaluate`
callback that performs `elementFromPoint`**
(`drawing-overlay-containment.spec.ts:482-486`). So the coordinate cannot
drift between measurement and probe within that call, which makes a naive
reading of **C** unlikely. The genuine exposure is **between** the two
separate `evaluate` round-trips (`:477` and `:481`) — the handle can
re-render or detach in that gap, which is **B/F** territory. That is a
narrowing, not a classification.

### 19b. The spec defects — four, all source-proven

**1. Bare assertion before any payload — `:476`.**

```
async function handleInteractionProof(page, handle, lineId) {
  await expect(handle).toBeVisible();          // ← aborts with no payload
```

Directly violates §18's requirement that no bare `expect()` precede the
diagnostic object for rows 5/14.

**2. Second bare assertion — `:567.**
`expect(proof.pointerEvents).not.toBe('none')` fires before `fullProof`
is assembled at `:568-572`.

**3. The payload is built but never attached — `:573-576`.** This is the
actual failure site. `fullProof` *exists* and contains the stack,
ancestors, chrome classification and z-index threshold — and then
`expect(fullProof.resolvedLineId).toBe(lineId)` throws an error whose
message carries only *expected* and *received*. **The evidence was
collected and then discarded at the moment it was needed.** §18 required
it to be included in the thrown error; assembling it into a local variable
is not that.

**4. `rereadBeforeProbe: true as const` (`:571`) is a fabricated field.**
§18b required recording **whether** the rect was re-read immediately
before the probe. This records a hardcoded literal that will report `true`
in every run regardless of what happened. It is not a measurement, and it
cannot ever fail.

This is the "asserted, not measured" failure family already recorded
repeatedly in `LESSONS_LEARNED` — the same shape as gates whose counts
were composed from belief rather than executed. **Standing rule,
reaffirmed:** *a field that records a fact must be derived from that
fact.* A constant in an evidence payload is worse than an absent field,
because it looks like confirmation.

**Consequence:** `firstRect` is captured at `:477-480` and then **never
compared** to the rect the probe actually used. Both values exist; the
comparison that would detect rect instability — classifications **A** and
**C** — was never performed.

### 19c. Ruling: ONE merged spec-only correction, not two runs

The prompt proposes diagnosis-only first, then a separate failure-path
correction. **I am merging them, and the reason is substantive rather than
procedural.**

The diagnosis requires exactly the instrumentation the correction
installs: collect every value, then assert. Running a read-only diagnosis
first would mean writing that instrumentation, using it once, discarding
it, and then writing it again as the correction — two live cycles for
information one produces. The correction is required on every path
anyway, since §18 mandated the payload and the spec does not deliver it.

**Authorized now: a single spec-only correction, followed by one run of
the full matrix.** If row 5 fails again, it fails *with* the payload, and
the A–I classification is then decidable from that one run.

### 19d. Authorized scope — spec-only

**Exactly one file may change:**

```
e2e/characterization/drawing-overlay-containment.spec.ts
```

**No production change is authorized.** `SimpleLineRenderer.tsx`,
`DrawingLayout.tsx` and `SimpleLineRenderer.test.tsx` remain **frozen
byte-for-byte**; production stays at **2 of 3**. No governance amendment
is required — §17c/§18 already bind the criterion, and this corrects the
spec's failure to implement it.

The correction must:

1. **Remove every bare assertion from `handleInteractionProof` before the
   payload exists** — including `:476` and `:567`. Visibility and
   `pointer-events` become **recorded fields**, evaluated after collection.
2. **Assemble the full §18 payload first, then assert.** Every throw must
   carry it — via `expect(...,` message `)`, `test.info().attach()`, or an
   explicit `throw new Error(JSON.stringify(payload, null, 2))`. A bare
   `expect(a).toBe(b)` in this helper is prohibited.
3. **Replace `rereadBeforeProbe: true as const` with a measurement:**
   re-read the rect immediately before probing and record **both** rects
   plus their delta. Assert nothing about the delta yet — record it.
4. **Record locator stability across the edit-mode rerender:** locator
   count, attachment status before and after rect sampling, tag,
   `data-line-role`, `data-line-id`, and a stable `outerHTML` fingerprint
   at both samples. If identity changes between samples, the payload must
   say so.
5. **Probe five points** at the re-read rect — centre, ±2 px horizontal,
   ±2 px vertical — collecting the complete stack and ownership resolution
   **for each**. Record which points resolve.
6. **On ownership failure at all five points**, attempt a normal
   pointerdown/drag on the locator (**no `force: true`**) and record
   whether geometry changed, before failing.
7. Preserve §16c bounded waits — **no timeout increase**.
8. **Row 13 unchanged** — strict negative chrome sweep, no ancestor
   resolution.
9. Preserve every other containment assertion unchanged.

### 19e. Interpretation, decided in advance

From the payload the next run produces:

- One sampled point resolves but the centre does not ⇒ **coordinate
  instability / spec issue**; spec-only correction.
- Handle detached or fingerprint changed between samples ⇒ **B/F**; spec
  must re-locate after edit-mode settling; spec-only.
- Drag succeeds despite ownership `null` ⇒ **D**; the ownership probe is
  still wrong; spec-only.
- Unrelated fixed chrome above the line-owned target ⇒ name the exact
  blocker and **stop**.
- Drag succeeds only with `clipPath: none` ⇒ **H(candidate regression)**;
  **stop**, production ruling required; do not weaken containment or
  row 13.
- No drag and no line-owned stack entry ⇒ **unresolved/product**; stop.

### 19f. Certification

**No row certified.** This is the fourth incomplete matrix. Rows 1–4 and
6–13 were exercised but are not certified — they ran under a helper now
being corrected. Full 21 rows **from row 1**.

### 19g. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
Production frozen at 2 files; no production change authorized.
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 20. State-dependent row-5 handle hit-testing failure (2026-07-27, CTO)

Issued at governance HEAD `c62f714464a904ac59cc3bb374d49c17c57043bd`.
Candidate verified: **9** dirty paths, uncommitted, unstaged, frozen
hashes unchanged. The §19 payload correction worked — this section exists
because the evidence finally arrived.

### 20a. What this section can and cannot return

The isolated/full-prefix control results, the first offending transition,
the shortest reproducing sequence, the passing-vs-failing DOM comparison,
and the substitution outcomes are **outputs of a diagnosis that has not
run**. They are not stated here. What is stated is a source-proven
mechanism that predicts all of them, and a first diagnostic step that
confirms or refutes it in a single read.

### 20b. Leading classification: **E**, materializing as **H**.
Hypothesis — one read decides it.

The payload's decisive fact is not that the canvas was topmost. It is that
`elementsFromPoint` contained **no line-owned SVG node at all** — not the
handle, not the hit path, nothing — while the handle's own
`getBoundingClientRect()` reported a normal `12×12` box at `(434, 294)`
with `pointer-events: auto`, `opacity: 1`, and a stable fingerprint. The
element is laid out and styled to be interactive, and is simply absent
from hit-testing.

**That is the signature of `clip-path`, and `clip-path` is
candidate-introduced.** It removes hit-testing without altering layout
geometry, without altering computed `pointer-events`, and — as recorded in
§13b — **without affecting Playwright's visibility check**. Every anomaly
in the payload is explained by one clip.

**The mechanism, from source.** The candidate applies
`clipPath: inset(0 var(--drawing-visible-canvas-right-inset, 0px) 0 0)`
to the line-layer SVG. The variable is written on the viewport element in
`updatePosition` (`DrawingLayout.tsx:856-892`):

```
const sidebarRect = presentationSidebarRef.current?.getBoundingClientRect() ?? null;
const visibleCanvasRight = sidebarRect
  ? Math.min(Math.max(sidebarRect.left, viewportRect?.left ?? 0), viewportRight)
  : null;
const nextVisibleCanvasRightInsetPx =
  visibleCanvasRight === null ? null : Math.max(0, viewportRight - visibleCanvasRight);
```

Two independent defects follow, both reachable by the row 1→5 sequence:

**Defect 1 — a degenerate sidebar rect produces a full-width clip.** If
the sidebar element exists but its rect is zeroed — mid-mount, mid-unmount,
or `display:none`-adjacent — then `sidebarRect.left` is `0`,
`Math.max(0, viewportLeft)` is `0`, and the inset becomes
`viewportRight − 0` = **the entire viewport width**. The clip collapses to
zero and **the whole line layer stops hit-testing**. A handle at `x = 434`
is then unreachable, which is precisely what the payload shows. Nothing in
the expression rejects a zero-width or zero-position sidebar rect.

**Defect 2 — the variable is persistent inline style and the updater has
two early returns that skip clearing it.** `updatePosition` returns at
`:859-862` if the Excalidraw stock toolbar or the cluster element is
missing, and again at `:867-870` if either has zero width — **before**
reaching the variable write. The property is an inline style on
`viewportEl`, so it **retains its previous value** across those returns.
The stock toolbar is exactly what re-renders when the active tool changes
— which is **row 4, line mode on/off**. So a sidebar-open inset can
survive into a sidebar-closed state, and there is no path that clears it
except a complete, unguarded run.

**Why §17's isolated diagnosis passed and gave a false all-clear.** In
that run the sidebar was never opened, so the variable was absent, the
clip resolved to `inset(0 0px 0 0)` — a no-op — and `clipPath: none`
therefore "made no difference". **That comparison could not have detected
this defect**, and §17c/§18's conclusion that "containment does not impair
handle interaction" must be read as scoped to a state where the variable
was never set. It is not a general clearance, and this section withdraws
any reading of it as one.

**If confirmed, this is H — a genuine PATCH-117 production regression** —
arrived at through the **E** pathway (clip/CSS-variable state changing
after earlier rows). It is not a matrix artifact: a real user who opens
the presentation panel, switches tools, and closes the panel can land in
the same state and lose all line interaction. **A, B, C, D, F, G and I are
not excluded**, but none of them explains a layer that is laid out,
pointer-enabled, and wholly absent from the hit-test stack.

### 20c. First diagnostic step — one read decides it (bind)

**Before any control sequence**, in the failing state, record:

1. the computed value of `--drawing-visible-canvas-right-inset` on the
   viewport element;
2. the **resolved** computed `clip-path` on the line-layer SVG (the
   substituted pixel value, not the `var()` text);
3. the SVG's bounding rect and the viewport's bounding rect;
4. `presentationSidebarRef`'s element presence and its rect;
5. whether the sidebar is open at that moment.

If the inset is large — approaching or exceeding the viewport width — or
non-zero while the sidebar is closed, **§20b is confirmed and controls 1–3
are unnecessary.** Report and stop.

Only if the inset is `0px` or absent do the requested controls apply:
Control 1 (isolated edit mode), Control 2 (full prefix with per-transition
capture), Control 3 (one state at a time), sequence bisection, and the
three read-only substitutions. In that case §20b is refuted and the
classification returns to A/B/C/D/F/G/I on the evidence.

Standing constraints: read-only DOM styling only; substitutions must not
be left active; no source or spec edits; no `force: true`; **do not rerun
the full 21-row matrix**; one disposable fixture; real Arrow Post
untouched; `git status --porcelain` count **and full list** before and
after, expecting **9**.

### 20d. Correction scope — decided in advance

- **§20b confirmed (E/H):** a **narrow production correction inside the
  existing two files is authorized**, no third file, no new dependency.
  The correction must (i) treat a degenerate sidebar rect — zero width, or
  a `left` at or left of the viewport's left edge — as **no boundary**,
  not as a full-width inset; (ii) guarantee the variable is **cleared**
  whenever no valid boundary exists, on a path that the toolbar/cluster
  early returns cannot skip; and (iii) preserve row 13, sidebar
  interaction safety, front/back layers, and line/edit modes. **The clip
  must fail open** — an unresolvable boundary must mean *no clipping*,
  never *clip everything*. Containment is a safety feature and must not be
  able to disable the editor.
- **§20b refuted, product-side cause:** prove it against the isolated
  baseline and source, then decide whether it blocks acceptance.
  **Row 5 may not be silently exempted** under any classification.
- **Invalid state created by the spec:** authorize a **sequence-only**
  spec correction. The handle interaction criterion (§17c) **may not be
  weakened**.

**A governance amendment IS required only on the first path** — §5 rows
would need a new sub-row asserting the boundary clears correctly after the
sidebar closes, and §4's test allowlist has one free slot for a unit test
covering degenerate-rect input. That amendment is **not issued now**; it
follows the diagnosis. No allowlist or cap change is needed either way:
production stays at **2 of 3**.

### 20e. Certification

**No row is certified.** Fifth incomplete matrix. Rows 1–4 and 6–13 were
exercised under a helper and a criterion that have both since changed.

**Standing rule (record in LESSONS_LEARNED):** *an isolated control that
never enters the state under test proves nothing about that state.* §17's
`clipPath: none` comparison returned "no difference" because the clip was
already a no-op — a negative result from an inactive mechanism was read as
evidence the mechanism was harmless. A containment control must be run in
the state where containment is actually engaged.

### 20f. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed. No
production or spec correction is authorized by this section — **diagnosis
only**.
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 21. Edit-mode entry-path comparison (2026-07-27, CTO)

Issued at governance HEAD `8bc1e2db90ef2421bd5d1c0b4a87a28745f1bd76`.
Candidate verified: **9** dirty paths, uncommitted, unstaged, frozen
hashes unchanged.

### 21a. §20b is REFUTED — recorded plainly

The measured working state shows `--drawing-visible-canvas-right-inset:
320px`, resolved `clip-path: inset(0px 320px 0px 0px)` on a 1600×1000
layer with the sidebar open at left 1280 — a **correct** boundary, with
the point handle topmost, hit path second, canvas third. No full-width
clip. No stale inset while closed.

**The §20b hypothesis was wrong.** It was labelled a hypothesis and the
§20c one-read step was designed to kill it cheaply, which it did. The
§17/§18 clearance of containment stands after all; §20e's withdrawal of it
is itself withdrawn, with one qualification retained: the §20e standing
rule — *an isolated control that never enters the state under test proves
nothing about that state* — remains correct and remains recorded. It is
now satisfied, because containment has been observed **engaged** (320 px,
sidebar open) and handles were still topmost.

**Classification: J — still unresolved.** Row 5's original failure has no
established mechanism, and I will not supply a third hypothesis to replace
two that were falsified. What source can now contribute is a set of
**proven non-equivalences** between the two entry paths, which is what the
comparison must test.

### 21b. Double-click IS an intended supported product path — bound

Not a test-only affordance:

```
SimpleLineRenderer.tsx:759   onDoubleClick={(e) => handlePathDoubleClick(e, line.id)}
SimpleLineRenderer.tsx:609   handlePathDoubleClick → onToggleEditMode(lineId)
useCanvasLines.ts:125-127    handleToggleLineEditMode = (id) => setLineEditModeId(id)
```

It is product code writing product state. **If double-click fails, that is
a product defect and may not be silently replaced by the toolbar
interaction.** A spec substitution is authorized only if the comparison
proves the *matrix's* event synthesis — not double-click itself — is the
problem.

### 21c. The two paths are NOT equivalent — three proven differences

This is the requested binding of exact state variables. Both paths
ultimately write the single state `lineEditModeId`, but they differ in
three ways that are visible in source:

**1. Path A is a setter; Path B is a toggle.** Despite its name,
`handleToggleLineEditMode` (`useCanvasLines.ts:125-127`) is
`setLineEditModeId(id)` — it **always enters** edit mode for that id and
can never exit. Path B (`CanvasClient.tsx:7360`) is a genuine toggle:
`setLineEditModeId(lineEditModeId === selectedLineId ? null : selectedLineId)`.
So repeated double-clicks cannot toggle edit mode off, while repeated
Edit-Points clicks can. **Any assumption in the matrix that double-click
toggles is wrong.**

**2. Path B keys off `selectedLineId`; Path A keys off the double-clicked
line's own id.** If selection and the double-click target ever disagree,
the two paths set different values. Path B cannot even run without a
selection — the toolbar renders only when `selectedLineId` is set
(`:7356`).

**3. Path A necessarily runs the mousedown drag branch first; Path B never
touches drag state.** A real double-click fires `mousedown` before
`dblclick`, so `handleLineDragStart` executes: `e.preventDefault()`,
`e.stopPropagation()` (`:370-371`), `setDraggingLine({ lineId })` and
`onSelectLine(lineId)` (`:379-380`) — and `onDragChange` propagates to
`setDraggingLineId`. **Path A therefore enters edit mode with drag state
engaged; Path B does not.** If a `mouseup` is missing, swallowed, or
delivered elsewhere, Path A can leave `draggingLine` latched while Path B
never can. This is the most substantive difference and the comparison must
measure it explicitly: **record `draggingLineId` at every step of both
paths.**

**4. Context worth carrying into the diff:** `isEditMode` is passed as a
**global** boolean — `isEditMode={lineEditModeId !== null}`
(`CanvasClient.tsx:6332`, and the same shape at the front-layer and Map
call sites). Edit mode on *any* line puts every renderer instance in edit
mode; handles are then gated per line by `isEditMode && isSelected`
(`SimpleLineRenderer.tsx:874`). So "edit mode active" is not by itself
evidence that the **intended** line is the one in edit mode.

### 21d. Authorized: diagnosis only, comparing Path A and Path B

No spec correction, no production correction. One disposable Drawing
fixture. Both paths start from an identical recorded initial state:
sidebar open, exact temporary line selected, line mode recorded,
front/back layer recorded, no modal, same geometry.

**Path A must reproduce the matrix exactly.** Read the current spec and
replay its **actual** sequence and event method — no shortened
approximation unless every preceding state and action is proven identical.
Record click count, inter-click timing, both coordinates, raw event
targets, the `dblclick` target, and every emitted diagnostic.

**Both paths record, after every transition:** `selectedLineId`;
`lineEditModeId`/edit mode; line mode; **`draggingLineId`**; front/back
layer; sidebar and modal state; line-layer DOM identity and count;
line-layer computed `z-index`, `pointer-events`, `clip-path` (resolved
pixels) and the inset variable; SVG and canvas rects; handle counts by
role; the selected-filter signal; and — where handles exist — the full
`elementsFromPoint` stack and a real drag result.

**Then produce the field-by-field diff** and answer explicitly whether
Path A: never activates edit mode · activates then resets · activates on a
different line · leaves line mode active · leaves **drag state latched** ·
remounts a different line layer · produces handles under a different SVG
layer · changes sidebar/boundary state · changes front/back layer ·
loses selection · is intercepted · or depends on double-click timing.

**Bounded timing variants**, only if the exact matrix double-click fails,
and only these four: native `locator.dblclick` at the same verified
coordinate; two normal clicks at the current matrix delay; two normal
clicks with no delay; explicit mousedown/up pairs. **No `force: true`. Do
not exceed the §16c 2000 ms bounds. Do not rerun the full matrix.**

Read-only throughout; no substitution left active; real Arrow Post
untouched; `git status --porcelain` count **and full list** before and
after, expecting **9**.

### 21e. Correction scope — decided in advance

- **Toolbar works, double-click does not, and the failure survives all
  four timing variants** ⇒ **product defect**. Determine pre-existing vs
  candidate-introduced by testing the same double-click with the
  candidate's `clipPath` neutralized **and** by reasoning against the
  frozen production diff. Return for a production ruling. **Do not
  substitute the toolbar path in the spec.**
- **Double-click works under a different event method than the matrix
  uses** ⇒ the matrix's synthesis is not equivalent to real user input.
  **Spec-only correction authorized** to use the equivalent real
  interaction. Direct state mutation remains prohibited; §17c may not be
  weakened.
- **Both paths work in isolation and only the matrix prefix fails** ⇒
  sequence/state defect; bisect and correct the spec sequence only.
- **Both fail** ⇒ broader edit-mode defect; stop and report.

**No governance amendment is required** on any of these paths. Production
stays at **2 of 3**; the test allowlist stays at **2 of 3**. An amendment
becomes necessary only if a production correction needs a third file, or
if a new acceptance row is added.

### 21f. Certification and process note

**No row is certified.** This is the fifth incomplete matrix and the
third falsified mechanism (§13b `points`, §17b bridge-overlay, §20b
full-width clip). Each was correctly labelled a hypothesis and each was
killed by a cheap targeted step rather than by an expensive full run —
that is the process working, not failing. It is nonetheless the reason
this section supplies **proven non-equivalences** to measure rather than a
fourth mechanism to believe.

### 21g. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed. No
correction authorized by this section — **diagnosis only**.
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 22. Hit-path coordinate-selection correction (2026-07-28, CTO)

Issued at governance HEAD `4884ca7d9948e287e60e022ff09793021e6fe1fa`.
Candidate verified: **9** dirty paths, uncommitted, unstaged, frozen
production and unit-test hashes unchanged.

### 22a. Classification I — ACCEPTED

`verifiedHitPathPoint` returned `(706, 280)` at nominal ratio **0.5**,
where `document.elementFromPoint` resolves to
`DIV[data-line-role="label-handle"]` rather than the hit path. Every
double-click variant — `page.mouse.dblclick`, `locator.dblclick`, two
clicks at the matrix delay, two with no delay, explicit down/up pairs —
therefore delivered to the label, and `handlePathDoubleClick` never ran.
Path B via the real Edit Points control worked from an identical initial
state, with containment engaged (`inset(0px 320px 0px 0px)`, inset 320 px,
z-index 1000) and the endpoint drag moving `(1160,300) → (1136,312)`
without translating the line.

**This is a harness coordinate-selection defect.** Not a PATCH-117
regression, not clipping, not stacking, not a stale boundary, and not
evidence that product double-click is unsupported.

### 22b. Why ratio 0.5 was the one coordinate guaranteed to fail

The label is centred on `line.label_position ?? 0.5`
(`SimpleLineRenderer.tsx:823-824`), and its inner div sets
`pointerEvents: 'auto'` with `data-line-role="label-handle"` (`:852`,
`:861`). **A labelled line's midpoint is exactly where the label is, by
construction.** Sampling at 0.5 does not merely risk the label — on a
labelled line it selects it deterministically.

**Correction to §17b, on the record.** I wrote there that the label
`foreignObject` "is not the blocker" because it and its wrapper are
`pointer-events: none`. Both statements remain true, and the conclusion
drawn from them — that the label could not be returned by
`elementFromPoint` — was **wrong**: the inner label div re-enables
`pointer-events: auto` and is exactly what was returned. I named `:852` in
that same section and did not follow it through. That is the fourth
falsified inference in this patch, and the reason §21 stopped supplying
mechanisms in favour of measurable non-equivalences.

### 22c. Spec-only correction — AUTHORIZED

**Exactly one file may change:**

```
e2e/characterization/drawing-overlay-containment.spec.ts
```

**No production or unit-test file may change.** `SimpleLineRenderer.tsx`,
`DrawingLayout.tsx` and `SimpleLineRenderer.test.tsx` stay **frozen
byte-for-byte**; production remains **2 of 3**.

**"Same line-owned element" matching is PROHIBITED for
`verifiedHitPathPoint`.** The helper must return only a coordinate where
`document.elementFromPoint` resolves to an element satisfying **all
three**: it is the hit path; `data-line-id` equals the temporary line id;
and `data-line-role` equals exactly `hit-path`. Ancestor resolution must
**not** be used here.

This is deliberately stricter than §17c's ownership rule, and the
distinction must be preserved in both directions:

- **§17c ancestor resolution applies to rows 5/14 handle ownership**,
  where the question is *"is this interaction reaching the right line?"*
- **`verifiedHitPathPoint` requires exact-node identity**, because the
  question is *"will a double-click here reach `handlePathDoubleClick`?"*
  — and only the hit path carries that handler. An ancestor match answers
  the wrong question, which is precisely how a label coordinate passed
  validation.

The helper must **reject** as a target: `label-handle`, `point-handle`,
`midpoint-handle`, `visible-path`, any arrowhead or marker element, **any
descendant or sibling sharing the same `data-line-id` under a different
role**, the Excalidraw canvas, and any chrome element.

Coordinate search must:

1. sample multiple points along the exact hit-path geometry;
2. verify **every** candidate with `elementFromPoint` before use;
3. return only an exact `hit-path` match;
4. on finding none, fail with a **diagnostic payload** — never a bare
   assertion, per §19;
5. report every sampled coordinate and the role returned at each;
6. stay within §16c bounds — **no timeout increase**;
7. use no `force: true`;
8. leave **row 13 unchanged** — strict negative chrome sweep, no ancestor
   resolution;
9. preserve the §19 handle diagnostics in full;
10. support running the complete 21-row matrix from row 1.

**Recommended, not mandated:** bias sampling away from a band around
`label_position` and away from the path extremities where arrowheads and
endpoint handles sit. Verification is the requirement; sampling order is
an efficiency choice.

**No toolbar substitution for row 5.** Row 5 must exercise the intended
double-click product path on a real hit-path coordinate. `Path B` was a
diagnostic control, not an acceptance route.

### 22d. No governance amendment required

§17c and §18 already bind the acceptance criteria; this corrects the
spec's target selection. Production stays **2 of 3**, the test allowlist
**2 of 3**, and the correction edits an existing file. Nothing in §3, §4,
§5, §7 or §8 changes.

### 22e. Post-correction requirements

**Static:**

```
git diff --check
npx tsc --noEmit
npx vitest run                                                    # 55 files / 605 tests
npx vitest run components/collabboard/SimpleLineRenderer.test.tsx  # 20
npx playwright test --list e2e/characterization/drawing-overlay-containment.spec.ts
npx eslint e2e/characterization/drawing-overlay-containment.spec.ts
```

Scope proof: the three frozen files **byte-identical**;
`git status --porcelain | wc -l` remains **9**.

**Live: the complete 21-row Drawing matrix from row 1.** No evidence
carries forward from any of the five incomplete runs. `PW_BASE_URL` set;
`--no-deps`; no build while the dev server is live; probe **both** `/` and
`/auth`; full-page screenshots; scratch outside the repo; credentials
never printed; `.env.local` untouched; real board data restored; **no
worktree or second checkout**; §16c bounds unchanged; status count **and
full list** before and after, expecting **9** — any delta is a run failure
regardless of findings.

**If every Drawing row passes:** report Freeform and Map fixture
availability and **stop**. Stage 2 remains **NOT granted**; neither layout
is PASS; the decision is a fresh CTO ruling and is never inherited from
PATCH-115. **Do not commit.**

### 22f. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 23. Full-matrix timeout — structural over-budget and row misordering (2026-07-28, CTO)

Issued at governance HEAD `5e9531f20e06eedfe936ad5f6bfc4f4c1a74a1a0`.
Candidate verified: **9** dirty paths, uncommitted, unstaged, frozen
production and unit-test hashes unchanged.

### 23a. Classification: **H**, causing **A**. Cumulative, not a single hang.

Both are provable from the spec as it stands. No diagnostic run is needed
to establish them, and this section supplies the source order and budget
census the prompt asked for.

**Row 5 is misplaced in source — confirmed.** The single test at `:1064`
executes in this order (offsets relative to `:1064`):

| source offset | matrix row |
|---|---|
| +21…+26 | row 1 — sidebar closed |
| +30…+31 | row 17 — zoom, sidebar closed |
| +35…+41 | row 2 — sidebar open |
| +44…+45 | row 18 — zoom, sidebar open |
| +51 | row 13 — chrome sweep |
| +55…+57 | row 4 — line mode |
| +62…+68 | row 8 — modal open |
| +71…+76 | row 9 — Apply layout |
| +79…+82 | row 10 — slide card |
| +85…+88 | row 11 — checkbox |
| +91…+100 | row 12 — overflow menu |
| **+104…+106** | **row 3 — selection** |
| +109…+111 | rows 6/7 — back layer, **via `page.reload`** |
| later | **row 5 — edit mode / handles**, and rows 14–21 |

So rows 8–13 and a full page reload execute **before** row 3, and row 5
runs after all of them. The acceptance matrix states row 5 follows row 4.
**This is an accidental spec-order defect**, and it is why five
consecutive runs have burned their entire budget without ever exercising
the row under investigation.

### 23b. Time-budget census — the spec cannot fit its own limit

Measured across the file:

| operation | count | bound each | worst case |
|---|---|---|---|
| `{ timeout: 60_000 }` waits | **11** | 60 s | **660 s** |
| `{ timeout: 30_000 }` waits | **11** | 30 s | **330 s** |
| `waitForFunction` (no explicit bound ⇒ config default) | **4** | 30 s | 120 s |
| `page.reload` | 2 | — | — |
| `page.screenshot({ fullPage: true })` | 10 | — | — |

**Worst-case cumulative ≈ 1110 s of bounded waiting alone**, against
`test.setTimeout(240_000)` at `:1065`. **The spec's own budget exceeds its
limit by more than 4×.** Only ~22 % of the declared waiting can occur
before the test dies.

That settles the question the prompt asks: **this is cumulative runtime,
not one wait using the global timeout.** No single operation needs to hang.
A handful of the 60 s waits resolving slowly — or simply the ordinary cost
of 10 full-page screenshots and 2 reloads — consumes the budget before row
5 is reached. The observed evidence fits exactly: rows 1–4, 6, 7 (partial),
8–13 completed; row 7's continuation, row 5, and rows 14–21 never ran.

**Raising the timeout is not the fix and remains prohibited.** A limit
raised to fit a 1110 s worst case would make every future failure a
20-minute stall. The bounds themselves are wrong: a 60 s wait for an
element on an already-loaded page is not a safety margin, it is a
deferred, expensive failure.

### 23c. Structural defect: one monolithic test, no phase attribution

The entire 21-row matrix is a **single** `test()` spanning `:1064-1319`
with **no `test.step` boundaries**. Three consequences, all of which this
patch has already paid for:

1. No per-row timing or attribution — every timeout reports only "the test
   timed out", which is why an instrumentation run is being contemplated
   at all.
2. Fixture creation, the full matrix, and cleanup share one budget;
   cleanup competes with assertions for the same 240 s.
3. A failure anywhere discards every row after it, so no row is ever
   certified. **Five incomplete matrices in a row are a predictable
   consequence of this shape**, not five separate accidents.

### 23d. Authorized: ONE spec-only correction. No separate instrumentation run.

The prompt authorizes a diagnostic run and, if needed, one instrumentation
edit. **I am collapsing that into the corrective edit**, on the same
reasoning as §19c: the instrumentation and the correction are the same
change — `test.step` boundaries provide exactly the per-phase timing the
diagnostic run would have produced, and Playwright reports step durations
natively. Running instrumentation first would mean writing the steps,
reading them once, and then writing them again.

**Exactly one file may change:**

```
e2e/characterization/drawing-overlay-containment.spec.ts
```

**No production change is authorized.** `SimpleLineRenderer.tsx`,
`DrawingLayout.tsx` and `SimpleLineRenderer.test.tsx` remain **frozen
byte-for-byte**; production stays at **2 of 3**.

The correction must:

1. **Reorder to the matrix sequence** — row 5 immediately after row 4, and
   every other row in its stated position. **All 21 criteria are
   preserved.** No assertion may be weakened, dropped, merged, or made
   conditional to save time.
2. **Wrap every row in a named `test.step`** — `"row NN — <name>"` — so
   Playwright reports per-row duration natively. Move fixture setup and
   cleanup into their own named steps.
3. **Bring the waits inside budget.** Replace the 60 s and 30 s bounds
   with bounds justified by measured behaviour — the §16/§20 diagnostics
   measured selection settling at **1–7 ms** and handle rects as stable.
   **Timeouts may be reduced; none may be increased** (§16c). Where a wait
   genuinely needs a long bound (initial page load), state the reason in a
   comment.
4. **Keep the total worst case inside `test.setTimeout(240_000)`** and say
   so: report the recomputed worst-case sum. If it cannot fit, split the
   matrix into multiple `test()` blocks rather than raising the limit —
   that is authorized here and requires no amendment, since it adds no
   file.
5. **Reduce screenshot cost** — retain full-page capture for the rows that
   need it (containment and chrome rows, per §18a) and drop redundant
   captures elsewhere. Row 13 evidence must remain full-page.
6. **Preserve unchanged**: row 13's strict negative sweep; §22's exact
   `hit-path` node matching in `verifiedHitPathPoint`; §19's diagnostic
   payloads; §17c's three-part handle criterion; the row 5 double-click
   product path with **no toolbar substitution**.
7. **Carry no evidence between runs.** The reordered matrix runs from row
   1 in one pass.

### 23e. No governance amendment required

§5's 21 rows are unchanged in content and count; only their execution
order in the spec is corrected to match what §5 already states.
Production stays **2 of 3**, tests **2 of 3**, and the correction edits an
existing file. Splitting into multiple `test()` blocks within that file
adds no file and needs no amendment.

### 23f. Certification and standing rule

**No row certified.** Sixth incomplete matrix.

**Standing rule (record in LESSONS_LEARNED):**

> A live acceptance matrix must be **budgeted before it is run**: sum the
> declared worst-case waits and compare against the test timeout. If the
> sum exceeds the limit, the matrix cannot pass and every run is wasted
> regardless of product correctness. Bound each wait from measured
> behaviour, not from a defensive round number — a 60 s wait on an
> already-loaded page is a deferred failure, not a safety margin. Give
> every row its own `test.step` so a timeout names the row that consumed
> the budget, and keep setup and cleanup out of the assertion budget.

This patch spent five live cycles on defects the arithmetic in §23b would
have predicted before the first run.

### 23g. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 24. Row 5 edit-mode signal ruling (2026-07-28, CTO)

Issued at governance HEAD `18cd4b4a317778fc453711b18968a5f69d7a061e`.
Candidate verified: **9** dirty paths, uncommitted, unstaged; all three
frozen hashes unchanged
(`8966233d…`, `86e84e65…`, `df759afb…`).

The §23 structural correction was already present in the spec when the
implementer inspected it — row order 1–21 with row 5 immediately after row
4, named `test.step` attribution, reduced timeout constants, `try/finally`
cleanup, §22 exact hit-path matching, §19 diagnostics, §17c/§18 criterion,
row 13 unchanged. **§23 is satisfied and closed.** The implementer made no
source or spec edits, issued no governance ruling, touched no `.fable5`
file, and stopped at the bound hard stop. **Role boundary correctly
observed; the report is accepted.**

### 24a. Classification: **J — unresolved**, and the signal is the reason

I will not choose among A/F/G/H, because **the signal that failed cannot
distinguish between them.** That is not a limitation of the evidence; it
is a property of the signal, and it is the finding.

`SimpleLineRenderer.tsx:755`:

```
cursor: (isEditMode && isSelected) ? 'cell' : (isEditMode ? 'default' : 'move'),
```

`isEditMode` is the **global** `lineEditModeId !== null`
(`CanvasClient.tsx:6332`). `isSelected` is `selectedLineId === line.id`
(`:726`). So `cursor === 'cell'` is a **conjunction of two independent
states**. Its absence is consistent with *all* of:

- edit mode never activated (**F/G**);
- edit mode activated but selection was lost (**A**);
- edit mode activated on a different line (**E**);
- either state cleared after activation (**H**).

`handlePathDoubleClick` (`:609-615`) sets **only** edit mode —
`onToggleEditMode(lineId)`. Selection arrives separately, from the
preceding `mousedown` via `handleLineDragStart:380`. **The two states have
different sources, and the signal ANDs them.** A failure therefore erases
the information needed to classify it.

**A candidate mechanism worth testing, not asserting.**
`handleCanvasMouseDown` (`:553-568`) clears **both** states when a
mousedown reaches the SVG root with `!isLineMode`:

```
if (!isLineMode) {
    onSelectLine(null);
    onToggleEditMode(null);
    setSelectedPoint(null);
    return;
}
```

`handleLineDragStart` calls `stopPropagation()` (`:371`), so a mousedown
that lands **on** the hit path is protected. One that misses by a pixel —
across the six events `page.mouse.dblclick` synthesises — is not, and
would clear everything silently. Row 4 also ends with `Escape` at spec
`:1179`. This is a hypothesis for the diagnosis, consistent with §21's
finding that `handleToggleLineEditMode` is a plain setter and so cannot
have toggled edit mode *off*.

**Source does not guarantee `cursor: 'cell'` on edit-mode entry.** It
guarantees it only when edit mode **and** selection of that exact line
both hold. That answers the §24 source-trace question directly: the signal
is **not** guaranteed by entering edit mode.

### 24b. Authoritative signal ruling — BINDING, independent of the diagnosis

**`cursor === 'cell'` is DISQUALIFIED as row 5's edit-mode signal**, and
this holds regardless of what the diagnosis finds. A signal that ANDs two
states cannot prove either, and it destroys diagnostic information on
failure — which this patch has now paid for twice.

**Row 5 must use, in this order of preference:**

1. **Exact-line handle presence matching fixture shape** — the fixture's
   `points` is an array, so `point-handle ≥ 1` **and** `midpoint-handle ≥ 1`
   for that exact `data-line-id`; for a legacy row, `start-handle`,
   `control-handle` and `end-handle` each exactly 1. This is preferred
   over `lineEditModeId` because handles are rendered by
   `isEditMode && isSelected` at `:874` — the same conjunction — but as
   **presence**, which is directly observable, exact-line scoped, and is
   what row 5 must prove anyway. The spec already implements this branch
   in `editableHandleForCurrentLine` (`:1126-1143`); the correction is to
   **wait on it** rather than on cursor.
2. `lineEditModeId` equal to the exact line id, if safely observable
   without instrumenting production code.
3. Another direct, source-backed, exact-line DOM signal.
4. `cursor` — **only** if source and live evidence prove it guaranteed.
   §24a shows source does not, so this option is closed.

**A generic global edit-mode boolean alone is not acceptable**, per the
prompt and per §21's finding that `isEditMode` is global: it cannot show
that the *intended* line entered edit mode.

### 24c. Required diagnosis (bind) — read-only, one disposable fixture

Reproduce rows 1–5 only, using the current exact-hit-path helper. **No
`force: true`. The toolbar path is diagnostic only and is never acceptance
evidence.** No worktree. Real Arrow Post untouched. §16c bounds — **no
timeout increase.**

**Before the double-click**, record: exact line id; hit-path node
fingerprint; hit-path computed `cursor`; visible-path selection filter;
line-mode state; selected state; handle counts by role; line-layer DOM
identity.

**During and immediately after**, record: raw `mousedown`, `mouseup`,
`click` and `dblclick` targets and their order; whether the
`hit-path-doubleclick` diagnostic fires; whether `onToggleEditMode` fires;
whether the hit-path node is detached or replaced, with the new
fingerprint; `cursor` on **both** the original node and a freshly located
exact hit path; handle counts by role; and — decisively — **`selectedLineId`
and edit-mode state separately**, never inferred from cursor.

**Poll all four candidate signals independently**, each bounded at 2000 ms,
and record each settling time: (1) cursor contains `cell`; (2) exact-line
handles matching fixture shape; (3) exact-line edit-mode state; (4) any
other direct source-backed signal.

**Controlled comparison** from an identical reset state: enter edit mode
via the real Edit Points control and record the same signals. Determine
specifically **whether the toolbar path also fails `cursor === 'cell'`
while handles are present** — if it does, the cursor signal is invalid
independently of the double-click path, which converts §24b from a
source-based ruling into a measured one.

Report `git status --porcelain` count **and full list** before and after —
expect **9**.

### 24d. Correction scope

- **Handles or exact-line edit state appear while cursor never becomes
  `cell`** ⇒ **spec-only correction**, replacing `waitForLineEditMode`'s
  condition with the §24b signal. **No production change.**
- **Original node stale but a freshly located node carries the correct
  signal** ⇒ **spec-only re-location correction.**
- **`handlePathDoubleClick` never fires despite exact raw targeting** ⇒
  identify the interception or synthesis defect and **stop**; no
  correction authorized without a fresh ruling.
- **Handler fires but state does not change** ⇒ product state defect;
  determine candidate-introduced vs pre-existing and **stop**.
- **Cursor changes only after >2000 ms** ⇒ **do not raise the timeout**;
  identify why the state is delayed and whether a faster direct signal
  exists. §24b applies regardless.

**No production change is authorized by this section.**

### 24e. Wait-budget ruling

**196,250 ms is acceptable for the next run and must be reduced below
180,000 ms before closure.**

It is within the 240,000 ms hard limit, and the observed evidence retires
the risk the target was guarding against: the reordered matrix reached row
5 in **12.6 s wall-clock**, so the declared worst case is nowhere near
being approached. Forcing a reduction before the next run would spend a
cycle for no information.

The lever, for when it is done: `UI_READY_TIMEOUT_MS` × 23 = 115,000 ms
dominates the sum. Rows 1–4 completed in ~10 s total, so 5,000 ms per
UI-ready wait is already generous; reducing it to 3,000 ms yields 69,000 ms
and a total of **150,250 ms**. **Reductions only — no timeout may be
increased.** This may be bundled into the same spec-only correction.

### 24f. No governance amendment required

§5's rows are unchanged in content, count and order. This ruling replaces
a **harness signal**, not an acceptance criterion: row 5 still requires
edit mode entered via the exact hit-path double-click, and §24b's handle
presence is a stricter, exact-line-scoped observation than the cursor it
replaces. Production stays **2 of 3**; tests stay **2 of 3**; the
correction edits an existing file.

### 24g. Certification

**No row certified.** Rows 1–4 passed under the corrected spec but are not
certified, because the run did not complete and §14f/§18g require the
matrix to run from row 1 in one pass.

### 24h. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
Production frozen at 2 files; no production change authorized.
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 25. Post-§24 correction ruling (2026-07-28, CTO)

Issued at governance HEAD `42bd019addfa0a4b95a27bc1a060798040a40231`.
Candidate verified: **9** dirty paths, uncommitted, unstaged; all three
frozen hashes unchanged (`8966233d…`, `86e84e65…`, `df759afb…`).

### 25a. Diagnosis accepted, with the confound recorded

The corrected full-prefix reproduction — rows 1–4 replayed via the exact
locator logic from the current spec, then row 5 — did not reproduce the
original timeout. All four candidate signals resolved well inside bound:
selection filter 10 ms, Edit Points active-state 32 ms, cursor `cell`
42 ms, exact-line handles 46 ms. Every event in the double-click sequence
targeted the exact hit-path node; it neither detached nor remounted.
**No production or targeting regression reproduced.**

**The trace-overhead confound is correctly left unproven and is bound as
such.** It is a plausible account of the non-reproduction, not a finding,
and it must not be written into this document as a cause. If it recurs
under `--trace on` in the next run, that will be evidence; it is not
evidence now.

### 25b. Cursor signal — DISQUALIFIED, confirmed

§24b's disqualification of `cursor === 'cell'` as an acceptance signal is
**confirmed, not merely restated**. The diagnosis measured it settling at
42 ms alongside three independent signals in the same window — so the
live evidence agrees with the source argument in §24a (the signal ANDs two
independently-sourced states) without needing the signal to have failed
again. A signal can be disqualified on structural grounds even when it
happens to pass; §24a's reasoning stands regardless of this run's outcome.

### 25c. Spec-only correction — AUTHORIZED

**Exactly one file may change:**

```
e2e/characterization/drawing-overlay-containment.spec.ts
```

**No production or unit-test file may change.** `SimpleLineRenderer.tsx`,
`DrawingLayout.tsx` and `SimpleLineRenderer.test.tsx` remain **frozen
byte-for-byte**; production stays at **2 of 3**.

Replace `waitForLineEditMode`'s acceptance condition with exact-line handle
presence, branched on fixture shape:

- **points-array fixture**: `point-handle` count ≥ 1 **and**
  `midpoint-handle` count ≥ 1, both scoped to the exact temporary
  `data-line-id`.
- **legacy fixture**: `start-handle`, `control-handle` and `end-handle`
  each present (count ≥ 1), scoped to the exact temporary `data-line-id`.

The branch condition must be read from the fixture's actual `points`
field — the same test already does this correctly in
`editableHandleForCurrentLine` (`:1126-1143`); this correction should
reuse that shape check rather than re-deriving it, so the two do not
drift apart.

Bound requirements, all required:

1. Keep the exact raw hit-path double-click product path (§22 unaffected).
2. No toolbar substitution.
3. `cursor === 'cell'` may **not** be used as an acceptance condition
   anywhere in this function.
4. Cursor readings may remain in the **diagnostic payload only**.
5. Poll interval ≤ 50 ms, total bound ≤ 2000 ms — unchanged from §16c.
6. On failure, emit: exact line id; fixture `points` shape; **all**
   exact-line role counts (`hit-path`, `visible-path`, `label-handle`,
   `point-handle`, `midpoint-handle`, `start-handle`, `control-handle`,
   `end-handle` — whichever are present); cursor on a **freshly located**
   hit path; the selection-filter value; the raw double-click event
   targets in order; and the hit-path fingerprint **before and after**
   the double-click, so a remount is directly visible in the failure
   payload rather than inferred.
7. Preserve unchanged: §22's exact hit-path coordinate matching; §19's
   diagnostic payload discipline (assemble before asserting — the §19
   rule applies here too); §17c/§18's handle criteria; row 13's strict
   sweep; the governed row order and `test.step` structure from §23.
8. No timeout may be increased.

### 25d. Wait-budget correction — AUTHORIZED

`UI_READY_TIMEOUT_MS`: **5000 ms → 3000 ms**, exactly as proposed.

Recomputed: `23 × 3000 = 69,000`, replacing `23 × 5000 = 115,000` in the
§23 census — total declared worst case **150,250 ms**, down from
196,250 ms, **29,750 ms under the 180,000 ms target**. This is a
reduction only, consistent with §16c and §23's "no increase" constraint.
**No other timeout may be changed** by this correction — `INTERACTION_
TIMEOUT_MS` (2,000 ms), `INITIAL_LOAD_TIMEOUT_MS` (15,000 ms) and
`FALLBACK_SETTLE_TIMEOUT_MS` (250 ms) are untouched.

This bound is a reduction against the *declared worst case*, not a
prediction of the next run's actual duration — the row 1–4 prefix observed
in §24's diagnosis completed in well under a second per row, so 3,000 ms
remains generous headroom, not a tight margin.

### 25e. No governance amendment required

§5's rows are unchanged in content, count and order. This replaces a
harness signal with a stricter, exact-line-scoped one and reduces a
declared-wait constant; neither touches an acceptance criterion.
Production stays **2 of 3**; tests stay **2 of 3**; both edits land in
the one already-authorized spec file.

### 25f. Post-correction requirements

**Static:**

```
git diff --check
npx tsc --noEmit
npx vitest run                                                    # 55 files / 605 tests
npx vitest run components/collabboard/SimpleLineRenderer.test.tsx  # 20
npx playwright test --list e2e/characterization/drawing-overlay-containment.spec.ts
npx eslint e2e/characterization/drawing-overlay-containment.spec.ts
```

Scope proof: the three frozen files **byte-identical**;
`git status --porcelain | wc -l` remains **9**. Report the recomputed
worst-case total (expect **150,250 ms**) alongside the static results.

**Live: one complete Playwright matrix from row 1, `--trace on`.** No
evidence carries forward from any of the six prior incomplete runs.
Standing rules unchanged: `PW_BASE_URL` set; `--no-deps`; no build while
the dev server is live; probe **both** `/` and `/auth`; scratch state
outside the repo, deleted after use; credentials never printed;
`.env.local` untouched; real board data restored; **no worktree**; status
count **and full list** before and after, expecting **9**.

**If every Drawing row passes:** report Freeform and Map fixture
availability and **stop**. Stage 2 remains **NOT granted**; a fresh CTO
ruling, never inherited from PATCH-115. **Do not commit.**

### 25g. Next Sonnet instruction (bind)

> **Implementation engineer role only. Read PATCH-117 §25 first —
> authoritative. Do not issue governance rulings, edit `.fable5`, or begin
> PATCH-118.**
>
> Repository safety gate before and after: `git status --porcelain` (expect
> **9**, same paths as before), `git diff --cached --name-status` (empty),
> `git worktree list` (one), `git stash list` (empty). Record frozen
> hashes before and after — any change to `SimpleLineRenderer.tsx`,
> `DrawingLayout.tsx`, or `SimpleLineRenderer.test.tsx` is a hard stop.
>
> **Exactly one file may change:**
> `e2e/characterization/drawing-overlay-containment.spec.ts`.
>
> Apply both corrections from §25c and §25d:
>
> 1. Replace `waitForLineEditMode`'s cursor-based condition with exact-line
>    handle presence, branched on the fixture's `points` shape exactly as
>    §25c specifies — reuse the shape check already present in
>    `editableHandleForCurrentLine` rather than re-deriving it. Keep the
>    double-click product path; no toolbar substitution; `cursor` becomes
>    diagnostic-only; poll ≤50 ms / ≤2000 ms bound unchanged; on-failure
>    payload includes every item listed in §25c.6.
> 2. Change `UI_READY_TIMEOUT_MS` from `5000` to `3000`. No other timeout
>    constant changes.
>
> Do not touch row order, `test.step` structure, row 13, or §22's
> coordinate helper.
>
> Run static validation per §25f and report actual output, including the
> recomputed worst-case wait total. Then run one complete Playwright
> matrix from row 1 with `--trace on`, following all standing live rules.
> Report every row's PASS/FAIL with duration, the full diagnostic payload
> for any failure, and the final safety-gate results. If Drawing passes in
> full, report Freeform/Map fixture availability and stop. Leave the
> candidate uncommitted and unstaged.

### 25h. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 26. Row-5 double-click event-chain failure (2026-07-28, CTO)

Issued at governance HEAD `b4534cfbbdc953bda7a4e4e0a31b28e99446814b`.
Candidate verified: **9** dirty paths, uncommitted, unstaged, frozen
hashes unchanged.

### 26a. The §25 correction worked and must not be reverted

The handle-presence signal reported the truth: `point-handle: 0`,
`midpoint-handle: 0`, edit mode never entered. Under the old cursor
signal this same run would have reported `cursor: move` and been equally
ambiguous between "no edit mode" and "selection lost" — here it is
unambiguous, and the run additionally produced the event chain that makes
this section possible. **§25 is validated by this failure**, not
questioned by it. Rows 1–4 passing and row 5 failing with a complete
payload is the instrumentation doing its job.

### 26b. The downstream chain is PROVEN — not a hypothesis

From the run's event log plus source, the following is established and is
bound as fact:

1. `mousedown` lands on the exact hit path → `handleLineDragStart` runs →
   `setDraggingLine({ lineId })` and `onSelectLine(lineId)`
   (`SimpleLineRenderer.tsx:379-380`). **Selection is set.**
2. `mouseup` lands on the `<svg>`, **not** the path. Down-target and
   up-target now differ.
3. Per DOM UI Events, `click` is dispatched on the **nearest common
   ancestor** of the down and up targets — the canvas wrapper `DIV`,
   exactly as the run recorded. **`handlePathClick` never runs.**
4. Because `handlePathClick` never runs, its `e.stopPropagation()`
   (`:577`, commented *"Always stop propagation to prevent canvas
   deselect"*) never runs.
5. The click therefore reaches the canvas wrapper's `onClick`
   (`CanvasClient.tsx:6123-6147`), which calls `setSelectedLineId(null)`
   and `setLineEditModeId(null)`. **Selection is lost; the front layer
   z-index falls back to 10** — precisely what the run measured.
6. `dblclick` is dispatched on the same common ancestor, so
   `handlePathDoubleClick` never receives it. **Edit mode is never
   entered.**

**A product assumption is provably violated.** The wrapper comment at
`:6130-6131` states: *"Interactions on the line/path/handles call
stopPropagation, so they won't reach here."* That guarantee holds only
when the click's target **is** the line. When mouseup leaves the path, the
click retargets to an ancestor and the guard silently fails open — the
canvas deselect fires on what the user experienced as a click on the line.

### 26c. Classification: **J — unresolved**, on the one link that matters

Steps 2 through 6 are proven. **Step 2's cause — why `mouseup` targets the
`<svg>` rather than the path — is not**, and I will not guess it. Four
mechanisms have been asserted and falsified in this patch (§13b `points`,
§17b bridge overlay, §20b full-width clip, and the §22 correction to my
own §17b reasoning). A fifth guess would cost another cycle.

**A, C, D and E all remain live** and are separated by one instrumented
run. What source contributes:

- **Not F.** The run shows selection *set* on mousedown and lost only at
  the click. z-index drops as a *consequence* of step 5, not a cause of
  step 2.
- **Not G, on current evidence.** The Drawing bridge
  (`DrawingLayout.tsx:3033-3041`) is an ancestor with capture-phase
  handlers, and its target resolution is back-plane scoped
  (`data-line-renderer="back"`, `:2853-2867`). The fixture line is
  front-plane. Not excluded, but unsupported.
- **B is partially implicated but insufficient.** `handleLineDragStart`
  does call `preventDefault()` and `stopPropagation()` (`:370-371`), but
  neither retargets `mouseup`; `preventDefault` on mousedown does not
  suppress or retarget click. It cannot by itself explain step 2.

**One candidate-specific possibility must be tested explicitly:**
`clip-path` is candidate-introduced, and it affects hit-testing. §21
observed handles topmost with containment engaged, but that was in a
*different* state (post-edit-mode, not mid-mousedown, and not during a
drag-state re-render). **The `clipPath: none` comparison is mandatory
here** and is the single highest-value control in §26d.

### 26d. Required diagnosis (bind) — read-only

One disposable Drawing fixture, rows 1–4 prefix replayed as in §24. **No
`force: true`. No worktree. No timeout increase. Real Arrow Post
untouched.** Do not mutate application state directly.

**Test each input sequence separately from an identical, field-proven
reset state**, at the exact verified hit-path coordinate:

1. `page.mouse.dblclick` (current spec method)
2. `locator.dblclick` on the exact hit path
3. `dispatchEvent('dblclick')` on the exact hit-path node
4. two complete click sequences, zero movement
5. mousedown/mouseup pairs, positioned, no movement
6. pointerdown/pointerup, if the product listens to pointer events

**For every sequence record:** each of `pointerdown`, `mousedown`,
`pointerup`, `mouseup`, `click` (both), `dblclick` — with target tag,
`data-line-id`, `data-line-role`; whether pointer capture exists
(`hasPointerCapture` / any `setPointerCapture` call); whether the
hit-path node stays attached; its bounding rect **before and after each
event**; the selection filter after each event; the front-layer z-index
after each event; dragging state after each event; whether
`handlePathDoubleClick` fires; and whether exact-line handles appear.

**The rect-per-event capture is the decisive measurement** — if the path's
rect shifts between mousedown and mouseup, mechanism A is confirmed
directly; if it is unchanged, A is excluded and C/D/E remain.

**Mandatory control — containment:** repeat sequence 1 with **only** the
line-layer `clipPath` neutralized by read-only DOM styling. If the mouseup
target becomes the path, this is a **candidate-introduced production
regression** — stop immediately and return for a production ruling. If
unchanged, the candidate is excluded and the defect is pre-existing.

**Drag-state control:** before the second click, record whether
`draggingLine` remains active. If it can be completed or cancelled through
normal product flow, do so, then issue the second click and record whether
`dblclick` reaches the hit path. **Do not mutate state directly.**

Report `git status --porcelain` count **and full list** before and after —
expect **9**.

### 26e. Supported-path ruling

Decided in advance, so the outcome cannot be argued afterward:

- **Any real pointer sequence (2, 4, 5, 6) reaches
  `handlePathDoubleClick`** ⇒ the current `page.mouse.dblclick` is not
  equivalent to real user input on a draggable path (**D**). **Spec-only
  correction** to that sequence. Harness defect.
- **All real pointer sequences fail, `dispatchEvent` succeeds** ⇒ classify
  as **H — the product's double-click route is functionally unreachable
  through real input.** `dispatchEvent` may then be used **only** as
  explicitly-ruled characterization of the intended route, must faithfully
  exercise the registered `onDoubleClick` handler, and must **never**
  mutate application state. It is **not** proof of usability, and the
  document must record that the user-facing path is broken. That would be
  a **product defect requiring its own patch** — PATCH-117 would then need
  a fresh scope ruling, because its allowlist does not authorize fixing
  the click-target/deselect interaction.
- **`clipPath: none` changes the outcome** ⇒ candidate-introduced
  regression. Stop; production ruling required. Containment and row 13 may
  not be weakened.

**Regardless of outcome, the §26b finding stands on its own:** a click
whose down-target is a line but whose up-target is not will deselect the
line via `CanvasClient.tsx:6123-6147`. Whether that is reachable by a real
user is exactly what §26d must establish. **It must not be recorded as
harness-only without that evidence.**

### 26f. Correction scope and amendment

**No production change is authorized by this section.** No spec change is
authorized either — this is **diagnosis only**. `SimpleLineRenderer.tsx`,
`DrawingLayout.tsx` and `SimpleLineRenderer.test.tsx` remain frozen;
production stays **2 of 3**.

**A governance amendment will be required only** if the outcome is **H**
or a candidate regression — both put the fix outside PATCH-117's current
allowlist. A spec-only sequence correction needs no amendment.

### 26g. Certification and wait budget

**No row certified.** Seventh incomplete matrix. The §25 wait-budget
reduction to a declared worst case of **150,250 ms** stands and is
unaffected; the run failed on an assertion, not a budget exhaustion —
row 5 failed at 2,382 ms, well inside its bound.

### 26h. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 27. §26 reset-proof failure — the row-3 PASS signal is invalid (2026-07-28, CTO)

Issued at governance HEAD `eb93ee515f9fafbc48ac2f2ab85d5fb61270718e`.
Candidate verified: **9** dirty paths, uncommitted, unstaged, frozen
hashes unchanged.

### 27a. The hard stop was correct

The §26 diagnosis stopped before sequences 1–6 because §26d's mandatory
"identical, field-proven reset state" was not established. That was the
right call: entering the event-chain experiment from an unproven state
would have produced a seventh unfalsifiable result. **Classification J
stands for §26 — the governed experiment was never entered**, and no
statement about `page.mouse.dblclick`, `locator.dblclick`,
`dispatchEvent`, click pairs, down/up pairs, pointer sequences, or the
`clipPath: none` control may be recorded.

### 27b. Classification G — the spec's row-3 PASS signal is itself wrong

Provable from source; no run was required to reach this.

`selectExactLineByVisibleFilter`
(`e2e/characterization/drawing-overlay-containment.spec.ts:540-567`) is
the entire row-3 interaction. Its sequence is:

1. `:547` resolve the verified hit-path coordinate.
2. `:548` `page.mouse.move(point.x, point.y)`.
3. `:551` `page.mouse.down()`.
4. `:553-557` poll `visiblePathFilter` for `drop-shadow`, **while the
   mouse button is still held down**.
5. `:558` `page.mouse.up()`.
6. `:560-566` compute `elapsedMs`, assert on the filter value **captured
   at step 4**, and return.

**The function never re-reads the selection filter after
`page.mouse.up()`.** Row 3 itself (`:1350-1354`) then asserts only
`exactHitPath()` count `=== 1` and screenshots. So row 3 asserts that
selection *becomes* true during mousedown. It does **not** assert, and
has never asserted, that selection *survives* the interaction that set
it.

This is not a reproduction defect. **A byte-perfect replay of row 3 also
ends unselected**, because the clearing happens inside row 3's own
`mouse.up()`/`click` — after the only measurement row 3 takes. Therefore
**A is excluded as the explanation**: no fidelity improvement to the
replay could have produced a selected reset state.

The mechanism is §26b, already bound as fact, applied one row earlier:
mousedown on the hit path sets selection
(`SimpleLineRenderer.tsx:379-380`); if mouseup leaves the path the
`click` retargets to the nearest common ancestor, `handlePathClick`'s
`stopPropagation` (`:577`) never runs, and the wrapper `onClick`
(`CanvasClient.tsx:6123-6147`) calls `setSelectedLineId(null)`.

**The measured reset state is internally consistent and is trusted.**
Front-layer z-index derives from
`isLineMode || selectedLineId || isEditMode ? 1000 : 10`
(`SimpleLineRenderer.tsx:656/668`). The reported z-index of **10**
independently corroborates that all three are false — the reset
measurement is not a stale or mis-scoped read.

**What remains open is only the destination, not the finding.** Whether
selection is lost at row 3's own `click` (§26b chain) or at row 4's
`selectLineTool` sidebar click / `Escape` (`:1356-1362`) is unmeasured.
Both leave row 3's assertion equally unable to prove survival. The
authorized diagnostic exists to separate them, not to re-establish 27b.

### 27c. The §26d reset requirement is INVALID as written

Row 5's real entry state is **unselected**, and correctly so:

- Row 3 does not leave selection standing (27b).
- Row 4 activates the line tool, toggles it off, and presses `Escape`
  (`:1356-1362`) — a sequence that is not required to preserve any prior
  line selection.
- Row 5's own recorded failure payload showed selection filter `none` and
  z-index 10, consistent with an unselected entry.
- Row 5's product path is a double-click on the hit path **from an
  unselected state**; its own mousedown is what sets selection.

**§26d's reset precondition demanding `exact line selected: true` is
struck.** It demanded a state the governed matrix never reaches, so it
would have made the diagnosis reproduce a scenario row 5 does not have.
**Every other §26d requirement stands unchanged** — the six sequences,
per-event rect capture, the mandatory `clipPath: none` control, the
drag-state control, no `force: true`, no worktree, no timeout increase,
read-only DOM inspection only.

**Row 4 is not required to preserve selection.** No row in §5 asserts
cross-row selection persistence, and none may be added by this section.

### 27d. Authorized correction — diagnostic only, exactly one file

**Exactly one file may change:**

```
e2e/characterization/drawing-overlay-containment.spec.ts
```

**No production file may change.** `SimpleLineRenderer.tsx`,
`DrawingLayout.tsx` and `SimpleLineRenderer.test.tsx` remain **frozen
byte-for-byte**; production stays **2 of 3**.

**Two changes only:**

1. **A bounded, temporary diagnostic** — one `test.step`, or one
   `test.describe`-scoped test, that runs **rows 1–4 only** and stops.
   It must **not** run rows 5–21 and must **not** rerun the full matrix.
2. **No change to row order, row content, acceptance criteria, timeouts,
   `test.step` structure, row 13, or §22's coordinate helper.** The
   existing 21-row test is untouched.

The row-3 and row-4 interactions inside the diagnostic must **call the
existing helpers directly** — `selectExactLineByVisibleFilter`,
`selectLineTool`, `toggleLineToolOff`, `verifiedHitPathPoint` — never a
reimplementation or approximation of them. Method, selector, coordinate
and wait logic must be the shipped ones.

**Seven checkpoints, in order:**

1. before the row-3 interaction
2. immediately after `page.mouse.down()` inside row 3
3. immediately after `page.mouse.up()` inside row 3 — **the decisive
   checkpoint**
4. immediately before row 4
5. immediately after the line tool turns on
6. immediately after `Escape` with the line tool off
7. immediately before the §26 reset proof

Checkpoints 2 and 3 require a temporary instrumented copy of the row-3
sequence **inside the diagnostic only**; `selectExactLineByVisibleFilter`
itself must not be modified.

**At every checkpoint record:** the `visible-path` computed filter;
`selectedLineId` if inspectable without mutation; front-layer computed
z-index; exact-line `hit-path` count; `document.elementFromPoint` at the
row-3 coordinate (tag, `data-line-id`, `data-line-role`); line-mode
state; edit-mode state; dragging state; sidebar state; and the full
`selectionDiagnosticDump` payload. Assemble the whole record **before**
asserting — the §19 payload rule applies.

**Also record, for row 3 specifically:** the target of every
`pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click` in the row-3
interaction, with tag, `data-line-id` and `data-line-role`. This is what
distinguishes 27b's two live destinations.

**It must run through the real Playwright runner** — not a standalone
Chromium script. The §26 non-equivalence question (H, input synthesis)
is not settled and cannot be settled by a raw script.

One disposable fixture. Real Arrow Post untouched. No mutation of
application state. `git status --porcelain` count **and full list**
before and after.

### 27e. Supported-path ruling

Decided in advance:

- **Selection is present at checkpoint 2 and absent at checkpoint 3** ⇒
  27b confirmed live at row 3's own click. Row 3's assertion is
  corrected to record the post-`mouse.up()` filter as an explicit
  characterization observation, and §26b is upgraded from proven-by-
  reasoning to proven-by-measurement at two independent call sites.
- **Selection survives checkpoint 3 and is absent at 5 or 6** ⇒ **B/D/E**
  — a sequence/state finding at row 4. Record the exact clearing event.
  Row 5 still correctly begins unselected; no reselect is added.
- **Selection survives all seven checkpoints** ⇒ the standalone §26
  replay was not equivalent to the runner (**H on input synthesis**).
  Return directly to the §26d event-chain diagnosis using the runner
  path, with the struck selection precondition replaced by the observed
  state.
- **Selection flickers true then false within one checkpoint window** ⇒
  **I**; record the exact event and timing before classifying.

**In every outcome, 27b stands**: row 3's PASS signal proves onset, not
survival, and must never again be cited as evidence that a line is
selected at any later row.

### 27f. Scope and amendment

**No production change is authorized.** **No acceptance-criterion change
is authorized.** No row may be added, removed or reordered. The
diagnostic is temporary and must be removed before the next full matrix
run; it may not remain in the shipped spec.

**No governance amendment is required for this section.** §5's rows are
unchanged in content, count and order; §26d's struck precondition was a
diagnosis precondition, never an acceptance criterion.

### 27g. Next GPT-5.5 instruction (bind)

> **Implementation/diagnosis engineer role only. Read PATCH-117 §27
> first — authoritative, and it strikes one §26d precondition. Do not
> issue governance rulings, edit `.fable5`, or begin PATCH-118. Do not
> commit.**
>
> Safety gate before and after: `git status --porcelain` (full list),
> `git diff --cached --name-status` (empty), `git worktree list` (one),
> `git stash list` (empty). Record the three frozen hashes before and
> after — any change is a hard stop. **No worktree. No `force: true`.
> No timeout increase.**
>
> **Exactly one file may change:**
> `e2e/characterization/drawing-overlay-containment.spec.ts`, and only
> by adding the temporary bounded diagnostic described in §27d. The
> existing 21-row test, its row order, its acceptance criteria and its
> timeout constants are untouched.
>
> Run **rows 1–4 only**, through the real Playwright runner, on one
> disposable fixture. Record the seven checkpoints of §27d with every
> listed field, plus the row-3 per-event target list. Stop after
> checkpoint 7. **Do not run rows 5–21. Do not run the full matrix.**
>
> Report: the value of each field at each of the seven checkpoints; the
> first event at which selection becomes true; the first event at which
> it becomes false; the row-3 mouseup and click targets; and the final
> safety-gate results. Then stop and return for the §27e ruling. Leave
> the candidate uncommitted and unstaged.

### 27h. Certification

**No row certified.** Row 3's four prior PASSes are **not retracted** —
they correctly recorded that selection onset occurs — but they are
**re-scoped**: they are evidence of onset only, and carry no weight as
evidence of persistence. Rows 1, 2 and 4 are unaffected. Eighth
incomplete matrix. The §25 wait budget (declared worst case
**150,250 ms**) is unchanged.

### 27i. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 28. §27 diagnostic accepted; §26 continuation authorized on a corrected reset (2026-07-28, CTO)

Issued at governance HEAD `4eeb546372fc49fb5414e2cb57cbdb3225126d46`.
Candidate verified: **9** dirty paths, uncommitted, unstaged; frozen hashes
unchanged (`8966233d…`, `86e84e65…`, `df759afb…`).
Trace present:
`test-results/drawing-overlay-containmen-c28fc-lection-survival-diagnostic-characterization/trace.zip`.

### 28a. Findings accepted and bound

The rows 1–4 diagnostic ran through the real Playwright runner and passed.
The following are **bound as fact**:

- **Row 3 proves selection onset only.** Filter `none` / z-index 10 before;
  `drop-shadow` / z-index 1000 immediately after mousedown; the product
  selection branch activated.
- **Row 3 itself clears the selection it sets.** Before row 4: filter
  `none`, z-index 10.
- **Row 4 does not clear selection** — there was none left to clear. Line
  mode on raises z-index to 1000 *only* through `isLineMode`, with the
  filter still `none`, exactly as
  `SimpleLineRenderer.tsx:656/668` predicts.
- **`Escape` does not clear selection.** Filter `none` before and after.
- **§26 must begin from an unselected line.** The `exact line selected`
  reset precondition struck in §27c **remains struck**, now on measured
  evidence rather than source reasoning alone.

**§27's classification G is confirmed live.** Row 3's four historical
PASSes remain re-scoped to onset-only evidence, not retracted.

### 28b. One reported finding is NOT accepted as stated — and it matters

The report states that at pointerup/mouseup the front-layer z-index **had
already returned to 10**, which would place the selection loss *before* the
click and would contradict §26b step 5, which this document bound as fact.

**That inference is not supported by the measurement taken.** A checkpoint
read after `page.mouse.up()` resolves is necessarily taken **after the
browser has already synthesized and dispatched `click`** — `mouseup` and
`click` dispatch in the same task. A post-hoc read therefore **cannot
distinguish** "cleared at mouseup" from "cleared at the click." The
observation is real; the ordering conclusion drawn from it is not
established.

**§26b step 5 is therefore neither confirmed nor contradicted by this run.
It stands as previously bound, with its timing now explicitly marked
unproven.** The report's own item 4 — wrapper deselection path executed —
remains consistent with §26b; a wrapper handler that runs after the state
is already null is indistinguishable from one that nulls it, by this
instrumentation.

**Required correction in §28d:** selection filter and front-layer z-index
must be captured **synchronously inside real `mouseup` and `click`
listeners**, in the handler body, not by a checkpoint read afterwards.
Only that ordering is admissible for a claim about when selection is lost.

### 28c. New source finding — mechanism A is materially elevated

`SimpleLineRenderer.tsx:472-491` registers a **window-level `mouseup`
listener** (`:494`) whose handler:

1. cancels any pending RAF (`:474-477`);
2. resolves the dragging line id (`:479`);
3. calls **`onSaveLine(id, …)`** when `persistenceIntent.shouldPersist`
   (`:485-488`);
4. clears `draggingPoint` and `draggingLine` (`:489-490`).

**This fires on a plain click with zero movement**, because
`handleLineDragStart` (`:379-380`) sets `draggingLine` on mousedown and no
movement is required to reach the commit path. A simple press-and-release
on a line therefore issues a **persistence commit**, whose refresh can
re-render or remount the line layer.

That is a direct, source-backed candidate for **mechanism A** — the path
moving or remounting between mousedown and mouseup — and it is the reason
§26d's per-event rect capture is the decisive measurement. It is a
**candidate mechanism, not a finding**; four prior mechanisms in this patch
were asserted and falsified, and this one is not exempt.

The window listener is **pre-existing** — it is outside both candidate
diffs. Whether a zero-movement click *should* trigger a save is a
legitimate product question and is **explicitly out of scope for
PATCH-117**; it is recorded here for the successor patch and must not be
touched.

### 28d. §26 continuation — AUTHORIZED, diagnosis only

**Corrected reset state, required before each sequence** (replaces §26d's
struck precondition in full):

- exact line **unselected**
- selection filter `none`
- front-layer z-index `10`
- line mode off
- edit mode off
- dragging state clear
- sidebar open
- geometry unchanged
- `coord_space` `scene`
- exact verified hit-path coordinate valid
- `document.elementFromPoint` at that coordinate is the **exact hit path**

`selectedLineId` and `drop-shadow` are **not** required before a sequence
and must not be asserted.

**All six sequences stand, unchanged and run separately:**

1. `page.mouse.dblclick`
2. `locator.dblclick`
3. direct DOM `dblclick` dispatch on the exact hit-path node
4. two complete click sequences, zero movement
5. explicit mousedown/mouseup pairs, positioned, zero movement
6. `pointerdown`/`pointerup`

**Record for every sequence:** complete event order and targets (tag,
`data-line-id`, `data-line-role`); hit-path bounding rect **before and
after every event**; hit-path attachment and fingerprint; both
`elementFromPoint` **and the full `elementsFromPoint` stack** at the
coordinate; selection filter; front-layer z-index; dragging state; edit
mode; handle counts; pointer capture (`hasPointerCapture` and any
`setPointerCapture` call); whether `handlePathDoubleClick` fires.

**Plus, mandatory per §28b:** filter and z-index captured **synchronously
inside real `mouseup` and `click` listeners**, in the handler body.

**Plus, mandatory per §28c:** record whether an `onSaveLine`-driven
update/refresh occurs between mousedown and mouseup, and whether the
hit-path fingerprint changes across it. This is read-only observation of
what the product already does — **do not suppress, stub or intercept the
save.**

**Mandatory controls, unchanged:**

- sequence 1 repeated with **only** the line-layer `clipPath` neutralized
  through read-only DOM styling
- drag-state completion/cancellation through normal product flow where
  possible, never by direct state mutation
- **no `force: true`**; **no source or spec edit**; **no timeout
  increase**; **no full matrix**; **real Arrow Post untouched**; one
  disposable fixture; no worktree

`git status --porcelain` count **and full list** before and after.

### 28e. Classification: **J**, unchanged, and correctly so

The §27 diagnostic answered the reset question. It did **not** address why
pointerup/mouseup leave the hit path, and nothing in it licenses a new
classification. **A, C, D and E remain live**; **F** and **G** remain
excluded on prior evidence; **B** remains insufficient. **A is now the
best-supported candidate** on §28c's source finding, and is separated from
the rest by one measurement — the per-event rect.

**Results for the six sequences, the first event at which targeting leaves
the hit path, whether the rect changes, whether pointer capture occurs,
whether dragging remains latched, the `clipPath: none` comparison, which
methods reach `handlePathDoubleClick`, and which methods render handles are
all outputs of the diagnosis authorized here. They do not exist yet and
must not be recorded, predicted or inferred.**

### 28f. Outcome table — preserved verbatim in force

- **Another real pointer sequence (2, 4, 5, 6) works** ⇒ harness/input-method
  issue (**D**); possible **spec-only** correction to sequence 1.
- **Only direct dispatch works** ⇒ the real product double-click route is
  unreachable by real input (**H**); **production scope ruling required**,
  outside PATCH-117's allowlist. `dispatchEvent` is characterization only
  and never proof of usability.
- **`clipPath: none` changes behaviour** ⇒ **PATCH-117 candidate
  regression**; stop immediately; production ruling required. Containment
  and row 13 may not be weakened.
- **All real sequences fail** ⇒ classify as a **product defect, not
  harness-only.**

### 28g. Scope, amendment and cleanup

**Narrowest authorized correction: none to production, none to the spec's
acceptance criteria.** This section authorizes **diagnosis only**. The
three frozen files remain frozen byte-for-byte; production stays **2 of
3**.

**No governance amendment is required now.** §5's rows are unchanged in
content, count and order. An amendment becomes required **only** on outcome
**H** or a candidate regression.

**Cleanup, still owed from §27f:** the temporary rows 1–4 diagnostic added
to `e2e/characterization/drawing-overlay-containment.spec.ts` **must be
removed before the next full matrix run** and may not ship. It may remain
in place for this §26 continuation.

### 28h. Next GPT-5.5 instruction (bind)

> **Implementation/diagnosis engineer role only. Read PATCH-117 §28 first —
> authoritative; it corrects one §26d precondition and adds two mandatory
> captures. Do not issue governance rulings, edit `.fable5`, or begin
> PATCH-118. Do not commit.**
>
> Safety gate before and after: `git status --porcelain` (full list),
> `git diff --cached --name-status` (empty), `git worktree list` (one),
> `git stash list` (empty). Record the three frozen hashes before and after
> — any change is a hard stop. **No worktree. No `force: true`. No timeout
> increase. No full matrix. Real Arrow Post untouched.**
>
> **No source edit. No spec edit.** Instrumentation is read-only page
> evaluation only.
>
> One disposable Drawing fixture. Establish the §28d corrected reset state
> and prove all eleven of its conditions **before each of the six
> sequences**. Do not require or assert `selectedLineId` or `drop-shadow`
> beforehand.
>
> Run the six §28d sequences **separately**, recording every listed field —
> including the full `elementsFromPoint` stack, the per-event rect before
> and after every event, and the filter/z-index captured **synchronously
> inside real `mouseup` and `click` handlers** (§28b). Record whether an
> `onSaveLine` refresh occurs between mousedown and mouseup and whether the
> hit-path fingerprint changes across it (§28c) — observe only, never
> suppress it.
>
> Then run both mandatory controls: sequence 1 with only the line-layer
> `clipPath` neutralized via read-only DOM styling, and the drag-state
> completion/cancellation control through normal product flow.
>
> **Stop immediately and return** if the `clipPath: none` control changes
> the mouseup target — that is a candidate regression requiring a
> production ruling.
>
> Report all six sequence results, both controls, and the final safety-gate
> results. Leave the candidate uncommitted and unstaged.

### 28i. Certification

**No row certified.** The §27 diagnostic certifies no matrix row; it is
characterization of rows 1–4 state only. Ninth incomplete matrix. The §25
wait budget (declared worst case **150,250 ms**) is unchanged.

### 28j. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 29. Classification H accepted; the fix is routed to a successor patch (2026-07-28, CTO)

Issued at governance HEAD `a15a0fb5cabda3c299b2c23f313a7fcfcc999fba`.
Candidate verified: **9** dirty paths, uncommitted, unstaged; frozen hashes
unchanged (`8966233d…`, `86e84e65…`, `df759afb…`).
Trace present:
`test-results/drawing-overlay-containmen-073ef-ain-continuation-diagnostic-characterization/trace.zip`.

### 29a. Classification H — ACCEPTED and bound

All four real mouse routes (sequences 1, 4, 5 and the real-input portion of
2) fail to reach `handlePathDoubleClick`. Only direct DOM dispatch reaches
the registered handler, and per §26e that is characterization only and is
**not** proof of usability.

**The intended double-click-to-edit route is unreachable through normal
real mouse input. This is a real product defect, not a harness defect.**

**The PATCH-117 candidate is EXCLUDED as the cause**, on the controls:
`clipPath: none` does not change the failure; hit-path rect delta is 0 px;
no pointer capture; no save request; no geometry change; no detach, remount
or fingerprint change. Combined with §28c's `onSaveLine` candidate being
falsified by "no save request occurs", **the defect is pre-existing** and
is unrelated to containment, to the §25 handle signal, and to the wait
budget.

**The §25 handle-presence signal is vindicated a second time.** It reported
"no edit mode" truthfully in a case where edit mode genuinely never
activated.

### 29b. Two source contradictions in the reported findings — flagged, not accepted

**(1) The up-target identity is NOT established.** The report names the
pointerup/mouseup target as "SVG". `SimpleLineRenderer.tsx:666` sets the
layer `<svg>` to `pointerEvents: (isLineMode || forcePointerEvents) ? 'auto'
: 'none'`. `forcePointerEvents` defaults to `false` (`:219`), and the
governed reset state has **line mode off**. An element with
`pointer-events: none` **cannot be a hit-test target**. Therefore the
reported "SVG" is either a different `<svg>` element (the back line layer,
the Excalidraw surface, or another ancestor), or the identification is
imprecise. **The retarget destination is unproven and must not be recorded
as the front line layer.**

**(2) Sequence 6 proves nothing about real pointer hit-testing.** It is
described as a DOM-dispatched `pointerdown`/`pointerup` sequence. Events
dispatched directly on a node necessarily "remain on the hit path" —
that is a property of `dispatchEvent`, not of hit-testing. It may **not**
be read as evidence that real pointer events stay on the path. Sequence 1
shows the opposite for real input: **targeting first leaves the hit path at
`pointerup`.**

Consequence for mechanism selection: **under real input, every event from
`pointerup` onward leaves the path. `mousedown`/`pointerdown` is the only
event proven to land on the line.** Any correction that depends on a
later event remaining on the path is unsupported.

**The DOM-level cause of the retarget remains unproven.** Every mechanical
control returned negative — nothing moves, nothing remounts, nothing
captures. That is a legitimate open question, but it does **not** block a
correction, because the failure condition is stated without reference to
cause: *the down-target is a line and the up-target is not.* A correction
conditioned on that observable is robust to whichever mechanism is
eventually identified. **It must not be described as a root-cause fix.**

### 29c. Mechanism ruling

- **C alone is INSUFFICIENT.** Suppressing wrapper deselection preserves
  selection but does not make `dblclick` reach the path, so edit mode still
  never activates. It satisfies one required behaviour and fails the
  central one.
- **A and B are REJECTED as the primary mechanism.** A drag threshold
  changes when persistence and movement begin — real behavioural surface
  affecting rows 14, 15 and 21 — while leaving the retarget untouched. The
  diagnosis proved zero movement and zero geometry change already, so a
  threshold addresses a problem this defect does not have.
- **D is REJECTED as stated**, on §29b(2): no post-`pointerdown` real
  pointer event is proven reachable on the path.
- **E is REJECTED.** Preserving hit-testing across the double-click window
  is a timing-shaped workaround of the forbidden kind.
- **F is CHOSEN**, in one specific form: **derive the line's
  double-activation from the two `mousedown`/`pointerdown` events that
  provably land on the hit path, and suppress the wrapper deselection route
  only for the interaction whose originating down-target was that line.**
  Both halves key off the one proven-reachable signal. C is retained as the
  subordinate half of F, not as the mechanism.

**Preference stands: the correction must be local to
`SimpleLineRenderer.tsx`.** Global canvas click semantics may not be
changed. `CanvasClient.tsx` is **not authorized**; if the implementer can
show from source that no local correction satisfies every required
behaviour, they must **return for a further amendment**, not widen scope.

**No drag-threshold behaviour is introduced.**

**Single-click selection survives wrapper deselection** by the F-suppression
half: the wrapper deselect is neutralized only when the originating
down-target was that line. **Click-away deselection is preserved** because
a click whose down-target is not a line is untouched — that is the entire
existing click-away path and it is unmodified.

### 29d. Patch identity — this requires a SUCCESSOR PATCH

PATCH-117's declared subject is containment of the Drawing line overlay and
zoom controls; its bound commit message (§10) says exactly that. This
defect is **pre-existing, unrelated to containment, in a different
interaction layer, and proven not to be candidate-introduced**. Folding it
into PATCH-117 would break the patch's identity, invalidate its bound
commit message, and mix an unrelated behavioural change into a containment
acceptance matrix.

**Ruling: the double-click reachability fix is routed to a successor
patch — designated PATCH-119**, so as not to disturb PATCH-118's reserved
purpose. **PATCH-119 is NOT authored and NOT authorized by this section**;
this section records only that the work belongs there.

**No production file is authorized to change under PATCH-117.**
`SimpleLineRenderer.tsx`, `DrawingLayout.tsx` and
`SimpleLineRenderer.test.tsx` remain **frozen byte-for-byte**; production
stays **2 of 3**. The file and test lists below are the *proposed scope for
PATCH-119*, binding on that patch when it is authored, and confer no
authority now:

- production: `components/collabboard/SimpleLineRenderer.tsx` — **only**
- tests: `components/collabboard/SimpleLineRenderer.test.tsx`,
  `e2e/characterization/drawing-overlay-containment.spec.ts`
- `DrawingLayout.tsx` frozen unless source proof shows it indispensable
- `CanvasClient.tsx` not authorized

The nine characterization requirements listed in the request are adopted
verbatim as PATCH-119's required pre-implementation characterization, with
one addition: **prove the up-target identity first** (§29b(1)) — full
ancestry and computed `pointer-events` of the real pointerup target — since
mechanism F's suppression predicate must be written against the actual
element, not against "SVG".

### 29e. Consequence for PATCH-117 — row 5 is deferred, not failed

This is the operative outcome for the patch in hand.

Row 5 exercises a **pre-existing product defect that PATCH-117 did not
cause, is not authorized to fix, and cannot fix within its scope.** It is
therefore **not a PATCH-117 failure**.

**Row 5 is DEFERRED to PATCH-119** and recorded as *blocked — pre-existing
defect, candidate excluded by control*. **Rows 14 and 16 are deferred with
it** if and only if they depend on edit-mode entry through the same route;
the implementer must state which do, from the spec, and defer no others.

**PATCH-117 is therefore no longer blocked on this defect.** The remaining
rows may be certified. This is the ninth incomplete matrix; the next run is
a **complete matrix from row 1** under §25f, with the deferred rows recorded
as deferred rather than skipped silently, and every other row required to
pass.

**Cleanup, owed from §27f and still outstanding:** the temporary rows 1–4
diagnostic and any §28 diagnostic scaffolding must be removed from
`e2e/characterization/drawing-overlay-containment.spec.ts` before that
matrix run.

### 29f. Acceptance criteria (binding on PATCH-119, not on PATCH-117)

A real mouse double-click on the line hit area must invoke the existing
edit-mode transition and render the correct exact-line handles, with **no**
reliance on direct state mutation, `dispatchEvent` acceptance, `force:
true`, test-only production branches, arbitrary delays, timeout increases,
or globally disabling canvas deselection.

All of the following must be preserved and proven: whole-line drag;
zero-movement single-click selection surviving mouseup; click-away
deselection; front/back line modes; sidebar and modal containment;
keyboard editing; line geometry and `coord_space`; label interaction;
handle interaction; and no geometry persistence for a zero-movement click
beyond what the product already does today.

### 29g. Amendment status

**A governance amendment IS required — and it is an amendment to a
successor patch, not to PATCH-117.** PATCH-117's §3 production allowlist,
§5 acceptance matrix and §10 bound commit message are **unchanged**, except
that §5's row 5 acquires the deferred status ruled in §29e. No production
allowlist slot is consumed.

### 29h. Next GPT-5.5 instruction (bind)

> **Implementation engineer role only. Read PATCH-117 §29 first —
> authoritative. Do not issue governance rulings, edit `.fable5`, begin
> PATCH-118, or begin PATCH-119. Do not commit.**
>
> **No production file may change.** The three frozen files stay
> byte-for-byte identical; production remains 2 of 3. The double-click
> defect is **not** yours to fix in this patch.
>
> Safety gate before and after: `git status --porcelain` (full list, expect
> **9**), `git diff --cached --name-status` (empty), `git worktree list`
> (one), `git stash list` (empty), and the three frozen hashes. Any change
> to a frozen file is a hard stop. **No worktree. No `force: true`. No
> timeout increase.**
>
> **Exactly one file may change:**
> `e2e/characterization/drawing-overlay-containment.spec.ts`. Do three
> things and nothing else:
>
> 1. Remove the temporary rows 1–4 diagnostic and all §28 diagnostic
>    scaffolding. None of it may ship.
> 2. Mark row 5 **deferred to PATCH-119** — it must report as deferred with
>    a reason, not silently skip and not fail. State from the spec which of
>    rows 14 and 16 depend on edit-mode entry through the same route and
>    defer exactly those; defer no others, and say which you deferred and
>    why.
> 3. Change nothing else — no row order, no acceptance criteria, no timeout
>    constant, no row 13, no §22 coordinate helper.
>
> Run static validation per §25f and report actual output. Then run **one
> complete Playwright matrix from row 1 with `--trace on`**, all standing
> live rules unchanged. Every non-deferred row must pass. Report each row's
> PASS/FAIL/DEFERRED with duration, the full diagnostic payload for any
> failure, and the final safety-gate results. If the Drawing matrix
> completes, report Freeform and Map fixture availability and **stop** —
> Stage 2 remains NOT granted. Leave the candidate uncommitted and
> unstaged.

### 29i. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed, and
**no longer blocked** on the double-click defect.
**PATCH-119: designated for the double-click reachability fix; NOT authored,
NOT authorized.**
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 30. Matrix setup failure before row 1 — diagnosis authorized (2026-07-28, CTO)

Issued at governance HEAD `cbe71ab4c28d1a6812650eca48f1f0cc26acbe8d`.
Candidate verified: **9** dirty paths, uncommitted, unstaged; frozen hashes
unchanged (`8966233d…`, `86e84e65…`, `df759afb…`).

### 30a. §29 spec handling accepted; the run is not evidence against containment

Static validation passed in full, the three frozen hashes are unchanged,
and the §29h spec-only handling is present and correct: row 5 deferred to
PATCH-119, row 14 deferred **with a stated source reason** (it calls
`enterEditModeViaExactHitPath()`), row 16 correctly left executable, and no
§27/§28 diagnostic scaffolding remaining. **§29h items 1–3 are discharged.**

**The run produced no evidence about PATCH-117 containment, for or
against.** It failed in `openDrawing` before row 1; no Drawing row
executed. **It does not count as an incomplete matrix** in the sense the
prior nine did — the candidate was never exercised. The count of incomplete
matrices stays at nine.

### 30b. One reported datum is misleading and must not drive classification

"Cleanup found zero matching disposable PATCH-117 boards" is **expected and
benign**, and is **not** evidence that the fixture never existed.

`cleanupFixture` (`:240-244`) runs inside the test's `finally` block
(`:1596-1602`) and deletes the board unconditionally when `fixture` is
non-null. Any sweep performed *after* the run therefore finds zero by
construction. Further, `cleanupFixture` issues deletes and **never reads a
count**, so it cannot report "zero matched" at all.

**Classifications A and D are therefore unsupported by this datum**, and
positive evidence for either must come from the authorized diagnosis, not
from the post-run sweep. Additionally, `createFixture` throws on every
error path it has (`:187`, `:209`, `:235`), and no such error was reported —
so the boards, padlets and canvas_lines inserts all returned successfully.
**A is further disfavoured**, though not excluded, since the insert
responses were not captured.

### 30c. Leading candidate — **G**, with a specific and testable mechanism

**Classification is J — unresolved — pending measurement.** Five mechanisms
have been asserted and falsified across §§13, 17, 20, 22 and 28c in this
patch; this one gets no exemption and is recorded as a **hypothesis, not a
finding**. But it is specific, artifact-backed, and separable in one cheap
step.

The two identities are constructed by **completely different paths**:

- **Node/fixture identity:** `createClientForLiveUser` (`:155-167`) signs in
  fresh with `signInWithPassword` on every run. It is always valid. This is
  why fixture creation succeeded.
- **Browser identity:** the `characterization` project uses
  `storageState: AUTH_STATE_PATH` = `e2e/.auth/user.json`
  (`playwright.config.ts`, `e2e/helpers/env.ts:25`), produced by the
  `setup` project via `dependencies: ['setup']`.

**The standing live rule mandates `--no-deps`, which skips the `setup`
project.** The browser therefore reuses whatever `e2e/.auth/user.json`
already holds and never regenerates it.

Observed artifact state: `e2e/.auth/user.json` was last written
**2026-07-26 22:58**, roughly **42 hours** before this run. The §27/§28
diagnostics on 2026-07-28 ~15:00 used the *same* unchanged file and
succeeded. Playwright only writes storage state in the `setup` project, so
any in-browser token refresh during those runs was **not** persisted back
to the file. Under refresh-token rotation, a refresh consumed during the
15:00 run invalidates the token still stored on disk — which would make the
browser unauthenticated from that point on, while the Node client continues
to work.

**This account fits every observation**: creation succeeded; the canvas
route rendered rather than redirecting; the application reported "Canvas
not found" (an RLS-empty read, not a 404 route error); and `/` and `/auth`
returned 200. It also explains why the identical setup path passed 90
minutes earlier and fails now.

**It is not established.** Classifications B, C, E, F, H and I remain live
and are separated by the same single measurement.

### 30d. Bounded diagnosis — AUTHORIZED, read-only

Through the real Playwright runner. **No production edit. No full matrix.
No timeout increase. No `force: true`. No worktree. Real Arrow Post
untouched.** One disposable fixture; **stop after `openDrawing`**, pass or
fail.

Record all twelve items from the request, and specifically:

1. the fixture creation requests and **response bodies** (boards, padlets,
   canvas_lines), not merely the absence of a thrown error
2. the exact created board id, and the padlet and canvas_line ids
3. an authoritative read-back of the board **immediately before**
   `page.goto`
4. the exact URL passed to `page.goto`
5. **the browser's auth identity at the moment of failure** — read from the
   page's own session, and compare it to the Node client's `getUser()` id.
   **This is the decisive measurement.**
6. every network request the canvas page makes, with status and response
   body for the request that resolves the canvas — flagging any 401, 403,
   404, empty result set or `PGRST116`
7. the URL and DOM state when "Canvas not found" renders
8. an authoritative read-back of the board **at that exact moment**, from
   the Node client
9. whether cleanup had run at that point (it must not have)

**Credentials are never printed.** Report the auth identity as a user id
only — never the email, never a token, never any part of one.

**Controlled variants, in this order, and only these:**

1. current setup path, unchanged — establish the baseline failure
2. **regenerate the storage state by running the `setup` project** (drop
   `--no-deps` for that project only), then repeat variant 1. This tests
   30c directly and is the highest-value control.
3. bounded authoritative read-back before navigation — **only if** the
   read-back at item 3 shows the record absent or delayed
4. navigate using the exact returned identifier rather than any derived id
   — **only if** item 4 shows a mismatch

**No arbitrary retries. No arbitrary sleeps.** If variant 2 passes and
variant 1 fails, 30c is confirmed and variants 3 and 4 are not run.

Report `git status --porcelain` count **and full list** before and after.

### 30e. Correction scope

**No production change is authorized.** The three frozen files stay
byte-for-byte; production remains **2 of 3**. This is an environment,
harness or auth question until proven otherwise, and none of those live in
product code.

**A spec-only setup correction is authorized in advance for one thing
only**, because it is a pure diagnostic improvement with no acceptance
impact: `openDrawing` (`:266-271`) must **fail fast with a stated reason**
when the page renders "Canvas not found", instead of spending
`INITIAL_LOAD_TIMEOUT_MS` waiting for a title that will never appear and
reporting a bare `TimeoutError`. The failure message must include the
navigated URL and the observed page state. **No timeout may be increased**,
and no other behaviour of `openDrawing` may change.

**Any other correction requires a further ruling.** In particular:

- If 30c is confirmed, the fix is a **run-procedure change** — regenerate
  the storage state before a live matrix — not a file change. It consumes
  **no allowlist slot**. The standing `--no-deps` rule is amended by §30f.
- `auth.setup.ts`, `e2e/helpers/env.ts` and `playwright.config.ts` are
  **not authorized** to change.
- If the resolving request **succeeds** and the UI still says "Canvas not
  found", that is an application loading defect requiring a production
  ruling and a successor patch — **not** a PATCH-117 change.

### 30f. Amendment to the standing live rule

The standing live-run rule "`--no-deps`" is **amended**: it remains in force
for avoiding unrelated project dependencies, but it **must not be used to
skip the `setup` project when the browser session is stale or of unknown
age.** Before any live matrix run, the age and validity of
`e2e/.auth/user.json` must be established, and the `setup` project run if
it is stale.

This amendment is procedural. It touches no allowlist, no acceptance
criterion and no row.

### 30g. Whether another matrix may be run

**Yes — exactly one**, and only after the diagnosis identifies the cause
and the fix is applied. The §25f live requirements and the §29h reporting
requirements carry forward unchanged, including deferred-row reporting.
**Do not re-run the matrix speculatively before the diagnosis completes.**

### 30h. Next GPT-5.5 instruction (bind)

> **Diagnosis engineer role only. Read PATCH-117 §30 first — authoritative.
> Do not issue governance rulings, edit `.fable5`, or begin PATCH-118 or
> PATCH-119. Do not commit.**
>
> Safety gate before and after: `git status --porcelain` (full list, expect
> **9**), `git diff --cached --name-status` (empty), `git worktree list`
> (one), `git stash list` (empty), and the three frozen hashes — any change
> to a frozen file is a hard stop. **No worktree. No `force: true`. No
> timeout increase. No full matrix. Real Arrow Post untouched.**
>
> **No production edit.** `auth.setup.ts`, `e2e/helpers/env.ts` and
> `playwright.config.ts` may not change. The only file you may edit is
> `e2e/characterization/drawing-overlay-containment.spec.ts`, and only to
> add the §30e fail-fast in `openDrawing` plus read-only diagnostic
> capture.
>
> Run through the real Playwright runner with one disposable fixture and
> **stop after `openDrawing`**. Record all nine items in §30d, with the
> browser-versus-Node auth identity comparison as the decisive one.
> **Report identities as user ids only — never an email, never a token.**
>
> Run controlled variant 1 (baseline), then variant 2 (regenerate storage
> state via the `setup` project, then repeat). If variant 2 passes and
> variant 1 fails, stop — §30c is confirmed; do not run variants 3 or 4.
> Otherwise run variant 3 or 4 only if §30d's stated precondition for it
> holds. **No arbitrary retries, no arbitrary sleeps.**
>
> Report the classification you can support from the measurements, all
> recorded items, and the final safety-gate results. Then stop and return
> for the §30 follow-up ruling. Leave the candidate uncommitted and
> unstaged.

### 30i. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
Nine incomplete matrices; this attempt is **not** a tenth.
**PATCH-119: designated, NOT authored, NOT authorized.**
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 31. Identity alignment — strategy A, one credential source of truth (2026-07-28, CTO)

Issued at governance HEAD `03ddaa07eb9c4d67e5e7afcb234ce84886708790`.
Candidate verified: **9** dirty paths, uncommitted, unstaged; the three
frozen production/unit hashes unchanged (`8966233d…`, `86e84e65…`,
`df759afb…`).

### 31a. Finding accepted — and the root cause is source-proven

The diagnosis is accepted in full. Two distinct identities, RLS behaving
correctly, fixture present throughout, route identifier correct, HTTP 200
with empty RLS-backed reads, no cleanup collision, application healthy.
**Harness/auth defect. Not a product defect. Not a containment defect.**

**§30c is FALSIFIED and is recorded as such.** Stale storage age was my
leading candidate; variant 2 with freshly regenerated storage failed
identically. That is the sixth mechanism asserted and killed in this patch,
and the §30d variant-2 control is exactly what killed it — the control did
its job.

**The cause is not merely "two identities"; it is two different credential
pairs, and it is provable from source:**

- `e2e/auth.setup.ts` authenticates the **browser** through the real `/auth`
  UI using `E2E_EMAIL` / `E2E_PASSWORD`, imported from
  `e2e/helpers/env.ts` (`:20-21`), then writes `AUTH_STATE_PATH`.
- `createClientForLiveUser`
  (`e2e/characterization/drawing-overlay-containment.spec.ts:155-167`)
  authenticates the **Node fixture client** with
  `requiredEnv('LIVE_ACCESS_EMAIL')` / `requiredEnv('LIVE_ACCESS_PASSWORD')`
  (`:162-163`), read by the spec's own private `readEnvLocal`/`requiredEnv`
  (`:60-78`) — a **duplicate** of the reader in `e2e/helpers/env.ts`.

Two credential pairs, two accounts, two user ids. The spec never consumed
the setup project's source of truth, so the identities were never required
to match and nothing ever checked. **The two reported user ids are the
expected consequence of that source split, not an environment accident.**

This also explains why no earlier run caught it: nothing in the harness
compared the identities, and any run that happened to succeed did so for a
reason that has not been established and must not be assumed.

### 31b. Chosen strategy: **A**, in one direction only

**A is chosen. B, C, D and E are rejected.**

- **B rejected** — creating fixtures through the browser session would
  rewrite `createFixture`, `fetchLine`, `cleanupFixture` and every
  `supabase`-based row assertion (rows 20, 21 and the geometry trace all
  read through the Node client). Large surface, no benefit over A.
- **C rejected** — generating browser storage state from the Node identity
  means minting a session outside the real `/auth` flow. That is token
  injection in substance, and it is prohibited.
- **D rejected** — creating ownership/access grant records changes what the
  fixture *is* and would exercise a sharing path the matrix does not
  characterize. It also risks masking genuine RLS behaviour.
- **E** — nothing better is supported by the source.

**Direction is binding: the Node fixture client adopts the browser's
credentials, not the reverse.** `e2e/auth.setup.ts` is shared by the whole
characterization project; changing which credentials it uses would alter
the identity of every other authenticated spec in the suite. That blast
radius is unacceptable for a PATCH-117 harness fix.

Therefore `createClientForLiveUser` must consume **`E2E_EMAIL` /
`E2E_PASSWORD` imported from `e2e/helpers/env.ts`** — the same values, from
the same module, that the setup project already uses. `LIVE_ACCESS_EMAIL` /
`LIVE_ACCESS_PASSWORD` are no longer read by this spec.

**No new shared auth helper is required, and none is authorized.**
`e2e/helpers/env.ts` already **is** the single source of truth for live-test
credentials; adding a second helper would recreate the split this section
exists to remove. The spec's private `readEnvLocal`/`requiredEnv` may
remain **only** for the non-credential keys it also reads
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the optional
fixture ids).

### 31c. Authorized and prohibited files

**Authorized to change — exactly one:**

```
e2e/characterization/drawing-overlay-containment.spec.ts
```

**Prohibited — must remain byte-for-byte unchanged:**

```
e2e/helpers/env.ts
e2e/auth.setup.ts
playwright.config.ts
components/collabboard/SimpleLineRenderer.tsx
components/collabboard/canvas/layouts/DrawingLayout.tsx
components/collabboard/SimpleLineRenderer.test.tsx
app/dashboard/canvas/[id]/CanvasClient.tsx
.env.local
```

`e2e/helpers/env.ts` already exports everything needed; importing from it
is not a change to it. **No production file is authorized.** Production
remains **2 of 3**.

**Also prohibited, restating the request as binding:** hard-coded user ids,
copied tokens, token injection, minted sessions, RLS bypass, service-role
keys, and any production policy change.

### 31d. Identity equality assertion — required, before any fixture write

The order is binding: **the check must precede the first insert**, so a
mismatch can never create an orphaned board.

1. Obtain the Node fixture-client user id from `supabase.auth.getUser()`.
2. Obtain the **browser's** user id from the browser's own authenticated
   session at runtime — via an authenticated in-page read, not by parsing
   `e2e/.auth/user.json`, and never by decoding a token.
3. Compare the two.
4. On mismatch, **throw immediately**, before `createFixture` performs any
   insert.
5. The message may contain **the two user ids and nothing else.**

**Never expose, log, print, commit or include in any report or annotation:**
email, password, access token, refresh token, cookies, or any part of one.
This extends the standing PATCH-115/117 credential rule to `E2E_EMAIL` /
`E2E_PASSWORD`, which are now in scope for this spec.

The identity pair may be recorded in the test annotation as user ids only.

### 31e. Forward risk that must be recorded, not assumed away

Switching the Node client's identity changes **who owns everything this
spec reads**. The disposable fixture is created fresh each run and is
unaffected. But:

- `PATCH117_LIVE_FREEFORM_CANVAS_ID` / `PATCH114_LIVE_FREEFORM_CANVAS_ID`
  and the Map equivalents (`:1245-1246`) are **pre-existing boards**, and
  their owner is unknown. Under the new identity they may become
  unreadable.
- The real Arrow Post board is **untouched and must stay untouched**, but
  if any future step reads it, the same risk applies.

**Required:** the implementer must report whether each configured Freeform
and Map fixture id is readable by the aligned identity. This does **not**
gate the Drawing matrix, and Stage 2 remains **NOT granted** regardless.
It must be known before any Stage 2 ruling rather than discovered inside
one.

### 31f. §30 fail-fast diagnostics — RETAINED

They **remain part of PATCH-117**. They are spec-only, redacted, fail fast
on "Canvas not found", and they are what turned a bare 15-second
`TimeoutError` into an actionable failure. Removing them would discard the
instrumentation that made this section possible.

The spec is the one file PATCH-117 authorizes to change, so its hash is
**expected** to move; it carries no frozen status. The new baseline is
bound:

```
e2e/characterization/drawing-overlay-containment.spec.ts
  was: 55fda3fa84480ca717c412cd564940333bb98f6b
  now: ff58aa76b1357074d268d2020c35ef03cd858448   (§30 baseline)
```

The identity-alignment work in this section will move it again; that is
expected and authorized. **The three frozen production/unit hashes must not
move, and remain the only hard-stop hashes.**

### 31g. Acceptance control — mandatory, and it gates the matrix

The seven-step control is adopted verbatim and is binding:

1. regenerate storage state through the normal `setup` project
2. verify the browser user id **equals** the Node fixture-client user id
3. create one disposable Drawing fixture
4. confirm the **browser** can read that exact fixture
5. open Drawing successfully
6. **stop before row 1**
7. clean up fully

**The next full matrix is NOT authorized immediately.** It is authorized
**only after this control passes**, and then **exactly one** run, under
§25f's live requirements and §29h's deferred-row reporting, with rows 5 and
14 deferred to PATCH-119.

If the control fails at step 2 or step 4, **stop and return** — do not
proceed, do not retry with a different identity, do not run the matrix.

### 31h. Next GPT-5.5 instruction (bind)

> **Implementation engineer role only. Read PATCH-117 §31 first —
> authoritative. Do not issue governance rulings, edit `.fable5`, or begin
> PATCH-118 or PATCH-119. Do not commit.**
>
> Safety gate before and after: `git status --porcelain` (full list, expect
> **9**), `git diff --cached --name-status` (empty), `git worktree list`
> (one), `git stash list` (empty), and the three frozen production/unit
> hashes — any change to those is a hard stop. **No worktree. No
> `force: true`. No timeout increase. Real Arrow Post untouched.
> `.env.local` untouched.**
>
> **Exactly one file may change:**
> `e2e/characterization/drawing-overlay-containment.spec.ts`.
> `e2e/helpers/env.ts`, `e2e/auth.setup.ts` and `playwright.config.ts` must
> stay byte-for-byte identical — verify their hashes before and after.
>
> Do exactly two things:
>
> 1. Change `createClientForLiveUser` to authenticate with `E2E_EMAIL` /
>    `E2E_PASSWORD` **imported from `e2e/helpers/env.ts`**. Do not read
>    those two keys through the spec's private env reader; leave that
>    reader in place for the non-credential keys only. `LIVE_ACCESS_EMAIL`
>    and `LIVE_ACCESS_PASSWORD` are no longer read by this spec.
> 2. Add the §31d identity-equality assertion **before any fixture insert**:
>    Node id from `getUser()`, browser id from the browser's own
>    authenticated in-page session (never by parsing the storage-state file,
>    never by decoding a token), compared, throwing immediately on
>    mismatch with **user ids and nothing else** in the message.
>
> Keep the §30 fail-fast `openDrawing` diagnostics. Change nothing else —
> no row order, no acceptance criteria, no timeout constant, no row 13, no
> §22 coordinate helper, no deferred-row handling.
>
> **Never print, log, annotate or commit** an email, password, access
> token, refresh token or cookie. User ids only.
>
> Run static validation per §25f and report actual output. Then run the
> §31g seven-step control and **stop before row 1**. Report both user ids,
> whether they matched, whether the browser read the exact fixture, and
> whether cleanup completed. Also report whether each configured Freeform
> and Map fixture id is readable by the aligned identity (§31e) — reporting
> only, this gates nothing.
>
> **Do not run the full matrix in this run.** Return for the §31 follow-up
> ruling first. Leave the candidate uncommitted and unstaged.

### 31i. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
Nine incomplete matrices; neither the §29 attempt nor the §30 diagnosis is
a tenth. **No production change authorized; production remains 2 of 3.**
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: designated, NOT authored, NOT authorized, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**

---

## 32. Row-15 whole-line-drag failure — narrow ruling (2026-07-28, CTO)

Issued at governance HEAD `df894b6cd3d0aa28c4b441ec2b1c0c310d539303`.
Candidate verified: **9** dirty paths, uncommitted, unstaged; the three
frozen production/unit hashes unchanged (`8966233d…`, `86e84e65…`,
`df759afb…`).

### 32a. The containment result is the headline and it is CERTIFIED

**Rows 1–13 PASSED** with the identity alignment from §31 in place — the
first time the matrix has reached row 13. Sidebar containment, front/back
layer containment, modal containment, Apply-layout, slide-card, checkbox
and overflow interactions, and **row 13's strict chrome-region
`elementFromPoint` sweep** all passed, with the production candidate and
all frozen hashes unchanged.

**Rows 1–13 are CERTIFIED.** They may not be rerun unless the production
candidate changes. §31's identity alignment is confirmed working and is
discharged. Row 14 remains DEFERRED under §29e.

### 32b. **A is EXCLUDED on source — row 15 is not candidate-caused**

The candidate's entire behavioural surface is a `clip-path` inset on the
line layer plus CSS custom properties for zoom-control placement. Three
steps, each source-backed:

1. **The mousedown reached the hit path.** Row 15 takes its coordinate from
   `verifiedHitPathPoint` (`:1677`), which requires `elementFromPoint` at
   that coordinate to return the exact hit path. `clip-path` suppresses
   hit-testing, so a clipped coordinate **cannot** pass that verification.
   The drag therefore began at a provably unclipped point.
2. **Movement is not clip-sensitive.** The drag is driven by a
   **window-level `mousemove` listener** (`SimpleLineRenderer.tsx:493`),
   not by hit-testing the path. `clip-path` cannot suppress it, and the
   drag direction is `(-18, -12)` — away from the sidebar inset, not into
   it.
3. **Persistence is not clip-sensitive.** `onSaveLine` is invoked from the
   window `mouseup` handler (`:485-488`); no part of that path consults
   layout, hit-testing or clipping.

**There is no source path by which the containment candidate can prevent
geometry persistence. A is excluded.**

### 32c. **E is EXCLUDED on source — the row-15 expectation is valid**

`expectExpectedGeometryChange` (`:1403-1410`) branches on
`Array.isArray(before.points)` and, for the points-array fixture, requires
`pointsChanged` (`:1390-1392`). The whole-line drag branch updates
`start/control/end` **and** maps every point by the same delta
(`SimpleLineRenderer.tsx:452-463`). The expectation matches what the
product does for this fixture shape. **E is excluded.**

**D is excluded.** The PATCH-119 defect is that targeting leaves the path
at `pointerup`; `mousedown` targeting is intact, and `mousedown` is all a
drag needs to start. Row 15 does not depend on the double-click route.

### 32d. Classification: **C leading, B live** — and one read separates them

Two non-candidate mechanisms remain, both source-backed:

- **C — harness.** Row 15 calls `fetchLine` **immediately** after
  `dragFromPoint` returns (`:1678-1679`), with **no wait for persistence to
  land**. `onSaveLine` is an asynchronous network write. If the read
  outruns the write, the DB legitimately still holds the created values —
  exactly the reported symptom.
- **B — pre-existing product race.** The window `mousemove` listener is
  attached inside a `useEffect` gated on `isDragging`
  (`SimpleLineRenderer.tsx:393-394`), and `isDragging` only becomes true
  after React re-renders from `setDraggingLine` (`:379`). Playwright's
  `mouse.move(..., { steps: 8 })` (`:1180`) dispatches all eight moves
  back-to-back. If the listener is not attached before they are dispatched,
  **every move is missed**, `dragOffsetRef.current` never advances, and the
  `mouseup` commit persists unchanged geometry — the same symptom.

`drawingLineDragPersistenceIntent` is excluded as a cause: it returns
`shouldPersist: true` unconditionally for `phase: 'commit'`
(`lib/infra/drawing/canvasLineCoordinates.ts:65-74`), so the save is always
attempted.

**Per the anti-spiral rule, no new run is authorized to separate them.**
The distinction is answerable from the **already-captured row-15 trace**:
whether a persistence network request was issued after `mouseup`, and
whether its payload carried changed geometry. That is one focused read of
existing data, not a diagnosis sequence.

### 32e. Disposition — the fork is decided in advance

**Row 15 is not certified**, and PATCH-117 authorizes **no production
change** for it. Which of the two paths applies is decided by the trace
read, and both outcomes are ruled now so no further ruling is needed:

- **A persistence request was issued carrying changed geometry** ⇒ **C**.
  The harness read too early. This is a **spec-only** defect in the one
  file PATCH-117 already authorizes, so **row 15 stays in PATCH-117** and
  is **not deferred**. Authorized correction, narrowest form: row 15 waits
  for the persisted geometry to change, bounded by the existing
  `INTERACTION_TIMEOUT_MS` with a poll interval ≤50 ms — **no new timeout
  constant, no increase, no arbitrary sleep**, and the same bounded-wait
  discipline already used elsewhere in the spec.
- **No persistence request, or one carrying unchanged geometry** ⇒ **B**.
  A pre-existing whole-line-drag defect in the same interaction layer
  PATCH-119 already owns. **Row 15 is DEFERRED and assigned to PATCH-119**,
  whose designated scope widens from "double-click reachability" to
  "SimpleLineRenderer real-pointer interaction defects". PATCH-119 remains
  **NOT authored, NOT authorized**.

**Under no outcome is a PATCH-117 production change authorized.** The three
frozen files stay byte-for-byte; production remains **2 of 3**. Nothing in
`CanvasClient.tsx` or the wider drag architecture is authorized under
either branch.

### 32f. Continuation run — rows 16–21, with a binding state constraint

**Rows 1–13 must not be rerun.** The candidate is unchanged, and they are
certified.

The continuation run covers **rows 16–21**, plus **row 15** if and only if
the C branch applies and its spec correction is made.

**Binding constraint, because it will otherwise be got wrong:** rows 15–21
are not independent. They assume the fixture exists and the presentation
sidebar is open — state established by setup and row 2. A continuation run
**must replay the state-establishing prefix** (setup, `openDrawing`,
`openPresentationSidebar`) **without re-asserting or re-certifying rows
1–13**. Prefix replay is not certification; the prefix rows must be
reported as `replayed-not-recertified`, never as PASS.

`--trace on`; all §25f live rules and §31's identity assertion unchanged;
Freeform/Map Stage 2 remains **NOT granted**.

### 32g. Next GPT-5.5 instruction (bind)

> **Implementation engineer role only. Read PATCH-117 §32 first —
> authoritative. Do not issue governance rulings, edit `.fable5`, or begin
> PATCH-118 or PATCH-119. Do not commit.**
>
> Safety gate before and after: `git status --porcelain` (full list, expect
> **9**), `git diff --cached --name-status` (empty), `git worktree list`
> (one), `git stash list` (empty), and the three frozen production/unit
> hashes — any change to those is a hard stop. **No production edit. No
> worktree. No `force: true`. No timeout increase. Real Arrow Post
> untouched. `.env.local` untouched.**
>
> **Step 1 — one focused read of the existing row-15 trace. Do not run
> anything.** Determine only: (a) whether a persistence network request was
> issued after the row-15 `mouseup`, and (b) whether its payload carried
> changed geometry. Report both, with the request path and status. **Do not
> start a multi-variant investigation.**
>
> **Step 2 — apply the branch §32e already decided.**
> If a request was issued with changed geometry: this is **C**. Make the
> single authorized spec-only correction — row 15 waits for the persisted
> geometry to change, bounded by the existing `INTERACTION_TIMEOUT_MS`,
> poll ≤50 ms, no new or increased timeout constant, no sleep. Row 15 stays
> in PATCH-117.
> Otherwise this is **B**. Mark row 15 **deferred to PATCH-119** using the
> existing `deferredRow` mechanism with a stated reason, exactly as rows 5
> and 14 are handled. Change nothing else.
>
> **Step 3 — one continuation run:** rows 16–21, plus row 15 only under
> branch C. Replay the state-establishing prefix (setup, `openDrawing`,
> `openPresentationSidebar`) and report those as
> `replayed-not-recertified`, **never as PASS**. **Do not rerun or
> re-certify rows 1–13.** `--trace on`; §31 identity assertion in force;
> user ids only, never a credential or token.
>
> Report each executed row's PASS/FAIL/DEFERRED with duration, the full
> diagnostic payload for any failure, whether each configured Freeform and
> Map fixture id is readable by the aligned identity, and the final
> safety-gate results. Leave the candidate uncommitted and unstaged.

### 32h. Status

**PATCH-117: OPEN · AUTHORIZED · UNCOMMITTED · UNSTAGED.** Not closed.
**Rows 1–13 CERTIFIED.** Rows 5 and 14 DEFERRED to PATCH-119. Row 15
undecided between one spec-only correction and deferral, per §32e.
**No production change authorized; production remains 2 of 3.**
**Freeform/Map: Stage 2 NOT granted**; neither is PASS.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: designated, NOT authored, NOT authorized.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-116: CANCELLED and retired.**
