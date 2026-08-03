# PATCH-142 — SLIDE THUMBNAIL INVALIDATION SCOPE AND RENDER COMPLETENESS

**Status:** governance, diagnosis and architecture. **No implementation.**
**Authored:** 2026-08-03 (CTO). **Base:** `cc74e8e`.
**Blocks:** PATCH-137 (PATCH-124 real-UI migration).

## 1. Why this patch exists

PATCH-137's real-UI migration hard-stopped at C5. Diagnosis (PATCH-137 §20) established two
production defects that PATCH-124's private `updateScene` path executed too quickly to expose:

- **A — cross-frame invalidation over-reach.** A portrait-only edit re-renders the landscape thumbnail, 20/20.
- **B — render-completeness non-determinism.** The same slide rasterises with materially different content depending on whether overlay cards and images have finished loading.

## 2. Confirmed evidence (PATCH-137 §20d–20e)

Landscape thumbnail changed after a portrait-only edit **20/20**, 2.0–2.8 s after the commit ·
green portrait colour in the landscape thumbnail **0/20** · final landscape hash equal to the
pre-edit hash **0/20** · landscape changed with no edit after the current settled waiter
**5/20**, 568–971 ms later · all landscape-owned Excalidraw elements identical in id, type,
`version`, `versionNonce` · all eight padlet rows' `updated_at` unchanged · both decoded images
569 × 320 · the incomplete raster held text + seeded blue rectangle + red rectangle, the
complete one additionally held both embedded cards and the moodboard image · **no portrait
content leaked**.

## 3. The PATCH-137 leading hypothesis — **REFUTED**

PATCH-137 §20f proposed: a render is rejected mid-flight, `renderedRef` is never updated, the
slide is left permanently dirty, and every later pass re-renders it. It was explicitly
recorded as unconfirmed. **Direct instrumentation refutes it.**

Temporary diagnostic instrumentation was added to `useSlideThumbnails.ts`, built into an
`E2E_BRIDGE_BUILD=1` artifact, exercised through real UI, then **reverted** (§12). It recorded
requested key, latest key, `keysEqual`, `shouldAccept`, `renderedRef` before, the dirty set,
the scheduling reason, and every `toDataURL` invocation with canvas dimensions.

```
COLD LOAD (no edits)
 t= 2101 PASS forced=none requests=[landscape, portrait] dirty=[landscape, portrait] renderedKeys={}
 t= 2793 toDataURL#2 canvas 569x320
 t= 2794 RENDER landscape req#1 keysEqual=true  renderedBeforeLen=0     png=64338
 t= 3348 toDataURL#3 canvas 180x320
 t= 3348 RENDER portrait  req#2 keysEqual=true  renderedBeforeLen=0     png=9118

PORTRAIT-ONLY EDIT
 t=18595 SIGCHANGE      t=18839 SIGCHANGE          (two changes, one pass — debounce works)
 t=19100 PASS forced=none requests=[landscape, portrait] dirty=[landscape, portrait]
         renderedKeys={landscape:6386, portrait:2645}  slideKeys={landscape:6384, portrait:2780}
 t=20184 toDataURL#4 canvas 569x320
 t=20186 RENDER landscape req#3 keysEqual=true  renderedBeforeLen=6386  png=55546
 t=21077 RENDER portrait  req#4 keysEqual=true  renderedBeforeLen=2645  png=10286
```

**Every observed render had `keysEqual = true` and was accepted. Zero rejections.
`renderedRef` was always correctly updated. No slide was ever left dirty by a rejection.**

The retry path is also real: on rejection, `useSlideThumbnails.ts:121-123` adds the slide to
`pendingSlideIdsRef` and the `finally` block at `:131-136` calls
`scheduleRefreshRef.current(undefined, true)` — an immediate replacement pass. **A rejected
render is not abandoned.**

**The invalidation machinery is correct. The signature it is fed is wrong.** `dirty` contains
`frame-landscape` because the landscape's own cache key genuinely changed — `6386 → 6384` —
with no landscape element changed.

This is a correction to PATCH-137 §20f, and it matters: the repair proposed there (fix the
rejected-render terminal state) would have changed nothing.

## 4. Root causes — observed, not inferred

A full signature diff across a portrait-only edit named the changed fields exactly.

### RC-1 — `zIndex` is a whole-scene ordinal (primary invalidation defect)

`resolveSlidePadlets.ts:15`:

```ts
.map((element: any, zIndex: number) => ({ element, zIndex }))
```

`zIndex` is the element's index **in the entire scene array**, not within the slide. It is
folded into the landscape slide's key at `getSlideRenderSignature.ts:143`, and
`planSlideComposition.ts:30-31,77-87` uses the same global ordinal (`activeIndexById`,
`firstPadletActiveIndex`) to split the native-below / native-above bands.

Observed on a portrait-only edit: the landscape slide's embeddables moved `zIndex 2 → 3` and
`3 → 4`.

**Inserting any element anywhere in the scene shifts the ordinal of every later element, so
every slide's signature changes and every slide is re-rendered.** This is the mechanism behind
20/20, and it is a genuine defect: a slide's key must not depend on scene positions outside it.

### RC-2 — overlay elements mutate after load (contributing)

The same diff showed the landscape's embeddables changing `version 1 → 2`, `versionNonce 1 →
347353821`, `width 360 → 320`, `height 153 → 80`. The overlay system resizes and re-lays out
embeddables after mount.

**These are legitimate visual inputs** — width and height change what the thumbnail shows — so
they must stay in the signature. They are recorded here because they explain why the landscape
key keeps moving after "settle", and because a repair that suppressed them would break real
invalidation.

### RC-3 — slide members are still being created after settle (completeness defect)

At cold settle (15 s, no edits) the landscape signature contained **two** embeddables. After
the portrait edit it contained **three** — a newly created embeddable with **`frameId: null`**
at `localX 160, localY 460`, linking to `padlet://…` Container C.

Two consequences:

1. **The overlay set is not complete when the first raster is taken.** A thumbnail rendered at cold settle is structurally missing content, which is exactly the 4 378 → 21 737 non-white difference in PATCH-137 §20c.
2. **Slide membership for padlet embeddables is geometric, not `frameId`-based.** `resolveSlidePadlets.ts:27` calls `resolveFrameMembership(element, frames)`, so an embeddable with `frameId: null` is resolved into whichever frame geometrically contains it. That is a deliberate design (it is how padlet cards join slides) and is **not** itself a defect — but it means overlay creation timing directly changes slide composition, with no readiness signal anywhere.

**There is no readiness input in the signature and no readiness precondition before
`toDataURL`.** Nothing in the pipeline can distinguish "this slide has rendered everything it
owns" from "this slide has rendered what happened to exist at that instant".

## 5. Source census

| Concern | Owner |
|---|---|
| Render signature | `components/presentation/slide-renderer/getSlideRenderSignature.ts` — `getSlideRenderSignature`, `buildPadletRenderState`, `summarizePadletMetadata` |
| Slide composition + band ordering | `components/presentation/slide-renderer/planSlideComposition.ts` — global `activeIndexById`, `firstPadletActiveIndex` |
| **Padlet resolution + `zIndex` origin** | `components/presentation/slide-renderer/resolveSlidePadlets.ts:15,27` |
| Cache key | `lib/infra/presentation/slideThumbnailRefresh.ts` — `getSlideThumbnailCacheKey` (`renderSignature` first, geometry+`contentVersion` fallback) |
| Slide selection / skip logic | same file — `selectSlidesForThumbnailRefresh`, `selectQueuedSlidesForActiveThumbnailPass` |
| Acceptance rule | same file — `shouldAcceptSlideThumbnailRender` |
| Debounce constant (250 ms) | same file — `SLIDE_THUMBNAIL_REFRESH_DEBOUNCE_MS` |
| `renderedRef`, in-flight set, request ids, pending sets, timer, scheduling | `components/presentation/useSlideThumbnails.ts:27-39, 44-173` |
| Scheduling trigger | `useSlideThumbnails.ts:200-208` — `slideSignature` over **all** slides, `scheduleRefresh()` with **no ids** |
| Manual refresh-all | `useSlideThumbnails.ts:210-212` → `scheduleRefresh(null, true)` |
| Mount pass | `useSlideThumbnails.ts:180-198` — double `rAF`, then `warmThumbs()` |
| Thumbnail state | `useSlideThumbnails.ts:24, 117-120, 215-222` |
| `toDataURL` | inside `renderSlideToPNG`, provided by `DrawingLayout.tsx:2299-2301` from `slideRenderer` |
| Existing unit coverage | `lib/infra/presentation/slideThumbnailRefresh.test.ts` — 20 cases |

**Ownership note:** `scheduleRefresh()` is always called with no ids, so *which* slide changed
is never propagated. Correctness rests entirely on the per-slide key comparison at
`slideThumbnailRefresh.ts:44` — which is why a signature containing foreign inputs is fatal.

## 6. Invalidation contract

> **A slide thumbnail re-renders only when an input to that slide's own visual output changes.**

Slide-owned inputs: frame-owned Excalidraw elements (identity, geometry, style, `version`/
`versionNonce`) · the frame's own dimensions and style · padlet/card content resolved into that
frame, including child content · image assets those cards display · the readiness/version of
those assets · **the relative ordering of that slide's own members** · renderer configuration
and version.

**Not slide-owned:** the absolute position of any element in the global scene array · edits to
elements belonging to another frame · scene-wide element count · any other slide's state.

**Does a shared dependency justify the observed portrait → landscape re-render?** No. The only
inputs that changed were the global ordinals (RC-1) and overlay churn belonging to the
landscape itself (RC-2/RC-3). The portrait rectangle shares no visual dependency with the
landscape slide. **It is a defect.**

## 7. Render-completeness contract

> **A thumbnail is not settled until every visual element the slide owns, for that render
> generation, is present and ready.**

"Required visible content" means: all frame-owned Excalidraw elements · every padlet embeddable
resolved into the frame, **with its overlay created and laid out** (RC-3) · images those cards
display, decoded — including the moodboard image · clipart/SVG where a card displays it · fonts
where text is rendered.

**Selected approach: B + C, with D as the user-facing behaviour.**

- **B — readiness in the signature.** Add an explicit overlay-readiness generation to the slide key so an incomplete composition is a *different* key from a complete one. This makes completion a first-class invalidation event instead of an accident.
- **C — await readiness before `toDataURL`.** The raster must not be taken while a slide-owned image or overlay is still resolving, bounded by an explicit timeout that **marks the result provisional rather than settled**.
- **D — provisional is allowed, settled is not assumed.** An early thumbnail may be shown (users should not stare at a blank panel), but it must never be recorded as the final accepted render for a complete key, and a completion render must be guaranteed.
- **A — delay scheduling until ready:** rejected as the primary contract; it would blank the panel during load.
- **A fixed delay is explicitly rejected as the readiness contract** (brief requirement, and PATCH-137 §20k).

## 8. Rejected-render terminal state

Answering the brief's required questions from source (`useSlideThumbnails.ts:99-137`):

| Question | Answer |
|---|---|
| Is the in-flight request removed? | Yes — `finally` at `:124-126` |
| Is the latest desired key retained? | Yes — in `slidesRef`, recomputed each pass |
| Is another render guaranteed? | **Yes** — `:121-123` adds to pending, `:131-136` schedules immediately |
| Is `renderedRef` updated? | No, correctly — only accepted renders write it (`:116`) |
| Is the slide left dirty? | Yes, and that is correct: it is dirty, and a pass is already scheduled |
| Can it re-render on every unrelated refresh? | **Only because of RC-1**, not because of rejection |
| Can it stay incomplete indefinitely? | **Yes — this is the real gap.** Not through rejection, but through RC-3: an *accepted* render of an incomplete composition is final until something else changes the key |

**Required terminal state:** every slide reaches either an accepted render whose key equals the
current key **and** whose readiness generation is complete, or an explicitly pending
replacement. **A silently accepted incomplete render is the state that must be eliminated** —
it is not currently reachable as "dirty" and so is invisible to every existing mechanism.

## 9. Per-slide signature design

1. **Slide-local ordering.** Replace the global array index with an ordinal computed over the slide's own resolved members, preserving relative order. Both `resolveSlidePadlets.ts:15` and the band split in `planSlideComposition.ts:30-31,77-87` must move to the slide-local basis together — fixing one alone would desynchronise composition from signature.
2. **Keep every genuine input.** Child-card content, `updated_at`, metadata, image URLs, embeddable geometry and `version`/`versionNonce` all stay. RC-2 churn must continue to invalidate.
3. **Add a readiness generation** for the slide's own overlays and images.
4. **Do not use global scene revision** as an invalidation input, and **do not use active-slide state** as a proxy for render ownership.
5. **Shared dependencies stay shared.** A padlet displayed in two frames must still invalidate both.

**Non-negotiable:** narrowing must not lose a real change. Test cases 1, 3, 4, 9, 10 (§11) exist
specifically to prove that.

## 10. Performance baseline — measured

| Metric | Observed |
|---|---|
| Renders during initial cold load | **2** (one per slide) |
| Renders caused by one portrait-only edit | **2** — landscape + portrait; **one wasted (50 %)** |
| Rejected renders | **0 of 4** |
| Accepted renders | **4 of 4** |
| Signature changes per edit | 2, coalesced into **1** pass — debounce works |
| Pass → landscape raster | ≈1.08 s; landscape render ≈1.6 s end to end |
| Pass → portrait raster | ≈1.98 s (after landscape, sequential) |
| Time to first thumbnails from load | ≈2.8 s (landscape), ≈3.3 s (portrait) |
| Time to **complete** landscape content | **> 15 s, and only after an unrelated edit** |

The last row is the user-visible cost of RC-3: on this fixture the landscape thumbnail never
reached complete content on its own.

**The fix must not trade broad re-rendering for missed refreshes.** Post-fix, the same table
must show one render per slide on cold load, **one** render for a portrait-only edit, and a
complete landscape thumbnail without any user edit.

## 11. Test requirements

All eighteen brief cases are adopted. Allocation:

**Unit — `slideThumbnailRefresh.test.ts` and a new signature test:** 1 (A-change invalidates A) ·
2 (**B-only change does not invalidate A** — the C5b regression guard) · 3 · 4 (shared dependency
invalidates exactly its dependents) · 5 (incomplete readiness cannot be accepted as final) ·
6 (rejected stale render preserves a guaranteed replacement) · 7 (`renderedRef` not permanently
stale) · 8 · 11 · 12 (older completion cannot overwrite newer) · 13 (rapid same-slide coalescing
retained) · 14 · 15 (cleanup cancels timers, ignores stale completions) · 16 (no render loop) ·
17 (no starvation when readiness arrives mid-render).

**Characterization — one new PATCH-142 spec:** 9 (card arrival triggers the owning slide's
completion render) · 10 (image readiness likewise) · 18 (**initial thumbnail reaches complete
content with no user edit**).

Case 2 must be written against the *signature*, not the scheduler, because the scheduler was
never wrong.

### Characterization boundary

**PATCH-142 owns** proving invalidation isolation and completeness. Its spec must: wait for a
complete landscape thumbnail (seeded blue rectangle, **both** embedded cards, the moodboard
image, the text); record the landscape render serial and decoded hash; edit **only** the
portrait frame; then assert the portrait thumbnail updates, **the landscape render serial does
not increase**, the landscape decoded hash is unchanged, and no portrait-green pixels appear in
the landscape. **≥ 10 repetitions.** Plus a cold-load case proving complete initial content with
no edit.

**PATCH-137 owns** the PATCH-124 real-UI drawing migration. **No private `updateScene`.** The
two must not overlap: PATCH-142 does not touch PATCH-124's spec, and PATCH-137 does not touch
invalidation code.

Render-serial observation reuses the established `toDataURL` counting technique (PATCH-124
`:36-52`), scoped by canvas dimensions — landscape rasters at 569 × 320, portrait at 180 × 320,
so the two are distinguishable without any production hook.

## 12. Diagnostic cleanup — verified

Instrumentation was added to `useSlideThumbnails.ts` **transiently** and reverted:
`git diff --exit-code HEAD -- components/presentation/useSlideThumbnails.ts` → **clean**. The
diagnostic spec deleted, `test-results/` removed, the E2E artifact deleted per PATCH-136
§17h.14, the ordinary production build restored and `assertBridgeExclusion.mjs` re-run.
Disposable fixtures cleaned by `registerDrawingCleanup`. Evidence preserved outside the
repository in `…/scratchpad/p137-evidence/`.

**Deviation recorded:** the brief permitted a scratch worktree or temporary diagnostic; a
production file was instrumented transiently in the main worktree rather than duplicating
`node_modules` and a build in a second worktree. It is the only way to observe `renderedRef` and
`shouldAccept`, which the brief required before accepting or rejecting the hypothesis — and
doing so **refuted** it (§3).

## 13. Allowlists

**Production — at most 4 files:**

| File | Change |
|---|---|
| `components/presentation/slide-renderer/resolveSlidePadlets.ts` | Slide-local ordinal replacing the global array index (RC-1) |
| `components/presentation/slide-renderer/planSlideComposition.ts` | Band split moved to the same slide-local basis |
| `components/presentation/slide-renderer/getSlideRenderSignature.ts` | Consume the slide-local ordinal; add the readiness generation |
| `components/presentation/useSlideThumbnails.ts` | Readiness precondition before raster; provisional-vs-settled distinction |

**Conditional, only if the census during implementation proves necessity:** one narrowly scoped
readiness helper under `lib/infra/presentation/`, **≤ 80 lines**.

**Test — at most 3 files:** `lib/infra/presentation/slideThumbnailRefresh.test.ts` · one new
signature unit test · one new `e2e/characterization/patch-142-*.spec.ts`.

**Explicitly excluded:** `patch-124-slide-thumbnail-refresh.spec.ts` · PATCH-136 bridge files
(`lib/e2e/*`, `types/e2e-bridge.d.ts`, `next.config.ts`) · `DrawingLayout.tsx` feature behaviour ·
`CanvasClient.tsx` · database adapters · Supabase schema · generic image-loading infrastructure ·
document-feature files · **the 250 ms debounce constant**.

**No PATCH-124 characterization assertion change is authorized in this patch.**

## 14. C5 contract after PATCH-142

**C5a — semantic isolation.** After a frame-B change, frame A retains its own expected content
and frame B's unique colour never appears in frame A. *Already true, 20/20.*

**C5b — invalidation isolation.** Once frame A has a complete accepted render, a frame-B-only
edit does not schedule or accept another frame-A render unless a shared frame-A dependency
changed. *Currently false; PATCH-142 must make it true and prove it directly.*

PATCH-137 may amend PATCH-124 to the governed C5a/C5b split **only after PATCH-142 closes**.

## 15. Validation plan

`npx tsc --noEmit` · full unit suite with the new cases · the PATCH-142 characterization spec at
**≥ 10 repetitions**, single worker, clean E2E artifact · the §10 performance table re-measured
and recorded before/after · **the four migrated PATCH-136 specs re-run unchanged** to prove no
regression in the thumbnail-adjacent flows · PATCH-124 re-run **unmodified** and still green ·
ordinary artifact restored and bridge exclusion re-verified.

## 16. False-green protection

Reject if: the test merely stops comparing `src` · unrelated re-renders continue but are no
longer observed · an arbitrary delay hides incomplete renders · overlay content is dropped from
thumbnails to make them deterministic · render-serial instrumentation is disabled · signatures
omit child-card or image changes · a global scene revision still invalidates every slide ·
`renderedRef` is written for a render known to be stale · an incomplete render is marked complete ·
tests mock away async overlay readiness · PATCH-124 assertions are weakened here · the debounce
is changed to stabilise tests.

## 17. Hard stops — evaluated

| Stop | Result |
|---|---|
| Slide ownership cannot be derived without broad architecture change | **NOT TRIGGERED** — ownership already exists (`resolveSlidePadlets` + `frameId`); only the *ordinal* is global |
| Overlay readiness has no bounded source | **NOT TRIGGERED, WITH A CAVEAT** — the resolved padlet set and their image URLs are enumerable per slide, so readiness is derivable. The bounded source must be **confirmed as the first implementation step**; if overlay creation proves unobservable, this stop fires |
| **The leading `renderedRef` mechanism is false and no root cause is found** | **HALF-TRIGGERED, RESOLVED** — the mechanism **is** false (§3), but RC-1/RC-2/RC-3 were identified by direct observation. Not blocking |
| Per-slide signatures would miss legitimate shared dependencies | **NOT TRIGGERED** — the repair narrows only the ordinal; every content input is retained, and cases 4, 9, 10 guard it |
| Image/card readiness requires unrelated subsystem redesign | **NOT TRIGGERED on present evidence** — re-evaluate at the readiness census |
| The fix requires changing PATCH-124 assertions first | **NOT TRIGGERED** — PATCH-124 runs unmodified throughout |
| Production/test instrumentation cannot distinguish schedule from acceptance | **NOT TRIGGERED** — demonstrated in §3 |
| The patch would span canvas persistence or database ownership | **NOT TRIGGERED** — four render-layer files, no persistence, no schema |

## 18. PATCH-137 dependency and execution order

PATCH-137 remains **OPEN · REAL-UI DRAWING PATH PROVEN · C5 CLASSIFIED · MIGRATION BLOCKED BY
PATCH-142**, and must not resume until PATCH-142 closes and proves complete initial thumbnails,
per-slide invalidation isolation, and a deterministic accepted-render state.

Execution order: **PATCH-142 → PATCH-137 → PATCH-138 → 139 → 140 → 141.** The document patches
keep their numbers; numeric order is not execution order here, and this patch is the record of
that.

## 19. Status

**OPEN · CROSS-FRAME INVALIDATION ROOT CAUSE IDENTIFIED (GLOBAL `zIndex` ORDINAL) ·
RENDER-COMPLETENESS ROOT CAUSE IDENTIFIED (NO READINESS INPUT; SLIDE MEMBERS CREATED AFTER
SETTLE) · PATCH-137 §20f HYPOTHESIS REFUTED · NARROW IMPLEMENTATION AUTHORIZED · NOT PUSHED.**

## 20. Recorded diagnostic notes

- **Instrument before you repair.** PATCH-137's hypothesis was plausible, consistent with every
  black-box observation, and wrong. The repair it implied — fixing the rejected-render terminal
  state — would have changed nothing, because there were no rejections. Four log lines settled it.
- **A global ordinal is a hidden global dependency.** `.map((element, zIndex) => …)` over the
  whole scene reads as harmless and silently couples every slide to every other. Any index
  derived from a shared array is a shared input, whatever it is named.
- **Correct machinery fed a wrong input looks exactly like broken machinery.** The scheduler,
  the skip logic and the acceptance rule were all behaving to specification; the bug was two
  layers below, in what the key was computed from. Black-box evidence could not tell the
  difference, and it is why the brief's demand to instrument first was right.
- **"Settled" needs a completeness predicate, not a quiet interval.** The landscape thumbnail on
  this fixture never reached complete content without an unrelated edit — a real user-visible
  defect that no test asserted and no timeout would have caught.
