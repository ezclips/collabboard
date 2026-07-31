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
