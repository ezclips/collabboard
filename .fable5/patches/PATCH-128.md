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
