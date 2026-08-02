# PATCH-132 — Scalable presentation-thumbnail rendering and active-slide visibility

**Status: OPEN · ACTIVE-SLIDE AUTO-SCROLL DEFECT REPRODUCED · ONE-SLIDE
CHANGED-SIGNATURE SUPPRESSION PROVEN · CROSS-SLIDE UPDATE BOUNDED TO SOURCE AND
DESTINATION · QUEUE PERFORMANCE DEFECT NOT REPRODUCED · VIRTUALIZATION NOT JUSTIFIED ·
YOUTUBE FAILURE LAYER UNCLASSIFIABLE ON IMPORTED BOARD · NARROW IMPLEMENTATION
AUTHORIZED**

> **§19 supersedes the performance framing of §4–§10.** Runtime measurement resolved
> §5a as Case A (one interaction → one signature → one render) and measured thumbnail
> work at 0.8–2.0 ms per slide, so **§4c's head-of-line-blocking risk did not
> materialize** and priority scheduling, visibility gating and virtualization are all
> **declined**. The **only** authorized repair is active-slide thumbnail auto-scroll in
> `PresentationPanel.tsx` (§19g).

> **Diagnostic board: `0c65aa8e-99a0-4c82-9816-4c838526b838`** — the imported copy of the
> reported board, manually verified (**§18**). The original board
> `a3c92898-…` in §2/§16/§17 remains inaccessible and **must not be retried**.
> **⚠ §18b: that diagnostic ID is reused from PATCH-129/130/131, where it is described
> as "the 4-slide board"; it now holds 14 slides.** Those descriptions are stale; the
> patches are not reopened.
>
> See **§16** for the blocked-reproduction record and the four competing implementation
> cases (§16c); **§17** for the second failed access retry and the authenticated
> diagnostic user id; **§18** for the superseding board and the authorized measurement
> order.

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

---

## 16. Amendment — BLOCKED ON BOARD ACCESS (2026-08-02, CTO)

Formal record of the blocked reproduction attempt and of what is nevertheless settled.

**Result: BLOCKED ON BOARD ACCESS. Implementation remains BLOCKED.**

### 16a. Access failure

Board **`a3c92898-ca21-488d-9b28-4107415e1ee6`** is **not accessible to the
`LIVE_ACCESS` diagnostic account.** The authenticated diagnostic session receives
**"Canvas not found"** — confirmed at 15 s, 25 s and 30 s, with zero canvases mounted
and no Excalidraw instance.

The diagnostic account has access only to one Freeform board, one Wall board, and the
**four-slide Drawing board** used during PATCH-129/130.

**The four-slide board is not a valid substitute**, because on it: every slide card is
visible; there is no meaningful offscreen thumbnail set; no many-slide queue contention
exists; it does not contain the reported slow YouTube/embedded slide; active-slide
auto-scroll through a long list cannot be exercised; and visible / overscan / hidden
scheduling cannot be distinguished.

**No substitute measurements were used.** Numbers from a board that cannot exhibit the
defect would have looked like evidence and been worth nothing — the §10 false-green
standard applied to diagnosis rather than to a test.

### 16b. Source-backed findings — certain, and independent of the board

1. **No visibility awareness.** The thumbnail-list pipeline contains no
   `IntersectionObserver`, `overscan`, virtualization, active-card visibility,
   `requestIdleCallback` or `scrollIntoView`. The single `loading="lazy"` occurrence
   concerns images **inside rendered slide content**, not sidebar-card scheduling.
2. **No active-slide priority input.** `useSlideThumbnails` receives no `activeSlideId`,
   no visible or near-visible slide IDs, and no sidebar scroll state. **Prioritization
   is impossible with the current interface** — this is a signature-level fact, not a
   policy choice.
3. **Serial FIFO rendering.** A `for` loop with `await` per slide; concurrency is
   effectively **one**. **The excessive-concurrency hypothesis is rejected.** The
   structural risk runs the other way: serial FIFO → no visibility priority → offscreen
   changed slides can run before the active or visible slide → one complex slide causes
   **head-of-line blocking**.
4. **PATCH-128 remains intact.** Changed-signature suppression, the trailing settled
   delay, and stale-result rejection are all present and correct; unchanged slides do no
   work. **PATCH-128 must not be classified as broken.**
5. **Hidden-slide work.** Unchanged hidden slides do not render; **changed** hidden
   slides can, and are not visibility-prioritized. **How many signatures the user's
   actual operation changes remains unmeasured.**

### 16c. Why implementation stays blocked — four live cases

The implementation *shape* depends on the missing measurement, and the four candidates
call for materially different repairs:

| Case | Condition | Implied repair |
|---|---|---|
| **A** | one interaction changes **one** signature | lag dominated by one expensive slide; **queue prioritization may suffice** |
| **B** | one interaction changes **several** signatures | **visibility gating / deferred hidden work** may be necessary |
| **C** | YouTube slide renders **before embedded content is ready** | **prioritization alone will not fix the blank result** |
| **D** | render completes but **image update/decode is delayed** | **scheduling changes would target the wrong layer entirely** |

**Do not choose among these without runtime evidence from a representative board.**
Case D is the sharpest warning: it is the one where the intuitively correct repair —
reordering the queue — would be work spent on a layer that is not failing.

### 16d. Root-cause ledger

| Claim | Status |
|---|---|
| **C** — no active/visible priority | **SOURCE-PROVEN** |
| **E** — no active-slide auto-scroll | **SOURCE-PROVEN** |
| **I** — too many concurrent renders | **REJECTED** |
| Serial head-of-line blocking | **SOURCE-PROVEN RISK** |
| Hidden **changed**-slide rendering | **SOURCE-PROVEN** |
| Actual many-slide lag mechanism | **UNPROVEN** |
| YouTube blank-slide failing layer | **UNPROVEN** |

Two findings are certain, and they are the two the user described most concretely. The
*lag itself* — the actual complaint — is unattributed.

### 16e. Virtualization — still not authorized

**Full list virtualization is not authorized.** The smallest likely design remains:
active-slide `scrollIntoView`; `IntersectionObserver`-based visibility classification;
visible-and-active render priority; small near-visible overscan; deferred hidden changed
slides.

**Provisional** until runtime measurement determines whether **card mounting** or
**thumbnail generation** is the dominant cost. Those point at different solutions —
mounting cost argues for windowing, generation cost argues for queue policy — and
nothing measured so far separates them.

### 16f. Unblock requirement

PATCH-132 may continue when **one** of the following is provided:

1. **grant the `LIVE_ACCESS` diagnostic account access to board
   `a3c92898-ca21-488d-9b28-4107415e1ee6`** — **preferred**, because it contains the
   actual slow embedded slide and the observed lag;
2. duplicate or share an equivalent many-slide board into the diagnostic account;
3. provide a seeded fixture with **≥ 15 slides**, several complex slides, enough slides
   to create offscreen cards, **one embedded or video-like slide**, and stable content
   suitable for repeated timing measurements.

Route 1 is materially better than route 3: a seeded fixture would be built from my
assumptions about what makes a slide expensive, and the YouTube slide's failing layer
(§16c cases C and D) is exactly the thing those assumptions would most likely get wrong.

### 16g. Status

**PATCH-132: OPEN · SOURCE FINDINGS C/E CONFIRMED · SERIAL FIFO HEAD-OF-LINE RISK
CONFIRMED · UNCHANGED-SLIDE SUPPRESSION INTACT · MANY-SLIDE RUNTIME UNMEASURED · YOUTUBE
FAILURE LAYER UNCLASSIFIED · BOARD ACCESS REQUIRED · IMPLEMENTATION BLOCKED.**

**No production allowlist granted** (§10). **PATCH-131: OPEN · BLOCKED · not modified.
PATCH-130 / 129 / 128: CLOSED — not modified or reopened.**

### 16h. Recorded diagnostic note

- **An inaccessible reproduction target is a hard blocker, not a reason to approximate.**
  Two patches in a row have now stopped at the point where further autonomous work would
  have meant inventing the evidence — PATCH-131 §20 for want of a user reproduction, and
  PATCH-132 for want of board access. In both, the source analysis was strong enough that
  producing a confident-sounding authorization would have been easy. **The standard is
  the same either way: a repair needs a measured failing case.**
- **Diagnostic-account scope is a standing constraint worth planning around.** The
  `LIVE_ACCESS` account sees three boards; user-reported defects will routinely live on
  boards it cannot reach. Consider whether defect reports should carry a shared-board
  step, so the blocker is resolved before a diagnostic turn is spent discovering it.

---

## 17. Amendment — SECOND ACCESS RETRY FAILED (2026-08-02, CTO)

Record of the second reproduction retry, attempted after the user reported sharing the
board.

**Result: BLOCKED — the target board is still inaccessible to the configured
`LIVE_ACCESS` account. Implementation remains BLOCKED.**

### 17a. Retry result

| Item | Value |
|---|---|
| Authenticated diagnostic **user id** | **`3f41bc24-435a-4e42-8177-278ececb1107`** |
| Target board | **`a3c92898-ca21-488d-9b28-4107415e1ee6`** |
| Page result | **"Canvas not found"** |
| `canvasCount` | **0** |
| Presentation sidebar | **absent** |
| Thumbnail cards | **absent** |
| Many-slide content | **absent** |

**The diagnostic stopped at the required first-check boundary.** No substitute board was
used; no runtime measurements were taken; no production or test files were changed; no
implementation was authorized.

The user id is recorded because it is the one durable identifier that makes the next
verification unambiguous — it is a **user id only**, never an email, token or cookie, per
the standing constraint. Any share must be checked against *this* id.

### 17b. The share has not become effective for this account

**Record: the board-sharing change reported by the user has not taken effect for the
exact account `LIVE_ACCESS` authenticates as.**

Stated precisely, because the distinction matters: this is not evidence that no share was
made. It is evidence that **the account the diagnostic actually authenticates as still
cannot read the board.** Possible causes:

- the board was shared with a different email/account;
- the invitation was not accepted;
- the share applies to a different workspace or tenant;
- "Full access" was set on a different board;
- the diagnostic account's membership has not propagated;
- board lookup does not include the granted share.

The last is the only one that would be a product defect rather than a configuration
mismatch. **It is not diagnosed here** and must not be assumed — but if manual
verification (§17c) shows the board *does* appear for this account while the URL still
returns "Canvas not found", that would itself be a real bug and a separate patch.

### 17c. Unblock requirement — manual verification first

Before another diagnostic retry, **manual verification while logged in as the configured
`LIVE_ACCESS` account** must confirm all four:

1. the target board **appears in that account's board list**;
2. opening the exact URL **does not** show "Canvas not found";
3. the **Drawing canvas and Presentation panel load**;
4. **slide thumbnail cards are visible**.

**Do not spend another automated diagnostic turn merely testing the same inaccessible
URL.** Two turns have now produced the same three-word result; a third would cost a full
session's setup — dev server, authentication, navigation — to re-derive a fact already
established twice. The next automated turn must be gated on a human confirming the
account can see the board.

### 17d. Status

**PATCH-132: OPEN · SOURCE FINDINGS C/E CONFIRMED · SERIAL FIFO HEAD-OF-LINE RISK
CONFIRMED · UNCHANGED-SLIDE SUPPRESSION INTACT · MANY-SLIDE RUNTIME UNMEASURED · YOUTUBE
FAILURE LAYER UNCLASSIFIED · EXACT `LIVE_ACCESS` USER STILL LACKS BOARD ACCESS ·
IMPLEMENTATION BLOCKED.**

Nothing in §4's source-proven findings changes. **No production allowlist granted**
(§10). Route 3 of §16f — a seeded fixture — remains available if granting access proves
impractical, with the §16f caveat that it cannot reproduce the YouTube slide's failing
layer.

**PATCH-131: OPEN · BLOCKED · not modified. PATCH-130 / 129 / 128: CLOSED — not modified
or reopened.**

### 17e. Recorded diagnostic note

- **Verify the precondition before spending the turn.** Both retries paid the full cost
  of a diagnostic session — server startup, authentication, navigation, load waits — to
  discover an access failure that a single authenticated board-list check would have
  surfaced in seconds. **A cheap precondition check belongs at the top of any diagnostic
  that depends on external state**, and §17c now makes it a gate rather than a discovery.
- **"Shared" is a claim about intent; readability by a specific user id is the fact.**
  Recording the authenticated user id turns an untestable report ("I shared it") into a
  checkable one ("does `3f41bc24-…` see it").
- This is the **third** consecutive blocked diagnosis across PATCH-131 and PATCH-132.
  Each is blocked on a different missing external input — a user reproduction, board
  access, and now effective board access. **The engineering work is not the constraint;
  the evidence supply is.**

---

## 18. Amendment — ACCESS BLOCKER SUPERSEDED; DIAGNOSTIC BOARD AVAILABLE (2026-08-02, CTO)

**§17's access blocker is superseded. The many-slide runtime diagnosis is authorized.
Implementation remains BLOCKED.**

### 18a. What changed

§17 remains **historically correct for the original board**
`a3c92898-ca21-488d-9b28-4107415e1ee6`, which stays inaccessible to the diagnostic
account. It is not retracted.

The user **exported that board and imported it into the Codex/`LIVE_ACCESS` account**.
The imported copy has canvas ID **`0c65aa8e-99a0-4c82-9816-4c838526b838`**.

Correct diagnostic URL:
`http://localhost:3000/dashboard/canvas/0c65aa8e-99a0-4c82-9816-4c838526b838`

**Manually verified by the user while logged into the Codex/`LIVE_ACCESS` account**,
satisfying all four §17c checks: the Drawing canvas loads; the Presentation panel loads;
**14 slides** are present; thumbnail cards are mounted; **several cards are offscreen**.

Governance consequences:

- **do not retry the original board ID**;
- **do not treat the imported board as a substitute fixture** — it is the **authorized
  diagnostic copy of the reported board**, carrying the reported board's real content;
- **"board access required" is withdrawn as the current blocker**;
- **implementation stays blocked** until the runtime measurements are complete.

### 18b. ⚠ ID collision — the diagnostic board ID is reused, and its content has changed

**`0c65aa8e-99a0-4c82-9816-4c838526b838` is not a new ID.** It is the same canvas ID
already referenced by:

| Patch | Recorded as |
|---|---|
| `PATCH-114.md:877` | `PATCH114_LIVE_DRAWING_CANVAS_ID` |
| `PATCH-129.md:34` | the board PATCH-129's geometry was measured on |
| `PATCH-130.md:31` | "canvas …, **4 slides**" |
| `PATCH-131.md:53` | "Drawing Layout, **4 slides**" |

Earlier in this same session I measured **`Slides (4)`** on that exact board. The user's
verification now reports **14 slides**. **The board's content has changed under a stable
ID.**

This is recorded prominently because it will silently mislead someone:

1. **PATCH-129, PATCH-130 and PATCH-131 describe this ID as "the 4-slide board."** Those
   descriptions are now **stale**. The measurements themselves remain correct *as taken*
   — they were accurate against the board's state at the time, and PATCH-130's committed
   characterization asserts against live geometry rather than hard-coded slide counts.
   **None of those patches is invalidated, and none is reopened.**
2. **§16a's reasoning is now moot, not wrong.** It argued the 4-slide board was an
   invalid substitute because every card was visible and no offscreen set existed. That
   was true of the board's *content*, not its identity — and the content has since been
   replaced with the reported board's.
3. **Any future re-run of the PATCH-129/130 characterization specs against this board
   will meet 14 slides, not 4.** If either spec depends on slide count, ordering, or
   index-based selection, it may behave differently. Those specs are **closed and must
   not be modified** — but a re-run producing an unexpected result should be checked
   against this note **before** being treated as a regression in the accepted
   implementations.

**Reusable rule, recorded in §21: a board ID is a stable identifier for a *container*,
not for its *contents*. Any measurement pinned to a live board ID must record what was on
the board at the time, because a later import can replace it without the ID changing.**

### 18c. Diagnostic suitability — good, with one caveat to confirm first

14 slides with several cards offscreen satisfies the §11 requirement for a many-slide
board and clears the §16a objections. It is short of the **≥ 15 slides** the §10 test
plan reserves for the *acceptance suite*; that is a target for the committed test, not a
precondition for diagnosis, and 14 is ample to measure offscreen contention, queue
ordering and auto-scroll.

**Confirm as the first measurement, before anything else:** that the imported copy
actually contains the **YouTube/embedded slide**. An export/import round trip is exactly
the operation most likely to drop or alter an embedded element, and that slide is the
subject of §5b — the unclassified failing layer and one of the two findings that would
most change the repair. **If the embedded slide did not survive the import, §5b remains
unclassifiable on this board and must be reported as such, not silently skipped.**

### 18d. Next authorized action — §11 measurement, unchanged

The §11 measurement plan stands as written, against the imported board. In order:

1. **verify the embedded/YouTube slide survived the import** (§18c);
2. **confirm the live slide count and record it** — do not rely on 14 from a screenshot;
3. **answer §5a first** — how many slide signatures change for a move within one slide, a
   move between two slides, and a metadata edit. **This still decides the repair shape**
   (§16c cases A vs B);
4. classify visible / near / offscreen by `IntersectionObserver`, **never by index**;
5. record thumbnail requests and accepted/stale renders **by slide ID**, with start/end
   times, visibility at render start, and render order — proving or disproving §4c's
   head-of-line blocking on real data;
6. classify the YouTube slide into exactly one of A–I (§5b);
7. measure whether work starts before settlement (§5c) — **if it does not, no new delay
   is authorized**;
8. measure sidebar re-render cost (§5d);
9. **report which cells were not measured.**

**No production allowlist is granted** (§10). **No implementation is authorized.** The
§12 hard stops and regression boundaries are unchanged, as are the standing prohibitions
on modifying PATCH-128/129/130/131 and the five protected paths.

**Dev-server rule (PATCH-130 §13, four occurrences):** identify the listening PID and
port before measuring; confirm the base URL points at the healthy server — note the
correct URL above assumes **port 3000**, which has repeatedly been held by orphans, so
**take the port from the dev log, not from this document**; stop the real child afterward
and verify no listener remains.

### 18e. Status

**PATCH-132: OPEN · CORRECT IMPORTED BOARD ACCESS MANUALLY VERIFIED · 14-SLIDE DRAWING
BOARD AVAILABLE · SOURCE FINDINGS C/E CONFIRMED · SERIAL FIFO HEAD-OF-LINE RISK
CONFIRMED · MANY-SLIDE RUNTIME DIAGNOSIS AUTHORIZED · IMPLEMENTATION BLOCKED.**

**PATCH-131: OPEN · BLOCKED · not modified. PATCH-130 / 129 / 128: CLOSED — not modified
or reopened**, and specifically **not** reopened by §18b's staleness note.

### 18f. Recorded diagnostic note

- **A board ID identifies a container, not its contents** (§18b). Three patches describe
  this ID as "the 4-slide board"; it now holds 14. Measurements pinned to a live board
  must record the board's state at the time, or a later import silently invalidates the
  description while leaving the identifier valid.
- **An export/import round trip is a lossy operation for embedded content** (§18c). The
  one element this patch most needs is the one most likely not to have survived, so it is
  the first thing to check rather than something to discover three measurements in.
- **The blocker was resolved by the user changing the world, not by another retry.** §17c
  gated further automated attempts on manual verification precisely so the next action
  would be a real change rather than a third identical failure. That gate worked.

---

## 19. Amendment — RUNTIME DIAGNOSIS COMPLETE; NARROW REPAIR AUTHORIZED (2026-08-02, CTO)

Result of the §18d runtime diagnosis on the imported board
`0c65aa8e-99a0-4c82-9816-4c838526b838`.

**Result: STILL PARTIALLY DIAGNOSED. One bounded defect reproduced and authorized for
repair. Broad thumbnail-performance work is NOT authorized.**

### 19a. Runtime inventory

| Property | Value |
|---|---|
| Slides | **14** |
| Mounted thumbnail cards | **14** — all mounted |
| Fully visible | **3** |
| Partly visible | 1 |
| Near-visible (250 px overscan) | 1 |
| Fully offscreen | **9** |
| Sidebar `clientHeight` | ≈ 834 px |
| Sidebar `scrollHeight` | ≈ 3041 px |
| Card height | ≈ 204.3 px |
| Card images | `loading="auto"` |

**Three fully visible cards** confirms §4e's source-derived estimate of 3.2–3.7 and the
user's "approximately three". The §9 responsive target is therefore grounded in
measurement, not arithmetic.

### 19b. Changed-signature behaviour — §5a answered; **Case A**

| Operation | Signatures changed | Thumbnails rendered | Image src updates |
|---|---|---|---|
| Move within Slide 1 | **exactly Slide 1** | **1** | 1 |
| Move within Slide 2 | **exactly Slide 2** | **1** | 1 |
| Cross-slide move | **exactly source + destination** | **2** | source then destination |

**PATCH-128 settlement and changed-signature suppression are working.**

This resolves §5a decisively as **§16c Case A**: one interaction changes one signature.
**Do not add another debounce. Do not change signature computation. Do not broaden
thumbnail regeneration.**

The consequence is large. §16c predicted that Case A versus Case B would demand opposite
repairs, and Case A removes the entire justification for visibility gating: there is no
crowd of changed hidden slides to gate.

### 19c. Queue findings — the structural risk did **not** materialize

**Confirmed as source predicted:** concurrency is one; full refresh is sequential in
slide-array order; no active-slide priority; no visible-slide priority; forced refresh
includes offscreen slides.

**Not reproduced:** material head-of-line blocking; meaningful queue waiting; expensive
hidden-slide contention; thumbnail generation as the dominant lag source.

Measured `toDataURL` work: **≈ 0.8–2.0 ms per slide** on this board.

**This corrects the emphasis of §4c and §16d.** I recorded serial FIFO head-of-line
blocking as a **SOURCE-PROVEN RISK** and called it "the strongest structural candidate"
for the user's complaints. The *structure* is exactly as described — that part stands —
but at 0.8–2.0 ms per render the serial queue is harmless at this scale, and the risk I
weighted most heavily is not the defect. **A correctly identified structural weakness is
not evidence of the reported symptom**, and I gave it more evidential weight than a
source reading can carry.

**Therefore NOT authorized:** priority scheduling; visibility-gated rendering; idle
hidden-slide scheduling; queue restructuring; concurrency changes.

### 19d. Active-slide auto-scroll — **CONFIRMED DEFECT**

Selecting the distant slide **"09 · Ratchet"** while its thumbnail was fully offscreen:

| Measurement | Value |
|---|---|
| Sidebar `scrollTop` before | **0** |
| Sidebar `scrollTop` after | **0** |
| Page scroll | unchanged |
| Active thumbnail | **remained outside the visible sidebar region** |

Source contains no active-thumbnail `scrollIntoView`. **§4a's classification E is now a
reproduced, bounded UX defect** — the only one of the two source-certain findings that
turned out to matter. (Classification **C**, no priority, is real and harmless per §19c.)

### 19e. YouTube / embedded — **UNCLASSIFIABLE ON THIS BOARD**

The imported board contains a YouTube URL as a **link padlet**
(`3bd27989-e472-47f7-890d-2d3d5baaaf0b`), but **no Excalidraw embeddable/video/iframe
scene element survived the import**, and no scene element maps to that link padlet's
parent.

**Classification: YOUTUBE FAILURE LAYER UNCLASSIFIABLE ON THIS IMPORTED BOARD.**

§18c required this be checked first and reported as unclassifiable rather than silently
skipped, precisely because an export/import round trip is the operation most likely to
drop embedded content. It did. §5b remains open and **cannot be closed from this board**.

**Not authorized:** embedded readiness handling; retries; arbitrary waits;
video-specific thumbnail changes. Any future work on the blank-embedded-slide report
needs the original board or an equivalent that retains a live embeddable element.

### 19f. Virtualization — **NOT JUSTIFIED**

All 14 cards mount, but no material mounting, layout or re-render cost was demonstrated,
and sidebar scrolling triggered **zero thumbnail renders and zero additional idle
renders**.

§5d is answered: mounting is not the dominant cost. **§8's provisional design is
withdrawn except for its `scrollIntoView` element.** No list windowing and no
virtualization dependency is authorized.

### 19g. AUTHORIZED REPAIR — active-slide thumbnail auto-scroll only

**Production allowlist — one file:**

| File | Scope |
|---|---|
| `components/presentation/PresentationPanel.tsx` | active-thumbnail auto-scroll only |

**Verified sufficient before granting:** the sidebar scroll container (`L334`), the slide
card map (`L341`), the card button (`L375`) and the `SlideThumbnail` mount (`L378`) are
all **inline in `PresentationPanel.tsx`**, and `useRef` is already imported (`L3`). The
repair therefore needs no other file. This check was done deliberately — PATCH-129 §15b
is the standing lesson against an allowlist the authorized shape cannot satisfy.

**If implementation nonetheless finds the active card or scroll container defined in a
directly extracted child component, STOP and request an allowlist amendment before
editing it.**

**Explicitly NOT authorized:** `useSlideThumbnails.ts`; `slideThumbnailRefresh.ts`;
`SlideThumbnail.tsx`; signature logic; render queues; image loading; virtualization;
embedded-media behaviour.

**Test allowlist — one new file:**
`e2e/characterization/patch-132-thumbnail-visibility.spec.ts`. **Do not modify the
PATCH-128, PATCH-129 or PATCH-130 specs.**

### 19h. Expected behaviour (governed)

When `activeSlideId` changes:

1. identify the thumbnail card **by stable slide ID**;
2. inspect its bounds relative to the sidebar scroll container;
3. if fully visible, **do nothing**;
4. if partly or fully outside, scroll **only the sidebar container**;
5. use nearest-edge alignment or equivalent **minimal movement**;
6. **do not scroll the document**;
7. do not scroll repeatedly when `activeSlideId` has not changed;
8. do not fight manual scrolling unless `activeSlideId` changes;
9. reselecting an already visible slide must cause **no drift**;
10. **preserve PATCH-130 canvas navigation behaviour.**

### 19i. Acceptance tests — mandatory

Use a representative Drawing board with enough slides that the target active thumbnail
**begins fully offscreen**. Assert:

1. selecting an offscreen slide from the canvas changes `activeSlideId`;
2. the sidebar scroll container moves;
3. the active thumbnail becomes **fully** visible;
4. document/page scroll position does not change;
5. selecting an already visible slide causes no scroll movement;
6. reselecting the same active slide causes no drift;
7. selecting a distant slide scrolls by the minimum practical amount;
8. manual sidebar scroll is not reversed while `activeSlideId` is unchanged;
9. behaviour uses **stable slide ID, not array index**;
10. slide order and selection unchanged;
11. PATCH-130 canvas navigation remains functional;
12. sidebar scrolling alone causes **no** thumbnail regeneration;
13. no continuous scroll loop at idle.

**False-green rejection:** the test calls an internal scrolling function directly; fixed
sleeps as sole synchronization; the page scrolls instead of the sidebar; the target card
is already visible before selection; slides identified only by index; the active card is
merely *partly* visible; scrolling recurs without `activeSlideId` changing; thumbnail
updates disabled; any PATCH-128/129/130 test modified.

Carried standards: acceptance evidence must live in the committed suite; the test must
prove the mechanism was entered before asserting the outcome; **`--repeat-each=3`**.

### 19j. Status

**PATCH-132: OPEN · ACTIVE-SLIDE AUTO-SCROLL DEFECT REPRODUCED · ONE-SLIDE
CHANGED-SIGNATURE SUPPRESSION PROVEN · CROSS-SLIDE UPDATE BOUNDED TO SOURCE AND
DESTINATION · QUEUE PERFORMANCE DEFECT NOT REPRODUCED · VIRTUALIZATION NOT JUSTIFIED ·
YOUTUBE FAILURE LAYER UNCLASSIFIABLE ON IMPORTED BOARD · NARROW IMPLEMENTATION
AUTHORIZED.**

**PATCH-131: OPEN · BLOCKED · not modified. PATCH-130 / 129 / 128: CLOSED — not modified
or reopened.**

**Commit contract.** Implementation: `fix(presentation): scroll active slide thumbnail
into view`. Tests: `test(presentation): characterize active thumbnail auto-scroll`.
**Do not push. Do not close PATCH-132.** The §12 hard stops, regression boundaries and
protected-path rules are unchanged.

### 19k. Recorded diagnostic notes

- **A source-proven structural weakness is not evidence of the reported symptom** (§19c).
  Serial FIFO with no priority is exactly as described in the code, and at 0.8–2.0 ms per
  render it causes nothing. I ranked it the strongest candidate on structure alone; the
  measurement demoted it. **Structural certainty and causal attribution are different
  claims, and only the second justifies a repair.**
- **The measurement shrank the patch rather than growing it.** Diagnosis began with a
  performance brief spanning queues, virtualization, priority policy and embedded media,
  and ends authorizing one auto-scroll behaviour in one file. **Refusing to authorize on
  three earlier turns is what made that possible** — an implementation started from the
  original hypothesis set would have built a priority scheduler and a virtualized list
  that the evidence now says are unnecessary.
- **The export/import caveat paid off** (§19e). §18c predicted the embedded element was
  the thing least likely to survive and required it be checked first; it did not survive,
  and the YouTube report remains open rather than being answered from a board that cannot
  answer it.
- **Two of the user's five proposals are not supported by evidence** — render-only-visible
  thumbnails, and defer-hidden-previews. Both target a cost that measured 0.8–2.0 ms. The
  auto-scroll proposal is confirmed, and the "avoid work while moving" proposal is
  already implemented and working (§19b). **Recorded so the unbuilt proposals are visibly
  declined with a reason, not quietly dropped.**

---

## 20. Amendment — CLOSED; INDEPENDENT ACCEPTANCE REVIEW PASSED (2026-08-02, CTO)

Independent acceptance review of the PATCH-132 implementation returned **PASS**.
**PATCH-132 is CLOSED.**

### 20a. Implementation commits

| Commit | Scope |
|---|---|
| `a08a576` | `fix(presentation): keep active thumbnail visible` — production repair + initial characterization spec |
| `d79d587` | `test(presentation): prove active thumbnail auto-scroll` — false-green correction to the spec only |

Governance authorization: `f8defed` (§19).

**Commit-message deviation, recorded rather than waived silently.** §19j specified
`fix(presentation): scroll active slide thumbnail into view` and
`test(presentation): characterize active thumbnail auto-scroll`. The messages actually used
differ in wording. The **scope contract was honoured exactly**; only the wording drifted,
and the implementation turn's own instructions specified the wording used. No action
required — recorded so a future reader matching §19j against `git log` is not misled into
thinking a different change landed.

### 20b. Governance compliance — verified

- production change limited to `components/presentation/PresentationPanel.tsx`;
- test change limited to `e2e/characterization/patch-132-thumbnail-visibility.spec.ts`;
- **both commits together touch exactly those two files** — verified by `git show --stat` on
  each;
- no thumbnail scheduling, virtualization, queue, image-loading, debounce, signature or
  embedded-media change — the §19g prohibitions all held;
- the five protected paths appear in neither commit and remain unstaged;
- the closed PATCH-128, PATCH-129 and PATCH-130 specs are unmodified.

### 20c. Production implementation — accepted

Confirmed against §19h point by point: sidebar scroll-container ref; slide-row refs keyed by
**stable slide ID**; `useLayoutEffect` depending only on `activeSlideId`; no render or scroll
loop; manual scrolling not retriggered while `activeSlideId` is unchanged; stale row refs
pruned; identity preserved across reorder; nearest-edge arithmetic; **fully visible card
produces no movement**; above/below overflow produces minimum practical movement; **only the
sidebar's `scrollTop` is mutated** — document and canvas scrolling are never invoked; browser
clamping handles the boundaries safely.

The scrolling calculation as landed:

```
topOverflow    = containerRect.top - rowRect.top
bottomOverflow = rowRect.bottom - containerRect.bottom
topOverflow    > 0  → container.scrollTop -= topOverflow
bottomOverflow > 0  → container.scrollTop += bottomOverflow
otherwise           → no write
```

**The absence of a page scroll is structural, not behavioural.** `window.scrollTo` and
document scrolling are not referenced anywhere in the change, so §19h.6 cannot be violated by
any input.

### 20d. FALSE-GREEN CORRECTED — the most important finding of this review

The spec as committed in `a08a576` activated the offscreen slide with Playwright
`locator.click()`. **That was false-green.** Playwright's actionability checks scroll overflow
ancestors *before* dispatching the click, so the sidebar was already scrolled by the test
framework, and the assertion "the target became fully visible" would have passed **with the
production effect removed**.

`d79d587` replaced that activation with a dispatched DOM event:

```
locator.evaluate(button => button.dispatchEvent(
  new MouseEvent('click', { bubbles: true, cancelable: true, view: window })))
```

which bypasses actionability, performs no automatic scroll, and still reaches the real React
`onClick` → `handleActivateSlide` → `activeSlideId` → production `useLayoutEffect`. The
corrected spec asserts a three-point timeline: **T0** target attached, fully offscreen,
`scrollTop === 0`, not active; **T1** immediately before dispatch, `scrollTop` and document
scroll unchanged and the row still fully offscreen; **T2** after dispatch, `activeSlideId`
changed to the target's stable ID, `scrollTop` changed, row fully visible, document scroll
unchanged.

**Negative control.** The production `useLayoutEffect` was temporarily disabled during
validation. `activeSlideId` still changed, the row stayed offscreen, and the fully-visible
assertion **failed**. The temporary edit was fully restored and never committed —
independently verified at closure: the working tree is clean against `HEAD` for the production
file and the effect is present at `a08a576`. This is the evidence that the production effect,
not the harness, is the agent responsible for the scroll.

`d79d587` also corrected the fixture's Excalidraw fractional indices from `p132-000001`-style
strings to valid order keys. Not mentioned in the review summary; recorded here because it is
a second real defect fixed in that commit, and because invalid fractional indices are a
standing cause of silently dropped scene elements in this repo.

### 20e. Other assertions — preserved through the correction

Already-visible activation causes no unnecessary scroll; reselection causes no drift; manual
sidebar scrolling persists while `activeSlideId` is unchanged; sidebar scrolling causes **no**
thumbnail image-`src` updates; page scroll unchanged; slide order unchanged; stable slide IDs
used throughout; disposable fixture remains isolated; no idle scroll loop; canvas state
unchanged by sidebar scrolling. §19i items 1–13 are covered.

### 20f. Validation

Completed successfully during implementation and correction: `npx tsc --noEmit`; the PATCH-132
focused spec; **`--repeat-each=3`** per the carried standard; the closed PATCH-130 regression
spec (run, not modified); `git diff --check`.

**During the independent review, typecheck and diff checks remained clean, but both the
PATCH-132 spec and the closed PATCH-130 spec stopped at the same shared `waitForHarness`
infrastructure timeout, before any patch-specific assertion ran.**

**Classification: SHARED TEST-HARNESS ENVIRONMENT FAILURE — NOT a PATCH-132 implementation or
test-logic failure.** A closed, previously accepted spec failing at the identical shared setup
step is the discriminator: a PATCH-132 defect cannot reach into PATCH-130's harness. **Do not
reopen PATCH-130 and do not reject PATCH-132 on this basis.**

**Recorded limitation, stated plainly rather than absorbed into the PASS.** The acceptance
evidence for this closure is the green implementation/correction runs plus the negative
control, **not** a green re-run observed during independent review. That is weaker than
closing on a review-time green, and it is accepted here because the corrected spec is
committed, repeatable and independently re-runnable once the harness environment is healthy.
**If the shared harness timeout persists, it is its own defect and needs its own patch** — it
is not PATCH-132's to carry, and closing this patch must not be read as evidence that the
harness is well.

### 20g. Out of scope at closure — unchanged

The **YouTube / embedded-media failure layer remains OUT OF SCOPE and unresolved** (§19e,
§5b). It was unclassifiable on the imported diagnostic board because no embeddable scene
element survived the export/import round trip. **Closing PATCH-132 does not answer the
blank-embedded-slide report**; that needs the original board or an equivalent retaining a live
embeddable element. Queue priority, visibility gating and virtualization remain declined on
measurement (§19c, §19f), not deferred.

### 20h. Status

**PATCH-132: CLOSED · ACTIVE-SLIDE THUMBNAIL AUTO-SCROLL IMPLEMENTED · FALSE-GREEN TEST
CORRECTED · INDEPENDENT REVIEW PASSED · NO QUEUE OR VIRTUALIZATION CHANGES · YOUTUBE FAILURE
LAYER REMAINS OUT OF SCOPE · NOT PUSHED.**

**PATCH-131: OPEN · BLOCKED · not modified. PATCH-130 / 129 / 128: CLOSED — not modified or
reopened**, and specifically **not** reopened by §20f's harness-timeout note.

### 20i. Recorded diagnostic notes

- **Playwright actionability is a false-green generator for any scroll-into-view test.**
  `locator.click()` scrolls overflow ancestors before dispatching, so a test that asserts "the
  element became visible after clicking it" measures the test framework, not the product.
  **Scroll-visibility behaviour must be activated by a dispatched DOM event, and the
  pre-dispatch scroll state must be asserted immediately before the dispatch** — a T0 check
  alone is insufficient, because the framework scrolls between T0 and the click.
- **The negative control is what upgraded this from "the test passes" to "the production code
  is responsible."** The false-green survived a full implementation turn including a
  `--repeat-each=3` green. Only disabling the production effect and watching the assertion
  fail distinguished the two. **For any test whose subject is a side effect on shared UI
  state, an induced-failure run is not optional diligence — it is the assertion.**
- **A closed patch's spec failing at the same step is the cheapest way to classify an
  environment failure** (§20f). Without the PATCH-130 re-run there would have been no
  principled way to separate "our new test is wrong" from "the harness is down," and the
  default would have been to suspect the new work.
