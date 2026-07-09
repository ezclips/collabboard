# PATCH-023 — Deletion: the abandoned v1 collabboard route vertical (census-gated)

**Status:** draft (awaiting owner approval)
**Complexity:** easy (pure deletion of two directory trees + one grandfather
line; the discipline is in what must NOT be deleted alongside them)
**Assigned model:** **GPT-5.4** (per PATCH-022 §8: mechanical once the
census is bound; deletion diffs are self-evident)
**Pattern:** census-gated orphan deletion (PATCH-016 shape), route-level
variant — first deletion of ROUTED pages, authorized by the PATCH-022
Fact-1 data-census verdict below. The resulting 404s on `/collabboard/*`
URLs are an **owner-authorized behavior change**, not drift.
**Depends on:** PATCH-022 (decision brief; Option 3 verdict recorded here).
**Numbering note:** the plan's former reservations shift — scavenger
normalization becomes PATCH-024, canvas ops seam PATCH-025, strangler
series 026+. CURRENT_TASK tables updated in the same commit as this spec.

## Fact-1 data-census verdict (CTO, 2026-07-09, service-role READ-ONLY)

Executed against production via service-role key (script:
`census-v1-tables.cjs`, counts + newest timestamps; never printed the key).
All eight v1 tables from migration `001_create_collabboard_schema.sql`:

| Table | Rows | Newest | Classification |
|---|---|---|---|
| `canvases` | 1 | 2025-07-04 | owner's dev-test canvas (id `5fb6e0a5…`, empty title, icon 🎯, no owner column populated) |
| `canvas_sections` | 0 | — | empty |
| `canvas_items` | 0 | — | empty |
| `canvas_collaborators` | 0 | — | empty |
| `canvas_comments` | 4 | 2025-07-08 | owner's dev-test comments (all by r.meichtry@hotmail.com, all on canvas `5fb6e0a5…`, contents literally "Direct database test comment! 🎯" etc.) |
| `canvas_activity` | 0 | — | empty |
| `canvas_files` | — | — | table does NOT exist in the deployed DB (42P01) — schema drifted; dropped at some point |
| `canvas_presence` | 0 | — | empty |

**Verdict: zero user data.** Five rows total, all owner-created test debris
from July 2025, all hanging off one test canvas. This satisfies PATCH-022
Option 3's "empty or only owner-created test rows" condition —
**deletion of the UI vertical is authorized.** The five DB rows and the
seven surviving tables are LEFT IN PLACE (dropping tables is a migration
decision for Phase 3 / the owner; this patch contains NO migrations).

Two census discoveries that SHAPE the scope below:
1. The vertical is bigger than the brief listed: `app/collabboard/auth/*`
   contains a whole v1 auth sub-vertical (login/register/forgot-password
   pages) — nothing links to any of them; they go too.
2. The LIVE route `app/api/invitations/accept/route.ts` reads `canvases`
   and upserts `canvas_collaborators` when an invitation carries canvas
   scoping (a 2026-03-09 migration even retrofitted `workspace_id` onto
   `canvases`). Its `.in('id', validWorkspaceCanvasIds)` filter matches
   `boards` ids against `canvases` ids, so with the v1 tables empty of real
   data the block is a structural no-op. **It stays byte-untouched** —
   `app/api/**` is hard-forbidden, and "cleaning it up" is exactly the
   opportunistic fix rule 9 forbids. Recorded as a Phase-3 item.

## Pre-edit census (paste ALL output; STOP on any mismatch)
Run in **Git Bash**. Numeric gates are shell-bound (PATCH-019 Amendment 1).
```bash
# 1. The two trees to delete — EXACTLY these 18 files:
find app/collabboard -type f | sort
# expected EXACTLY:
#   app/collabboard/auth/forgot-password/page.tsx
#   app/collabboard/auth/login/page.tsx
#   app/collabboard/auth/register/page.tsx
#   app/collabboard/canvas/CanvasSetupPage.tsx
#   app/collabboard/canvas/[id]/page.tsx
#   app/collabboard/canvas/[id]/sections/[sectionId]/items/route.ts
#   app/collabboard/canvas/[id]/settings/page.tsx
#   app/collabboard/canvas/create/page.tsx
#   app/collabboard/page.tsx
find app/api/collabboard -type f | sort
# expected EXACTLY:
#   app/api/collabboard/canvases/[id]/collabborators/route.ts   <- typo'd variant EXISTS, delete it too
#   app/api/collabboard/canvases/[id]/collaborators/route.ts
#   app/api/collabboard/canvases/[id]/comments/[commentId]/replies/route.ts
#   app/api/collabboard/canvases/[id]/comments/[commentId]/route.ts
#   app/api/collabboard/canvases/[id]/comments/route.ts
#   app/api/collabboard/canvases/[id]/route.ts
#   app/api/collabboard/canvases/[id]/sections/[sectionId]/route.ts
#   app/api/collabboard/canvases/[id]/sections/route.ts
#   app/api/collabboard/canvases/route.ts
# 2. Reverse-import proof — nothing outside the trees imports from them:
grep -rn "app/collabboard" app components lib --include="*.ts" --include="*.tsx" | grep -v "^app/collabboard\|^app/api/collabboard"
# expected EXACTLY 1 line: lib/collabboard/types.ts:234 — a COMMENT
#   ("// Legacy collabboard page types (used by app/collabboard/** pages)")
#   lib/collabboard/types.ts is SHARED (CanvasClient imports it) and is NOT touched.
# 3. Route-orphan proof — nothing navigates to the vertical:
grep -rn "'/collabboard\|\"/collabboard\|\`/collabboard" app components lib --include="*.ts" --include="*.tsx" | grep -v "^app/collabboard\|^app/api/collabboard"
# expected: NO output, exit 1
grep -n "collabboard" middleware.ts
# expected: NO output, exit 1
grep -rn "collabboard" e2e --include="*.ts"
# expected EXACTLY 1 line: workspace-settings-root.spec.ts asserting the
#   TEXT "collabboard.app/" (a URL-slug label on a live page — unrelated)
# 4. Sole-consumer proofs (things that become orphans in DB/deps, both LEFT in place):
grep -rln "update_canvas_access" app components lib --include="*.ts" --include="*.tsx"
# expected EXACTLY 1 file: app/collabboard/canvas/[id]/page.tsx (its sole caller dies with it)
grep -rln "@supabase/auth-helpers-react" app components lib --include="*.ts" --include="*.tsx"
# expected EXACTLY 1 file: app/collabboard/canvas/[id]/page.tsx (package stays; no package.json changes)
# 5. Grandfather entry present:
grep -n "app/collabboard" eslint.boundaries.config.mjs
# expected EXACTLY 1 line: 'app/collabboard/canvas/\\[id\\]/page.tsx',
```
Anything more, less, or different: STOP, report, change nothing.

## Bindings
1. `git rm -r "app/collabboard" "app/api/collabboard"` — the 18 files
   above, nothing else. Empty parent directories disappear with them.
2. `eslint.boundaries.config.mjs` — LAST, delete exactly
   `'app/collabboard/canvas/\\[id\\]/page.tsx',` (grandfather 4 → 3).
3. NO other file changes. Zero modifications; only deletions + the one
   config line.

## MUST NOT touch
`app/api/invitations/accept/route.ts` (LIVE; its canvases/
canvas_collaborators block stays byte-untouched per the census note);
`components/collabboard/**` (the LIVE canvas component tree — CanvasClient
imports ~50 files from it); `lib/collabboard/**` (types shared with
CanvasClient; the stale comment on line 234 is acceptable and stays);
`package.json`/lockfile (`@supabase/auth-helpers-react` stays installed);
`supabase/migrations/**` (NO table drops — the 5 test rows and 7 tables
are a Phase-3/owner decision); `app/dashboard/**`; `middleware.ts`;
kanban anything; `.fable5/`; `.claude/`. No new dependencies.

## Characterization
NO new spec file (suite stays **27 tests / 18 files** — state it). A
permanent spec asserting 404 on a dead route has no regression value; the
net here is (a) the FULL suite green before and after deletion — proving no
live surface depended on the trees — and (b) bound post-deletion route
probes in the verification sequence below. The smoke suite's "unknown
route does not crash the server" already covers the class.

## Verification sequence (paste real output for every step)
Operational rules (PATCH_REFERENCE §6; PATCH-022 §10) — all binding:
read the dev-server startup banner port (silent :3001 fallback = STOP);
one client at a time against the dev server; board-creation failures →
DB quota check first; numeric gates shell-bound; report EVERY off-spec
line or number, whitespace included.
```bash
# Phase A — BEFORE deletion (dev server running, banner port = 3000):
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/collabboard
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/collabboard/canvas/create
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/collabboard/canvases
# no bound expectation (pages were never probed live) — RECORD the codes; they are the before-picture.

# Phase B — delete (Bindings 1), then:
find app/collabboard -type f 2>/dev/null | wc -l            # 0 (dir gone)
find app/api/collabboard -type f 2>/dev/null | wc -l        # 0 (dir gone)
grep -rn "app/collabboard" app components lib --include="*.ts" --include="*.tsx"
# expected EXACTLY 1 line: the lib/collabboard/types.ts:234 comment, unchanged
grep -rln "update_canvas_access" app components lib --include="*.ts" --include="*.tsx"
# expected: NO output, exit 1
grep -rln "@supabase/auth-helpers-react" app components lib --include="*.ts" --include="*.tsx"
# expected: NO output, exit 1
git diff --stat            # ONLY deletions (18 files) — zero modified files at this point
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/collabboard             # 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/collabboard/canvas/create # 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/collabboard/canvases  # 404
npm run test:unit          # unchanged: 76 tests / 18 files — state it
npx tsc --noEmit           # 0 errors (proves nothing imported the deleted files)

# Phase C — boundaries line removed (Bindings 2), then:
npm run check:boundaries   # green; grandfather list = 3 entries (count them)
npx playwright test --list # 27 tests in 18 files — UNCHANGED, state it
# Full suite (warm the canvas route first — board-lifecycle participates):
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/board-lifecycle.spec.ts
PW_BASE_URL=http://localhost:3000 npx playwright test
# expected: 27 passed — the SAME 27 the --list shows (1 setup + 4 smoke +
# 22 characterization). If the reported number differs, REPORT it.

# FINAL (owner stops the dev server first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"
# must print 0 — this gate and no other port check (Windows/WSL disagree)
npm run verify             # typecheck + production build + boundaries
git status --porcelain     # clean after the commit
```

## Deviation rule (binding)
Report EVERY line that differs from the bindings — including whitespace
and any gate number that comes out different. Expected deviations: **NONE**
(a pure-deletion diff has nowhere for tsc-forced lines to hide).

## Commit
ONE atomic commit (deletions + grandfather line).
  Commit message:
  chore(collabboard): delete abandoned v1 route vertical -- census-gated, zero user data (PATCH-022 verdict)

## Rollback
Single `git revert` (restores all 18 files + the config line).

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches ALL blocks (18 files exactly;
      reverse-import proof = the one comment line; route-orphan proof)
- [ ] Diff is deletions-only + the single config line — zero modified code files
- [ ] `app/api/invitations/accept/route.ts` untouched (byte-identical)
- [ ] Post-deletion probes: all three routes 404; before-codes recorded
- [ ] `npm run test:unit` 76/18 unchanged, stated
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green; grandfather list = 3 (count stated)
- [ ] `npx playwright test --list` = 27/18 UNCHANGED; full suite green
- [ ] Stopped-server gate 0; `npm run verify` green; status clean
- [ ] Single atomic commit; hash reported; every off-spec line disclosed
      (expected: none)

## Reviewer checklist (CTO or successor; §14 rituals apply)
- [ ] Re-run every gate yourself; never accept pasted output alone
- [ ] `git show --stat` = exactly 18 deletions + 1 config modification
- [ ] `git show <hash> -- app/api/invitations/accept/route.ts` = EMPTY
- [ ] `components/collabboard/**`, `lib/collabboard/**`, `package.json`,
      `supabase/migrations/**` all absent from the diff
- [ ] Grandfather re-count = 3; the remaining 3 are PostCardContent,
      FreeformPadletCards, CanvasClient (the two monolith files stay per
      PATCH-022's proxy-metric ruling — NO type-only de-linting)
- [ ] At review closeout: §7 row; CURRENT_TASK batch-5 table; health per
      §12; note the Phase-3 items (table drops incl. the 5 test rows;
      accept-route no-op block; `update_canvas_access` rpc orphaned in DB)

## Expected grandfather reduction
4 → 3 (`app/collabboard/canvas/[id]/page.tsx` deleted with its tree).
Remaining 3: PostCardContent (025 consumer), FreeformPadletCards,
CanvasClient — the monolith program.

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 023,
`{{TITLE}}` = v1 collabboard vertical deletion. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §6 first. This is a deletions-only patch:
if you find yourself EDITING any code file, stop — the only modification in
the entire diff is one line in `eslint.boundaries.config.mjs`, applied
LAST. Do not touch `app/api/invitations/accept/route.ts` even though it
references the dead tables; do not drop any DB table; do not remove any
package. Read the dev-server banner port before the curls. Paste real
output for every command; report every off-spec line or number. E2E
credentials are in `.env.local` — never print them. Final `npm run verify`
only after the owner stops the server."

## Estimated Difficulty
easy — the census is already proven against the live repo; the only trap is
scope creep into the live `components/collabboard/**` tree or "helpful"
cleanup of the accept-route's dead block.
