# PATCH-106 — Post-Commit Manifest Validation Mode

**Purpose:** add a second, additive validation mode to the PATCH-105
harness that checks an already-landed commit against a patch manifest
using git-history commands (`git show`, `git log`, `git diff <a> <b>`),
instead of the existing pre-commit mode's working-tree checks. Also
wires up the manifest's already-declared but currently unused
`expectedTestTotals` field by comparing it against a pre-produced
Vitest JSON report. This closes the exact gap identified in
PATCH-105.md §13's closure: today, confirming a landed commit
conforms to its manifest is done by hand (`git show --name-only`,
manual eyeballing); there is no command for it.

**This is NOT:** a rewrite of `validateScope`'s existing pre-commit
behavior (untouched, unit-tested, independently reviewed — do not
modify its existing exported function or its existing tests beyond
adding new ones). NOT a Git-worktree isolation foundation. NOT a Test
Runner/evidence-bundle system. NOT an Explorer agent. NOT retrieval
memory. NOT an automated handoff orchestrator. NOT a fix to any
CanvasClient/product code. Each of those remains a distinct, separate,
not-yet-authorized future patch.

**Status:** **DONE.** Landed commit
`3cd496f4cf81127d0a73ce40f4d6afc23f89b340` (exact bound message,
below). Independent review PASS. See §10 for full closure record.

**Implementer:** Codex 5.6 Terra (moderate, well-bound scope; does not
require Codex 5.6 Sol's complex Windows/worktree capability). **Reviewer:**
independent read-only reviewer (DeepSeek V4 Pro primary, Kepler or
Gemini 3.1 Pro fallback) — PASS required before commit. Sonnet
(CTO/governance owner) authored/authorized this patch and must NOT
perform its review. **Authored:** Sonnet (CTO), 2026-07-23.

**Base commit (bind — implementation must start here):**
`f8394a5c5c2132cb791de72b3491b11ac31b796d` (the current authoritative
governance HEAD as of PATCH-105's closure/PATCH-106's authorization —
**not** `ab7de32e1d941b11ddfb5897de6a92fbfde5d904`, which is PATCH-105's
landed implementation commit and is used *only* as the fixed
real-history validation target in §7 item 2's sanity check, per §1a
below. Do not conflate the two.)

### 0a. Base-commit vs. historical validation target (bind — corrects
a drafting error caught before implementation began)

This patch's original draft stated `ab7de32e1d941b11ddfb5897de6a92fbfde5d904`
(PATCH-105's landed commit) as the implementation base. That was
wrong: per PATCH-105 §7a's manifest-lifecycle rule, a patch's
implementation base must always be the **current authoritative
governance HEAD**, and `f8394a5` (the PATCH-105-closure /
PATCH-106-authorization commit) landed *after* `ab7de32e` — making
`ab7de32e` stale as a base the moment `f8394a5` was pushed. The two
values serve entirely different, non-conflatable purposes here:

| Value | Meaning | Where it's used |
|---|---|---|
| `f8394a5c5c2132cb791de72b3491b11ac31b796d` | current authoritative governance HEAD; PATCH-106's implementation base; `PATCH-106.manifest.json`'s `baseCommit` | implementation start point, pre-commit self-validation |
| `ab7de32e1d941b11ddfb5897de6a92fbfde5d904` | PATCH-105's landed implementation commit; a **fixed historical artifact**, never moves | the §7 item 2 real-history sanity-check argument to `validateLandedCommit` only — proving the new post-commit mode works against real repo history, not a base for anything |

**Do not check out, reset, or detach to `ab7de32e`.** The implementer
stays on current `main` throughout; `ab7de32e` is passed only as a
string argument to the new CLI being built, exactly like any other
test fixture value — it is never a working-tree state to occupy.

**Bound implementation commit message (verbatim):**
`feat(harness): add post-commit/landed manifest validation mode (PATCH-106)`

---

## 1. Root cause / motivation (bind)

PATCH-105's `validateScope()` has exactly one mode, built around the
invariant `HEAD === manifest.baseCommit` meaning "candidate still
uncommitted." Once a reviewed candidate lands, `HEAD` necessarily
diverges from `baseCommit` for the correct reason (the candidate's own
commit) — and `validateScope()` will always report `ok:false` with
`headMatchesExpected`/`baseCommitMatches` violations, even for a
perfectly landed patch. This was ruled, in PATCH-105 §13, as *expected,
not broken* — but it means there is no automated way to ask "does
commit X actually conform to manifest Y" without a human manually
running `git show --name-only`, `git log -1 --format=%s`, and
`git hash-object` and eyeballing the results, exactly as the CTO did
during PATCH-104's and PATCH-105's closures. Additionally,
`manifestSchema.ts`'s `expectedTestTotals` field has existed since
PATCH-105 but is never read or compared by any code — a declared,
dead contract.

## 2. New interface (bind)

Add to `scripts/harness/scopeValidator.ts` (new exported function,
**existing `validateScope` export and its behavior are not modified**):

```ts
export interface LandedCommitValidationOptions {
  readonly repoRoot: string;
  readonly commandRunner?: CommandRunner;
  readonly reportedTestTotals?: { readonly tests: number; readonly files: number };
}

export async function validateLandedCommit(
  manifest: PatchManifest,
  landedCommit: string,
  options: LandedCommitValidationOptions,
): Promise<LandedCommitValidationResult>;
```

Add to `scripts/harness/types.ts`:

```ts
export interface LandedCommitValidationResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
  readonly checks: {
    readonly landedCommitExists: boolean;
    readonly parentMatchesBaseCommit: boolean;
    readonly landedFilesWithinAllowed: boolean;
    readonly prohibitedPathsAbsentFromLandedCommit: boolean;
    readonly landedCommitMessageMatches: boolean;
    readonly landedBlobsMatch: boolean | 'not-checked';
    readonly testTotalsMatch: boolean | 'not-checked';
  };
}
```

**Bound checks:**
- `landedCommitExists`: `git cat-file -e <landedCommit>` (or
  `git rev-parse --verify`) succeeds.
- `parentMatchesBaseCommit`: `git rev-parse <landedCommit>^` equals
  `manifest.baseCommit` exactly.
- `landedFilesWithinAllowed`: every path from
  `git show --name-only --format="" <landedCommit>` matches
  `manifest.allowedFiles` via the existing `isAllowed`/`matches` glob
  logic (reused, not reimplemented).
- `prohibitedPathsAbsentFromLandedCommit`: none of those paths match
  `manifest.prohibitedFiles`.
- `landedCommitMessageMatches`: `git log -1 --format=%s <landedCommit>`
  equals `manifest.exactCommitMessage` exactly.
- `landedBlobsMatch`: `'not-checked'` if `manifest.candidateBlobs` is
  absent; otherwise, for each `[path, expectedBlob]` entry, confirm
  `git rev-parse <landedCommit>:<path>` equals `expectedBlob`.
- `testTotalsMatch`: `'not-checked'` if `manifest.expectedTestTotals`
  is absent OR `options.reportedTestTotals` is not supplied; otherwise
  a strict equality compare of `tests`/`files`. **The validator never
  runs Vitest itself** — `reportedTestTotals` is supplied by the CLI
  from a pre-existing Vitest JSON reporter file the caller already
  produced (e.g. `vitest run --reporter=json --outputFile=...`,
  already supported by the installed Vitest, zero new dependency).

## 3. New CLI (bind)

New file `scripts/harness/validateLandedCommit.ts`:
```
vite-node scripts/harness/validateLandedCommit.ts <manifest-path> <landed-commit-sha> [--reported-totals-file <path>]
```
Prints exactly one JSON object (`LandedCommitValidationResult`) to
stdout; exits 0 if `ok`, 1 otherwise — matching `validateScope.ts`'s
existing convention exactly.

New `package.json` script: `"harness:validate-landed": "vite-node scripts/harness/validateLandedCommit.ts"`.

## 4. Security and safety fences (bind, in addition to all standing
repo rules and PATCH-105's §6 fences, which remain in force)

No secrets printed. No `.env.local` read or exposed. No file deletion
by this validator (read-only, like its predecessor). No commit, push,
or stash operation triggered by this code. No test execution triggered
by this code — `reportedTestTotals` is read from a file path the
caller supplies, never invoked or spawned by the validator. No product
code (`app/**`, `components/**`, `lib/domain/**`, `lib/infra/**`)
touched. No change to `validateScope()`'s existing exported behavior
or its existing tests (only new tests may be added, for the new
function). Windows-first; all git subprocess calls reuse the existing
`CommandRunner`/`execFileAsync` pattern already in `scopeValidator.ts`.

## 5. Required tests (bind — unit-first, mocked git via injected
`CommandRunner`, same pattern as `scopeValidator.test.ts`)

Extend `scripts/harness/scopeValidator.test.ts` (or add a sibling
`validateLandedCommit.test.ts` — implementer's choice, whichever keeps
the file under the repo's file-size conventions) with at minimum:
1. fully conforming landed commit → `ok:true`, all applicable checks
   true, `landedBlobsMatch`/`testTotalsMatch` `'not-checked'` when
   their manifest fields are absent.
2. landed commit's parent does not match `baseCommit` → violation.
3. a file outside `allowedFiles` present in the landed commit →
   violation.
4. a prohibited path present in the landed commit → violation.
5. commit message mismatch → violation.
6. `candidateBlobs` present and matching → `landedBlobsMatch: true`.
7. `candidateBlobs` present and one mismatching → `landedBlobsMatch: false`.
8. `expectedTestTotals` present, `reportedTestTotals` supplied and
   matching → `testTotalsMatch: true`.
9. `expectedTestTotals` present, `reportedTestTotals` supplied and NOT
   matching → `testTotalsMatch: false`, `ok:false`.
10. commit does not exist (`landedCommitExists: false`) → immediate
    `ok:false`, no other git calls required to still resolve cleanly
    (no unhandled rejection).

## 6. Exact file scope (bind)

**New files (2):**
1. `scripts/harness/validateLandedCommit.ts`
2. `.fable5/patches/PATCH-106.manifest.json` (this patch pilots itself
   on its own new post-commit mode, matching PATCH-105's precedent —
   `baseCommit`: `f8394a5c5c2132cb791de72b3491b11ac31b796d`, the
   current governance HEAD per §0a — **not**
   `ab7de32e1d941b11ddfb5897de6a92fbfde5d904`, which remains only the
   fixed argument to the §7 item 2 real-history sanity check)

**Modified files (3):**
- `scripts/harness/scopeValidator.ts` — add the new exported
  `validateLandedCommit` function only; `validateScope` and all
  existing exports/behavior unchanged.
- `scripts/harness/types.ts` — add the new `LandedCommitValidationResult`
  type only.
- `scripts/harness/scopeValidator.test.ts` — add new test cases only
  (§5); do not modify or delete any existing test.
- `package.json` — add exactly one new script,
  `"harness:validate-landed"`, invoking the new CLI via `vite-node`
  (matching PATCH-105 §9a's runner convention — do not use `tsx`).

**Prohibited paths (must NOT change):** everything PATCH-105 §9
prohibited, plus `scripts/harness/serverLifecycle.ts`,
`scripts/harness/serverCli.ts`, `scripts/harness/manifestSchema.ts`,
`scripts/harness/validateScope.ts`, `scripts/harness/serverLifecycle.integration.ts`,
`scripts/harness/fixtures/tinyServer.mjs`, and PATCH-105's own manifest
file — none of PATCH-105's landed files are touched except the three
modified files named above, and even those only by addition.

**Expected file count:** 2 new, 3 modified, 0 deleted, 0 renamed.

**Dependency choices:** zero new dependencies. Reuses `vite-node`
(PATCH-105 §9a), `zod` (already present), Vitest's already-supported
`--reporter=json` flag for producing the optional totals file (the
harness code only reads that file; it never invokes Vitest).

## 7. Validation matrix (bind)

1. `npx vitest run scripts/harness` — all existing 13 tests still
   green, plus the new tests from §5, growing only.
2. `npm run harness:validate-landed -- .fable5/patches/PATCH-106.manifest.json ab7de32e1d941b11ddfb5897de6a92fbfde5d904` —
   sanity-check against PATCH-105's own already-landed commit (a real,
   known-good landed commit) to confirm the new mode works against
   real repository history, not just mocks.
3. `npm run harness:validate-scope -- .fable5/patches/PATCH-106.manifest.json` —
   the existing pre-commit mode, run against PATCH-106's own candidate
   while it remains uncommitted (this patch pilots itself, per §6).
   Expects `HEAD` to still equal `f8394a5c5c2132cb791de72b3491b11ac31b796d`
   (the manifest's `baseCommit`, per §0a) throughout implementation —
   `ok:true` with `commitMessageMatches: 'not-checked'`.
4. `npx tsc --noEmit` — clean.
5. `npm run check:boundaries` — clean, no-op confirmation (no
   `components/**`/`app/**` files touched).
6. Full `npx vitest run` — must remain 471+ tests / 47+ files, growing
   only by the new test cases, never shrinking or newly failing.
7. `npm run verify` — full green.
8. `npm run build` — clean (confirm no dev server running first, per
   SKILL.md's standing hazard).
9. Windows process/port checks: confirm zero residual process/port
   state (this patch spawns no long-lived process — it only shells out
   to `git`, synchronously, per invocation).
10. Fresh independent review (DeepSeek V4 Pro primary, Kepler/Gemini
    3.1 Pro fallback — NOT Sonnet) required before commit.

**The implementer must leave the candidate uncommitted** after all
gates pass — report results and await explicit commit authorization,
exactly as PATCH-105 required.

## 8. Hard-stop conditions (bind)

STOP, report, do not commit, if: any file outside §6's exact list is
touched; `validateScope()`'s existing exported behavior or any existing
test is modified or removed; any new runtime dependency is added; the
new validator ever spawns/invokes Vitest, `npm`, or any test runner
itself (it must only read a pre-existing report file when one is
supplied); any secret or `.env.local` content is printed, logged, or
committed; the new validator or its CLI ever deletes a file; a stash
is created or dropped by any file in this patch; a commit or push is
issued automatically; the manifest pilot (§6, item 2) fails its own
pre-commit validation; the sanity check against PATCH-105's real
landed commit (§7 item 2) fails; Explorer agents, retrieval memory,
remote sandboxes, Git-worktree isolation, automated model handoffs, or
a new CanvasClient extraction are introduced under this patch's scope;
any required gate in §7 fails or is skipped; the working tree is ever
checked out, reset, or detached to `ab7de32e1d941b11ddfb5897de6a92fbfde5d904`
or any commit other than remaining on current `main` (per §0a,
`ab7de32e` is a fixed historical CLI argument only, never a working
-tree state to occupy); `PATCH-106.manifest.json`'s `baseCommit` is
set to any value other than `f8394a5c5c2132cb791de72b3491b11ac31b796d`.

## 9. Health ledger

Unchanged ruling (option B, retired) — not recalculated here.

## 10. Closure (bind — CTO post-landing verification)

**Landed commit:** `3cd496f4cf81127d0a73ce40f4d6afc23f89b340`, exact
bound message
`feat(harness): add post-commit/landed manifest validation mode (PATCH-106)`.
Verified directly: branch `main`, HEAD == origin/main == the landed
commit, clean working tree, zero staged/untracked files, empty stash,
`package-lock.json` unchanged, `git diff HEAD^ HEAD --check` clean,
and `git show --name-only --format="" HEAD` returns exactly the six
governed paths from §6 — `.fable5/patches/PATCH-106.manifest.json`,
`package.json`, `scripts/harness/scopeValidator.test.ts`,
`scripts/harness/scopeValidator.ts`, `scripts/harness/types.ts`,
`scripts/harness/validateLandedCommit.ts` — no more, no fewer.
`HEAD^` (`f8394a5c5c2132cb791de72b3491b11ac31b796d`) confirmed exactly
equal to the manifest's `baseCommit` per §0a, closing the loop on this
patch's own base-commit correction.

**Independent review:** PASS, confirming the exact six candidate paths
and blobs, `validateScope()`'s existing behavior fully preserved (no
regression to PATCH-105's pre-commit mode), the new
`validateLandedCommit` implementation, the new landed-validation CLI,
the manifest-lifecycle/historical-target distinction (§0a), harness
tests (**3 files / 21 tests** — up from PATCH-105's 3/13, consistent
with the new test cases added to the existing `scopeValidator.test.ts`
rather than a new file), full Vitest (**47 files / 479 tests** — up
from the pre-patch 47/471 baseline, consistent with exactly 8 new
test cases and zero new/removed test files elsewhere), TypeScript,
boundaries, `verify`, `build`, and clean process/cleanup state.
Reviewer: independent (not Sonnet), per this patch's standing reviewer
binding.

**Landed-validation verification (this closure turn, live, read-only):**
`npm run harness:validate-landed -- .fable5/patches/PATCH-106.manifest.json HEAD`
→ exit 0, `{"ok":true,"violations":[],"checks":{"landedCommitExists":true,"parentMatchesBaseCommit":true,"landedFilesWithinAllowed":true,"prohibitedPathsAbsentFromLandedCommit":true,"landedCommitMessageMatches":true,"landedBlobsMatch":"not-checked","testTotalsMatch":"not-checked"}}`.
Confirmed zero mutation (`git status` clean before and after) and zero
residual process/port state.

**Post-commit pre-commit-scope validation:** `harness:validate-scope`
against this same manifest post-commit correctly reports `ok:false`
(`headMatchesExpected`/`baseCommitMatches` both false,
`commitMessageMatches: true`) — this is the **same expected,
non-broken lifecycle shape** ruled in PATCH-105 §13, now doubly
confirmed by PATCH-106's own landing: a manifest's pre-commit mode is
*supposed* to read as "out of bounds" once its candidate has landed
one commit past `baseCommit`. This is not a regression and required
no manifest edit.

**Remaining implementation blocker:** none. PATCH-106 is fully landed,
reviewed, and functionally verified — both its own pre-commit and its
new post-commit validation modes behave exactly as designed.

**PATCH-107:** authorized separately (see `PATCH-107.md`) as the
isolated Git-worktree execution foundation — not implemented as part
of this closure.
