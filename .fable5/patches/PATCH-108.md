# PATCH-108 — Dedicated Test Runner and Structured Evidence Bundle

**Purpose:** a harness component that reads a patch manifest's
`requiredCommands`, runs them sequentially, captures exit codes,
durations, stdout/stderr log references, and (where recognizable)
parsed Vitest test totals, and emits exactly one structured JSON
"evidence bundle" — replacing the pattern every prior patch in this
session used, where the CTO or implementer ran each gate by hand and
relayed raw text/JSON between turns in chat. It may optionally run
those commands inside a PATCH-107 owned worktree, and may optionally
start/stop a PATCH-105 owned dev server around the run, reusing both
primitives exactly as built — this patch adds no new worktree or
server logic of its own.

**This is NOT:** a Codebase Explorer, retrieval-based governance
memory, an automated handoff orchestrator, or a remote/cloud sandbox.
It does not decide whether a run's results are acceptable, does not
choose or contact an implementer/reviewer, and does not touch Git
staging, commits, pushes, stashes, or any governance/source file. It
only runs commands the manifest already declares and reports what
happened. Each deferred item remains its own separate, not-yet
-authorized future patch, per the user's stated priority order
(Explorer next, then retrieval, then orchestration).

**Status:** **DONE.** Landed commit
`8d4176f21fb9f1ee4fa41631de25fd1ad30cb922` (exact bound message,
below). Independent review PASS. See closure section at the end of
this document for the full record.

**Implementer:** Codex 5.6 Terra — this patch orchestrates
already-built, already-reviewed primitives (`child_process` spawn,
PATCH-107's `createWorktree`/`removeWorktree`, PATCH-105's
`startOwnedServer`/`stopOwnedServer`) rather than introducing new deep
Windows git/path plumbing of its own; Sol's added capability is not
required. **Reviewer:** independent read-only reviewer (DeepSeek V4
Pro primary, Kepler or Gemini 3.1 Pro fallback) — PASS required before
commit. Sonnet (CTO/governance owner) authored/authorized this patch
and must NOT perform its review. **Authored:** Sonnet (CTO), 2026-07-24.

**Base commit (bind — implementation must start here):** state your
current `git rev-parse HEAD`/`origin/main` before starting and confirm
it against the value given in the CTO's continuation prompt for this
turn — **not** whatever static value appears in this file by the time
you read it, per PATCH-105 §7a / PATCH-106 §0a / PATCH-107's header
note's now three-times-demonstrated pattern (this governance-authoring
commit necessarily advances `main` by one commit after this text is
written). The continuation prompt is authoritative for the base commit
and the manifest's `baseCommit`; this document is not, for that one
field only.

**Bound implementation commit message (verbatim):**
`feat(harness): add manifest-driven test runner and evidence bundle (PATCH-108)`

---

## 1. Root cause / motivation (bind)

The fresh harness census performed at PATCH-107's closure (see
`CURRENT_TASK.md`, this turn) confirms: every harness CLI already
emits one structured JSON object per invocation, but nothing
sequences multiple gates into one run or aggregates their results —
the CTO and implementer have manually run each §-numbered validation
-matrix command one at a time, across seven patches now, and relayed
raw output between turns by hand in chat. This is the single largest
remaining "manual step" the census identified. PATCH-108 closes it for
the mechanical part only: running the manifest's own already-declared
`requiredCommands` (a field `manifestSchema.ts` has had since PATCH-105
but which no code has ever consumed) and packaging the results. It
does not decide what a red result means — that stays a CTO/reviewer
judgment call, exactly as today.

## 2. Test-runner interface (bind)

New file `scripts/harness/testRunner.ts`:

```ts
export interface CommandExecutionRecord {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly expectedExitCode: number;
  readonly ok: boolean; // exitCode === expectedExitCode
  readonly durationMs: number;
  readonly stdoutLogPath: string;
  readonly stderrLogPath: string;
  readonly startedAt: string; // ISO 8601
  readonly finishedAt: string; // ISO 8601
}

export interface ParsedTestTotals {
  readonly tests: number;
  readonly files: number;
}

export interface EvidenceBundle {
  readonly ok: boolean; // true only if every command's ok is true AND, when checked, expectedTestTotalsMatch !== false
  readonly patchId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly totalDurationMs: number;
  readonly commands: readonly CommandExecutionRecord[];
  readonly stoppedEarly: boolean; // true if a hard failure stopped the sequence before every command ran
  readonly parsedTestTotals: ParsedTestTotals | null;
  readonly expectedTestTotalsMatch: boolean | 'not-checked';
  readonly worktree: { readonly used: boolean; readonly worktreeId: string | null };
  readonly serverManaged: { readonly used: boolean; readonly started: boolean };
  readonly evidenceBundlePath: string; // absolute path this same JSON was also written to
}

export interface TestRunnerOptions {
  readonly repoRoot: string;
  readonly logDir: string; // default `<repoRoot>/.fable5/evidence/<patchId>-<timestamp>/`
  readonly useOwnedWorktree?: { readonly worktreeId: string };
  readonly spawnRunner?: SpawnRunner; // injected for tests, mirrors scopeValidator.ts's CommandRunner pattern
}

export async function runManifestCommands(manifest: PatchManifest, options: TestRunnerOptions): Promise<EvidenceBundle>;
```

**Bound sequencing behavior:**
- Commands run **strictly sequentially**, in `manifest.requiredCommands`
  array order — never in parallel (parallel runs would make log/port
  attribution ambiguous and contradicts "stop on hard failures").
- After each command, compare `exitCode` to that command's
  `expectedExitCode` (already a field on every `requiredCommands`
  entry per the existing schema, defaulting to `0`). On mismatch: mark
  that record `ok:false`, set `stoppedEarly:true`, and **do not run any
  further commands** — this is the manifest-driven "stop on hard
  failures" rule; the runner never has a "continue anyway" mode.
- `parsedTestTotals`: after a command completes, if its `args` array
  contains both `--reporter=json` and an `--outputFile=<path>` (or
  `--outputFile <path>`, two-token form) targeting Vitest's JSON
  reporter, the runner reads that file and extracts
  `{ tests: numTotalTests, files: numTotalTestSuites }` from Vitest's
  own JSON report shape. If no command's args match this pattern,
  `parsedTestTotals` is `null`. This is pattern-recognition of an
  existing, already-supported Vitest flag — the runner never invokes
  Vitest with flags the manifest didn't already specify.
- `expectedTestTotalsMatch`: `'not-checked'` if `manifest.expectedTestTotals.unit`
  is absent OR `parsedTestTotals` is `null`; otherwise a strict
  equality compare, feeding directly into the bundle's overall `ok`.
- **The runner never marks a mismatched or missing result as
  acceptable.** There is no "warn only" or "soft fail" mode anywhere
  in this interface.

## 3. Optional worktree/server integration (bind — reuses PATCH-105/107
exactly, adds no new lifecycle logic)

- If `options.useOwnedWorktree` is supplied, `runManifestCommands`
  calls PATCH-107's `createWorktree({ baseCommit: manifest.baseCommit,
  worktreeId: options.useOwnedWorktree.worktreeId, parentDir: default
  })` **before** running any command, sets every command's `cwd` to
  the resulting worktree path, and calls `removeWorktree` in a
  `finally` block once every command has run (or the sequence stopped
  early) — guaranteeing cleanup even on failure. If worktree creation
  itself fails, the bundle reports `ok:false`,
  `worktree: { used: true, worktreeId }`, zero commands attempted, and
  a single synthetic failure record explaining why.
- If `manifest.serverConfig` is present, the runner calls PATCH-105's
  `startOwnedServer(manifest.serverConfig)` before running commands
  and `stopOwnedServer` in a `finally` block after — bounded by that
  config's own `readinessTimeoutMs`, exactly as PATCH-105 built it.
  `serverManaged.started` reflects whether `startOwnedServer` actually
  reported `reason: 'started'` (vs. an already-healthy-unowned server
  it correctly declined to manage, or a failure).
- **This patch imports `createWorktree`/`removeWorktree` from
  `scripts/harness/worktreeLifecycle.ts` and
  `startOwnedServer`/`stopOwnedServer` from
  `scripts/harness/serverLifecycle.ts` unmodified.** No behavior in
  either file changes. If any interface mismatch is discovered during
  implementation, report it — do not modify those files to "fit."

## 4. New CLI and scripts (bind)

New file `scripts/harness/testRunnerCli.ts`:
```
vite-node scripts/harness/testRunnerCli.ts <manifest-path> [--use-worktree <id>] [--log-dir <path>]
```
Prints the `EvidenceBundle` JSON to stdout (one object, matching every
other harness CLI's convention) and also writes the identical JSON to
`<logDir>/evidence.json`. Exits `0` if `bundle.ok`, `1` otherwise.

New `package.json` scripts: `"harness:evidence:run"` (invokes the CLI
via `vite-node`, PATCH-105 §9a's convention — never `tsx`) and
`"test:harness:testrunner:integration"` (the new integration script,
§7). One-line `.gitignore` addition: `.fable5/evidence/` (evidence
bundles and their logs are run artifacts, never committed — matching
PATCH-107's `.fable5/worktrees/` precedent exactly).

## 5. Security and safety fences (bind, in addition to all standing
repo rules and PATCH-105/106/107's fences, which remain in force)

- **Never touches Git staging, commits, pushes, or stashes** — no
  function in this patch ever calls `git add`, `git commit`, `git
  push`, or `git stash` in any form; it only reads/spawns whatever
  `requiredCommands` already names.
- **Never alters governance, source, or product files** — the runner
  writes only inside its own `logDir` (default
  `.fable5/evidence/...`) and, when using a worktree, inside that
  disposable worktree's own path (never the main worktree).
- **Never decides a failure is acceptable** — no configuration,
  argument, or code path lets a nonzero-vs-expected exit code, a
  `stoppedEarly:true`, or an `expectedTestTotalsMatch:false` be
  silently reported as `ok:true`.
- **Never automates implementation/reviewer handoffs** — the runner
  makes no network calls, contacts no model or agent, and sends no
  messages; it only executes local commands and writes local files.
- Commands are spawned via an args-array form (no shell string
  interpolation), `windowsHide: true`, matching
  `scopeValidator.ts`/`serverLifecycle.ts`'s existing convention — no
  command injection surface from manifest content.
- No secret or `.env.local` content is ever printed to the evidence
  bundle, stdout, or any log file beyond whatever the spawned
  command's own natural output already contains (the runner does not
  filter or scan for secrets in command output — see §13 hard-stops
  for the corresponding limitation this implies).
- All waits are bounded: each command has an overall timeout derived
  from `manifest`'s existing fields where available, or a fixed
  conservative default (bind: 10 minutes per command) if none is
  specified — never an unbounded wait.
- Worktree/server cleanup (§3) always runs in a `finally` block, even
  when a command fails or throws — "scoped cleanup" means the runner
  removes only the transient worktree/server it itself created for
  this run; it never deletes the evidence bundle/log files it just
  produced (those are the deliverable, not a byproduct to clean up).

## 6. Required tests (bind — unit-first, mocked spawn/fs via an
injected `SpawnRunner`, same pattern as `scopeValidator.test.ts`)

New `scripts/harness/testRunner.test.ts` covering at minimum:
1. all commands succeed → `ok:true`, `stoppedEarly:false`, one record
   per command in order.
2. a middle command's exit code mismatches `expectedExitCode` →
   `ok:false`, `stoppedEarly:true`, no records for commands after it.
3. `parsedTestTotals` correctly extracted when a command's args match
   the `--reporter=json`/`--outputFile` pattern and the file contains
   valid Vitest JSON.
4. `parsedTestTotals: null` when no command matches that pattern.
5. `expectedTestTotalsMatch: true`/`false` against
   `manifest.expectedTestTotals.unit` when totals were parsed.
6. `expectedTestTotalsMatch: 'not-checked'` when
   `expectedTestTotals` is absent from the manifest.
7. worktree integration: `useOwnedWorktree` supplied →
   `createWorktree`/`removeWorktree` both called exactly once, in that
   order, with `removeWorktree` called even when a command fails
   (mocked worktree module).
8. worktree creation failure → `ok:false`, zero commands attempted,
   `removeWorktree` never called (nothing to remove).
9. server integration: `manifest.serverConfig` present →
   `startOwnedServer`/`stopOwnedServer` both called, `stopOwnedServer`
   called even when a command fails (mocked server module).
10. no `serverConfig` and no `useOwnedWorktree` → neither module's
    functions are called at all.
11. durations (`durationMs`) are non-negative and
    `finishedAt >= startedAt` for every record.
12. structured result shape — every result is JSON-serializable and
    matches the declared `EvidenceBundle` shape exactly.

**One controlled integration test**, new file
`scripts/harness/testRunner.integration.ts` (plain Node script using
`node:assert`, run via its own npm script, kept OUT of the default
`vitest run` sweep exactly like PATCH-105/107's `.integration.ts`
scripts):
- builds a small manifest-shaped object in-memory with 2-3
  `requiredCommands` entries that invoke `process.execPath` with
  simple `-e` scripts (e.g. one that exits 0, one that writes to
  stdout and exits 0, one that exits 1) — **never the real application
  repo, never `npm run build`/`verify`/etc.**
- proves: sequential execution in order; log files are actually
  written and contain the expected stdout/stderr content; a nonzero
  -exit-code command stops the sequence (the intentionally-failing
  command is placed before a final command that must NOT appear in
  the results); the evidence bundle JSON is written to `logDir` and is
  valid JSON matching the schema; no process or file handle is left
  open afterward.
New `package.json` script: `"test:harness:testrunner:integration"`.

## 7. Exact file scope (bind)

**New files (5):**
1. `scripts/harness/testRunner.ts`
2. `scripts/harness/testRunner.test.ts`
3. `scripts/harness/testRunnerCli.ts`
4. `scripts/harness/testRunner.integration.ts`
5. `.fable5/patches/PATCH-108.manifest.json` (this patch pilots itself
   again, per PATCH-105/106/107 precedent — `baseCommit`: the exact
   value from the CTO's continuation prompt for this turn, not a value
   hardcoded here)

**Modified files (3):**
- `scripts/harness/types.ts` — additive only: the new
  `CommandExecutionRecord`/`ParsedTestTotals`/`EvidenceBundle`/
  `TestRunnerOptions` types (or their mirrors), matching how PATCH-105/
  106/107 organized shared vs. module-local types.
- `package.json` — add exactly two new scripts (§4); no existing
  script line altered.
- `.gitignore` — add exactly one new line, `.fable5/evidence/`.

**Prohibited paths (must NOT change):** everything PATCH-105/106/107
prohibited, plus every existing file under `scripts/harness/` other
than `types.ts` (additive-only) — `serverLifecycle.ts`, `serverCli.ts`,
`manifestSchema.ts`, `scopeValidator.ts`, `validateScope.ts`,
`validateLandedCommit.ts`, `worktreeLifecycle.ts`, `worktreeCli.ts`,
`serverLifecycle.integration.ts`, `worktreeLifecycle.integration.ts`,
`fixtures/tinyServer.mjs`, and every prior patch's own manifest file.

**Expected file count:** 5 new, 3 modified, 0 deleted, 0 renamed.

**Dependency choices:** zero new dependencies. Native
`node:child_process`, `node:fs/promises`, `node:path`, `node:os` only.
Reuses `vite-node` (PATCH-105 §9a), `zod` (already present, for the
manifest pilot), and imports PATCH-105's `serverLifecycle.ts` and
PATCH-107's `worktreeLifecycle.ts` **unmodified**.

## 8. Validation matrix (bind — split into two non-overlapping
lifecycle phases, per PATCH-107's own §12a/§12b governance correction;
applied here from the start rather than retrofitted)

### 8a. Phase 1 — uncommitted implementation validation (bind; gates
independent review and, later, commit authorization)

1. `npx vitest run scripts/harness` — all existing tests still green
   (baseline to confirm at implementation start), plus the new tests
   from §6, growing only.
2. `npm run test:harness:testrunner:integration` — the real
   controlled-command integration test, green, confirmed to leave zero
   residual process/file-handle state.
3. `npm run harness:validate-scope -- .fable5/patches/PATCH-108.manifest.json` —
   pre-commit mode, run against PATCH-108's own candidate while it
   remains uncommitted. Expects `ok:true`,
   `commitMessageMatches: 'not-checked'`.
4. `npx tsc --noEmit` — clean.
5. `npm run check:boundaries` — clean, no-op confirmation.
6. Full `npx vitest run` — must remain at or above the pre-patch
   baseline, growing only by the new test cases, never shrinking or
   newly failing.
7. `npm run verify` — full green.
8. `npm run build` — clean (confirm no dev server running first).
9. Windows process/port/worktree/branch/filesystem cleanup checks:
   confirm zero residual state from the integration test (§6) — no
   leftover processes, no leftover files outside the test's own
   `logDir`, which itself may be cleaned up by the integration test's
   own teardown.
10. Fresh independent review (DeepSeek V4 Pro primary, Kepler/Gemini
    3.1 Pro fallback — NOT Sonnet) required before commit.

**The implementer must leave the candidate uncommitted** after every
Phase 1 gate passes and independent review returns PASS — report
results and await explicit commit authorization from the CTO.

### 8b. Phase 2 — post-commit landed validation (bind; runs only after
explicit commit authorization has been given and the reviewed
candidate has actually been committed with the exact bound message)

1. `npm run harness:validate-landed -- .fable5/patches/PATCH-108.manifest.json HEAD` —
   confirms the landed commit's parent matches `baseCommit`, its
   changed files are exactly the bound scope, and its message matches
   `exactCommitMessage`.
2. **Failure of this check is a hard stop before closure**, exactly as
   bound for PATCH-107 §12b.
3. The companion `harness:validate-scope` run will correctly report
   `ok:false` at this point (expected post-commit divergence, not a
   regression) — do not chase this as a new bug.

## 9. Hard-stop conditions (bind)

STOP, report, do not commit, if: any file outside §7's exact list is
touched; any existing file under `scripts/harness/` other than
`types.ts` is modified; any new runtime dependency is added; the
runner ever calls `git add`, `git commit`, `git push`, or `git stash`
in any form; the runner ever silently treats a failed/mismatched
result as `ok:true`; the runner runs commands in parallel rather than
strictly sequentially; a command's stop-on-failure is skipped or
overridden by a "continue anyway" path; `createWorktree`/`removeWorktree`
or `startOwnedServer`/`stopOwnedServer` are modified rather than
imported as-is; worktree or server cleanup fails to run on a command
failure (i.e., is not inside a `finally`-equivalent guarantee); any
secret or `.env.local` content is printed, logged, or committed; a
commit or push is issued automatically; the manifest pilot fails its
own pre-commit validation; the controlled integration test (§6) fails
or leaves residual state; Explorer agents, retrieval memory, remote
sandboxes, automated model handoffs, or a new CanvasClient extraction
are introduced under this patch's scope; any required Phase 1 gate in
§8a fails or is skipped before independent review or commit
authorization; §8b's post-commit landed validation is run, or its
failure is treated as resolved, before an explicit, separate CTO
commit-authorization action has both occurred and actually landed the
reviewed commit.

## 10. Health ledger

Unchanged ruling (option B, retired) — not recalculated here.

## 11. Closure (bind — CTO post-landing verification)

**Landed commit:** `8d4176f21fb9f1ee4fa41631de25fd1ad30cb922`, exact
bound message
`feat(harness): add manifest-driven test runner and evidence bundle (PATCH-108)`.
Verified directly: branch `main`, HEAD == origin/main == the landed
commit, clean working tree, zero staged/untracked files, empty stash,
`package-lock.json` unchanged, `git diff HEAD^ HEAD --check` clean,
and `git show --name-only --format="" HEAD` returns exactly the eight
governed paths from §7 —
`.fable5/patches/PATCH-108.manifest.json`, `.gitignore`,
`package.json`, `scripts/harness/testRunner.integration.ts`,
`scripts/harness/testRunner.test.ts`, `scripts/harness/testRunner.ts`,
`scripts/harness/testRunnerCli.ts`, `scripts/harness/types.ts` — no
more, no fewer. Confirmed `.fable5/evidence` and `.fable5/worktrees`
both absent on disk, only the main worktree exists, and no
`harness/worktree/*` branches exist — zero residual run artifacts.

**Independent review:** PASS.

**Post-commit landed validation (re-verified live this closure turn,
read-only):**
`npm run harness:validate-landed -- .fable5/patches/PATCH-108.manifest.json HEAD`
→ exit 0,
`{"ok":true,"violations":[],"checks":{"landedCommitExists":true,"parentMatchesBaseCommit":true,"landedFilesWithinAllowed":true,"prohibitedPathsAbsentFromLandedCommit":true,"landedCommitMessageMatches":true,"landedBlobsMatch":"not-checked","testTotalsMatch":"not-checked"}}`.
Confirmed zero mutation and zero residual process/port state. This is
the §8b Phase 2 gate this patch bound proactively from the start
(rather than retrofitting it, as PATCH-107 had to) — it passed cleanly
on the first post-commit run, with no lifecycle contradiction.

**Post-commit pre-commit-scope validation:** as expected per the
standing PATCH-105–107 ruling, `harness:validate-scope` against this
same manifest post-commit reports `ok:false`
(`headMatchesExpected`/`baseCommitMatches` false,
`commitMessageMatches: true`) — the same expected, non-broken
lifecycle shape, not a regression.

**Remaining implementation blocker:** none. PATCH-108 is fully landed,
reviewed, and functionally verified — the manifest-driven test runner
and evidence-bundle primitive is in place, composing PATCH-105's
server lifecycle and PATCH-107's worktree lifecycle without modifying
either.

**PATCH-109:** authorized separately (see `PATCH-109.md`) as the
Isolated Harness Run Coordinator — not implemented as part of this
closure.
