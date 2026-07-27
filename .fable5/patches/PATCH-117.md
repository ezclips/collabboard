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
