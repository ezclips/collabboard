# PATCH-109 — Harness Run-Coordinator Resolution Layer

**Purpose:** a thin, additive convenience layer over PATCH-108's
already-landed `runManifestCommands` — resolves a patch ID to its
manifest file, generates a safe/collision-resistant worktree ID when
isolation is requested but no ID is supplied, calls
`runManifestCommands` **exactly once, unmodified**, and wraps its
result with minimal invocation metadata into one `CoordinatorResult`.

## 0. Scope-narrowing finding (bind — read before anything else)

The CTO's fresh harness census performed at PATCH-108's closure
(2026-07-24) found, by directly reading the landed
`scripts/harness/testRunner.ts` and `scripts/harness/testRunnerCli.ts`
rather than assuming: **PATCH-108, as already landed, already
implements essentially the entire "Isolated Harness Run Coordinator"
concept.** `runManifestCommands` already, in one call: optionally
creates an owned PATCH-107 worktree (`options.useOwnedWorktree`), sets
every command's `cwd` to it, optionally starts/stops a PATCH-105 owned
server when `manifest.serverConfig` is present, collects the resulting
`EvidenceBundle`, and guarantees worktree/server cleanup in all paths
(including early-failure paths) via its own internal `try`/`finally`
-equivalent handling. `testRunnerCli.ts` already exposes all of this
as `vite-node scripts/harness/testRunnerCli.ts <manifest-path>
[--use-worktree <id>] [--log-dir <path>]`.

Building a second "coordinator" that itself calls `createWorktree`
and then separately invokes `runManifestCommands` inside it — as the
originally-proposed concept described — would either **duplicate**
`runManifestCommands`'s own internal worktree handling (a second,
redundant creation/cleanup path with its own failure modes to reason
about) or require **modifying `TestRunnerOptions`** to accept a
caller-supplied, already-created worktree handle instead of a
`worktreeId` string — an API change to a just-landed, independently
-reviewed module, which the originating brief explicitly discourages
("modify PATCH-105–108 APIs unless a proven additive seam is
unavoidable") and which is not proven necessary here.

**This patch is narrowed accordingly.** The one genuine, non
-duplicative gap identified: today, a caller must already know the
exact manifest file path and must invent their own worktree ID by
hand. PATCH-109 closes exactly that — patch-ID-based manifest lookup,
and safe auto-generated worktree IDs — as a pure resolution/wrapping
layer that still calls `runManifestCommands` exactly once, unmodified.
If, after this patch, a real need emerges for a caller-supplied
pre-existing worktree, that is a distinct, separately-justified future
patch, not assumed here.

**This is NOT:** a second test-execution engine, a Codebase Explorer,
retrieval-based governance memory, an automated handoff orchestrator,
or a remote/cloud sandbox. It selects nothing, edits no patch, reviews
no result, and never decides whether a failure is acceptable — it only
resolves inputs and passes them through to PATCH-108's existing,
unmodified entry point.

**Status:** AUTHORIZED, NOT STARTED.

**Implementer:** Codex 5.6 Terra — this patch is pure composition (path
resolution, ID generation, one wrapped call to an existing, unmodified
function); it introduces no new Windows git/path/process complexity,
so Sol's added capability is not required. **Reviewer:** independent
read-only reviewer (DeepSeek V4 Pro primary, Kepler or Gemini 3.1 Pro
fallback) — PASS required before commit. Sonnet (CTO/governance owner)
authored/authorized this patch and must NOT perform its review.
**Authored:** Sonnet (CTO), 2026-07-24.

**Base commit (bind — implementation must start here):** state your
current `git rev-parse HEAD`/`origin/main` before starting and confirm
it against the value given in the CTO's continuation prompt for this
turn — **not** whatever static value appears in this file, per
PATCH-105 §7a / PATCH-106 §0a / PATCH-107 header note / PATCH-108's
own pattern (this governance-authoring commit necessarily advances
`main` by one commit after this text is written). The continuation
prompt is authoritative for the base commit and the manifest's
`baseCommit`; this document is not, for that one field only.

**Bound implementation commit message (verbatim):**
`feat(harness): add patch-id/worktree resolution layer for the test runner (PATCH-109)`

---

## 1. Interfaces (bind)

New file `scripts/harness/runCoordinator.ts`:

```ts
export interface CoordinatorOptions {
  readonly repoRoot: string;
  readonly manifestPath?: string; // explicit path; mutually exclusive with patchId (exactly one required)
  readonly patchId?: string; // e.g. "PATCH-109"; resolves to `.fable5/patches/<patchId>.manifest.json`
  readonly isolated?: boolean; // if true and worktreeId is omitted, a safe ID is generated
  readonly worktreeId?: string; // explicit override; implies isolated
  readonly logDir?: string; // passthrough to runManifestCommands
  readonly commandTimeoutMs?: number; // passthrough to runManifestCommands
  readonly runner?: (manifest: PatchManifest, options: TestRunnerOptions) => Promise<EvidenceBundle>; // injected for tests; defaults to the real runManifestCommands, imported unmodified
}

export type CoordinatorResult =
  | {
      readonly ok: boolean; // exact passthrough of evidence.ok — never recomputed or overridden
      readonly reason: 'completed';
      readonly patchId: string;
      readonly manifestPath: string;
      readonly worktree: { readonly requested: boolean; readonly worktreeId: string | null };
      readonly evidence: EvidenceBundle;
    }
  | { readonly ok: false; readonly reason: 'invalid-arguments'; readonly message: string }
  | { readonly ok: false; readonly reason: 'manifest-not-found'; readonly manifestPath: string }
  | { readonly ok: false; readonly reason: 'invalid-manifest'; readonly message: string };

export function resolveManifestPath(repoRoot: string, options: Pick<CoordinatorOptions, 'manifestPath' | 'patchId'>): string;
export function generateWorktreeId(patchId: string): string; // `run-<lowercased-patchId>-<base36-timestamp>-<3-byte-hex>`, always matching worktreeLifecycle.ts's own `^[a-z0-9][a-z0-9-]{0,63}$` pattern — reuse that exact regex, do not redefine a divergent one
export async function runCoordinated(options: CoordinatorOptions): Promise<CoordinatorResult>;
```

**Bound behavior:**
- Exactly one of `manifestPath` / `patchId` must be supplied —
  `invalid-arguments` otherwise. `patchId` resolution is a pure string
  join (`.fable5/patches/<patchId>.manifest.json`) plus an
  existence check; `manifest-not-found` if the resolved path doesn't
  exist (checked before attempting to read/parse it).
- Manifest content is parsed with the **existing, unmodified**
  `patchManifestSchema` from `manifestSchema.ts` — no new validation
  logic is written; a parse failure maps to `invalid-manifest`.
- `worktreeId` resolution: explicit `worktreeId` wins; else, if
  `isolated: true`, call `generateWorktreeId(manifest.patchId)`; else
  `undefined` (no worktree — commands run in `repoRoot`, matching
  `runManifestCommands`'s own existing default when
  `useOwnedWorktree` is omitted).
- `runCoordinated` calls the injected/default `runManifestCommands`
  **exactly once**, passing through `repoRoot`, `logDir`,
  `commandTimeoutMs`, and `useOwnedWorktree: worktreeId ? { worktreeId } : undefined`
  — no other options, no retries, no parallel invocations.
- The returned `CoordinatorResult.ok` is an exact copy of
  `evidence.ok`. **No code path in this patch may compute, override,
  or reinterpret that boolean** — the coordinator resolves inputs and
  relays the output; it does not judge it.

## 2. New CLI and scripts (bind)

New file `scripts/harness/runCoordinatorCli.ts`:
```
vite-node scripts/harness/runCoordinatorCli.ts (--manifest <path> | --patch <PATCH-ID>) [--isolated] [--worktree-id <id>] [--log-dir <path>]
```
Prints the `CoordinatorResult` JSON to stdout (one object, matching
every other harness CLI's convention). Exits `0` if `ok`, `1`
otherwise.

New `package.json` script: `"harness:run"` (invokes the CLI via
`vite-node`, PATCH-105 §9a's convention — never `tsx`), plus
`"test:harness:coordinator:integration"` (§4). No `.gitignore` change
is expected — this patch produces no new output directory; it reuses
`.fable5/evidence/` (already ignored since PATCH-108) and
`.fable5/worktrees/` (already ignored since PATCH-107). If
implementation discovers a genuine need for a new ignored path, report
it rather than silently expanding scope.

## 3. Security and safety fences (bind, in addition to all standing
repo rules and PATCH-105–108's fences, which remain in force)

- **Never selects or edits a patch** — `patchId`/`manifestPath` are
  caller-supplied inputs; this code never chooses one on its own.
- **Never implements, reviews, or judges a result** — `ok` is an exact
  passthrough (§1); no threshold, retry, or "close enough" logic
  exists anywhere in this patch.
- **Never touches Git staging, commits, pushes, stashes, merges,
  resets, or rebases** — no function in this patch calls any of those
  in any form.
- **Never automates a model or reviewer handoff** — no network calls,
  no contacting any model/agent; it only resolves local inputs and
  calls one already-existing local function.
- **Never combines multiple patch executions** — `runCoordinated`
  processes exactly one manifest per call; there is no batch, queue,
  or loop construct anywhere in this patch's design.
- **Never runs concurrently with itself or with a direct
  `runManifestCommands` call** — this patch introduces no scheduling,
  locking, or concurrency primitive; it is a single synchronous
  (`async`, but not concurrent-with-itself) call chain, same as every
  other harness CLI.
- **Does not modify `scripts/harness/testRunner.ts`,
  `worktreeLifecycle.ts`, `serverLifecycle.ts`, `scopeValidator.ts`,
  `validateLandedCommit.ts`, `manifestSchema.ts`, or any existing CLI**
  — every import from those files is used exactly as landed.
- `generateWorktreeId` must reuse `worktreeLifecycle.ts`'s exact
  `^[a-z0-9][a-z0-9-]{0,63}$` pattern (import or duplicate the literal
  regex — implementer's choice, but the two must never be allowed to
  drift apart; add a unit test asserting they match) — an ID this
  function generates that `createWorktree` would itself reject is a
  defect.
- No secret or `.env.local` content is ever read, printed, or logged
  by any function in this patch — it only reads manifest JSON files
  and forwards already-validated options.
- All timeouts/waits are whatever `runManifestCommands` already
  bounds; this patch adds no new unbounded wait of its own (path
  resolution and ID generation are synchronous/local; the only
  `await` is the one delegated call).

## 4. Required tests (bind — unit-first, mocked `runner` injection,
same pattern as `testRunner.test.ts`'s `spawnRunner` injection)

New `scripts/harness/runCoordinator.test.ts` covering at minimum:
1. `patchId` resolves to the exact expected manifest path.
2. `manifestPath` (explicit) is used as-is, `patchId` resolution
   skipped.
3. neither `manifestPath` nor `patchId` supplied → `invalid-arguments`.
4. both supplied → `invalid-arguments`.
5. resolved manifest path does not exist → `manifest-not-found`, the
   injected runner is never called.
6. resolved manifest file exists but fails `patchManifestSchema.parse` →
   `invalid-manifest`, the injected runner is never called.
7. `isolated: true`, no `worktreeId` → a generated ID matching
   `generateWorktreeId`'s own pattern is passed to the injected runner
   as `useOwnedWorktree.worktreeId`.
8. explicit `worktreeId` → used verbatim, `generateWorktreeId` never
   called.
9. neither `isolated` nor `worktreeId` → `useOwnedWorktree` is
   `undefined` in the call to the injected runner.
10. injected runner's returned `EvidenceBundle.ok` is `true`/`false` →
    `CoordinatorResult.ok` is the exact same value in both cases
    (proves no override logic exists).
11. `generateWorktreeId` output always matches
    `^[a-z0-9][a-z0-9-]{0,63}$` across at least 20 generated samples
    (collision-pattern regression guard).
12. structured result shape — every result is JSON-serializable and
    matches its declared union member exactly.

**One controlled integration test**, new file
`scripts/harness/runCoordinator.integration.ts` (plain Node script
using `node:assert`, run via its own npm script, kept OUT of the
default `vitest run` sweep, same pattern as PATCH-105/107/108's
`.integration.ts` scripts):
- builds a small temporary manifest file (in a `mkdtemp` scratch
  directory) whose `requiredCommands` are simple `process.execPath -e`
  scripts (never the real application repo, never `npm run
  build`/`verify`/etc.), with `baseCommit` set to the real repo's
  current `HEAD` (read via `git rev-parse HEAD`, since a real worktree
  requires a real, existing commit).
- proves: `patchId`-style resolution works against a manifest placed
  at the expected relative path inside the scratch directory (treated
  as `repoRoot` for this test only); `isolated: true` with no
  explicit `worktreeId` produces a real, successfully-created PATCH-107
  worktree (via the real, unmodified `runManifestCommands` →
  `createWorktree` chain) whose ID matches the generator's pattern;
  the run completes and cleans up (no residual `git worktree list`
  entry afterward); the returned `CoordinatorResult.evidence` is a
  well-formed `EvidenceBundle`.
New `package.json` script: `"test:harness:coordinator:integration"`.

## 5. Exact file scope (bind)

**New files (5):**
1. `scripts/harness/runCoordinator.ts`
2. `scripts/harness/runCoordinator.test.ts`
3. `scripts/harness/runCoordinatorCli.ts`
4. `scripts/harness/runCoordinator.integration.ts`
5. `.fable5/patches/PATCH-109.manifest.json` (this patch pilots itself
   again, per PATCH-105–108 precedent — `baseCommit`: the exact value
   from the CTO's continuation prompt for this turn, not a value
   hardcoded here)

**Modified files (2):**
- `scripts/harness/types.ts` — additive only: the new
  `CoordinatorOptions`/`CoordinatorResult` types (or their mirrors),
  matching how PATCH-105–108 organized shared vs. module-local types.
- `package.json` — add exactly two new scripts (§2); no existing
  script line altered.

**Prohibited paths (must NOT change):** everything PATCH-105–108
prohibited, plus every existing file under `scripts/harness/` other
than `types.ts` (additive-only) — in particular `testRunner.ts`,
`testRunnerCli.ts`, `worktreeLifecycle.ts`, `worktreeCli.ts`,
`serverLifecycle.ts`, `serverCli.ts`, `manifestSchema.ts`,
`scopeValidator.ts`, `validateScope.ts`, `validateLandedCommit.ts`,
and every prior patch's own manifest file.

**Expected file count:** 5 new, 2 modified, 0 deleted, 0 renamed.

**Dependency choices:** zero new dependencies. Native `node:crypto`
(for ID generation), `node:fs`, `node:path` only. Reuses `vite-node`
(PATCH-105 §9a), `zod`/`patchManifestSchema` (already present), and
imports PATCH-108's `runManifestCommands` **unmodified**.

## 6. Validation matrix (bind — two non-overlapping lifecycle phases
from the start, per PATCH-107/108's own governance pattern)

### 6a. Phase 1 — uncommitted implementation validation (bind; gates
independent review and, later, commit authorization)

1. `npx vitest run scripts/harness` — all existing tests still green
   (confirm the pre-patch baseline at implementation start), plus the
   new tests from §4, growing only.
2. `npm run test:harness:coordinator:integration` — the real
   controlled integration test, green, confirmed to leave zero
   residual worktree/branch/process/file-handle state.
3. `npm run harness:validate-scope -- .fable5/patches/PATCH-109.manifest.json` —
   pre-commit mode, run against PATCH-109's own candidate while it
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
   confirm zero residual state from the integration test.
10. Fresh independent review (DeepSeek V4 Pro primary, Kepler/Gemini
    3.1 Pro fallback — NOT Sonnet) required before commit.

**The implementer must leave the candidate uncommitted** after every
Phase 1 gate passes and independent review returns PASS — report
results and await explicit commit authorization from the CTO.

### 6b. Phase 2 — post-commit landed validation (bind; runs only after
explicit commit authorization has been given and the reviewed
candidate has actually been committed with the exact bound message)

1. `npm run harness:validate-landed -- .fable5/patches/PATCH-109.manifest.json HEAD` —
   confirms the landed commit's parent matches `baseCommit`, its
   changed files are exactly the bound scope, and its message matches
   `exactCommitMessage`.
2. **Failure of this check is a hard stop before closure**, exactly as
   bound for PATCH-107 §12b / PATCH-108 §8b.
3. The companion `harness:validate-scope` run will correctly report
   `ok:false` at this point (expected post-commit divergence, not a
   regression) — do not chase this as a new bug.

## 7. Hard-stop conditions (bind)

STOP, report, do not commit, if: any file outside §5's exact list is
touched; any existing file under `scripts/harness/` other than
`types.ts` is modified; any new runtime dependency is added; this
patch selects or edits a patch on its own, implements code, reviews
results, or decides a failure is acceptable in any form;
`CoordinatorResult.ok` is ever computed as anything other than an
exact passthrough of `evidence.ok`; `runManifestCommands` is called
more than once per `runCoordinated` invocation, or is called
concurrently with another invocation; any Git staging, commit, push,
stash, merge, reset, or rebase operation is issued by any function in
this patch; `generateWorktreeId`'s pattern ever diverges from
`worktreeLifecycle.ts`'s own `^[a-z0-9][a-z0-9-]{0,63}$` pattern; any
secret or `.env.local` content is printed, logged, or committed; the
manifest pilot fails its own pre-commit validation; the controlled
integration test (§4) fails or leaves residual state; Explorer agents,
retrieval memory, remote sandboxes, automated model handoffs, or a new
CanvasClient extraction are introduced under this patch's scope; any
required Phase 1 gate in §6a fails or is skipped before independent
review or commit authorization; §6b's post-commit landed validation is
run, or its failure is treated as resolved, before an explicit,
separate CTO commit-authorization action has both occurred and
actually landed the reviewed commit.

## 8. Health ledger

Unchanged ruling (option B, retired) — not recalculated here.

**Do not authorize PATCH-110.**
