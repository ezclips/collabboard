# PATCH-145 — Embeddable natural-height synchronization convergence

**Status:** OPEN · NATURAL-HEIGHT CONVERGENCE ROOT CAUSE IDENTIFIED · NARROW SYNCHRONIZATION
REPAIR AUTHORIZED · PATCH-142 BLOCKED UNTIL CLOSED · NOT PUSHED
**Opened:** 2026-08-03 (CTO)
**HEAD at authoring:** `11762e2`
**Role of this document:** governance, source census and diagnosis. No implementation.
**Prerequisite for:** PATCH-142 (behavioral). Independent of PATCH-144.

---

## 1. Origin — PATCH-142 §23

PATCH-142 §23 established, with a five-run control matrix, that the landscape slide thumbnail
re-rasters after a portrait-only rectangle draw:

| condition | landscape changed |
|---|---|
| 20 s idle after a complete + quiescent baseline, **no edit** | **0 / 5** |
| portrait-only rectangle draw after the same baseline | **5 / 5** |

Green pixels in the landscape thumbnail: 0 in every run — no portrait content ever entered the
landscape image. The first changed field of the landscape render key was
`embeddableOverlaySignature.height`, **153 → 80**, on two landscape-owned embeddable overlays.

§23 attributed this to a scene-wide natural-height sync that "converges in stages" and whose
second stage "fires on the next scene mutation." **That description is correct about the raster
and wrong about the write.** This patch corrects it with direct measurement.

---

## 2. Correction to PATCH-142 §23

> **§23d is hereby corrected.** The 153 → 80 transition is **not** a later stage of a convergence
> process, and it is **not** caused by the portrait edit. The write happens at page-load time,
> roughly 22 seconds before the portrait edit, and its value is a **measurement of a
> `display: none` DOM subtree**. The portrait edit does not cause it — the portrait edit is merely
> the first event that wakes the thumbnail scheduler, which then discovers a stale key that had
> been latent since load.

§23's classification of the event as **F — a genuinely shared dependency** survives. Its account
of the mechanism does not.

I record this as a governance correction because §23's mechanism claim, if carried into
implementation, would have produced the wrong repair: an attempt to make a staged convergence
terminate, when nothing was ever converging in stages.

---

## 3. Evidence — instrumented measurement timeline

Transient instrumentation added to three points and reverted afterwards
(`git diff --exit-code HEAD` clean, §12):

1. `AutoHeightContainer`'s `ResizeObserver` — raw `scrollHeight`, `clientHeight`,
   `getBoundingClientRect().height`, `isConnected`, `offsetParent`, `childElementCount`, and the
   first ancestor with `display: none` / `visibility: hidden`.
2. The `onNaturalHeight` handler — reported height, computed `newHeight`, whether the `Math.max`
   floor was hit, the matched scene element, its current height and `frameId`, and whether the
   write was applied.
3. The padlet → scene sync effect — per-embeddable scene height, DB height, pending height, lock
   state, and the existing `reasons` array.

Plus, in `useSlideThumbnails.ts`, the full render key of every slide at every scheduler pass, and
each render completion's `requestedKey` / `latestKey` / `shouldAccept`.

Runs: E2E-bridge production build, `PATCH_145_RUNS` 1 + 2 + 3 = **six independent runs**.

### 3a. Required sequence, run 0 of the three-run set (representative; identical in all six)

```
   t=1751  mount   container A   scrollHeight=103  offsetParent=true   hiddenAncestor=null
   t=1751  natural container A   reported=103 -> newHeight=153  existing=220  APPLIED
   t=1751  mount   container B   scrollHeight=119  offsetParent=true
   t=1751  natural container B   reported=119 -> newHeight=169  existing=220  APPLIED
   t=1772  RO      container A   scrollHeight=103 -> 153        existing=260  APPLIED
   t=1792  RO      container B   scrollHeight=103 -> 153        existing=169  APPLIED
   t=1801  RO      (all)         scrollHeight=103 -> 153        existing=153  NOT APPLIED  ← settled
   t=2049  sceneSync  emb-slide-a  scene=153 db=220 pending=153 LOCKED  (width 360->320)
   t=2049  sceneSync  emb-uploaded-image  scene=210 db=260  writes height 210->260
   t=2061  RO      (all)         scrollHeight=103 -> 153        NOT APPLIED  ← idempotent
--- content measurement has converged.  Every further report is a no-op. ---
   t=3941  RO      container A   scrollHeight=0  clientHeight=0  rect=0
                                 connected=true  offsetParent=FALSE
                                 hiddenAncestor=DIV.excalidraw__embeddable-container
                                                [display=none visibility=visible]
   t=3941  natural container A   reported=0 -> newHeight=80  clampedToFloor=true
                                 existing=153  APPLIED          ← THE 153 -> 80 WRITE
   t=3941  RO/natural container C   identical, 153 -> 80  APPLIED
--- baseline captured.  20 s idle.  Landscape thumbnail unchanged (0/6 runs changed). ---
--- portrait rectangle drawn ---
   t=26323 thumbnail PASS  forced=none  requests=[frame-landscape, frame-portrait]
           landscape key diff vs. the key last rendered — EXACTLY TWO FIELDS:
             embeddableOverlaySignature.0.height : 153 => 80
             embeddableOverlaySignature.3.height : 153 => 80
   t=27353 landscape raster accepted
```

**The final 80 value existed at t ≈ 3941, before the idle period and ~22 s before the portrait
edit.** Answer to the brief's decisive question: **yes** — the final measurement was produced,
was written into the scene, and was never rastered.

### 3b. Proof there is no measurement activity after the baseline

Instrumentation event counts, all six runs:

| checkpoint | measure + natural + sceneSync events |
|---|---|
| at baseline | **42** |
| after 20 s idle | **42** |
| after the portrait edit | **42** |

**Zero measurement, zero `onNaturalHeight`, zero scene-sync activity after the baseline.** The
natural-height path is completely quiet across the portrait edit. §23's "the portrait edit
triggers the scene-wide sync, which re-measures" is refuted directly: the sync does not run.

### 3c. Embeddable geometry is byte-identical across the portrait edit

Full embeddable census (`id`, `link`, `frameId`, `x`, `y`, `width`, `height`, `version`,
`versionNonce`) captured at baseline, after idle, and after the portrait edit:

```
baseline == idle == after-edit,  byte-identical,  including versionNonce
```

The portrait edit changes **no** embeddable geometry. What changes is the thumbnail's *knowledge*
of geometry that was already stale.

### 3d. Oscillation probe — the height is a function of viewport, not content

After the portrait edit, the diagnostic navigated back to the landscape frame:

| run | on navigating back into view |
|---|---|
| 0 | `reported=103 -> 153`, existing=80, **APPLIED** (×2 containers) |
| 1 | `reported=103 -> 153`, existing=80, **APPLIED** (×2 containers) |
| 2 | `reported=103 -> 153`, existing=80, **APPLIED** (×2 containers) |

**153 → 80 → 153, deterministic, 3/3.** The scene height encodes whether the card happened to be
inside the Excalidraw viewport at the moment the observer fired. This is a genuine oscillation,
and it answers the brief's tolerance question: **the 153 → 80 transition is not a content change
and no tolerance value can distinguish it from one** — 73 px is far larger than any tolerance that
would still permit legitimate card resizing.

---

## 4. Root cause

Two defects, both inside the same ~20-line handler.

### RC-A — a hidden subtree is measured, and its zero is written as content

`components/collabboard/canvas/layouts/DrawingLayout.tsx`

```
:65-72   AutoHeightContainer's ResizeObserver:  ro = new ResizeObserver(() => cbRef.current(el.scrollHeight))
:553-573 onNaturalHeight:  newHeight = Math.max(28 + 22 + h, 80)
                           if (!existing || Math.abs(existing.height - newHeight) < 1) return;
                           excAPI.updateScene({ ...elements.map(el => matches ? {...el, height: newHeight} : el) })
```

Excalidraw culls off-viewport embeddables by setting `display: none` on
`DIV.excalidraw__embeddable-container`. `ResizeObserver` fires for that transition. `scrollHeight`
of a `display: none` subtree is `0`. The handler has **no liveness predicate**: it accepts `0`,
clamps it through `Math.max(…, 80)` to the floor, and writes 80 into the scene as though the card's
content had shrunk.

`hiddenAncestor` was captured directly and is the same in all six runs:
`DIV.excalidraw__embeddable-container [display=none visibility=visible]`. The subtree is still
connected (`isConnected=true`, `childElementCount=1`) — only laid out to zero.

This write is **not** flagged with `isSyncingEmbeddablesRef`, so `handleChange`'s autosave gate
(`:1331`) does not skip it: **the garbage height is persisted to the database.**

### RC-B — the write is invisible to the signal that wakes the thumbnail scheduler

Every other app-owned scene write in this file bumps the Excalidraw revision fields, with an
explicit comment saying why (`:412-415`: *"Bump the standard Excalidraw revision fields … so
version strictly increases per frame … Without this, `getSceneVersion` never reflects this
app-owned move."*). Confirmed at `:421-423`, `:461-463`, `:2093-2095`, `:2164-2166`.

**`onNaturalHeight` is the one write path that does not.** It spreads `{ ...el, height: newHeight }`
and stops there.

Consequence chain:

```
onNaturalHeight write  →  element.version unchanged
                       →  getSceneVersion(elements) unchanged                    (:781)
                       →  createSettledScenePropagation treats it as a no-op     (:775-783)
                       →  setElements never called                               (:782)
                       →  frames useMemo never recomputes                        (:2324-2375)
                       →  FrameSlide.renderSignature / contentVersion unchanged
                       →  slideSignature unchanged in useSlideThumbnails         (:223-226)
                       →  scheduleRefresh never called                           (:228-231)
```

Meanwhile `getSlideRenderSignature` reads **live** embeddable geometry
(`embeddableOverlaySignature`, `:132-143`), so the render key *does* reflect the new height. The
invalidation therefore exists but has no carrier. It sits latent until an unrelated mutation
triggers a pass, at which point the landscape is correctly found dirty.

**The scheduler-pass diff is the proof of RC-B.** At the post-edit pass exactly two fields differ,
and `embeddableVersion` / `embeddableVersionNonce` are **not** among them:

```
embeddableOverlaySignature.0.height : 153 => 80
embeddableOverlaySignature.3.height : 153 => 80
```

A height changed without a version bump. That is RC-B, visible in the data.

### Answers to the brief's primary root-cause questions

| # | Question | Answer |
|---|---|---|
| 1 | Why is the first height 153 and not 80? | 153 **is** the correct content height (`scrollHeight` 103 + 50 chrome). 80 is the floor of a zero measurement. The premise that 80 is "final" is inverted. |
| 2 | What changes between the two measurements? | Only DOM visibility. `display: none` on `DIV.excalidraw__embeddable-container`. Content is identical. |
| 3 | Why is the second value not applied immediately? | It **is** applied immediately, at t ≈ 3941, synchronously in the observer callback. |
| 4 | Is the final measurement produced but not flushed? | It is produced **and** flushed to the scene. What is not flushed is the *invalidation* — see RC-B. |
| 5 | Produced only after a rerender caused by another mutation? | No. Produced ~22 s earlier. Proven by the 42/42/42 event counts and by the geometry census. |
| 6 | Does the sync depend on an identity that does not change? | Yes — `getSceneVersion`, which is a sum of element `version` fields the handler never bumps. |
| 7 | Callback/ref updated without scheduling synchronization? | No. `cbRef.current` is reassigned every render and always current. |
| 8 | Stale closure retaining an earlier measurement? | No. The observer reads `el.scrollHeight` live at call time. |
| 9 | Snapshot processed without rescheduling? | No. Each report is handled independently and idempotently. |
| 10 | Is the sync intentionally scene-wide? | The **measurement→write path is already per-embeddable** (matched by `link === padlet://<id>`); it maps the full array but rewrites exactly one element. The separate padlet→scene sync effect (`:1971-2144`) is scene-wide but did not run during the failure window. **§23's "scene-wide re-measurement" claim is withdrawn.** |

---

## 5. Complete write-path census — embeddable geometry

`components/collabboard/canvas/layouts/DrawingLayout.tsx` unless stated.

| # | Site | Writes | Trigger | updateScene | Scope | Tolerance | Scheduling | Self-retrigger | Waits for DOM | Needs another mutation | Bumps version |
|---|---|---|---|---|---|---|---|---|---|---|---|
| W1 | `:553-573` `onNaturalHeight` | **height** | ResizeObserver / mount | yes | **one** embeddable (by `link`) | `\|Δ\| < 1` skip | synchronous in callback | no (idempotent at equality) | yes (reads `scrollHeight`) | **no** | **NO — RC-B** |
| W2 | `:426-433` container drag move | x, y | pointermove | yes | one element | none | per pointer frame | no | no | no | yes |
| W3 | `:466-473` container drag end | x, y, frameId | pointerup | yes | one element | none | once | no | no | no | yes |
| W4 | `:1971-2144` padlet→scene sync | x, y, **width, height**, customData | `padlets` / API identity change | yes | **all** padlet embeddables | `POSITION_SYNC_EPSILON` 1.25 on x/y; strict `!==` on w/h | React effect | no (`needsRefresh` gate) | no | yes (effect deps) | yes `:2093` |
| W5 | `:2146-2190` initial refresh | version/nonce only | first load, 80 ms timer | yes | all padlet embeddables | n/a | one `setTimeout` | no (`hasPerformedInitialEmbeddableRefreshRef`) | no | no | yes `:2164` |
| W6 | `:1950-1969` `insertPadletEmbeddable` | creates element | new padlet | yes | one new element | n/a | callback | no | no | no | n/a (v=1) |
| W7 | `:1917-1948` `createEmbeddableElementForPadlet` | initial w/h from padlet record | called by W4/W6 | via caller | one | n/a | n/a | no | no | no | n/a |
| W8 | `:1656/:1674/:1805/:1818/:1827/:1871` index/z-order/frame ops | index, frameId, ordering | user commands | yes | varies | n/a | callback | no | no | no | via helpers |
| W9 | `:2521/:2548/:2257` scene-element setters | caller-supplied | canvas actions | yes | caller-supplied | n/a | callback | no | no | no | caller |

**Only W1 fails to bump the revision fields. Only W1 consumes a DOM measurement.**

### 5a. Natural-height producer census

| Producer | Location | Owner | Cached | Propagation |
|---|---|---|---|---|
| Measured node | `AutoHeightContainer`'s `<div ref>` wrapping `RowColumnContainerCard` (`:73-91`) | `AutoHeightContainer` | none | direct callback |
| Measurement | `el.scrollHeight` at mount (`:68`) and on every `ResizeObserver` entry (`:69`) | same | none | direct callback |
| Callback ownership | `cbRef.current = onNaturalHeight`, reassigned every render (`:63-64`); observer created once, `[]` deps (`:65-72`) | same | n/a | n/a |
| Consumer | `onNaturalHeight` prop supplied at `:553` inside `DrawingEmbeddableCard` | `DrawingEmbeddableCard` | none | writes scene + calls `onNaturalResize` |
| Acknowledgement | `onNaturalResize` (`:253`, invoked `:572`, wired `:2235`) → `recentlyNaturalResizedRef` (`:756`) | `DrawingLayout` | `Map<padletId, height>` | consumed by W4 as a height lock (`:2060-2064`) |
| Lock release | W4 deletes the entry when the DB height matches (`:2062-2063`); full clear at `:1372` | `DrawingLayout` | — | — |

`ResizeObserver` appears at three further sites — `:880/:949` (canvas-level, unrelated to card
height), `CanvasSidebar.tsx`, `PresentationPreviewModal.tsx`, `ImageCropLayer.tsx`,
`FreeformGraphLayer.tsx`, `RowColumnContainerCard.tsx`. **None of these writes embeddable
geometry.** They are out of scope and out of the allowlist.

### 5b. Existing tolerance and rounding — findings

- `Math.abs(existing.height - newHeight) < 1` at `:561` — a 1 px dead-band, the only tolerance on
  this path.
- `Math.max(stripH + 22 + h, 80)` at `:555` — an **80 px floor**. This is what converts a zero
  measurement into a plausible-looking value. Without the floor the defect would have written 50
  and been obvious.
- `scrollHeight` is integer-rounded by the platform; no device-pixel-ratio scaling is applied.
- Measured `scrollHeight` was `103` in **every** non-collapsed sample across all six runs. No
  1 px jitter was observed. **The 1 px dead-band is adequate; it is not the defect.**
- **Do not widen the tolerance.** 153 → 80 is 73 px; any tolerance large enough to suppress it
  would suppress real card resizing. Explicitly forbidden by §10.

---

## 6. Convergence contract (normative)

An embeddable is **converged** when all of the following hold:

1. The latest **valid** natural-height measurement for its padlet has been applied to the scene.
2. Its Excalidraw `height` equals the desired height within the 1 px dead-band.
3. No newer valid measurement is pending.
4. No synchronization pass is queued for it.

A measurement is **valid** only if the measured subtree is being laid out. A subtree that is
disconnected, has no offset parent, or has a zero border-box while holding children is **not
measuring content** and MUST NOT produce a write. Invalidity is not "measure zero" — it is
"decline to measure".

Required properties:

- **P1** New valid measurements schedule work immediately. *(already true — synchronous)*
- **P2** Multiple rapid measurements coalesce; latest wins. *(already true — each write supersedes)*
- **P3** A repeated identical measurement performs no `updateScene`. *(already true — `:561`)*
- **P4** No unrelated scene mutation is required for a measurement to take effect. *(already true —
  the write is immediate; what is missing is P5)*
- **P5** **A geometry write must be observable by every consumer of scene revision.** Any write
  that changes rendered geometry MUST bump `version` / `versionNonce` / `updated`. *(currently
  violated — RC-B)*
- **P6** Visibility changes MUST NOT produce geometry writes. *(currently violated — RC-A)*
- **P7** No update loop: a write must not cause a measurement that causes another write.
  *(currently satisfied by P3; must remain so)*
- **P8** Cleanup disconnects the observer and cancels queued work. *(already true — `:71`)*

**P1–P4, P7 and P8 already hold.** This is the reason the repair is narrow: the existing design is
per-embeddable, immediate, idempotent and correctly torn down. Only P5 and P6 are missing.

---

## 7. Architecture decision — **Option D, effect/observer correction**

**Chosen: D — the existing measurement path is correct and needs a liveness predicate and a
revision bump. Rejected: A, B, C, E.**

| Option | Verdict |
|---|---|
| **A** callback-driven per embeddable | **Already the implemented design.** `onNaturalHeight` already schedules a write for exactly the reporting embeddable. Choosing A would be a no-op relabelling. |
| **B** batched measurement generation | **Rejected.** Adds a generation counter, a batch queue and a flush to a path that is already immediate and idempotent (P1–P3 hold). It would not have prevented either defect: a batched pipeline fed a zero still writes 80, and a batched write that omits the version bump is still invisible. Pure added surface. |
| **C** ResizeObserver-driven queue flushed independently of scene changes | **Rejected for the same reason, plus a false premise.** The path is *already* independent of scene changes — the failing write happened with no scene mutation at all. The brief's instruction "do not keep scene-wide mutation as the only wake-up mechanism" is satisfied without C: the *measurement* never depended on scene mutation; only the *thumbnail invalidation* did, and that is repaired by P5. |
| **D** effect/observer correction | **CHOSEN.** Both defects are properties of the observer callback and its single write: it consumes an invalid measurement, and it emits an unobservable write. Two additions inside one handler. |
| **E** another bounded design | **Rejected.** No evidence supports a design change; the evidence localises the defect to two missing guards. |

**Ownership finding, per the brief's instruction to prefer the narrowest owner-correct design:**
per-embeddable ownership **can** be determined and already exists — `AutoHeightContainer` owns one
padlet's measurement, and `onNaturalHeight` resolves exactly one scene element by
`link === padlet://<id>`. The hard stop "per-embeddable ownership cannot be determined" is
**not triggered**.

### 7a. Required behaviour

**RC-A repair — liveness predicate.** Before invoking the height callback, the observer must
establish that the subtree is being laid out. A measurement from a subtree that is disconnected,
lacks an offset parent, or reports a zero border-box while holding children MUST be discarded
without a write. Discarding is not deferral: the subtree will be re-measured when it is laid out
again, because `ResizeObserver` fires on the transition back — this is proven by §3d, where the
return-to-view fired at `reported=103` in 3/3 runs.

The implementation must not encode `excalidraw__embeddable-container` as a selector or otherwise
couple to Excalidraw's culling implementation. The predicate is a property of the observed node.

**RC-B repair — revision bump.** The `onNaturalHeight` write must bump `version`,
`versionNonce` and `updated` on the element it changes, matching the convention already used at
`:421-423`, `:461-463`, `:2093-2095` and `:2164-2166` and the rationale recorded at `:412-415`.

**Persistence note.** With RC-A repaired, no invalid height reaches autosave. The implementation
MUST NOT additionally suppress autosave for this path — a *valid* natural-height change is real
user-visible geometry and must persist. Existing boards may already hold a floored 80; a
migration is **out of scope** and is recorded as an observation (§13).

---

## 8. updateScene scope

**Current behaviour, verified by reading the call site.** `:562-571` maps the full element array
but returns the *same object reference* for every non-matching element and a new object only for
the matched embeddable. It does not replace unrelated elements, does not pass `appState`, and uses
`commitToHistory: false`. Measured at runtime: the post-edit key diff showed **exactly two changed
fields**, both heights, with no version drift on any other element — direct proof that unrelated
elements are preserved byte-for-byte.

**Authorized scope — unchanged.** `updateScene` remains necessary and remains as written:

- Only the matched embeddable's geometry changes.
- Every unrelated element stays byte-identical, including `version` and `versionNonce`.
- No whole-scene replacement, no `appState` write, no selection change.
- `commitToHistory: false` retained — a layout measurement is not a user undo step.
- **Not exposed to E2E tests. PATCH-136's bridge is not broadened.**

The **only** change to this call is the revision bump on the one element it already rewrites.

---

## 9. Frame/slide isolation contract

After convergence:

- An edit confined to frame B MUST NOT change any embeddable geometry in frame A.
- `version` / `versionNonce` of unchanged embeddables MUST remain byte-identical.
- Slide A's render key MUST remain stable.

**Status against current code:** already satisfied by W1 (single-element write) and, at runtime,
by the byte-identical geometry census in §3c. The isolation violation PATCH-142 observed was
**not** a cross-frame write — it was a stale-key discovery. No global scan needs removing; W4's
scene-wide scan performs no writes when nothing changed (`needsRefresh` gate, `:2066-2074`) and did
not run during the failure window. **Its cost is not on the critical path and it is not in this
patch's scope.**

---

## 10. False-green protection

The implementation is **rejected** if any of the following appear:

1. A fixed timer or `setTimeout` used to trigger a second measurement pass.
2. A longer quiet window substituted for a liveness predicate.
3. The height tolerance widened beyond the existing 1 px dead-band.
4. The `Math.max(…, 80)` floor removed or altered to mask a zero measurement — the floor is not
   the defect and changing it is out of scope.
5. Height updates suppressed generally (RC-A's repair must reject **invalid** measurements only,
   never valid shrinkage).
6. `embeddableOverlaySignature` fields removed from, or weakened in, `getSlideRenderSignature`.
7. Unrelated embeddables rewritten with identical values to "force" invalidation.
8. Any test-only scene mutation, or `updateScene` exposed through the E2E bridge.
9. The test asserting convergence by delaying the portrait edit until after the collapse.
10. Non-null assertions, `as any`, `@ts-ignore`, `@ts-expect-error`, or broad casts used to
    silence a lifecycle question.
11. `excalidraw__embeddable-container` or any Excalidraw-internal class name used as a selector.
12. Any change to PATCH-142's characterization assertions or to PATCH-124.

---

## 11. Allowlists

### 11a. Production — authorized

| File | Responsibility | Limit |
|---|---|---|
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | (i) liveness predicate in `AutoHeightContainer`'s observer (`:65-72`); (ii) `version`/`versionNonce`/`updated` bump in the `onNaturalHeight` write (`:562-571`) | **≤ 25 changed lines total** |
| one new helper, if the predicate is extracted | pure `isElementBeingLaidOut(node): boolean` — no scene access, no React, no DOM mutation | **≤ 30 lines, new file** |

Nothing else. In particular: **no change to `RowColumnContainerCard`'s feature behaviour**, no
change to the padlet→scene sync effect (W4), no change to `handleChange`, no change to
`createSettledScenePropagation`, no change to the `frames` memo.

If the implementation concludes a change is needed outside these two responsibilities, it **stops**
and reports rather than widening.

### 11b. Explicitly excluded

- All thumbnail production files — `useSlideThumbnails.ts`, `getSlideRenderSignature.ts`,
  `createSlideRenderer.tsx`, `planSlideComposition.ts`, `resolveSlidePadlets.ts`,
  `slideThumbnailRefresh.ts`.
- PATCH-142 characterization assertions.
- PATCH-124 (`e2e/characterization/patch-124-slide-thumbnail-refresh.spec.ts`) — byte-identical.
- PATCH-136 bridge files and `next.config.ts`.
- Persistence, database, schema, migrations.
- `components/collabboard/canvas/excalidraw_fork/**` — the culling behaviour is correct and is not
  to be modified. **The hard stop "convergence depends on generic Excalidraw internals" is not
  triggered**: the repair depends on a DOM-layout property, not on Excalidraw's implementation.

### 11c. Test — authorized

1. **Unit** — one new test file for the liveness predicate: laid-out node accepted; disconnected
   node rejected; no-offset-parent node rejected; zero-box-with-children node rejected;
   legitimately-empty node handled per the chosen contract.
2. **Integration** — one test over the `onNaturalHeight` write: valid measurement writes height
   **and** bumps `version`/`versionNonce`; identical measurement writes nothing; unrelated
   elements byte-identical.
3. **Characterization** — one new PATCH-145 spec.

**PATCH-142's characterization must not be edited under this patch.** Cases 15 and 16 of the
brief's list are PATCH-142 property and are re-landed there, after this patch closes.

### 11d. Required test cases, mapped

| # | Case | Where | Note |
|---|---|---|---|
| 1 | Initial report schedules sync | integration | already passes; regression guard |
| 2 | Later report schedules a second pass with no scene mutation | integration | already passes |
| 3 | Latest measurement wins | integration | already passes |
| 4 | Rapid measurements coalesce | integration | already passes |
| 5 | Identical measurement idempotent | integration | already passes (`:561`) |
| 6 | Changed embeddable updates | integration | already passes |
| 7 | Unchanged embeddable not rewritten | integration | **new — must also assert `versionNonce` equality** |
| 8 | Frame-A geometry unchanged by a frame-B edit | characterization | **new — the §3c property** |
| 9 | Measurement during a sync schedules a follow-up | integration | already satisfied (synchronous) |
| 10 | Cleanup cancels queued work | unit | already passes (`:71`) |
| 11 | No update loop | integration | guard on P7 |
| 12 | No starvation | integration | guard |
| 13 | Final height converges during idle | characterization | **new — must fail before the fix** |
| 14 | 20 s idle leaves no pending value | characterization | **new** |
| 15 | Portrait-only edit leaves landscape geometry unchanged | **PATCH-142** | not here |
| 16 | Landscape receives no raster after a portrait edit | **PATCH-142** | not here |
| — | **Visibility change produces no geometry write** | characterization | **new — the RC-A property, and the case that would have caught this** |
| — | **A height write bumps the scene revision** | integration | **new — the RC-B property** |

The last two are the load-bearing additions. Cases 1–6 and 9–12 largely characterize behaviour
that already works; they are cheap regression guards, not evidence of repair.

**Induced-failure requirement.** The two load-bearing cases MUST be shown to fail against HEAD
`11762e2` before the fix and pass after. A test that is green on both is not accepted as evidence.

The characterization spec inspects embeddable geometry through the **existing PATCH-136 observation
bridge** (`getSceneElements`). No private mutation, no new bridge members, no `window.h`.

---

## 12. Performance baseline (measured at HEAD `11762e2`)

| Metric | Before |
|---|---|
| Natural-height reports per container, cold load | **6–8** (mount + RO transitions); 3–4 applied, the rest no-ops |
| Applied geometry writes before the collapse | **2 per container** (220 → 153 via two steps) |
| Time to converged content height | **~1.8 s** from navigation start |
| Time to the spurious 80 write | **~3.9 s** (viewport cull) |
| `updateScene` calls from W1, cold load | **6** across 3 containers |
| Elements rewritten per W1 call | **1** |
| Scene-wide sync (W4) passes, cold load | **1**, writing 1 element |
| Measurement events after baseline | **0** |
| Unrelated edit required for the stale thumbnail to be discovered | **YES** |
| Landscape rasters, cold load | **1–2** (varies by run) |
| Oscillation on re-navigation | **153 → 80 → 153, 3/3** |

Required after:

| Metric | After |
|---|---|
| Converged content height reached autonomously | **YES**, ≤ 2 s, no unrelated edit |
| Spurious 80 write | **0** |
| Oscillation on re-navigation | **0** — no write on visibility change, either direction |
| `updateScene` calls from W1, cold load | **≤ 6** (no increase) |
| Repeated writes of identical geometry | **0** |
| Frame-B edit causing frame-A geometry writes | **0** |
| Landscape rasters, cold load | **≤ 2**; PATCH-142's target of 1 is re-evaluated there, not here |
| Measurement events after baseline | **0** (unchanged) |

**A reduction in raster count is not by itself acceptance evidence** — RC-B's repair *increases*
timeliness, which may move a raster earlier rather than remove it. The acceptance signal is the
absence of the spurious write and the presence of the revision bump, not the counter.

---

## 13. Hard stops — evaluated

| Stop | Result |
|---|---|
| Final natural height not observable at its producer | **NOT TRIGGERED** — `scrollHeight` is read at the producing node and logged at every transition |
| Repair requires broad editor architecture changes | **NOT TRIGGERED** — two guards in one handler, ≤ 25 lines |
| Convergence depends on generic Excalidraw internals | **NOT TRIGGERED** — depends on a DOM layout property; the fork is untouched and the culling class name is forbidden as a selector |
| Per-embeddable ownership cannot be determined | **NOT TRIGGERED** — one `AutoHeightContainer` per padlet; the write resolves one element by `link` |
| Fixing it requires changing thumbnail signatures | **NOT TRIGGERED** — the signatures are correct; they reported a real height change |
| Requires modifying more than narrowly bounded files | **NOT TRIGGERED** — one file, plus one optional pure helper |
| Height oscillates with no product rule for the terminal value | **NOT TRIGGERED** — it oscillates with *visibility*, and the product rule is unambiguous: the terminal value is the height measured while laid out (153). A hidden card has no content height. |

**All seven clear. PATCH-145 is bounded and authorized to implementation.**

### 13a. Observations recorded, not authorized

1. **Unframed embeddables enter the landscape render key.** At the second pass a fourth overlay
   with `frameId: null` (scene position 160,460 — geometrically inside the landscape frame,
   `zIndex: 5`) appears in `embeddableOverlaySignature`, while `nativeSceneSignature` — which
   filters strictly by `frameId` — excludes it. Overlay membership is geometric; native membership
   is `frameId`-based. This may be intentional, but the two are not stated to be different
   anywhere. **Not in scope. Recorded for a future patch.** It did not contribute to this defect.
2. **Existing boards may hold floored 80 px heights** written by this defect and autosaved. No
   migration is authorized. If the repair reveals visibly-collapsed cards on existing boards, that
   is a separate, evidenced decision.
3. **The 80 px floor makes the failure plausible-looking.** A zero measurement surfaced as `50`
   would have been diagnosed years earlier. The floor is not changed here, but the liveness
   predicate is what makes it safe.

---

## 14. Validation plan

1. Confirm HEAD, clean tree apart from the five protected paths.
2. Land the two guards within the §11a limits. Diff-verify the line counts — do not accept a report.
3. **Induced-failure proof:** run the two load-bearing tests against `11762e2` — both must fail.
4. Run them after the fix — both must pass.
5. Re-run the PATCH-145 characterization ≥ 5 times: no spurious 80 write; re-navigation produces no
   write in either direction; converged height reached with no unrelated edit.
6. Negative control: force a genuine card content change and confirm the height still updates and
   the thumbnail still refreshes. A repair that stops legitimate resizing is a regression, not a fix.
7. `npm run typecheck`, clean ordinary `next build`, bridge exclusion across all emitted files, no
   `E2E_BRIDGE_BUILD` marker.
8. Confirm `git diff --exit-code` clean for every excluded path in §11b.

---

## 15. Dependencies

```
PATCH-145  (this patch — behavioral prerequisite)
    ↓
PATCH-144  (one-invocation vendored declaration generation — independent, still required)
    ↓
PATCH-142  phase 3 characterization re-landed, C5b proven per-slide
    ↓
PATCH-142  closed
    ↓
PATCH-137  migration resumed
    ↓
PATCH-138 onward
```

**PATCH-142** remains **OPEN · BLOCKED BY PATCH-145**. Its production allowlist stays frozen
(`1fe6221`, `23a91bb`); its test allowlist stays empty until this patch closes. `DrawingLayout.tsx`
belongs to PATCH-145 and is excluded from PATCH-142.

**PATCH-144** remains independent and still owns clean-environment declaration regeneration.
PATCH-142 may not claim reproducible clean-environment validation until PATCH-144 closes.

**PATCH-137** remains **OPEN · MIGRATION BLOCKED BY PATCH-142**.

Archived PATCH-090–105 numbers remain void.

---

## 16. Recorded diagnostic notes

- **A measurement instrument reports what it can see, not what is true.** `ResizeObserver` fired
  correctly; `scrollHeight` returned `0` correctly. Every layer behaved as documented, and the
  product still wrote a wrong number, because nobody asked whether the thing being measured was
  being laid out. **Any DOM measurement written back into persistent state needs a liveness
  predicate.**
- **A floor turns a null signal into a plausible value.** `Math.max(…, 80)` converted "I cannot
  measure this" into "this card is 80 px tall". Clamping should never be applied to a value whose
  validity has not been established first — clamp after validating, never instead of validating.
- **I attributed this to a staged convergence, and direct timestamps refuted me.** PATCH-142 §23
  said the second stage fired on the next scene mutation. It fired 22 seconds earlier, at load.
  The event that *appeared* causal was only the first observer to look. **When a value changes
  "on" an event, timestamp the write, not the observation.**
- **The one write path that skipped a convention is the one that broke.** Four sibling call sites
  bump `version`/`versionNonce`, one with a comment explaining precisely this failure mode. The
  fifth did not, and became invisible to every revision-keyed consumer downstream.
  **A convention documented at one call site and enforced at none is a latent defect.**
- **Two real defects can share one symptom.** RC-A produces a wrong value; RC-B hides it until an
  unrelated event. Fixing only RC-A leaves stale thumbnails after legitimate resizes; fixing only
  RC-B makes the wrong value appear *faster*. The evidence separated them only because the
  instrumentation recorded the write and the notification independently.
