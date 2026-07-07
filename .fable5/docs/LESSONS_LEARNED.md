# Lessons Learned

Solved-problem records in the `extract-approach` format (see
`.claude/skills/extract-approach/SKILL.md`). Read the **Reusable rule** lines
at minimum before working on this repo. Newest first within each section.

## Delegation & process

### Codex skipped verification and commit (2026-07-07, PATCH-002)
**Symptom:** implementation returned "complete"; HEAD unchanged, work uncommitted, verification never run — and the tree actually FAILED the check.
**Wrong path:** assuming a well-written spec's Step 4/5 would be followed because they were explicit.
**Root cause:** implementation models optimize for producing the artifact; process steps around it get dropped without a forcing function.
**Fix:** CTO ran verification, found two spec defects, fixed, committed (`a7fe12c`); handoff template now demands pasted output + commit hash.
**Reusable rule:** a delegated patch is not done until the reviewer has re-run verification themselves and the commit hash exists — treat all pasted reports as claims, not evidence.

### Spec defects survive faithful implementation (2026-07-07, PATCH-002; recurred PATCH-003)
**Symptom:** Codex implemented specs byte-faithfully; results were still broken (PATCH-002: glob escaping + inline-config; PATCH-003: `Object.assign(fn, { name })` throws because `Function.name` is writable:false — use `Object.defineProperty(fn, 'name', { value, configurable: true })`, it is configurable:true).
**Root cause:** the spec author (CTO) wrote exact file contents without executing them first.
**Fix:** review/verification caught both; all defects were spec bugs, not implementation bugs. PATCH-003's "unexecuted spec" declaration + stop-on-failure rule worked as designed — the failure surfaced cleanly with a clean report.
**Reusable rule:** when a spec contains exact code, the spec author should dry-run its verification section before delegating — or explicitly mark it "unexecuted, expect iteration". Interface-shape corrections stay CTO decisions even when the fix is one line; only mechanical corrections are implementer latitude.
**Recurrence (2026-07-07, PATCH-004 / Amendment 2):** the patch restated the dev-server guard ("no builds **while the dev server runs**") as an unconditional "no `npm run build`" — which then contradicted the handoff's mandatory `npm run verify` (whose last step is a build). GPT-5.5 stopped with everything green except that final step. Resolution: amend the prohibition back to its conditional form and sequence the build after the dev server stops; the verify gate itself was never weakened. **Additional rule:** never restate a conditional rule without its condition — the condition IS the rule; a spec that compresses "not while X" into "never" will collide with any instruction that legitimately does the thing outside X. When two of your own instructions conflict, the fix is almost always to find which one lost its qualifier.
**Recurrence (2026-07-07, PATCH-004 / Amendment 1):** the spec required infra unit tests while `vitest.config.ts` included only `lib/domain/**` AND listed config files as untouchable — a self-contradiction. GPT-5.5 stopped instead of expanding scope (escalation ladder worked as designed; no commit, clean report). CTO authorized the one-line include widening as Amendment 1. **Additional rule:** whenever a patch adds tests in a directory the runner has never seen, the spec must verify the runner's include globs first — a test that never executes is worse than no test (it reads as green coverage), so acceptance criteria must demand the test file's name in the pasted run output, not just a green exit.

### Implementers stop on warnings unless the spec defines the tiers (2026-07-07, PATCH-002.1)
**Symptom:** install exited 0 but emitted npm peer warnings; the implementation model classified them as verification failure and halted mid-patch.
**Wrong path:** the spec said "run and paste output" without defining what counts as failure — leaving severity interpretation to the implementer.
**Root cause:** verification sections that don't distinguish exit-code failure / error / warning delegate a judgment call to a model with zero design latitude — it will (correctly per its rules) stop.
**Fix:** warning policy added to PATCH-002.1 with a classification table of the two pre-existing warning families (typescript-eslint peer-lag: accepted, fix with lint overhaul; react-twitter-embed React-19 peers: accepted, fix in embed/dependency review); global rule added to SKILL.md and handoff template rule 10.
**Reusable rule:** "warnings are observations; errors are blockers — only non-zero exit codes or failed acceptance criteria stop a patch, unless the spec names a specific warning as a blocker." Specs for noisy tools (npm, webpack) must pre-classify known warnings.

## Repo & tooling mechanics

### `next dev` and `next build` share `.next` (2026-07-06, incident)
**Symptom:** dashboard/canvas routes returned Internal Server Error; homepage still worked.
**Wrong path:** suspecting the day's code changes.
**Root cause:** production builds ran while the dev server was live; both write `.next`, corrupting the dev cache (static pages survive, dynamic routes 500).
**Fix:** stop server → delete `.next` → restart dev; guard added to SKILL.md; `PW_BASE_URL` override added so e2e can target a live dev server instead of building.
**Reusable rule:** never run `npm run build` or e2e-with-webServer while the dev server is running; recovery is stop → rm `.next` → restart.

### ESLint ignore paths treat `[id]` as a character class (2026-07-07, PATCH-002)
**Symptom:** three grandfathered files still failed the boundary check.
**Root cause:** minimatch: `[id]` matches one char (`i` or `d`), so `app/share/[token]/page.tsx` never matched the literal folder.
**Fix:** escape as `\\[id\\]` (`a7fe12c`).
**Reusable rule:** in any glob (ESLint ignores, tsconfig, Playwright), Next.js dynamic-route folders must have `[` `]` escaped.

### Standalone ESLint configs choke on inline disable comments (2026-07-07, PATCH-002)
**Symptom:** 53 errors "Definition for rule ... was not found" from files never touched by the patch.
**Root cause:** source files carry `eslint-disable` comments for plugin rules the minimal config doesn't load; ESLint errors resolving them.
**Fix:** `--no-inline-config` — which also hardens the check: the boundary cannot be eslint-disabled away.
**Reusable rule:** single-purpose ESLint gates should run with `--no-inline-config`; it removes unknown-rule noise AND circumvention.

### Committed junk can hide real credentials (2026-07-06, Phase 0)
**Symptom:** `tmp/` contained 10,726 committed files including full Chrome profiles (Login Data, Cookies, third-party session storage).
**Root cause:** audit scripts used repo-local `user-data-dir`s; `tmp/` wasn't gitignored; "backup snapshot" commits swept everything in.
**Fix:** removed from tip (`bcba8fe`); full bundle backup made first; history purge pending owner approval (`git filter-repo`), feasible because no remote exists.
**Reusable rule:** before any cleanup, bundle-backup the repo; browser automation must keep profiles outside the worktree; hygiene deletions of tracked files are safe (git history), untracked ones are not.

### A remote turns dormant history risk into live exposure (2026-07-07, PATCH-003.5)
**Symptom:** the long-tolerated "purge git history when convenient" item became urgent overnight — the first push to GitHub copied the entire dirty history (Chrome profiles with Login Data/Cookies) to servers we don't control.
**Wrong path:** treating "repo has no remote" as a reason the purge could wait, instead of as the closing condition of the safe window. The push and the purge were tracked as independent tasks; they were actually ordered.
**Root cause:** risk items were listed flat; the dependency "purge MUST precede first push" was never written as a gate, so resolving one risk (no backup) silently escalated another (history credentials).
**Fix:** PATCH-003.5 runbook (filter-repo, fresh `--all` bundle, delete-and-recreate on GitHub because force-push leaves old commits fetchable by SHA until GitHub's own gc). Pre-push gate added to AI_WORKFLOW.
**Reusable rule:** before content gets its FIRST copy on any external surface (git remote, artifact host, package registry), scan its full history — `git log --all -- <suspect paths>` and `git for-each-ref` (tags and side branches keep deleted material reachable; here, three local tags each held ~10,378 profile files a branch-only check would have missed). And when two open risks interact, write the ordering down as a gate, not two list items.

### Chrome profile material is DPAPI-chained — assess before rotating (2026-07-07, PATCH-003.5)
**Symptom:** committed `Login Data`, `Cookies`, and `Local State` files looked like a mass-credential leak demanding immediate rotation of everything.
**Root cause of the over-read:** Chrome encrypts passwords/cookies with a per-profile AES key in `Local State`, itself wrapped by Windows DPAPI bound to the owner's OS account; the DPAPI master key (`%APPDATA%\Microsoft\Protect`) is never inside the profile. Repo copies are ciphertext without the key chain's root.
**Fix:** tiered assessment in PATCH-003.5 §4 — nothing "definitely rotate"; session revocation for accounts used in the profiles "recommended" (refresh tokens survive password changes); anon key "unnecessary".
**Reusable rule:** the Supabase anon key is PUBLIC by design (it ships in every browser bundle — RLS is the boundary); never panic-rotate it. The service-role key is the real secret and must never appear in repo, CI, or client. For leaked browser profiles, prefer session revocation ("sign out everywhere") over password rotation — it's what actually kills live refresh tokens.

### Stale build artifacts lie (2026-07-06, Phase 0)
**Symptom:** committed `tsc_output.txt` implied many type errors; `tsc --noEmit` was actually clean, while `npm run build` was actually broken (lint-blocked + prerender crashes).
**Reusable rule:** never trust committed logs/outputs; re-run the tool. The gate you don't run in CI is a gate that is currently failing.

### Windows execSync mangles `^` — a review audit compared a commit to itself (2026-07-07, PATCH-003 review)
**Symptom:** lockfile audit reported 0 added/0 changed while `git show --stat` showed a 16k-line diff and grep found vitest only in the new file.
**Wrong path:** almost trusted the "no changes" audit because it looked authoritative.
**Root cause:** `execSync('git show 75d7626^:file')` on Windows runs through cmd.exe, where `^` is the escape character — `75d7626^:` became `75d7626:`, so old==new by construction. (`~` is safe; `^` is not.)
**Fix:** re-ran the audit with explicit parent hashes; real result: +139 vitest tree, 0 removed, 4 transitive bumps.
**Reusable rule:** on Windows, never put `^` in a shell-executed git revspec — use `HEAD~1`, explicit hashes, or `--no-walk`; and when two verification tools disagree, neither is trusted until the disagreement is explained.

## Auth & Supabase platform

### Supabase rate limits are per-IP buckets, and they're separate (2026-07-07, login incident)
**Symptom:** all logins 429'd for 90+ minutes, surviving code fixes.
**Wrong paths:** (1) blaming the login code; (2) blaming middleware token refreshes for the sign-in bucket (refreshes have their OWN 150/5min bucket — the dashboard screenshot corrected this).
**Root cause:** sign-ins are 30/5min/IP; every retry (user + models testing) kept refilling the window. Separately, `middleware.ts` ran `getSession()` (refresh-capable) on EVERY request including `/api/*`, draining the refresh bucket.
**Fix:** client-primary sign-in (browser spends its own IP budget; server keeps lockout bookkeeping via session-verified phases) `51db5a8`; middleware matcher excludes `/api/*` `f64dd76`; owner advised: sign-in limit 30→100, custom SMTP (built-in email = 2/hour, silently breaks onboarding at 3 users/hour).
**Reusable rule:** on any 429, STOP retrying (retries extend the block) and identify WHICH bucket via a direct provider call that bypasses app layers; design auth so each user's own IP pays their rate-limit cost (server-proxied auth funnels everyone through one IP — school NATs have the same shape).

### Client-reported security events must be session-verified (2026-07-07, auth review)
**Symptom (near-miss):** the client-primary redesign lets the browser report login success/failure to the server for lockout bookkeeping.
**Root cause risk:** trusting `phase:'success'` without proof would let anyone clear a victim's lockout; trusting `phase:'failure'` lets anyone inflate it (accepted, bounded by the reporter's own IP throttle; hardening queued).
**Fix (verified present):** the success phase requires the caller's real session cookie and email match before clearing anything.
**Reusable rule:** any client-reported security event needs cryptographic/session proof before it mutates server-side security state.

### A lockfile can be inconsistent while `npm ls` says it's fine (2026-07-07, PATCH-003 blockage)
**Symptom:** `npm install -D vitest` failed with ERESOLVE though nothing touched React; `npm ls` reported a consistent tree.
**Wrong path:** treating it as a vitest/PATCH-003 problem.
**Root cause:** `react-chrono@3.3.3` declares peer `react@^19.2.3` while the lockfile pins react 19.1.0 — the package was originally installed with peer checks bypassed. Install-time validation is stricter than `npm ls`, so EVERY subsequent install fails, regardless of what's being installed.
**Fix:** upgrade react/react-dom to ^19.2.3 (PATCH-002.1) — the resolution the peer contract actually asks for; proven via `npm install --dry-run` before delegating.
**Reusable rule:** when any `npm install` ERESOLVEs on packages you didn't touch, the lockfile itself is inconsistent — diagnose with `--dry-run`, fix the named peer contract permanently, and never reach for `--legacy-peer-deps`/`--force` (that's how the inconsistency was created). Dry-run the fix before prescribing it.

## E2E & UI testing in this codebase

### Discover selectors live; never guess labels (2026-07-07, PATCH-001)
**Symptom:** three failed test iterations at ~5 min each: Escape doesn't save notes, "Delete" is actually "Move to Trash" in the card's right-click menu, sidebar "buttons" aren't buttons.
**Root cause:** the UI is non-semantic — sidebar tools and cards are `<div onClick>` with tooltip-span labels; NoteEditor saves on backdrop-click only; menu labels differ between the dropdown and context menu for the same action.
**Fix:** discovery scripts that drive the real app and dump DOM/buttons/menus before writing assertions; selector notes embedded in the spec file.
**Reusable rule:** in this repo, write UI tests in two passes — a throwaway discovery run that prints reality, then the test; and read the component source for the affordance before selecting it. (The deep fix is semantic markup — first ACCESSIBILITY.md burn-down item.)

### Test data pollutes real quotas (2026-07-07, PATCH-001)
**Symptom:** board creation started failing mid-verification; leftover `e2e-*` boards had consumed the free-plan board limit (soft-delete keeps counting).
**Fix:** hard-deleted via service role; lifecycle test cleans up in `finally`.
**Reusable rule:** e2e cleanup must hard-delete (or use a high-limit account); soft-deleted rows still count against entitlements.

## Architecture strategy (the standing plan)

### Domain-layer migration: net → freeze → seam → extract
The agreed strategy for de-godding `CanvasClient.tsx` (8.5k lines, ~105 direct DB call sites) without a rewrite:
1. **Net first** (PATCH-001): characterization e2e locks observable behavior; refactors must keep it green with zero test edits.
2. **Freeze second** (PATCH-002): blocking check stops NEW UI→Supabase imports; 24 grandfathered files, shrink-only list in `eslint.boundaries.config.mjs`.
3. **Seam third** (PATCH-003, pending): `lib/domain` skeleton — Result type, error taxonomy, first repository + command, proven on one small settings page (removes the first grandfathered file).
4. **Extract repeatedly** (PATCH-004+): one command/page at a time, characterization green before/after, grandfather list shrinks each patch.
**Reusable rule:** never extract from a god component without a behavior net and an anti-regression freeze already in place; sequence cheap guards before expensive work.

### Known dualities are load-bearing until their planned phase
Two canvas systems, three comment stores, the kanban schema island: each has a scheduled migration (ROADMAP Phases 1–3). Opportunistic "fixes" strand data.
**Reusable rule:** check CURRENT_TASK/ROADMAP before unifying anything that looks duplicated — if it's listed, it's quarantined, not forgotten.

## Standing risks future models must not forget

1. **CI secrets not yet configured** — pushing activated
   `.github/workflows/ci.yml`; the build (and smoke) steps need repo secrets
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` or the first
   Actions runs will fail red. Owner action; then check the first run.
2. dhtmlx-gantt/scheduler are GPL/commercial dual-licensed and shipped unlicensed — replace or buy before GA.
3. Supabase built-in email = **2/hour project-wide** — configure custom SMTP before any beta.
4. Lint has 5,426 legacy errors and is advisory; the build ignores it (`eslint.ignoreDuringBuilds`) — burn down, then remove the bypass.
5. Excalidraw fork has its own committed `node_modules` backing a `file:` dependency — repo bloat; also inflates every clone/push now that a remote exists (though the PATCH-003.5 purge cut the pack 166→38.8 MiB).
6. **Pre-rewrite bundles must be retained until PATCH-004 is verified on the new remote**: `../starter-pre-phase0-20260706.bundle` and `../starter-pre-purge-20260707.bundle` (the ONLY remaining copies of pre-purge history — they contain the sensitive material; delete both once retention ends).

**Resolved:** ~~No remote repository / off-machine backup~~ — RESOLVED
2026-07-07: private GitHub remote live (`origin/main`, branch renamed from
master; in sync, CTO-verified). Was the #1 risk since Phase 0.
**Resolved:** ~~Chrome-profile credentials in git history~~ — RESOLVED
2026-07-07 by PATCH-003.5: filter-repo purge of all refs (tree-identical
proof), GitHub repo deleted and recreated with purged history only
(pre-rewrite SHA fetch fails). Session revocation recommended to owner
(PATCH-003.5 §4); sensitive bytes now exist ONLY in the two local bundles
(risk 6 above).
