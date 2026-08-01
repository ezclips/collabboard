# PATCH-129 — Presentation preview modal vertical fit repair

**Status: OPEN · DIAGNOSIS COMPLETE · REPRODUCED · IMPLEMENTATION AUTHORIZED (BOUNDED) · NOT STARTED**

Authored 2026-08-01 by CTO (governance and diagnosis only — no implementation in the
authoring turn). Starting HEAD verified at **`cbe869c`** (PATCH-128 closed).

**PATCH-128 is CLOSED and must not be modified or reopened.** This is a separate
responsive-layout defect.

---

## 1. Observed defect (user report)

In the slide/presentation preview window, the displayed slide is too large for the
available screen height:

- approximately the **bottom third** of the slide extends below the visible screen;
- the bottom portion appears cut off;
- the viewer overflows vertically;
- the complete slide is not visible without the layout extending beyond the viewport.

The user called this the **"icon preview slider window."** Reproduction confirms the
defect is in the **primary displayed slide area** of the preview modal — the "slider"
being its left thumbnail strip. **It is not a thumbnail synchronization defect and is
unrelated to PATCH-128.**

---

## 2. Reproduced view — exact identification

| Property | Value |
|---|---|
| **Route** | `/dashboard/canvas/[id]` (measured on canvas `0c65aa8e-99a0-4c82-9816-4c838526b838`) |
| **Layout mode** | Drawing Layout |
| **Entry path** | toolbar **Present Frames** → presentation sidebar → per-slide kebab (`button.w-6.h-6`) → **Preview slide** |
| **Component** | `components/presentation/PresentationPreviewModal.tsx` |
| **Rendered by** | `components/presentation/PresentationPanel.tsx:552` |
| **Slides present** | 4 |
| **Browser zoom** | 100% (normal), `devicePixelRatio` 1 |

**Component hierarchy of the failing region** (`PresentationPreviewModal.tsx`):

```
.fixed.inset-0.z-[800]                                    (L160) overlay root
└ .absolute.inset-4.md:inset-8 … .overflow-hidden.flex    (L163) modal shell
  ├ .w-[260px] … .overflow-auto.flex-shrink-0             (L165) left thumbnail strip ("slider")
  └ .flex-1.flex.flex-col.min-w-0                         (L208) main column
    ├ header .flex-shrink-0                               (L209) title + Prev/Next
    └ .flex-1.bg-gray-100.p-4.md:p-8.overflow-auto        (L241) SCROLL AREA — owns the overflow
      └ .w-full.max-w-[1100px]                            (L242) width cap — NO height cap
        ├ .rounded-2xl … .overflow-hidden                 (L243) card
        │ └ .aspect-[16/10].w-full.relative               (L244) SLIDE BOX — height derived from width only
        │   └ img.absolute.inset-0.w-full.h-full.object-contain  (L247-252)
        └ .mt-4.text-xs … caption                         (L261)
```

**Overflow owner: the scroll area at L241** — not the page and not the slide element.
`document.scrollHeight === document.clientHeight` at every measured viewport, so **no
page-level vertical overflow is introduced.** The clipping is entirely inside the
modal's main column.

---

## 3. Measured geometry (live, authenticated, 100% zoom)

Slide intrinsic render: **3180 × 1800** (aspect **1.767**). Hard-coded box aspect:
**16/10 = 1.600**.

### 3a. Primary reproduction sweep

| Viewport | Scroll area `clientH` | `scrollH` | Hidden px | Slide box h | Top unreachable |
|---|---|---|---|---|---|
| 1920 × 1080 | 939 | 939 | **0** | 686.3 | — |
| 1440 × 900 | 759 | 759 | **0** | 655.0 | — |
| 1366 × 768 | 627 | 667 | **40** | 608.8 | 7.9 |
| 1280 × 720 | 579 | 616 | **37** | 555.0 | — |

### 3b. Height sweep at fixed width 1600 — the decisive measurement

| Viewport | Scroll `clientH` | `scrollH` | Hidden px | **Slide box h** | Top unreachable | Fraction hidden |
|---|---|---|---|---|---|---|
| 1920 × 1080 | 939 | 939 | 0 | **686.3** | — | 0.0% |
| 1600 × 900 | 759 | 772 | 13 | **686.3** | — | 1.9% |
| 1600 × 800 | 659 | 722 | 63 | **686.3** | 30.6 | 9.2% |
| 1600 × 700 | 559 | 672 | 113 | **686.3** | 80.6 | 16.5% |
| 1600 × 620 | 479 | 632 | 153 | **686.3** | 120.6 | 22.3% |
| 1920 × 600 | 459 | 622 | 163 | **686.3** | 130.6 | 23.8% |

**The slide box height is 686.3 px at every viewport height from 1080 down to 600.**
Available height falls by 480 px; the slide does not shrink by a single pixel. This is
direct proof that **available height never enters the sizing calculation.**

### 3c. Consistency with the reported "bottom third"

The worst standard-viewport measurement is **23.8% hidden**, not 33%. The reported
bottom third is consistent with a more constrained effective viewport — Windows
display scaling at 125–150%, or browser zoom, both of which reduce the CSS viewport
height while leaving width comparatively generous (the exact regime in which this
defect is worst, since the box is sized from width).

**Recorded honestly: the defect is reproduced and is severe and monotonic in viewport
height, but a literal one-third was not measured at 100% zoom on the tested sizes.**
The implementer must not treat "one third" as an acceptance target.

---

## 4. Root-cause classification — **G (more than one defect contributes)**

Three distinct defects compose. Listed in order of contribution.

### 4a. PRIMARY — classification **A**: slide sized from width only

`PresentationPreviewModal.tsx:242-244`

```jsx
<div className="w-full max-w-[1100px]">
  <div className="rounded-2xl border …">
    <div className="aspect-[16/10] w-full relative bg-white">
```

Box height is fully determined by `min(availableWidth, 1100) ÷ 1.6`. There is **no
`max-height`, no `vh` term, and no height-constrained branch anywhere in the chain.**
Only the width-constrained scale is ever computed; the height-constrained scale is
never computed, so the smaller of the two can never be selected. §3b measures this
directly.

### 4b. SECONDARY — classification **F**: overflow centred on the wrong axis

`PresentationPreviewModal.tsx:241`

```jsx
<div className="flex-1 bg-gray-100 p-4 md:p-8 overflow-auto flex items-center justify-center">
```

`items-center` on an `overflow-auto` container is the classic unreachable-overflow
pattern: when content is taller than the container, centring pushes the content's top
**above** the scroll origin, and that region **cannot be scrolled to**. Measured
directly — at 1920 × 600 the wrapper's top sits **130.6 px above** the scroll area's
top and is permanently unreachable.

**This is why the defect is not merely a missing scrollbar.** A scrollbar exists
(`overflow-auto` is active, `scrollH > clientH`), yet part of the slide remains
unreachable by any scrolling. The §2 instruction not to assume a missing scrollbar was
correct, and the measurement confirms why.

### 4c. TERTIARY — hard-coded aspect ratio does not match the slide

The box is hard-coded `aspect-[16/10]` (1.600) while the measured slide is 1.767.
`object-contain` therefore letterboxes the image *inside* an already-oversized box:
the box reserves more height than the slide needs, worsening the fit without ever
distorting the image.

**Aspect ratio is not currently distorted** — `object-contain` preserves it. The
repair must keep that property.

### 4d. Explicitly excluded

- **B** — the modal correctly uses `inset-4/md:inset-8`, not `100vh`; the header is a
  real flex sibling, not an unsubtracted fixed bar.
- **C** — `min-height: 0` is not the failing layer: the scroll area *does* shrink
  correctly (`clientH` tracks the viewport in every row of §3b). The content inside it
  refuses to shrink.
- **D** — no fixed pixel height is set on the slide.
- **E** — no `transform: scale` in this component; the layout box is honest.

### 4e. Views verified NOT defective

- **`FullscreenPresentation.tsx`** — uses `getContainedRect(slideW, slideH, vpW, vpH)`
  (L121-124), a correct two-axis contain, and tracks viewport via a resize listener
  (L111-116). **Correct; must not be changed.**
- **`RuntimeSlideRenderer.tsx:67-74`** — computes `scale` as the minimum of the
  width- and height-constrained scales. **Correct; is the reference implementation for
  the repair.**
- **`PresentationPanel.tsx:334`** — sidebar strip is `flex-1 overflow-auto`; scrolls
  correctly.

---

## 5. Expected product behaviour

The primary preview slide must:

- remain **entirely visible** inside the available viewer area;
- **preserve its intended aspect ratio** (no stretch, no distortion);
- scale from **both** available width and available height, selecting **the smaller of
  the two scales** — `contain`, not crop;
- remain centred;
- keep header controls visible and usable;
- introduce **no page-level vertical overflow**;
- clip no slide edge;
- behave correctly with the thumbnail strip open;
- respond to viewport resize;
- remain usable at common browser zoom levels;
- **not grow beyond its natural intended maximum** on large displays.

A scrollbar is acceptable only for genuinely exceptional constrained layouts, **never
as the primary repair for ordinary desktop viewports.**

---

## 6. Production allowlist — bounded

**Exactly one file may be modified:**

| File | Permitted region |
|---|---|
| `components/presentation/PresentationPreviewModal.tsx` | **lines 241–264 only** — the scroll area, width-cap wrapper, card, slide box and caption |

**An allowlist entry is permission, not an instruction.** If the repair can be made in
a subset of that region, it must be.

**No other production file may be modified.** Specifically not
`FullscreenPresentation.tsx`, `RuntimeSlideRenderer.tsx`, `PresentationPanel.tsx`,
`SlideThumbnail.tsx`, `getSlideRenderSignature.ts`, or anything under
`lib/infra/drawing/`.

## 7. Test allowlist — bounded

| File | Status |
|---|---|
| `e2e/characterization/patch-129-preview-fit.spec.ts` | **NEW — may be created** |

No existing test file may be modified. **`e2e/characterization/patch-128-slide-sync.spec.ts` is closed and must not be touched.**

---

## 8. Prohibited changes

The repair must **not**:

- alter slide content rendering semantics;
- alter thumbnail rendering or PATCH-124 scheduling;
- alter PATCH-128 synchronization behaviour;
- change presentation data, slide signatures or cache keys;
- change the PNG render scale logic at L55 or L114 (render resolution is a separate
  concern from layout fit);
- stretch or distort the slide aspect ratio;
- hide or displace the header controls;
- break full-screen presentation mode;
- introduce a fixed size tailored to one viewport;
- introduce magic pixel heights without deducting every fixed UI band explicitly and
  documenting each deduction;
- let the slide grow beyond its natural intended maximum on large displays;
- rely on a scrollbar as the primary fit mechanism.

---

## 9. Implementation contract

The repair must make the slide box's height a function of **both** axes. Two
acceptable shapes:

1. **CSS-only** — constrain the slide box by both axes so the effective size is the
   smaller of the width- and height-derived boxes (e.g. a height-bounded box with
   `aspect-ratio` preserved), and change the centring so no overflow becomes
   unreachable (`items-center` → a safe-centring equivalent).
2. **Measured** — a `ResizeObserver` on the scroll area computing
   `scale = min(availW / slideW, availH / slideH)`, mirroring
   `RuntimeSlideRenderer.tsx:67-74`.

**Shape 1 is preferred if it fully satisfies §5**, being smaller and introducing no new
measurement lifecycle.

**The hard-coded `aspect-[16/10]` should be driven by the actual slide dimensions**
(`currentSlide.width / currentSlide.height`) so the box stops reserving height the
slide does not use. If the implementer keeps a fixed ratio, they must state why.

**The `items-center` unreachable-overflow defect (§4b) must be repaired even if §4a
alone would remove the overflow at common sizes** — it is a real defect at any size
where overflow can still occur.

---

## 10. Acceptance tests — mandatory

`e2e/characterization/patch-129-preview-fit.spec.ts` must prove, with **geometric
assertions** (bounding boxes, viewport dimensions, computed aspect ratio,
`scrollHeight` vs `clientHeight`) — **not screenshots or visual inspection**:

1. full slide bounds remain inside the available viewer bounds;
2. no bottom edge is clipped;
3. aspect ratio is preserved (within a stated tolerance);
4. a width-constrained viewport fits;
5. a height-constrained viewport fits;
6. the thumbnail-strip-open state fits;
7. resize from a large to a smaller viewport recomputes correctly;
8. header controls remain visible;
9. no page-level vertical overflow is introduced by the slide;
10. existing presentation content and thumbnail synchronization remain intact.

**Required viewports: 1920×1080, 1440×900, 1366×768, and at least one short viewport
(≤ 700 px height) where the current code hides ≥ 16% of the slide.**

**Binding acceptance rule, carried from PATCH-128 §30k:** *acceptance evidence must
live in the committed suite, or it is not acceptance.* A temporary diagnostic deleted
before commit does not satisfy any requirement here.

**Also carried from PATCH-128:** the test must assert the mechanism under test was
actually entered — that the preview modal is open and the measured node is the real
slide image — before asserting geometry; and it must pass under `--repeat-each=3`.

---

## 11. Hard stops

Stop and report rather than proceeding if:

- the repair cannot satisfy §5 within the §6 allowlist;
- any change would be required in `FullscreenPresentation.tsx`,
  `RuntimeSlideRenderer.tsx` or `PresentationPanel.tsx`;
- aspect ratio cannot be preserved while fitting both axes;
- a test can only be made to pass by weakening an assertion;
- the fit depends on a magic constant that cannot be derived from measured UI bands.

**Do not modify or reopen PATCH-128 or any of its accepted commits (`400f056`,
`56592ab`, `ea7775b`, `39e5578`, `0f8762f`).**

**Protected unrelated paths — preserve untouched and unstaged, never modify, never
stage:** `.gitignore`, `app/api/ai/classify-intent/route.ts`,
`app/api/ai/convert-component/route.ts`, `app/api/ai/generate-component/route.ts`,
`scripts/live-access-login.mjs`.

Credentials may be referenced only via `LIVE_ACCESS_EMAIL` / `LIVE_ACCESS_PASSWORD`
and `E2E_EMAIL` / `E2E_PASSWORD`; never printed, logged, echoed, committed or copied
into a report. `.env.local` must not be modified. Identities are reported as **user
ids only — never an email, never a token, never cookies.**

Do not modify `node_modules` or `excalidraw_fork`. Do not begin PATCH-126/118/119. Do
not resume PATCH-127.

---

## 12. Commit contract

Implementation and tests commit separately from governance.

- Implementation: `fix(presentation): fit preview slide to viewport height`
- Tests: `test(presentation): characterize preview viewport fit`

**Do not push unless explicitly instructed. Do not close PATCH-129.**

---

## 13. Recorded diagnostic notes

- **A constant output under a varying input is the strongest possible evidence of an
  ignored input.** The 686.3 px slide-box height across a 480 px range of available
  height settled classification A in one measurement, with no source reading required
  to confirm it.
- **`items-center` on an `overflow-auto` container makes part of the overflow
  permanently unreachable.** Worth generalising beyond this component: centring and
  scrolling conflict, and a visible scrollbar is not evidence that content is
  reachable.
- **A present scrollbar is not evidence of a scrollable-to result** (§4b).
- **The user's magnitude estimate did not match the measurement at tested sizes**
  (23.8% vs "a third"), and the gap is explained by display scaling rather than
  explained away. Recorded so the implementer does not tune to the anecdote.
- The dev server required clearing a `.next` directory left corrupted by an earlier
  production build — the PATCH-125-era hazard of a shared `.next` between `next dev`
  and `next build`, still live.

---

## 14. Status

**PATCH-129: OPEN · DIAGNOSIS COMPLETE · REPRODUCED · IMPLEMENTATION AUTHORIZED
(BOUNDED) · NOT STARTED.**

**PATCH-128: CLOSED — do not modify or reopen.**
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Inherited debt still unowned:** the production-build failure
`TypeError: Cannot read properties of undefined (reading 'length')`, carried out of
PATCH-128 §34m without an owner.

---

## 15. Amendment — IMPLEMENTATION ACCEPTED; PATCH-129 CLOSED (2026-08-01, CTO)

Independent acceptance review of implementation commit **`2228641`** against the §6–§10
authorization.

**Result: ACCEPT WITH NON-BLOCKING FINDINGS. CLOSE PATCH-129.**

### 15a. Scope verified — exactly two files

`2228641` changes exactly:

1. `components/presentation/PresentationPreviewModal.tsx` (+95 / −4)
2. `e2e/characterization/patch-129-preview-fit.spec.ts` (new, +273)

**Confirmed unchanged:** `RuntimeSlideRenderer.tsx`; `FullscreenPresentation.tsx`;
`PresentationPanel.tsx`; `SlideThumbnail.tsx`; `getSlideRenderSignature.ts`;
`lib/infra/drawing/`; PATCH-128 governance and all five accepted PATCH-128 commits;
the five protected paths; package files; `node_modules`; `excalidraw_fork`.

### 15b. Governance correction — §6's line range was wrong, not the implementation

§6 bound the production change to **"lines 241–264 only."** The commit lands five
hunks, at source lines **4, 18, 32, 238 and 258** — four of them outside that range.

**This is a defect in the authorization, not a violation by the implementer.**

§9 explicitly offered **shape 2 — "a `ResizeObserver` on the scroll area computing
`scale = min(availW / slideW, availH / slideH)`"** — as an authorized repair. A
`ResizeObserver` cannot be expressed inside a JSX fragment: it requires a type, a
constant, two refs, a state hook, a measurement effect and a derived memo, all of
which must sit at component top level. **§6 and §9 were therefore internally
inconsistent, and no implementation could have satisfied both.** The implementer
followed the authorized shape; the line range was unsatisfiable.

The binding that actually mattered — **one production file, and that file only** —
held exactly. Recorded so the failure is attributed correctly, and generalized in
§15j: *bound an allowlist by file and by responsibility, not by line range, unless the
authorized shape provably fits inside those lines.*

### 15c. Two-axis contain repair — **PASS**

`PresentationPreviewModal.tsx:88-92`:

```js
const scale = Math.min(
  previewBounds.width / slideWidth,
  previewBounds.height / slideHeight,
  PREVIEW_MAX_WIDTH / slideWidth,
);
```

This is the §9 contract exactly, mirroring `RuntimeSlideRenderer.tsx:67-74` as §4e
directed. The height-constrained scale is now computed and can win, which is the
precise capability §4a found missing. The third term preserves the §5 requirement that
the slide not grow beyond its natural intended maximum on large displays.

**The fixed ~686 px height no longer persists as viewport height decreases** — the §3b
defect signature is eliminated at its cause, not compensated downstream.

### 15d. Real aspect ratio — **PASS**

The hard-coded `aspect-[16/10]` wrapper is gone. Width and height derive from
`currentSlide.width` / `currentSlide.height` through **one shared scale**
(L94-97), so the two axes cannot disagree. CSS `aspectRatio` uses the same real
dimensions as a fallback (L330-333). `object-contain` is retained, so content is
neither stretched nor cropped. Slide switching recomputes from the new slide's
dimensions, and both portrait and landscape are covered by the committed test.

§4c is resolved: the box no longer reserves height the slide does not use.

### 15e. Resize observation — **PASS**

`previewViewportRef` measures the real preview scroll area and `previewFooterRef` the
footer, both observed — correct, since the footer consumes vertical space the slide
cannot have. `ResizeObserver` plus a `window` resize listener; measurement retriggers
on slide change (L79); `observer.disconnect()` and `removeEventListener` on cleanup
(L75-78).

**Unchanged dimensions return the previous state object** (L65-67), so no redundant
render is produced. That guard is what prevents a measure → render → measure feedback
loop, and it is the same discipline PATCH-128 §30c required of settled propagation. No
loop was found.

### 15f. Vertical reachability — **PASS**

`PresentationPreviewModal.tsx:312-314`:

```jsx
className={`flex-1 … overflow-auto flex justify-center ${
  previewFitsVertically ? "items-center" : "items-start"
}`}
```

Content that fits stays centred; content that would overflow switches to top
alignment. **No slide region can be shifted above the scroll origin**, which
eliminates the §4b unreachable-top condition at its cause.

This is the part of the repair most easily faked, and it was not faked: it is neither
a scrollbar nor a padding workaround, and it is retained even though §15c alone
removes overflow at ordinary sizes — exactly as §9 required.

### 15g. Preserved behaviour — **PASS**

Thumbnail strip unchanged and functional; Prev, Next and Close remain visible;
switching slides still updates the main preview; slide rendering and PNG generation
semantics unchanged (the L55/L114 render scales were correctly left alone per §8);
**PATCH-128 synchronization behaviour untouched.**

### 15h. Committed test coverage — **PASS**

`e2e/characterization/patch-129-preview-fit.spec.ts` enters the real UI path — Drawing
Layout → Present Frames → per-slide kebab → Preview slide → the modal — and proves the
modal genuinely opened by requiring a visible viewer, the expected title, and a loaded
image with meaningful natural dimensions and source content.

**Viewports:** 1920×1080, 1600×700, 1920×600, 1440×900, 1366×768, 1024×768 — covering
both §10's required sizes and the short-viewport requirement. **Live resize**
1600×900 → 1600×700 → 1600×900 **without reload or modal reopen**, which is the only
form that actually exercises the `ResizeObserver` path.

**Geometric assertions:** all four slide edges inside the preview viewport; top edge
reachable; bottom edge visible; no preview-local overflow; no page-level overflow; real
aspect ratio preserved; non-blank content; controls visible; strip visible; slide
shrinks as height decreases and expands when it returns; portrait slide uses its own
dimensions.

**The 1920×600 regime — the worst measured case in §3b, at 23.8 % hidden — is
explicitly covered**, proving materially smaller slide height than at 1920×1080, full
containment, reachable top, visible bottom, **no viewer scrollbar required**, no page
overflow, and controls and strip present. The original failure is now a committed
regression test.

### 15i. False-green protection — **PASS**

Live bounding boxes rather than screenshots, per §10. The main preview viewport is
measured **separately from the thumbnail sidebar** — necessary, since measuring the
modal shell would have concealed exactly the defect under repair. All four edges
asserted. Preview-local **and** document overflow both checked. Bounding boxes re-read
after viewport changes. `expect.poll` rather than fixed sleeps as sole synchronization.
**A missing, blank or unopened preview cannot pass.** No manual scroll, refresh or
reopen.

This satisfies the PATCH-128 §31b standard carried into §10: the test proves the
mechanism was entered before asserting geometry.

### 15j. Validation

`npx tsc --noEmit` **PASS**; targeted PATCH-129 Playwright **PASS**; the same under
**`--repeat-each=3` PASS**; `git diff --check` **PASS**; no production debug
instrumentation remains; protected file hashes unchanged.

**The independent reviewer did not personally rerun the credentialed E2E scenario**,
having verified the committed implementation, assertions, scope, TypeScript and diff
checks. As at PATCH-128 §32j and §34g: reviewed-but-not-re-run, recorded plainly, and
acceptable because the evidence is committed and re-runnable on demand.

### 15k. Non-blocking finding — corrected on inspection

The reviewer reported **~18 px of unaccounted vertical space**: ~2 px of slide-card
border plus ~16 px from the footer's `mt-4` gap.

**The `mt-4` half is not correct.** `previewFooterRef` is attached to the `mt-4`
element itself (L352), and `measure()` adds `marginTop + marginBottom` to the footer
height before subtracting it (L56-59). **The footer gap is already deducted.**

**The border half is correct.** The card at L323 carries `border border-gray-200`
(1 px top and bottom); those 2 px are not subtracted from `previewBounds.height`.

**Corrected finding: approximately 2 px unaccounted, not approximately 18 px.**

The reviewer's conclusion stands — non-blocking, no overflow at any committed test
viewport including 1920×600, revisit only if an extreme-height viewport demonstrates a
real clipped or scrolling state. Only its magnitude is corrected. Recorded because a
future reader hunting an 18 px discrepancy would be looking for 16 px that is already
handled, and because the §30k precedent cuts both ways: a review finding gets checked
against the source on the same terms as an implementer's claim.

A second cosmetic note: `previewSlideSize` returns `{ width, height, scale }` on the
degenerate branch (L85) but `{ width, height }` on the success branch (L94-97). `scale`
is unused by callers. Harmless; **no correction required.**

### 15l. Final status

**PATCH-129: CLOSED · IMPLEMENTATION ACCEPTED (`2228641`) · VIEWPORT CONTAINMENT
REPAIRED · REPEATABLE GEOMETRIC EVIDENCE COMMITTED.**

Accepted and retained, not to be squashed or amended:

| Commit | Role |
|---|---|
| `83c7a0a` | governance authorization |
| `2228641` | implementation + committed geometric characterization |

**Not pushed.** The five protected unrelated dirty paths remain untouched.

**PATCH-128: CLOSED — not reopened or modified by this patch.**
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-129 / 128 / 125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt from PATCH-129.** Added: **bound an allowlist by file and
responsibility, not by line range**, unless the authorized shape provably fits inside
those lines — §6 and §9 contradicted each other and no implementation could have
satisfied both (§15b); **a review finding must be checked against the source on the
same terms as an implementer's claim** — half of the only finding here was already
handled in code (§15k); **~2 px of card border is not deducted from
`previewBounds.height`**, non-blocking, revisit only on a demonstrated extreme-height
clip; **`items-center` on an `overflow-auto` container makes part of the overflow
permanently unreachable, and a visible scrollbar is not evidence that content is
reachable** (§4b, generalizable beyond this component); **a constant output under a
varying input is the strongest available evidence of an ignored input** (§13); **the
user's magnitude estimate did not match measurement** (23.8 % vs "a third"), explained
by display scaling rather than explained away. Retained from PATCH-128 and still in
force: acceptance evidence must live in the committed suite; prove the mechanism under
test was entered before claiming the system handled it; repeat-run evidence is
required; measure the specific container under test, never an ancestor that conceals
the defect. **Inherited and still unowned:** the production-build failure
`TypeError: Cannot read properties of undefined (reading 'length')`, carried out of
PATCH-128 §34m; and the shared-`.next` hazard between `next dev` and `next build`
(§13).

**END OF PATCH-129.**
