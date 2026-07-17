# PATCH-076 — Duplicate-Slide Shared `padlet://` Reference Diagnosis

**Status:** SPEC AMENDED (Amendment 1, §0.A, 2026-07-18) —
**diagnosis-only** (NO production change, NO harness change, NO fix —
a fix is BLOCKED on the §3 product ruling). First candidate reviewed
by Sonnet: **PASS WITH REQUIRED CHANGES** — the two required
corrections are authorized and bound in §0.A; the corrected candidate
requires a fresh Sonnet review before commit.
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Base commit (bind, verify before editing):**
`9cde5cdb4583cddb31364315138fa3daa872ac5d`
(`fix(presentation): close per-slide menu on Escape (PATCH-075)`)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize duplicate-slide shared padlet link behavior (PATCH-076)`

---

## 0. Fresh census (from HEAD `9cde5cd`, superseding all prior censuses)

| # | Candidate | Classification | User-visible | Deterministic repro | Characterized | Owner | Files (est.) | Design ruling needed | Diagnosis-first / fix-ready | Architecture risk | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Duplicate `padlet://` links | defect (data-sharing + deletion-cascade data loss, P3 family) | yes — "Duplicate slide" produces a slide whose embedded container silently SHARES the original's underlying padlet row; editing either edits both, and deleting either copy can destroy the shared row and strand the original | yes — code-derived: `handleDuplicateSlide` (`DrawingLayout.tsx:1408-1435`) spreads the child element, preserving `link: padlet://<originalId>` verbatim while regenerating only `id`/`x`/`frameId` | none — `drawing-duplication.spec.ts` covers canvas post/container Ctrl+D duplication (which creates a NEW padlet row); the slide-duplication path is uncharacterized | `DrawingLayout.tsx` (dup at `:1408`, delete-cascade at `:1078-1107`, orphan sweep at `:1615-1636`, position-sync keyed by link at `:1059-1076`/`:1642+`), resolver `resolveSlidePadlets.ts` | 1 new spec (diagnosis) | **yes** — clone-vs-reference semantics undefined (§3); no doc states intended behavior | **diagnosis-first (SELECTED)** | low (observation only) | **1 (selected)** |
| 2 | Line-follow behavior | hardening / unclear | unconfirmed | not established | `drawing-line-bridge.spec.ts` covers selection/hit-testing/rendering only | `lineBridge.ts` + `DrawingLayout.tsx` | unknown | **yes** — `lineBridge.ts` contains ZERO attachment/anchor/endpoint semantics (verified by grep at HEAD): lines are geometric only; no attachment contract exists in code or docs, so "desired geometry on container move/resize" is undefined | diagnosis-first, no live complaint | medium (would need a new attachment contract) | 4 |
| 3 | Comparator parity/consolidation | refactor-only | no | n/a | parity-locked by unit test (PATCH-072) | `slideOrder.ts` vs `PresentationPanel.tsx` inline | n/a | no | **not eligible** — `slideOrder.ts:7-8` already guards non-finite via `Number.isFinite` → `POSITIVE_INFINITY` fallback; frames bind `order: null`, never `NaN`; no non-finite value is reachable from real persisted/runtime data; consolidation for its own sake is prohibited by standing instruction | none | deprioritized |
| 4 | AI images in presentation | diagnosis-blocked | unconfirmed | **no** — the approved skip is verbatim unchanged at `drawing-presentation.spec.ts:1357` ("no deterministic PATCH-064 AI-image fixture support exists in the approved harness"); harness unchanged since PATCH-074 Stage 1 (fence hash matched) — no fixture capability has appeared | approved skip | presentation slide-renderer | unknown | n/a until a fixture exists | blocked — harness capability first | 6 |
| 5 | Overlap fallback | already-characterized intentional fallback | unconfirmed | the fallback path (`resolveSlidePadlets.ts:34`, `frameId ? match : overlapsFrame`) is exercised only when `frameId` is missing; no evidence it is currently wrong | PATCH-064 census tag | `resolveSlidePadlets.ts` | unknown | possibly | diagnosis-first, low urgency | low | 5 |
| 6 | Uploaded-image storage cleanup | test-infrastructure gap | no product impact | approved skip verbatim unchanged at `drawing-presentation.spec.ts:1352` (deterministic fixture uses `public/templates/moodboard.png`, creates no storage object) | approved skip | harness | harness-only | n/a | test-infra only — must not be bundled with a product-defect patch | none | 7 |
| 7 | Connections side-panel roadmap | **feature** | n/a | n/a | n/a | n/a | large | yes | feature, NOT stabilization — kept deferred; stabilization is demonstrably not complete (PATCH-075 fixed a live defect this week; candidate #1 is a live data-loss-class defect); no roadmap decision is made here | high (new panel, search, filters) | deferred (feature) |
| 8 | New deterministic defect from PATCH-075 verification | n/a | n/a | n/a | n/a | n/a | n/a | n/a | **none surfaced** — Sonnet's PATCH-075 review recorded no second defect | n/a | n/a |
| 9 | Membership-union consolidation | refactor | no | n/a | n/a | dual tracking | large | yes | deferred by `.fable5/CLAUDE.md` non-negotiable rule #9 (planned migration phase) | high | deferred by doctrine |

**Selection:** #1 under **OPTION B (diagnosis-only)**. The defect is
code-derived-deterministic and its worst consequence is P3-class data
loss, but the correct behavior is a genuine unresolved product
question (§3) — authorizing a fix now would be guessing semantics.
Bind the question, characterize the actual behavior, decide after.

**Carried non-blocking follow-up (unchanged):** the PATCH-074
annotation's stale `harnessChanged: false` remains pending — it folds
into the next patch that touches `drawing-harness-cleanup.spec.ts`.
PATCH-076 does NOT touch that file, so the follow-up stays open. Do
not fix it in this patch.

---

## 0.A Amendment 1 — persistence diagnosis contract (Fable CTO, 2026-07-18)

### 0.A.1 Review record

Sonnet independently reviewed the first uncommitted candidate
(`e2e/characterization/drawing-slide-duplication.spec.ts`, hash
`cf58547c5db9abd3c172cc24693160f7faa45461`). Verdict:
**PASS WITH REQUIRED CHANGES.**

Confirmed by the reviewer with live evidence: exact one-file scope;
candidate hash exact; absence contract valid; 22/22 fences matched;
real `'Duplicate slide'` and `'Remove slide'` menu actions (no
synthetic events, no force clicks, real confirmation dialog); one
active test; shared cleanup owner + local `finally`; no product fix;
PATCH-076 totals 2/1/2 green; all carried browser totals green; all
deterministic gates green (helper 7/1, sanitizer 9/1, focused 59/2,
full 448/43, verify+build); cleanup zero across ten prefixes; no
artifacts; PATCH-077 not started.

**Key new finding (reviewer-verified twice, including once with an
explicit 3.5 s wait beyond the app's ~2 s save debounce):** the
duplicated slide is **never persisted** to the master scene at all —
`duplicateSlideId`/`duplicateChildSceneId`/`duplicateLinkValue` were
`null` in every persisted-scene read, immediate AND settled. The live
client renders the duplicate (and it resolves the shared backing
child), but a reload would silently lose the duplicate entirely. The
existing `sharedLinkEmbeddableCount: 1` therefore counts only the
source's own persisted embeddable and must not be read as proof of a
second persisted shared-link reference.

Two required corrections were found; both are accepted and bound
below. Both are additive/derivation-hardening changes inside the one
allowed file; neither expands scope.

### 0.A.2 Required change 1 — explicit persistence observation (bind)

Add ONE literal annotation field:

- **`duplicatePersistedToDatabase`** (`boolean`) — derived EXACTLY as
  `duplicateSlideId !== null && duplicateChildSceneId !== null &&
  duplicateLinkValue !== null`, where those three identities are taken
  from the **settled** persisted-master-scene read defined in §0.A.4
  (never from the immediate post-UI read alone). Expected value for
  the currently observed behavior: **`false`**. If the duplicate DOES
  appear in the persisted scene at any point during the settlement
  window, the three identity fields must bind to it and this field
  becomes `true` — a valid, faithfully recorded outcome.

The existing seven fields are preserved unchanged in name; two get
hardened derivations (§0.A.4, §0.A.5) but identical meaning shape.

### 0.A.3 Classification ruling (bind) — OPTION B, enum amended

CTO ruling: with `duplicatePersistedToDatabase: false` proven,
`shared-reference-with-deletion-cascade` **materially understates the
persistence finding** — the observed behavior is not two persisted
references sharing a row; it is a live-client-only duplicate whose
removal still cascades onto the shared backing row. The enum gains
one deliberately chosen literal. Amended decision table (bind,
complete, in order):

1. `newPadletRowsAfterDuplicate > 0` → **`independent-clone`**
2. else if `removeDuplicateDeletedSharedRow && originalContainerLostAfterRemove`:
   - `duplicatePersistedToDatabase === true` →
     **`shared-reference-with-deletion-cascade`**
   - `duplicatePersistedToDatabase === false` →
     **`unpersisted-duplicate-with-deletion-cascade`**
3. else → **`shared-reference-deletion-guarded`**

Expected classification for the currently observed behavior:
**`unpersisted-duplicate-with-deletion-cascade`**.

Documented scope of the term "shared reference" wherever it appears
in this patch: proven at the **live client rendering and
deletion-behavior level** (the rendered duplicate resolves the same
backing child; removing it deletes the shared row) — NOT as two
persisted embeddables. The persistence distinction is carried solely
by `duplicatePersistedToDatabase`.

### 0.A.4 Persistence-settlement proof (bind)

The settled persisted state must be established deterministically,
not by a single immediate read or a lone sleep:

- After the duplicate row is visible in the sidebar, POLL the
  persisted master scene (re-fetch + re-parse) at intervals of
  ≤ 1 000 ms across a bound settlement window of ≥ 6 000 ms total
  (strictly exceeding the app's ~2 000 ms save debounce with margin),
  recording on each iteration whether a second frame bearing the
  source slide title (or any embeddable with the source link outside
  the source frame) has appeared.
- The FINAL read of that window is the **settled read** — the sole
  derivation basis for `duplicateSlideId`, `duplicateChildSceneId`,
  `duplicateLinkValue`, `duplicatePersistedToDatabase`, and
  `sharedLinkEmbeddableCount`.
- The immediate first read MAY additionally be recorded (evidence
  fields) but must not drive any of the eight bound fields.
- The final report must distinguish: immediate persisted state,
  settled persisted state, and whether the duplicate EVER appeared
  during the window.
- A single sleep-then-read is PROHIBITED; the per-test timeout stays
  240 000 ms (no inflation — the added polling fits).

### 0.A.5 Deterministic shared-row deletion proof (bind)

Replace the one-shot post-removal row read with
`expect.poll(..., { timeout: 15_000 })` that repeatedly queries the
EXACT known source backing-row ID (`fetchBoardPadletById`-style,
`.eq('id', sourceContainerId)`) until it is absent. Required
properties: exact row ID only; no prefix-wide query; no broad
deletion; no whole-test timeout increase; no retry of the UI action;
no swallowed query error; runs after the real `'Remove slide'`
action and completes before local `finally`/shared `afterEach`
cleanup; `removeDuplicateDeletedSharedRow` derives from the poll
outcome. If the row remains present at poll expiry, record
`removeDuplicateDeletedSharedRow: false` faithfully and classify per
the §0.A.3 table (a guarded outcome is valid) — do not fail the
diagnosis solely because the cascade did not fire, and do not retry.

### 0.A.6 Amended annotation contract (bind — exactly EIGHT fields)

| Field | Definition |
|---|---|
| `newPadletRowsAfterDuplicate` | Count of padlet rows in the fixture board (`.eq('board_id', …)`) after duplication whose IDs were NOT present before, via Set-based ID diff — never a bare total-count comparison. |
| `sharedLinkEmbeddableCount` | The number of persisted live-scene embeddables carrying the source child's exact `padlet://` link after duplication, taken from the SETTLED read (§0.A.4). **A value of 1 may mean only the source embeddable persisted; it must NOT be interpreted as proof of an additional persisted duplicate reference — `duplicatePersistedToDatabase` carries that distinction.** |
| `duplicateRendersSameChild` | Whether the duplicated slide, launched through the real presentation UI, visibly renders the seeded source child (live client evidence). |
| `duplicatePersistedToDatabase` | §0.A.2 — settled-read conjunction `duplicateSlideId !== null && duplicateChildSceneId !== null && duplicateLinkValue !== null`. |
| `removeDuplicateDeletedSharedRow` | §0.A.5 — exact-ID `expect.poll` absence outcome for the known source backing-row ID after the real Remove action, before cleanup. |
| `originalContainerLostAfterRemove` | Whether the surviving original slide has lost its rendered container after duplicate removal (primary evidence: live presentation launch of the surviving row; scene/resolver observations may corroborate). |
| `classification` | §0.A.3 amended four-value enum, derived by the bound decision table. |
| `prefix` | The real fixture prefix used (must start with `patch-064-harness-patch-076-dup-`). |

No ninth field. Supplementary raw evidence (identity values, row
counts, resolver/planner observations, immediate-vs-settled records)
stays welcome in the annotation payload but the eight names above are
the bound contract.

### 0.A.7 Newly surfaced product question (record only, unresolved)

In addition to the §3 clone-vs-reference question: **should duplicated
slides be persisted as independent scene/frame objects, and at what
point?** (Currently the duplicate exists only in the live client and
is silently lost on reload.) No fix is authorized; both questions go
to the owner after this diagnosis lands.

### 0.A.8 Scope, totals, and stop conditions (amended)

Allowed implementation file remains EXACTLY
`e2e/characterization/drawing-slide-duplication.spec.ts` (still a new
file; absence contract unchanged). Hash
`cf58547c5db9abd3c172cc24693160f7faa45461` is the PRE-correction hash
and will change; the post-correction hash is NOT bound in advance and
must be measured at review. Unchanged: base
`9cde5cdb4583cddb31364315138fa3daa872ac5d`; all 22 §5 fences; expected
browser totals (new spec 2/1/2); carried browser totals; deterministic
totals (full Vitest 448/43); environment contract; cleanup contract
(ten prefixes); bound implementation commit message
`test(e2e): characterize duplicate-slide shared padlet link behavior (PATCH-076)`.

ADDITIONAL hard stops (on top of §9): a second file is required; any
existing file must change; a production fix is needed; a harness
change is needed; the classification cannot be supported honestly
from the observations; persistence settlement cannot be observed
deterministically; exact backing-row deletion cannot be polled
deterministically; any timeout inflation; retrying the UI action;
force click; `dispatchEvent`; direct callback invocation; direct
product-state mutation; another defect entering scope (report only).

The corrected candidate goes back to Sonnet for a fresh independent
review (re-derive hash, re-verify 22/22 fences + one-file scope,
re-run all modes, re-extract the eight-field annotation, verify the
settled-read and exact-ID-poll derivations); explicit PASS required
before the bound commit.

---

## 1. Defect statement (code-derived evidence at base `9cde5cd`)

`handleDuplicateSlide` (`DrawingLayout.tsx:1408-1435`) duplicates a
slide by cloning the frame and its children with fresh `id`s, shifted
`x`, and the new `frameId` — but the object spread preserves every
other field verbatim, including `link`. A duplicated `embeddable`
therefore keeps `link: "padlet://<originalPadletId>"`: **two scene
embeddables now reference one underlying padlet row.** No new padlet
row is created by slide duplication (contrast: canvas Ctrl+D
duplication, `drawing-duplication.spec.ts`, DOES create a new row).

Downstream mechanics that make this consequential (all at base):

- **Shared live content:** `resolveSlidePadlets.ts:22-25` resolves
  each embeddable's link by padlet ID — both slides render the SAME
  row's live content; editing "either" container edits both.
- **Deletion cascade:** the change handler
  (`DrawingLayout.tsx:1078-1107`) reacts to any deleted embeddable
  with a `padlet://` link by calling `onDeletePadlet(padletId)` (the
  only guard is `metadata.parentId`). Removing the duplicated slide
  marks its embeddable `isDeleted` (`handleRemoveSlide:1437-1446`) —
  which can delete the SHARED row out from under the original slide.
- **Orphan sweep:** the reconciliation effect
  (`DrawingLayout.tsx:1615-1636`) then removes any live embeddable
  whose link no longer matches an existing root padlet — the ORIGINAL
  slide's container would be silently swept from the scene. Combined:
  "duplicate a slide, remove the duplicate, lose the original's
  container" — a P3 (never lose user work) violation if observed.
- **Position-sync contention:** drag tracking and the position lock
  are keyed by padlet ID derived from the link
  (`:1059-1076`, `:1670-1682`), and the sync effect maps padlet → all
  embeddables sharing that link (`padletsByLink`, `:1607`, `:1642`) —
  two copies contend for one persisted `position_x/y`.

## 2. Diagnosis boundary (bind — observe, do NOT fix)

> **Amendment 1 note:** the field table below is SUPERSEDED by the
> eight-field contract in §0.A.6, the classification enum by §0.A.3,
> and the derivation rules by §0.A.4/§0.A.5. The behavioral flow
> (real UI actions, observation-only, contradiction-is-valid) is
> unchanged.

ONE new characterization spec proves the user-visible consequences
end-to-end through the real UI (per-slide ⋮ menu actions
`'Duplicate slide'` and `'Remove slide'` — exact accessible names per
`presentation-menu-pointer.spec.ts:16-23`), against a real harness
board, recording an annotation with these LITERAL field names
(observation-derived values, no hardcoded literals):

| Field | Meaning |
|---|---|
| `newPadletRowsAfterDuplicate` | count of NEW padlet rows in the fixture board after 'Duplicate slide' (DB-derived) |
| `sharedLinkEmbeddableCount` | number of live scene embeddables carrying the original child's `padlet://` link after duplication (persisted-scene-derived) |
| `duplicateRendersSameChild` | whether the duplicated slide resolves/renders the SAME underlying child content as the original |
| `removeDuplicateDeletedSharedRow` | whether removing the DUPLICATED slide deleted the shared padlet row from the DB |
| `originalContainerLostAfterRemove` | whether the ORIGINAL slide's container is gone (scene and/or render) after the duplicate was removed |
| `classification` | one of `shared-reference-with-deletion-cascade` \| `shared-reference-deletion-guarded` \| `independent-clone` (derived from the above) |
| `prefix` | the real fixture prefix used |

All five behavior fields must be derived from live observation (DB
reads with the spec's service client + persisted scene JSON + rendered
UI), never asserted as assumptions. If observed behavior CONTRADICTS
the §1 hypothesis (e.g. a new row IS created, or deletion is guarded),
record it faithfully and classify accordingly — that is a valid
diagnosis outcome, not a failure. Do not improvise a fix either way.

## 3. Bound product question (blocks any Stage 1 fix)

> When a user duplicates a slide containing an embedded container,
> should the duplicate (a) **deep-clone** the referenced container
> padlet(s) into new rows (copied content, fully independent
> thereafter), (b) intentionally keep a **shared reference** (live
> mirror) — in which case deleting any one embeddable must NOT delete
> the shared row while other references remain, or (c) something else
> (e.g. prompt the user)?

No doc answers this (verified: no `.fable5/docs` statement on
duplicate-slide semantics exists at base). The CTO + owner decide
AFTER this diagnosis lands. Rejected now: guessing (a) or (b) and
shipping a fix in the same patch.

## 4. Scope — allowed files (exactly ONE, new)

| File | Requirement |
|---|---|
| `e2e/characterization/drawing-slide-duplication.spec.ts` | NEW file (absence at base VERIFIED — confirm again before editing and before commit). One active characterization test implementing §2. Uses the existing harness (`createDisposableDrawingBoard('patch-076-dup')` → prefix `patch-064-harness-patch-076-dup-`), `registerDrawingCleanup(test)` per PATCH-074 Stage 1 convention, plus the local `finally` defense. Local UI helpers (menu-open, row lookup) may be written in-file, mirroring `presentation-menu-pointer.spec.ts` idioms — do NOT edit that spec or the harness to share them. |

NO other file may change. Production source, the harness, all
existing specs, `playwright.config.ts`, and all `.fable5` docs are
PROHIBITED (governance files are CTO-only).

## 5. Immutable fences — 22 unique paths (hashes at `9cde5cd`, measured fresh)

```text
playwright.config.ts                                       5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                         9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/PresentationPanel.tsx              02699748271241cacaca27fa93a8a78e7d8b2e0d
components/presentation/SlideThumbnail.tsx                 b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx         655244b443c3869173996cb21a77f7d67c41c64b
components/presentation/slide-renderer/resolveSlidePadlets.ts  5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 2d3b0dc3c46cdc03fde5aa0b8a949cd94e5d0d89
components/collabboard/canvas/layouts/DrawingLayout.tsx    b470a888e4015e57b757ba0c57a041f1b7d8adb9
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
```

New-file absence gate: `e2e/characterization/drawing-slide-duplication.spec.ts`
must NOT exist at base (verified 2026-07-17); no OTHER new file may
appear anywhere. Verify fences + absence before editing and before
commit.

## 6. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` / 2
skipped credential-off** (exactly one active test; setup project
accounts for the second dependency pass).
Carried (unchanged): menu-pointer 2/1/2; PATCH-074 spec 2/1/2;
presentation 2 passed / 2 approved skips; duplication 2 w/deps / 1
`--no-deps` / 2 skipped cred-off; line 4 passed / 4 skipped cred-off;
helper 7/1; sanitizer 9/1; focused drawing 59/2; full Vitest
**448/43** (no unit files change); `git diff --check`/tsc/boundaries/
sequential verify+build green; zero production imports of
bridge/harness modules; 22/22 fences.
Cleanup zeros across **TEN** prefixes: the nine tracked prefixes plus
`patch-064-harness-patch-076-dup-`.

## 7. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline (inspect → attribute → stop only your own → verify
free); auth state only via `--project=setup`; no credential contents
anywhere; sequential `verify`/`build`, never under a dev server; never
commit generated artifacts (`test-results/`, `playwright-report/`,
JSON reporter output, scratch scripts).

## 8. Cleanup contract

`registerDrawingCleanup(test)` (shared owner) + local `finally`
defense, per PATCH-074 Stage 1 convention. The in-test intentional
deletion (if the cascade fires) must remain safe under cleanup —
`cleanupDrawingFixture` deletes are idempotent no-ops on missing
rows. Post-run prefix-scoped residue checks must be zero for all TEN
prefixes. If a run is killed by test timeout, sweep and report per the
PATCH-074 rule.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (22/22), or the new-file absence check
  differs;
- ANY existing file must change (production, harness, spec, config);
- a SECOND new file is required;
- `'Duplicate slide'` or `'Remove slide'` cannot be driven
  deterministically through the real per-row ⋮ menu;
- any observation requires a force/dispatch/coordinate workaround or
  a timeout increase;
- the fixture, the persisted-scene read, or cleanup becomes
  nondeterministic;
- the observed behavior requires interpretation beyond the §2 field
  definitions (report, do not extend the schema);
- a second distinct defect surfaces (report only, do not fix);
- ANY fix, guard, or production improvement seems "obvious" — this
  patch observes; the §3 ruling comes first.

## 10. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted single-new-file diff (re-runs all §6 gates, re-derives
all hashes, re-verifies 22/22 fences + new-file-only scope, extracts
the annotation from a fresh JSON reporter run and checks every §2
field is present, literally named, and observation-derived); explicit
PASS required; NO commit before PASS; then commit with the bound
message and push; Fable closes and takes the §3 question to the owner.

**Bound commit message (verbatim):**
`test(e2e): characterize duplicate-slide shared padlet link behavior (PATCH-076)`

## 11. Required final report

New file + hash; every §2 annotation field with its observed value;
the derived `classification`; whether the §1 hypothesis held or was
contradicted (either is valid); all §6 gate totals; 22-fence result +
new-file-only scope proof; cleanup proof across ten prefixes;
production-import grep; commit hash + push status after PASS.
