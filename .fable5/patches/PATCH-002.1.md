# PATCH-002.1 — Restore npm installability: align React with react-chrono's peer range

**Status:** APPROVED (owner, 2026-07-07) — delegated to Codex GPT-5.4.
Execute the Verification Steps exactly; `--legacy-peer-deps`/`--force` remain
NOT approved. Codex must not edit `.fable5/` or `.claude/`. CTO review on
return: dependency diff (react/react-dom only), verification output re-run
independently, typecheck, boundary check, commit hash, and a lockfile audit
for unexpected transitive changes.
**Type:** prerequisite (blocks PATCH-003) · **Complexity:** easy
**Estimated implementation time:** 15–30 minutes
**Assigned model (proposed):** GPT-5.4 (Codex)

## Goal
Make `npm install` work again by upgrading `react`/`react-dom` 19.1.0 → 19.2.x,
satisfying `react-chrono@3.3.3`'s peer requirement (`react@^19.2.3`) that the
current lockfile violates.

## Reason (root-cause diagnosis, CTO-verified 2026-07-07)
The lockfile is internally inconsistent: react-chrono 3.3.3 declares peer
`react@^19.2.3`, but react is locked at 19.1.0 — react-chrono must have been
installed with peer checks bypassed at some point. `npm ls` reports "consistent"
(it checks looser rules), but **every** `npm install <anything>` re-validates
peers strictly and fails with ERESOLVE. This blocked PATCH-003 Step 1
(`npm install -D vitest`); Codex correctly stopped. This is a **project
issue**, not a PATCH-003 defect — PATCH-003 is unchanged and merely blocked.

## Why this fix and not the alternatives
- **Chosen: upgrade react/react-dom to ^19.2.3** — it is literally what the
  peer contract asks for; a React *minor* bump already inside our declared
  `^19.0.0` range; **proven by CTO dry-run**: `npm install --dry-run
  react@^19.2.3 react-dom@^19.2.3 -D vitest@^3` → exit 0, resolves to 19.2.7,
  139 packages addable again.
- Rejected: `--legacy-peer-deps` / `--force` — blanket-disables peer safety
  for every future install; it is how this inconsistency was created in the
  first place. **Not approved.**
- Rejected: `overrides` forcing react-chrono to accept 19.1 — lies to the
  resolver; the mismatch survives, hidden.
- Rejected: downgrade react-chrono — older majors target React 18; backward.

## Files to Create
None.

## Files to Modify
- `package.json` — `"react": "^19.2.3"`, `"react-dom": "^19.2.3"` (dependency
  ranges only; the install command below edits them — do not hand-edit more)
- `package-lock.json` — via `npm install` only

## Files that MUST NOT be touched
Everything else. Especially: no other dependency changes (vitest arrives with
PATCH-003, not here — one concern per patch), nothing under `components/`,
`app/`, `lib/`, `.fable5/`, `.claude/`, no config files.

## Risks
- **React 19.1 → 19.2 behavior drift** (low: React minors are strongly
  compatible; 19.2 is bugfix-heavy). Net: characterization + smoke suites at
  CTO review (below), production build in CI.
- **Stale dev server**: the running dev server keeps old React in memory until
  restarted — e2e against it proves nothing. Owner restarts dev AFTER the
  patch lands; e2e verification is therefore a CTO-review step, not a Codex
  step.

## Rollback
`git revert` the patch commit, then `npm install` to restore the previous
lockfile state.

## Warning Policy (added 2026-07-07 after first implementation attempt)

**Rule: warnings are observations; errors are blockers.** Only a non-zero exit
code or a failed acceptance criterion stops this patch. Warnings must be COPIED
into the report's "Surprises/notes", never acted on.

Known warning families for this repo's installs — both PRE-EXISTING, neither
introduced by this patch, both **explicitly accepted** here:

| Warning | Classification | Disposition |
|---|---|---|
| `@typescript-eslint/*@8.36` peer wants `typescript <5.9.0`, found 5.9.3 | Acceptable technical debt (dev tooling lag; tsc unaffected, lint demonstrably runs) | Future patch: bundle a `@typescript-eslint` upgrade into the lint-overhaul patch |
| `react-twitter-embed@4.0.4` peer wants React ≤18, found 19.x (via react-social-media-embed) | Acceptable pre-existing debt (existed under React 19.1 too; embeds covered by smoke usage) | Future patch: handle within the embed/dependency review (SECURITY.md embeds item) |

Any NEW warning family outside these two: still not a blocker (exit 0 rule
applies), but flag it prominently in the report for CTO classification.

## Acceptance Criteria (revised — distinguishes failure / error / warning)
- [ ] **Installation success:** `npm install` exit code 0, run WITHOUT
      `--legacy-peer-deps`/`--force`. Peer WARNINGS in its output do NOT fail
      this criterion; an ERESOLVE **error** (non-zero exit) does.
- [ ] `node -e "console.log(require('react/package.json').version)"` prints 19.2.x
- [ ] `npm install --dry-run -D vitest@^3` **exit code 0** (warnings ignored;
      do NOT actually install vitest)
- [ ] `npx tsc --noEmit` — 0 **errors** (compiler errors are blockers; this
      tool has no warning tier)
- [ ] `npm run check:boundaries` — exit 0 (rule violations are errors/blockers)
- [ ] `git diff` touches only `package.json` (react + react-dom lines) and
      `package-lock.json`
- [ ] Commit exists; hash reported
- [ ] Report lists all warning text observed, mapped against the table above

## Resume instruction for GPT-5.4 (state as of 2026-07-07)
The install step is ALREADY APPLIED in the working tree (react 19.2.7 in
package.json + lockfile, uncommitted). Do not redo it. Resume at the
verification steps: re-run `npm install` once to confirm idempotent exit 0
(warnings expected per the table), then continue from the react-version check
through commit and report.

## Verification Steps (Codex: run all, paste real output)
```bash
npm install react@^19.2.3 react-dom@^19.2.3
node -e "console.log('react', require('react/package.json').version)"
npm install --dry-run -D vitest@^3      # proves PATCH-003 Step 1 is unblocked
npx tsc --noEmit
npm run check:boundaries
git status --porcelain                  # only the two files
```
Do NOT run `npm run build` or any Playwright test (dev server may be running).

## CTO review addendum (after Codex commits)
Owner restarts the dev server → CTO runs
`PW_BASE_URL=http://localhost:3000 npm run test:e2e` (smoke + characterization
must be green on React 19.2) → CI exercises the production build once a remote
exists; until then CTO runs `npm run build` locally with the dev server stopped,
coordinated with the owner.

## Commit message
```
fix(deps): upgrade react/react-dom to ^19.2.3 to satisfy react-chrono peer range (PATCH-002.1)
```

## Estimated Difficulty
easy — one install command plus verification; zero judgment required.
