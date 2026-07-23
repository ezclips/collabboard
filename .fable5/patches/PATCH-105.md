# PATCH-105 — Fable Harness Reliability Foundation

**Purpose:** bounded owned dev-server lifecycle, executable patch
manifests, automated scope validation, and structured results — a
narrow infrastructure foundation, not a rewrite of the governance
process itself.

**Status:** **DONE.** Landed commit
`ab7de32e1d941b11ddfb5897de6a92fbfde5d904` (exact bound message,
below). Independent review PASS. See §13 for full closure record.

**Implementer:** Codex 5.6. **Reviewer:** independent read-only
reviewer (DeepSeek V4 Pro primary, Kepler or Gemini 3.1 Pro fallback)
— PASS required before commit. Sonnet (CTO/governance owner)
authored/authorized this patch and must NOT perform its review.
**Authored:** Sonnet (CTO), 2026-07-23.

**Behavioral/source base commit AND implementation start HEAD (bind,
to be confirmed exact at authorization-close time — see the manifest
pilot in §7, which binds the exact value):**
`<HEAD at the moment this patch's governance commit lands>`

**Bound implementation commit message (verbatim):**
`chore(harness): add bounded server lifecycle, patch manifests, and scope validation (PATCH-105)`

---

## 0. Why this patch, and what it explicitly is NOT (bind)

This session repeatedly hand-rolled the same three things, every
single governance turn that needed a live dev server or a scope check:
(1) start `npm run dev` in the background, poll `curl`/`Get-NetTCPConnection`
in a loop with no shared timeout convention, (2) hunt down the right
PID(s) via ad-hoc `Get-CimInstance Win32_Process` filters and
`Stop-Process`, risking killing an unrelated process or missing a
child, and (3) manually re-type the same `git status`/`git hash-object`/
`git diff --check` sequence and eyeball the output against a patch
document's prose fences. `SKILL.md` already documents the exact
locale-parsing trap (German `netstat` prints `ABHÖREN`, not
`LISTENING`) and the "never build under a live dev server" hazard —
evidence this has been a standing, known-fragile manual process, not a
one-off inconvenience. `e2e/run-carried-groups.mjs` (the PATCH-096
grouped runner) already assumes a server is running
(`assertConfiguration()` requires `PW_BASE_URL` to be pre-set) and
already prints structured per-group JSON-shaped totals — proving the
"structured result" idiom is already accepted here, just not applied
to server lifecycle or scope checking.

**This patch is exactly four things (§A-D below) and nothing else:**

- **A.** A bounded, owned dev-server lifecycle helper (start/poll/stop),
  usable both as a CLI and as an importable function.
- **B.** A machine-readable patch-manifest schema (JSON + Zod, no new
  dependency — `zod` is already used throughout `lib/domain`).
- **C.** An automated scope validator that checks a manifest's
  expectations against live Git/filesystem state and fails nonzero on
  any violation.
- **D.** Structured (JSON) results for all of the above.

**Explicitly out of scope for PATCH-105 (do not add, do not imply,
STOP and report if asked to expand into any of these):** Explorer
agents, retrieval memory, remote sandboxes, automated model handoffs,
any new CanvasClient extraction, migrating any historical patch
document to the new manifest format, a general-purpose orchestration
framework, or any new runtime dependency. This patch does not replace
prose governance documents — the manifest is an ADDITIONAL,
machine-checkable artifact alongside the existing `.md` patch doc, not
a substitute for it.

## 1. Harness-gap diagnosis (bind — what was inspected, what was found)

Inspected: `package.json` scripts, `e2e/run-carried-groups.mjs`,
`playwright.config.ts`, `vitest.config.ts`, `.fable5/docs/SKILL.md`,
`.fable5/docs/PATCH_REFERENCE.md`, `.fable5/docs/CTO_GUIDELINES.md`,
`scripts/` (currently a single file, `test-ai-prompts.ts`), and this
session's own repeated live-reproduction turns (PATCH-102 §21-§25),
which manually reinvented the exact same server-start/poll/kill
sequence four separate times.

**Findings:**
- No `scripts/` sub-namespace exists yet for anything beyond a single
  flat file — `scripts/harness/` would be a new, small, clean
  sub-namespace, not a competing top-level framework.
- No server-lifecycle helper exists anywhere in the repo. Every prior
  turn requiring `PW_BASE_URL=http://localhost:3000` re-derived the
  start/poll/kill sequence from scratch, in raw Bash/PowerShell,
  with no shared timeout budget, no PID-ownership record, and no
  structured result — purely prose-narrated in chat.
- `SKILL.md`'s own locale-parsing warning (`netstat`'s `ABHÖREN` vs
  `LISTENING`) is a standing, documented trap for exactly the kind of
  ad-hoc port-check every prior turn performed by hand.
- `playwright.config.ts`'s own `webServer` block already demonstrates
  the "reuse an existing healthy server, else start one" concept for
  the `npm run build`/`:3100` production-preview path — but it has no
  equivalent for the `:3000` dev-server path used by every
  live-diagnostic turn this session, and Playwright's own webServer
  logic is not reusable outside a Playwright test run (nothing else in
  the repo can ask "is a server already up and healthy?" and get a
  structured answer).
- `e2e/run-carried-groups.mjs` already proves the exact shape this
  patch should extend: bounded child-process spawning
  (`stdio: ['ignore', 'pipe', 'pipe']`, `windowsHide: true`), signal
  handling (`SIGINT`/`SIGTERM` kill the active child), and a
  regex-based totals extractor (`extractTotals`) feeding a structured,
  tabular summary — precedent for "parse totals where useful," not a
  new pattern to invent.
- No scope-validation script exists — every governance turn this
  session manually ran `git status --short --untracked-files=all` /
  `git rev-parse HEAD` / `git hash-object <path>` one at a time and
  compared the output by eye against a patch document's bound blobs
  and file lists. This is exactly the repeated, error-prone,
  hand-verification work `PATCH_REFERENCE.md`'s "gates bind PRINTED
  TEXT, never bare exit codes" rule already gestures at solving, but no
  executable form of that rule exists yet.
- `zod` is already a project dependency (used throughout
  `lib/domain/**`); no JSON-schema library (`ajv`) or YAML parser
  (`js-yaml`) exists or is needed — the manifest is plain JSON,
  validated with a Zod schema, matching the codebase's own established
  validation idiom exactly.
- `vitest.config.ts`'s `test.include` is currently scoped to
  `lib/domain/**/*.test.ts` and `lib/infra/**/*.test.ts` only — it does
  not yet cover any `scripts/**` tests.

## 2. Server-lifecycle interface (Part A, bind)

New file `scripts/harness/serverLifecycle.ts`. Exported functions
(exact names not pinned character-for-character, but the shape below
is bound):

```ts
export interface ServerLifecycleConfig {
  readonly command: string;                // e.g. "npm"
  readonly args: readonly string[];        // e.g. ["run", "dev"]
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly readinessUrl: string;           // e.g. "http://localhost:3000"
  readonly readinessTimeoutMs: number;     // hard ceiling, no indefinite wait
  readonly pollIntervalMs: number;
  readonly acceptableStatusCodes?: readonly number[]; // default [200, 300..399, 404]
}

export interface OwnedServerHandle {
  readonly pid: number;
  readonly ownedByHarness: true;
  readonly startedAt: string; // ISO timestamp
  readonly stdoutLogPath: string;
  readonly stderrLogPath: string;
}

export type ServerStartResult =
  | { readonly ok: true; readonly reason: 'started'; readonly handle: OwnedServerHandle }
  | { readonly ok: true; readonly reason: 'already-healthy-unowned'; readonly detectedUrl: string }
  | { readonly ok: false; readonly reason: 'readiness-timeout'; readonly waitedMs: number }
  | { readonly ok: false; readonly reason: 'port-conflict-unhealthy'; readonly port: number }
  | { readonly ok: false; readonly reason: 'spawn-error'; readonly message: string }
  | { readonly ok: false; readonly reason: 'malformed-readiness-url'; readonly message: string };

export interface ServerStopResult {
  readonly ok: boolean;
  readonly reason: 'stopped' | 'not-owned-refused' | 'already-stopped' | 'stop-timeout';
  readonly portFreeAfterStop: boolean;
}

export async function startOwnedServer(config: ServerLifecycleConfig): Promise<ServerStartResult>;
export async function stopOwnedServer(handle: OwnedServerHandle, timeoutMs: number): Promise<ServerStopResult>;
export async function probeReadiness(url: string, timeoutMs: number, pollIntervalMs: number): Promise<{ ready: boolean; waitedMs: number }>;
export async function detectPortOwnership(port: number): Promise<{ inUse: boolean; healthyResponse: boolean }>;
```

**Required behavior (bind):**
- **One owned server at a time per process invocation.** Before
  starting, `detectPortOwnership` MUST be called against the target
  port. If a healthy response is already present, return
  `{ ok: true, reason: 'already-healthy-unowned' }` and do NOT spawn a
  second process — this is the "refuse unsafe duplicate startup"
  requirement. If the port is in use but does NOT answer healthily
  within one immediate probe, return `{ ok: false, reason:
  'port-conflict-unhealthy' }` — never silently proceed to spawn
  anyway.
- **Bounded readiness wait.** `probeReadiness` polls at
  `pollIntervalMs` and MUST return within `readinessTimeoutMs` no
  matter what — no `while(true)` without a deadline check, no promise
  that only resolves on success. A malformed `readinessUrl` (fails
  `new URL(...)` construction) MUST be rejected synchronously with
  `{ ok: false, reason: 'malformed-readiness-url' }` BEFORE any process
  is spawned or any network call is attempted.
- **PID/ownership tracking.** `startOwnedServer`'s returned handle
  captures the real spawned PID and marks `ownedByHarness: true`. The
  harness must never attempt to stop a process it did not itself spawn
  in the same call — `stopOwnedServer` takes the `OwnedServerHandle`
  value, never a bare PID number, making it structurally impossible to
  target an unowned process by accident.
- **stdout/stderr capture.** Redirected to files under a
  harness-owned, allowlisted log directory (see §5's exact-path
  allowlist), never left attached to the parent's own stdout/stderr
  (avoids interleaving with the caller's own structured JSON output).
- **Stop = owned process tree only.** `stopOwnedServer` must terminate
  the exact spawned process (and, on Windows, its child tree — `next
  dev` spawns a child `node` process for the actual server, matching
  what this session observed firsthand: killing only the wrapper
  `cmd.exe`/`npm` PID left the real listener alive on the port). Use
  Windows-safe termination (`taskkill /PID <pid> /T /F` scoped to the
  exact owned PID and its descendants, or the Node
  `child_process.spawn(..., { detached: false })` + platform-appropriate
  kill; never a bare, unscoped `taskkill /IM node.exe /F` and never
  `pkill node` — see §5's explicit prohibition). Verify the port is
  free AFTER stopping (re-run `detectPortOwnership`) and report it in
  `portFreeAfterStop` — do not assume termination succeeded.
- **Windows-first.** All shell interactions must work under Windows
  PowerShell/cmd (this repo's actual environment) — no assumption of a
  POSIX-only tool (`lsof`, bare `kill -9`) without a Windows-safe
  equivalent path.
- **Never an indefinite wait.** Every wait in this module (readiness
  poll, stop confirmation) has an explicit, passed-in millisecond
  ceiling and returns a structured failure result on expiry — never
  throws an uncaught timeout, never blocks the caller forever.

## 3. Patch-manifest schema (Part B, bind)

New file `scripts/harness/manifestSchema.ts` — a Zod schema (`zod`,
already a dependency) plus the inferred TypeScript type. Manifests are
plain `.json` files (no new YAML dependency). Minimum bound shape:

```ts
import { z } from 'zod';

export const patchManifestSchema = z.object({
  patchId: z.string().regex(/^PATCH-\d{3,4}$/),
  baseCommit: z.string().regex(/^[0-9a-f]{40}$/),
  allowedFiles: z.array(z.string()),           // repo-relative paths, may change
  prohibitedFiles: z.array(z.string()).default([]), // must never appear in diff/staged/untracked
  allowedUntrackedFiles: z.array(z.string()).default([]),
  generatedArtifactPaths: z.array(z.string()).default(['test-results', 'playwright-report', '.next/trace']),
  stashPolicy: z.enum(['must-be-empty', 'must-be-unchanged', 'no-policy']),
  requiredCommands: z.array(z.object({
    label: z.string(),
    command: z.string(),
    args: z.array(z.string()).default([]),
    expectedExitCode: z.number().default(0),
  })),
  expectedTestTotals: z.object({
    unit: z.object({ tests: z.number(), files: z.number() }).optional(),
    e2e: z.record(z.string(), z.string()).optional(),
  }).optional(),
  exactCommitMessage: z.string(),
  serverConfig: z.object({
    readinessUrl: z.string(),
    readinessTimeoutMs: z.number(),
    pollIntervalMs: z.number(),
  }).optional(),
  candidateBlobs: z.record(z.string(), z.string().regex(/^[0-9a-f]{40}$/)).optional(),
});

export type PatchManifest = z.infer<typeof patchManifestSchema>;
```

Field names above are bound; the implementer may add clearly-additive,
optional fields only if a genuine gap is found during implementation —
report any such addition explicitly rather than silently extending the
schema.

## 4. Scope validator (Part C, bind)

New file `scripts/harness/scopeValidator.ts`. Exported function:

```ts
export interface ScopeValidationResult {
  readonly ok: boolean;
  readonly violations: readonly string[]; // human-readable, one per failed check
  readonly checks: {
    readonly headMatchesExpected: boolean;
    readonly originMatchesHead: boolean;
    readonly baseCommitMatches: boolean;
    readonly changedPathsWithinAllowed: boolean;
    readonly stagedFilesEmpty: boolean;
    readonly untrackedFilesWithinAllowed: boolean;
    readonly prohibitedPathsAbsent: boolean;
    readonly diffCheckClean: boolean;
    readonly stashPolicySatisfied: boolean;
    readonly generatedArtifactsWithinAllowlist: boolean;
    readonly candidateBlobsMatch: boolean | 'not-checked';
    readonly commitMessageMatches: boolean | 'not-checked';
  };
}

export async function validateScope(
  manifest: PatchManifest,
  options: { expectedHead?: string; repoRoot: string },
): Promise<ScopeValidationResult>;
```

**Required checks (bind — every item from the governing prompt's
Phase A list):** `git rev-parse HEAD`/`git rev-parse origin/main`
against expectation; `manifest.baseCommit` match; every changed path
(`git diff --name-only`, plus HEAD-vs-base if applicable) is a member
of `manifest.allowedFiles`; `git diff --cached --name-only` is empty;
every untracked path (`git ls-files --others --exclude-standard`) is
either absent or a member of `manifest.allowedUntrackedFiles`; no path
in `manifest.prohibitedFiles` appears in any of the above three sets;
`git diff --check` is clean; the stash list matches
`manifest.stashPolicy` (`must-be-empty` → `git stash list` empty;
`must-be-unchanged` → the stash ref present at authorization time is
still present, untouched); every file inside
`manifest.generatedArtifactPaths` (if present on disk) is confined to
those exact paths, nothing else; if `manifest.candidateBlobs` is
supplied, `git hash-object <path>` matches for every listed path; if a
commit already exists to check, its message matches
`manifest.exactCommitMessage` verbatim. **Any single failed check adds
a human-readable violation string and the CLI exits nonzero** — never
a silent partial pass.

New CLI entry `scripts/harness/validateScope.ts`
(`tsx scripts/harness/validateScope.ts <manifest-path> [--expected-head <sha>]`)
— loads and Zod-validates the manifest, runs `validateScope`, prints
the `ScopeValidationResult` as JSON to stdout, and exits `0` only if
`result.ok === true`.

## 5. Structured results (Part D, bind)

Every capability above returns a plain, JSON-serializable object (no
class instances, no functions, no circular references) — the
interfaces in §2/§4 above ARE the structured-result schema; no
separate "results" module is needed beyond the shared
`scripts/harness/types.ts` re-exporting these types for convenience.
CLI entry points (`serverCli.ts`, `validateScope.ts`) print exactly one
JSON object per invocation to stdout (never partial/streamed JSON
fragments) and use the process exit code as the sole pass/fail signal
consumers should trust.

## 6. Security and safety fences (bind, in addition to all standing repo rules)

- **No secrets printed, ever.** The server-lifecycle helper's captured
  stdout/stderr log files must never be echoed to the console by
  default; if a CLI flag to dump them is added, it must warn once and
  still never print `.env.local` contents specifically — grep captured
  logs for common secret-shaped patterns before any dump is out of
  scope for this patch (do not over-build); simplest safe rule: never
  print full log file contents automatically, only file paths and byte
  counts.
- **`.env.local` is never read, parsed, or exposed** by any file in
  this patch. The server helper passes through `process.env` as-is to
  the spawned child (so the app's own `next dev` reads it normally) but
  never inspects its contents itself.
- **No broad process termination.** Never `taskkill /IM node.exe /F`,
  never `pkill node`, never any termination call that is not scoped to
  the exact PID(s) this invocation itself spawned and recorded in an
  `OwnedServerHandle`.
- **No deletion outside `manifest.generatedArtifactPaths`.** The scope
  validator may report artifacts outside the allowlist; it must never
  delete anything itself in PATCH-105 — cleanup remains a human/CTO-
  authorized action (matching the pattern already bound in PATCH-102
  §24/§25's scoped `Remove-Item` commands), this patch only VALIDATES,
  it does not clean.
- **No automatic commit or push.** Nothing in this patch calls `git
  commit`/`git push`/`git add` itself.
- **No automatic stash creation or deletion.** The scope validator only
  READS `git stash list`; nothing in this patch calls `git stash
  push`/`drop`/`apply`/`pop`.
- **No product-code imports.** `scripts/harness/**` must not import
  from `components/**`, `app/**`, or `lib/domain/**`'s command modules
  — it may import shared, framework-agnostic utilities only if they
  already exist with zero React/Next dependencies (none currently
  needed; keep it self-contained).
- **No weakening of any existing test, lint rule, or type.**
- **No Bash-only assumptions.** Every capability must have a
  documented, working Windows PowerShell/cmd path — this repo's actual
  environment (SKILL.md: "Windows host").
- **All waits bounded**, per §2.
- **Every spawned child process is attributable** to a specific
  `OwnedServerHandle` — no anonymous/untracked spawns.
- **Nonzero exit on any uncertainty** — if a check cannot be
  determined confidently (e.g. `git` itself fails to run), treat it as
  a failure, never a silent pass.

## 7. PATCH-105 manifest pilot (bind — this patch is its own first user)

New file `.fable5/patches/PATCH-105.manifest.json`, validated against
`scripts/harness/manifestSchema.ts`'s schema, with:
- `patchId: "PATCH-105"`
- `baseCommit`: the exact 40-char HEAD hash at the moment this
  patch's governance-authorization commit lands (recorded in §9's
  closure once known — the implementer must fill this from the actual
  `git rev-parse HEAD` at the start of implementation, not guess it)
- `allowedFiles`: exactly the twelve files listed in §9's file scope
  table below
- `prohibitedFiles`: at minimum
  `["app/dashboard/canvas/[id]/CanvasClient.tsx", "lib/domain/canvas/*", "components/**"]`
  (this patch must never touch product UI/domain code)
- `allowedUntrackedFiles`: `[]` (every new file in this patch is
  tracked/added, not left untracked)
- `generatedArtifactPaths`: `["test-results", "playwright-report", ".next/trace"]`
- `stashPolicy`: `"must-be-empty"` (matches the confirmed-empty stash
  at authorization time)
- `requiredCommands`: the exact commands from §8's validation matrix
- `exactCommitMessage`: the bound message at the top of this document
- No `serverConfig`/`candidateBlobs` needed for this manifest's own
  pilot use (those fields exist for FUTURE patches that choose to use
  a manifest; PATCH-105 does not need to exercise every optional
  field on itself).

**Do not migrate PATCH-001 through PATCH-104 to manifest form in this
patch.** This is a pilot on ONE new patch (itself), not a backfill.

## 7a. Manifest baseline lifecycle (bind — root-caused after the §9a
amendment produced a stale-manifest self-validation failure)

**Root cause of the observed failure.** After §9a's governance
amendment commit (`82e43ee`) landed, `git rev-parse HEAD` legitimately
advanced past the manifest's recorded `baseCommit`
(`c1e1bdc2e1a258db04a75679fdb2351b59d8ef33`) — but that advance was a
**governance-only documentation commit**, not the PATCH-105 candidate
being committed. `scopeValidator.ts` uses exactly one signal to decide
whether a candidate commit has happened: `headValue ===
manifest.baseCommit`. While true, it correctly defers
`exactCommitMessage` checking (`'not-checked'`) because no commit
distinct from the base exists yet to check a message against. The
manifest was simply never resynced to the new governance HEAD after
`82e43ee` landed, so the validator — correctly, not incorrectly —
reported `headMatchesExpected: false`, `baseCommitMatches: false`,
and (as a direct consequence of the stale-baseline branch) attempted
and failed `commitMessageMatches` against the current HEAD's actual
(governance) commit message. **This is not a validator defect.** The
phase-aware `headValue === baseCommit ? 'not-checked' : ...` gate is
correct and must not be changed, weakened, or removed. What was
missing was a bound lifecycle rule for keeping `baseCommit` in sync
with governance HEAD across amendments. That rule is bound here.

**Manifest field semantics (bind, clarifies §7):**
- `baseCommit` = the current **authoritative governance HEAD** this
  candidate's diff is measured against. It is NOT a fixed
  "authorization-time" constant — it MUST be advanced every time a
  governance-only commit lands on `main` while this candidate remains
  active and uncommitted, because such commits never touch any of the
  14 candidate paths and therefore never invalidate the candidate's
  diff — they only move `HEAD` out from under a stale baseline.
- The validator's separate `--expected-head` CLI option (`options.expectedHead`)
  is an optional override for one-off invocations (e.g., asserting a
  specific hash mid-investigation) and defaults to `manifest.baseCommit`
  when omitted. It does not need to be passed in normal usage — keeping
  `baseCommit` current makes the default correct.
- `exactCommitMessage` is checked **only once `HEAD` has diverged from
  `baseCommit`** — i.e., only once an actual commit (the candidate's
  own) has landed on top of the base. Before that point the check is
  `'not-checked'` by design; this is correct pre-commit behavior, not
  a gap.

**Manifest lifecycle rules (bind):**
1. **Initial authorization:** `baseCommit` = governance HEAD at the
   moment the authorizing patch commit lands (as originally bound in
   §7).
2. **Implementation start:** the implementer reads `baseCommit` from
   the manifest as-is; it must equal `git rev-parse HEAD` at that
   moment (self-validation will fail loudly if not — this is the
   "wrong base" catch).
3. **Governance amendment while a candidate is active:** the CTO's
   amendment commit touches only `.fable5/docs/CURRENT_TASK.md` and
   `.fable5/patches/PATCH-*.md` — never the manifest (the manifest is
   a candidate-scope file). Immediately after such a commit, the CTO
   must state the new governance HEAD in the continuation prompt and
   direct the implementer to update **only** the manifest's
   `baseCommit` field (and re-run self-validation) before proceeding
   — this is a manifest-content edit within the implementer's existing
   candidate scope, not a new file, not a scope expansion.
4. **Pre-review self-validation:** must show `headMatchesExpected: true`,
   `baseCommitMatches: true`, `commitMessageMatches: 'not-checked'`
   (candidate still uncommitted) and every other check `true`.
5. **Pre-commit validation:** identical to (4) — the candidate must
   still be uncommitted and passing against the current `baseCommit`
   immediately before the CTO issues commit authorization.
6. **Post-commit validation:** once the candidate itself is committed,
   `HEAD` will diverge from the (unchanged) `baseCommit` specifically
   because of the candidate's own new commit — at that point
   `commitMessageMatches` correctly activates and must show `true`
   against `exactCommitMessage`.

This design continues to catch: implementation started on the wrong
base (rule 2), a stale manifest after unrelated governance movement
(rule 3, this incident), unexpected HEAD movement of any other kind
(`headMatchesExpected`/`baseCommitMatches` still fail loudly), a wrong
commit message after the candidate actually commits (rule 6), and
unauthorized scope changes (`changedPathsWithinAllowed` /
`untrackedFilesWithinAllowed` / `prohibitedPathsAbsent`, all
unaffected by this amendment).

**Exact correction authorized for this incident (bind):** the
implementer updates **only** the `baseCommit` field inside
`.fable5/patches/PATCH-105.manifest.json` from
`c1e1bdc2e1a258db04a75679fdb2351b59d8ef33` to
`82e43eed12f92f96a5bf3d8e33376117420013e6` (the current governance
HEAD as of this amendment). No other field, file, or line changes. No
`scripts/harness/*.ts` source changes. No schema change to
`manifestSchema.ts`. No logic change to `scopeValidator.ts`.

**Revised self-validation command:**
`npm run harness:validate-scope -- .fable5/patches/PATCH-105.manifest.json`
— expected result: `ok: true`, every check `true` except
`candidateBlobsMatch` (`'not-checked'`, no `candidateBlobs` field
bound for this pilot per §7) and `commitMessageMatches`
(`'not-checked'`, candidate still uncommitted).

## 8. Required tests (bind — unit-first, mocked boundaries; one small integration fixture)

All co-located under `scripts/harness/`, using the existing `vitest`
toolchain (no new test runner):

- `scripts/harness/serverLifecycle.test.ts` — mocked
  `child_process.spawn`, mocked `fetch`/`http`, mocked
  `net`/port-check: healthy-server startup; readiness timeout (mock a
  never-200 endpoint, assert bounded return); malformed readiness URL
  (rejected before any spawn/network call); healthy existing owned
  server reuse (`already-healthy-unowned` path); unowned port conflict
  (`port-conflict-unhealthy` path); duplicate-server refusal; owned-
  process shutdown (mock kill call, assert scoped to the exact PID);
  shutdown timeout (mock a process that never reports exit, assert
  bounded `stop-timeout` result, never hangs the test).
- `scripts/harness/manifestSchema.test.ts` — valid manifest parses;
  each required field's absence/malformation is rejected with a clear
  Zod error; structured-result shape assertions for the exported
  types (compile-time via `tsc`, plus a runtime shape check).
- `scripts/harness/scopeValidator.test.ts` — mocked `git`/`fs` calls
  (inject a command-runner function rather than shelling out directly,
  so tests never touch the real repository): base-commit match and
  mismatch; allowed-file success; unauthorized modified-file failure;
  unauthorized untracked-file failure; prohibited-file failure
  (present in any of changed/staged/untracked); staged-file detection;
  stash-policy failure (both `must-be-empty` and `must-be-unchanged`
  violated); `git diff --check` failure; generated-artifact-allowlist
  violation; candidate-blob mismatch when supplied; commit-message
  mismatch when supplied.
- **One controlled integration fixture** (Phase 6's explicit
  requirement — do not use the real Next.js app):
  `scripts/harness/fixtures/tinyServer.mjs`, a minimal standalone
  `node:http` server (no framework, no dependencies) that listens on a
  test-chosen ephemeral port and responds `200` immediately, or after
  a configurable delay (for exercising the readiness-timeout path
  against a REAL process, not just a mock). Driven by
  `scripts/harness/serverLifecycle.integration.ts` — a plain Node
  script (not a vitest test file, to keep it fully separate from the
  fast, mocked `vitest run` gate — see §9's `test:harness:integration`
  npm script), asserting with `node:assert` and exiting nonzero on
  failure: real spawn → real readiness poll succeeds → real stop →
  real post-stop port-free verification, end to end against the tiny
  fixture, never against `next dev`.

## 9. Exact file scope (bind)

**New files (12):**
1. `scripts/harness/types.ts`
2. `scripts/harness/serverLifecycle.ts`
3. `scripts/harness/serverLifecycle.test.ts`
4. `scripts/harness/manifestSchema.ts`
5. `scripts/harness/manifestSchema.test.ts`
6. `scripts/harness/scopeValidator.ts`
7. `scripts/harness/scopeValidator.test.ts`
8. `scripts/harness/serverCli.ts` (CLI: `start`/`stop`/`status` subcommands)
9. `scripts/harness/validateScope.ts` (CLI: manifest path → structured result → exit code)
10. `scripts/harness/fixtures/tinyServer.mjs`
11. `scripts/harness/serverLifecycle.integration.ts`
12. `.fable5/patches/PATCH-105.manifest.json`

**Modified files (2):**
- `vitest.config.ts` — add exactly one entry,
  `'scripts/harness/**/*.test.ts'`, to the existing `test.include`
  array. No other line changes.
- `package.json` — add exactly five new npm scripts (no existing
  script line is altered): `"harness:server:start"`,
  `"harness:server:stop"`, `"harness:server:status"`,
  `"harness:validate-scope"`, `"test:harness:integration"`, each
  invoking the corresponding file above via **`vite-node`** (see §9a
  amendment below — supersedes the original `tsx` binding). No
  dependency version bump, no new `dependencies`/`devDependencies`
  entry.

**Prohibited paths (must NOT change):** `app/**`, `components/**`,
`lib/domain/**`, `lib/infra/**`, any existing `e2e/**` spec,
`playwright.config.ts`, `eslint.boundaries.config.mjs`, any prior
`.fable5/patches/PATCH-0*.md` document.

**Expected file count:** 12 new, 2 modified, 0 deleted.

**Dependency choices:** zero new dependencies. `zod` (already present)
for manifest validation; native `node:child_process`, `node:http`,
`node:net`/`fetch`, `node:fs` for the lifecycle helper; **`vite-node`**
(already installed locally as part of the existing `vitest`
dependency tree — see §9a) for running the two CLI entry points and
the integration script.

### 9a. Runner-strategy amendment (bind — supersedes `tsx` in §9 above)

**Root cause.** The original §9 binding assumed `tsx` was usable the
same way `scripts/test-ai-prompts.ts` uses it (`npx tsx ...`). Live
inspection of the PATCH-105 candidate found: `tsx` is not a direct
`devDependency` in `package.json`; it exists only as a transitive,
locked entry in `package-lock.json` (`^4.8.1`, pulled in by another
package's subtree) and is **not** present in `node_modules/.bin`. The
five new `package.json` script lines in the candidate invoke bare
`tsx` (not `npx tsx`), which fails immediately — `tsx` does not
resolve on `PATH` or via local `node_modules/.bin`. Using `npx tsx`
instead would not fix this deterministically: `npx` would attempt to
resolve `tsx` as a top-level install and, finding none locally in a
directly-installed form, would fall through to a registry-mediated
install — non-deterministic, network-dependent, and exactly the kind
of implicit dependency addition PATCH-105 forbids.

**Options considered:**

| Option | Files changed | New dependency | Lockfile change | Windows | Reliability | Verdict |
|---|---|---|---|---|---|---|
| A. Add `tsx` as explicit devDependency | package.json + lockfile | Yes | Yes | fine | fine | rejected — PATCH-105 forbids new dependencies; unnecessary given B |
| B. Use `vite-node` (already in `node_modules/.bin`, ships with the installed `vitest@3.2.7`) | package.json only | **No** | **No** | confirmed | confirmed — same engine as the harness's own passing Vitest suite | **selected** |
| C. Node native type-stripping (`node file.ts`) | package.json only | No | No | untested here; Node v24.11.1 supports it unflagged but requires explicit `.ts` extensions on relative imports, which the candidate's source does not use | unproven, adds a new unverified execution mode | rejected — real risk, no proven advantage over B |
| D. Precompile harness CLIs via `tsc` before invocation | + build step, +2 script wrapper lines | No | No | fine | adds a build/dist step this repo has no precedent for | rejected — more moving parts than B for no gain |
| E. Convert CLI entry points/integration fixture to `.mjs` | renames 3 of the 12 governed files | No | No | fine | loses static typing on entry points | rejected — needlessly changes the bound file list; B avoids this entirely |

**Verification performed (read-only, no candidate files modified):**
`node_modules/.bin/vite-node scripts/harness/validateScope.ts
.fable5/patches/PATCH-105.manifest.json` was run directly against the
live candidate. It executed cleanly — correct TS transform, correct
relative-import resolution, correct `zod` schema parse, correct `git`
shell-out — and returned
`{"ok":true,"violations":[],"checks":{...all true...}}`, i.e. the
scope validator, run through `vite-node`, confirms the current
14-path candidate against its own manifest. This is direct proof `vite-node`
is a drop-in, zero-dependency, zero-lockfile-change replacement for
the non-functional `tsx` binding.

**Selected strategy (bind):** replace `tsx` with `vite-node` in all
five new `package.json` script lines. No other file in the 14-path
candidate needs to change — the `.ts` source files themselves are
already written in engine-agnostic, erasable-only TypeScript (no
enums, no namespaces, no decorators, no parameter properties;
confirmed by direct grep) and need no edits. `vitest.config.ts`
needs no change beyond what §9 already bound. No lockfile change is
authorized or required. No new dependency is authorized or required.

**Exact script lines (bind, replaces the corresponding lines in the
candidate's current `package.json` diff):**
```
"harness:server:start": "vite-node scripts/harness/serverCli.ts start"
"harness:server:stop": "vite-node scripts/harness/serverCli.ts stop"
"harness:server:status": "vite-node scripts/harness/serverCli.ts status"
"harness:validate-scope": "vite-node scripts/harness/validateScope.ts"
"test:harness:integration": "vite-node scripts/harness/serverLifecycle.integration.ts"
```

**Exact validation commands for this amendment:**
1. `node_modules/.bin/vite-node scripts/harness/validateScope.ts .fable5/patches/PATCH-105.manifest.json` → `ok:true`, all checks true (already confirmed above; re-run after the `package.json` edit to confirm no regression).
2. `npm run harness:validate-scope -- .fable5/patches/PATCH-105.manifest.json` → same result, now via the npm script.
3. `npm run harness:server:status` → structured JSON, does not touch or alter PID 24732 (read-only port probe against the default `http://127.0.0.1:3000`).
4. All ten §10 gates, unchanged in substance, now passing with `vite-node` in place of `tsx`.

**Candidate disposition:** the current 14-path candidate **remains
valid** and is preserved as-is except for the one-line-per-script edit
to `package.json` described above. No file is renamed, added, or
removed. No `.ts` source file needs modification.

## 10. Validation matrix (bind)

1. `npx vitest run scripts/harness` (or the extended default
   `npm run test:unit`, since `vitest.config.ts` now includes this
   path) — all new unit tests green, mocked boundaries only.
2. `npm run test:harness:integration` (now running via `vite-node` per
   §9a) — the one real-process lifecycle test against
   `tinyServer.mjs`, using a dynamically-allocated ephemeral port (not
   port 3000 — confirmed already correct in the candidate), green, and
   confirmed to leave zero residual process/port state afterward, and
   confirmed not to touch the unrelated process already holding port
   3000 (PID 24732 at time of this amendment — irrelevant to the
   ephemeral-port integration test, must remain untouched throughout).
3. `npm run harness:validate-scope -- .fable5/patches/PATCH-105.manifest.json`
   (now running via `vite-node` per §9a) run against the live
   PATCH-105 candidate itself before commit — must report `ok: true`
   with every check passing (this is the manifest pilot proving itself
   against its own rules; already spot-verified during this
   amendment's investigation).
4. `npx tsc --noEmit` — clean (this includes `scripts/harness/**`,
   already covered by the root `tsconfig.json`'s scope — confirm no
   `scripts/**` exclusion exists; if one is found, report it rather
   than silently changing `tsconfig.json`).
5. `npm run check:boundaries` — clean (no new `components/**`/`app/**`
   files are touched, so this should be a no-op confirmation, not a
   new violation).
6. Full `npx vitest run` — must remain 458+ tests / 44+ files, growing
   only by the new harness test files, never shrinking or newly
   failing elsewhere (report the exact new total).
7. `npm run verify` — full green.
8. `npm run build` — clean (confirm the dev server is NOT running
   first, per SKILL.md's standing hazard).
9. Windows process/port checks: after every test run, confirm via
   `Get-NetTCPConnection` (locale-safe, per SKILL.md) that no port
   remains bound by a harness-spawned process, and confirm no orphaned
   `node.exe`/`tsx` process remains from the integration test.
10. Fresh independent review (DeepSeek V4 Pro primary, Kepler/Gemini
    3.1 Pro fallback — NOT Sonnet) required before commit.

**The implementer must leave the candidate uncommitted** after all
gates pass, per the governing instruction — report results and await
explicit commit authorization; do not commit or push PATCH-105
yourself even after a clean independent review, unless a future
governance turn explicitly authorizes the commit.

## 11. Hard-stop conditions (bind)

STOP, report, do not commit, if: any file outside §9's exact list is
touched; any new runtime dependency is added; any existing test, lint
rule, config exclusion, or type is weakened; the server-lifecycle
helper ever terminates a process it did not itself spawn; any wait
lacks a bounded timeout; any secret or `.env.local` content is
printed, logged, or committed; the scope validator or its CLI ever
deletes a file; a stash is created or dropped by any file in this
patch; a commit or push is issued automatically; the manifest pilot
(§7) fails its own validation; Explorer agents, retrieval memory,
remote sandboxes, automated model handoffs, or a new CanvasClient
extraction are introduced under this patch's scope; any required gate
in §10 fails or is skipped; the manifest's `baseCommit` is edited to
any value other than the exact governance HEAD stated by the CTO in a
continuation prompt (§7a); any field in the manifest other than
`baseCommit` is changed as part of a baseline resync; the
`scopeValidator.ts` phase-aware `commitMessageMatches` gate is
weakened, bypassed, or removed to make a stale-baseline failure pass.

## 12. Health ledger (bind)

Unchanged from PATCH-104's ruling (option B, retired) — this patch
does not attempt a fresh numeric score either; that remains its own
separate, not-yet-scheduled governance follow-up.

## 13. Closure (bind — CTO post-landing verification)

**Landed commit:** `ab7de32e1d941b11ddfb5897de6a92fbfde5d904`, exact
bound message
`chore(harness): add bounded server lifecycle, patch manifests, and scope validation (PATCH-105)`.
Verified directly: branch `main`, HEAD == origin/main == the landed
commit, clean working tree, zero staged files, zero untracked files,
empty stash, `package-lock.json` unchanged, `git diff HEAD^ HEAD
--check` clean, and `git show --name-only --format="" HEAD` returns
exactly the 14 governed paths from §9 (as amended by §9a's
`tsx`→`vite-node` script fix) — no more, no fewer.

**Independent review:** PASS, confirming the exact 14 candidate paths
and blobs, the server-lifecycle design, manifest schema, scope
validator, package/vitest changes, test quality, harness tests (3
files / 13 tests), the integration test, scope validation, TypeScript,
boundaries, full Vitest (**47 files / 471 tests** — up from the
pre-patch 44/458 baseline, consistent with exactly 3 new harness test
files and the existing suite otherwise untouched), `verify`, `build`,
and clean cleanup/process state. Reviewer: independent (not Sonnet),
per this patch's standing reviewer binding.

**Runner amendment (§9a):** `tsx` was found to be a transitive/locked
dependency only, absent from `node_modules/.bin`; all five new
`package.json` harness scripts were bound to use `vite-node` instead
(already installed as part of the `vitest@3.2.7` tree) — zero new
dependencies, zero lockfile change. Confirmed still in effect in the
landed commit.

**Manifest baseline amendments (§7a):** the manifest's `baseCommit`
was resynced twice during the active-candidate window as unrelated
governance-only commits advanced `main` (`c1e1bdc`→`82e43ee`→`25ba2cb`),
per the bound manifest-lifecycle rules. The final pre-commit value,
`25ba2cba6a8c96375b79b8ee36ac557b7c33f6d0`, is exactly
`HEAD^` of the landed commit — confirmed directly above.

**Post-commit manifest lifecycle ruling (ties to §7a rule 6):**
running `npm run harness:validate-scope -- .fable5/patches/PATCH-105.manifest.json`
against the landed state correctly reports `ok:false` with exactly
two violations — `headMatchesExpected` and `baseCommitMatches` — and
correctly reports `commitMessageMatches: true`. This is the **exact,
expected, non-broken shape** for a manifest whose `baseCommit` is (by
design) the commit the candidate was built on top of, once that
candidate has actually landed one commit past it. It is **not** a
regression and required no manifest edit at closure. However, this
closure turn identifies a genuine, narrow gap the current single-mode
validator does not cover: there is no dedicated way to ask "does
commit `X` conform to this manifest" using git-history commands
(`git show`/`git diff <base> <landed>`) rather than working-tree
state — today that confirmation was done by hand (this section, and
Phase 1 above). This gap, plus the pre-existing dead
`expectedTestTotals` schema field (declared, never read or compared
by `scopeValidator.ts`), are carried forward as the seed of PATCH-106
(see CURRENT_TASK.md for the fresh harness census and PATCH-106's
exact scope). No change to `scopeValidator.ts`'s pre-commit semantics
is authorized or needed as part of this closure.

**Remaining implementation blocker:** none. PATCH-105 is fully landed,
reviewed, and functionally verified.

**Do not authorize PATCH-106 implementation from this section alone
— see the separate PATCH-106.md authorization for its own exact
scope, model assignment, and hard-stops.**
