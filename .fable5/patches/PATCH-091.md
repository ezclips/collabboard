# PATCH-091 — Drawing-Layout Comment Persistence Diagnosis

**Status:** **DIAGNOSIS AUTHORIZED** (diagnosis-only — NO
production fix in this patch). ONE new characterization spec. NO
production change, NO harness change, NO config change, NO
failure injection, NO instrumentation seam.
**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (explicit PASS required before commit).
**Closure:** Fable (CTO) after landing — the closure ruling gates
the narrow comment-channel fix (leading PATCH-09x candidate) and
feeds Phase 3 comment-store planning.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`637ab5dc82b2c4965520eca7b4c3ab3d4cbbfd44`
(`fix(drawing): atomic container child create-and-append with compensation (PATCH-090)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize drawing comment persistence (PATCH-091)`

---

## 0. Census at authoring (2026-07-20, from `637ab5d`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Drawing-layout comment persistence (internal `handleUpdateChildComments` ~1959–1964: fire-and-forget NON-STRICT `onUpdatePadlet`, un-awaited)** | defect (production, silent-loss family) | **SELECTED — diagnosis first (this patch).** Statically proven silent channel; runtime store shape (`comments` vs `detachedComments`), UI drivability, and wire behavior UNPROVEN — the 089 lesson: characterize before fixing |
| 2 | Existing-card move: affordance missing + relationship correctness (old-parent removal, duplicate-parent, parentId) | defect family (production) | design RESOLVED this closure (§0-notes below; MODEL C via RPC precedent; dedicated-handle affordance); implementation DEFERRED to the bound 092/093 sequence — NOT this patch |
| 3 | Rapid move serialization / drag cancel / reload-after-partial-move | defect states | deferred with #2 (move matrix bound at 090-closure Task 10 record) |
| 4 | Remaining non-strict callers: positions ~957/967 | design | best-effort BY DESIGN (088 §4 ruling) — defer |
| 5 | Other-layout comment handlers (CanvasClient ~6594/6676/6756) | census correction | **NOT silent** — result-checked with console.error + toast + success-gated local merge; the drawing layout is the OUTLIER (its internal wrapper bypasses them) |
| 6 | Comments/store duality (metadata.comments / detachedComments / canvas_comments) | design | Phase 3 (bound, unchanged); this diagnosis records evidence, changes nothing |
| 7 | Broader seven-site canvas-ops error swallowing + Result/throw consistency | design | later dedicated contract patch |
| 8 | PATCH-081 | RETIRED-BY-NOTE (confirmed) | untouched/green; no gate depends on the stale label |
| 9 | Frame/sidebar sync | no characterized defect | no deterministic repro; deferred |
| 10 | Line-follow | hardening | deferred |
| 11 | Uploaded-image storage cleanup | hardening | deferred |
| 12 | AI images in presentation | feature | deferred (fixture-blocked) |
| 13 | Overlap fallback | hardening | low, deferred |
| 14 | Connections side-panel planning | feature | deferred |
| 15 | New issue exposed by 090 | — | NONE (review PASS; 089 classification preserved post-fix) |

**Move-design rulings bound at the 090 closure (for 092/093, NOT
this patch):** affordance = DEDICATED DRAG HANDLE on container
child rows (whole-card drag conflicts with editors/comments/
buttons; RowColumnContainerCard currently has ZERO drag
attributes); payload = `text/padlet-id` (the handler's existing
contract); transactional model = **MODEL C preferred** — a
dedicated atomic backend operation (Postgres function via
Supabase RPC; precedent exists: `import_workspace_bundle`,
`get_board_members_with_profile`, migrations 002 helper
functions) because a client-only three-write move can strand a
duplicate-parent or no-parent half-state if compensation itself
fails; client MODEL A is acceptable ONLY if ordered
remove-A-last with proven-recoverable compensation. Safe
sequencing (ranked): **PATCH-092 = atomic move persistence
(MODEL C: migration + repository method + command + handler
rewire), PATCH-093 = restore the drag handle + full move
regression (Flows A–I bound in the 090-closure record).** The
092 runtime-verification gap (no affordance yet) is accepted
ONLY because 093 immediately follows with the drivable
regression; an affordance-only patch exposing the current
non-atomic handler is PROHIBITED.

## 1. Exact defect surface (bind — statically proven; runtime
evidence is this patch's product)

`DrawingLayout.tsx` (blob `965fcd7…`, FENCED — read-only this
patch), internal handler ~1959–1964:

```
const handleUpdateChildComments = useCallback((childId, comments, options) => {
  const child = paddletsRef.current.find(p => p.id === childId);
  if (!child) return;
  const field = options?.field || 'comments';
  onUpdatePadlet(childId, { metadata: { ...child.metadata, [field]: comments } });
}, [onUpdatePadlet]);
```

- The call is **fire-and-forget** (not awaited) on the NON-STRICT
  void channel: a resolved repository failure silently rolls back
  local state (the comment vanishes without any message); a
  thrown failure is caught/logged deep in the hook. Silent
  comment LOSS is possible — a P3 violation.
- CONTRAST (census correction): the OTHER layouts' comment
  handlers (CanvasClient ~6594/6676/6756) check `result.ok`,
  `console.error` + `toast.error` on failure, and merge local
  state only on success. The drawing layout bypasses them with
  its internal wrapper.
- The strict channel (`onUpdatePadletStrict`) is ALREADY passed
  to DrawingLayout (086/090) — a future narrow fix can stay
  inside DrawingLayout, same shape as 087/090.
- Store duality context (NOT to be changed): comment posts render
  via `EmbeddedCommentList` for `type === 'comment'` padlets (or
  legacy `metadata.comments` arrays); `options.field` selects
  `comments` vs `detachedComments`. Which field real UI actions
  write, and what the wire shows, is THIS diagnosis's product.
  `canvas_comments` (third store) is out of scope entirely.

## 2. Diagnosis questions (bind)

1. Are comment ADD / EDIT / REMOVE genuinely drivable through the
   visible drawing-layout UI on a seeded comment post?
2. Which metadata field does each real action persist
   (`comments` vs `detachedComments`), with what row shape?
3. Does settled persistence match the local UI after each action
   and after reload (both directions: server row content and
   rendered list)?
4. What is the passive wire sequence per action (PATCH count,
   field presence, statuses)? Is the write awaited-visible or
   fire-and-forget-racy (e.g., action → navigation-before-write)?
5. Do rapid sequential comment actions interleave or lose writes
   (LAST-WRITE-WINS on the whole array is the static expectation —
   record the observed final array)?

## 3. Diagnosis matrix (bind) and the new spec

ONE new spec `e2e/characterization/drawing-comment-persistence.spec.ts`
(ONE active test, up to THREE sequential disposable boards,
existing harness only, `registerDrawingCleanup(test)` at module
scope, per-board try/finally + zero-assertion,
`test.setTimeout(420_000)`; bound prefixes
`patch-064-harness-patch-091-comment-a-` / `-b-` / `-c-`).
Harness seeding of a comment post row (type `comment`, seeded
`metadata.comments` array) is ALLOWED (089 precedent); driving
the actions must use ONLY the real visible UI.

This is an OBSERVATIONAL diagnosis: outcomes are RECORDED, not
asserted as product-correct. Per action, if the driving UI action
proves NOT drivable through the real visible UI, record the bound
value `action-not-drivable` WITH probing evidence — a valid
result, NOT a failure. Do NOT fabricate actions, call hidden
handlers, or dispatch synthetic events.

- **Flow A (board a) — ADD:** submit a new comment through the
  real embedded comment UI on a seeded comment post. Record: the
  persisted metadata field (`comments` | `detachedComments` |
  other), array length before/after, the persisted entry shape
  (id/text presence — no full payload dumps), settled server
  state, rendered state, reload state.
- **Flow B (board b) — EDIT then REMOVE:** edit an existing
  seeded comment's text, then remove one, through the real UI.
  Record per action: persisted field, array delta, settled +
  reload consistency, rendered state.
- **Flow C (board c) — RAPID SEQUENCE:** several comment actions
  ≤5 s apart (e.g., two adds then an edit). Record: final array
  content vs the expected accumulation, any lost/overwritten
  write, settled + reload consistency.
- **Flow D (all boards) — passive wire:** `/rest/v1/padlets`
  writes only; per record: method, sanitized path, query keys,
  test-owned row ids, `comments`/`detachedComments` field
  presence, status, sequence/elapsed. NO `page.route`, NO auth
  capture, NO full payload output.
- **Flow E (source inspection, recorded in the review):** the §1
  static findings re-derived from the fenced sources (silent
  un-awaited channel; result-checked contrast handlers; strict
  channel availability).
- **Flow F (all boards):** per-board cleanup zero-assertions
  (`assertDrawingFixtureCleanup` 0/0/0).

Bound classification field (single, derived in bound order):
`comment-persists-consistently` |
`comment-write-lost-or-overwritten` |
`comment-divergence-observed` |
`action-not-drivable` |
`mixed-comment-state`.

## 4. Allowed files (bind)

| File | Role | Starting state at base `637ab5d` |
|---|---|---|
| `e2e/characterization/drawing-comment-persistence.spec.ts` | NEW diagnosis spec | absent at base (absence gate) |

ONE file. NO production file is authorized. Absence gates: the new
spec absent at base and worktree before implementation;
`e2e/characterization/drawing-slide-persistence.spec.ts` AND
`.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree; PATCH-092 not started.

## 5. Immutable fences (bind — 40, Git blob IDs)

Verify each with `git rev-parse 637ab5d…:<path>` and equality at
the current governance HEAD. Blob-ID method only. The 090 fence
set PLUS the landed DrawingLayout (`965fcd7…`) and the landed 090
regression spec.

```text
playwright.config.ts                                           5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                             9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/PresentationPanel.tsx                  02699748271241cacaca27fa93a8a78e7d8b2e0d
components/presentation/SlideThumbnail.tsx                     b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx             655244b443c3869173996cb21a77f7d67c41c64b
components/presentation/slide-renderer/resolveSlidePadlets.ts  5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 2d3b0dc3c46cdc03fde5aa0b8a949cd94e5d0d89
components/collabboard/menus/LineContextMenu.tsx               aaf16af230a76139377c4250f93485824000593e
lib/infra/presentation/slideOrder.ts                           e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts                      2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
lib/infra/drawing/lineBridge.ts                                f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/presentationBridge.ts                        b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/bridge.ts                                    ed26c312610a386711f658662e82d29dd48c5890
lib/infra/collabboard/clonedPostMetadata.ts                    7d6b6ee6e127a0db8161c09afdf31a54f44ac575
lib/infra/collabboard/clonedPostMetadata.test.ts               5b53e839d66e399c1357a7656109496c65a2e5d1
components/collabboard/canvas/hooks/useCanvasActions.ts        b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
components/collabboard/canvas/hooks/useCanvasData.ts           2e158f1278a395b5028083e8f387a22e4daf5b60
lib/domain/canvas/posts.ts                                     5af51ef0cec14c014072529eda673e81a87c4b8b
lib/infra/canvas/postsRepository.ts                            3a74731730ef047f023465dd65d86700fe878e74
app/dashboard/canvas/[id]/CanvasClient.tsx                     a028dd65c1935068a7206a67db869a8f5345011a
components/collabboard/RowColumnContainerCard.tsx              e58167d51324ef9bf9d928251ad91d60756616a7
e2e/characterization/drawingBridgeHarness.ts                   7a94d7220df3d47f2fe6feefd2c8e31670af9f00
e2e/characterization/drawing-presentation.spec.ts              6bbd6deb83106d38a0a524253ee95ac3f6bdaa2f
e2e/characterization/drawing-line-bridge.spec.ts               7507b06af492bce7fca25a7a4daeee4400d428f3
e2e/characterization/drawing-duplication.spec.ts               87f88df19246eca5430db71987d573a1c7a5fa0b
e2e/characterization/drawing-harness-cleanup.spec.ts           5345c42d79e3c40286ba9902085977983a012e64
e2e/characterization/presentation-menu-pointer.spec.ts         50d68dff08730a231470ac48306702b02c3ca45b
e2e/characterization/drawing-slide-duplication.spec.ts         fc20ef8160417b6eeb59f4662ab89ceb1af5a167
e2e/characterization/drawing-slide-rename-state.spec.ts        513d07bfe99898455d13d7048a53da90c3b5d401
e2e/characterization/drawing-slide-add-dup-persistence.spec.ts 9a6c7b42a6b476fe74d74483a7fa057a4cf61e7e
e2e/characterization/drawing-duplicate-clone-shape.spec.ts     147ae0aeae503a36fd5e8e42d6cd3045b34b38c3
e2e/characterization/drawing-duplicate-divergence.spec.ts      5d3cccb693f57022c9e9aa44522bee6f59552332
e2e/characterization/drawing-save-supersession.spec.ts         c6cc4feaa6f2320932232a993b70cda73c9e584c
e2e/characterization/drawing-save-wire.spec.ts                 280d37545e9d638c5eb8d883ffa99beefa5da308
e2e/characterization/drawing-duplicate-persistence.spec.ts     b0ab5ea55195e3aab5a43aa8e73e88cd136723f4
e2e/characterization/drawing-duplicate-deep-clone.spec.ts      0644447cc2bea1b21c9b47ba03b7d69de2617fb7
e2e/characterization/drawing-container-drop.spec.ts            32750636c1146f5bf8da3e7f9987838b26c5169b
e2e/run-carried-groups.mjs                                     6a04d94e6bcc71fdd6e647f5961707607ad1317d
components/collabboard/canvas/layouts/DrawingLayout.tsx        965fcd721390484aa674bbec9994bb48c45b84ff
e2e/characterization/drawing-container-link.spec.ts            07ec5ad379e53b11764c0ac7fd48a26ae4e365a3
```

## 6. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` /
2 skipped credential-off**, THREE sequential stable dependency
runs — recorded VALUES coherent across runs; `action-not-drivable`
(if it occurs) deterministic across all three. Carried: the 14
runner specs UNCHANGED (via the PATCH-088 grouped runner; bounded
recovery only) PLUS separate dependency-mode invocations of
`drawing-container-drop.spec.ts` (**2 passed**, classification
`mixed-drop-state` preserved) and
`drawing-container-link.spec.ts` (**2 passed**) — the runner's
group list is NOT modified this patch. Deterministic: helper 7/1;
sanitizer 9/1; focused drawing 59/2; full Vitest **448/43**;
diff-check/tsc/boundaries/sequential verify+build green; zero
production imports; 40/40 fences. Cleanup zeros across
**THIRTY-EIGHT** prefixes (the thirty-five tracked plus this
patch's three §3 prefixes).

## 7. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline; auth refresh only via `--project=setup` or the
PATCH-088 runner's bounded recovery; no credential contents;
passive listeners only (no `page.route`, no auth headers);
sequential `verify`/`build`, never under a dev server; never
commit generated artifacts.

## 8. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (40/40), or any §4 absence gate differs;
- the diagnosis requires ANY production edit, harness edit, config
  edit, second file, failure injection, or instrumentation seam;
- driving an action requires hidden-handler invocation or
  synthetic event dispatch bypassing the real comment UI (record
  `action-not-drivable` instead — do NOT fabricate);
- recorded values are incoherent across the three runs;
- any carried spec's totals change (including the separate 089 and
  090 spec invocations);
- cleanup cannot reach zero for any board;
- any `canvas_comments`-store work would enter scope (out of
  scope entirely).

## 9. Review and commit flow (bind)

Implementer delivers the uncommitted ONE-file diff + report (blob
re-derived; per-flow recorded values incl. the persisted field per
action; three-run stability; carried totals; deterministic totals;
fence result; cleanup proof). The independent read-only reviewer
re-derives everything, re-runs the spec three times, re-derives
the §1 static findings from the fenced sources, and must return an
explicit PASS before the implementer commits with the bound
message and pushes. CTO closes with the comment-channel fix ruling
and the Phase 3 evidence record.

## 10. Required final report

Exact one changed path + final blob; per-flow recorded values and
classification; persisted-field evidence per action; wire-order
evidence; three-run stability; carried totals (runner 14/14 + 089
spec 2 passed with preserved classification + 090 spec 2 passed);
deterministic totals; 40-fence result + absence gates; cleanup
across thirty-eight prefixes; explicit confirmations (no
production/harness/config change, no injection, no seam, no auth
capture, no hidden handlers, no synthetic events); commit hash +
push status after PASS.
