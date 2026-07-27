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
