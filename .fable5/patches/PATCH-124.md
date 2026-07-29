# PATCH-124 — Slide-thumbnail refresh scheduling and manual refresh

**Status:** OPEN · AUTHORED RETROACTIVELY · CONDITIONALLY AUTHORIZED ·
IMPLEMENTATION EXISTS BUT IS **NOT ACCEPTED**
**Base commit:** `dee9b99` (PATCH-123 closure)
**Authored:** 2026-07-29, CTO
**Model assignment:** GPT-5.5 implements. Independent reviewer reviews. The
authoring CTO neither implements nor reviews.

---

## 0. Process record — authorization followed implementation

**No PATCH-124 document existed when the candidate was written.** A search of
`.fable5/` at `dee9b99` returned no `PATCH-124.md` and no reference to
"PATCH-124" anywhere in the directory. The patch numbering jumps
`PATCH-123 → (none)`.

Four files were changed without a governing document:

```
M  components/presentation/PresentationPanel.tsx
M  components/presentation/useSlideThumbnails.ts
?? lib/infra/presentation/slideThumbnailRefresh.ts
?? lib/infra/presentation/slideThumbnailRefresh.test.ts
```

This document is therefore authored **retroactively**. That is a deviation
from the Fable 5 model, and it is recorded rather than smoothed over: the
contract below was **derived from the implementation**, which inverts the
normal direction and carries a specific risk — a contract read off the code
tends to ratify whatever the code already does. §5 exists to counteract that,
and §6 lists what the code does that the contract does **not** ratify.

**The implementation is NOT accepted by this document.** Authorization to
*exist and be reviewed* is not acceptance. §7 lists the blocking conditions.

### 0a. Screenshot evidence was NOT available

The authoring request referenced the owner's screenshots. **No screenshot was
available in this session.** I did not see them, and I will not paraphrase
visual evidence I have not examined.

Consequence, binding: **every user-visible claim in this patch is UNPROVEN by
this document.** The defect statement in §1 is reconstructed from source and
from the candidate's own shape, and is labelled as such. §5 makes real browser
characterization a **blocking** acceptance gate precisely because the visual
evidence is missing from the record. If the screenshots show something §1 does
not describe, **§1 is wrong and must be amended before acceptance** — do not
reinterpret the screenshots to fit it.

---

## 1. The defect — reconstructed, NOT confirmed by this document

Slide thumbnails in the Presentation panel go **stale**: the panel shows an
out-of-date preview of a slide whose canvas content has changed. The candidate
addresses this in two distinct ways, which implies two distinct faults:

**Fault A — scheduling and race handling (downstream).** The prior hook
(`useSlideThumbnails.ts` at `dee9b99`) had no request-ordering guard. It
recorded `renderedRef.current[s.id] = versionKey` on completion of an
`await`ed render, where `versionKey` was captured **before** the await. If the
slide changed during the render, the hook stored a **stale PNG under a stale
key** and, because the key then differed from the live key, would re-render —
but nothing ordered two concurrent renders of the same slide, so the **loser
could land last**. It also had no coalescing: every `slideSignature` change
started a fresh serial pass.

**Fault B — invalidation (upstream, NOT owned by this patch).** The cache key
is `renderSignature ?? geometry+contentVersion`
(`slideThumbnailRefresh.ts:20`). `renderSignature` originates at
`DrawingLayout.tsx:2198` via `slideRenderer.getSlideRenderSignature`, and
`contentVersion` increments **only** when that signature changes
(`:2199-2201`). The whole `frames` memo recomputes only on
`[elements, canvasLines]` (`:2234`).

**Therefore: if a slide's rendered appearance changes without changing
`elements`, `canvasLines`, or the signature's folded inputs, the cache key
never changes and no downstream scheduling can refresh that thumbnail.** The
existing PATCH-115 comment at `DrawingLayout.tsx:2230-2233` documents exactly
this hazard for CanvasLines.

This is the load-bearing distinction in the patch. **The manual refresh button
is a workaround for Fault B, not a fix for it** — it works precisely because
`forcedIds` bypasses the cache-key comparison (`slideThumbnailRefresh.ts:44`).
It must not be described, in any commit message or closure, as fixing
invalidation.

---

## 2. Scope boundary against PATCH-115 — bind

**`getSlideRenderSignature.ts` is owned by PATCH-115, which is OPEN, BLOCKED
and LANDED (`215ea81`), NOT CLOSED.** PATCH-115 §3 is titled "Invalidation
(bind — root cause already proven)" and its §6 file scope claims
`components/presentation/slide-renderer/getSlideRenderSignature.ts`.

**PATCH-124 must not touch the invalidation layer.** Prohibited:

```
components/presentation/slide-renderer/getSlideRenderSignature.ts
components/presentation/slide-renderer/createSlideRenderer.tsx
components/collabboard/canvas/layouts/DrawingLayout.tsx
components/presentation/FullscreenPresentation.tsx
components/presentation/PresentationPreviewModal.tsx
lib/infra/drawing/presentationBridge.ts
```

PATCH-124 is confined to **scheduling, race resolution, and the manual
refresh affordance**. Any finding that the true fix requires a signature
change is a **hard stop** (§8) and routes to PATCH-115, not to an ad-hoc
widening here.

Note for the record: `FullscreenPresentation.tsx:101` and
`PresentationPreviewModal.tsx:42` each **duplicate the cache-key formula
inline**. The new `getSlideThumbnailCacheKey` helper is a fourth copy. That
duplication is **recorded debt**, not authorized work — de-duplicating it
would edit prohibited files.

---

## 3. Authorized file scope — 3 production, 1 test

```
lib/infra/presentation/slideThumbnailRefresh.ts        AUTHORIZED (new)
lib/infra/presentation/slideThumbnailRefresh.test.ts   AUTHORIZED (new)
components/presentation/useSlideThumbnails.ts          AUTHORIZED
components/presentation/PresentationPanel.tsx          AUTHORIZED WITH CONDITION (§6.4)
```

**Maximum 3 production files and 1 test file.** No other implementation file
may be added. A browser characterization spec under
`e2e/characterization/` is **additionally required** by §5 and is authorized
as a fifth file when written.

### 3a. Per-file ruling on the existing candidate

**`lib/infra/presentation/slideThumbnailRefresh.ts` — AUTHORIZED.** Correct
placement. It is a pure, dependency-free module: no React, no DOM, no timers.
That makes it testable under the repo's `environment: 'node'` Vitest config
and matches the `lib/infra/**` include glob, so the tests are actually
discovered — the PATCH-120 §16 discovery failure is not repeated here.
Extracting selection, key derivation and accept/reject as pure functions is
the right decomposition.

**`lib/infra/presentation/slideThumbnailRefresh.test.ts` — AUTHORIZED, but
INSUFFICIENT ALONE.** 9 tests, all passing. They pin the debounce constant,
key precedence, changed-slide selection, in-flight deferral, force-all,
force-one, and the three accept/reject cases. This is genuinely good coverage
**of the pure helpers**. It proves **nothing** about whether a thumbnail
updates on screen. See §5.

**`components/presentation/useSlideThumbnails.ts` — AUTHORIZED.** The hook is
the correct home for the timer, the refs and the async orchestration.

**`components/presentation/PresentationPanel.tsx` — AUTHORIZED WITH
CONDITION.** The refresh button is authorized. The unrelated whitespace
deletion is not — see §6.4.

---

## 4. Behavioural contract — bind

1. **Cache key derivation is unchanged in meaning.** `renderSignature` wins;
   otherwise `x,y,width,height,contentVersion??0`. The extracted helper must
   remain byte-equivalent in output to the prior inline expression. This is a
   refactor of *where* the formula lives, not *what* it computes.
2. **Automatic refreshes are debounced and coalesced** at a bounded
   `SLIDE_THUMBNAIL_REFRESH_DEBOUNCE_MS = 250`. The constant must stay
   asserted by a test so it cannot drift silently.
3. **A stale async render must never overwrite a newer one.** Acceptance
   requires *both* `requestId === latestRequestId` **and**
   `requestedCacheKey === latestCacheKey`. Either alone is insufficient.
4. **A slide already in flight is deferred, not skipped.** Its id must be
   queued so the latest state renders after the running pass completes.
   Dropping it silently is the defect this rule exists to prevent.
5. **A rejected render must re-queue its slide** when the slide still exists,
   so rejection never leaves a permanently stale thumbnail.
6. **Manual refresh forces all current slides**, bypassing the cache-key
   comparison. This is the sanctioned Fault-B escape hatch.
7. **Only the thumbnail pipeline may change.** No slide geometry, ordering,
   naming, export, share or fullscreen behaviour may be affected.
8. **Timers must be cleared on unmount**, and in-flight work cancelled, with
   no state set after teardown.
9. **`isGeneratingAny` must settle to `false`** on every exit path, including
   the empty-slides and no-work paths.

---

## 5. Required browser characterization — BLOCKING

**Helper-only tests are insufficient.** This is not a new standard invented
here: PATCH-115 §5 is titled "Required tests (bind — helper-only tests are
insufficient)" for this same subsystem. The nine passing unit tests exercise
pure functions whose inputs are hand-written; **not one of them renders a
slide, mounts the hook, or observes a thumbnail changing.** A defect about
stale images on screen cannot be certified by a test that never produces an
image.

A real-browser characterization spec under `e2e/characterization/` is
**required before acceptance** and must prove, against a **real canvas with
real frames**:

1. A slide thumbnail **visibly updates** after its canvas content changes —
   asserted on the actual image data (`src`/data-URL identity change), not on
   a spinner, a class, or a count.
2. The thumbnail matches the **new** content, not merely "something changed".
3. Rapid successive edits produce **one** settled correct thumbnail, not a
   flicker sequence ending on a stale frame — the direct test for §4.3.
4. The **manual refresh button** re-renders thumbnails when the cache key has
   **not** changed. This is the only test that can prove the button does
   anything, since by construction its input is unchanged.
5. Editing slide A does **not** alter slide B's thumbnail.
6. Unmounting the panel mid-render produces **no** post-teardown state
   update and no console error.
7. `isGeneratingAny` reaches `false` after the pass settles.

**Induced-failure proof, required.** Reverting the request-ordering guard
(`shouldAcceptSlideThumbnailRender`) must make test 3 **fail**. Reverting the
forced path must make test 4 **fail**. A guard nobody can prove is load-bearing
is not proven to be load-bearing.

**Credential and safety rules, unchanged and binding.** Reference credentials
only via `LIVE_ACCESS_EMAIL`/`LIVE_ACCESS_PASSWORD` or
`E2E_EMAIL`/`E2E_PASSWORD`. Never print, log, echo, commit or copy a
credential into a report. Storage state goes only to a scratch path outside
the repository and is deleted after use. `.env.local` must not be modified.
Report identities as **user ids only — never an email, never a token, never
cookies.**

---

## 6. Findings against the current candidate — must be resolved

**6.1 — `refreshSlideThumbnail` is dead API.** It is created
(`useSlideThumbnails.ts:198`) and returned (`:216`), and **no consumer
exists** — a repository-wide search finds references only inside the hook
itself and the panel's use of `refreshAllThumbnails`. This is the same shape
as the `EmojiReactionPicker` zero-call-site signal I misread in PATCH-120 §5,
and the dead `{false && …}` guard at `FreeformPadletCards.tsx:779`. **Ruled:
either wire it to a per-slide refresh action in the slide context menu, or
remove it.** Do not leave an unreachable export. If it is wired, §5's test
list gains a per-slide case.

**6.2 — a coalesced plain refresh arriving mid-pass is silently dropped.** In
`warmThumbs`, when a pass is already running:

```ts
if (runningRefreshRef.current) {
  if (forcedIds === null) { …queue force-all… }
  else if (forcedIds) { …queue those ids… }
  return;                    // forcedIds === undefined → NOTHING queued
}
```

With `forcedIds === undefined` — which is exactly the automatic
signature-driven path (`scheduleRefresh` passes `undefined` when nothing is
pending) — the call queues nothing and returns. The trailing re-schedule fires
only `if (pendingForceAllRef.current || pendingSlideIdsRef.current.size > 0)`,
so that refresh is **lost**. A content change landing during a running pass
can leave a thumbnail stale until the *next* unrelated change. **This
contradicts §4.4 and §4.5.** Ruled: it must be fixed and covered by a test
that fails before the fix. Whether it is reachable in practice is not the
question — the guard is claimed, so it must hold.

**6.3 — the manual button must not be sold as the fix.** Per §1 and §2, it is
a workaround for an upstream invalidation gap owned by PATCH-115. The commit
message and closure must not state or imply that thumbnail invalidation is
fixed. Accurate framing: *scheduling and race handling are fixed; a manual
refresh is added as an escape hatch.*

**6.4 — out-of-contract whitespace edit.** `PresentationPanel.tsx` deletes a
blank line between "Preview slide" and the following divider (diff hunk at
`:463`). It is unrelated to thumbnails and outside §4.7. **Ruled: revert it.**
Unrelated cosmetic churn in a behavioural patch obscures review and inflates
the diff of a file that is otherwise touched for one reason.

**6.5 — the refresh button has no disabled/pending state.** `isGeneratingAny`
is available in the panel but the button ignores it, so it can be clicked
repeatedly during a pass. Behaviour is *safe* (the pass coalesces), but the
control gives no feedback. **Not blocking.** Ruled as a recorded UX note; if
addressed, it must not introduce a second source of pending truth.

**6.6 — `warmThumbs` is still exported and now accepts `forcedIds`.** External
callers could pass `null` and force-render everything, bypassing the debounce.
No consumer does. **Not blocking**, but the public shape is wider than the
contract needs; prefer narrowing the returned `warmThumbs` to a
zero-argument function.

---

## 7. Acceptance criteria — all required

1. §6.1, §6.2 and §6.4 resolved.
2. §5 browser characterization written, **run against a real canvas**, and
   passing, with both induced-failure proofs demonstrated.
3. All nine §4 contract items hold.
4. `git diff --check` clean (CRLF warnings permitted).
5. `npx tsc --noEmit` passes.
6. Focused Vitest passes; full Vitest passes with no pre-existing test broken.
7. ESLint reports no new error and no new warning.
8. Independent review PASS. The authoring CTO does not review.
9. No prohibited file (§2) modified.
10. No protected path staged (§9).

**Production-build note, carried from PATCH-123 §14h:** `npm run build`
currently fails at `dee9b99` before `.next` generation with
`TypeError: Cannot read properties of undefined (reading 'length')`,
independently reproduced. It is **unresolved and unclassified**. PATCH-124
does **not** inherit responsibility for it, must **not** claim the production
build passes, and must **not** be blocked by it. If PATCH-124's own changes
are found to contribute, that is a hard stop (§8).

---

## 8. Hard stops — stop and report, do not improvise

1. The fix requires changing `getSlideRenderSignature` or any §2 prohibited
   file.
2. A correct fix requires more than 3 production files.
3. Thumbnails cannot be proven to update in a real browser.
4. The manual refresh button is found to be the *only* thing that refreshes a
   changed slide — that would mean Fault B is the whole defect and the patch
   is mis-scoped.
5. PATCH-124's changes are implicated in the production-build failure.
6. Any required change would alter export, share or fullscreen behaviour.

---

## 9. Protected paths — never staged, never modified

```
.gitignore
app/api/ai/classify-intent/route.ts
app/api/ai/convert-component/route.ts
app/api/ai/generate-component/route.ts
scripts/live-access-login.mjs
```

`.env.local` must not be modified. **PATCH-118 and PATCH-119 must not be
begun.**

---

## 10. Bound commit message (exact, for the implementation commit)

```
fix(presentation): order and coalesce slide thumbnail refreshes (PATCH-124)
```

Nothing appended. This wording deliberately says **order and coalesce**, not
"fix stale thumbnails" — see §6.3.

---

## 11. Candidate state at authoring

Recorded for the reviewer. Gates run by the CTO at `dee9b99`:

```
lib/infra/presentation/slideThumbnailRefresh.test.ts   9 PASS
npx tsc --noEmit                                       PASS
```

Candidate hashes at authoring time:

```
components/presentation/PresentationPanel.tsx          (modified, +14/-3)
components/presentation/useSlideThumbnails.ts          (modified, +148/-45 across both files)
lib/infra/presentation/slideThumbnailRefresh.ts        (new, 69 lines)
lib/infra/presentation/slideThumbnailRefresh.test.ts   (new, 109 lines)
```

**The implementation remains UNCOMMITTED and UNSTAGED.** This governance
commit contains `.fable5/patches/PATCH-124.md` only.

---

## 12. Next GPT-5.5 instruction (bind)

> **Do not begin new work. Resolve §6.1, §6.2 and §6.4 in the existing
> candidate, then write the §5 browser characterization.**
>
> Do not touch any §2 prohibited file. Do not modify a protected path. Do not
> change the cache-key formula's meaning. Do not claim the production build
> passes, and do not claim thumbnail invalidation is fixed — this patch fixes
> ordering, coalescing and adds a manual escape hatch.
>
> Both induced-failure proofs are required: reverting
> `shouldAcceptSlideThumbnailRender` must fail the rapid-edit test, and
> reverting the forced path must fail the manual-refresh test.
>
> Leave the candidate uncommitted and unstaged for independent review.

---

## 13. Status

**PATCH-124: OPEN · AUTHORED RETROACTIVELY · CONDITIONALLY AUTHORIZED ·
IMPLEMENTATION EXISTS · NOT ACCEPTED · NOT REVIEWED · UNCOMMITTED.**
Production allowlist **3 max**, plus 1 unit test and 1 required
characterization spec. Four candidate files ruled in §3a: three authorized,
one authorized with a condition. Zero files rejected outright.

**PATCH-123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED and retired.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED** — it owns the
invalidation layer this patch is forbidden to touch.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt:** the cache-key formula is now duplicated in four places
(`slideThumbnailRefresh.ts:20`, `FullscreenPresentation.tsx:101`,
`PresentationPreviewModal.tsx:42`, `presentationBridge.ts:160`);
de-duplication is blocked by §2. Plus the unresolved production-build failure
(§7) and the debt ledger carried in PATCH-123 §14k.
