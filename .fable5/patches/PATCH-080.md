# PATCH-080 — Add/Duplicate Slide Persistence Boundary Diagnosis

**Status:** DONE — closed 2026-07-18 (closure record in §12).
Implementation commit `34d9d54371a0bcc6dd360dc06394130fad918afe`,
blob `9a6c7b42a6b476fe74d74483a7fa057a4cf61e7e`, Sonnet independent
PASS. Was: SPEC READY — **diagnosis-only** (NO production change, NO
harness change, NO fork change, NO fix — the duplicate-persistence
defect and the deep-clone semantics ruling of PATCH-076 §0.B.2 may
NOT be implemented under this patch). Successor to the SUPERSEDED
PATCH-077 (its §0.B), narrowed per PATCH-078/PATCH-079: Rename is
resolved and OUT of the uncertainty set; this patch characterizes
**Add slide below** and **Duplicate slide** only.
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`9a11a234835242cfb51360ca95762ee1790eec2f`
(`fix(drawing): refresh slide sidebar on frame rename (PATCH-079)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize add/duplicate slide persistence boundary (PATCH-080)`

---

## 0. Census at authoring (2026-07-18, from `9a11a23`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Add/Duplicate persistence-boundary diagnosis** | defect diagnosis | **SELECTED (this patch)** — prerequisite for the duplicate fix; mechanism unidentified |
| 2 | Duplicate-slide deep-clone fix (semantics bound: PATCH-076 §0.B.2 OPTION A) | defect | BLOCKED on #1 |
| 3 | Frame-geometry sidebar staleness diagnosis | defect (uncharacterized) | next after #1/#2 — NEW related census note below sharpens it |
| 4 | Frame-geometry sidebar fix | defect | after #3 |
| 5 | Line-follow behavior | hardening | deferred |
| 6 | Uploaded-image storage cleanup | hardening | deferred (approved skip documents it) |
| 7 | AI images in presentation | feature | deferred (approved skip documents it) |
| 8 | Overlap fallback | hardening | deferred |
| 9 | Connections side-panel planning | feature | deferred until stabilization ruled complete |

New deterministic defect exposed by PATCH-079: **none** (six clean
reviewer runs, zero drift). However, this closure's read-only
inspection sharpened census #3: ALL slide-menu handlers build their
`updateScene` payload from React `elements` STATE
(`DrawingLayout.tsx:1396-1471`), and geometry changes still do not
refresh that state (PATCH-079's signature deliberately excludes
geometry) — so an Add/Duplicate performed after dragging a frame may
REPLACE the live scene from a stale-geometry base (potential silent
position revert, P3 flavor). Uncharacterized; belongs to census #3's
family; MUST NOT be fixed or worked around in this patch, but the
spec must avoid tripping it (no dragging before the actions).

## 1. Defect statement and open question (bind)

Proven so far: `handleRenameSlide` (map-replace mutation of React
`elements` state via `updateScene`) persists to the master scene
(PATCH-078). `handleDuplicateSlide` (append mutation:
`[...elements, newFrame, ...newChildren]`, fresh `crypto.randomUUID()`
frame/child ids, `DrawingLayout.tsx:1425-1452`) renders a live
duplicate that NEVER persists, and removing it deletes the ORIGINAL's
backing padlet row (PATCH-076). `handleAddSlideBelow`
(`:1411-1423`) shares Duplicate's append shape but creates an EMPTY
frame with no padlet-linked children. The suppression mechanism is
unidentified: `handleChange` provably runs after the duplicate
mutation (its deletion cascade fired from there in PATCH-076), the
fork invokes `props.onChange` for programmatic `updateScene`, the
save path (`dirtyDataRef` → 2 s debounce → `performSave` →
`saveDrawingSnapshot`, `:1026-1031`, `:988-1024`) has only an
import-path generation guard (`:991`, bumped only at `:1243`) — yet
the duplicate never reaches the persisted row.

**This diagnosis must answer which of:**
A. Add persists while Duplicate does not (child/embeddable-specific);
B. neither persists (append-shape or count-change-cascade specific);
C. both persist (contradicts PATCH-076 — valid, record faithfully);
D. Duplicate persists while Add does not (inverse; valid, record).

This bounds whether Duplicate's failure is action-specific,
mutation-shape-specific, child-clone-specific, payload-related, or
timing-related — the gate for the census #2 fix.

## 2. Diagnosis boundary (bind — observe, do NOT fix)

ONE new characterization spec, ONE active test, standard PATCH-064
harness board (two seeded frames: `PATCH-064 Landscape`,
`PATCH-064 Portrait`), driving ONLY the real presentation-sidebar UI
(row menu → exact menu item names; no direct state mutation, no
callback invocation, no `dispatchEvent`, no force/coordinate click),
in this bound order:

1. **Act — Add slide below:** open the source row's
   (`PATCH-064 Portrait`) menu; activate `'Add slide below'`. Derive
   **`addSlideVisible`** — a third sidebar row appears within a bound
   15 s poll (row count 2 → 3). Record the new row's title and
   position as supplementary evidence (do NOT hard-assert the title
   text — derivation of `Slide N` naming is itself under
   observation). Take an immediate persisted read (evidence only).
2. **Settled persistence — Add:** PATCH-076 method (poll the
   persisted master scene at ≤ 1 000 ms intervals across a ≥ 6 000 ms
   window; the settled final read is the SOLE derivation basis; lone
   sleep-then-read prohibited). Derive **`addSlidePersisted`** — the
   settled persisted active frame-id set contains exactly one new id
   beyond the seeded pair. Record whether it EVER appeared during the
   window (supplementary).
3. **Act — Duplicate slide:** open the SAME original source row's
   menu; activate `'Duplicate slide'`. Derive
   **`duplicateSlideVisible`** — a further sidebar row appears within
   a bound 15 s poll (row count → 4). Derive
   **`duplicateRendersSourceChild`** — the source padlet's content
   renders live a second time (board-scoped
   `[data-padlet-id="<source shared padlet id>"]` count reaches 2,
   the PATCH-076 rendered-duplicate signal). Immediate persisted read
   (evidence only).
4. **Settled persistence — Duplicate:** same settled method. Derive
   **`duplicateSlidePersisted`** — the settled persisted active
   frame-id set contains a further new id beyond the seeded pair and
   the Add frame. Record ever-appeared evidence (supplementary).
5. **Reload (single, at the end):** one real full page reload; reopen
   the presentation sidebar. Derive **`addSlideSurvivedReload`** (the
   Add row is still present) and **`duplicateSurvivedReload`** (a
   second row bearing the source title is still present). Record
   post-reload row count, titles, and persisted frame ids as
   supplementary evidence. Do NOT assert a fixed post-reload count —
   it is itself the observation.

PROHIBITED in this spec: `'Rename slide'`, `'Remove slide'`, deleting
or removing the duplicate or any slide (PATCH-076 already
characterized the deletion cascade; removal risks the shared-row
deletion of the original), dragging/moving any frame or element
(census #3 stale-geometry interplay must not enter scope), any
Excalidraw canvas mutation outside the two bound menu actions.

**Annotation contract (bind — exactly NINE literal fields):**

| Field | Definition |
|---|---|
| `addSlideVisible` | §2.1 boolean (15 s bound poll, row count 2→3) |
| `addSlidePersisted` | §2.2 settled-read boolean |
| `addSlideSurvivedReload` | §2.5 boolean |
| `duplicateSlideVisible` | §2.3 boolean (15 s bound poll, row count →4) |
| `duplicateRendersSourceChild` | §2.3 boolean (live shared-padlet render count reaches 2) |
| `duplicateSlidePersisted` | §2.4 settled-read boolean |
| `duplicateSurvivedReload` | §2.5 boolean |
| `classification` | derived, exactly one §3 enum value |
| `prefix` | real fixture prefix (must start with `patch-064-harness-patch-080-adddup-`) |

No tenth field. Supplementary raw evidence (new frame ids, titles,
immediate vs settled persisted frame-id sets, ever-appeared flags,
window/interval values, post-reload counts) is welcome in the
payload. All nine values observation-derived; any outcome — including
one contradicting PATCH-076 — is a valid diagnosis, not a failure.

## 3. Classification enum (bind, complete — derived in this order)

1. `!addSlideVisible || !duplicateSlideVisible || !duplicateRendersSourceChild`
   → **`mixed-slide-persistence-state`** (an action's real UI flow
   itself misbehaved; persistence claims would be unsound)
2. `addSlidePersisted && !duplicateSlidePersisted` →
   **`add-persists-duplicate-does-not`**
3. `!addSlidePersisted && !duplicateSlidePersisted` →
   **`neither-add-nor-duplicate-persists`**
4. `addSlidePersisted && duplicateSlidePersisted` →
   **`both-add-and-duplicate-persist`** (contradicts PATCH-076 —
   valid, record faithfully)
5. anything else → **`add-does-not-persist-duplicate-persists`**

No sixth literal. Do NOT hardcode the expected result; the reload
fields are recorded evidence, deliberately outside the enum
derivation.

## 4. Scope — allowed files (exactly ONE, new)

| File | Requirement |
|---|---|
| `e2e/characterization/drawing-slide-add-dup-persistence.spec.ts` | NEW file (absence verified at base `9a11a23` and worktree 2026-07-18 — confirm again before editing and before commit). One active test implementing §2. Existing harness (`createDisposableDrawingBoard('patch-080-adddup')` → prefix `patch-064-harness-patch-080-adddup-`), `registerDrawingCleanup(test)` + local `finally` per convention. Local UI helpers in-file, mirroring `drawing-slide-duplication.spec.ts` / `drawing-slide-rename-state.spec.ts` idioms — do NOT edit those specs or the harness. Per-test timeout ≤ 240 000 ms. |

Absence gates (all, at base AND worktree, before editing and before
commit): `e2e/characterization/drawing-slide-add-dup-persistence.spec.ts`
(the new file) and `e2e/characterization/drawing-slide-persistence.spec.ts`
(PATCH-077's never-created path — must REMAIN absent permanently;
recreating it is prohibited). No other new file may appear anywhere.

NO other file may change. Production source, the Excalidraw fork, the
harness, all existing specs, `playwright.config.ts`, and all `.fable5`
docs are PROHIBITED (governance files are CTO-only).

## 5. Immutable fences — 24 unique paths (Git blob IDs at base `9a11a23`)

Verification method (bind): fences are Git blob IDs — verify with
`git rev-parse 9a11a234835242cfb51360ca95762ee1790eec2f:<path>` and
equality at the current governance HEAD with
`git rev-parse HEAD:<path>`. Do NOT use raw file-byte SHA-1 or
`Get-FileHash`. (Working-tree spot checks may additionally use
`git hash-object <path>`, which produces the same blob ID.)

```text
playwright.config.ts                                       5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                         9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/PresentationPanel.tsx              02699748271241cacaca27fa93a8a78e7d8b2e0d
components/presentation/SlideThumbnail.tsx                 b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx         655244b443c3869173996cb21a77f7d67c41c64b
components/presentation/slide-renderer/resolveSlidePadlets.ts  5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 2d3b0dc3c46cdc03fde5aa0b8a949cd94e5d0d89
components/collabboard/canvas/layouts/DrawingLayout.tsx    5455597d486fd917c4983a18e47445e2b1c9314d
components/collabboard/menus/LineContextMenu.tsx           aaf16af230a76139377c4250f93485824000593e
lib/infra/presentation/slideOrder.ts                       e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts                  2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
lib/infra/drawing/lineBridge.ts                            f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/presentationBridge.ts                    b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/bridge.ts                                ed26c312610a386711f658662e82d29dd48c5890
lib/infra/collabboard/clonedPostMetadata.ts                7d6b6ee6e127a0db8161c09afdf31a54f44ac575
components/collabboard/canvas/hooks/useCanvasActions.ts    b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
e2e/characterization/drawingBridgeHarness.ts               7a94d7220df3d47f2fe6feefd2c8e31670af9f00
e2e/characterization/drawing-presentation.spec.ts          ddab83381605dbdcdda4d1a0cea3cafe010f55c5
e2e/characterization/drawing-line-bridge.spec.ts           7507b06af492bce7fca25a7a4daeee4400d428f3
e2e/characterization/drawing-duplication.spec.ts           87f88df19246eca5430db71987d573a1c7a5fa0b
e2e/characterization/drawing-harness-cleanup.spec.ts       5345c42d79e3c40286ba9902085977983a012e64
e2e/characterization/presentation-menu-pointer.spec.ts     50d68dff08730a231470ac48306702b02c3ca45b
e2e/characterization/drawing-slide-duplication.spec.ts     fc20ef8160417b6eeb59f4662ab89ceb1af5a167
e2e/characterization/drawing-slide-rename-state.spec.ts    513d07bfe99898455d13d7048a53da90c3b5d401
```

(PATCH-079's 22 fences plus the two files it landed —
`DrawingLayout.tsx` and the rename regression spec — now frozen at
their landed blobs.)

## 6. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` / 2
skipped credential-off** (exactly one active test), run THREE
sequential times with stable field values.
Carried (unchanged): rename-state regression 2/1/2; slide-duplication
2/1/2; menu-pointer 2/1/2; harness-cleanup 2/1/2; presentation 2
passed / 2 approved skips; duplication 2/1/2; line 4 passed / 4
skipped cred-off; helper 7/1; sanitizer 9/1; focused drawing 59/2;
full Vitest **448/43**;
`git diff --check`/tsc/boundaries/sequential verify+build green; zero
production imports of bridge/harness modules; 24/24 fences.
Cleanup zeros across **THIRTEEN** prefixes: the twelve tracked
prefixes plus `patch-064-harness-patch-080-adddup-`.

## 7. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline (inspect → attribute → stop only your own → verify
free); auth state only via `--project=setup` (the known
`e2e/.auth/user.json` staleness incident may recur — refresh via
setup; environmental, thrice-reproduced); no credential contents
anywhere; sequential `verify`/`build`, never under a dev server;
never commit generated artifacts (`test-results/`,
`playwright-report/`, JSON reporter output, scratch scripts).

## 8. Cleanup contract

`registerDrawingCleanup(test)` (shared owner) + local `finally`
defense with the idempotent zero-assertion. The Add and Duplicate
actions are expected to create NO new padlet rows (PATCH-076 evidence
for Duplicate; Add creates an empty frame) — if a row IS created,
record it as evidence and rely on the board-scoped fixture delete.
NO Remove action; NO deletion of the duplicate (the PATCH-076 cascade
must not be re-entered). Post-run prefix-scoped residue checks must
be zero for all THIRTEEN §6 prefixes. Test-timeout kill → sweep and
report per the PATCH-074 rule.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (24/24, blob-ID method), or any §4
  absence gate differs;
- ANY existing file must change (production, fork, harness, spec,
  config), or a SECOND new file is required;
- `'Add slide below'` or `'Duplicate slide'` cannot be driven
  deterministically through the real menu UI;
- `'Remove slide'` or `'Rename slide'` would need to be exercised, or
  the duplicate would need to be deleted;
- any observation requires force click, `dispatchEvent`, coordinate
  workaround, direct callback invocation, direct product-state
  mutation, or a per-test timeout above 240 000 ms;
- persistence settlement cannot be observed deterministically;
- the observed combination requires a classification outside the §3
  enum (report, do not extend);
- a second distinct defect surfaces (report only, do not fix) — in
  particular the census #3 stale-geometry interplay;
- ANY fix, guard, or production improvement seems "obvious" —
  including any part of the PATCH-076 §0.B.2 deep-clone design. This
  patch observes; the fix is gated on its result.

## 10. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted single-new-file diff (re-derives the blob ID,
re-verifies 24/24 fences + all absence gates + one-file scope,
re-runs all §6 modes, extracts the nine-field annotation from a fresh
JSON reporter run, verifies every field is observation-derived and
the classification follows the §3 order, and verifies the prohibited
actions are never driven); explicit PASS required; NO commit before
PASS; then commit with the bound message and push; Fable closes,
rules on the suppression mechanism, and decides whether the census #2
deep-clone fix is ready for authorization.

**Bound commit message (verbatim):**
`test(e2e): characterize add/duplicate slide persistence boundary (PATCH-080)`

## 11. Required final report

New file + blob ID; all nine annotation fields with observed values;
immediate vs settled persisted frame-id evidence for BOTH actions
(including ever-appeared flags); reload outcome for both; the derived
classification and what it implies for the suppression mechanism and
the census #2 fix gate; all §6 gate totals; 24-fence result + all
absence gates + one-file scope proof; cleanup proof across thirteen
prefixes; production-import grep; commit hash + push status after
PASS.

## 12. Closure record (Fable CTO, 2026-07-18)

**Landed:** commit `34d9d54371a0bcc6dd360dc06394130fad918afe`
(`test(e2e): characterize add/duplicate slide persistence boundary
(PATCH-080)`), exactly one new file at blob
`9a6c7b42a6b476fe74d74483a7fa057a4cf61e7e`. HEAD == origin/main.
Sonnet independent review: **PASS** (24/24 blob-ID fences, both
absence gates, one-file scope, three independent live reproductions
byte-identical to the implementer's — zero drift; the critical
live-child-render measurement was independently proven trustworthy
via an unscoped total-card count that stayed at 4 even after a full
zoom-to-fit, ruling out the viewport/virtualization confound).

**Final nine-field result (all six runs):** `addSlideVisible: true`,
`addSlidePersisted: true`, `addSlideSurvivedReload: true`,
`duplicateSlideVisible: true`, `duplicateRendersSourceChild: false`,
`duplicateSlidePersisted: false`, `duplicateSurvivedReload: false`,
**`classification: mixed-slide-persistence-state`**, `prefix`:
fixture-specific.

**Final diagnosis:** Add slide below creates a distinct visible frame
that persists after settlement and survives reload with the same
frame identity. Duplicate creates a distinct visible sidebar row (and
a live canvas frame-name label with a fresh frame id) but produces NO
second drawing-canvas embeddable render, NEVER reaches the settled
persisted scene (not even transiently — `sharedSettledDuplicateLinkCount`
stayed 1), and does not survive reload. Since Add and Duplicate share
the append-style `updateScene` mutation shape and Add persists, the
append shape alone is NOT the failure: the suppression is
**Duplicate-specific or clone-shape-specific**. No production fix was
implemented.

**PATCH-076 discrepancy ruling (bound):** PATCH-076's
`duplicateRendersSameChild: true` was measured through
**FullscreenPresentation** content resolution
(resolver/planner-driven), while PATCH-080 measured **direct
drawing-canvas embeddable rendering** (`renderEmbeddable` →
`DrawingEmbeddableCard`). These are separate rendering pipelines; the
discrepancy is flow-dependent, not a proven locator defect in either
spec. Duplicate NON-persistence is confirmed across both patches;
PATCH-076's live-render dimension was not fully reproduced and both
findings stand in their own pipeline.

**Accepted deviation (recorded, non-blocking, retroactively bound):**
the landed spec's mixed-state gate is a strict superset of §3 rule 1
— it additionally routes persistence/reload INCONSISTENCY
(`persisted but did not survive reload`, either action) to the
conservative `mixed-slide-persistence-state` bucket. These extra
checks never weaken the gate, introduced no new literal, and altered
no observed result (the bound rule-1 condition alone already
triggered `mixed` in every run via `duplicateRendersSourceChild:
false`). Sonnet reviewed and accepted as non-blocking; the CTO hereby
binds the stricter gate as the accepted §3 semantics for this landed
spec.

**Gates (all bound totals met):** new spec 2/1/2 ×3 stable; carried —
rename-state 2/1/2, slide-duplication 2/1/2, menu-pointer 2/1/2,
harness-cleanup 2/1/2, presentation approved totals, duplication
2/1/2, line-bridge approved totals; deterministic — helper 7/1,
sanitizer 9/1, focused drawing 59/2, full Vitest 448/43,
typecheck/boundaries/verify/build/`git diff --check` green. Cleanup:
all THIRTEEN tracked prefixes 0/0/0; no Remove action; duplicate
never deleted; no reporter/Playwright artifacts; port 3000 free. The
`e2e/.auth/user.json` staleness incident recurred once more
(`drawing-duplication --no-deps`), resolved via the sanctioned
`--project=setup` refresh — environmental, four independent
reproductions to date.
