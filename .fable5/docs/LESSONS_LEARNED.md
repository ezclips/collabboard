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
**Recurrence (2026-07-07, PATCH-009 / Amendment 1):** the spec bound `workspace_members` filtering on `user_id` — the real page filters `member_user_id` + `status='active'`, has an email-fallback query (`member_email` = lowercased email, own error handling), AND consumes `user_metadata.display_name` the bound helper couldn't supply. Root cause: the census grepped SELECT strings and field names but never read the full call sites — filter chains and control flow around queries are invisible to fragment greps. GPT-5.4's pre-edit census gate caught it with zero code written (the gate works against its own author). **Additional rule:** before binding any query in a spec, READ the complete call site (`grep -B2 -A14 "\.from('table'"` minimum, full function preferred) — bind the filter chain, the fallback control flow, and every consumed field, not just the select string. Composite (Pattern E) pages get a full-file read, no exceptions.
**Recurrence (2026-07-08, PATCH-014 / Amendment 1):** the e2e requirement demanded typing a wrong confirmation ("NOPE") and asserting the error toast — but the destructive button is `disabled` unless the text is exactly `DELETE`, so a wrong confirmation can never be submitted and the `toast.error('Please type DELETE to confirm')` guard is a handler-level dead branch through the UI. Root cause: the CTO wrote the assertion from the HANDLER code (the guard exists in the source, so it "looked assertable") without tracing the asserted behavior to a reachable UI trigger — the sibling of PATCH-012's import-chain failure, one level down: that one claimed a component renders without tracing to a mounted root; this one claimed a branch fires without tracing to an enabled control. Fixed by Amendment 1: characterize the reachable behavior instead (wrong text keeps the button disabled), keep the guard byte-untouched as defense-in-depth, REJECT making the path reachable (behavior change never rides an extraction patch — same standing rule as PATCH-012's Option-3 rejection). **Additional rule:** every behavior an e2e spec is required to ASSERT must be traced from the assertion back to a user-reachable trigger (enabled control, mounted component, routed page) before delegation — code existing in a handler proves nothing about UI reachability; `disabled=`, early returns, and render conditions between the user and the branch all break the path. Toast/error assertions are the highest-risk case: the toast call is always easy to find in source and often impossible to trigger from the DOM.
**Recurrence (2026-07-07, PATCH-012 / Amendment 1a):** the amendment's own orphan-proof command contradicted itself — it grepped `"ui-kit/Navbar"` while its expected-result comment named ClientWrapper, whose actual import is the relative `./Navbar`; the pattern could never match. Root cause: the CTO investigated with one (broader) pattern but transcribed a narrower one into the spec, and did not dry-run the transcribed command. **Additional rule:** the dry-run obligation covers AMENDMENTS too, and specifically covers proof/census commands paired with expected outputs — run the exact command as written in the spec text and paste its real output next to the expectation before delegating; a proof command that was never run is itself unproven.
**Recurrence (2026-07-07, PATCH-012 / Amendment 1):** the spec asserted "Navbar renders on most pages" and required an e2e spec asserting its visible signed-in/signed-out affordances on real pages — but `components/ui-kit/Navbar.tsx` is orphaned: its only importer (`ClientWrapper.tsx`) is itself imported by nobody, and the actual root layout chain (`app/layout.tsx` → `ClientLayout.tsx`) never mounts either. Root cause: the file LOOKED live (named "Navbar", imported by something named "ClientWrapper" that sounds load-bearing) and the census never traced the import chain up to a root layout/page — a one-hop "something imports it" check was mistaken for "it renders". GPT-5.4 stopped instead of writing e2e assertions against a component nothing shows. **Additional rule:** before asserting ANY component "renders" or "is live" in a spec, trace its import chain to an actual mounted root (a layout.tsx or a routed page), not just to its nearest importer — an orphaned file can be imported by another orphaned file indefinitely. When a spec claims live rendering it cannot verify, an e2e assertion against real DOM is the correct way to find out, and a implementer's inability to make that assertion pass is itself the signal, not a bug to work around.
**Recurrence (2026-07-07, PATCH-010 / Amendment 1):** the same census failure one level deeper — the pattern `user(\?)?\.[a-zA-Z_]+` captures one chain segment, so `user_metadata` was proven accessed but its FIELDS were never enumerated; `user_metadata?.name` (CanvasModals line 350) was missing from the bound type. With an `unknown` index signature, the undeclared access narrowed to `{}` in a `||` chain and tsc blocked exactly as the spec's Risks section predicted. **Additional rule:** censuses must enumerate FULL property chains, not first segments — for any object an extraction narrows the type of, grep every `<obj>(\?)\.<field>` chain to its leaves and declare them all; and when a type deliberately narrows a vendor type, the tsc gate is the census's safety net, so never suppress it with `any`.
**Recurrence (2026-07-07, PATCH-004 / Amendment 2):** the patch restated the dev-server guard ("no builds **while the dev server runs**") as an unconditional "no `npm run build`" — which then contradicted the handoff's mandatory `npm run verify` (whose last step is a build). GPT-5.5 stopped with everything green except that final step. Resolution: amend the prohibition back to its conditional form and sequence the build after the dev server stops; the verify gate itself was never weakened. **Additional rule:** never restate a conditional rule without its condition — the condition IS the rule; a spec that compresses "not while X" into "never" will collide with any instruction that legitimately does the thing outside X. When two of your own instructions conflict, the fix is almost always to find which one lost its qualifier.
**Recurrence (2026-07-07, PATCH-004 / Amendment 1):** the spec required infra unit tests while `vitest.config.ts` included only `lib/domain/**` AND listed config files as untouchable — a self-contradiction. GPT-5.5 stopped instead of expanding scope (escalation ladder worked as designed; no commit, clean report). CTO authorized the one-line include widening as Amendment 1. **Additional rule:** whenever a patch adds tests in a directory the runner has never seen, the spec must verify the runner's include globs first — a test that never executes is worse than no test (it reads as green coverage), so acceptance criteria must demand the test file's name in the pasted run output, not just a green exit.

### Commit messages were assembled ad hoc instead of specified upfront (2026-07-07, PATCH-005–015)
**Symptom:** PATCH-005 shipped with no `## Commit` section at all (message improvised at implementation time); PATCH-008's arrived via a separate follow-up commit that itself violated `.fable5/**` being CTO-only; PATCH-010 through PATCH-015 were drafted and approved without one, discovered only when the owner asked to review all six at once.
**Wrong path:** treating the commit message as a small enough detail to leave implicit, or to patch in reactively per-patch as each one reached implementation.
**Root cause:** the patch TEMPLATE.md itself had no `## Commit` slot, so nothing forced the spec author to decide the message at design time — the same class of gap as a missing acceptance criterion, just for a field that felt cosmetic.
**Fix:** `## Commit` added to TEMPLATE.md (between Potential Risks and Rollback Plan) so it can never again be omitted from a fresh draft; all six queued patches (010–015) backfilled in one pass; handoff template rule 12 added: an implementer handed a patch without a Commit section must STOP and report, never invent one.
**Reusable rule:** any field a delegate needs but has no authority to decide (commit message, exact file paths, error-mapping choices) belongs in the template's required sections, not in reviewer memory — if you catch yourself adding the same missing field to patch N, fix the template before drafting N+1.

### A stated "add at review" policy that wasn't executed created a false expectation (2026-07-07, PATCH-011 blockage)
**Symptom:** GPT-5.4 stopped on PATCH-011, correctly reporting that `PATCH_REFERENCE.md` contains no "Pattern F", "auth-state observer", or any trace of it — even though AI_WORKFLOW's reading order tells every engineer to consult that catalog first.
**Wrong path:** treating this purely as "Pattern F hasn't been reviewed yet, so of course it's absent" — true, but incomplete. Checking further showed PATCH-010's OWN pattern (type-only import swap) was ALSO missing from the catalog, despite PATCH-010 being reviewed and PASSED two turns earlier. The stated policy ("new patterns enter PATCH_REFERENCE at review") had been asserted in three places (CURRENT_TASK, the catalog's own footer, AI_WORKFLOW) but never actually executed at PATCH-010's review.
**Root cause:** a two-layer gap. (1) Process failure: a promised catalog-update step was left out of the review checklist in practice, so it silently didn't happen even once. (2) Design gap: even with the policy executed perfectly, a patch introducing a pattern for the FIRST time will always find that pattern absent from the catalog by definition — the standing instruction "read PATCH_REFERENCE first, it'll classify your pattern" doesn't hold for a patch's own debut, and nothing said so.
**Fix:** backfilled the missing type-only-swap pattern into PATCH_REFERENCE (§5.5) from the now-reviewed PATCH-010; added an explicit top-of-file note in PATCH_REFERENCE.md and inline notices in PATCH-011/PATCH-015's own headers stating plainly that a "(new)"-tagged pattern will be absent from the catalog until ITS OWN review adds it, and that this is expected, not a defect; corrected AI_WORKFLOW's reading-order instruction to carve out this exception explicitly.
**Reusable rule:** when a review's checklist includes "update doc X", verify X was actually updated before considering the review closed — a stated intention is not a completed action. And any "keep a summary in sync as work lands" policy has a structural blind spot for the FIRST instance of anything it summarizes — the source instance must say so itself ("I am new; the catalog will not have me yet") rather than relying on the reader to infer it from the summary's absence.

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

### Localized netstat broke the dev-server guard — CTO built over a live dev server (2026-07-07, PATCH-004 review)
**Symptom:** port-3000 checks reported "free" all session; then `npm start` failed EADDRINUSE and `netstat` showed PID 7932 listening the whole time — the owner's dev server, up since seconds after the patch commit. The CTO's verify build AND a second build had run against a live dev server, then deleted its `.next` — the exact incident the guard exists to prevent, caused by the guard's own check.
**Wrong path (double):** (1) grepping netstat output for the word "LISTENING" — this Windows is German-localized and prints `ABHÖREN`; the grep could never match. (2) Running e2e via `PW_BASE_URL` against whatever answered on :3000 without confirming WHICH server it was — 7 green tests were nearly unattributable evidence (they turned out to be the dev server serving the reviewed commit, so they stood, but by luck not design).
**Fix:** killed the stale-cache dev server, removed `.next`, owner restarts fresh; locale-safe check added to SKILL.md (`Get-NetTCPConnection -LocalPort 3000 -State Listen` count, or read `netstat -ano | findstr :3000` lines directly — never grep the status word).
**Reusable rule:** never grep localized command output for English words (netstat, tasklist, systeminfo are all localized on Windows) — use PowerShell object cmdlets or match locale-neutral fields like `:PORT`. And PW_BASE_URL evidence is only evidence when you can attribute the server: check the port immediately before starting your own server, and if something already answers, identify the PID and what it serves before trusting a single test result.
**Recurred (2026-07-08, PATCH-015 review):** the CTO used `netstat | grep LISTEN` mid-diagnosis, took empty output as "port free", deleted `.next` under a still-running dev server (which then 404'd everything), and started a second server that silently bound :3001. The rule covers ad-hoc checks during debugging, not just the formal pre-build guard — `Get-NetTCPConnection` ALWAYS, and after any kill, verify the port count is 0 before touching shared state.

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

### A racy characterization spec passes by luck, then fails when innocent (2026-07-07, PATCH-005 review)
**Symptom:** the accessibility characterization spec (PATCH-004) failed deterministically during PATCH-005's review — a patch that never touched that page. The "persisted after reload" value came back unchanged.
**Wrong path:** suspecting PATCH-005 (shared infra) or a malformed DB row (the PATCH-004 watchlist scenario). Both disproven by evidence: the row was full-shape and its `updated_at` predated the failing runs — saves weren't landing at all.
**Root cause:** the spec reloaded immediately after toggling, while the page saves fire-and-forget through TWO network round-trips (auth.getUser + upsert); navigation aborts in-flight requests. Every earlier green run had won the race by luck. A direct probe (toggle, wait 3s, read the row via service role) proved the save path healthy.
**Fix:** `waitForResponse` barrier on the save POST before reloading (and in the restore path) — `8636bd1`; spec went from 30s-timeout-flaky to deterministic 714ms. Rule added to PATCH_REFERENCE §6. Notable: GPT-5.4's notifications spec had independently guarded this with a wait — the implementer out-guarded the spec author.
**Reusable rule:** a characterization spec that asserts persistence MUST have a completion barrier on the save request — never assert-after-reload on faith, never use sleeps. And when a previously-green test fails under an innocent patch, suspect the test's timing assumptions before the code: check whether the write ever reached the database (row `updated_at` is the cheapest witness).

### A pre-hydration click is silently swallowed — and reads as "the page is broken" (2026-07-08, PATCH-014 Amendment 2)
**Symptom:** the implementer reported the OLD delete-account page's verify step as non-functional — clicking "Log in" allegedly triggered `GET /auth/v1/user → 200` with no toast, no "Verified" state, no redirect — and asked the CTO to weaken the characterization spec to match.
**Wrong path:** taking the observation at face value and amending the spec. The page source plainly implements the asserted behavior (`getUser` success → `setIsVerified(true)` + success toast), so observation and source contradicted each other — that contradiction is the signal to reproduce before amending.
**Root cause:** on a dev server the button is visible and clickable before React attaches handlers; a click in that window is swallowed with zero trace (no request, no spinner, no error). CTO probes against the running dev server proved both sides: click after a hydration settle → toast + Verified state in ~1.5s with exactly one `getUser → 200`; click the instant the button appears → the implementer's exact symptom, with NO auth request at all — meaning the 200 they cited never came from a running handler. Same failure family as the auth.setup retry fix (c7b0fb1), recurring one page deeper.
**Fix:** PATCH-014 Amendment 2 — characterization unchanged (the behavior is real); the spec's verify-step click hardened to an acknowledged click (`toPass` retry anchored on the durable "Verified" state, permitted only on idempotent triggers). Rule generalized in PATCH_REFERENCE §6.
**Reusable rule:** when a runtime observation contradicts what the source plainly implements, reproduce it yourself before changing any spec — and treat "clicking X does nothing" on a dev server as unproven until the handler is shown to have run (spinner or network traffic caused by THAT click); a swallowed pre-hydration click perfectly mimics a broken feature.

### The local full suite rotates random 30s timeouts under parallel load — dev-server contention, not a regression (2026-07-08, PATCH-014 review; requalified at PATCH-015 review)
**Symptom (recurring, rotating victims):** across PATCH-014/015 verification runs, the full suite intermittently failed 2–4 specs at `page.goto` or first-heading `toBeVisible` with 30s timeouts / `net::ERR_ABORTED` — a DIFFERENT set nearly every run (settings-render, protected-route, dashboard-settings, delete-account), always passing standalone.
**Wrong path (recorded then corrected):** the PATCH-014 review attributed it to cold-server on-demand compilation alone; PATCH-015's review disproved that as the full mechanism — a clean-cache, pre-warmed (all routes curled to 200 first) dev server still failed 2 specs at 6 workers, with EVERYTHING slowed (a 0.5s spec taking 27s).
**Root cause:** one machine runs the dev server AND N parallel chromium workers; at the Playwright default (6 here) the dev server saturates, navigations stall server-side, and whichever specs are in flight blow their fixed 30s budgets. Cold compile is just the worst case of the same contention. Proof: same server, same suite, `--workers=2` → 19/19 green with every spec at its fast baseline, wall time barely worse (35.5s vs 38–52s failing runs).
**Fix:** `workers: process.env.CI ? undefined : 2` in `playwright.config.ts` (dbd8691) — mechanism over memory; CI unaffected (production `next start`, 2-core runners, retries).
**Reusable rule:** when the full local suite fails specs that pass standalone, suspect worker contention before the code AND before "flake" — rerun with `--workers=2`; deterministic green at low parallelism is diagnostic. Never chase rotating-victim timeouts as individual page bugs, and never rule on a failure signature (cold start, contention) without an experiment that isolates the variable.
### A characterization spec that inherits the project storageState breaks CI unless it skips or overrides (2026-07-08, PATCH-015 review)
**Symptom:** the new `share-link.spec.ts` passed every local run but failed with `ENOENT: no such file ... e2e/.auth/user.json` when run without credentials — the exact configuration CI uses (blocking step, full `playwright test`, no E2E secrets). Caught in review by simulating CI (rename `user.json`, `E2E_SKIP_CREDENTIALS=1`) BEFORE the commit was pushed; CI never went red.
**Root cause:** the characterization project injects `storageState: AUTH_STATE_PATH` into every spec in its directory. Specs gated by `test.skip(!hasE2ECredentials, ...)` never construct a context, so the missing file is harmless — but a spec without the skip constructs its context eagerly and dies on the missing file, even though its flow (invalid-token → "Link not found") needs no auth at all.
**Fix:** `test.use({ storageState: { cookies: [], origins: [] } })` (dbd8691) — inline empty state overrides the file-based one; the spec runs credential-free everywhere (strictly better than skipping, since CI now actually exercises the server seam). Rule added to PATCH_REFERENCE §6.
**Reusable rule:** every spec under `e2e/characterization/` must either carry the credentials skip or override storageState inline — and any new spec claiming to run "unauthenticated" must be proven by running it once with the storage-state file absent, because locally the file always exists and hides the failure.

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
