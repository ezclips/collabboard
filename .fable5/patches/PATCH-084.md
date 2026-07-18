# PATCH-084 — Drawing Save Wire-Level Diagnosis

**Status:** SPEC READY — **diagnosis-only** (NO production change, NO
harness change, NO fork change, NO fix, NO instrumentation seam, NO
request interception/modification — pure read-only Playwright
request/response/console observation; if the question cannot be
answered that way, STOP and report rather than adding a seam).
Successor to PATCH-083 and the FINAL diagnosis before the save-path
fix: the entire failure surface of the drawing content save is now
statically proven SILENT (closure record, PATCH-083 §12), so only
wire-level evidence can distinguish "save never sent" from "save
sent and rejected" from "save sent, accepted, then overwritten".
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing — expected to authorize the
save-path production fix (census #2) directly from this result.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`0683b965d3821088a4ed9812693f408e0dcfa280`
(`test(e2e): characterize drawing scene save supersession (PATCH-083)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize drawing save wire-level behavior (PATCH-084)`

---

## 0. Census at authoring (2026-07-18, from `0683b96`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Drawing save wire-level root-cause diagnosis (Flows A/B/C + network observation)** | defect diagnosis | **SELECTED (this patch)** — the FINAL evidence gate before the fix |
| 2 | Save-path production fix (debounce supersession / rapid-action coalescing; semantics bound in §7) | defect | BLOCKED on #1 — three wire outcomes demand three different fixes |
| 3 | Duplicate deep-clone production fix (PATCH-076 §0.B.2 OPTION A semantics) | defect | after #2 — persistence must be durable before clone-row semantics are testable end-to-end |
| 4 | Silent save-error handling (resolved-error rollback is logging-free; `updateDrawingLayoutPadlet` silently no-ops on missing id) | defect (characterized read-only at 083 closure) | fold into #2's fix scope decision; violates P3 visibility |
| 5 | Dirty payload / generation-check ownership | defect (partially mapped) | subsumed by #1's wire evidence |
| 6 | Stale payload replacement / last-write-wins ownership | defect (uncharacterized) | subsumed by #1 (classification value 5) |
| 7 | Frame-geometry sidebar staleness diagnosis | defect (uncharacterized) | after the persistence family |
| 8 | Frame-geometry/sidebar-position fix | defect | after #7 |
| 9 | Line-follow behavior | hardening | deferred |
| 10 | Uploaded-image storage cleanup | hardening | deferred (approved skip) |
| 11 | AI images in presentation | feature | deferred (approved skip) |
| 12 | Overlap fallback | hardening | deferred |
| 13 | Connections side-panel planning | feature | deferred until stabilization ruled complete |

New deterministic defect exposed by PATCH-083: the silent-failure
surface itself (#4) — discovered read-only at closure, folded into
this patch's question and the eventual fix.

## 1. Question (bind) + statically proven save-chain facts

PATCH-083 proved behaviorally: isolated Add persists (~2.1 s,
matching the 2 s debounce); rapid Add→Duplicate persists NEITHER new
frame; Duplicate-only persists nothing; no bound console error ever
fires. Closure inspection then statically mapped the ONLY content
save chain:

`handleChange` (arms `dirtyDataRef` + 2000 ms debounce;
`DrawingLayout.tsx` ~1168–1187) → `performSave` →
`saveDrawingSnapshot` (~988–1031; generation guard; catch logs
`'Failed to save drawing to master padlet'` ONLY on rejection) →
`onUpdatePadlet` = `handleDrawingLayoutUpdatePadlet`
(`CanvasClient.tsx` ~4948–4957) → `updateDrawingLayoutPadlet`
(`useCanvasData.ts` 566–590) → `canvas.updatePostFields`
(`lib/domain/canvas/posts.ts` 660–665) →
`SupabasePostsRepository.updateFieldsById`
(`lib/infra/canvas/postsRepository.ts` 142–150) →
`supabase.from('padlets').update(fields).eq('id', …)`.

Statically PROVEN silent-failure facts:

- `updateDrawingLayoutPadlet` NEVER rejects. A resolved Supabase
  error (`code:'unavailable'`) takes a silent local rollback with NO
  logging; only a thrown 'unknown' logs — and logs
  `'Failed to update padlet:'`, a different string from the one
  PATCH-083 listened for. DrawingLayout's own catch is unreachable
  through this path.
- `updateDrawingLayoutPadlet` silently returns WITHOUT writing when
  the target id is absent from `padletsRef` (line 568).
- Exactly one generation-bump site exists (import path, not
  triggered); the debounce timer is only ever reset by a newer
  onChange (payload replaced by the NEWER scene), unmount (which
  saves), or import.

Therefore PATCH-083's `saveErrorObserved:false` cannot distinguish:
(a) the content save was NEVER SENT to the network (client-side
suppression — arming skipped, timer cancelled, or early return);
(b) the save WAS SENT and the server REJECTED it (silent rollback);
(c) the save was sent and ACCEPTED but a later stale write
overwrote it. These three demand different fixes. Question (bind):
for each flow, does an HTTP write to the `padlets` table containing
the new frame id(s) leave the browser, with what status, and is any
later content write missing those ids?

## 2. Diagnosis boundary (bind — observe, do NOT fix)

ONE new characterization spec, ONE active test, running the same
THREE bounded flows as PATCH-083 (identical seeding, identical real
menu actions, identical VERIFIED fit, three sequential disposable
boards, each cleaned in its own try/finally before the next is
created), adding two read-only observation channels:

**Network capture (bind, read-only):** per flow, register
`page.on('request')` and `page.on('response')` BEFORE opening the
board. Record every request whose URL contains `/rest/v1/padlets`
(any method) issued between board open and the end of the settlement
window: method, URL (query included), a BOUNDED body summary
(booleans: contains addFrameId / contains duplicateFrameId /
contains `"content"`; plus byte length — never the full scene JSON
in the primary annotation; the evidence annotation may carry bodies
truncated to 2 000 chars), response status, response body truncated
to 500 chars, and elapsed-ms timestamps. **PROHIBITED:**
`page.route`, request modification, request blocking, mocking,
fulfilling, or any interception that could alter timing or
delivery — pure event listeners only. Listener removal at flow end;
no cross-flow contamination.

**Console capture (bind, read-only):** as PATCH-083, but with TWO
bound exact substrings, each derived separately:
`Failed to save drawing to master padlet` and
`Failed to update padlet:`.

**Persisted settlement (bind):** per flow, the PATCH-083 method —
persisted frame-id polls at ≤1000 ms cadence for a window of
≥20 000 ms after the final action, settled = final ≥6000 ms stable.
(The full time series goes to the evidence annotation.)

**Flow A (first board) — Add only (control):** baseline → real
`Add slide below` (exact seven-item menu verification) → capture
`addFrameId` (bounded live-label diff ≤5 s) → VERIFIED fit →
settlement window with network capture running throughout.
**Flow B (second board) — rapid Add→Duplicate:** as PATCH-083
(Duplicate within 5 s of the Add row appearing; source row
re-queried after Add; `addFrameId` and `duplicateFrameId` captured
distinctly, duplicate id derived post-fit excluding `addFrameId`) →
one combined settlement with capture running.
**Flow C (third board) — Duplicate only:** baseline → real
`Duplicate slide` → `duplicateFrameId` post-fit → settlement with
capture running.

PROHIBITED in every flow: `Rename slide`, `Remove slide`, reload,
deletion, FullscreenPresentation, drag/resize, scene import, any
`excalidrawAPI` call from the test, direct callback invocation,
direct product-state mutation, force click, `dispatchEvent`,
coordinate hacks beyond the bound verified-fit click, retrying
Add/Duplicate clicks, artificial waits beyond bounded polls.

## 3. Annotation contract (bind)

PRIMARY annotation: THIRTY-FOUR fields, each exactly once, every
value observation-derived (never hardcoded):

Flow A (9): `flowA_addRowAppeared`, `flowA_zoomToFitApplied`,
`flowA_addFrameLiveAfterFit`, `flowA_addContentWriteAttempted` (a
`/rest/v1/padlets` write request whose body contains `addFrameId`),
`flowA_addContentWriteSucceeded` (such a request with 2xx),
`flowA_lateStaleContentWriteObserved` (a LATER content-bearing write
NOT containing `addFrameId`), `flowA_addPersistedSettled`,
`flowA_padletWriteCount` (total padlets write requests),
`flowA_updateErrorLogged` (either bound substring).
Flow B (12): `flowB_addRowAppeared`, `flowB_duplicateRowAppeared`,
`flowB_zoomToFitApplied`, `flowB_addFrameLiveAfterFit`,
`flowB_duplicateFrameLiveAfterFit`,
`flowB_addContentWriteAttempted` (body contains `addFrameId`),
`flowB_combinedContentWriteAttempted` (body contains BOTH ids),
`flowB_anyContentWriteSucceeded` (any content-bearing write with
2xx), `flowB_addPersistedSettled`, `flowB_duplicatePersistedSettled`,
`flowB_padletWriteCount`, `flowB_updateErrorLogged`.
Flow C (9): `flowC_duplicateRowAppeared`, `flowC_zoomToFitApplied`,
`flowC_duplicateFrameLiveAfterFit`,
`flowC_duplicateContentWriteAttempted` (body contains
`duplicateFrameId`), `flowC_duplicateContentWriteSucceeded` (2xx),
`flowC_lateStaleContentWriteObserved` (a later content-bearing write
NOT containing `duplicateFrameId`), `flowC_duplicatePersistedSettled`,
`flowC_padletWriteCount`, `flowC_updateErrorLogged`.
Global (4): `classification`, `prefixA`, `prefixB`, `prefixC`.

EVIDENCE annotation (separate): per-flow full request/response
records (bounded per §2), console texts, label-id sets, zoom values,
frame ids, full persisted time series + settled sets.

**Classification enum (bind — SEVEN values, first match in this
order, outcome NOT hardcoded):**

1. `wire-observation-unsound` — any row-appearance or verified-fit
   precondition failed, Flow B's `addFrameId` uncapturable, or
   Flow A records ZERO padlets write requests (capture itself
   broken — Flow A must at least write content per PATCH-083).
2. `control-content-write-missing` — capture works (some padlets
   request seen in Flow A) but NO Flow A content write containing
   `addFrameId` (contradicts PATCH-083's ~2.1 s persistence datum;
   environment drift — report immediately).
3. `duplicate-save-never-sent` — Flow C: no request containing
   `duplicateFrameId` in the entire window (client-side suppression
   proven).
4. `duplicate-save-rejected` — Flow C: a request containing
   `duplicateFrameId` was sent and received a non-2xx response
   (silent server rejection + rollback proven).
5. `duplicate-save-accepted-then-overwritten` — Flow C: a
   duplicate-containing write got 2xx AND a later content-bearing
   write without `duplicateFrameId` was observed (stale
   last-write-wins overwrite proven).
6. `duplicate-save-accepted-but-lost` — Flow C: duplicate-containing
   write got 2xx, no later stale write, yet settled persistence
   never shows it (server-side anomaly — report in full).
7. `mixed-wire-state` — any other combination (report the exact
   tuple; includes any Flow B evidence contradicting Flow C's
   mechanism).

## 4. Allowed files and absence gates (bind)

EXACTLY ONE new file:
`e2e/characterization/drawing-save-wire.spec.ts`.
Bound prefixes (ALL THREE, the authoritative cleanup contract —
lesson from the 083 prefix-wording mismatch):
`patch-064-harness-patch-084-wire-a-`,
`patch-064-harness-patch-084-wire-b-`,
`patch-064-harness-patch-084-wire-c-`.
`registerDrawingCleanup(test)` at module scope; per-board local
try/finally defense with the idempotent zero-assertion;
`test.setTimeout(300_000)` maximum (three-flow exception, as 083).

Absence gates (verify before starting):
- `e2e/characterization/drawing-save-wire.spec.ts` absent at base
  `0683b96` and in the worktree before implementation;
- `e2e/characterization/drawing-slide-persistence.spec.ts` AND
  `.fable5/patches/PATCH-077-draft.md` permanently absent at base,
  HEAD, and worktree;
- no second new file, no modification to ANY existing file.

## 5. Immutable fences (bind — 31, Git blob IDs)

Verify each with
`git rev-parse 0683b965d3821088a4ed9812693f408e0dcfa280:<path>` and
equality at the current governance HEAD with
`git rev-parse HEAD:<path>`. Do NOT use raw file-byte SHA-1 or
`Get-FileHash`. (Working-tree spot checks may additionally use
`git hash-object <path>`.) PATCH-083's 27 fences, its landed spec,
plus the THREE save-chain files statically mapped at 083 closure
(the diagnosis is only valid against these exact blobs).

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
components/collabboard/canvas/hooks/useCanvasData.ts       2e158f1278a395b5028083e8f387a22e4daf5b60
lib/domain/canvas/posts.ts                                 5af51ef0cec14c014072529eda673e81a87c4b8b
lib/infra/canvas/postsRepository.ts                        3a74731730ef047f023465dd65d86700fe878e74
e2e/characterization/drawingBridgeHarness.ts               7a94d7220df3d47f2fe6feefd2c8e31670af9f00
e2e/characterization/drawing-presentation.spec.ts          ddab83381605dbdcdda4d1a0cea3cafe010f55c5
e2e/characterization/drawing-line-bridge.spec.ts           7507b06af492bce7fca25a7a4daeee4400d428f3
e2e/characterization/drawing-duplication.spec.ts           87f88df19246eca5430db71987d573a1c7a5fa0b
e2e/characterization/drawing-harness-cleanup.spec.ts       5345c42d79e3c40286ba9902085977983a012e64
e2e/characterization/presentation-menu-pointer.spec.ts     50d68dff08730a231470ac48306702b02c3ca45b
e2e/characterization/drawing-slide-duplication.spec.ts     fc20ef8160417b6eeb59f4662ab89ceb1af5a167
e2e/characterization/drawing-slide-rename-state.spec.ts    513d07bfe99898455d13d7048a53da90c3b5d401
e2e/characterization/drawing-slide-add-dup-persistence.spec.ts 9a6c7b42a6b476fe74d74483a7fa057a4cf61e7e
e2e/characterization/drawing-duplicate-clone-shape.spec.ts 147ae0aeae503a36fd5e8e42d6cd3045b34b38c3
e2e/characterization/drawing-duplicate-divergence.spec.ts  5d3cccb693f57022c9e9aa44522bee6f59552332
e2e/characterization/drawing-save-supersession.spec.ts     c6cc4feaa6f2320932232a993b70cda73c9e584c
```

## 6. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` / 2
skipped credential-off** (exactly one active test), THREE sequential
stable runs (classification drift = STOP; write-count fields may
legitimately vary ±small amounts — report exact values per run).
Carried (unchanged): supersession 2/1/2; divergence 2/1/2;
clone-shape 2/1/2; add-dup 2/1/2; rename-state 2/1/2;
slide-duplication 2/1/2; menu-pointer 2/1/2; harness-cleanup 2/1/2;
presentation 2 passed / 2 approved skips; duplication 2/1/2; line 4
passed / 4 skipped cred-off; helper 7/1; sanitizer 9/1; focused
drawing 59/2; full Vitest **448/43**;
`git diff --check`/tsc/boundaries/sequential verify+build green;
zero production imports of bridge/harness modules; 31/31 fences.
Cleanup zeros across **TWENTY-ONE** prefixes: the eighteen tracked
prefixes (see PATCH-083 §12 correction) plus this patch's three §4
prefixes.

## 7. Bound semantics for the EVENTUAL fix (recorded now, not
implemented here)

The save-path fix (census #2), once authorized, MUST satisfy: rapid
sequential scene mutations persist the NEWEST COMPLETE live scene; a
later action may replace an earlier pending snapshot only if the
replacement contains all earlier valid mutations; a rapid Duplicate
must not erase an unsaved Add; Duplicate-only must arm a save; the
settled result contains the complete live scene; no stale baseline
snapshot may overwrite a newer scene; no intermediate ordering may
delete valid frames; save failures must become visible and
diagnosable (the silent resolved-error rollback is part of the
defect surface); no duplicate write storm; no regression to normal
drawing persistence; no frame-geometry change; no presentation
semantics change.

**Regression matrix for the fix (bind):** Flow A (Add only →
persists); Flow B (Add then Duplicate <2 s → BOTH persist); Flow C
(Duplicate only → persists); Flow D (Add, wait >2 s, Duplicate →
both persist); Flow E (ordinary drawing edit → persists once, no
write storm). Deep-clone row semantics (fresh frame/child ids,
fresh cloned rows, safe deletion, original untouched) remain a
SEPARATE later patch.

## 8. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline (inspect → attribute → stop only your own → verify
free); auth state only via `--project=setup` (the
`e2e/.auth/user.json` staleness incident is environmental,
EIGHT-times reproduced — refresh via setup and retry); no credential
contents anywhere (network captures MUST NOT record auth headers or
apikey values — strip/omit headers entirely); sequential
`verify`/`build`, never under a dev server; never commit generated
artifacts.

## 9. Cleanup contract

`registerDrawingCleanup(test)` (shared owner) + per-board local
`finally` defense with the idempotent zero-assertion (each board
cleaned before the next is created; a mid-flow stop must still clean
the current board). NO Remove, NO deletion of any slide, no direct
DB writes. Post-run prefix-scoped residue checks must be zero for
all TWENTY-ONE §6 prefixes. Test-timeout kill → sweep and report per
the PATCH-074 rule.

## 10. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (31/31, blob-ID method), or any §4
  absence gate differs;
- ANY existing file must change, or a SECOND new file is required;
- the menu actions or verified fit cannot be driven
  deterministically (no unverified substitutes);
- network observation requires `page.route`, interception,
  modification, blocking, or any non-passive mechanism;
- auth headers/keys would have to be recorded to answer the
  question;
- Flow B's `addFrameId` cannot be captured (classify via rule 1,
  complete the flow for evidence);
- any observation requires force click, `dispatchEvent`, direct
  callback invocation, direct product-state mutation, or a per-test
  timeout above 300 000 ms;
- classification drifts across the three stable runs;
- the observed combination requires a classification outside the §3
  enum (report, do not extend);
- a second distinct defect surfaces (report only);
- ANY fix, guard, seam, or "obvious improvement" tempts — this
  patch observes; the census #2 fix is gated on its result.

## 11. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted single-new-file diff (re-derives the blob ID,
re-verifies 31/31 fences + absence gates + one-file scope, re-runs
all §6 modes, extracts the thirty-four-field annotation from a fresh
JSON reporter run, verifies the network capture is genuinely passive
— no `page.route` anywhere — request records are plausible and
bounded, no auth material captured, both console substrings derived
separately, the classification follows the §3 order, prohibited
actions never driven); explicit PASS required; NO commit before
PASS; then commit with the bound message and push; Fable closes,
rules on the wire mechanism, and authorizes the census #2 save-path
fix with the §7 semantics and regression matrix.

**Bound commit message (verbatim):**
`test(e2e): characterize drawing save wire-level behavior (PATCH-084)`

## 12. Required final report

New file + blob ID; all thirty-four annotation fields per run; the
full bounded request/response log per flow (method, URL, id-presence
booleans, status, timing); both console-substring results; per-flow
persisted settled sets; the derived classification and the exact fix
shape it implies; all §6 gate totals; 31-fence result + absence
gates + one-file scope proof; cleanup proof across twenty-one
prefixes; production-import grep; commit hash + push status after
PASS.
