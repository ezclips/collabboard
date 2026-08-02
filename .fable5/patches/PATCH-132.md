# PATCH-132 — Scalable presentation-thumbnail rendering and active-slide visibility

**Status: OPEN · DIAGNOSIS INCOMPLETE · IMPLEMENTATION BLOCKED**

Authored 2026-08-02 by CTO (governance and diagnosis only). Starting HEAD verified at
**`83f9a11`** (`610c141` plus all PATCH-130 closure and documentation commits, plus the
PATCH-131 amendments). Worktree clean apart from the five protected paths.

**PATCH-128, PATCH-129 and PATCH-130 are CLOSED. PATCH-131 remains BLOCKED and is not
modified by this patch.**

---

## 1. Observed defect (user report)

On a Drawing canvas with many presentation slides, the Presentation sidebar becomes
noticeably laggy while slide preview icons update: thumbnail work begins while the user
is still moving or editing; a slide containing a YouTube/video element stayed blank for
a long time; hidden slides appear to compete with the relevant one; and the active slide
is not kept within the visible portion of the strip.

Board cited: `a3c92898-ca21-488d-9b28-4107415e1ee6`.

---

## 2. Reproduction — BLOCKED on board access

| Item | Result |
|---|---|
| Dev server | started; port 3000 held by a stale orphan (PID 15348, killed), healthy server **port 3001, PID 7628** |
| Base URL used | `http://localhost:3001` — confirmed against the healthy listener |
| Route compiles | **yes** (`HTTP 200` warm) |
| Supplied board reachable | **NO** — renders **"Canvas not found"** at 15 s, 25 s and 30 s; 0 canvases, no Excalidraw |
| Live-access account board count | **3** — the supplied board is not among them |
| Slides measured | **none** |
| Thumbnail work measured | **none** |
| Server torn down | yes — orphan PID 7628 killed by port; **no listeners remain on 3000–3003** |

**The board belongs to the reporting user's account, not the `LIVE_ACCESS_*` account.**
The three boards available to the diagnostic account are a Freeform board, a Wall board,
and the 4-slide Drawing board used by PATCH-129/130.

**No substitute board was used to manufacture numbers.** The defect is specifically a
*many-slide scale* problem; a 4-slide board where every card is visible cannot reproduce
offscreen contention, render-queue ordering, or the blank embedded slide. Measuring it
and presenting the result as this defect's reproduction would be the §10 false-green
pattern applied to diagnosis rather than to a test.

---

## 3. Source map

| Concern | Path |
|---|---|
| Thumbnail scheduler (PATCH-124) | `components/presentation/useSlideThumbnails.ts` |
| Selection / staleness policy | `lib/infra/presentation/slideThumbnailRefresh.ts` |
| Sidebar list + slide cards | `components/presentation/PresentationPanel.tsx` |
| Thumbnail image component | `components/presentation/SlideThumbnail.tsx` |
| Thumbnail dimensions supplied | `DrawingLayout.tsx:3363` — `thumbnail={{ width: 240, height: 160 }}` |
| Panel mount (320 px fixed overlay) | `DrawingLayout.tsx:3355-3356` |
| Renderer / lazy-image handling | `components/presentation/slide-renderer/createSlideRenderer.tsx:190` |
| Active slide state | `DrawingLayout.tsx` `activeSlideId` → `PresentationPanel` prop |

---

## 4. Structural findings — proven from source, independent of the board

These are properties of the code and do not require the inaccessible board. They are
stated as **proven**; everything in §5 is not.

### 4a. No visibility awareness exists anywhere — **PROVEN**

A repository-wide search of `components/presentation` for `IntersectionObserver`,
`scrollIntoView`, `overscan`, `virtual`, and `requestIdleCallback` returns **exactly one
hit**: `createSlideRenderer.tsx:190`, which handles `img[loading="lazy"]` *inside the
rendered slide*, not sidebar cards.

Therefore:

- **no thumbnail work is gated on sidebar visibility** (classification **A**, structurally
  certain for *changed* slides);
- **no virtualization or windowing exists** — every slide card is mounted
  (classification **B**, mounting confirmed; excess re-render unmeasured);
- **no active-slide auto-scroll exists** (classification **E**, structurally certain).

### 4b. The scheduler takes no visibility or active-slide input — **PROVEN**

`useSlideThumbnails({ slides, renderSlideToPNG, height, background, dpr })` — there is
**no `activeSlideId` parameter and no visibility parameter**. `selectSlidesForThumbnailRefresh`
receives only `slides`, `renderedKeys`, `inFlightIds`, `forcedIds`.

**No prioritization of any kind is possible with the current signature**
(classification **C**, structurally certain). Requests are emitted by iterating `slides`
in **array order** (`slideThumbnailRefresh.ts:41`), so a distant offscreen slide earlier
in slide order renders before a visible one.

### 4c. Rendering is strictly sequential — concurrency 1 — **PROVEN**

`useSlideThumbnails.ts:89-127` iterates requests in a `for` loop with `await
renderSlideToPNG(...)` inside. **One slide renders at a time.**

This is the strongest structural candidate for the two most specific user complaints:

- a slow slide **blocks every other slide behind it** — head-of-line blocking, which is
  exactly "hidden slides appear to compete with the currently relevant slide" and
  "complex slide blocks visible lightweight slides";
- because ordering is slide-array order and there is no priority, **the slide the user
  is looking at can wait behind an arbitrary number of offscreen slides.**

Classification **I** (too many concurrent) is therefore **rejected in its literal
form** — the problem is the opposite: a serial queue with no priority. Recording that
inversion explicitly, because "add concurrency limits" would be the wrong repair.

### 4d. Changed-signature suppression is intact — **PROVEN; PATCH-128 is not broken**

`slideThumbnailRefresh.ts:44` — `if (!forced && renderedKeys[slide.id] === cacheKey) continue;`

**Unchanged slides do no work, visible or hidden.** The 250 ms trailing debounce
(`SLIDE_THUMBNAIL_REFRESH_DEBOUNCE_MS`) and the `shouldAcceptSlideThumbnailRender`
stale-result check are both present and correct.

**The concern is therefore narrower than the user's phrasing suggests: only *changed*
hidden slides do work.** How many slides change per operation on the real board is
unmeasured and is the single most important unknown (§5a).

### 4e. Card geometry supports the "~3 visible" target — source-derived estimate

Thumbnails are supplied at **240 × 160** (`DrawingLayout.tsx:3363`) inside a padded card
with a title row. A card is therefore roughly **200–225 px** tall including spacing, and
the sidebar's list area at a 900 px viewport is roughly 700–740 px after its header —
about **3.2–3.7 cards**.

**This is an estimate from source, not a measurement.** It is consistent with the user's
"approximately three" and is recorded to show the target is not arbitrary — but §9's
governed number must be set from measurement, not from this arithmetic.

---

## 5. What remains unknown — and why it blocks authorization

### 5a. How many slides change per operation — **UNKNOWN, highest value**

If a drag changes one slide's signature, §4d means one render occurs and the lag is
**G** (one complex slide is inherently expensive). If a drag changes many signatures,
the lag is **A + C** (hidden slides competing). **These demand opposite repairs**, and
nothing in the source decides between them — it depends on the board's frame layout and
on how many frames a moved object intersects.

### 5b. The YouTube/embedded slide — **UNCLASSIFIED**

None of the nine candidate classifications (A–I) can be selected without measurement.
§4c makes **B (queued behind other slides)** structurally plausible, and the renderer's
`img[loading="lazy"]` handling at `createSlideRenderer.tsx:190` makes **C/F (started
before content ready / decode delayed)** plausible. **Do not solve this by adding a wait
before identifying the layer.**

### 5c. Whether thumbnail work starts before movement settles — **UNKNOWN**

PATCH-128 §32e measured *no thumbnail render per pointermove* on its representative
board and that result stands. Whether a different path bypasses settlement on this board
is unmeasured. **§SETTLEMENT POLICY is explicit: if work does not start early, do not add
another delay.** No delay is authorized here.

### 5d. React re-render cost — **UNMEASURED**

All cards mount (§4a), but whether they re-render excessively per thumbnail update is not
measured. `PresentationPanel` maps over `sortedSlides` and passes `thumbs[s.id]`; a new
`thumbs` object per accepted render will re-render the list unless memoized. **Plausible,
unproven.**

---

## 6. Root-cause classification — **K (insufficient evidence)**, with partial certainty

| Ref | Claim | Status |
|---|---|---|
| A | Hidden **changed** slides regenerate when fully offscreen | **STRUCTURALLY CERTAIN** (§4a, §4b) — magnitude unknown |
| B | All cards mounted | **mounting CERTAIN**; excess re-render **unproven** (§5d) |
| C | No active/visible prioritization | **STRUCTURALLY CERTAIN** (§4b) |
| D | Image decode/layout cost | **unproven** |
| E | Active slide not auto-scrolled | **STRUCTURALLY CERTAIN** (§4a) |
| F | Work begins before movement settles | **unproven** (§5c) |
| G | One complex slide is inherently expensive | **plausible, unmeasured** (§5a) |
| H | Embedded media not render-ready at capture | **unclassified** (§5b) |
| I | Too many concurrent renders | **REJECTED** — concurrency is 1 (§4c) |
| — | **Serial queue with no priority causes head-of-line blocking** | **STRUCTURALLY CERTAIN**, not in the original list (§4c) |

**C and E are certain and independent of the board.** They are also the two the user
described most concretely. But the *lag* — the actual complaint — cannot be attributed
without §5a, and a repair that reorders a queue whose contents are unknown is a guess.

---

## 7. Provisional priority policy — to be confirmed, not yet authorized

1. active and visible; 2. other visible; 3. near-visible overscan; 4. active but
offscreen, after auto-scroll; 5. remaining changed hidden slides; 6. unchanged hidden:
no work (**already true today**, §4d).

Given §4c, the highest-value change is likely **ordering plus preemption of the serial
queue**, not deferral: if only a few slides change per operation, reordering alone fixes
the perceived lag with no behavioural loss. **Decide after §5a.**

## 8. Virtualization decision — provisional: **not required**

Of the six options, **(2) IntersectionObserver-gated thumbnail work + (6) active-slide
`scrollIntoView`** is the smallest combination that addresses the certain findings, and
neither needs a virtualization library. Options (3) and (4) change mounting and should be
held back unless §5d proves re-render cost dominates.

**No large virtualization dependency is authorized.**

## 9. Active-slide auto-scroll policy (governed)

When `activeSlideId` changes: locate the card **by stable slide ID**; if fully visible, do
not scroll; if partly or fully outside, scroll it into view within **the sidebar scroll
container only**; never scroll the page; no repeated scroll loops; do not fight manual
scrolling unless the active slide changes. Must hold for canvas frame click, sidebar
click, newly created slide, and keyboard navigation where supported.

The "approximately three visible cards" target is **responsive, not fixed** — §4e's
estimate must be replaced by measurement before it is written as a number.

---

## 10. Allowlists — NOT GRANTED

**No production allowlist is granted.** The likely files are
`useSlideThumbnails.ts`, `slideThumbnailRefresh.ts`, `PresentationPanel.tsx` and
possibly `SlideThumbnail.tsx` — but §5a decides whether the repair is a queue reorder, a
visibility gate, or neither, and that determines which of them is touched. Writing the
allowlist now would be guessing, and PATCH-129 §15b is the standing lesson against
allowlists that the authorized shape cannot satisfy.

**Test allowlist, reserved:** `e2e/characterization/patch-132-thumbnail-visibility.spec.ts`
(new file only). **Do not modify the PATCH-128, PATCH-129 or PATCH-130 specs.**

---

## 11. NEXT AUTHORIZED ACTION — obtain board access, then measure

**No implementation. No production change.**

1. **Unblock board access** — one of: grant the `LIVE_ACCESS_*` account access to
   `a3c92898-ca21-488d-9b28-4107415e1ee6`; or supply an equivalent many-slide board on
   that account; or provide a seeded fixture (≥ 15 slides, several complex, one
   embedded/video-like) reproducing the lag.
2. Then measure, per the original brief: slide count; mounted cards; visible / near /
   offscreen counts by `IntersectionObserver`, **never by index**; active slide ID;
   sidebar `scrollTop`/`clientHeight`/`scrollHeight`; card height; cards visible at once;
   whether the active slide is visible; and whether the sidebar auto-scrolls today.
3. **Answer §5a first** — how many slide signatures change for: move within one slide;
   move between two slides; metadata edit. This decides the repair shape.
4. Per operation, record thumbnail requests and accepted/stale renders **by slide ID**,
   with start/end times, visibility at render start, and render order — proving or
   disproving §4c's head-of-line blocking on real data.
5. Classify the YouTube slide into exactly one of A–I with evidence (§5b).
6. Measure whether work starts before settlement (§5c). **If it does not, no new delay
   is authorized.**
7. Measure sidebar re-render cost (§5d).
8. **Report which cells were not measured.**

**Dev-server rule (PATCH-130 §13, now confirmed four times):** identify the listening PID
and port before measuring; confirm the base URL points at the healthy server; stop the
real child afterward and verify no listener remains. `TaskStop` on `npm run dev` orphans
the Next child — a stale orphan from a previous session was found holding port 3000 this
turn and had to be killed before work could start. **Never delete `.next` while a server
is alive.**

---

## 12. Hard stops

Stop and report rather than proceeding if: the board remains inaccessible; a repair would
require a second thumbnail scheduler (**do not add one without proving it is required**);
PATCH-124 stale-result protection or PATCH-128 changed-signature suppression would be
weakened; or offscreen changed slides would become permanently unrenderable.

**Regression boundaries:** must not change slide content, order, payloads or signatures;
must not alter PATCH-128 synchronization or PATCH-124 staleness semantics; must not break
full-screen presentation, the preview modal, or PATCH-130 navigation; must not
permanently skip offscreen changed slides; must not auto-scroll when the active slide has
not changed; must not fight manual sidebar scrolling; no polling; no arbitrary long
delays.

**Do not modify or reopen PATCH-128, PATCH-129, PATCH-130, or PATCH-131.**

**Protected unrelated paths — preserve untouched and unstaged:** `.gitignore`,
`app/api/ai/classify-intent/route.ts`, `app/api/ai/convert-component/route.ts`,
`app/api/ai/generate-component/route.ts`, `scripts/live-access-login.mjs`.

Credentials only via `LIVE_ACCESS_EMAIL`/`LIVE_ACCESS_PASSWORD` and
`E2E_EMAIL`/`E2E_PASSWORD`; never printed, logged, committed or copied into a report.
`.env.local` must not be modified. Identities reported as **user ids only — never an
email, never a token, never cookies.** Do not modify `node_modules` or `excalidraw_fork`.

---

## 13. Commit contract

Diagnostic turn: governance amendment only. Once authorized:

- Implementation: `fix(presentation): prioritize visible slide thumbnails`
- Tests: `test(presentation): characterize thumbnail visibility and scrolling`

**Do not push. Do not close PATCH-132.**

---

## 14. Recorded diagnostic notes

- **The serial queue inverts the expected diagnosis** (§4c). Classification **I** ("too
  many concurrent renders") is rejected: concurrency is exactly 1, and the symptom comes
  from head-of-line blocking in an unprioritized FIFO. A plausible-sounding repair —
  limiting concurrency — would have made it worse.
- **Structural certainty and defect attribution are different things.** Absence of
  `IntersectionObserver` and `scrollIntoView` is certain from source and needs no board;
  *how much lag that causes* needs the board. This patch records both, separately.
- **A scale defect cannot be reproduced on a small board.** Substituting the 4-slide
  board would have produced clean numbers that mean nothing about a many-slide sidebar.
- **The user's report is narrower than it reads**: unchanged hidden slides already do no
  work (§4d). Only *changed* hidden slides compete, so the fix depends on how many
  signatures a single edit changes (§5a) — a quantity nobody has measured.
- **Operational, fourth occurrence:** a stale orphaned Next process from a previous
  session was still holding port 3000 at the start of this turn, forcing the new server
  onto 3001. Identify the port from the dev log and the PID from the OS before measuring.

---

## 15. Status

**PATCH-132: OPEN · DIAGNOSIS INCOMPLETE · IMPLEMENTATION BLOCKED.**

Structural findings proven (§4): **no visibility gating, no active-slide prioritization,
no auto-scroll, serial concurrency 1, PATCH-128 suppression intact.** Lag not reproduced
— **board inaccessible to the diagnostic account** (§2). **No allowlist granted** (§10).
Next action is §11.

**PATCH-131: OPEN · BLOCKED · not modified.**
**PATCH-130 / 129 / 128: CLOSED** — not modified or reopened.
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-130 / 129 / 128 / 125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Inherited debt still unowned:** the production-build failure `TypeError: Cannot read
properties of undefined (reading 'length')` (PATCH-128 §34m); the shared-`.next` hazard;
and Drawing Layout's inherited 2000 × 1500 Freeform stage at `CanvasClient.tsx:6354`
(PATCH-130 §6a).
