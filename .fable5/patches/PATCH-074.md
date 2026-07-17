# PATCH-074 - Timeout-Safe Drawing Harness Cleanup Ownership Characterization

**Status:** SPEC READY - diagnosis-only characterization, no production
source changes. **Implementer:** GPT-5.5. **Reviewer:** Sonnet
(independent, read-only, uncommitted diff, explicit PASS required before
commit). **Closure:** Fable (CTO) after landing.

**Base commit (bind, verify before editing):**
`b68cdad4485ad7c4767a735c4bf30762ee4739e4`
(`fix(presentation): make per-slide menu pointer reachable (PATCH-073 Stage 1)`)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize timeout-safe drawing harness cleanup ownership (PATCH-074)`

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
