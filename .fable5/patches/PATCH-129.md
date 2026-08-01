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
