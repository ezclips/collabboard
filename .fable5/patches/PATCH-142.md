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

## 21. Amendment — RENDER-HOST READINESS BOUNDED (2026-08-03, CTO)

**Trigger:** implementation hard stop — *overlay readiness source not bounded*. The slide-local
ordinal repair was shown implementable inside the existing allowlist (typecheck clean, 24
focused unit tests passing), then fully reverted. No commits, nothing pushed, PATCH-124 and the
PATCH-136 bridge untouched, worktree holds only the five protected paths.

The stop was correct: **the four authorized files cannot observe raster readiness.** Image URLs,
resolved padlet ids, signature membership and scene elements are all *logical* data; none of
them proves overlay DOM creation, final geometry, image decode or paint. Using them as readiness
would be a false green.

**Retained unchanged:** RC-1 (global scene ordinal contaminates slide-local signatures) · RC-2
(overlay version/geometry changes are real visual inputs) · RC-3 (incomplete thumbnails are
accepted because host readiness is unrepresented) · and the §3 refutation — `renderedRef` is not
the root cause, the scheduler and acceptance logic were observed working, all instrumented
renders were accepted, retry behaviour is valid.

### 21a. The hard stop's premise about ownership is wrong — corrected

The brief located the readiness owner "around `DrawingLayout.tsx`, the offscreen thumbnail
renderer host, overlay/card/image render components". Source says otherwise.

**`components/presentation/slide-renderer/createSlideRenderer.tsx` (360 lines) is the offscreen
renderer host, and it is self-contained.** Inside `renderPadletOverlayToCanvas` it:

| Line | Behaviour |
|---|---|
| `:70-79` | **creates its own detached host `<div>`** at `left:-100000px`, sized to the frame |
| `:125-185` | **mounts its own React root** into that host and renders every overlay wrapper itself, `key={padlet.id}` |
| `:188` | waits two `requestAnimationFrame`s |
| `:190-192` | forces `loading="lazy"` images to `eager` |
| `:193-196` | **an existing readiness wait** — polls `SNAPSHOT_READINESS_SELECTOR` |
| `:206-213` | `html2canvas(host, …)` |
| `:214-217` | `root.unmount(); host.remove()` in `finally` |

`DrawingLayout.tsx:2291-2301` only constructs the renderer with four data getters
(`getSceneElements`, `getPadlets`, `getFiles`, `getCanvasLines`). **It owns no thumbnail DOM.**

**Consequence: `DrawingLayout.tsx` is NOT required and is NOT authorized.** The host already
owns the entire rasterized DOM, creates it, and destroys it. Readiness can be observed without
touching the editor, without a registry, without a global, and without modifying any card
component.

### 21b. Expected membership — no circular dependency exists here

The brief asks how a host can declare readiness without knowing what it waits for. In this
architecture the question does not arise.

`compositionPlan.resolvedPadlets` is computed at `createSlideRenderer.tsx:271` and passed into
`renderPadletOverlayToCanvas(slide, compositionPlan.resolvedPadlets, opts)` at `:283` —
**before the host `<div>` exists and before React mounts anything.**

**Authoritative expected set: the `slidePadlets` argument**, i.e. `resolveSlidePadlets` output.
Against the brief's six required properties: stable ids (padlet id, already the React `key` at
`:136`) · slide-local by construction (`resolveSlidePadlets.ts:27-30` filters to this frame) ·
covers every raster-visible overlay, because the host renders exactly this list and nothing else
· excludes other slides · changes generation when membership changes, since membership is part
of the render key · **knowable before the DOM exists**.

**No two-phase protocol is needed.** Native Excalidraw elements need no participant registration
— they are rasterised from scene data by `renderExcalidrawSlideBase`, never through the DOM.

### 21c. The actual raster-readiness gap, from source

The existing wait is real but insufficient in three specific ways:

1. **`SNAPSHOT_READINESS_SELECTOR` is `'[data-ai-render-state="loading"], [data-ai-image-state="loading"]'`.** A repo-wide search finds `data-ai-render-state` published by exactly **one** component — `components/ai/renderers/CodeDiagramRenderer.tsx:80`. **`data-ai-image-state` is published by nothing at all; that half of the selector is dead.**
2. **Ordinary images are not covered.** `PresentationPadletCard.tsx:172, 221, 232` render bare `<img src=…>` with no loading state. **The moodboard image in the PATCH-137 evidence is one of these.** Nothing awaits its load or decode.
3. **The wait is skipped entirely when it is most needed.** `:193-196` computes `pendingAtStart` two rAFs after `root.render` and only waits **if it is already greater than zero**. A card that has not yet mounted its loading attribute yields `pendingAtStart === 0` and the host rasters immediately.

So the raster proceeds after two animation frames with no image guarantee. That is the
mechanism behind the missing cards and missing moodboard image in PATCH-137 §20c.

### 21d. Chosen architecture — **OPTION E (hybrid), host-scoped**

Rejected: **A** (a callback still needs the host to know when layout and decode are done — it moves the problem, and there is no child to call back since the host renders the wrappers itself) · **B** (a registry is infrastructure this architecture does not need, and introduces participant leaks and membership circularity that §21b shows are absent) · **C** alone (a DOM quiet period is exactly the arbitrary-stability-interval the brief forbids) · **D** (would require changing card and image components to expose promises — broader, and unnecessary because the host can observe its own nodes).

**Option E, entirely inside the host's own container:**

1. **Expected set** = `slidePadlets` (§21b).
2. **Node existence + geometry.** The host tags each wrapper it already renders at `:137` with `data-slide-overlay-id={padlet.id}`, then requires, for every expected id: the node exists in `host`, and `getBoundingClientRect()` reports non-zero width and height matching the geometry the host itself assigned.
3. **Images.** Enumerate `host.querySelectorAll('img')` — the host's own subtree only. Each must satisfy `complete && naturalWidth > 0`, otherwise `await img.decode()`.
4. **Existing loading-state protocol retained and corrected.** Keep the `data-ai-render-state="loading"` poll for AI diagram renderers, **but remove the `pendingAtStart > 0` shortcut** so it is evaluated after participants mount rather than before.
5. **Fonts:** one `await document.fonts.ready`.
6. **One `requestAnimationFrame` pair after all participants report ready**, then raster.

Step 6 is a *confirmation of paint after explicit readiness*, which the brief permits, not a
guess at async completion. **No step is a timing heuristic.**

**Nothing outside the host's own detached `<div>` is observed.** No general application DOM, no
global registry, no `Window` global, no `__COLLABBOARD_E2E__` change, no component-state
inspection.

### 21e. Participant readiness definitions

**Embedded card:** node present under `[data-slide-overlay-id="<padletId>"]` · measured
`width > 0 && height > 0` matching the host-assigned geometry · no descendant carrying a
`…-state="loading"` attribute · all descendant images resolved per below.

**Image:** `complete === true` **and** `naturalWidth > 0`; otherwise `decode()` resolved.
Terminal failure = `decode()` rejection, or `complete === true && naturalWidth === 0`. Terminal
failure **counts as ready** (§21g).

**Native Excalidraw element:** no participation. Rasterised from scene data by
`renderExcalidrawSlideBase`, never via DOM — verified at `createSlideRenderer.tsx:274-292`.

**Fonts:** `await document.fonts.ready`. It is document-scoped, which is a deliberate,
recorded compromise: it is the only bounded source, it resolves regardless of individual font
failure so it cannot deadlock, and the host renders text through the same document. **Waiting
on a specific font set is not authorized** — there is no per-font manifest for card content.

### 21f. Generation protocol

The host does not need a registry: **each `renderSlideToPNG` call owns a host `<div>` it creates
and destroys** (`:70, :214-217`), so cross-generation contamination through the DOM is
structurally impossible. What is required is cancellation.

- `useSlideThumbnails` threads an `AbortSignal` per request into `RenderSlideOptions`; the request already has a unique `requestId` (`useSlideThumbnails.ts:96`) and a `cacheKey` (`:95`) — **the generation token is that pair**, never the slide id alone.
- The host checks the signal before each await and immediately before `html2canvas`; on abort it unmounts, removes the host and rejects.
- Membership or key change → the pass supersedes → the prior signal is aborted.
- Unmount aborts all in-flight signals (`useSlideThumbnails.ts:188-198` already owns the cleanup).
- Stale results remain rejected at the acceptance layer by `shouldAcceptSlideThumbnailRender` — **observed working in §3, not to be modified.**
- A completion belonging to an old generation can never unblock a new one: the old generation's DOM is already removed.

### 21g. Provisional-versus-final and failed assets

**Decision: B — no provisional thumbnails.** The host blocks inside one `renderSlideToPNG` call
and publishes only a complete raster, so there is no provisional state to mark or track. This is
not a UX regression: publication is **per slide**, not global — each thumbnail still appears as
soon as its own render completes, and today's cold load already shows nothing until ~2.8 s.
Expected added latency is bounded by real image load time and must be measured against §10.

**Failed-asset policy — no timeout is the detector:**

| State | Classification | Effect |
|---|---|---|
| `complete && naturalWidth > 0` | ready | proceed |
| `decode()` resolves | ready | proceed |
| `decode()` rejects | **terminal failure** | **counts as ready**; raster with whatever the element shows |
| `complete && naturalWidth === 0` | **terminal failure** | counts as ready |
| not complete, no error yet | **transient** | keep waiting |

**A terminal failure completes the generation** with the intended fallback rendering, so a
broken image can never deadlock a thumbnail. Fonts follow the same principle via
`document.fonts.ready`, which resolves on failure.

**The existing 3 000 ms `resolveSnapshotTimeoutMs` (`:20-29`) is an arbitrary timeout already in
production** (PATCH-101). It may remain as the terminal bound for the AI-diagram poll alone. It
**must not** be extended to images, geometry or fonts, must not be increased, and must not be
presented as the readiness contract.

### 21h. RC-3 has two layers — only one is in scope

**Layer (ii), raster readiness**, is what §21d–21g repair.

**Layer (i), scene-level late membership**, is not: PATCH-137 §20 observed the landscape
signature holding **two** embeddables at cold settle and **three** later, the third with
`frameId: null`. Those embeddable *elements* are created by the interactive canvas, not by the
host. A late arrival changes `slideSignature`, which should schedule a pass and self-heal.

**The implementation must verify this.** If test 18 (initial thumbnail completes with no user
edit) still fails after the layer-(ii) repair, layer (i) is a separate defect — **stop and
report**; do not widen this patch. A candidate worth checking first is
`useSlideThumbnails.ts:205-207`, where a signature change arriving before
`isMountSettledRef.current` is silently dropped.

### 21i. Amended production allowlist — 6 files

| # | File | Reason / owned responsibility | Limit | Prohibited |
|---|---|---|---|---|
| 1 | `slide-renderer/resolveSlidePadlets.ts` | slide-local ordinal (RC-1) | current 44 → **≤70** | no membership-rule change |
| 2 | `slide-renderer/planSlideComposition.ts` | band split onto the same slide-local basis | current 97 → **≤130** | no change to what is included in a slide |
| 3 | `slide-renderer/getSlideRenderSignature.ts` | consume the slide-local ordinal | current 201 → **≤230** | **no content input may be removed** |
| 4 | `components/presentation/useSlideThumbnails.ts` | thread the `AbortSignal`; no other change | current 229 → **≤265** | no debounce change, no acceptance-rule change, no `renderedRef` semantics change |
| 5 | **`slide-renderer/createSlideRenderer.tsx`** | **NEW to the allowlist** — the readiness owner (§21a). Tag wrappers with `data-slide-overlay-id`; call the readiness helper; honour the abort signal | current 360 → **≤400** | no change to composition, layering, `html2canvas` options, colour sanitisation, or the legacy path |
| 6 | **`slide-renderer/waitForOverlayReadiness.ts`** | **NEW FILE** — the §21d predicate: expected-set presence, geometry, image decode, loading-state poll, fonts, rAF confirmation | **≤100 lines** | no data fetching, no React, no global state, no DOM access outside the passed host element, **no `setTimeout`-based readiness** |

**`DrawingLayout.tsx` is NOT authorized** (§21a) — the earlier conditional candidate is
withdrawn on evidence. **No card or overlay component is authorized**: `PresentationPadletCard`,
`PresentationContainerCard`, `PostCardContent` and `CodeDiagramRenderer` stay untouched, because
the host can observe their rendered nodes without their cooperation. If implementation finds a
card whose readiness is genuinely unobservable from outside, **stop and report** rather than
adding it.

Still excluded, unchanged: PATCH-124's spec · all PATCH-136 bridge files · `CanvasClient.tsx` ·
persistence and Supabase · generic image-loading infrastructure · document-feature files · **the
250 ms debounce constant** · the 3 000 ms snapshot timeout's value.

### 21j. Amended test allowlist — ≤5 files

Retained: `lib/infra/presentation/slideThumbnailRefresh.test.ts` · one slide-signature unit test
· one `e2e/characterization/patch-142-*.spec.ts`.
Added conditionally: **one readiness unit test** for `waitForOverlayReadiness.ts` (cases 1–9,
13–15 of §21k) · **one existing renderer-host test** only if one already exists for
`createSlideRenderer`.

**PATCH-124 is not authorized.** The PATCH-136 bridge must not be broadened — readiness is
production rendering behaviour, and test evidence uses existing bridge observation plus public
thumbnail output.

### 21k. Testable contract

All fifteen brief items are adopted. Items 1–9 and 13–15 are unit-testable against
`waitForOverlayReadiness` with a synthetic host element — no browser fixture needed:
expected set known for the generation · never ready before every participant is ready · **mount
without final layout is insufficient** · **an image element before decode is insufficient** · a
missing participant keeps the generation pending · a removed participant does not deadlock a
superseding generation · stale reports ignored · membership change replaces the barrier ·
complete readiness triggers **exactly one** raster · **no arbitrary timeout is used** · cleanup
leaks no observers, promises or listeners · no loop, no starvation.

Items 10–12 stay in the characterization spec: initial thumbnail completes **with no user
edit** · a portrait-only edit does not re-render a complete landscape · **a legitimate landscape
overlay mutation still does re-render landscape** (the guard against over-narrowing).

### 21l. Sequencing and intermediate commits

**Intermediate commits are permitted while PATCH-142 remains open.** The alternative — one
commit spanning an ordinal repair and a readiness protocol — is harder to review and harder to
bisect, and the ordinal work is already proven implementable.

1. `fix(presentation): scope slide overlay ordering to the slide` — files 1–3, plus unit tests. **Does not close PATCH-142.**
2. `fix(presentation): await overlay readiness before thumbnail raster` — files 4–6, plus the readiness unit test.
3. `test(e2e): characterize thumbnail invalidation isolation` — the characterization spec and the §10 performance re-measurement.

**PATCH-142 does not close until all three land and RC-3 is proven repaired.** A partial merge
closing only RC-1 is explicitly **not** a release of PATCH-137, which depends on both. Nothing
is pushed until closure.

### 21m. False-green protection — additions

Beyond §16, reject if: readiness is inferred from an image URL, a signature id, elapsed
milliseconds, or a DOM quiet period alone · the host rasters before `decode()` · a placeholder
counts as final without the §21g terminal contract · a missing expected overlay is silently
skipped · anything outside the host's own container is observed · a global mutable readiness
registry appears · `data-ai-image-state` is "revived" as a readiness source **without a
component that actually publishes it** · the 3 000 ms timeout is widened to cover images ·
another user edit is still required to finish initial thumbnails.

### 21n. Hard stops — re-evaluated

| Stop | Result |
|---|---|
| Expected overlay membership not knowable | **NOT TRIGGERED** — `slidePadlets` is a parameter, known before the DOM exists (§21b) |
| Card readiness indistinguishable from a mounted placeholder | **NOT TRIGGERED** — geometry + descendant image decode + loading-state attributes distinguish them. **Caveat:** a card that renders a skeleton with final geometry and no loading attribute would defeat this; the implementation must check each card type and **stop and report** if one is opaque |
| Image completion/error unobservable | **NOT TRIGGERED** — `complete`, `naturalWidth`, `decode()` |
| Final layout cannot be bounded without arbitrary waiting | **NOT TRIGGERED** — measured geometry against host-assigned values, plus one rAF pair *after* explicit readiness |
| Readiness requires broad changes across card/image systems | **NOT TRIGGERED** — zero card components authorized |
| DrawingLayout changes would affect ordinary editor behaviour | **NOT TRIGGERED** — DrawingLayout is not authorized at all (§21a) |
| A generic global readiness framework is required | **NOT TRIGGERED** — one ≤100-line pure predicate over a passed host element |
| More than the amended file limits are needed | **NOT TRIGGERED** — 6 production files, all bounded |
| Completion still depends on unrelated scene activity | **OPEN — layer (i), §21h.** Resolved for raster readiness; must be **verified** by test 18. If it fails, stop and report |

### 21o. Status

**OPEN · SLIDE-LOCAL ORDINAL REPAIR AUTHORIZED · THUMBNAIL RENDER-HOST READINESS CONTRACT
AUTHORIZED · NARROW IMPLEMENTATION AUTHORIZED · INTERMEDIATE COMMITS PERMITTED · NOT PUSHED.**

PATCH-137 remains **OPEN · REAL-UI DRAWING PATH PROVEN · C5 CLASSIFIED · MIGRATION BLOCKED BY
PATCH-142.**

### 21p. Recorded diagnostic notes

- **Locate the owner in source before naming it in governance.** The stop reported the readiness
  owner as "around `DrawingLayout.tsx`". It is `createSlideRenderer.tsx`, which builds and
  destroys the entire rasterized DOM. Getting that wrong would have authorized an 3 500-line
  editor file for a change that belongs in a 360-line factory.
- **A selector is not a protocol.** `SNAPSHOT_READINESS_SELECTOR` looks like a readiness
  contract; half of it (`data-ai-image-state`) is published by nothing, and the other half by a
  single AI-diagram component. Grep the *publishers*, not the consumer.
- **A guard that only runs when the problem is already visible is not a guard.**
  `pendingAtStart > 0` skips the wait in exactly the case where nothing has mounted yet.
- **When the host owns the DOM it renders, readiness needs no registry.** The infrastructure
  options were all sized for a problem this architecture does not have — the expected set is an
  argument and the container is disposable.
