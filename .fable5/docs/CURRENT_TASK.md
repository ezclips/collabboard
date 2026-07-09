# Current Task

> Living document. Update at the start and end of every working session. History goes to the log at the bottom; only ONE task is "Now".

## Now

**Phase 1 — Domain Layer & Characterization Net** (opened 2026-07-06).
Work flows through numbered patches in `.fable5/patches/` designed by the CTO model
and executed by implementation models (SKILL.md).

**Last patch:** `PATCH-001` — **DONE (2026-07-07, commit 9b8bed2).** Authenticated
characterization harness + wall board lifecycle test. `npm run test:e2e` = 6 pass
with credentials; skips cleanly without. Run against a live dev server with
`PW_BASE_URL=http://localhost:3000` (never build under a running dev server).

**Last patch:** `PATCH-002` — **DONE (2026-07-07, commit a7fe12c).** Blocking UI
boundary check live: `npm run check:boundaries` (in `verify` + CI) fails on any
new `@supabase/*` import in UI code; 24 grandfathered files (shrink-only list in
`eslint.boundaries.config.mjs`). Implemented by Codex GPT-5.4; two spec defects
fixed in CTO review (glob escaping of `[id]` routes; `--no-inline-config`).

**Active patch:** `PATCH-003` (domain layer foundation: `lib/domain` skeleton —
Result, error taxonomy, branded ids, `defineCommand`, `BoardRepository`
interface, conventions, unit tests via vitest, domain-purity lint) —
**DONE (2026-07-07, commit 75d7626) — CTO review PASSED.** Domain seam open:
Result/errors/ids/defineCommand/BoardRepository + conventions + purity lint +
7 unit tests; verify chain and CI extended. Full independent re-verification
green (lockfile audit +139 vitest tree / 0 removed / 4 transitive bumps;
canary proof live).

**Last patch:** `PATCH-003.5` — **DONE (2026-07-07).** History purge executed
and proven: filter-repo across all refs (HEAD tree-identical before/after),
pack 166 → 38.8 MiB, GitHub repo deleted + recreated with purged history only
(pre-rewrite SHA fetch fails), all branches/tags pushed. Remaining owner
follow-ups: Actions secrets (below), recommended Supabase session revocation
(PATCH-003.5 §4). Bundles retained until PATCH-004 verified on new remote.
**All commit hashes changed** — hashes in docs older than this line refer to
pre-rewrite history; map via commit messages if needed.

**Last patch:** `PATCH-004` — **DONE (2026-07-07, commit `5278468`) — CTO
review PASSED.** First extraction landed: accessibility settings page on the
domain/infra seam (repository read + `settings.saveAccessibility` command);
grandfather list **24 → 23**; unit tests 7 → 14; new page-level
characterization spec in the e2e net. Two spec contradictions en route (both
CTO's, both correctly blocked by GPT-5.5 — Amendments 1+2 in the patch file).
**PATCH-004 is now the canonical extraction example** (AI_WORKFLOW): similar
single-table extractions go to GPT-5.4 with it as reference; joins/storage/
realtime/cross-page pages still go to GPT-5.5. Note: owner must RESTART the
dev server (CTO stopped it and cleaned `.next` during review — see
LESSONS_LEARNED netstat-locale record).

**Next: extraction batch PATCH-005 → 009 — DRAFTED (2026-07-07), awaiting
owner approval.** All GPT-5.4, all bound to the PATCH-004 template, executed
strictly in sequence (one at a time, CTO review between). Grandfather
trajectory 23 → 17:

| Patch | Target | Shape | Shrink |
|---|---|---|---|
| 005 | notifications page | purest 004 clone (`maybeSingle` variant) | 23→22 ✅ **DONE** (06e40b4, review PASSED; e2e net race fixed in 8636bd1) |
| 006 | ai + preferences pages | dead Supabase client removal (verified unused) | 22→20 ✅ **DONE** (b813ce9, review PASSED; blank-line residue cleaned 61d54dc; executed by Gemini 3.1 Pro) |
| 007 | logs page | auth-only; adds shared `getCurrentUser` (id+email) helper | 20→19 ✅ **DONE** (9f0a72d, review PASSED) |
| 008 | achievements page | read-only repository variant (no command) | 19→18 ✅ **DONE** (7ba48e2; message-only amend from 1b3c49c, review PASSED) |
| 009 | dashboard page | two repositories + joined read | 18→17 ✅ **DONE** (42e593f, review PASSED; Amendment 1 honored exactly; toast-honesty deviation formally accepted) |

**Second batch PATCH-010 → 015 — DRAFTED (2026-07-07), awaiting owner
approval.** All GPT-5.4, strictly sequential after 005–009 complete.
Grandfather trajectory 17 → 10:

| Patch | Target | Pattern | Shrink |
|---|---|---|---|
| 010 | CanvasModals + OverlayLayer | type-only `AuthUser` swap (new) | 17→15 ✅ **DONE** (743d719, review PASSED; Amendment 1 scope confirmed exact) |
| 011 | ProtectedRoute | F: auth-state observer (new; adds `authState.ts` helper incl. signOut) | 15→14 ✅ **DONE** (e56bc5a, review PASSED; Pattern F entered into catalog, verified) |
| 012 | Navbar | F repetition (session-state mapping, census-gated) | 14→13 ✅ **DONE** (2a3ff44, review PASSED; Amendment 1a corrected proof re-verified by CTO before resume; orphaned-component scope held) |
| 013 | app/page.tsx (landing) | F repetition (+ first signOut consumer; event branches preserved) | 13→12 ✅ **DONE** (7c290f2, review PASSED; subscription leak fixed — old code returned cleanup from async fn, new code hoists unsubscribe correctly) |
| 014 | delete-account page | C (+ signOut); **exclusion reversed** — re-census proved deletion is server-side, client is a form + fetch; `app/api/**` hard-forbidden | 12→11 ✅ **DONE** (7726215, review PASSED; Amendments 1+2 both held, no behavior change; hydration-acknowledged verify click validated green) |
| 015 | share/[token] (server page) | G: server-page read (new; adds `serverClient.ts` — first server seam) | 11→10 ✅ **DONE** (6672c12 + review fix dbd8691; review PASSED; Pattern G in catalog §5.7) |

**Batch 010–015 COMPLETE (2026-07-08): grandfather 17→10 as planned.**

## Remaining-10 classification (CTO census 2026-07-08 — supersedes the old "Still EXCLUDED" notes)

**A. Mechanical now (GPT-5.4 with bound specs):**
- `components/canvas/AddPadletMenu.tsx` (372) — **ORPHAN, zero importers**
  (verified across ts/tsx/js/jsx in app/components/lib). Deletion, not
  extraction: keeping it compiling would need two seams (storage + canvas
  write) that don't exist yet, for unmounted code. → PATCH-016 (drafted).
- `app/dashboard/settings/page.tsx` (357) — `workspace_settings` ×3 +
  `workspaces` ×1 + avatars storage upload/getPublicUrl ×2 + one API fetch.
  Introduces the **storage seam (queued Pattern H)** on the smallest storage
  consumer. → PATCH-017.

**B. Fable-spec required, then delegable:**
- `app/dashboard/settings/profile/page.tsx` (861) — `profiles` ×3, avatars
  storage (H repetition), reauth (`signInWithPassword` + `updateUser`), and
  a **token-scavenger**: scans ALL of localStorage for anything shaped like
  an access token, builds a bespoke `createClient(...Bearer token...)`,
  decodes JWTs by hand. Extraction PRESERVES the scavenger centralized in
  one audited legacy helper (serverClient precedent); replacing it is
  PATCH-023's authorized behavior change, not this. → PATCH-018 (GPT-5.4).
- `app/dashboard/settings/integrations/page.tsx` (287) — same scavenger
  (verbatim copy) + `getSession`/`refreshSession` before OAuth connect.
  Reuses 018's helper. → PATCH-019 (GPT-5.4).
- `app/dashboard/settings/password/page.tsx` (505) — reauth + `updateUser`
  + **6 MFA calls incl. `mfa.webauthn.register/authenticate`** + one
  `profiles` site. Security-critical; needs a verbatim-bound
  `lib/infra/supabase/mfa.ts`. → PATCH-020 (**GPT-5.5**, security trigger).
- `app/dashboard/settings/members/page.tsx` (1,817) — `workspace_members`
  ×3, `workspace_invitations` ×3, `boards` ×1, auth ×4, two invitation API
  fetches. Pattern E at scale. → PATCH-021 (**GPT-5.5**).

**C. Monolith-risk (Phase 2 program — NOT mechanical extractions):**
- `app/dashboard/canvas/[id]/CanvasClient.tsx` (8,526) — 10× `padlets`,
  2× storage, 3 auth calls. The strangler target itself.
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx` (6,368) —
  **sole importer is CanvasClient**: a monolith limb despite the collabboard
  path (the directory lies). Never extract independently; rides the
  strangler.
- `components/collabboard/PostCardContent.tsx` (936) — **22 importers across
  BOTH canvas stacks** (wall/columns layouts, presentation, map). One write:
  task-checkbox toggle updating `padlets`. First consumer of the future
  canvas ops seam; blast radius too high for a one-off command.
- `app/collabboard/canvas/[id]/page.tsx` (871) — one
  `rpc('update_canvas_access')`; **no active-app link navigates to
  /collabboard** (URL-reachable only). Gated by the surviving-canvas
  decision: likely DELETED, not extracted. Decision brief before any work.

## Batch plan (drafted 2026-07-08; owner approval per patch as usual)

**Batch 3 — settings completion + storage seam (016–019), grandfather 10→6:**
| Patch | Target | Shape | Shrink | Model | Spec status |
|---|---|---|---|---|---|
| 016 | AddPadletMenu | orphan deletion, census-gated | 10→9 | GPT-5.4 | ✅ **DONE** (0a2d372, review PASSED) |
| 017 | settings-root | Pattern H intro (storage gateway, verbatim-bound) + workspace-settings repos + `settings.saveWorkspace` command | 9→8 | GPT-5.4 | ✅ **DONE** (ff84152, review PASSED; Amendment 1 held; Pattern H in catalog §5.8) |
| 018 | profile | H reuse (gateway class over legacy client) + profiles repo + `profile.savePatch` command + `legacyToken.ts` quarantine (scavenger moved verbatim) | 8→7 | GPT-5.4 | ✅ **DONE** (8872c2e, review PASSED; Pattern I in catalog §5.9; zod v4 compat fix accepted) |
| 019 | integrations | Pattern I reuse: deep-scan pair moves verbatim into `legacyToken.ts` + `resolveLegacySessionToken` cascade (getSession → refreshSession → deep scan, order preserved) | 7→6 | GPT-5.4 | ✅ **DONE** (287f0ca, review PASSED; Amendment 1 line-count gate held; Amendment 2 test-count corrected 22→24, CTO arithmetic error not a regression; **batch 016–019 complete**) |

Dependencies: 016 independent; 017 → 018 → 019 strictly sequential (018
introduces the legacy-token helper that 019 reuses; both storage consumers
follow 017's Pattern H).

**Batch 4 — security-sensitive settings (020–021), grandfather 6→4:**
| Patch | Target | Shape | Shrink | Model | Spec status |
|---|---|---|---|---|---|
| 020 | password | auth-security swap: nine call sites behind a raw-passthrough `passwordSecurity.ts` facade (5 MFA/webauthn + getUser/reauth/updateUser + profiles-email fallback); page's duplicate scavenger+JWT-decode helpers DELETED and re-imported from the quarantine (byte-compared) | 6→5 | GPT-5.5 | ✅ **DONE** (1eb0e2c, review PASSED; Amendment 3 AAL-badge assertion held; Pattern J in catalog §5.10) |
| 021 | members | raw-passthrough CRUD facade (`workspaceMembers.ts`, 10 functions covering 13 raw touches: workspace_members select/update/delete, workspace_invitations select/update/delete, boards select, getUser×2, getSession×2, resolveCurrentWorkspace×2 reused thin); `User` type import replaced by narrow `MembersPageUser`; API fetches untouched | 5→4 | GPT-5.5 | ✅ **DONE** (ea03671, review PASSED; Amendments 4–6 all held; Pattern J extended to table CRUD, §5.10; **batch 020–021 complete**) |

**Batch 5 — canvas program (022+; Phase 2 entry; NOT mechanical):**
| Patch | Target | Shape | Model |
|---|---|---|---|
| 022 | canvas duality DECISION brief | CTO brief → owner | ✅ **DELIVERED — `patches/PATCH-022.md`** (2026-07-09; measured census; recommendation: Option 3 — owner runs 3 read-only SQL queries on `canvases`/`canvas_sections`, delete the nav-orphaned collabboard vertical if empty; proxy-metric trap recorded: NO type-only de-linting of the two monolith files) |
| 023 | security normalization — **authorized behavior change**: replace token-scavenger with real session reads; revisit share-link service-role→RLS | GPT-5.5 | Fable spec |
| 024 | canvas ops seam (lib/domain/canvas: `padlets` repository + FIRST canvas command `canvas.toggleTask`); first consumer = PostCardContent's single write site (22 importers, component returned identical) | GPT-5.5 | Fable design by 07-12 — per 022 brief, does NOT wait on the Fact-A verdict (only census arithmetic changes) |
| 025+ | CanvasClient strangler series — grouped by table+operation (60 `padlets` + 6 `board_sections` + 4 `boards` sites, 2 storage, 3 auth incl. `auth.updateUser` at L263); FreeformPadletCards LAST (22 `padlets` sites, same ops); realtime/presence CTO-only, undesigned | per-group, GPT-5.5 first group | Fable site-map by 07-12 (successor inheritance artifact) |

**Fable-window critical path (closes 2026-07-12).** In priority order:
① specs 017–019 (unblocks GPT-5.4 for the whole of batch 3), ② specs
020–021, ③ duality decision brief (022), ④ canvas ops seam design + the
CanvasClient call-site map (024/025 prerequisites). Everything on this list
is DESIGN — implementation and post-window reviews run on GPT-5.4/5.5
against these specs using the per-patch acceptance checklists +
CTO_PLAYBOOK §12/§14.

**Security flag (recorded 2026-07-08, feeds 023):** profile + integrations
scan all of localStorage for access tokens and hand-decode JWTs
(`getAccessTokenFromStorage`/`findAccessTokenDeep`, duplicated in both
files). Extraction preserves it (centralized + audited); 023 removes it.
**Addendum (PATCH-017 authoring):** settings-root has a THIRD, narrower
variant (`getAccessToken`, keys filtered by 'auth-token', + 2 manual atob
JWT decodes for userId). PATCH-017 freezes it byte-identical in the page
(seam calls take its outputs as arguments); 023's inventory is now three
pages, three scavenger variants.
**Addendum 2 (PATCH-017 Amendment 1, 2026-07-09):** CTO-reproduced — the
settings-root page is UNUSABLE for cookie-session users: its scavenger
reads localStorage, but the auth-helpers login stores the session only in
the `sb-…-auth-token` cookie (e2e probe: localStorage `[]`, guard fails,
"Not authenticated" toast, no API/Supabase call ever fires). 023 is
therefore a FUNCTIONAL REPAIR for this page, not just security hygiene.
Check whether profile/integrations' deep-scan variants hit the same wall
when authoring PATCH-018/019 — their specs must probe first (lesson
updated: dry-run covers characterization assertions).
**Addendum 3 (PATCH-018 authoring, 2026-07-09):** inventory CORRECTED by
full-file read — profile does NOT have the deep-scan variant; it has the
NARROW `getAccessToken` (same 'auth-token' key filter as settings-root)
plus a robust base64url `decodeJwtPayload` and the bespoke
`makeAuthedClient` Bearer client. Only INTEGRATIONS has the deep scan
(`getAccessTokenFromStorage`/`findAccessTokenDeep`). CTO probe confirmed
profile hits the same cookie-only wall (toast, defaults-only form, zero
network). 023 inventory: settings-root (narrow, frozen in-page),
profile → `lib/infra/supabase/legacyToken.ts` (narrow + JWT decode +
Bearer client, after 018), integrations (deep scan — 019 decides whether
its variant joins legacyToken.ts verbatim or stays in-page).
**Addendum 4 (PATCH-020 authoring, 2026-07-09):** the PASSWORD page holds a
FOURTH copy — byte-identical (modulo `export`) duplicates of the quarantine's
narrow `getAccessToken` and `decodeJwtPayload` (return annotation narrower
but supertype-compatible). PATCH-020 DELETES both duplicates and re-imports
from the quarantine, so 023's removal inventory gains one more consumer but
NO new variant (still three variants total). Cookie-only impact differs
here: the page WORKS for cookie users (`getUser` succeeds), but
`emitSecurityNotification` silently no-ops for them (scavenger returns
null → no security email) — an existing defect 023 must fix, preserved
verbatim by 020.

Dependencies: 011←010; 012/013/014←011; 015 independent (runs last for
novelty, not dependency). New patterns (type-swap, F, G) enter
PATCH_REFERENCE at each review, per the catalog's reviewed-reference rule.

Still EXCLUDED (GPT-5.5 ± security review, later): password (auth.updateUser
+ MFA ×6), integrations (getSession/refreshSession token semantics), profile
+ settings-root (storage uploads), members (1,817 lines, invitations/roles),
PostCardContent (real canvas write — belongs to the ops-migration path, not
a one-off command), AddPadletMenu (storage + canvas writes), the two canvas
pages (the monolith itself).

**Prerequisite `PATCH-002.1`: DONE (2026-07-07, commit b5698b5) — CTO review
PASSED.** react/react-dom 19.1.0 → 19.2.7; lockfile audit clean (3 expected
changes only); install idempotent; vitest dry-run exit 0; typecheck 0;
boundaries green; dev server restarted; **e2e net 6/6 green on React 19.2.**
Two warning families remain as classified debt (typescript-eslint peer-lag →
lint-overhaul patch; react-twitter-embed React-19 peers → embed/dependency
review).

**Delegation lesson (2026-07-07):** Codex implemented faithfully but skipped the
spec's verification and commit steps. Future delegation prompts must state:
"run every verification command and paste real output; the patch is not done
until the commit exists."

**Backlog from PATCH-005 review:** memoize the browser Supabase client
(`browserClient.ts` returns a new client per call → "Multiple GoTrueClient
instances" console warning). One-line micro-patch, queue after the current
batches.

**Backlog from PATCH-001 execution:**
- Deferred: standalone post-delete e2e step (wall context-menu a11y/selectors).
- a11y: sidebar tools + post cards are non-semantic `<div onClick>` — first
  concrete ACCESSIBILITY.md burn-down item.
- Hygiene: more backup files in `app/dashboard/create-canvas/` to sweep.
- e2e board quota: cleanup must hard-delete or use a high-limit test account.

**Completed urgent patch (2026-07-07):** auth sign-in path redesign — password login
is now client-primary with `/api/auth/login` used for app-level lockout preflight
and success/failure bookkeeping. This avoids all users sharing the server egress IP
against Supabase's per-IP auth limit. Follow-up: remove the legacy password-proxy
branch after a short soak (see CHANGELOG_ARCHITECTURE.md 2026-07-07).

**E2E credentials:** test user exists; `E2E_EMAIL` / `E2E_PASSWORD` are set in
`.env.local` — PATCH-001 owner pre-work is DONE.

### Phase 0 carried items (do not block PATCH-001)

1. **Finish migration baseline** — blocked on Docker + DB password. Procedure documented in `supabase/BASELINE.md`. Until done, `supabase/baseline/schema_snapshot_2026-07-05.sql` is the schema reference.
2. **Git history purge (decision needed)** — `tmp/` Chrome profiles (Login Data, Cookies, third-party session storage; 10,726 files) are removed from tip but remain in git history. Repo has NO remote, so `git filter-repo --path tmp --invert-paths` is feasible and recommended. Full pre-purge backup exists: `c:/Users/rmeic/Projects/dev/starter-pre-phase0-20260706.bundle` (165 MB). **User approval required** — rewrites all commit hashes.
3. **Telemetry** — Sentry + web-vitals RUM + `board_open_ms` not yet added (SYSTEM_DESIGN.md §7).
4. **dhtmlx licensing decision** — still open (SECURITY.md §4).
5. **Lint burn-down** — 5,426 errors (mostly `no-explicit-any`, unused vars). Lint is decoupled from build (`next.config.ts eslint.ignoreDuringBuilds`) and advisory in CI. Remove the bypass when it reaches zero.
6. **Push to a remote** — CI workflow (`.github/workflows/ci.yml`) is inert until the repo has a GitHub remote. Also: only backup is one local bundle; an off-machine remote is the real fix.

### Phase 0 completed (2026-07-06)

- WIP work committed (`326bd09`), .fable5 docs committed (`1bb4c5a`).
- Hygiene: removed committed Chrome profiles/logs/artifacts (`bcba8fe`), backup copies + dead files (`7b1ed14`), root dev scripts (`edcd1fd`), Kopie CSS + component copies, orphan `CommentsPanel.jsx` with hardcoded anon key, debug routes (`/debug-db`, `/api/test`, `/api/test-db`); untracked `.claude/settings.local.json`; hardened `.gitignore`.
- DB: root SQL archived to `supabase/legacy/`, single snapshot kept at `supabase/baseline/`, `supabase/BASELINE.md` written.
- **Production build fixed** (was broken): lint decoupled, three `useSearchParams` pages wrapped in Suspense.
- Typecheck: **0 errors** (old tsc_output files were stale).
- Gates: `npm run typecheck` / `verify` / `test:e2e`; CI workflow ready; **4 Playwright smoke tests passing** against the production build (`e2e/smoke.spec.ts`).

## Blocked / Decisions Needed

| Decision | Owner | Needed by | Notes |
|---|---|---|---|
| Configure GitHub Actions secrets (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | User | **Now** (repo recreated; do once) | PATCH-003.5 §6; E2E creds deliberately NOT added to CI |
| Revoke Supabase sessions for e2e user + any account used in the old automation profiles | User | Soon (recommended, not blocking) | PATCH-003.5 §4 — "sign out everywhere"; kills refresh tokens that survive password changes |
| Approve PATCH-004 delegation to GPT-5.5 | User | Next | Patch drafted + approved-to-draft; ready for handoff |
| dhtmlx buy-vs-replace | User | Phase 0 exit | GPL exposure; recommendation: replace |
| Surviving canvas system | CTO | Phase 1 | Needs feature diff first |
| Raise Supabase sign-in limit 30→100/5min (dev convenience + school-NAT headroom) | User | Anytime (dashboard, 1 min) | Auth → Rate Limits |
| Configure custom SMTP (email limit is 2/h on built-in) | User | Before ANY beta/invites | Breaks signup/reset/invites beyond 2 users/h |
**Resolved decisions:** remote repository — DONE 2026-07-07 (private
`github.com/ezclips/collabboard`, `origin/main` in sync); branch question —
resolved by the push, default is `main` (was `master`); Gemini 3.1 Pro
roster — RESOLVED 2026-07-07: experimental implementer, trivial/easy
mechanical patches only (deletion-only cleanup, shallow characterization),
no architecture-bearing extractions without explicit per-patch approval;
GPT-5.4 stays the preferred economical Pattern A implementer (AI_WORKFLOW).

## Context for a Fresh Session

- Read `.fable5/CLAUDE.md` first, then this file.
- Default branch is `main`, tracking `origin/main`
  (`github.com/ezclips/collabboard`, private). Keep it pushed.
- `npm run verify` = typecheck + build; `npm run test:e2e` = smoke suite (builds must exist: run build first or let webServer reuse).
- Comment storage split (`metadata.comments` / `detachedComments` / `canvas_comments`) is a planned Phase 3 migration — do not fix opportunistically.
- Excalidraw fork has its own `node_modules` committed (major repo bloat); handle carefully in a later phase — it backs a `file:` dependency.

## Log

- **2026-07-09** — PATCH-022 DECISION BRIEF delivered
  (`patches/PATCH-022.md`) — the batch-5 strategy document, every number
  measured against the repo this session. Key findings that CORRECT the
  standing framing: (1) the "two canvas systems" are really three facts —
  a NAV-ORPHANED route vertical (`app/collabboard/**`, own dead
  `canvases`/`canvas_sections` schema, nothing links to it anywhere),
  per-FILE duplication (three `CanvasSetupPage` copies + debris), and the
  monolith itself (CanvasClient 8,526 + FreeformPadletCards 6,368, ~92
  raw call sites on live tables — 60+22 `padlets`, 6 `board_sections`, 4
  `boards`, 2 storage, 3 auth incl. an `auth.updateUser` from inside the
  canvas). `components/canvas/*` is NOT a rival engine — the live
  CanvasClient imports 8 files from it alongside ~50 collabboard-tree
  components; "kill one tree" was never a coherent option. (2) **Proxy-
  metric trap:** both monolith files' only `@supabase/*` imports are TYPE
  imports; their call sites ride `@/lib/supabase/browser`, which the
  boundary lint does not ban — a §5.5 type-swap would de-lint both files
  while extracting NOTHING. Brief demotes the grandfather count to proxy
  for these two files and forbids type-only de-linting; lint gets extended
  to ban the internal alias once consumers are extracted. (3) Kanban is
  ACTIVELY developed (dozens of 2026-02 migrations) — out of scope, owner
  coordination required before touching. Recommendation: Option 3 — owner
  runs three read-only SQL queries on `canvases`/`canvas_sections`; if
  empty (expected), a GPT-5.4 PATCH-016-shaped deletion patch removes the
  vertical (grandfather 4→3); if data exists, freeze until Phase 3
  data-migration. PATCH-024 (ops seam: `padlets` repository + first
  domain command `canvas.toggleTask`, consumer = PostCardContent's single
  write, 22 importers) proceeds regardless of the verdict. Canvas
  characterization note: canvas mutations ARE e2e-safe (e2e account owns
  its boards), so the 020/021 untestable-surface GPT-5.5 argument mostly
  does not apply — the risk shifts to diff volume; model table in the
  brief. All nine standing operational lessons bound as §10 of the brief.
  NO Codex-ready patch authorized; the data census gates everything.
- **2026-07-09** — PATCH-021 landed and reviewed: PASSED (commit `ea03671`).
  Grandfather 5→4 — **batch 020–021 complete**. All gates independently
  re-run: page diff is exactly the bound import swap, the `MembersPageUser`
  type substitution, and all thirteen call-site swaps; `RoleDropdown`,
  both list-item interfaces, every modal, and all rendering untouched;
  `lib/workspace/context.ts` diff EMPTY (the review's highest-value single
  check); `workspaceMembers.ts` byte-identical to the Amendment-5-corrected
  binding, all five mutation/side-effect wrappers scrutinized line-by-line;
  boundaries diff is the single named line, list re-counted at 4; e2e spec
  matches the Amendment-4-corrected bindings exactly, zero clicks on any
  mutating control. Vitest 76/18 unchanged, tsc clean, boundaries clean,
  `playwright --list` → 27 tests/18 files exactly as predicted, every
  post-edit grep exact including the Amendment-6-corrected
  `workspaceMembers` count of 4. Both reported deviations (standalone
  setup-project count, cold-server auth.setup timeout then warm rerun)
  independently verified as non-issues, consistent with prior-patch
  precedent. One MINOR undisclosed deviation found and accepted: two
  whitespace-only blank-line insertions plus a stripped trailing EOF blank
  line — zero behavior effect, almost certainly editor autosave, but not
  disclosed per the standing rule; recorded as a disclosure-gap recurrence
  in LESSONS_LEARNED (same acceptance class as PATCH-018's undisclosed
  cast). Pattern J (§5.10) extended from auth/MFA-only to plain table CRUD;
  four new "Common mistakes" entries folded into the catalog (block-comment
  globs, vendor nullability copying, pre-edit-count gate arithmetic,
  table-shape locator scoping). Health held at 74 (safety/architecture at
  the 20/20 ceiling; ops/product/continuity untouched, unmoved for six
  consecutive patches — the queued e2e-infra sweep or telemetry work is the
  only path to further movement). PATCH_REFERENCE §7 row + §5.10 extension
  committed. **Remaining grandfathered files (4): PostCardContent,
  FreeformPadletCards, CanvasClient, collabboard canvas page — all
  batch-5/canvas-program territory; next up per the standing plan is
  PATCH-022, a CTO decision brief (canvas duality), not a GPT-5.4/5.5
  delegation.**
- **2026-07-09** — PATCH-021 Amendment 6: GPT-5.5 stopped correctly at the
  post-edit grep gate (tsc green, nothing committed) — the spec expected
  `grep -c "workspaceMembers"` = 1, faithful implementation prints 4.
  CTO-reproduced against HEAD: the PRE-edit page already has 3 lines with
  that substring — the destructured local `workspaceMembers` variable in
  `loadMembers` (old L263/L273/L288), which §2's own binding keeps
  verbatim — plus the new import = 4. The gate was authored by counting
  only the new import, never dry-running the pattern against the pre-edit
  file; same substring-collision family as PATCH-020's supabase-in-path
  gate, this time with a pre-existing local identifier. Gate rebound to 4;
  ALL other post-edit gates sweep-verified against the pre-edit file in
  the same amendment (MembersPageUser 0→2, resolveWorkspaceForUser 0→3,
  deletions 1/2/4→0, fetches 2→2 — only this one was defective). Worktree
  ruling: KEEP the uncommitted implementation, resume from the
  implementation census/grep gates — tsc and Phase A/B passes stand. New
  authoring rule: every post-edit count gate = measured pre-edit count +
  bound additions − bound deletions; never assume a new identifier's
  pre-edit count is zero.
- **2026-07-09** — PATCH-021 Amendment 5: GPT-5.5 stopped mid-implementation
  (nothing committed) on two tsc failures, BOTH in CTO-bound text. (1) The
  bound facade block comment said "outside `app/**/components/**`" — the
  `*/` inside that glob terminates the block comment and TypeScript parsed
  `components` as code (TS2304); reworded to "outside the app/ and
  components/ trees", no glob. (2) `MembersPageUser.email` was bound
  `string | null`; the installed vendor type is `User.email?: string`
  (undefined, never null) — three call sites failed exactly as predicted
  (setState with raw User, the authData.user reassignment, and
  `resolveWorkspaceForUser` whose param is `Pick<User,'id'|'email'>` by
  construction). Ruled option (a): `email?: string`, matching the vendor
  exactly — every page read of `.email` is nullish-agnostic (`|| ''`,
  `?.`), so no behavior distinction exists and no conversion code is
  warranted. The corrected binding was COMPILE-VERIFIED before committing
  the amendment (scratch file exercising all three failing assignments
  against the real installed `User` type; `tsc --strict` clean) — the
  missing verification class that caused the blocker. Codex's STOP-on-cast
  was the spec's own rule working as designed (third confirmation).
  Worktree ruling: KEEP the uncommitted implementation and patch the two
  spots in place; verification resumes from `npx tsc --noEmit`; the
  mid-implementation characterization "heading not found" is DOWNSTREAM of
  the compile errors, not a Phase A issue (Phase A on the OLD page passed
  post-Amendment-4 and stands). New authoring rule recorded: census
  dry-runs cover commands and probes cover assertions, but bound TS files
  must ALSO be compile-checked at authoring — and bound block comments are
  code (scan for `*/`; globs are the classic carrier).
- **2026-07-09** — PATCH-021 Amendment 4 (spec-reviewer ruling): GPT-5.5
  blocked correctly at Phase A — `page.locator('table tbody tr')` expected
  0 rows, got 1 (the e2e account's own owner row). Root cause: the
  pending-invitations section renders NO `<table>` at all when empty (a
  text message instead), while the members section is an UNCONDITIONAL
  `<table>` — with zero invitations and one member, the page's only table
  in the DOM is the members table, so the unscoped locator could only ever
  measure that one. My own probe script ran the same unscoped locator and
  printed its result under the label `"table rows (invitations)"` — the
  count (1) was correct, the label was my unverified assumption, and I
  never reconciled it against the separately-confirmed empty-invitations
  text. Assertion corrected to a POSITIVE, section-scoped count of 1 for
  the members table; the already-generated (uncommitted) spec file is kept
  and amended in place, not regenerated — only one locator needed
  correction. Codex/GPT-5.5 may resume Phase A. New reusable rule: an
  unscoped DOM locator's result means only what its selector says, never
  what a probe script's variable name claims — verify the label against
  the page structure, not the other way around.
- **2026-07-09** — PATCH-021 AUTHORED (handoff-ready; **GPT-5.5 REQUIRED**,
  ruling: five of the ten new facade functions wrap real mutations or feed
  a real side effect — `updateMemberRole`, `removeWorkspaceMember`,
  `updateInvitation`, `deleteInvitation`, and `getCurrentAuthSession`
  feeding the real invite-creation/invite-email API calls — more
  untestable-mutation density than PATCH-020's five MFA calls, so the same
  Pattern-J-derived ruling applies; GPT-5.4 only as owner-authorized
  fallback). Full 1,817-line page read; census dry-run-verified (thirteen
  raw Supabase touches — 4 auth calls, 2 `resolveCurrentWorkspace(supabase,
  ...)` calls, 7 table calls across workspace_members/workspace_invitations/
  boards — condensed into ten facade functions, three of which are each
  reused across two call sites). The page's grandfather trigger is narrower
  than expected: only the `import type { User } from '@supabase/supabase-js'`
  line violates the boundary lint — `useSupabase()` itself is an internal
  `@/lib/supabase` alias and already passes lint — but the architectural
  goal (no direct Supabase access from any page component) still requires
  moving all thirteen touches into infra, so the full extraction proceeds
  regardless. `User` replaced by a narrow local `MembersPageUser` interface
  covering exactly the five fields the page reads (grepped exhaustively:
  `id`, `email`, `user_metadata.display_name`, `user_metadata.avatar_url`,
  `created_at`). `resolveWorkspaceForUser`'s parameter type is derived with
  `Parameters<typeof resolveCurrentWorkspace>[1]` specifically so it cannot
  drift from the real signature; `lib/workspace/context.ts` itself — already
  outside the boundary lint's scope and shared by other pages — is
  explicitly bound as untouched, with the reviewer checklist naming it the
  single highest-value diff check. Characterization PROBED against the OLD
  page: the e2e account is its workspace's sole OWNER with zero pending
  invitations (cookie session satisfies `getUser` directly, same as
  integrations — no scavenger wall). Two probe corrections during authoring:
  a bare `getByRole('heading', {name:'Members'})` collides with an unrelated
  second "Members" heading elsewhere on the settings shell (disambiguated
  with `level: 1`, not `.first()`, since level is the real distinguishing
  property); and the owner's own-row "You" badge is visually `YOU` via a
  Tailwind `uppercase` class exactly like PATCH-020 Amendment 3's AAL badge —
  caught THIS TIME during authoring (not after a Phase A failure) by
  applying the freshly-recorded lesson proactively, and bound correctly as
  `getByText('You', {exact:true})` from the start. The one characterization
  test is read-only by necessity: every other interaction on this page is a
  real mutation or a real email send, so nothing else is safe to assert
  without an authorized behavior-change patch. Full-suite arithmetic stated
  explicitly (26 + 1 = 27 in 18 files, reconfirmed live via
  `playwright --list` before authoring). One operational note: my own probe
  server left a lingering :3000 listener the auto-mode safety classifier
  correctly refused to let me kill without stronger attribution — flagged
  for owner cleanup rather than worked around.
- **2026-07-09** — PATCH-020 landed and reviewed: PASSED (commit `1eb0e2c`).
  Grandfather 6→5. All gates independently re-run: page diff is exactly
  the bound import swap, two deleted helper defs, deleted client line, nine
  call-site swaps, and the `[supabase.auth.mfa]` → `[]` dep-array change;
  `passwordSecurity.ts` is byte-identical to the spec's whole-file binding
  (9 one-line raw-passthrough wrappers, zero `await`/destructuring/error
  mapping inside the facade); `legacyToken.ts` diff is the single bound
  comment sentence, zero code; boundaries diff is the single named line,
  list re-counted at 5. e2e spec matches the Amendment-3-corrected bindings
  byte-for-byte (`aal1`, not `AAL1`); never clicks Reset-by-email/Add
  passkey/Verify session/Remove. Vitest 76/18 unchanged, tsc clean,
  boundaries clean, `playwright --list` → 26 tests/17 files exactly as the
  spec's arithmetic predicted. The reported 3-vs-2 standalone-run count was
  independently reproduced and is Playwright's `[setup]` project running as
  a dependency of any characterization-file invocation (1 setup + 2 bound
  password tests = 3) — not a spec issue, no amendment needed. Both port
  3000 and 3001 confirmed at 0 listeners post-verification. **New pattern
  catalogued: Pattern J — raw-passthrough auth/MFA facade (§5.10)**, with
  its defining risk documented (untestable calls mean diff fidelity is the
  only net) and the two probe/grep mistakes this patch surfaced folded into
  the pattern's "Common mistakes" so future authors don't re-derive them.
  Health held at 74 (CTO_PLAYBOOK §12 — safety and architecture remain at
  their 20/20 per-axis ceiling per the PATCH-019 ruling, so neither the new
  pattern nor the correct high-risk model assignment can move them further;
  ops/product/continuity untouched by this patch, still the binding
  constraint). PATCH_REFERENCE §7 row + §5.10 added.
- **2026-07-09** — PATCH-020 Amendment 3 (spec-reviewer ruling, Fable
  unavailable): GPT-5.5 blocked correctly at Phase A — bound assertion
  `getByText(/Current session: AAL1/)` found nothing; actual DOM text is
  `aal1`. Root cause: the badge carries a Tailwind `uppercase` CSS class
  (visual `text-transform` only); the original probe read it with
  `.innerText()`, which is layout-aware and reflects the CSS-painted
  casing, while the spec's `getByText()` matches raw text content, which
  CSS does not alter — two tools disagreeing on "the text" for the same
  element, same defect family as PATCH-019 Amendment 1 (two tools, two
  values, same underlying bytes) applied to rendered text instead of a
  line count. Assertion corrected to `aal1`; no page behavior changed;
  Codex/GPT-5.5 may resume Phase A. New reusable rule recorded in
  LESSONS_LEARNED: probe with `getByText`/`textContent`, not `.innerText()`,
  whenever the assertion tool will be `getByText` — the two do not agree
  on CSS-transformed elements.
- **2026-07-09** — PATCH-020 AUTHORED (handoff-ready; **GPT-5.5 REQUIRED**,
  ruling in the spec: five of the nine swapped call sites are MFA/webauthn
  paths no test can exercise — clicking any passkey button triggers a real
  platform ceremony or factor mutation — so diff fidelity is the only net,
  which inverts the GPT-5.4 delegation calculus; GPT-5.4 only as
  owner-authorized fallback with heightened review). Full 505-line page
  read; census dry-run-verified (9 `supabase.auth` lines incl. 1 dep array,
  1 profiles read, 2 fetches, wc 505 with all three shell-bound counts per
  019 Amendment 1). Design: ONE new raw-passthrough facade
  `lib/infra/supabase/passwordSecurity.ts` (9 wrappers, bound verbatim,
  raw-shape ruling documented); page's duplicate `getAccessToken` +
  `decodeJwtPayload` byte-compared against the quarantine and DELETED in
  favor of imports (Addendum 4 above); `legacyToken.ts` gains one comment
  sentence, zero code. Rejected for fidelity: Result-shaped
  `getCurrentUser` (changes ignored-error path) and `ProfilesRepository`
  (bearer client + `select('*')` vs standard client + `select('email')`).
  supabase-js 2.93.1 `mfa.webauthn` typing VERIFIED in installed auth-js —
  no casts needed or permitted. Characterization PROBED against the OLD
  page (own isolated server on :3001 — owner's :3000 server left
  untouched): unique headings, empty passkey state, `Current session:
  AAL1`, single `GET /auth/v1/user` on load, and the short-password
  validation branch fires its toast with ZERO network. Two bound tests;
  suite arithmetic stated explicitly (24 + 2 = 26 in 17 files, Amendment-2
  lesson). Four forbidden buttons named (Reset-by-email/Add
  passkey/Verify/Remove). Self-review caught one spec defect pre-commit:
  the post-edit `grep -c "supabase" = 0` gate was wrong (new import PATHS
  contain "supabase/") — rebound to `@supabase` + `supabase\.` dot-anchored
  gates. NEW ops incident recorded: Next dev silently fell back to :3001
  because the owner's server appeared on :3000 between my gate check
  (09:53 → 0 listeners) and my probe start (10:08) — banner-port rule now
  bound in the spec and LESSONS_LEARNED.
- **2026-07-09** — PATCH-019 landed and reviewed: PASSED (commit `287f0ca`).
  Grandfather 7→6 — **batch 016–019 complete**; the 6 remaining
  grandfathered files (password, members, PostCardContent,
  FreeformPadletCards, CanvasClient, collabboard canvas page) are all
  batch-4/5 territory, nothing GPT-5.4-mechanical left. All gates
  independently re-run (not accepted from pasted output): page diff is
  exactly the four bound edits, `legacyToken.ts` diff is pure addition with
  existing exports byte-untouched, cascade order preserved, boundaries diff
  is the single named line, e2e spec never clicks Connect/Disconnect and
  asserts the exact CTO-probed callback-toast texts. Vitest 76/18 unchanged,
  tsc clean, boundaries clean, `playwright --list` → 24 tests/16 files.
  Amendment 2 added: the spec's "22 tests" expectation was the CTO's own
  arithmetic error (assumed +1 test where the bound spec adds 3) — corrected
  to 24, not a regression; Codex disclosed the mismatch rather than silently
  reconciling it, confirming the PATCH-018 disclosure rule works both
  directions. Health held at 74 (safety/architecture already at the 20/20
  per-axis ceiling; ops/product/continuity unmoved — still the binding
  constraint). PATCH_REFERENCE §7 row added.
- **2026-07-09** — PATCH-019 Amendment 1: GPT-5.4 blocked correctly at the
  pre-edit census (no edits, clean tree) — expected line count 287, printed
  262. CTO-reproduced: the file is byte-identical to baseline (git log/status
  clean, all six line anchors matched); the split is the counting tool, not
  the file — Git Bash `wc -l` counts all 287 lines, PowerShell
  `Measure-Object -Line` skips the file's 25 blank lines (262 + 25 = 287).
  Gate rebound shell-explicitly in the spec (both shells' commands + expected
  values inline); census ruled PASSED, Codex may proceed to Phase A. New
  lesson recorded (numeric gates must bind the producing shell — same family
  as the netstat/locale rule). No product code changed.
- **2026-07-09** — PATCH-019 AUTHORED (handoff-ready for GPT-5.4; closes
  batch 016–019 when landed, grandfather 7→6). Full 287-line page read;
  census dry-run-verified (only TWO Supabase calls — getSession +
  refreshSession inside the token cascade, on the STANDARD auth-helpers
  client, NOT a bearer client; no tables/storage/rpc). Design: the
  deep-scan scavenger pair moves VERBATIM (module-private) into
  `legacyToken.ts` with a new exported `resolveLegacySessionToken()`
  cascade helper — quarantine now holds all three scavenger inventories
  for 023; refreshSession (a §0 escalate API) is executable because the
  CTO bound the cascade verbatim in the spec. Characterization PROBED:
  unlike 017/018, this page WORKS for the e2e account (cookie session
  satisfies getSession, API 200, both cards render, 2 Connect buttons) —
  Phase A/B here exercises the swapped path end-to-end for the first time
  in the batch. Probe caught a heading strict-collision (`.first()`
  required) and both callback-toast branches were re-probed with the
  spec's EXACT param values after self-review flagged the substitution.
  Zero expected deviations, with the PATCH-018 disclosure rule bound into
  the handoff. All four operational lessons embedded in the verification
  sequence (canvas-route warmup, no concurrent probes, quota-via-DB
  diagnosis, PowerShell listener count as the only stopped-server gate).
- **2026-07-09** — PATCH-018 DONE (8872c2e), CTO review PASSED. Diff
  (`--ignore-space-at-eol`, whole-file CRLF churn is noise) touches exactly
  the bound regions across four handlers; `legacyToken.ts` matches its
  verbatim binding; `storage.ts` diff is exactly the one authorized `export`
  keyword; `profilesRepository.ts` payload spread order byte-for-byte
  (`{ email, ...patch, updated_at }` / `{ id, email, created_at, ...patch,
  updated_at }`); command control flow (update-then-insert) and error-cause
  passthrough both unit-tested including the exact "insertPatch NOT called
  when updatePatch reports an existing row" and "returns the SAME error
  Result" cases. Unit 60→76 (16 new, 3 files listed by name). tsc 0;
  boundaries green; post-edit census exact (`@supabase` 0,
  `makeAuthedClient` 0, `getAccessToken` 6, `decodeJwtPayload` 4);
  grandfather re-counted at 7. E2e spec matches the CTO-probed flow exactly
  (mutation-free — only the email-modal open/cancel round-trip); full suite
  21/21 on a warmed dev server; final `npm run verify` green with server
  stopped and `.next` cleared first. **Disclosed deviation accepted:**
  zod v4 requires two-argument `z.record(keySchema, valueSchema)` — verified
  independently (one-arg form throws on the installed 4.3.6; two-arg form
  is behaviorally identical since object keys are always strings). **One
  UNDISCLOSED deviation found at review, accepted:** a tsc-forced
  `as string | undefined` cast on the `display_name` JWT-metadata fallback,
  zero runtime effect, forced by the patch's own typed `ProfileRow`
  (same family as PATCH-010/015). Process note recorded in
  LESSONS_LEARNED: implementers must disclose every off-spec line
  regardless of perceived triviality. Pattern I (legacy-token quarantine)
  entered PATCH_REFERENCE §5.9 + §7 row. Two operational lessons from this
  week's verification folded in: e2e board-quota recurrence (scope cleanup
  by `deleted_at IS NULL` AND title, not title alone) and cold-compile on
  the largest route (`/dashboard/canvas/[id]`, 682 kB) causing a
  stuck-spinner false alarm — both now in LESSONS_LEARNED, e2e-infra
  pre-suite sweep still queued as a small follow-up patch, not a blocker.
  Health 72→74 (CTO_PLAYBOOK §12). Next: PATCH-019 (integrations,
  reuses `legacyToken.ts`) — not drafted, per instruction.
- **2026-07-09** — PATCH-018 AUTHORED (handoff-ready for GPT-5.4). Full
  861-line page read; census dry-run-verified (9 call sites: 3 profiles +
  2 storage + 2 auth, all via the bespoke `makeAuthedClient` Bearer
  client); characterization PROBED against the OLD page with the e2e
  storage state before binding (cookie-only wall confirmed: toast,
  defaults-only form, exactly one "Not set", email-modal round-trip is
  local-state-only with zero network; "Personal account" label deliberately
  NOT bound — strict-mode collision with the sidebar, caught by the probe).
  Design: `legacyToken.ts` quarantine file (scavenger + Bearer client +
  JWT decode moved VERBATIM, raw-passthrough auth helpers by explicit CTO
  ruling), `profile.savePatch` command + legacy-bound profiles repository
  (update-then-insert control flow, spread order preserved, raw errors
  travel as DomainError.cause and are rethrown at the page boundary so
  every toast stays byte-identical), Pattern H reused via class injection
  (storage.ts gets exactly one authorized `export` keyword). Inventory
  correction recorded (Addendum 3): profile has the NARROW scavenger, not
  the deep scan. Self-review fixed three spec defects pre-commit (zod
  clones → toEqual not toBe; git diff notation; unbound dynamic-payload
  typing). 019 not drafted, per instruction.
- **2026-07-09** — PATCH-017 DONE (ff84152), CTO review PASSED. Diff (with
  `--ignore-space-at-eol`) touches exactly the bound regions: import block,
  useMemo wiring, the three replaced call-site blocks in
  `loadSettings`/`saveSettings`/`uploadLogoFile`; scavenger + atob + API
  fetch lines byte-identical (re-verified: `getAccessToken`/`atob` count
  still 6). `settings.saveWorkspace` command, both repositories, and the
  storage gateway all match their verbatim bindings exactly — insert/update
  payload keys byte-for-byte against the old page, `maybeSingle` no-row
  path returns `ok(null)` with no PGRST116 branch (correct — no `.single()`
  here), write order and partial-failure semantics preserved (unit test
  explicitly asserts `workspacesRepository` NOT called when the settings
  write fails). Unit 43→60 (17 new across the 4 required files, all listed
  by name — exceeds the ≥14 bound). tsc 0; boundaries green; grandfather
  line removed exactly, re-counted at 8; `grep -c "@supabase"` on the page
  prints 0. E2e spec matches the Amendment 1 flow exactly (failure-path
  state, mutation-free — no Save click, no logo modal, no upload); full
  suite 20/20 against a live dev server; final `npm run verify` (typecheck +
  boundaries + unit + production build) green with the server stopped and
  `.next` cleared first. No deviations beyond the two pre-accepted ones
  (DomainError wraps thrown errors; console-only). Pattern H entered
  PATCH_REFERENCE §5.8 + §7 row. Health 70→72 (CTO_PLAYBOOK §12 catch-up
  entry, covers PATCH-016 + PATCH-017 together — 016 was never logged).
  Next: PATCH-018 (profile) — not drafted, per instruction.
- **2026-07-09** — PATCH-017 Amendment 1: GPT-5.4 blocked correctly (no
  code, clean tree) — the spec's characterization asserted a non-empty
  workspace-name input; observed value is `""`. CTO reproduced with the e2e
  storage state: the session is COOKIE-ONLY (localStorage empty), the
  page's localStorage token guard fails first, so no API/Supabase call ever
  fires — deterministic failure-path state ("Not authenticated" toast,
  empty+disabled input, disabled Save, no banner). Spec defect was the
  CTO's: happy-path assertion never probed against the account's reachable
  state (third instance of the assert-reachability family; lesson updated —
  dry-run obligation now explicitly covers characterization assertions).
  Amendment rebinds the flow to the observed state (toast asserted
  immediately after heading — 4s auto-dismiss), documents that the seams
  are e2e-unreachable for this account (unit tests + review carry them,
  PATCH-014/015 shape), and records the product bug: settings-root is
  unusable for ALL cookie-session users, making 023 a functional repair.
  Bindings unchanged; resume with the amended spec.
- **2026-07-08** — PATCH-016 DONE (0a2d372), CTO review PASSED. Diff exactly
  the spec's two files (component deletion + one grandfather line); orphan
  census re-verified post-deletion (zero importers repo-wide, zero e2e
  references) — matches the pre-edit census. tsc 0, boundaries green, unit
  43/43 unchanged (correct for deletion), full e2e 19/19 at the configured
  2 workers, `npm run verify` green with server stopped first. Grandfather
  10→9, count re-verified. No deviations. Next: PATCH-017 (settings-root,
  Pattern H storage seam) — spec authorship pending (Fable window).
- **2026-07-08 (planning session)** — Post-batch CTO planning: fresh census
  of all 10 remaining grandfathered files (variable-agnostic grep after the
  `supabase.`-only pattern missed `db.`-named clients — §0 discipline
  applies to the CTO too). Classification + batch plan 016–025 written into
  the Now section (A: mechanical, B: Fable-spec-then-delegate, C: monolith
  program). Census surprises, all census-verified: AddPadletMenu is a
  zero-importer ORPHAN (deletion patch 016 drafted, handoff-ready);
  FreeformPadletCards' sole importer is CanvasClient (monolith limb — its
  collabboard path lies); PostCardContent has 22 importers across BOTH
  canvas stacks (shared renderer, ops-seam consumer, not a one-off);
  no active-app link navigates to /collabboard (decision brief 022 gates
  that vertical); profile AND integrations share a duplicated
  token-scavenger (localStorage-wide token scan + hand-rolled JWT decode) —
  security flag recorded, preserved-then-replaced across 018/019 → 023.
  Fable-window critical path (closes 07-12) defined: specs 017–021, duality
  brief, ops-seam design + CanvasClient site map — all design, no
  implementation. CTO_PLAYBOOK §14 added (post-window review rituals +
  successor calibration). Next handoff: **PATCH-016 to GPT-5.4**.
- **2026-07-08** — PATCH-015 DONE (6672c12 + CTO review fix dbd8691), review
  PASSED — **batch 010–015 COMPLETE, grandfather 17→10**. First server-side
  seam live: `lib/infra/supabase/serverClient.ts` (service-role fallback
  centralized verbatim, security question stays queued), share-link
  repository per PATCH-004 structure, domain interface verbatim. Page diff
  matches Bindings; both deliberate deviations honored (all-errors→ok(null)
  mapping with PATCH-015 comment; recordAccess Promise<void> swallow); server
  client's only import chain is page→repository→serverClient (no 'use
  client' importer — CTO-traced). Unit 38→43 (new file listed by name); tsc
  0; boundaries green; grandfather re-counted at 10. One ACCEPTED deviation:
  `permission || 'view'` prop fallback (tsc-forced by the typed seam; proven
  render-equivalent by reading SharePageClient's only consumption). One
  review-CAUGHT defect fixed pre-push (dbd8691): the e2e spec inherited the
  project storageState without a credentials skip → ENOENT in the CI
  configuration; now overrides with an inline empty state (runs
  credential-free — CI now exercises the server seam). The verification-run
  "dashboard/settings navigation instability" was root-caused by controlled
  experiment: NOT a regression and NOT just cold-compile — dev-server
  contention at 6 parallel workers (clean pre-warmed server still failed;
  2 workers → 19/19 ×3, all specs at fast baseline); fixed in config
  (workers: 2 locally, CI untouched), rules in PATCH_REFERENCE §6, lessons
  updated (cold-start entry requalified). Final verify green with server
  stopped, `.next` cleaned before AND deleted after (owner restarts dev on
  a clean cache). Health 69→70 (CTO_PLAYBOOK §12). Next patch deliberately
  not drafted (owner instruction).
- **2026-07-08** — PATCH-014 DONE (7726215), CTO review PASSED. Diff
  (ignoring the whole-file line-ending churn Codex's editor introduced)
  matches Bindings exactly: two imports swapped for `getCurrentUser` +
  `signOutCurrentUser`; identity guard mapped `!result.ok || result.value
  === null` → the existing toast-and-redirect branch (fail-closed, one
  branch, as required); post-deletion `signOut()` → `signOutCurrentUser()`,
  result still ignored; both `@supabase` imports removed; zero JSX/rendering
  changes. `eslint.boundaries.config.mjs` diff is exactly the one grandfather
  line removed. Grandfather re-counted at 11 directly from the file (12→11).
  Committed spec matches the Amendment 1+2 flow verbatim: warning copy →
  acknowledged verify-step click (`toPass` retry anchored on the durable
  "Verified" state, per Amendment 2) → "Identity verified" toast → open the
  confirmation panel → destructive button disabled empty AND on wrong text
  "NOPE" (Amendment 1, no error-toast assertion) → Cancel closes the panel →
  `/dashboard` still loads. Never types DELETE, never clicks the destructive
  button. CTO independently re-ran every gate: `tsc --noEmit` 0, boundaries
  green, unit 38/38 (unchanged, correct for Pattern C), `grep -c "@supabase"`
  prints `0` / exits 1 (same ruling as PATCH-012 — printed value is the
  criterion, not the exit code). Full e2e reran twice against a live dev
  server: first run showed 2 failures in `settings-pages-render.spec.ts`
  (unrelated pages) that vanished on a warm-server rerun — diagnosed as a
  Next dev on-demand-compile cold start, not a regression (see
  LESSONS_LEARNED); second full run was 18/18 green including the new spec.
  Final `npm run verify` (typecheck + boundaries + unit + production build)
  green with the dev server stopped and `.next` cleared first, per protocol.
  `git status --porcelain` clean after. No deviations; no MUST-NOT files
  touched. Health ledger 67→69 (CTO_PLAYBOOK §12). **Recommendation: PATCH-015
  proceeds unchanged** — it is independent of 014 (runs last for novelty, not
  dependency, per the batch table above); nothing in this review bears on
  its Pattern G server-seam scope. PATCH-015 itself not drafted this session.
- **2026-07-08** — PATCH-014 Amendment 2: the implementer's OLD-page dispute
  (verify click → getUser 200 but no toast/Verified/redirect) resolved as a
  **harness artifact, not product behavior**. CTO reproduced both sides with
  probes against the running dev server (same storage state, OLD page):
  post-hydration click → toast + Verified in ~1.5s with one getUser 200;
  click-on-visible → the exact reported symptom with NO auth request at all
  (the cited 200 never came from a running handler — a pre-hydration click is
  swallowed traceless). Same failure family as the implementer's own
  auth.setup retry fix (c7b0fb1). Amendment 1's characterization STANDS; no
  behavior change authorized; spec hardened with an acknowledged-click idiom
  (toPass retry anchored on the durable "Verified" state, authorized ONLY for
  the idempotent verify step — destructive button remains never-clicked).
  Rule generalized in PATCH_REFERENCE §6 (hydration-acknowledged first
  click); lesson recorded (observation vs. source contradiction ⇒ reproduce
  before amending). Resume with the amended spec; bindings unchanged.
- **2026-07-08** — PATCH-014 blocked correctly by GPT-5.4 (no code changed,
  census matched): the spec's e2e required asserting the wrong-confirmation
  error toast, but the destructive button is `disabled` unless the text is
  exactly `DELETE` — the toast guard is UI-unreachable dead code in the
  handler. CTO verified against source (page.tsx line 166 vs. lines 43–46).
  Amendment 1: characterize the reachable behavior instead (wrong text →
  button stays disabled; verify step now REQUIRED, exercising the exact
  getUser call the patch swaps — strictly stronger than the original);
  making the error path reachable REJECTED as a behavior change (same
  standing rule as PATCH-012 Option 3); guard stays byte-untouched as
  defense-in-depth. Safety rules tightened: never click the destructive
  button at any point, even disabled. Lesson recurrence recorded: assertions
  must be traced to user-reachable triggers, not just found in handler
  source. Resume with the amended spec; bindings unchanged.
- **2026-07-08** — PATCH-013 DONE (7c290f2), CTO review PASSED. Landing
  page (`app/page.tsx`) moved onto `authState.ts` helpers — Pattern F
  repetition #2 plus the first `signOutCurrentUser` consumer. All three
  event branches (`SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED ||
  INITIAL_SESSION`) preserved verbatim; sign-out `finally`-navigation
  (`router.push('/auth?switch=1')` regardless of outcome) preserved exactly.
  Subscription lifecycle silently fixed: old code returned cleanup from
  inside an async function (useEffect ignores async return values — leak);
  new code hoists `let unsubscribe` and the effect's own synchronous cleanup
  calls it — spec explicitly required this pattern. Grandfather 13→12
  (manually counted, `app/page.tsx` removed). tsc 0, boundaries green, unit
  38 (unchanged — Pattern F), `grep -c "@supabase"` → 0. E2e spec covers
  both gate sides: fresh unauthenticated context (absolute URL, cleared
  storage) + stored authenticated session. No MUST-NOT files touched; no
  `.fable5/` or `.claude/` in the implementation commit. Commit message
  matches spec verbatim. No deviations. Recommendation: PATCH-014 proceeds.
- **2026-07-08** — PATCH-012 DONE (2a3ff44), CTO review PASSED. Both
  session→user renames (state, init read, subscription callback, every
  render-time `session?.user?.X` → `user?.X`) applied exactly per spec; both
  `@supabase` imports removed; grandfather 14→13 (verified: file removed from
  `GRANDFATHERED_UI_FILES`, count re-counted at 13). CTO independently
  re-ran, not just the implementer's report: all three orphan-proof commands
  (exact match, `./components/ui-kit/ClientWrapper.tsx`), the pre-edit
  census (0 `@supabase` matches remain post-edit), `tsc --noEmit` (0
  errors), `check:boundaries` (green), `test:unit` (38/38, unchanged count —
  Pattern F has no unit tests by design). Minor accepted deviation: the
  `onAuthUserChanged` callback dropped `async` (unused — no `await` in the
  body); harmless simplification, not a behavior change, not required to be
  reverted. Ruling on the implementer's flagged question: `grep -c
  "@supabase" file` printing `0` while exiting `1` is correct, expected grep
  behavior (exit 1 = zero matching lines, not an error) — the acceptance
  criterion is the printed value, which is `0`; not a defect. E2E full-suite
  rerun was NOT performed this review (no dev server was up); ruled
  acceptable because the orphan-proof is static-reachability evidence
  strictly stronger than e2e sampling for a component nothing mounts — e2e
  would only reconfirm unreachability it cannot even exercise. Doc-lag
  caught: the CTO_PLAYBOOK health ledger had not been updated since PATCH-009
  (batch-064) despite PATCH-010 and PATCH-011 both landing and passing review
  in the interim — three patches' worth of movement backfilled together this
  entry (see CTO_PLAYBOOK §12). Recommendation: PATCH-013 proceeds unchanged.
- **2026-07-07** — PATCH-012 Amendment 1a: the orphan-proof's first command
  self-contradicted (pattern "ui-kit/Navbar" can't match ClientWrapper's
  relative `./Navbar` import; expected-result comment said it would).
  Corrected pattern dry-run-verified this time. Architecture decision
  unchanged; resume with corrected proof. Lesson: dry-run obligation covers
  amendment-embedded proof commands.
- **2026-07-07** — PATCH-012 blocked correctly by GPT-5.4: the spec claimed
  Navbar "renders on most pages," but CTO independently confirmed it's
  orphaned — its only importer (ClientWrapper.tsx) is itself imported by
  nobody; root layout never mounts either. Amendment 1: proceed as an
  unused-component extraction (grandfather value unchanged), e2e requirement
  replaced with a mandatory orphan-proof census; restoring the mount point
  REJECTED as out-of-scope behavior change. Lesson + Pattern F mistake entry
  added: trace import chains to a mounted root before claiming "renders".
- **2026-07-07** — PATCH-011 DONE (e56bc5a), CTO review PASSED — Pattern F
  reference implementation; authState.ts verbatim-faithful; subscription
  lifecycle sound; e2e 15/15 with both gate sides covered. Pattern F entered
  into PATCH_REFERENCE (§5.6 + rows) and VERIFIED landed at review closeout.
  012/013/014 dependencies now met.
- **2026-07-07** — PATCH-011 blocked correctly by GPT-5.4 on a real gap: the
  reading-order instruction says consult PATCH_REFERENCE.md first, but
  neither Pattern F (queued) NOR PATCH-010's own type-only-swap pattern
  (already reviewed) was actually in the catalog — a stated "add at review"
  policy that had never been executed. Fixed: PATCH-010's pattern backfilled
  into PATCH_REFERENCE §5.5; explicit "not yet in catalog, that's expected"
  notices added to PATCH_REFERENCE's own header and inline into PATCH-011/
  PATCH-015; AI_WORKFLOW's reading-order instruction corrected. No code
  changed; GPT-5.4 cleared to resume PATCH-011 unchanged.
- **2026-07-07** — PATCH-010 DONE (743d719), CTO review PASSED — first
  components/** grandfather shrink (17→15); type-only AuthUser swap; unit
  count unchanged (correct for this pattern); e2e 13/13 incl. board-lifecycle
  which drives both components through real interaction. Amendment 1 scope
  check: the committed diff matches the CTO's dry-run byte-for-byte, one
  additive field, nothing else touched.
- **2026-07-07** — PATCH-010 blocked correctly by GPT-5.4 at tsc (Risks
  section prediction exact): AuthUserMetadata lacked `name` (line-350 access
  missed by one-segment census grep). Amendment 1: field added, CTO dry-ran
  in worktree (tsc 0), full-chain census rule added. Engineer resumes from
  tsc; atomic commit unchanged.
- **2026-07-07** — PATCH-009 DONE (42e593f), CTO review PASSED — **batch
  005–009 COMPLETE: grandfather 23→17**, unit 21→38, e2e nets 8→13. Pattern E
  (composite, two repositories) validated on GPT-5.4; Amendment 1 honored
  exactly (email fallback preserved line-for-line). One deviation formally
  ACCEPTED: no more false success-toast on failed default-workspace saves
  (P3 outranks bug-preservation for false-success reporting — ruling scoped
  in the patch verdict). Watchlist: zod-on-save vs legacy libraries rows.
- **2026-07-07** — PATCH-009 blocked correctly by GPT-5.4 (zero code): spec's
  membership query binding didn't match reality (member_user_id + status
  filters, email-fallback query, display_name consumption — census grepped
  fragments instead of reading call sites). Amendment 1: fallback preserved
  (two explicit repository methods, control flow stays in page), CurrentUser
  extended additively with displayName. Census rule hardened in
  PATCH_REFERENCE §0 + LESSONS_LEARNED.
- **2026-07-07** — PATCH-008 DONE (7ba48e2), CTO review PASSED — Pattern D
  (read-only repository) validated; stale-belt bug preserved as specified;
  grandfather 19→18; unit 25; e2e 12/12. Commit message named the wrong page
  (stale handoff title) — message-only amend on the unpushed tip
  (1b3c49c→7ba48e2); handoff template rule 11 added (copy titles verbatim).
- **2026-07-07** — PATCH-007 DONE (9f0a72d), CTO review PASSED — logs page
  extracted (Pattern C); `getCurrentUser` helper live (009 dependency met);
  grandfather 20→19; full e2e 11/11. Clean GPT-5.4 execution. Governance
  note: commit-message hints go in handoffs, not patch files (.fable5 is
  CTO-only).
- **2026-07-07** — PATCH-006 DONE (b813ce9), CTO review PASSED — dead clients
  verified gone at SOURCE level (parent: 2 refs/page; HEAD: 0). Grandfather
  22→20. Executed by Gemini 3.1 Pro (new implementer, owner-assigned): craft
  deviations only (blank-line residue instead of deletions — cleaned in
  labeled fix 61d54dc; non-conventional commit message). Full e2e 10/10.
  Roster question raised: formalize Gemini's role in AI_WORKFLOW?
- **2026-07-07** — PATCH-005 DONE (06e40b4), CTO review PASSED — first GPT-5.4
  extraction, pattern-compliant on both spec traps. Grandfather 23→22, unit
  tests 14→21. Review surfaced a race in PATCH-004's accessibility spec
  (fire-and-forget save vs. immediate reload; passed by luck before) — fixed
  with a waitForResponse barrier (8636bd1), rule added to PATCH_REFERENCE §6.
  Backlog: browserClient singleton (GoTrueClient warning).
- **2026-07-07** — Second batch PATCH-010…015 drafted from a census of ALL
  remaining grandfathered files. Finds: CanvasModals/OverlayLayer are
  type-only `import type { User }` (trivial −2); ProtectedRoute/Navbar/
  landing share the getSession+onAuthStateChange shape (new Pattern F with
  one bound helper); delete-account's deletion is server-side (exclusion
  reversed, API route hard-forbidden); share/[token] is a server component
  reading share_links with a service-role fallback (new Pattern G, first
  server seam; security question about RLS-scoped lookup queued, behavior
  preserved). PostCardContent stays excluded: its write belongs to the
  future ops path, not a one-off command.
- **2026-07-07** — Extraction batch PATCH-005…009 drafted from a fresh census
  of all 12 grandfathered settings pages (sizes, tables, exact supabase API
  usage per page). Sequenced: template validation → free wins → helper
  introduction → read-only variant → composite page. Notable census finds:
  ai + preferences import Supabase but never use it (dead client); logs
  renders mock data and only needs the user's email; achievements is
  read-only with a pre-existing stale-state belt bug (preserved, queued).
- **2026-07-07** — PATCH-004 Amendment 2: flat "no build" contradicted
  `verify`; guard restored to conditional form, build sequenced after dev
  server stops. Verify gate NOT weakened. Lesson: never restate a
  conditional rule without its condition.
- **2026-07-07** — PATCH-004 Amendment 1: GPT-5.5 blocked correctly on a spec
  contradiction (vitest include vs. config-freeze); CTO authorized the
  one-line vitest.config.ts widening; acceptance criteria hardened (test file
  names must appear in pasted run output). Lesson recorded.
- **2026-07-07** — PATCH-003.5 EXECUTED: history purge complete and proven
  (all-refs filter-repo, tree-identical, 166→38.8 MiB; GitHub repo replaced,
  old SHAs unfetchable; branches+tags pushed). All commit hashes rewritten.
  Standing risk #1 resolved; secrets + session revocation queued to owner.
- **2026-07-07** — PATCH-003.5 drafted (history purge runbook) after the
  GitHub push escalated the credential-history risk. Scope verified: GitHub
  holds only main; local tags/agent branch also carry the profiles and are
  cleaned by the same rewrite. Health rubric written into CTO_PLAYBOOK §13;
  pre-push gate + operational-patch rules added to AI_WORKFLOW.
- **2026-07-07** — CTO_PLAYBOOK.md created (succession doc: patch evaluation/
  rejection, split/refactor/abstraction judgment, debt prioritization,
  philosophies, if-this-then-that table).
- **2026-07-07** — Knowledge-extraction pass: LESSONS_LEARNED.md,
  AI_WORKFLOW.md (roles: Fable 5 CTO / GPT-5.5 senior / GPT-5.4 implementer),
  CODER_HANDOFF_TEMPLATE.md, `extract-approach` skill; CLAUDE.md rule 11
  (learning note after every non-trivial solved problem).
- **2026-07-07** — PATCH-001 DONE (commit 9b8bed2): characterization harness +
  board lifecycle test green (6 pass w/ creds, clean skips w/o). Phase 1 behavior
  net is live. Backlog items recorded above.
- **2026-07-07** — Login incident RESOLVED (owner-confirmed in browser). Causes:
  Supabase per-IP sign-in limit (30/5min) kept warm by retries; middleware was
  additionally refreshing tokens on every API call (fixed, `f64dd76`). Auth is now
  client-primary with server lockout bookkeeping (`51db5a8`, CTO-reviewed).
  Owner follow-ups queued: raise sign-in limit 30→100/5min, custom SMTP (email
  cap is 2/h), auth hardening items for a later security patch.
- **2026-07-06 (pm)** — Phase 0 executed: hygiene purge (~10.9k files removed from tip), secrets audit (no service keys; anon key orphan removed; Chrome profiles found in history — purge pending approval), SQL reorganized + baseline documented, production build repaired, CI gates + smoke tests added and passing.
- **2026-07-06 (am)** — Architecture audit completed; `.fable5/docs` documentation suite created (20 docs). Phase 0 defined.
