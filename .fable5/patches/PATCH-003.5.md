# PATCH-003.5 — Operational: purge Chrome-profile credential material from all git history

**Status:** ready for owner approval + execution
**Type:** operational (`.5` numbering = operational/ops patch, no product code)
**Complexity:** medium (mechanically simple, but destructive and irreversible without the backup)
**Assigned:** **CTO executes the local git surgery; OWNER executes the GitHub steps.**
This is NEVER delegated to GPT-5.4/5.5 — history rewrites are destructive,
require owner-account access, and have no test net.
**Estimated time:** 30–45 minutes end to end.

---

## 1. Exact root cause

**What:** 10,726 committed files under `tmp/` — full Chrome browser profiles
from ~10 repo-local automation runs (`audit-toolbar-*`, `chrome-auth-minimal`,
`chrome-headless-slideshow`, `editor-*`, etc.). Verified present in history
(CTO, 2026-07-07): `Default/Login Data`, `Login Data For Account`,
`Network/Cookies`, `History`, `Account Web Data`, and **6 `Local State` files**
(each holds the AES key that encrypts that profile's passwords/cookies,
wrapped by Windows DPAPI). Also swept in: `.claude/settings.local.json`
(contains only the **public** Supabase anon key — hygiene, not a leak).

**Where:** removed from the tip in Phase 0 (`bcba8fe`, 2026-07-06) but fully
present in the history of:
- `main` (via the pre-Phase-0 "backup: snapshot" commits, e.g. `f86428c`, `f841492`)
- local tags `Backup1` (10,379 files), `backup-import-export` (10,378),
  `restore-point-before-drawing-ai-editor-close-fix` (10,378)
- local branch `agents/verify-notifications-endpoint` (10,378)
- tag `toolbar-v1-stable` is clean (0).

**How it happened:** audit scripts pointed Chrome's `user-data-dir` inside the
worktree; `tmp/` wasn't gitignored; blanket "backup: snapshot" commits swept
everything in.

**Why the GitHub push escalated it:** while the repo had no remote, this was a
dormant local risk with a safe purge window ("no remote = no force-push
needed, no server-side copies"). The 2026-07-07 push to
`github.com/ezclips/collabboard` put `main`'s full history — including the
profile material — on GitHub's servers. **Verified scope relief:** `git
ls-remote origin` shows only `refs/heads/main` — the tags and the agent branch
were never pushed. The off-machine exposure is exactly main's history; the
other refs are local-only and get cleaned in the same rewrite.

## 2. Purge procedure (git filter-repo)

Run in Git Bash from the repo root. **Stop at any ✋ checkpoint that fails.**
`git filter-repo` is NOT currently installed (verified) — Phase 0 installs it.

### Phase 0 — Preconditions

```bash
git status --porcelain          # ✋ must print NOTHING (clean worktree; commit or stash first)
git fetch origin && git status -sb   # ✋ must show: ## main...origin/main  (no ahead/behind)
git for-each-ref                # record the ref list; expect main + agents/* + 4 tags
python --version                # need Python ≥3.6
pip install git-filter-repo
git filter-repo --version       # ✋ must print a version, not "not a git command"
```

### Phase 1 — Fresh backup (the old bundle is NOT sufficient)

`../starter-pre-phase0-20260706.bundle` predates PATCH-001…003 and the doc
suite — restoring from it would lose a week of work. Make a new full backup:

```bash
git bundle create ../starter-pre-purge-20260707.bundle --all
git bundle verify ../starter-pre-purge-20260707.bundle   # ✋ must end "... is okay"
```

### Phase 2 — Record the invariant

The tip tree contains zero `tmp/` files, so the rewrite must change **history
hashes but not the checked-out content**. Capture the proof value:

```bash
git rev-parse HEAD^{tree}       # SAVE this hash — it must be IDENTICAL after the rewrite
git count-objects -vH           # note size-pack (expect a large drop after)
```

### Phase 3 — The rewrite

```bash
git filter-repo --force --invert-paths --path tmp --path .claude/settings.local.json
```

Notes: `--force` is required because this isn't a fresh clone — acceptable
only because Phase 1's bundle is verified. filter-repo rewrites **all refs**
(so the tags and the agent branch are cleaned in the same pass), then runs
reflog-expire + gc itself, and **deletes the `origin` remote config** on
purpose (to prevent an accidental push of rewritten history over the old).
The worktree and all untracked files (`.env.local`, `node_modules`, `.next`)
are untouched.

### Phase 4 — Local verification (see §3)

### Phase 5 — GitHub replacement (OWNER; see §5 for why delete-not-force-push)

```bash
# After §3 verification passes, owner on github.com:
#   ezclips/collabboard → Settings → Danger Zone → Delete this repository
#   Create NEW private repo "collabboard" — completely EMPTY (no README/license/.gitignore)
git remote add origin https://github.com/ezclips/collabboard.git
git push -u origin main
git push origin --all --tags    # this time push everything: full off-machine backup
git ls-remote origin            # ✋ expect main + agents/* + 4 tags
# THEN configure Actions secrets (§6) — deliberately after the recreate, so it's done once.
```

### Rollback

- **Before GitHub deletion:** the local repo is wrong → restore from the fresh
  bundle: `cd .. && git clone starter-pre-purge-20260707.bundle starter-restore`
  then verify and swap `.git` (or re-clone and copy untracked files over).
  The old GitHub repo still holds pre-rewrite `main` as a second recovery source.
- **After GitHub deletion:** same bundle restore, then push whichever history
  (old or purged) to the recreated repo. The bundle is the single recovery
  root — do not delete either bundle until PATCH-004 has landed on the new
  remote and been CTO-verified.

## 3. Verification — mechanical proof

All six must pass; paste real output into this file's Result section:

```bash
git log --all --oneline -- tmp                          # 1. EMPTY
git log --all --oneline -- .claude/settings.local.json  # 2. EMPTY
git rev-list --all --objects | grep -c ' tmp/'          # 3. prints 0
git rev-parse HEAD^{tree}                               # 4. EQUALS the Phase 2 hash (content untouched)
git for-each-ref                                        # 5. same refs as Phase 0 (rewritten, none lost)
npx tsc --noEmit && npm run check:boundaries            # 6. green (cheap sanity; tree is unchanged)
git count-objects -vH                                   # informational: size-pack drop
```

And after the GitHub replacement: fetching a pre-rewrite SHA from the new
remote must FAIL — `git fetch origin f86428c` → error (proves the old
history has no server-side copy in the new repo).

## 4. Credential assessment

Technical basis: Chrome encrypts `Login Data` passwords and cookies with a
per-profile AES-256-GCM key stored in `Local State`, which is itself wrapped
by **Windows DPAPI bound to the owner's Windows user account**. The committed
files contain the encrypted blobs and the wrapped key — but the DPAPI master
key lives in `%APPDATA%\Microsoft\Protect` and was never committed. Off-machine
decryption therefore requires compromising the owner's Windows account itself,
and the exposure surface is a private repo with one collaborator.

| Tier | Item | Why |
|---|---|---|
| **Definitely rotate** | — none — | No plaintext secret was committed. Passwords/cookies are DPAPI-chained (above); the Supabase service-role key was never in the repo (Phase 0 audit); `.env.local` was never tracked. |
| **Recommended** | Revoke all Supabase sessions for the e2e test user and any account that was ever signed in inside those automation profiles (Supabase dashboard → Authentication → user → sign out everywhere) | The e2e password was rotated 2026-07-06, but a password change does not reliably revoke pre-existing refresh tokens. Session revocation is free and closes the only theoretical path (a recovered cookie/refresh token). |
| **Recommended** | If the owner's personal Google or other accounts were used in any of those profiles: "sign out of all sessions" on those accounts | Same reasoning; only the owner knows which accounts were used. |
| **Unnecessary** | Supabase anon key (in `settings.local.json` history and the removed orphan component) | Public by design — it ships in every browser bundle; RLS is the security boundary. Rotating it churns every client for zero gain. |
| **Unnecessary** | Owner's Windows/personal passwords | Never stored in the repo in any form, encrypted or not. |

## 5. GitHub-side actions (why force-push is not enough)

A force-push makes old commits *unreachable* on GitHub but does **not** delete
them: they remain fetchable by SHA and visible in cached views until GitHub
garbage-collects, which users cannot trigger — GitHub's own documented
remediation is "contact Support" or delete the repository. Because this repo
is one day old (no issues, no PRs, no stars, no Actions history worth keeping,
**secrets not yet configured**), **delete-and-recreate is the guaranteed,
verifiable path** and costs nothing. Checklist:

1. Delete `ezclips/collabboard` (Settings → Danger Zone) — owner.
2. Recreate it, private, same name, empty — owner.
3. Push purged history (`--all --tags`) — CTO, §2 Phase 5.
4. Configure Actions secrets (§6) — owner. **After** the recreate, not before.
5. No forks exist (private, single collaborator) and Actions used
   `fetch-depth:1` checkouts of the clean tip, so no residual copies in CI
   caches/artifacts. Nothing else to clean.
6. Any other local clone of the old repo (other machines) must be re-cloned,
   not pulled — pulling would merge old history straight back in.

## 6. CI secrets

Required now (both consumed by `.github/workflows/ci.yml` build + smoke steps;
values are in `.env.local`):

| Secret | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `npm run build`, smoke e2e |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `npm run build`, smoke e2e |

(Both are `NEXT_PUBLIC_*` — public values embedded in the client bundle; the
secrets mechanism here is configuration hygiene, not secrecy.)

**Deliberately NOT added now:**
- `E2E_EMAIL` / `E2E_PASSWORD` — the smoke suite skips auth-dependent tests
  cleanly without them (by design). Add only when we decide to run the full
  characterization suite in CI, and then as a dedicated low-privilege test
  account. Real-user credentials in CI before that adds exposure for no signal.
- Supabase **service-role key** — never in CI, ever. Anything needing it runs
  locally against explicit owner action.

## 7. Acceptance criteria

- [ ] Fresh `--all` bundle created and verified BEFORE the rewrite
- [ ] All six §3 verifications pass with pasted output
- [ ] `HEAD^{tree}` hash identical before/after (content-preservation proof)
- [ ] Old GitHub repo deleted; new one holds ONLY purged history (pre-rewrite
      SHA fetch fails)
- [ ] `git push origin --all --tags` done — tags/branches now backed up off-machine
- [ ] Actions secrets configured on the NEW repo; first CI run checked
- [ ] Docs updated (LESSONS_LEARNED, CURRENT_TASK, CTO_PLAYBOOK, AI_WORKFLOW,
      CHANGELOG_ARCHITECTURE) — done in the same patch
- [ ] Bundles retained until PATCH-004 is landed and verified on the new remote

## 8. Result

_To be filled during execution (pasted verification output, final sizes,
new root commit hash)._
