# PATCH-074 - Timeout-Safe Drawing Harness Cleanup Ownership Characterization

**Status:** **DONE** — Diagnosis DONE (2026-07-17, commit
`54aa88dbb9753396e8aa192d68647ab05ddbaff2`, Sonnet PASS after one
annotation-contract correction); Stage 1 DONE at LEVEL 1 (2026-07-17,
commit `6487dc53df73c01e09c25961576db80036c182ba`, Sonnet PASS, no
required changes — see §0.B for closure record and the one non-blocking
follow-up). **Implementer:** GPT-5.5. **Reviewer:** Sonnet
(independent, read-only, uncommitted diff, explicit PASS required before
commit). **Closure:** Fable (CTO) after landing.

**Base commit (bind, verify before editing):**
`b68cdad4485ad7c4767a735c4bf30762ee4739e4`
(`fix(presentation): make per-slide menu pointer reachable (PATCH-073 Stage 1)`)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize timeout-safe drawing harness cleanup ownership (PATCH-074)`

---

## 0.A Amendment 1 (2026-07-17) — diagnosis closed CONFIRMED; Stage 1 cleanup owner authorized (LEVEL 1)

### 0.A.1 Diagnosis closure record

Committed at `54aa88dbb9753396e8aa192d68647ab05ddbaff2` (blob
`5e32d6cd15fc626df0deaad86382f3e6589f6efc`), Sonnet PASS (first pass
surfaced the missing literal §2 O5 annotation fields incl. `prefixes`;
the corrected packet re-reviewed and PASSed with all eleven fields and
four real scenario-scoped prefixes).

**Final classification (observation-derived, asserted in-test):**
`aftereach-sufficient-for-timeout-not-interruption`.

**Scenario evidence (subprocess, real DB counts):** normal-pass — exit
0, finally ran, afterEach ran, residue 0/0/0. assertion-failure — exit
0 (genuine expected failure via `test.fail` + real thrown assertion,
proven by `testInfo.status='failed'/expectedStatus='failed'`), finally
ran, afterEach ran, 0/0/0. test-timeout — exit 1, finally DID NOT run,
afterEach ran, 0/0/0. hard-kill (owned cmd/Playwright orchestrator +
worker subtree killed via bounded `taskkill /pid <owned> /t /f`) —
neither hook ran, immediate residue 1 board / 7 padlets / 3 canvas
lines, parent exact-fixture sweep restored 0/0/0.

**Ownership finding:** in-process `afterEach` is sufficient for normal
completion, expected assertion failure, and ordinary Playwright test
timeout while the runner lifecycle survives; in-body `finally` is NOT
timeout-safe; both are bypassed by forcible subtree termination, which
requires a surviving external boundary. The repository has no shared
drawing `afterEach` owner, no global teardown, and no external cleanup
supervisor. NOT deterministically tested: worker-only crash with a
surviving orchestrator, whole parent-runner termination, machine/CI
interruption, dev-server crash.

**Final gates at closure:** 074 spec 2/1/2; carried presentation 2+2,
duplication 2/1(+2 skipped), line 4(+4 skipped), menu-pointer 2/1/2;
helper 7/1; sanitizer 9/1; focused 59/2; full 448/43; diff-check/tsc/
boundaries/verify/build green; 6/6 fences; all prefixes 0/0/0; no
artifacts; no orphan process; port 3000 free.

### 0.A.2 Infrastructure findings (measured at `54aa88d`)

- `playwright.config.ts`: `fullyParallel: true`, workers 2 local /
  default CI, retries 2 CI, NO globalSetup/globalTeardown, no teardown
  project (nothing reserved).
- CI (`.github/workflows/ci.yml`) invokes `npm run test:e2e` directly —
  no wrapper, no always()-post-step, and NO E2E credentials in CI
  (anon key only) → the drawing characterization suites SKIP in CI.
  The only real execution environment is the local dev box.
- No `test.extend` custom fixtures anywhere in `e2e/`.
- `drawingBridgeHarness.ts` is already the single shared import point
  of all five drawing specs; it can host a registry with no circular
  imports (it imports only `@playwright/test`, supabase, fs/path,
  `helpers/env`).
- Fixture prefixes embed timestamp+random → no collision risk; DB
  access in hooks is plain supabase-js (no browser needed).
- Module state is per worker process → a worker-local registry needs no
  manifest, no temp files, no cross-worker coordination.

### 0.A.3 Candidate evaluation and target level

- **A — shared registered `afterEach` (ACCEPTED):** mechanism proven by
  the diagnosis in this exact architecture; fixes the historically REAL
  leak class (test timeout aborting in-body `finally` — the PATCH-072
  incident and census follow-up #2); worker-local; no config change; no
  manifest.
- **B — global teardown (REJECTED for now):** only helps in the
  untested worker-crash-with-surviving-runner case; requires a config
  edit plus a prefix manifest with staleness/concurrency questions;
  may return later as a secondary net via its own patch.
- **C — external parent / CI post-step (REJECTED):** no such parent
  exists; CI never runs these suites (no credentials); a local wrapper
  is new operational surface that dies with the console group on
  Ctrl+C anyway. Too broad for this defect.
- **D — layered all-three (REJECTED):** complexity exceeds the defect.
- **E — no fix (REJECTED):** the timeout-leak class is recurring and
  cheaply closable with a proven mechanism.

**Accepted target: LEVEL 1.** Supported after Stage 1: normal
completion, expected assertion failure, ordinary Playwright test
timeout. Explicitly UNSUPPORTED (unchanged): forcible subtree kill,
whole-runner termination, worker-only crash, machine/CI interruption,
dev-server crash — for those, the documented operational rule remains:
run a prefix-scoped sweep and verify zeros. Stage 1 must NOT be
described as interruption-safe.

### 0.A.4 Accepted design (bind)

`drawingBridgeHarness.ts` gains a worker-local module-level registry
and one new export:

- `createDisposableDrawingBoard(...)` pushes `{ supabase, fixture }`
  onto the registry before returning (behavior otherwise unchanged; no
  signature changes to any existing export).
- `registerDrawingCleanup(t)` (t = the calling spec's `test` object)
  installs ONE `t.afterEach` that DRAINS the registry: for each entry,
  `cleanupDrawingFixture(supabase, fixture)` then
  `assertDrawingFixtureCleanup(supabase, fixture)` (exact fixture
  identity only), removing entries as processed. Cleanup failures are
  NOT swallowed — the hook throws.
- Idempotency: draining after an in-body `finally` already cleaned is a
  no-op (exact-ID deletes; assert returns zeros).
- Concurrency: registry is worker-local; only one test runs at a time
  per worker; NO cross-worker manifest, NO temp files, NO prefix-wide
  deletion anywhere in the hook.

Each of the four carried drawing specs adds exactly ONE top-level
`registerDrawingCleanup(test);` call (plus the import name in the
existing harness import list). Every in-body `finally`, assertion,
annotation, and test count stays byte-preserved (finally remains the
fast local defense).

`drawing-harness-cleanup.spec.ts` becomes the deterministic
verification vehicle: its CHILD template switches its cleanup owner
from the inline `cleanupContext` afterEach to the SHARED
`registerDrawingCleanup` owner (markers `afterEach:start`/
`afterEach:complete` still emitted; `afterEach:complete` must reflect
post-drain zero counts). The scenario matrix, exits, hard-kill residue
1/7/3, parent sweep, and totals stay IDENTICAL — this proves the real
shipped registry under assertion-failure and timeout in a subprocess.
Annotation flip (bound): add
`cleanupOwnerImplemented: 'shared-registered-afterEach'` and change
`stage1Status` to `'implemented'`; `recommendedOwner`/
`recommendedBoundary`/classification and all other fields unchanged.

### 0.A.5 Stage 1 scope — allowed files (exactly six; hashes at `54aa88d`, measured)

| File | Pre-edit hash (bind) | Authorized change |
|---|---|---|
| `e2e/characterization/drawingBridgeHarness.ts` | `85a6566dbb8cd16f19151133ed33b9872a97ff11` | registry + `registerDrawingCleanup` + push in `createDisposableDrawingBoard`; NOTHING else |
| `e2e/characterization/drawing-presentation.spec.ts` | `8c7aa6416a6b18236dd46f0833c2c0811717592b` | one import name + one `registerDrawingCleanup(test)` call |
| `e2e/characterization/drawing-line-bridge.spec.ts` | `3e690d20614dee1c0b6c60a791f4031e9aa53833` | same |
| `e2e/characterization/drawing-duplication.spec.ts` | `28023cf08388d9c732a592c82da8506a9e77c03d` | same |
| `e2e/characterization/presentation-menu-pointer.spec.ts` | `c78d2c8eef508b47036869fd922c03ce5a416cf4` | same |
| `e2e/characterization/drawing-harness-cleanup.spec.ts` | `5e32d6cd15fc626df0deaad86382f3e6589f6efc` | §0.A.4 child-owner switch + bound annotation flip only |

No seventh file. NO new tracked file may be created.
`playwright.config.ts` and all production source PROHIBITED.

### 0.A.6 Immutable fences — 13 unique paths (hashes at `54aa88d`, measured)

```text
playwright.config.ts                                    5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                      9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/PresentationPanel.tsx           e811fa9524c2e6ff40c0e4a6124931da1ad6176e
components/presentation/SlideThumbnail.tsx              b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx      655244b443c3869173996cb21a77f7d67c41c64b
components/collabboard/canvas/layouts/DrawingLayout.tsx b470a888e4015e57b757ba0c57a041f1b7d8adb9
lib/infra/presentation/slideOrder.ts                    e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts               2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
lib/infra/drawing/lineBridge.ts                         f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/presentationBridge.ts                 b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/bridge.ts                             ed26c312610a386711f658662e82d29dd48c5890
lib/infra/collabboard/clonedPostMetadata.ts             7d6b6ee6e127a0db8161c09afdf31a54f44ac575
components/collabboard/canvas/hooks/useCanvasActions.ts b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
```

Verify before editing and before commit.

### 0.A.7 Expected totals (bind; ALL unchanged)

074 spec 2 with-deps / 1 no-deps / 2 cred-off skipped, IDENTICAL
scenario matrix (incl. hard-kill 1/7/3 → sweep 0/0/0); presentation
2+2; duplication 2/1 (+2 cred-off); line 4 (+4 cred-off); menu-pointer
2/1/2; helper 7/1; sanitizer 9/1; focused 59/2; full 448/43 (no unit
files change); tsc/boundaries/sequential verify+build green; cleanup
zeros for ALL prefixes; zero production bridge/harness imports; no
generated artifacts; environment contract §6 unchanged.

### 0.A.8 Stage 1 stop conditions

STOP immediately, report, do not commit, if: a SEVENTH file or any new
file is required; `playwright.config.ts` or any production file must
change; any prefix-wide or broad deletion appears inside a hook; any
`finally` block or existing assertion must be weakened or removed; any
suite count changes; the 074 scenario matrix changes beyond the bound
annotation flip; cleanup errors would be silently swallowed; a
cross-worker manifest or temp-file registry becomes necessary; any
fence or pre-edit hash drifts; a second defect surfaces.

### 0.A.9 Review, commit, closure

Sonnet independent review of the uncommitted six-file diff (re-runs
all §0.A.7 gates incl. a fresh JSON annotation extraction proving the
child scenarios now clean through the SHARED owner); explicit PASS
required; NO commit before PASS; then commit and push; Fable closes.

**Bound Stage 1 commit message (verbatim):**
`test(e2e): add shared timeout-safe drawing cleanup owner (PATCH-074 Stage 1)`

---

## 0.B Closure (2026-07-17) — PATCH-074 DONE

### 0.B.1 Stage 1 closure record

Committed at `6487dc53df73c01e09c25961576db80036c182ba`, Sonnet PASS,
no required changes. Six files landed exactly as bound in §0.A.5:

| File | Committed hash |
|---|---|
| `e2e/characterization/drawingBridgeHarness.ts` | `7a94d7220df3d47f2fe6feefd2c8e31670af9f00` |
| `e2e/characterization/drawing-presentation.spec.ts` | `ddab83381605dbdcdda4d1a0cea3cafe010f55c5` |
| `e2e/characterization/drawing-line-bridge.spec.ts` | `7507b06af492bce7fca25a7a4daeee4400d428f3` |
| `e2e/characterization/drawing-duplication.spec.ts` | `87f88df19246eca5430db71987d573a1c7a5fa0b` |
| `e2e/characterization/presentation-menu-pointer.spec.ts` | `0206ef3bc8cf7e1500831b51fb44ac4cc1df4dc8` |
| `e2e/characterization/drawing-harness-cleanup.spec.ts` | `5345c42d79e3c40286ba9902085977983a012e64` |

**Final shipped behavior:** a worker-local in-memory registry
(`registeredDrawingFixtures`) stores exact disposable drawing fixture
identities; `createDisposableDrawingBoard` registers each fixture only
after its board insert succeeds; `registerDrawingCleanup(test)`
installs the shared owner as one `test.afterEach` per importing spec;
the hook drains the registry, calling the pre-existing
`cleanupDrawingFixture` (exact board/padlet/line IDs) then
`assertDrawingFixtureCleanup` (exact zero-state verification) per
entry; failures are aggregated per entry and thrown once, loudly, at
the end (no silent catch); all four carried specs' original in-body
`finally` blocks remain byte-preserved as local defense (double
cleanup is a verified no-op via Postgres delete-on-no-match
semantics); no prefix-wide hook discovery, no global teardown, no
manifest/temp-file registry, no `playwright.config.ts` change, no
production change.

**Accepted lifecycle coverage — supported:** normal completion,
expected assertion failure, ordinary Playwright test timeout while
`afterEach` executes. **Unsupported (unchanged):** killed
cmd/orchestrator/worker subtree, whole-runner termination, machine/CI
interruption, dev-server crash, worker-only crash with a surviving
runner (not separately proven). **Manual rule retained:** interrupted
runs require an exact-fixture or prefix-scoped manual sweep with
verified zero final counts; Stage 1 makes NO interruption-safety
claim anywhere in code, comments, or the annotation.

**Final classification (unchanged, re-verified live):**
`aftereach-sufficient-for-timeout-not-interruption`.

**Final scenario matrix (identical to the diagnosis, re-proven through
the shipped shared owner):** normal-pass — exit 0, finally ran, shared
afterEach ran, residue 0/0/0. assertion-failure — exit 0 (genuine
expected failure via `test.fail` + real thrown assertion), finally
ran, shared afterEach ran, 0/0/0. test-timeout — exit 1, finally did
NOT run, shared afterEach ran, 0/0/0. hard-kill — exit 1, neither hook
ran, immediate residue exactly 1 board / 7 padlets / 3 canvas lines,
parent exact-fixture sweep restored 0/0/0.

**Final gates (independently re-verified this session):** PATCH-074
2 passed with deps / 1 passed `--no-deps` / 2 skipped credential-off;
presentation 2 passed / 2 approved skips; duplication 2 passed with
deps / 1 passed `--no-deps` / 2 skipped credential-off; line 4 passed
/ 4 skipped credential-off; menu-pointer 2 passed with deps / 1 passed
`--no-deps` / 2 skipped credential-off; helper 7/1; sanitizer 9/1;
focused drawing 59/2; full Vitest 448/43; `git diff --check`/tsc/
boundaries/verify/build all green; cleanup zeros across all nine
tracked prefixes (`patch-064-harness-presentation-`,
`-duplication-`, `-line-`, `-line-natural-height-`, `-line-pointer-`,
`patch-071-harness-`, `patch-072-harness-`, `patch-073-harness-`,
`patch-064-harness-patch-074-cleanup-`); 13/13 fences held throughout;
no generated artifacts; no orphan process; port 3000 free; repo clean.

### 0.B.2 Non-blocking follow-up (recorded, PATCH-074 NOT reopened)

The committed Stage 1 annotation (`patch-074-harness-cleanup-
ownership`) still reports `harnessChanged: false`, which is stale —
`drawingBridgeHarness.ts` was intentionally, authorizedly modified as
Stage 1's core mechanism (§0.A.4/§0.A.5). This field is cosmetic
diagnostic telemetry only: it does not gate any assertion, does not
appear in any bound "must remain X" contract for Stage 1 (§0.A.7 binds
`broadDeleteUsed`/`productionChanged`/`configChanged`, not
`harnessChanged`), and does not affect safety, cleanup correctness, or
governance conformance. **Classification: tiny test-annotation
follow-up — fold into the next patch that touches
`drawing-harness-cleanup.spec.ts`** (do not open a standalone patch;
annotation truthfulness here is not load-bearing enough to justify one
on its own).

---

## 0. CTO ruling

### 0.1 Defect statement

The drawing characterization harness is still vulnerable to leaked
fixture residue when a run exits outside the happy-path cleanup flow.

Fresh live census at `b68cdad`:

- `e2e/characterization/drawing-presentation.spec.ts`,
  `drawing-line-bridge.spec.ts`, `drawing-duplication.spec.ts`, and
  `presentation-menu-pointer.spec.ts` all import the shared harness and
  perform cleanup from inside the test body via
  `cleanupDrawingFixture(...)` plus `assertDrawingFixtureCleanup(...)`.
- `e2e/characterization/drawingBridgeHarness.ts` exposes
  `cleanupDrawingFixture` and `assertDrawingFixtureCleanup`, but no
  timeout-safe owner above the individual test body.
- `playwright.config.ts` has no `globalSetup`, `globalTeardown`, or
  dependency project dedicated to prefix-scoped harness cleanup.
- PATCH-072 and PATCH-073 governance already captured real leaked
  `patch-064-harness-presentation-%` residues after interrupted runs,
  while assertion-failed reruns cleaned successfully.

This is test infrastructure only. Do not touch production code,
presentation behavior, bridge logic, or product assertions.

### 0.2 Diagnosis goal

Determine, with real subprocess evidence, which cleanup owner is
reliable for each failure mode:

1. normal pass
2. assertion failure
3. Playwright test timeout
4. hard-killed/interrupted worker process

The patch does not implement the final cleanup fix. It authorizes one
diagnosis file that shells out to child Playwright runs and records what
actually happens.

### 0.3 Expected diagnosis boundary

- `test.afterEach` is the primary candidate owner for ordinary pass,
  assertion failure, and real test-timeout cleanup.
- Worker/process interruption is the open limit case. If a killed child
  process leaves prefix-scoped residue, record that in-process hooks are
  insufficient for interruption safety by themselves.
- `playwright.config.ts` ownership is not assumed up front. The point of
  the patch is to decide whether the surviving owner belongs in:
  - the shared drawing harness contract
  - per-spec `afterEach`
  - Playwright config / teardown orchestration

### 0.4 Accepted design

Create exactly one new characterization spec:

- `e2e/characterization/drawing-harness-cleanup.spec.ts`

The spec is a parent orchestration test that:

1. starts from a clean prefix-scoped state;
2. creates temporary child spec files at runtime under a temp directory;
3. shells out to `npx playwright test ... --workers=1` child runs
   against the already-running server using explicit `PW_BASE_URL`;
4. records the child run outcome plus the emitted harness prefix;
5. checks residue counts for that exact prefix only;
6. proves which scenarios clean and which do not;
7. manually sweeps any residue it intentionally leaves behind before the
   parent test finishes.

No harness file edit. No config edit. No production edit. No new shared
utility file. No broad cleanup query.

---

## 1. Scope

### Allowed file (exactly one)

| File | Pre-edit state (bind) | Authorized change |
|---|---|---|
| `e2e/characterization/drawing-harness-cleanup.spec.ts` | ABSENT (verified at `b68cdad`) | NEW diagnosis-only orchestration spec, exactly per Sections 2-6 |

No second file. Prohibited outright:

- `e2e/characterization/drawingBridgeHarness.ts`
- `e2e/characterization/drawing-presentation.spec.ts`
- `e2e/characterization/drawing-line-bridge.spec.ts`
- `e2e/characterization/drawing-duplication.spec.ts`
- `e2e/characterization/presentation-menu-pointer.spec.ts`
- `playwright.config.ts`
- all production source
- all `.fable5/**` during implementation

---

## 2. Bound observables

The new spec must remain a single active characterization test under the
`characterization` project. It may define local helpers inside the file,
but it may not create any tracked helper module.

### O1 - pass-path child run

Spawn a child Playwright run whose temp spec:

- creates one disposable drawing board through the existing harness;
- writes the full generated `fixture.prefix` to a temp JSON file
  immediately after creation;
- registers `test.afterEach` to run
  `cleanupDrawingFixture(...)` + `assertDrawingFixtureCleanup(...)`;
- exits without failure.

Parent assertions:

- child exit code `0`
- emitted prefix present
- post-run residue for that exact prefix = `{ boards: 0, padlets: 0, canvasLines: 0 }`

### O2 - assertion-failure child run

Spawn a child run whose temp spec is identical except that, after the
prefix has been emitted, it triggers a deliberate assertion failure and
marks the test with `test.fail()`.

Parent assertions:

- child run proves the intended failure path occurred
- emitted prefix present
- residue for that exact prefix still = `0/0/0`

### O3 - test-timeout child run

Spawn a child run whose temp spec:

- emits the prefix after fixture creation;
- sets a very small test timeout;
- intentionally overruns the timeout after registering the same
  `afterEach` cleanup owner.

Parent assertions:

- child run proves a real Playwright test-timeout path occurred
- emitted prefix present
- residue for that exact prefix still = `0/0/0`

### O4 - hard-kill child run

Spawn a child run whose temp spec:

- creates the fixture;
- emits the prefix;
- blocks long enough for the parent to kill the process.

Parent actions and assertions:

- kill the child process only after the prefix file exists;
- confirm the child did not exit cleanly under its own control;
- query residue by the emitted prefix only;
- freeze the observed result:
  - if residue exists, record that hard interruption bypasses in-process
    cleanup;
  - if no residue exists, record the exact mechanism that cleaned it.

Regardless of observation, the parent must then perform a manual
prefix-scoped cleanup sweep for that exact emitted prefix and prove the
final residue is `0/0/0`.

### O5 - final classification

The parent test must emit a structured annotation:

`patch-074-harness-cleanup-ownership`

Required fields:

- `passRun`
- `assertionFailureRun`
- `timeoutRun`
- `killedRun`
- `afterEachCoversPass`
- `afterEachCoversAssertionFailure`
- `afterEachCoversTestTimeout`
- `hardKillBypassesInProcessCleanup`
- `recommendedOwner`
- `recommendedBoundary`
- `prefixes`

Exact classification must be one of:

- `aftereach-sufficient-for-timeout-not-interruption`
- `aftereach-insufficient-for-timeout`
- `global-owner-already-sufficient`
- `unexpected-result-needs-amendment`

Freeze what is observed. Do not force a preferred outcome.

---

## 3. Implementation constraints

- Use the existing harness only.
- Use disposable fixture prefixes only.
- No broad delete query. Every cleanup query must be prefix-scoped to the
  emitted fixture prefix for that child run.
- Preserve the current in-body cleanup design in the existing specs by
  leaving those files untouched.
- Child runs must use explicit `PW_BASE_URL` and `--workers=1`.
- Do not rely on `playwright.config.ts` edits, retries, or global timeout
  changes.
- Do not weaken any existing product assertion.
- Do not shell out to arbitrary scripts outside the repository toolchain.
- Do not commit temp child spec files or temp JSON artifacts.

Rejected alternatives:

- editing the harness first
- editing all four drawing specs in this patch
- adding global teardown before proving ownership
- touching production code
- using a non-prefix-scoped cleanup sweep

---

## 4. Baselines (bind; re-verified fresh at `b68cdad`)

Current carried baselines at HEAD:

- Stage 1 presentation-menu spec: 2 passed with deps / 1 passed no-deps / 2 skipped credential-off
- presentation spec: 2 passed / 2 approved skips
- duplication spec: 2 passed with deps / 1 passed no-deps / 2 skipped credential-off
- line spec: 4 passed / 4 skipped credential-off
- slide-order helper: 7 passed / 1 file
- clone sanitizer: 9 passed / 1 file
- focused drawing: 59 passed / 2 files
- full Vitest: 448 passed / 43 files
- `git diff --check`: passed
- `npx tsc --noEmit`: passed
- `npm run check:boundaries`: passed
- `npm run verify`: passed
- `npm run build`: passed
- cleanup zeros:
  - `patch-064-harness-presentation-` = `0/0/0`
  - `patch-064-harness-duplication-` = `0/0/0`
  - `patch-064-harness-line-` = `0/0/0`
  - `patch-064-harness-line-natural-height-` = `0/0/0`
  - `patch-064-harness-line-pointer-` = `0/0/0`
  - `patch-071-` = `0/0/0`
  - `patch-072-` = `0/0/0`
  - `patch-073-` = `0/0/0`
- zero production imports of `drawingBridgeHarness`, `presentationBridge`, `lineBridge`
- repo clean and synchronized
- port `3000` free

New-spec expected totals:

- with dependencies: **2 passed** (setup + 1 characterization)
- `--no-deps`: **1 passed**
- credential-off: **2 skipped**

All carried baselines above must remain unchanged.

---

## 5. Immutable fences - 6 unique paths

Verify before editing and before commit:

```text
e2e/characterization/drawingBridgeHarness.ts              85a6566dbb8cd16f19151133ed33b9872a97ff11
e2e/characterization/drawing-presentation.spec.ts        8c7aa6416a6b18236dd46f0833c2c0811717592b
e2e/characterization/drawing-line-bridge.spec.ts         3e690d20614dee1c0b6c60a791f4031e9aa53833
e2e/characterization/drawing-duplication.spec.ts         28023cf08388d9c732a592c82da8506a9e77c03d
e2e/characterization/presentation-menu-pointer.spec.ts   c78d2c8eef508b47036869fd922c03ce5a416cf4
playwright.config.ts                                     5864c98436dde10809de67cb40c564c05e98ff6d
```

New-file absence gate:

```text
e2e/characterization/drawing-harness-cleanup.spec.ts  ABSENT
```

---

## 6. Environment contract

- Self-start `npm run dev -- --port 3000`.
- Use explicit `PW_BASE_URL=http://127.0.0.1:3000`.
- Confirm Ready before any parent or child Playwright run.
- Attribute and stop only the owned server PID.
- Confirm port `3000` free afterward.
- No concurrent browser suites except the diagnosis file's own deliberate
  child subprocesses.
- `verify` and `build` remain sequential and run only with no dev server.

---

## 7. Stop conditions

STOP immediately, report, do not commit, if:

- a second tracked file becomes necessary;
- any production file appears necessary;
- any fence in Section 5 drifts;
- the new file already exists at base;
- child runs require a config edit or a harness edit;
- a broad cleanup query is required;
- the emitted prefix cannot be captured deterministically;
- the hard-kill scenario cannot be bounded to a prefix-scoped manual cleanup;
- any carried product assertion or suite count would need weakening;
- user data outside the disposable prefixes could be touched;
- another defect enters scope.

---

## 8. Review and final report

Sonnet must independently re-run:

- the new spec with deps
- the new spec `--no-deps`
- the new spec credential-off
- all carried browser suites
- the deterministic/unit/build chain
- the prefix cleanup proof
- the production-import grep

Required final report:

- exact new-file hash
- the verbatim `patch-074-harness-cleanup-ownership` annotation
- per-scenario child outcome summary
- exact affected-owner ruling
- exact remaining interruption boundary
- all baseline totals
- cleanup proof
- 6/6 fence result
- commit hash + push status after Sonnet PASS
