# PATCH-110 — Evidence-Bundle Verification Layer

**Purpose:** a narrow, read-only validator that checks one
`EvidenceBundle` (PATCH-108's output) against the manifest that
produced it — confirming every required command is represented
exactly once, in the right order, with exit codes and timeout states
that are internally consistent with the bundle's own `ok`/`stoppedEarly`
fields, that expected test totals were honored where the manifest
governs them, and that every referenced log file actually exists
inside the governed evidence root. It never runs a command, never
judges a *content* failure as acceptable, and never touches Git state
— it only checks that an already-produced evidence bundle is what it
claims to be.

## 0. Selection rationale (bind)

The fresh harness census at PATCH-109's closure (2026-07-24) confirmed,
by direct grep and inspection: **no evidence-bundle verifier exists
anywhere in the repo.** PATCH-108 produces `EvidenceBundle` JSON;
PATCH-109 resolves inputs and calls PATCH-108 once; nothing checks
that a bundle a human or a future automated consumer is handed is
actually well-formed, complete, and internally consistent with the
manifest it was run against. This is a genuine, non-duplicative gap —
distinct from PATCH-109's resolution layer and from PATCH-105–108's
execution primitives — and is Option A from the CTO's preferred-areas
list, selected over Option B (an evidence summary/renderer) because a
renderer presupposes a validated bundle to render, which does not yet
exist as a capability, and over any further wrapper around
PATCH-108/109, which the census found nothing further to justify.

**This is NOT:** a second test-execution engine, a Codebase Explorer,
retrieval-based governance memory, an automated handoff orchestrator,
or a remote/cloud sandbox. It never executes a command, never edits
Git state, never edits an evidence bundle, and never performs an
implementation/reviewer handoff. It also never decides that a *failed*
command inside an otherwise well-formed bundle is acceptable — a
`CommandExecutionRecord` with `ok:false` is not this patch's concern to
judge; this patch's only question is "does this bundle accurately and
completely represent what the manifest required," not "was the run
good."

**Status:** AUTHORIZED, NOT STARTED.

**Implementer:** **GPT-5.5** — this patch is a pure
validation/composition layer (structural + semantic checks over
already-produced JSON and already-existing files), with no new process
spawning, worktree, or server logic of its own beyond one controlled
integration test that reuses PATCH-108's own unmodified
`runManifestCommands`. Neither Codex 5.6 Terra's process/filesystem
depth nor Sol's Windows git/path depth is required. **Reviewer:**
independent read-only reviewer (DeepSeek V4 Pro primary, Kepler or
Gemini 3.1 Pro fallback) — PASS required before commit. Sonnet
(CTO/governance owner) authored/authorized this patch and must NOT
perform its review. **Authored:** Sonnet (CTO), 2026-07-24.

**Base commit (bind — implementation must start here):** state your
current `git rev-parse HEAD`/`origin/main` before starting and confirm
it against the value given in the CTO's continuation prompt for this
turn — **not** whatever static value appears in this file, per
PATCH-105 §7a / PATCH-106 §0a / PATCH-107–109's own header-note
pattern (this governance-authoring commit necessarily advances `main`
by one commit after this text is written). The continuation prompt is
authoritative for the base commit and the manifest's `baseCommit`;
this document is not, for that one field only.

**Bound implementation commit message (verbatim):**
`feat(harness): add evidence-bundle verification layer (PATCH-110)`

---

## 1. Interfaces (bind)

New file `scripts/harness/evidenceSchema.ts` — a Zod schema for the
`EvidenceBundle` shape, used to structurally validate an
**untrusted, externally-read JSON file** before any semantic check
runs (the bundle is read from disk, not passed in-process, so it must
be treated as external input per this repo's own input-validation
convention):

```ts
export const evidenceBundleSchema = z.object({
  ok: z.boolean(),
  patchId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  totalDurationMs: z.number().nonnegative(),
  commands: z.array(z.object({
    label: z.string(),
    command: z.string(),
    args: z.array(z.string()),
    exitCode: z.number().int(),
    expectedExitCode: z.number().int(),
    ok: z.boolean(),
    timedOut: z.boolean(),
    durationMs: z.number().nonnegative(),
    stdoutLogPath: z.string(),
    stderrLogPath: z.string(),
    parsedTestTotals: z.object({
      tests: z.number().int().nonnegative(),
      files: z.number().int().nonnegative(),
      passed: z.number().int().nonnegative().optional(),
      failed: z.number().int().nonnegative().optional(),
      skipped: z.number().int().nonnegative().optional(),
      durationMs: z.number().nonnegative().optional(),
      parseError: z.string().optional(),
    }).nullable(),
    startedAt: z.string(),
    finishedAt: z.string(),
  })),
  stoppedEarly: z.boolean(),
  parsedTestTotals: z.object({ tests: z.number().int().nonnegative(), files: z.number().int().nonnegative() }).nullable(),
  expectedTestTotalsMatch: z.union([z.boolean(), z.literal('not-checked')]),
  worktree: z.object({ used: z.boolean(), worktreeId: z.string().nullable() }),
  serverManaged: z.object({ used: z.boolean(), started: z.boolean() }),
  cleanup: z.object({
    ok: z.boolean(),
    worktreeRemoveResult: z.unknown().nullable(),
    serverStopResult: z.unknown().nullable(),
    errors: z.array(z.string()),
  }),
  evidenceBundlePath: z.string(),
});
```

(Field-for-field mirror of `types.ts`'s existing `EvidenceBundle`
shape — do not diverge from it; if implementation finds the shapes
have drifted, report it rather than silently reconciling by guessing
which side is correct.)

New file `scripts/harness/evidenceValidator.ts`:

```ts
export interface EvidenceValidationOptions {
  readonly evidenceRoot: string; // governed root every log path must resolve inside, e.g. `<repoRoot>/.fable5/evidence`
  readonly fileExists?: (path: string) => boolean; // injected for tests; defaults to node:fs existsSync
}

export interface EvidenceValidationResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
  readonly checks: {
    readonly bundleShapeValid: boolean; // evidenceBundleSchema.parse succeeded
    readonly patchIdMatches: boolean; // bundle.patchId === manifest.patchId
    readonly requiredCommandsRepresented: boolean; // every manifest.requiredCommands label appears exactly once (or, if stoppedEarly, appears as a strict prefix — see §2)
    readonly noExtraCommandRecords: boolean; // no record whose label is absent from manifest.requiredCommands
    readonly noDuplicateCommandRecords: boolean;
    readonly orderMatches: boolean; // commands[] label order matches manifest.requiredCommands order, up to any stoppedEarly truncation
    readonly exitCodeConsistency: boolean; // every record.ok === (record.exitCode === record.expectedExitCode)
    readonly stoppedEarlyConsistency: boolean; // stoppedEarly === true iff some record has ok:false and it is the last record present; stoppedEarly === false implies every record.ok === true
    readonly expectedTestTotalsGoverned: boolean | 'not-checked'; // 'not-checked' if manifest.expectedTestTotals.unit absent; else must equal bundle.expectedTestTotalsMatch !== false
    readonly overallOkConsistency: boolean; // bundle.ok === (every command ok && expectedTestTotalsMatch !== false)
    readonly logFilesExistWithinRoot: boolean; // every stdoutLogPath/stderrLogPath (a) exists per fileExists, and (b) canonicalizes inside options.evidenceRoot — no traversal
  };
}

export async function validateEvidenceBundle(
  manifest: PatchManifest,
  bundle: unknown, // raw, untrusted — schema-validated internally via evidenceBundleSchema
  options: EvidenceValidationOptions,
): Promise<EvidenceValidationResult>;
```

## 2. Bound semantics (bind — precise, non-negotiable rules the
validator must apply)

- **Schema first:** `bundle` is parsed with `evidenceBundleSchema`
  before any other check runs. On failure, `bundleShapeValid: false`
  and every other check is `false` (nothing else can be trusted to
  evaluate meaningfully against a malformed shape) — the violations
  list should still name the schema failure clearly.
- **Representation:** build the ordered list of labels from
  `manifest.requiredCommands`. If `bundle.stoppedEarly` is `false`,
  `bundle.commands` must have exactly those labels, in exactly that
  order, one each (`requiredCommandsRepresented`,
  `noExtraCommandRecords`, `noDuplicateCommandRecords`, `orderMatches`
  all true). If `bundle.stoppedEarly` is `true`, `bundle.commands`
  must be a strict, non-empty, order-preserving **prefix** of that
  label list, with every record except the last having `ok:true` and
  the last having `ok:false` — anything else (an early stop with all
  -`ok:true` records, or a full-length list that is still marked
  `stoppedEarly:true`, or a stop that isn't a clean prefix) is a
  `stoppedEarlyConsistency` violation.
- **Exit-code consistency:** for every record,
  `record.ok === (record.exitCode === record.expectedExitCode)`
  must hold exactly — a record claiming `ok:true` with mismatched
  codes (or vice versa) is a defect this validator exists to catch,
  not to paper over.
- **Test totals:** `'not-checked'` when
  `manifest.expectedTestTotals.unit` is absent; otherwise
  `expectedTestTotalsGoverned` is `true` only if
  `bundle.expectedTestTotalsMatch === true`, `false` if it is
  `false` or `'not-checked'` (a manifest that governs totals but got a
  bundle that never checked them is itself a finding, not a pass).
- **Overall consistency:** `bundle.ok` must equal the logical AND of
  every command's `ok` and `expectedTestTotalsMatch !== false` — the
  validator recomputes this independently from the bundle's own
  fields and flags any mismatch; it never trusts `bundle.ok` at face
  value.
- **Log files:** for every record, both `stdoutLogPath` and
  `stderrLogPath` must (a) exist per `fileExists`, and (b) resolve,
  after canonicalization, to a path inside `options.evidenceRoot` —
  reuse the same traversal-rejection approach already established in
  `worktreeLifecycle.ts`'s path handling (canonicalize, then check
  containment; never a string-prefix check alone).
- **This validator never executes anything named inside the bundle**
  — it reads `stdoutLogPath`/`stderrLogPath` only to confirm
  existence/location, never to open, parse, or judge their contents.
  Content-level judgment (was the failure acceptable, is this log
  interesting) is explicitly out of scope, per §0.

## 3. New CLI and scripts (bind)

New file `scripts/harness/evidenceValidatorCli.ts`:
```
vite-node scripts/harness/evidenceValidatorCli.ts <manifest-path> <evidence-bundle-path> [--evidence-root <path>]
```
Reads and JSON-parses the bundle file (schema validation happens
inside `validateEvidenceBundle`, not the CLI), reads and
`patchManifestSchema`-parses the manifest, prints the
`EvidenceValidationResult` JSON to stdout (one object, matching every
other harness CLI's convention). Exits `0` if `ok`, `1` otherwise.
Default `--evidence-root` is `<repoRoot>/.fable5/evidence`.

New `package.json` script: `"harness:validate-evidence"` (via
`vite-node`, PATCH-105 §9a's convention — never `tsx`), plus
`"test:harness:evidencevalidator:integration"` (§5). No `.gitignore`
change is expected.

## 4. Security and safety fences (bind, in addition to all standing
repo rules and PATCH-105–109's fences, which remain in force)

- **Never executes a command** — no `child_process` import, no spawn,
  anywhere in `evidenceValidator.ts`/`evidenceSchema.ts`/
  `evidenceValidatorCli.ts`. (The integration test, §5, is the one
  place a real run happens, and it does so only to produce a real
  bundle to validate — via PATCH-108's own unmodified
  `runManifestCommands`, never new spawn logic in this patch's own
  library code.)
- **Never edits Git state** — no staging, commit, push, stash, merge,
  reset, or rebase in any form.
- **Never edits an evidence bundle or its log files** — strictly
  read-only against both.
- **Never decides a failed command is acceptable** — there is no
  "ignore this failure" or "waive this mismatch" configuration
  anywhere in this interface; every check in §1/§2 is a hard true/false
  (or the explicit `'not-checked'` state where a governing field is
  absent), never a tunable threshold.
- **Never performs an implementation/reviewer handoff** — no network
  calls, no contacting any model/agent.
- Does not modify `scripts/harness/testRunner.ts`,
  `worktreeLifecycle.ts`, `serverLifecycle.ts`, `scopeValidator.ts`,
  `validateLandedCommit.ts`, `manifestSchema.ts`, `runCoordinator.ts`,
  or any existing CLI — every import from those files (if any; this
  patch's library code needs none of them directly, only the
  integration test needs `runManifestCommands`) is used exactly as
  landed.
- No secret or `.env.local` content is ever read, printed, or logged —
  this validator inspects log file *paths*, never their contents.

## 5. Required tests (bind — unit-first, mocked `fileExists`
injection, same pattern as `scopeValidator.ts`'s injected
`CommandRunner`)

New `scripts/harness/evidenceValidator.test.ts` covering at minimum:
1. a fully conforming bundle (all commands `ok:true`, `stoppedEarly:false`,
   correct order, all logs "exist") → `ok:true`, every check true
   (`expectedTestTotalsGoverned: 'not-checked'` when the manifest has
   no `expectedTestTotals`).
2. malformed bundle JSON (fails `evidenceBundleSchema`) →
   `bundleShapeValid:false`, `ok:false`, every other check `false`.
3. `patchId` mismatch between bundle and manifest → violation.
4. a required command missing from `bundle.commands` (with
   `stoppedEarly:false`) → `requiredCommandsRepresented:false`.
5. an extra command record not in `manifest.requiredCommands` →
   `noExtraCommandRecords:false`.
6. a duplicated command label → `noDuplicateCommandRecords:false`.
7. commands present but out of order → `orderMatches:false`.
8. a record with `ok:true` but `exitCode !== expectedExitCode` (or the
   reverse) → `exitCodeConsistency:false`.
9. `stoppedEarly:true` with a clean valid prefix and correct
   last-record `ok:false` → `stoppedEarlyConsistency:true` (this is
   the *valid* early-stop shape, not a violation).
10. `stoppedEarly:true` but all present records are `ok:true` →
    `stoppedEarlyConsistency:false`.
11. `manifest.expectedTestTotals.unit` present,
    `bundle.expectedTestTotalsMatch: false` →
    `expectedTestTotalsGoverned:false`.
12. `bundle.ok:true` claimed but a command record is actually
    `ok:false` → `overallOkConsistency:false` (validator recomputes,
    never trusts the bundle's own `ok`).
13. a log path that "doesn't exist" per the injected `fileExists` →
    `logFilesExistWithinRoot:false`.
14. a log path that exists but resolves outside `evidenceRoot` (e.g.
    via `..` segments) → `logFilesExistWithinRoot:false`.
15. structured result shape — every result is JSON-serializable and
    matches `EvidenceValidationResult` exactly.

**One controlled integration test**, new file
`scripts/harness/evidenceValidator.integration.ts` (plain Node script
using `node:assert`, run via its own npm script, kept OUT of the
default `vitest run` sweep, same pattern as PATCH-105/107/108/109's
`.integration.ts` scripts):
- builds a small temporary manifest (in a `mkdtemp` scratch directory,
  `baseCommit` set to the real repo's current `HEAD`) whose
  `requiredCommands` are simple `process.execPath -e` scripts (never
  the real application repo).
- runs it for real via PATCH-108's own unmodified
  `runManifestCommands` (imported, not reimplemented) to produce a
  real `EvidenceBundle` with real log files on disk.
- validates that real bundle with `validateEvidenceBundle` and asserts
  `ok:true`.
- then deletes (or renames) one referenced log file and re-validates,
  asserting `logFilesExistWithinRoot:false` and overall `ok:false` —
  proving the check is real, not a no-op.
- cleans up its own scratch directory at the end.
New `package.json` script: `"test:harness:evidencevalidator:integration"`.

## 6. Exact file scope (bind)

**New files (5):**
1. `scripts/harness/evidenceSchema.ts`
2. `scripts/harness/evidenceValidator.ts`
3. `scripts/harness/evidenceValidator.test.ts`
4. `scripts/harness/evidenceValidatorCli.ts`
5. `scripts/harness/evidenceValidator.integration.ts`

Plus the manifest pilot:
6. `.fable5/patches/PATCH-110.manifest.json` (this patch pilots itself
   again, per PATCH-105–109 precedent — `baseCommit`: the exact value
   from the CTO's continuation prompt for this turn, not a value
   hardcoded here)

**Modified files (2):**
- `scripts/harness/types.ts` — additive only: the new
  `EvidenceValidationOptions`/`EvidenceValidationResult` types (or
  their mirrors), matching how PATCH-105–109 organized shared vs.
  module-local types.
- `package.json` — add exactly two new scripts (§3); no existing
  script line altered.

**Prohibited paths (must NOT change):** everything PATCH-105–109
prohibited, plus every existing file under `scripts/harness/` other
than `types.ts` (additive-only) — in particular `testRunner.ts`,
`testRunnerCli.ts`, `worktreeLifecycle.ts`, `worktreeCli.ts`,
`serverLifecycle.ts`, `serverCli.ts`, `manifestSchema.ts`,
`scopeValidator.ts`, `validateScope.ts`, `validateLandedCommit.ts`,
`runCoordinator.ts`, `runCoordinatorCli.ts`, and every prior patch's
own manifest file.

**Expected file count:** 6 new, 2 modified, 0 deleted, 0 renamed.

**Dependency choices:** zero new dependencies. `zod` (already
present) for `evidenceSchema.ts`; native `node:fs`, `node:path`,
`node:os` for the integration test's scratch directory. The
integration test imports PATCH-108's `runManifestCommands`
**unmodified** — no new spawn logic is written in this patch's own
library code.

## 7. Validation matrix (bind — two non-overlapping lifecycle phases
from the start, per PATCH-107–109's own governance pattern)

### 7a. Phase 1 — uncommitted implementation validation (bind; gates
independent review and, later, commit authorization)

1. `npx vitest run scripts/harness` — all existing tests still green
   (confirm the pre-patch baseline at implementation start), plus the
   new tests from §5, growing only.
2. `npm run test:harness:evidencevalidator:integration` — the real
   controlled integration test, green, confirmed to leave zero
   residual process/file-handle/scratch-directory state.
3. `npm run harness:validate-scope -- .fable5/patches/PATCH-110.manifest.json` —
   pre-commit mode, run against PATCH-110's own candidate while it
   remains uncommitted. Expects `ok:true`,
   `commitMessageMatches: 'not-checked'`.
4. `npx tsc --noEmit` — clean.
5. `npm run check:boundaries` — clean, no-op confirmation.
6. Full `npx vitest run` — must remain at or above the pre-patch
   baseline, growing only by the new test cases, never shrinking or
   newly failing.
7. `npm run verify` — full green.
8. `npm run build` — clean (confirm no dev server running first).
9. Windows process/filesystem cleanup checks: confirm zero residual
   state from the integration test.
10. Fresh independent review (DeepSeek V4 Pro primary, Kepler/Gemini
    3.1 Pro fallback — NOT Sonnet) required before commit.

**The implementer must leave the candidate uncommitted** after every
Phase 1 gate passes and independent review returns PASS — report
results and await explicit commit authorization from the CTO.

### 7b. Phase 2 — post-commit landed validation (bind; runs only after
explicit commit authorization has been given and the reviewed
candidate has actually been committed with the exact bound message)

1. `npm run harness:validate-landed -- .fable5/patches/PATCH-110.manifest.json HEAD` —
   confirms the landed commit's parent matches `baseCommit`, its
   changed files are exactly the bound scope, and its message matches
   `exactCommitMessage`.
2. **Failure of this check is a hard stop before closure**, exactly as
   bound for PATCH-107 §12b / PATCH-108 §8b / PATCH-109 §6b.
3. The companion `harness:validate-scope` run will correctly report
   `ok:false` at this point (expected post-commit divergence, not a
   regression) — do not chase this as a new bug.

## 8. Hard-stop conditions (bind)

STOP, report, do not commit, if: any file outside §6's exact list is
touched; any existing file under `scripts/harness/` other than
`types.ts` is modified; any new runtime dependency is added; this
patch's library code (`evidenceValidator.ts`/`evidenceSchema.ts`/
`evidenceValidatorCli.ts`) ever spawns a process or executes a command
named inside a bundle; any Git staging, commit, push, stash, merge,
reset, or rebase operation is issued by any function in this patch;
`evidenceValidator.ts` ever writes to, modifies, or deletes an evidence
bundle or a log file it inspects; any check in §1/§2 is implemented as
a tunable threshold, a "warn only," or an "acceptable failure" mode
rather than a hard true/false; `bundle.ok` is ever trusted at face
value instead of independently recomputed
(`overallOkConsistency`); any secret or `.env.local` content is
printed, logged, or committed; the manifest pilot fails its own
pre-commit validation; the controlled integration test (§5) fails or
leaves residual state; Explorer agents, retrieval memory, remote
sandboxes, automated model handoffs, or a new CanvasClient extraction
are introduced under this patch's scope; any required Phase 1 gate in
§7a fails or is skipped before independent review or commit
authorization; §7b's post-commit landed validation is run, or its
failure is treated as resolved, before an explicit, separate CTO
commit-authorization action has both occurred and actually landed the
reviewed commit.

## 9. Health ledger

Unchanged ruling (option B, retired) — not recalculated here.

**Do not authorize PATCH-111.**
