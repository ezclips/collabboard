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
