# PATCH-107 — Isolated Git-Worktree Execution Foundation

**Purpose:** provide a narrow, harness-owned lifecycle for disposable,
local Git worktrees — create one from an exact base commit with a
uniquely-named branch (or detached state), allocate distinct ports for
it, track ownership in a metadata registry, and remove it safely — so
that a future implementation/review turn can run inside an isolated
copy of the repo instead of the single shared working tree every prior
patch in this session has used. This patch builds the primitive only;
it does NOT wire any implementer/reviewer role, orchestration, or
automated handoff into it.

**This is NOT:** a Test Runner/evidence-bundle system, a Codebase
Explorer, retrieval-based governance memory, an automated handoff
orchestrator, or a remote/cloud sandbox. It does not run
implementation or review inside the worktree automatically — it only
builds the create/list/remove/prune primitive. Each of the deferred
items remains its own separate, not-yet-authorized future patch, per
the user's stated priority order (Test Runner next, then Explorer,
then retrieval, then orchestration).

**Status:** AUTHORIZED, NOT STARTED.

**Implementer:** **Codex 5.6 Sol** (not Terra) — this patch's Windows
Git-worktree/branch/path/port architecture (collision detection via
git plumbing, path canonicalization and traversal rejection, ownership
-proven branch deletion, port allocation, stale-metadata pruning
without a blanket `git worktree prune`) is materially more complex
than PATCH-105/106's server-lifecycle and validator work, which Terra
handled. **Reviewer:** independent read-only reviewer (DeepSeek V4 Pro
primary, Kepler or Gemini 3.1 Pro fallback) — PASS required before
commit. Sonnet (CTO/governance owner) authored/authorized this patch
and must NOT perform its review. **Authored:** Sonnet (CTO), 2026-07-24.

**Base commit (bind — implementation must start here):** state your
current `git rev-parse HEAD`/`origin/main` before starting and confirm
it against the value given in the CTO's continuation prompt for this
turn — **not** whatever static value appears in this file by the time
you read it. Per PATCH-105 §7a and PATCH-106 §0a's now-twice
-demonstrated pattern, a governance-authoring commit for this very
patch necessarily advances `main` by one commit *after* this text was
written, making any hash typed directly into this document one commit
stale the moment it's pushed. The continuation prompt is authoritative
for the base commit and the manifest's `baseCommit`; this document is
not, for that one field only.

**Bound implementation commit message (verbatim):**
`feat(harness): add isolated git-worktree lifecycle foundation (PATCH-107)`

---

## 1. Root cause / motivation (bind)

Every patch in this session (PATCH-102 through PATCH-106) ran in the
single shared repository working tree — the CTO and the implementer
alternately occupy the same `main` checkout, coordinating entirely by
convention (governance-only vs. candidate-only commits, manifests,
scope validation) rather than by physical isolation. This census
(§ in `CURRENT_TASK.md`, this turn) confirms: candidates and reviewers
still share one working tree; a concurrent implementation and review
are not safe (both would observe/mutate the same files); temporary
build/test artifacts and dev-server ports can collide if two turns
ever overlapped; and branch/stash state is a single shared resource
any agent could disturb. A disposable, harness-owned worktree — used
by a *future* patch to actually run implementation/review inside — is
the direct prerequisite for any of that isolation. This patch builds
only the worktree primitive: create/list/remove/prune. It does not yet
decide who runs inside one.

## 2. Worktree lifecycle interface (bind)

New file `scripts/harness/worktreeLifecycle.ts`:

```ts
export interface WorktreeConfig {
  readonly baseCommit: string; // 40-char hex; must resolve via `git cat-file -e`
  readonly worktreeId: string; // ^[a-z0-9][a-z0-9-]{0,63}$ — see §4 path/branch rules
  readonly parentDir: string; // repo-relative; must canonicalize inside the configured safe root (§4)
  readonly branchName?: string; // omit for a detached worktree; see §4 branch rules if provided
  readonly envFilesToCopy?: readonly string[]; // explicit allowlist only — never copied unless named here (§6)
  readonly portCount?: number; // number of distinct free ports to allocate; default 0
}

export interface OwnedWorktreeHandle {
  readonly worktreeId: string;
  readonly path: string; // absolute, canonicalized
  readonly branchName: string | null; // null when detached
  readonly baseCommit: string;
  readonly createdAt: string; // ISO 8601
  readonly ownedByHarness: true;
  readonly allocatedPorts: readonly number[];
  readonly metadataPath: string; // absolute path to this worktree's JSON registry entry
}

export type WorktreeCreateResult =
  | { readonly ok: true; readonly reason: 'created'; readonly handle: OwnedWorktreeHandle }
  | { readonly ok: false; readonly reason: 'invalid-worktree-id'; readonly message: string }
  | { readonly ok: false; readonly reason: 'invalid-base-commit'; readonly message: string }
  | { readonly ok: false; readonly reason: 'path-outside-safe-root'; readonly message: string }
  | { readonly ok: false; readonly reason: 'path-collision'; readonly path: string }
  | { readonly ok: false; readonly reason: 'branch-collision'; readonly branchName: string }
  | { readonly ok: false; readonly reason: 'port-allocation-failed'; readonly message: string }
  | { readonly ok: false; readonly reason: 'git-worktree-add-failed'; readonly message: string };

export type WorktreeRemoveResult =
  | { readonly ok: true; readonly reason: 'removed' }
  | { readonly ok: false; readonly reason: 'not-owned-refused' }
  | { readonly ok: false; readonly reason: 'is-main-worktree-refused' }
  | { readonly ok: false; readonly reason: 'dirty-refused' }
  | { readonly ok: false; readonly reason: 'not-found' }
  | { readonly ok: false; readonly reason: 'git-worktree-remove-failed'; readonly message: string };

export interface WorktreeLifecycleOptions {
  readonly repoRoot: string;
  readonly metadataRoot: string; // default `<repoRoot>/.fable5/worktrees` — the harness's own registry directory
}

export async function createWorktree(config: WorktreeConfig, options: WorktreeLifecycleOptions): Promise<WorktreeCreateResult>;
export async function removeWorktree(handle: OwnedWorktreeHandle, options: WorktreeLifecycleOptions & { readonly force?: boolean }): Promise<WorktreeRemoveResult>;
export async function listOwnedWorktrees(options: WorktreeLifecycleOptions): Promise<readonly OwnedWorktreeHandle[]>;
export async function pruneStaleWorktreeMetadata(options: WorktreeLifecycleOptions): Promise<{ readonly prunedCount: number; readonly prunedIds: readonly string[] }>;
export async function isWorktreeDirty(handle: OwnedWorktreeHandle, options: WorktreeLifecycleOptions): Promise<boolean>;
```

Add to `scripts/harness/types.ts` (additive only — re-export or mirror
the above result/handle shapes there if the existing types module is
the single source of truth for CLI-facing shapes, matching PATCH-105/106's
convention).

## 3. Ownership metadata format (bind)

One JSON file per worktree at
`<metadataRoot>/<worktreeId>.meta.json`:
```json
{
  "worktreeId": "string",
  "path": "absolute canonicalized path",
  "branchName": "string or null",
  "baseCommit": "40-char hex",
  "createdAt": "ISO 8601",
  "ownedByHarness": true,
  "allocatedPorts": [1234, 1235]
}
```
This file is the **sole source of truth for ownership.** `removeWorktree`,
`listOwnedWorktrees`, and `pruneStaleWorktreeMetadata` must all refuse
to act on any path/branch not present in this registry, even if it
looks harness-created (e.g. matches the naming convention) — no
heuristic-only ownership inference. `metadataRoot` itself must be
listed in `.gitignore` (a one-line addition is in-scope, see §9) so
these files are never accidentally committed.

## 4. Path and branch rules (bind)

- **Safe root:** worktrees may only be created under
  `<repoRoot>/.fable5/worktrees/<worktreeId>` by default (or another
  `parentDir` explicitly passed, but it must canonicalize — via
  `path.resolve` + a real-path check when the parent already exists —
  to a location inside `repoRoot`; never an absolute path elsewhere on
  disk, never containing `..` segments before canonicalization).
- **`worktreeId` format:** `^[a-z0-9][a-z0-9-]{0,63}$` — reject
  anything else (`invalid-worktree-id`), including any value
  containing `/`, `\`, `..`, drive letters, or null bytes.
- **Path collision:** if the target path already exists on disk (file
  or directory, empty or not), refuse with `path-collision` — never
  overwrite or merge into an existing directory.
- **Branch naming:** if `branchName` is supplied, it must match
  `^harness/worktree/[a-z0-9][a-z0-9-]{0,63}$` (the harness's own
  reserved namespace) — reject any other pattern before ever calling
  git. If the branch already exists (`git show-ref --verify --quiet
  refs/heads/<name>`), refuse with `branch-collision`; never force
  -overwrite or reuse an existing branch, even one that looks
  harness-named, unless it is also present in this worktree's own
  metadata entry (i.e., this exact `createWorktree` call is idempotent
  only via its own just-written metadata, never by branch-name
  guessing).
- **Base-commit verification:** `git cat-file -e <baseCommit>^{commit}`
  must succeed before any worktree/branch is created; reject with
  `invalid-base-commit` otherwise.
- **Main worktree is immutable to this helper:** before any create or
  remove operation, resolve `git rev-parse --show-toplevel` for both
  the main repo and (for remove) the target handle's path, and refuse
  (`is-main-worktree-refused`) if they are ever equal. This check runs
  even if some other bug in path logic would otherwise have permitted
  it — it is a hard, independent guard.

## 5. Port allocation rules (bind)

`portCount` (if > 0) ports are allocated by binding a
`node:net.createServer()` to port `0` (OS-assigned free ephemeral
port) per port, reading back the assigned port, then closing the
server immediately — the same technique already proven in PATCH-105's
`serverLifecycle.integration.ts`. Allocated ports are recorded in the
handle/metadata but **the worktree lifecycle helper itself never binds
or holds these ports** — it only reserves-and-releases them
momentarily to learn a free number; a future consumer (not this patch)
is responsible for actually using them promptly. No fixed port range,
no assumption of ports 3000/4000 specifically. `port-allocation-failed`
if the OS cannot hand back `portCount` distinct free ports within a
bounded number of attempts (bind the exact bound: 3 attempts per port,
then fail).

## 6. Environment-file policy (bind)

`envFilesToCopy` is an explicit allowlist, default `[]` (copies
nothing). Only exact repo-relative filenames may appear in it (no
globs, no directories) and each must be within `repoRoot` after
canonicalization. Copying uses `fs.copyFile` (byte-for-byte, no
parsing, no logging of contents) from the main worktree into the new
worktree at the same relative path. **`.env.local` is never copied
unless explicitly named in `envFilesToCopy` by the caller** — this
patch's own tests and manifest must never enable that by default. No
env-file content is ever printed to stdout/stderr/logs by any function
in this patch.

## 7. Cleanup semantics (bind)

- `removeWorktree` refuses (`dirty-refused`) if `isWorktreeDirty()`
  reports any uncommitted change (tracked or untracked) inside the
  worktree, **unless** the caller passes `force: true` — an explicit,
  governed override, never a default.
- `removeWorktree` refuses (`not-owned-refused`) if the handle's
  `metadataPath` does not exist or does not match the registry entry
  exactly (path/branch/baseCommit all cross-checked).
- On success: runs `git worktree remove [--force] <path>` (force only
  when the caller passed `force: true` and the dirty check was the
  only reason removal would otherwise be blocked), then deletes the
  branch **only if** it matches the `^harness/worktree/...` namespace
  **and** is the exact branch recorded in this worktree's own metadata
  entry, then deletes the metadata JSON file itself.
- `pruneStaleWorktreeMetadata` only removes a metadata entry when (a)
  it is present in the harness's own registry AND (b) `git worktree
  list --porcelain` no longer lists that worktree's path (i.e., it was
  already removed some other way, on disk or via bare `git worktree
  remove` run outside this tool) — it never calls a blanket `git
  worktree prune` and never touches any worktree not already in the
  registry.
- **The main worktree can never be a target of `removeWorktree` or
  `pruneStaleWorktreeMetadata`** (§4's immutability guard applies to
  both).

## 8. Security and safety fences (bind, in addition to all standing
repo rules and PATCH-105/106's fences, which remain in force)

Main worktree is immutable to this helper — no reset, rebase,
checkout, merge, commit, or push against it, ever, by any function in
this patch. No automatic merge of a worktree's work back into `main`.
No automatic commit or push from inside a created worktree (this
patch builds no such capability at all). No broad directory deletion —
every delete is scoped to one canonicalized, registry-confirmed path.
No deletion outside the harness-owned worktree roots. No secret
contents ever printed, logged, or committed. No copying of
`.env.local` or any file unless explicitly named in `envFilesToCopy`.
No branch deletion unless the branch is both harness-namespaced and
proven-owned via this worktree's own metadata entry. No worktree
removal with uncommitted changes by default (§7). No reuse of an
unowned directory, ever. All paths canonicalized and checked against
traversal before any filesystem or git operation. All operations
return structured, auditable JSON — one object per CLI invocation,
matching PATCH-105/106's convention exactly.

## 9. New CLI and scripts (bind)

New file `scripts/harness/worktreeCli.ts`:
```
vite-node scripts/harness/worktreeCli.ts create --base <sha> --id <worktreeId> [--branch <name>] [--ports <n>] [--env-file <path>]...
vite-node scripts/harness/worktreeCli.ts remove --id <worktreeId> [--force]
vite-node scripts/harness/worktreeCli.ts list
vite-node scripts/harness/worktreeCli.ts prune
```
New `package.json` scripts: `"harness:worktree:create"`,
`"harness:worktree:remove"`, `"harness:worktree:list"`,
`"harness:worktree:prune"` — all invoking the CLI via `vite-node`
(PATCH-105 §9a's runner convention; never `tsx`). One-line
`.gitignore` addition: `.fable5/worktrees/` (the metadata registry and
default worktree parent directory must never be committed).

## 10. Required tests (bind — unit-first, mocked git/fs via injected
runners, same pattern as `scopeValidator.test.ts`/`serverLifecycle.test.ts`)

New `scripts/harness/worktreeLifecycle.test.ts` covering at minimum:
1. create from an exact valid base commit → `ok:true`, correct handle
   shape, metadata file written.
2. invalid/non-existent base commit → `invalid-base-commit`.
3. path collision (target directory already exists) → `path-collision`.
4. branch collision (branch already exists, not in this call's own
   metadata) → `branch-collision`.
5. ownership metadata is written and exactly matches the returned
   handle.
6. unique port allocation for `portCount > 1` → distinct ports, none
   `0`, none colliding.
7. main-worktree protection — `createWorktree`/`removeWorktree` refuse
   the instant the target path equals the main worktree's toplevel.
8. dirty-worktree removal refusal — `removeWorktree` without `force`
   on a worktree with an uncommitted change → `dirty-refused`.
9. clean owned-worktree removal — succeeds, branch and metadata both
   removed.
10. unowned-directory refusal — `removeWorktree` against a
    handle/path not present in the metadata registry →
    `not-owned-refused`.
11. stale metadata handling — `pruneStaleWorktreeMetadata` removes
    only entries whose `git worktree list --porcelain` no longer shows
    the path, and leaves live entries untouched.
12. path traversal rejection — `worktreeId`/`parentDir` containing
    `..`, absolute paths, or drive letters → rejected before any git
    call.
13. Windows path normalization — mixed `/`/`\` input still
    canonicalizes to one consistent absolute form.
14. structured result shape — every result is JSON-serializable and
    matches its declared union member exactly.

**One controlled real Git integration test**, new file
`scripts/harness/worktreeLifecycle.integration.ts` (plain Node script
using `node:assert`, run via its own npm script, kept OUT of the
default `vitest run` sweep exactly like PATCH-105's
`serverLifecycle.integration.ts`):
- creates a **temporary fixture Git repository** (via
  `fs.mkdtemp(path.join(os.tmpdir(), ...))` + `git init` + one commit)
  — never the real application repository.
- proves: worktree creation succeeds against that fixture's commit;
  the created worktree is a real, isolated checkout (its file content
  differs from the fixture's main tree after an independent edit
  inside the worktree); the fixture's own main tree is unchanged after
  that edit; `removeWorktree` cleans up the worktree; no residual
  `git worktree list` or branch entry remains in the fixture repo
  afterward; the temporary fixture directory itself is removed at the
  end of the script (test-harness cleanup, not part of the lifecycle
  API under test).
New `package.json` script: `"test:harness:worktree:integration"`.

## 11. Exact file scope (bind)

**New files (5):**
1. `scripts/harness/worktreeLifecycle.ts`
2. `scripts/harness/worktreeLifecycle.test.ts`
3. `scripts/harness/worktreeCli.ts`
4. `scripts/harness/worktreeLifecycle.integration.ts`
5. `.fable5/patches/PATCH-107.manifest.json` (this patch pilots itself
   again, per PATCH-105/106 precedent — `baseCommit`: the exact value
   from the CTO's continuation prompt for this turn, per this
   document's own header note, not a value hardcoded here)

**Modified files (2):**
- `scripts/harness/types.ts` — additive only: the new
  `WorktreeConfig`/`OwnedWorktreeHandle`/`WorktreeCreateResult`/
  `WorktreeRemoveResult`/`WorktreeLifecycleOptions` types (or their
  mirrors, matching however PATCH-105/106 organized shared vs.
  module-local types).
- `package.json` — add exactly five new scripts (§9); no existing
  script line altered.
- `.gitignore` — add exactly one new line, `.fable5/worktrees/`.

(Three modified files total: `types.ts`, `package.json`, `.gitignore` —
adjust the count above if the repo's actual `.gitignore` structure
requires more than one line; report rather than silently expanding
scope if so.)

**Prohibited paths (must NOT change):** everything PATCH-105/106
prohibited, plus every existing file under `scripts/harness/` other
than `types.ts` (additive-only) — `serverLifecycle.ts`, `serverCli.ts`,
`manifestSchema.ts`, `scopeValidator.ts`, `validateScope.ts`,
`validateLandedCommit.ts`, `serverLifecycle.integration.ts`,
`fixtures/tinyServer.mjs`, and PATCH-105/106's own manifest files.

**Expected file count:** 5 new, up to 3 modified (2 if `.gitignore`
needs no change — report which), 0 deleted, 0 renamed.

**Dependency choices:** zero new dependencies. Native
`node:child_process`, `node:fs/promises`, `node:path`, `node:os`,
`node:net`, `node:crypto` only. Reuses `vite-node` (PATCH-105 §9a) and
`zod` (already present, for the manifest pilot).

## 12. Validation matrix (bind — split into two non-overlapping
lifecycle phases; corrected 2026-07-24, see §12c for the root cause)

### 12a. Phase 1 — uncommitted implementation validation (bind; gates
independent review and, later, commit authorization)

Every gate below must pass **while the candidate remains uncommitted.**
None of them may reference or depend on a PATCH-107 implementation
commit, because no such commit exists yet at this phase — there is
nothing for a "landed" check to validate.

1. `npx vitest run scripts/harness` — all existing 21 tests still
   green, plus the new tests from §10, growing only.
2. `npm run test:harness:worktree:integration` — the real fixture-repo
   integration test, green, and confirmed to leave zero residual
   worktree/branch/directory state in both the fixture and the real
   repo.
3. `npm run harness:validate-scope -- .fable5/patches/PATCH-107.manifest.json` —
   pre-commit mode, run against PATCH-107's own candidate while it
   remains uncommitted. Expects `ok:true`,
   `commitMessageMatches: 'not-checked'` (no commit exists yet).
4. `npx tsc --noEmit` — clean.
5. `npm run check:boundaries` — clean, no-op confirmation.
6. Full `npx vitest run` — must remain 479+ tests / 47+ files, growing
   only by the new test cases, never shrinking or newly failing.
7. `npm run verify` — full green.
8. `npm run build` — clean (confirm no dev server running first).
9. Windows process/port/worktree/branch/filesystem cleanup checks:
   confirm via `git worktree list`, `git branch --list
   'harness/worktree/*'`, and directory listing of
   `.fable5/worktrees/` that zero harness-owned worktrees, branches,
   or metadata files remain after the full test run.
10. Fresh independent review (DeepSeek V4 Pro primary, Kepler/Gemini
    3.1 Pro fallback — NOT Sonnet) required before commit.

**The implementer must leave the candidate uncommitted** after every
Phase 1 gate passes and independent review returns PASS — report
results and await explicit commit authorization from the CTO, exactly
as PATCH-105/106 required. No Phase 1 gate is satisfied by, or
requires, a PATCH-107 commit existing.

### 12b. Phase 2 — post-commit landed validation (bind; runs only
after explicit commit authorization has been given and the reviewed
candidate has actually been committed with the exact bound message)

This phase does not exist, and cannot be run, until Phase 1 is fully
green, independent review is PASS, and a separate, explicit CTO
governance action has authorized and recorded the commit. Once that
commit exists:

1. `npm run harness:validate-landed -- .fable5/patches/PATCH-107.manifest.json HEAD` —
   confirms the just-landed commit's parent matches the manifest's
   `baseCommit`, its changed files are exactly the bound scope, and
   its message matches `exactCommitMessage` — mirroring PATCH-106 §7
   item 2's own use of PATCH-105's landed commit as a real-history
   sanity target, now applied to PATCH-107's own landing.
2. **Failure of this check is a hard stop before closure** — if
   `ok:false` for any reason other than the already-understood,
   expected `commitMessageMatches: 'not-checked'`-while-uncommitted
   shape (which cannot apply here, since this phase only runs after a
   commit exists), the CTO must diagnose and resolve it — exactly as
   the CTO did for PATCH-106's own pre-existing manifest-baseline
   incidents — before recording PATCH-107 as DONE.
3. The companion `harness:validate-scope` run against the same
   manifest will correctly report `ok:false` at this point
   (`headMatchesExpected`/`baseCommitMatches` false,
   `commitMessageMatches: true`) — this is the same expected,
   non-broken post-commit shape ruled at PATCH-105's and PATCH-106's
   closures, not a new regression to chase.

### 12c. Root cause of the original contradiction (bind, for the
record)

The original §12 listed Phase 2's landed-validation command
(`harness:validate-landed ... <landed-sha>`) inside the same flat,
undifferentiated list as Phase 1's pre-review gates, immediately
followed by "leave the candidate uncommitted." Those two instructions
cannot both be satisfied by the same gate: a landed-commit check
requires a landed commit, and "leave uncommitted" guarantees one does
not yet exist at that point in the lifecycle. §12a/§12b above resolve
this by making explicit what was previously implicit: Phase 1 gates
the uncommitted candidate through independent review; Phase 2 gates
closure, strictly after a separate, explicit commit-authorization
action, and is never a prerequisite for that authorization itself.

## 13. Hard-stop conditions (bind)

STOP, report, do not commit, if: any file outside §11's exact list is
touched; any existing file under `scripts/harness/` other than
`types.ts` is modified; any new runtime dependency is added; the main
worktree is reset, rebased, checked out, merged into, committed to, or
pushed from by any function in this patch; any worktree or branch
outside the harness's own metadata registry is deleted, modified, or
pruned; `.env.local` or any file is copied into a worktree without
being explicitly named in that call's `envFilesToCopy`; any secret or
env-file content is printed, logged, or committed; a stash is created
or dropped by any file in this patch; a commit or push is issued
automatically (including from inside any created worktree); the
manifest pilot fails its own pre-commit validation; the real-fixture
integration test (§10) fails or leaves residual state; a blanket `git
worktree prune` is ever called; Explorer agents, retrieval memory,
remote sandboxes, a Test Runner/evidence-bundle system, automated
model handoffs, or a new CanvasClient extraction are introduced under
this patch's scope; any required Phase 1 gate in §12a fails or is
skipped before independent review or commit authorization; a
PATCH-107 commit is created or requested before every §12a gate has
passed and independent review has returned PASS; §12b's post-commit
landed validation is run, or its failure is treated as resolved,
before an explicit, separate CTO commit-authorization action has both
occurred and actually landed the reviewed commit.

## 14. Health ledger

Unchanged ruling (option B, retired) — not recalculated here.

**Do not authorize PATCH-108.**
