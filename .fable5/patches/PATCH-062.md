# PATCH-062 — Drawing Bridge Hardening Program, patch 1: bridge contract, pure helpers, characterization net

**Status:** SPEC READY — implement exactly. **Implementer:** GPT-5.5 (senior).
GPT-5.4 is NOT authorized: this patch introduces a new semantics-bearing module
whose test fixtures encode subtle live behavior; a wrong fixture silently
weakens the entire program's net.
**Authored:** 2026-07-14 by the CTO model after a full census of the live tree
(every file cited below was read at the hashes bound in §2; the unit baseline
325/36 was RUN, not assumed). Program: Drawing Bridge Hardening (062 = net,
063+ = fixes). One goal: make the app↔Excalidraw bridge's real behavior
executable as tests BEFORE any fix changes it.

Read `.fable5/docs/SKILL.md` and this spec first. This patch creates exactly
TWO files and modifies NOTHING. Never `git checkout`/`git restore` anything.

**Bound commit message:**

```
feat(drawing): add pure drawing-bridge helpers and characterization net (PATCH-062)
```

---

## 0. CTO ruling

### 0.1 The program and this patch's place in it

The Drawing canvas bridges five worlds: app-owned post records (`padlets`
rows), Excalidraw `embeddable` elements carrying `link: "padlet://<id>"`,
Excalidraw frame membership (`element.frameId`), presentation preview/export
(z-band composition), and app-rendered card/AI content. The observed defect
family — wrong parent/child after copy, confused edit targets, containers
behind/transparent, wrong elements in slide previews, missing AI-image
children, membership drift after move/copy/paste — all reduces to bridge
invariants that exist only implicitly, in ≥3 divergent inline copies.

PATCH-062 writes the contract down (§0.3), ships pure helpers that compute
each invariant from a scene+padlets snapshot, and pins today's behavior with
characterization tests. **No defect is fixed here.** Sequencing per
CTO_GUIDELINES §6 (test nets before refactors) and LESSONS_LEARNED
("never extract from a god component without a behavior net").

### 0.2 Root-cause map (census, exact sites, live tree 2026-07-14)

**RC-1 — Duplicate `padlet://` links are creatable and every resolver is
first-match.** Excalidraw-native duplication (Alt-drag, Ctrl+D, in-scene
copy/paste; fork `packages/element/src/duplicate.ts` regenerates ids but
copies `link` verbatim) and slide duplication
(`DrawingLayout.tsx` `handleDuplicateSlide`, L1406–1433: clones every
`frameId` member — including app embeddables — keeping the source `link`)
both produce two active embeddables with the same `padlet://` link. Every
resolution site then picks one winner arbitrarily:
- drag-handle lookup `.find()` — DrawingLayout L315–317
- natural-height sync `.find()` — L453–463
- z-reorder `.find()` — `useCanvasActions.ts` L139–141
- reconciliation `padletsByLink`/`existingLinks` maps — L1604–1611 (both
  copies are refreshed onto the SAME DB x/y, so copies teleport onto the
  original)
- `lastEmbeddablePosRef`/`schedulePadletPositionSave` keyed by padletId —
  L1057–1074 (two elements fight over one key; whichever enumerates last
  wins the position save → membership/order corruption in the DB)
- `renderEmbeddable` keys the React card by `padletId` — L1817–1825
  (duplicate React keys; edit targets confuse parent/child)
- deletion bridge L1076–1105: deleting EITHER copy deletes the shared
  padlet (guarded only by `metadata.parentId`), after which the orphan
  sweep (L1613–1624) removes the surviving copy too.

**RC-2 — App-clipboard paste copies membership metadata verbatim.**
`useCanvasActions.ts` `handlePastePadlet` (L178–198) passes
`metadata: clipboard.metadata` unchanged: a pasted container keeps the
ORIGINAL's `childPadletIds` (copy renders the original's children; editing
the "copy's" child edits the original's), and a pasted child keeps
`parentId` (phantom membership in the original container; on the drawing
canvas the pasted post also gets NO embeddable, since
`insertPadletEmbeddable`/reconciliation skip `metadata.parentId` posts —
L1576, L1597). Contrast: the library paths DO sanitize
(`sanitizeLibraryMetadata`, RowColumnContainerCard L27–37; DrawingLayout
L2914, L2965 strip `parentId`/`childPadletIds`).

**RC-3 — The membership union is implemented ≥3× with no shared source of
truth.** Ordered-`childPadletIds`-then-`parentId`-extras, dedupe first-wins:
RowColumnContainerCard L134–146; PresentationContainerCard
`getContainerChildren` L51–64; DrawingLayout `contextMenuOpenTargets`
L2139–2157 (divergence: maps `String(id)` instead of filtering non-strings).
CanvasClient maintains the `childPadletIds` mirror by hand at ~40 write
sites (census: `grep -n childPadletIds` = 40 lines, `parentId` = 56 lines).
Note the live union renders list-ordered children EVEN WHEN their
`parentId` points elsewhere — mismatch is currently invisible, never
reported.

**RC-4 — Slide membership falls back to overlap.**
`resolveSlidePadlets.ts` L34:
`inFrame = element.frameId ? element.frameId === slideFrame.id : overlapsFrame`.
An embeddable with `frameId: null` that merely overlaps a frame is included
in that slide's preview/export — overlap creates membership, violating
contract clause 3, and interacts with RC-1 (a duplicate-link copy parked
over a frame injects the shared padlet into that slide).

**RC-5 — AI/media children can be absent from slide previews.**
`PresentationContainerCard` renders ONLY `pickPrimaryChild` (L66–97) whose
predicates recognize image/link/text types but never AI posts
(`aiComponentCode`/`aiAssets`/`aiAssetManifest` — see types/collabboard.ts
L221–238); `PresentationPadletCard.getImageSource` (L65–74) never consults
AI asset fields; the overlay is rasterized via html2canvas with `useCORS`
(createSlideRenderer.tsx L151–158) so remote AI images can silently drop.

**RC-6 — Visual order vs membership are conflated nowhere and everywhere.**
Scene array order is z-order (reorderEmbeddables path, z-band split in
`planSlideComposition.ts` L36–47 by scene index); nothing characterizes it,
so "container appears behind / transparent" symptoms have no measurable
definition today.

Doc drift found (report-only, do NOT fix here): `.agent/skill.md` claims
`renderEmbeddable` keys cards by `padletId + renderSignature`; live code
keys by `padletId` alone (L1825).

### 0.3 The bridge contract (normative for the whole program)

1. **App post membership.** `metadata.parentId` is authoritative;
   `metadata.childPadletIds` is a mirror/cache only. Overlap never creates
   or changes membership.
2. **Drawing link identity.** An app-owned overlay is an Excalidraw
   `embeddable` whose link is exactly `padlet://<padletId>`. One active
   root app post ↔ at most one active scene embeddable. Imported native
   embeddables are not app containers without explicit app identity.
3. **Frame membership.** `element.frameId` is authoritative. Overlap may
   only ever be a transient drag candidate; membership changes only at a
   committed interaction boundary. Scene order controls visual order, not
   membership.
4. **Rendering.** App-card rendering is separate from Excalidraw
   membership. Slide preview/export must (in a later patch) collect an
   explicit frame subtree. Canvas visibility and export asset readiness
   are separate concerns.

Where today's behavior violates the contract, PATCH-062 helpers REPORT the
violation and the tests pin the CURRENT behavior (characterization, not
aspiration). Enforcement patches (063+) will flip specific tests
deliberately, one at a time.

### 0.4 Placement ruling and the one-parser rule

Helpers go in a NEW `lib/infra/drawing/bridge.ts` beside `importScene.ts`
(the established pure-drawing-infra seam; 323 lines, cannot absorb ~350
more under the 800 ceiling). `lib/domain` is wrong: these helpers speak
raw Excalidraw element shapes (external input), which is infra vocabulary.

**The program brief's `parsePadletLink` candidate already exists** as
`extractPadletIdFromEmbeddableLink` (importScene.ts L63–69). P6/one
implementation per concern: bridge.ts MUST import it (and
`isDrawingContainerPadlet`) from `./importScene` and MUST NOT define a
second link parser or alias.

`isEmbeddableInSlideFrame` temporarily duplicates the inclusion RULE of
`resolveSlidePadlets` (RC-4). This duality is authorized HERE ONLY because
test T19 locks parity by importing the live `resolveSlidePadlets` and
asserting identical inclusion on a shared fixture matrix; the designated
survivor is the bridge helper, and the consuming patch that retires the
inline rule is queued (063+). Do not "unify" ahead of that patch.

### 0.5 Why zero visible behavior change

No application source, fork file, config, schema, or dependency changes.
The two new files are imported by nothing in the app; only vitest loads
them. Every gate that could detect behavior (tsc, boundaries, full unit
suite baseline, build, dev-server Ready) must come out identical-or-additive.

---

## 1. Scope

### Files to Create (the ONLY writes)

- `lib/infra/drawing/bridge.ts` — pure helpers, ≤ 400 lines, LF-only
- `lib/infra/drawing/bridge.test.ts` — characterization net, ≤ 800 lines, LF-only

### Files that MUST NOT be touched (hash-fenced, §2)

All of §2's list, plus: anything under
`components/collabboard/canvas/excalidraw_fork/**`, `supabase/**`,
`eslint.boundaries.config.mjs`, `vitest.config.ts` (its include already
covers `lib/infra/**/*.test.ts` — verified), `package.json` /
`package-lock.json` (no new dependencies), all `.fable5/**` docs (CTO-only).

### Explicitly out of scope (Do NOT — the program forbids it here)

- Do not fix duplication, paste sanitation, or the deletion bridge (RC-1/2).
- Do not normalize frame ordering or z-order; characterize only (RC-6).
- Do not modify hit-testing, opacity, or z-order behavior.
- Do not change preview/export or AI-image rendering (RC-4/5 stay as-is).
- Do not add database migrations, wire diagnostics into any component, or
  add any runtime call site for the new helpers. (DrawingLayout is 3,078
  lines — over ceiling; the never-grow rule holds. Diagnostics wiring is a
  later patch's decision.)
- Do not modify the Excalidraw fork. Characterization did not prove it
  unavoidable: duplicate-link creation is fully reproducible in fixtures.
- Do not touch `.agent/skill.md` despite the doc drift noted in §0.2.

---

## 2. Pre-edit gates — mismatch means STOP

```bash
git status --short   # empty (this spec file may appear; nothing else)
ls lib/infra/drawing # exactly: importScene.test.ts importScene.ts
npx vitest run       # 325 passed (325), 36 files — the bound baseline
```

MUST-NOT-CHANGE — verify all now AND after the final gates:

```bash
git hash-object lib/infra/drawing/importScene.ts                                    # 8fbf501c4a6ca723c87cdfdd58ead55363be9000
git hash-object lib/infra/drawing/importScene.test.ts                               # 793858097e693e4e4632258858b0d09d8bb0f906
git hash-object components/collabboard/canvas/layouts/DrawingLayout.tsx             # 210781817a6091e525791a80ca60716dda191cfc
git hash-object components/presentation/slide-renderer/resolveSlidePadlets.ts       # 5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
git hash-object components/presentation/slide-renderer/planSlideComposition.ts      # 9524e6397e623fef905f213e80953b2a22e2423d
git hash-object components/presentation/slide-renderer/getSlideRenderSignature.ts   # da903ed4c9b7cd9b9ff86657fa2c44fa27e4665d
git hash-object components/presentation/slide-renderer/createSlideRenderer.tsx      # ce236e91196ef36c5491a053072acc3e981ed80d
git hash-object components/presentation/slide-renderer/PresentationContainerCard.tsx # 3876eeba810484fcf01437d477fe682dec2aa32b
git hash-object components/presentation/slide-renderer/PresentationPadletCard.tsx   # bbcef06c8b8de29e455ec4748e7ea2762f0c1052
git hash-object components/collabboard/RowColumnContainerCard.tsx                   # 94b2cc6537929ffc3c845b12f292743c620f340e
git hash-object components/collabboard/PostCardContent.tsx                          # 3dbf8b0520d9d7c0b252cee166f792f3e46bc471
git hash-object components/collabboard/canvas/hooks/useCanvasActions.ts             # ee33f91794e48c479a1062e5a0aceaec612d1f63
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                        # 3c4f056b72ebd753b6212e8a5cf1357ccf48fd2b
git hash-object types/collabboard.ts                                                # ea46b79cf0e4392f7141017943c74733e1e87be2
git hash-object vitest.config.ts                                                    # 34974c44b44cac16e8fac90d2aa665ad3310eef1
git hash-object package.json                                                        # 95b5b889576f774930055f821563dd6f0d14fb51
```

(Yes, `CanvasClient.tsx` differs from PATCH-061's bound final hash — the
auth-fix commits `8e5e4b6`…`efe7332` landed after 061. The hash above is
today's live truth; PATCH-062 does not touch the file either way.)

---

## 3. `lib/infra/drawing/bridge.ts` — bound public API

Module discipline: pure functions only; no I/O, no React, no `next/*`, no
`@supabase/*`, no `console.*`, no imports other than `./importScene`;
structural `*Like` input types (do NOT import from `@/types/collabboard` —
follow importScene's precedent); never mutate inputs; deterministic output
ordering as specified. TS strict, no `any` in exported signatures
(internal narrowing may use `unknown` + guards).

```ts
import {
  extractPadletIdFromEmbeddableLink,
  isDrawingContainerPadlet,
} from "./importScene";

export type BridgePadletLike = {
  id: string;
  type?: string | null;
  position_x?: number | null;
  position_y?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type BridgeSceneElementLike = {
  id: string;
  type?: string | null;
  link?: string | null;
  frameId?: string | null;
  isDeleted?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type BridgeSlideFrameLike = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
```

**H1 — `resolveContainerMembership(container: BridgePadletLike, allPadlets: readonly BridgePadletLike[]): ContainerMembership`**
Characterizes the live union (RC-3 dominant form, RowColumnContainerCard
L134–146):
- `orderedChildIds: string[]` — string entries of
  `container.metadata.childPadletIds` that resolve to an existing padlet,
  in list order, followed by padlets whose `metadata.parentId ===
  container.id` and are not already present (first occurrence wins).
  Non-string list entries are ignored (the dominant semantics; the
  `String(id)` divergence at DrawingLayout L2148 is DISCLOSED, not
  reproduced).
- `staleChildIds: string[]` — list entries (strings) with no matching padlet.
- `unlinkedChildIds: string[]` — list entries whose padlet exists but whose
  `parentId !== container.id` (rendered today; contract clause 1 violation).
- `linkedOnlyChildIds: string[]` — `parentId` children absent from the list
  (mirror lag).
- `hasMirrorMismatch: boolean` — any of the three above non-empty.

**H2 — `findAppEmbeddablesForPadlet(elements: readonly BridgeSceneElementLike[], padletId: string): BridgeSceneElementLike[]`**
All non-deleted `type === "embeddable"` elements whose link parses (via
`extractPadletIdFromEmbeddableLink`) to exactly `padletId`, in scene order.

**H3 — `findAppEmbeddableForPadlet(...same args): BridgeSceneElementLike | null`**
First element of H2 or null — pins today's `.find()` winner semantics.

**H4 — `collectDuplicateEmbeddableLinks(elements: readonly BridgeSceneElementLike[]): Array<{ padletId: string; elementIds: string[] }>`**
Padlet links carried by ≥2 active embeddables; `elementIds` in scene order;
result sorted by `padletId` ascending. Non-padlet links never appear.

**H5 — `characterizeFrameOrdering(elements: readonly BridgeSceneElementLike[]): Array<{ frameId: string; sceneIndex: number; memberIdsInSceneOrder: string[] }>`**
Active `type === "frame"` elements in scene order; members = active
elements with `element.frameId === frame.id`, in scene order. Membership by
`frameId` ONLY — geometric overlap plays no part (contract clause 3).

**H6 — `isEmbeddableInSlideFrame(element: BridgeSceneElementLike, frame: BridgeSlideFrameLike): boolean`**
Exactly the CURRENT `resolveSlidePadlets` rule (RC-4): if `element.frameId`
is truthy → `frameId === frame.id`; else → strict-inequality AABB overlap
(`element.x < frame.x + frame.width && element.x + element.width > frame.x
&& element.y < frame.y + frame.height && element.y + element.height >
frame.y`). Deleted/non-embeddable/non-padlet-link concerns are the
CALLER's, as in the live code — the helper evaluates geometry/frameId only.

**H7 — `validateDrawingBridgeSnapshot(input: { elements: readonly BridgeSceneElementLike[]; padlets: readonly BridgePadletLike[] }): { ok: boolean; violations: BridgeViolation[] }`**
`BridgeViolation = { code: BridgeViolationCode; padletId?: string; elementIds: string[]; detail: string }`,
sorted by `code` then `padletId` then first element id. Bound codes
(`BridgeViolationCode` string-literal union, exactly these):
- `"duplicate-embeddable-link"` — from H4 (contract clause 2).
- `"embeddable-links-missing-padlet"` — active padlet-linked embeddable
  whose padlet is absent from `padlets`.
- `"child-padlet-has-embeddable"` — padlet with `metadata.parentId` set
  that still has an active embeddable (live code removes these; presence
  is drift).
- `"root-padlet-missing-embeddable"` — non-drawing (`type !== "drawing"`),
  parentId-less padlet with zero active embeddables (steady-state drift;
  legitimately transient mid-reconciliation — the validator judges
  snapshots, not moments).
- `"membership-mirror-mismatch"` — H1 `hasMirrorMismatch` for any padlet
  that `isDrawingContainerPadlet` accepts.
- `"embeddable-frame-dangling"` — active element whose `frameId` names no
  active frame in the snapshot.
Native embeddables with non-`padlet://` links must never produce any
violation (contract clause 2, imported-scene tolerance).

**H8 — `summarizeDrawingBridgeSnapshot(input: { elements: readonly BridgeSceneElementLike[]; padlets: readonly BridgePadletLike[]; slideFrame?: BridgeSlideFrameLike }): DrawingBridgeSummary`**
`DrawingBridgeSummary = { rows: BridgeSummaryRow[]; orphanEmbeddables: Array<{ elementId: string; link: string; sceneIndex: number }> }`.
One row per padlet, sorted by `padletId` ascending, each carrying ALL of
the program's required diagnostics fields:
`padletId`, `parentId: string | null`, `childPadletIds: string[]`,
`embeddableIds: string[]` (scene order), `embeddableId: string | null`
(first-match, H3), `embeddableLink: string | null`,
`frameId: string | null`, `sceneIndex: number | null` (first-match's index),
`elementType: string | null`, `hasDuplicateLink: boolean`,
`hasMembershipMismatch: boolean`,
`slideInclusion: "included" | "excluded" | "unknown"` (`"unknown"` when no
`slideFrame` given or the padlet has no embeddable; otherwise H6 on the
first-match embeddable). `orphanEmbeddables` lists active padlet-linked
embeddables whose padlet is missing.

---

## 4. `lib/infra/drawing/bridge.test.ts` — bound test inventory

Style: mirror `importScene.test.ts` (vitest `describe`/`it`, no mocks).
All fixtures pass through a local `deepFreeze` helper before use — a
mutation anywhere in bridge.ts must throw in strict mode. Fixture shapes
model the live schema exactly (embeddables carry
`link: "padlet://<id>"`, frames `type: "frame"`, membership via
`metadata.childPadletIds` / `metadata.parentId`). Exactly these 30 tests,
names verbatim:

`describe("resolveContainerMembership")` — T1 lists childPadletIds-ordered
children first, then parentId-linked extras · T2 dedupes ids present in
both sources keeping list position · T3 ignores non-string entries in
childPadletIds · T4 reports staleChildIds for listed ids with no matching
padlet · T5 reports unlinkedChildIds for listed children whose parentId
points elsewhere while still listing them as rendered · T6 reports
linkedOnlyChildIds for parentId children missing from the mirror ·
T7 reports no mismatch for a fully mirrored container

`describe("findAppEmbeddablesForPadlet")` — T8 returns all active
embeddables with the exact padlet link in scene order · T9 excludes
deleted embeddables and non-embeddable elements · T10 does not match other
padlets or native links · T11 findAppEmbeddableForPadlet returns the first
scene match (current .find() winner)

`describe("collectDuplicateEmbeddableLinks")` — T12 reports links carried
by more than one active embeddable (alt-drag clone fixture) · T13 reports
duplicates created by slide duplication (cloned frame children keep the
source link)

`describe("characterizeFrameOrdering")` — T14 lists active frames in scene
order with scene indices · T15 lists each frame's members in scene order
via frameId only · T16 excludes overlapping elements without frameId from
membership

`describe("isEmbeddableInSlideFrame")` — T17 honors frameId when set even
against contradicting overlap · T18 falls back to geometric overlap only
when frameId is null · T19 matches resolveSlidePadlets inclusion across
the shared fixture matrix — the parity gate: import
`resolveSlidePadlets` from
`@/components/presentation/slide-renderer/resolveSlidePadlets` (its
imports are type-only; node env is safe) and assert, for a matrix of ≥6
embeddables (frameId match / frameId other + overlapping / null +
overlapping / null + disjoint / deleted / native link) with matching
padlet records, that the set of padlet ids resolveSlidePadlets returns
equals the set H6 admits for the active padlet-linked subset.

`describe("validateDrawingBridgeSnapshot")` — T20 passes a clean snapshot ·
T21 flags duplicate-embeddable-link · T22 flags
embeddable-links-missing-padlet · T23 flags child-padlet-has-embeddable ·
T24 flags root-padlet-missing-embeddable · T25 flags
membership-mirror-mismatch · T26 flags embeddable-frame-dangling and never
flags native embeddables with external links

`describe("summarizeDrawingBridgeSnapshot")` — T27 emits every bound
diagnostics field on each padlet row · T28 marks duplicate-link and
membership-mismatch statuses · T29 reports slide inclusion with a slide
frame and unknown without one · T30 does not mutate frozen inputs and
returns rows in deterministic padletId order

---

## 5. Post-edit gates — run all, paste real output

```bash
git status --short                       # exactly the two new untracked files (+ this spec if untracked)
wc -l lib/infra/drawing/bridge.ts        # <= 400
wc -l lib/infra/drawing/bridge.test.ts   # <= 800
grep -cE "from ['\"](react|next|@supabase)" lib/infra/drawing/bridge.ts    # 0
grep -c "console\." lib/infra/drawing/bridge.ts                            # 0
grep -cE "from ['\"]\./importScene['\"]" lib/infra/drawing/bridge.ts       # 1 (the module's ONLY import source)
grep -c "padlet://" lib/infra/drawing/bridge.ts                            # 0 — all link parsing delegates to extractPadletIdFromEmbeddableLink; links in output are read from elements, never constructed (the literal belongs in bridge.test.ts fixtures only)
npx tsc --noEmit                         # 0 errors
npm run check:boundaries                 # green (config untouched)
npx vitest run lib/infra/drawing         # 49 passed (49), 2 files  [19 existing + 30 new]
npx vitest run                           # 355 passed (355), 37 files
npm run verify                           # green end-to-end (typecheck + boundaries + unit + build)
```

Dev-server Ready gate (LESSONS discipline — port before, banner after,
never build under a live server; `npm run verify` above already built):

```bash
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"  # 0 before start
npm run dev   # must print Ready; note the banner port; then stop it by PID
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"  # 0 after stop
```

EOL + hygiene:

```bash
git add lib/infra/drawing/bridge.ts lib/infra/drawing/bridge.test.ts
git ls-files --eol -- lib/infra/drawing/bridge.ts lib/infra/drawing/bridge.test.ts  # i/lf w/lf both
git diff --cached --name-only            # exactly the two new paths
```

Re-run EVERY §2 hash after the gates. Commit ONLY the two new paths with
the bound message, explicit pathspecs. No `.next/**`, no logs, no spec
file in the implementation commit (the spec is committed separately as
documentation by the CTO).

## 6. Required runtime observations (review stage — CTO, not implementer)

The implementer's obligation ends at §5 (deterministic gates + Ready). At
review, the CTO records — as observations, explicitly NOT fixed by this
patch — the live defect family on a dev board, so 063+ specs can bind
before/after behavior:

1. Alt-drag-duplicate an app container embeddable → both copies render the
   same post; drag one, hard-refresh → note which position survived.
2. Right-click copy → paste a container via the app clipboard → note the
   copy lists the ORIGINAL's children (RC-2).
3. Duplicate a slide containing an app embeddable → note the duplicate-link
   pair (matches T13's fixture).
4. Open a slide preview with an embeddable overlapping (not member of) the
   frame → note inclusion (RC-4).
5. Slide preview of a container whose only AI-image child is not the
   primary child → note absence (RC-5).
6. Note any container rendered behind/transparent relative to native
   shapes, with its scene index (RC-6 baseline).

## 7. Rollback

Additive-only: `git revert <implementation commit>` restores the exact
pre-patch tree (both files vanish; no other file was touched — the §2
hashes prove it).

## 8. Stop conditions — report, do not improvise

- Any §2 pre-edit hash or the 325/36 baseline mismatches.
- T19 (parity) cannot be made green without changing H6's bound rule —
  that means the RC-4 census is wrong; the spec must be amended, not the
  helper bent.
- Any gate demands touching a fenced file, the fork, configs, or deps.
- `lib/infra/drawing/bridge.ts` cannot satisfy the API within 400 lines.
- Anything in the live tree contradicts §0.2's cited lines.

## 9. Acceptance criteria (checked literally at review)

1. Exactly two new files; every §2 hash unchanged; commit message verbatim.
2. All 30 bound tests present with bound names, green; suite 355/37.
3. bridge.ts exports exactly the §3 API; imports the shared parser; purity
   greps clean; both files LF.
4. `npm run verify` green; dev server reaches Ready; port gate 0/0.
5. No behavior change anywhere reachable: nothing imports bridge.ts except
   its test (prove: `grep -rn "infra/drawing/bridge" app components lib hooks --include="*.ts*" | grep -v bridge.test` → 0 lines).

**Estimated difficulty:** medium.
