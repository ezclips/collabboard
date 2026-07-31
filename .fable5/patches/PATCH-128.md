# PATCH-128 — Synchronize slide membership, rendering and thumbnails after committed scene changes

**Status:** OPEN · **SPIKE AUTHORIZED** · FULL IMPLEMENTATION BLOCKED PENDING
SPIKE RESULT (§9)
**Base commit:** `690d512` (PATCH-127 §17 authorization)
**Authored:** 2026-07-31, CTO
**Model assignment:** GPT-5.5 implements. Independent reviewer reviews. The
authoring CTO neither implements nor reviews.

---

## 1. The defect — not Clipart-specific

A supported canvas object can visibly enter, leave, move, resize or change
inside a slide frame while the Slides sidebar thumbnail stays blank or stale,
the presentation representation stays stale, and the object appears only after
an **unrelated** event forces another refresh.

Clipart was the example that revealed it. **The defect is generic.**

---

## 2. ROOT CAUSE — FOUND. Classification **B**, cascading to C, D and G.

`DrawingLayout.tsx:1209-1216`, inside the Excalidraw `onChange` handler:

```js
// Only trigger a React re-render of the DrawingLayout if the number of active elements changed
// (e.g. user added or deleted something, not just dragging an existing element)
// Uses a ref counter (O(1)) instead of prev.reduce() (O(N)) to avoid 60fps GC pauses during drag.
if (activeElementCountRef.current !== activeCount || frameNameSigRef.current !== frameNameSig) {
  activeElementCountRef.current = activeCount;
  frameNameSigRef.current = frameNameSig;
  setElements(elements);
}
```

**`setElements` is gated on the active element COUNT changing, or the frame
NAME signature changing. Nothing else propagates a committed scene change into
React state.**

The cascade is deterministic:

```
onChange fires (correctly, on every change)
  └─ setElements SKIPPED unless count or frame-name changed        ← THE GATE
       └─ `elements` state frozen
            └─ frames memo (deps [elements, canvasLines], :2234) never recomputes
                 └─ getSlideRenderSignature never re-runs
                      └─ renderSignature / contentVersion unchanged
                           └─ slide cache key unchanged
                                └─ PATCH-124 sees no changed slide  ← nothing to schedule
                                     └─ thumbnail + presentation stale
```

**Moving, resizing, rotating, restyling or re-parenting an object does not
change the element count and does not change any frame name.** Adding or
deleting does. That is exactly the reported symptom, including "appears only
after an unrelated event" — a later add/delete bumps the count and flushes the
whole backlog.

**This is classification B** (onChange fires; the scene revision is not
propagated), which **causes** C (membership not recomputed), D (old slide not
invalidated) and G (scheduler receives no changed-slide request). A is
**excluded**: `onChange` *is* connected. H (readiness) has **no evidence** and
must not be assumed.

**The gate is not a bug — it is a deliberate 60fps drag optimization**, and its
comment says so. The defect is that it is the *only* path, so correctness was
traded away entirely rather than deferred. **PATCH-128 must preserve the
performance intent while restoring the correctness it discarded** — see §6.

### 2a. Why PATCH-124 never received the signal

PATCH-124 was correct and is not at fault. Its input is `slideSignature`,
derived from the `slides` prop, which is the `frames` memo, which is derived
from the **frozen `elements` state**. PATCH-124 fixed *scheduling, ordering and
race resolution downstream of an invalidation signal that never arrives.*

**Do not build a second scheduler.** PATCH-128 supplies the missing signal and
current scene data; PATCH-124 continues to schedule.

---

## 3. Excalidraw integration census

**The existing onChange path:**
`ExcalidrawWrapper.tsx:21,243` declares and forwards `onChange(elements,
appState, files)` → `DrawingLayout` `handleChange` → the §2 gate. **One central
subscription already exists.** No new listener is needed — the existing one is
under-used.

**Scene revision:** `getSceneVersion` is **exported by the installed 0.18.0**
(`dist/types/excalidraw/index.d.ts:11`, alongside `hashElementsVersion`) and is
**not used anywhere in application code**. The repository currently has **no
deterministic scene revision**; it substitutes an element **count** plus a frame
**name** signature, which is precisely why non-structural changes are invisible.

**Bounds helpers:** `elementsOverlappingBBox`, `isElementInsideBBox` and
`elementPartiallyOverlapsWithOrContainsBBox` are exported (`index.d.ts:42`) and
unused.

**Ruling:** `getSceneVersion` (or `hashElementsVersion`) **may** be adopted as
the revision comparator — it is the supported primitive and directly replaces
the count heuristic. **The bounds helpers must NOT be adopted for membership**
— see §4.

---

## 4. Authoritative membership rule — do not invent a second one

```
lib/infra/drawing/frameMembership.ts   resolveFrameMembership(element, frames)
```

consumed by `resolveSlidePadlets.ts:27` (`membership.frameId === slideFrame.id`)
and paralleled by `resolveContainerMembership` (`bridge.ts:97`).

**`resolveFrameMembership` is THE authoritative rule.** PATCH-062/064 governed
it. Introducing `isElementInsideBBox` for affected-slide computation would
create a **second membership algorithm** that disagrees with the first at the
edges — producing exactly failure I (live presentation and thumbnails using
different rules).

**Bound: `resolveFrameMembership` is used for live presentation content,
thumbnail rendering and affected-slide invalidation alike. The ownership rule
does not change in this patch.** `frameMembership.ts` is **read-only** here.

Note: `resolveSlidePadlets` resolves **app-owned embeddables only**
(`link.startsWith("padlet://")`, `:20`). Native elements reach slides through
the render/signature path. **This is why no per-post-type handler is needed —
every post type is one embeddable.**

---

## 5. Object-type census

**All post types are app-owned embeddables** and traverse one identical path:
Image, Clipart, Card, Note, Todo, Link, Containers. **Native Excalidraw
elements** — text, shapes, freehand, connectors/arrows, line labels, groups,
images, frames — traverse the signature path.

**Bound: the synchronization path is generic over element type. No per-type
refresh handler may be added.** A patch that special-cases Clipart has
misunderstood the defect.

---

## 6. Central event contract — bind

One centralized, event-driven path, through the **existing** `onChange`
subscription:

1. observe the latest committed elements, appState and files;
2. **compare a deterministic scene revision** (`getSceneVersion`/
   `hashElementsVersion`) instead of the count heuristic;
3. **debounce** rapid updates;
4. recompute **affected slide IDs** from **both** the previous and the current
   scene;
5. invalidate **presentation content and thumbnails together**, from the **same
   scene snapshot**;
6. preserve PATCH-124 stale-render protection.

**Prohibited:** one listener per post; polling; interval timers;
`MutationObserver` canvas inspection; refresh on every pointer-move frame; a
second parallel scene store; a second thumbnail scheduler.

**Commit-vs-drag — the performance intent of §2's gate must be preserved.**
Track the revision during interaction; debounce while changes continue;
synchronize **after the change settles or on the commit/pointer-up path**;
process **only the latest snapshot**. The visible canvas may keep updating at
60fps — expensive thumbnail and presentation work must not.

---

## 7. Affected-slide contract — bind

**The old scene is required.** Affected slides must **never** be derived from
the new scene alone, or the slide an object *left* is never invalidated
(failure D).

- **Object moves:** refresh the **old** slide and the **new** slide. **If old
  and new are the same, still refresh it** — position or appearance changed.
- **Object enters:** add to that slide's resolved content; refresh its
  thumbnail and presentation rendering.
- **Object leaves:** remove from the old slide's content; refresh the old
  thumbnail and presentation rendering.
- **Slide frame moves/resizes:** compare **old and new frame bounds**;
  recompute membership around **both**; refresh every affected slide.

Affected slide IDs must be **de-duplicated**.

---

## 8. Post-content changes without geometry change

Geometry is not the only invalidation source: image/icon change, title/caption,
caption style, card colour, visible comments/reactions, container contents,
deletion, replacement.

`getSlideRenderSignature` already folds post state into the signature, and
`customData.renderSignature` carries it (`DrawingLayout.tsx:1885`, `:2198`).

**PATCH-115 owns `getSlideRenderSignature.ts` and remains OPEN. Do not edit it.**

**Crucially, PATCH-128's fix sits UPSTREAM of that boundary.** The signature
function is not broken — it is **never re-invoked**, because the memo that calls
it never re-runs. **Fixing the §2 gate requires no change to PATCH-115-owned
code, so there is no boundary conflict.** If implementation discovers the
signature itself must change, that is **hard stop §12.4** — stop and report the
exact conflict; do not cross it silently.

---

## 9. MINIMAL BROWSER SPIKE — required before full authorization

**The spike has NOT been run.** It requires a dev server, live credentials and a
real canvas; this turn authored governance only and implemented nothing. It is
**authorized now and must be run and reported before §10 is unlocked.**

Disposable, real canvas, real Slides panel:

1. create two slide frames;
2. record both thumbnails' image sources / content hashes;
3. place one existing supported post inside slide **A**;
4. **without manual refresh** — slide A's resolved presentation content includes
   it, and A's thumbnail PNG changes and contains **visible post pixels**;
5. move the same post from **A to B**;
6. **do not select slide B**;
7. **without manual refresh** — A no longer contains it, B now does, **both**
   thumbnails change, and **both presentation compositions match**;
8. only affected slides regenerated;
9. **no refresh on every drag frame**;
10. the latest settled position wins.

Evidence: **actual thumbnail data URLs / content hashes, decoded pixel evidence,
and actual presentation DOM/composition evidence.** Renderer-invocation counts
are **supplemental only**.

**It must not pass merely because `onChange`, a listener or a callback fired.**
That is the precise trap this defect was hiding behind: `onChange` fires today,
correctly, and the product is still broken.

**If the minimal proof fails, STOP and report the exact failed layer** before
any broad implementation.

---

## 10. Scope — conditional on §9

**Production — 3 max:**

```
components/collabboard/canvas/layouts/DrawingLayout.tsx   the §2 gate + affected-slide wiring
lib/infra/drawing/sceneSyncScheduler.ts                   NEW — pure revision/affected-slide logic
components/collabboard/editors/ExcalidrawWrapper.tsx      only if the onChange signature must widen
```

Put the decidable logic in the **pure new module** — revision comparison,
affected-slide computation from old+new scenes, de-duplication, debounce
constants — so it is unit-testable under the repo's `environment: 'node'` Vitest
config, exactly as PATCH-124's `slideThumbnailRefresh.ts` was.

**Tests — 2:** `lib/infra/drawing/sceneSyncScheduler.test.ts` (new) and
`e2e/characterization/patch-128-slide-sync.spec.ts` (new).

**Read-only / prohibited:** `frameMembership.ts` (§4), `getSlideRenderSignature.ts`
and all PATCH-115-owned invalidation code (§8), `useSlideThumbnails.ts` and
`slideThumbnailRefresh.ts` (PATCH-124 — §2a), `resolveSlidePadlets.ts`,
`planSlideComposition.ts`, `createSlideRenderer.tsx`, reaction behaviour,
caption behaviour, schema, repositories, RLS, `node_modules`, `package.json`,
`package-lock.json`, `excalidraw_fork`.

**PATCH-127 identity/link work must NOT be resumed.** Its candidate was rejected
and restored; `padlet://` handling stays exactly as it is today.

**Protected — never staged, never modified:** `.gitignore`, the three
`app/api/ai/*` routes, `scripts/live-access-login.mjs`. `.env.local` untouched.

---

## 11. Presentation / thumbnail synchronization and readiness

`PresentationPanel` receives `slides={frames}` (`DrawingLayout.tsx:3307`,
`:3328`) — **the same frozen memo**. So presentation and thumbnails are stale
from the **same** cause, and one signal fixes both.

**Bound: the same invalidation event synchronizes slide content/membership,
presentation composition and the sidebar thumbnail, from one snapshot.** It is
**not acceptable** for only the thumbnail to refresh while presentation content
stays stale, or the reverse.

**Embeddable readiness (failure H) is UNPROVEN and must not be assumed.** If the
spike shows blank previews from posts not being ready when the renderer runs:
use a **deterministic readiness signal**, never a fixed delay; **never cache a
blank result as final**; queue a **bounded** follow-up render; retain PATCH-124
stale-result rejection; and **prevent infinite retry loops**.

**Manual "Refresh slide previews" stays** as recovery/fallback. Verify whether
it currently refreshes thumbnails only; if presentation composition can also go
stale, it should invalidate both. **Automatic synchronization is mandatory — the
manual action must never be the primary mechanism.**

---

## 12. Hard stops

1. The correct fix requires more than 3 production files.
2. A second membership algorithm appears necessary.
3. A second thumbnail scheduler appears necessary.
4. **PATCH-115's signature/invalidation boundary blocks the fix** — report the
   exact conflict; do not cross it.
5. Removing the §2 gate causes measurable drag-performance regression that
   debouncing cannot recover.
6. The §9 spike fails at any layer.
7. Any schema, repository, RLS or package change appears necessary.

---

## 13. Bound tests

**Behavioural:** Image, Clipart, and at least one Note/Todo/Link/Card post
entering and leaving a slide; container enters/leaves; freehand enters/leaves;
shape enters/leaves; connector path/endpoints change; object moves **within**
the same slide; object resizes or rotates; object deleted; object duplicated;
object moves **between two slides**; slide frame moves or resizes; **a
non-selected slide updates**; **post metadata changes while geometry is
unchanged**; rapid consecutive edits settle on the newest state; a stale async
render cannot overwrite a newer result; manual refresh repairs deliberately
stale state; **no infinite render/update loop**; unchanged slides do not
regenerate.

**Performance:** no polling introduced; **exactly one** central scene
subscription; refresh is debounced; **no expensive rendering on any drag
frame**; affected slides de-duplicated; all-slides regeneration only on explicit
refresh-all or an unavoidable global change; listeners and timers cleaned up on
unmount; React effects do not self-trigger indefinitely.

**Induced-failure proofs, required:** restoring the §2 count-only gate must fail
the move-between-slides test; removing old-scene affected-slide computation must
fail the object-leaves test.

**Credentials:** `E2E_EMAIL`/`E2E_PASSWORD` or
`LIVE_ACCESS_EMAIL`/`LIVE_ACCESS_PASSWORD` only — never printed, logged, echoed
or committed. Storage state to a scratch path outside the repo, deleted after
use. Identities as **user ids only — never an email, never a token, never
cookies.**

---

## 14. Bound commit message (exact)

```
fix(canvas): synchronize slides and thumbnails after committed scene changes (PATCH-128)
```

---

## 15. Next GPT-5.5 instruction (bind)

> **Run the §9 spike first. Do not implement the full patch.**
>
> Prove or disprove, with thumbnail content hashes, decoded pixels and real
> presentation composition evidence, that moving a post from slide A to slide B
> — **without selecting B and without manual refresh** — updates both slides'
> content and thumbnails. A fired callback is not evidence.
>
> If it fails, **stop and report the exact failed layer.**
>
> Do not resume PATCH-127. Do not touch `frameMembership.ts`,
> `getSlideRenderSignature.ts`, PATCH-124's scheduler, `node_modules`,
> `package.json`, `package-lock.json` or `excalidraw_fork`. Leave no candidate
> behind.

---

## 16. Status

**PATCH-128: OPEN · SPIKE AUTHORIZED · FULL IMPLEMENTATION BLOCKED PENDING
SPIKE RESULT.** Root cause **found and recorded** (§2, classification B → C, D,
G). Conditional production allowlist **3**; tests **2**. **The spike has not
been run.**

**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed** — must
not be resumed here.
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED** — §8 shows this
fix sits upstream of its boundary, so no conflict is expected; if one appears,
hard stop §12.4.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt:** the repository has **no deterministic scene revision** and
substitutes an element count (§3) — the root enabler of this class of defect;
the upstream Excalidraw null-dereference (PATCH-127 §16b); the `unload` warning;
the tsconfig-excluded fork; and the PATCH-123 §14k / PATCH-124 §14l /
PATCH-125 §13l ledgers plus the unresolved production-build failure.

---

## 17. Amendment — FIRST SPIKE FAILED; SECOND DIAGNOSIS REQUIRED (2026-07-31, CTO)

### 17a. Result

The §9 minimal spike was **executed and fully restored**. **Full implementation
is NOT authorized.** The three-file allowlist in §10 stays locked.

**Confirmed by the spike:** `onChange` fires frequently; the count/frame-name
gate suppresses most scene-version changes; temporary settled propagation does
update React frame composition; cross-slide movement updates the destination
thumbnail and presentation; resize updates the destination thumbnail; expensive
synchronization did **not** run on every `onChange`.

**Failed gates — two, both mandatory:**

1. **Moving the post *within* the same slide did not change the thumbnail
   hash.**
2. **The disabled-propagation control did not cleanly reproduce the defect**,
   because existing embeddable-sync / natural-height behaviour caused React
   frame updates even without the temporary settled path.

**Instrumentation:**

```
after move into slide B     2057405507
after move within slide B   2057405507      ← unchanged
after resize in slide B      900724366      ← changed

onChangeCalls                      248
sceneVersionChanges                 17
countGateSuppressedVersionChanges   16      ← 16 of 17 suppressed
settledSetElementsCalls              4
thumbnailRenders                    10
```

**The `16 / 17` figure independently confirms §2's root cause**: the gate
suppresses ~94% of real scene-version changes. That part of the diagnosis
survives the failed spike and is strengthened by it.

### 17b. A1 is EXCLUDED — derived from source, not assumed

§B asked not to assume the signature is wrong without deriving its inputs.
Derived. `getSlideRenderSignature.ts:130-145`, `embeddableOverlaySignature`:

```ts
embeddableId, embeddableVersion, embeddableVersionNonce, frameId,
x, y, width, height, localX, localY, zIndex, link, padlet
```

**`x`, `y`, `localX`, `localY`, `version` and `versionNonce` are all present.**
A within-slide move changes every one of them.

**Ruling: A1 (signature/cache-key omission) is EXCLUDED for app-owned
embeddables.** The signature is not the missing piece. Any second spike that
starts by "fixing the signature" is working on the wrong layer — and would
collide with PATCH-115 for no reason.

### 17c. Remaining candidates, ranked with the discriminator

**A5 — pixel/hash assertion weakness. LEADING.** The whole-image hash is the
only evidence, and thumbnails are rendered at
`scale = height / slide.height` (`useSlideThumbnails.ts:100`), typically a heavy
downscale. **A small within-slide move can quantize to identical output pixels;
a resize changes the object's footprint and cannot.** The move-unchanged /
resize-changed contrast in §17a is exactly the fingerprint of a *magnitude*
effect rather than a plumbing failure. This must be tested, not assumed.

**A2 — stale renderer input. LIVE, with a concrete named mechanism.** The
`frames` memo mixes two sources: `baseSlide` geometry from the **stale
`elements` state**, while `slideRenderer.getSlideRenderSignature(baseSlide)` is
a **`[]`-deps ref-backed getter reading live runtime state** (PATCH-115's own
comment, `DrawingLayout.tsx:2230-2233`). **That is a split-brain input: one half
stale, one half live.** It is a plausible A2 mechanism and independently worth
recording regardless of this defect.

**A4 — harness mutation not reaching real scene state. LIVE**, and the reason
§17f mandates a real user drag.

**A3 — composition normalization. UNLIKELY** given §17b, but not excluded.

**The discriminator is cheap and must be run first: compare the thumbnail cache
key across the within-slide move.**

- cache key **changed** and a render occurred, but pixels matched → **A5**
  (assertion weakness; the pipeline is working).
- cache key **unchanged** → **A2 or A4** (the new coordinates were lost
  upstream).

**Do not proceed past this discriminator without running it.** It separates "the
product is broken" from "the test is weak", and those demand opposite responses.

### 17d. B — control-path contamination census

**There are exactly TWO `setElements` call sites in `DrawingLayout.tsx`:**

```
:1215   the count/frame-name gate (§2)
:1427   snapshot restore (import/undo path)
```

So the contamination did **not** enter through a third `setElements`. The
mechanism is different, and it matters:

**The `frames` memo re-runs whenever `canvasLines` changes** (deps
`[elements, canvasLines]`, `:2234`) — and when it re-runs, **the ref-backed
signature getter reads LIVE scene state** even though `elements` is stale
(§17c/A2). Embeddable sync (`:1987-2004`, `:2031-2047`) and natural-height
synchronization call `updateScene`, which drives further `onChange` and further
re-renders.

**Consequence: disabling the settled path does not isolate anything, because
these paths recompute a live signature by a side door.** The control was not
wrong; the architecture has no single choke point to disable.

**Bound for the second spike:** the control must isolate `canvasLines`-driven
memo re-runs and embeddable/natural-height sync, **and must record explicitly
which product behaviour was suppressed and why.** Do **not** disable product
behaviour merely to manufacture a failure without that record — a control that
silently changes the product proves nothing about the product.

### 17e. C — scene-version coverage census, required

Establish which mutations increment the Excalidraw scene version and which
require a separate post-data revision: **move, resize, rotate, style change,
text change, connector change, and app-owned post metadata change without any
Excalidraw element mutation.**

Known from source: `version`/`versionNonce` are per-element and bump on element
mutation, so the first six are expected to increment. **Post metadata changes
with no element mutation cannot increment the Excalidraw scene version** —
they reach the signature only through `buildPadletRenderState` inside
`getSlideRenderSignature`. **Therefore `getSceneVersion` alone is insufficient
as the revision comparator**, and any design treating it as the sole trigger
will miss the metadata-change case that §13 already requires a test for.

Report the census as a table of *mutation → scene version changed? → signature
changed?* Both columns are required.

### 17f. D — layer-by-layer coordinate trace, required

For the **within-slide move**, capture and compare, in order:

1. current Excalidraw element coordinates;
2. React `frames` composition coordinates;
3. presentation composition coordinates;
4. slide render signature;
5. thumbnail cache key;
6. renderer input element coordinates;
7. final PNG **pixel bounding box**.

**Report the first layer at which the new coordinates disappear.** If they
survive all seven and only the hash is unchanged, the answer is **A5** and the
product is not broken at this point.

### 17g. Second spike — authorized; full implementation still blocked

Only a **second diagnostic spike** is authorized. It must:

1. use a **real user drag** where possible, not only synthetic mutation;
2. record old/new coordinates at **every** §17f layer;
3. prove whether the thumbnail **signature** changes;
4. prove whether the **renderer receives** the new coordinates;
5. use **decoded pixel bounding boxes**, not only a whole-image hash;
6. **isolate the control** from natural-height and embeddable-sync side effects,
   recording what was suppressed;
7. **reproduce the stale behaviour before** applying any temporary fix;
8. prove **one narrow temporary change** fixes that exact scenario.

**Full implementation stays blocked until all of:** within-slide movement
updates the actual thumbnail; control behaviour is reproducible; presentation
and thumbnail remain synchronized; and no per-drag-frame expensive refresh
occurs.

Restore every temporary change exactly and leave no candidate behind.

### 17h. What survives from §2, and what does not

**Survives — strengthened:** the count/frame-name gate suppresses committed
scene changes (16 of 17 measured), PATCH-124 is not at fault (§2a),
`resolveFrameMembership` remains authoritative (§4), post types are one generic
embeddable path (§5), presentation and thumbnails share the frozen memo (§11),
and the fix sits upstream of PATCH-115 (§8).

**Does not survive as stated:** §2's implication that restoring propagation is
*sufficient*. The spike propagated settled changes and the within-slide case
**still** did not update. **Propagation is necessary but not proven
sufficient**, and §16's status is amended accordingly.

**And the §9 pass bar did its job.** It required decoded pixel evidence and
forbade passing on "a callback fired" — which is why this returned a failure
instead of a false green. The bar was still too weak in one respect: a
whole-image hash is not decoded pixel evidence, and §17g/5 closes that gap.

### 17i. Boundaries — unchanged

**Do not modify PATCH-115-owned signature logic without an explicit later
amendment** — and §17b removes the main reason anyone would want to. **Do not
resume PATCH-127.** Do not touch `frameMembership.ts`, PATCH-124's scheduler,
`node_modules`, `package.json`, `package-lock.json`, `excalidraw_fork`, schema,
repositories, RLS, reaction or caption behaviour. **Protected paths untouched:**
`.gitignore`, the three `app/api/ai/*` routes, `scripts/live-access-login.mjs`.

### 17j. Next GPT-5.5 instruction (bind)

> **Do not implement. Run the source trace, then the second spike.**
>
> **Start with the §17c discriminator:** compare the thumbnail cache key across
> a within-slide move. If it changed and pixels did not, the finding is A5 —
> report that and stop. If it did not change, trace §17f layer by layer and
> report the first layer where the coordinates vanish.
>
> Do not "fix the signature" — §17b excludes A1 from source, and that code is
> PATCH-115-owned.
>
> Deliver the §17e mutation census as a table with both columns. Use a real user
> drag and decoded pixel bounding boxes. Record exactly which product behaviour
> the control suppressed.
>
> Restore everything exactly. Leave no candidate behind.

### 17k. Status

**PATCH-128: OPEN · FIRST SPIKE FAILED · SECOND DIAGNOSIS REQUIRED · FULL
IMPLEMENTATION BLOCKED.**
§2 root cause **retained and strengthened** (16/17 suppressed) but **no longer
claimed sufficient** (§17h). **A1 EXCLUDED** (§17b). Leading candidate **A5**,
with **A2/A4 live** (§17c). §10's three-file allowlist remains **locked** —
only diagnostic spikes are authorized.

**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated:** the **split-brain `frames` memo** — stale `elements`
state combined with a live ref-backed signature getter (§17c/A2) — which has no
single choke point and is why the control could not isolate; no deterministic
scene revision (§3); `getSceneVersion` insufficient alone for metadata-only
changes (§17e); plus the upstream Excalidraw null-dereference, the `unload`
warning, the tsconfig-excluded fork, and the PATCH-123 §14k / PATCH-124 §14l /
PATCH-125 §13l ledgers with the unresolved production-build failure.

---

## 18. Amendment — SECOND DIAGNOSTIC COMPLETE; THREE INVALIDATION PATHS (2026-07-31, CTO)

### 18a. Result

The §17 discriminator and layer trace were **executed against the real browser
application and fully restored**. No implementation remains. **Full
implementation stays blocked; §10's allowlist stays locked.**

Three independent missing signals are now established:

- **R1 — geometry propagation.** A verified `updateScene` mutation moved the
  live element (`x=120/v=1 → x=200/v=3`) while React elements stayed
  `x=120/v=1`. **First stale layer: React elements state / frames memo.** The
  count/frame-name gate is confirmed as a **correctness boundary, not a weak
  assertion** — this closes §17c in favour of **A2**, and retires A5.
- **R2 — the real app-owned drag never mutated the element at all**
  (`x=120,y=100,v=1,nonce=222` before and after). PATCH-124 correctly did
  nothing: its cache key never changed.
- **R3 — post metadata without element mutation** produced no scene-version,
  element-version, signature or cache-key change.

§17c's ranking was wrong: I led with **A5** (hash/quantization weakness) on the
move-vs-resize contrast. **The real-drag trace shows the element never moved at
all**, so there was nothing for the renderer to draw differently. The contrast I
reasoned from had a simpler cause than the one I inferred. Recorded plainly.

**PATCH-124 remains downstream and not at fault**, now for the third time and
for a third distinct reason.

### 18b. R2 SOLVED FROM SOURCE — app-owned drag ownership

**The visible app-owned post drag is owned by the HTML overlay, not by
Excalidraw.** Chain, verbatim from source:

```
DrawingLayout.tsx:2065  renderEmbeddable = (element) => {
:2066-2067                if (!link.startsWith("padlet://")) return null;
:2072                     return <DrawingEmbeddableCard … 
:2092                       onDragEnd={(id, x, y) => {
:2093                         recentlyDraggedRef.current.set(id, { x, y, expiresAt: Date.now() + 5000 });
:2094                         savePadletPositionWithLock(id, x, y);
:2095                       }}
```

```
:1015  savePadletPositionWithLock = (padletId, x, y, lockMs = 1500) => {
:1018    pendingPosTimersRef.current.set(padletId, setTimeout(…, lockMs));
:1021    onUpdatePadlet(padletId, { position_x: x, position_y: y });   ← DB write
:1022  }
```

**There is no `updateScene` call on this path.** The drag persists to the
**padlet row**. The Excalidraw element is expected to follow later, through the
padlet→element sync effect — which is **deliberately suppressed**:

```
:1947  x: positionLocked || !positionChangedInPadletData ? el.x : nextX,
:1948  y: positionLocked || !positionChangedInPadletData ? el.y : nextY,
```

While `positionLocked` (timer-based via `pendingPosTimersRef`, or
coordinate-based via `recentlyDraggedRef`'s 5s window), the element **keeps
`el.x`/`el.y` — it stays stationary by design.**

**Answers to the §A questions:**

- **Which DOM node receives pointerdown?** The `DrawingEmbeddableCard` overlay
  rendered inside Excalidraw's embeddable container via `renderEmbeddable`.
- **Which code moves the visible post?** `DrawingEmbeddableCard`'s own drag,
  reporting through `onDragEnd`.
- **Does Excalidraw receive the drag?** **No.**
- **Is the backing element expected to move?** **Yes — but only later**, via the
  padlet→element sync effect, and only once the lock clears and
  `positionChangedInPadletData` is true.
- **Where is `updateScene` lost?** It is not lost — **it was never called on
  this path.** The design routes geometry through the database and back.
- **Is the movement only an overlay transform?** During the lock window,
  **yes** with respect to the Excalidraw element.

**The critical open question — and I will not answer it from source.** The
diagnostic sampled at **one moment**. Source cannot tell us whether the element
**never** moves or moves **after the 1.5s/5s lock expires**. That distinction
changes the fix completely:

- **moves after expiry** → R2 is a **latency/ordering** defect; the fix is to
  invalidate slides when the sync lands, not to add a new writer;
- **never moves** → R2 is a genuine **bypass**; the sync path itself is broken.

**Bound: the third spike must re-sample element coordinates AFTER lock expiry
(> 5s) before anything is designed.** Designing a writer for a path that is
merely late would introduce a second geometry authority and fight the existing
lock — the lock exists to stop exactly that.

### 18c. D — object-type impact

`renderEmbeddable` returns `null` for anything not `padlet://` (`:2066`), so
**every app-owned post type — Image, Clipart, Card, Note, Todo, Link, Container
— renders through the same `DrawingEmbeddableCard` and shares the same drag
ownership.** The R2 bypass is **uniform across post types**, not layout-specific.

**Native Excalidraw elements** are dragged by Excalidraw itself and **do**
mutate — which is precisely R1's scenario.

**Consequence, and the trap to avoid: fixing R1 alone fixes native shapes and
leaves every app-owned post stale.** The final design must cover both. Whether
dragging by Excalidraw *selection bounds/handles* (rather than the HTML content)
produces a true Excalidraw drag is **unknown and must be measured** in
Scenario 2.

### 18d. B — geometry propagation proposal (R1), not yet authorized

Narrowest mechanism satisfying the constraints: **replace the count/frame-name
predicate at `:1209` with a deterministic revision comparison**
(`getSceneVersion`/`hashElementsVersion`), **debounced and settled**, calling
the existing `setElements` — feeding the existing `frames` memo, adding no
second scene store, touching neither PATCH-115 signature logic nor PATCH-124
scheduling.

**Not authorized yet**, per §B: not until the real drag path is understood,
because if R2 is latency (§18b) the correct trigger point may be the sync
landing rather than raw `onChange`.

Also carried forward: the **split-brain `frames` memo** (§17c/A2) — stale
`elements` plus a live ref-backed signature getter. Any propagation fix should
reduce that split, not entrench it.

### 18e. C — metadata invalidation path (R3)

Trace one real metadata edit through: post state/store → `buildPadletRenderState`
→ `customData.renderSignature` → `frames` memo → `getSlideRenderSignature` →
slide cache key → presentation composition → thumbnail scheduler. **Report the
first layer that fails to observe the revision.**

Source already establishes the shape: `getSlideRenderSignature` **does** fold
padlet state via `buildPadletRenderState`, so the signature *function* can see
metadata. But it is only invoked from the `frames` memo, whose deps are
`[elements, canvasLines]` — **neither of which changes on a metadata-only
edit.** The likely first failing layer is therefore **the memo's dependency
set**, not the signature.

**Do not assume the fix belongs in `getSceneVersion`** — §17e already proved
scene version cannot see metadata-only changes, and R3 confirms it. **Do not
modify `getSlideRenderSignature`** (PATCH-115).

### 18f. Third spike — authorized, three scenarios, characterized separately

**Scenario 1 — native geometry.** Real drag of a native shape; prove live scene
changes; prove the current gate suppresses propagation; apply temporary settled
propagation; prove presentation **and** thumbnail refresh automatically.

**Scenario 2 — app-owned geometry.** Identify the correct real drag surface
(HTML content vs Excalidraw selection bounds/handles); prove whether the backing
element changes; **re-sample after lock expiry (§18b)**; if it should change and
does not, temporarily repair **only** that synchronization; prove the latest
geometry reaches React frames, presentation and thumbnail.

**Scenario 3 — post metadata.** Edit visible post content without moving the
element; prove the render-state revision changes; temporarily propagate it
through the existing slide invalidation; prove presentation and thumbnail update.

**Each scenario characterized independently, before and after. Do not combine
them into an implementation candidate.** Evidence remains decoded pixel bounding
boxes plus real presentation composition — never a fired callback, never a
whole-image hash alone. Restore everything; leave no candidate.

### 18g. Is the three-file cap still credible? **No.**

R1 alone fits `DrawingLayout.tsx` plus a pure module. **R2 and R3 do not.** R2
may reach `DrawingEmbeddableCard` and the padlet→element sync; R3 may reach the
memo's dependency wiring and post-state plumbing.

**Provisional revised cap: 5 production files**, to be confirmed by the third
spike. **§10's allowlist remains LOCKED** — this is a forecast, not an
authorization. If five proves insufficient, **stop and report** rather than
widen silently.

### 18h. New hard stops

1. R2 turns out to require a **second geometry authority** fighting the existing
   position lock.
2. A fix would **shorten, bypass or disable the drag position lock** — it exists
   to prevent DB round-trips clobbering in-flight drags.
3. Correct behaviour requires editing `getSlideRenderSignature` (PATCH-115).
4. Correct behaviour requires altering PATCH-124 scheduling.
5. More than 5 production files prove necessary.
6. Fixing R1 would ship while R2 leaves all app-owned posts stale — **native-only
   fixes must not be presented as resolving this patch.**
7. Any scenario cannot be characterized independently.

### 18i. Boundaries — unchanged

Do not modify `getSlideRenderSignature` without explicit evidence and amendment.
Do not cross PATCH-115. Do not alter PATCH-124 scheduling. Do not resume
PATCH-127. Do not touch `node_modules`, `excalidraw_fork`, `package.json`,
`package-lock.json`, schema, repositories, RLS, reaction or caption behaviour.
**Protected paths untouched:** `.gitignore`, the three `app/api/ai/*` routes,
`scripts/live-access-login.mjs`.

### 18j. Next GPT-5.5 instruction (bind)

> **Do not implement. Complete the source trace, then run the three-scenario
> spike separately.**
>
> **Answer §18b's open question first: does the app-owned backing element move
> after the position lock expires (> 5s)?** Everything about R2's fix depends on
> late-vs-never, and the answer costs one measurement.
>
> Then trace §18e's metadata path and report the first layer that misses the
> revision — expected to be the `frames` memo dependency set, not the signature.
>
> Do not touch `getSlideRenderSignature`, PATCH-124's scheduler, or the position
> lock. Restore everything exactly; leave no candidate behind.

### 18k. Status

**PATCH-128: OPEN · SECOND DIAGNOSTIC COMPLETE · THREE INVALIDATION PATHS
IDENTIFIED · SOURCE TRACE REQUIRED · FULL IMPLEMENTATION BLOCKED.**
R1 confirmed (**A2**, A5 retired). **R2 mechanism identified from source**
(§18b) with late-vs-never open. R3 confirmed; likely first failure is the memo
dependency set (§18e). Three-file cap **no longer credible**; provisional **5**,
allowlist **LOCKED**.

**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated:** app-owned post geometry round-trips through the
**database** rather than the scene, with a 1.5s/5s lock suppressing the return
path (§18b) — an architectural coupling worth revisiting independently of this
patch; the split-brain `frames` memo (§17c); no deterministic scene revision
(§3); `getSceneVersion` blind to metadata-only changes (§17e, R3); plus the
upstream Excalidraw null-dereference, the `unload` warning, the
tsconfig-excluded fork, and the PATCH-123 §14k / PATCH-124 §14l / PATCH-125
§13l ledgers with the unresolved production-build failure.

---

## 19. Amendment — §18 CORRECTED; GEOMETRY ROOT CAUSE CONFIRMED (2026-07-31, CTO)

The third diagnostic was executed against current committed behaviour and
**fully restored**. No implementation remains.

### 19a. CORRECTION — §18b was WRONG

**§18b concluded that the app-owned post drag never touches Excalidraw. That is
incorrect at current HEAD, and the conclusion is withdrawn.**

Real `DrawingEmbeddableCard` drag produced **committed `updateScene` calls** —
**21** during the within-slide drag, **42** cumulative after the cross-slide
drag. **The backing element moved immediately during the drag.**

The mechanism is in the card's own body, not in the props I read:

```
DrawingLayout.tsx:383   onPointerDown={(e) => {
:388                      const sceneEl = excAPI.getSceneElements().find(…)
:395                      const grabOffsetX = startPointerScene.x - sceneEl.x;
:401                      const handleMove = (me: PointerEvent) => {
:405                        const newX = pointerScene.x - grabOffsetX;
:408                        const updatedSceneEl = { ...sceneEl, x: newX, y: newY };
:409                        excAPI.updateScene({ … })          ← per pointermove frame
```

**How I got it wrong.** I traced the `onDragEnd` **prop wiring** at `:2092-2095`,
saw it call `savePadletPositionWithLock` → `onUpdatePadlet` with no `updateScene`,
and concluded the DB was the geometry authority. **I never opened
`DrawingEmbeddableCard`'s own body at `:251-400`, where the real drag lives.**
Reading a component's props tells you what it *reports*, not what it *does*. The
reusable rule: **when tracing who mutates state, read the component, not its
callback wiring.**

**Consequences, bound:**

- **The database write and the position lock are NOT the geometry authority for
  the visible drag, and are NOT the cause of stale slide state.**
- **The lock-expiry theory (§18b) is RETIRED.** `savePadletPositionWithLock` ran
  with `lockMs=1500`, both `onUpdatePadlet` writes completed, **the element had
  already moved before persistence completed**, and **no synchronization pass
  occurred after the 5s coordinate window** — none was required or expected.
- **R2 as a separate app-owned drag bypass is REJECTED.**
- §18c's object-type finding **survives with its conclusion inverted**: all
  app-owned types share the overlay path — and that path **already mutates** the
  backing element. **Native and app-owned geometry can therefore share one
  settled propagation mechanism.**

### 19b. Confirmed geometry failure — R1 is the principal defect

**Within-slide drag:** live Excalidraw moved `x=360/y=120 → x=540/y=200`;
element version `1 → 2`; scene version `7 → 12`; padlet persistence later
reached `540/200`; the landscape thumbnail eventually refreshed.

**Cross-slide drag:** live Excalidraw moved to `x=1520/y=240`; **live membership
changed frame-landscape → frame-portrait**; **React elements remained at
`540/200`**; React frames/presentation input remained frame-landscape; slide
signatures stale; cache keys stale; **no new thumbnail render**; presentation and
thumbnail **stale together**.

**First failed downstream layer: React elements state / frames memo.** The
count/frame-name gate is the confirmed blocker.

```
Excalidraw updateScene  →  live scene + membership CORRECT
  → onChange fires
    → count/frame-name gate SUPPRESSES setElements        ← the defect
      → React elements + frames stale
        → presentation + thumbnail inputs stale
          → PATCH-124 receives no changed cache key
```

**The live Excalidraw mutation is correct.** The updated scene is not reliably
propagated into React state when element count and frame names are unchanged.

### 19c. The nuance that matters most

The within-slide run showed React composition and thumbnails **eventually
catching up through another render path**. **This does not weaken the diagnosis
— it sharpens it.**

**Propagation today is nondeterministic and side-effect dependent.** Within-slide
geometry happened to be rescued by an unrelated re-render; **cross-slide
membership was not.** There is no authoritative propagation after a committed
scene change.

**Bound: the final solution must not depend on `canvasLines`, persistence,
natural-height, selection or any other incidental re-render.** A fix that merely
makes the rescue more likely is a **rejection**, not a pass — and any spike that
passes only because something else re-rendered has proven nothing. This is the
same trap as "a callback fired" (§9) in a new costume.

### 19d. Boundaries added by this diagnostic

**Do not add another `updateScene` writer.** **Do not alter drag ownership.**
**Do not modify lock durations.** **Do not redesign database position
synchronization.** All four were candidate fixes under §18's wrong model; all
four are now prohibited.

**PATCH-124 remains correct and unchanged** — it schedules and de-races renders
when its cache-key inputs change. **PATCH-128's job is to deliver current React
slide inputs after settled scene mutations. No second thumbnail scheduler.**

### 19e. Metadata remains unresolved — implementation stays blocked

Metadata-only updates still produce no scene-version change, no element-version
change, no frames-memo rerun, no signature/cache-key change and no thumbnail
render.

**A settled scene-propagation mechanism fixes geometry and cannot by itself
satisfy the PATCH-128 product contract.** Full implementation stays blocked until
the metadata trigger is characterized (§19h).

### 19f. AUTHORIZED — one narrow geometry implementation spike

Temporary, upstream of the `frames` memo. Contract, bound:

1. the existing `onChange` remains the source of live scene snapshots;
2. **preserve the immediate count/frame-name update path**;
3. track the latest scene revision and latest elements snapshot;
4. debounce/settle rapid geometry changes;
5. after interaction settles, call `setElements` **once** with the latest
   elements when the revision differs from the last React-propagated revision;
6. **not** on every `onChange` frame;
7. no polling; 8. no second scene store; 9. no membership change;
10. no `getSlideRenderSignature` change; 11. no PATCH-124 scheduling change;
12. **no change to `DrawingEmbeddableCard` drag/`updateScene` behaviour.**

**Must prove with real user interactions:**

**A — app-owned cross-slide move:** drag A→B; live membership changes; settled
React elements update; presentation removes it from A and adds it to B; **both**
thumbnails refresh; **slide B not selected**; **no manual refresh**.
**B — app-owned within-slide move:** a **large** move; cache key changes;
thumbnail **visible-pixel bounds move**; presentation coordinates update.
**C — native element move** between slides: the **same** settled propagation
updates presentation and thumbnails.
**D — resize** of an app-owned post: settled propagation updates presentation
and thumbnail.

### 19g. Performance bar

Record `onChange` count, scene-version-change count, settled `setElements`
count, and thumbnail renders **per slide**.

**Pass only if:** settled `setElements` calls are **substantially fewer** than
`onChange` calls; **no expensive thumbnail render on any drag frame**; the
latest settled scene wins; **no infinite React loop**; only affected slides
regenerate where PATCH-124 supports it; **visible drag remains smooth.**

Given §19a's measurement — 21 `updateScene` calls in one within-slide drag —
the per-frame pressure is real and this bar is the reason clause 5 exists.

### 19h. Metadata source trace — bound for a later diagnostic

Trace one real metadata-only edit: post mutation/store update → padlet state
identity/revision → `DrawingLayout` render → **frames memo dependencies** →
`buildPadletRenderState` → slide signature → cache key → presentation and
thumbnail.

**Determine which existing post-state revision can be added as an upstream memo
or invalidation dependency without modifying PATCH-115-owned signature
semantics.** §18e's expectation stands: the first failing layer is expected to be
the **memo dependency set**, not the signature — `getSlideRenderSignature`
already folds padlet state via `buildPadletRenderState`; it is simply never
re-invoked.

### 19i. Spike boundary

**This is a temporary geometry spike, not the final implementation.** Do not
solve metadata invalidation in it. **Do not widen the production allowlist
permanently** — §10 stays **LOCKED**, provisional cap **5** (§18g). After the
spike, **restore all temporary product changes** and report whether the geometry
mechanism passes.

### 19j. New hard stops

1. The settled mechanism cannot be made deterministic without depending on an
   incidental re-render (§19c).
2. Clause 5 cannot be satisfied without calling `setElements` per frame.
3. A fix requires a second `updateScene` writer, changed drag ownership, changed
   lock durations, or redesigned DB position sync (§19d).
4. `getSlideRenderSignature` or PATCH-115 must change.
5. PATCH-124 scheduling must change.
6. Geometry passes but shipping it would leave metadata stale — **geometry-only
   must not be presented as resolving PATCH-128** (§19e).
7. More than 5 production files prove necessary.

### 19k. Next GPT-5.5 instruction (bind)

> **Run the §19f geometry spike only. Do not build the final implementation. Do
> not touch metadata.**
>
> Preserve the immediate count/frame-name path; add settled revision-based
> propagation alongside it. Prove scenarios A–D with **real user drags**, decoded
> pixel bounds and real presentation composition. Record the §19g counters.
>
> **A pass requires the cross-slide case to work deterministically** — not
> because `canvasLines`, persistence, natural-height or selection happened to
> re-render (§19c).
>
> Do not add an `updateScene` writer, change drag ownership, change lock
> durations, touch `getSlideRenderSignature`, or alter PATCH-124. Restore every
> temporary change and leave no candidate behind.

### 19l. Status

**PATCH-128: OPEN · GEOMETRY ROOT CAUSE CONFIRMED · GEOMETRY SPIKE AUTHORIZED ·
METADATA PATH UNRESOLVED · FULL IMPLEMENTATION BLOCKED.**
**§18b withdrawn; R2 rejected** (§19a). **R1 confirmed as the principal geometry
defect** (§19b). §10 allowlist **LOCKED**, provisional cap **5**.

**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated.** Removed: the §18 claim that app-owned geometry
round-trips through the database — **false**, withdrawn. Retained and added:
propagation into React is **nondeterministic and side-effect dependent** (§19c),
the single most important architectural finding of this patch; the split-brain
`frames` memo (§17c); no deterministic scene revision (§3); `getSceneVersion`
blind to metadata-only changes (§17e); the per-frame `updateScene` volume during
drag (21 calls/drag, §19a); plus the upstream Excalidraw null-dereference, the
`unload` warning, the tsconfig-excluded fork, and the PATCH-123 §14k /
PATCH-124 §14l / PATCH-125 §13l ledgers with the unresolved production-build
failure.

---

## 20. Amendment — GEOMETRY SPIKE FAILED; getSceneVersion TRIGGER REJECTED (2026-07-31, CTO)

The authorized geometry spike was executed and **fully restored**. No
implementation remains. It **failed at Scenario A**.

### 20a. Result

Real app-owned drag: live geometry `x=360,y=120 → x=1520,y=240`; live membership
`frame-landscape → frame-portrait`. React elements **remained `x=360,y=120`,
frame-landscape**.

```
onChange calls                    1242
sceneVersionChanges                  0      ← getSceneVersion never moved
immediate structural setElements     0
settled revision setElements         0
frames memo recomputations           0
thumbnail renders                 none
```

Cache keys stale (`landscape 2201291394`, `portrait 1204495343`). Landscape
thumbnail still contained the post (2381 meaningful px, bounds
`35,36→162,98`); **portrait remained blank (0 meaningful px, bounds null)**.
**No unrelated render path rescued it** — §19c's nondeterminism confirmed in the
negative.

**The temporary scheduler was revision-driven and therefore correctly did
nothing.** The spike did not malfunction; **its trigger was unsuitable.**

**Ruled: `getSceneVersion` is WITHDRAWN as the authorized sole geometry
trigger.** §19f clause 5 is superseded by §20d.

### 20b. WHY — answered from source. `getSceneVersion` is not defective.

The owner was right to warn against assuming the primitive was at fault. **It is
not. The app-owned writer violates Excalidraw's mutation contract.**

```
DrawingLayout.tsx:408   const updatedSceneEl = { ...sceneEl, x: newX, y: newY };
:410                    excAPI.updateScene({ … elements: […map…], commitToHistory: false })
```

A spread clone that changes `x`/`y` and **copies `version`, `versionNonce` and
`updated` verbatim**. `getSceneVersion` folds element **`version`**; if no
element's `version` changes, the scene version cannot change. **Zero
`sceneVersionChanges` across 1242 `onChange` calls is the exact, predicted
consequence.**

Answers to the §diagnosis questions, from source:

1. **Mutated in place?** No — a spread clone.
2. **x/y changed without incrementing version?** **Yes. This is the defect.**
3. **`versionNonce` unchanged?** Yes.
4. **Same object identity?** No — new identity each frame. Identity is therefore
   useless as a revision signal, and is a hard stop anyway.
7. **What `getSceneVersion` folds:** element `version`, which this writer never
   increments.
8. **Native vs app-owned:** native drag goes through Excalidraw's own element
   mutation and **does** increment `version`. **Expected to differ — confirm by
   census (§20c).**

### 20c. The repository already has the correct precedent — three sites

This is the decisive finding, and it means **no Excalidraw semantics need to be
invented**:

```
DrawingLayout.tsx:1954-1956      version: (el.version ?? 1) + 1,
                                 versionNonce: Math.floor(Math.random() * 1e9),
                                 updated: Date.now(),
DrawingLayout.tsx:2025-2027      (identical three-field bump)
useCanvasActions.ts:75-77        (identical three-field bump)
```

**Three existing app-owned writers already bump `version`, `versionNonce` and
`updated` on an immutable spread. The drag writer at `:408` is the outlier —
it is the only one that does not.**

So Option A is not "inventing version fields"; it is **making one writer match
the convention the repository already applies everywhere else**. Per §"BOUNDARY
WITH DRAG WRITER", that is **repairing the existing mutation, not adding a
second writer.**

**Still required before authorization — the field-level census** (`x, y, width,
height, angle, version, versionNonce, updated, object identity, array identity,
getSceneVersion`, before/after) for **app-owned move, app-owned resize, native
move, native resize**. Source predicts app-owned move/resize fail to increment
while native increments. **Measure it; do not ship on my prediction.**

### 20d. Trigger options — ranked on evidence

**OPTION A — repair the app-owned mutation. LEADING.**
Add the established three-field bump at `:408`. Then `getSceneVersion` becomes a
valid trigger for **both** native and app-owned geometry, uniformly, with no new
concept and no per-type logic. Narrowest and most generic.

**Two risks that must be cleared before authorization:**
1. **Per-frame version inflation** — `version` would increment on every
   pointermove (1242 `onChange` calls observed). Native Excalidraw does exactly
   this, so it is contract-consistent, but confirm nothing in the app or any
   sync/reconciliation path treats `version` as monotonic-per-commit.
2. **`commitToHistory: false` must stay**, so per-frame bumps do not pollute
   undo.

**OPTION B — deterministic geometry signature. VIABLE FALLBACK.** Only if A
proves unsafe. Must cover `id, type, frameId, x, y, width, height, angle,
version/versionNonce where available, deletion state, group ids, bound-element
relationships`; must not rely on object identity, must not deep-serialize per
pointer frame, must be cheap at settlement, must not duplicate
`getSlideRenderSignature`, and **must exclude post metadata** — metadata stays a
separate trigger.

**OPTION C — unconditional settled propagation. NOT PREFERRED.** Without a
revision or signature comparison it risks a settle→render→settle loop and
over-rendering. It also **still needs a bounded equality check**, at which point
it has become Option B with weaker guarantees.

**OPTION D — explicit drag-commit signal. REJECTED.** It creates one path for
app-owned and another for native, and would miss resize, style and delete
operations — precisely the per-type divergence §5 and §18c forbid. A generic
settled `onChange` solution is preferable and, given §20c, is achievable.

### 20e. Metadata — unchanged and still unresolved

**No geometry trigger solves metadata.** Title/caption edits, image/icon changes,
card colour, visible reactions/comments, and other post-data changes without
Excalidraw geometry mutation remain invisible to every option above.

**The final PATCH-128 design requires BOTH: (1) a reliable geometry/scene
trigger, and (2) a reliable post-render-state trigger.** Shipping (1) alone must
not be described as resolving PATCH-128 (§19j hard stop 6).

### 20f. PATCH-115 and PATCH-124 — unchanged

**Do not change `getSlideRenderSignature`** — it already folds geometry *and*
post render state when invoked; it is simply never re-invoked. **Do not alter
PATCH-124 scheduling** — its inputs are stale because upstream React slide state
is stale. Neither is at fault; this is now the fourth diagnostic to confirm it.

### 20g. NEXT AUTHORIZED ACTION — diagnosis only

**Authorized: the §20c field-level census and one trigger-comparison
diagnostic. Nothing else.**

It must answer: why app-owned geometry does not alter `getSceneVersion`
(source-answered in §20b — **confirm by measurement**); whether native geometry
does; whether immutable/versioned mutation is already supported (§20c says
**yes**, at three sites — confirm); whether a deterministic geometry signature is
necessary; whether unconditional settled propagation would loop or over-render;
and which trigger is narrowest and generic across native and app-owned elements.

**No further geometry implementation spike is authorized until a trigger
strategy is selected on this evidence.** **The §10 production allowlist stays
LOCKED**; the provisional five-file forecast is **not** authorization.

### 20h. Hard stops — carried and extended

Stop if the solution requires: modifying `node_modules` or `excalidraw_fork`;
**manually inventing Excalidraw `versionNonce` behaviour without precedent** —
note §20c supplies precedent, so Option A does *not* trip this; modifying
PATCH-115 signature logic; modifying PATCH-124 scheduling; per-post-type
listeners; polling; rendering thumbnails on every pointermove; **treating object
identity as a geometry revision**; or combining metadata work into the geometry
diagnostic.

**Added:** stop if repairing the `:408` writer changes undo/history behaviour,
or if any sync/reconciliation path depends on `version` not incrementing
per-frame.

### 20i. Next GPT-5.5 instruction (bind)

> **Diagnosis only. No implementation spike.**
>
> Produce the §20c field-level census — `x, y, width, height, angle, version,
> versionNonce, updated, object identity, array identity, getSceneVersion`,
> before and after, for app-owned move, app-owned resize, native move, native
> resize.
>
> Confirm or refute from measurement: the app-owned writer at
> `DrawingLayout.tsx:408` does not increment `version`, while native drag does,
> and the three-field bump at `:1954`, `:2025` and `useCanvasActions.ts:75` is
> the established in-repo convention.
>
> Report whether anything depends on `version` not incrementing per frame, and
> whether `commitToHistory: false` is preserved on that path.
>
> Do not repair the writer yet. Do not touch metadata,
> `getSlideRenderSignature`, PATCH-124, `node_modules` or `excalidraw_fork`.
> Restore everything; leave no candidate.

### 20j. Status

**PATCH-128: OPEN · GEOMETRY ROOT CAUSE CONFIRMED · getSceneVersion TRIGGER
REJECTED · TRIGGER SOURCE DIAGNOSIS REQUIRED · METADATA PATH UNRESOLVED · FULL
IMPLEMENTATION BLOCKED.**
Cause of the failure **identified from source** (§20b): the app-owned drag
writer clones without bumping `version`. **Option A leads**, with in-repo
precedent at three sites (§20c), pending the confirming census. Allowlist
**LOCKED**.

**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated:** the app-owned drag writer at `DrawingLayout.tsx:408`
**silently violates Excalidraw's element-revision contract** — a defect with
consequences beyond this patch, since any consumer relying on `version` or
`getSceneVersion` is equally blind to app-owned drags; propagation into React is
nondeterministic (§19c); the split-brain `frames` memo (§17c); `getSceneVersion`
blind to metadata-only changes (§17e); plus the upstream Excalidraw
null-dereference, the `unload` warning, the tsconfig-excluded fork, and the
PATCH-123 §14k / PATCH-124 §14l / PATCH-125 §13l ledgers with the unresolved
production-build failure.

---

## 21. Amendment — OPTION A GEOMETRY SPIKE AUTHORIZED (2026-07-31, owner decision)

The §20 field census was executed and **fully restored**. It **confirms §20b and
§20c from measurement.**

### 21a. Census — the app-owned move writer is the sole outlier

| mutation | x/y or size | version | versionNonce | updated | getSceneVersion |
|---|---|---|---|---|---|
| **app-owned move** | 360,120 → 1120,265 | **2 → 2** | **unchanged** | **unchanged** | **12 → 12** |
| app-owned resize | w 320 → 410 | 2 → 18 | changed | changed | 12 → 28 |
| native move | 80,150 → 340,240 | 1 → 19 | changed | changed | 28 → 46 |
| native resize | 120×70 → 240×150 | 19 → 37 | changed | changed | 46 → 64 |

Across multiple pointermove samples of the app-owned move: x/y changed each
frame, **a new element object each frame**, `version` pinned at 2,
`versionNonce` pinned at `629480932`, `updated` pinned at `1785510546089`,
`getSceneVersion` pinned at 12 — over **91 `onChange`** and **33 `updateScene`**
calls.

**Object identity and array identity both changed on every frame and are
therefore unusable as revisions** — confirming the standing hard stop against
treating identity as a revision.

**`getSceneVersion` is not defective.** It folds element `version`; the writer
never changes it. Predicted in §20b from source, now measured.

**Three rows increment; one does not.** App-owned **resize** already increments
(2 → 18) because it goes through Excalidraw's own handles — **so the defect is
confined to the custom move writer**, and the repair surface is exactly one code
site.

**The other three rows also establish that per-frame revision increments are
normal Excalidraw behaviour** — native move jumped 1 → 19 and resize 19 → 37
across a single interaction. §20d's per-frame-inflation risk is therefore
**cleared by evidence**: the app is already living with per-frame increments
everywhere except this one writer.

### 21b. Consumer findings — recorded

`getSceneVersion` sums element `version`. `getSlideRenderSignature` includes
`version` and `versionNonce`. Excalidraw **reconcile** uses `version`/
`versionNonce` for conflict ordering. Excalidraw **history excludes**
`version`/`versionNonce` from applied deltas. Native movement already increments
during interaction. **No repository evidence forbids per-pointermove revision
increments.**

### 21c. Option A — AUTHORIZED as a temporary spike

**Authorized: one narrow geometry trigger implementation spike, Option A only.**

The spike may temporarily modify the **existing** `DrawingEmbeddableCard` drag
writer (`DrawingLayout.tsx:408`) so each geometry mutation also updates
`version`, `versionNonce` and `updated`, using **the convention already present
in this repository**:

```
version: (el.version ?? 1) + 1,
versionNonce: Math.floor(Math.random() * 1e9),
updated: Date.now(),
```

— matching `DrawingLayout.tsx:1954-1956`, `:2025-2027` and
`useCanvasActions.ts:75-77`.

**This invents nothing.** It repairs one inconsistent writer to follow the
existing repository and Excalidraw mutation conventions. It is **not a second
writer** (§20c, and the owner's boundary clause).

**Do not change** x/y calculation, drag ownership, persistence, lock durations,
DB synchronization, membership, thumbnail scheduling or signature logic.

The spike **may** also use the already-authorized settled revision-based React
propagation **beside** the existing count/frame-name gate (§19f clauses 1–4, 6–12
stand; clause 5's revision comparison is now viable because §21c makes the
revision real).

### 21d. The complete chain the spike must prove

```
app-owned drag
 → x/y AND revision fields change
   → getSceneVersion changes
     → settled React elements update
       → frames memo receives current geometry
         → presentation membership/composition updates
           → PATCH-124 receives changed cache keys
             → affected thumbnails refresh automatically
```

**Every arrow must be evidenced.** A break at any one of them is a failure, not
a partial pass — this is the fifth diagnostic on this defect, and each previous
one died at a different arrow.

### 21e. Scenarios

**A — app-owned cross-slide move:** live and React geometry agree after settle;
presentation removes from A and adds to B; **both** thumbnails refresh; **slide
B not selected**; **no manual refresh**.
**B — app-owned within-slide move:** a **large** move; cache key changes;
renderer coordinates change; **decoded thumbnail pixel bounds move**;
presentation coordinates update.
**C — native move** between slides: settled propagation remains **generic**; no
regression.
**D — app-owned resize** through Excalidraw handles: **no double revision** and
no regression; presentation and thumbnail update.

Scenario D is the one to watch. App-owned resize **already** increments via
Excalidraw's handles (§21a); if the repaired move writer also fires on a resize
path, revisions could be bumped twice. Double-increment is not obviously harmful
— `getSceneVersion` only needs to *change* — but it must be **measured, not
assumed**, and any interaction between the two paths reported.

### 21f. History and persistence contract — bind

Existing drag behaviour must remain: pointermove updates keep
`commitToHistory`/capture semantics that **do not create one undo entry per
frame**; only the existing **final drag commit** enters history; position
persistence stays on drag completion; **no second `updateScene` writer**; **no
change to lock duration, DB synchronization or drag ownership.**

Excalidraw excludes `version`/`versionNonce` from applied history deltas
(§21b), which is why this repair is expected to be history-neutral — **expected,
and therefore measured, not assumed.**

### 21g. Performance and history bar

Record: `onChange` count; `updateScene` count; scene-version changes; immediate
structural `setElements` calls; settled `setElements` calls; thumbnail renders
**per slide**; **undo-stack effect**; and **collaboration/reconcile warnings or
anomalies**.

**Pass only if:** `setElements` and thumbnail rendering do **not** occur per
pointer frame; **one normal undo restores the drag**; **no extra history
entries**; **no collaboration/reconcile loop**; visible drag stays smooth; latest
geometry wins; presentation and thumbnails stay synchronized.

### 21h. Hard stops — stop and restore

Revision changes create a collaboration/reconcile loop; undo history gains one
entry per pointer frame; app-owned resize regresses; native geometry regresses;
thumbnails render continuously during drag; `getSlideRenderSignature` or
PATCH-124 must change; the PATCH-115 boundary must be crossed; or metadata work
is required to pass a geometry scenario.

### 21i. Metadata remains blocked

**This spike addresses geometry only.** Metadata-only changes — title/caption,
image/icon, card colour, visible reactions/comments — still require a separate
trigger and **must not be included or claimed as solved.** Passing all four
scenarios does **not** unblock full implementation (§19j hard stop 6, §20e).

### 21j. Spike boundary

**Temporary implementation spike, not the final patch.** **§10's production
allowlist stays LOCKED**; provisional cap 5 remains a forecast, not
authorization. After the spike, **restore every temporary product change** and
report whether the Option A trigger passes.

### 21k. Next GPT-5.5 instruction (bind)

> **Run the Option A geometry spike. Temporary only.**
>
> Repair the existing writer at `DrawingLayout.tsx:408` to add
> `version`/`versionNonce`/`updated` using the convention at `:1954`, `:2025` and
> `useCanvasActions.ts:75`. Add nothing else — no second writer, no change to
> x/y maths, drag ownership, persistence, locks, membership, scheduling or
> signatures.
>
> Prove **every arrow** of §21d for scenarios A–D with real drags, decoded pixel
> bounds and real presentation composition. Record all §21g counters, including
> **undo-stack effect and reconcile anomalies** — those are the two that decide
> whether Option A is safe, not just effective.
>
> Watch scenario D for double revision bumps.
>
> Do not touch metadata, `getSlideRenderSignature`, PATCH-124, `node_modules` or
> `excalidraw_fork`. Restore everything; leave no candidate behind.

### 21l. Status

**PATCH-128: OPEN · OPTION A GEOMETRY TRIGGER SPIKE AUTHORIZED · METADATA PATH
UNRESOLVED · FULL IMPLEMENTATION BLOCKED.**
Census confirms the app-owned move writer as the **sole** non-conforming
geometry path (§21a). Option A **repairs**, and does not invent (§21c).
Per-frame increment risk **cleared by evidence** (§21a). Allowlist **LOCKED**.

**Option ranking:** A authorized · B fallback · C weak fallback · D rejected.

**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated:** `DrawingLayout.tsx:408` violates Excalidraw's
element-revision contract — **now measured, not merely inferred** — so any
consumer relying on `version`, `versionNonce` or `getSceneVersion` is blind to
app-owned drags, including Excalidraw's own **reconcile conflict ordering**,
which is a correctness concern beyond slides and beyond this patch; propagation
into React is nondeterministic (§19c); the split-brain `frames` memo (§17c);
`getSceneVersion` blind to metadata-only changes (§17e); plus the upstream
Excalidraw null-dereference, the `unload` warning, the tsconfig-excluded fork,
and the PATCH-123 §14k / PATCH-124 §14l / PATCH-125 §13l ledgers with the
unresolved production-build failure.

---

## 22. Amendment — OPTION A PROVEN; THUMBNAIL OUTPUT PATH UNRESOLVED (2026-07-31, CTO)

The authorized Option A spike was executed and **fully restored**. It **repaired
the revision and propagation chain** but **failed at thumbnail output**.
**Permanent implementation remains blocked.**

### 22a. Corrected Option A status — PROVEN, NOT AUTHORIZED

The temporary repair added the repository-standard fields to the existing
immutable move writer (`version + 1`, new `versionNonce`, `updated`).

```
x/y                       360,120 → 1500,180
version                        2 → 33
versionNonce              changed
getSceneVersion               12 → 43
onChange calls                91
app-owned updateScene calls   31
settled setElements calls      1      ← one, not 91
onUpdatePadlet calls           1
```

**Proven effective for:** app-owned move revision generation; `getSceneVersion`
triggering; settled React propagation; presentation membership/composition; and
undo/redo. **History contract intact** — pointermove stayed non-history, the
final drag commit was the history commit, one undo restored the original
position, redo restored the final. **No per-frame `setElements`, no per-frame
history entries.**

Six §21d arrows now pass. **The seventh and eighth do not.**

**Ruling: Option A is PROVEN but NOT permanently authorized.** It is a
prerequisite, not a solution. The §21g bar required the *complete* chain, and a
partial chain is not a pass — as §21d stated in advance.

### 22b. The failure, and where diagnosis now begins

Scenario A failed **at thumbnail pixels**: slide B membership changed, slide B
presentation/signature changed, React state was current — **and the decoded
slide B thumbnail output did not change.**

**Diagnosis begins after presentation/signature generation. Do not return to the
revision trigger unless new evidence contradicts this.** Four diagnostics were
spent upstream; that ground is now settled.

### 22c. Thumbnail diagnostic contract — bind

Trace **one** app-owned cross-slide move through all thirteen layers, recording
**exact before/after values for BOTH the old and new slide**:

```
1  updated React frames            8  renderer input slide
2  resolved slide membership       9  renderer input elements/padlets
3  slide render signature         10  generated PNG / data URL
4  thumbnail cache-key construction 11  cache acceptance
5  PATCH-124 changed-slide compare 12  sidebar img source
6  pending changed-slide queue    13  decoded output pixels
7  createSlideRenderer invocation
```

**Discriminator — report exactly one:**

- **A** signature changed, cache key changed, render scheduled, renderer input
  current, **but PNG unchanged**;
- **B** signature and cache key changed, **but render not scheduled**;
- **C** render completed with a changed PNG, **but the result was rejected or not
  installed**;
- **D** renderer receives **stale membership/elements** despite current
  presentation input;
- **E** output changes but the **pixel assertion targets the wrong image or a
  stale DOM node**.

**Do not assume the renderer is wrong until each layer is measured.**

**Source narrowing, offered as a prior and not a finding:** `createSlideRenderer`
is constructed with a **`getSceneElements` getter** (`createSlideRenderer.tsx:56`)
and `renderSlideToPNG(slide, opts)` receives the **slide object** (`:220`). The
renderer therefore reads the scene **at render time**, which makes **D less
likely for scene elements** — though a stale captured *getter*, or a stale
`slide` object, would still produce D. **C and A are the stronger priors; E must
be excluded before either is believed.** Measure all five regardless.

### 22d. Old and new slide — both required

For an object moving A → B, prove **separately**:

- **slide A is invalidated and removes the post**;
- **slide B is invalidated and adds the post**;
- **both** render requests use current scene data;
- **both** accepted results reach the **correct sidebar thumbnail elements**.

**Record render tokens and cache keys per slide.** A diagnostic that only
inspects slide B cannot distinguish C from E, because the two slides' results can
be installed against the wrong nodes.

### 22e. PATCH-124 — still presumed correct

**PATCH-124 may still be correct and must not be rewritten speculatively.**
Modify it only once evidence identifies exactly one of: changed-slide selection
failure; queue loss; stale request-token rejection error; or accepted-result
installation failure.

Note for the diagnostic: PATCH-124's acceptance requires **both**
`requestId === latestRequestId` **and** `requestedCacheKey === latestCacheKey`.
During a settled propagation the cache key can legitimately change between
request and completion, producing a **correct rejection and re-queue**. If the
re-queue is not observed to complete, that is discriminator **C** — and it is the
single most likely mechanism given everything upstream now works.

### 22f. Renderer input divergence — compare three consumers

Presentation success **does not** prove the thumbnail renderer received the same
slide object or the same scene snapshot. Compare the actual slide data used by
**`PresentationPanel`**, **`useSlideThumbnails`** and **`createSlideRenderer`**,
recording: frame ID, object IDs, local x/y, width/height, padlet IDs, render
signature, and scene/files snapshot identity or revision.

**Identify the first point where thumbnail input diverges from presentation
input.** That single answer resolves D outright.

### 22g. Scenario C — INCONCLUSIVE, not failed

The native **keyboard** move reached `x=1500,y=240` but `frameId`/membership
remained landscape. **Do not classify native propagation as failed.**

Determine which holds: keyboard movement does not update `frameId`
automatically; membership is **geometric** and the test asserted the wrong field;
the element never crossed the authoritative boundary; or the interaction is
unsupported for frame reassignment.

**A later native test must use a real pointer drag and verify membership through
the authoritative `resolveFrameMembership` result — not `frameId` alone.** §4
made that helper authoritative precisely so that membership is never asserted by
reading a raw field.

### 22h. Scenario D — INCONCLUSIVE, not failed

The app-owned resize did not mutate width/height because the test **never
targeted the real resize handle**. **Do not classify resize as passed or
failed** — neither claim is supported.

A later test must first prove the correct Excalidraw resize handle received
pointerdown, width/height changed in the live scene, and the interaction
completed. **Only then** may propagation and thumbnail output be evaluated. An
interaction that did not occur cannot characterize the code it was meant to
exercise.

### 22i. Authorized next action — thumbnail diagnostic only

**Authorized: one thumbnail pipeline diagnostic. Nothing else.**

**Do not rerun the full Option A spike.** The temporary Option A revision repair
and settled propagation **may be reintroduced solely as prerequisites** to create
the known-good current React and presentation state — they are scaffolding here,
not the subject.

**The diagnostic must STOP after identifying the first thumbnail layer that
remains stale or rejects the result.** Do not continue into a fix.

**No permanent production change is authorized.** §10's allowlist stays
**LOCKED**.

### 22j. Metadata

**Metadata invalidation remains separate and unresolved. Do not investigate or
solve it in the thumbnail diagnostic.**

### 22k. Hard stops — updated

Stop and restore if: the diagnostic cannot isolate a single discriminator;
diagnosing requires modifying `getSlideRenderSignature` or crossing PATCH-115;
diagnosing requires rewriting PATCH-124's scheduler; a fix appears to require a
second thumbnail scheduler; the answer is **E** and the underlying pipeline is
found already correct — in which case **report that plainly rather than
manufacturing a defect**; metadata work is required to complete the geometry
chain; or `node_modules`/`excalidraw_fork` must change.

### 22l. Next GPT-5.5 instruction (bind)

> **Run the thumbnail diagnostic only. Do not fix anything.**
>
> Reintroduce Option A's repair and settled propagation **as scaffolding** to
> reach known-good React and presentation state. Then trace all thirteen §22c
> layers for **both** the old and new slide, recording render tokens and cache
> keys per slide, and report **exactly one** discriminator A–E.
>
> Compare §22f's three consumers and name the first divergence point.
>
> **Stop at the first stale or rejecting layer.** Do not rerun the full Option A
> spike, do not touch metadata, `getSlideRenderSignature`, PATCH-124's
> scheduler, `node_modules` or `excalidraw_fork`. Restore everything; leave no
> candidate behind.

### 22m. Status

**PATCH-128: OPEN · OPTION A REVISION/PROPAGATION PROVEN · THUMBNAIL OUTPUT PATH
UNRESOLVED · NATIVE MOVE AND RESIZE TESTS INCONCLUSIVE · METADATA PATH
UNRESOLVED · FULL IMPLEMENTATION BLOCKED.**
Option A is **proven, not authorized** (§22a). Diagnosis moves **downstream of
signature generation** (§22b). Scenarios C and D are **inconclusive, not
failures** (§22g, §22h). Allowlist **LOCKED**.

**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated:** the `DrawingLayout.tsx:408` revision-contract
violation is **measured and its repair proven effective** — it should land
regardless of how the thumbnail question resolves, since Excalidraw's reconcile
conflict ordering depends on those fields; propagation into React is
nondeterministic (§19c); the split-brain `frames` memo (§17c); `getSceneVersion`
blind to metadata-only changes (§17e); plus the upstream Excalidraw
null-dereference, the `unload` warning, the tsconfig-excluded fork, and the
PATCH-123 §14k / PATCH-124 §14l / PATCH-125 §13l ledgers with the unresolved
production-build failure.

---

## 23. Amendment — CLASSIFICATION E; GEOMETRY PIPELINE PROVEN (2026-07-31, CTO)

The authorized thumbnail diagnostic was executed and **fully restored**.

### 23a. Classification **E** — the §22 failure was a TEST false failure

**No product defect exists in PATCH-124 or the geometry thumbnail rendering
path.** In the controlled one-post cross-slide test: correct signatures and cache
keys were produced; PATCH-124 scheduled **exactly one** render per affected
slide; current renderer inputs were used; correct PNGs were generated; both
results passed request-token and cache-key acceptance; both were installed; and
**the re-queried sidebar `img` elements displayed the updated images.**

| | slide A (old) | slide B (new) |
|---|---|---|
| members after | **none** | `patch128-post-el` @ local 100,180 |
| digest | `2be0bd19 → cb252e3d` | `bbc7a383 → 7d97e454` |
| request | `id=3`, `latest=3`, keys equal | `id=4`, `latest=4`, keys equal |
| PNG | `3933543301`, 569×320, **0 px, bounds null** | `3953236842`, 180×320, **4148 px, bounds 28,48..104,101** |
| installed | yes — updated to empty slide | yes — blank → rendered post |

No rejection, no follow-up render required, one render per affected slide, no
render loop.

**This is the outcome §22k deliberately kept available.** After five diagnostics
there was real pressure to find a defect; the honest answer was that the last one
did not exist. **The fixture sampled a stale, ambiguous or non-discriminating
thumbnail state**; the controlled diagnostic re-queried sidebar images **by
stable slide identity** and proved the results correct.

**§22's implied product failure is withdrawn.** The lesson, recorded: **a
thumbnail assertion must re-query the DOM by stable slide identity at assertion
time** — a captured node or an ambiguous selector will report a false failure and
send diagnosis downstream of a pipeline that already works.

**PATCH-124 is correct — the fifth consecutive diagnostic to confirm it. Do not
modify or rewrite it.**

### 23b. Geometry chain — PROVEN end to end

```
app-owned drag → x/y change → version/versionNonce/updated change
  → getSceneVersion change → one settled setElements
    → React geometry matches live scene → frames/presentation membership updates
      → slide signatures/cache keys change → PATCH-124 renders both affected slides
        → correct PNGs accepted and installed → actual sidebar thumbnails update
```

**All eight §21d arrows now pass.** Option A plus settled revision-based
propagation is **technically justified for the geometry portion**.

**This does not authorize the full PATCH-128 implementation.** Metadata remains
unresolved (§19j hard stop 6, §20e, §21i).

### 23c. Option A — permanent design candidate (not yet authorized)

The permanent geometry design may now be **prepared** around:

**1. Repair the existing `DrawingEmbeddableCard` move writer** (`DrawingLayout.tsx:408`)
to follow the established convention — `version: previous + 1`, new
`versionNonce`, `updated: Date.now()` — matching `:1954`, `:2025` and
`useCanvasActions.ts:75`. **One writer repaired, none added.**

**2. One settled `getSceneVersion`-based propagation path beside the existing
immediate count/frame-name gate:** retain immediate structural updates; retain
the latest elements snapshot; debounce rapid changes; propagate only the latest
settled revision; **no `setElements` per pointer frame**; timer cleanup; **no
second scheduler; no second scene store.**

**The allowlist stays LOCKED until the metadata path is characterized**, so the
two halves can be designed and reviewed as one patch rather than shipped in
sequence.

### 23d. Native and resize coverage — still required, no longer blocking

Native cross-slide move and app-owned resize remain **unproven**, because the
earlier interactions never established the intended mutations (§22g, §22h). They
**remain required before final acceptance** but **no longer block the geometry
architecture selection**.

Later acceptance must use a **real pointer drag**; assert membership via the
authoritative **`resolveFrameMembership`**, not `frameId` alone; confirm the
**resize handle received pointerdown**; and confirm **live width/height mutation**
before evaluating anything downstream.

### 23e. Metadata — the only unresolved invalidation class

A metadata-only post edit produces no element mutation, no element-version
change, no `getSceneVersion` change, no frames-memo recomputation, no
signature/cache-key recalculation and no thumbnail render.

**Authorized next action: a metadata invalidation source trace and minimal
diagnostic.** Use one real visible edit that does not alter geometry — title or
caption, image/icon, card colour, or another clearly visible field — and trace:

```
post mutation → local post/store state → DrawingLayout render
  → padlet collection/reference identity → frames memo dependencies
    → buildPadletRenderState → slide render signature → thumbnail cache key
      → presentation composition → PATCH-124 scheduling → displayed thumbnail
```

**Report the first stale layer.**

**Primary questions:** (1) does `DrawingLayout` receive updated post data?
(2) does the post collection or a deterministic post revision change? (3) does
the frames memo rerun? (4) if it reruns, does `buildPadletRenderState` change?
(5) does the slide signature change? (6) do presentation and thumbnail receive
the same updated post state? (7) can one existing post-data revision be added
upstream **without** changing `getSlideRenderSignature` or PATCH-115-owned
semantics?

**Source prior — offered as a prior, not a finding.** `padlets` is a **prop**
(`DrawingLayout.tsx:634`), mirrored into `paddletsRef` (`:708`, `:737`). The
frames memo's deps are **`[elements, canvasLines]`** (`:2234`) — **`padlets` is
deliberately absent**, while the signature getter reads `paddletsRef.current`
**live**. So a metadata edit is expected to update the prop and the ref, and the
memo is expected **not** to rerun — making the **memo dependency set** the
predicted first stale layer, exactly as §18e and §19h forecast.

**Critical caveat for Q7:** `padlets` must **not** be added raw as a dependency.
It is a prop array with a new identity on every parent render, so adding it would
recompute the memo constantly — almost certainly why it was excluded in the first
place. **A derived, deterministic post-render revision is required, not the
array.** Measure before designing.

**Do not solve metadata through `getSceneVersion`** (§17e, and Path 3 proved it
blind). **Do not add per-post listeners.** **Do not implement the full patch in
the metadata diagnostic.**

### 23f. Hard stops — updated

Stop if: the metadata trigger requires changing `getSlideRenderSignature` or
crossing PATCH-115; it requires altering PATCH-124; it requires per-post
listeners or polling; adding the dependency causes the frames memo to recompute
on every parent render or produces a render loop; or geometry work is needed to
complete the metadata trace.

### 23g. Next GPT-5.5 instruction (bind)

> **Run the metadata source trace and minimal diagnostic only. Do not implement.**
>
> Use one real visible non-geometry edit. Trace every layer in §23e and report
> the **first stale layer**, answering all seven primary questions.
>
> Test the §23e prior explicitly: does the frames memo rerun on a metadata-only
> edit? If it does not, identify which **deterministic** post-render revision
> could serve as an upstream dependency — and confirm it does not recompute on
> every parent render.
>
> Do not use `getSceneVersion`, do not add per-post listeners, do not touch
> `getSlideRenderSignature`, PATCH-124, `node_modules` or `excalidraw_fork`.
> Restore everything; leave no candidate behind.

### 23h. Status

**PATCH-128: OPEN · GEOMETRY PIPELINE PROVEN · OPTION A GEOMETRY DESIGN
JUSTIFIED · PREVIOUS THUMBNAIL FAILURE CLASSIFIED AS TEST FALSE FAILURE ·
METADATA PATH UNRESOLVED · FULL IMPLEMENTATION BLOCKED.**
Classification **E** (§23a). Geometry chain proven end to end (§23b). Native and
resize coverage required but non-blocking (§23d). Metadata is now the **only**
unresolved invalidation class. Allowlist **LOCKED**.

**PATCH-124 unchanged and correct. `getSlideRenderSignature` unchanged.
PATCH-115 untouched.**
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated.** Added: **thumbnail assertions must re-query sidebar
images by stable slide identity at assertion time** — the §22 false failure cost
a full diagnostic cycle. Retained: the `DrawingLayout.tsx:408` revision-contract
violation, now measured **and** its repair proven through the full pipeline —
valuable independently of PATCH-128 because Excalidraw's reconcile conflict
ordering depends on those fields; propagation into React is nondeterministic
(§19c); the split-brain `frames` memo (§17c); `getSceneVersion` blind to
metadata-only changes (§17e); plus the upstream Excalidraw null-dereference, the
`unload` warning, the tsconfig-excluded fork, and the PATCH-123 §14k /
PATCH-124 §14l / PATCH-125 §13l ledgers with the unresolved production-build
failure.

---

## 24. Amendment — METADATA CLASSIFIED **C**; M2 SPIKE AUTHORIZED (2026-07-31, CTO)

The authorized metadata diagnostic was executed and **fully restored**.

### 24a. Classification **C** — stale at frames-memo invalidation

Post metadata **reaches** current application state and `paddletsRef`, but **the
frames memo does not recompute**, because its dependencies remain
element/canvas-line driven. The slide therefore keeps an old `renderSignature`
and cache key even though the renderer can read the latest post data at render
time.

**Measured, real `CardEditor` title edit** ("Metadata Before Title" → "Metadata
After Title"), geometry-neutral: `x=760`, `y=120`, `320×220`, `angle=0`,
`version=1`, `versionNonce=1`, `updated=1785521172923` — **all unchanged.**

| | before | after |
|---|---|---|
| padlet object identity | 7 | **13** |
| padlets array identity | 6 | **12** |
| React scene version | 3 | **3 (stale)** |
| slide signature digest | `5e04fbf` | **`5e04fbf` (stale)** |

**The Excalidraw element is not the appropriate metadata revision source.** The
live `getSceneVersion` moving to 5 during surrounding activity is **not** evidence
that metadata is encoded in revision fields — the target element's geometry and
revision fields were unchanged and the React scene revision stayed stale.
Recorded so no later reader misreads that number.

### 24b. The renderer split — the defect is purely upstream

After the edit, the thumbnail **cache-key input** still serialized
`title: "Metadata Before Title"` at digest `5e04fbf`, while
`createSlideRenderer` read `paddletsRef` and resolved
`title: "Metadata After Title"`.

**The renderer is fully capable of drawing current metadata. The stale layer is
slide derivation/signature invalidation, and nothing downstream of it.**

This also explains the reported product behaviour for metadata exactly as §2 did
for geometry: **an unrelated later refresh renders the current metadata**, because
the renderer was never the problem. Two invalidation classes, one shared
symptom — and one shared cause shape: **a memo that cannot see what changed.**

**`getSlideRenderSignature` remains unchanged** — it already consumes
`buildPadletRenderState` and includes the relevant post state *when invoked*; it
is simply never re-invoked. **PATCH-124 remains unchanged** — it correctly reacts
to changed signatures; the signature was never recalculated upstream. That is the
**sixth** diagnostic confirming PATCH-124.

### 24c. Persistence finding — `updated_at` is not a client trigger

The database `updated_at` advanced (`18:06:13.13179Z → 18:06:19.316Z`), but **the
local optimistic post object retained the old value.** Under the current
optimistic update path, **`updated_at` alone is not a reliable immediate
client-side invalidation trigger** — the visible content changes before the field
does. This is precisely why **M1 is insufficient**.

### 24d. Post-type census — one canonical helper, no per-type work

`buildPadletRenderState` already provides the canonical deterministic render
state for **all** supported app-owned post forms — Card, Note, Image, Clipart,
Todo, Link, Container, AI/import variants — covering title, content, media URLs
and dimensions, `updated_at`, card colour, caption data, link data, todo/task
state, child/container state, import/AI state, and recursively visible children
to the existing **bounded** depth.

**No separate metadata listener or signature per post type**, consistent with §5.

### 24e. Option ranking — names preserved

- **M1 — existing `updated_at`/version/revision: NOT SUFFICIENT ALONE** (§24c).
- **M2 — deterministic post-render revision derived from
  `buildPadletRenderState`: LEADING.** Uses the same canonical inputs
  `getSlideRenderSignature` already consumes, **without changing that function**.
- **M3 — existing centralized post-store revision/event: SECONDARY.** No suitable
  proven stable centralized revision has been identified; viable only if source
  finds one that changes for **every** render-relevant edit without becoming a
  second authority.
- **M4 — raw padlets array/object identity: REJECTED** as the permanent trigger.
  Identity changed on this edit (6→12, 7→13) but changes broadly and on unrelated
  parent renders; it encodes **object allocation, not visible content**, and
  would make the frames memo noisy.

**Also explicitly rejected: incrementing Excalidraw `version`/`versionNonce`/
`updated` for metadata-only edits.** Those fields belong to Excalidraw element
mutation, collaboration and reconciliation semantics. Borrowing them for post
metadata would corrupt reconcile ordering — the very contract PATCH-128's
geometry half exists to *restore*.

### 24f. M2 spike — AUTHORIZED, temporary

Derive **one** deterministic post-render revision from canonical
`buildPadletRenderState` output and use it as an upstream dependency/invalidation
input for the frames memo.

**Must not:** add raw `padlets` as a memo dependency; mutate Excalidraw revision
fields; modify `getSlideRenderSignature`; duplicate the full slide signature; add
per-post listeners; add polling; add another thumbnail scheduler; alter
PATCH-124.

**Preferred temporary design:** derive a stable revision over render-relevant
post state only; **reuse `buildPadletRenderState`** or an existing canonical
helper rather than maintaining a parallel field list; deterministic ordering by
stable post ID; **no raw JSON serialization of the unbounded application graph**;
respect the existing **bounded** child/container depth; include only fields that
can affect presentation or thumbnails; use the revision to make the frames memo
recompute on visible content change; let `getSlideRenderSignature` run
**unchanged** to produce new per-slide signatures; and let **PATCH-124** compare
them and render only affected slides.

The last two clauses are the point of M2: **it adds a trigger, not a second
signature.** Duplicating field semantics is a hard stop precisely because two
field lists will drift.

### 24g. Performance

A naïve global revision may recompute the frames memo when a post **outside all
slides** changes. **Acceptable for the temporary spike only if PATCH-124 proves
unchanged slide keys do not render.** The permanent design should evaluate
whether the revision can be **scoped or cheaply computed** without creating
duplicate membership logic — noting that scoping by membership risks exactly the
second membership algorithm §4 forbids, so cheapness is likely the safer axis.

**Record:** `DrawingLayout` render count; metadata revision computation count;
frames memo recomputation count; number of slide signatures that change;
thumbnail renders **per slide**; effect of unrelated parent rerenders; effect of
editing a post outside every slide.

### 24h. Scenarios

**A — inside-slide title edit** via real UI: no geometry mutation; revision
changes; memo recomputes; signature/cache key changes; presentation shows the new
title; **thumbnail automatically shows it**; no manual refresh.
**B — inside-slide non-text edit** (card colour, image/icon, or todo completion):
same chain.
**C — outside-slide edit:** the memo may recompute, but **no slide
`renderSignature` changes** and **PATCH-124 schedules no render**.
**D — unrelated parent rerender** (selection or other UI): revision **stable**;
no signature change; no thumbnail render.
**E — container/child case** where practical: edit a visible child/container
field already covered by the bounded recursion; prove the containing slide
invalidates.

### 24i. Assertion quality — bind

**Use stable slide IDs and re-query thumbnail DOM nodes at assertion time.** The
§23a false failure cost a full cycle; captured or ambiguous nodes are not
acceptable.

Prove: old and new signature/cache-key digests; renderer input metadata;
generated PNG/data-URL change; **actual displayed thumbnail change**; and
presentation DOM/composition change. **Do not pass merely because the frames memo
or a callback ran** — the recurring trap of this patch, in its third costume.

### 24j. Geometry integration — two distinct triggers, one pipeline

**The metadata spike must not re-diagnose geometry.** The final design is
expected to carry **two distinct upstream triggers** feeding the **existing**
frame/signature/PATCH-124 pipeline:

1. **geometry** — repair the custom app-owned move writer's revision fields, plus
   settled `getSceneVersion`-based React propagation;
2. **metadata** — a deterministic post-render revision from canonical post render
   state.

**Do not merge the trigger concepts, and do not use Excalidraw revision fields for
post metadata** (§24e).

### 24k. Allowlist and hard stops

**The permanent production allowlist stays LOCKED.** The spike may temporarily
touch only the narrow files needed to derive and observe the candidate revision.
**No permanent implementation is authorized.**

**Stop and restore if:** the revision changes on every unrelated parent render;
raw array/object identity enters the revision; the revision requires modifying
`getSlideRenderSignature`; the implementation duplicates `buildPadletRenderState`
field semantics; frames recompute recursively or continuously; thumbnails render
for unchanged slides; container recursion becomes unbounded; PATCH-124 or
PATCH-115 must change; protected paths change; or **anything becomes staged**.

### 24l. Next GPT-5.5 instruction (bind)

> **Run the M2 metadata spike only. Temporary. Do not implement the patch.**
>
> Derive one deterministic post-render revision from canonical
> `buildPadletRenderState` output, ordered by stable post ID, bounded at the
> existing child depth, and use it as an upstream input to the frames memo.
> **Reuse the canonical helper — do not restate its field list.**
>
> Prove scenarios A–E with stable slide IDs and **DOM re-queried at assertion
> time**. Record every §24g counter, especially the outside-slide and
> unrelated-rerender cases — those decide whether M2 is *safe*, not just
> effective.
>
> Do not re-diagnose geometry, mutate Excalidraw revision fields, add raw
> `padlets` as a dependency, or touch `getSlideRenderSignature`, PATCH-124,
> `node_modules` or `excalidraw_fork`. Restore everything; leave no candidate
> behind and nothing staged.

### 24m. Status

**PATCH-128: OPEN · GEOMETRY PIPELINE PROVEN · OPTION A GEOMETRY DESIGN
JUSTIFIED · METADATA FAILURE CLASSIFIED AT FRAMES-MEMO INVALIDATION · M2
METADATA SPIKE AUTHORIZED · FULL IMPLEMENTATION BLOCKED.**

Both invalidation classes are now **localized to the same layer**: the frames
memo cannot see either geometry revisions (pre-Option A) or post-render state.
**M2 leading · M1 insufficient · M3 secondary · M4 rejected.** Allowlist
**LOCKED**.

**PATCH-124 unchanged and correct (sixth confirmation). `getSlideRenderSignature`
unchanged. PATCH-115 untouched.**
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated.** Added: **`updated_at` is not a reliable client-side
invalidation trigger under the optimistic update path** (§24c) — visible content
changes before the field does, which will mislead any future cache keyed on it.
Retained: thumbnail assertions must re-query by stable slide identity (§23a); the
`DrawingLayout.tsx:408` revision-contract violation, measured and its repair
proven, valuable independently because reconcile ordering depends on those
fields; nondeterministic React propagation (§19c); the split-brain `frames` memo
(§17c); `getSceneVersion` blind to metadata-only changes (§17e); plus the
upstream Excalidraw null-dereference, the `unload` warning, the
tsconfig-excluded fork, and the PATCH-123 §14k / PATCH-124 §14l / PATCH-125 §13l
ledgers with the unresolved production-build failure.

---

## 25. Amendment — M2 METADATA DESIGN JUSTIFIED; FINAL ACCEPTANCE MATRIX REQUIRED (2026-07-31, CTO)

The authorized M2 metadata spike was executed and **fully restored**.

**M2 is technically validated as the canonical metadata invalidation design. The
complete acceptance matrix was not executed. Permanent implementation remains
blocked and the production allowlist remains LOCKED.**

### 25a. What M2 proved

A deterministic revision derived from canonical `buildPadletRenderState` drove the
entire chain:

```
metadata edit → metadata revision change → frames memo recomputation
  → unchanged getSlideRenderSignature producing a NEW signature
    → new thumbnail cache key → PATCH-124 render
      → updated installed and displayed thumbnail
```

**`getSlideRenderSignature` was not modified and did not need to be.** It produced
a new signature purely because it was finally re-invoked — exactly the §24b
prediction. **PATCH-124 was not modified and scheduled correctly.** That is the
**seventh** consecutive diagnostic confirming PATCH-124.

### 25b. The temporary design that was tested

1. sort top-level padlets by **stable ID**;
2. map each through the **existing** `buildPadletRenderState`;
3. retain the **existing bounded recursion depth**;
4. serialize only the canonical render state;
5. hash the deterministic result with a lightweight djb2 digest.

**No render-field list was duplicated.** A temporary `export` of
`buildPadletRenderState` — visibility only, zero semantic change — was added
solely to reuse the canonical implementation, and was fully restored.

The revision was added as a **third** dependency to the frames memo, beside
`elements` and `canvasLines`. **Additive only; nothing was replaced.**

### 25c. Determinism gate — nine properties PASSED

- identical render state → same revision;
- fresh **array** identity, identical state → same revision;
- fresh **object** identity, identical state → same revision;
- ordering differences → same revision;
- title change → different revision;
- card-colour change → different revision;
- todo-completion change → different revision;
- array rewrapping alone → same revision;
- a visible **child** field change → detected through bounded recursion.

**This confirms the revision encodes visible render state rather than object
allocation** — the precise property §24e rejected M4 for lacking.

### 25d. Scenario A — real inside-slide title edit — **PASS**

Real `CardEditor` title edit through the real UI, save-on-close, **no geometry
mutation, no manual refresh**.

| | before | after |
|---|---|---|
| thumbnail digest | `708667857` | **`3099288761`** |
| non-white pixels | 535 | **934** |
| revision computation count | 4 | **6** |
| frames memo recomputation count | 4 | **6** |

The sidebar thumbnail was **re-queried by stable slide title at assertion time**,
per §24i. **This is real evidence that M2 repairs the metadata invalidation path
for a text edit.**

### 25e. Scenarios C and D — LIMITED EVIDENCE, not passes

The slide thumbnail remained stable after an attempted outside-slide edit and
after an unrelated click/escape. **But the metadata revision and frames-memo
counters also remained unchanged** — so stability was not demonstrably *caused* by
the mechanism under test.

**Scenario C:** the outside post was edited by **direct Supabase write** while
placed off-canvas. The diagnostic did **not** prove the updated value reached the
client's local `padlets` state. It therefore does not prove that local state
changed, that the global revision changed, or that PATCH-124 filtered unchanged
slides.

**Scenario D:** the operation produced **no `padlets` identity change**, so
revision stability during a genuine identity-churning, content-equivalent rerender
remains undemonstrated live.

The §25c unit properties support both expected behaviours. **Live acceptance
remains required.** A stable output with a flat counter is an *absence of
evidence*, not evidence of correct filtering — the §23a lesson in a new costume.

### 25f. Scenarios B and E — NOT EXECUTED

Unproven: geometry-neutral **non-text** metadata edit; visible **container/child**
metadata edit.

**Do not infer acceptance from the unit tests alone.** §25c proves the revision
*detects* colour, todo and child changes; it does not prove the real UI edit
reaches local client state and drives the displayed output.

### 25g. M2 status

**M2 is the leading permanent design.** It is deterministic; independent of array
and object identity; generic across post types; aligned with canonical
`buildPadletRenderState` semantics; bounded by the existing recursion depth;
suitable for a pure helper; and capable of driving the existing
frames/signature/PATCH-124 pipeline.

**M2 is not yet fully accepted**, because required real-browser coverage remains
incomplete.

**M1 insufficient (§24c) · M3 secondary · M4 rejected (§24e).** Unchanged.

### 25h. Performance status

At diagnostic scale the global computation was **cheap enough and produced no
loop**. **Production-scale cost was not load-tested.**

The permanent design **may use a global deterministic revision** rather than
creating a second slide-membership algorithm. **Optimise for cheap canonical
computation before attempting membership scoping** — scoping by membership risks
exactly the second membership algorithm §4 forbids, as §24g anticipated.

**Do not add raw `padlets` identity as a dependency.**

### 25i. Final design candidate — two triggers, one pipeline

**GEOMETRY**

1. **Repair** the custom `DrawingEmbeddableCard` move writer to follow the
   repository's established Excalidraw revision convention: `version + 1`, new
   `versionNonce`, `updated` timestamp.
2. **Add settled `getSceneVersion`-based React propagation** beside the immediate
   count/frame-name gate: retain the latest scene snapshot; debounce rapid
   changes; propagate the latest revision **once** after settlement; **no
   `setElements` per pointer frame**.

**METADATA**

3. **Add a deterministic post-render revision**: derived from canonical
   `buildPadletRenderState`; stable-ID ordering; existing bounded child recursion;
   independent of object identity; used as an **upstream frames-memo dependency**.

**DOWNSTREAM — leave unchanged**

4. `resolveFrameMembership`; `getSlideRenderSignature`; the PATCH-124 scheduler;
   the renderer; presentation composition rules.

**Two distinct triggers feeding one existing pipeline. Do not merge the trigger
concepts** (§24j).

### 25j. Required final acceptance matrix — A–G

**Authorize one final temporary acceptance run before unlocking production
implementation.**

**A — NON-TEXT METADATA.** A real UI edit that visibly changes rendering, does
**not** change geometry, and reaches local client state. Preferred: card colour;
todo completion; image/icon. Prove: revision changes; frames memo recomputes;
signature/cache key changes; presentation **and actual thumbnail** update.

**B — CONTAINER/CHILD.** A real UI child edit inside a slide-visible container.
Prove: the child update reaches local client state; the bounded canonical revision
changes; the containing slide signature changes; presentation and thumbnail
update; **unrelated slides do not render**.

**C — OUTSIDE-SLIDE EDIT.** Use the **real application UI** on a post outside
every slide. **First** prove local `padlets` state receives the edit and the
revision changes. **Then** prove no slide signature changes and PATCH-124
schedules **no** thumbnail render. The first half is mandatory — §25e failed
precisely by omitting it.

**D — IDENTITY-CHURN CONTROL.** Produce a **genuine fresh** `padlets`
array/object allocation with equivalent canonical render content. Prove: raw
identities change; the deterministic revision remains **stable**; the frames memo
does **not** recompute because of the metadata dependency; no slide render occurs.

**E — NATIVE CROSS-SLIDE GEOMETRY.** A **real pointer drag**. Determine membership
with authoritative **`resolveFrameMembership`**, not `frameId` alone (§22g). Prove
old/new presentation membership and **both** thumbnails update.

**F — APP-OWNED RESIZE.** **First** prove the real resize handle receives
pointerdown and width/height change live (§22h). **Then** prove React geometry,
presentation, signature and thumbnail update.

**G — PERFORMANCE.** A representative larger board. Record: padlet count;
revision computation duration; `DrawingLayout` render count; frames memo count;
thumbnail render count; interaction responsiveness. **Derive a bounded acceptance
threshold from current project performance conventions rather than inventing an
arbitrary limit.**

### 25k. Production allowlist — LOCKED

**Keep locked until A–G pass, or until Opus explicitly accepts a documented
limitation.**

The **provisional** final allowlist may include:

**Production**
- `components/collabboard/canvas/layouts/DrawingLayout.tsx`
- `lib/infra/drawing/postRenderRevision.ts` or an equivalently named pure helper
- the existing module containing `buildPadletRenderState`, **only** for an export
  with **no semantic change**
- a pure settled-scene propagation helper **only if** extraction is justified

**Tests**
- unit tests for the deterministic post-render revision
- browser characterization for geometry and metadata synchronization

**Do not authorize exact paths until the final acceptance run confirms no
additional production dependency is required.**

### 25l. Boundaries — bind

- No raw `padlets` dependency.
- No metadata writes to Excalidraw revision fields.
- No duplicate render-field list.
- No second membership algorithm.
- No PATCH-115 change. No PATCH-124 change. No PATCH-127 work.
- No protected-path changes. No `node_modules` or `excalidraw_fork` changes.

### 25m. Next GPT-5.5 instruction (bind)

> **Run the final acceptance matrix A–G only. Temporary. Do not implement the
> patch.**
>
> Reintroduce the §25b M2 revision and the §25i geometry repair **as scaffolding**
> to reach known-good state. Then prove **A–G** with stable slide IDs and **DOM
> re-queried at assertion time**.
>
> For **C**, prove the edit reaches local client state *before* asserting that
> nothing rendered. For **D**, produce a genuine fresh allocation *before*
> asserting stability. **A stable output with a flat counter is not a pass** — it
> is the §25e failure repeated.
>
> If a scenario has no reliable real UI path, **report it unproven. Do not
> simulate a pass.**
>
> Do not add raw `padlets` as a dependency, mutate Excalidraw revision fields for
> metadata, duplicate `buildPadletRenderState` field semantics, or touch
> `getSlideRenderSignature`, PATCH-124, PATCH-115, `node_modules` or
> `excalidraw_fork`. Restore everything; leave no candidate behind and nothing
> staged.

### 25n. Status

**PATCH-128: OPEN · GEOMETRY DESIGN JUSTIFIED · M2 METADATA DESIGN JUSTIFIED ·
FINAL ACCEPTANCE MATRIX REQUIRED · PRODUCTION ALLOWLIST LOCKED · FULL
IMPLEMENTATION BLOCKED.**

Both invalidation classes now have a **technically justified** upstream trigger,
and both feed the **existing, unmodified** frames/signature/PATCH-124 pipeline.
What remains is **acceptance coverage, not design**.

**PATCH-124 unchanged and correct (seventh confirmation). `getSlideRenderSignature`
unchanged. PATCH-115 untouched.**
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated.** Added: **a passing assertion with an unchanged
instrumentation counter proves absence of input, not correct filtering** (§25e) —
the third distinct form of the false-green trap in this patch, after §22's implied
defect and §23a's false failure. Retained: `updated_at` is not a reliable
client-side invalidation trigger under the optimistic update path (§24c);
thumbnail assertions must re-query by stable slide identity (§23a); the
`DrawingLayout.tsx:408` revision-contract violation, measured and its repair
proven, valuable independently because reconcile ordering depends on those fields;
nondeterministic React propagation (§19c); the split-brain `frames` memo (§17c);
`getSceneVersion` blind to metadata-only changes (§17e); plus the upstream
Excalidraw null-dereference, the `unload` warning, the tsconfig-excluded fork, and
the PATCH-123 §14k / PATCH-124 §14l / PATCH-125 §13l ledgers with the unresolved
production-build failure.

---

## 26. Amendment — FINAL ACCEPTANCE MATRIX FAILED; NATIVE SETTLED-PROPAGATION FAILURE (2026-07-31, CTO)

The §25j A–G matrix was executed and **fully restored**. No implementation remains.

### 26a. Result — **FAIL**

The §25 pass standard required **all** of A–G. Observed:

| | scenario | result |
|---|---|---|
| A | non-text metadata edit | **PASS** |
| B | container/child | **UNPROVEN** |
| C | outside-slide edit | **PASS** |
| D | identity-churn control | **UNPROVEN** |
| E | native cross-slide move | **PARTIAL** |
| F | app-owned resize | **UNPROVEN** |
| G | performance | **UNPROVEN** |

**Production allowlist remains LOCKED. Full implementation remains BLOCKED.
PATCH-128 must not be authorized for production implementation. The geometry design
must no longer be described as fully accepted** (§26g).

### 26b. Scenario A — **PASS**

A real `TodoEditor` completion-state change through the application UI. Local state
arrival, revision change and memo recomputation were proven **before** any
downstream assertion, per §25j's ordering requirement.

| | before | after |
|---|---|---|
| thumbnail digest | `3712725325` | **`1816075446`** |
| revision computation count | 4 | **6** |
| frames memo recomputation count | 4 | **6** |
| x/y/width/height | 360,120,320,220 | **unchanged** |

Thumbnail re-queried by stable slide identity. No manual refresh.

**Side finding — do not conflate.** The app-owned element `version` moved 1 → 2
during the metadata edit. Traced to the **existing embeddable-content
synchronization effect keyed on `getPadletRenderSignature`** — *not* to the
temporary M2 mechanism. **This is not evidence that Excalidraw revision fields are
or should be the metadata trigger** (§24e stands).

### 26c. Scenario B — **UNPROVEN**

Source and UI inspection found **no reliable real render-relevant child-edit path in
`DrawingLayout` canvas mode.** Children rendered through
`RowColumnContainerCard`/`PostCardContent` do not receive the editable drawing
callback available in `FreeformPadletCards`. The only reliable child affordance
found writes `metadata.detachedComments`, which is **not** part of
`buildPadletRenderState`'s canonical visible-state fields and therefore cannot
exercise bounded render-state recursion.

**A real UI path was not executed. Do not infer acceptance from the §25c unit test
proving child-field determinism** — that proves the revision *would* detect the
change, not that the product delivers it.

### 26d. Scenario C — **PASS**

A real `TodoEditor` edit on a post outside all slide frames. Arrival proven first:
revision computation **6 → 8**, frames memo recomputation **6 → 8**. The tested
slide's thumbnail digest **remained `1816075446`**; no affected slide output
changed.

**This is the §25e gap closed.** It proves a **global** metadata revision may
recompute slide derivation while unchanged per-slide signatures still let PATCH-124
avoid unnecessary thumbnail output — the exact §24g performance concession the
permanent design depends on.

### 26e. Scenario D — **UNPROVEN**

A direct Supabase write to `position_x` was used to attempt identity churn without
changing canonical render state. Dedicated instrumentation recorded
`padletsIdentityChangeCount` **4 → 4 over 12 seconds**: the realtime update was
never proven to reach the browser's local padlet state.

**The stable thumbnail is therefore not acceptance evidence.**

**Rule, recorded:** *a stable output accompanied by a flat input-arrival counter
proves absence of input, not correct filtering.* §25e stated this; this run built
instrumentation specifically to detect it and **the instrumentation worked** —
catching what would otherwise have been the fourth false green of this patch.
Identity-only determinism remains supported by unit evidence and lacks live
acceptance.

### 26f. Scenario E — **PARTIAL, with a new real failure**

A real pointer drag moved a native Excalidraw rectangle from slide E1 to slide E2.

**Proven:** `x` 150 → 1500; element `version` 1 → 17; `getSceneVersion` 3 → 22;
authoritative `resolveFrameMembership` reported `slide-e2`. **Native geometry and
membership mutation succeeded** — closing the §22g/§23d gap that made the earlier
native attempt *inconclusive*.

**Not proven:** settled React propagation; frames memo recomputation; presentation
update; thumbnail update.

**NEW FAILURE — the settled propagation timer was scheduled repeatedly and never
fired.** Schedule counters reached **~288–303**; `settledSetElementsCount` remained
**absent/zero**; idle wait **4 seconds**; **zero** page errors; frames memo
recomputation **flat**; thumbnails **unchanged**.

**This is not a missing interaction.** §22g and §22h were classified inconclusive
precisely because the interaction never occurred. Here the drag and the membership
transition are *proven*. **The failure is in the temporary settled-propagation
mechanism itself, for native Excalidraw activity.**

### 26g. Geometry governance correction

**Proven:** repairing the app-owned drag writer's revision fields is effective;
`getSceneVersion` then reflects app-owned moves; settled propagation worked in the
earlier **app-owned** controlled case (§22a, §23b); history behaviour passed in that
same controlled case.

**Not proven:** that the same settled mechanism reliably completes after a **native**
Excalidraw drag.

**Revised geometry status:**

> **OPTION A WRITER REPAIR PROVEN · SETTLED PROPAGATION MECHANISM NOT GENERICALLY
> ACCEPTED.**

**Do not authorize the permanent settled-timer design until the native failure is
diagnosed.** §23b's "all eight arrows pass" was true **for the app-owned path only**;
generalizing it to native activity was unwarranted, and this amendment withdraws
that generalization.

### 26h. Required next diagnosis for E

Trace **why the timer is continually scheduled but never completes.** Inspect:

1. whether `onChange` continues firing after pointer release;
2. whether app-state-only changes keep resetting the timer;
3. whether selection, hover, collaborators, cursor state, scroll or viewport changes
   trigger the same `onChange` path;
4. whether the timer callback closes over stale revision/state;
5. whether effect cleanup repeatedly clears the timer;
6. whether `DrawingLayout` rerenders recreate or replace timer refs;
7. whether the callback runs but exits its revision comparison;
8. whether native and app-owned paths differ in post-release `onChange` traffic.

**Record timestamped:** last `pointerup`; every `onChange` after `pointerup`; timer
schedule/reset; timer clear source; timer callback entry; callback guard result;
final scene revision; last propagated revision; component render/effect cleanup
count.

**Do not redesign the mechanism before identifying which event prevents settlement.**

Then evaluate whether the correct **generic** signal is instead: `pointerup`/
interaction completion combined with the latest scene snapshot; Excalidraw
`appState` interaction flags; a **bounded maximum-wait** debounce; or another
supported committed-scene indication.

**Do not create separate native and app-owned synchronization systems unless source
evidence proves it unavoidable** — that would be §4's second-algorithm prohibition
in a new form.

### 26i. Scenario F — **UNPROVEN**

The diagnostic could not reliably target the real Excalidraw resize handle; live
width/height did not change. Per the §25j bound fallback this **cannot characterize
propagation or thumbnail behaviour. Do not mark pass or fail.**

A later test must first prove: the correct handle receives `pointerdown`; live
width/height change; `version`/`getSceneVersion` change. **Only then** may
downstream acceptance be evaluated. (§22h, unchanged and still owed.)

### 26j. Scenario G — **UNPROVEN**

A disposable board with **4 slides and 32 padlets** was created, but the test timed
out during setup/interaction before producing usable measurements.

**No conclusions may be drawn** about production-scale M2 cost, frames-memo
frequency, drag responsiveness, thumbnail render filtering, or timer behaviour under
larger load.

### 26k. History, reconcile, PATCH-124

**History/reconcile was not independently rerun in this matrix.** The earlier Option
A evidence stands — pointermove non-history updates, one undo restores, redo
restores, no per-frame undo entries — but **must not be treated as covering the newly
observed native settled-timer failure** (§26f).

**No PATCH-124 defect was found.** A and C were consistent with changed per-slide
signatures causing output refresh and unchanged signatures avoiding it. **The E
failure occurred upstream of frames/signature/cache-key invalidation.** PATCH-124
remains unchanged — the **eighth** consecutive confirmation.

### 26l. M2 status

**M2 remains the justified metadata architecture.** Real evidence now covers **text
metadata** (§25d), **non-text todo metadata** (§26b) and **outside-slide filtering**
(§26d).

Still unproven live: container/child recursion; identity-only allocation churn;
representative-board performance.

**Do not revoke M2 on those gaps — and do not mark complete acceptance either.**

### 26m. Next action — bind

**Authorize only a focused native settled-propagation diagnostic (§26h).**

**Do not repeat A, C, or the thumbnail renderer trace. Do not begin production
implementation.**

After E resolves, remaining acceptance debt is **B** (container/child real UI path),
**D** (live identity-churn control), **F** (real app-owned resize), **G**
(representative performance run).

Opus may later decide whether B, D, F or G can be accepted as **documented
limitations**. **No such waiver is authorized in this amendment.**

### 26n. Boundaries — bind

- Do not alter PATCH-124. Do not alter `getSlideRenderSignature`.
- Do not use raw `padlets` identity. Do not use Excalidraw revisions as the metadata
  trigger.
- Do not create per-post listeners. Do not introduce polling.
- Do not create separate native and app-owned scene stores.
- Do not resume PATCH-127. Do not touch protected paths.
- Do not modify `node_modules` or `excalidraw_fork`.

### 26o. Next GPT-5.5 instruction (bind)

> **Run the native settled-propagation diagnostic only. Do not fix, redesign, or
> implement.**
>
> Reproduce §26f: a real pointer drag of a **native** Excalidraw element across
> slides. The drag and membership transition are already proven — **do not
> re-litigate them.** Answer the eight §26h questions and produce the timestamped
> record §26h requires.
>
> **Report which event prevents settlement.** Stop there. Do not propose or build a
> replacement signal in the same pass — §26h lists candidates for a *later*
> decision, not for this diagnostic.
>
> Do not repeat scenarios A or C, retrace the thumbnail renderer, alter PATCH-124 or
> `getSlideRenderSignature`, cross PATCH-115, or touch `node_modules` or
> `excalidraw_fork`. Restore everything; leave nothing staged.

### 26p. Status

**PATCH-128: OPEN · OPTION A APP-OWNED WRITER REPAIR PROVEN · SETTLED GEOMETRY
PROPAGATION FAILS NATIVE ACCEPTANCE · M2 METADATA DESIGN JUSTIFIED BUT ACCEPTANCE
INCOMPLETE · FINAL MATRIX FAILED · PRODUCTION ALLOWLIST LOCKED · FULL IMPLEMENTATION
BLOCKED.**

The metadata half advanced (A, C pass). The geometry half **regressed in confidence**:
a mechanism previously believed proven is now known to fail for native activity.
**That is the correct outcome of an acceptance matrix — it found something.**

**PATCH-124 unchanged and correct (eighth confirmation). `getSlideRenderSignature`
unchanged. PATCH-115 untouched.**
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated.** Added: **the settled-propagation timer is scheduled but
never fires after a native Excalidraw drag** (§26f) — the first *mechanism* defect
this patch has found in its own candidate rather than in the existing product; and
**a proven-for-one-path mechanism must not be described as proven generally**
(§26g). Retained: a stable output with a flat input-arrival counter proves absence of
input, not correct filtering (§25e, re-confirmed by §26e); `updated_at` is not a
reliable client-side invalidation trigger under the optimistic update path (§24c);
thumbnail assertions must re-query by stable slide identity (§23a); the
`DrawingLayout.tsx:408` revision-contract violation, measured and its repair proven
for the app-owned path; nondeterministic React propagation (§19c); the split-brain
`frames` memo (§17c); `getSceneVersion` blind to metadata-only changes (§17e); plus
the upstream Excalidraw null-dereference, the `unload` warning, the tsconfig-excluded
fork, and the PATCH-123 §14k / PATCH-124 §14l / PATCH-125 §13l ledgers with the
unresolved production-build failure.

---

## 27. Amendment — DEBOUNCE GENERICALLY DEFECTIVE; TWO-REF SPIKE AUTHORIZED (2026-08-01, CTO)

The §26h focused diagnostic was executed and **fully restored**. No implementation
remains.

### 27a. Primary result — the defect is **not** native-specific

The temporary settled-propagation mechanism **fails identically for both** a native
Excalidraw drag and an app-owned `DrawingEmbeddableCard` drag. In both controls:
scene changes are observed; timer scheduling occurs repeatedly; **timer callback
entry count remains zero**; settlement never completes; the same endless reschedule
pattern occurs.

| after `pointerup`, 4.5 s traced | native | app-owned |
|---|---|---|
| `onChange` calls | 266 | 272 |
| of those, real scene-version changes | **1** | **2** |
| of those, any appState field changed | 1 (`cursorButton`, t=9 ms) | **0** |
| timer scheduled / cleared | 266 / 266 | 272 / 272 |
| **timer callback entered** | **0** | **0** |
| settled `setElements` calls | **0** | **0** |
| effect cleanups | 0 | 0 |

Last recorded event at **t=4525 ms**: `onChange (sceneVersionChanged:false,
changedAppKeys:[]) → timerCleared → timerScheduled`. Still rescheduling, 4.5 seconds
after the interaction ended.

### 27b. Correction to §26g and §23b — **conflict recorded, evidence not erased**

§26g characterized this as a **native** acceptance problem while retaining the
earlier app-owned settled-propagation result. **The new diagnostic contradicts that
framing.** Amend the record to state:

- **the current candidate debounce implementation is generically defective;**
- **native and app-owned drags are affected equally;**
- **the earlier app-owned "one settled `setElements` call" result (§22a) is not
  reconciled with the mechanism reintroduced in §25/§26;**
- **either the earlier spike used materially different temporary code, or its
  measurement requires re-examination;**
- **until reconciled, do not cite the earlier app-owned settled-call result as proof
  that this debounce mechanism works.**

**Do not erase the earlier evidence. It is marked CONFLICTING and UNRESOLVED.**

This is the correct handling: §22a's `settled setElements calls: 1` was recorded as
measured fact and remains in the record. What is withdrawn is the *inference* that
the mechanism works. Two measurements disagree; the patch says so plainly rather
than quietly preferring the newer one.

### 27c. Root cause — one ref carrying two meanings

The temporary implementation uses **one revision ref for two separate meanings**:

1. last scene revision **observed** by `onChange`;
2. last scene revision successfully **propagated** after settlement.

During `onChange` the ref is updated immediately to the newly observed revision, the
timer is scheduled, and later `onChange` calls compare against that same
already-updated ref — so the scheduling/guard logic continually resets or invalidates
settlement and **the callback never becomes the event that advances a distinct
settled revision.**

**The implementation loses the distinction between observed, pending and settled.**

**This is a candidate-mechanism bug. It is not an Excalidraw bug and not a PATCH-124
issue.** PATCH-124 remains unchanged — the **ninth** consecutive confirmation.

### 27d. Timer failure classification — **T1**

Per the §26h T1–T7 scheme the execution report returned **T1 — timer continuously
reset by post-release `onChange` traffic**, with the §27c bookkeeping error as the
mechanism behind it.

**Ruled out by direct evidence, not by assumption:**

- **T2 / T5** (effect cleanup clearing the timer; ref replaced across renders) —
  `effectCleanupCountAfterUp: 0` with stable render counts.
- **T3 / T4** (callback runs but exits a guard; callback throws or is cancelled) —
  `callbackEnteredCountAfterUp: 0`. **The callback body never executes, so it cannot
  be exiting on a guard.** §26h required callback entry to be instrumented
  *separately* from `setElements` precisely so this could be distinguished; it was,
  and it was.
- **T6** (event-loop starvation) — the ~15–20 ms `onChange` cadence is steady and
  consistent with a normal render loop, not a blocked thread.

### 27e. Genericity finding — separate mechanisms **REJECTED**

Both paths fail under the same temporary debounce. **Separate native and app-owned
propagation systems are rejected. One shared corrected mechanism should be
evaluated.**

**Do not introduce:** one native listener; one app-owned listener; per-object-type
commit paths; a second scene store. (§4, §24j and §26h all forbid this; the evidence
now removes the only argument that could have justified it.)

### 27f. Candidate correction — narrow two-ref model

Evidence-supported contract:

1. `onChange` stores the **latest elements snapshot**;
2. `onChange` records the **latest observed** scene version;
3. scheduling compares **latest observed** against **last settled**;
4. the timer callback propagates the latest snapshot;
5. **only after successful propagation** does it advance **last settled**;
6. later no-op `onChange` traffic **must not erase the pending difference**;
7. **latest snapshot wins.**

**Evidence-supported, not authorized as production implementation. Do not combine
observed and settled state in one ref.**

### 27g. Continuous `onChange` traffic — an independent finding

The diagnostic confirms **post-interaction/no-op `onChange` traffic continues
indefinitely** — ~266–272 calls in 4.5 idle seconds, of which only 1–2 carried a real
scene-version change and essentially none carried an appState change.

**Therefore a pure trailing debounce may remain vulnerable even after the two-ref
fix.** Evaluate in the next spike: whether the two-ref fix **alone** allows
settlement; whether continuous `onChange` calls with unchanged scene revision still
reset the timer; whether timer reset should occur **only when scene revision
changes**; whether a bounded maximum-wait is required as a safety net.

**Do not authorize maximum-wait yet. Measure first.**

This finding is valuable independently of PATCH-128: any future work that debounces
on Excalidraw `onChange` will hit it.

### 27h. Candidate signal assessment

- **Pointerup / interaction-end signal** — **supported** as a real singular
  interaction boundary; **not selected** as the primary architecture; may be
  considered as a fallback or flush signal.
- **Bounded maximum-wait debounce** — **supported** as a possible safety net,
  because continuous no-op traffic is now proven; **not authorized.**
- **AppState interaction-flag gating** — **weakened.** Post-release `changedAppKeys`
  exposed no reliable generic flag beyond early cursor-button state.
- **Separate native/app-owned signals** — **REJECTED** (§27e).

### 27i. Next authorized action — one narrow two-ref debounce spike

The spike **must**:

1. use the same real **native and app-owned** drag fixtures;
2. change **only the revision bookkeeping** — separate last observed revision,
   separate last settled revision;
3. preserve **one** latest elements snapshot;
4. preserve **one** timer;
5. reset the timer **only when the observed scene revision actually changes**;
6. record **callback entry independently from `setElements`**;
7. prove whether **one** settled propagation completes after each drag;
8. prove whether continuous unchanged-revision `onChange` traffic prevents
   completion;
9. **stop before adding pointerup flushing or maximum-wait logic.**

**Required evidence for both drag types:** `onChange` count; scene-revision-change
count; timer schedules; timer resets; **callback entries**; settled `setElements`
calls; last observed revision; last settled revision; React geometry after
settlement; frames memo recomputation.

**The first spike question is only:** *does separating observed and settled revision
state make the existing debounce complete for both paths?* If **yes**, then decide
whether no-op traffic still requires maximum-wait or pointerup flushing. If **no**,
identify the next exact blocker.

**Do not rerun:** M2 metadata acceptance; PATCH-124 traces; thumbnail pixel tests;
the A–G matrix; resize or container scenarios.

### 27j. Boundaries — bind

- Do not alter PATCH-124. Do not alter `getSlideRenderSignature`. Do not modify M2 in
  this diagnostic.
- Do not implement pointerup flushing yet. Do not implement maximum-wait yet.
- Do not create separate native/app-owned mechanisms.
- Do not resume PATCH-127. Do not touch protected paths.
- Do not modify `node_modules` or `excalidraw_fork`.

### 27k. Next GPT-5.5 instruction (bind)

> **Run the two-ref debounce spike only. Temporary. Do not implement the patch.**
>
> Change **only** the revision bookkeeping (§27f): separate `lastObservedSceneVersion`
> from `lastSettledSceneVersion`, one snapshot, one timer, reset **only** when the
> observed revision actually changes, and advance the settled revision **only after**
> propagation succeeds.
>
> Run the **same** real native **and** app-owned drag fixtures. Instrument **callback
> entry separately from `setElements`** — §27d turned on exactly that distinction.
>
> Answer one question: **does the two-ref separation make the debounce complete for
> both paths?** Then stop. **Do not add pointerup flushing or maximum-wait in this
> pass** — §27g lists them as *later* decisions contingent on what this spike
> measures.
>
> Do not rerun M2 acceptance, PATCH-124 traces, thumbnail pixel tests, the A–G matrix,
> or resize/container scenarios. Do not create separate native/app-owned mechanisms,
> alter `getSlideRenderSignature`, cross PATCH-115, or touch `node_modules` or
> `excalidraw_fork`. Restore everything; leave nothing staged.

### 27l. Status

**PATCH-128: OPEN · OPTION A WRITER REPAIR PROVEN · CURRENT SETTLED DEBOUNCE
GENERICALLY DEFECTIVE · EARLIER APP-OWNED SETTLED-CALL EVIDENCE UNRECONCILED ·
TWO-REF DEBOUNCE SPIKE AUTHORIZED · M2 METADATA DESIGN JUSTIFIED BUT ACCEPTANCE
INCOMPLETE · PRODUCTION ALLOWLIST LOCKED · FULL IMPLEMENTATION BLOCKED.**

The failure is now **localized to a single bookkeeping error in the patch's own
candidate** — the cheapest possible place for a defect to live, and the first one
this patch has found in its own proposal rather than in the existing product.

**PATCH-124 unchanged and correct (ninth confirmation). `getSlideRenderSignature`
unchanged. PATCH-115 untouched.**
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated.** Added: **Excalidraw `onChange` fires continuously at rest
(~15–20 ms) with no scene or appState change** (§27g) — any future debounce on that
callback must assume this; **one ref must never carry both "observed" and "settled"
meanings** (§27c); and **§22a's app-owned settled-call result conflicts with §27a and
is unreconciled** (§27b). Retained: a stable output with a flat input-arrival counter
proves absence of input, not correct filtering (§25e, §26e); a mechanism proven for
one path must not be described as proven generally (§26g); `updated_at` is not a
reliable client-side invalidation trigger under the optimistic update path (§24c);
thumbnail assertions must re-query by stable slide identity (§23a); the
`DrawingLayout.tsx:408` revision-contract violation, measured and its repair proven
for the writer itself; nondeterministic React propagation (§19c); the split-brain
`frames` memo (§17c); `getSceneVersion` blind to metadata-only changes (§17e); plus
the upstream Excalidraw null-dereference, the `unload` warning, the tsconfig-excluded
fork, and the PATCH-123 §14k / PATCH-124 §14l / PATCH-125 §13l ledgers with the
unresolved production-build failure.

---

## 28. Amendment — TWO-REF SETTLED PROPAGATION PROVEN; CONFLICT RECONCILED (2026-08-01, CTO)

The §27i two-ref debounce spike was executed and **fully restored**. No
implementation remains.

### 28a. Result — **PASS** for both required scenarios

**Native Excalidraw drag: PASS. App-owned `DrawingEmbeddableCard` drag: PASS.**

The corrected two-ref bookkeeping **resolves the generic settled-propagation
failure** recorded in §26a and §27a.

### 28b. Core finding

The settled mechanism works when two meanings are kept **separate**:

1. `lastObservedSceneVersion`
2. `lastSettledSceneVersion`

**The previous one-ref implementation was defective because it collapsed observed
and settled state into one value** (§27c). With separate refs: real revision changes
schedule/reset the debounce; unchanged-revision `onChange` traffic is ignored; one
callback enters after settlement; one `setElements` propagates the latest snapshot;
React geometry matches the live scene; **and no pointerup flush or maximum-wait is
required by current evidence.**

### 28c. Initialization

Refs were **lazily initialized on the first `onChange` observation**, both set to
the same value:

- `lastObservedSceneVersionRef` = initial scene version
- `lastSettledSceneVersionRef` = **same** initial scene version
- observed initial version in the fixture: **5**

This produced **no startup `setElements` call** and **no false initial
invalidation** — the §27 initialization requirement, met and measured.

### 28d. Native drag — **PASS**

| | |
|---|---|
| scene revision changes | 16 |
| unchanged-revision `onChange` after pointerup | **152** |
| timer schedules after pointerup | **1** |
| timer clears after pointerup | **1** (source: reschedule on a **real** revision change) |
| callback entries | **1** |
| settled `setElements` calls | **1** |
| propagated final scene revision | 21 |

| geometry | live | React |
|---|---|---|
| x | 1500 | **1500** |
| y | 200 | **200** |
| frameId | `slide-e2` | **`slide-e2`** |
| element version | 17 | **17** |

**Live and React state matched exactly.**

### 28e. App-owned drag — **PASS**

| | |
|---|---|
| scene revision changes | 17 |
| unchanged-revision `onChange` after pointerup | **149** |
| timer schedules after pointerup | **2** |
| timer clears after pointerup | **2** (both caused by **real** revision changes) |
| callback entries | **1** |
| settled `setElements` calls | **1** |
| propagated final scene revision | 39 |

| geometry | live | React |
|---|---|---|
| x | 980 | **980** |
| y | 190 | **190** |
| element version | 18 | **18** |

**Live and React state matched exactly.**

### 28f. Continuous `onChange` traffic — §27g resolved

The at-rest cadence recorded in §27g **remains real**: ~**149–152** unchanged-revision
`onChange` calls after pointerup.

With the corrected design those calls caused **zero timer schedules, zero timer
resets, zero timer clears, and no delay to callback entry.**

**Continuous no-op `onChange` traffic does not defeat the debounce when scheduling is
conditioned on actual scene revision changes. §27g's open question is resolved.**

The at-rest cadence itself stays in the debt ledger — it is a real property of
Excalidraw that any future `onChange` consumer must assume.

### 28g. Conflict reconciliation — §27b closed

§22a measured **one** settled app-owned propagation. §26/§27 later reproduced
**failure** with the one-ref candidate. The two-ref spike now establishes that:

- **app-owned settlement is achievable and generic;**
- **the one-ref bookkeeping was the defective variant;**
- **§22a was consistent with a mechanism that kept observed and settled state
  distinct, whether explicitly or effectively.**

**The conflict is no longer marked unresolved. Do not retain the inference that the
settled concept itself was unreliable. Retain the historical record that one
implementation variant was defective.**

This is the correct closure: §27b refused to discard §22a in favour of the newer
measurement, and holding both until a third measurement adjudicated them is what made
this resolution available rather than a coin-flip.

### 28h. Technically justified geometry design

**A — APP-OWNED WRITER REPAIR.** The custom `DrawingEmbeddableCard` move writer must
follow the repository's existing Excalidraw revision convention: `version + 1`, new
`versionNonce`, `updated` timestamp.

**B — TWO-REF SETTLED PROPAGATION.** The existing `onChange` integration must
maintain `latestElementsSnapshotRef`, `lastObservedSceneVersionRef`,
`lastSettledSceneVersionRef` and **one** debounce timer ref, with this behaviour:

1. store the latest elements snapshot on `onChange`;
2. compute current `getSceneVersion`;
3. when current revision **differs** from last observed — update last observed, clear
   the existing timer if any, schedule **one** new settle timer;
4. when revision is **unchanged** — **do not** clear or reschedule;
5. on callback entry — compare last observed with last settled, propagate the latest
   snapshot if different, and **only after propagation** advance last settled;
6. **latest snapshot wins**;
7. clear the timer on unmount;
8. keep the immediate count/frame-name path **unchanged**.

**Do not use one ref for both observed and settled revision.**

### 28i. Performance

For both drag types: **16–17 scene changes collapsed into one settled `setElements`
call**; `setElements` did **not** run per pointermove; no effect loop; no
console/page errors; bounded timer scheduling; no timer thrashing from
unchanged-revision traffic.

**The spike did not perform a full high-load benchmark. §26j scenario G remains
UNPROVEN.**

### 28j. Pointerup, maximum-wait, appState gating — not justified

Current evidence does **not** justify adding pointerup-driven flush, maximum-wait
debounce, or appState gating. The corrected two-ref debounce completed reliably
without them.

**Do not add those mechanisms unless a later stress test demonstrates a new
failure.** §27h listed them as contingent candidates; the contingency did not fire.

### 28k. Separate mechanisms — still REJECTED

The **same shared** two-ref mechanism passed **both** paths. Separate native and
app-owned propagation systems remain rejected (§4, §24j, §26h, §27e).

### 28l. Geometry status correction

**Withdraw:** *CURRENT SETTLED DEBOUNCE GENERICALLY DEFECTIVE.*

**Replace with:** **ONE-REF DEBOUNCE REJECTED · TWO-REF SETTLED PROPAGATION PROVEN
FOR NATIVE AND APP-OWNED DRAGS.**

The geometry architecture is **once again technically justified**, subject to the
remaining acceptance gaps: **app-owned resize real interaction; representative
performance run; final integrated implementation verification.**

### 28m. Metadata status

**M2 remains justified, acceptance incomplete.** Unresolved: real container/child
edit (§26c); live identity-churn control (§26e); representative performance run
(§26j).

**Do not rerun already-passed metadata scenarios A and C** unless required by final
integrated acceptance.

### 28n. Next governance decision — Opus to decide

**Do not unlock the full production allowlist solely from this spike.**

Remaining acceptance debt: **B** (container/child real UI path), **D** (live
identity-churn control), **F** (app-owned resize), **G** (representative performance
run).

Opus must decide whether to:

1. **require** those remaining cases before implementation authorization; or
2. **authorize the combined implementation** with those cases bound as **final
   acceptance gates before closure**.

**No waiver is implied by this amendment.**

### 28o. Boundaries — bind

- Do not add pointerup flushing. Do not add maximum-wait without new evidence.
- Do not use one ref for observed and settled revision.
- Do not create separate native/app-owned mechanisms.
- Do not alter PATCH-124. Do not alter `getSlideRenderSignature` semantics.
- Do not use raw `padlets` identity. Do not use Excalidraw revision fields as the
  metadata trigger.
- Do not resume PATCH-127. Do not touch protected paths.
- Do not modify `node_modules` or `excalidraw_fork`.

### 28p. Status

**PATCH-128: OPEN · OPTION A APP-OWNED WRITER REPAIR PROVEN · TWO-REF SETTLED
GEOMETRY PROPAGATION PROVEN · M2 METADATA DESIGN JUSTIFIED BUT ACCEPTANCE INCOMPLETE
· REMAINING ACCEPTANCE DEBT B/D/F/G · PRODUCTION ALLOWLIST LOCKED · FULL
IMPLEMENTATION BLOCKED.**

Both halves of PATCH-128 now have a **technically justified, measured** upstream
trigger feeding the **existing, unmodified** frames/signature/PATCH-124 pipeline.
What remains is **acceptance coverage and a governance decision**, not design.

**PATCH-124 unchanged and correct (ninth confirmation stands; this spike touched
nothing downstream). `getSlideRenderSignature` unchanged. PATCH-115 untouched.**
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt, updated.** **Resolved and removed:** the §27b unreconciled
app-owned conflict (§28g). **Retained, reclassified:** one ref must never carry both
"observed" and "settled" meanings — now a *proven* design rule rather than a
suspected one (§28b, §28h). **Retained:** Excalidraw `onChange` fires continuously at
rest (~15–20 ms) with no scene or appState change (§27g) — harmless to a
revision-conditioned debounce, but still load-bearing for any future consumer; a
stable output with a flat input-arrival counter proves absence of input, not correct
filtering (§25e, §26e); a mechanism proven for one path must not be described as
proven generally (§26g) — the rule that produced §27 and therefore this resolution;
`updated_at` is not a reliable client-side invalidation trigger under the optimistic
update path (§24c); thumbnail assertions must re-query by stable slide identity
(§23a); nondeterministic React propagation (§19c); the split-brain `frames` memo
(§17c); `getSceneVersion` blind to metadata-only changes (§17e); plus the upstream
Excalidraw null-dereference, the `unload` warning, the tsconfig-excluded fork, and
the PATCH-123 §14k / PATCH-124 §14l / PATCH-125 §13l ledgers with the unresolved
production-build failure.

---

## 29. Amendment — IMPLEMENTATION AUTHORIZED; B/D/F/G BOUND AS PRE-CLOSURE GATES (2026-08-01, CTO)

### 29a. Governance decision — §28n **Option 2**

**The combined PATCH-128 implementation is AUTHORIZED now.**

**The remaining acceptance debt is NOT waived.** The following remain **mandatory
before PATCH-128 may close**:

- **B** — real container/child metadata case
- **D** — live identity-churn control
- **F** — real app-owned resize
- **G** — representative performance run

**These are closure gates, not implementation prerequisites.** Implementation may
proceed in parallel; closure may not.

### 29b. Rationale

The architecture is **sufficiently characterized for implementation**. Every
mechanism being authorized has been measured in a real browser and fully restored;
nothing below is authorized on the strength of unit evidence alone.

### 29c. Geometry evidence — proven

1. The custom `DrawingEmbeddableCard` move writer is **the only measured geometry
   writer that changes x/y without updating Excalidraw revision fields.**
2. Repairing it with the repository's established convention — `version + 1`, new
   `versionNonce`, `updated` timestamp — **causes `getSceneVersion` to reflect
   app-owned movement.**
3. The **two-ref settled propagation design passes for both** native Excalidraw drag
   and app-owned `DrawingEmbeddableCard` drag (§28d, §28e).
4. **~16–17 revision changes collapse into one settled `setElements` propagation.**
5. **~149–152 unchanged-revision `onChange` calls after pointerup are harmless** —
   they do not schedule, clear, or reset the timer (§28f).
6. **Live and React geometry matched exactly after settlement.**
7. **One-ref observed/settled bookkeeping is REJECTED** (§27c, §28b).
8. **Pointerup flushing and maximum-wait are not justified** by current evidence
   (§28j).

### 29d. Metadata evidence — proven

1. Metadata updates **reach** local padlet state and `paddletsRef` (§24a).
2. The existing frames memo **does not recompute** from metadata changes because its
   trigger is element/canvas-line driven (§24a, §24b).
3. **`getSlideRenderSignature` already consumes canonical `buildPadletRenderState`
   and does not require semantic modification** (§24b).
4. A deterministic M2 revision derived from canonical `buildPadletRenderState` is
   stable across fresh object **and** array identities; stable across ordering
   changes; changes for title, card-colour, todo-state and child-field changes; uses
   the existing bounded child recursion; **does not duplicate the render-field
   list** (§25c).
5. **Real UI evidence passed** for title metadata (§25d), non-text todo metadata
   (§26b), and an outside-slide edit reaching local state while leaving slide output
   unchanged (§26d).

### 29e. Downstream evidence — proven, and unchanged

`resolveFrameMembership` remains authoritative; `getSlideRenderSignature` remains
correct when invoked; **PATCH-124 correctly schedules and de-races changed
thumbnails**; `createSlideRenderer` reads current scene and post state; generated
PNGs are accepted, installed and displayed correctly; the earlier thumbnail failure
was **classification E** — a stale/ambiguous test assertion (§23a).

**No PATCH-124 or renderer change is authorized.**

### 29f. Authorized implementation — GEOMETRY

**A. Repair the existing `DrawingEmbeddableCard` move writer.**

For each existing immutable x/y mutation, also update `version: (current version ?? 1)
+ 1`, `versionNonce` using the repository's existing convention, and
`updated: Date.now()`.

**Requirements:** derive from the **current live element** for each mutation; **do
not** use the pointerdown-time snapshot for revision fields; preserve existing x/y
calculations; preserve existing pointermove history semantics; preserve the existing
final history commit; preserve **one** persistence write at drag completion; **do
not** add a second `updateScene` writer; **do not** alter locks or database
synchronization.

**B. Add shared two-ref settled scene propagation beside the existing immediate
count/frame-name gate.**

**Required state:** `latestElementsSnapshotRef`, `lastObservedSceneVersionRef`,
`lastSettledSceneVersionRef`, **one** timer ref.

**Required behaviour:**

1. lazily initialize observed and settled revisions to the **same** current revision;
2. store the latest elements snapshot on each `onChange`;
3. if current scene revision **differs** from last observed — update last observed,
   clear any pending timer, schedule **one** 150 ms settle callback;
4. if revision is **unchanged** — do not schedule, do not clear, do not reset;
5. in the callback — compare last observed with last settled, propagate the latest
   snapshot when different, advance last settled **only after** propagation, clear
   the timer ref;
6. preserve the immediate count/frame-name path;
7. clean up the timer on unmount;
8. **latest snapshot wins**;
9. **do not** add pointerup flushing;
10. **do not** add maximum-wait;
11. **do not** create separate native and app-owned mechanisms.

### 29g. Authorized implementation — METADATA

**C. Add a pure deterministic post-render revision helper.**

Stable top-level ordering by post ID; **reuse canonical `buildPadletRenderState`**;
preserve existing bounded recursion; deterministic serialization of canonical render
state; lightweight stable digest. **No** raw padlets/object identity; **no**
duplicate field list; **no** unbounded traversal; **no** Excalidraw revision mutation
for metadata.

**D. Add the deterministic metadata revision as an *additive* frames-memo
dependency.**

**Leave unchanged:** `getSlideRenderSignature` semantics; `resolveFrameMembership`;
PATCH-124 scheduling; renderer behaviour; presentation composition rules.

### 29h. Production allowlist — **UNLOCKED, bounded**

1. **`components/collabboard/canvas/layouts/DrawingLayout.tsx`**
2. **`lib/infra/drawing/postRenderRevision.ts`** — new pure helper for the
   deterministic canonical metadata revision.
3. **The existing module containing `buildPadletRenderState`** — **export visibility
   only if required. No semantic change** to `buildPadletRenderState` or
   `getSlideRenderSignature`.
4. **`lib/infra/drawing/settledScenePropagation.ts`** — **optional**, only if
   extraction materially improves deterministic unit testing. **If the logic remains
   clearer and smaller inline in `DrawingLayout.tsx`, do not create this file merely
   to fill the allowlist.**

**No other production files are authorized without a governance amendment.**

### 29i. Test allowlist

Authorized: unit tests for the deterministic post-render revision; unit tests for
settled observed-versus-settled revision scheduling **if extracted**; browser
characterization for integrated geometry and metadata synchronization; source/boundary
test **only** where it protects the exact prohibited regressions.

### 29j. Implementation test requirements — minimum

**GEOMETRY:** app-owned cross-slide drag; app-owned within-slide drag; native
real-pointer cross-slide drag using **`resolveFrameMembership`**; **one**
`setElements` settlement per completed drag; unchanged-revision `onChange` traffic
ignored; undo/redo remains correct; **one** persistence write at drag completion.

**METADATA:** real title edit; real non-text todo edit; real outside-slide edit;
deterministic identity/order unit tests; **no thumbnail render for unchanged
per-slide signatures**.

**OUTPUT:** presentation and thumbnails update **automatically**; **no manual refresh
required**; thumbnails identified by **stable slide ID and re-queried at assertion
time** (§23a); no continuous rendering loop; **no PATCH-124 changes**.

### 29k. Mandatory pre-closure gates

**B — CONTAINER/CHILD.** Before closure, **either** execute a real render-relevant
container-child UI edit and pass the full chain, **or** return to Opus with source
evidence that no such user interaction exists in `DrawingLayout` mode and request a
**narrowly documented waiver**. **No automatic waiver is granted.**

**D — IDENTITY CHURN.** Before closure, produce a **real local-state** identity churn
where raw array/object identities change, canonical render state does not, the
deterministic revision remains stable, and no slide signature or thumbnail render
changes. **Unit evidence alone is not enough** unless Opus later grants a documented
waiver.

**F — APP-OWNED RESIZE.** Before closure, prove: real resize-handle `pointerdown`;
live width/height mutation; revision/`getSceneVersion` change; settled React
propagation; presentation and thumbnail update.

**G — PERFORMANCE.** Before closure, run a representative board and report padlet
count; slide count; metadata revision cost; `onChange` count; settled `setElements`
count; frames memo count; thumbnail render count; interaction responsiveness;
loops/errors/reconcile anomalies. **No arbitrary threshold is required, but the
evidence must show bounded, non-frame-by-frame expensive work and no material
regression.**

### 29l. Hard stops during implementation

Stop and report if: more production files are required; `getSlideRenderSignature`
semantics must change; PATCH-124 must change; metadata requires Excalidraw revision
fields; raw `padlets` identity is required; **observed and settled revision are
collapsed into one ref**; pointerup or maximum-wait becomes necessary; separate
native/app-owned mechanisms are introduced; thumbnails render per pointermove; undo
gains per-frame entries; protected paths change; PATCH-115 must be crossed.

### 29m. Commit contract — bind

```
fix(slides): synchronize canvas and post changes with previews
```

**Do not commit governance and implementation together.**

### 29n. Next GPT-5.5 instruction (bind)

> **Implement PATCH-128 §29f–§29g. This is the permanent implementation, not a spike.**
>
> Touch only the §29h allowlist. Build **A** (writer repair, live element per
> mutation), **B** (two-ref settled propagation, eleven clauses), **C** (pure
> deterministic revision helper reusing `buildPadletRenderState`), and **D** (additive
> frames-memo dependency).
>
> Satisfy every §29j test requirement. **Do not** collapse observed and settled into
> one ref, add pointerup flushing or maximum-wait, duplicate the render-field list,
> use raw `padlets` identity, mutate Excalidraw revision fields for metadata, create
> separate native/app-owned mechanisms, or change `getSlideRenderSignature`,
> PATCH-124, PATCH-115, `node_modules` or `excalidraw_fork`.
>
> Create `settledScenePropagation.ts` **only if** extraction genuinely improves unit
> testing — an allowlist entry is permission, not an instruction.
>
> Commit exactly once, with the §29m message. **Do not close the patch** — B/D/F/G
> remain outstanding.

### 29o. Status

**PATCH-128: OPEN · IMPLEMENTATION AUTHORIZED · PRODUCTION ALLOWLIST UNLOCKED AS
BOUNDED ABOVE · OPTION A WRITER REPAIR BOUND · TWO-REF SETTLED PROPAGATION BOUND ·
M2 METADATA REVISION BOUND · B/D/F/G MANDATORY PRE-CLOSURE GATES · NOT CLOSED.**

Twenty-nine sections to authorize roughly four mechanisms — but every one of them is
now backed by a measurement rather than an argument, and the two most expensive
wrong turns (§22's implied renderer defect, §26's implied native-only defect) were
caught by evidence rather than shipped.

**PATCH-124 unchanged and correct. `getSlideRenderSignature` unchanged. PATCH-115
untouched.**
**PATCH-127: OPEN · B2C AUTHORIZED · NOT STARTED · candidate removed.**
**PATCH-126: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
**PATCH-125 / 124 / 123 / 122 / 121 / 120 / 117: CLOSED.**
**PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

**Recorded debt — carried into implementation.** The four closure gates B/D/F/G are
now the patch's primary outstanding obligation and must not be quietly dropped at
closure time. Retained: Excalidraw `onChange` fires continuously at rest (~15–20 ms)
with no scene or appState change — harmless to a revision-conditioned debounce, still
load-bearing for any future consumer; one ref must never carry both "observed" and
"settled" meanings; a stable output with a flat input-arrival counter proves absence
of input, not correct filtering; a mechanism proven for one path must not be
described as proven generally; `updated_at` is not a reliable client-side
invalidation trigger under the optimistic update path; thumbnail assertions must
re-query by stable slide identity; nondeterministic React propagation (§19c); the
split-brain `frames` memo (§17c); `getSceneVersion` blind to metadata-only changes
(§17e); plus the upstream Excalidraw null-dereference, the `unload` warning, the
tsconfig-excluded fork, and the PATCH-123 §14k / PATCH-124 §14l / PATCH-125 §13l
ledgers with the unresolved production-build failure.
