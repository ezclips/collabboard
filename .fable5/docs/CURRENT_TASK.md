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
| 022 | canvas duality DECISION brief | CTO brief → owner | ✅ **RESOLVED** (brief delivered AND Fact-1 census executed 2026-07-09: zero user data, 5 owner-test rows, `canvas_files` table doesn't exist — verdict DELETE; proxy-metric trap stands: NO type-only de-linting of the two monolith files) |
| 023 | **v1 collabboard vertical DELETION** (18 files: 9 pages incl. a v1 auth sub-vertical + 9 API routes; census-gated, deletions-only, live accept-route byte-untouched, NO table drops) | GPT-5.4 | ✅ **DONE** (cbe529e, review PASSED; Amendment 1 held; commit chain includes the CTO's accidental-bundle incident `5c3e15f` → restore `75cf480` → proper implementation — see the spec's Incident record; grandfather 4→3) |
| 024 | security normalization — **authorized behavior change**: token acquisition moves to the cookie session (`sessionToken.ts`: getSession→refreshSession, the proven PATCH-019 cascade minus its deep-scan step); ALL four scavengers deleted from the quarantine; 11 call-site swaps across settings-root/profile/password/integrations; settings-root + profile FUNCTIONALLY REPAIRED for cookie users; two characterization specs rebound to repaired states (expected-unprobed, STOP-and-amend protocol); share-link RLS explicitly DEFERRED to its own server-side patch *(renumbered from 023)* | **GPT-5.5 REQUIRED** (auth behavior change + unprobeable-in-advance characterization = the owner's definitional GPT-5.5 case) | **✅ DONE — `32faa80`, CTO review PASSED 2026-07-09** (all gates independently re-run: both whole-file bindings byte-identical, 27/27 e2e green on the reviewer's own server incl. both repaired-state specs, verify green; two cosmetic undisclosed deviations accepted — disclosure-gap chain; Amendments 1–2 rode the implementation; follow-up queued: clientAuth dead tail + notifications-page swap) |
| 025 | canvas ops seam: `PostsRepository` (`lib/domain/canvas/posts.ts` + `lib/infra/canvas/postsRepository.ts`, neutral naming per P7) + FIRST canvas command `canvas.toggleTask`; first consumer = PostCardContent's single write site (22 importers, rendering identical); **grandfather 3→2 EARNED** (the value import + the only runtime supabase call both leave the file — not type-only gaming) *(renumbered from 024)* | **GPT-5.4 acceptable** — the one mutation path's semantics are locked by 9 bound unit tests the CTO already ran GREEN at authoring; 1 untestable-by-e2e call < the ≥2 GPT-5.5 threshold; client swap is identity (browserClient wraps createClientComponentClient) | **✅ DONE — `e2af0ef`, CTO review PASSED 2026-07-09** (all four new files byte-identical to bindings; unit 85/20, e2e 27/27, verify green — all re-run by reviewer; grandfather 3→2 earned via measured `--no-ignore` probe; one undisclosed EOL byte accepted — disclosure chain; Pattern K catalogued §5.11). Companion: `docs/CANVASCLIENT_SITE_MAP.md` (successor-inheritance doc, review-verified) |
| 026 | CanvasClient strangler group 1: the complete `board_sections` write family (6 sites / 4 handlers → FIVE commands on the canvas trunk: create/rename/delete/swapPositions/reorder; `lib/domain/canvas/sections.ts` + `lib/infra/canvas/sectionsRepository.ts`, sibling aggregate to posts — one folder family, P6); monolith SHRINKS 8,526→8,518; NO grandfather movement (2→2, CanvasClient keeps 70 other sites); reorder's legacy error-swallow PRESERVED + documented + queued as P3-family defect | **GPT-5.4 acceptable** (Pattern K: 17 bound unit tests compiled AND run green at authoring — incl. dedicated tests for the swap's partial-failure and the reorder's preserved swallow; supersedes the provisional "GPT-5.5 first group" note, which predated Pattern K's PATCH-025 proof) | **✅ DONE — `24bdf94`, CTO review PASSED 2026-07-10** (all four new files byte-identical to bindings; CanvasClient diff matches §5a-§5f exactly incl. blank-line binding; unit 102/22, e2e 27/27, verify green — all re-run by reviewer; monolith 8,526→8,518 (first shrink, but architecture is capped at 20 — health holds at 76, no credit expressible); grandfather untouched 2→2; first fully clean disclosure in the review chain) |
| 027 | CanvasClient strangler group 2: the complete `boards` update family (4 sites / 4 handlers → FOUR commands: `canvas.setMapStyle`/`setBoardBackground`/`setBoardCover`/`setChronoMode`; `lib/domain/canvas/board.ts` + `lib/infra/canvas/boardRepository.ts`, third sibling aggregate — P6 collision ruling: the unconsumed exemplar `lib/domain/boards/repository.ts` is a different concern, zero importers/implementations, stays byte-untouched); THREE distinct legacy error semantics preserved (toast-return, scope-annotated throw, SILENT SWALLOW — chrono mode is the second swallow site, standing decision extended at review); map-style write's missing updated_at preserved as a typed fact (dedicated repository method + `Object.keys` test); monolith 8,518→8,517; grandfather 2→2 | **GPT-5.4 acceptable** (Pattern K, third application: 15 bound tests compiled AND run green at authoring; two named casts — the new `as object` re-throw + the relocated legacy `as any`) | **✅ DONE — `261d36e`, CTO review PASSED 2026-07-10** (all four new files byte-identical to bindings — verified against the spec fences AND the CTO's original scratch-tested copies; CanvasClient diff matches §5a-§5e exactly, no other lines touched; unit 117/24, e2e 27/18, boundaries/typecheck clean — all re-run by reviewer; monolith 8,518→8,517 confirmed, EOF blank line exact; grandfather untouched 2→2; second fully clean disclosure in the review chain — both reported deviations (curl warm-up quirk, transient EOF-blank miscount) were environment/process notes, not undisclosed code drift) |
| 028 | CanvasClient strangler group 3: the complete `padlets` DELETE family (8 sites / 6 handlers → FOUR commands EXTENDING the posts aggregate, no new files — first extension-only Pattern K: `canvas.deletePost`/`deletePosts`/`deleteChildPosts`/`deleteContainerChild`; the unconditional UPDATE+DELETE cascade in handleDeleteChildFromContainer is ONE command per §7, taking its paired update out of the UPDATE census 33→32; the CONDITIONAL cascades (requestDeletePadlet, Wall onPadletDelete) are composed from two thin commands at the call site to preserve exact DB traffic — recorded §0.4 ruling); TWO child-cascade console-swallows preserved AT THE CALL SITE (commands return honest Results, call sites log-and-continue — not command-internal swallows, no standing-decision extension); deleteMapPinContainer's container leg stays on the hook helper (hook layer untouched); monolith 8,517→8,507; blank census 727→726 bound; grandfather 2→2 | **GPT-5.4 acceptable** (Pattern K, fourth application: 25 bound tests — 16 new + 9 existing — compiled AND run green at authoring; edit simulated end-to-end by the CTO, all derived gates verified against the simulation, which caught one import-line substring collision before binding) | **✅ DONE — `0964195`, CTO review PASSED 2026-07-10** (all seven CanvasClient blocks + import block diffed byte-identical to bindings; posts.ts/postsRepository.ts/postsRepository.test.ts byte-identical to bindings; posts.test.ts had one undisclosed interior blank-line drop offset by a gained trailing blank line — accepted, whitespace-only, disclosure-gap chain continues; unit 133/24, e2e 27/18, boundaries/typecheck clean, all census numbers incl. the createPostsRepository:9 collision confirmed — all re-run by reviewer; all byte-untouched files (PostCardContent, FreeformPadletCards, board/sections trunks, exemplar, eslint config) confirmed empty-diff; hook helper call untouched; all five files LF-only) |
| 029 | CanvasClient strangler group 4: the complete `padlets` INSERT family (19 sites / 12 handlers → SIX commands EXTENDING the posts aggregate, second extension-only Pattern K, no new files: `canvas.createPost`/`createPostAndSelect`/`createContainerWithPost`/`groupPostIntoContainer`/`attachPostToSchedulerContainer`/`createSchedulerContainerWithPost` + repo methods `insert`/`insertReturning`/`updateMetadataUnstamped`); INSERT goes EXTINCT like DELETE did; two paired UPDATE sites travel with their cascades (UPDATE census 32→30); the SCHEDULER SILENT-SWALLOW CLUSTER (five bare-awaited statements) preserved as command-internal swallows — swallow-family sites 3+4, standing decision extended at review; three compensation semantics preserved at call sites incl. two hook-helper cleanups; groupIntoColumn's unstamped update pinned by `Object.keys === ['metadata']` test; five named casts; compact-form blocks bound to satisfy the never-grow rule — monolith 8,507→8,504, blank 726→724; NEW: bound `git hash-object` byte-identity gates for ALL FIVE final files (computed from the CTO's edit simulation — the anti-cancellation gate) | **GPT-5.4 acceptable** (Pattern K, fifth application: 46 bound tests — 21 new + 25 existing — compiled AND run green at authoring; 11 swap shapes compile-verified incl. Padlet-interface assignability via `z.custom<object>`; full edit simulated, all gates measured on the simulation) | **✅ DONE — `4d28b76`, CTO review PASSED 2026-07-10** (all five bound `git hash-object` byte-identity hashes matched EXACTLY — CanvasClient and all four lib files byte-for-byte identical to the CTO's simulation; all byte-untouched gates confirmed empty-diff; unit 154/24, e2e 27/18, TypeScript/boundaries clean — all re-run by reviewer; census incl. the createPostsRepository:25 and value-as-any:4 collisions confirmed; zero disclosure gaps — first fully clean review since the hash-gate class was introduced) |
| 030 | CanvasClient strangler group 5: the STORAGE pair + its paired metadata update — the `addImageToLink` cluster (3 sites / 1 handler / ONE bound block: upload + getPublicUrl onto the EXISTING Pattern H `createStorageGateway()`, and the `{ metadata, updated_at }` write onto a thin new `canvas.updatePostMetadata` command over 028's already-tested `updateMetadata` repo method — NO infra changes, THREE scoped files only); storage category goes EXTINCT in CanvasClient (2→0); plants the workhorse command the remaining 29 UPDATE sites will reuse in later slices; zero new casts; monolith 8,504→8,499, blank 724→723; hash gates bound for all three changed files AND the three must-not-change infra files | **GPT-5.4 acceptable** (Pattern K, sixth application — the narrowest yet: 36 bound tests, 3 new + 33 existing, run green at authoring; swap shape compile-verified; simulation caught a grep-dot instrument defect — `supabase.storage` unescaped matches the new import's `supabase/storage` path — gate bound with the escaped form, tenth measurement-instrument variant) | **✅ DONE — `e87fcc4`, CTO review PASSED 2026-07-10** (all three bound `git hash-object` byte-identity hashes matched EXACTLY — CanvasClient and both lib files byte-for-byte identical to the CTO's simulation; all three must-not-change infra hashes also confirmed unchanged; the bound block at L3712–3739/new byte-diffed exact against the spec's OLD/NEW fences; all byte-untouched gates (infra, components, board/sections trunks, exemplar, eslint config) confirmed empty-diff; `git status --short` showed exactly the three scoped files; unit 157/24, tsc clean, boundaries clean, e2e 27/27 (against the reviewer's own warmed server via `PW_BASE_URL`), port gate 0 before and after, `npm run verify` (typecheck+boundaries+unit+production build) green — all re-run independently by reviewer; storage census confirmed extinct (`supabase\.storage` 2→0) and no undisclosed lines; zero disclosure gaps — third consecutive fully clean review) |
| 031 | CanvasClient strangler group 6: the honest-contract padlets UPDATE slice — six named-function metadata writes whose legacy error contract ports EXACTLY onto the honest commands (`handleWallReorder`/`createRealPostFromDraft`/`commitPadletMeta`/`toggleCropToGrid` onto `canvas.updatePostMetadata`; `lockPadlet`/`movePadletLayer` onto a new sibling `canvas.updatePostMetadataUnstamped`, no infra changes); named UPDATE census 15→9, total padlets UPDATE 29→23; bonus extinction: the file's one double-quoted `.from("padlets")` site goes extinct (1→0); NINE named UPDATE sites deferred to their own rulings (swallow family + check-and-branch pair); zero new casts | **GPT-5.4 acceptable** (Pattern K, seventh application: 39 bound tests, 3 new + 36 existing, run green at authoring; all six swap shapes compile-verified against the real `Padlet['metadata']` shape) | **✅ DONE — `7b19ed8`, CTO review PASSED 2026-07-10 (second pass)** (all three bound hashes matched EXACTLY — CanvasClient and posts.ts confirmed on the first review pass; posts.test.ts's hash was INITIALLY flagged as a mismatch against a reviewer-side stale scratch cache, reversed on re-review once the reviewer re-read the live spec's own declared post-edit hash and found the implementation matched it exactly — see LESSONS_LEARNED's measurement-instrument family, eleventh variant; all six CanvasClient bound blocks byte-identical to the live spec fences; full census, byte-untouched gates, `git status`, and grandfather count all confirmed; unit 160/24, tsc clean, boundaries clean, e2e 27/27 (reviewer's own server via `PW_BASE_URL`), port gate 0 before/after, `npm run verify` green — all re-run independently) |
| 032 | CanvasClient strangler group 7: named-function padlets UPDATE EXTINCTION — the nine remaining named sites under the two owner-requested rulings, both made 2026-07-10: ①bare-awaited cluster (7 sites/6 handlers) onto TWO new command-internal-swallow siblings `canvas.updatePostMetadataBestEffort` (stamped) + `canvas.updatePostMetadataUnstampedBestEffort` — swallow-family sites 5+6, each pinned by a "resolved failure still returns ok" test; fail-fast Promise.all semantics preserved EXACTLY via per-element async wrappers that throw on !ok (no settle-order deviation); ②check-and-branch pair (`changeCardColor`/`pinPost`) = the program's SECOND AUTHORIZED BEHAVIOR CHANGE (after 024): resolved-error branch byte-identical, thrown mode repaired from silent unhandled rejection onto the same existing toast+fetchData branch (P3), honest `updatePostMetadata`; named UPDATE 9→0, total padlets UPDATE 23→14 (all JSX); zero new casts (two relocated legacy `as any`); one new `merged` local bound; monolith 8,475→8,450, blank 723→727; hash gates for all three changed + two must-not-change infra files; spec fences SELF-VERIFIED (all three final hashes reconstructed from the spec's own fences) | **GPT-5.4 acceptable** (Pattern K, eighth application: 45 bound tests, 6 new + 39 existing, run green at authoring; all nine swap shapes tsc --strict verified incl. the wrapped-batch idiom) | **✅ DONE — `4b2c3ba`, CTO review PASSED 2026-07-10** (all three bound hashes matched EXACTLY against the LIVE spec's own declarations — re-derived from disk per the 031 lesson, not from cache; the two must-not-change infra hashes confirmed unchanged; the import edit and all nine CanvasClient bound blocks confirmed byte-identical to the live fences, incl. the relocated `merged` local and casts; both best-effort commands verified to ignore the resolved Result and return ok unconditionally, each with its swallow-pin test present; fail-fast `Promise.all` semantics confirmed structurally preserved at all three batch sites; the authorized `changeCardColor`/`pinPost` micro-change confirmed exactly as ruled; named-function UPDATE census confirmed extinct (14 JSX + 1 select remain); full census, byte-untouched gates, `git status`, and grandfather (2→2) all confirmed; unit 166/24, tsc clean, boundaries clean, e2e 27/27 (reviewer's own server via `PW_BASE_URL`), port gate 0 before/after, `npm run verify` green — all re-run independently, zero disclosure gaps) |
| 033 | CanvasClient strangler group 8: TEN of the 14 JSX padlets UPDATE sites onto the EXISTING command quartet (7 bare-await sites → `updatePostMetadataBestEffort`; the check-and-branch `onUpdateChildComments` triplet → honest `updatePostMetadata` under an EXTENDED 032-Ruling-2 authorization, same convergence criteria verified per-site); the FIRST ONE-FILE patch of the program — zero domain changes, zero test changes, zero imports, zero new swallow sites (consumers of existing pins); the four non-fitting sites DEFERRED by column shape and named in the spec (2 position writes, 1 content+select map variant, 1 title write); the onDropExistingPadlet pair keeps first-throw-aborts-second; partial-handler swap at the detach site (position leg stays, 028 precedent); zero JSX structure churn; monolith 8,450→8,404, blank 727→730; padlets UPDATE 14→4; fidelity net = the existing 45 posts tests re-run green at authoring; spec fences SELF-VERIFIED (final hash reconstructed from the spec's own eight OLD/NEW pairs incl. the count==2 twin binding) | **GPT-5.4 acceptable** (Pattern K, ninth application: all swap shapes tsc --strict verified against the LIVE domain module) | **✅ DONE — `ef3a91d`, CTO review PASSED 2026-07-10** (final hash matched EXACTLY against the live spec's own declaration; all four lib files confirmed unchanged; `git status` confirmed exactly ONE modified file; all eight fence-pairs cross-checked against the live implementation — every OLD text fully gone, every NEW text present at its exact bound count incl. the §4c/§4e twin at exactly 2 occurrences; census (14 values) and the padlets-UPDATE 14→4 count both confirmed via a fresh site-map regeneration; sequential timeline ordering confirmed preserved (`containerResult` checked before `droppedResult`'s write begins); thrown-mode convergence confirmed at all three `onUpdateChildComments` check-and-branch sites (single `if (!result.ok)` branch for both failure modes); the deferred map-comments/select site confirmed byte-untouched; unit 166/24 (unchanged, zero test changes), tsc clean, boundaries clean, e2e 27/27 (reviewer's own server via `PW_BASE_URL`), port gate 0 before/after, `npm run verify` green — all re-run independently, zero disclosure gaps) |
| 034 | CanvasClient strangler group 9: the position-write pair — a NEW seam (`canvas.updatePostPosition` honest + `canvas.updatePostPositionWithMetadataBestEffort`, one new repository method `updatePosition` with conditional metadata inclusion, first infra change since 029); serves the freeform detach padlet leg (position+metadata bundled, best-effort — seventh command-internal swallow site) and the canvas drop repositioning handler (position-only, honest — the program's THIRD authorized micro-change, converging a previously-unhandled thrown-mode position-rollback gap onto the existing resolved-error rollback branch); zero new casts; monolith 8,404→8,401, blank 730→731; 67 bound tests (9 new: 3+3 domain, 3 infra; 58 existing re-run non-breaking); spec fully SELF-VERIFIED (all five final hashes reconstructed from the spec's own fences, incl. the four whole-file domain/infra bindings) | **GPT-5.4 acceptable** (Pattern K, tenth application: narrow new capability, all swap shapes tsc --strict verified) | **✅ DONE — `4e5185e`, CTO review PASSED 2026-07-10** (all FIVE hashes matched EXACTLY against the live spec's declarations; all four whole-file fences byte-compared against the live files directly — `fence == live` true for each; both CanvasClient swaps + import edit confirmed OLD-gone/NEW-once; the conditional-metadata omission, the best-effort swallow, and the authorized thrown-mode rollback convergence all verified in the live code with their `Object.keys`/"still returns ok" pins present; census + site map (padlets writes 4→2), byte-untouched gates, `git status` five-file scope, grandfather 2→2 all confirmed; unit 175/24, tsc clean, boundaries clean, e2e 27/27 (reviewer's own server), port gate 0/0, `npm run verify` green — all re-run independently, zero disclosure gaps; standing swallow-family decision entry brought current to SEVEN sites, incl. a catch-up for the 032 extension this table had missed) |
| 035 | CanvasClient strangler group 10: the clipart title clear — a NEW seam (`canvas.updatePostTitleBestEffort`: one new repository method `updateTitle`, title-only UNSTAMPED payload matching the legacy statement exactly, one best-effort command — EIGHTH command-internal swallow site; NO honest twin, single consumer, no `Unstamped` suffix since the title family has exactly one legacy shape); exact port in BOTH channels (resolved errors swallowed inside the command with the "still returns ok" pin; thrown re-thrown at the call site via cause-unwrap with NO enclosing try/catch — the same unhandled rejection skipping the same trailing local-state update and four `set*` resets) — NO authorized behavior change anywhere in the patch; the map comments SELECT+UPDATE pair DEFERRED by name (needs a content-carrying conditional write AND a ruling on its paired SELECT: first aggregate read method vs. raw read — its own patch); `.update({ title: '' })` extinction 1→0, `from('padlets')` 3→2 (only the map pair remains non-auth); the now-false "direct supabase update" comment line deleted (disclosed); zero new casts; monolith 8,401→8,400, blank 731→731; 72 bound tests (5 new: 3 domain + 2 infra; 67 existing re-run non-breaking); spec fully SELF-VERIFIED (all five final hashes reconstructed from the spec's own fences, four whole-file bindings byte-equal to the scratch-tested copies) | **GPT-5.4 acceptable** (Pattern K, eleventh application — the narrowest new capability yet: one 15-line repository method, one schema + one command; swap shape tsc --strict verified) | **✅ DONE — `d02196a`, CTO review PASSED 2026-07-10** (all FIVE hashes matched EXACTLY against the live spec's declarations; all four whole-file fences byte-compared against the live files directly — `fence == live` true for each; the import edit + bound block confirmed OLD-gone/NEW-once; the unstamped title-only payload confirmed in the repository (`{ title: fields.title }` only, no `updated_at`); the resolved-error swallow confirmed (Result ignored, unconditional `ok(undefined)`); the thrown-error propagation confirmed at the live call site — no enclosing try/catch, matching the spec's "same unhandled rejection, same skipped lines" ruling exactly; statement order preserved (metadata write → title write → local update); the now-false comment's deletion confirmed, the "ALSO clear" comment byte-identical; `.update({ title: '' })` extinction (1→0) and `from('padlets')` 3→2 both confirmed; census (9 values), lib line/test counts (473/1000/222/372, 54/18), diff deletion shapes (0/0/1/0), byte-untouched gates, `git status` five-file scope, and grandfather 2→2 all confirmed; collision gate 0 outside scoped files; unit 180/24, tsc clean, boundaries clean, e2e 27/27 (reviewer's own warmed server via `PW_BASE_URL`), port gate 0/0, `npm run verify` green — all re-run independently, zero disclosure gaps, FOURTH consecutive fully clean review) |
| 036 | CanvasClient strangler group 11: the map comments read-merge-write — non-auth padlets EXTINCTION (`from('padlets')` 2→0; after this patch CanvasClient's whole supabase surface is the auth trio). THE OWNER-REQUESTED SELECT RULING: the paired `.maybeSingle()` SELECT becomes the aggregate's FIRST read method `findMetadataById` (an RMW-cycle read serving a write command, NOT a rendering read — the hooks-batch deferral governs rendering reads and is untouched; P6 trunk growth; leaving it raw would strand the fetch/merge/not-found semantics untested in JSX). Write-leg ruling: ZERO new write methods — the two field branches are byte-covered by the EXISTING `updateTasks` (comments triple `{metadata, content, updated_at}`) and `updateMetadata` (detached pair), both already caller-stamped; the payload key-order difference and unreachable error messages disclosed; `updateTasks`'s doc comment amended for its second consumer (the patch's ONE deletion line). New command `canvas.updatePostComments` — the program's first MIXED-contract command: read leg HONEST (failure aborts, no write, original error reaches the catch), write leg the NINTH command-internal swallow site; `field` bound by `z.enum(['comments','detachedComments'])` which IS the legacy prop type (MapCanvas.tsx L119), comments `z.array(z.unknown())`, `updatedAt` caller-supplied (shared nowIso, attach precedent); fresh-DB-copy merge + `\|\| {}` not-found collapse pinned; NO authorized behavior change; legacy cast retired (1→0), zero new casts; monolith 8,400→8,384, blank 731→729; 84 bound tests (12 new: 8 domain + 4 infra; 72 existing re-run non-breaking); spec fully SELF-VERIFIED (all five final hashes reconstructed from the spec's own fences) | **GPT-5.4 acceptable** (Pattern K, twelfth application: one read method, one command, one bound block; all shapes tsc --strict verified) | **✅ DONE — `60ed8b6`, CTO review PASSED 2026-07-10** (all FIVE hashes matched EXACTLY against the live spec's declarations; all four whole-file fences byte-compared against the live files directly — `fence == live` true for each; the import edit + bound block confirmed OLD-gone/NEW-once; `findMetadataById` confirmed sending `.select('metadata').eq('id', id).maybeSingle()` and collapsing both a missing row and a null metadata column onto `null` via `data?.metadata ?? null`; the command confirmed honest on the read leg (abort + original-error propagation into the existing catch, no write on failure) and the ninth command-internal swallow on the write leg (resolved ignored, `ok(undefined)` unconditional); the comments/detachedComments payload split confirmed reusing `updateTasks`/`updateMetadata` exactly, with caller-supplied `updatedAt` (shared `nowIso`) on both branches; the call site's existing toast/refetch catch confirmed byte-identical; `from('padlets')` extinction (2→0) and `maybeSingle` extinction (1→0) both confirmed — CanvasClient's non-auth supabase surface is now zero; census (11 values), lib line/test counts (539/1156/246/445, 62/22), diff deletion shapes (1/0/0/0 — the one deletion being the disclosed `updateTasks` doc-comment amendment), byte-untouched gates, `git status` five-file scope, and grandfather 2→2 all confirmed; collision gate 0 outside scoped files; unit 192/24, tsc clean, boundaries clean, e2e 27/27 (reviewer's own warmed server via `PW_BASE_URL`), port gate 0/0, `npm run verify` green — all re-run independently, zero disclosure gaps, FIFTH consecutive fully clean review) |
| 037 | CanvasClient strangler group 12: the auth trio onto `authState.ts` — CanvasClient's DIRECT supabase operations go EXTINCT (`supabase\.auth` 3→0 with the ESCAPED instrument; what remains is client PLUMBING only: the memo + three hand-offs to legacy helpers, deferred by name to the hooks batch). All five owner-requested rulings made in §0: ①ONE coherent seam, no split (sites 2+3 share one useEffect block; all three consume the existing Pattern F authState.ts); ②failure channels EXACT at all three sites — incl. the OBSERVABLE resolved-vs-thrown split at getUser (resolved = signed-out + sessionReady true → "must be logged in" toast downstream; thrown = unhandled rejection + sessionReady false → "Session loading" toast) preserved via Result-with-DELIBERATE-NO-CATCH seam functions + call-site collapse; ③session state ruled a presence indicator (zero field reads, grep-proven), the event path keeps the REAL session via new `onAuthSessionChanged` (structural `AuthSession` subset), the getUser path keeps the fabricated `{ user } as Session` compat object, getUser≠getSession semantics held, client-singleton identity per PATCH-025; ④toast/redirect/retry: none exist, none added; the optimistic L304 mirror stays byte-identical, its fire-and-forget-no-rollback recorded as the swallow family's first AUTH-INFRA sibling; ⑤NO behavior repair requested or granted — the no-catch style exists precisely so nothing changes. New seam surface: `getVerifiedAuthUser` + `onAuthSessionChanged` + `updateCurrentUserMetadata` (P6-ruled vs passwordSecurity's `{ password }`-family wrapper) + domain `AuthSession`; authState's three existing functions and consumers byte-untouched. THREE new named casts + one carried (cast census bound); monolith LINE-NEUTRAL 8,384→8,384 (never-grow holds at equality — the CTO cut a duplicative call-site comment when the first simulation measured +2); 9 bound tests (the repo's FIRST client-factory-mocking test file, `vi.mock('./browserClient')`), compiled and run green at authoring; spec fully SELF-VERIFIED | **GPT-5.5 REQUIRED** (owner standing rule: auth; plus the observable failure-channel split, the first module-mocking harness, and the cross-factory singleton reasoning) | **✅ DONE — `fcf861f`, CTO review PASSED 2026-07-10** (all FOUR hashes matched EXACTLY against the live spec's declarations; all three whole-file fences byte-compared against the live files directly — `fence == live` true for each; all three CanvasClient bound blocks + the import edit confirmed OLD-gone/NEW-once; the three EXISTING authState exports and their three consumers (ProtectedRoute/Navbar/app/page.tsx) confirmed byte-untouched; both `rejects.toBe(networkError)` failure-identity tests present and green, confirming the observable resolved-vs-thrown split is preserved; the call-site collapse (`result.ok ? result.value : null`) and the session/user-state semantics (real session pass-through, fabricated getUser compat object, getUser≠getSession) verified in the live code; cast census confirmed exact (`as Session` 1→2, `as User` 1→3); `supabase\.auth` extinction (3→0, escaped instrument) confirmed — zero direct supabase operations of any kind remain in CanvasClient; census (12 values), lib line/test counts (24/113/172, 9 tests), diff deletion shapes (0/1), byte-untouched gates, four-file scope via `git status`, and grandfather 2→2 all confirmed; collision gates 0 outside scoped files; unit 201/25, tsc clean, boundaries clean, e2e 27/27 (reviewer's own warmed server via `PW_BASE_URL`, incl. board-lifecycle exercising the touched mount/session path), port gate 0/0, `npm run verify` green — all re-run independently, zero disclosure gaps, SIXTH consecutive fully clean review) |
| 038 | HOOKS PHASE OPENER, strangler group 13: the useCanvasInteractions drag-commit family (4 padlets sites: grouped-drag Promise.all position writes, drop-into-container metadata pair, single-drag commit) onto the EXISTING command quartet — the SECOND one-file patch, zero domain/infra/test changes, zero new tests (fidelity net = the existing 62 posts pins, suite re-run 201/25 green at authoring); the full hooks census + SEVEN-family classification recorded in §0.1 (fetchData read quartet / section-recovery cluster / realtime channel CTO-only / lines write family needing a NEW canvas_lines aggregate / padlet-mutation family incl. 4 raw passthroughs / THIS drag-commit family / the 3 client hand-offs each deferred by name); slice ruling: Family 6 is the smallest SAFE slice — all three contracts map onto ESTABLISHED idioms (032's fail-fast Promise.all wrapper, 033's bare-await pair with first-throw-aborts-second, honest check-and-throw) and the single-commit site needs NO convergence authorization (both legacy channels already reach one catch, unlike 034's sibling); all six cache calls (`markPadletLocallyModified`, the realtime-suppression cache) byte-kept; command-internal timestamps per the standing 032+ fact; the hook goes SUPABASE-FREE (dead client + comment + import removed, census 7→0) — the template for every hooks slice that follows; three MUST-NOT-CHANGE hashes bound (CanvasClient/posts.ts/postsRepository.ts); whole-file fence (489 lines) + five-pair edit recipe, both self-verified AND the recipe RECONSTRUCTS the fence hash from the live file — a new spec-consistency check; compile gate ran on the UNREWRITTEN canonical bytes via a scratch tsconfig carrying the repo paths (strongest compile gate yet) | **GPT-5.4 acceptable** (Pattern K, thirteenth application — pure consumer swaps of already-pinned commands, the 033 shape) | **✅ DONE — `5e7c4ea`, CTO review PASSED 2026-07-11** (final hash matched EXACTLY against the live spec's declaration; the whole-file fence byte-compared against the live file — `fence == live` true; the five-pair edit recipe independently reconstructed the fence hash from the git blob at the PRE-EDIT commit `ad14fae` — not the CTO's canonical copy — confirming the spec's own self-verification claim from the live history; all three MUST-NOT-CHANGE hashes (CanvasClient/posts.ts/postsRepository.ts) confirmed unchanged; census confirmed exact (`supabase` 7→0, `.from('padlets')` 4→0, `markPadletLocallyModified` 6, the three command-import counts, `result.error.cause` 2, `userId: null` 4); grouped-drag fail-fast `Promise.all` semantics, the container-pair sequential first-throw-aborts-second ordering, and the single-commit catch convergence (no authorization needed — both legacy channels already reached one catch) all confirmed directly in the byte-matched fence; `git diff --stat` scope confirmed exactly one file (17 insertions/37 deletions); useCanvasData.ts/useCanvasLines.ts/domain/infra/CanvasClient/eslint config all diff-clean between the spec and implementation commits; grandfather 2→2; unit 201/25 (unchanged, zero test changes), tsc clean, boundaries clean, e2e 27/27 (reviewer's own warmed server via `PW_BASE_URL`, incl. board-lifecycle exercising the touched drag paths), port gate 0/0, `npm run verify` green — all re-run independently, zero disclosure gaps, SEVENTH consecutive fully clean review) |
| 039 | HOOKS SLICE 2, strangler group 14: the useCanvasData STAMPED NAMED-MUTATION PAIR (Family 5 contract slice A) — `updatePadletContent` (bare-await swallow: local content mirror runs on a resolved failure, skipped on thrown) + `updatePadletTitle` (check-and-throw, both channels already converged on one catch) onto TWO new sibling seams: repo `updateContent` (`{content, updated_at}`) + `updateTitleStamped` (`{title, updated_at}`, the STAMPED sibling beside the byte-untouched 035 `updateTitle` — the updateMetadata/updateMetadataUnstamped sibling precedent + 037 extension-not-modification), commands `canvas.updatePostContentBestEffort` (TENTH command-internal swallow site) + honest `canvas.updatePostTitle`; NO behavior authorization anywhere; the content site's MISSING realtime suppression preserved by name (do-not-fix); slice ruling recorded in §0.1 incl. the census-derived finding that the workspace micro-slice is BLOCKED by never-grow (+1 import line on the 8,384-line monolith with zero honest offsets — mechanically scanned; rides the lines-family patch which frees CanvasClient's L734 hand-off line); 10 bound tests (6 domain + 4 infra, Object.keys + ISO round-trip + routing pins); hook census `.from('padlets')` 12→10, hook does NOT go supabase-free (19 sites deferred by name); three MUST-NOT-CHANGE hashes (CanvasClient/useCanvasInteractions/useCanvasLines); five whole-file fences + three-pair hook recipe, self-verified INCL. recipe-reconstruction; CTO simulation ran the REAL repo gates on the post-edit tree (tsc clean, boundaries silent, vitest 211/25) then restored byte-exact | **GPT-5.4 acceptable** (Pattern K, fourteenth application — the 034/035 shape: narrow new capability, two consumer swaps, all idioms established) | **✅ DONE — `927c15e`, CTO review PASSED 2026-07-11** (all FIVE hashes matched EXACTLY against the live spec's declarations; all five whole-file fences byte-compared against the live files directly — `fence == live` true for each; the hook's three-pair edit recipe independently reconstructed the fence hash from the git blob at the PRE-EDIT commit `e5d5320` — not the CTO's canonical copy; the pre-edit hashes of all five files at `e5d5320` confirmed matching the spec's §1 bindings, proving the implementer started from the right base; all three MUST-NOT-CHANGE hashes (CanvasClient/useCanvasInteractions/useCanvasLines) confirmed unchanged; `updateContent`/`updateTitleStamped` confirmed as NEW sibling methods with the existing 035 `updateTitle` byte-untouched; `canvas.updatePostContentBestEffort` confirmed swallowing the resolved Result unconditionally (tenth swallow site); `canvas.updatePostTitle` confirmed honest (returns the repository Result directly, no catch); both hook call sites confirmed matching their bound semantics exactly (content mirror runs on resolved failure/skips on thrown; title's optimistic update skipped on either failure channel, both already converging on one catch); census confirmed exact across both lib files and the hook (`.from('padlets')` 12→10, `markPadletLocallyModified` 5→5, all new-symbol counts); collision gates confirmed 0 outside the five scoped files (the two "hits" outside are vendored third-party code, unrelated); no orphan branches/stashes/scratch artifacts survived the CTO's own earlier in-tree simulation — the tree was byte-exact at hand-off; `git diff --stat` scope confirmed exactly five files; useCanvasLines.ts/useCanvasInteractions.ts/CanvasClient/eslint config all diff-clean between the spec and implementation commits; grandfather 2→2; unit 211/25 (matching the bound total, 10 new + 201 existing), tsc clean, boundaries clean, e2e 27/27 (reviewer's own warmed server via `PW_BASE_URL`, incl. board-lifecycle exercising the touched title/content edit paths), port gate 0/0, `npm run verify` green — all re-run independently, zero disclosure gaps, EIGHTH consecutive fully clean review) |
| 040 | HOOKS SLICE 3, strangler group 15: the useCanvasData CONVERGENT INSERT PAIR (Family 5 contract slice B) — `addPadletFromLibraryItem` (bare-await insert, result fully discarded, trailing fetchData() runs on resolved outcomes / skipped on thrown) onto NEW `canvas.createPostBestEffort` (ELEVENTH command-internal swallow site, reuses the pinned `repository.insert` — ZERO infra changes, postsRepository.ts/.test.ts join the MUST-NOT-CHANGE set) + `addDrawingLayoutPadlet` (`if (error) throw` inside try, both channels already converged on its catch) as a PURE CONSUMER SWAP onto the EXISTING honest `canvas.createPost`; NO behavior authorization anywhere; the try-anchored §5c recipe disambiguates from addFreeformCardPadlet's byte-identical insert statement; **`addFreeformCardPadlet` deferred as a flagged OWNER DECISION POINT** — genuinely SPLIT channels (resolved → rollback, thrown → unhandled rejection with NO rollback) cannot be preserved exactly through defineCommand's catch-all; needs either an authorized 034-style convergence repair or the raw-passthrough slice; `updateDrawingLayoutPadlet` (dynamic column passthrough + console.error split) and the 4 raws also deferred by name; 3 bound tests (verbatim row passthrough + identity, swallow pin, non-object validation); validation-channel note disclosed (029 acceptance repeated); hook census `.from('padlets')` 10→8; three-file scope; CTO simulation ran the REAL repo gates on the post-edit tree (tsc clean, boundaries silent, vitest 214/25) then restored byte-exact via `git cat-file blob` per the autocrlf lesson | **GPT-5.4 acceptable** (Pattern K, fifteenth application — one narrow domain addition reusing a pinned repo method + one pure consumer swap) | **✅ DONE — `aabc2e8`, CTO review PASSED 2026-07-11 (post-Amendment-1)** (all THREE final hashes matched EXACTLY against the live spec's declarations; all three whole-file fences byte-compared against the live files directly — `fence == live` true for each; the amended Phase B extractor independently re-executed in an isolated sandbox against seeded garbage files — reproduced the declared hashes and overwrote correctly, confirming Amendment 1's fix actually works, not just reads plausibly; the hook's three-pair edit recipe independently reconstructed the fence hash from the git blob at the PRE-EDIT commit `e4b7248` — not the CTO's canonical copy; `canvas.createPostBestEffort` confirmed swallowing the resolved Result unconditionally (eleventh swallow site); `addPadletFromLibraryItem`'s `fetchData()` confirmed running unconditionally after the throw-check, preserving the legacy ordering exactly; `addDrawingLayoutPadlet` confirmed honest with its catch, rollback filter, and `return null` byte-kept; `addFreeformCardPadlet` confirmed COMPLETELY UNTOUCHED (still the raw split-channel insert) — the §5c try-anchor correctly protected the flagged owner-decision-point site; all five MUST-NOT-CHANGE hashes (postsRepository.ts/.test.ts/CanvasClient/useCanvasInteractions/useCanvasLines) confirmed unchanged; census confirmed exact across both lib files and the hook; collision gate 0 outside the three scoped files; the earlier EOL/extraction failure confirmed to have left ZERO residual byte deviation (`w/lf` on all three touched files, hashes clean); scope confirmed to exactly three files; grandfather 2→2; unit 214/25 (3 new + 211 existing), tsc clean, boundaries clean, e2e 27/27 (board-lifecycle exercising the touched insert paths), port gate 0/0, `npm run verify` green — all re-run independently, zero disclosure gaps, NINTH consecutive fully clean review) |
| 041 | HOOKS SLICE 4, strangler group 16: `addFreeformCardPadlet` onto the EXISTING honest `canvas.createPost` under the program's **FOURTH AUTHORIZED BEHAVIOR MICRO-CHANGE** — the owner delegated the split-vs-converge ruling and the CTO ruled CONVERGENCE (P3: a thrown insert failure previously escaped through catch-less `handleFreeformCardDrop` into the drop handler's L6384 catch and left the optimistic card STRANDED — ghost work that evaporates on refetch; after the patch both failure channels take the legacy resolved channel's silent rollback, exactly the 034 rollback-convergence shape); three consequences disclosed (thrown now rolls back; the outer '❌ Failed to create card from SVG' catch no longer fires for insert failures — keeps its JSON.parse/drawing duties; handleFreeformCardDrop always resolves); consumer analysis exhaustive (ONE call site, nothing branches on the rejection); THIRD one-file patch: zero domain/infra/test/import changes (both factories already imported since 040), the rollback filter byte-kept with only its guard swapped, no rethrow (`result.error.cause` census UNCHANGED at 4 — the convergence pin); four-line AUTHORIZED CONVERGENCE call-site comment (037 placement doctrine); hook census `.from('padlets')` 8→7 (CORRECTED at review from a stale 7→6 — a CTO authoring off-by-one against the true pre-edit tree; the fence hash was never affected), 634→639 lines; seven MUST-NOT-CHANGE hashes; Phase B = the bound mechanical extractor (Amendment-1 procedure, now STANDARD), sandbox-executed at authoring from its own extracted bytes; whole-file fence + explanatory OLD/NEW pair, self-verified incl. recipe reconstruction; CTO simulation ran the real repo gates (tsc clean, boundaries silent, vitest 214/25 unchanged) then restored byte-exact | **GPT-5.4 acceptable** (Pattern K, sixteenth application — single consumer swap of a pinned command; the behavior change is fully specified, not discretionary) | **✅ DONE — `406e3d2`, CTO review PASSED 2026-07-11** (final hash matched EXACTLY against the live spec's declaration; the whole-file fence byte-compared against the live file — `fence == live` true; the hook recipe independently reconstructed the fence hash from the TRUE pre-edit git blob at `725a414`; the bound mechanical extractor RE-EXECUTED independently in an isolated sandbox against a seeded garbage file — reproduced the declared hash and wrote correctly, proving the harness itself works, not just reads plausibly; the exact one-region diff confirmed — rollback filter byte-kept, guard swapped `if (error)` → `if (!result.ok)`, NO rethrow added, ZERO import changes; all seven MUST-NOT-CHANGE hashes confirmed unchanged; `git diff --stat` scope confirmed exactly one file; grandfather 2→2; unit 214/25 (unchanged, zero test changes), tsc clean, boundaries clean, e2e 27/27 (board-lifecycle exercising the touched drop path), port gate 0/0, `npm run verify` green — all re-run independently. ONE finding, disclosed and corrected: the spec's `.from('padlets')` census baseline was off by one throughout (stated 7→6; the true pre-edit tree held 8, true post-edit 7) — a CTO authoring miscount, NOT an implementation defect; the delta was right, only the absolute numbers were wrong, and the authoritative fence hash was correct the whole time. Corrected in the spec and logged as a LESSONS_LEARNED recurrence. TENTH consecutive fully clean review of the IMPLEMENTATION — first review to catch and correct a CTO-side census defect rather than an implementer deviation) |
| 042 | HOOKS SLICE 5, strangler group 17: the RAW-PASSTHROUGH FAMILY onto a fenced Pattern-J infra module — new `lib/infra/supabase/postsRaw.ts` (4 neutral-named functions: insertPostRow / insertPostRowReturning / updatePostRowById / deletePostRowById; NO tests, the workspaceMembers one-line-builder precedent; header fence: SHRINK-ONLY, sole consumer useCanvasData.ts, each function dies when its CanvasClient consumers are extracted onto commands; P6 held — the Result aggregate stays the only surface for NEW callers). CONTRACT RULING: the raws stay RAW — ~25 CanvasClient call sites + one JSX prop hand-off (L5903) destructure `{ data, error }` directly; Result translation would rewrite two dozen consumer contracts in the over-ceiling monolith (the 021 exception applied verbatim). `updateDrawingLayoutPadlet` RIDES BYTE-KEPT: its statement is the same raw dynamic-update shape, so its try/catch/rollback/console.error split survives untouched and the dynamic-schema problem dissolves (no zod, no command). ZERO behavior deltas anywhere; client identity per 025; five hook delegation swaps + import (6 recipe regions); hook 639→635, `.from('padlets')` 7→2 (ONLY Families 1/2 remain), `supabase` 22→18 (import-path substring disclosed); Family 5 FULLY DISPOSITIONED (6 sites onto commands across 039–041 + 5 statements quarantined); eight MUST-NOT-CHANGE hashes incl. workspaceMembers.ts (its placeholder hash caught UNMEASURED at authoring and corrected before splicing — the 041 census lesson applied); bound two-file extractor sandbox-executed at authoring; CTO simulation ran real repo gates (tsc clean — the typed-SupabaseClient consumer-shape gate, boundaries silent, vitest 214/25 unchanged) then restored byte-exact | **GPT-5.4 acceptable** (Pattern K, seventeenth application — five delegation swaps, raw shapes flow through unchanged) | **✅ DONE — `b67e1d7`, CTO review PASSED 2026-07-11** (both final hashes matched EXACTLY against the live spec's declarations; both whole-file fences byte-compared against the live files directly — `fence == live` true for each; the bound two-file mechanical extractor RE-EXECUTED independently in an isolated sandbox against a seeded garbage file — wrote both files correctly and hash-verified each, confirming the harness continues to work under fresh execution; the six-pair hook recipe independently reconstructed the fence hash from the TRUE pre-edit git blob at `204530b`; all four `postsRaw.ts` functions confirmed returning the raw supabase builder directly with zero Result translation — every consumer's `{ data, error }` destructuring stays valid; `updateDrawingLayoutPadlet` confirmed with its FULL contract byte-kept (optimistic merge, try/catch, resolved-error rollback, thrown-error console.error + rollback, the dynamic `updates: any` payload) — only the raw statement itself was swapped; all eight MUST-NOT-CHANGE hashes confirmed unchanged; census confirmed exact across both files incl. the disclosed `supabase` 18 (not 17, import-path substring) and the `insertPostRow` substring-counting note; collision gate 0 outside the two scoped files; `git diff --stat` scope confirmed exactly two files (one new, one modified); grandfather 2→2; unit 214/25 (unchanged, zero test changes), tsc clean, boundaries clean, e2e 27/27 (board-lifecycle exercising the delegated insert/update/delete paths), port gate 0/0, `npm run verify` green — all re-run independently, zero disclosure gaps, ELEVENTH consecutive fully clean review of the implementation; Family 5 now FULLY DISPOSITIONED) |
| 043 | HOOKS SLICE 6, strangler group 18: the fetchData READ QUARTET onto a NEW selector module `lib/infra/canvas/canvasViewReads.ts` — **the canvas_lines aggregate RULING made + the hooks-phase READ idiom set**: rendering reads live in SELECTOR modules; only RMW reads serving a write command join a table's aggregate (the 036 findMetadataById distinction applied — 036 itself reserved rendering reads for the hooks phase); the canvas_lines read therefore does NOT become the future lines aggregate's first method (Family 4's aggregate is born write-side, workspace rider standing); the aggregate-extension alternative REJECTED on measured cost (~16 files: four domain interfaces + every domain-test fake vs THREE files with zero ripple). The differential error contract ported channel-by-channel: sequential ordering (resolved errors let later reads run — all four awaits complete before checks; thrown aborts what follows via the selector's DELIBERATE no-catch, 037 doctrine); canvas/padlet errors console.error + throw the ORIGINAL supabase error via cause-unwrap into the same catch → setError('Failed to load canvas.'); lines error deliberately unthrown (ok-ternary null-collapse; ONE disclosed comment rewording — `lineError` the name no longer exists); sections error never read (dead variable dissolves); board not-found ok(null) → setCanvas(null). FOUR bound double-casts restore the legacy any-flow types (`as unknown as` 1→5); Family 2's ENTIRE recovery cluster byte-untouched (analyzed + deferred in §0.4 with its future shape: array-insert RMW method on the sections aggregate + updatePostMetadataBestEffort loop + byte-kept toast/synthetic fallback); 10 bound tests on the 037 client-factory-mock harness with a thenable+maybeSingle hybrid fake builder; instrument disclosure: the `.from(` census includes the recovery block's `Array.from(` on both sides; suite 214/25 → 224/26 (new test file listed by name); CTO simulation ran the real repo gates (tsc clean — the four casts + all byte-kept downstream consumers against real types, boundaries silent, vitest 224/26) then restored byte-exact; three-file extractor sandbox-executed at authoring | **GPT-5.4 acceptable** (Pattern K, eighteenth application — four identical-shape reads + one contiguous hook region) | **✅ DONE — `3ea2092`, CTO review PASSED 2026-07-11** (all THREE final hashes matched EXACTLY at the commit AND the live tree; all three whole-file fences byte-compared against the COMMITTED files directly — `fence == committed` true for each; the two-pair hook recipe independently reconstructed the fence hash from the TRUE pre-edit git blob at `f22858c` — not the CTO's canonical copy — and the pre-edit hook hash at the parent confirmed matching the spec's §1 binding, proving the implementer started from the right base; the bound THREE-file mechanical extractor RE-EXECUTED independently in an isolated sandbox against three seeded garbage files — wrote all three correctly, every output `git hash-object`-verified; the spec itself confirmed byte-unchanged since authoring; all SIX differential-contract behaviors confirmed directly in the committed code (four sequential awaits complete before the first ok-check at L89; the selector's deliberate no-catch makes a thrown failure abort the reads that follow; canvas/padlet channels log + throw `error.cause ?? error` into the same catch → setError; the lines ok-ternary collapse with the disclosed comment rewording; the sections failure null-collapse matching the never-read legacy `sectionError`; maybeSingle → ok(null) → setCanvas(null)); Family 2's recovery cluster confirmed byte-untouched inside the fence-matched hook; all 10 MUST-NOT-CHANGE hashes confirmed unchanged; full §6.1 census confirmed exact (all 17 instruments incl. the `Array.from(` false-positive and case-sensitive `supabase` 14 disclosures); untouched-file diff gate clean; scope confirmed exactly three files (338 insertions/25 deletions); the stray root `_review_041_extractor.py` gone — tree clean; grandfather 2→2; unit 224/26 (10 new tests run by name), tsc clean, boundaries clean, e2e 27/27 (board-lifecycle exercising the extracted fetchData path), port gate 0/0, `npm run verify` green — all re-run independently, zero disclosure gaps, TWELFTH consecutive fully clean review of the implementation; the hooks-phase READ idiom is now LANDED code) |
| 044 | HOOKS SLICE 7, strangler group 19: the SECTION-RECOVERY CLUSTER (Family 2) — the array insert onto NEW `canvas.createSections` (the sections aggregate's array-insert RMW read-back: `insertSections(fields[])` returning ALL inserted rows, null mirrors the vendor shape; boardId rides once at the command input and is merged per row — a deterministic-compile consequence of TS closure narrowing, disclosed) + the padlet remap loop onto the EXISTING `canvas.updatePostMetadataBestEffort` with the 032 per-element fail-fast wrapper (command instantiated once, the 038 idiom). RULING APPLIED, not new: the read-back is RMW territory per the 043 read idiom — canvasViewReads stays byte-untouched (its fence forbids writes). NO behavior authorization needed anywhere: both insert channels already converge on the recovery catch (038/040 check-and-throw → honest command + cause-unwrap throw); the loop's never-read per-row errors map onto the existing BestEffort command — swallow count stays ELEVEN, no new site; thrown still rejects Promise.all fail-fast into the same catch (incl. the preserved legacy quirk: sections inserted + loop throw still takes the synthetic fallback). Recovery catch + synthetic fallback + toast.warning BYTE-KEPT; missing realtime suppression preserved by name (markPadletLocallyModified 5→5); updated_at command-internal (032+ standing); `return Promise.resolve()` → `return;` disclosed; validation channel per 029. ONE new bound double-cast (`as unknown as` 5→6); hook 632→637, `'board_sections'` 1→0, `'padlets'` 2→1 (realtime table: only), supabase 14→12; structural client gains a thenable+single-chainable `SectionsInsertSelectQuery` (the postsRepository PostsInsertQuery precedent); 6 bound tests (3 domain + 3 infra; suite 224/26 → 230/26, no new file); eleven MUST-NOT-CHANGE hashes; five-file bound mechanical extractor sandbox-executed at authoring; CTO simulation ran the real repo gates (tsc clean, boundaries silent, vitest 230/26) then restored byte-exact; Family 2 DISPOSITIONED | **GPT-5.4 acceptable** (Pattern K, nineteenth application — one narrow aggregate addition with bound tests + one two-region hook swap of established idioms) | **✅ DONE — `f609133`, CTO review PASSED 2026-07-11** (all FIVE final hashes matched EXACTLY at the commit AND the live tree; scope confirmed exactly five files (254 insertions/30 deletions); all five whole-file fences byte-compared against the COMMITTED files directly — `fence == committed` true for each; the three-pair hook recipe independently reconstructed the fence hash from the TRUE pre-edit git blob at `165d086`; the pre-edit hashes of all five files at `165d086` confirmed matching the spec's §1 bindings, proving the implementer started from the right base; the bound FIVE-file mechanical extractor RE-EXECUTED independently in an isolated sandbox against five seeded garbage files — wrote all five correctly, every output `git hash-object`-verified; the spec itself confirmed byte-unchanged since authoring; `insertSections`/`canvas.createSections` confirmed by direct code read — snake_case array payload, resolved errors mapped to `err('unavailable', {cause})`, honest pass-through, all-rows read-back (null-safe); ALL SIX differential-contract channels confirmed directly in the committed code (resolved insert error → `throw insertResult.error.cause ?? insertResult.error` into the same recovery catch; thrown insert failure → same path via defineCommand's own catch-to-err conversion; the padlet loop's resolved per-row errors still silently swallowed inside the UNCHANGED `updatePostMetadataBestEffort`, swallow count held at ELEVEN; a loop-element THROWN failure still rejects `Promise.all` fail-fast into the same recovery catch, preserving the legacy quirk that synthetic fallback fires even after the sections were already inserted; sequential ordering byte-identical; the recovery catch, `syntheticSections`, and `toast.warning` confirmed byte-kept); all ELEVEN MUST-NOT-CHANGE hashes confirmed unchanged; full §9.2 census confirmed exact across all 26 bound instruments (17 hook + 9 domain/infra) incl. the one new bound double-cast (`as unknown as` 5→6) and the `'padlets'` 2→1 realtime-only disclosure; untouched-file diff gate clean; grandfather 2→2; unit 230/26 (6 new tests, no new file — sections.test.ts 11→14, sectionsRepository.test.ts 6→9), tsc clean, boundaries clean, e2e 27/27 (board-lifecycle exercising the extracted recovery path), port gate 0/0 — all re-run independently, zero disclosure gaps against the patch itself, THIRTEENTH consecutive fully clean review of the implementation; Family 2 now FULLY DISPOSITIONED. ONE finding OUTSIDE the patch's scope, disclosed and resolved with owner authorization: two zero-byte UNTRACKED files at `app/collabboard/canvas/create/page.tsx` and `app/collabboard/canvas/[id]/settings/page.tsx` — leftovers matching the route PATCH-022 already deleted for zero user data — broke `npm run verify`'s typecheck step via Next's auto-generated `.next/types` page-type plugin; NOT part of this commit's diff or scope; owner authorized deletion, `npm run verify` then ran clean, `git status` confirms zero trace since the files were never tracked) |
| 045 | HOOKS SLICE 8, strangler group 20: the LINES WRITE FAMILY (Family 4, all five sites across two hooks) onto the NEW write-side canvas lines aggregate — `lib/domain/canvas/lines.ts` + `linesRepository.ts` per the 043 ruling (rendering read stays in canvasViewReads, byte-untouched). Four HONEST commands mirroring the posts naming (`canvas.createLine` plain / `canvas.createLineAndSelect` returning / `canvas.updateLine` dynamic incl. the 18-column saveLineToDb payload — ONE command serves both update sites / `canvas.deleteLine`); row/updates pass VERBATIM as `object` (postRowSchema precedent — two payloads are dynamic); updated_at command-internal (032+ standing). **NEW RULED IDIOM — call-site channel discrimination**: the owner ordered every split resolved-vs-thrown channel preserved, so `useCanvasLines.createLine` (resolved → byte-kept temp-line fallback; thrown → rethrow `cause` into the byte-kept console.error catch) and `duplicateLine` (resolved → byte-kept rollback; thrown → silent, optimistic line kept) discriminate on `result.error.code` — repos map resolved errors to 'unavailable', defineCommand maps throws to 'unknown' (core/command.ts MUST-NOT-CHANGE; pinned by a bound thrown-mode test). NO BestEffort anywhere — the three both-channels-swallowed sites (saveLineToDb/updateLine/deleteLine) become honest commands with the Result deliberately unread behind bound PRESERVED-LEGACY-SWALLOW comments (swallow family HELD at eleven; this shape also preserves the saveEnd debug-logger firing only on TRUE success, which BestEffort would break). Temp-line guards, optimistic-first ordering, and both live try/catches byte-kept; the three dead try/catch shells removed. **useCanvasLines goes SUPABASE-FREE** (param retired: interface + destructure + deps); **the workspace rider LANDS**: CanvasClient's freed L734 `supabase,` hand-off (−1) funds the `resolveCurrentWorkspace(supabase, user)` → existing `resolveWorkspaceForUser(user)` swap + import (+1) — **8,384 → 8,384, never-grow at EQUALITY**; resolveCurrentWorkspace EXTINCT in CanvasClient. CanvasClient edited ONLY by the bound extractor (six whole-file fences + three single-occurrence CanvasClient replacements with pre/post hash asserts — the extractor's first hybrid application). postsRaw RULED not this seam (padlets table; per-consumer shrink-down stays queued); realtime byte-untouched, CTO-only. ONE new bound double-cast (useCanvasLines 0→1; useCanvasData 6→6 zero new); disclosures: CanvasClient supabase 30→29 (import-path substring, 042 class), useCanvasData `.from(` 5→1 (Array.from survivor), the new comment's "temp-line" wording. 15 bound tests (9 domain + 6 infra; suite 230/26 → 245/28); sixteen MUST-NOT-CHANGE hashes; CTO simulation ran the real repo gates (tsc clean, boundaries silent, vitest 245/28) then restored byte-exact; ONE slice — the seam is a single dependency chain (aggregate → swaps → retirement → freed line → rider), no PATCH-046 | **GPT-5.4 acceptable** (Pattern K, twentieth application — bound tests carry the new idiom; the CanvasClient edit is fully mechanical) | **✅ DONE — `dee1708`, CTO review PASSED 2026-07-11** (dual review: an independent read-only GLM-5.2 review reported PASSED first; the CTO then re-ran every bound gate from scratch rather than accepting the GLM evidence — all SEVEN final hashes exact at the commit AND the live tree incl. CanvasClient `620cc9ac` at exactly 8,384 lines (never-grow at EQUALITY); all six whole-file fences byte-compared against the COMMITTED files; all three pre-edit bases confirmed at the parent `03f75d5`; all THREE recipe reconstructions (three-pair CanvasClient, five-pair useCanvasData, four-pair useCanvasLines) rebuilt the final hashes from the TRUE parent blobs; the bound HYBRID extractor re-executed in an isolated sandbox against six seeded garbage files + a REAL pre-edit CanvasClient copy — all seven outputs `git hash-object`-verified; all sixteen MUST-NOT-CHANGE hashes held; both channel-discrimination guards read directly in the committed code (createLine: `code === 'unknown'` → rethrow cause into the byte-kept catch; duplicateLine: `code !== 'unknown'` → byte-kept rollback, thrown stays silent); full census exact on every bound instrument incl. useCanvasLines SUPABASE-FREE (0), useCanvasData `.from(` 1 (Array.from survivor), CanvasClient supabase 29 (import-path substring disclosure), resolveCurrentWorkspace EXTINCT, resolveWorkspaceForUser 2; untouched-file diff gate clean; exact seven-file scope (580 insertions/48 deletions); grandfather 2→2; unit 245/28 (both new files run by name), tsc clean, boundaries clean, e2e 27/27 on the CTO's own warmed server, port gate 0/0, `npm run verify` green, no PATCH-046, extractor script removed. **The GLM port-3100 inconsistency reconciled by direct measurement**: the spec's authoritative §11.4 gate is port 3000; the CTO independently confirmed 0 listeners before AND after its own server run — the "3100" reference matches no bound gate and is a reviewer-report artifact, not an implementation defect. Zero disclosure gaps. FOURTEENTH consecutive fully clean review; **Family 4 FULLY DISPOSITIONED; the hooks read+write extraction of canvas/padlets/lines/sections tables is complete**) |
| 046 | HOOKS SLICE 9, strangler group 21: RETIRE the FreeformGraphRepo CLIENT HAND-OFF — new one-line factory `createFreeformGraphRepo(boardId)` in `lib/graph/graphRepo.ts` (supplies `createBrowserSupabaseClient()` = the SAME auth-helpers cookie client as CanvasClient's `supabaseBrowser()` memo, the 025 identity re-verified at authoring) + CanvasClient's construction/import/deps swapped onto it (three line-neutral extractor replacements — **8,384 → 8,384, never-grow at EQUALITY**; `new FreeformGraphRepo` EXTINCT there, supabase 29→27). **RULING: Result-translation REJECTED** — the class is ALREADY the isolated seam (pre-domain-layer repository, P6-single, outside the boundary lint like workspace/context) with a rich graceful-degradation contract (isTableUnavailable state machine, 42P01 detection, synthetic fallback rows, PGRST116 tolerance, throw-through) consumed by two component trees; translating would rewrite all of it for zero strangler gain. **The class body is BYTE-KEPT** (whole-file fence = pure append: one import line + the factory; `.from(` 5→5, isTableUnavailable 11→11 pinned). **FreeformGraphLayer DEFERRED BY NAME with a hash-bound MUST-NOT-CHANGE**: it constructs with the LEGACY `lib/supabase` singleton — a DIFFERENT session identity (the lib/supabase vs lib/supabase/browser duality); swapping it onto the cookie factory would be a behavior change needing an owner client-identity ruling, and it is rendered by FreeformPadletCards (LAST), so the question rides that phase; the factory's doc comment fences it. Stale commitPadletMeta `supabase` dep untouched (out of seam); postsRaw per-consumer, realtime CTO-only. NO tests (one-line builder, the 021/042 precedent); suite stays 245/28; substring disclosure: `createFreeformGraphRepo` contains `FreeformGraphRepo` — the extinction instrument is `new FreeformGraphRepo`. Twelve MUST-NOT-CHANGE hashes; hybrid extractor (1 whole file + 3 CanvasClient replacements) sandbox-executed at authoring against garbage + a REAL pre-edit CanvasClient; CTO simulation ran the real gates (tsc clean, boundaries silent, vitest 245/28) then restored byte-exact; TWO files, one seam, no PATCH-047 | **GPT-5.4 acceptable** (Pattern K, twenty-first application — additive factory + three mechanical line-neutral swaps) | **✅ DONE — `e04e2f3`, CTO review PASSED 2026-07-11** (both final hashes matched EXACTLY at the commit AND the live tree; exact two-file scope (17 insertions/3 deletions); the graphRepo whole-file fence byte-compared against the COMMITTED file — `fence == committed` true; all three CanvasClient regions confirmed individually by direct read (import, construction, and deps line each match the bound NEW text exactly, OLD text absent); pre-edit bases confirmed at the parent `2cacf51`; the graphRepo append-recipe and the CanvasClient three-pair recipe both reconstructed the bound final hashes from the TRUE parent blobs (a reviewer-script separator bug was caught and fixed mid-review — a reviewer measurement mistake, not a spec or implementation defect, since the bound extractor itself only hash-asserts the whole-file fence directly and had already passed); the bound hybrid extractor RE-EXECUTED independently in an isolated sandbox against a garbage graphRepo.ts and a REAL pre-edit CanvasClient copy — both outputs hash-verified; all twelve MUST-NOT-CHANGE hashes confirmed unchanged, incl. `FreeformGraphLayer.tsx` read directly and confirmed STILL constructing `new FreeformGraphRepo(supabase, boardId)` with the legacy `lib/supabase` singleton; the class body confirmed byte-untouched by direct read (constructor, all four normalize helpers, all five methods with isTableUnavailable/42P01/PGRST116/synthetic-fallback/throw-through all intact) — NO Result translation anywhere; census confirmed exact on all ten bound instruments incl. the `FreeformGraphRepo`-substring disclosure; collision gate showed only the two intended sites; untouched-file gate clean; CanvasClient confirmed at EXACTLY 8,384 lines — never-grow held at equality; grandfather 2→2; unit 245/28 (unchanged), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the CTO's own warmed server, port gate independently confirmed 0 BEFORE and AFTER, `npm run verify` green, extractor script removed, no PATCH-047 — all re-run independently, zero disclosure gaps, FIFTEENTH consecutive fully clean review) |
| 047 | HOOKS SLICE 10, strangler group 22: FreeformGraphLayer onto the cookie-client factory — **the OWNER-DELEGATED client-identity ruling: MIGRATE (the program's FIFTH authorized behavior micro-change)**. Evidence chain: `lib/supabase.ts` is a plain `createClient(url, anonKey)` (localStorage session store), session-LESS under the app's live cookie-based auth (025/037); both freeform_graph tables are RLS-enabled and auth.uid()-gated (`can_access_board`/`can_edit_board`); consequence — a SPLIT-BRAIN where CanvasClient's cookie-client writes succeeded but the rendering layer's anon-client `getEdges` read RLS-filtered to `[]` (created edges never rendered) while its own bare-await writes (`updateEdge`/`handleMouseUp` label-drag/`deleteEdge`, all pre-existing catch-less) died as unhandled 42501 rejections with their post-await `setEdges`/cleanup never running — silent user-work loss, a P3 repair. Full consequence table bound (§0.2): reads now render truthfully (RLS still enforces for unauthorized viewers — no new exposure, only identity correction); all three writes now persist with their BYTE-KEPT post-await state updates finally running; the `isTableUnavailable`/42P01 degradation machinery UNTOUCHED. TWO files: the layer's two legacy import lines collapse to the factory import + the `useMemo` construction swaps with a one-line pointer comment (**493→493, deps already `[boardId]` byte-kept, never-grow at EQUALITY** — the over-400-line component ceiling); layer goes LEGACY-CLIENT-FREE (`supabase` 2→0). graphRepo.ts gets a COMMENT-ONLY edit (the factory's fencing doc now records the ruling instead of forbidding it — leaving it stale would be a P0 doc bug); class + factory bodies byte-kept (`.from(` 5→5, isTableUnavailable 11→11). NOT this seam: postsRaw shrink-down (padlets, untouched); FreeformPadletCards (byte-untouched, hash-bound — it renders the layer but its own bytes don't change); realtime CTO-only; `lib/supabase.ts` itself stays (its other consumers are deferred dualities). NO tests (nothing newly testable in lib); suite stays 245/28. Eight MUST-NOT-CHANGE hashes; two-file bound extractor sandbox-executed at authoring; CTO simulation ran the real gates (tsc clean, boundaries silent, vitest 245/28) then restored byte-exact; TWO files, one seam, no PATCH-048 | **GPT-5.4 acceptable** (Pattern K, twenty-second application — two whole-file fences, the behavior change fully specified not discretionary) | **✅ DONE — `12f30b9`, CTO review PASSED 2026-07-11** (both final hashes matched EXACTLY at the commit AND the live tree; exact two-file scope (9 insertions/7 deletions); both whole-file fences byte-compared against the COMMITTED files directly — `fence == committed` true for each; pre-edit bases confirmed at the parent `3010781`; BOTH recipe reconstructions (the layer two-pair, the graphRepo one-pair) rebuilt the bound final hashes from the TRUE parent blobs; the bound two-file extractor RE-EXECUTED independently in an isolated sandbox against seeded garbage — both outputs `git hash-object`-verified; all eight MUST-NOT-CHANGE hashes confirmed unchanged, incl. no changes anywhere under `supabase/` (no RLS or migration edits — confirming no access broadening, only client-identity correction); the legacy `lib/supabase` import and the raw `new FreeformGraphRepo` construction confirmed EXTINCT from the layer by direct read; `createFreeformGraphRepo(boardId)` confirmed invoked EXACTLY ONCE with deps EXACTLY `[boardId]`; the `FreeformGraphRepo` class body AND the `createFreeformGraphRepo` factory body both confirmed byte-untouched by direct read — the `isTableUnavailable` state machine, 42P01/does-not-exist detection, synthetic fallback objects, both console warnings, and every throw-through channel all intact, NO Result translation anywhere; postsRaw and FreeformPadletCards confirmed untouched via the untouched-file diff gate; census confirmed exact on all eleven bound instruments; collision gate showed only the three legitimate consumer sites; CanvasClient confirmed via hash unaffected; layer confirmed at EXACTLY 493 lines; grandfather 2→2; unit 245/28 (unchanged), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed server, port gate independently confirmed 0 BEFORE and AFTER, `npm run verify` green, extractor script removed, no PATCH-048 anywhere in `patches/` — all re-run independently against the LIVE on-disk spec, zero disclosure gaps. The two pre-existing warnings the owner flagged (Next.js workspace-root lockfile inference; `cookies()` sync dynamic API on `/api/auth/login`) both appeared in this run too but are OUTSIDE this patch's two-file scope (graph client identity only) and are correctly NOT attributed as PATCH-047 defects. SIXTEENTH consecutive fully clean review; the graph client-identity duality is now fully closed) |
| 048 | HOOKS SLICE 11, strangler group 23: the postsRaw CONSUMER SHRINK-DOWN begins — `updateDrawingLayoutPadlet` onto NEW `canvas.updatePostFields` (HONEST, UNSTAMPED dynamic verbatim passthrough via new `PostsRepository.updateFieldsById(id, fields: object)`; the updateMetadataUnstamped no-stamp precedent generalized; the structural update-payload union gains `| object` — disclosed absorption, named shapes stay as docs). **The census-driven ruling pair**: ① the FOUR pure passthroughs (`insertPadlet`/`insertPadletAndSelectSingle`/`updatePadletById`/`deletePadletByIdRaw`) STAY RAW — their ~24 CanvasClient `{ data, error }` call sites + the L5903 JSX prop are the FreeformPadletCards-phase strangling, and NO postsRaw export retires yet (`postsRaw.ts` hash-bound UNCHANGED in the MUST-NOT-CHANGE set); ② the per-consumer translation ruling the owner required: AUTHORIZED for updateDrawingLayoutPadlet ONLY — the one consumer whose raw contract terminates INSIDE the hook (returns void; CanvasClient callers see zero difference) — and NOT a behavior change: resolved `{ error }` → byte-kept SILENT rollback; thrown → rethrow cause via `code === 'unknown'` (the 045 discrimination) into the byte-kept `console.error('Failed to update padlet:')` + rollback catch; optimistic merge/markPadletLocallyModified/ordering byte-kept; NO stamp on the wire (fields pass by REFERENCE, test-pinned). After this patch the boundary is clean: postsRaw = CanvasClient's raw surface ONLY (hook consumer set 5→4, `updatePostRowById` census 3→2 with the updatePadletById route untouched). 6 bound tests (4 domain incl. the thrown→'unknown'+cause pin + same-reference/no-stamp Object.keys pin, 2 infra); suite 245/28 → 251/28 (no new file: posts.test 71→75, postsRepository.test 26→28); fourteen MUST-NOT-CHANGE hashes headed by postsRaw.ts itself; five-file bound extractor sandbox-executed at authoring; CTO simulation ran the real gates (tsc clean incl. the union absorption, boundaries silent, vitest 251/28) then restored byte-exact; FIVE files, one seam, no PATCH-049 | **GPT-5.4 acceptable** (Pattern K, twenty-third application — one narrow domain addition with bound tests + one hook-region swap of the established 045 idiom) | **✅ DONE — `150d664`, CTO review PASSED 2026-07-12** (independently re-derived against the LIVE on-disk spec, not the implementer's report; all FIVE final hashes matched EXACTLY at the commit AND the live tree; exact five-file scope confirmed via `git show --name-only` (164 insertions/3 deletions); all five whole-file fences byte-compared against the COMMITTED files directly — `fence == committed` true for each; the hook's TRUE pre-edit blob at the parent `150d664^` confirmed matching the spec's §1 binding (`3cc658c6...`), and the two-pair recipe reconstruction from that TRUE blob rebuilt the bound final hash exactly; the bound five-file mechanical extractor RE-EXECUTED independently in an isolated sandbox against five seeded garbage files — all five outputs `git hash-object`-verified; all fourteen MUST-NOT-CHANGE hashes held, headed by `postsRaw.ts` itself confirmed byte-untouched, proving no export retired and the four raw passthroughs (`insertPadlet`/`insertPadletAndSelectSingle`/`updatePadletById`/`deletePadletByIdRaw`) stayed raw exactly as ruled; the channel-discrimination guard (`code === 'unknown'` → rethrow cause into the byte-kept console.error+rollback catch; resolved → byte-kept silent rollback) confirmed directly in the committed hook code, matching the bound 6-test pin set (verbatim same-reference + Object.keys no-stamp; 'unavailable' passthrough; thrown→'unknown'+cause; non-object→'validation' without a repo call); the `| object` union absorption confirmed as the ONLY structural change to the client interface; full §9.2 census confirmed exact across all 19 bound instruments incl. `updatePostRowById` 3→2, `updatePostFields` lowercase 2, `defineCommand` 32; untouched-file diff gate clean (postsRaw/CanvasClient/FreeformPadletCards/useCanvasLines/useCanvasInteractions/canvasViewReads/sections/lines/command.ts/graphRepo/FreeformGraphLayer all confirmed zero-diff); grandfather 2→2; unit 251/28 (6 new tests, no new file), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed server, port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green — all re-run independently, zero disclosure gaps, SEVENTEENTH consecutive fully clean review of the implementation. The postsRaw consumer set is now 4 (down from 5 at authoring); FreeformPadletCards remains last. No PATCH-049 drafted, per instruction) |
| 049 | HOOKS SLICE 12, strangler group 24: postsRaw's FIRST export death — `deletePostRowById` retired via NEW hook contract helpers onto the already-landed `canvas.deletePost` (PATCH-028; zero new domain/infra surface). **The census-driven slice ruling**: of the four remaining raw passthroughs, `deletePadletByIdRaw` is the smallest (3 CanvasClient sites, 2 legacy contracts, zero entanglement with the FreeformPadletCards-deferred `updatePadletById` JSX prop at L5903) — the other three passthroughs and the JSX prop STAY RAW, untouched (021/042 re-affirmed). TWO new hook helpers carry the two legacy contracts (the established per-site-semantics-in-the-hook direction): `deletePostSwallowResolved` (the compensating child delete at two CanvasClient sites — PRESERVED LEGACY SWALLOW, call-site class not command-internal, command-internal family stays ELEVEN: a RESOLVED failure is silently ignored so the pending container throw proceeds, a THROWN failure's `code==='unknown'` rethrows its cause at the same position) and `deletePostOrThrow` (the map-pin container delete — both legacy channels already converged, so ANY failure rethrows its cause, the 038/040 check-and-throw port). `postsRaw.ts` loses its first export (44→48→44 net; header fence doc records the death, the 047 graphRepo precedent for keeping fencing docs truthful); CanvasClient edited ONLY by the bound extractor (five single-occurrence replacements: the destructure, two line-neutral compensating-delete swaps, the map-pin 2-lines→1-line swap, and its deps array) — **8,384 → 8,383, the FIRST SHRINK below the never-grow plateau held at equality since PATCH-045**. Disclosures: `deletePostRowById(` the paren-instrument 2→0 repo-wide (the plain-name grep reads 1→1, comment-only trap); `containerError` 6→4 (site C's two lines die); hook `code === 'unknown'` 1→2. NO new tests (zero new domain/infra surface — `canvas.deletePost`/`SupabasePostsRepository.deleteById` already pinned at PATCH-028); suite stays 251/28. Sixteen MUST-NOT-CHANGE hashes; three-file bound extractor (2 whole files + 5 CanvasClient replacement pairs) sandbox-executed at authoring against garbage + a REAL pre-edit CanvasClient; CTO simulation ran the real gates (tsc clean, boundaries silent, vitest 251/28 unchanged) then restored byte-exact; THREE files, one seam, no PATCH-050 | **GPT-5.4 acceptable** (Pattern K, twenty-fourth application — zero new domain surface, two whole-file fences + five mechanical CanvasClient swaps) | **✅ DONE — `77ba410`, CTO review PASSED 2026-07-12** (independently re-derived against the LIVE on-disk spec, not the implementer's report; all THREE final hashes matched EXACTLY at the commit AND the live tree; exact three-file scope confirmed via `git show --name-only`; both whole-file fences byte-compared against the COMMITTED files directly — `fence == committed` true for each; all FIVE CanvasClient replacement pairs individually verified — each OLD text confirmed ABSENT from the live file and each NEW text confirmed present EXACTLY ONCE; CanvasClient's TRUE pre-edit blob at the parent `77ba410^` confirmed matching the spec's §1 binding, and reconstructing all five pairs in application order from that TRUE blob rebuilt the bound final hash exactly, with the line count independently confirmed 8,384→8,383 (the first shrink below the never-grow plateau held at equality since PATCH-045); the bound three-file mechanical extractor RE-EXECUTED independently in an isolated sandbox against two seeded garbage files plus a REAL pre-edit CanvasClient copy — all three outputs `git hash-object`-verified; all sixteen MUST-NOT-CHANGE hashes held; `deletePostRowById(` (the paren-instrument) confirmed EXTINCT repo-wide (0 occurrences) and `deletePadletByIdRaw` confirmed EXTINCT repo-wide, while the three surviving postsRaw exports (`insertPostRow`, `insertPostRowReturning`, `updatePostRowById`) were confirmed still present by direct read — postsRaw's consumer set is now 4→3; both new hook helpers confirmed by direct read matching their bound contracts EXACTLY (`deletePostSwallowResolved`: a resolved failure — `code !== 'unknown'` — falls through with NO throw, silently swallowed; a thrown failure's `code === 'unknown'` rethrows `result.error.cause ?? result.error` at the same position; `deletePostOrThrow`: ANY `!result.ok` rethrows `result.error.cause ?? result.error` — both legacy channels converge, exactly as bound); the command-internal swallow family independently recounted at ELEVEN (unchanged — the two new helpers' swallow is call-site class, confirmed NOT folded into it); `insertPadlet`/`insertPadletAndSelectSingle`/`updatePadletById` and the L5902 JSX prop hand-off (`updatePadletById={updatePadletById}`) confirmed untouched by direct read; FreeformPadletCards confirmed untouched via its MUST-NOT-CHANGE hash; full census confirmed exact across all 23 bound instruments; untouched-file diff gate clean; grandfather held at 2; unit 251/28 (unchanged, zero test changes — zero new domain/infra surface needed), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed server (incl. board-lifecycle exercising the extracted delete paths), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green — all re-run independently, zero disclosure gaps, EIGHTEENTH consecutive fully clean review of the implementation. postsRaw's first export has died; three raw passthroughs remain, all deferred to the FreeformPadletCards phase. No PATCH-050 drafted, per instruction) |
| 050 | HOOKS SLICE 13, strangler group 25: postsRaw's SECOND export death — `insertPostRowReturning` retired via ONE hook contract helper onto the already-landed `canvas.createPostAndSelect` (PATCH-029; zero new domain/infra surface) — **plus the census CORRECTION that answered the owner's phase question**. The owner asked: retire one more family, or formally begin the FreeformPadletCards strangler because the remaining raw contracts are inseparable from that boundary? **The fresh census PROVED the premise false**: the long-standing "L5903 JSX prop → FreeformPadletCards" attribution (carried since 042) is WRONG — the live receiver of `updatePadletById={updatePadletById}` is **`<CanvasModals`** (CanvasClient L5854; typed prop L85, destructured L115, TWO raw `{ error }` call sites L281/L312 — a previously-undisclosed prop-plumbed raw consumer, now hash-bound MUST-NOT-CHANGE), and **FreeformPadletCards contains ZERO references to any postsRaw passthrough** — grep-verified, no postsRaw coupling at all. RULING: retire the smallest family now (`insertPadletAndSelectSingle`, 5 sites < updatePadletById 7+prop+2 < insertPadlet 8); FreeformPadletCards stays LAST on its own merits (the 6.4k monolith), NOT because of postsRaw; the future updatePadletById slice must include CanvasModals. ONE helper `insertPostAndSelectOrThrow(row): Promise<any>` carries all five sites — every site's two failure channels ALREADY converge (each `if (error) throw error` / `throw error \|\| new Error(...)` feeds the same catch a thrown builder rejection reaches), so ANY failure rethrows its original cause (the 038/040 check-and-throw port, NO discrimination guard, NO behavior authorization); site 1's null-row guard stays AT THE SITE with the same message ('Insert returned no data'); `Promise<any>` restores the legacy raw any-flow (043 precedent) so every byte-kept downstream consumer (`created.id`, `data as Padlet`, `data?.id`) compiles unchanged. CanvasClient edited ONLY by the bound extractor (EIGHT single-occurrence replacements: destructure, site 1 2→2, sites 2/3/4 each 3→2, site 5 open 1→1 + close 3→2, deps) — **8,383 → 8,379 (−4)**. Disclosures: `insertPostRowReturning(` paren-instrument 2→0 repo-wide (plain-name 1→1 comment trap, the 049 class); CC `insertPadlet` substring 17→11; CC `if (error) throw error;` 6→2; hook `insertPostRow` substring 4→2; CC `createCreatePostAndSelectCommand` 4→4 (pre-existing sites untouched). NO new tests (zero new surface); suite stays 251/28; NO new swallow (everything throws — command-internal family stays ELEVEN). SEVENTEEN MUST-NOT-CHANGE hashes (CanvasModals joins); three-file bound extractor (2 whole files + 8 CC pairs) sandbox-executed at authoring against garbage + a REAL pre-edit CanvasClient; CTO simulation ran the real gates (tsc clean incl. the any-flow restoration, boundaries silent, vitest 251/28 unchanged) then restored byte-exact; THREE files, one seam, no PATCH-051 | **GPT-5.4 acceptable** (Pattern K, twenty-fifth application — zero new domain surface, two whole-file fences + eight mechanical CC swaps) | **✅ DONE — `112d4d9`, CTO review PASSED 2026-07-12** (independently re-derived against the LIVE on-disk spec, not the implementer's report; all THREE final hashes matched EXACTLY at the commit AND the live tree; exact three-file scope confirmed via `git show --name-only`; both whole-file fences byte-compared against the COMMITTED files directly — `fence == committed` true for each; all EIGHT CanvasClient replacement pairs individually verified — each OLD text confirmed ABSENT from the live file and each NEW text confirmed present EXACTLY ONCE (one reviewer-script false alarm caught and fixed mid-review: a naive substring count double-matched site 4's 6-space NEW text as an embedded substring of site 3's 10-space line — a line-anchored recount showed both sites correctly distinct; reviewer measurement mistake, not an implementation defect); CanvasClient's TRUE pre-edit blob at the parent `112d4d9^` confirmed matching the spec's §1 binding, and reconstructing all eight pairs in application order from that TRUE blob rebuilt the bound final hash exactly, with the line count independently confirmed 8,383→8,379 (−4); the bound three-file mechanical extractor RE-EXECUTED independently in an isolated sandbox against two seeded garbage files plus a REAL pre-edit CanvasClient copy — all three outputs `git hash-object`-verified; all seventeen MUST-NOT-CHANGE hashes held, incl. the newly-disclosed `CanvasModals.tsx`; `insertPostRowReturning(` (the paren-instrument) confirmed EXTINCT repo-wide and `insertPadletAndSelectSingle` confirmed EXTINCT repo-wide, while the two surviving postsRaw exports (`insertPostRow`, `updatePostRowById`) were confirmed still present by direct read — postsRaw's export count is now 2, down from 3; the new hook helper confirmed by direct read matching its bound contract EXACTLY (`insertPostAndSelectOrThrow`: ANY `!result.ok` rethrows `result.error.cause ?? result.error`; on success returns `result.value` — the raw row-or-null — verbatim; `Promise<any>` signature matches the bound any-flow restoration); all five CanvasClient call sites confirmed directly matching the bound port (site 1's null-row guard stays AT THE SITE with the exact legacy message 'Insert returned no data'; sites 2–4 keep `if (data)` byte-kept below; site 5 keeps `data?.id` reads and `fetchData()` ordering byte-kept); the command-internal swallow family unaffected (no new swallow — every failure throws); `insertPadlet`, `updatePadletById`, and `CanvasModals.tsx` confirmed untouched by direct read/hash; FreeformPadletCards confirmed untouched via its MUST-NOT-CHANGE hash; full census confirmed exact across all 22 bound instruments; untouched-file diff gate clean; grandfather held at 2; unit 251/28 (unchanged, zero test changes — zero new domain/infra surface needed), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed server (incl. board-lifecycle exercising the extracted insert paths), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green — all re-run independently, zero disclosure gaps, NINETEENTH consecutive fully clean review of the implementation. postsRaw's second export has died; two raw passthroughs remain (`insertPadlet`, `updatePadletById`), the latter now correctly understood to route through CanvasModals as well as CanvasClient. No PATCH-051 drafted, per instruction) |
| 051 | HOOKS SLICE 14, strangler group 26: postsRaw's THIRD export death — `insertPostRow` retired via TWO hook failure-contract helpers onto the already-landed `canvas.createPost` (PATCH-025; zero new domain/infra/test surface). Slice ruling (per the 050 census correction): `insertPadlet`/`insertPostRow` is the smaller surviving family (8 CanvasClient sites) vs. `updatePadletById`/`updatePostRowById` (7 sites + the CanvasModals prop + 2 raw CanvasModals receivers) — the insert family goes first, update stays deferred with CanvasModals correctly in scope for its own slice. TWO helpers split the eight sites by their PRE-EXISTING failure contract, not a new ruling: `insertPostOrThrow` (six standalone check-and-throw sites + the ordered drawing container/child pair, 8 calls total) — both raw channels already converged in each legacy catch, so ANY failure rethrows `cause ?? error`; `insertPostPreservingFailureChannels` (the freeform-column and map-pin JSX callbacks, 2 call sites) — these two are NOT check-and-throw: a resolved error historically fed a LOCAL rollback branch while a thrown rejection ESCAPED uncaught, so the helper only rethrows when `code === 'unknown'` and otherwise returns the Result itself, preserving the exact resolved-vs-thrown split at each call site (verified by direct read: both sites have no enclosing try/catch, so the 'unknown' rethrow correctly reproduces the legacy escape). CanvasClient edited by 9 replacement pairs (8 call-site swaps + destructure; the drawing pair and both convergent empty-container sites collapse their separate `if (error) throw` lines) — **8,379 → 8,375 (−4)**; `insertPostRow` extinct (postsRaw exports 2→1, ONLY `updatePostRowById` remains). NO new tests (zero new surface); suite stays 251/28; NO new swallow (everything throws or returns a Result — command-internal family unaffected). Seventeen MUST-NOT-CHANGE hashes (CanvasModals held over from 050); a 25-fence bound extractor (1 whole postsRaw file + 12 OLD/NEW pairs, applied across hook then CanvasClient) sandboxed at authoring; CTO simulation ran the real gates before delegation. Authored `ff74d52` → 2026-07-12, then AMENDED at `411f96e` after an implementation hold: the amendment narrowed two gates only — the scope-check now uses explicit pathspecs (so the pre-existing untracked spec file doesn't block the implementation commit) and the retired-identifier census switched to an exact `rg`-word-boundary instrument (excluding unrelated suffix identifiers like `insertPadletEmbeddable`) — no bound hash, fence, or behavior contract changed in the amendment. THREE files, one seam, no PATCH-052 | **GPT-5.4 acceptable** (Pattern K; existing command only) | **✅ DONE — `1de1eb7`, CTO review PASSED 2026-07-12** (independently re-derived against the LIVE on-disk spec incl. its amendment `411f96e`, not the implementer's report; all THREE final hashes matched EXACTLY at the commit AND the live tree; exact three-file scope confirmed via `git show --name-only` on `1de1eb7` — spec committed separately at `411f96e`, matching the amendment's explicit-pathspec instruction; all 25 TS fences present and individually verified — the whole postsRaw fence byte-compared against the committed file, all 12 OLD/NEW pairs confirmed absent-then-present against the live files; the hook's and CanvasClient's TRUE pre-edit blobs at the parent `1de1eb7^` confirmed matching the spec's §1 bindings, and reconstructing all 3 hook pairs + 9 CanvasClient pairs (pair 5 correctly occurring TWICE) from those TRUE blobs rebuilt both bound final hashes exactly, independently confirming CanvasClient's 8,379→8,375 delta; the bound 25-fence extractor RE-EXECUTED independently in an isolated sandbox against the real pre-edit postsRaw/hook/CanvasClient content — all three outputs `git hash-object`-verified, rc 0; all seventeen MUST-NOT-CHANGE hashes held; both new hook helpers confirmed by direct read matching their bound contracts EXACTLY (`insertPostOrThrow`: any `!result.ok` rethrows `cause ?? error`; `insertPostPreservingFailureChannels`: rethrows ONLY when `code === 'unknown'`, otherwise returns the Result — and BOTH its call sites confirmed to have no enclosing try/catch, so the 'unknown' rethrow correctly reproduces the legacy escape-uncaught behavior while a resolved failure correctly enters the byte-kept local rollback); all eight `insertPostOrThrow` call sites confirmed directly incl. the ordered drawing pair's container-then-child sequence preserved; full census confirmed exact; **ONE SPEC DEFECT found and disclosed, not an implementation defect**: the live spec's own §5 gate asserts `rg -n '\binsertPostRow\b' ... # 0`, but the bound postsRaw.ts fence the spec itself supplies contains the retirement-record prose "PATCH-051: insertPostRow retired..." at its own header, which the word-boundary regex correctly matches — measured value is 1, not 0; the PAREN-instrument (`insertPostRow(`, the actual callable) independently confirmed 0 repo-wide, proving the function itself is genuinely extinct and this is purely a spec-authoring oversight (the same comment-trap class disclosed correctly in PATCH-049/050 but missed here); postsRaw export count confirmed 1 (`updatePostRowById` only); `updatePadletById`, `CanvasModals.tsx`, and `FreeformPadletCards.tsx` confirmed untouched by direct read/hash; untouched-file diff gate clean; grandfather held at 2; unit 251/28 (unchanged), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed server (incl. board-lifecycle exercising the extracted insert paths), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green — all re-run independently, TWENTIETH consecutive fully clean review of the implementation despite the one disclosed spec-documentation defect. postsRaw's third export has died; only `updatePadletById`/`updatePostRowById` remains, its slice must include CanvasModals. No PATCH-052 drafted, per instruction) |
| 052 | HOOKS SLICE 15, strangler group 27: `postsRaw.ts` DELETED — the final `updatePadletById`/`updatePostRowById` family onto the already-landed `canvas.updatePostFields` (PATCH-048; zero new domain/repository/test surface). Three pre-existing failure contracts split across nine callers: SIX bare-await CanvasClient calls (draft-container metadata, duplicate section batch, synced-copy link, section insertion loop, both detach legs) via `updatePostFieldsSwallowResolved` (rethrow only `code==='unknown'`, silently ignore every other Result — preserving the legacy bare-await shape: resolved error ignored, thrown escapes); the CanvasModals prop's TWO direct receivers (reorder-children, update-child-comments — both already check-and-throw into existing catches) via `updatePostFieldsOrThrow` (rethrow `cause ?? error` on ANY failure — CanvasModals keeps its prop name `updatePadletById`, both messages, both catches, byte-kept); the map-pin `onUpdatePostLocation` JSX callback (resolved error → local toast+fetchData rollback; thrown → historically escaped uncaught, no enclosing try/catch) via `updatePostFieldsPreservingFailureChannels` (rethrow only `'unknown'`, return every other Result to the existing branch). CanvasClient net LINE-NEUTRAL at exactly **8,375** (ten replaced regions balance out); hook 717→744 (<800); CanvasModals 476→474 (the raw destructure/throw lines collapse to a plain awaited call inside the byte-kept try). `postsRaw.ts` DELETED ENTIRELY — the module's SHRINK-ONLY fence is now satisfied by non-existence. NO new tests (zero new surface); suite stays 251/28; NO new swallow (the six existing caller-level resolved swallows are preserved verbatim, not created; command-internal swallow family unaffected). Amended once (`96b1c56`, "byte-safe"): the extractor now asserts EVERY file's pre-edit hash against the TRUE `git show HEAD:path` blob (not just the working copy) before writing, closing a working-copy-vs-blob divergence risk. Sixteen MUST-NOT-CHANGE hashes; a 28-fence bound extractor (3 file targets × their pair counts, byte-safe true-blob reconstruction, ending in `git rm` of postsRaw.ts) sandboxed at authoring; CTO simulation ran the real gates before delegation. FOUR implementation paths (three edited + one deleted), one seam, no PATCH-053 | **GPT-5.4 acceptable** (Pattern K; existing command/repository/test surface only) | **✅ DONE — `ec6d007`, CTO review PASSED 2026-07-12** (independently re-derived against the LIVE on-disk spec incl. its byte-safe amendment `96b1c56`, not the implementer's report; all THREE final hashes matched EXACTLY at the commit AND the live tree; `postsRaw.ts` confirmed ABSENT from the filesystem; exact four-path scope confirmed via `git show --name-only` on `ec6d007` (three edits + the deletion); all 28 TS fences present and verified; all three files' TRUE pre-edit blobs at the parent `ec6d007^` confirmed matching the spec's bindings, and reconstructing all 14 pairs (3 hook + 9 CanvasClient + 2 CanvasModals) from those TRUE blobs rebuilt all three bound final hashes exactly, independently confirming CanvasClient net-zero at 8,375 and the hook/CanvasModals deltas; the bound byte-safe extractor RE-EXECUTED independently in an isolated sandbox seeded with a REAL git repo at the true pre-edit blobs (required by the extractor's own `git show HEAD:path` assertions) — all three outputs `git hash-object`-verified and `postsRaw.ts` confirmed deleted in the sandbox too, rc 0; all sixteen MUST-NOT-CHANGE hashes held; all three new hook helpers confirmed by direct read matching their bound contracts EXACTLY; all six bare-await CanvasClient call sites confirmed using `updatePostFieldsSwallowResolved`; the CanvasModals JSX prop wiring confirmed supplying `updatePostFieldsOrThrow` while the prop identifier itself, both receiver bodies, both catch messages, and both rollback/toast actions were confirmed BYTE-UNCHANGED by direct read; the map-pin call site confirmed to have NO enclosing try/catch, proving the channel-preserving helper's 'unknown' rethrow correctly reproduces the legacy escape-uncaught path while `!updateResult.ok` correctly reaches only the local toast+rollback branch; **ONE SPEC DEFECT found and disclosed, not an implementation defect** (the same class as PATCH-051's): the live spec's own post-edit gate asserts `rg -n 'postsRaw' ... # 0`, but it actually measures 2 — both are prose-only comment mentions (the spec's own new bound hook comment, and the pre-existing MUST-NOT-CHANGE `posts.ts` comment), with ZERO actual import-path references confirmed remaining; grandfather held at 2; `FreeformPadletCards.tsx` confirmed untouched via its MUST-NOT-CHANGE hash; untouched-file diff gate clean; unit 251/28 (unchanged), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own explicitly-warmed server per the spec's operational note (incl. board-lifecycle exercising the extracted update paths), port gate independently confirmed 0 listeners BEFORE and AFTER (via both `netstat` and the spec's own PowerShell `Get-NetTCPConnection` instrument), LF-only bytes confirmed via `git ls-files --eol` for all three edited paths, `npm run verify` green — all re-run independently, TWENTY-FIRST consecutive fully clean review of the implementation despite the one disclosed spec-documentation defect. **`postsRaw.ts` no longer exists — the hooks-phase raw-passthrough module born at PATCH-042 is fully retired.** Only `FreeformPadletCards.tsx` remains as unfinished strangler work, on its own merits. No PATCH-053 drafted, per instruction) |
| 053 | FreeformPadletCards SLICE 1: the complete direct image-reaction family (image-card picker add, image-card reaction-row remove, full-image-toolbar reaction-row removal, full-image-toolbar picker add — 4 of the component's 22 direct `.from('padlets').update(...)` sites) onto the already-landed `canvas.updatePostFields` (PATCH-048; zero new domain/repository/test surface). ONE local channel-preserving helper (`updatePostFieldsPreservingFailureChannels`, defined in-component, not exported) rethrows only `code==='unknown'`, returning every other Result unread — reproducing the pre-existing contract at all four sites: a resolved database error was historically ignored (state update / `fetchData()` still ran), while a rejected builder entered the exact existing catch with its exact existing message. Direct padlets updates 22→18; awaited `supabase` builders 19→15; both un-awaited AI-resize persistence statements (current lines ~3282, ~3701) deliberately left untouched per an explicit deferral (routing them through an async command would change their execution semantics — a separate future ruling). The remaining 16 direct writes (metadata/task/container-cascade/comment/caption families) are untouched; component stays grandfathered — no closeout, no local-client retirement. Line count 6,368→6,371. NO new tests (zero new surface); suite stays 251/28. Amended once (`63c9f8f`, "amend PATCH-053 collision gate"): narrowed the pre-edit collision-gate pathspec to the target file only (the broader `lib app` glob had no bearing on a brand-new component-local identifier) — no bound hash, fence, or behavior contract changed. Seven MUST-NOT-CHANGE hashes; a 10-fence bound extractor (1 import pair + 1 helper pair + 3 call-site pairs, pair 3 applying twice) with true-blob reconstruction, sandboxed at authoring. ONE implementation path, one seam, no PATCH-054 | **GPT-5.4 acceptable** (Pattern K; existing command only) | **✅ DONE — `17ccd26`, CTO review PASSED 2026-07-13** (independently re-derived against the LIVE on-disk spec incl. its amendment `63c9f8f`, not the implementer's report; the final hash matched EXACTLY at the commit AND the live tree; exact one-file scope confirmed via `git show --name-only`; all 10 TS fences present; the file's TRUE pre-edit blob at the parent `17ccd26^` confirmed matching the spec's §1 binding, and reconstructing all 5 replacement pairs (pair 3 applying twice) from that TRUE blob rebuilt the bound final hash exactly; the bound extractor RE-EXECUTED independently in an isolated sandbox seeded with a real git repo at the true pre-edit blob — output `git hash-object`-verified and byte-identical to the live file, rc 0; all seven MUST-NOT-CHANGE hashes held; the new helper confirmed by direct read matching its bound contract exactly (rethrows `cause ?? error` only when `code==='unknown'`, otherwise returns the Result unread by any caller); all four call sites confirmed directly — exact ordering (`setIsImageEmojiOpen(false)` then `fetchData()` at the two picker-add sites; bare `fetchData()` at the two reaction-row-remove sites), exact catch messages ('Failed to add reaction' / 'Failed to remove reaction'), no resolved-Result handling added; both AI-resize builders (lines 3282, 3701) confirmed still un-awaited/untouched; the other 16 direct `padlets` update sites confirmed untouched by census; CanvasClient, both hooks, and posts domain/repository/test files confirmed untouched by direct hash; grandfather held at 2; full census confirmed exact (22→18 direct updates, 19→15 awaited builders, 4 helper calls + 1 definition = 5 total references); untouched-file diff gate clean; LF-only bytes confirmed via `git ls-files --eol`; unit 251/28 (unchanged), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own explicitly-warmed server per the spec's operational note (warmed `/`, `/auth`, `/pricing`, `/dashboard`, `/dashboard/canvas/test` first), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green — all re-run independently, ZERO disclosed defects of any kind (no spec defect, no implementation defect, no environmental issue, no reviewer measurement error), TWENTY-SECOND consecutive fully clean review of the implementation. FreeformPadletCards' first slice landed: 4 of 22 direct writes retired, 18 remain across 5 more coherent families plus 2 deliberately-deferred AI-resize builders. No PATCH-054 drafted, per instruction) |
| 054 | FreeformPadletCards SLICE 2: the comment family — the single optimistic child-comments write (`onUpdateChildComments` → `RowColumnContainerCard`) onto the already-landed `canvas.updatePostFields` via the ALREADY-EXISTING PATCH-053 local helper `updatePostFieldsPreservingFailureChannels` — **zero new functions of any kind: no helper, no import, no domain/infra/test surface; ONE replacement pair**. Fresh full-file census + classification of all 18 remaining direct writes by ACTUAL failure contract (read at each site, not inherited): 12 uniform bare-await style/caption writes (10 toolbar-style mirrored pairs + 2 caption commits — same contract, larger family, NOT folded in), 1 check-and-throw task toggle (writes `content`+`metadata` together — own future slice), 1 two-write ORDERED container-drop cascade (own future slice), 1 optimistic child-comments write (THIS patch — smallest coherent family), 2 un-awaited AI-resize builders (deferral RE-AFFIRMED: an async command would change execution semantics). Contract at the chosen site, read directly: optimistic `setPadlets` FIRST (outside the try), bare await inside the try with resolved `{ error }` never read, NO `fetchData()` anywhere in the handler — so a resolved database error historically left the optimistic state silently in place (pre-existing honesty gap PRESERVED, not fixed) while a rejected builder entered the exact existing catch (`console.error` + `toast.error('Failed to update comments')`); byte-identical to the PATCH-053 image-reaction contract, hence verbatim helper reuse. Spec explicitly warns against conflating this site with CanvasModals' same-named check-and-throw `onUpdateChildComments` receiver (PATCH-052, OrThrow port) — "the contract is a fact you read at the site, not a name you match". Direct updates 18→17; awaited builders 15→14; helper paren-instrument 4→5; lines 6,371→6,368; EIGHT MUST-NOT-CHANGE hashes (CanvasModals joins as insurance against the same-name confusion); a 2-fence bound byte-safe extractor (1 pair, true-blob reconstruction asserting BOTH working copy and `git show HEAD:path`); extractor sandbox-executed at authoring against the true pre-edit blob (rc 0, output hash exact); CTO simulation ran the real gates (tsc clean, boundaries silent, vitest 251/28 unchanged) then restored byte-exact. ONE implementation path, one seam, no PATCH-055 | **GPT-5.4 acceptable** (Pattern K; existing command + existing helper only) | **✅ DONE — `d7f57ff`, CTO review PASSED 2026-07-13** (independently re-derived against the LIVE on-disk spec at its authoritative commit `6c21488`, not the implementer's report — and without deference to the spec's CTO authorship; the final hash matched EXACTLY at the commit AND the live tree; exact one-file scope confirmed via `git show --name-only` with the bound commit message exact; both TS fences present; the file's TRUE pre-edit blob at the parent `d7f57ff^` confirmed matching the spec's §1 binding, the single OLD confirmed occurring EXACTLY ONCE in that TRUE blob, and applying the one bound pair rebuilt the bound final hash exactly AND byte-matched the live file; the bound byte-safe extractor RE-EXECUTED independently in an isolated git-backed sandbox seeded at the true pre-edit blob — rc 0, output hash exact, byte-identical to the live file; all EIGHT MUST-NOT-CHANGE hashes held incl. CanvasModals (the same-name-confusion insurance, confirmed untouched); the handler confirmed by direct read: optimistic `setPadlets` still BEFORE persistence, early returns byte-kept, the helper call's returned Result unread, catch byte-kept with both exact messages (`'Failed to update child comments:'` + `toast.error('Failed to update comments')`), NO `fetchData()` anywhere in the handler — so a resolved database error still silently leaves the optimistic state (the preserved honesty gap) while a rejected builder still enters the existing catch via the helper's `'unknown'` rethrow; the implementation diff confirmed a SINGLE hunk — task toggle (still check-and-throw at its site), container-drop cascade (both ordered awaits), all 12 style/caption writes, and both un-awaited AI-resize builders (lines 3282/3698) confirmed untouched, local `supabase` client remains at L185; full census exact (direct updates 18→17, awaited builders 15→14, helper paren-instrument 4→5, `.eq('id', childId)` 1→0, `childPadlet.metadata, comments` 1→1, lines 6,371→6,368, LF held); grandfather held at 2; unit 251/28 (unchanged), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed server (all five routes warmed first), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green after clean `.next` — all re-run independently, ZERO disclosed defects of any kind, TWENTY-THIRD consecutive fully clean review of the implementation. The comment family is retired; 17 direct writes remain (12 style/caption, 1 task toggle, 1 cascade pair, 2 deferred AI-resize). No PATCH-055 drafted, per instruction) |
| 055 | FreeformPadletCards SLICE 3: the 12 uniform style/caption writes onto the already-landed `canvas.updatePostFields` via the ALREADY-EXISTING PATCH-053 local helper — **zero new functions; the largest single reduction of the component's strangling (direct updates 17→5)**. Uniformity VERIFIED programmatically before ruling, not assumed from the family name: all 12 sites read byte-by-byte, each confirmed `try {` → bare await (resolved `{ error }` never read) → `fetchData();` → single-`console.error` catch, nothing else — the exact PATCH-053/054 contract, so verbatim helper reuse. The 12: five image-card style callbacks (`onCardColor`/`onTopStrip`/`onCaptionTextColor`/`onSelectColor`/`onSelectHighlight`) + image-card caption `onCommit` + their five toolbar mirrors + toolbar caption `onCommit`. Recipe: ELEVEN distinct OLD/NEW pairs, pair 9 applying exactly TWICE (the toolbar `onCaptionTextColor` and `onSelectColor` blocks are byte-identical — a fact discovered by byte comparison, bound as a count-2 pair per the PATCH-053 pair-3 precedent). All six distinct catch messages (each appearing at 2 sites), all 18 `fetchData();` calls, every payload and callback signature byte-kept. Lines 6,368→6,332 (−36); awaited builders 14→2 (only the cascade pair survives); helper paren-instrument 5→17; the five survivors enumerated by exact post-edit line in §4 (task 3425, cascade 3587/3595, AI-resize 3264/3680) with "anything else surviving means STOP". Deferrals re-affirmed: AI-resize (execution semantics), task toggle (check-and-throw + `content` write), cascade (ordering). EIGHT MUST-NOT-CHANGE hashes; a 22-fence bound byte-safe extractor (true-blob reconstruction asserting BOTH working copy and `git show HEAD:path`, count-tuple (1,1,1,1,1,1,1,1,2,1,1)); §2 fences GENERATED programmatically from the live bytes (not hand-transcribed); extractor sandbox-executed at authoring against the true pre-edit blob — rc 0, output hash exact AND byte-identical to the gate-simulated final; CTO simulation ran the real gates (tsc clean, boundaries silent, vitest 251/28 unchanged) then restored byte-exact. ONE implementation path, one seam, no PATCH-056 | **GPT-5.4 acceptable** (Pattern K; existing command + existing helper only) | **✅ DONE — `baf8a78`, CTO review PASSED 2026-07-13** (independently re-derived against the LIVE on-disk spec at its authoritative commit `5c826ad`, not the implementer's report — and, since the reviewer also authored this spec, without deference to that authorship; the final hash matched EXACTLY at the commit AND the live tree; exact one-file scope confirmed via `git show --name-only` with the bound commit message exact; all 22 TS fences present; the file's TRUE pre-edit blob at the parent `baf8a78^` confirmed matching the spec's §1 binding, and applying all 11 bound pairs in order — INCLUDING pair 9 independently confirmed occurring EXACTLY TWICE in the true blob — rebuilt the bound final hash exactly AND byte-matched the live file; the bound 22-fence byte-safe extractor RE-EXECUTED independently in an isolated git-backed sandbox seeded at the true pre-edit blob — rc 0, output hash exact, byte-identical to the live file; all EIGHT MUST-NOT-CHANGE hashes held; all 12 style/caption sites confirmed migrated via the post-edit census (helper paren-instrument 5→17, `.from('padlets')` 17→5, awaited bare builders 14→2); all six distinct catch messages independently confirmed remaining at exactly 2 sites each; the diff read directly hunk-by-hunk confirms, at every migrated site, the exact same ordering preserved (helper call, unread Result, `fetchData();`, then the byte-kept catch with its unchanged message) — resolved database errors still silently ignored, rejected builders still routed into the existing catch; the five surviving raw sites confirmed by direct read at their exact predicted post-edit lines and by identity, not just by count — AI-resize builder 1 (L3264, still un-awaited), the task toggle (L3425, still check-and-throw, still writing `content`+`metadata` together), both cascade writes (L3587/3595, still two ordered awaits in one try), AI-resize builder 2 (L3680, still un-awaited); full census exact (lines 6,368→6,332, `fetchData();` 18→18 unchanged); grandfather held at 2; unit 251/28 (unchanged), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed server (all five routes warmed first), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green after clean `.next` — all re-run independently, ZERO disclosed defects of any kind, TWENTY-FOURTH consecutive fully clean review of the implementation, and the largest single direct-write reduction of the strangling (17→5). No PATCH-056 drafted, per instruction) |
| 056 | FreeformPadletCards SLICE 4: the check-and-throw task toggle onto the already-landed `canvas.updatePostFields` — the component's only `content`-writing direct update, and the first slice needing a NEW helper since 053 because the existing channel-preserving helper is the WRONG contract here (it swallows resolved non-'unknown' failures; this site THROWS on a resolved error, skipping `fetchData()` — using the existing helper would silently change behavior, so the spec §5 explicitly forbids it). All FIVE remaining sites read in full context before ruling: the task toggle is fully self-contained (checkbox `onChange`, ~150 lines from the cascade handler, zero shared state — no coupling, so it goes alone). ONE new component-local helper `updatePostFieldsOrThrow` carries the established OrThrow port (the 050/051/052 check-and-throw class): ANY `!result.ok` rethrows `cause ?? error`. **Thrown-error IDENTITY proven by direct repository read, not assumed**: `updateFieldsById` maps a resolved Supabase error to `domainError('unavailable', ..., { cause: error })`, so the rethrown cause IS the same raw error object the legacy `if (error) throw error` threw; a rejected builder's reason travels as the 'unknown' cause. Success falls through to the byte-kept `fetchData(); // Refresh to get updated data` (comment included). The helper name deliberately matches the hook's PATCH-052 `updatePostFieldsOrThrow` (same contract, same name, different file-local function — nothing imported; collision gate file-scoped, 0 pre-edit). Payload (`content: JSON.stringify(updatedTasks)` + `metadata` + `updated_at`) passes through VERBATIM, byte-kept. TWO pairs (helper insertion anchored on the existing helper's unique tail + the call-site swap); `const { error } = await supabase` 1→0 (a perfect extinction instrument); direct updates 5→4; lines 6,332→6,342 (+10); OrThrow paren 0→1, word 0→2; PreservingFailureChannels stays 17; `fetchData();` stays 18. Deferrals re-affirmed: cascade (ordered pair, own slice, no coupling proven), AI-resize (execution semantics). EIGHT MUST-NOT-CHANGE hashes; a 4-fence bound byte-safe extractor (counts (1,1), true-blob reconstruction asserting BOTH working copy and `git show HEAD:path`); §2 fences byte-round-trip verified at assembly; extractor sandbox-executed at authoring — rc 0, output hash exact AND byte-identical to the gate-simulated final; CTO simulation ran the real gates (tsc clean, boundaries silent, vitest 251/28 unchanged) then restored byte-exact. ONE implementation path, one seam, no PATCH-057 | **GPT-5.4 acceptable** (Pattern K; existing command + one bound local helper) | **✅ DONE — `91b95c3`, CTO review PASSED 2026-07-13** (independently re-derived against the LIVE on-disk spec at its authoritative commit `be0fadb`, not the implementer's report — and, since the reviewer also authored this spec, without deference to that authorship; the final hash matched EXACTLY at the commit AND the live tree; exact one-file scope confirmed via `git show --name-only` with the bound commit message exact; all 4 TS fences present; the file's TRUE pre-edit blob at the parent `91b95c3^` confirmed matching the spec's §1 binding, and applying both bound pairs in order rebuilt the bound final hash exactly AND byte-matched the live file; the bound 4-fence byte-safe extractor RE-EXECUTED independently in an isolated git-backed sandbox seeded at the true pre-edit blob — rc 0, output hash exact, byte-identical to the live file; all EIGHT MUST-NOT-CHANGE hashes held; the implementation diff confirmed exactly TWO hunks (the new helper's insertion, the call-site swap) — the task toggle alone changed; the new helper confirmed by direct read to rethrow `result.error.cause ?? result.error` on ANY `!result.ok`, no code discrimination; the repository's `updateFieldsById` confirmed by direct read to map a resolved error into `domainError('unavailable', ..., { cause: error })`, independently proving the rethrown cause IS the identical raw error object the legacy site threw — the identity claim holds, not merely asserted; full census confirmed exact (`const { error } = await supabase` 1→0, `updatePostFieldsOrThrow(` 0→1, the helper's word-count 0→2 incl. its own definition, `updatePostFieldsPreservingFailureChannels(` held at 17, `fetchData();` held at 18, lines 6,332→6,342); the byte-kept payload (`content: JSON.stringify(updatedTasks)` + `metadata` + `updated_at`), the byte-kept success line `fetchData(); // Refresh to get updated data` (comment included), and the byte-kept catch message `'Failed to toggle task:'` were all confirmed by direct read — so a resolved database error still throws into the same catch and still skips `fetchData()`, and a rejected builder still lands in the same catch with an equivalent cause; both container-drop cascade writes (still two ordered awaits in one try, unchanged) and both un-awaited AI-resize builders confirmed untouched by direct read; grandfather held at 2; unit 251/28 (unchanged), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed server (all five routes warmed first), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green after clean `.next` — all re-run independently, ZERO disclosed defects of any kind, TWENTY-FIFTH consecutive fully clean review of the implementation, the fourth in a row with zero defects of any category. Only 4 direct writes remain in FreeformPadletCards: the ordered cascade pair and the two deferred AI-resize builders. No PATCH-057 drafted, per instruction) |
| 057 | FreeformPadletCards SLICE 5: the ordered container-drop cascade onto the already-landed `canvas.updatePostFields` — ONE inseparable family (both writes in one try in one handler, the second meaningless without the first), retired as ONE fence spanning both sequential awaits AND the intermediate `droppedPadlet` lookup, so the ORDERING itself is byte-bound (the recipe cannot reorder, merge, or `Promise.all` the writes without failing its own count gate). The partial-failure contract derived channel-by-channel by direct read and PRESERVED verbatim: write 1 resolved-error → execution CONTINUES (write 2 + `fetchData()` still run — the pre-existing partial-failure honesty gap where the child gains `parentId` while the container never recorded it, preserved not fixed); write 1 rejects → catch (`'Failed to add padlet to container:'`), write 2 never runs; write 2 resolved-error → ignored, `fetchData()` still runs (the mirror gap); write 2 rejects → catch; no rollback/state/toast anywhere. Each write individually is EXACTLY the PATCH-053 contract, so the existing channel-preserving helper is reused verbatim at both call sites — zero new functions. §5 explicitly forbids adding error handling between the writes (a resolved failure of write 1 MUST still let write 2 run). **This slice retires the component's LAST awaited raw builders — bare `await supabase` goes EXTINCT in the file (2→0)**; direct updates 4→2, leaving ONLY the two un-awaited AI-resize builders. Lines 6,342→6,336 (−6); helper paren 17→19; `.eq('id', containerId)`/`.eq('id', droppedId)` each 1→0; `fetchData();` held at 18. AI-resize deferral re-affirmed — after this patch they are the only remaining direct writes; NO closeout authorized or implied. EIGHT MUST-NOT-CHANGE hashes; a 2-fence bound byte-safe extractor (1 pair, count 1, true-blob reconstruction asserting BOTH working copy and `git show HEAD:path`); §2 fence byte-round-trip verified at assembly; extractor sandbox-executed at authoring — rc 0, output hash exact AND byte-identical to the gate-simulated final; CTO simulation ran the real gates (tsc clean, boundaries silent, vitest 251/28 unchanged) then restored byte-exact. ONE implementation path, one seam, no PATCH-058 | **GPT-5.4 acceptable** (Pattern K; existing command + existing helper only) | **✅ DONE — `56865a9`, CTO review PASSED 2026-07-13** (independently re-derived against the LIVE on-disk spec at its authoritative commit `db36f1b`, not the implementer's report — and, since the reviewer also authored this spec, without deference to that authorship; the final hash matched EXACTLY at the commit AND the live tree; exact one-file scope confirmed via `git show --name-only` with the bound commit message exact; both TS fences present; the file's TRUE pre-edit blob at the parent `56865a9^` confirmed matching the spec's §1 binding, and applying the one bound pair rebuilt the bound final hash exactly AND byte-matched the live file; the bound 2-fence byte-safe extractor RE-EXECUTED independently in an isolated git-backed sandbox seeded at the true pre-edit blob — rc 0, output hash exact, byte-identical to the live file; all EIGHT MUST-NOT-CHANGE hashes held; the implementation diff confirmed a SINGLE hunk spanning both writes and the intermediate lookup — the ordering byte-preserved (container write → `droppedPadlet` lookup → child write → `fetchData()`, all sequential, no `Promise.all`, no merge, no batching); the existing helper confirmed by direct read to rethrow only when `result.error.code === 'unknown'`, otherwise return the unread Result — independently re-verified this reproduces all FOUR legacy channels exactly: write-1 resolved-error still falls through to the lookup, write-2, and `fetchData()` (the pre-existing partial-failure honesty gap preserved, not fixed); write-1 rejection still stops at the byte-kept catch before write-2 ever runs; write-2 resolved-error still lets `fetchData()` run (the mirror gap); write-2 rejection still lands in the same catch with its exact message `'Failed to add padlet to container:'`; confirmed no rollback, toast, state update, or new intermediate error handling was added anywhere; full census exact (`.from('padlets')` 4→2, bare `await supabase` 2→0 — EXTINCT, confirmed by direct read this component now has ZERO awaited raw builders remaining, helper paren-instrument 17→19, both `.eq('id', containerId)`/`.eq('id', droppedId)` instruments 1→0, `fetchData();` held at 18, lines 6,342→6,336); the two surviving raw sites confirmed by direct read to be exactly the two un-awaited AI-resize builders (still fire-and-forget, unchanged); grandfather held at 2; unit 251/28 (unchanged), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed server (all five routes warmed first), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green after clean `.next` — all re-run independently, ZERO disclosed defects of any kind, TWENTY-SIXTH consecutive fully clean review of the implementation, the fifth in a row with zero defects of any category. This slice retires the component's LAST awaited raw builders; only the two deliberately-deferred un-awaited AI-resize builders remain as direct writes — no closeout claimed or implied. No PATCH-058 drafted, per instruction) |
| 058 | **ARCHITECTURE RULING — OWNER DECISION REQUIRED, NO IMPLEMENTATION AUTHORIZED.** The FreeformPadletCards endgame question ("can the two un-awaited AI-resize builders port fire-and-forget onto `canvas.updatePostFields`?") is answered: **they cannot, because there is no fire to forget — both statements are INERT and have been since birth.** `@supabase/postgrest-js` builders are LAZY thenables: the network call is issued inside `then()` (installed 2.93.1 bundle, `dist/index.cjs` `then()` at line 80, read directly), so a bare never-awaited statement never sends anything. Proven EMPIRICALLY against the installed package with an instrumented-fetch probe: 0 fetch calls 1500ms after the bare statement, 1 after awaiting. Full semantics derivation bound in the ruling: no execution, no observable promise, resolved-error/rejection/catch all UNREACHABLE, no unmount implications, rendering purely local-state. **Product consequence (P3 data loss): AI-card resizes have NEVER persisted** — no other path writes width/height (searched repository/hooks/CanvasClient), so every resize silently reverts on next fetch; a defect hidden inside code shaped like a save. Ruling: NO behavior-preserving port exists (`void command(...)` would FIRE a request that never existed = behavior change + new failure surface; awaiting = blocking; deletion = the null port, but entrenching non-persistence is a product decision). Statements, local client (these are its ONLY remaining uses), and grandfather FROZEN at hash `7e8c3c2` pending owner choice: **Option A (CTO recommendation, P3): authorize the persistence FIX** — a disclosed-behavior-change patch making resize actually save, with its own failure-channel ruling; **Option B: authorize deletion of the inert statements** — observably behavior-preserving, retires the census to 0 and orphans the client, but permanently entrenches non-persisting resize; deferral also safe (inert code cannot fail). PATCH-053→057 deferral language reclassified: "would change execution semantics" was right — they have NO execution semantics. LESSONS_LEARNED entry added ("a census of builder expressions counts INTENTS, not requests"). No closeout claimed: 2 raw statements + live client remain; census frozen (`.from('padlets')` = 2, bare awaits = 0, 6,336 lines) | CTO-only (architecture ruling; empirical probe + installed-source proof) | **RULING ISSUED 2026-07-13 — awaiting owner decision A/B; no PATCH-059** |
| 059 | **P3 BEHAVIOR FIX (owner-authorized 2026-07-13, PATCH-058 Option A): AI-card resize persistence actually executes** — explicitly NOT a behavior-preserving refactor, and spec'd as such. BEFORE: both resize statements inert (PATCH-058 proof), sizes revert on next fetch. AFTER: both callbacks launch a real write through the existing `canvas.updatePostFields` — sizes save for the first time in the product's history (disclosed: new network traffic + new persisted data on a path that never had either). ONE new component-local launcher `persistPostFieldsBestEffort(id, fields)`: synchronous signature, `void`'d async IIFE — pointer/resize NEVER blocked; **no unhandled rejection possible BY PROOF** (defineCommand converts validation failures and thrown exceptions into Results — the awaited command never rejects, so the void'd promise cannot); failure behavior RULED DELIBERATELY: `console.error('Failed to persist AI card resize:', cause ?? error)` only — NO rollback (the optimistic size stays; snapping the card back would be a NEW product behavior nothing in the existing UI ever had), NO toast (matches the component's freeform failure posture), NO fetchData (a failed save must not force a visible revert); on failure the pre-fix behavior simply resumes — strictly additive. §5 explicitly forbids reusing either existing helper here (both rethrow 'unknown', which inside a void'd launch would CREATE the forbidden unhandled rejection). Ordering bound: state update (during drag) precedes launch; launch is the final statement; ref-clear before launch at the pointer site; nothing observes completion. Tests: ONE new unit test pins the exact `{ width, height, updated_at }` payload passed verbatim (same reference, key order) — suite 251→252; component-level invocation DISCLOSED as having no automated net (no component-render infra; e2e can't create ai-component cards) — call sites verified in review by direct read. TWO-file scope (component + posts.test.ts, which leaves MUST-NOT-CHANGE for this patch only); the orphaned local client deliberately KEPT (no gate flags it; removal + grandfather 2→1 = separate closeout patch per owner instruction); raw-write census reaches ZERO (`.from('padlets')` 2→0) but NO closeout claimed. Component 6,336→6,355 (+19), test 1,391→1,408; collision gates file- AND repo-wide 0; EIGHT MUST-NOT-CHANGE hashes (command.ts joins — the no-rejection proof rests on it); an 8-fence two-file byte-safe extractor (counts all 1); fences byte-round-trip verified at assembly; extractor sandbox-executed at authoring — rc 0, both output hashes exact AND byte-identical to the gate-simulated finals; CTO simulation ran the real gates (tsc clean, boundaries silent, **vitest 252/28** incl. the new test) then restored byte-exact. TWO implementation paths, one seam, no PATCH-060 | **GPT-5.4 acceptable** (Pattern K mechanics; existing command + one bound launcher + one bound test) | **✅ DONE — `fe78d45`, CTO review PASSED 2026-07-13** (independently re-derived against the LIVE on-disk spec at its authoritative commit `5da7523`, not the implementer's report — and, since the reviewer also authored this spec, without deference to that authorship; both final hashes matched EXACTLY at the commit AND the live tree; exact two-file scope confirmed via `git show --name-only` with the bound commit message exact; all 8 TS fences present; both files' TRUE pre-edit blobs at the parent `fe78d45^` confirmed matching the spec's §1 bindings, and applying all four bound pairs (3 component + 1 test) rebuilt both bound final hashes exactly AND byte-matched the live files; the bound 8-fence two-file byte-safe extractor RE-EXECUTED independently in an isolated git-backed sandbox seeded at the true pre-edit blobs — rc 0, both output hashes exact, byte-identical to the live files; all EIGHT MUST-NOT-CHANGE hashes held including `command.ts`; the implementation diff confirmed exactly THREE hunks in the component (launcher insertion + both call-site swaps) and ONE in the test file; the launcher confirmed by direct read to have a SYNCHRONOUS signature (`React.useCallback((id, fields) => { void (async () => {...})(); }, [])` — no `async` on the outer callback) wrapping a `void`'d async IIFE, so neither call site can be awaiting it (confirmed: neither site has an `await` keyword before the call); the IIFE confirmed awaiting the existing `canvas.updatePostFields` command via the existing `createUpdatePostFieldsCommand`/`createPostsRepository` imports (no new imports added); exact payload confirmed at both sites (`{ width, height, updated_at }`, matching each site's pre-existing local variable names); failure behavior confirmed by direct read: exact message `'Failed to persist AI card resize:'`, exact `result.error.cause ?? result.error` object, NO rollback, NO toast, NO fetchData, NO rethrow anywhere in the IIFE; **the no-unhandled-rejection proof was independently RE-VERIFIED, not trusted from the spec's prose**: reading `command.ts` directly confirmed `defineCommand`'s `run` returns `err(...)` — a resolved Result, not a throw — on a validation failure, and wraps `execute` in try/catch converting any thrown exception into `err(domainError('unknown', ...))` — also a resolved Result — so the awaited command's promise can never reject; state-update ordering confirmed by direct read at both sites (`setPadlets` during the drag in `onPointerMove`/`onResize`, the launch as the unconditional final statement, `aiResizeRef.current = null` still preceding the pointer-site launch); both existing helpers (`updatePostFieldsPreservingFailureChannels`, `updatePostFieldsOrThrow`) confirmed UNTOUCHED by hash and confirmed NOT referenced by the new code by direct read; the new unit test confirmed pinning the exact payload shape via `toBe` (same reference) and ordered `toEqual` (`['width', 'height', 'updated_at']`); the raw-write census confirmed reaching exactly ZERO (`.from('padlets')` 0, bare `await supabase` 0); the local `supabase` client confirmed still present (deliberately orphaned, kept for a separate closeout patch, per instruction — NOT removed here); grandfather held at 2; unit **252/28** (the new test counted and passing, confirmed by name in the run output), `playwright test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed server (all five routes warmed first), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green after clean `.next` — all re-run independently, ZERO disclosed defects of any kind, TWENTY-SEVENTH consecutive fully clean review of the implementation. **AI-card resize now persists — the first time in the product's history.** The local client and grandfather entry remain exactly as bound, pending a separate owner-gated closeout patch. No closeout claimed. No PATCH-060 drafted, per instruction) |
| 060 | **FreeformPadletCards CLOSEOUT: grandfather 2→1** — the component's boundary violation retires; explicitly NOT the full program closeout (CanvasClient's entry remains, proven independent: it live-imports `{ User, Session }` from `@supabase/supabase-js` at its L75). Fresh census confirmed the component's entire remaining supabase surface is mechanical: the L6 `@supabase/*` TYPE import (the only flagged pattern — SWAPPED to the domain `AuthUser`, the exact PATCH-010 pattern already live in CanvasModals; every `user` access — id/email/user_metadata.{name,full_name,avatar_url} — covered; caller assignability PROVEN IN PRODUCTION since PATCH-010: CanvasClient passes the same object into CanvasModals' `AuthUser \| null`), the orphaned `supabaseBrowser` import, and the orphaned comment+client (deleted — zero code uses since PATCH-059). All runtime behavior preserved (deletions of inert code + type-only swap). **The retirement is proven by a bound NEGATIVE CONTROL, run at authoring and mandatory at review**: with the new config, linting the OLD component fails with exactly one `no-restricted-imports` error at 6:1, and the NEW component passes — proving the entry removal actually exposes the file to the rule instead of a silent ignore-glob miss (the config's own `[id]` warning made this a live risk); "a green gate that cannot fail is not a gate". **Mixed-EOL trap disclosed and bound**: `eslint.boundaries.config.mjs` is `i/mixed` (CRLF body, LF-only grandfather block; 70 CR bytes) — plain `git hash-object` applies the clean filter and reports a DIFFERENT hash than the raw bytes, so ALL config hashes in the spec are `--no-filters` (raw) with the filtered pair also quoted to prevent instrument-mixing; the extractor handles the config in BINARY throughout (CR preserved exactly), no-CR assertions scoped to the component only. Component 6,355→6,351 (−4: import swap net-0, orphan import −1, comment+client −3); config 74→73 (the shrink-only list shrinks); `@supabase` in component 1→0, `supabaseBrowser` 3→0, `AuthUser` 0→2; CanvasClient's entry census-locked at 1→1. FIVE pairs (4 component incl. 2 pure deletions + 1 config deletion; empty NEW fences bound as fences), 10 ts fences byte-round-trip verified at assembly; EIGHT MUST-NOT-CHANGE hashes (lib/domain/auth/user.ts and lib/supabase/browser.ts join — the swap target and the still-shared wrapper); extractor sandbox-executed at authoring against the true pre-edit blobs — rc 0, both hashes exact, config byte-identical incl. all CR bytes; CTO simulation ran the real gates with the component LINTED for the first time (tsc clean incl. the AuthUser assignability, boundaries silent, vitest 252/28) AND the negative control (old bytes → exactly one error at 6:1) then restored byte-exact. TWO implementation paths, no PATCH-061 | **GPT-5.4 acceptable** (Pattern K mechanics; deletions + one established type swap, zero new code) | **✅ DONE — `b08e79b`, CTO review PASSED 2026-07-13** (independently re-derived against the LIVE on-disk spec at its authoritative commit `25d275f`, not the implementer's report — and, since the reviewer also authored this spec, without deference to that authorship; both final RAW hashes matched EXACTLY at the commit AND the live tree, using `--no-filters` for the mixed-EOL config throughout — never the plain filtered hash; the filtered reference value the spec quoted for cross-check was independently confirmed matching too; exact two-file scope confirmed via `git show --name-only` with the bound commit message exact; all 10 TS fences present incl. the three EMPTY deletion fences; both files' TRUE pre-edit blobs at the parent `b08e79b^` confirmed matching the spec's §1 bindings, and applying all five bound pairs rebuilt both bound final hashes exactly AND byte-matched the live files, with all 70 CR bytes of the config independently confirmed preserved; the bound binary-safe extractor RE-EXECUTED independently in an isolated git-backed sandbox seeded at the true pre-edit blobs — rc 0, both outputs byte-identical to the live files (component via diff, config via byte-exact cmp); all EIGHT MUST-NOT-CHANGE hashes held incl. `lib/domain/auth/user.ts` and `lib/supabase/browser.ts`; the implementation diff confirmed exactly four hunks in the component (type-import swap, orphaned-import deletion, prop-type swap, orphaned comment+client deletion) and one single-line deletion in the config — nothing else touched in either file; **the mandatory negative control was independently RE-RUN, not assumed from the spec's authoring claim**: the reviewer restored the TRUE pre-edit component bytes under the NEW config and confirmed `npm run check:boundaries` fails with the EXACT bound signature — one `no-restricted-imports` error at line 6:1, nonzero exit code — then restored the live bytes, re-confirmed the exact final hash, and re-confirmed a clean boundaries run; full census confirmed exact (`@supabase` in component 1→0, `supabaseBrowser` 3→0, `const supabase` 1→0, `AuthUser` 0→2, config's `FreeformPadletCards.tsx` entry 1→0, `CanvasClient.tsx` entry held at 1); grandfather independently recounted at exactly ONE entry (`CanvasClient.tsx` only) by direct read of the live config; NO full program closeout claimed, consistent with the live grandfather count; the component's 6,351-line size problem confirmed untouched and still on the books; unit 252/28 (unchanged), `playwright test --list` 27/18, tsc clean (independently confirming the `AuthUser` assignability compiles), boundaries clean (the component is LINTED for the first time in this program's history), e2e 27/27 on the reviewer's own warmed server incl. board-lifecycle (confirming the type swap has zero runtime effect), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green after clean `.next` — all re-run independently, ZERO disclosed defects of any kind, TWENTY-EIGHTH consecutive fully clean review of the implementation. **FreeformPadletCards' boundary violation is retired — its grandfather entry no longer exists.** One grandfather entry remains (`CanvasClient.tsx`), independent and proven so; its retirement is a separate future program. No PATCH-061 drafted, per instruction) |
| 061 | **CanvasClient grandfather retirement — the boundary program's FINAL closeout: grandfather 1→0, GRANDFATHERED_UI_FILES EMPTY.** The owner-directed census found the last violation is a TYPE-LEVEL FOSSIL: CanvasClient's only `@supabase/*` import (L75 `{ User, Session }`) types two useState hooks and six casts — and every value being cast comes FROM the domain infra ALREADY TYPED (`getVerifiedAuthUser()` → `Result<AuthUser \| null>`, `onAuthSessionChanged` → `AuthSession \| null`); the casts are DOWN-casts erasing domain types back into supabase types. `session` is never passed as a prop and never has a field read — its only read is a truthiness check. All three `user={user}` receivers (CanvasModals, FreeformPadletCards, OverlayLayer) already take `AuthUser \| null`; local accesses are only id/email/user_metadata. **BONUS census finding: CanvasClient's local `supabase` client is VESTIGIAL** — zero call sites remain (the strangler removed them all); it appears only in 26 inert deps-array mentions (identity-stable memo); disclosed, kept, separate cleanup patch. ONE real coupling found by tsc at authoring, adapted at the smallest seam: `resolveWorkspaceForUser(user)` flows into `lib/workspace/context.ts`'s `Pick<User,'id'\|'email'>` param (`email?: string` rejects AuthUser's `\| null`) — ruled a CALL-SITE adaptation (`{ id: user.id, email: user.email ?? undefined }`) rather than widening the 14-caller shared helper; behavior-identity proven by direct read of every email use in the helper (`?? ''`, truthiness guards, null-tolerant `defaultWorkspaceName`) — null and undefined behave identically at each; the site is guarded by `if (!user?.id) return`. NINE CanvasClient pairs (import swap + 2 state types + 5 cast swaps + the one adaptation — LINE-NEUTRAL 8,375→8,375, never-grow holds) + ONE config deletion (73→72, list empties). Gate-simulated END TO END at authoring: tsc clean (the tsc failure at L253 was FOUND and FIXED at authoring, not left for the implementer), **`check:boundaries` clean WITH THE LIST EMPTY — the entire components/**+app/** tree linted with zero exceptions and passed**, vitest 252/28, AND the negative control (old CanvasClient under the new config fails with exactly one error at 75:1). Mixed-EOL config discipline carried from 060 (`--no-filters` hashes, binary extractor, 70 CR bytes). EIGHT MUST-NOT-CHANGE hashes incl. `lib/workspace/context.ts` + `workspaceMembers.ts` (adapted TO, not touched) and `authState.ts` (the types' source). 20 ts fences byte-round-trip verified; extractor sandbox rc 0, both outputs byte-identical to the gate-simulated finals. TWO implementation paths, no PATCH-062 | **GPT-5.4 acceptable** (Pattern K mechanics; type de-casts + one bound adaptation, zero new code) | **✅ DONE — `1f74386`, CTO review PASSED 2026-07-13** (independently re-derived against the LIVE on-disk spec at its authoritative commit `c96c46e`, not the implementer's report — and, since the reviewer also authored this spec, without deference to that authorship; both final RAW hashes matched EXACTLY at the commit AND the live tree using `--no-filters` throughout for the config; exact two-file scope confirmed via `git show --name-only` with the bound commit message exact; all 20 TS fences present; both files' TRUE pre-edit blobs at the parent `1f74386^` confirmed matching the spec's §1 bindings, and applying all ten bound pairs rebuilt both bound final hashes exactly AND byte-matched the live files — **this directly resolves the implementer-disclosed intermediate CRLF mishap during their negative-control restore: the reconstruction from the TRUE parent blob is byte-identical to what is actually committed, so that incident left no trace in the final bytes and is confirmed NOT a defect**; the binary-safe extractor RE-EXECUTED independently in an isolated git-backed sandbox seeded at the true pre-edit blobs — rc 0, both outputs byte-identical to the live files, all 70 CR bytes of the config preserved; all EIGHT MUST-NOT-CHANGE hashes held; CanvasClient confirmed LINE-NEUTRAL at exactly 8,375; config confirmed at 72 lines; full census confirmed exact — `@supabase` imports in CanvasClient 1→0 (repo-wide UI-tree check, correctly glob-scoped past `app/api/**`/`route.ts`/`excalidraw_fork`, also confirms 0), `AuthUser` at 5 sites (import + state + 3 casts), `AuthSession` at 4 sites (import + state + 2 casts), the `resolveWorkspaceForUser` adaptation matches the bound text EXACTLY, the config's `CanvasClient.tsx` entry census 1→0; the vestigial local `supabase` client (import, memo, 26 deps-array mentions) confirmed BYTE-UNTOUCHED; `lib/workspace/context.ts` and `workspaceMembers.ts` confirmed untouched by hash, proving the adaptation stayed at the bound call-site seam; **the mandatory negative control was independently RE-RUN, not assumed from the spec's authoring claim**: the reviewer restored the TRUE pre-edit CanvasClient bytes under the NEW (empty-list) config and confirmed `check:boundaries` fails with the EXACT bound signature — one `no-restricted-imports` error at line 75:1, nonzero exit — then restored the live bytes, re-confirmed the exact final hash, and re-confirmed a clean run; diffstat independently confirmed tiny and tightly scoped (9 insertions/10 deletions across two files) — no size, realtime, presence, or P3-swallow work bundled; unit 252/28 (unchanged), `playwright test --list` 27/18, tsc clean, **boundaries clean with the ENTIRE `components/**`+`app/**` tree linted and ZERO exceptions** — independently re-run, not merely trusted — e2e 27/27 on the reviewer's own warmed server incl. board-lifecycle (confirming zero runtime effect from the auth/session type swap), port gate independently confirmed 0 listeners BEFORE and AFTER, `npm run verify` green after clean `.next` — all re-run independently, ZERO disclosed defects of any kind, TWENTY-NINTH consecutive fully clean review of the implementation. **THE PATCH-002 BOUNDARY-FREEZE PROGRAM IS NOW CLOSED AT THE GATE LEVEL: grandfather 1→0, `GRANDFATHERED_UI_FILES` is empty, independently confirmed by direct read of the live config file.** The architecture program continues: CanvasClient's vestigial client cleanup, both components' size problems, realtime/presence design, and the owner-gated P3 swallow family remain open, per the spec's own disclosure. No PATCH-062 drafted, per instruction) |
| 062+ | after 061: the PATCH-002 boundary program is CLOSED (gate-level; verify at review that the live list is truly empty and all docs agree). Remaining architecture work, all outside the gate: CanvasClient vestigial-client cleanup (import+memo+26 inert deps mentions, zero call sites — separate mechanical patch), CanvasClient 8.4k + FreeformPadletCards 6.3k SIZE problems, realtime/presence (CTO-only, undesigned), the owner-gated P3 command-internal-swallow family (ELEVEN sites + auth-infra sibling) | per-family; Pattern K where bound tests can carry semantics | PATCH-038→061 §0.1/§0.3 + the PATCH-058 ruling are the sequencing sources |

**Fable-window critical path (closes 2026-07-12).** In priority order:
① specs 017–019 (unblocks GPT-5.4 for the whole of batch 3), ② specs
020–021, ③ duality decision brief (022), ④ canvas ops seam design + the
CanvasClient call-site map (024/025 prerequisites). Everything on this list
is DESIGN — implementation and post-window reviews run on GPT-5.4/5.5
against these specs using the per-patch acceptance checklists +
CTO_PLAYBOOK §12/§14.

**Security flag — CLOSED 2026-07-09 by PATCH-024 (`32faa80`, review
PASSED).** The settings-vertical scavengers are extinct: all four
quarantine scavenger functions deleted, both in-page copies
(settings-root, notifications excepted — see Addendum 5) replaced or
queued, tokens now come from the real cookie session via
`sessionToken.ts`. The addenda below are HISTORICAL inventory except
Addendum 5, whose two surviving sites (clientAuth.ts dead tail,
notifications page) remain the queued follow-up.
**(Original standing text, kept for the record — recorded 2026-07-08;
feeds the scavenger-normalization patch — RENUMBERED 2026-07-09: was 023,
now **PATCH-024**; every "023"
below in this standing section and its addenda means the renumbered 024.
Note: `legacyToken.ts`'s header comment still names PATCH-023 as its
removal patch — that code comment is corrected as a bound one-line edit in
the 024 spec, not before):** profile + integrations
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
**Addendum 5 (PATCH-024 Amendment 2, 2026-07-09):** the inventory above was
SETTINGS-VERTICAL-complete but not REPO-complete — 024's repo-wide
extinction gates surfaced two more pre-existing scavenger sites, both
byte-untouched by 024 and OUTSIDE its five authorized changes:
(1) `lib/imports/clientAuth.ts` — LIVE module (importers: ImportBrowser,
lib/imports/clientApi); its `resolveClientAccessToken` is already
session-first (getSession → refreshSession) with the deep-scan pair as a
dead third-step tail — mechanically the same tail 024 removes from
integrations. (2) `app/dashboard/settings/notifications/page.tsx` — its
own narrow in-page `getAccessToken` (L95) used only by
`registerPushIfNeeded` (L152); for cookie users push registration
SILENTLY NO-OPS (same silent-defect family as password's). **QUEUED
FOLLOW-UP (needs its own small authorized patch after 024 lands):** remove
clientAuth's dead tail + swap notifications to `getSessionAccessToken`
(the latter is a behavior change — push registration starts working for
cookie users — and needs owner authorization like 024's five).

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
| Authorize a fix for the canvas ops seam's error-swallow family — SEVEN command-internal sites now: `canvas.reorderSections` (map reorder, PRESERVED by PATCH-026), `canvas.setChronoMode` (chrono-mode save, PRESERVED by PATCH-027), `canvas.attachPostToSchedulerContainer` and `canvas.createSchedulerContainerWithPost` (scheduler cluster, PRESERVED verbatim by PATCH-029), `canvas.updatePostMetadataBestEffort` and `canvas.updatePostMetadataUnstampedBestEffort` (the generic bare-await metadata pair, PRESERVED by PATCH-032 — serving seven named-function sites and, since PATCH-033, seven JSX sites), `canvas.updatePostPositionWithMetadataBestEffort` (the detach position+metadata write, PRESERVED by PATCH-034) — none repaired. *(Entry catch-up note: sites 5–6 were recorded in the 032 row/log but this table was not updated at that review — corrected at the 034 review.)* | User | Whenever (P3-family, non-blocking) | `lib/domain/canvas/sections.ts` (`reorderSections`), `lib/domain/canvas/board.ts` (`setChronoMode`), and `lib/domain/canvas/posts.ts` (the other five) — all await the write(s) and never read the resolved `error` field(s), same as the legacy call sites they replaced; only a thrown network error surfaces in any case. Test coverage exists for all seven sites (each has a "preserves the legacy error-swallow"/"still returns ok" test) so a future fix changes one test's expectation per site, not the harness. |
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

- **2026-07-21** — **PATCH-097 DONE (commit `973e5688…`) + slide-
  editing-preview twin defect investigated — PATCH-098 NOT
  authorized (recorded as a candidate, not forced).** **097 closure:**
  landed exactly the bound 3-path/blob set; independent review PASS;
  both runtime card files (`RuntimePresentationPadletCard.tsx`,
  `RuntimeContainerChildCard.tsx`) gained the exact one-branch
  `ai-component` fix with no resize handle exposed; new spec passed
  Flows A-D (3/3 stability); PATCH-096 runner 14/14/0-incidents;
  deterministic gates all green (slideOrder 7/1, clonedPostMetadata
  9/1, focused drawing 59/2, full Vitest 448/43); cleanup zero;
  `slide-renderer/PresentationPadletCard.tsx` confirmed untouched
  (blob unchanged from fencing). **Preview-twin investigation (fresh,
  independent, re-derived from current HEAD, Sonnet/CTO role):**
  re-read `PresentationPadletCard.tsx`/`PresentationContainerCard.tsx`
  and traced their FULL call chain — a materially important correction
  to the originally-assumed framing: these two components are **not**
  a live interactive preview surface at all. They have exactly two
  importers repo-wide, and both routes lead into
  `createSlideRenderer.tsx`'s `renderPadletOverlayToCanvas`, which
  mounts them into a **temporary off-screen React root**, waits
  exactly **two `requestAnimationFrame` ticks**, snapshots the DOM via
  `html2canvas` into a PNG, then immediately unmounts and tears down
  the host. This one-shot snapshot (`renderSlideToPNG`) is what
  actually feeds slide-panel thumbnails (`useSlideThumbnails.ts`), PDF
  export, PPTX export, `SharePresentationModal.tsx`, and
  `PresentationPreviewModal.tsx` — there is no persistent live-DOM
  mount anywhere. **Root cause confirmed identical to PATCH-097:**
  `PresentationPadletCard.tsx` has no `ai-component` branch and falls
  through to the same `padlet.content` text fallback (blob
  `bbcef06c…`, confirmed unchanged since PATCH-097's fencing).
  **Why this is NOT a safe clean twin of PATCH-097:** PATCH-097's fix
  was safe specifically because `FullscreenPresentation` is a
  persistent live page giving `AIComponentRenderer`'s async post-mount
  content injection (`useAIComponent`'s `useEffect`) unbounded real
  time to finish. Here, the same component would get only 2 RAF ticks
  before `html2canvas` fires and the tree is torn down — adding the
  render branch alone is a strict, non-regressive improvement but does
  NOT resolve whether the snapshot reliably captures the AI content in
  time, which is a genuine, unresolved product-contract question
  (should exports wait for async AI content, and if so how, given the
  wait mechanism is shared by every other padlet type currently
  snapshotted successfully?) — a materially larger, shared-blast-
  radius change than PATCH-097's isolated fix. There is also no
  established low-risk characterization-test strategy for this defect
  the way 089-097 all tested live DOM assertions — the only
  user-visible artifact here is a PNG from a one-shot canvas capture;
  a meaningful regression test would require pixel-sampling a captured
  image, a new and fragile technique never used in this program.
  **Decision: PATCH-098 is NOT authorized.** The defect is real,
  evidenced, and narrowly bounded in terms of the render-branch fix
  itself, but fails the "free of unresolved product-contract
  ambiguity" and "testable via the established pattern" bars — not
  because the fix is large, but because doing it safely requires
  either an owner product decision on export-timing behavior or
  accepting a differently-tested (pixel-sampling-based) regression
  spec, neither of which the CTO role can resolve unilaterally.
  Recorded as an evidenced, bounded-but-not-yet-safe candidate for a
  future patch, pending either: (a) an owner decision on acceptable
  export-timing behavior for async-loading padlet content, or (b) an
  explicit acceptance of pixel-sampling-based Playwright regression
  tests as a new, sanctioned technique for this program.
  `.fable5/patches/PATCH-098.md` was NOT created.

- **2026-07-21** — **PATCH-097 AUTHORIZED (FIX) — custom slider/player
  AI Container rendering gap.** Independent read-only investigation
  (Sonnet, CTO role) of a user-reported defect: an AI Container
  (`type: 'ai-component'`, UI label "New AI Drawing") renders correctly
  in the normal canvas/editor but shows as an effectively blank card
  in the custom fullscreen slider/player. **Root cause, evidenced with
  exact file/line citations:** neither
  `RuntimePresentationPadletCard.tsx` nor `RuntimeContainerChildCard.tsx`
  (the two card renderers the player actually mounts, traced through
  the full call chain `FullscreenPresentation.tsx` →
  `RuntimeSlideRenderer.tsx` → `RuntimePadletLayer.tsx` →
  `expandRuntimeContainerItems.ts`) has a dispatch branch for
  `ai-component` — both fall through to a generic text/caption
  fallback that reads only `padlet.content`, while the AI component's
  actual generated HTML lives exclusively in
  `metadata.savedAIComponent.code`/`aiComponentCode`/`aiRawCode`,
  resolved only via `resolveSavedAIHtmlFromMetadata()`
  (`lib/ai/normalize-ai-content.ts:100`) — the same function the
  editor's own renderer already calls
  (`FreeformPadletCards.tsx:3196`). This is a pure rendering-dispatch
  gap, not a membership/filtering/geometry/snapshot defect —
  `resolveSlidePadlets.ts`'s `type==='drawing'` exclusion (line 25,
  unrelated/pre-existing/intentional-looking) and
  `resolveRuntimeContainerChildren.ts`'s type-agnostic child
  resolution were both re-confirmed uninvolved. **Also discovered but
  explicitly NOT bundled:** the slide-editing preview renderer
  (`slide-renderer/PresentationPadletCard.tsx`) has the identical gap
  — recorded as a real, separate, smaller follow-up candidate for a
  future patch, per the user's exact scope request limiting this
  patch to "the custom slider/player." **Authorized fix:** add one
  `ai-component` branch to each of the two runtime-slide card files,
  rendering via the same `AIComponentRenderer` +
  `resolveSavedAIHtmlFromMetadata` pairing the editor already trusts,
  with no interactive resize handle (the player is read-only).
  Bound: 3 allowed files (2 modified + 1 new characterization spec
  `e2e/characterization/presentation-ai-component-render.spec.ts`),
  59/59 immutable fences (46 carried from PATCH-096's closure + the
  now-landed `run-carried-groups.mjs` blob + 12 newly-fenced
  presentation/AI dependency files this investigation directly
  implicated), full absence-gate set, deterministic/live gate
  expectations carried unchanged from 089-096. Commit message bound:
  `fix(presentation): render AI-component containers in the runtime slider/player (PATCH-097)`.
  Implementation role: GPT-5.5. Independent review: Kepler primary,
  Gemini 3.1 Pro fallback — NOT Sonnet, per the permanent role
  separation below.

- **2026-07-21** — **ROLE CHANGE: Sonnet is now the permanent CTO /
  governance owner**, replacing the prior "Fable (CTO)" persona used
  through PATCH-095. Named roles going forward: Sonnet (CTO/governance
  — closes patches, runs census, authorizes scope, commits/pushes
  governance only, never implements or self-reviews), GPT-5.5
  (implementer — authorized files only, never commits before PASS,
  never self-reviews), Kepler (primary independent read-only
  reviewer), Gemini 3.1 Pro (fallback reviewer, used only if Kepler
  unavailable). No role may approve its own work; governance and
  review are never combined for the same patch.

- **2026-07-21** — **PATCH-096 DONE (commit `cb296448…`) + fresh
  census — no PATCH-097 authorized.** **096 closure:** landed exactly
  the bound one-file change to `e2e/run-carried-groups.mjs` (blob
  `bf76160…`) — a new `SETUP_CLOSE_SIGNATURE`/`detectSetupClose` pair
  checked only after the unweakened, byte-unchanged
  `AUTH_EXPIRY_SIGNATURE`/`detectAuthExpiry` fails, one bounded
  one-retry branch (full dependency mode, re-attempting a fresh
  `[setup]`), and two new counters
  (`setupCloseIncidents`/`recoveredSetupCloseIncidents`) tracked
  completely separately from the existing auth-expiry counters.
  Independent review: **PASS**. Live grouped-runner result: 14
  groups, 14 specs, 14 final passes, 0 auth-expiry incidents, 0
  setup-close incidents, 0 non-signature failures — the rare genuine
  signature was not naturally exercised live during review (as
  expected, it remains rare/non-reproducible-on-demand), so the new
  retry branch's correctness rests on source inspection + a manual
  five-condition detector-matrix walkthrough, not a live-fire
  observation; this is recorded honestly, not oversold. Deterministic
  gates all green (slideOrder 7/1, clonedPostMetadata 9/1, focused
  drawing 59/2, full Vitest 448/43, typecheck/boundaries/verify/build
  all passed). **Fresh post-096 census (independently re-verified,
  not reused):** re-ran `tsc --noEmit` (clean), `check:boundaries`
  (clean), full Vitest (448/43, clean), `npm run build` (clean, no
  warnings) — zero new failing tests, type errors, boundary
  violations, or build warnings anywhere in the repo. Re-checked
  atomic-move deployment readiness live: Docker Desktop's engine is
  STILL unreachable (`docker info` succeeds for the client but fails
  to reach `dockerDesktopLinuxEngine`), `supabase/config.toml` is
  still absent, `supabase/BASELINE.md` is unchanged since its
  2026-07-06 commit (no new owner evidence), no CI workflow validates
  schema/migrations (`ci.yml` only references Supabase secrets as
  build/test env vars) — blocker classification F (multiple) stands,
  unchanged from 095's closure. Searched all `onUpdatePadlet(` call
  sites repo-wide (`DrawingLayout.tsx` ~522/531 move-write and
  ~956/966 position-write, plus newly-checked
  `WallLayoutRenderer.tsx`, `ColumnsLayoutRenderer.tsx`,
  `useCanvasActions.ts`'s `savePadletPosition`) — all four additional
  sites are the same intentional best-effort position/layout-write
  class already ruled DEFER-by-design (088 §4); no new distinct
  silent-loss candidate found. Comment edge-cases (Shift+Enter,
  empty/whitespace edit, blur-without-Enter, rapid Enter) remain
  small, unproven, and without a documented product-contract
  requirement — still correctly deferred, not bundled speculatively.
  **Conclusion: no candidate currently meets the bar for a bounded,
  evidenced, deployment-independent PATCH-097** — recording this
  explicitly rather than forcing a patch. `.fable5/patches/PATCH-097.md`
  was NOT created. The repository is in a fully green, fully
  characterized, deliberately paused state pending either (a) new
  owner-supplied deployment/migration evidence unblocking atomic
  move, or (b) a genuinely new defect surfacing in future work.

- **2026-07-21** — **PATCH-095 DONE — DESIGN COMPLETE / IMPLEMENTATION
  BLOCKED (governance commit `75fd669…`) + fresh census + PATCH-096
  AUTHORIZED (FIX, bounded PATCH-088 setup-close runner hardening)**.
  **095 closure:** zero code/spec/production files were ever touched
  by 095 — no implementer candidate existed, so no independent code
  review was performed or required; the governance commit itself was
  the entire delivered scope. The atomic move remains exactly as
  non-atomic and inaccessible as before 095 — this is NOT a behavior
  change. **Blocker classification reaffirmed: F, multiple** — (1) no
  trustworthy migration baseline (`supabase/BASELINE.md` documents
  `supabase/migrations/` does NOT rebuild the live DB; reconciliation
  blocked on Docker + DB password); (2) no usable local DB test
  environment (Docker engine confirmed not running again at this
  census; no `config.toml`); (3) no confirmed deployment owner/
  procedure; (4) no CI validation; (5) the machine-local gitignored
  `supabase/.temp/linked-project.json` remains a risk factor, not
  approved tooling; (6) the `supabase` CLI is not a pinned project
  dependency. Implementation stays blocked until the owner supplies
  all nine prerequisites (baseline reconciliation, migration
  location — already satisfied, DB credential process, working local
  environment or approved alternative, named deployment owner,
  documented deploy command, documented rollback, CI/repeatable
  validation, SECURITY INVOKER confirmation). The full
  `move_child_between_containers` RPC contract, integration sequence,
  and test-layer blocked/buildable split are preserved unchanged in
  095 §19. **Fresh census (22 items):** with comment work (091-094)
  and move design (095) both closed, the PATCH-088 genuine setup
  browser/context/page-close signature — now confirmed via read-only
  runner inspection to have ZERO existing detection logic in
  `e2e/run-carried-groups.mjs` (only the unrelated 4-part
  `AUTH_EXPIRY_SIGNATURE` exists) and to currently abort the ENTIRE
  14-group run on any occurrence — is precisely and safely
  classifiable: setup-project-only + exact `Target page, context or
  browser has been closed` text + absence of any `[characterization]`
  line (proving the product spec never started) + explicit exclusion
  of `ERR_CONNECTION_REFUSED` and the existing auth-expiry signature.
  Ranked **P0**, selected for PATCH-096. Comment edge-cases
  (Shift+Enter, empty/whitespace edit, blur-without-Enter, rapid
  Enter) assessed and NOT authorized — no product-contract requirement
  exists and all are smaller than runner hardening. Atomic move
  implementation reaffirmed blocked, unchanged, no new owner evidence.
  **096 authorized (FIX, runner-only):** ONE file,
  `e2e/run-carried-groups.mjs` — adds one new signature constant/
  detection function (checked only after the existing, unweakened
  auth-expiry check fails), one new bounded one-retry branch, and two
  new separately-tracked counters (`setupCloseIncidents`,
  `recoveredSetupCloseIncidents`) — auth-expiry and setup-close totals
  are never merged. `ERR_CONNECTION_REFUSED` is explicitly and
  permanently excluded from ever triggering this retry. No production
  file, test spec, `playwright.config.ts`, or `auth.setup.ts` change
  authorized. Fence set: 47 (095's) minus the now-allowed runner file
  = **46/46**, raw/unique/header/hard-stop/final-report counts all
  verified to agree at 46 before authorization. Carried 089-095
  evidence unweakened. Commit message bound:
  `fix(e2e): bound one retry for genuine setup browser/context-close failures (PATCH-096)`.

- **2026-07-20** — **PATCH-094 DONE (commit
  `aee4322aa36dcaac7a3b28443a21e19285e6db60`, independent read-only
  review PASS, spec blob `7e7d8e0…`, 891 lines) + fresh census +
  PATCH-095 AUTHORIZED (DESIGN-ONLY, atomic cross-container move
  contract — zero code, zero migration)**. **094 final:** Flow A
  (Enter-save) — exactly one comment-bearing PATCH, 204, in every
  one of 4 independent runs; comment ID/userId/userName/timestamp
  all stable; `detachedComments` unchanged; local/persisted/reload
  all agreed. Classification `edit-save-consistent`. Flow B (Escape
  cancel after a real text change) — zero comment-bearing writes in
  every run; original confirmed text restored and persisted.
  Classification `edit-cancel-consistent`. Shift+Enter honestly
  recorded `not-attempted-within-bound-scope`. Final classification
  `edit-save-consistent`, stable across all runs. **Rulings (bind):**
  the source-proven synchronous `editingCommentId` clear (before the
  strict update confirms) is a CHARACTERIZED DESIGN RISK, not a
  proven defect — no fix authorized absent a real failure; the
  source-plausible Enter+onBlur double-invocation path did NOT
  manifest in any of 4 runs (exactly one write every time) — no
  duplicate-save fix authorized absent a deterministic repro.
  **091→093→094 now form a complete, non-contradictory evidence
  chain** (narrow probe miss → delayed-mount proof → save/cancel
  proof); no historical evidence rewritten. Gates: 2/1/1(JSON) + 3
  stable runs; 093 passed (`editor-mounts-and-is-drivable` +
  `inside-comment-row` + `not-reachable-through-existing-harness`
  all preserved); 092 passed; 091 passed (`mixed-comment-state`
  preserved); 090 passed; 089 passed (`mixed-drop-state` preserved);
  runner 14/14, 0 incidents (dev server correctly kept running
  throughout this review — no operator error recurred); 7/1, 9/1,
  59/2, 448/43, verify+build green; cleanup zero. **Product
  interpretation:** normal comment EDIT save AND cancel are both
  CURRENTLY WORKING; no comment-EDIT/duplicate-save/strict-channel/
  store-migration fix is justified. **Fresh census (30 items):**
  atomic cross-container move ranked **P0 for design** — with
  SHARPER new evidence than 090-094's prior framing: `supabase/BASELINE.md`
  (authored 2026-07-06, never updated) documents that
  `supabase/migrations/` does NOT rebuild the live database
  (historical drift from hand-applied/SQL-editor changes);
  reconciliation is explicitly blocked on Docker + a DB password;
  Docker Desktop's engine was confirmed NOT RUNNING at this census;
  no `supabase/config.toml`; no CI migration validation; the
  `supabase` CLI is not a project dependency (resolves via ad-hoc
  `npx`); a machine-local, gitignored `supabase/.temp/linked-project.json`
  shows a remote project link exists on this machine but is NOT
  committed/shareable tooling (if anything, a risk factor, since it
  means `db push --linked` could bypass all safeguards above).
  Blocker classification: **F, multiple** — B (no confirmed
  deployment owner/process) + C (no usable local test environment).
  PATCH-088 genuine setup-flake signature (4 occurrences now,
  distinct from 093's one-off reviewer `ERR_CONNECTION_REFUSED`)
  reassessed from LOW to MEDIUM, still not actioned. **095
  authorized as OPTION A — atomic move DESIGN, governance-only, zero
  code/migration:** binds the exact `move_child_between_containers`
  RPC contract (signature, transaction boundary, row-locking order,
  conflict-vs-idempotent distinction, same-parent no-op, SECURITY
  INVOKER ruling reaffirmed, same-board-only RLS assumption, throwing
  error contract), the repository/hook/UI integration plan, the
  three test layers and which are blocked vs. buildable, the
  deployment prerequisites and forward-only rollback plan. No
  implementation, migration, or new file is authorized — this is a
  contract for a FUTURE, separately-numbered patch once the owner
  resolves the BASELINE.md blockers. Fence set carried forward
  unchanged (46 + the newly-landed 094 spec = **47**, raw/unique/
  header/hard-stop counts all verified to agree at 47 before
  authorization; one stray "46" reference in an early draft was
  caught and corrected to 47 before commit). Carried 089-094
  evidence unweakened. No bound commit message — this patch has no
  code deliverable; a future implementation patch will bind its own.

- **2026-07-20** — **PATCH-093 DONE (commit
  `4dc94a7bab9a57d9143a8fe77bcd9e94cf87f33f`, independent read-only
  review PASS, spec blob `cdc9062…`, 749 lines) + fresh census +
  PATCH-094 AUTHORIZED (DIAGNOSIS, comment EDIT save persistence)**.
  **093 final:** the target comment was created via a real ADD,
  ownership proven (`hasCurrentUserId: true`); Edit was present and
  enabled; a real click occurred; `.ProseMirror[contenteditable="true"]`
  mounted `inside-comment-row`; the editor was genuinely drivable
  across all five independent live runs; no immediate visible reset;
  no dedicated Save/Cancel (Enter saves, Escape cancels, per source);
  Escape left the original text unchanged; zero comment-bearing
  writes during edit entry; persisted/reload state unchanged. Final
  classification `editor-mounts-and-is-drivable`, stable across all
  runs. **Timing refinement (bind):** focus stayed on the Edit
  button through 50/60ms and shifted to the editor only later within
  the bounded 3000ms window — 093 does not claim focus moved
  immediately, only that it was observed to shift within the window.
  **091/093 reconciliation:** NOT contradictory — 091's own wording
  already scopes its EDIT finding to "did not appear within the
  observed window" (Interpretation A, bounded by its own probe), not
  a categorical non-drivability claim; 093 added timing checkpoints
  091 didn't use and found the delayed mount. 091's ADD/REMOVE/RAPID
  evidence and its EDIT observation are RETAINED unchanged — no
  governance rewrite of PATCH-091 was needed or performed. The
  `immediatelyRender:false` + conditional `EditorContent` mount
  latency is recorded as a HYPOTHESIS only, not proven; transformed-
  canvas incompatibility remains explicitly unproven. Gates: 2/1/1
  (JSON) + 3 stable runs, classification/location/contrast all
  stable; 092 passed; 091 passed (`mixed-comment-state` + EDIT
  `action-not-drivable` under its own probe, unweakened); 090 passed;
  089 passed (`mixed-drop-state` preserved); runner 14/14, 0
  incidents (the reviewer's own `ERR_CONNECTION_REFUSED` from
  stopping the dev server before invoking the runner was disclosed
  as operator error, explicitly NOT a product or runner signature,
  and explicitly NOT usable as evidence for retry hardening); 7/1,
  9/1, 59/2, 448/43, verify+build green; cleanup zero. **Product
  interpretation correction:** 093 disproves the earlier provisional
  assumption that the DrawingLayout comment editor was categorically
  non-drivable — no production EDIT-mount fix is justified; a
  TipTap/transform/event-propagation/CSS fix remains unauthorized
  absent a new proven user-visible failure. **A gap remains:** 093
  only entered edit mode and cancelled via Escape on an UNCHANGED
  comment — it never verified a real Enter-to-save round-trip.
  **Fresh census (33 items):** comment EDIT save-persistence ranked
  **P0** — fully reachable, uncharacterized; source inspection
  (`EmbeddedCommentList.tsx:139-142`) found that `onSaveEdit` closes
  edit mode SYNCHRONOUSLY, before the async PATCH-092 strict update
  confirms — a plausible (not proven) double-invocation risk was
  also flagged where `onBlur` and `Enter` could both call
  `handleSaveEdit`. Move-atomicity (P1) revalidated unchanged,
  still correctly blocked on an owner-confirmed deployment plan.
  Runner hardening reassessed: the genuine three-occurrence
  browser/context-close signature remains at "ready" but unactioned;
  the reviewer's own `ERR_CONNECTION_REFUSED` was explicitly excluded
  from consideration as it was operator error, not a product/runner
  signature. **094 authorized (DIAGNOSIS-only):** ONE new spec
  `drawing-comment-edit-save.spec.ts` (prefixes
  `patch-064-harness-patch-094-comment-edit-save-a-/-b-`), Flow A
  (real Enter-save round-trip, wire capture, persisted readback,
  ID/author stability, reload), Flow B (Escape-after-a-real-change
  cancellation contrast — 093 only tested Escape with no change
  made), Flow C (conditional Shift+Enter, skippable without
  fabricating a result), Flow D (source inspection, no injection),
  Flow E (cleanup); bound classifications: `edit-save-consistent` |
  `edit-save-lost-write` | `edit-save-duplicate-write` |
  `edit-save-local-persisted-divergence` | `edit-cancel-consistent`
  | `edit-cancel-writes-unexpectedly` |
  `edit-save-action-not-drivable` | `mixed-edit-save-state`. No
  change to PATCH-092's strict channel authorized. Totals bound:
  focused totals TBD by implementer per §4; **46/46** fences (093
  set of 45 + the landed 093 spec itself, newly fenced) — raw,
  unique-path, header, hard-stop, and final-report counts all
  verified to agree at 46 before authorization; carried 089/090/091/
  092/093 unchanged. Commit message bound:
  `test(e2e): characterize drawing comment EDIT save persistence (PATCH-094)`.

- **2026-07-20** — **PATCH-092 DONE (commit
  `5f93ed54b7a643b17f0ffa849e873d71c07d1f85`, independent read-only
  review PASS, DrawingLayout `ad4e8fd…`, new spec `f57b46c…`, 631
  lines) + fresh census + PATCH-093 AUTHORIZED (DIAGNOSIS, comment
  EDIT UI defect)**. **092 final:** `handleUpdateChildComments`
  rewired to the strict, awaited `onUpdatePadletStrict` channel with
  exactly one `console.error('Failed to update comment', error)`
  catch; confirm-then-show semantics proven (source-level guarantee
  via the strict channel's own post-success merge, not just timing
  inference); ADD/REMOVE/RAPID all persist consistently through
  `metadata.comments`; `detachedComments` stayed empty; zero
  duplicates, zero lost writes, zero visible errors on success;
  failure path verified by source inspection only (no injection
  seam authorized). Move handler, `createAndLinkChildToContainer`,
  085/086/087/090 regions, and the 091 EDIT `action-not-drivable`
  diagnosis all confirmed byte-unchanged. Gates: 2/1/2 + 3 stable
  runs; 091 passed (`mixed-comment-state` + EDIT `action-not-drivable`
  preserved); 090 passed; 089 passed (`mixed-drop-state` + Flow B
  `action-not-drivable` preserved); runner 14/14 clean (one more
  transient browser/context-close non-signature setup failure was
  observed on the review's first attempt — third occurrence across
  090/091/092 reviews — correctly not misclassified as auth-expiry,
  resolved by retry, now re-ranked "ready for a narrowly-scoped
  hardening patch" rather than "insufficient signal," see 093 §9);
  7/1, 9/1, 59/2, 448/43, verify+build green; cleanup zero. **Fresh
  census (26 items):** comment EDIT UI defect ranked **P0** — the
  root cause is still NOT deterministically isolated after a deeper
  read-only inspection of `CommentRow.tsx`/`CommentEditor.tsx`/
  `EmbeddedCommentList.tsx` (new evidence: `EmbeddedCommentList` is
  ALSO used by `RowCanvas.tsx`, a different canvas system without
  DrawingLayout's pan/zoom transform ancestor — supports but does
  not confirm a DrawingLayout-specific mechanism; plausible
  contributing factors remain the conditional `EditorContent`
  mount + `immediatelyRender:false` + unverified `setTimeout`
  timing, and a `stopPropagation`-without-`preventDefault` pattern
  that would not stop a capture-phase ancestor listener). Move-
  atomicity design (P1) revalidated unchanged and still correctly
  blocked on an owner-confirmed migration/deployment plan (repo
  still has no `supabase/config.toml`/local CLI/migration test
  path); PATCH-088 runner flakiness re-ranked from "insufficient
  signal" to "ready" after a third occurrence, but not actioned
  this patch. **093 authorized (DIAGNOSIS-only):** ONE new spec
  `drawing-comment-edit.spec.ts` (prefixes
  `patch-064-harness-patch-093-comment-edit-a-/-b-`), Flow A
  (self-owned real-UI EDIT drivability observation, no hidden
  handler), Flow B (contrast layout if reachable through the
  existing harness only — no fabricated surface), Flow C (source
  inspection, no instrumentation seam), Flow D (cleanup); bound
  classifications: `editor-mounts-and-is-drivable` |
  `edit-state-set-but-editor-not-mounted` |
  `editor-mounted-outside-expected-subtree` |
  `edit-state-immediately-reset` | `drawing-layout-only-edit-defect`
  | `global-comment-edit-defect` | `action-not-drivable` |
  `mixed-edit-state`. A production fix (Option B) is explicitly NOT
  authorized until this diagnosis isolates a deterministic cause.
  Totals bound: focused totals TBD by implementer per §4; **45/45**
  fences (092 set of 40 + the landed 092 production file and spec
  (2) + `CommentRow.tsx`/`CommentEditor.tsx`/`EmbeddedCommentList.tsx`
  newly fenced (3) — corrected from an original stated 43/43 to the
  actual 45 unique entries the code block always contained, see the
  2026-07-20 amendment entry below); carried 089/090/091/092
  unchanged. Commit message bound:
  `test(e2e): characterize drawing comment EDIT UI defect (PATCH-093)`.

- **2026-07-20** — **PATCH-093 governance correction: immutable-fence
  count fixed from a stated 43/43 to the actual 45/45 (commit
  `63f5d19…` → amended).** Implementation preflight correctly
  stopped before creating any file when it found the §6 code block
  contained 45 unique path/blob entries against a prose requirement
  of 43 — all 45 resolved identically at implementation base
  `5f93ed5…` and at governance HEAD `63f5d19…`, with zero duplicates
  and zero malformed entries. Root cause: an arithmetic error at
  authoring time (40 inherited + 2 landed-092 files + 3 newly-fenced
  comment-UI files = 45, miscomputed as 43). All prose/preflight/
  review/final-report count references in `PATCH-093.md` corrected
  to 45/45; no fence entry was removed or added — the code block was
  already correct and untouched. No production or test file was
  touched at any point. PATCH-093's title, diagnosis-only status,
  one-file scope, allowed new spec
  (`e2e/characterization/drawing-comment-edit.spec.ts`),
  implementation-start HEAD (`5f93ed5…`), classification values,
  flow matrix, cleanup contract, carried totals, and hard-stop
  conditions are all UNCHANGED. Implementation may resume only from
  this amended governance HEAD.

- **2026-07-20** — **PATCH-091 DONE (commit
  `e4ac7e63b114b8ba5289cab56e7adbcd0e4d8cdb`, independent review
  history: initial PASS WITH REQUIRED CHANGES → corrected focused
  re-review PASS, landed spec `c8b32bc…`, 870 lines) + fresh census
  + PATCH-092 AUTHORIZED (FIX, strict comment persistence) + move
  sequencing REVISED**. **091 final:** `handleUpdateChildComments`
  (non-strict, un-awaited `onUpdatePadlet`) statically proven +
  runtime characterized. Store ruling: `metadata.comments`
  authoritative for the drawing comment-post UI; `detachedComments`
  empty/non-divergent; `canvas_comments` untouched. Review history:
  initial Flow B seeded an anonymous-owned EDIT target (foreign-
  ownership artifact, `CommentRow.tsx` gates Edit on
  `comment.userId === currentUserId`) → corrected to create the
  EDIT target via a real ADD + `hasCurrentUserId` proof + retained
  actual wire capture with an explicit zero-comment-write assertion
  for the not-drivable path. Corrected result: ADD/REMOVE/RAPID all
  drivable and consistent; EDIT stays `action-not-drivable` for a
  **genuine** UI reason (enabled button, editor surface doesn't
  appear) — no longer a permission artifact. Final classification
  `mixed-comment-state`. Gates: 2/1/2 + 3 stable runs; 090 passed;
  089 passed (`mixed-drop-state` + Flow B `action-not-drivable`
  preserved); runner 14/14 clean (one transient browser/context-
  close non-signature failure was observed in an earlier full
  review pass, correctly not misclassified as auth-expiry,
  resolved by retry — recorded as environmental flakiness, not
  actioned); 7/1, 9/1, 59/2, 448/43, verify+build green; cleanup
  zero. **Census/move-sequencing revision:** the 090-closure
  ruling (`092 = atomic move persistence, 093 = drag handle +
  regression`) is REVISED — this repo has no local Supabase CLI
  stack, no `supabase/config.toml`, no migration test/deploy path,
  so MODEL C (atomic RPC) is not implementation-ready this
  session; move-atomicity is deferred to a dedicated design patch
  once the owner confirms a deployment plan (RLS ruling recorded:
  SECURITY INVOKER preferred, existing `padlets` UPDATE RLS
  already scopes access; throwing-channel contract). PATCH-093
  stays reserved for the drag handle + move regression, contingent
  on that design patch landing first. **092 authorized (FIX)
  instead:** rewire `handleUpdateChildComments` to
  `onUpdatePadletStrict` (already mounted since 086/090), await
  it, confirm-then-show semantics (086/087/090 precedent), exactly
  one visible error, comments/detachedComments routing and the
  EDIT-UI defect (ranked separately as a diagnosis-first candidate,
  root cause not deterministically isolated — TipTap
  `immediatelyRender:false` + conditional `EditorContent` mount +
  canvas-transform ancestor are plausible contributing factors, not
  confirmed) both untouched. New spec
  `drawing-comment-strict-persistence.spec.ts` (prefixes
  `patch-064-harness-patch-092-comment-a-/-b-`), Flows A (confirm-
  then-show tripwire)/B (rapid)/C (source inspection, no
  injection)/D (cleanup). Totals bound: focused totals TBD by
  implementer per §3; 40/40 fences (091 set − DrawingLayout→allowed
  + 091 spec); carried 089/090/091 unchanged. Commit message bound:
  `fix(drawing): strict comment persistence with visible failure path (PATCH-092)`.

- **2026-07-20** — **PATCH-090 DONE (commit
  `637ab5dc82b2c4965520eca7b4c3ab3d4cbbfd44`, independent read-only
  review PASS, DrawingLayout `965fcd7…`, new spec `07ec5ad…`) +
  fresh census + PATCH-091 AUTHORIZED (DIAGNOSIS, drawing-layout
  comment persistence)**. **090 final:** library/draft
  create-and-append is now atomic-or-compensated via ONE shared
  helper `createAndLinkChildToContainer` — create on the existing
  channel, parent `childPadletIds` append via
  `onUpdatePadletStrict` (order preserved, exactly-once guard),
  strict confirmation before local settlement; on append failure
  best-effort compensation deletes ONLY the created child
  (`allSettled`), exactly one visible error `Failed to link child
  to container`, no retry/timer; library-site silent catch
  replaced (separate narrow parse error `Failed to parse drawing
  library drop payload`); move handler BYTE-KEPT; CanvasClient/
  hooks/repos/harness untouched; 085/086/087 regions intact; 089
  spec re-run post-fix: `mixed-drop-state` + Flow B
  `action-not-drivable` preserved. Flows A/B/C real ghost-drops
  green (exactly-once links, order preserved, reload consistent,
  zero errors); wire: POST 201 → childPadletIds PATCH 204 →
  later content PATCH 204 (not the link confirmation); failure
  path verified by source inspection (no injection). Gates:
  2/1/2 + 3 stable runs; runner 14/14, 0 incidents; 7/1, 9/1,
  59/2, 448/43, verify+build; cleanup zeros across 35 prefixes.
  **Census/design rulings:** move affordance = DEDICATED DRAG
  HANDLE (RowColumnContainerCard has zero drag attributes;
  whole-card drag conflicts with editors); move transactional
  model = MODEL C preferred (atomic Postgres RPC; precedent:
  `import_workspace_bundle`, board-members RPC) — client-only
  three-write move can strand half-states; safe sequencing:
  092 = atomic move persistence, 093 = handle + move regression;
  affordance-only patch exposing the non-atomic handler is
  PROHIBITED. Census CORRECTION: other-layout comment handlers
  (CanvasClient ~6594/6676/6756) are result-checked with
  toast — the DRAWING layout's internal
  `handleUpdateChildComments` (~1959–1964) is the outlier:
  fire-and-forget non-strict `onUpdatePadlet`, silent comment
  loss possible (P3). **091 authorized (DIAGNOSIS-only):** ONE
  new spec `drawing-comment-persistence.spec.ts` (prefixes
  `patch-064-harness-patch-091-comment-a-/-b-/-c-`), real-UI
  ADD/EDIT+REMOVE/RAPID flows on seeded comment posts, persisted
  field evidence (`comments` vs `detachedComments`), passive
  wire, source-inspection Flow E, cleanup Flow F; classification
  `comment-persists-consistently | comment-write-lost-or-overwritten |
  comment-divergence-observed | action-not-drivable |
  mixed-comment-state`; `canvas_comments` store OUT of scope.
  Totals bound: 2/1/2 ×3; runner 14 + separate 089 (2 passed,
  classification preserved) + 090 (2 passed) invocations; 448/43;
  40/40 fences; cleanup zeros across THIRTY-EIGHT prefixes.
  Commit message bound:
  `test(e2e): characterize drawing comment persistence (PATCH-091)`.

- **2026-07-19** — **PATCH-089 DONE (commit
  `92d742f27c550cf3d62b6ad8a1563b0ad09de5a2`, independent read-only
  review PASS, spec blob `3275063…`, 683 lines) + fresh census +
  PATCH-090 AUTHORIZED (FIX, atomic container child
  create-and-append)**. **089 final:** container-drop diagnosis
  landed. Selected real action
  `toolbar-note-editor-save-placement-prompt-add-to-existing-ghost-drag`
  (Note toolbar → NoteEditor → PlacementPrompt → "Add to
  Existing" → native drag of the visible ghost). Flow A drivable +
  consistent (both directions persisted, reload preserved,
  duplicate-parent count 1); Flow B **action-not-drivable**
  (rendered child exposes no `text/padlet-id` drag source; no
  synthetic bypass used; NO runtime duplicate-parent claim); Flow C
  drivable + consistent, no retry. Wire order (stable): child POST
  201 → parent childPadletIds PATCH 204 → child parentId PATCH 204
  (~2.7s debounce); NO old-parent removal write observed; 2xx ≠
  atomicity. Source findings kept separate from runtime: library
  site creates-then-appends inside a silent catch (orphan hazard);
  existing-card drop = two sequential non-strict writes, no
  old-parent removal path; draft site same orphan hazard. Final
  classification **mixed-drop-state** (= partial UI drivability;
  A/C consistent, B not drivable). Non-blocking reviewer
  observation recorded (ghost-consumed-but-no-row fallback branch;
  never fired; not production evidence). Gates: focused 2/1/2 + 3
  stable runs; runner 14/14, 0 incidents; deterministic 7/1, 9/1,
  59/2, 448/43, verify+build green; cleanup 0/0/0 ×3 prefixes; no
  artifacts. **Closure inspection:** NO live component sets
  `text/padlet-id` (setters only in `.bak` files) → cross-container
  move ruled **intended but currently inaccessible** — a separate
  UI-drivability defect; affordance-restore patch must precede any
  move-correctness fix. **090 authorized (FIX):** shared
  library/draft create-and-append atomicity in DrawingLayout.tsx
  ONLY (blob `a2fb3ae…`): extend `DrawingEmbeddableCardProps` with
  the already-mounted `onUpdatePadletStrict`/`onDeletePadlet`, ONE
  shared helper `linkCreatedChildToContainer` — strict append, on
  throw best-effort compensation delete of ONLY the newly created
  row, exactly one visible error, no retry/timer; library-site
  silent catch replaced; move handler BYTE-KEPT (any move edit =
  STOP). MODEL A persistence-first (086 precedent); create channel
  unchanged (already safe: null-return + rollback + single log).
  New spec `drawing-container-link.spec.ts` (prefixes
  `patch-064-harness-patch-090-link-a-/-b-/-c-`), Flows A–F,
  failure path by source inspection (NO injection seam). Totals
  bound: new spec 2/1/2 ×3; runner 14 UNCHANGED + separate 089-spec
  invocation 2 passed (runner list NOT modified this patch);
  448/43; 38/38 fences (089 set − DrawingLayout→allowed + 089 spec
  + RowColumnContainerCard `e58167d…`); cleanup zeros across
  THIRTY-FIVE prefixes. Commit message bound:
  `fix(drawing): atomic container child create-and-append with compensation (PATCH-090)`.

- **2026-07-19** — **PATCH-088 DONE (commit
  `22d3f1fc18cfbed3ffad372ed67aa71de8d0cfab`, independent read-only
  review PASS, runner blob `6a04d94…`, 345 lines) + fresh census +
  PATCH-089 AUTHORIZED (DIAGNOSIS, container-drop relationships)**.
  **088 final:** grouped carried runner lands the auth-expiry fix —
  14 bound specs as 14 sequential one-spec groups (each own
  invocation → fresh setup login, one worker), requires
  `PW_BASE_URL` (no invented default), invokes
  `node_modules/playwright/cli.js` via `process.execPath`.
  Classifier `AUTH-EXPIRY (INFRASTRUCTURE)` requires ALL of:
  timeout marker + locator/wait context +
  `getByTitle('Back to Dashboard')` + harness/openDrawingBoard
  context (never fires on mere timeouts/nav failures/401s/login
  pages). Retry: exact-signature only, ONE setup refresh + ONE
  `--no-deps` group retry max, failed retry stays failed, incident
  reported even on recovery; non-signature failures never retried.
  No credentials/cookies/headers/env dumps/auth-state in output; no
  DB cleanup by the runner. Accepted run: 14/14 groups first-try,
  0 incidents, exit 0; an earlier oversized grouping naturally
  PROVED the bounded branch (classified, refreshed once, retried
  once, retry failure NOT masked). Deterministic 7/1, 9/1, 59/2,
  448/43, verify+build; one new file only; no dependency added;
  import audit clean. **Census at `22d3f1f`:** #1 SELECTED —
  container-drop cluster DIAGNOSIS (statically proven: site ~307
  create-then-append inside `catch { /* silent */ }` → orphan
  hazard; ~487/496 two-write append+reparent NON-ATOMIC with NO
  old-parent removal — drop target guards only self/same-container,
  so a cross-container move structurally leaves the child in BOTH
  parents; ~520 same orphan hazard; runtime
  reachability/drivability UNPROVEN → fix would be speculative);
  positions best-effort (defer), comments store-duality (after
  cluster), seven-site family later, 081 stays RETIRED-BY-NOTE,
  frame/sidebar no repro, rest deferred, no new 088 issue.
  **Bound invariant (TARGET, PATCH-090 gates on it):** both-or-
  neither persistence of `childPadletIds` ⟺ `parentId`, single
  parent, order preserved, move removes from old parent, failed
  ops leave prior state, no orphans/duplicates; transactional
  TARGET = MODEL A (persistence-first + compensation, 086
  precedent); MODEL B rejected. **PATCH-089 — Container-Drop
  Relationship Persistence Diagnosis, ONE new file:**
  `e2e/characterization/drawing-container-drop.spec.ts` (ONE test,
  ≤3 boards, prefixes `patch-064-harness-patch-089-drop-a-/-b-/-c-`;
  Flow A drop both-directions + reload, B move → duplicate-parent
  check, C rapid repeats, D passive wire order, E source
  inspection, F cleanup zeros; observational — bound
  `action-not-drivable` value allowed when the real UI can't drive
  a flow, never fabricate actions). Expected: 2/1/2 ×3 coherent;
  carried 14 via the 088 runner unchanged; 448/43; cleanup across
  THIRTY-TWO prefixes. **37 blob-ID fences** (self-verified 37/37;
  runner now fenced). Bound commit: `test(e2e): characterize
  container-drop relationship persistence (PATCH-089)`. Independent
  read-only PASS required before commit. PATCH-089 implementation
  NOT started.
- **2026-07-19** — **PATCH-087 DONE (commit
  `ba0c8f904d71f255045261497bf2803698ac206f`, independent read-only
  review PASS, blob `a2fb3ae…`, +6/−7 lines) + fresh census +
  PATCH-088 AUTHORIZED (test-INFRA fix, grouped carried runner)**.
  **Final 087 ruling:** the drawing content save used the void
  channel (both bound-substring catches dead for persistence
  failures; `performSave` cleared `dirtyDataRef` pre-await → failed
  save silently dropped the snapshot, work lost on reload). Fix:
  `saveDrawingSnapshot` → `onUpdatePadletStrict` (resolved AND
  thrown failures propagate), redundant inner catch removed (ONE
  failure path, `Failed to save drawing to master padlet` logs
  ONCE), failed snapshot re-armed to `dirtyDataRef` only-if-null
  (newer snapshot always wins), no retry loop/timer/trigger, scene
  never rolled back; success semantics byte-equivalent; all other
  callers + CanvasClient/useCanvasData/posts/postsRepository
  untouched; 085/086 intact. Gates: duplicate-persistence 2/1/2 +
  3× stable, no save-error substring on healthy runs, content 2xx
  present; carried 14 green (initial long batch hit the KNOWN
  auth-expiry signature — sanctioned refresh + individual
  `--no-deps` reruns only); deterministic 7/1, 9/1, 59/2, 448/43,
  verify+build; cleanup 29 prefixes zero; ports 3000/4000 free.
  **Census at `ba0c8f9`:** #1 SELECTED — long-batch auth-token
  expiry (mechanism proven: setup runs once per invocation; token
  outlives 8–17-min batches; alphabetical tail fails at
  `Back to Dashboard`; 10+ incidents across 083–087; grouped short
  invocations always pass). #2 container-drop caller cluster
  (~307/487/496/520 — non-atomic childPadletIds/parentId writes,
  per-site silent catches, orphaned children on reload) = leading
  PATCH-089 production candidate, needs bounded design ruling;
  #3 comments caller (~1939) HIGH severity but comment-store
  duality (Phase 3) — after the cluster; #4 position saves
  (~932/942) intentionally best-effort, DEFER by design; #5 broader
  contract consistency later; #6 PATCH-081 stays RETIRED-BY-NOTE;
  #7 frame/sidebar — no characterized defect; #8–12 deferred;
  #14 none. Full bound caller table in PATCH-088 §4. **PATCH-088 —
  Carried-Suite Grouped Runner, ONE new file:**
  `e2e/run-carried-groups.mjs` (absence-gated): runs the 14 carried
  specs as bounded sequential groups (≤4 specs AND ≤~4 min each,
  own invocation → own fresh setup login), requires `PW_BASE_URL`,
  detects the exact `Back to Dashboard` timeout signature →
  explicit `AUTH-EXPIRY (INFRASTRUCTURE)` classification + one
  sanctioned refresh + ONE retry of that group (incident reported
  even when retry passes); non-signature failures fail immediately
  (never retried, never masked); no credentials/headers in output;
  no config/harness/spec/production/package changes (all fenced).
  **36 blob-ID fences** (self-verified 36/36; DrawingLayout now
  fenced at `a2fb3ae…`). Bound commit: `test(e2e): grouped
  carried-suite runner with auth-expiry classification
  (PATCH-088)`. Independent read-only PASS required before commit.
  PATCH-088 implementation NOT started.
- **2026-07-19** — **PATCH-086 DONE (commit
  `7dab2086bfde47178c0b50ce48aa74905ef0fc51`, independent read-only
  reviewer Kepler PASS after Amendment 1; blobs `a028dd6…`
  CanvasClient / `a7b81a1…` DrawingLayout / `0644447…` deep-clone
  spec) + fresh census + PATCH-087 AUTHORIZED (FIX,
  content-save failure visibility)**. **MODEL A delivered:**
  Duplicate slide creates fresh frame/child element ids, fresh
  cloned container + child-card rows, rewired
  `parentId`/`childPadletIds`, preserved order, equivalent initial
  content, independent edits, deletion isolation BOTH directions;
  metadata per bound table (pointers copied, no storage
  duplication, comments stay with source, fresh timestamps,
  inserting user owns clones). Strict contract landed: CanvasClient
  `handleDrawingLayoutUpdatePadletStrict` (normalize →
  `updatePostFieldsOrThrow`, no catch-and-continue, post-success
  merge) wired as `onUpdatePadletStrict`; rewire confirmed before
  `updateScene`; failure → reverse-order narrow compensation + ONE
  console.error; sources untouched. Flows A–K green (K by
  inspection); passive wire evidence: 2xx PATCH with cloned
  container id + fresh child ids before settlement. Gates: focused
  2/1/2 + JSON 2/0/0 + 3× stable; carried 13 green (sanctioned
  auth-refresh recovery only); deterministic full 448/43 +
  verify/build; cleanup 29 prefixes zero. 085 preserved
  (element-key tracking, debounces, no storm). useCanvasData/
  posts/postsRepository/deletion paths untouched; ordinary
  `onUpdatePadlet` callers unchanged. **Census at `7dab208`:** #1
  SELECTED — drawing content-save silent failure
  (`saveDrawingSnapshot` uses the void channel; both
  `"Failed to save drawing to master padlet"` catches are DEAD for
  persistence failures; `performSave` clears `dirtyDataRef` before
  saving → failed save silently drops the snapshot, work lost on
  reload; strict channel already plumbed). #2 remaining non-strict
  callers — after this; #3 contract-consistency design patch —
  later; **#5 PATCH-081 RETIRED-BY-NOTE** (derivation timing-stale:
  its immediate live-scene probe races the now-async duplicate →
  label can never self-correct; spec stays untouched/green;
  `drawing-duplicate-deep-clone.spec.ts` is now the authoritative
  duplicate characterization); #6/#7 frame/sidebar — no
  characterized defect remains (079 `sidebar-updates-correctly`,
  080 both-persist), diagnosis-first if a repro appears; #13 auth
  expiry — dedicated infra patch justified but ranked below this
  P3, deferred; #14 none. **PATCH-087 — Drawing Content-Save
  Failure Visibility, ONE file:** `DrawingLayout.tsx` (starting
  blob `a7b81a1…`; `saveDrawingSnapshot`/`performSave` ONLY: switch
  content save to `onUpdatePadletStrict`, one log per failed
  attempt, re-arm `dirtyDataRef` only-if-null, no new
  timer/trigger; all other callers byte-unchanged; 085/086 regions
  byte-intact). NO new spec/prefixes: acceptance = 14 carried specs
  green with saveError watchers silent + 3× duplicate-persistence
  stability + failure path by inspection. **35 blob-ID fences**
  (self-verified 35/35 at base; CanvasClient + both 086 specs now
  fenced). Bound commit: `fix(drawing): surface content-save
  failures via strict update channel (PATCH-087)`. Independent
  read-only PASS required before commit. PATCH-087 implementation
  NOT started.
- **2026-07-19** — **PATCH-086 Amendment 1 — error-propagation
  scope (Classification B / OPTION A) after a correctly-honored
  stop condition and two Sonnet FAILs.** Blocker: the §3
  no-half-mutated-scene contract covers the parent
  `childPadletIds` REWIRE, but `onUpdatePadlet` →
  `updateDrawingLayoutPadlet` (useCanvasData 566–590) NEVER rejects
  (resolved error → silent rollback; thrown → caught/logged) — the
  candidate could not truthfully confirm the rewire before
  `updateScene`. Candidate otherwise conformant (rows-before-scene,
  reverse-order compensation, one console.error, sources untouched,
  085 hunks intact, all gates green; blobs `d47b2f0…` production /
  `b618a8c…` spec — ACCEPTED as resumption point, unchanged by
  governance). **Ruling:** the repo already owns the visible-failure
  primitive — `updatePostFieldsOrThrow` (PATCH-051 idiom, exported,
  already destructured in CanvasClient) — so NO prerequisite patch,
  NO useCanvasData/posts/postsRepository change (they stay fenced);
  census #7 broad family remains later. **Amendment:** allowed
  files 2 → 3 — `app/dashboard/canvas/[id]/CanvasClient.tsx`
  (starting blob `1c6864b4…`) bounded to ONE
  `handleDrawingLayoutUpdatePadletStrict` handler (normalize →
  `await updatePostFieldsOrThrow` → post-confirmation `setPadlets`
  merge; ≤20 lines, bounded over-ceiling exception) + ONE prop pass;
  DrawingLayout adds the REQUIRED `onUpdatePadletStrict` prop and
  switches ONLY the clone-rewire call site; spec adds the smallest
  additive passive-wire assertion (2xx PATCH bearing cloned
  container id + rewired childPadletIds); negative path stays Flow K
  by inspection. Fences UNCHANGED 33/33. Commit message unchanged.
  Sonnet reviews ALL THREE files; no commit before PASS. PATCH-087
  NOT started.
- **2026-07-19** — **PATCH-085 DONE (commit
  `ef2a8234d686b8cba5c7430132affbbb552f9a63`, Sonnet independent
  PASS, three blobs `a92bb25…` production / `b0ab5ea…` regression
  spec / `6bbd6de…` amended presentation spec) + fresh census +
  PATCH-086 AUTHORIZED (FIX, deep clone)**. **Final fix ruling:**
  move detection re-keyed padlet-id → ELEMENT id at the three
  bounded sites; persistence target unchanged (padlet id from
  `padlet://` link); shared-link false-drag oscillator eliminated →
  2000 ms content-save debounce no longer starved → Duplicate flows
  persist. Flows A–D all green ×3 in BOTH implementer and Sonnet
  passes (Sonnet intervals 1023/987/858 ms; D waits 2692/3282/2745
  ms; raw writes 18/18/18/19 vs ≤60; content 10/10/10/11; zero
  errors). Amendment 1 geometry final: seeded 260 → live/persisted
  conformed 153 for the two slide embeddables only; 260 was
  defect-frozen persistence. Carried shifts recorded (083
  `mixed-supersession-state`, 084 `mixed-wire-state`, 080
  `mixed-slide-persistence-state`, 076
  `shared-reference-with-deletion-cascade` + persisted:true, 073
  `pointer-reachable-all-items`, 082
  `unexpected-duplicate-persistence`; 081 label stale by design —
  fresh-row detector). All gates green (12 carried specs; 7/1, 9/1,
  59/2, 448/43; verify+build; 25-prefix + umbrella cleanup zero;
  auth-expiry incidents recovered ONLY via sanctioned setup
  refreshes — recorded as deferred test-infra census #15).
  **Fresh census at `ef2a823`:** #1 duplicate deep-clone
  independence — SELECTED (subsumes shared-row semantics, deletion
  cascade, fresh-row creation, deletion isolation; 081 stale label
  resolves by observation); #7 silent resolved-error handling —
  separate later patch (clone path throws, so NOT needed for 086);
  #8/#9 frame-geometry/sidebar sync — after duplicate family;
  #10–14 deferred; #15 long-batch auth expiry — deferred infra
  patch; #16 no new defect from 085. **Product semantic BOUND:
  MODEL A — independent deep clone** (re-affirms PATCH-076 §0.B.2;
  Ctrl+D precedent P6; P3 forbids edit-one-edits-both and the
  proven remove-duplicate-deletes-original cascade). **PATCH-086 —
  Duplicate Slide Deep-Clone Independence, TWO files:** production
  `DrawingLayout.tsx` (starting blob `a92bb25…`; `handleDuplicateSlide`
  region + ONE local helper ONLY: clone container row + child rows
  via existing `onAddPadlet` + `sanitizeClonedPostMetadata`,
  rewire `parentId`/`childPadletIds`/links, rows BEFORE scene,
  abort + best-effort compensating deletes + one console.error on
  failure; NO deletion-path edit — isolation must follow from fresh
  rows or STOP) + NEW spec
  `e2e/characterization/drawing-duplicate-deep-clone.spec.ts`
  (ONE test, FOUR boards, prefixes
  `patch-064-harness-patch-086-clone-a-/-b-/-c-/-d-`; Flows A–D
  fresh ids + equivalence, E/F edit isolation, G/H deletion
  isolation with reloads, I rapid Add→Dup carryover, J cleanup
  zeros, K failure-path by inspection). **33 blob-ID fences** at
  base `ef2a823` (085 set + both landed specs +
  `clonedPostMetadata.test.ts`). Expected: new spec 2/1/2 ×3
  stable; carried 13 specs' totals unchanged (081/076/085 evidence
  shifts expected); full 448/43; cleanup zero across TWENTY-NINE
  prefixes. Bound commit: `fix(drawing): deep-clone linked rows on
  duplicate slide (PATCH-086)`. Sonnet PASS required before commit.
  PATCH-086 implementation NOT started.
- **2026-07-19** — **PATCH-085 Amendment 1 — presentation
  characterization correction (OPTION B) after a correctly-honored
  stop condition.** Implementer stopped on the bound carried-totals
  condition: `drawing-presentation.spec.ts:1100`
  (persisted-scene pre/post equality) failed — `emb-slide-a`/`-b`
  heights 260→153. **CTO forensics (candidate untouched, blobs
  `a92bb25…`/`b0ab5ea…` verified before and after):** production
  diff audited hunk-by-hunk = EXACTLY the authorized keying change
  (no geometry code); candidate reproduction deterministic ×2 (ONLY
  the two heights change; x/y/width/order/links byte-stable;
  distinct links — no shared-link involvement); **base comparison
  via detached worktree at `6f9681d` (base DrawingLayout
  `5455597…`): 2 passed/2 skipped** — the same live conformance
  occurs at base but is never persisted (autosave starved; stale
  seeded 260 survives). Mechanism closed: `onNaturalHeight`
  (~460–479, untouched) measures card content and updates the scene
  WITHOUT the sync flag → legitimately arms the 2 s autosave with
  conformed height 153 (= max(28+22+content, 80)); move detection
  writes x/y only — 260 was seeded JSON frozen by the defect.
  **Classification B: the carried characterization encoded the
  defect (frozen persistence) as an invariant; 153 is
  product-correct; NOT a geometry regression.** Amendment: allowed
  files 2→3 (presentation spec, starting blob `ddab8338…`, smallest
  `:1100`-region assertion/evidence update only: keep
  order/ids/x/y/width/links byte-stable assertions; slide-embeddable
  heights assert the conformed live value with 153 recorded; seeded
  260 recorded, not asserted post-run); fences 31→30 (presentation
  spec removed); carried totals must RETURN fully green including
  presentation 2/2; bound geometry invariant: any third value,
  non-determinism, or any OTHER element changing = STOP. Sonnet
  reviews ALL THREE files. Resumption from the UNCHANGED candidate
  blobs; PATCH-086 NOT started; cleanup verified zero after
  forensics; worktree removed; port 3000 free.
- **2026-07-19** — **PATCH-084 DONE (commit
  `6f9681d5f17b6770f9d08eeb110641dea24453c9`, blob `280d3754…`, Sonnet
  PASS, zero semantic/classification drift ×3 runs) + fresh census +
  PATCH-085 AUTHORIZED (**FIX AUTHORIZED** — first production fix of
  the persistence family)**. **Final classification:**
  `duplicate-save-never-sent` (every run). Flow A control: Add
  content write observed + accepted + persisted. Flows B/C: NO
  qualifying content-bearing write containing any new frame id ever
  reached `/rest/v1/padlets`; neither console substring observed;
  diagnostic raw counts A=20 / B≈34-36 / C≈35-37 (non-material
  variation per the amended two-class stability contract, which is
  recorded in the closure). Timing: Add→Duplicate ≈2.23 s
  (evidence) / ≈1.75 s (trace). **Wire ruling:** the defect occurs
  BEFORE rejection/overwrite/loss — client-side; "never sent" =
  bounded passive-window claim. **083 comparison:** refined, not
  discarded; Duplicate-only proves it is not solely rapid-action
  supersession; isolated Add healthy. **Closure-time exact-owner
  ruling (decisive):** slide handlers never call `setElements` →
  the sidebar row proves `handleChange` fired → onChange suppression
  ELIMINATED; first post-Duplicate onChange ARMED the 2 s debounce;
  zero wire writes ⇒ the debounce was PERPETUALLY RESET
  (**starvation**) by sub-2 s flag-false onChange churn. Statically
  proven churn generator: `handleDuplicateSlide` clones children
  PRESERVING `link` → two live embeddables share one `padlet://` id
  dx=width+80 apart, while move detection keys `lastEmbeddablePosRef`
  BY PADLET ID → deterministic FALSE DRAG every onChange scan →
  800 ms position-write storm (the observed ~15 extra non-content
  writes in B/C) → `setPadlets` → sync effect → `updateScene` → more
  onChanges → sub-2 s loop; also overwrites the shared row's
  position with the clone's coords (can drag the ORIGINAL onto the
  clone). **Census:** 1) element-keyed move-detection fix
  (SELECTED), 2) coalescing (subsumed), 3) onChange suppression
  (ruled out), 4) debounce semantics (channel, unchanged), 5-6
  (ruled out), 7) silent-error visibility (later), 8) deep-clone
  rows (after this), 9-14 deferred, 15) shared-row position
  overwrite (same root cause, fixed here). **PATCH-085 — Drawing
  Duplicate Persistence Fix, TWO files:** production
  `components/collabboard/canvas/layouts/DrawingLayout.tsx`
  (starting blob `5455597d…`; ONLY the bounded §2 sites: re-key
  move-detection tracking to ELEMENT id; save target stays padlet
  id; debounces/locks/handlers/error paths untouched) + NEW
  regression spec
  `e2e/characterization/drawing-duplicate-persistence.spec.ts`
  (ONE test, FOUR boards, prefixes
  `patch-064-harness-patch-085-fix-a-/-b-/-c-/-d-`,
  `test.setTimeout(420_000)` bound): Flow A Add persists (control);
  Flow B rapid Add→Dup ≤5 s BOTH persist; Flow C Dup-only persists;
  Flow D Add, ≥2.5 s wait, Dup — both persist; E/F via passive write
  counts (STOP if >60/flow), G by diff inspection (no error-path
  touch). Carried observational specs' pass/fail totals MUST stay
  unchanged; their classifications WILL legitimately change
  (e.g. 083→mixed-supersession-family, 084→mixed-wire-family) —
  expected, reported, non-blocking. **31 blob-ID fences** at base
  `6f9681d` (084's set − DrawingLayout.tsx + 084's landed spec).
  Cleanup zero across TWENTY-FIVE prefixes. Expected: new spec 2/1/2
  ×3 stable (assertion failure = STOP, not flake); full 448/43.
  Bound commit: `fix(drawing): key embeddable move detection by
  element id (PATCH-085)`. Sonnet PASS required before commit.
  PATCH-085 implementation NOT started.
- **2026-07-18** — **PATCH-083 DONE (commit
  `0683b965d3821088a4ed9812693f408e0dcfa280`, blob `c6cc4fea…`, Sonnet
  PASS freshly re-derived TWICE, three stable runs zero drift both
  passes) + fresh census + PATCH-084 AUTHORIZED (diagnosis-only,
  FINAL before the fix)**. **Final twenty-six-field diagnosis:**
  Flow A (Add only) all-TRUE incl. `addPersistedSettled`; Flow B
  (rapid Add→Duplicate, interval trace-measured ~1.75–1.77 s)
  actions/fit/live all TRUE but `addEverPersisted`/
  `addPersistedSettled`/`duplicateEverPersisted`/
  `duplicatePersistedSettled` ALL FALSE; Flow C (Duplicate only)
  live TRUE, persistence FALSE; `saveErrorObserved` FALSE everywhere;
  **`classification: add-superseded-by-rapid-duplicate`**. Flow A
  persisted at ~2.1 s (debounce+latency corroboration); Flows B/C
  stayed at the seeded pair for the entire ≥20 s window. **Prefix
  correction (bound):** 083's spec used
  `patch-064-harness-patch-083-flow-a-/-b-/-c-`, NOT the single
  bound `…-supersession-` prefix; tracked cleanup-prefix total is
  **18**, not 16; Sonnet accepted as non-blocking. **PATCH-080/082
  comparisons:** isolated Add NOT broken (083 Flow A reproduces
  080); 082's valid live clone content still fails to become
  durable; boundary = live scene mutation vs persistence.
  **Closure-time read-only discovery (decisive):** the save chain
  `saveDrawingSnapshot` → `handleDrawingLayoutUpdatePadlet` →
  `updateDrawingLayoutPadlet` (useCanvasData.ts 566–590) →
  `canvas.updatePostFields` → `updateFieldsById` →
  `supabase.from('padlets').update()` NEVER rejects: a resolved
  error takes a SILENT rollback (no logging); the thrown branch logs
  `'Failed to update padlet:'` — a different string from 083's bound
  substring; DrawingLayout's own save-error catch is unreachable.
  083's `saveErrorObserved:false` is correct but weaker than it
  appears. **Fix readiness ruling: NOT statically provable** which
  of (a) save never sent / (b) sent-and-silently-rejected /
  (c) sent-accepted-then-overwritten holds — three different fixes —
  so OPTION B chosen, sharpened to wire-level E2E observation (no
  unit seam needed). **Census:** 1) wire diagnosis (SELECTED),
  2) save-path fix (blocked on 1; semantics + five-flow regression
  matrix A–E now BOUND in 084 §7), 3) deep-clone fix (after 2),
  4) silent save-error handling (folded into 2), 5–6 subsumed by 1,
  7–8 frame-geometry family, 9–13 deferred. **PATCH-084 — Drawing
  Save Wire-Level Diagnosis, diagnosis-only, exactly ONE new file**
  `e2e/characterization/drawing-save-wire.spec.ts`: 083's three
  flows verbatim + passive `page.on('request'/'response')` capture
  of `/rest/v1/padlets` writes (method/status/id-presence
  booleans/bounded bodies, NO auth material, `page.route`
  PROHIBITED) + TWO console substrings (083's plus
  `'Failed to update padlet:'`) + 083-method settlement. THIRTY-FOUR
  bound fields; enum (7, bound order): `wire-observation-unsound` |
  `control-content-write-missing` | `duplicate-save-never-sent` |
  `duplicate-save-rejected` |
  `duplicate-save-accepted-then-overwritten` |
  `duplicate-save-accepted-but-lost` | `mixed-wire-state` — outcome
  NOT hardcoded. **31 blob-ID fences** at base `0683b96` (083's 27 +
  its landed spec + newly fenced useCanvasData.ts /
  lib/domain/canvas/posts.ts / lib/infra/canvas/postsRepository.ts).
  Bound prefixes (all three, explicit):
  `patch-064-harness-patch-084-wire-a-/-b-/-c-`; cleanup zero across
  TWENTY-ONE prefixes. Expected: new spec 2/1/2 ×3 stable
  (classification drift = STOP); `test.setTimeout(300_000)`; carried
  unchanged (supersession now carried 2/1/2); full 448/43. Bound
  commit: `test(e2e): characterize drawing save wire-level behavior
  (PATCH-084)`. Sonnet PASS required before commit. PATCH-084
  implementation NOT started.
- **2026-07-18** — **PATCH-082 DONE (commit
  `69c7abf024e2b10e68e9670518be9d128a69a120`, blob `5d3cccb6…`, Sonnet
  PASS, three stable runs zero drift) + fresh census + PATCH-083
  AUTHORIZED (diagnosis-only)**. **Final fourteen-field diagnosis:**
  both flows TRUE for row-appearance, verified fit (zoom 100%→60%
  every run), post-fit fresh duplicate frame label AND second live
  child render; BOTH `duplicatePersistedSettled: false`;
  **`classification: live-frame-in-both-flows`**. **PATCH-081
  correction (ruled):** 081's pre-fit observation stands, but its
  `sidebar-only-duplicate` interpretation was TOO STRONG — verified
  fit proves the duplicate frame+child were already in the live scene,
  off-viewport; `Shift+1` = fork `actionZoomToFit`, pure viewport math
  over the EXISTING scene (reveals, cannot create); 081 classification
  SUPERSEDED/refined. **PATCH-080 timing comparison (ruled):** 080
  settled Add separately and Add persisted; 082's rapid Add→Duplicate
  with ONE combined settlement left NEITHER new frame settled — not
  proof Add never persists, but evidence an unsettled save may be
  superseded/dropped by a rapid later action; bound into 083 and the
  fix's regression matrix. **Divergence boundary now:** live clone
  construction is GOOD in both flows; the loss is entirely on the
  save/persistence path (silent `console.error` swallow sites in
  `saveDrawingSnapshot` identified read-only at closure). **Census:**
  1) save-supersession diagnosis Flows A/B/C (SELECTED), 2) deep-clone
  fix (blocked on 1), 3) rapid-action supersession (folded into 1),
  4) stale handler-state family, 5) save-swallow observation (folded),
  6-7) frame-geometry diagnosis→fix, 8-12 deferred. **Duplicate fix
  NOT ready:** mechanism candidates bounded to four (onChange
  suppression / server rejection behind the silent catch / stale
  last-write-wins overwrite / rapid-action cancellation) but none
  proven — OPTION B chosen. **PATCH-083 — Drawing Scene Save
  Supersession Diagnosis, diagnosis-only, exactly ONE new file**
  `e2e/characterization/drawing-save-supersession.spec.ts`: ONE
  active test, THREE sequential disposable boards — Flow A (Add
  alone, full settlement), Flow B (Add then IMMEDIATELY Duplicate ≤5 s,
  one combined settlement), Flow C (Duplicate only) — each with
  read-only `page.on('console')` error listener (bound exact substring
  `Failed to save drawing to master padlet`), persisted frame-id TIME
  SERIES (≤1000 ms cadence, ≥20 s window, settled = final ≥6 s
  stable), and VERIFIED fit (082 methodology) per flow. TWENTY-SIX
  bound fields; enum (7, bound order):
  `supersession-observation-unsound` | `save-error-observed` |
  `duplicate-transient-then-lost` | `add-superseded-by-rapid-duplicate`
  | `add-persists-duplicate-never` | `no-new-frame-persists` |
  `mixed-supersession-state` — outcome NOT hardcoded. 27 blob-ID
  fences at base `69c7abf` (082's 26 + its landed spec). Expected: new
  spec 2/1/2 ×3 stable (classification drift = STOP);
  `test.setTimeout(300_000)` explicitly bound (three-flow exception to
  the prior 240 s cap); carried unchanged (divergence now carried
  2/1/2); full 448/43; cleanup zero across SIXTEEN prefixes. Bound
  commit: `test(e2e): characterize drawing scene save supersession
  (PATCH-083)`. Sonnet PASS required before commit. PATCH-083
  implementation NOT started.
- **2026-07-18** — **PATCH-081 DONE (commit
  `718c99127adb6a39a7ed185e68b9817a5cea5b25`, blob `147ae0ae…`, Sonnet
  PASS, three stable runs zero drift) + fresh census + PATCH-082
  AUTHORIZED (diagnosis-only)**. **Final ten-field diagnosis:**
  `duplicateRowAppeared: true`; ALL live-scene signals FALSE
  (frame-label immediate/stable, child-render immediate/stable —
  `duplicateFrameId` null in every run); `sourceChildStillRendered:
  true`; persistence FALSE for frame and children;
  **`classification: sidebar-only-duplicate`**. **Narrowest proven
  divergence boundary:** sidebar/outer React `elements` state (which
  must hold the duplicate — the sidebar derives from it) vs the
  direct Excalidraw live-scene observables; internal cause
  unresolved; no fix implemented. **State-dependent PATCH-080
  refinement (bound):** Add-then-Duplicate (080) showed a fresh live
  frame label; Duplicate-only (081) never does — both specs faithful;
  real state dependence, likely tied to Add refreshing the outer
  `elements` state before Duplicate; residual caveat: 081-era fit
  checks used an unverified Shift+1 ⇒ 082 binds VERIFIED fit.
  **PATCH-076 interpretation (bound):** five-way layer separation
  sharpened (sidebar state / outer React state / live scene /
  presentation resolver / persisted scene); 076 neither disproved nor
  fully confirmed. **Census:** 1) divergence diagnosis Flow A vs
  Flow B (SELECTED), 2) deep-clone fix (blocked on 1; must regress
  BOTH flows when authorized), 3) stale handler-state family, 4-5)
  frame-geometry diagnosis→fix, 6-10 deferred. **PATCH-082 —
  Duplicate Outer-State/Live-Scene Divergence Diagnosis,
  diagnosis-only, exactly ONE new file**
  `e2e/characterization/drawing-duplicate-divergence.spec.ts`
  (absence verified; PATCH-077 path stays permanently absent): ONE
  active test, TWO sequential disposable boards — Flow A (Duplicate
  only) and Flow B (Add slide below, then Duplicate) — each with
  baseline → real action(s) → **VERIFIED zoom-to-fit** (real
  empty-canvas selection click + real Shift+1, zoom display read
  before/after; labels derived from POST-fit read only) → settled
  persistence (PATCH-076 method). Rename/Remove/deletion/reload/
  FullscreenPresentation/drag and any further canvas interaction
  PROHIBITED. FOURTEEN bound fields (five per flow + `flowB_addRowAppeared`
  + `classification` + `prefixA`/`prefixB`); enum (7, bound order):
  `divergence-observation-unsound` | `unexpected-duplicate-persistence`
  | `prior-add-enables-live-frame` | `no-live-frame-in-either-flow` |
  `live-frame-in-both-flows` | `inverse-state-dependence` |
  `mixed-divergence-state` — outcome NOT hardcoded. 26 blob-ID fences
  at base `718c991` (081's 25 + its landed spec). Expected: new spec
  2/1/2 ×3 stable; carried unchanged (clone-shape now carried 2/1/2);
  full 448/43; cleanup zero across FIFTEEN prefixes. Bound commit:
  `test(e2e): characterize duplicate outer-state live-scene
  divergence (PATCH-082)`. Sonnet PASS required before commit.
  PATCH-082 implementation NOT started.
- **2026-07-18** — **PATCH-080 DONE (commit
  `34d9d54371a0bcc6dd360dc06394130fad918afe`, blob `9a6c7b42…`, Sonnet
  PASS, six coherent runs zero drift) + fresh census + PATCH-081
  AUTHORIZED (diagnosis-only)**. **Final nine-field result:** Add
  visible/persisted/survived-reload all TRUE with same frame
  identity; Duplicate visible TRUE but `duplicateRendersSourceChild`
  FALSE, persisted FALSE, survived-reload FALSE;
  `classification: mixed-slide-persistence-state` (soundness gate —
  no second live child render). **Diagnosis:** Add and Duplicate
  share the append-style `updateScene` mutation, and Add persists ⇒
  append shape alone is NOT the failure; suppression is
  Duplicate-specific or clone-shape-specific. **PATCH-076
  discrepancy ruling (bound):** 076 measured FullscreenPresentation
  content RESOLUTION; 080 measured direct drawing-canvas embeddable
  RENDERING — separate pipelines, flow-dependent, no proven locator
  defect; duplicate non-persistence confirmed by both. **Accepted
  deviation (bound):** 080's mixed-gate also routes persistence/
  reload inconsistency to `mixed` — stricter-only, altered no result,
  Sonnet-accepted. **Fork facts (read-only, recorded for 081):**
  embeddables render one `.excalidraw__embeddable-container` per
  scene ELEMENT gated by `embedsValidationStatus` (fork
  `App.tsx:1463-1501`), auto-validated on every `componentDidUpdate`
  (`:3240`) ⇒ a scene-present duplicate child SHOULD render; PATCH-080
  proved no container ever appears (even after zoom-to-fit) while the
  duplicate frame LABEL does ⇒ strong inference: duplicate frame
  reaches the live scene, children do not (or vanish instantly) —
  divergence point still unproven ⇒ deep-clone fix stays BLOCKED.
  **PATCH-081 — Duplicate Slide Live-Scene Clone-Shape Diagnosis,
  diagnosis-only, exactly ONE new file**
  `e2e/characterization/drawing-duplicate-clone-shape.spec.ts`
  (absence verified; PATCH-077 path stays permanently absent): bound
  order baseline → real Duplicate only → immediate live observation
  (new frame-label id; source-card count OR container-count signal) →
  settled persistence (PATCH-076 method, sole persistence basis;
  child ids/links recorded when observable) → post-settlement live
  stability re-read. Add/Rename/Remove/deletion/reload/
  FullscreenPresentation/drag PROHIBITED. TEN bound fields:
  `duplicateRowAppeared`, `duplicateFrameInLiveSceneImmediate`,
  `duplicateChildRenderedImmediate`, `duplicateFrameLiveStable`,
  `duplicateChildRenderedStable`, `sourceChildStillRendered`,
  `duplicatePersistedSettled`, `duplicateChildrenPersistedSettled`,
  `classification` (`mixed-duplicate-clone-state` |
  `sidebar-only-duplicate` | `frame-with-shared-child-identities` |
  `complete-live-clone-unpersisted` |
  `frame-with-cloned-children-unpersisted` | `frame-only-duplicate`,
  derived in bound order, soundness first, outcome NOT hardcoded),
  `prefix` (`patch-064-harness-patch-081-dupshape-`). 25 blob-ID
  fences at base `34d9d54` (080's 24 + its landed spec). Expected:
  new spec 2/1/2 ×3 stable; carried unchanged (add-dup now carried
  2/1/2); full 448/43; cleanup zero across FOURTEEN prefixes. Bound
  commit: `test(e2e): characterize duplicate-slide live clone shape
  (PATCH-081)`. Sonnet PASS required before commit. PATCH-081
  implementation NOT started.
- **2026-07-18** — **PATCH-079 DONE (commit
  `9a11a234835242cfb51360ca95762ee1790eec2f`, blobs `5455597d…` /
  `513d07bf…`, Sonnet PASS across two full review passes, six clean
  reviewer runs zero drift) + fresh census + PATCH-080 AUTHORIZED
  (diagnosis-only)**. **Fix landed:** rename-sidebar staleness
  resolved via one retained `frameNameSigRef` — ordered active-frame
  `[id, name]` signature accumulated in the EXISTING `handleChange`
  pass; refresh gate now count-OR-signature; `setElements` still
  conditional; import path seeds the ref; save/debounce/ordering
  untouched; NO geometry in the signature. Regression spec now
  ASSERTS `sidebar-updates-correctly` (all eight fields true-path,
  derivation unchanged). **Explicit exclusions:** frame-geometry
  staleness (census #3) remains open; Duplicate/Add behavior
  untouched; PATCH-077 draft path permanently prohibited.
  **PATCH-077 remains SUPERSEDED** — residual question transferred:
  Rename is OUT (persists + fixed); Add slide below uncharacterized;
  Duplicate renders live but never persists and its removal deletes
  the source backing row; mechanism unidentified. **New census
  insight (read-only):** ALL slide-menu handlers build `updateScene`
  payloads from React `elements` STATE (`DrawingLayout.tsx:1396-1471`);
  Add/AddBelow share Duplicate's APPEND shape while Rename's
  map-replace persists → PATCH-080 discriminates action- vs
  shape-specific suppression; also flagged (census #3 family, do not
  fix): Add/Duplicate after a frame drag could replace the scene from
  a stale-geometry base. **PATCH-080 — Add/Duplicate Slide
  Persistence Boundary Diagnosis, diagnosis-only, exactly ONE new
  file** `e2e/characterization/drawing-slide-add-dup-persistence.spec.ts`
  (absence verified; PATCH-077 path stays absent): bound order Add
  slide below → settled persistence (PATCH-076 method) → Duplicate
  slide → settled persistence → single end reload. Rename/Remove and
  deleting the duplicate PROHIBITED; no dragging. NINE bound fields:
  `addSlideVisible`, `addSlidePersisted`, `addSlideSurvivedReload`,
  `duplicateSlideVisible`, `duplicateRendersSourceChild`,
  `duplicateSlidePersisted`, `duplicateSurvivedReload`,
  `classification` (`mixed-slide-persistence-state` |
  `add-persists-duplicate-does-not` |
  `neither-add-nor-duplicate-persists` |
  `both-add-and-duplicate-persist` |
  `add-does-not-persist-duplicate-persists`, derived in bound order,
  soundness gate first), `prefix`
  (`patch-064-harness-patch-080-adddup-`). 24 blob-ID fences at base
  `9a11a23` (PATCH-079's 22 + its two landed files). Expected: new
  spec 2/1/2 ×3 stable; carried totals unchanged (rename regression
  now carried 2/1/2); full 448/43; cleanup zero across THIRTEEN
  prefixes. Bound commit: `test(e2e): characterize add/duplicate
  slide persistence boundary (PATCH-080)`. Sonnet PASS required
  before commit. PATCH-080 implementation NOT started.
- **2026-07-18** — **PATCH-078 DONE (commit
  `e239880295d333478314d414f21de051c065e3aa`, blob `d70b8e51…`, Sonnet
  PASS, six coherent runs zero drift) + PATCH-077 SUPERSEDED (§0.B) +
  fresh census + PATCH-079 AUTHORIZED (production fix)**. **Final
  diagnosis (§1 hypothesis CONFIRMED):**
  `classification: count-gated-stale-sidebar-persisted` — real Rename
  accepts the title, the live frame label updates immediately, the
  sidebar row stays stale through the 15 s window AND a row-switch
  probe, the SETTLED persisted scene carries the new title (immediate
  read still old — normal debounce), and a real reload hydrates the
  sidebar correctly. Owner: sidebar `frames` derive from React
  `elements` state whose refresh is count-gated
  (`DrawingLayout.tsx:1084-1090`); a pure rename changes no count.
  Defect is state synchronization, NOT persistence. Downstream
  per-frame signature machinery (`:1935-1956`) already exists but
  never runs because the gate blocks the render. **PATCH-077 ruling
  (OPTION C): SUPERSEDED** — Rename branch answered (it persists ⇒
  "whole updateScene family never persists" is FALSE); the remaining
  Add-slide-below + Duplicate boundary question TRANSFERRED to a
  future narrower diagnosis (PATCH-080 candidate, after 079); its
  draft path stays permanently prohibited. **Census:** 1)
  rename-sidebar fix (SELECTED), 2) Add/Duplicate persistence
  diagnosis, 3) duplicate deep-clone fix (blocked on 2), 4) NEW
  census-only sibling: frame-GEOMETRY sidebar staleness (drag →
  stale thumbnails/order in-session, uncharacterized — do not fix
  opportunistically), 5-9) line-follow / image-storage / overlap /
  AI-images / connections-panel deferred. **PATCH-079 — FIX
  AUTHORIZED, exactly TWO existing files, NO new files:**
  `DrawingLayout.tsx` (starting blob `b470a888…`) — extend the
  count-gate with a frame NAME signature (id+name of active frames,
  accumulated in the EXISTING element pass; geometry excluded to
  preserve the anti-drag-churn rationale; rejected: unconditional
  setElements, deep equality, PresentationPanel second source of
  truth, fork changes) — and `drawing-slide-rename-state.spec.ts`
  (starting blob `d70b8e51…`) converted to an ASSERTING regression
  spec (`sidebarTitleUpdatedWithinWindow === true`,
  `classification === 'sidebar-updates-correctly'`, persistence +
  reload asserted; derivation logic unmodified). 22 blob-ID fences at
  base `e239880` (= PATCH-078's 23 minus DrawingLayout). Expected:
  amended spec 2/1/2 ×3 stable; carried totals unchanged; full
  448/43; cleanup zero across the same TWELVE prefixes. Bound commit:
  `fix(drawing): refresh slide sidebar on frame rename (PATCH-079)`.
  Sonnet PASS required before commit. PATCH-079 implementation NOT
  started.
- **2026-07-18** — **PATCH-077 BLOCKED (stop record §0.A, no
  implementation ever created) + PATCH-078 AUTHORIZED (diagnosis-only,
  Rename-Slide State-Ownership)**. **Stop:** during PATCH-077's FIRST
  required action, the real Rename flow (menu → `'Rename slide'` →
  real inline input → deterministic title → real Enter, rename mode
  exited) left contradictory title state: the sidebar row kept
  `PATCH-064 Portrait` across the 60 s window while the replacement
  title was visible elsewhere on the page. Implementer honored the
  stop, deleted the draft, cleaned artifacts; preflight had passed
  (23/23 blob-ID fences at base `eff21fc` AND governance HEAD, both
  absence gates). **CTO classification (code-derived, TASK options
  B+E composite — NOT assumed to be delayed persistence):**
  `handleRenameSlide` (`DrawingLayout.tsx:1448-1454`) writes `name`
  into the LIVE scene via `updateScene` (the fork-rendered canvas
  frame label is the "elsewhere"); the sidebar renders `frames`
  derived from React `elements` STATE (`:1935-1946`) whose refresh is
  **count-gated** (`:1084-1090` — `setElements` only on active-count
  change; only other site is scene-import `:1300`); a pure rename
  changes no count → the sidebar model can never refresh in-session.
  `dirtyDataRef` is still set unconditionally (`:1155-1170`), so the
  renamed title MAY reach persistence despite the stale sidebar —
  bound as an observation, not assumed. **Governance ruling OPTION B:**
  PATCH-077 preserved unchanged as a blocked historical record; its
  persistence-boundary question (Rename/Add vs Duplicate, or whole
  menu-updateScene family) explicitly PRESERVED, resuming only after
  PATCH-078 lands. **PATCH-078 — diagnosis-only, exactly ONE new
  file** `e2e/characterization/drawing-slide-rename-state.spec.ts`
  (absence verified; PATCH-077's `drawing-slide-persistence.spec.ts`
  must REMAIN absent): real Rename only (Duplicate/Add/Remove
  prohibited), bound order act → immediate UI state → row-switch
  probe → settled persistence (PATCH-076 method) → real reload. EIGHT
  bound literal fields: `inputAcceptedRename`,
  `sidebarTitleUpdatedWithinWindow`, `newTitleVisibleElsewhere`,
  `sidebarUpdatedAfterRowSwitch`, `persistedTitleUpdated`,
  `sidebarUpdatedAfterReload`, `classification`
  (`rename-input-flow-broken` | `sidebar-updates-correctly` |
  `rename-not-applied-to-scene` |
  `count-gated-stale-sidebar-persisted` |
  `count-gated-stale-sidebar-unpersisted` | `mixed-rename-state`,
  derived in bound order), `prefix`
  (`patch-064-harness-patch-078-rename-`). 23 blob-ID fences carried
  (verify via `git rev-parse <base>:<path>`, never raw-byte SHA-1).
  Expected: new spec 2/1/2; carried totals unchanged; full 448/43;
  cleanup zero across TWELVE prefixes (ten tracked + legacy
  `patch-064-harness-patch-077-persist-` draft residue + new
  `patch-064-harness-patch-078-rename-`). Bound commit: `test(e2e):
  characterize rename-slide state ownership (PATCH-078)`. Sonnet PASS
  required before commit. NO rename fix and NO persistence fix
  authorized until the true state owner is identified. PATCH-078
  implementation NOT started.
- **2026-07-18** — **PATCH-076 DONE (commit
  `eff21fc6eab97a45d05dd2a888e56c32d14e900b`, blob `fc20ef81…`, Sonnet
  PASS after two correction cycles) + product ruling + fresh census +
  PATCH-077 AUTHORIZED (diagnosis-only)**. **Final diagnosis:**
  classification `unpersisted-duplicate-with-deletion-cascade` — real
  Duplicate slide renders the source's seeded child live but creates
  no padlet row AND never reaches the persisted master scene (settled
  ≥6 s observation, all duplicate identities null,
  `duplicatePersistedToDatabase: false`); real Remove slide on the
  live-only duplicate deletes the ORIGINAL backing row (exact-ID poll,
  2 s stable absence, rows 8→7) leaving the surviving original
  logically linked in scene JSON but resolving/rendering nothing.
  Three sequential reviewer runs fully coherent. All gates green
  (076 2/1/2; carried browser suites unchanged; full 448/43;
  verify+build; cleanup zero across ten prefixes). **Product ruling
  (PATCH-076 §0.B.2, binding): OPTION A — independent deep clone.**
  Duplicate persists as a new frame with fresh child IDs; referenced
  container rows are CLONED (existing `clonedPostMetadata` idiom);
  deleting the duplicate touches only its cloned rows; original stays
  intact; duplicate survives reload. Rationale: canvas Ctrl+D already
  defines duplicate-as-deep-clone (P6), reference-counting (OPTION B)
  would be new unowned architecture, and P3 forbids
  edit-one-edits-both surprise mutation. **Fix gating (§0.B.3):** the
  deep-clone fix is NOT yet authorized — PATCH-076 proved THAT the
  duplicate never persists, not WHY (handleChange provably executes:
  the cascade fired from it; the fork invokes onChange for
  programmatic updateScene at `App.tsx:3382` — suppression mechanism
  undetermined from static reading). **Fresh census at `eff21fc`:**
  #1 duplicate-slide fix — semantics ruled, persistence mechanism
  unknown → **diagnosis-first, SELECTED**; the never-persists finding
  is the "new defect surfaced during 076" (folded in). #2 line-follow
  — still no attachment contract, no complaint. #3 AI images — still
  fixture-blocked. #4 overlap fallback — low. #5 uploaded-image
  storage cleanup — test-infra only. #6 Connections side panel —
  feature, deferred (stabilization demonstrably incomplete). **PATCH-
  077 — Slide-Action Persistence Boundary Diagnosis, diagnosis-only,
  exactly ONE new file** `e2e/characterization/drawing-slide-persistence.spec.ts`
  (absence verified): drive real `'Rename slide'` (inline input +
  Enter), `'Add slide below'`, and a `'Duplicate slide'` re-proof in
  that bound order, each observed via the PATCH-076 settled method
  (≤1 s poll, ≥6 s window, settled read is sole basis); Remove slide
  PROHIBITED. Five bound literal fields: `renameSlidePersisted`,
  `addSlideBelowPersisted`, `duplicateSlidePersisted`,
  `classification` (`duplicate-specific-persistence-suppression` |
  `menu-scene-actions-never-persist` |
  `menu-actions-persist-duplicate-included` |
  `mixed-persistence-boundary`), `prefix`
  (`patch-064-harness-patch-077-persist-`). The outcome partitions
  fix ownership: duplicate-specific → `handleDuplicateSlide`; family-
  wide → the handleChange→debounce→performSave boundary. **23 fences**
  are full Git blob IDs bound to the behavioral/source snapshot
  `eff21fc` (the 22 carried + landed
  `drawing-slide-duplication.spec.ts` `fc20ef81…`) and must be
  verified via `git rev-parse <base>:<path>` plus equality at the
  governance implementation start HEAD `b1cf263`; governance-only
  movement from `eff21fc` to `b1cf263` does not invalidate PATCH-077
  when all 23 blobs match. Expected: new spec 2/1/2; all carried
  totals unchanged; full 448/43; cleanup zero across ELEVEN prefixes.
  Bound commit: `test(e2e): characterize slide-action persistence
  boundary (PATCH-077)`. Sonnet PASS required before commit. PATCH-077
  implementation NOT started.
- **2026-07-18** — **PATCH-076 AMENDED (Amendment 1 §0.A) after Sonnet
  review: PASS WITH REQUIRED CHANGES on the first candidate**
  (`drawing-slide-duplication.spec.ts`, pre-correction hash
  `cf58547c…`). Reviewer confirmed everything structural (one-file
  scope, 22/22 fences, real Duplicate/Remove menu actions, 2/1/2
  totals, carried gates, deterministic gates, cleanup zero across ten
  prefixes) and surfaced a decisive persistence finding, verified
  twice incl. a 3.5 s wait past the ~2 s save debounce: **the
  duplicated slide is NEVER persisted to the master scene** —
  duplicate slide/child/link identities stayed `null` in every
  persisted read; the live client renders it, but a reload silently
  loses it; `sharedLinkEmbeddableCount: 1` counted only the source's
  own embeddable. **Bound corrections:** (1) new eighth literal field
  `duplicatePersistedToDatabase` (settled-read conjunction of the
  three duplicate identities being non-null; expected `false`); (2)
  exact-ID `expect.poll` (15 s) replaces the one-shot post-Remove
  backing-row read, deriving `removeDuplicateDeletedSharedRow` (a
  surviving row records `false` faithfully → guarded classification,
  no retry). **Classification ruling OPTION B — enum amended** with
  the deliberate literal `unpersisted-duplicate-with-deletion-cascade`
  (chosen for the persisted-state truth: not two persisted references,
  but a live-only duplicate whose removal still cascades onto the
  shared backing row); full four-value decision table bound in
  §0.A.3; "shared reference" everywhere in the patch now explicitly
  means live-rendering/deletion-level, not two persisted embeddables.
  **Persistence-settlement contract:** poll the persisted master scene
  at ≤1 s intervals across a ≥6 s window; settled (final) read is the
  sole derivation basis; immediate read is evidence-only; report must
  distinguish immediate/settled/ever-appeared; sleep-only is
  prohibited; per-test timeout stays 240 s. **Newly surfaced product
  question recorded (unresolved, no fix authorized):** should
  duplicated slides be persisted as independent scene/frame objects,
  and at what point? Joins the §3 clone-vs-reference question for the
  owner after landing. Scope/base/fences/totals/commit message all
  unchanged (§0.A.8); post-correction hash deliberately NOT pre-bound;
  corrected candidate requires a fresh Sonnet PASS before the bound
  commit. Candidate spec NOT modified by governance; no product fix;
  PATCH-077 NOT started.
- **2026-07-17** — **PATCH-075 DONE (commit
  `9cde5cdb4583cddb31364315138fa3daa872ac5d`, Sonnet PASS, no required
  changes) + fresh census + PATCH-076 AUTHORIZED (diagnosis-only)**.
  **PATCH-075 closure:** two files landed exactly as bound —
  `PresentationPanel.tsx` `02699748…` (existing per-slide-menu
  `useEffect` extended with a keydown-Escape handler beside the
  existing mousedown listener, same cleanup; no second effect, no
  focus change, header menu untouched) +
  `presentation-menu-pointer.spec.ts` `50d68dff…` (real Escape-close
  proof per row per viewport; `escapeSupported` flipped from hardcoded
  `false` to a DERIVED boolean, observed `true` at both viewports for
  both rows; no action fired, menu reopens, associations intact). All
  bound totals green (menu-pointer 2/1/2; 074 2/1/2; presentation 2+2;
  duplication 2/1+2 skip; line 4+4 skip; helper 7/1; sanitizer 9/1;
  focused 59/2; full 448/43; verify+build; 18/18 fences; cleanup zero
  across nine prefixes). **Fresh census at `9cde5cd`** (supersedes all
  prior): #1 Duplicate `padlet://` links — **SELECTED, diagnosis-only
  (OPTION B)**: `handleDuplicateSlide` (`DrawingLayout.tsx:1408-1435`)
  spreads children preserving `link` verbatim, so duplicated slides
  share one underlying padlet row; deletion path (`:1078-1107`) fires
  `onDeletePadlet` on ANY deleted linked embeddable and the orphan
  sweep (`:1615-1636`) then removes the original's embeddable —
  code-derived "duplicate, remove the duplicate, lose the original's
  container" P3-class cascade; position-sync contention on one row
  (`padletsByLink`). Semantics (deep-clone vs shared reference)
  remain undefined in all docs → fix BLOCKED on the bound §3 product
  question; characterize first. #2 Line-follow — `lineBridge.ts` has
  ZERO attachment semantics (verified); diagnosis-first, no complaint.
  #3 Comparator — non-finite proven unreachable (`Number.isFinite`
  guard live at `slideOrder.ts:7-8`); refactor-only, not eligible.
  #4 AI images — approved skip verbatim unchanged (`:1357`), no
  fixture capability appeared; still blocked. #5 Overlap fallback —
  intentional, unexercised-when-`frameId`-present, low urgency. #6
  Uploaded-image storage cleanup — test-infra only, skip unchanged
  (`:1352`). #7 Connections side panel — feature, deferred; NO roadmap
  decision taken (stabilization demonstrably incomplete — live defects
  still surfacing). #8 No new defect from PATCH-075 verification. #9
  Membership-union — deferred by CLAUDE.md rule #9. PATCH-074's
  stale-`harnessChanged` follow-up stays pending (076 does not touch
  the cleanup spec). **PATCH-076 — Duplicate-Slide Shared `padlet://`
  Reference Diagnosis, diagnosis-only, exactly ONE new file:**
  `e2e/characterization/drawing-slide-duplication.spec.ts` (absence at
  base verified), driving real `'Duplicate slide'`/`'Remove slide'`
  menu actions; annotation with seven bound literal fields
  (`newPadletRowsAfterDuplicate`, `sharedLinkEmbeddableCount`,
  `duplicateRendersSameChild`, `removeDuplicateDeletedSharedRow`,
  `originalContainerLostAfterRemove`, `classification`, `prefix` — all
  observation-derived; contradiction of the hypothesis is a valid
  outcome). **22 fences** measured at `9cde5cd` (the 18 carried incl.
  post-075 hashes for `PresentationPanel.tsx`/menu-pointer spec, plus
  `resolveSlidePadlets.ts` + `planSlideComposition.ts`). Expected: new
  spec 2/1/2; all carried totals unchanged; full 448/43; cleanup zero
  across TEN prefixes (new: `patch-064-harness-patch-076-dup-`).
  Bound commit: `test(e2e): characterize duplicate-slide shared padlet
  link behavior (PATCH-076)`. Sonnet PASS required before commit.
  PATCH-076 implementation NOT started.
- **2026-07-17** — **PATCH-074 DONE end-to-end (Stage 1 commit
  `6487dc53df73c01e09c25961576db80036c182ba`, Sonnet PASS, no required
  changes) + fresh census + PATCH-075 AUTHORIZED (fix-ready, narrow)**.
  **Stage 1 closure:** six files landed exactly as bound — harness
  `7a94d722…` (worker-local registry + `registerDrawingCleanup`), four
  carried specs `ddab8338…`/`7507b06a…`/`87f88df1…`/`0206ef3b…` (one
  import + one `registerDrawingCleanup(test)` call each, all `finally`
  blocks byte-preserved), 074 spec `5345c42d…` (child switched to the
  real shared owner, `stage1Status: 'implemented'`). Identical
  scenario matrix re-proven live through the shipped owner: normal-pass
  0/0/0, assertion-failure 0/0/0, test-timeout (finally did NOT run,
  shared afterEach DID) 0/0/0, hard-kill (neither hook ran) 1/7/3 →
  parent sweep 0/0/0. Classification unchanged:
  `aftereach-sufficient-for-timeout-not-interruption`. All bound totals
  green (074 2/1/2; presentation 2+2; duplication 2/1+2 skip; line
  4+4 skip; menu-pointer 2/1+2 skip; helper 7/1; sanitizer 9/1; focused
  59/2; full 448/43; verify+build; 13/13 fences; cleanup zero across
  nine prefixes). **Non-blocking follow-up recorded (PATCH-074 NOT
  reopened):** the committed annotation's `harnessChanged: false` is
  stale since the harness was intentionally modified — classified
  **tiny test-annotation follow-up, fold into the next patch touching
  `drawing-harness-cleanup.spec.ts`**; not load-bearing enough for a
  standalone patch. **Fresh 9-candidate census at `6487dc5`**
  (supersedes all prior censuses): #1 Escape-close for per-slide menus
  — real deterministic defect, `PresentationPanel.tsx`'s ⋮ menu has no
  Escape handler while the codebase's own `LineContextMenu.tsx`
  already implements the exact idiom (keydown-Escape → `onClose()`);
  the existing `presentation-menu-pointer.spec.ts` annotation even
  carries a hardcoded untested `escapeSupported: false` placeholder —
  **SELECTED, fix-ready, no design ruling needed**. #2 Duplicate
  `padlet://` links — real defect (`DrawingLayout.handleDuplicateSlide`
  clones the Excalidraw wrapper but keeps the original embeddable
  `link`, so "duplicated" slides silently share the same underlying
  padlet) but semantics (deep-clone vs intentional shared reference)
  are undefined — diagnosis/design-first, NOT bundled into PATCH-075.
  #3 Comparator parity — NaN/-Infinity divergence proven unreachable;
  refactor-only, deprioritized per instruction (no authorization solely
  for consolidation). #4 Line-follow — no explicit attachment-semantics
  statement exists; diagnosis-first, no live complaint. #5 Membership-
  union — explicitly deferred by `.fable5/CLAUDE.md` non-negotiable
  rule #9 (planned migration phase; no opportunistic fixing). #6
  AI-images-in-presentation — blocked on the existing approved-skip
  (no deterministic fixture). #7 Overlap fallback — already-
  characterized intentional PATCH-064 fallback path, no evidence it is
  currently wrong, low urgency. #8 Uploaded-image storage cleanup —
  test-infrastructure gap only, explicitly not to be bundled with a
  product-defect patch. #9 Connections side panel — feature, kept
  deferred (no roadmap decision to prioritize it). **PATCH-075 —
  Per-Slide Menu Escape-Close Parity, fix-authorized, exactly two
  files:** `PresentationPanel.tsx` (`e811fa95…`, extend the existing
  per-slide-menu `useEffect` with a mirrored `keydown`-Escape listener
  — no new effect, no focus-management addition, header menu untouched)
  + `presentation-menu-pointer.spec.ts` (`0206ef3b…`, add a real
  Escape-close proof per row per viewport and flip the hardcoded
  `escapeSupported` literal to a derived boolean). **18 fences**
  measured at `6487dc5` (13 carried + `LineContextMenu.tsx` reference-
  only + the four now-stable drawing/harness files). Bound totals
  unchanged elsewhere; menu-pointer spec stays 2/1/2. Bound commit:
  `fix(presentation): close per-slide menu on Escape (PATCH-075)`.
  Sonnet PASS required before commit. PATCH-075 implementation NOT
  started.
- **2026-07-17** — **PATCH-074 diagnosis DONE (commit
  `54aa88dbb9753396e8aa192d68647ab05ddbaff2`, blob `5e32d6cd…`, Sonnet
  PASS after one annotation-contract correction) + Stage 1 AUTHORIZED
  (Amendment 1 §0.A, OPTION A, LEVEL 1)**. **Diagnosis:** classification
  `aftereach-sufficient-for-timeout-not-interruption`, observation-
  derived from four real subprocess scenarios — normal-pass (exit 0,
  finally+afterEach ran, 0/0/0), assertion-failure (exit 0 via
  `test.fail` + genuine thrown assertion, finally+afterEach ran, 0/0/0),
  test-timeout (exit 1, **finally did NOT run, afterEach DID**, 0/0/0),
  hard-kill (owned cmd/orchestrator/worker subtree taskkilled — neither
  hook ran, residue exactly 1 board/7 padlets/3 lines, parent exact-
  fixture sweep → 0/0/0). All eleven O5 annotation fields incl. four
  real scenario prefixes; no credentials emitted. NOT tested:
  worker-only crash with surviving runner, whole-runner termination,
  machine/CI interruption, dev-server crash. **Infrastructure census:**
  CI runs Playwright directly with NO E2E credentials → drawing suites
  SKIP in CI (local box is the only real environment); no custom
  fixtures; no global teardown reserved; harness is the shared import
  point; worker-local module state needs no manifest. **Candidates:**
  shared registered afterEach ACCEPTED (proven mechanism, fixes the
  real recurring timeout-leak class from PATCH-072/census follow-up
  #2); global teardown rejected (untested case, config+manifest cost);
  external parent rejected (none exists; CI never runs these suites);
  layered rejected (complexity > defect); no-fix rejected. **Target
  LEVEL 1** — timeout-safe, explicitly NOT interruption-safe; killed
  runs keep the manual prefix-scoped sweep rule. **Stage 1 scope:
  exactly six files** (harness `85a6566d…` registry +
  `registerDrawingCleanup`; four carried specs one-line registration
  each `8c7aa641…`/`3e690d20…`/`28023cf0…`/`c78d2c8e…`; 074 spec
  `5e32d6cd…` child switches to the shared owner as the deterministic
  verification + bound annotation flip to `stage1Status:
  'implemented'`). Finally blocks stay byte-preserved as local defense;
  exact-ID cleanup only; no config/production change; **13 fences**
  measured at `54aa88d`. All totals bound unchanged (074 2/1/2 with
  identical matrix; full 448/43). Bound Stage 1 commit:
  `test(e2e): add shared timeout-safe drawing cleanup owner (PATCH-074
  Stage 1)`. Sonnet PASS required before commit. Stage 1 implementation
  NOT started; PATCH-075 NOT started.
- **2026-07-17** - **PATCH-073 Stage 1 DONE (implementation commit
  `b68cdad4485ad7c4767a735c4bf30762ee4739e4`, Sonnet PASS, no required
  changes)** + fresh post-073 census completed at HEAD + **PATCH-074
  AUTHORIZED as diagnosis-only**. **PATCH-073 closure:** exact committed
  scope = `PresentationPanel.tsx` (`e811fa95...`),
  `presentation-menu-pointer.spec.ts` (`c78d2c8e...`),
  `drawing-presentation.spec.ts` (`8c7aa641...`). Final defect:
  per-slide menu top actions were pointer-unreachable because the menu
  was owned by a clipped card while positioned outside the card's
  visible region; keyboard remained intact. Final fix: row wrapper owns
  the real menu trigger + menu; menu sits outside the clipped card; card
  keeps `overflow-hidden`; no portal/fixed positioning/viewport
  observer/SlideThumbnail change; placement rule = below for
  single-slide + non-last multi-slide rows, above for the last row of a
  multi-slide list. Carried locator corrected narrowly to row scope via
  `/parent::div`; assertion block remained byte-preserved. Final
  characterization state = `per-slide-menu-pointer-reachable` at
  1280x720 and 1440x900; 2 rows, 7 items/row, 14 observations/viewport,
  all `visibleFraction=1`, all `elementFromPoint` hits item/descendant,
  Start + Share pointer activation succeed on both rows, lower actions
  pointer-reachable, keyboard preserved, menu close semantics correct,
  landscape = Slide 1/2 child A, portrait = Slide 2/2 child B, bottom
  global Start unaffected, PATCH-072 ordering unaffected, thumbnail
  clipping preserved, `cardOverflowChanged:false`,
  `SlideThumbnailChanged:false`, `portalUsed:false`,
  `fullscreenOrderingChanged:false`. Stage-1 annotation safety fixed:
  pointerError data URLs redacted before truncation, no raw
  `data:image/` or `;base64,`, credential-like fields redacted, 1500
  char cap retained, repeated retry noise collapsed. **Fresh baseline
  re-verification at `b68cdad` (all rerun live this session):** Stage-1
  spec 2/1/2, presentation 2+2, duplication 2/1/2-skipped, line
  4/4-skipped, helper 7/1, sanitizer 9/1, focused 59/2, full 448/43,
  diff-check/tsc/boundaries/verify/build green, cleanup zeros for all
  PATCH-064 harness prefixes plus PATCH-071/072/073, zero production
  imports, repo clean/synced, port 3000 free, artifacts absent.
  **Follow-up notes recorded WITHOUT reopening PATCH-073:** (1)
  row-position menu placement verified only at two viewports -> accepted
  product behavior for now, future responsive-hardening candidate rather
  than a reopened defect; (2) per-slide menu Escape close is not part of
  PATCH-073, currently lacks an explicit product/accessibility ruling,
  and stays a separate narrow candidate; (3) retry-error sanitizer is
  now functioning and needs no standalone patch - at most future test
  utility consolidation if broader reuse appears; (4) timeout-safe
  harness cleanup remains the top infra follow-up. **Fresh ranked
  census at `b68cdad`:** (1) timeout-safe drawing harness cleanup -
  defect / deterministic / shared harness-spec owner / small test-only
  file set / diagnosis-first / **Priority 1**; (2) Escape close for
  per-slide menus - hardening / reproducible but product expectation and
  analogous-menu parity still need a ruling / **Priority 2**; (3)
  duplicate `padlet://` links - defect candidate but clone-vs-shared
  semantics still unresolved / **Priority 3**; (4) comparator
  parity/consolidation - hardening+refactor only, no current reachable
  user mismatch (`PresentationPanel` inline comparator at `:71-79`,
  helper at `slideOrder.ts`, frames still bind `order:null`) /
  **Priority 4**; (5) line-follow behavior - user-visible but still
  blocked on attachment-contract/product ruling / **Priority 5**; (6)
  membership-union consolidation - refactor/architecture work, no fresh
  user-visible defect / **Priority 6**; (7) AI images in presentation -
  user-visible possibility but deterministic fixture still absent and
  failing layer unresolved (`PresentationContainerCard` ignores AI child
  fields; `PresentationPadletCard` image source ignores AI asset
  fields) / **Priority 7**; (8) overlap fallback - still load-bearing
  (`resolveSlidePadlets.ts:29-35`), untouched without a new membership
  design / **Priority 8**; (9) uploaded-image storage cleanup -
  documentation only / **Priority 9**; (10) Connections side panel -
  feature/roadmap only / **Priority 10**. **PATCH-074 selected
  narrowly:** diagnosis-only, title **"Timeout-Safe Drawing Harness
  Cleanup Ownership Characterization"**, base `b68cdad`, exact allowed
  file = NEW `e2e/characterization/drawing-harness-cleanup.spec.ts`
  only (absence verified), no production source, no harness/config
  edits. The spec shells out to child Playwright runs against the owned
  dev server to freeze four cases - normal pass, assertion failure,
  real test timeout, hard-killed child process - and records which
  paths do or do not leave prefix-scoped residue. Bound fences = **6
  unique paths**: `drawingBridgeHarness.ts` `85a6566d...`,
  `drawing-presentation.spec.ts` `8c7aa641...`,
  `drawing-line-bridge.spec.ts` `3e690d20...`,
  `drawing-duplication.spec.ts` `28023cf0...`,
  `presentation-menu-pointer.spec.ts` `c78d2c8e...`,
  `playwright.config.ts` `5864c984...`. Bound new-spec totals: 2 passed
  with deps / 1 no-deps / 2 cred-off skipped. Cleanup contract:
  disposable prefixes only, no broad query, manual prefix-scoped sweep
  required after the hard-kill case. Stop if a second tracked file, any
  production edit, any fence drift, any broad cleanup query, or any need
  to weaken carried suites appears. Bound PATCH-074 implementation
  commit: `test(e2e): characterize timeout-safe drawing harness cleanup
  ownership (PATCH-074)`. Governance commit only; PATCH-074
  implementation NOT started.

- **2026-07-17** — **PATCH-073 Stage 1 CONSTRAINED + expanded to
  THREE files (Amendment 2, classification C, OPTION B)** after the
  uncommitted Stage 1 implementation went green on its target spec
  (2/1/2, both viewports, fresh annotation) but broke the carried
  `drawing-presentation.spec.ts`: `:1257` `toHaveCount(1)` → 0
  (5 000 ms, 13 resolutions) because the PATCH-072 named-launch helper
  scopes trigger + menu through the title's nearest `.rounded-xl`
  ancestor (the card) — snapshot proved `:1255` silently clicked the
  PREVIEW button (`[active]`, menu never opened) since the implementer
  co-located the ⋮ trigger with the menu at row level. **Audit
  findings:** (1) unauthorized card-line change (`overflow-hidden`
  removed, `relative` added — violates §0.1.4/§0.1.5, reintroduces the
  rejected Candidate-D footer-corner risk) → revert bound; (2)
  unauthorized footer `justify-between` drop → revert bound; (3)
  trigger co-location ACCEPTED and codified — Amendment 1's "menu-only
  move + byte-equivalent slideMenuRef/outside-close" was internally
  inconsistent (CTO authoring error; the ref boundary spans
  trigger+menu); (4) annotation evidence-integrity defect:
  `cardOverflowChanged: false` while the diff changed the card
  overflow line — becomes accurate after revert (1), fresh JSON run
  required; (5) second Amendment-1 authoring error: single-slide
  boards land in the ABOVE-branch under `idx === length-1`,
  contradicting the bound below-branch sentence → expression corrected
  to `sortedSlides.length > 1 && idx === sortedSlides.length - 1`.
  **Carried-locator ruling:** incidental internal coupling — it breaks
  under ANY valid §0.1.3 realization (menu cannot stay inside the
  overflow-hidden card); the real contract (title, real ⋮, exact
  "Start presentation", keyboard, row association) survives at row
  scope. Two-file alternatives all rejected (menu-only move breaks ref
  semantics AND still fails the lookup; fake `rounded-xl` on the row
  prohibited; declipped card = rejected Candidate D). **Scope now
  exactly three files:** `PresentationPanel.tsx` (`2475dbed…`, three
  bound corrections only), `presentation-menu-pointer.spec.ts`
  (`c78d2c8e…`, NO further edits), `drawing-presentation.spec.ts`
  (`e6e84823…`, §0.2.7 locator-only: xpath gains `/parent::div`,
  `slideCard`→`slideRow` rename allowed, assertion block
  byte-preserved). **Fences 52/52 verified** (53 minus the carried
  spec; `fences073S2_check.txt`). Totals unchanged (carried
  presentation must return to 2+2). Owned dev-server PID 11028
  stopped, port 3000 free; `patch-073-menu-pointer.json` +
  `test-results/` removed after full annotation extraction; no source
  files touched in cleanup. Bound Stage 1 commit message UNCHANGED;
  Sonnet three-file review + PASS required before commit. No
  implementation commit exists; Stage 1 NOT complete; PATCH-074 NOT
  started.
- **2026-07-17** — **PATCH-073 Stage 0 DONE (commit
  `e4b1ae77d480f580c4dd905d3000700ed272ca86`, Sonnet PASS, one
  non-blocking follow-up) + Stage 1 ACTIVATED (Amendment 1, Option A —
  fix authorized)**. **Stage 0 closure:** one committed file,
  `presentation-menu-pointer.spec.ts` (`0a216384…`); classification
  **`pointer-intercepted-top-items`** at 1280×720 — both rows, 7 items
  each, 14 observations; Start/Share visible fraction **0** on BOTH
  rows (Preview ≈0.54, lower items 1); elementFromPoint → panel header
  toolbar (Landscape) / adjacent-row SlideThumbnail img + title
  (Portrait); genuine bounded pointer clicks intercepted on both top
  items; keyboard focus+Enter opened the correct slide both rows
  (1/2 + child A; 2/2 + child B). Test safety held: no
  force/dispatch/coordinates/callbacks, no production/harness edits,
  data-URLs redacted BEFORE the 1500-char cap, no `data:image/` or
  `;base64,` in the annotation. Final Stage 0 gates: new spec 2/1/2,
  presentation 2+2, duplication 2/1, line 4, cred-off 2/4/4, helper
  7/1, sanitizer 9/1, focused 59/2, full 448/43, tsc/boundaries/
  verify/build green, cleanup complete (no timeout leak in the final
  packet), 54/54 fences, repo clean/synced. **Follow-ups (Stage 0 not
  reopened):** retry-noise regex never matched live output
  (quality-only — fixed inside Stage 1's authorized spec edit);
  viewport caveat (Stage 0 = 1280×720 only → Stage 1 fixes the
  STRUCTURE and verifies a second viewport). **Real-user impact
  ruling:** deterministic pointer defect — mouse users cannot reach
  Start/Share presentation in the per-slide ⋮ menu on ANY row;
  keyboard users can. **Ownership ruling:** `PresentationPanel.tsx`
  inline menu — TWO clipping ancestors: card `overflow-hidden`
  (:341-348) clips both directions, and the slide list's
  `overflow-auto` (:314) makes upward (negative) overflow permanently
  unreachable for the first row; SlideThumbnail incidental.
  **Stage 1 decision: OPTION A**, accepted design **Candidate B+A —
  row-level menu + deterministic direction rule**: menu JSX moves out
  of the card into the row wrapper (row gains `relative`), right-0
  w-52 z-50 retained; `top-full mt-1` (below) for every row EXCEPT the
  last, `bottom-full mb-1` (above) for the last row — the menu always
  extends into existing scrollable list content, no clipping ancestor
  remains, scrolls with the list, single-slide boards fall into the
  scrollable below-branch. Rejected: direction-flip inside the card
  (clipped both ways), out-of-card bottom-full only and
  overflow-hidden removal (first row still dies on the list's
  negative-overflow), portal (not required; fallback via named
  amendment only), SlideThumbnail edits, z-index tuning, keyboard-only
  acceptance, menu redesign. **Scope: exactly two files** —
  `PresentationPanel.tsx` (`926f43ce…`, §0.1.3 change only) + the
  Stage 0 spec (`0a216384…`, flip to `pointer-reachable-all-items`
  with before/after history fields, all-14 elementFromPoint proofs,
  top-item pointer ACTIVATION both rows, keyboard retained, retry-regex
  fix, 1440×900 secondary viewport check). **Fences: 53/53 verified at
  `e4b1ae7`** (54 minus PresentationPanel; SlideThumbnail stays
  fenced/prohibited). Bound totals unchanged (spec 2/1/2, full
  448/43). Bound Stage 1 commit:
  `fix(presentation): make per-slide menu pointer reachable
  (PATCH-073 Stage 1)`. Sonnet PASS required before commit. All
  baselines re-verified live at `e4b1ae7` this session (dev-server
  contract, own PID attributed/stopped, port freed; verify+build
  sequential; cleanup zeros all four prefixes; zero prod bridge
  imports). Stage 1 implementation NOT started; PATCH-074 NOT started.
- **2026-07-17** — PATCH-072 **DONE (implementation commit
  `27e4018f2f83ad33b592ef85773aa240f1a7c9ca`, Sonnet PASS, no required
  changes)** + fresh census + **PATCH-073 AUTHORIZED** ("Per-Slide
  Presentation Menu Pointer Reachability", diagnosis-only Stage 0,
  base `27e4018`). **PATCH-072 closure:** exactly the five authorized
  files landed — NEW `lib/infra/presentation/slideOrder.ts`
  (`e72c3de0…`, pure `sortSlidesByPresentationOrder`: finite explicit
  order ascending → non-finite/unordered after → y → x → stable ties;
  readonly input, new array, zero mutation) + NEW `slideOrder.test.ts`
  (`2f1d79c5…`, exactly 7 incl. parity lock),
  `FullscreenPresentation.tsx` (`655244b4…`, one import + one memoized
  `orderedSlides` governing startSlideId lookup, currentSlide, cache
  invalidation, prefetch, keyboard nav, Next/Prev bounds, counter — no
  raw-order fallback, no redesign), `DrawingLayout.tsx` (`b470a888…`,
  +2/−1: explicit fromSlideId preserved, no-ID fallback → first
  canonical frame, deps/caller unchanged), presentation spec
  (`e6e84823…`, canonical-order flip + real-⋮-menu named launches via
  focus+Enter + semantic sceneElements equality replacing raw
  byte-length; annotation
  `fullscreen-slide-order-aligned-with-canonical-panel-order`). Live
  behavior: raw scene [Portrait, Landscape] unchanged; panel
  [Landscape, Portrait]; bottom Start → Landscape 1/2; Next →
  Portrait 2/2; Prev → Landscape 1/2; named Portrait → 2/2; named
  Landscape → 1/2; counter now agrees with panel numbering.
  Unchanged surfaces verified: PresentationPanel `926f43ce…`,
  SlideThumbnail `b26524ae…`, PDF/PPTX/thumbnail/planner/resolver/
  membership/raster/reconciliation. Final gates all green (presentation
  2+2, setup 1, duplication 2/1, line 4, cred-off 2/4/4, helper 7/1,
  sanitizer 9/1, focused 59/2, full 448/43, diff-check/tsc/boundaries/
  verify/build, cleanup zeros, 49/49 fences, zero prod imports, repo
  clean/synced). **Follow-up notes recorded WITHOUT reopening
  PATCH-072:** (1) comparator parity — helper treats NaN/−Infinity as
  unordered, panel's inline `?? +Infinity` does not; production frames
  normalize `order: null`, so no current user-visible defect;
  candidate for later consolidation/parity hardening. (2) per-slide
  menu pointer reachability — 072 trace proved the top ⋮-menu items
  can be pointer-intercepted by an adjacent SlideThumbnail img;
  keyboard works; possible real mouse-user defect → PATCH-073.
  (3) timeout-safe harness cleanup — Playwright test timeout aborts
  in-body `finally`; five leaked fixtures were found+cleaned in §0.4;
  test-infrastructure defect candidate, NOT product behavior.
  **Fresh census at `27e4018` (all baselines re-run live this session
  under the dev-server contract, own PID attributed/stopped, port
  freed):** (1) **per-slide menu pointer interception — SELECTED as
  PATCH-073, diagnosis-first**: real-Chromium hit-test evidence (072
  §0.3.2 trace: SlideThumbnail img intercepted the menu item through
  401+ stable retries) + source geometry (menu `absolute bottom-full
  z-50` at PresentationPanel:402-406 is clipped by the card's
  `overflow-hidden` :341-348; menu ≈290px > card ≈215px → top items
  clipped on EVERY row); keyboard reachable; real-user impact highly
  likely but measured incidentally at one viewport/row/item → Stage 0
  must verify per-item/per-row with `document.elementFromPoint` +
  genuine pointer clicks and freeze the result; exact owner boundary:
  PresentationPanel inline non-portaled menu (SlideThumbnail
  innocent); NOT a broad menu-architecture problem. (2) timeout-safe
  harness cleanup — proven mechanism, test-infra only, prefix-scoped,
  known leak risk; fix-shaped but ownership (afterEach vs global
  teardown vs per-spec) needs one determination; strong PATCH-074
  candidate; NOT bundled with 073 (product+infra bundling prohibited).
  (3) comparator parity/consolidation — unreachable edge hardening +
  P6 consolidation; NOT a defect today (frames bind order:null); no
  patch solely for dedupe; queue with the panel-comparator
  consolidation follow-up. (4) duplicate `padlet://` links — still
  needs the clone-vs-shared-reference product ruling; design-first;
  resolver dedupe NOT assumed correct. (5) membership-union
  consolidation — refactor (P6), no user-visible evidence. (6)
  line-follow (move + natural-height) — feature-sized; attachment
  contract still unresolved. (7) AI images in presentation — still
  blocked on a deterministic fixture; failing layer undetermined. (8)
  overlap fallback — still LOAD-BEARING (070-proven); untouched absent
  new design. (9) uploaded-image storage cleanup — documentation-only.
  (10) Connections side panel — FEATURE (Registry-Editor hierarchy,
  search, filters, select/center); dedicated product spec + roadmap
  approval required; not stabilization. **PATCH-073 shape:** Stage 0
  diagnosis-only, exactly ONE new file
  `e2e/characterization/presentation-menu-pointer.spec.ts` (absence
  verified); harness reused UNMODIFIED (fenced); observables O1-O6
  (per-row per-item bbox/visible-fraction/elementFromPoint/genuine
  pointer trial/keyboard control; annotation
  `patch-073-menu-pointer-reachability`; classification one of
  pointer-intercepted-top-items / pointer-reachable-all-items /
  mixed-per-row — freeze what is OBSERVED); no
  force/dispatch/coordinates/sleeps; Stage 1 (PresentationPanel-owned
  placement fix) contingent via named amendment only. Fences: **54
  unique paths verified 54/54 at `27e4018`** (072's 49 carried + 5
  PATCH-072 files frozen; PresentationPanel + SlideThumbnail already
  members, stay IMMUTABLE). Bound new-spec totals: 2 passed with deps
  / 1 no-deps / 2 cred-off skipped; all carried baselines unchanged
  (448/43 etc.). Bound Stage 0 commit:
  `test(presentation): characterize per-slide menu pointer
  reachability (PATCH-073 Stage 0)`. Sonnet PASS required before
  commit. Implementation NOT started.
- **2026-07-17** — **PATCH-072 §0.4: persisted-scene drift investigated
  live; classification B; Option B bound (semantic invariant replaces
  byte-length)**. Keyboard correction (§0.3) VALIDATED: first clean run
  at spec `a687c999…` passed (exit 0, 2 passed/2 skips) — pointer
  interception closed. The fresh JSON rerun then failed at `:1097`
  (rawContentLength 3435→3534, +99, at 20.8 s) while `:1094-1096`
  PASSED in the same run (same 7 element IDs, same order, same plan
  bands → no insertion/removal/reorder). **CTO live diagnosis** (DB
  watcher scratch polling the master padlet content at 250 ms under a
  self-started dev server; no source edits): two full spec runs BOTH
  passed (35.2 s / 14.8 s) with the fixture scene at exactly ONE
  version = seeded 3435/7-element baseline (pre-run snapshot = seeded
  constant, confirmed twice); passing runs write nothing — the +99 is
  a rare timing-dependent flush. **Writer identified** via residue
  scenes: the PRE-EXISTING DrawingLayout load-stability machinery
  (2026-03-19 doc) — full-flush signature measured: 8th
  reconciliation-inserted embeddable + version 2/3 + 9-10-digit
  versionNonce + renderSignature 285-299 chars (len ≈5450); the
  failing run saw a PARTIAL metadata-only flush (7 elements, ≈+63
  nonce digits + small serialization fields). PATCH-072 paths proven
  write-free (slideOrder pure; fullscreen render-only; DrawingLayout =
  one setState expression). **Side finding:** FIVE leaked
  `patch-064-harness-presentation-%` boards from the earlier 240 s
  TIMEOUT runs (timeout aborts in-body finally cleanup;
  assertion-failed runs clean) — non-causal (reads are
  masterPadletId-scoped); CTO deleted prefix-scoped residue (5 boards
  / 40 padlets / 0 canvas_lines; zero remaining, verified); harness
  timeout-safe cleanup flagged for the next census (harness change NOT
  authorized now). **Ruling (Option B, §0.4.7):** replace `:1097` ONLY
  — OLD raw-length equality → NEW
  `expect(postRunPersistedScene.sceneElements).toEqual(persistedScene.sceneElements)`;
  invariant fields explicit (id/type/x/y/width/height/frameId/colors/
  opacity/isDeleted/text/originalText/name/link, exact order+count via
  coerceSceneElement); excluded app-managed metadata
  (version/versionNonce/updated/customData.renderSignature); strictly
  stronger on semantics (catches any persisted runtime embeddable,
  membership/geometry/link/text drift), drops only byte-count
  equality; `:1094-1096` + annotation rawContentLengthBefore/After
  untouched; NO production change; new hash required after edit.
  Artifacts removed after capture (.codex json, test-results); scratch
  deleted; own dev-server PIDs (npm wrapper + surviving next child)
  attributed and stopped; port 3000 verified free. Next: apply §0.4.7
  → line run (exit 0, 2+2) → JSON annotation pass → remaining gates →
  Sonnet → bound commit. If the NEW semantic assertion ever fails:
  STOP to governance (real persisted-membership signal). No
  implementation commit exists; PATCH-073 NOT started.
- **2026-07-17** — **PATCH-072 §0.3: named-launch test correction
  authorized (Option A — keyboard activation)** after the accepted
  spec (`1866f1a9…`) failed DETERMINISTICALLY twice more (clean rerun
  + `--trace=on` retry: both exit 1, 1 failed/1 passed/2 skipped,
  240 s timeout at `:1258` in `openNamedPresentation`; bottom-start
  flip + Next/Prev/End passed live in the same runs). **Trace-proven
  interceptor (CTO parsed trace.zip):** `<img alt="Slide preview"
  class="absolute inset-0 …">` from a slide-row subtree —
  `SlideThumbnail.tsx:26-31`. Geometry: the per-slide menu (`absolute
  bottom-full z-50`, `PresentationPanel.tsx:402-406`) is clipped by
  the card's `overflow-hidden` (`:341-348`); the TOPMOST item ('Start
  presentation') has its click point above the card edge, where the
  adjacent row's preview img receives `elementFromPoint` — permanent
  geometric interception (401+ retries, always 'visible, enabled,
  stable'; no animation → Option D rejected). Classified E2E
  locator/state-management failure; NOT a product
  ordering/FullscreenPresentation/DrawingLayout/comparator/startSlideId
  defect (no product assertion failed; handler intact and
  keyboard-reachable). **Flagged for the next census (out of scope, no
  production edit authorized):** the same geometry suggests the top
  per-slide menu items may be pointer-unreachable for mouse users
  (upward menu clipped by card `overflow-hidden`). **Bound correction
  (§0.3.4, test-only, exactly one):** in `openNamedPresentation`,
  rescope `menuStart` to `slideCard.getByRole('button', { name:
  'Start presentation', exact: true })`, assert `toHaveCount(1)` +
  visible + enabled, then `focus()` + `toBeFocused()` +
  `keyboard.press('Enter')` — real accessible button activation, same
  React onClick, no force/dispatch/seams; ⋮-open click unchanged
  (pointer-reachable, proven). Everything else frozen (no
  assertion/fixture/annotation/timeout changes, no sleeps, no sixth
  file); new E2E hash must be measured and reported after the edit.
  Failed-run artifacts removed by CTO after evidence capture
  (test-results/: .last-run.json, error-context.md, both trace.zip).
  Verification: fresh dev server, presentation spec `--workers=1
  --reporter=line` expected exit 0 / 2 passed / 2 skips, JSON pass for
  the `patch-072-presentation-order` annotation, then remaining gates
  → Sonnet → bound commit. Four non-E2E hashes re-verified identical
  (`e72c3de0…`, `2f1d79c5…`, `655244b4…`, `b470a888…`). No
  implementation commit exists; PATCH-073 NOT started.
- **2026-07-16** — **PATCH-072 verification-state rebind (§0.2, Option
  A)** after the E2E hash drifted during post-report locator
  tightening. **Drift:** the implementation packet bound the
  presentation spec at `b25158f2…`; the file now hashes
  `1866f1a9f2362cc936a8f683ea4546c36c3b8da9` — packet STALE for that
  file; no acceptance review may use the old hash; no commit
  authorized yet; PATCH-072 NOT done. **Delta:** exact `b25158f2 →
  1866f1a9` byte-delta unrecoverable (blob never staged; no editor
  history); superseded by a FULL CTO review of the current file vs
  HEAD (106+/13−): named-launch driver is one deterministic
  `openNamedPresentation` helper (card by exact title → rounded-xl
  ancestor → last button = ⋮ → exact-name 'Start presentation'
  `.first()` = the menu item, which DOM-precedes the bottom button);
  assertions STRENGTHENED (slide-2 landscape-child false, named-launch
  counters, post-End counter absence); timeouts unchanged (standard
  60_000, no test-timeout inflation, no sleeps/retries); cleanup block
  untouched; 069/070/071 bodies untouched except the §6-authorized
  slideIndex 2→1 re-anchor + probe-reset move + bottom-start flip;
  everything in scope (§6 + §0.1.8 incl. bound annotation).
  **Timeout classified B — E2E locator/state-management failure
  (pre-correction file):** error-context snapshot at 240 s showed
  sidebar canonical [Landscape, Portrait], Portrait ⋮ menu OPEN with
  'Start presentation' rendered, NO fullscreen portal, page settled;
  the run (1 failed/1 passed/2 skipped) had already passed the whole
  bottom-start flip + Next/Prev/End live before dying in the
  named-launch phase → last successful step: Portrait ⋮ menu opened;
  pending op: activating the per-slide menu item (click never landed);
  NOT a product failure — no production edit authorized, the four
  production/new files re-verified byte-identical to the packet
  (`e72c3de0…`, `2f1d79c5…`, `655244b4…`, `b470a888…`; DrawingLayout
  re-checked = exactly the §0.1.5 edit). **E2E verification base
  rebound to `1866f1a9…`.** Artifacts cleaned: `test-results/`
  (.last-run.json + error-context.md) removed; playwright-report/
  absent; auth state left (gitignored, not created by the run).
  Refreshed packet (§0.2.5): verify 5 hashes + 49/49 fences, fresh
  self-started dev server, presentation spec alone `--workers=1
  --reporter=line` (JSON rerun for annotations), no source edits on
  the first clean rerun, expected 2 passed/2 skipped, then remaining
  gates → Sonnet review → bound commit. Implementation remains
  UNCOMMITTED; no implementation commit exists; PATCH-073 NOT started.
- **2026-07-16** — **PATCH-072 Amendment 1** (Option A: one two-owner
  fix; `DrawingLayout.tsx` authorized as the FIFTH file, restricted).
  **Blocked-attempt record:** the first implementation run STOPPED
  correctly under §9 — with the four-file change in place, the LIVE
  Playwright gate failed at the bound fullscreen-open assertion
  (portal showed PORTRAIT, counter Slide 2/2; bound fixed state:
  LANDSCAPE, Slide 1/2). No code retained, no implementation commit,
  worktree reverted clean and level with origin (`a59526e`); one empty
  untracked `lib/infra/presentation/` dir survived the revert and was
  removed during this amendment. **Root cause of the block:** the
  bottom Start button (`PresentationPanel.tsx:509`) sends NO slide id;
  `DrawingLayout.handleStartPresentation` (`:1503-1508`) resolves it to
  raw `activeFrames[0].id` (portrait) → `startSlideId`; fullscreen must
  preserve named-id semantics, so a fullscreen-only sort correctly maps
  that id to ordered index 1 — the default-start producer lives
  upstream in prohibited DrawingLayout. **Ownership re-census (all
  entry paths, fresh at `a59526e`):** ONE coherent defect, TWO owner
  sites — sequence (FullscreenPresentation walks `slides` raw:
  `:78-82,:114,:210-224,:347,:363`) + default start target
  (DrawingLayout `:1506`). Per-slide launch (`PresentationPanel:409`)
  passes an explicit id and needs no third change once the sequence is
  canonical (findIndex lands it at its canonical index). Exactly one
  `handleStartPresentation` caller (`:3041`); `presentationStartId`
  produced only at `:1506`, consumed only at `:3050`; panel and
  fullscreen mounted only by DrawingLayout; no other opener
  (`setPresentationActive(true)` only at `:1507`). Neither half alone
  is coherent (sequence-only = the live failure; target-only = canonical
  first id inside a raw sequence, labeled Slide 2/2) → NOT split
  (072A/072B), NOT diagnosis-only. **Product ruling (bound, §0.1.4):**
  no explicit id → open canonical `orderedSlides[0]`; explicit id →
  open exactly that slide at its canonical index; Prev/Next/keyboard
  follow canonical order; fullscreen counter must mean the same slide
  as the panel numbering. **Amended DrawingLayout edit (§0.1.5,
  smallest owner-consistent):** one import of the SAME pure helper +
  the no-id fallback becomes
  `fromSlideId ?? sortSlidesByPresentationOrder(activeFrames)[0].id`
  inside `handleStartPresentation` only (deps unchanged; ≤2 net lines
  on the over-ceiling file, bound never-grow exception; raw frames have
  no `order` → `?? +Infinity` → same `y → x` semantics as the panel's
  `order: null`). Rejected: panel passes `sortedSlides[0].id` (panel
  IMMUTABLE; leaves the defective fallback live in the producer);
  sorting `frames` at the mount site (global reorder — stop condition);
  inline comparator duplication. **Amended scope (§0.1.6, hashes
  measured fresh at `a59526e`):** five files — two NEW (absence
  verified), `FullscreenPresentation.tsx` `caea1141…` (unchanged
  design), `DrawingLayout.tsx` `93e5900f…` (§0.1.5 only),
  presentation spec `19d6e864…` (§6 flip + named-launch proofs).
  **Fences: 49/49 verified at `a59526e`** (50 minus DrawingLayout;
  PresentationPanel `926f43ce…` stays IMMUTABLE). **Amended e2e
  (§0.1.8, test COUNT unchanged 2+2):** persisted raw order
  [Portrait, Landscape]; sidebar [Landscape, Portrait]; bottom Start →
  LANDSCAPE Slide 1/2; Next → PORTRAIT 2/2; Prev; End; NEW per-slide ⋮
  named launches — Portrait row → Slide 2/2, Landscape row → Slide
  1/2; all 069/070/071 invariants green; annotation gains
  `defaultStartTarget` before/after + both named-launch results.
  Totals unchanged: helper 7/1, full 448/43. Bound commit message
  unchanged: `fix(presentation): align fullscreen slide order with
  panel order (PATCH-072)`. Sonnet PASS required before commit.
  Implementation NOT started (post-amendment); PATCH-073 NOT started.
- **2026-07-16** — PATCH-071 **DONE (Stage 1 commit
  `3b863d55ee6ae6ce9af0c7747c1bda1a82500e71`, Sonnet PASS, no required
  changes)** + fresh census + **PATCH-072 AUTHORIZED** ("Align Fullscreen
  Slide Order with the Canonical Panel Order", fix, single stage, base
  `3b863d5`). **PATCH-071 closure:** Stage 0 (`af04779`, census
  confirmed) + Stage 1 landed exactly the four authorized files —
  NEW `lib/infra/collabboard/clonedPostMetadata.ts` (`7d6b6ee6…`,
  `sanitizeClonedPostMetadata`: nullish passthrough, shallow copy,
  nested references preserved, no mutation, exactly six keys removed
  regardless of truthiness — parentId/childPadletIds/sectionId/
  sectionPosition/position_in_timeline/wallPosition — no seventh key, no
  deep clone/JSON/allowlist, sanitizeLibraryMetadata untouched), NEW
  test file (`5b53e839…`, 9/1), `useCanvasActions.ts` (`b470cc3f…`,
  exactly one import + two call sites: handleDuplicatePadlet,
  handlePastePadlet; Copy unchanged, no hook refactor), e2e spec
  (`28023cf0…`, real hover-pencil trigger paths preserved; Duplicate →
  one clone, Copy alone → none, Paste → one; all six keys absent AS OWN
  PROPERTIES on both clones; ordinary metadata + visible content
  preserved; originals byte-stable; child pointers still on originals;
  clone ids new and distinct; no graph repair; parentId caveat honestly
  retained; classification `clone-membership-metadata-sanitized`).
  Final gates: 9/1, 59/2, 441/42, setup 1, duplication 2/1, line 4,
  presentation 2+2, cred-off 2/4/4, diff-check/tsc/boundaries/verify/
  build green, cleanup zeros (harness + patch-071 scoped), 48/48
  fences, zero prod imports, repo clean/synced. **Fresh census at
  `3b863d5` (all fences held through 071, so prior source analyses
  remain valid; re-verified key sites by direct read):** (1)
  **presentation frame-order divergence — SELECTED as PATCH-072**:
  canonical rule `order ?? ∞ → y → x` lives in
  `PresentationPanel.tsx:71-81` and already governs the panel list, PDF
  export, AND PPTX export (`:156-158`); `FullscreenPresentation.tsx`
  alone walks its `slides` prop unsorted (`:78-82,:114,:215,:363`),
  mounted with raw scene order (`DrawingLayout.tsx:3047-3056`);
  divergence explicitly frozen in the spec (`:918-920`
  slideTitles≠seededFrameTitles; `:938-942` portrait-first fullscreen).
  Deterministic, characterized, exact owner, product ruling now made:
  **canonical = panel order** (three of four surfaces already agree).
  (2) duplicate `padlet://` links — needs a duplication-semantics
  product ruling (clone-the-post vs shared reference), element-level +
  resolver interaction; design-first; NOT bundled with 071's metadata
  work. (3) membership-union consolidation — REFACTOR (P6), not a
  user-visible defect; rides an existing net later. (4) line-follow
  (move + natural-height) — needs the attachment-anchor product
  contract first; move/resize may be one or two causes, undetermined;
  feature-sized. (5) AI images in presentation — still blocked on a
  deterministic fixture; layer (persistence/asset-map/export/runtime)
  undetermined. (6) overlap fallback — still LOAD-BEARING
  (PATCH-070-proven for reconciliation-inserted embeddables); no change
  without membership-semantics design. (7) uploaded-image cleanup —
  documentation-only, no runtime defect. (8) duplicate identity
  (element/line/post ids) — no evidence of id-level duplication defect;
  distinct from membership metadata (071) and from link duplication
  (RC-1). (9) post-071 regressions — none (all baselines green at
  HEAD). (10) Connections side panel — FEATURE (Registry-Editor tree,
  search, select/center line); requires a dedicated product/design
  spec + explicit roadmap approval; not stabilization. **PATCH-072
  shape:** four files — NEW `lib/infra/presentation/slideOrder.ts`
  (pure `sortSlidesByPresentationOrder`, structural generic, stable,
  non-mutating) + NEW `slideOrder.test.ts` (exactly N=7 incl. the
  §5 parity-lock authorizing the temporary comparator duality —
  PresentationPanel stays byte-untouched, consolidation queued),
  `FullscreenPresentation.tsx` (`caea1141…` → memoized sort, all
  internal `slides` reads switch to `orderedSlides`, nothing else),
  presentation spec (`19d6e864…` → fullscreen sequence flips to
  [Landscape, Portrait], landscape observation window re-anchors to
  fullscreen-open/slideIndex 1, ALL 069/070/071 invariants stay green,
  new `patch-072-presentation-order` annotation). Rejected: sorting in
  DrawingLayout (fenced hotspot), panel-comparator swap (bundled
  cleanup), persisted-order mutation, bridge/planner changes, slide
  reorder feature. Fences: **50 unique immutable paths** (071's 48 − 2
  unfenced + 4 PATCH-071 files frozen at committed hashes), 50/50
  verified at base; new files + `lib/infra/presentation/` dir verified
  ABSENT. Expected totals post-fix: helper 7/1, sanitizer 9/1, focused
  59/2, full **448/43**; Playwright counts unchanged (presentation
  stays 2+2, flipped content). All baselines re-verified fresh at
  `3b863d5` this session (dev-server contract, own PID
  attributed/stopped). Bound commit:
  `fix(presentation): align fullscreen slide order with panel order
  (PATCH-072)`. Sonnet PASS required before commit. Implementation NOT
  started.
- **2026-07-16** — PATCH-071 **Stage 0 DONE (commit
  `af04779b9a8864d5bb9b75eb1f14d7888f7861d9`, Sonnet PASS, no required
  changes, census CONFIRMED)** + **Stage 1 ACTIVATED** (Amendment 1,
  rebased at `af04779`). Stage 0 landed the sole authorized file
  (`drawing-duplication.spec.ts`, `e786e917…`): one active
  characterization test proving, through the REAL UI (hover card →
  right-click Edit pencil → labeled `Duplicate`/`Copy`/`Paste`), that
  both clone paths copy ALL SIX membership keys verbatim into the
  persisted clone rows (DB-driven clone identification; Duplicate → one
  clone, Copy alone → none, Paste → one; originals byte-stable; ordinary
  metadata preserved; childPadletIds stays an array, wallPosition an
  object; child rows still point at the originals; classification
  `clone-membership-metadata-copied-verbatim`; command layer confirmed as
  owner; no second defect). ParentId caveat recorded, non-blocking: the
  seeded value is intentionally falsy (`""`) since a truthy parentId
  removes the root-card trigger; the Stage-1 sanitizer strips the key
  regardless of truthiness. Stage-0 gates all green (setup 1, duplication
  2-with-deps/1-no-deps, line 4, presentation 2+2, cred-off 2/4/4,
  focused 59/2, full 432/41, tsc/boundaries/verify/build, cleanup zeros
  incl. PATCH-071-specific, 48/48 fences, zero prod imports). **Stage 1
  ACTIVE, design unchanged:** four files exactly — NEW
  `lib/infra/collabboard/clonedPostMetadata.ts` + NEW
  `clonedPostMetadata.test.ts` (both verified ABSENT at base),
  `useCanvasActions.ts` (`ee33f917…`, exactly two call-site edits +
  import), the Stage-0 spec (`e786e917…`, fixed-state flip). Sanitizer
  contract made exact (Amendment 1 §0.1.3): nullish passthrough
  unchanged; new shallow object; exactly the six precedent keys removed
  regardless of truthiness; nested references preserved (no deep clone /
  JSON round-trip); no mutation; no other key touched;
  `sanitizeLibraryMetadata` itself fenced. Unit-test matrix bound EXACT:
  **N = 9** named tests → new-helper gate 9/1, focused unchanged 59/2,
  full becomes **441/42**. E2E flip bound: six keys ABSENT from both
  clone rows (key-presence assertions), originals/child-pointers/ordinary
  metadata/visible content stable, triggers unweakened, classification →
  `clone-membership-metadata-sanitized`, annotation →
  `patch-071-clone-membership-fix`. Fence ruling: the committed Stage-0
  spec stays authorized-change, so the immutable set is UNCHANGED at
  **48 unique paths** (48/48 re-verified at `af04779`). All baselines
  refreshed fresh at `af04779` this session (dev-server contract, own
  server attributed/stopped, port free). Stop conditions extended
  (§0.1.7). Bound Stage-1 commit message unchanged:
  `fix(drawing): sanitize membership metadata on canvas clone
  (PATCH-071)`. Sonnet PASS required before commit. PATCH-072 not
  started.
- **2026-07-16** — PATCH-070 **DONE (Stage 1 commit
  `115a977be1797ce01811f7ed13beec3c682331cd`, Sonnet PASS, no required
  changes)** + post-070 census + **PATCH-071 AUTHORIZED** ("Sanitize
  Membership Metadata on Drawing-Canvas Clone", staged repro-first, base
  `115a977`). **PATCH-070 closure:** exactly the four authorized files
  landed — `planSlideComposition.ts` (→ `2d3b0dc3…`: one activeElements
  index domain via `activeIndexById`; below = activeIndex <
  firstPadletActiveIndex, above = everything else; no eligible native
  dropped or duplicated, band order preserved, plan shape/resolver/
  runtime input unchanged, no middle-band field),
  `RuntimeSlideRenderer.tsx` (restored BYTE-IDENTICAL to `a407cccc…` —
  all Stage-0B diagnostics removed, zero diagnostic strings/global
  writes), `presentationBridge.test.ts` (→ `8a503122…`, +8 additive
  tests: S1–S7 + cross-scenario no-drop invariant),
  `drawing-presentation.spec.ts` (→ `19d6e864…`, N2-era defect
  assertions flipped, Stage-0/0B classification reads removed,
  `patch-070-native-raster-fix` annotation). Fixed behavior proven live:
  Node plan `nativeBelowIds=[]` /
  `nativeAboveIds=[text-landscape, shape-landscape]`; fullscreen exactly
  one below + one above PNG, above loaded 1280×720, meaningful pixels
  10744 (text 1864 / shape 8784; seeded hits text 1960 / stroke 760 /
  fill 8024); thumbnail unchanged (18911 meaningful px, no thumbnail
  source touched); persisted scene unchanged (raw length 3435
  before/after); frame order unchanged; the legitimate reconciliation
  padlet remains visible and unfiltered. Gates: setup 1, line 4,
  presentation 2+2 approved skips, cred-off 4+4, focused 59/2, full
  432/41, diff-check/tsc/boundaries/verify/build green, cleanup zeros,
  42/42 fences, zero prod imports, repo clean/synced. **Fresh census
  (Task-2 sweep, ranked narrowest→broadest):** (1) **RC-2
  clone-membership corruption — SELECTED as PATCH-071**: fresh source
  read at `115a977` confirms `useCanvasActions.ts:110-126/:178-198` pass
  `metadata` verbatim on Duplicate/Paste (consumer census: DrawingLayout
  is the ONLY importer; trigger = card pencil `data-post-menu-trigger` →
  `CanvasContextMenu` items, labeled, reachable; precedent rule exists in
  `sanitizeLibraryMetadata` — six keys); deterministic, one production
  file, P3-family corruption (copy renders original's children, edits
  cross-link). (2) presentation frame-order divergence (sidebar
  `order→y→x` vs fullscreen raw scene order) — deterministic +
  characterized, but needs a product ruling on the canonical order and
  flips frozen assertions; next in line. (3) RC-3 membership-union
  consolidation — P6 refactor riding the existing net, not a defect fix.
  (4) RC-1 duplicate `padlet://` links + resolver dedupe (070 census
  measured no-dedupe, S5) — needs a duplication-semantics ruling
  (clone-the-post vs shared-reference), element-level, fork-adjacent,
  multi-file; design-first. (5) line-follow on container move +
  natural-height (PATCH-064-frozen) — feature-sized attachment-anchor
  contract needed first. (6) RC-5 AI-image slide omission — blocked on a
  deterministic fixture design. (7) RC-4 slide-overlap fallback — now
  LOAD-BEARING (070 proved reconciliation-inserted unframed embeddables
  depend on it); any change needs membership-semantics design; record
  only. (8) uploaded-image storage cleanup — doc-only note, no live
  defect. (9) Connections side panel (Registry-Editor-style hierarchy,
  connection search, select/center line) — FEATURE, needs a fresh
  product/design spec + explicit roadmap approval; not stabilization.
  Post-070 exposure check: none found in production; one test-infra note
  recorded — the bridge wrapper `characterizeSlideComposition` passes
  RAW elements to `resolveSlidePadlets` while the planner uses
  activeElements internally (observability skew only when deleted
  elements exist; production consumers unaffected). **PATCH-071 shape:**
  Stage 0 = NEW `drawing-duplication.spec.ts` (sole file, harness reused
  unmodified) freezing O1–O5 (menu reachability, Duplicate/Paste rows
  copying `childPadletIds` verbatim, originals stable); Stage 1
  (contingent on Stage 0 confirming the census) = NEW pure
  `lib/infra/collabboard/clonedPostMetadata.ts` + tests (≥6; nullish
  passthrough, six-key strip: parentId/childPadletIds/sectionId/
  sectionPosition/position_in_timeline/wallPosition, unknown-key
  preservation, non-mutation) + exactly two call-site edits in
  `useCanvasActions.ts` (`ee33f917…`) + spec flip. Rejected: deep-copy
  children (feature), command-layer sanitation (too broad), sanitizer
  consolidation (separate P6 patch), RC-1 bundling, comment-key changes
  (fenced duality). 48 unique immutable fences (070's 42 + the four 070
  files re-frozen + `CanvasContextMenu.tsx` + `RowColumnContainerCard.tsx`),
  48/48 verified at base. Baselines re-verified fresh at `115a977` this
  session (59/2, 432/41, setup 1, line 4, presentation 2+2, cred-off
  4+4, cleanup zeros, zero prod imports, RuntimeSlideRenderer
  `a407cccc…`). Bound commits:
  `test(drawing): characterize clone membership corruption (PATCH-071
  Stage 0)` / `fix(drawing): sanitize membership metadata on canvas
  clone (PATCH-071)`. Sonnet PASS required per stage.
- **2026-07-16** — PATCH-070 **Stage 0B DONE (commit
  `514b1d9ab8f387d3a39d39ed7a13ae87fb36a07e`, Sonnet PASS)** + **Stage 1
  AUTHORIZED** (Amendment 2: composition planner lossless band closure).
  Stage 0B landed diagnosis-only, exactly two files
  (`RuntimeSlideRenderer.tsx` → `c4b4b80f…` dev-only diagnostics, proven
  minified to a hard no-op in the production chunk;
  `drawing-presentation.spec.ts` → `bbeb16c1…` reader/classifier).
  **Proven row: G1d** — the live fullscreen plan input holds the 7 seeded
  elements in persisted order PLUS one live-only embeddable
  (`177f9190…`, `frameId: null`, link `padlet://a12ed29e…`, live index 7);
  live resolved padlet zIndexes `[2,3,7]` vs Node-side `[2,3]`; both
  natives (indexes 4,5) sit inside the widened interval → both bands
  empty, above branch false, zero above commits; tokens/cleanup clean;
  persisted scene + Node plan stable. **Origin census closed the
  question:** the extra element is DrawingLayout's padlet↔scene
  reconciliation (`:1627-1629`/`:1746-1755`) self-healing a REAL padlet —
  the harness's Container C (seeded in DB, deliberately given no scene
  embeddable by `seedPresentationScene`) — inserted `frameId: null` at the
  padlet's stored position, autosave-suppressed BY DESIGN
  (`isSyncingEmbeddablesRef`, `commitToHistory: false`), session-local
  element id, resolving onto the landscape slide via the resolver's
  geometric-overlap fallback (bbox 160..480×460..680 inside 0,0,1280,720).
  **Ruling: the element is legitimate content; its DB absence is
  intentional; presentation consuming it is CORRECT.** The count-gate
  staleness mechanism (F4-B/G2) was NOT live (7→8 IS a count change).
  **Ownership: composition planning — ONE defect** (Task-4 outcome 2):
  `planSlideComposition.ts:39-47` silently drops every native between
  `firstPadletIndex` and `lastPadletIndex` from BOTH bands. CTO dry-ran
  the real planner on 7 scenarios (S1–S7, table in §0.2.4): mid-band drop
  (S3), the live G1d shape (S4), duplicate-link widening (S5), and a
  second lossy shape — raw-vs-active index-domain mismatch drops a native
  preceded by a deleted element (S7). Runtime-input filtering (A) and
  resolver provenance (B) REJECTED: no invalid artifact exists, and
  excluding unpersisted embeddables would hide real posts. **Stage 1
  bound design (§0.2.5):** single active-index domain + band rule
  below = idx < firstPadletIndex, above = everything else (mid-interval
  natives raster ABOVE — visibility per P3; exact interleaving is
  unrepresentable in the two-raster model; all currently-lossless scenes
  byte-equal in outcome); plan shape/resolver/consumers untouched;
  full multi-band segmentation REJECTED as broad architecture. Allowed
  files (4, §0.2.6): `planSlideComposition.ts` (`9524e639…`, unfenced by
  this amendment per §5-F4's planner-ruling path),
  `presentationBridge.test.ts` (`dff458de…`, ADDITIVE S1–S7 + no-drop
  invariant tests — vitest include globs force `lib/**` placement),
  `RuntimeSlideRenderer.tsx` (diagnostic REMOVAL to byte-identity
  `a407cccc…` via `git cat-file` restore), spec (`bbeb16c1…`, §7
  fixed-state flip + `patch-070-native-raster-fix` annotation). Fences:
  42 unique immutable paths (43-set minus the two unfenced files, plus
  `slide-renderer/types.ts a2825c8b…` closing the plan-shape loophole);
  all 43 re-verified at `514b1d9` during the census. Baselines: focused
  51+N/2, full 424+N/41 (N ≥ 8, declared + re-derived), all other gates
  carried. Stage-1 commit message unchanged
  (`fix(presentation): restore fullscreen native raster (PATCH-070)`);
  Sonnet PASS required before commit; PATCH-071 not started. Follow-up
  candidates recorded, NOT authorized: resolver duplicate-link dedupe,
  count-gate staleness (G2-class latent), planner multi-band model.
- **2026-07-16** — PATCH-070 **Stage 0 DONE (commit
  `b9b754cefccd6569ed4e5ce858090609c6b76567`)** + **Stage 0B AUTHORIZED**
  (Amendment 1). Stage 0 landed as the runtime discrimination probe,
  exactly one file (`drawing-presentation.spec.ts`, now `ee2d3adb…`).
  Review history: Sonnet round 1 PASS WITH REQUIRED CHANGES — the
  test-owned pixel-analysis canvas contaminated production-export
  attribution (F1 was initially over-selected on a bare canvas-size
  match); corrected with explicit `markHarnessCanvas` provenance +
  hard exclusion; focused re-review PASS, result reproduced in two
  fresh dev-server sessions. **Proven row: F4** — after excluding
  test-owned canvases, exactly one production export canvas exists in
  the fullscreen window (the below band, stack-fingerprinted into the
  fork's `exportToCanvas`); `aboveExportBegan=false`; no
  above-attributable toDataURL call/return/throw; no above img mount
  (raw MutationObserver timeline); persisted scene + Node-side plan
  stable before/after. Stage-0 gates all green (setup 1, line 4,
  presentation 2+2, cred-off 4+4, 51/2, 424/41, tsc/boundaries/
  verify/build, cleanup zeros, 43/43 fences, zero prod imports).
  Fresh live-runtime census then reconciled F4 with source:
  **F4-C/D/E/F ruled out** (both export chains are created
  synchronously in one effect body — below ran, so the body passed the
  above branch; no key/remount hazard; the only guard IS the
  empty-above condition), leaving **F4-A** (live plan empties the
  above band: mid-band order divergence, frameId/deletion divergence,
  natives absent, or padlet-resolution divergence) and **F4-B** (stale
  input array) undiscriminated. Census keystone:
  `DrawingLayout.tsx:1083-1089` commits Excalidraw changes to
  `elements` state ONLY when the active element COUNT changes — any
  count-preserving reorder/normalization/in-place mutation (incl. the
  autosave-suppressed one-shot embeddable refresh) is invisible to
  React state, thumbnails (cached), and render signatures; plus
  `resolveSlidePadlets.ts:15` binds padlet zIndex to RAW live array
  index. The discriminating values are React-local and browser-
  unobservable (no window handle, no DOM plan attributes), so
  **Stage 0B** authorizes a bound development-only diagnostic in
  `RuntimeSlideRenderer.tsx` (@ `a407cccc…`, diagnostic-only, single
  `NODE_ENV !== 'production'` guard, dev-only global
  `__fable5RuntimeSlideDiagnostics`, four record kinds at four bound
  insertion points, 200-entry cap, no control-flow/timing change, no
  fix in the same stage) + spec-side reading/classification
  (`patch-070-stage0b-probe`, decision table G1a-d/G2/G3/G4, STOP on
  ambiguity). Stage-0B commit bound:
  `test(drawing): observe live slide composition inputs (PATCH-070
  Stage 0B)`. **Production fix remains LOCKED**; Stage 1 requires a
  further named amendment binding one G-row to one §5 design;
  G1a/G1d outcomes implicating planner/caller wiring require
  STOP-and-redesign (those files stay fenced). 43/43 fences verified
  at base `b9b754c`; all baselines carried; PATCH-071 not started.
- **2026-07-15** — PATCH-069 **DONE (commit
  `05e913ef84c802b999bc4411d960873e4b21bb23`, Sonnet PASS)** — landed as
  the diagnosis-only characterization, exactly one file
  (`e2e/characterization/drawing-presentation.spec.ts`, new hash
  `3ddcc987…`), pushed, main clean and level. **Final diagnosis: N2 —
  the fullscreen above-band PNG never materializes**, proven with live
  evidence under the bound dev-server contract. Persisted scene matches
  seed (text `text-landscape` @ scene index 4, shape `shape-landscape`
  @ index 5; visible, non-deleted, opaque, non-zero size). Composition
  plan (REAL pure `planSlideComposition` imported Node-side against the
  real persisted scene): padlet range 2..3, `nativeBelowIds=[]`,
  `nativeAboveIds=[text-landscape, shape-landscape]`, expected band
  `above`, nothing dropped — the latent mid-band gap did NOT affect
  this fixture. Fullscreen: exactly one loaded data PNG (below band,
  1280×720), blank for the native regions; the required above-band PNG
  absent from the DOM entirely. Thumbnail: merged preview PNG present
  with real native text+shape pixels (meaningful pixels + seeded-color
  hits) — surface descriptor N5, not a competing primary. Root-cause
  boundary: persisted data correct, composition planning correct,
  defect fullscreen-runtime-specific; thumbnail rendering proves the
  native content itself is exportable. Final gates: setup 1; line 4;
  presentation 2 + 2 approved skips; credential-off 4 + 4; focused
  51/2; full 424/41; tsc/boundaries/verify/build green (parallel
  verify/build `.next/types` contention confirmed environmental —
  sequential rerun clean); cleanup zeros (independent service-role
  query); 40/40 immutable fences; zero production imports; repository
  clean and synced.
- **2026-07-15** — Post-069 census + PATCH-070 **AUTHORED + APPROVED**
  ("Restore Fullscreen Native Above-Band Raster", **staged
  diagnosis-first**, base `05e913e`). Fresh census findings that
  narrow but cannot close the root cause: RuntimeSlideRenderer's below/
  above exports are fully INDEPENDENT promise chains with separate
  silent catches (`:114-127`/`:130-145`) — "one failed export blocks
  the other" is structurally impossible; the fork's font loader
  swallows load failures (`Fonts.ts:252-268`) — **the live Virgil CORS
  error CANNOT reject an export and is ruled noise**; the observed
  1280×720 below PNG proves `compositionPlan.frameElement` resolved
  live (frame present at fullscreen time); the thumbnail path
  (`createSlideRenderer.tsx:216-235`) runs the SAME
  `renderExcalidrawSlideBase` on the SAME `nativeAboveElements` inside
  a `Promise.all` and succeeds — since the below band is empty for
  this fixture, the thumbnail's visible native content can only come
  from the above-band canvas, proving the shared pipeline works for
  these exact elements; both surfaces read the same DrawingLayout state
  (runtime refs re-synced every render, `:695-697`) — staleness by
  construction excluded; the only plan-divergence shape consistent with
  a blank below PNG is the mid-band gap biting LIVE (order drift after
  thumbnail caching). Surviving mechanisms — above export rejects (F1),
  toDataURL throws (F2), commit suppressed by cancellation/token (F3),
  runtime plan divergence (F4), degenerate bounds (F6) — are NOT
  source-discriminable, so PATCH-070 is staged: **Stage 0** adds a
  deterministic test-only probe (toDataURL trace, above-export-began
  evidence, post-run persisted-order re-fetch + plan rerun, font-load
  log) in the sole allowed spec file mapping the live behavior onto
  exactly one bound decision row F1–F7 (annotation
  `patch-070-stage0-probe`; all PATCH-069 assertions stay green);
  **Stage 1** (production fix in `RuntimeSlideRenderer.tsx` only,
  authorized hash `a407cccc…`, LOCKED during Stage 0) requires a named
  CTO amendment binding the proven row to exactly one design class;
  per-row designs bound, speculative combinations and thumbnail/planner
  /fork/frame-order/AI-image scope rejected. 43 unique immutable fences
  (39 carried from PATCH-069 + 4 fork census files: `Fonts.ts`,
  `scene/export.ts`, `utils/src/export.ts`, `element/src/frame.ts`),
  all verified at base; baselines bound (51/2, 424/41, setup 1, line 4,
  presentation 2+2, cred-off 4+4, cleanup zeros, zero prod imports);
  dev-server diagnostic contract binding; Sonnet PASS required per
  stage; Stage-0 commit `test(drawing): probe fullscreen above-band
  export runtime (PATCH-070 Stage 0)`; Stage-1 commit (reserved)
  `fix(presentation): restore fullscreen native raster (PATCH-070)`.
- **2026-07-15** — PATCH-068 **DONE (commit
  `e2f0bbd2affdfe9215fa8ab2faa0780b8b0c1a6c`)** — first production fix
  of the Drawing Bridge program, landed after Sonnet's initial PASS
  WITH REQUIRED CHANGES (one blocking test gap: final invariant
  snapshots were captured before the point-handle probe) was corrected
  (snapshots rebound to true post-point-handle state,
  `...AfterPointHandle` variables driving the final assertions and the
  `patch-068-contextmenu-fix` annotation) and a focused re-review
  returned PASS. Exactly two files: `DrawingLayout.tsx` (new hash
  `93e5900f8df6468a466f8bfd0318f813393336a1`) and
  `drawing-line-bridge.spec.ts` (`3e690d20614dee1c0b6c60a791f4031e9aa53833`).
  Production correction: role-priority lookup and list UNCHANGED;
  contextmenu-only normalization in
  `resolveBackLineContextMenuDispatchTarget` — when the resolved role
  is exactly `midpoint-handle` or `point-handle`, the synthetic
  contextmenu dispatch target becomes the SAME line's back-plane
  hit-path via
  `[data-line-id="${CSS.escape(lineId)}"][data-line-role="hit-path"][data-line-renderer="back"]`,
  falling back to the original target if unavailable; coordinates/
  modifiers preserved; no direct callback invocation; pointerdown/
  mousedown/click/dblclick/drag routing untouched. Final behavior:
  State U unchanged (hit-path direct, menu opens); State S midpoint
  AND point-handle both open the owning line's menu with matching
  original/normalized line IDs, renderer diagnostics firing,
  Excalidraw menu absent, selection + edit handles intact. Final
  invariants proven post-point-handle: geometry, full/primary/other
  persisted rows, unrelated rendered lines, containers — all
  unchanged; no overlapping-line contamination. Gates: setup 1; line
  4; presentation 2 + 2 approved skips; credential-off 4 + 4; focused
  51/2; full 424/41; tsc/boundaries/verify/build green; cleanup zeros
  (independent service-role query); 39/39 unique immutable fences
  (historical "38" label noted stale); zero production imports;
  repository clean and synced. **The back-line context-menu defect
  (PATCH-067's R6) is FIXED.**
- **2026-07-15** — Post-068 census + PATCH-069 **AUTHORED + APPROVED**
  ("Diagnose Blank Native Raster in Presentation Slides",
  diagnosis-only, base `e2f0bbd`). Candidate ranking (narrowest/safest
  first): (1) **blank native slide raster** — user-visible (native
  drawing content invisible in presentations), deterministic (frozen
  `nativeRasterCounts` all-zero assertion), characterized, root cause
  UNKNOWN → diagnosis-first, one test file — SELECTED; (2) line-follow
  on container movement (PATCH-064-frozen) — deterministic and
  characterized but the fix is feature-sized (attachment-anchor
  design, persistence ownership, likely touching the CanvasClient
  hotspot) and needs an intended-behavior ruling first; (3)
  natural-height line-follow — same family as (2), excluded from any
  joint patch unless one proven shared cause; (4) presentation frame
  ordering divergence — deterministic but plausibly INTENDED
  (position-sorted slides); needs a product ruling before any patch;
  (5) duplication/membership family (PATCH-062 RC-1/2/3/6) — real but
  needs fresh source+persistence mapping per sub-defect; (6) AI-image
  slide omission — blocked on a deterministic fixture design; (7)
  slide-overlap fallback (RC-4) — recorded, low; (8) residual
  contextmenu roles (legacy start/control/end handles) — structurally
  identical to the fixed pair but no harness reproduction path;
  deferred. Census highlights grounding PATCH-069:
  `planSlideComposition.ts:39-47` band split has a latent mid-band gap
  (elements between padlet zIndexes vanish from BOTH bands — should
  not bite the seeded fixture, must be proven);
  `RuntimeSlideRenderer.tsx:127/:144` swallow export failures
  SILENTLY; `renderExcalidrawSlideBase.ts:25` exports through the
  fork build (`package.json:24` file: dep); the seeded native
  elements are genuinely visible content (`drawingBridgeHarness.ts:
  145-156/185-199`). N1–N5 classification bound (plan drops / silent
  export failure / empty PNG / persisted-scene divergence / other),
  discriminated deterministically by importing the PURE
  `planSlideComposition` into the Node-side spec against the real
  persisted scene + a browser PNG census — no production
  instrumentation. Sole allowed file
  `drawing-presentation.spec.ts` (@ `c6bfb4f0…`); 40 unique immutable
  fences (39 carried − presentation spec + the two frozen PATCH-068
  files), 40/40 verified at base; baselines freshly rerun green at
  `e2f0bbd` (line 4, presentation 2+2, cred-off 4+4, 51/2, 424/41,
  cleanup zeros, zero prod imports); dev-server diagnostic contract
  and Amendment-1 auth procedure remain binding; Sonnet PASS required
  before commit; any fix is PATCH-070 with a fresh census.
- **2026-07-15** — PATCH-067 **DONE (commit
  `a181cdea2317a0d8a1602261c571d8a93721fcf8`, Sonnet PASS)** — landed
  as the diagnosis-only characterization, exactly one file
  (`e2e/characterization/drawing-line-bridge.spec.ts`), pushed, main
  clean and level. **Final diagnosis: R6 — selected-state
  context-menu divergence**, proven with live browser evidence under
  the bound dev-server contract. State U (unselected): target lookup
  resolves `hit-path`, `contextmenu-capture` guardPassed true,
  `hit-path-contextmenu:before-stop`/`after-stop` both fire, line
  becomes selected, the app line context menu OPENS, Excalidraw's menu
  stays absent. State S (selected + edit mode, established only via
  the frozen real left-click → double-click sequence, `midpoint-handle:
  1` / `point-handle: 2`): lookup resolves `midpoint-handle` at the
  segment-center coordinate, no `hit-path-contextmenu:*` diagnostic
  fires, the app menu stays absent, Excalidraw's menu stays absent.
  Root-cause boundary confirmed: only the hit-path owns the line
  `onContextMenu` path; edit handles intentionally outrank hit-path in
  `BACK_LINE_INTERACTIVE_ROLE_PRIORITY` for drag routing; the
  synthetic contextmenu dispatched at a handle bubbles only to the
  SVG root's suppress-only handler; State U proves the CanvasClient
  callback and `canUseFreeformEditButton` permission gate are
  functional; Excalidraw is not the primary failure (absent in both
  states, consumed by the bridge's capture-phase stop whenever the
  lookup succeeds). Frozen invariants held throughout: left-click
  selection, persistence, double-click edit mode, geometry, persisted
  rows, unrelated lines, and containers all unchanged. Final gates
  (dev-server contract, `PW_BASE_URL`, independently rerun by
  Sonnet): setup 1 passed; line setup+3 active = 4 passed;
  presentation 2 passed / 2 approved skips; credential-off line 4
  skipped / presentation 4 skipped; focused Vitest 51/2; full Vitest
  424/41; tsc, boundaries, verify, build green; cleanup boards=0 /
  padlets=0 / canvasLines=0 via an independent service-role query;
  **39/39 unique immutable fences matched** (the patch text's "38"
  label was stale from before DrawingLayout.tsx was folded back in —
  no duplicate or missing fence; corrected going forward); zero
  production imports of lineBridge/presentationBridge/
  drawingBridgeHarness; repository clean and synced.
- **2026-07-15** — PATCH-068 **AUTHORED + APPROVED** ("Route Back-Line
  Context Menu from Selected Edit Handles") — production fix patch,
  base `a181cde`. Fresh census (not copied from PATCH-067's diagnosis)
  confirmed the smallest safe design: inside
  `handleBackLineBridgeContextMenuCapture`
  (`DrawingLayout.tsx:2573-2671`) only, after
  `findBackLineInteractiveTargetAtPoint` resolves an interactive
  target, if its `data-line-role` is `midpoint-handle` or
  `point-handle`, resolve that SAME line's `hit-path` element via an
  exact `data-line-id`-scoped `querySelector` (not a coordinate-based
  `elementsFromPoint` fallback, which could hit a different overlapping
  line) and dispatch the synthetic `contextmenu` there instead, with
  `clientX`/`clientY` preserved unchanged so the menu opens at the
  real cursor position; if the scoped hit-path isn't found, fall back
  to today's characterized (non-opening) behavior rather than guess.
  Role-priority resolution itself (`BACK_LINE_INTERACTIVE_ROLE_PRIORITY`,
  used by mousedown/click/dblclick/contextmenu alike) is UNTOUCHED —
  only the contextmenu dispatch TARGET is normalized, so left-click,
  drag, double-click, and handle editing are structurally unaffected.
  `start-handle`/`control-handle`/`end-handle` are structurally
  identical (same missing-contextmenu-handler shape) but are EXCLUDED
  from this patch's authorized scope: the harness cannot currently seed
  a legacy non-multipoint line, so there is no live regression path to
  prove them — deferred to a future patch if that path is ever
  exercised. Four alternative designs explicitly rejected (global
  role-priority lowering — breaks handle drag/edit; adding
  `onContextMenu` to every handle in SimpleLineRenderer — duplicates
  callback wiring across an untouched file; calling CanvasClient's menu
  callback directly from DrawingLayout — bypasses renderer event
  ownership; unscoped `elementsFromPoint` fallback — overlap risk;
  falling through to Excalidraw — wrong menu). Allowed files: EXACTLY
  `components/collabboard/canvas/layouts/DrawingLayout.tsx`
  (authorized-change baseline `b3684e4c6226ec2ad77fbff3265de25339a7f471`)
  and `e2e/characterization/drawing-line-bridge.spec.ts` (authorized-
  change baseline `cdffcd794ad3fae743a97a25ccb4572a72c4080a`); no new
  file, no unit helper unless a genuinely tiny local (unexported)
  function inside DrawingLayout.tsx is clearer — no separate file.
  39 immutable fences bound (the 38 PATCH-067 carries minus
  DrawingLayout.tsx, which now moves to authorized-change, plus
  `LineContextMenu.tsx` newly fenced since it sits directly in the
  call chain). Dev-server diagnostic contract (Amendment 2) remains in
  force unchanged; no production logging changes for tests. GPT-5.5 may
  implement but not commit; Sonnet PASS required before commit; Fable
  closes PATCH-068 afterward.
- **2026-07-15** — PATCH-067 **Amendment 2 APPROVED: diagnostics bound
  to the development server (ruling A — environment contract mismatch;
  committed test NOT defective, no repair authorized).** Pre-edit STOP:
  running the committed line baseline WITHOUT `PW_BASE_URL` let
  `playwright.config.ts:48-55` start the PRODUCTION webServer
  (`npm run start -- --port 3100`); result 3 passed / 1 failed — the
  PATCH-066 pointer test's first unconditional diagnostic assertion
  failed with `mouseDownCapture === null` while the real UI worked
  (edit mode reached, handles visible). Zero files changed. Cause is
  definitional, not a race: `DEV_DRAWING_BRIDGE_DIAGNOSTICS` and
  `DEV_LINE_RENDER_DIAGNOSTICS` are both `process.env.NODE_ENV !==
  'production'` (`DrawingLayout.tsx:91` gating `:2175`/`:2228`;
  `SimpleLineRenderer.tsx:6` gating `:15`) — under `next start` the
  log calls are unreachable. Dev-mode determinism reconfirmed by a
  fresh CTO run at this HEAD: 4/4 green (third independent green dev
  run at spec hash `075360ab…`). Collection-design review found no
  race in the committed test (Playwright-side listener, flush barrier
  before queries) but one bound consequence for 067: shared
  first-match console buffers WOULD conflate the two State U/State S
  right-clicks — per-state buffers/clear boundaries are required in
  the implementation. Bound environment contract: self-started
  `npm run dev` (LESSONS_LEARNED port discipline), dev banner
  confirmed, `PW_BASE_URL` pointing at it, production `:3100`
  webServer recorded as UNSUPPORTED for diagnostic assertions, at
  least one bridge payload captured per run, `.next` never staged.
  Sequencing: reproduce line baseline 4/4 green under the bound
  contract, then proceed straight to State U / State S — no Stage-A
  repair exists. §0.2's R6 selected-state-divergence ruling is
  unaffected. Test-only scope, sole allowed file, and Sonnet-PASS
  requirement unchanged.
- **2026-07-15** — PATCH-067 **Amendment 1 APPROVED: selected-state
  divergence accepted as R6.** The implementer ran the live diagnosis at
  base `6693843` with every pre-flight gate passed (38/38 fences, spec
  at `075360ab…`, unit 51/2 + 424/41, line 4 passed, presentation 2+2
  skips, credential-off 4+4, cleanup zeros) and hit a correct pre-edit
  STOP with ZERO files changed: **State U (unselected) SUCCEEDS** —
  right-click resolves `hit-path`, `hit-path-contextmenu:before/after-
  stop` diagnostics fire (`SimpleLineRenderer.tsx:709/715`), the line
  selects and the LINE MENU OPENS, Excalidraw menu absent — while
  **State S (selected + edit mode) FAILS** — lookup resolves
  `midpoint-handle`, no menu. The activated table was failure-oriented
  (R2 presumed U also fails; R6's "different exits" did not enumerate a
  success), so the outcome was unlisted → STOP, as designed. CTO ruling:
  evidence accepted; R6 redefined as the precise selected-state
  divergence row (U succeeds through hit-path; S fails because
  edit-handle role priority shadows the only contextmenu-capable role —
  the 2-point line's midpoint handle sits exactly at the clicked
  center, and no handle role carries `onContextMenu`; dispatch dies at
  the suppress-only SVG root `:626-631`). All ten root-cause boundary
  points re-confirmed from live source; R4 empirically eliminated
  (State U proves the `canUseFreeformEditButton` gate + callback chain
  work). Bound test outcomes are now fixed per state — the test FAILS
  if U's menu doesn't open, U doesn't resolve hit-path, S resolves
  hit-path, S's menu opens, S's handles are absent, geometry/rows
  change, or any frozen PATCH-066 assertion regresses. PATCH-067
  remains diagnosis-only, one allowed file
  (`drawing-line-bridge.spec.ts` @ `075360ab…`), production fix
  prohibited; the likely PATCH-068 candidate (contextmenu-only routing
  from a resolved handle to the owning line's callback / hit-path
  fallback, WITHOUT lowering drag priority) is recorded as
  informational only, pending a fresh PATCH-068 census. Sonnet PASS
  still bound before the implementation commit.
- **2026-07-15** — PATCH-066 **DONE (commit
  `b1f4e1ace9f1665fbdada3eab7769a7b69f002fb`, Sonnet PASS)** — landed as
  the Amendment-2 test-only correction; exactly one file committed
  (`e2e/characterization/drawing-line-bridge.spec.ts`, 232 insertions /
  80 deletions), pushed, main clean and level. Governance disposition:
  the original production mandate was revoked by Amendment 2; NO
  DrawingLayout production change was made; deterministic Stage-0
  console evidence proved left-click routing already works; PATCH-067
  remained unstarted throughout. Frozen working behavior now under fixed
  assertions: left-click — canvas physically topmost and physically
  targeted, bridge routes to the back-plane hit-path, line selects and
  STAYS selected after the full event cycle (settle-aware poll +
  post-cycle recheck), Edit Points / LineToolbar appears, geometry and
  the persisted CanvasLine row unchanged; double-click — routes, stays
  selected, `midpoint-handle: 1` + `point-handle: 2` appear (edit-mode
  roles the seeded 2-point line actually renders; legacy
  start/control/end stay 0), geometry/persistence unchanged;
  context menu — still does NOT open, contextmenu lookup resolves
  `midpoint-handle` after the dblclick edit-mode entry, failure is
  separate from the working left/double-click paths and explicitly
  deferred to PATCH-067. No adaptive routing branch remains — a
  recurrence of the old non-routing state now FAILS the suite. Final
  gates (independently rerun by Sonnet): setup 1 passed; credentialed
  line 4 passed / credential-off 4 skipped; credentialed presentation
  2 passed / 2 approved skips, credential-off 4 skipped; focused Vitest
  51/2; full Vitest 424/41; 38/38 immutable fences before and after;
  tsc, boundaries, verify, build green; cleanup boards=0 / padlets=0 /
  canvasLines=0 via an independent service-role query; zero production
  imports of lineBridge/presentationBridge/drawingBridgeHarness;
  repository clean and synced.
- **2026-07-15** — PATCH-067 **ACTIVATED** (§0.1 added): base rebound to
  `b1f4e1a`; authorized-change baseline refreshed to the LANDED spec
  hash `075360ab6a764b034ef7703e22ecdbaf34c135c1` (pre-066 hash declared
  dead); all 38 immutable fences re-verified at the new base. Census
  refreshed from live source with three corrections that sharpen the
  diagnosis: (1) point/midpoint handles render only under
  `isEditMode && isSelected` (`SimpleLineRenderer.tsx:813`) — the
  Stage-0 midpoint-handle resolution is an EDIT-MODE state (right-click
  followed dblclick; the 2-point line's midpoint handle sits exactly at
  the hit-path center), so State S is bound as "selected + edit mode
  via the frozen left-click→dblclick sequence" and State U as fully
  unselected; (2) the bridge contextmenu-capture handler has NO
  `button !== 0` guard, does a fresh lookup, nulls the bridged-target
  ref, and its capture-phase stopPropagation is what keeps Excalidraw's
  own bubble-phase `handleCanvasContextMenu` (fork `App.tsx:11673`)
  out whenever the lookup succeeds; (3) only the hit-path carries
  `onContextMenu` (`:708-721`) — a synthetic contextmenu at a handle
  bubbles to the SVG root's suppress-only handler (`:626-631`), and the
  CanvasClient callback is additionally gated by
  `canUseFreeformEditButton` (`CanvasClient.tsx:3275-3278`, an R4
  candidate the diagnosis must confirm true for the harness owner).
  R1–R6 table revalidated with per-state evidence requirements (R6 now
  explicitly covers divergent selected/unselected exits). Scope remains
  diagnosis-only, one allowed file, Sonnet PASS bound before commit;
  any production fix is PATCH-068 with a fresh census.
- **2026-07-15** — PATCH-066 **Amendment 2 APPROVED: production mandate
  REVOKED — the left-click routing defect is DISPROVEN.** After the
  Amendment-1 auth repair succeeded (setup 1 passed, regenerated
  `user.json` parses, file still ignored/unstaged, git clean) and ALL
  bound baselines passed (line 4 passed, presentation 2 passed / 2
  approved skips, credential-off 4+4 skipped, cleanup zeros), Stage 0's
  console-captured diagnosis showed the full route WORKING for a real
  coordinate left-click: activeToolType "selection", target lookup
  hit-path found, mouse-down + click captures guardPassed:true,
  SimpleLineRenderer received line-drag-start and path-click, the line
  selected and REMAINED selected after the complete Excalidraw cycle,
  handles appeared, geometry unchanged. Double-click also works. This
  matches none of decision-table Rows B–E → unlisted exit → the
  implementer correctly STOPPED with zero files changed. CTO ruling:
  no production change authorized; DrawingLayout.tsx returns to the
  immutable fence set (38 immutable fences); PATCH-066 is amended to
  TEST-ONLY — sole allowed file `drawing-line-bridge.spec.ts`, new bound
  commit message `test(drawing): freeze working back-line selection
  routing (PATCH-066)`. Discrepancy explanation (bound after re-reading
  the committed test): the earlier PATCH-065/baseline runs consistently
  observed a real NON-DETERMINISTIC non-routing state (recorder saw no
  dispatch AND probes saw no selection) while Stage 0 — identical
  source, fences held — observed full success; that is an
  observation/timing-sensitive intermittency, not a stable Row B–E
  defect, so any production edit would be speculative and is prohibited.
  The corrected test must assert the working behavior with fixed (not
  adaptive) assertions so any recurrence of the non-routing state FAILS
  loudly as new evidence. Context menu confirmed a SEPARATE root cause
  (contextmenu lookup resolves midpoint-handle on a selected line;
  only hit-path has an onContextMenu handler) — excluded from 066,
  diagnosed by PATCH-067. Sonnet review still bound before the 066
  test-correction commit.
- **2026-07-15** — PATCH-067 AUTHORED + **APPROVED** (diagnosis/
  characterization, test-only: "Diagnose Back-Line Context Menu
  Routing"). Scope: fresh census of the right-button event sequence
  (pointerdown/mousedown/contextmenu, capture order, button values, the
  intentional non-left-button guards), target mutation between events
  (why the lookup resolves midpoint-handle once selection succeeded and
  whether role priority is correct for contextmenu routing), the
  context-menu state path (LineContextMenu / CanvasClient
  handleLineContextMenu / hit-path onContextMenu chain, Excalidraw's
  handleCanvasContextMenu race), and a bound R1–R6 root-cause
  classification covering both SELECTED and UNSELECTED line states.
  Characterization freezes the current failing behavior honestly; the
  production fix is a separate future patch on this evidence. Allowed
  file: drawing-line-bridge.spec.ts only, baseline re-derived after the
  PATCH-066 test correction lands with a Sonnet PASS (hard sequencing
  stop). No production, fork, role-priority, or left-click/dblclick
  changes. Implementation not started.
- **2026-07-15** — PATCH-066 **Amendment 1 APPROVED** (environment repair
  only; no scope change). The implementer hit a correct pre-edit STOP: the
  credentialed baseline could not start because the local, generated,
  gitignored `e2e/.auth/user.json` is malformed JSON (one extra trailing
  `}`, parse error at line 15 col 2). No implementation, production, or
  test files were changed; full Vitest baseline 424/41 and all fences had
  already matched. CTO verification: the file is written by
  `e2e/auth.setup.ts` (`storageState({ path: AUTH_STATE_PATH })`), ignored
  via `.gitignore:58`, untracked, consumed by the `characterization`
  project. Ruling: regenerate via the existing `setup` project only —
  manual editing of auth artifacts (even one character) is prohibited
  since an authoritative regeneration workflow exists; never stage/commit
  the file; credentials only via `e2e/helpers/env.ts`; no credential
  values in any log or report; JSON parse check required; then the full
  §10 baselines (line 4 passed, presentation 2+2, credential-off 4+4,
  cleanup zeros) must be rerun and match before Stage 0 resumes. A second
  auth failure after one clean regeneration is a new STOP. The two-file
  implementation boundary is unchanged. CTO did not perform the repair
  (environment repair is implementer-executed under bound procedure).
- **2026-07-15** — PATCH-065 **DONE (commit `77998fc`), independent Sonnet
  verdict: PASS** — Drawing Bridge Hardening Program patch 4 complete.
  Committed files: exactly the three authorized e2e files
  (`drawing-line-bridge.spec.ts`, `drawing-presentation.spec.ts`,
  `drawingBridgeHarness.ts`). Verified root-cause evidence, all
  independently reproduced by the reviewer: real hit-path midpoint at
  x=550, y=260; `document.elementsFromPoint` shows
  `canvas.excalidraw__canvas.interactive` (z-index 2) ABOVE the back-line
  hit path (stack index 5); `locator.click()` times out with Playwright's
  own message naming the canvas as intercepting pointer events; real
  `page.mouse` mousedown/click/dblclick/contextmenu events all target the
  canvas; NO line selection occurs, NO edit handles appear, NO line context
  menu opens; the 8-role matrix is unchanged before/after every
  interaction. Primary classification: **event-bridge timing/routing
  issue**. Production defect proven: **yes** (coordinate-based real-event
  evidence, not just a locator timeout). Also landed: discriminating
  presentation ordering fixture (portrait seeded first, sidebar still
  renders landscape first, with an explicit not-equal assertion against
  insertion order) and honest fullscreen raw-order characterization
  (Slide 1 = portrait/child B, Slide 2 = landscape/child A). Final gates:
  424/41 full, 51/2 focused, 36/36 fences before AND after, line
  Playwright 4 passed, presentation 2 passed / 2 approved skips,
  credential-off 4+4 skipped, cleanup COMPLETE (independent query path),
  zero production imports, tsc/boundaries/verify/build green, repo clean
  and synced.
- **2026-07-15** — PATCH-066 AUTHORED + **APPROVED** (first PRODUCTION
  Drawing Bridge change of the program: repair back-line pointer event
  routing). Fresh census re-derived the full pointer path from live code:
  Excalidraw's interactive canvas handles `pointerdown` (React prop,
  `App.tsx` `handleCanvasPointerDown`, `setPointerCapture` at
  App.tsx:7159); DrawingLayout's bridge is five React CAPTURE handlers on
  the wrapper div (DrawingLayout.tsx:2730-2737) — pointerdown is LOG-ONLY,
  mousedown/click/dblclick/contextmenu each guard
  (reentrancy → activeTool==='selection' → button → target-is-canvas →
  `excalidraw__canvas` class → `findBackLineInteractiveTargetAtPoint`)
  then re-dispatch a synthetic MouseEvent at the resolved hit-path;
  SimpleLineRenderer's hit-path consumes them via React handlers
  (`handleLineDragStart`, `handlePathClick` → clears Excalidraw selection
  via `excalidrawAPIRef.updateScene` then `onSelectLine`;
  CanvasClient:6309 owns `selectedLineId`). Census eliminations: no native
  document/window capture mouse listeners active during a plain click (fork
  greps: only textWysiwyg during text edit, Popover non-capture); nothing
  inside Excalidraw can block an OUTER React capture handler; single React
  instance. Decisive PATCH-065 fact: the document-capture recorder saw the
  real mousedown+click at the canvas but NEVER a synthetic re-dispatch at
  the hit-path — the bridge either was never invoked or exited on a guard.
  The exact exit is deterministically discriminable in ONE run because
  `DEV_DRAWING_BRIDGE_DIAGNOSTICS = NODE_ENV !== 'production'`
  (DrawingLayout.tsx:91) logs every invocation and every
  `guardFailedReason`, and SimpleLineRenderer logs every hit-path event —
  PATCH-065 never captured console. PATCH-066 therefore binds a Stage-0
  console-captured diagnosis plus a closed decision table mapping each
  possible observed exit to ONE pre-authorized minimal DrawingLayout-only
  fix (anything outside the table = STOP). Allowed files:
  `components/collabboard/canvas/layouts/DrawingLayout.tsx` (production,
  baseline `b3684e4c`) + `e2e/characterization/drawing-line-bridge.spec.ts`
  (test, baseline `9853d10d`). 37 immutable fences incl. the harness,
  presentation spec, SimpleLineRenderer, CanvasClient, fork files.
  Selection is the target; context menu / double-click ride along ONLY if
  Stage 0 proves the identical exit for them; otherwise defer. Independent
  Sonnet review bound before commit. Implementation not started.
- **2026-07-15** — PATCH-064 **DONE (commit `2ed1455`), independent Sonnet
  verdict: PASS** — Drawing Bridge Hardening Program patch 3 complete after
  five independent review rounds (FAIL → 3× PASS WITH REQUIRED CHANGES →
  PASS). Landed: exactly the seven Amendment-5-authorized files (lineBridge +
  presentationBridge helpers/tests, two real-runtime Playwright specs, the
  test-only drawingBridgeHarness). Final state independently verified: 424
  unit tests / 41 files (51 focused / 2), 31/31 protected hashes intact
  before AND after all runs, zero production imports of any characterization
  helper or the harness, tsc/boundaries/verify/build green, fixture cleanup
  COMPLETE via exact-ID + prefix proof on a separate query path. Real runtime
  coverage now active: line rendering + full 8-role DOM matrix, real
  header-drag movement (container moves; line geometry AND persisted row
  unchanged — defect frozen), real editor-driven natural-height growth
  (161.5→337.5px; line unchanged — outcome
  `content-saved-height-increased-line-geometry-unchanged`), reload/nav
  persistence, deletion, multi-line/container independence; presentation
  frame discovery, titles, sidebar+fullscreen ordering, Slide 1=child A /
  Slide 2=child B active-slide assertions, real thumbnails, uploaded-image
  via `/templates/moodboard.png`, native text/shape blank-raster defect
  honestly frozen (text 0 / shape 0 / total 0), fullscreen next/prev/exit,
  close/reopen. Approved narrow skips (all Amendment-5-permitted): hit-path
  pointer-click/edit-handle interaction (Excalidraw canvas pointer
  interception — real trial-click timeout), AI-image (no deterministic
  fixture), uploaded-image storage-cleanup note (documentation-only, no
  storage object exists). Two accepted non-blocking findings carried to
  PATCH-065: the pointer-interaction investigation and the
  ordering-discrimination seed order (frame insertion order currently
  coincides with sort order). Housekeeping: commit message landed as
  "test(drawing): freeze line bridge and presentation behavior (PATCH-064)"
  instead of the bound "characterize … invariants" text — content verified
  correct, message-only deviation, recorded as with PATCH-063.
- **2026-07-15** — PATCH-065 AUTHORED + **APPROVED** (test-only
  investigation/characterization; Drawing Bridge Hardening Program patch 4).
  Closes the two PATCH-064 carried findings: (A) back-line pointer-interaction
  investigation — identify the real pointer-event path through the
  DrawingLayout back-line event bridge vs. Excalidraw canvas interception,
  classify the Playwright trial-click timeout (product defect vs. selector
  error vs. overlay/z-index vs. bridge timing), and add real characterization
  coverage; production changes NOT authorized unless a proven root cause is
  brought back for an explicit amendment first. (B) restore the
  discriminating presentation-ordering fixture (portrait seeded first,
  landscape still expected first in the sidebar) while keeping the corrected
  Slide 1/child A, Slide 2/child B assertions. Allowed files: the three
  existing e2e files only. All PATCH-064 hash fences carry forward; 424-test
  baseline bound; independent Sonnet review required before commit.
  Implementation not started. After PATCH-065, the first production Drawing
  Bridge refactor patch will be proposed — one root cause only, riding the
  PATCH-062/064 regression net.
- **2026-07-14** — PATCH-064 Amendment 5 **APPROVED under temporary CTO
  authority** (Fable unavailable ~3 days; narrow governance-only action, no
  application or test code touched). Context: the six PATCH-064
  implementation files remained uncommitted; an independent Sonnet
  acceptance review of the corrected pure/unit layer returned **PASS WITH
  REQUIRED CHANGES** — the four unit findings from the first review (selected
  -line-plane ordering, frame-mismatch false positives, runtime-container
  expansion reimplementing instead of delegating, untested blank-slide-title
  fallback) were all confirmed fixed (51 focused / 424 full tests, 31/31 hash
  fences, zero production imports), and the previously-hollow synthetic
  Playwright specs had been correctly replaced with an honest
  `test.skip(true, "...")` stating the real blocker: the live Drawing Line
  tool has no reachable UI path to attach a `CanvasLine` to app containers,
  and no deterministic way to seed a full disposable slide scene — so real
  runtime coverage was impossible without a seeding harness. This amendment
  authorizes exactly that: an unconditional (no longer duplication-gated)
  test-only `e2e/characterization/drawingBridgeHarness.ts`, with permission to
  modify the two Playwright specs to use it, under a detailed isolation/
  disposability/cleanup/API boundary (§5.3 of the patch) — no production
  source, schema, config, dependency, or Excalidraw fork change; disposable,
  uniquely-named records only; deterministic `finally`/`afterAll` cleanup;
  direct-write fixture creation permitted only where no real app/API path
  exists and only for structures already named in the original census.
  Ratifies the corrected unit layer as accepted without requiring redesign.
  New stop conditions, gates (real credentialed runs, credential-off skip
  proof, cleanup-proof query, re-verified 31/31 hashes, extended
  production-import grep covering the harness itself), and final-report
  fields added. Implementation may resume against the amended spec; the six
  existing implementation files were not touched by this governance action.
- **2026-07-14** — PATCH-064 AUTHORED + **APPROVED** (characterization-only;
  Drawing Bridge Hardening Program patch 3). Freezes the two remaining
  high-risk Drawing subsystems before any fix work: the LINE BRIDGE (app SVG
  lines + back-plane event bridge + Excalidraw bindings — role priority,
  start/end bindings, boundElements, hit/handle routing, move/resize,
  persistence, deletion, multi-container independence) and the SLIDE
  PREVIEW/PRESENTATION pipeline (frame discovery, current frameId-then-overlap
  membership rule, sidebar sort `order→y→x` vs fullscreen raw scene order,
  titles, orientation, thumbnail cache keys, runtime container expansion,
  zero-size layer behavior). Two pure helper modules + 44 bound unit tests
  (baseline re-run and bound at 373/39 → 417/41) + two Playwright
  characterization specs (35 enumerated browser scenarios), 31 hash fences
  all independently re-derived (31/31 match at base `2d4ce1f`). CTO review
  verified the census by direct read and applied four amendments before
  approval: Playwright project name corrected (`characterization`, not the
  nonexistent `chromium`; PW_BASE_URL + credentials-skip discipline bound),
  the optional e2e harness is a CREATE not a modify (file doesn't exist;
  `e2e/helpers/env.ts` must be reused), `mergeSlideLayers` census precision
  (two null paths) plus a node-env landmine warning (vitest has no
  `document` — unit tests must use the pure input-characterization helper,
  never call mergeSlideLayers), and the missing rollback section added.
  Known defects (overlap-fallback slide inclusion, duplicate padlet links,
  order divergence, AI-image gaps, zero-size unguardedness) are bound as
  characterize-DON'T-fix. No production import of the new helpers permitted.
  Housekeeping note: the PATCH-063 corrective commit landed as `2d4ce1f`
  with message "fix(drawing): close container title and comment UI
  regressions" instead of the bound message — content passed independent
  review (PASS), the message deviation is recorded here as a minor process
  note. Implementation of 064 not started.
- **2026-07-14** — PATCH-063 REWRITTEN + **APPROVED** (corrective/retroactive
  spec; GPT-5.4 acceptable). The original draft was unapproved and never
  matched what shipped: five commits (`39ff3c1`…`625fdde`) landed under it, two
  fixes sit uncommitted, and an independent review returned **PASS WITH
  REQUIRED CHANGES**. The rewrite ratifies the good work (drawing edit-target
  labels, table-title blanking on the create/edit/save chain, the drawing-only
  literal comment-button colours that dodge the fork's `--color-gray-100`
  override, the +2px container-clip buffer) and binds ONE corrective commit to
  close the arc: a single shared pure placeholder helper
  (`lib/infra/collabboard/postTitle.ts`) replacing the two divergent rules,
  fixes for the two live blank-table surfaces the review caught
  (`FreeformPadletCards.tsx:3502`, `ContainerChildPreviewCard.tsx:273`),
  removal of the redundant `containerEditTargetLabel.ts` guard, and regression
  tests. Editor-routing, comment data-model, frame/slide/lines/duplication/
  clipboard/AI/fork/schema/config/deps all OUT of scope and hash-fenced. The
  old draft's `postType.ts` resolver + routing goal are WITHDRAWN. Governance
  note: the arc's five commits reached `main` without CTO approval of the spec
  — a process breach recorded here; future Drawing-program patches must be
  approved before implementation (SKILL §4, AI_WORKFLOW). Implementation not
  started; the two uncommitted C/D edits remain in the working tree to be
  bundled into the corrective commit.
- **2026-07-14** — PATCH-062 landed and reviewed: **PASSED** (commit
  `2a82b7b`, pushed to main). **The Drawing Bridge Hardening Program is
  OPEN: the bridge contract is normative (PATCH-062 §0.3) and the
  characterization net is live.** Independently re-verified against the
  spec, not the implementer's report: scope exactly the two bound new
  files (`lib/infra/drawing/bridge.ts` 319 lines, `bridge.test.ts` 460 —
  both under ceiling, both `i/lf w/lf`); bound commit message verbatim;
  all 16 MUST-NOT-CHANGE hashes held (no app source, fork, config, or
  dependency touched); purity gates exact (react/next/supabase imports 0,
  `console.` 0, single `./importScene` import source, `padlet://` literal
  0 in bridge.ts — all link parsing delegates to
  `extractPadletIdFromEmbeddableLink`, no second parser); isolation gate 0
  (nothing imports the module except its test — zero runtime reachability,
  zero behavior change by construction). All 30 bound tests present with
  bound names T1–T30, deep-freeze discipline held; the T19 parity gate is
  real (set-equality against the live `resolveSlidePadlets` on the ≥6-case
  matrix, incl. the strict-inequality edge-touch exclusion). Gates re-run
  by the reviewer: focused vitest 49/2 (bound), full suite 355/37 (bound),
  `npm run verify` green end-to-end incl. production build, dev server
  Ready in 2.1s on :3000, port gate 0 before/0 after. One accepted
  interpretation ruling: `embeddable-frame-dangling` is checked for
  app (padlet-linked) embeddables only — consistent with T26's
  native-embeddable tolerance and the bridge's scope; recorded here so
  063+ specs inherit the reading. Deferred, disclosed: the §6 runtime
  observations (duplicate-link, paste-membership, slide-overlap, AI-child
  repros on a live board) are review-stage CTO duties that bind PATCH-063's
  before/after behavior, not 062 acceptance (062's §9 criteria are all
  deterministic and all verified) — they run at the start of the 063
  authoring session. Root causes RC-1…RC-6 stand as specified; no fix was
  bundled. Doc-drift watchlist item from §0.2 remains open (`.agent/
  skill.md` claims renderEmbeddable keys by padletId+renderSignature; live
  code keys by padletId alone — owner-visible doc, not `.fable5/`).
- **2026-07-14** — PATCH-062 AUTHORED (handoff-ready; **GPT-5.5 bound**,
  GPT-5.4 explicitly not authorized — new semantics-bearing module whose
  fixtures encode live behavior). First patch of the Drawing Bridge
  Hardening Program: bridge contract (4 clauses), root-cause census
  RC-1…RC-6 with exact sites (duplicate `padlet://` links from
  fork-native + slide duplication vs first-match resolvers; verbatim
  clipboard metadata paste; ≥3 divergent membership unions; slide-overlap
  membership fallback; AI-child-blind slide previews; uncharacterized
  z-order), pure helpers in NEW `lib/infra/drawing/bridge.ts` (P6 ruling:
  `parsePadletLink` already exists as `extractPadletIdFromEmbeddableLink`
  — reused, not duplicated; the H6/resolveSlidePadlets duality authorized
  only under the T19 parity lock with the bridge helper as designated
  survivor), 30 bound characterization tests, hash fences on 16 files,
  additive-only rollback. Diagnostics wiring into DrawingLayout REFUSED
  under the never-grow ceiling rule (3,078 lines); pure
  `summarizeDrawingBridgeSnapshot` ships instead, wiring deferred. Unit
  baseline re-run at authoring (325/36 — grew from 061's 252/28 via the
  auth-fix commits `8e5e4b6`…`efe7332`, which also moved CanvasClient off
  061's final hash; today's hashes bound instead).
- **2026-07-13** — PATCH-061 landed and reviewed: **PASSED** (commit
  `1f74386`; independently re-derived against the LIVE on-disk spec at
  its authoritative commit `c96c46e`, not the implementer's report —
  and, since the reviewer also authored this spec, reviewed without
  deference to that authorship). **THE PATCH-002 BOUNDARY-FREEZE
  PROGRAM IS NOW CLOSED AT THE GATE LEVEL — grandfather 1→0,
  `GRANDFATHERED_UI_FILES` is empty**, independently confirmed by
  direct read of the live config file. Both final raw hashes matched
  exactly at the commit and the live tree, using `--no-filters`
  throughout for the mixed-EOL config; scope confirmed as exactly two
  paths with the bound commit message exact; all 20 TS fences
  present. Both files' TRUE pre-edit blobs at the parent `1f74386^`
  matched the spec's bindings, and applying all ten bound pairs
  rebuilt both bound final hashes exactly AND byte-matched the live
  files — this directly resolves the implementer-disclosed
  intermediate CRLF mishap during their negative-control restore: the
  reconstruction from the TRUE parent blob is byte-identical to what
  is actually committed, confirming that incident left no trace in
  the final bytes and is NOT a defect. The binary-safe extractor was
  re-executed independently in an isolated git-backed sandbox seeded
  at the true pre-edit blobs — rc 0, both outputs byte-identical to
  the live files, all 70 CR bytes of the config preserved. All eight
  MUST-NOT-CHANGE hashes held, including `lib/workspace/context.ts`
  and `workspaceMembers.ts`, proving the workspace-role adaptation
  stayed exactly at the bound call-site seam. CanvasClient confirmed
  line-neutral at exactly 8,375 lines; the config at 72. Full census
  confirmed exact: zero `@supabase` imports remain in CanvasClient
  (and a repo-wide UI-tree check, correctly scoped past the config's
  own `app/api/**`/`route.ts`/`excalidraw_fork` ignores, independently
  confirmed zero elsewhere too); `AuthUser` at the five bound sites,
  `AuthSession` at the four bound sites; the `resolveWorkspaceForUser`
  adaptation matched the bound text exactly; the vestigial local
  `supabase` client (import, memo, 26 deps-array mentions) confirmed
  byte-untouched. **The mandatory negative control was independently
  re-run, not assumed from the spec's authoring claim**: the reviewer
  restored the true pre-edit CanvasClient bytes under the new
  (empty-list) config and confirmed `check:boundaries` fails with the
  exact bound signature — one `no-restricted-imports` error at line
  75:1, nonzero exit — then restored the live bytes, re-confirmed the
  exact final hash, and re-confirmed a clean run. The diffstat was
  independently confirmed tiny and tightly scoped (9 insertions, 10
  deletions across two files) — no size, realtime, presence, or
  P3-swallow work bundled. Unit 252/28 (unchanged),
  `playwright test --list` 27/18, tsc clean, **boundaries clean with
  the entire `components/**` + `app/**` tree linted and zero
  exceptions** — independently re-run, not merely trusted — e2e
  27/27 on the reviewer's own warmed server including board-lifecycle
  (confirming zero runtime effect from the auth/session type swap),
  port gate independently confirmed 0 listeners before and after,
  `npm run verify` green after a clean `.next`. **Zero disclosed
  defects of any kind.** Twenty-ninth consecutive fully clean review
  of the implementation. The architecture program continues:
  CanvasClient's vestigial client cleanup, both components' size
  problems, realtime/presence design, and the owner-gated P3 swallow
  family remain open, exactly as the spec disclosed. No PATCH-062
  drafted, per instruction.
- **2026-07-13** — PATCH-061 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K mechanics: type de-casts plus one bound
  call-site adaptation, zero new code). The owner directed a census of
  what still requires CanvasClient's grandfather entry, with authoring
  authorized only if the census proved a single small mechanical
  closeout sufficient. It did, decisively: the last violation in the
  entire program is ONE import line (L75 `{ User, Session }`) whose
  types are a fossil — every value flowing into them arrives from the
  domain infra already typed (`AuthUser`/`AuthSession` out of
  authState.ts), and CanvasClient DOWN-casts them back into supabase
  types at six sites to satisfy its old state annotations. `session`
  is never passed anywhere and never has a field read (truthiness
  only); all three `user={user}` receivers already take
  `AuthUser | null` after PATCH-010/060. Two census surprises worth
  the log: (1) CanvasClient's local `supabase` client is VESTIGIAL —
  zero call sites remain anywhere in its 8,375 lines; it survives only
  as 26 inert deps-array mentions of an identity-stable memo
  (disclosed, kept, its own future cleanup patch); (2) the authoring
  simulation's tsc run FOUND a real coupling the grep census could
  not: `resolveWorkspaceForUser(user)` flows into
  `lib/workspace/context.ts`'s `Pick<User,'id'|'email'>` param, which
  rejects AuthUser's nullable email. Ruled a call-site adaptation
  (`{ id: user.id, email: user.email ?? undefined }`) over widening
  the 14-caller shared helper; behavior-identity proven by reading
  every email use in that helper (all null-tolerant), and the site is
  guarded by `if (!user?.id) return`. The full recipe was simulated
  end to end BEFORE binding: tsc clean, `check:boundaries` clean with
  the grandfather list EMPTY — meaning the entire components/** +
  app/** tree was linted with zero exceptions and passed — vitest
  252/28, and the negative control (the old CanvasClient under the
  new config fails with exactly one `no-restricted-imports` error at
  75:1). Bindings: CanvasClient `f3583e9`→
  `43e8cd40717ef8d69d3b142bdb677294e0216655` (LINE-NEUTRAL 8,375),
  config raw `1d82f89`→`69a6a03d2c49bb65e67791620c54bd5dc79164f0`
  (73→72, list EMPTY); ten pairs, twenty fences, byte-round-trip
  verified; extractor sandbox rc 0 byte-identical; mixed-EOL
  `--no-filters` discipline carried from PATCH-060. If this lands and
  passes review, the PATCH-002 boundary-freeze program CLOSES at the
  gate level — grandfather 1→0 — while the architecture program
  (vestigial client, the two size problems, realtime/presence, the
  owner-gated swallow family) explicitly continues. No PATCH-062
  drafted.
- **2026-07-13** — PATCH-060 landed and reviewed: **PASSED** (commit
  `b08e79b`; independently re-derived against the LIVE on-disk spec at
  its authoritative commit `25d275f`, not the implementer's report —
  and, since the reviewer also authored this spec, reviewed without
  deference to that authorship). **FreeformPadletCards' boundary
  violation is retired — its grandfather entry no longer exists.**
  Both final raw hashes matched exactly at the commit and the live
  tree, using `--no-filters` throughout for the mixed-EOL config
  (never the plain filtered hash); scope confirmed as exactly two
  paths with the bound commit message exact; all 10 TS fences present
  including the three empty deletion fences. Both files' TRUE
  pre-edit blobs at the parent `b08e79b^` matched the spec's
  bindings, and applying all five bound pairs rebuilt both bound
  final hashes exactly AND byte-matched the live files, with all 70
  CR bytes of the config independently confirmed preserved. The
  binary-safe extractor was re-executed independently in an isolated
  git-backed sandbox seeded at the true pre-edit blobs — rc 0, both
  outputs byte-identical to the live files. All eight MUST-NOT-CHANGE
  hashes held. The implementation diff was confirmed exactly four
  hunks in the component and one single-line deletion in the config —
  nothing else touched in either file. **The mandatory negative
  control was independently re-run, not assumed from the spec's
  authoring claim**: the reviewer restored the true pre-edit
  component bytes under the new config and confirmed
  `npm run check:boundaries` fails with the exact bound signature —
  one `no-restricted-imports` error at line 6:1, nonzero exit code —
  then restored the live bytes, re-confirmed the exact final hash,
  and re-confirmed a clean boundaries run. Full census confirmed
  exact: the component's entire `@supabase`/`supabaseBrowser`/local-
  client surface reaches zero, `AuthUser` appears at exactly the two
  bound positions, and the config's grandfather list now contains
  only `CanvasClient.tsx`. Grandfather independently recounted at
  exactly one entry by direct read of the live config file — no full
  program closeout claimed, consistent with that count. The
  component's 6,351-line size problem was confirmed untouched and
  still on the books. Unit 252/28 (unchanged),
  `playwright test --list` 27/18, tsc clean (independently confirming
  the `AuthUser` assignability compiles), boundaries clean — the
  component is LINTED for the first time in this program's history —
  e2e 27/27 on the reviewer's own warmed server including
  board-lifecycle (confirming the type swap has zero runtime effect),
  port gate independently confirmed 0 listeners before and after,
  `npm run verify` green after a clean `.next`. **Zero disclosed
  defects of any kind.** Twenty-eighth consecutive fully clean review
  of the implementation. One grandfather entry remains
  (`CanvasClient.tsx`), independent and proven so; its retirement is
  a separate future program. No PATCH-061 drafted, per instruction.
- **2026-07-13** — PATCH-060 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K mechanics: deletions plus one established
  type swap, zero new code). The FreeformPadletCards closeout: its
  grandfather entry retires, 2→1 — explicitly NOT the full program
  closeout, since CanvasClient's entry was proven independent by
  direct read (live `{ User, Session }` value imports from
  `@supabase/supabase-js` at its L75) and must remain. The fresh
  census showed everything left is mechanical: the flagged `@supabase`
  TYPE import swaps to the domain `AuthUser` (the PATCH-010 pattern,
  with caller assignability already proven in production via
  CanvasModals receiving the same object), and the orphaned
  `supabaseBrowser` import plus comment+client delete outright (zero
  code uses since PATCH-059). Two authoring findings worth the log:
  (1) the **negative control** — because the config's own comments
  warn that ignore-glob mistakes silently skip files, the retirement
  was proven by linting the OLD component under the NEW config and
  getting exactly one `no-restricted-imports` error at 6:1, then the
  NEW component passing clean; the spec makes re-running this control
  mandatory at review ("a green gate that cannot fail is not a
  gate"); (2) the **mixed-EOL instrument trap** —
  `eslint.boundaries.config.mjs` is `i/mixed` (70 CR bytes, but the
  grandfather block itself is LF-only), so plain `git hash-object`
  (clean-filtered) reports a different hash than the raw bytes; the
  spec binds `--no-filters` hashes for the config, quotes the
  filtered pair explicitly to prevent instrument-mixing, and the
  extractor handles the config in binary with CR bytes preserved
  exactly (verified byte-identical in the authoring sandbox).
  Bindings: component `c6e3b79`→`3cfda55254a927014a277f5a0af35979c3c33da2`
  (6,355→6,351), config raw `e369139`→`1d82f8937894e07f95cccacdda850b71515a6e99`
  (74→73); `@supabase` in the component 1→0; five pairs, ten fences
  (three empty deletion fences), byte-round-trip verified; extractor
  sandbox rc 0; CTO simulation ran tsc (the AuthUser assignability
  compiles), boundaries with the component LINTED for the first time
  (clean), vitest 252/28, AND the negative control, then restored
  byte-exact. The component's SIZE problem (6.3k lines) is untouched
  and stays on the books — this closeout retires the boundary
  violation only. No PATCH-061 drafted.
- **2026-07-13** — PATCH-059 landed and reviewed: **PASSED** (commit
  `fe78d45`; independently re-derived against the LIVE on-disk spec at
  its authoritative commit `5da7523`, not the implementer's report —
  and, since the reviewer also authored this spec, reviewed without
  deference to that authorship). **AI-card resize persists for the
  first time in the product's history.** Both final hashes matched
  exactly at the commit and the live tree; scope confirmed as exactly
  two paths with the bound commit message exact; all 8 TS fences
  present. Both files' TRUE pre-edit blobs at the parent `fe78d45^`
  matched the spec's bindings, and applying all four bound pairs (3
  component + 1 test) rebuilt both bound final hashes exactly AND
  byte-matched the live files. The 8-fence two-file byte-safe
  extractor was re-executed independently in an isolated git-backed
  sandbox seeded at the true pre-edit blobs — rc 0, both outputs
  byte-identical to the live files. All eight MUST-NOT-CHANGE hashes
  held, including `command.ts` — the file the whole no-rejection
  proof rests on. The implementation diff was confirmed exactly three
  hunks in the component and one in the test file. The launcher was
  confirmed by direct read to have a SYNCHRONOUS signature (no `async`
  on the outer callback) wrapping a `void`'d async IIFE, so neither
  call site could be awaiting it — confirmed by the absence of an
  `await` keyword at either site. The IIFE was confirmed awaiting the
  existing `canvas.updatePostFields` command with no new imports
  added. Exact payload confirmed at both sites
  (`{ width, height, updated_at }`). Failure behavior confirmed by
  direct read: the exact message, the exact
  `result.error.cause ?? result.error` object, no rollback, no toast,
  no fetchData, no rethrow anywhere. **The no-unhandled-rejection
  proof was independently re-verified rather than trusted from the
  spec's prose**: reading `command.ts` directly confirmed
  `defineCommand`'s `run` returns a resolved `err(...)` Result on a
  validation failure and wraps `execute` in try/catch converting any
  thrown exception into another resolved Result — the awaited
  command's promise can never reject. State-update ordering confirmed
  at both sites: `setPadlets` during the drag, the launch as the
  unconditional final statement, the pointer site's ref-clear still
  preceding the launch. Both existing helpers confirmed untouched by
  hash and confirmed not referenced by the new code. The new unit
  test confirmed pinning the exact payload shape (same reference,
  ordered keys). The raw-write census confirmed reaching exactly zero.
  The local `supabase` client confirmed still present, deliberately
  orphaned and left for a separate closeout patch — not removed here.
  Grandfather held at 2. Unit **252/28** (the new test counted and
  passing), `playwright test --list` 27/18, tsc clean, boundaries
  clean, e2e 27/27 on the reviewer's own warmed server (all five
  routes warmed first), port gate independently confirmed 0 listeners
  before and after, `npm run verify` green after a clean `.next`.
  **Zero disclosed defects of any kind.** Twenty-seventh consecutive
  fully clean review of the implementation. No closeout claimed — the
  local client and grandfather entry remain exactly as bound, pending
  a separate owner-gated closeout patch. No PATCH-060 drafted, per
  instruction.
- **2026-07-13** — PATCH-059 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K mechanics around an owner-authorized
  behavior change). The owner ruled PATCH-058 Option A: AI-card
  resize must persist; losing the resize on the next fetch is not
  acceptable. The spec is framed as what it is — a P3 BEHAVIOR FIX,
  not a behavior-preserving refactor — with the change disclosed up
  front: both callbacks launch a real write through the existing
  `canvas.updatePostFields`, so sizes save for the first time in the
  product's history (new network traffic and new persisted data on a
  path that never had either). Design: one component-local launcher
  `persistPostFieldsBestEffort` with a synchronous signature wrapping
  a `void`'d async IIFE — the pointer/resize path is never blocked,
  and no unhandled rejection is possible BY PROOF (defineCommand
  converts validation failures and thrown exceptions into Results, so
  the awaited command never rejects; command.ts joins the
  MUST-NOT-CHANGE set because the proof rests on it). The failure
  behavior is ruled deliberately: console.error only — no rollback
  (the optimistic size stays; snapping the card back would be a NEW
  product behavior), no toast, no fetchData; on failure the pre-fix
  behavior simply resumes, making the fix strictly additive. §5
  explicitly forbids reusing either existing helper at these sites —
  both rethrow 'unknown' failures, which inside a void'd launch would
  CREATE exactly the unhandled rejection the spec forbids (the same
  wrong-contract trap PATCH-056 documented, in the opposite
  direction). Ordering bound: state updates during the drag precede
  the launch; the launch is the final statement; the pointer site's
  ref-clear stays before it. Tests: one new unit test pins the exact
  resize payload shape (`{ width, height, updated_at }` verbatim,
  same reference, key order) — suite 251→252; the spec DISCLOSES that
  component-level invocation has no automated net (no
  component-render infrastructure; the e2e characterization suite
  cannot create ai-component cards) and binds review-by-direct-read
  of both call sites instead. Two-file scope: the component
  (6,336→6,355) and posts.test.ts (1,391→1,408; leaves
  MUST-NOT-CHANGE for this patch only). The orphaned local client is
  deliberately KEPT — closeout (client + import removal, grandfather
  2→1) is a separate owner-gated patch. The raw-write census reaches
  ZERO but no closeout is claimed. The 8-fence two-file byte-safe
  extractor was sandbox-executed at authoring — rc 0, both output
  hashes exact and byte-identical to the gate-simulated finals; the
  CTO simulation ran tsc/boundaries/vitest with the edits applied
  (252/28, the new test passing) and restored byte-exact. No
  PATCH-060 drafted.
- **2026-07-13** — PATCH-058 ISSUED: **ARCHITECTURE RULING, owner
  decision required — no implementation authorized.** The endgame
  investigation of the two remaining AI-resize builders produced a
  surprise root cause that reshapes the question entirely: **both
  statements are inert and always have been.** The installed
  `@supabase/postgrest-js` (supabase-js 2.93.1) is a lazy thenable —
  its network call is issued inside `then()` (read directly at
  `dist/index.cjs` line 80), so a bare, never-awaited builder
  statement never sends a request. This was then proven empirically
  against the installed package with an instrumented-fetch probe: 0
  fetch calls 1500ms after executing the exact bare statement shape, 1
  call after awaiting the same builder. Every bound semantics question
  collapses accordingly: nothing executes, nothing is observed, no
  resolved error or rejection can occur, no catch is reachable, no
  unmount hazard exists — and the visible resize is purely local
  `setPadlets` state. **Product consequence (P3): AI-card resizes have
  never been persisted** — no other repository/hook/CanvasClient path
  writes width/height, so every resize silently reverts on the next
  fetch. A data-loss defect disguised as a save statement, undiscovered
  through five patches of deferrals whose language ("porting would
  change execution semantics") was correct but understated: there are
  no execution semantics. The ruling: NO behavior-preserving port
  exists — an un-awaited command call would fire a request that never
  existed (behavior change plus a brand-new failure surface), awaiting
  would block the pointer path, and deletion is the null port but
  entrenches non-persistence, which is a product decision. The two
  statements, the local client (these are its only remaining uses),
  and the grandfather entry are FROZEN at hash `7e8c3c2` pending the
  owner's choice: Option A (CTO recommendation, per P3 — never lose
  user work) authorizes the persistence FIX as a disclosed behavior
  change with its own failure-channel ruling; Option B authorizes
  deleting the inert statements, observably behavior-preserving but
  permanently entrenching the defect. Deferring the decision is also
  safe — inert code cannot fail, block, or leak. LESSONS_LEARNED
  entry added: "An un-awaited Supabase builder is not a fire-and-forget
  write — it is no write at all"; reusable rule: prove whether a
  'fire-and-forget' call ever executes (installed-source read +
  instrumented probe) before writing a preservation spec — a census of
  builder expressions counts intents, not requests. No closeout
  claimed (2 raw statements and a live client remain; census frozen).
  No PATCH-059 drafted, per instruction.
- **2026-07-13** — PATCH-057 landed and reviewed: **PASSED** (commit
  `56865a9`; independently re-derived against the LIVE on-disk spec at
  its authoritative commit `db36f1b`, not the implementer's report —
  and, since the reviewer also authored this spec, reviewed without
  deference to that authorship). The ordered container-drop cascade is
  retired, and with it the component's LAST awaited raw builder — bare
  `await supabase` is now EXTINCT in FreeformPadletCards, confirmed by
  direct read, not merely by count. The final hash matched exactly at
  the commit and the live tree; scope confirmed as exactly one path
  with the bound commit message exact; both TS fences present. The
  TRUE pre-edit blob at the parent `56865a9^` matched the spec's
  binding, and applying the one bound pair rebuilt the bound final
  hash exactly AND byte-matched the live file. The 2-fence byte-safe
  extractor was re-executed independently in an isolated git-backed
  sandbox seeded at the true pre-edit blob — rc 0, output hash exact,
  byte-identical to the live file. All eight MUST-NOT-CHANGE hashes
  held. The implementation diff was confirmed a SINGLE hunk spanning
  both writes and the intermediate lookup, so the ordering itself is
  byte-preserved: container write → `droppedPadlet` lookup → child
  write → `fetchData()`, all sequential, no `Promise.all`, no merge,
  no batching. The existing PATCH-053 helper was confirmed by direct
  read to rethrow only when `result.error.code === 'unknown'`,
  otherwise returning the unread Result — and the reviewer
  independently re-verified this reproduces all FOUR legacy channels
  exactly rather than trusting the spec's derivation: a resolved
  error on write 1 still falls through to the lookup, write 2, and
  `fetchData()` (the pre-existing partial-failure honesty gap
  preserved, not fixed); a rejected write 1 still stops at the
  byte-kept catch before write 2 ever runs; a resolved error on write
  2 still lets `fetchData()` run (the mirror gap); a rejected write 2
  still lands in the same catch with its exact message. No rollback,
  toast, state update, or new intermediate error handling was
  confirmed added anywhere. Full census exact: `.from('padlets')`
  4→2, bare `await supabase` 2→0, helper paren-instrument 17→19, both
  `.eq(...)` instruments 1→0, `fetchData();` held at 18, lines
  6,342→6,336. The two surviving raw sites were confirmed by direct
  read to be exactly the two un-awaited AI-resize builders, unchanged.
  Grandfather held at 2. Unit 251/28 (unchanged),
  `playwright test --list` 27/18, tsc clean, boundaries clean, e2e
  27/27 on the reviewer's own warmed server (all five routes warmed
  first), port gate independently confirmed 0 listeners before and
  after, `npm run verify` green after a clean `.next`. **Zero
  disclosed defects of any kind.** Twenty-sixth consecutive fully
  clean review of the implementation — the fifth in a row with zero
  defects of any category. This slice retires the component's last
  awaited raw builders; only the two deliberately-deferred un-awaited
  AI-resize builders remain as direct writes. No closeout claimed. No
  PATCH-058 drafted, per instruction.
- **2026-07-13** — PATCH-057 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K consumer-only slice reusing the existing
  command and the existing PATCH-053 helper at both call sites; zero
  new functions). The owner directed a full partial-failure derivation
  of the cascade before authoring, and the handler was read end to
  end: ordering is container-write → `droppedPadlet` lookup →
  child-write → `fetchData()`, strictly sequential; a RESOLVED error
  on write 1 is never read, so write 2 and `fetchData()` still run
  (the pre-existing partial-failure gap — child gains `parentId`
  while the container never recorded it — is PRESERVED, not fixed); a
  REJECTED write 1 enters the catch and write 2 never runs; a
  resolved error on write 2 is ignored (`fetchData()` still runs, the
  mirror gap); a rejected write 2 enters the catch; no rollback,
  state update, or toast exists anywhere in the handler. Ruling: the
  two writes are ONE inseparable ordered family (one try, one
  handler, one catch), so they retire together — and because each
  write individually carries exactly the PATCH-053 contract, the
  existing channel-preserving helper is reused verbatim. The ordering
  is protected structurally: the single bound fence spans BOTH awaits
  and the intermediate lookup, so any reorder/merge/`Promise.all`
  fails the extractor's own count gate; §5 additionally forbids
  adding error handling between the writes. This slice retires the
  component's LAST awaited raw builders — bare `await supabase` goes
  extinct in the file (2→0), leaving only the two un-awaited
  AI-resize builders as direct writes (4→2). Bindings: pre `7a92a62`,
  post `7e8c3c26ffc8e50308020470568590e969e50982`, lines 6,342→6,336,
  helper paren 17→19, `.eq('id', containerId)`/`.eq('id', droppedId)`
  each 1→0, `fetchData();` held at 18. One pair, count 1; fence
  byte-round-trip verified at assembly; the 2-fence byte-safe
  extractor sandbox-executed at authoring against the true pre-edit
  blob — rc 0, output hash exact and byte-identical to the
  gate-simulated final; CTO simulation ran tsc/boundaries/vitest (all
  green, 251/28 unchanged) then restored byte-exact. AI-resize
  deferral re-affirmed; no closeout authorized or implied — the
  endgame (the two fire-and-forget builders) needs its own behavior
  ruling. One implementation path, one seam. No PATCH-058 drafted.
- **2026-07-13** — PATCH-056 landed and reviewed: **PASSED** (commit
  `91b95c3`; independently re-derived against the LIVE on-disk spec at
  its authoritative commit `be0fadb`, not the implementer's report —
  and, since the reviewer also authored this spec, reviewed without
  deference to that authorship). The task toggle is retired: the first
  slice since PATCH-053 needing a brand-new component-local helper,
  because the existing channel-preserving helper is provably the wrong
  contract for a check-and-throw site. The final hash matched exactly
  at the commit and the live tree; scope confirmed as exactly one path
  with the bound commit message exact; all 4 TS fences present. The
  TRUE pre-edit blob at the parent `91b95c3^` matched the spec's
  binding, and applying both bound pairs in order rebuilt the bound
  final hash exactly AND byte-matched the live file. The 4-fence
  byte-safe extractor was re-executed independently in an isolated
  git-backed sandbox seeded at the true pre-edit blob — rc 0, output
  hash exact, byte-identical to the live file. All eight
  MUST-NOT-CHANGE hashes held. The implementation diff was confirmed
  exactly two hunks — the new helper's insertion and the call-site
  swap — the task toggle alone changed. The new helper was confirmed
  by direct read to rethrow `result.error.cause ?? result.error` on
  ANY `!result.ok`, with no code discrimination. Critically, the
  identity claim behind the whole slice was independently re-verified,
  not merely trusted from the spec's prose: reading
  `postsRepository.ts`'s `updateFieldsById` directly confirmed a
  resolved error is mapped into
  `domainError('unavailable', ..., { cause: error })`, proving the
  helper's rethrown cause IS the identical raw error object the legacy
  `if (error) throw error` site threw. Full census confirmed exact:
  `const { error } = await supabase` 1→0, `updatePostFieldsOrThrow(`
  0→1, `updatePostFieldsPreservingFailureChannels(` held at 17,
  `fetchData();` held at 18, lines 6,332→6,342. The byte-kept payload,
  the byte-kept success line `fetchData(); // Refresh to get updated
  data` (comment included), and the byte-kept catch message
  `'Failed to toggle task:'` were all confirmed by direct read — so a
  resolved database error still throws into the same catch and still
  skips `fetchData()`, and a rejected builder still lands in the same
  catch. Both container-drop cascade writes and both un-awaited
  AI-resize builders were confirmed untouched by direct read.
  Grandfather held at 2. Unit 251/28 (unchanged),
  `playwright test --list` 27/18, tsc clean, boundaries clean, e2e
  27/27 on the reviewer's own warmed server (all five routes warmed
  first), port gate independently confirmed 0 listeners before and
  after, `npm run verify` green after a clean `.next`. **Zero
  disclosed defects of any kind.** Twenty-fifth consecutive fully
  clean review of the implementation — the fourth in a row with zero
  defects of any category. Only 4 direct writes remain in
  FreeformPadletCards: the ordered cascade pair and the two
  deliberately-deferred AI-resize builders. No PATCH-057 drafted, per
  instruction.
- **2026-07-13** — PATCH-056 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K consumer-only slice; existing command +
  ONE bound component-local helper, zero new imports). All five
  remaining direct sites were re-read in full context before ruling.
  The task toggle goes next, alone: it is fully self-contained (a
  checkbox `onChange` ~150 lines from the cascade handler, zero
  shared state), so no coupling forces a larger slice. The key ruling
  is negative: the existing PATCH-053 channel-preserving helper is
  the WRONG contract for this site and its use is explicitly
  forbidden in §5 — the task toggle is check-and-throw
  (`if (error) throw error` at the site), meaning a resolved database
  error historically THREW into the catch and skipped `fetchData()`,
  whereas the channel-preserving helper would swallow it and continue.
  Same command, same table, opposite resolved-error semantics — the
  contract is read at the site, never inferred from the family's
  neighbors. ONE new component-local helper `updatePostFieldsOrThrow`
  carries the established OrThrow port (any `!result.ok` rethrows
  `cause ?? error`), and thrown-error IDENTITY was proven by direct
  read of the repository (a resolved Supabase error becomes
  `domainError('unavailable', ..., { cause: error })`, so the rethrown
  cause IS the byte-same raw error object the legacy site threw). The
  helper deliberately reuses the hook's PATCH-052 name — same
  contract, same name, different file-local function, nothing
  imported; the collision gate is file-scoped and reads 0 pre-edit.
  The payload (the component's only `content`-writing update:
  `JSON.stringify(updatedTasks)` + metadata + updated_at) is byte-kept
  through the command's verbatim pass-through. Bindings: pre
  `e0f6920`, post `7a92a629fd4ec34d957e40ee0a518b0e5a1f9cbe`, lines
  6,332→6,342 (+10), direct updates 5→4,
  `const { error } = await supabase` 1→0, OrThrow paren 0→1,
  PreservingFailureChannels held at 17, `fetchData();` held at 18.
  Two pairs, counts (1,1); §2 fences byte-round-trip verified at
  assembly; the 4-fence byte-safe extractor sandbox-executed at
  authoring against the true pre-edit blob — rc 0, output hash exact
  and byte-identical to the gate-simulated final; CTO simulation ran
  tsc/boundaries/vitest (all green, 251/28 unchanged) then restored
  byte-exact. Cascade and AI-resize deferrals re-affirmed. One
  implementation path, one seam. No PATCH-057 drafted; no closeout —
  4 direct writes will remain.
- **2026-07-13** — PATCH-055 landed and reviewed: **PASSED** (commit
  `baf8a78`; independently re-derived against the LIVE on-disk spec at
  its authoritative commit `5c826ad`, not the implementer's report —
  and, since the reviewer also authored this spec, reviewed without
  deference to that authorship). The largest single reduction of
  FreeformPadletCards' direct-write count so far: 12 uniform
  style/caption writes retired in one patch, direct updates 17→5,
  reusing the PATCH-053 helper verbatim with zero new functions. The
  final hash matched exactly at the commit and the live tree; scope
  confirmed as exactly one path with the bound commit message exact;
  all 22 TS fences present. The TRUE pre-edit blob at the parent
  `baf8a78^` matched the spec's binding, and applying all 11 bound
  pairs in order — independently re-confirming pair 9 occurs EXACTLY
  TWICE in the true blob, not just trusting the spec's claim — rebuilt
  the bound final hash exactly AND byte-matched the live file. The
  22-fence byte-safe extractor was re-executed independently in an
  isolated git-backed sandbox seeded at the true pre-edit blob — rc 0,
  output hash exact, byte-identical to the live file. All eight
  MUST-NOT-CHANGE hashes held. All 12 style/caption sites were
  confirmed migrated via the post-edit census, and all six distinct
  catch messages were independently confirmed remaining at exactly two
  sites each. Reading the diff hunk-by-hunk confirmed the exact same
  ordering preserved at every migrated site: helper call, unread
  Result, `fetchData();`, then the byte-kept catch with its unchanged
  message — so a resolved database error still gets silently ignored
  (falls through to `fetchData()`) and a rejected builder still enters
  the existing catch. The five surviving raw sites were confirmed by
  direct read at their exact predicted post-edit lines AND by
  identity, not merely by count: AI-resize builder 1 (L3264, still
  un-awaited), the task toggle (L3425, still check-and-throw, still
  writing `content`+`metadata` together), both cascade writes
  (L3587/3595, still two ordered awaits in one try), and AI-resize
  builder 2 (L3680, still un-awaited). Full census exact: lines
  6,368→6,332, `fetchData();` unchanged at 18. Grandfather held at 2.
  Unit 251/28 (unchanged), `playwright test --list` 27/18, tsc clean,
  boundaries clean, e2e 27/27 on the reviewer's own warmed server (all
  five routes warmed first), port gate independently confirmed 0
  listeners before and after, `npm run verify` green after a clean
  `.next`. **Zero disclosed defects of any kind.** Twenty-fourth
  consecutive fully clean review of the implementation — the third in
  a row with zero defects of any category. Only 5 direct writes remain
  in FreeformPadletCards: the task toggle, the cascade pair, and the
  two deliberately-deferred AI-resize builders — no closeout claimed.
  No PATCH-056 drafted, per instruction.
- **2026-07-13** — PATCH-055 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K consumer-only slice reusing the existing
  command and the existing PATCH-053 component-local helper; zero new
  functions). The owner directed: regenerate the census and verify
  whether the 12 style/caption writes are truly ONE uniform
  failure-contract family before authoring. They are — verified
  programmatically, not assumed: every one of the 12 sites was read
  byte-by-byte and confirmed to share the exact shape (`try {`
  immediately followed by the bare-awaited builder with resolved
  `{ error }` never read, `fetchData();` as the only other statement
  in the try, a single-`console.error` catch with a site-specific
  message). That is the PATCH-053/054 contract, so the helper is
  reused verbatim. One byte-level discovery shaped the recipe: the
  toolbar `onCaptionTextColor` and `onSelectColor` blocks are
  BYTE-IDENTICAL, so the recipe is 11 distinct pairs with pair 9
  applying exactly twice (12 call sites) — the PATCH-053 pair-3
  count-2 precedent, discovered by comparison rather than stumbled
  into by a count-mismatch STOP at implementation time. All §2 fences
  were GENERATED programmatically from the live file bytes rather
  than hand-transcribed, eliminating transcription risk across 22
  fences. Bindings: pre `8c77620`, post
  `e0f6920c37bf48c71884c7c481dc16d2027094da`, lines 6,368→6,332
  (−36), direct updates 17→5 (the largest single reduction of the
  component's strangling), awaited builders 14→2, helper
  paren-instrument 5→17, all six distinct catch messages 2→2 each,
  `fetchData();` 18→18. §4 enumerates the five survivors by exact
  post-edit line (task toggle 3425, cascade 3587/3595, AI-resize
  3264/3680) with an "anything else surviving means STOP" gate.
  Deferrals re-affirmed for the task toggle (check-and-throw, writes
  `content`+`metadata`), the ordered cascade pair, and both AI-resize
  builders (execution semantics). The 22-fence byte-safe extractor
  (asserts working copy AND `git show HEAD:path`) was sandbox-executed
  at authoring against the true pre-edit blob — rc 0, output hash
  exact and byte-identical to the gate-simulated final; the CTO
  simulation ran tsc/boundaries/vitest (all green, 251/28 unchanged)
  on the applied edit and restored the tree byte-exact. One
  implementation path, one seam. No PATCH-056 drafted (no split
  necessary); no closeout — 5 direct writes will remain.
- **2026-07-13** — PATCH-054 landed and reviewed: **PASSED** (commit
  `d7f57ff`; independently re-derived against the LIVE on-disk spec at
  its authoritative commit `6c21488`, not the implementer's report —
  and reviewed without deference to the spec's CTO authorship). The
  smallest patch in the project's history: one replacement pair, zero
  new functions, reusing the PATCH-053 component-local helper verbatim.
  The final hash matched exactly at the commit and the live tree; scope
  confirmed as exactly one path with the bound commit message exact.
  Both TS fences present; the TRUE pre-edit blob at the parent
  `d7f57ff^` matched the spec's binding, the single OLD occurred
  exactly once in that TRUE blob, and applying the one bound pair
  rebuilt the bound final hash exactly AND byte-matched the live file.
  The bound byte-safe extractor was re-executed independently in an
  isolated git-backed sandbox seeded at the true pre-edit blob — rc 0,
  output hash exact, byte-identical to the live file. All eight
  MUST-NOT-CHANGE hashes held, including CanvasModals — the spec's
  insurance against confusing this bare-await site with CanvasModals'
  same-named check-and-throw `onUpdateChildComments` receiver — which
  was confirmed byte-untouched. The handler was confirmed by direct
  read: optimistic `setPadlets` still runs BEFORE persistence, early
  returns byte-kept, the helper's returned Result is unread, the catch
  is byte-kept with both exact messages, and there is still no
  `fetchData()` anywhere in the handler — so a resolved database error
  still silently leaves the optimistic state in place (the preserved
  pre-existing honesty gap) while a rejected builder still enters the
  existing catch via the helper's `'unknown'` rethrow. The
  implementation diff was confirmed a SINGLE hunk: the task toggle
  (still check-and-throw), the container-drop cascade (both ordered
  awaits), all 12 style/caption writes, and both un-awaited AI-resize
  builders (now at lines 3282/3698) confirmed untouched; the local
  `supabase` client remains. Full census exact: direct updates 18→17,
  awaited builders 15→14, helper paren-instrument 4→5,
  `.eq('id', childId)` 1→0, lines 6,371→6,368, LF held. Grandfather
  held at 2. Unit 251/28 (unchanged), `playwright test --list` 27/18,
  tsc clean, boundaries clean, e2e 27/27 on the reviewer's own warmed
  server (all five routes warmed first per the operational note), port
  gate independently confirmed 0 listeners before and after,
  `npm run verify` green after a clean `.next`. **Zero disclosed
  defects of any kind.** Twenty-third consecutive fully clean review
  of the implementation. The comment family is retired; 17 direct
  writes remain in FreeformPadletCards (12 style/caption, 1 task
  toggle, 1 cascade pair, 2 deferred AI-resize). No PATCH-055 drafted,
  per instruction.
- **2026-07-13** — PATCH-054 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K consumer-only slice reusing an existing
  command AND an existing component-local helper; zero new functions).
  The owner directed: regenerate the live census, classify all 18
  remaining FreeformPadletCards direct writes by actual failure
  contract / ordering / UI behavior, and pick the smallest coherent
  next family. Fresh census (all 18 sites read with full context):
  12 uniform bare-await style/caption writes (10 mirrored toolbar-style
  callbacks at both the image-card and full-image-toolbar locations +
  2 caption commits), 1 check-and-throw task checkbox toggle (the only
  site writing `content` + `metadata` together), 1 two-write ORDERED
  container-drop cascade in a single try, 1 optimistic child-comments
  write, and the 2 deliberately-deferred un-awaited AI-resize builders.
  **The comment family is a single site and goes next.** Its contract,
  read directly at the site: optimistic `setPadlets` before the try,
  bare await with resolved `{ error }` never read, no `fetchData()` in
  the handler — resolved database error historically left optimistic
  state silently in place (pre-existing honesty gap PRESERVED), rejected
  builder entered the existing catch (console.error + toast). That is
  byte-identical to the PATCH-053 image-reaction contract, so the
  PATCH-053 helper is reused verbatim — the patch is ONE replacement
  pair, no new helper, no new import, nothing else. The spec explicitly
  distinguishes this bare-await site from CanvasModals' same-named
  check-and-throw `onUpdateChildComments` receiver (PATCH-052) and adds
  CanvasModals to the MUST-NOT-CHANGE list (eight hashes) as insurance
  against exactly that same-name confusion. AI-resize deferral
  re-affirmed; the task toggle and the cascade are each ruled their own
  future slice; the 12 uniform writes are NOT folded in merely because
  the helper fits. Bindings: pre `7a9fef7`, post
  `8c7762092fb8d11f2e125a428647621b604a48a0`, 6,371→6,368 lines,
  direct updates 18→17, awaited builders 15→14, helper paren-instrument
  4→5, `.eq('id', childId)` 1→0. The 2-fence byte-safe extractor
  (asserts working copy AND `git show HEAD:path`) was sandbox-executed
  at authoring against the true pre-edit blob — rc 0, output hash
  exact; the CTO simulation ran tsc/boundaries/vitest (all green,
  251/28 unchanged) on the applied edit and then restored the tree
  byte-exact. One implementation path, one seam. No PATCH-055 drafted
  (no split necessary); no closeout — 17 direct writes will remain.
- **2026-07-13** — PATCH-053 landed and reviewed: **PASSED** (commit
  `17ccd26`; independently re-derived against the LIVE on-disk spec,
  including its amendment at `63c9f8f`, not the implementer's report).
  This opens the FreeformPadletCards strangler proper: the first of its
  22 direct `.from('padlets').update(...)` sites are retired — the
  complete image-reaction family (picker-add and reaction-remove at
  both the image-card and full-image-toolbar locations), all four now
  routed through `canvas.updatePostFields` via one new local
  channel-preserving helper. The final hash matched exactly at the
  commit and the live tree. Scope confirmed as exactly one path via
  `git show --name-only`. All 10 TS fences were present. The file's
  TRUE pre-edit blob at the parent `17ccd26^` was confirmed matching
  the spec's binding, and reconstructing all five replacement pairs
  (the import pair, the helper pair, and three call-site pairs — one
  of which applies twice) from that TRUE blob rebuilt the bound final
  hash exactly. The bound extractor was re-executed independently in
  an isolated sandbox seeded with a real git repo at the true pre-edit
  blob; its output was `git hash-object`-verified and confirmed
  byte-identical to the live file. All seven MUST-NOT-CHANGE hashes
  held (CanvasClient, both hooks, and all four posts domain/repository/
  test files). The new helper was confirmed by direct read to rethrow
  only when `code==='unknown'`, otherwise returning the Result
  unread — and all four call sites were confirmed by direct read to
  preserve their exact state-update ordering, exact `fetchData()`
  placement, and exact catch messages, with no resolved-Result handling
  added anywhere. Both deliberately-deferred un-awaited AI-resize
  builders (current lines ~3282 and ~3701) were confirmed still
  untouched, and the other 16 direct `padlets` update sites were
  confirmed untouched by census. Full census held exactly: direct
  updates 22→18, awaited `supabase` builders 19→15, helper calls 4 +
  1 definition = 5 total references. Grandfather held at 2. Unit
  251/28 (unchanged — zero new domain/infra surface needed),
  `playwright test --list` 27/18, tsc clean, boundaries clean, e2e
  27/27 on the reviewer's own explicitly-warmed server (warmed `/`,
  `/auth`, `/pricing`, `/dashboard`, and `/dashboard/canvas/test`
  first, per the spec's operational note, avoiding the known cold-
  compile timeout), port gate independently confirmed 0 listeners
  before and after, `npm run verify` green after a clean `.next`.
  **Zero disclosed defects of any kind** — no spec defect, no
  implementation defect, no environmental contamination, no reviewer
  measurement error. This breaks the two-review streak (PATCH-051,
  PATCH-052) of the comment-trap census class, since this spec's own
  gates measured true values directly rather than asserting a
  plain-name grep of 0 against a retired symbol. Twenty-second
  consecutive fully clean review of the implementation. 18 of
  FreeformPadletCards' 22 direct writes remain, across five more
  coherent families plus the two deferred AI-resize builders. No
  PATCH-054 drafted, per instruction.
- **2026-07-12** — PATCH-052 landed and reviewed: **PASSED** (commit
  `ec6d007`; independently re-derived against the LIVE on-disk spec,
  including its byte-safe amendment at `96b1c56`, not the
  implementer's report). This is the last postsRaw export — after
  this patch, `postsRaw.ts` no longer exists on disk. All three final
  hashes matched exactly at the commit AND the live tree, and the
  module's absence was confirmed directly (not just inferred from the
  hash list). Scope confirmed exactly four implementation paths via
  `git show --name-only` on `ec6d007` — three edited files plus the
  deletion. All 28 TS fences were present. All three edited files' TRUE
  pre-edit blobs at the parent `ec6d007^` were confirmed matching the
  spec's bindings, and reconstructing all 14 replacement pairs (3 hook
  + 9 CanvasClient + 2 CanvasModals) from those TRUE blobs rebuilt all
  three bound final hashes exactly — independently confirming
  CanvasClient stayed net-zero at exactly 8,375 lines even though ten
  regions changed (the additions and removals across six bare-await
  swaps, the JSX prop swap, and the map-pin split balanced out
  exactly). The bound byte-safe extractor was re-executed independently
  in an isolated sandbox — this one required an actual git repo seeded
  with the true pre-edit blobs, since the extractor itself asserts
  every file's pre-edit hash against `git show HEAD:path`, not just the
  working copy (the amendment's whole point, closing a working-copy-
  vs-blob divergence risk raised after PATCH-051's review). All three
  outputs were `git hash-object`-verified and `postsRaw.ts` was
  confirmed deleted inside the sandbox too. All sixteen MUST-NOT-CHANGE
  hashes held. All three new hook helpers were read directly and
  confirmed matching their bound contracts exactly: the six bare-await
  CanvasClient sites all route through
  `updatePostFieldsSwallowResolved`, silently ignoring every resolved
  failure and rethrowing only `'unknown'`; the CanvasModals JSX prop
  now supplies `updatePostFieldsOrThrow` while the prop identifier
  itself, both receiver bodies, both catch messages, and both
  rollback/toast actions were confirmed byte-unchanged by direct read;
  the map-pin call site was confirmed to have no enclosing try/catch,
  proving the channel-preserving helper's `'unknown'` rethrow correctly
  reproduces the legacy escape-uncaught path while a resolved failure
  correctly reaches only the local toast+rollback branch. One finding
  surfaced and is logged as a **spec defect, not an implementation
  defect** — the same class disclosed in the PATCH-051 review: the
  live spec's own post-edit gate asserts `rg -n 'postsRaw' ... # 0`,
  but the true count is 2 — both are prose-only comment mentions (the
  spec's own new bound hook comment, and the pre-existing
  MUST-NOT-CHANGE `posts.ts` comment), with zero actual import-path
  references confirmed remaining anywhere. `FreeformPadletCards.tsx`
  was confirmed untouched via its MUST-NOT-CHANGE hash; the
  untouched-file diff gate came back clean; grandfather held at 2.
  Unit 251/28 (unchanged), `playwright test --list` 27/18, tsc clean,
  boundaries clean, e2e 27/27 on the reviewer's own explicitly-warmed
  server per the spec's operational note about the default Playwright
  webServer path (incl. board-lifecycle exercising the extracted
  update paths), the port-3000 gate independently confirmed at 0
  listeners both before and after via both `netstat` and the spec's
  own PowerShell `Get-NetTCPConnection` instrument, LF-only bytes
  confirmed via `git ls-files --eol` for all three edited paths,
  `npm run verify` green. TWENTY-FIRST consecutive fully clean review
  of the implementation, despite the one disclosed spec defect.
  **`postsRaw.ts` — the hooks-phase raw-passthrough module born at
  PATCH-042 — is now fully retired; the module no longer exists.**
  Only `FreeformPadletCards.tsx` remains as unfinished strangler work,
  entirely on its own merits (zero postsRaw coupling, confirmed at
  PATCH-050). No PATCH-053 drafted, per instruction.
- **2026-07-12** — PATCH-051 landed and reviewed: **PASSED** (commit
  `1de1eb7`; independently re-derived against the LIVE on-disk spec,
  including its amendment at `411f96e`, not the implementer's report).
  This spec's authoring and amendment predate this review session's
  visible history (no "author PATCH-051 spec" log entry exists in this
  file prior to now) — the review proceeded strictly against the live
  on-disk spec and current tree, per the standing independent-review
  discipline, regardless of who authored it or when. All three final
  hashes matched exactly at the commit AND the live tree; scope
  confirmed exactly three files via `git show --name-only` on
  `1de1eb7` — the spec itself was committed separately at `411f96e`,
  matching the amendment's explicit-pathspec instruction not to bundle
  the spec artifact into the implementation commit. All 25 TS fences
  were present and individually verified: the whole postsRaw fence was
  byte-compared against the committed file, and all 12 OLD/NEW pairs
  were confirmed absent-then-present against the live files. Both the
  hook's and CanvasClient's TRUE pre-edit blobs at the parent
  `1de1eb7^` were confirmed matching the spec's bindings, and
  reconstructing all 3 hook pairs plus 9 CanvasClient pairs (with pair
  5 correctly occurring twice, matching the two convergent
  empty-container sites) from those TRUE blobs rebuilt both bound
  final hashes exactly, independently confirming the 8,379→8,375 line
  delta. The bound 25-fence extractor was re-executed independently in
  an isolated sandbox against the real pre-edit postsRaw, hook, and
  CanvasClient content; all three outputs were `git hash-object`-
  verified. All seventeen MUST-NOT-CHANGE hashes held. Both new hook
  helpers were read directly and confirmed matching their bound
  contracts exactly: `insertPostOrThrow` rethrows `cause ?? error` on
  any failure (the six standalone check-and-throw sites plus the
  ordered drawing pair, whose container-then-child sequence was
  confirmed preserved); `insertPostPreservingFailureChannels` rethrows
  ONLY when `code === 'unknown'` and otherwise returns the Result
  itself — and both of ITS call sites (the freeform-column create and
  the map-pin create) were confirmed to have no enclosing try/catch,
  so the 'unknown' rethrow correctly reproduces the legacy
  escapes-uncaught behavior while a resolved failure correctly enters
  the byte-kept local rollback branch (padlet filter, selection reset,
  console.error/toast). One finding surfaced during the review and is
  logged as a **spec defect, not an implementation defect**: the live
  spec's own §5 gate asserts the exact-identifier census
  `rg -n '\binsertPostRow\b' ... # 0`, but the bound postsRaw.ts fence
  the spec itself supplies contains the retirement-record prose
  "PATCH-051: insertPostRow retired..." in its own header comment,
  which the word-boundary regex correctly matches — the measured value
  is 1, not 0. The paren-instrument (`insertPostRow(`, the actual
  callable) independently confirmed 0 occurrences repo-wide, proving
  the function itself is genuinely extinct; this is a spec-authoring
  oversight of the same comment-trap class disclosed correctly in
  PATCH-049 and PATCH-050 but missed in this spec's own gate text — no
  behavioral or functional consequence, and not grounds to withhold
  PASS. postsRaw's export count was confirmed at 1 (`updatePostRowById`
  only); `updatePadletById`, `CanvasModals.tsx`, and
  `FreeformPadletCards.tsx` were all confirmed untouched by direct read
  and hash. Full census matched exactly; the untouched-file diff gate
  came back clean; grandfather held at 2. Unit 251/28 (unchanged),
  `playwright test --list` 27/18, tsc clean, boundaries clean, e2e
  27/27 on the reviewer's own warmed server (incl. board-lifecycle
  exercising the extracted insert paths), the port-3000 gate
  independently confirmed at 0 listeners both before and after the
  reviewer's own server run, `npm run verify` green. TWENTIETH
  consecutive fully clean review of the implementation, despite the
  one disclosed spec-documentation defect. postsRaw's third export has
  now died; only `updatePadletById`/`updatePostRowById` remains, and
  its slice must include CanvasModals per the PATCH-050 correction. No
  PATCH-052 drafted, per instruction.
- **2026-07-12** — PATCH-050 landed and reviewed: **PASSED** (commit
  `112d4d9`; independently re-derived against the LIVE on-disk spec,
  not the implementer's report). All three final hashes matched
  exactly at the commit AND the live tree; scope confirmed exactly
  three files via `git show --name-only`. Both whole-file fences were
  byte-compared against the committed files directly. All eight
  CanvasClient replacement pairs were verified individually — each OLD
  text confirmed absent from the live file, each NEW text confirmed
  present exactly once. One reviewer-script false alarm surfaced and
  was fixed mid-review: a naive substring count reported site 4's
  6-space NEW text occurring twice, because that text is literally an
  embedded substring of site 3's 10-space indented line at a different
  location; a line-anchored recount (checking the character preceding
  each match) confirmed both sites landed correctly and distinctly —
  logged as a reviewer measurement mistake, not an implementation
  defect, since the extractor itself hash-asserts the whole-file and
  per-pair content directly and had already passed. CanvasClient's
  TRUE pre-edit blob at the parent `112d4d9^` was confirmed matching
  the spec's binding, and reconstructing all eight pairs in order from
  that TRUE blob rebuilt the bound final hash exactly, independently
  confirming the 8,383→8,379 line delta. The bound three-file
  extractor was re-executed independently in an isolated sandbox
  against two seeded garbage files plus a real pre-edit CanvasClient
  copy; all three outputs were `git hash-object`-verified. All
  seventeen MUST-NOT-CHANGE hashes held, including the newly-disclosed
  `CanvasModals.tsx`. `insertPostRowReturning(` (the paren-instrument)
  was confirmed extinct repo-wide, and `insertPadletAndSelectSingle`
  was confirmed extinct repo-wide, while the two surviving postsRaw
  exports (`insertPostRow`, `updatePostRowById`) were confirmed still
  present by direct read — postsRaw's export count is now 2, down from
  3. The new hook helper was read directly and confirmed matching its
  bound contract exactly: `insertPostAndSelectOrThrow` rethrows
  `result.error.cause ?? result.error` on any failure and returns
  `result.value` — the raw row-or-null — verbatim on success, with the
  `Promise<any>` signature matching the bound any-flow restoration.
  All five CanvasClient call sites were confirmed directly matching
  the bound port: site 1's null-row guard stays at the site with its
  exact legacy message ('Insert returned no data'); sites 2–4 keep
  `if (data)` byte-kept below the swap; site 5 keeps its `data?.id`
  reads and `fetchData()` ordering byte-kept. The command-internal
  swallow family was unaffected (no new swallow — every failure
  throws). `insertPadlet`, `updatePadletById`, and `CanvasModals.tsx`
  were all confirmed untouched by direct read and hash; FreeformPadletCards
  was confirmed untouched via its MUST-NOT-CHANGE hash. Full census
  matched exactly on all 22 bound instruments; the untouched-file diff
  gate came back clean; grandfather held at 2. Unit 251/28 (unchanged,
  zero test changes — the patch needed zero new domain or infra
  surface), `playwright test --list` 27/18, tsc clean, boundaries
  clean, e2e 27/27 on the reviewer's own warmed server (incl.
  board-lifecycle exercising the extracted insert paths), the
  port-3000 gate independently confirmed at 0 listeners both before
  and after the reviewer's own server run, `npm run verify` green.
  Zero disclosure gaps. NINETEENTH consecutive fully clean review of
  the implementation. postsRaw's second export has now died; two raw
  passthroughs remain (`insertPadlet`, `updatePadletById`), the latter
  now correctly understood to route through CanvasModals as well as
  CanvasClient — the 050 census correction stands verified. No
  PATCH-051 drafted, per instruction.
- **2026-07-12** — PATCH-050 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K twenty-fifth application). The owner posed
  a phase question: retire one more raw export family, or formally
  begin the FreeformPadletCards strangler because the remaining raw
  contracts are inseparable from that component boundary? **The fresh
  census disproved the premise before the ruling was needed**: the
  "L5903 JSX prop hand-off → FreeformPadletCards" attribution that has
  ridden along since PATCH-042 is wrong about the component — the live
  JSX element receiving `updatePadletById={updatePadletById}` is
  `<CanvasModals` (opened at CanvasClient L5854), and CanvasModals.tsx
  types the prop, destructures it, and calls it raw at two sites — a
  previously-undisclosed prop-plumbed raw consumer, now hash-bound in
  the MUST-NOT-CHANGE set. FreeformPadletCards contains ZERO
  references to any postsRaw passthrough — it has no postsRaw coupling
  at all. So the ruling: retire the smallest family now
  (`insertPadletAndSelectSingle`, five sites), do NOT begin the
  FreeformPadletCards strangler on a false coupling; FreeformPadletCards
  stays last on its own merits (the 6.4k monolith), and the future
  `updatePadletById` slice must include CanvasModals. The five
  returning-insert sites all share converged failure channels (each
  check-and-throw feeds the same catch a thrown builder rejection
  reaches), so ONE helper — `insertPostAndSelectOrThrow`, rethrowing
  the original cause on any failure and returning the raw row (or
  null) with `Promise<any>` restoring the legacy any-flow (the 043
  precedent) — carries all five with no discrimination guard and no
  behavior authorization; site 1's null-row guard stays at the site
  with its exact legacy message. `insertPostRowReturning` dies —
  postsRaw's second export death (`export function` 3→2, the wire
  shape `insert().select().single()` byte-identical in the
  already-pinned repository method). CanvasClient shrinks 8,383→8,379
  (−4: four sites lose their separate throw line). Zero new domain or
  infra surface; suite stays 251/28; no new tests bound. Seventeen
  MUST-NOT-CHANGE hashes (CanvasModals joins); the three-file bound
  extractor (two whole-file fences + eight CanvasClient replacement
  pairs) sandbox-executed at authoring against seeded garbage plus a
  real pre-edit CanvasClient; the CanvasClient recipe independently
  reconstructed from the live pre-edit file confirming the bound final
  hash and the exact −4 delta. CTO simulation ran the real repo gates
  (tsc clean, boundaries silent, vitest 251/28 unchanged) then
  restored the tree byte-exact. A LESSONS_LEARNED entry records the
  misattribution lesson (verify a JSX prop's receiver by reading the
  live element, never by inherited claim). Three files, one seam, no
  PATCH-051 drafted, per instruction.
- **2026-07-12** — PATCH-049 landed and reviewed: **PASSED** (commit
  `77ba410`; independently re-derived against the LIVE on-disk spec,
  not the implementer's report). All three final hashes matched
  exactly at the commit AND the live tree; scope confirmed exactly
  three files via `git show --name-only`. Both whole-file fences were
  byte-compared against the committed files directly. All five
  CanvasClient replacement pairs were verified individually — each
  OLD text confirmed absent from the live file, each NEW text
  confirmed present exactly once, rather than trusting a single
  whole-file hash to imply every pair landed correctly. CanvasClient's
  TRUE pre-edit blob at the parent `77ba410^` was confirmed matching
  the spec's binding, and reconstructing all five pairs in order from
  that TRUE blob rebuilt the bound final hash exactly, independently
  confirming the 8,384→8,383 line delta — the first shrink below the
  never-grow plateau held at equality since PATCH-045. The bound
  three-file extractor was re-executed independently in an isolated
  sandbox against two seeded garbage files plus a real pre-edit
  CanvasClient copy; all three outputs were `git hash-object`-verified.
  All sixteen MUST-NOT-CHANGE hashes held. `deletePostRowById(` (the
  paren-instrument, distinguishing the real death from the header's
  new comment-only mention of the same plain name) was confirmed
  extinct repo-wide, and `deletePadletByIdRaw` was confirmed extinct
  repo-wide, while the three surviving postsRaw exports
  (`insertPostRow`, `insertPostRowReturning`, `updatePostRowById`) were
  confirmed still present by direct read — postsRaw's consumer set
  is now 3, down from 4. Both new hook helpers were read directly and
  confirmed matching their bound contracts exactly:
  `deletePostSwallowResolved` lets a resolved failure
  (`code !== 'unknown'`) fall through with no throw, silently
  swallowed, while a thrown failure's `code === 'unknown'` rethrows
  its original cause at the same position the legacy bare-await left
  it; `deletePostOrThrow` rethrows the original cause on ANY failure,
  matching the legacy check-and-throw shape where both channels had
  already converged. The command-internal swallow family was
  independently recounted at ELEVEN — unchanged, confirming the two
  new helpers' resolved-swallow stayed call-site class rather than
  being folded into the command-internal family. `insertPadlet`,
  `insertPadletAndSelectSingle`, `updatePadletById`, and the JSX prop
  hand-off at L5902 (`updatePadletById={updatePadletById}`) were all
  confirmed untouched by direct read; FreeformPadletCards was
  confirmed untouched via its MUST-NOT-CHANGE hash. Full census
  matched exactly on all 23 bound instruments; the untouched-file diff
  gate came back clean; grandfather held at 2. Unit 251/28 (unchanged,
  zero test changes — the patch needed zero new domain or infra
  surface), `playwright test --list` 27/18, tsc clean, boundaries
  clean, e2e 27/27 on the reviewer's own warmed server (incl.
  board-lifecycle exercising the extracted delete paths), the
  port-3000 gate independently confirmed at 0 listeners both before
  and after the reviewer's own server run, `npm run verify` green.
  Zero disclosure gaps. EIGHTEENTH consecutive fully clean review of
  the implementation. postsRaw's first export has now actually died;
  three raw passthroughs remain (`insertPadlet`,
  `insertPadletAndSelectSingle`, `updatePadletById`), all deferred to
  the FreeformPadletCards phase along with the JSX prop hand-off. No
  PATCH-050 drafted, per instruction.
- **2026-07-12** — PATCH-049 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K twenty-fourth application). The owner asked
  for a fresh consumer census across the four remaining raw
  passthroughs and the smallest coherent next shrink-down slice.
  **The census picked the slice**: `deletePadletByIdRaw` has exactly
  3 CanvasClient call sites in only 2 distinct legacy contracts and no
  entanglement with the `updatePadletById` JSX prop hand-off deferred
  to the FreeformPadletCards phase — by far the narrowest of the four.
  The other three passthroughs (`insertPadlet`,
  `insertPadletAndSelectSingle`, `updatePadletById`) and the JSX prop
  stay raw, untouched, per the standing 021/042 ruling. Two new hook
  helpers carry the two legacy failure contracts intact:
  `deletePostSwallowResolved` for the compensating child-delete sites
  (a resolved failure stays silently swallowed at the call-site class,
  NOT folded into the command-internal swallow family, which holds at
  eleven; a thrown failure's `code === 'unknown'` rethrows its cause
  at the exact same position the legacy bare-await left it) and
  `deletePostOrThrow` for the map-pin container delete, where both
  legacy channels already converged so any failure rethrows its cause
  — the same 038/040 check-and-throw shape already used elsewhere in
  this program. This is `postsRaw.ts`'s first actual export death
  (`deletePostRowById` retired) — the module's SHRINK-ONLY fence
  finally shrinks, not just holds. CanvasClient drops from 8,384 to
  8,383 lines: the first shrink below the never-grow plateau held at
  equality since PATCH-045, because the map-pin site collapses two
  lines into one. Zero new domain or infra surface was needed —
  `canvas.deletePost` and `SupabasePostsRepository.deleteById` were
  already fully tested at PATCH-028 — so suite stays 251/28 and no new
  tests were bound. Sixteen MUST-NOT-CHANGE hashes; the three-file
  bound extractor (two whole-file fences + five CanvasClient
  replacement pairs) was sandbox-executed at authoring against seeded
  garbage plus a real pre-edit CanvasClient copy, and the CanvasClient
  recipe was independently reconstructed from the live pre-edit file
  hash to confirm the bound final hash and the exact 8,384→8,383 line
  delta. CTO simulation ran the real repo gates (tsc clean, boundaries
  silent, vitest 251/28 unchanged) then restored the tree byte-exact.
  Three files, one seam, no PATCH-050 drafted, per instruction.
- **2026-07-12** — PATCH-048 landed and reviewed: **PASSED** (commit
  `150d664`; independently re-derived against the LIVE on-disk spec,
  not the implementer's report). All five final hashes matched
  exactly at the commit AND the live tree; scope confirmed exactly
  five files via `git show --name-only` (164 insertions / 3
  deletions — `git show --stat`'s path-truncation for the long hook
  path was a reviewer-script display quirk, not a scope defect, fixed
  by switching to `--name-only`). All five whole-file fences were
  byte-compared against the committed files directly. The hook's TRUE
  pre-edit blob at the parent `150d664^` was confirmed matching the
  spec's §1 binding (`3cc658c6...`), and the two-pair recipe
  reconstruction (§8a import line, §8b the drawing-layout region) from
  that TRUE blob rebuilt the bound final hash exactly. The bound
  five-file mechanical extractor was re-executed independently in an
  isolated sandbox against five seeded garbage files; all five outputs
  were `git hash-object`-verified. All fourteen MUST-NOT-CHANGE hashes
  held, headed by `postsRaw.ts` itself confirmed byte-untouched —
  proving no export retired this patch and the four raw passthroughs
  (`insertPadlet`/`insertPadletAndSelectSingle`/`updatePadletById`/
  `deletePadletByIdRaw`) stayed raw exactly as ruled. The
  channel-discrimination guard was confirmed directly in the committed
  hook code: `code === 'unknown'` rethrows the cause into the
  byte-kept `console.error('Failed to update padlet:')` + rollback
  catch; a resolved failure takes the byte-kept silent rollback branch
  — matching the bound 6-test pin set exactly (verbatim same-reference
  + Object.keys no-stamp pin; `'unavailable'` passthrough; thrown →
  `'unknown'` + cause pin; non-object fields → `'validation'` without
  a repository call). The `| object` union absorption was confirmed as
  the only structural change to the repository's client interface,
  with the named payload shapes left intact as documentation. Full
  §9.2 census confirmed exact across all 19 bound instruments incl.
  `updatePostRowById` 3→2 (the `updatePadletById` route untouched),
  `updatePostFields` lowercase 2, `defineCommand` 32. The untouched-file
  diff gate came back clean across postsRaw, CanvasClient,
  FreeformPadletCards, useCanvasLines, useCanvasInteractions,
  canvasViewReads (+ its test), sections (+ its repo), lines (+ its
  repo), `command.ts`, `graphRepo.ts`, and `FreeformGraphLayer.tsx`.
  Grandfather held at 2. Unit 251/28 (6 new tests, no new file —
  posts.test.ts 71→75, postsRepository.test.ts 26→28), `playwright
  test --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the
  reviewer's own warmed server (incl. board-lifecycle exercising the
  extracted drawing-layout update path), the port-3000 gate
  independently confirmed at 0 listeners both before and after the
  reviewer's own server run, `npm run verify` green. Zero disclosure
  gaps. SEVENTEENTH consecutive fully clean review of the
  implementation. The postsRaw consumer set is now 4 (down from 5 at
  authoring) and the module boundary is clean — postsRaw is
  CanvasClient's raw surface only. FreeformPadletCards remains last in
  the hooks phase. No PATCH-049 drafted, per instruction.
- **2026-07-11** — PATCH-048 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K twenty-third application). The owner asked
  for the postsRaw shrink-down analysis with a fresh census and a
  per-consumer approach. **The census reshaped the expectation**: the
  module's five hook delegations split into four PURE PASSTHROUGHS
  (whose raw `{ data, error }` results flow to ~24 CanvasClient call
  sites plus one JSX prop hand-off — retiring those exports IS the
  FreeformPadletCards-phase strangling, not this patch) and ONE
  hook-internal contract, `updateDrawingLayoutPadlet`, whose raw shape
  terminates inside the hook and whose CanvasClient callers receive
  void. **The two rulings**: the passthroughs STAY RAW (021/042
  re-affirmed; postsRaw.ts is hash-bound UNCHANGED — no export retires
  yet, the consumer set shrinks 5→4 and the boundary becomes clean:
  postsRaw = CanvasClient's raw surface only); and the owner-required
  per-consumer translation ruling is AUTHORIZED for
  updateDrawingLayoutPadlet only, because it is NOT a behavior change —
  the resolved channel keeps its byte-kept silent rollback, the thrown
  channel rethrows its original cause through the 045 error-code
  discrimination into the byte-kept console.error + rollback catch,
  and the wire payload stays a VERBATIM unstamped passthrough (the
  legacy statement sent no updated_at; the new
  `canvas.updatePostFields` command adds none — the
  updateMetadataUnstamped precedent generalized, pinned by a
  same-reference + Object.keys test). One disclosed structural cost:
  the repository's update-payload union gains `| object`, which
  absorbs the union for assignability — the named shapes remain as
  documentation, and the simulation's tsc run proves nothing else
  shifted. 6 bound tests (4 domain including the thrown→'unknown'
  channel pin, 2 infra); suite 245/28 → 251/28 with no new file. CTO
  simulation ran the real repo gates on the post-edit tree (tsc clean,
  boundaries silent, vitest 251/28) then restored byte-exact via
  `git cat-file blob`. Spec (3,959 lines) self-verified: all five
  fence hashes + fence==canonical + the hook's two-pair recipe
  reconstruction from the live pre-edit file + all fourteen
  MUST-NOT-CHANGE hashes fresh-measured at splice time (headed by
  postsRaw.ts itself) + the five-file extractor sandbox-executed from
  its own extracted bytes against seeded garbage. No PATCH-049 drafted
  — five files, one seam, no split needed.
- **2026-07-11** — PATCH-047 landed and reviewed: **PASSED** (commit
  `12f30b9`; independently re-derived against the LIVE on-disk spec,
  not GLM's partial review, a cached copy, or the implementer's
  report). Both final hashes matched exactly at the commit AND the
  live tree; scope confirmed exactly two files (9 insertions / 7
  deletions). Both whole-file fences were byte-compared against the
  committed files directly. Pre-edit bases confirmed at the parent
  `3010781`; both recipe reconstructions (the layer's two-pair, the
  graphRepo's one-pair) rebuilt the bound final hashes from the TRUE
  parent blobs — no reviewer-script issues this time. The bound
  two-file extractor was re-executed independently in an isolated
  sandbox against seeded garbage; both outputs were
  `git hash-object`-verified. All eight MUST-NOT-CHANGE hashes held,
  and a direct check confirmed NOTHING changed anywhere under
  `supabase/` — no RLS policy or migration edits accompanied this
  patch, confirming the migration is a pure client-identity
  correction with no access broadening. The legacy `lib/supabase`
  import and the raw `new FreeformGraphRepo` construction were
  confirmed EXTINCT from the layer by direct read; `createFreeform
  GraphRepo(boardId)` is invoked EXACTLY ONCE, with the `useMemo` deps
  array confirmed EXACTLY `[boardId]`. Both the `FreeformGraphRepo`
  class body and the `createFreeformGraphRepo` factory body were
  confirmed byte-untouched by direct read: the `isTableUnavailable`
  state machine, `42P01`/does-not-exist detection, both synthetic
  fallback objects, both console warnings, and every throw-through
  channel are all intact — no Result translation anywhere. postsRaw
  and FreeformPadletCards were confirmed untouched via the
  untouched-file diff gate; census matched exactly on all eleven
  bound instruments; the collision gate showed only the three
  legitimate consumer sites (the factory export, the layer's
  construction, and CanvasClient's pre-existing 046 construction).
  The layer is confirmed at EXACTLY 493 lines — never-grow held at
  equality on the over-400-line component ceiling. Grandfather held
  at 2. Unit 245/28 (unchanged, zero test changes), `playwright test
  --list` 27/18, tsc clean, boundaries clean, e2e 27/27 on the
  reviewer's own warmed server, the port-3000 gate independently
  confirmed at 0 listeners both before and after the reviewer's own
  server run, `npm run verify` green, the extractor script removed,
  and no PATCH-048 anywhere in `patches/`. Zero disclosure gaps. The
  two pre-existing warnings the owner flagged in advance (the
  Next.js workspace-root multiple-lockfiles inference; the
  `cookies()` sync dynamic API warning on `/api/auth/login`) both
  appeared in this run too, but PATCH-047's scope is exactly two
  graph-identity files — neither warning's surface was touched, so
  both are correctly excluded as pre-existing, unrelated environmental
  noise rather than PATCH-047 defects. SIXTEENTH consecutive fully
  clean review of the implementation. With this landed, the graph
  client-identity duality opened at PATCH-046 is fully closed — both
  FreeformGraphRepo consumers now share one authenticated cookie
  client. What remains of the hooks phase is the postsRaw shrink-down
  and FreeformPadletCards, last as instructed. No PATCH-048 drafted,
  per instruction.
- **2026-07-11** — PATCH-047 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K twenty-second application). The owner
  required the FreeformGraphLayer client-identity ruling FIRST:
  preserve the legacy `lib/supabase` singleton, or authorize migration
  to the cookie-client factory. **Ruling: MIGRATE — the program's
  FIFTH authorized behavior micro-change.** The evidence, re-derived
  fresh: `lib/supabase.ts` is a bare `createClient(url, anonKey)` using
  supabase-js's default localStorage session store, session-less under
  the app's actual cookie-based auth architecture (025/037); both
  freeform_graph tables carry RLS policies gated on `auth.uid()` via
  `can_access_board`/`can_edit_board`. The consequence is a genuine
  split-brain already live in production: CanvasClient's connect flow
  writes edges through the cookie client (works), while the RENDERING
  layer reads through the anon singleton — RLS silently filters the
  SELECT to `[]`, so created edges never render — and the layer's own
  three writes (`updateEdge`, the label-drag persist in
  `handleMouseUp`, `deleteEdge`) are bare awaits with no catch, so a
  42501 rejection there is UNHANDLED and their post-await state updates
  (`setEdges`, `setDraggingLabel(null)`, the optimistic filter) never
  run — silent loss of label/style edits and deletes, a P3 repair, not
  a cosmetic fix. The full consequence table is bound (§0.2): after
  migration, reads render truthfully (unauthorized viewers still get
  an RLS-filtered `[]` — no new exposure, only identity correction),
  all three writes persist with their byte-kept follow-up code finally
  executing, and the `isTableUnavailable`/42P01 degradation machinery
  is completely untouched. The slice is two files: the layer's two
  legacy import lines collapse to the factory import, and the
  `useMemo` construction swaps onto `createFreeformGraphRepo` with a
  one-line pointer comment — 493→493, the deps array was already
  `[boardId]` and stays byte-kept, never-grow holds at equality on the
  over-400-line component ceiling. `graphRepo.ts` gets a COMMENT-ONLY
  edit: its factory doc previously said "do NOT swap without an owner
  ruling," and leaving that stale after the ruling landed would be a
  P0 doc bug, so the comment is updated to record it — the class body
  and factory body stay byte-kept. Explicitly NOT this seam: the
  postsRaw shrink-down (a different table, deferred); FreeformPadletCards
  (byte-untouched and hash-bound — it renders the layer but its own
  bytes don't change); realtime stays CTO-only. No tests (nothing newly
  testable in `lib`); suite stays 245/28. CTO simulation ran the real
  repo gates on the post-edit tree (tsc clean, boundaries silent,
  vitest 245/28) then restored byte-exact via `git cat-file blob`.
  Spec (1,023 lines) self-verified: both fence hashes + fence==canonical,
  the two-pair layer recipe and the one-pair graphRepo recipe both
  reconstructed from the TRUE live pre-edit files, all eight
  MUST-NOT-CHANGE hashes fresh-measured at splice time, and the bound
  two-file extractor sandbox-executed from its own extracted bytes
  against seeded garbage (rc 0, both outputs hash-verified). No
  PATCH-048 drafted — two files, one seam, no split needed.
- **2026-07-11** — PATCH-046 landed and reviewed: **PASSED** (commit
  `e04e2f3`; independently re-derived against the LIVE on-disk spec,
  not a cached copy or the implementer's report). Both final hashes
  matched exactly at the commit AND the live tree; scope confirmed
  exactly two files (17 insertions / 3 deletions). The graphRepo
  whole-file fence was byte-compared against the committed file; all
  three CanvasClient regions (import, construction, deps) were
  confirmed individually by direct read against the bound NEW text,
  with the OLD text absent in each case. Pre-edit bases confirmed at
  the parent `2cacf51`; both recipe reconstructions (the graphRepo
  pure-append and the CanvasClient three-pair) rebuilt the bound final
  hashes from the TRUE parent blobs. One note for the record: the
  reviewer's own reconstruction script initially failed on the
  graphRepo append due to a missing blank-line separator between the
  class close and the factory block — traced, fixed, and re-run clean;
  this was a REVIEWER SCRIPT bug, not a spec or implementation defect,
  since the bound extractor itself only hash-asserts the whole-file
  fence directly and had already passed before the auxiliary check ran.
  The bound hybrid extractor was RE-EXECUTED independently in an
  isolated sandbox against a garbage `graphRepo.ts` and a REAL pre-edit
  CanvasClient copy; both outputs were `git hash-object`-verified. All
  twelve MUST-NOT-CHANGE hashes held, including `FreeformGraphLayer.tsx`
  — read directly and confirmed STILL constructing
  `new FreeformGraphRepo(supabase, boardId)` with the legacy
  `lib/supabase` singleton, exactly as deferred. The class body was
  confirmed byte-untouched by direct read: the constructor, all four
  normalize helpers, and all five methods with their
  `isTableUnavailable` state machine, `42P01`/`PGRST116` handling,
  synthetic fallback objects, console warnings, and throw-through
  channels are all intact — no Result translation anywhere. Census
  matched exactly on all ten bound instruments including the
  `FreeformGraphRepo`-substring disclosure (`createFreeformGraphRepo`
  contains the class name); the collision gate showed only the two
  intended sites; the untouched-file diff gate was clean. CanvasClient
  confirmed at EXACTLY 8,384 lines — never-grow held at equality.
  Grandfather held at 2. Unit 245/28 (unchanged, zero test changes),
  `playwright test --list` 27/18, tsc clean, boundaries clean, e2e
  27/27 on the reviewer's own warmed server, the port-3000 gate
  independently confirmed at 0 listeners BOTH before and after the
  reviewer's server run, `npm run verify` green, the extractor script
  removed, and no PATCH-047 anywhere in `patches/`. Zero disclosure
  gaps. FIFTEENTH consecutive fully clean review of the implementation.
  With this landed, FreeformGraphRepo's client hand-off is retired; the
  remaining FreeformGraphLayer client-identity ruling, the postsRaw
  shrink-down, and FreeformPadletCards (last) are what's left of the
  hooks phase. No PATCH-047 drafted, per instruction.
- **2026-07-11** — PATCH-046 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K twenty-first application). The census
  regenerated fresh at `fdfc67f` found the FreeformGraphRepo family in
  a different shape than the standing shorthand suggested: the five
  graph-table sites live INSIDE `lib/graph/graphRepo.ts` — a
  pre-domain-layer class repository that is already isolated, typed,
  P6-single, and outside the boundary lint. **The ruling:**
  Result-translation REJECTED; the class's graceful-degradation
  contract (the isTableUnavailable state machine, 42P01 detection,
  synthetic fallback rows, PGRST116 tolerance, throw-through) is
  consumed by two component trees and rewriting it buys zero strangler
  progress. The actual strangler defect is the CLIENT HAND-OFF —
  components constructing the repo with their own client — and that is
  the whole slice: a one-line factory `createFreeformGraphRepo`
  (cookie client, 025 identity re-verified: both `supabaseBrowser()`
  and `createBrowserSupabaseClient()` are `createClientComponentClient`)
  plus CanvasClient's import/construction/deps swapped in three
  line-neutral extractor replacements — never-grow at equality,
  `new FreeformGraphRepo` extinct in CanvasClient, supabase 29→27.
  **The load-bearing discovery:** the OTHER constructor site,
  FreeformGraphLayer, passes the LEGACY `lib/supabase` singleton — a
  different session identity from the cookie client (the exact duality
  the useCanvasData header warns about). Swapping it would CHANGE its
  RLS identity, so it is DEFERRED BY NAME with a hash-bound
  MUST-NOT-CHANGE and a fencing comment in the factory doc; it is
  rendered by FreeformPadletCards (LAST), so the client-identity
  ruling rides that phase. The class body is byte-kept and
  fence-proven (pure append); no tests (one-line builder, the 021/042
  precedent); suite stays 245/28. Substring disclosure:
  `createFreeformGraphRepo` contains `FreeformGraphRepo`, so the
  extinction instrument is `new FreeformGraphRepo`. CTO simulation ran
  the real gates (tsc clean, boundaries silent, vitest 245/28) then
  restored byte-exact. Spec (562 lines) self-verified: fence 0 hash +
  fence==canonical, the CanvasClient pair ordering at extractor
  indices 1–6, BOTH recipe reconstructions from the live pre-edit
  files (the graphRepo append recipe incl. its blank separator line,
  and the CanvasClient three-pair), all twelve MUST-NOT-CHANGE hashes
  fresh-measured at splice time, and the hybrid extractor
  sandbox-executed from its own extracted bytes against a garbage
  graphRepo + a REAL pre-edit CanvasClient copy. No PATCH-047 drafted
  — two files, one seam, no split needed.
- **2026-07-11** — PATCH-045 landed and reviewed: **PASSED** (commit
  `dee1708`; the program's first DUAL review — an independent read-only
  GLM-5.2 review reported PASSED, and the CTO then re-ran every bound
  gate from scratch instead of accepting the GLM evidence, per the
  reconciliation the owner requested). All seven final hashes matched
  exactly at the commit AND the live tree, including CanvasClient at
  `620cc9ac...` and EXACTLY 8,384 lines — never-grow held at equality
  through the program's first over-ceiling extractor edit. All six
  whole-file fences byte-compared against the committed files; all
  three pre-edit bases confirmed at the parent `03f75d5`; all three
  recipe reconstructions (three-pair CanvasClient, five-pair
  useCanvasData, four-pair useCanvasLines) rebuilt the bound final
  hashes from the TRUE parent blobs; the bound HYBRID extractor was
  re-executed in an isolated sandbox against six seeded garbage files
  plus a REAL pre-edit CanvasClient copy, and all seven outputs were
  `git hash-object`-verified. All sixteen MUST-NOT-CHANGE hashes held,
  including `lib/domain/core/command.ts` — the file whose 'unknown'
  thrown-mode marker the new channel-discrimination idiom depends on.
  Both discrimination guards were read directly in the committed code:
  `useCanvasLines.createLine` rethrows `cause` on `code === 'unknown'`
  into the byte-kept console.error catch and takes the byte-kept
  temp-line fallback otherwise; `duplicateLine` rolls back ONLY on
  `code !== 'unknown'`, leaving the thrown channel silent with the
  optimistic line kept — the preserved P3 quirk. Census exact on every
  bound instrument: useCanvasLines SUPABASE-FREE (supabase 0),
  useCanvasData `.from(` 1 (the Array.from survivor — canvas_lines
  writes EXTINCT), CanvasClient supabase 29 (the import-path substring
  disclosure), resolveCurrentWorkspace extinct with
  resolveWorkspaceForUser landed (2), swallow family HELD at eleven.
  Scope exactly seven files (580 insertions / 48 deletions);
  untouched-file gate clean; grandfather 2; unit 245/28 (lines.test.ts
  9 and linesRepository.test.ts 6 run by name), tsc clean, boundaries
  clean, e2e 27/27 on the CTO's own warmed server, `npm run verify`
  green, extractor script removed, no PATCH-046 started. **The one
  GLM-report inconsistency — a stopped-server check reported on port
  3100 — was reconciled by direct measurement**: the spec's
  authoritative §11.4 gate is port 3000, and the CTO independently
  confirmed 0 listeners both before and after its own server run; the
  3100 reference matches no bound gate in the spec and is a
  reviewer-report artifact, not an implementation defect. Zero
  disclosure gaps. FOURTEENTH consecutive fully clean review. Family 4
  is FULLY DISPOSITIONED — with it, the hooks-phase extraction of the
  canvas/padlets/canvas_lines/board_sections read AND write families
  is complete; the remainder is FreeformGraphRepo, the postsRaw
  shrink-down, FreeformPadletCards (last), and CTO-only realtime.
- **2026-07-11** — PATCH-045 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K twentieth application). The owner asked for
  the Family 4 analysis with the canvas_lines aggregate ruling made
  FIRST. **The ruling:** the aggregate is born WRITE-side exactly as
  043 reserved — new `lib/domain/canvas/lines.ts` +
  `linesRepository.ts`, four HONEST commands mirroring the posts
  naming (createLine / createLineAndSelect / updateLine — one dynamic
  command serving BOTH update sites including saveLineToDb's 18-column
  payload — / deleteLine), row and update payloads passing verbatim as
  `object` (the postRowSchema precedent, forced by two genuinely
  dynamic payloads), updated_at command-internal. The rendering read
  stays in canvasViewReads, byte-untouched. **The second ruling this
  patch needed — the channel-discrimination idiom:** the owner ordered
  all swallow/fallback/temp-line/rollback behavior preserved, and two
  sites have genuinely SPLIT resolved-vs-thrown channels
  (useCanvasLines.createLine: resolved → temp-line fallback, thrown →
  console.error; duplicateLine: resolved → rollback, thrown → silent
  with the optimistic line stranded — the pre-existing P3 quirk).
  defineCommand's catch-all would merge them, so call sites
  discriminate on `result.error.code`: repositories map RESOLVED
  supabase errors to 'unavailable'; defineCommand maps THROWN
  exceptions to 'unknown' (lib/domain/core/command.ts joins the
  MUST-NOT-CHANGE set; a bound test pins the thrown-mode marker AT the
  lines aggregate). NOTHING converges — unlike 041, no behavior
  authorization was needed or used. NO BestEffort anywhere: the three
  both-channels-swallowed sites become honest commands whose Results
  are deliberately unread behind bound PRESERVED-LEGACY-SWALLOW
  comments — the swallow family HOLDS at eleven, and this shape
  preserves the saveEnd debug-logger contract (fires only on TRUE
  success) which a BestEffort command would silently break. The
  supabase parameter RETIRES from useCanvasLines (the hook goes
  SUPABASE-FREE) and the freed CanvasClient hand-off line funds the
  039-deferred workspace rider (resolveCurrentWorkspace →
  resolveWorkspaceForUser, a pure consumer swap onto the fenced 021
  wrapper): CanvasClient lands at exactly 8,384 → 8,384, never-grow at
  equality, resolveCurrentWorkspace extinct there. The extractor
  evolves for its first over-ceiling target: six whole-file fences
  PLUS three single-occurrence CanvasClient replacements with pre/post
  hash asserts — no hand edits, no 8.4k fence; sandbox-executed at
  authoring from its own extracted bytes against six seeded garbage
  files and a REAL pre-edit CanvasClient copy, all seven outputs
  hash-verified. postsRaw ruled NOT this seam (padlets table,
  per-consumer shrink-down stays queued); realtime byte-untouched,
  CTO-only, the hook keeps its client memo for exactly that block.
  15 bound tests (9 domain + 6 infra); suite 230/26 → 245/28. CTO
  simulation ran the real repo gates on the post-edit tree (tsc clean,
  boundaries silent, vitest 245/28 with both new files listed by name)
  then restored byte-exact via `git cat-file blob`. Spec (2,164
  lines) self-verified: six fence hashes + fence==canonical + the
  CanvasClient pair ordering at extractor indices 6–11 + THREE recipe
  reconstructions (five-pair hook, four-pair useCanvasLines, three-pair
  CanvasClient — each from the TRUE pre-edit bytes) + all sixteen
  MUST-NOT-CHANGE hashes fresh-measured at splice time. Family 4 is
  DISPOSITIONED when this lands; the hooks remainder is
  FreeformGraphRepo, postsRaw shrink-down, FreeformPadletCards, and
  CTO-only realtime. No PATCH-046 drafted — the seam is one dependency
  chain and a split would strand an aggregate or spend the never-grow
  offset twice.
- **2026-07-11** — PATCH-044 landed and reviewed: **PASSED** (commit
  `f609133`, review re-ran every bound gate independently against the
  live spec, which was itself confirmed byte-unchanged since
  authoring). All five final hashes matched exactly at the commit AND
  the live tree; scope confirmed exactly five files (254 insertions /
  30 deletions); all five whole-file fences byte-compared against the
  COMMITTED files; the three-pair hook recipe reconstructed the final
  hash from the TRUE pre-edit git blob at `165d086` (not a cached
  copy), and the pre-edit hashes of all five files at that commit
  matched the spec's §1 bindings — the implementer started from the
  right base. The bound five-file mechanical extractor was
  RE-EXECUTED in an isolated sandbox against five seeded garbage
  files: it wrote all five and every output was
  `git hash-object`-verified. `insertSections`/`canvas.createSections`
  were read directly in the committed code and confirmed: snake_case
  array payload, resolved errors mapped to
  `err('unavailable', { cause })`, honest pass-through with no
  swallow, all-inserted-rows read-back (null-safe). All six
  differential-contract channels confirmed in the committed code: a
  resolved insert error throws `error.cause ?? error` into the SAME
  recovery catch; a thrown insert failure reaches the identical path
  via `defineCommand`'s own catch-to-err conversion; the padlet loop's
  resolved per-row errors remain silently swallowed inside the
  UNCHANGED `updatePostMetadataBestEffort` (swallow count held at
  ELEVEN, no new site); a loop-element THROWN failure still rejects
  `Promise.all` fail-fast into the same recovery catch, preserving the
  legacy quirk where the synthetic fallback fires even though the
  sections were already inserted; the ordering (insert → remap build →
  padlet loop → local reassignment → toast) is byte-identical; and the
  recovery catch, `syntheticSections`, and `toast.warning` are
  confirmed byte-kept. All eleven MUST-NOT-CHANGE hashes held. The
  full §9.2 census matched on all 26 bound instruments (17 hook + 9
  domain/infra) including the one new bound double-cast and the
  realtime-only `'padlets'` disclosure. Untouched-file diff gate
  clean; grandfather held at 2. Unit 230/26 (6 new tests across two
  existing files, no new file — sections.test.ts 11→14,
  sectionsRepository.test.ts 6→9), tsc clean, boundaries clean, e2e
  27/27 (board-lifecycle exercising the extracted recovery path), port
  gate 0/0 — all re-run independently. Zero disclosure gaps against
  the patch's own scope. THIRTEENTH consecutive fully clean review of
  the implementation; Family 2 (section-recovery) is now FULLY
  DISPOSITIONED. One finding surfaced OUTSIDE the patch's scope during
  the final `npm run verify` gate: two zero-byte UNTRACKED files at
  `app/collabboard/canvas/create/page.tsx` and
  `app/collabboard/canvas/[id]/settings/page.tsx` — leftovers matching
  the route PATCH-022 already deleted for zero user data, apparently
  resurrected outside git (the same class of stray IDE-side artifact
  as the `_review_041_extractor.py` flagged at PATCH-043) — broke
  `npm run verify`'s typecheck step via Next's auto-generated
  `.next/types` page-type plugin, which reads every physical page file
  regardless of git tracking. Not part of this commit's diff or scope;
  the CTO attempted a reversible move-aside first, which the
  permission classifier correctly blocked as unauthorized scope
  expansion; the owner then explicitly authorized deletion, `npm run
  verify` ran clean afterward, and `git status` confirms zero trace
  since the files were never tracked. Remaining after this patch:
  Family 4 (lines write family, workspace rider standing), realtime
  (CTO-only), and the postsRaw shrink-down. No PATCH-045 drafted, per
  instruction.
- **2026-07-11** — PATCH-044 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K nineteenth application). The owner asked for
  Family 2 (the section-recovery cluster, pre-analyzed in PATCH-043
  §0.4) with every channel preserved exactly. The slice executes the
  §0.4 shape verbatim: the array insert becomes the sections
  aggregate's RMW read-back — NEW `insertSections(fields[])` on the
  repository (all inserted rows back, null mirrors the vendor shape)
  behind NEW `canvas.createSections`, with boardId riding once at the
  command input and merged per row (TS closure narrowing makes the
  legacy in-closure `board_id: canvasId` shape non-deterministic to
  compile against a zod-typed input; the top-level call site sits in
  fetchData's own body where the guard narrowing holds — disclosed).
  The padlet remap loop lands on the EXISTING
  `canvas.updatePostMetadataBestEffort` with the 032 per-element
  fail-fast wrapper, command instantiated once (the 038 idiom). NO
  behavior authorization was needed anywhere — the reason this slice
  is Pattern-K-safe: both insert failure channels already converge on
  the recovery catch (the 038/040 check-and-throw shape → honest
  command + call-site cause-unwrap throw delivers the ORIGINAL
  supabase error to the same catch), and the loop's resolved per-row
  errors were never read, mapping onto the existing BestEffort
  command with the swallow count HELD at eleven. The preserved legacy
  quirk is bound in the §0.2 contract table: a loop throw still takes
  the synthetic fallback even though the sections were inserted.
  Recovery catch, synthetic sections, and toast.warning byte-kept;
  the missing realtime suppression preserved by name; updated_at
  command-internal (032+ standing); one bound double-cast restores the
  legacy any-flow type. Structurally the infra client's insert widens
  to a single|array union returning a thenable-AND-single-chainable
  select (the postsRepository PostsInsertQuery precedent), which the
  test fake implements via the Object.assign hybrid (the 037/043
  harness shape). 6 bound tests (3 domain + 3 infra); suite 224/26 →
  230/26, no new file. CTO simulation ran the real repo gates on the
  post-edit tree (tsc clean, boundaries silent, vitest 230/26 with
  sections.test.ts 14 and sectionsRepository.test.ts 9 listed by
  name) then restored byte-exact via `git cat-file blob`. Spec
  (1,973 lines) self-verified: all five fence hashes + fence==canonical
  + the three-pair recipe reconstruction from the live pre-edit hook +
  the five-file bound mechanical extractor sandbox-executed from its
  own extracted bytes against seeded garbage (rc 0, every output
  `git hash-object`-verified) + all eleven MUST-NOT-CHANGE hashes
  fresh-measured at splice time (the 041/042 census lesson). Family 2
  is DISPOSITIONED when this lands; the hook's remainder is Family 4,
  realtime (CTO-only), and the postsRaw shrink-down. No PATCH-045
  drafted — no split needed.
- **2026-07-11** — PATCH-043 landed and reviewed: **PASSED** (commit
  `3ea2092`, review re-ran every bound gate independently against the
  live spec, which was itself confirmed byte-unchanged since
  authoring). All three final hashes matched exactly at the commit AND
  the live tree; all three whole-file fences byte-compared against the
  COMMITTED files; the two-pair hook recipe reconstructed the final
  hash from the TRUE pre-edit git blob at `f22858c` (not a cached
  copy), and the parent-commit hook blob matched the spec's §1
  pre-edit binding — the implementer started from the right base. The
  bound three-file mechanical extractor was RE-EXECUTED in an isolated
  sandbox against three seeded garbage files: it wrote all three files
  and every output was `git hash-object`-verified. All six
  differential-contract behaviors confirmed in the committed code:
  the four sequential awaits complete before the first ok-check;
  the selector's deliberate no-catch (037 doctrine) makes a thrown
  failure abort the reads that follow; canvas/padlet failures log +
  throw the ORIGINAL supabase error via `error.cause ?? error` into
  the same catch → setError('Failed to load canvas.'); the lines
  failure stays deliberately unthrown via the ok-ternary collapse
  (disclosed comment rewording present); the sections failure
  null-collapses exactly as the never-read legacy `sectionError` did;
  and board not-found flows maybeSingle → ok(null) → setCanvas(null).
  Family 2's entire recovery cluster confirmed byte-untouched inside
  the fence-matched hook. All 10 MUST-NOT-CHANGE hashes held; the
  full §6.1 census matched on all 17 instruments including the two
  disclosures (the recovery block's `Array.from(` inside the `.from(`
  count; case-sensitive `supabase` 14). Scope exactly three files
  (338 insertions / 25 deletions); the untouched-file diff gate clean;
  the stray root `_review_041_extractor.py` flagged at authoring is
  gone and the tree was clean at review. Grandfather held at 2. Unit
  224/26 (the new `canvasViewReads.test.ts` run by name: 10/10), tsc
  clean, boundaries clean, e2e 27/27 (board-lifecycle exercising the
  extracted fetchData path), port gate 0/0, `npm run verify` green —
  all re-run independently. Zero disclosure gaps. TWELFTH consecutive
  fully clean review of the implementation. The hooks-phase READ
  idiom is now landed code; Family 2 (section-recovery, shape
  pre-analyzed in §0.4) is the natural next slice. No PATCH-044
  drafted, per instruction.
- **2026-07-11** — PATCH-043 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K eighteenth application). The owner asked for
  the Families 1/2 analysis with the canvas_lines design ruling made
  FIRST. **The ruling — the hooks-phase READ idiom:** rendering reads
  live in SELECTOR modules; only RMW reads serving a write command join
  a table's aggregate (the 036 findMetadataById distinction, which
  itself reserved rendering reads for this phase). Consequences: the
  fetchData quartet becomes ONE new selector module
  (`lib/infra/canvas/canvasViewReads.ts`) instead of four aggregate
  methods; the canvas_lines read does NOT open the future lines
  aggregate (Family 4 is born write-side; the workspace hand-off still
  rides it); and the rejected alternative was priced honestly — four
  domain-interface extensions would ripple into every domain-test fake,
  a ~16-file patch, vs three files with zero ripple. The differential
  error contract is ported channel-by-channel and simulation-proven:
  all four awaits complete before any check (resolved errors), a
  thrown failure aborts what follows (the selector functions carry the
  037 DELIBERATE no-catch), canvas/padlet failures log + throw the
  original supabase error via cause-unwrap into the same catch, the
  lines failure stays deliberately unthrown (ok-ternary collapse, one
  disclosed comment rewording), the dead `sectionError` variable
  dissolves, and board not-found flows ok(null) → setCanvas(null).
  Four bound double-casts restore the legacy any-flow types. Family 2
  (section-recovery) was analyzed and DEFERRED BY NAME with its future
  shape recorded in §0.4 — toast.warning, synthetic fallback, and both
  raw statements byte-untouched in this patch. 10 bound tests on the
  037 client-factory-mock harness (the fake builder is thenable AND
  maybeSingle-chainable, mirroring the real builder); suite 214/25 →
  224/26 with the new file listed by name. CTO simulation ran the real
  repo gates on the post-edit tree (tsc clean — the four casts plus
  every byte-kept downstream consumer against the real
  types/collabboard shapes; boundaries silent; vitest 224/26) then
  restored byte-exact via `git cat-file blob`. Spec self-verified
  (three fence hashes + fence==canonical + two-pair recipe
  reconstruction + the three-file extractor sandbox-executed from its
  own extracted bytes). Bash-classifier outage mid-authoring bridged
  with read-only work (the 038 pattern). No PATCH-044 drafted — no
  split needed; the 044+ row records Family 2 as the natural next
  slice with its shape pre-analyzed.
- **2026-07-11** — PATCH-042 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K seventeenth application). The owner asked for
  the smallest coherent slice over Family 5's remainder with the raw
  `{ error }` contract ruling made first. Census regenerated FRESH from
  the tree (per the 041 lesson — every number re-grepped). RULING: the
  raws stay RAW behind a fence — the ~25 CanvasClient call sites plus
  one JSX prop hand-off all destructure raw supabase shapes, and Result
  translation would rewrite two dozen consumer contracts inside the
  over-ceiling monolith; the PATCH-021 workspaceMembers exception
  applies verbatim (new fenced `lib/infra/supabase/postsRaw.ts`,
  shrink-only, sole consumer the hook, P6 held since the Result
  aggregate remains the only surface for new callers). The decisive
  simplification: `updateDrawingLayoutPadlet` — previously deferred for
  its dynamic `updates: any` schema AND its console.error channel
  split — rides BYTE-KEPT, because its statement is the same raw
  dynamic-update shape; consuming the raw function preserves its whole
  try/catch/rollback/console.error contract untouched, and the schema
  problem dissolves (no zod, no command, the table stays the
  validator). ZERO behavior deltas anywhere in the patch. Family 5 is
  FULLY DISPOSITIONED after this lands. One authoring near-miss caught
  by the new census discipline: the skeleton briefly carried an
  UNMEASURED placeholder hash for workspaceMembers.ts — measured and
  corrected before splicing (the 041 lesson working as intended at
  authoring time, not just review time). Instrument disclosures bound:
  the hook's `supabase` census lands on 18 not 17 (the new import PATH
  contains the substring) and `insertPostRow` greps count the Returning
  sibling's lines. Bound two-file extractor sandbox-executed at
  authoring; CTO simulation ran the real gates (tsc clean — the
  critical typed-SupabaseClient consumer-shape check, boundaries
  silent, vitest 214/25 unchanged) then restored byte-exact. Spec
  self-verified (both fence hashes + fence==canonical + six-pair
  recipe reconstruction). No PATCH-043 drafted — no split needed.
- **2026-07-11** — PATCH-042 landed and reviewed: **PASSED** (commit
  `b67e1d7`, review re-ran every bound gate independently against the
  live spec). Both final hashes, both whole-file fences (byte-compared
  directly against the live files), and the six-pair hook recipe
  (reconstructed from the TRUE pre-edit git blob at `204530b`, not a
  cached copy) all matched exactly. The bound two-file mechanical
  extractor was independently RE-EXECUTED in an isolated sandbox
  against a seeded garbage file — it wrote both files correctly and
  hash-verified each, confirming the harness continues to work fresh,
  not just on re-reading. `postsRaw.ts`'s four functions confirmed
  returning the raw supabase builder directly with zero Result
  translation, preserving every consumer's `{ data, error }`
  destructuring. `updateDrawingLayoutPadlet` confirmed with its FULL
  contract byte-kept — optimistic merge, try/catch, resolved-error
  rollback, thrown-error console.error + rollback, the dynamic
  `updates: any` payload — only the raw statement itself changed. All
  eight MUST-NOT-CHANGE hashes confirmed unchanged. Census confirmed
  exact across both files, including the two disclosed instrument
  notes (`supabase` 18 not 17; `insertPostRow` substring counting).
  Scope confirmed to exactly two files (one new, one modified);
  grandfather held at 2. Unit 214/25 (unchanged), tsc clean, boundaries
  clean, e2e 27/27 (board-lifecycle exercising the delegated
  insert/update/delete paths), port gate 0/0, `npm run verify` green.
  ELEVENTH consecutive fully clean review of the implementation. Family
  5 is now FULLY DISPOSITIONED. No PATCH-043 drafted, per instruction.
- **2026-07-11** — PATCH-041 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K sixteenth application, the third ONE-FILE
  patch). The owner delegated the `addFreeformCardPadlet` ruling; the
  CTO ruled **CONVERGENCE AUTHORIZED** — the program's FOURTH behavior
  micro-change (after 024, 032-Ruling-2/033, 034). Evidence gathered
  before ruling: the single consumer chain traced end-to-end
  (`handleFreeformCardDrop` has NO catch; its one invocation sits in
  the drop handler's L6384 try/catch), establishing the true legacy
  split — resolved insert error → silent rollback; thrown network
  error → console.error at the OUTER catch with the optimistic card
  STRANDED (ghost work, P3, the 034 harm class). The repair converges
  thrown onto the existing resolved rollback branch (no rethrow —
  `result.error.cause` census pinned UNCHANGED); three consequences
  disclosed in §0.1. The workspace hand-off standing ruling honored
  (rides the lines-family patch). Slice = smallest possible: one file,
  one region, zero domain/infra/test/import changes (both factories
  already imported since 040). Phase B is the bound mechanical
  extractor from PATCH-040 Amendment 1, now STANDARD — embedded
  backtick-free and sandbox-executed at authoring from its own
  extracted bytes against a seeded garbage file. CTO simulation ran
  the real repo gates on the post-edit tree (tsc clean, boundaries
  silent, vitest 214/25 unchanged — zero test changes) then restored
  byte-exact via `git cat-file blob`. Spec self-verified (fence hash +
  fence==canonical + recipe reconstruction). No PATCH-042 drafted — no
  split needed.
- **2026-07-11** — PATCH-041 landed and reviewed: **PASSED** (commit
  `406e3d2`, review re-ran every bound gate independently against the
  live spec). Final hash, the whole-file fence (byte-compared directly
  against the live file), and the hook recipe (reconstructed from the
  TRUE pre-edit git blob at `725a414`) all matched exactly. The bound
  mechanical extractor was independently RE-EXECUTED in an isolated
  sandbox against a seeded garbage file — it reproduced the declared
  hash and wrote correctly, confirming the harness fix from PATCH-040
  Amendment 1 continues to work under fresh execution, not just on
  re-reading. The exact one-region diff confirmed the rollback filter
  byte-kept, its guard swapped from `if (error)` to `if (!result.ok)`,
  no rethrow added, and zero import changes. All seven MUST-NOT-CHANGE
  hashes confirmed unchanged; scope confirmed to exactly one file;
  grandfather held at 2. Unit 214/25 (unchanged), tsc clean, boundaries
  clean, e2e 27/27 (board-lifecycle exercising the touched drop path),
  port gate 0/0, `npm run verify` green.
  **One finding, disclosed and corrected — a CTO-side authoring defect,
  not an implementer deviation:** the spec's `.from('padlets')` census
  baseline was off by one throughout (stated 7→6 in both §1 and §5.1;
  the true pre-edit tree at `725a414` held 8, true post-edit 7). The
  delta was correct (one occurrence removed, exactly as implemented);
  only the CTO's remembered absolute baseline was wrong, and the
  authoritative whole-file fence hash was never affected. Corrected in
  the spec (both gate lines) and logged as a LESSONS_LEARNED
  recurrence (a non-blocking sub-shape of the "spec defects survive
  faithful implementation" family — this time in a census number, not
  a code fence or type). Tenth consecutive fully clean review of the
  implementation itself; the first to catch and correct a CTO-side
  defect rather than an implementer one. No PATCH-042 drafted, per
  instruction.
- **2026-07-11** — PATCH-040 AMENDMENT 1: implementation stopped on a
  reported binding inconsistency (both domain whole-file fences "did
  not reach their bound hashes"; the recipe-rebuilt hook DID; the
  implementer restored to exact HEAD bytes WITHOUT git checkout —
  the autocrlf lesson held — and committed nothing). CTO re-derivation,
  fresh from the committed spec blob `dce3373` with zero cached
  copies: ALL THREE fences hash to their declared values and equal the
  authoring canonicals — fences and hashes are MUTUALLY CONSISTENT;
  nothing in the spec was stale. Demonstrated root-cause class:
  `git hash-object` cleans CRLF (a CRLF-written fence still matches)
  but a RAW sha1 over CRLF bytes does not — matching the report's
  whole-file-vs-recipe asymmetry exactly. Amendment 1 replaces Phase B
  with a BOUND MECHANICAL EXTRACTOR embedded in the spec (extracts the
  fences from the spec itself, hash-asserts before writing, writes LF,
  re-verifies via `git hash-object`; §5 downgraded to explanatory).
  The CTO executed the embedded script end-to-end from its own
  extracted bytes — which caught a second defect before shipping: the
  script's first draft contained a literal triple-backtick in a regex
  string, truncating naive fence extraction of the script itself;
  rebuilt backtick-free via `chr(96)*3`. All three files written by
  the script hash-verified, then the tree restored byte-exact via
  `git cat-file blob`. Both lessons recorded in LESSONS_LEARNED
  (recurrence sub-shape + the embedded-script rule). Spec remains
  READY; no content or hash changed; no PATCH-041 drafted.
- **2026-07-11** — PATCH-040 landed and reviewed: **PASSED** (commit
  `aabc2e8`, post-Amendment-1; review re-ran every bound gate
  independently against the live spec, including Amendment 1 itself).
  All three final hashes, all three whole-file fences (byte-compared
  directly against the live files), and the hook's edit-recipe
  reconstruction (re-run against the actual pre-edit git blob at
  `e4b7248`, not the CTO's canonical copy) all matched exactly. The
  amended Phase B extractor was independently re-executed in an
  isolated sandbox against seeded garbage files — it reproduced the
  declared hashes and overwrote correctly, confirming Amendment 1's fix
  actually works rather than just reading plausibly.
  `canvas.createPostBestEffort` confirmed swallowing the resolved
  Result unconditionally (eleventh swallow site); `addPadletFromLibraryItem`'s
  `fetchData()` confirmed running unconditionally after the
  throw-check (legacy ordering preserved exactly);
  `addDrawingLayoutPadlet` confirmed honest with its catch, rollback
  filter, and `return null` byte-kept. Most importantly:
  `addFreeformCardPadlet` — the flagged owner-decision-point site — was
  confirmed COMPLETELY UNTOUCHED, proving the §5c try-anchor correctly
  disambiguated from its byte-identical-looking insert statement. All
  five MUST-NOT-CHANGE hashes confirmed unchanged. The earlier
  EOL/extraction failure was confirmed to have left ZERO residual byte
  deviation — `w/lf` on all three touched files, hashes clean. Scope
  confirmed to exactly three files; grandfather held at 2. Unit 214/25
  (3 new + 211 existing), tsc clean, boundaries clean, e2e 27/27
  (board-lifecycle exercising the touched insert paths), port gate
  0/0, `npm run verify` green. NINTH consecutive fully clean review.
  No PATCH-041 drafted, per instruction.
- **2026-07-11** — PATCH-040 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K fifteenth application). Census regenerated at
  `e4b7248`: unchanged from 039's bindings. The owner's standing ruling
  honored (workspace hand-off rides the lines-family patch). Slice
  ruling: Family 5 CONTRACT SLICE B — the convergent insert pair.
  `addPadletFromLibraryItem` (bare-await, result discarded, fetchData()
  runs on resolved outcomes / skipped on thrown) goes onto NEW
  `canvas.createPostBestEffort`, the ELEVENTH command-internal swallow
  site, reusing the pinned `repository.insert` — ZERO infra changes;
  `addDrawingLayoutPadlet` (both channels already converged on its
  catch) is a PURE consumer swap onto the existing honest
  `canvas.createPost`. NO behavior authorization needed anywhere. The
  key deferral: **`addFreeformCardPadlet` is a flagged OWNER DECISION
  POINT** — its channels are genuinely split (resolved insert error →
  optimistic rollback; thrown network error → unhandled rejection, NO
  rollback), and exact preservation is impossible through
  defineCommand's catch-all; the options recorded in §0.1 are an
  authorized 034-style convergence repair or deferral to the
  raw-passthrough slice. The §5c recipe is try-anchored because
  addFreeformCardPadlet contains a byte-identical insert statement —
  the anchor disambiguates. 3 bound tests; validation-channel note
  disclosed (the 029 postRowSchema acceptance, unreachable at both
  consumers). CTO simulation ran the real repo gates on the post-edit
  tree (tsc clean, boundaries silent, vitest 214/25 — 211 existing + 3
  new) then restored byte-exact via `git cat-file blob` + no-op add,
  applying the autocrlf lesson cleanly (w/lf confirmed, zero status
  noise). Spec self-verified (three fence hashes + fence==canonical +
  recipe reconstruction from the live hook). No PATCH-041 drafted — no
  split needed.
- **2026-07-11** — PATCH-039 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K fourteenth application, the 034/035 shape).
  The owner asked for the next hooks-family slice with the smallest
  coherent Pattern-K-safe family; the census (regenerated at `cf6df0e`)
  and the slice analysis are recorded in the spec's §0.1. Key rulings:
  ① the workspace hand-off micro-slice — nominally the smallest — is
  BLOCKED by the never-grow rule: the swap needs a new import line in
  the over-ceiling monolith and a mechanical scan found ZERO honest
  offsets (no dead imports, no duplicative comments); it now rides the
  future lines-family patch, which deletes CanvasClient's L734 hand-off
  line and frees the -1. ② The chosen slice is Family 5 CONTRACT SLICE
  A: `updatePadletContent` + `updatePadletTitle`, the two stamped named
  single-column mutations, whose failure contracts map byte-for-byte
  onto the two established idioms (032's bare-await command-internal
  swallow — the resolved-failure content mirror still runs; 038's
  honest convergence — both title channels already reach one catch, NO
  authorization needed). ③ Sibling-method ruling: NEW `updateTitleStamped`
  beside the byte-untouched 035 `updateTitle` (the updateMetadata /
  updateMetadataUnstamped precedent + 037's extension-not-modification);
  NEW `updateContent` (shape exists nowhere; 036's reuse ruling
  inapplicable). ④ The content site's missing realtime suppression is
  PRESERVED by name (markPadletLocallyModified census 5→5). New-surface
  totals: 2 repo methods, 2 commands (tenth swallow site + honest), 10
  bound tests. CTO simulation applied all five canonical files to the
  working tree and ran the REAL gates — tsc clean, boundaries silent,
  vitest 211/25 (201 existing + 10 new, zero pins broken) — then
  restored byte-exact. One near-miss extracted to LESSONS_LEARNED: the
  `git checkout` restore under `core.autocrlf=true` rewrote the five
  LF working files as CRLF while every hash gate stayed green — caught
  by the spec's recipe-reconstruction self-check (count 0 on an LF
  fence), fixed via `git cat-file blob` + binary write + no-op add.
  Spec self-verified (five fence hashes + fence==canonical + the hook
  recipe reconstructing the bound hash from the live file). No
  PATCH-040 drafted — no split needed.
- **2026-07-11** — PATCH-039 landed and reviewed: **PASSED** (commit
  `927c15e`, review re-ran every bound gate independently against the
  live spec). All five final hashes, all five whole-file fences
  (byte-compared directly against the live files), and the hook's
  edit-recipe reconstruction (re-run against the actual pre-edit git
  blob at `e5d5320`, not the CTO's canonical copy) all matched exactly.
  The pre-edit hashes of all five files at `e5d5320` were independently
  confirmed against the spec's §1 bindings, proving the implementer
  started from the correct base. `updateContent` and `updateTitleStamped`
  confirmed as new sibling methods with the existing 035 `updateTitle`
  byte-untouched; `canvas.updatePostContentBestEffort` confirmed
  swallowing the resolved Result unconditionally (tenth swallow site);
  `canvas.updatePostTitle` confirmed honest (no catch, returns the
  repository Result directly); both hook call sites matched their bound
  semantics exactly. Census exact across both lib files and the hook;
  collision gates clean (0 hits outside the five scoped files and
  vendored third-party code); no residue from the CTO's own earlier
  in-tree simulation survived — scope confirmed to exactly five files,
  grandfather held at 2. Unit 211/25 (10 new + 201 existing), tsc
  clean, boundaries clean, e2e 27/27 (board-lifecycle exercising the
  touched title/content edit paths), port gate 0/0, `npm run verify`
  green. EIGHTH consecutive fully clean review. No PATCH-040 drafted,
  per instruction.
- **2026-07-11** — PATCH-038 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K thirteenth application, the second ONE-FILE
  patch: pure consumer swaps, zero domain/infra/test changes). The
  hooks-phase analysis the owner requested is recorded in the spec's
  §0.1: the live census regenerated at `ad14fae` resolves the "26 read
  sites" label to 26 TABLE SITES (only 4 are pure reads — the fetchData
  quartet; the rest are writes) + 1 realtime channel, classified into
  SEVEN families with the three CanvasClient client hand-offs each
  dispositioned by name (the workspace wrapper already exists from
  PATCH-021 but its file fences consumers — a future micro-slice; the
  lines-hook param retires with the future canvas_lines aggregate;
  FreeformGraphRepo is its own 5-site family). Slice ruling: the
  useCanvasInteractions drag-commit family (4 sites) is the smallest
  SAFE opener — every contract maps byte-for-byte onto an ESTABLISHED
  idiom (032's fail-fast Promise.all wrapper; 033's bare-await
  container-pair with first-throw-aborts-second — literally the same
  drop-into-container feature 033 ported on the freeform layout; honest
  check-and-throw), and the single-commit site needs NO convergence
  authorization since both legacy channels already reach the same catch
  (contrast 034's sibling). All six realtime-suppression cache calls
  byte-kept; no loading/retry surface exists at any site; the grouped
  catch's fetchData() refresh stays byte-identical. The hook exits
  supabase ENTIRELY (dead client + comment + import removed, census
  7→0) — the template for the hooks phase. Two harness advances: the
  compile gate ran on the UNREWRITTEN canonical bytes (a scratch
  tsconfig carrying the repo baseUrl/paths — no import rewriting at
  all), and the spec's five-pair edit recipe was machine-verified to
  RECONSTRUCT the whole-file fence hash from the live file. Three
  MUST-NOT-CHANGE hashes bound. Suite re-run 201/25 green at authoring.
  No PATCH-039 drafted — no split needed.
- **2026-07-11** — PATCH-038 landed and reviewed: **PASSED** (commit
  `5e7c4ea`, review re-ran every bound gate independently against the
  live spec). The final hook hash, the whole-file fence, and all six
  census counts (`supabase` 7→0, `.from('padlets')` 4→0,
  `markPadletLocallyModified` 6, the command-import counts,
  `result.error.cause` 2, `userId: null` 4) all matched exactly. The
  recipe-reconstruction check was re-run independently against the
  actual PRE-EDIT git blob at `ad14fae` (not the CTO's canonical copy)
  and reproduced the same bound hash, corroborating the spec's own
  self-verification from live repo history. All three MUST-NOT-CHANGE
  hashes (CanvasClient/posts.ts/postsRepository.ts) confirmed unchanged.
  The grouped-drag fail-fast `Promise.all` semantics, the container-pair
  sequential first-throw-aborts-second ordering, and the single-commit
  catch convergence (no authorization needed) were all confirmed
  directly in the byte-matched fence. Scope confirmed to exactly one
  file; grandfather held at 2. Unit 201/25 (unchanged), tsc clean,
  boundaries clean, e2e 27/27 (board-lifecycle exercising the touched
  drag paths), port gate 0/0, `npm run verify` green. SEVENTH
  consecutive fully clean review. No PATCH-039 drafted, per instruction.
- **2026-07-11** — PATCH-037 landed and reviewed: **PASSED** (commit
  `fcf861f`, review re-ran every bound gate independently against the
  live spec, GPT-5.5 as required). The auth trio landed on the extended
  `authState.ts` seam — **direct supabase EXTINCTION**: `supabase\.auth`
  confirmed 3→0 in the live file (escaped instrument), so CanvasClient
  performs zero direct supabase operations of any kind, tables or auth;
  only client plumbing to three named legacy helpers remains. All FOUR
  hashes exact, and each of the three whole-file fences byte-compared
  TRUE against its live file directly. The three EXISTING authState
  exports and their three consumers confirmed byte-untouched — pure
  extension. The load-bearing verification: both `rejects.toBe(...)`
  failure-identity tests are present and green, confirming the
  OBSERVABLE resolved-vs-thrown split at getUser survives the port
  (resolved → signed-out render with sessionReady true; thrown →
  unhandled rejection with sessionReady false, reaching a different
  downstream toast) — the deliberate no-catch design does exactly what
  it claims. Session/user-state semantics confirmed in the live code:
  the event path passes the real session through unchanged, the getUser
  path keeps its fabricated `{ user } as Session` compat object, and
  the call-site collapse mirrors the legacy destructure's error-ignore
  exactly. Cast census exact (`as Session` 1→2, `as User` 1→3). Census,
  lib line/test counts, diff shapes, byte-untouched gates, four-file
  scope, and grandfather 2→2 all confirmed; unit 201/25, tsc clean,
  boundaries clean, e2e 27/27 (reviewer's own server, incl.
  board-lifecycle exercising the touched mount/session path), port
  0/0, `npm run verify` green — zero disclosure gaps, SIXTH consecutive
  fully clean review. Monolith line-neutral 8,384→8,384 — health holds
  at 76 (architecture capped). No PATCH-038 drafted, per instruction;
  next per §7: hooks (26 read sites + the three deferred client
  hand-offs), then FreeformPadletCards last.
- **2026-07-10** — PATCH-037 AUTHORED (handoff-ready; **GPT-5.5
  REQUIRED** — the owner's standing auth rule, plus three patch-specific
  holds: an OBSERVABLE resolved-vs-thrown failure split the implementer
  must not "clean up", the repo's first client-factory-mocking test
  harness, and the cross-factory singleton reasoning). The five
  owner-requested rulings, all recorded in §0: the trio is ONE coherent
  seam (no split — PATCH-038 not drafted); every failure channel ports
  EXACTLY, incl. getUser's two observably-different channels (resolved
  auth error = signed-out rendering with sessionReady true; thrown =
  unhandled rejection with sessionReady false — each reaching a
  DIFFERENT downstream toast), preserved via seam functions that return
  Result but DELIBERATELY do not catch (documented in-file, pinned by
  rejects-identity tests); the session state is a presence indicator
  (zero field reads, grep-proven) — the event path keeps storing the
  REAL session through the new `onAuthSessionChanged` (structural
  `AuthSession` subset type), and the getUser path keeps its fabricated
  `{ user } as Session` compat object with the legacy comment; the
  mount fetch stays SERVER-VALIDATED (getUser, not getSession — the
  existing `getSessionUser` is NOT equivalent and is not used); no
  toasts/redirects/retries exist at any site and none are added; the
  optimistic preferences mirror stays byte-identical and its
  fire-and-forget-no-rollback contract is recorded as the swallow
  family's first AUTH-INFRA sibling; NO behavior repair was needed —
  none granted. Seam surface: `getVerifiedAuthUser` +
  `onAuthSessionChanged` + `updateCurrentUserMetadata` in authState.ts
  (P6-ruled against passwordSecurity's password-family wrapper and the
  user-delivering subscription sibling; the three existing functions
  and their consumers byte-untouched). Three new named casts + one
  carried, cast census bound. The monolith is LINE-NEUTRAL 8,384→8,384
  — the first simulation measured +2 from a duplicative call-site
  comment; cut per the never-grow rule, the seam docblock carries the
  ruling. Two authoring-harness lessons recorded: `vi.mock` requires
  the literal 'vitest' import specifier (the scratch absolute-path
  rewrite broke it; repo runs unaffected), and the unescaped-grep-dot
  instrument defect recurred exactly as at PATCH-030 (`supabase.auth`
  false-matching the new `supabase/authState` import path — the bound
  gate uses the escaped form). 9 bound tests compiled and run green at
  authoring; spec fully self-verified (all four final hashes
  reconstructed from its own fences; each whole-file fence byte-equal
  to the scratch-tested copy). After this patch CanvasClient performs
  ZERO direct supabase operations — the site map goes empty; the three
  client hand-offs (workspace resolve, lines hook, FreeformGraphRepo)
  are named and deferred to the hooks batch.
- **2026-07-10** — PATCH-036 landed and reviewed: **PASSED** (commit
  `60ed8b6`, review re-ran every bound gate independently against the
  live spec). The map comments read-merge-write landed on the new
  `canvas.updatePostComments` seam — **non-auth padlets EXTINCTION**:
  `from('padlets')` confirmed 2→0 in the live file, so CanvasClient's
  entire remaining supabase surface is the auth trio. All FIVE hashes
  exact, and each of the four domain/infra fences byte-compared TRUE
  against its live file directly, not only via the hash. The owner's
  SELECT ruling verified in the live code: `findMetadataById` sends
  `.select('metadata').eq('id', id).maybeSingle()` and collapses BOTH a
  missing row and a null metadata column onto `null` via `data?.metadata
  ?? null` — the not-found semantics pinned. The command's read leg is
  honest (a failure aborts with no write and the original supabase error
  reaches the existing catch); the write leg is the ninth
  command-internal swallow site (resolved ignored, `ok(undefined)`
  unconditional) — confirmed, no authorized behavior change in either
  channel. The `comments`/`detachedComments` payload split confirmed
  reusing the ALREADY-EXISTING `updateTasks`/`updateMetadata` methods
  exactly, with the caller-supplied shared `nowIso` on both branches; the
  disclosed one-line `updateTasks` doc-comment amendment (its second
  consumer) confirmed as the patch's sole deletion. The call site's
  existing toast/refetch catch stays byte-identical. Census, lib
  line/test counts, diff shapes, byte-untouched gates, five-file scope,
  and grandfather 2→2 all confirmed; unit 192/24, tsc clean, boundaries
  clean, e2e 27/27 (reviewer's own server), port 0/0, `npm run verify`
  green — zero disclosure gaps, FIFTH consecutive fully clean review.
  Monolith 8,400→8,384 — health holds at 76 (architecture capped). No
  PATCH-037 drafted, per instruction; next per §7: the auth trio
  (GPT-5.5 REQUIRED), then hooks (26 read sites, extending the read
  surface 036 opened), then FreeformPadletCards last.
- **2026-07-10** — PATCH-036 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K twelfth application: one repository READ
  method, one command, one bound block, five scoped files). This is the
  non-auth padlets EXTINCTION patch: after it lands, CanvasClient's
  entire remaining supabase surface is the auth trio. The owner-requested
  SELECT ruling: the map handler's paired `.maybeSingle()` SELECT becomes
  the aggregate's FIRST read method, `findMetadataById` — it is the read
  half of a read-modify-write cycle serving a write command, not a
  rendering read, so the hooks-batch read deferral (which governs
  rendering reads) is untouched; P6 says posts reads land on this same
  trunk in the hooks phase anyway; leaving the SELECT raw would have
  stranded the fetch, the fresh-copy merge, and the `|| {}` not-found
  collapse untested in JSX. Companion ruling: ZERO new write methods —
  analysis showed the two `field` branches send byte-identical column
  shapes to the EXISTING `updateTasks` (the `{metadata, content,
  updated_at}` triple) and `updateMetadata` (the caller-stamped pair),
  so the new command `canvas.updatePostComments` branches on the
  two-value field enum (which IS the legacy prop type at MapCanvas.tsx
  L119 — not a narrowing) and reuses the already-pinned methods; the
  payload key-order difference and the unreachable repository error
  messages are disclosed in §0.3, and `updateTasks`'s stale doc comment
  is amended (the patch's one deletion line). The command is the
  program's first MIXED-contract member of the swallow family: read leg
  honest (a failure aborts with no write — pinned), write leg the NINTH
  command-internal swallow (resolved ignored, thrown re-thrown at the
  call site into the same catch) — NO authorized behavior change; both
  channels port exactly, incl. the shared-nowIso caller stamp and the
  not-found silent no-op. The legacy `as Record<string, unknown> | null`
  cast RETIRES with the block; zero new casts. 84 bound tests (12 new:
  8 domain + 4 infra) compiled and run green at authoring; monolith
  8,400→8,384. Spec fully self-verified: all FIVE final hashes
  reconstructed from the spec's own fences, each whole-file fence
  byte-equal to the scratch-tested canonical copy, and every bound
  anchor grep behavior-checked against the live tree. No PATCH-037
  drafted — no split needed.
- **2026-07-10** — PATCH-035 landed and reviewed: **PASSED** (commit
  `d02196a`, review re-ran every bound gate independently against the
  live spec). The clipart title clear landed on the new
  `canvas.updatePostTitleBestEffort` seam: all FIVE hashes exact, and
  each of the four domain/infra fences byte-compared TRUE against its
  live file directly, not only via the hash. The import edit and the
  one bound block both confirmed OLD-gone/NEW-once. The three requested
  semantics verified in the live code: the repository's `updateTitle`
  sends `{ title: fields.title }` and nothing else (no `updated_at` key
  — the unstamped-by-design ruling), the command ignores the resolved
  Result and returns `ok(undefined)` unconditionally (the eighth
  command-internal swallow site, pin present), and the call site has no
  enclosing try/catch — a thrown error still propagates as an unhandled
  rejection, skipping the same local-state update and `set*` resets the
  legacy handler skipped, confirming NO authorized behavior change was
  needed anywhere in this patch. Statement order (metadata write → title
  write → local update) and the now-false comment's deletion both
  confirmed. Census, `.update({ title: '' })` extinction (1→0),
  `from('padlets')` 3→2, five-file scope, grandfather 2→2 all confirmed;
  unit 180/24, tsc clean, boundaries clean, e2e 27/27 (reviewer's own
  server), port 0/0, `npm run verify` green — zero disclosure gaps,
  FOURTH consecutive fully clean review. Monolith 8,401→8,400 — health
  holds at 76 (architecture capped). No PATCH-036 drafted, per
  instruction; next per §7: the map `onUpdateChildComments` variant
  (needs its own ruling on the paired SELECT), then the auth trio
  (GPT-5.5).
- **2026-07-10** — PATCH-035 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K eleventh application, the narrowest
  new-capability extension yet: one repository method, one command, five
  scoped files). Analyzed the two remaining non-auth CanvasClient sites
  per the owner's delegation: the clipart title clear (L7581) is the
  smallest coherent next seam — one `title`-only statement, one consumer,
  a 6-line bound block with an extinction gate. The map
  `onUpdateChildComments` variant (SELECT + conditional `content` write)
  shares NO capability with it and is DEFERRED by name: it needs a
  content-carrying conditional write AND a standalone ruling on its
  paired SELECT (first aggregate read method vs. raw read), plus the
  dynamic `[field]` key and `.maybeSingle()` not-found semantics bound —
  its own patch. New `canvas.updatePostTitleBestEffort` ships
  best-effort ONLY (no honest twin — it would be dead code) as the
  EIGHTH command-internal swallow site; the port is exact in BOTH
  channels (resolved swallowed inside the command, pinned; thrown
  cause-unwrap re-thrown at the call site with no enclosing try/catch —
  the same unhandled rejection skipping the same trailing lines), so NO
  authorized behavior change was needed. The repository method is
  unstamped by design (the legacy statement never wrote `updated_at`;
  the metadata write above it stamps the row — quirk ported, not
  repaired). Disclosed in the spec: the now-false "direct supabase
  update" comment line is deleted; `result.error.cause` stays 39
  (case-sensitive instrument vs. `titleResult.*`); `supabase` census
  drops by TWO lines (the deleted comment also contained the word —
  measured, not hand-summed). 72 bound tests (5 new: 3 domain + 2
  infra) compiled and run green at authoring. Monolith 8,401→8,400.
  Spec fully self-verified: all FIVE final hashes reconstructed from
  the spec's own fences, and each whole-file fence byte-compared equal
  to the scratch-tested canonical copy. No PATCH-036 drafted — no split
  needed.
- **2026-07-10** — PATCH-034 landed and reviewed: **PASSED** (commit
  `4e5185e`, review re-ran every bound gate independently against the
  live spec). The position-write pair landed on the new
  `canvas.updatePostPosition` seam: all FIVE hashes exact, and — the
  whole-file binding check — each of the four domain/infra fences
  byte-compared TRUE against its live file directly, not only via the
  hash. The three semantic properties verified in the live code: the
  repository's conditional-metadata spread omits the key entirely when
  absent (both `Object.keys` pins present and green), the best-effort
  command ignores the resolved Result and returns ok unconditionally
  (swallow pin present), and the drop-repositioning site's authorized
  thrown-mode convergence routes both failure modes onto the byte-kept
  rollback branch. Census, site map (padlets writes 4→2, remaining: the
  map content+select variant and the title-clear), five-file scope,
  grandfather 2→2 all confirmed; unit 175/24, tsc clean, boundaries
  clean, e2e 27/27 (reviewer's own server), port 0/0, `npm run verify`
  green — zero disclosure gaps, third consecutive fully clean review.
  One review-side catch-up: the standing swallow-family decision entry
  still said FOUR sites — the 032 extension (sites 5–6) had been
  recorded in the row/log but not in the decisions table; brought
  current to SEVEN (with 034's `updatePostPositionWithMetadataBestEffort`)
  and the omission disclosed in the entry itself. Monolith 8,404→8,401 —
  health holds at 76 (architecture capped). No PATCH-035 drafted, per
  instruction; next per §7: the map content+select variant and the
  title-clear site (each its own small patch), then the auth trio
  (GPT-5.5).
- **2026-07-10** — PATCH-034 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K tenth application, first NEW-CAPABILITY
  extension since PATCH-029: one new repository method, two new domain
  commands, five scoped files). Analyzed the four sites PATCH-033
  deferred: the position-write pair (freeform detach's padlet leg +
  canvas drop repositioning) is the smallest coherent next seam — both
  need the SAME new capability, used in related-but-distinct combos
  (bundled with metadata vs. position alone), mirroring the existing
  metadata quartet's honest/best-effort split. The map-comments variant
  (needs a content-carrying command, paired with its own SELECT) and the
  title-clear site (needs a title-only command) are UNRELATED shapes,
  each deferred to its own future patch and named so nothing is lost.
  New repository method `updatePosition` takes optional `metadata` and
  OMITS the key entirely when absent (the house conditional-spread
  idiom, pinned by `Object.keys` tests on both shapes) — exactly
  reproducing each site's legacy statement. `canvas.updatePostPosition`
  (honest) serves the drop-repositioning site under the program's THIRD
  authorized micro-change: the resolved-error rollback branch stays
  byte-identical, while the previously-unhandled thrown-mode gap (a P3
  lost-work risk — a failed network write left the optimistic position
  un-rolled-back) now converges onto that same branch.
  `canvas.updatePostPositionWithMetadataBestEffort` serves the detach
  site as the SEVENTH command-internal swallow (extending the standing
  P3 family from six to seven). 67 bound tests (9 new + 58 existing)
  compiled and run green at authoring. Monolith 8,404→8,401. Spec fully
  self-verified: all FIVE final hashes (four whole-file domain/infra
  bindings + the CanvasClient consumer swaps) reconstructed exactly from
  the spec's own fences before delegation. No PATCH-035 drafted — no
  split needed.
- **2026-07-10** — PATCH-033 landed and reviewed: **PASSED** (commit
  `ef3a91d`, review re-ran every bound gate independently against the
  live spec on disk — no near-miss, all values traced to the current
  `PATCH-033.md`). Ten of the 14 JSX padlets UPDATE sites extracted onto
  the existing command quartet in the FIRST ONE-FILE patch of the
  program — zero domain/test/import changes, confirmed by `git status`
  showing exactly one modified file. All eight bound blocks confirmed
  byte-identical, including the columns/wall twin binding at exactly two
  occurrences. Both requested semantic checks confirmed directly in the
  code: the `onDropExistingPadlet` pair keeps its sequential
  first-throw-aborts-second ordering (the container write is checked
  before the dropped-padlet write begins), and all three
  `onUpdateChildComments` check-and-branch sites converge resolved and
  thrown failure modes onto one `if (!result.ok)` branch, per the
  extended 032-Ruling-2 authorization. Census confirmed via a fresh site-
  map regeneration: padlets UPDATE 14→4 exactly, the four deferred
  column-shape sites (2 position writes, 1 map/select variant, 1 title
  write) untouched. Unit 166/24 (unchanged — no new tests, the existing
  45-test posts suite is the fidelity net for this consumer-only patch),
  tsc clean, boundaries clean, e2e 27/27 (reviewer's own server), port
  gate 0 before/after, `npm run verify` green — zero disclosure gaps.
  Monolith 8,450→8,404; grandfather 2→2 — health holds at 76
  (architecture capped). No PATCH-034 drafted, per instruction; next per
  §7 is a ruling on the four deferred non-metadata writes (a position-
  write command, a content-carrying command for the map variant + its
  paired select, and a title-write command or hook consolidation), then
  the auth trio (GPT-5.5).
- **2026-07-10** — PATCH-033 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K ninth application, and the FIRST ONE-FILE
  patch of the program: CanvasClient only, zero domain/test/import
  changes). Analyzed all 14 JSX padlets UPDATE sites under the 031/032
  contract discipline: TEN are exactly `{ metadata, updated_at }` and
  land on the existing command quartet — seven bare-await sites (the
  detach container leg, the onDropExistingPadlet pair with its
  first-throw-aborts-second ordering, three comments variants, the
  drawing save, the crop save) onto `updatePostMetadataBestEffort`
  (consumers of the EXISTING swallow pins — the standing P3 decision
  stays at six command-internal sites), and the check-and-branch
  `onUpdateChildComments` triplet onto the honest command under an
  EXTENDED 032-Ruling-2 authorization (resolved branch byte-identical
  incl. the local-update-skipping `return`; thrown mode converges onto
  the same branch). The FOUR non-fitting sites are deferred BY COLUMN
  SHAPE and named in the spec: two position writes, the map comments
  variant (conditional `content` + the lone select), and a title write —
  each needs a command that doesn't exist yet. Zero JSX structure churn
  (all swaps are handler-internal statements — the owner's condition).
  Eight bound blocks cover the ten sites (the columns/wall twins bind as
  ONE block with an explicit count==2 replace-both instruction — a new
  binding form, self-verified). Monolith 8,450→8,404 (simulation-measured;
  the hand-sum said −41, the simulation −46 — twelfth correction). Spec
  fences SELF-VERIFIED end-to-end: the final hash reconstructed from the
  spec's own eight OLD/NEW pairs. No PATCH-034 drafted — no split needed.
- **2026-07-10** — PATCH-032 landed and reviewed: **PASSED** (commit
  `4b2c3ba`, review re-ran every bound gate independently against the
  LIVE spec on disk — the lesson from PATCH-031's near-miss applied: all
  three bound hashes and every census value were re-extracted from
  `PATCH-032.md` itself, not from memory or a scratch cache). Named-
  function padlets UPDATE goes EXTINCT: the bare-awaited cluster (7
  sites) landed on the two new best-effort commands with the swallow
  semantics and fail-fast `Promise.all` ordering confirmed structurally
  preserved; the authorized `changeCardColor`/`pinPost` micro-change
  landed exactly as ruled (resolved branch untouched, thrown mode now
  reaches the same existing failure branch). All nine CanvasClient bound
  blocks + the import edit confirmed byte-identical to the spec fences;
  both must-not-change infra hashes confirmed unchanged; full census,
  byte-untouched gates, `git status`, and grandfather (2→2) all
  confirmed; unit 166/24, tsc clean, boundaries clean, e2e 27/27
  (reviewer's own server), port gate 0 before/after, `npm run verify`
  green — zero disclosure gaps, first clean review since the 031
  correction. Monolith 8,475→8,450; health holds at 76 (architecture
  capped). No PATCH-033 drafted, per instruction; next per §7 is the 14
  JSX UPDATE sites (now choosing among the honest/best-effort command
  flavors per site's own legacy contract, the same analysis discipline
  031/032 established), then the lone select and the auth trio.
- **2026-07-10** — PATCH-032 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K eighth application) after making the two
  owner-requested rulings. RULING 1 (bare-awaited cluster, 7 sites/6
  handlers): two new command-internal-swallow siblings
  (`canvas.updatePostMetadataBestEffort` stamped +
  `canvas.updatePostMetadataUnstampedBestEffort`) extend the standing P3
  swallow family 4→6 sites, each pinned by a dedicated "resolved failure
  still returns ok" test; resolved errors swallowed inside the commands
  (the legacy bare-await fact), thrown exceptions escape via
  defineCommand and each call site's cause-unwrap throw reproduces the
  exact legacy path (rollback catch / empty catch / unhandled rejection /
  callers' catches). Settle-order ruled: FAIL-FAST PRESERVED EXACTLY —
  every legacy Promise.all element becomes an async wrapper throwing on
  !ok, so the batch rejects at the first thrown-mode failure with the
  original error object; the only timing note (builders fire at subscribe
  vs wrappers at map) is same-tick and ruled a non-deviation. RULING 2
  (check-and-branch pair `changeCardColor`/`pinPost`): AUTHORIZED
  behavior micro-change, the program's second after 024 — resolved-error
  branch byte-identical; thrown mode repaired from silent unhandled
  rejection + stranded optimistic state onto the SAME existing
  toast+fetchData branch (P3: report failures honestly); honest
  `updatePostMetadata`, no swallow (legacy read these errors). The two
  rulings produce ONE coherent slice: all nine remaining named-function
  UPDATE sites — the category goes EXTINCT (padlets UPDATE 23→14, all
  JSX). 45/45 bound tests green at authoring; all nine swap shapes
  tsc --strict verified; edit simulated (monolith 8,475→8,450 measured —
  the hand-sum said −24, the simulation measured −25, bound from the
  measurement); NEW self-verification step: all three final hashes
  RECONSTRUCTED from the spec's own fences and matched the bound values
  (the 031-review lesson applied at authoring — the spec now proves its
  own internal consistency). No PATCH-033 drafted — no split needed.
- **2026-07-10** — PATCH-031 landed and reviewed: **PASSED** (commit
  `7b19ed8`, second review pass — see the correction below). The
  honest-contract padlets UPDATE slice — six named-function metadata
  writes (`handleWallReorder`, `createRealPostFromDraft`, `commitPadletMeta`,
  `toggleCropToGrid`, `lockPadlet`, `movePadletLayer`) — extracted onto
  `canvas.updatePostMetadata` (four sites) and a new sibling command
  `canvas.updatePostMetadataUnstamped` (two UNSTAMPED sites, `lockPadlet`/
  `movePadletLayer`, over 028's already-tested `updateMetadataUnstamped`
  repo method — zero infra changes). All three bound hashes matched
  exactly (CanvasClient, posts.ts, posts.test.ts), all six CanvasClient
  bound blocks byte-identical to the spec fences, full census/byte-untouched
  gates/`git status`/grandfather all confirmed, unit 160/24, tsc clean,
  boundaries clean, e2e 27/27 (reviewer's own server via `PW_BASE_URL`),
  port gate 0 before/after, `npm run verify` green — all re-run
  independently. Named UPDATE census 15→9 (total padlets UPDATE 29→23);
  bonus extinction: the file's one double-quoted `.from("padlets")` site
  is now gone (1→0), closing the site-map census-correction trap for
  good. No standing-decision extension (the two swallow sites deferred,
  not repaired here). Monolith 8,499→8,475; grandfather 2→2 — health
  holds at 76 (architecture capped).
  **Correction to the first review pass:** the CTO's initial pass
  wrongly reported "NEEDS FIX" against `posts.test.ts`, comparing the
  implementation to a STALE LOCAL SCRATCH COPY cached before the spec's
  §3 was edited out-of-band (the owner revised the bound test block to a
  leaner form after authoring, updating the spec's own declared hash to
  match). The implementation was correct and byte-identical to the live
  spec throughout; Codex correctly declined to manufacture a
  hash-equivalent variant and reported "no edits made, worktree clean"
  instead of complying with the wrong instruction. Verdict reversed once
  the CTO re-read the live spec's own §3/§5.0 and confirmed the
  implementation matched it exactly — recorded as the measurement-
  instrument family's eleventh variant in LESSONS_LEARNED. No PATCH-032
  drafted, per instruction; next per §7 is a ruling ①on the swallow-family
  sites (needs a P3-family command + settle-order decision) and ②on the
  check-and-branch pair (needs an authorized micro-change ruling), before
  either can be sliced.
- **2026-07-10** — PATCH-030 landed and reviewed: **PASSED** (commit
  `e87fcc4`, review re-ran every bound gate independently). The
  `addImageToLink` storage pair + its paired `canvas.updatePostMetadata`
  write extracted onto Pattern H's existing gateway and the posts
  aggregate — THREE scoped files, ONE bound block, no infra changes.
  All three bound `git hash-object` hashes matched exactly (CanvasClient,
  posts.ts, posts.test.ts), and the three must-not-change infra hashes
  (postsRepository.ts/.test.ts, storage.ts) confirmed byte-untouched.
  Storage category confirmed EXTINCT in CanvasClient (`supabase\.storage`
  2→0). Unit 157/24, tsc clean, boundaries clean, e2e 27/27 (reviewer's
  own server via `PW_BASE_URL`), port gate 0 before/after, `npm run
  verify` (typecheck+boundaries+unit+production build) all green — every
  gate re-run by the reviewer, none accepted on the implementer's report
  alone. No standing-decision extension (zero new swallows; the
  gateway's three-argument upload call was pre-ruled, not a deviation).
  Monolith 8,504→8,499; grandfather 2→2 — health holds at 76 (architecture
  capped). No PATCH-031 drafted, per instruction; next slice per §7 is the
  15 named-function UPDATE sites, reusing `canvas.updatePostMetadata`
  where the shape matches.
- **2026-07-10** — PATCH-030 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — Pattern K sixth application and the narrowest yet:
  THREE scoped files, ONE bound CanvasClient block, one thin command,
  zero infra changes, zero new casts). Fifth CanvasClient strangler
  group: the `addImageToLink` cluster — the two `supabase.storage`
  calls swap onto the EXISTING Pattern H `createStorageGateway()`
  (upload's Result-with-cause mapping reproduces both legacy failure
  modes; the three-argument upload call is established 017 gateway
  behavior, pre-ruled), and the paired `{ metadata, updated_at }` write
  becomes `canvas.updatePostMetadata` over 028's already-tested
  `updateMetadata` method. The storage CATEGORY goes extinct in
  CanvasClient (2→0), and the new command is the deliberate trunk
  investment for the dominant metadata-write shape across the remaining
  29 UPDATE sites — later slices become mechanical reuse. Group choice
  per the owner's narrow-and-safe brief: the JSX UPDATE sites stay
  untouched, the lone select is read-phase work and forms no seam
  alone, the auth trio is GPT-5.5 territory and deferred. Bound tests:
  36/36 green at authoring (3 new + the 33 existing posts tests,
  extension proven non-breaking); suite 154/24 → 157/24; e2e 27/18
  unchanged; grandfather 2→2; monolith 8,504→8,499, blank 724→723 —
  all simulation-measured, hash gates bound for the three changed files
  AND the three must-not-change infra files (postsRepository + test,
  storage.ts). The simulation caught its third authoring defect in
  three patches: the pre-derived `supabase.storage` extinction gate
  printed 1, not 0, because the UNESCAPED grep dot matches the new
  import's `supabase/storage` path — gate rebound with the escaped
  form; tenth measurement-instrument variant, recorded. No PATCH-031
  drafted — no split needed; next slice is the owner's call.
- **2026-07-10** — PATCH-029 landed and reviewed: **PASSED** (commit
  `4d28b76`, GPT-5.4). The primary gate this review was the new hash
  class: all five bound `git hash-object` byte-identity hashes
  (CanvasClient + all four lib files) MATCHED EXACTLY against the
  reviewer's own independently-run `git hash-object` — meaning the
  implementer's tree is byte-for-byte identical, including every EOL
  byte, to the CTO's authoring-time simulation. This is the strongest
  fidelity confirmation of any patch in the chain: every one of the
  16 CanvasClient blocks, the import rewrite, and all four lib files
  landed with zero deviation, not even whitespace. `git ls-files
  --eol` confirmed LF-only on all five. Byte-untouched gates (
  PostCardContent, FreeformPadletCards, board/sections trunks, the
  exemplar, core/supabase, eslint config) all empty-diff. TypeScript
  and boundaries clean. Unit 154/24 confirmed exactly as bound; e2e
  untouched 27/18. Full §7.1 census re-run and matched on every line,
  including the two collision-derived counts (`createPostsRepository:
  25`, `.value as any: 4`). Direct read of the committed diff confirms
  the scheduler swallow commands are command-internal (Results ignored
  on purpose, matching the bound `posts.ts` exactly) and all three
  compensation semantics (wall no-cleanup, horizontal-all cleanup,
  columns commented-cleanup) preserved byte-for-byte. **Standing
  decision entry extended**: the canvas-seam swallow family now names
  FOUR sites (`reorderSections`, `setChronoMode`,
  `attachPostToSchedulerContainer`, `createSchedulerContainerWithPost`).
  The implementer's one reported deviation (`.next` vendor-chunk
  corruption requiring a stop/delete/restart/rewarm cycle before full
  Playwright passed) is an environment note, not code drift — no
  disclosure gap this review, the first fully clean delivery since the
  hash-gate class was introduced. Architecture axis stays capped at 20
  — health holds at 76. No PATCH-030 drafted, per instruction; next
  group per site map §7 is the owner's call among the remaining
  `padlets` UPDATE slices (30, 18 in the JSX region), the lone select,
  the storage pair, and the auth trio.
- **2026-07-10** — PATCH-029 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** under Pattern K, fifth application — 46 bound unit tests
  (21 new + the 25 existing posts tests re-run to prove the second
  extension non-breaking) compiled and run GREEN at authoring; scratch
  tsc --strict clean; all 11 distinct call-site swap shapes
  compile-verified, including the family's typing crux: insert rows are
  `Padlet`-typed interface locals with no index signature, so the input
  schema is `z.custom<object>` — record-typed inputs would have forced
  a cast at every call site). Fourth CanvasClient strangler group: the
  COMPLETE `padlets` INSERT family (19 sites / 12 handlers) becomes SIX
  commands extending the posts aggregate — INSERT goes extinct like
  DELETE did. The two unconditional cascade pairs became single
  commands per the site-map rule (`createContainerWithPost`,
  `groupPostIntoContainer` — the latter pulls the famous unstamped
  parentId update, pinned by an `Object.keys === ['metadata']` infra
  test); the three container-after-child flows stay COMPOSED at the
  call sites because the second payload is built from the first
  statement's returned row and failure compensation calls the HOOK
  helper `deletePadletByIdRaw` (three different compensation semantics
  preserved byte-for-byte: wall no-cleanup, horizontal-all cleanup,
  columns commented-cleanup). Biggest find: the SCHEDULER SILENT-SWALLOW
  CLUSTER — five bare-awaited insert/update statements across three
  handlers that never read resolved errors — preserved as two
  command-internal swallows (`attachPostToSchedulerContainer`,
  `createSchedulerContainerWithPost`), swallow-family sites 3 and 4;
  the standing owner-decision entry must be EXTENDED at review
  closeout. Five named casts (four `value as any` relocating supabase's
  implicit any, one relocated metadata cast). Line-budget ruling: five
  NEW blocks bound in compact single-line-call form so the over-ceiling
  file SHRINKS (8,507→8,504 measured on the simulation; a naive
  multi-line binding would have GROWN it +7 and violated rule 3).
  NEW GATE CLASS: bound `git hash-object` byte-identity gates for all
  five final files — the post-edit CanvasClient hash comes from the
  CTO's full edit simulation, closing the PATCH-028 line-count
  cancellation gap (owner-requested); the simulation also corrected the
  CTO's hand-summed net line movement (−3, not −2) — the edit-simulation
  rule paying out a second time. Suite 133/24 → 154/24; e2e stays
  27/18; grandfather 2→2; padlets sites 52→31. No PATCH-030 drafted —
  029 is one complete table-operation family, no split needed.
- **2026-07-10** — PATCH-028 landed and reviewed: **PASSED** (commit
  `0964195`, GPT-5.4). All 19 review-focus points independently
  re-verified. Scope exact: 5 files touched, matching the spec's list
  precisely (`git show --stat` confirms zero new files). `posts.ts`
  diff is pure additions (zero `-` lines); the other three lib files'
  removed lines match §7.1's enumeration exactly (6/2/6 lines,
  nothing else) — the posts aggregate was EXTENDED, not duplicated,
  confirmed by full-file byte comparison against the bound fences for
  `posts.ts`, `postsRepository.ts`, and `postsRepository.test.ts`
  (exact matches). CanvasClient's full diff matches all seven bound
  OLD→NEW blocks plus the import block exactly — every other line in
  the 8,507-line file is untouched, confirmed by diffing the complete
  commit patch line-by-line against the spec's bindings.
  PostCardContent, FreeformPadletCards, the board/sections trunks, the
  unconsumed `lib/domain/boards/repository.ts` exemplar, and
  `eslint.boundaries.config.mjs` all diffed byte-empty against the
  parent commit. `deleteMapPinContainer`'s container leg (the
  `deletePadletByIdRaw` hook call at line 2790) confirmed untouched —
  the hook layer stays out of scope. All four commands verified
  faithful by direct read of the committed `posts.ts`: honest Results
  throughout (no domain-level swallowing — the two console-swallows
  live only at the CanvasClient call sites, logging the unwrapped
  cause byte-identically to the legacy message), the
  `deleteContainerChild` cascade's first-failure-wins ordering intact,
  the wholesale metadata write and verbatim `childPadletIds`
  pass-through preserved, the one relocated cast exactly as bound.
  Census: unit 133/24 (was 117/24, file count unchanged — confirms the
  extension-only, no-new-files claim), e2e untouched 27/18,
  TypeScript and boundaries clean, every §7.2 derived count matched
  including `createPostsRepository: 9` (the import-line collision the
  CTO caught at authoring). All five files confirmed LF-only
  (`git ls-files --eol`), matching the implementer's disclosed
  mixed-EOL-then-normalized process note. **One undisclosed deviation
  found and accepted**: `posts.test.ts` dropped one interior blank
  line (between the last `const …Calls` declaration and the first
  `let …Result` in `createFakeRepository()`) while gaining a trailing
  blank line at EOF — net `wc -l` unchanged (366), so the census gate
  passed by coincidence while the byte-for-byte content differs from
  the binding. Whitespace-only, zero behavior effect (test count and
  all assertions unaffected), but the implementer's report claimed "no
  final code/spec deviations remain" — ruled ACCEPTED per the standing
  disclosure-gap precedent (PATCH-018/021/025), and logged as a new
  LESSONS_LEARNED variant since it defeats a line-count gate by
  cancellation, a new sub-shape of the family. No PATCH-029 drafted,
  per instruction.
- **2026-07-10** — PATCH-028 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** under Pattern K, fourth application — 25 bound unit tests
  (16 new + the 9 existing posts tests, proving the extension is
  non-breaking) compiled and run GREEN against the bound implementation
  at authoring; scratch tsc --strict clean; all six handler-swap shapes
  compile-verified). Third CanvasClient strangler group: the COMPLETE
  `padlets` DELETE family (8 sites / 6 handlers) becomes FOUR commands
  (`canvas.deletePost`/`deletePosts`/`deleteChildPosts`/
  `deleteContainerChild`) EXTENDING the existing posts aggregate —
  padlets IS the posts table, so P6 rules the methods onto
  `PostsRepository`, making this the first extension-only Pattern K
  patch: NO new files; all four lib files bound as whole files with the
  expected diff enumerated (posts.ts pure additions, the other three
  touch only listed import/type lines). Group choice over INSERT (19)
  and UPDATE (33): smallest cluster, and a delete's entire semantics is
  its WHERE clause — the exact thing a unit test pins; zero payload
  construction, zero consumed .select() results, lowest side-effect
  density; the two JSX-region sites are plain statement swaps. Cascade
  rulings recorded (§0.4): the unconditional UPDATE+DELETE pair is ONE
  command per site map §7 (pulling its update out of the UPDATE census,
  33→32); the two CONDITIONAL parent+children cascades are composed
  from thin commands at the call site because merging would change DB
  traffic — a conscious, documented adjustment of §7's sketch. TWO
  child-cascade console-swallows preserved at the call sites with
  cause-unwrapped logging (byte-identical messages) — deliberately NOT
  command-internal swallows, so no standing-decision extension. New
  authoring discipline this patch: the CTO applied all seven bound
  blocks to a scratch copy and ran EVERY derived post-edit gate against
  the simulation before binding — which caught one derivation error
  (the createPostsRepository count is 9, not 8: the import line is a
  substring collision), continuing the measurement-instrument lesson
  family. Monolith 8,517→8,507; blank census 727→726 (one interior
  blank leaves with §6g's OLD block, bound); grandfather 2→2; suite
  117/24 → 133/24 (files unchanged — no new files); e2e stays 27/18.
  One relocated legacy cast (§0.6, the 027 idiom). No PATCH-029 drafted
  — 028 is the complete table-operation family, no split needed.
- **2026-07-10** — PATCH-027 landed and reviewed: **PASSED** (commit
  `261d36e`, GPT-5.4). All 18 review-focus points independently
  re-verified: boards-update family stayed scoped to its four sites;
  CanvasClient diff touched only the four bound handler blocks
  (import block + §5a-§5e), nothing else in the 8,517-line file moved;
  FreeformPadletCards, PostCardContent, canvas hooks, the posts and
  sections trunks, eslint.boundaries.config.mjs, and the unconsumed
  `lib/domain/boards/repository.ts` exemplar all diffed byte-empty
  against the parent commit; `board.ts` confirmed a sibling aggregate
  in the one canvas folder family, no competing repository family;
  `CanvasBoardRepository` naming holds the P6 collision apart from the
  exemplar's `BoardRepository`. All four commands verified faithful:
  map-style toast-and-return with no `updated_at` (dedicated
  `updateSettings` method, infra test pins `Object.keys === ['settings']`);
  background's `Object.assign(error, {scope:'background'})` preserved
  via the bound re-throw and its one authorized `as object` cast;
  board-cover's wholesale metadata overwrite preserved exactly;
  chrono-mode's silent resolved-error swallow preserved and tested
  ("preserves the legacy error-swallow"). All 15 bound tests present
  and re-run GREEN (10 domain + 5 infra); committed test files diffed
  against the CTO's original scratch-tested copies — only import-
  specifier lines differ, as expected. TypeScript clean, boundaries
  clean (`npm run check:boundaries`), full unit suite 117/24 (was
  102/22), full e2e untouched 27/18. Line count 8,518→8,517 confirmed;
  EOF blank line's trailing bytes checked directly (`}\n\n`) — exact,
  not undisclosed drift. Grandfather untouched 2→2. Both reported
  implementer deviations (curl warm-up switched to plain GET; a
  transient EOF-blank miscount self-corrected before commit) are
  environment/process notes only, no code-level undisclosed change —
  second fully clean disclosure in the review chain. **Standing
  decision entry extended**: the reorderSections error-swallow queue
  item now names TWO sites (`reorderSections` + `setChronoMode`).
  Architecture axis stays capped at 20 (no credit expressible for
  further shrink, per the PATCH-026 ruling) — health holds at 76. No
  PATCH-028 drafted this turn per instruction; next group per site map
  §7 is the owner's call among the remaining `padlets` DELETE/INSERT/
  UPDATE families, the storage pair, and the auth trio.
- **2026-07-10** — PATCH-027 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** under Pattern K, third application — fifteen bound unit
  tests compiled and run GREEN against the bound implementation at
  authoring, scratch tsc --strict clean, all four handler-swap shapes
  compile-verified incl. the one new `as object` cast in the
  scope-annotated re-throw). Second CanvasClient strangler group: the
  COMPLETE `boards` update family (4 sites / 4 handlers) becomes FOUR
  commands on the canvas trunk, with `board.ts` the third sibling
  aggregate. **P6 collision ruling:** the PATCH-003 exemplar
  `lib/domain/boards/repository.ts` (BoardRepository — lifecycle reads +
  softDelete) measured at ZERO importers and ZERO implementations; it is
  a different concern, stays byte-untouched (gated), and the new
  interface is named `CanvasBoardRepository` to keep them unconfusable.
  Full-call-site reads surfaced THREE different legacy error semantics
  across the four handlers, each preserved and bound: map-style
  toast-and-return, background's `Object.assign(error, {scope})`
  annotated throw (preserved via a bound re-throw), and chrono-mode's
  SILENT ERROR-SWALLOW — the second member of the reorderSections defect
  family (never destructures the response; queued, review closeout must
  extend the standing decision entry). Also preserved as a typed fact:
  the map-style write sends NO updated_at (dedicated `updateSettings`
  repository method + an infra test asserting the payload's only key is
  'settings'). Monolith 8,518 → 8,517; grandfather 2→2; suite 102/22 →
  117/24; e2e stays 27/18. Authoring verification: site-map numbers
  regenerated live (1062/1159/4068/4311 — the map's pre-026 numbers are
  stale by construction); all four bound OLD blocks byte-diffed against
  the tree; every census number measured incl. the currentSettings 2→3
  and backgroundResult 0→3 collision traces. No PATCH-028 drafted — 027
  is the complete table family, no split needed.
- **2026-07-10** — PATCH-026 landed and reviewed: **PASSED** (commit
  `24bdf94`, GPT-5.4). The board_sections write family is fully off
  CanvasClient's shoulders and onto the canvas trunk as five commands
  (`canvas.createSection`/`renameSection`/`deleteSection`/
  `swapSectionPositions`/`reorderSections`), `sections.ts` confirmed a
  true sibling aggregate beside `posts.ts` (zero cross-references, one
  canvas folder family). Both risky semantics verified byte-exact against
  the bound source AND covered by dedicated passing tests: the swap's
  sequential stop-on-first-error, and the reorder's PRESERVED legacy
  error-swallow (now tracked as a standing queued decision above, not
  lost to a patch file). All gates independently re-run at review: four
  new files byte-identical to bindings (sizes 137/115/234/158 exact);
  CanvasClient diff matches all six bound edits exactly, including the
  blank-line binding and zero dependency-array drift; EOL audit all-LF
  both sides, zero flips; every numeric gate exact incl. the grandfather
  identity-pattern held at 2; unit **102/22**; tsc 0; boundaries clean;
  full Playwright **27/27** on the reviewer's own server (port confirmed
  free, banner read, `//auth/dashboard` pre-warmed — independently
  reproducing Codex's cold-start diagnosis as environmental, not a
  regression); stopped-server gate 0; `npm run verify` green incl.
  production build. **Monolith SHRANK for the first time: CanvasClient
  8,526 → 8,518 lines.** Disclosure quality note: this delivery's three
  reported deviations were all accurate and complete — no additional
  undisclosed line found, the first fully clean disclosure record in the
  024/025/026 review chain. Health **holds at 76** — architecture is
  already at its 20/20 ceiling (set in the PATCH-025 entry), so the
  monolith's first-ever shrink is real evidence with no room left to
  register it numerically (same capped-axis ruling as PATCH-019/020/021);
  no other axis moved (no telemetry/runbook, no user-facing feature, no
  new inheritance artifact, and a clean disclosure record is the baseline
  expectation, not new safety evidence). Grandfather held at 2, no credit
  sought. PATCH-027 NOT drafted — next group sequencing is the owner's
  call per site map §7.
- **2026-07-09** — PATCH-026 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** under Pattern K — seventeen bound unit tests compiled and
  run GREEN against the bound implementation at authoring, scratch tsc
  --strict clean, handler-edit shapes compile-verified against the real
  command types and BoardSection). First CanvasClient strangler group:
  the COMPLETE board_sections write family (6 sites / 4 handlers) becomes
  FIVE commands on the canvas trunk — `canvas.createSection` /
  `renameSection` / `deleteSection` / `swapSectionPositions` /
  `reorderSections` — with `sections.ts` a sibling aggregate beside
  `posts.ts` (one canvas folder family, P6; the one-trunk constraint).
  The two risky semantics are each pinned by a dedicated test: the swap's
  sequential stop-on-first-error partial failure, and the reorder
  handler's LEGACY ERROR-SWALLOW (Promise.all over raw builders, resolved
  `error` fields never read) — PRESERVED faithfully, documented in the
  bound §1 comment, and queued as a P3-family defect needing its own
  authorization. Monolith shrinks 8,526 → 8,518 (first shrink ever); NO
  grandfather movement (2→2 — no metric chasing; CanvasClient keeps its
  70 other call sites). Authoring verification: site-map line numbers
  REGENERATED against the live tree; all five bound OLD blocks byte-diffed
  against the file; the six-anchor census gate run verbatim (six
  `.from('board_sections')` lines, 3024 at 12-space indent); every census
  number measured; textual gates only (no exit codes); commit pathspec
  bound with `:(literal)` magic after measuring that the default pathspec
  treats `[id]` as a character class (the ESLint-glob lesson, git form) —
  the escaped form matches NOTHING, verified. Unit suite 85/20 → 102/22;
  e2e stays 27/18 (characterization ruling: sections aren't e2e-driven;
  board-lifecycle mounts CanvasClient live; the executable unit net is
  the fidelity net — §5.11 doctrine). No PATCH-027 drafted — 026 is the
  complete table family, no split needed.
- **2026-07-09** — PATCH-025 landed and reviewed: **PASSED** (commit
  `e2af0ef`, GPT-5.4). The canvas ops seam is OPEN and consumed end-to-end:
  `PostsRepository` + `canvas.toggleTask` (Pattern K, catalogued
  PATCH_REFERENCE §5.11), first consumer PostCardContent's todo-checkbox
  write. **Grandfather 3→2** (CanvasClient, FreeformPadletCards remain),
  earned via the measured standalone `--no-ignore` probe (1 error → 0), no
  type-only de-linting anywhere. All gates independently re-run at review:
  four new files byte-identical to bindings (fenced blocks extracted and
  diffed); component received exactly the three bound edits incl. the
  blank-line binding, all-LF before and after; unit 85/20; tsc 0;
  boundaries green; full Playwright 27/27 on the reviewer's own server
  (board-lifecycle = the render net, green); stopped-server gate 0;
  `npm run verify` green. GPT-5.4 delivered byte-perfect on first attempt
  — the Pattern-K model ruling (pre-verified bound tests make the
  economical model safe for a real write) is confirmed by outcome. One
  undisclosed deviation found by `cmp -l`: a single EOL byte (CRLF→LF on
  the config's `const` line, a mixed-EOL file) — accepted, disclosure
  chain; forensics lesson recorded (MSYS pipes strip `\r`; byte questions
  get `cmp`/`xxd` on files). Health 75 → **76** (+1 continuity: the
  CANVASCLIENT_SITE_MAP inheritance artifact is landed and
  review-verified; the 026+ trunk it sequences is now real). PATCH-026
  NOT drafted — next design decision (canvas group sequencing) is the
  owner's call per the site map §7.
- **2026-07-09** — PATCH-025 Amendment 1: two pre-edit census gates
  rebound after a correct GPT-5.4 STOP (zero edits). (1) The
  directory-absence gate bound `ls <dir>; echo $?` expecting non-zero —
  exit codes proved RUNNER-DEPENDENT (implementer's runner: 0 for the
  absent dir; CTO's Git Bash: 2 for the same absent dir); rebound to
  bound textual output (`test -e ... && echo EXISTS || echo ABSENT` →
  ABSENT, measured) + PowerShell Test-Path equivalent. New standing rule:
  gates bind printed text, never bare exit codes. (2) The grandfather
  count gate expected 3 but measures 4 — the excalidraw_fork IGNORE line
  (config L28) shares the `components/collabboard` substring; the CTO
  composed the gate from knowing the list instead of running it (sixth
  asserted-not-measured recurrence, immediately after PATCH-024
  Amendment 1 recorded the rule). Primary gate rebound to the
  identity-based pattern (3, measured), path-based count kept as
  secondary at 4 with the collision named. All post-edit gates audited —
  none reuse the broken instruments. Worktree: nothing to rule on;
  implementer resumes from the census start. Lessons extended
  (asserted-not-measured variants six and seven).
- **2026-07-09** — PATCH-025 AUTHORED (handoff-ready; **GPT-5.4
  acceptable** — ruling in the spec header: the single mutation path is
  locked by nine bound unit tests the CTO ran GREEN against the bound
  implementation at authoring time via scratch vitest, all four new files
  `tsc --strict` clean; one untestable-by-e2e call sits below the ≥2
  GPT-5.5 threshold; the repository client is IDENTITY with the legacy
  client, not merely equivalent). Design: canvas ops seam opens —
  `lib/domain/canvas/posts.ts` (PostsRepository + `canvas.toggleTask`,
  neutral naming per P7) + `lib/infra/canvas/postsRepository.ts` (narrow
  structural client, house factory idiom); first consumer is
  PostCardContent's single write (todo checkbox), three bound component
  edits with explicit blank-line bindings (PATCH-024 lesson applied);
  grandfather 3→2 EARNED (value import + runtime call both leave; no
  type-only de-linting anywhere — CanvasClient/FreeformPadletCards/hooks
  bound byte-untouched). Characterization ruling: no new e2e spec — the
  toggle path is pinned by executable unit tests (stronger than
  PATCH-020's diff-only net), the component's render path stays live in
  board-lifecycle, full suite 27/18 is Phase A baseline and Phase C
  regression net; unit suite 76/18 → 85/20. **Companion deliverable:
  `docs/CANVASCLIENT_SITE_MAP.md`** — successor-inheritance census of the
  monolith: 73 `.from(` sites (61 padlets — CORRECTS the recorded 60; site
  L2652 is double-quoted and invisible to single-quote greps — 6
  board_sections, 4 boards, 2 storage) + 3 auth; the reads live in the
  canvas HOOKS (26 more sites incl. the previously uncensused
  `canvas_lines` table), which are neither grandfathered nor lint-visible
  (proxy-metric); 23 sites below L6086 are inline-JSX handlers (different
  extraction shape); full line table + the regeneration script bound
  inline + 026+ sequencing guidance (board_sections first, cascade/pair
  writes extracted as single commands, FreeformPadletCards last). No
  PATCH-026 drafted — 025 needs no split.
- **2026-07-09** — PATCH-024 landed and reviewed: **PASSED** (commit
  `32faa80`, GPT-5.5). The plan's one authorized behavior-change patch is
  DONE: cookie-session users regain settings-root and profile (both pages
  were unusable — "Not authenticated" on every load), password's security
  emails now actually send, integrations' dead deep-scan fallback removed,
  quarantine shrunk 8→4 exports with the renumbering header correction.
  All gates independently re-run at review: both whole-file bindings
  BYTE-IDENTICAL (bindings extracted from the spec and diffed); eleven
  swaps verified in raw diffs; all numeric gates exact incl. Amendment 2's
  survivor line sets; unit 76/18; tsc 0; boundaries clean; full Playwright
  27/27 on the reviewer's own server (banner-port verified, both rebound
  specs observed the repaired states LIVE — the expected-unprobed protocol
  closed cleanly on first contact); stopped-server gate 0; `npm run
  verify` green. Two cosmetic undisclosed deviations found by byte-diff
  (spec-comment omissions in the two rewritten e2e files; one adjacent
  blank line in settings-root's bound deletion) — accepted, recorded as
  the disclosure-gap chain's next recurrence. Security flag CLOSED (see
  standing section); remaining scavenger sites (clientAuth dead tail,
  notifications page) stay queued follow-up needing their own
  authorization. Health 73 → **75** (+1 ops: standing security flag
  closed with survivors inventoried; +1 product: two user-facing pages
  repaired for the class every real user is in). Grandfather unchanged
  at 3. Next per plan: PATCH-025 canvas ops seam design + CanvasClient
  site map (Fable-window items, by 07-12).
- **2026-07-09** — PATCH-024 Amendment 2: repo-wide extinction gates
  rebound; scope ruling = Option 1, NOT widened. GPT-5.5 correctly STOPPED
  at the post-edit census with the implementation applied and preserved
  (Phase A, expected-unprobed repaired assertions, tsc, and unit tests all
  PASSED first — the two rebound characterization specs' repaired states
  are now OBSERVED, no longer unprobed). The two extinction gates were
  bound "expected empty" without running the patterns on the pre-edit tree
  (fifth asserted-not-measured recurrence — this time the CTO generalized
  "quarantine centralization is complete" from the settings vertical to
  the whole repo). Survivors, both pre-existing and byte-untouched:
  `lib/imports/clientAuth.ts` (live, session-first cascade + dead
  deep-scan tail) and the notifications page's in-page `getAccessToken`
  (silent push-registration no-op for cookie users) — see security-flag
  Addendum 5 for the inventory correction + queued follow-up patch. Gates
  rebound to exact measured survivor line sets (6 / 4 lines,
  any-other-line = failure) + byte-untouched diff gate on both files —
  survivors bound as expected output, NOT excluded from the pattern
  (exclusion would hide regressions in exactly the risky files). Worktree
  ruling: KEEP the in-flight worktree; resume from the amended post-edit
  gates. Lesson extended in LESSONS_LEARNED ("expected empty" is a count;
  measure repo-wide claims on the repo).
- **2026-07-09** — PATCH-024 Amendment 1: pre-edit importer census
  rebound. GPT-5.5 correctly STOPPED before any edit — census gate #2
  bound only the alias-form grep (`from '@/lib/infra/supabase/
  legacyToken'`) yet expected 4 files; `profilesRepository.ts` imports the
  quarantine via a RELATIVE path (`'../supabase/legacyToken'`, line 7), so
  the instrument printed 3. The intended fact (4 importer files) was
  correct and even enumerated in the gate's own comment; the instrument
  couldn't see one spelling — fourth member of the measurement-instrument
  family (wc/Measure-Object, innerText/getByText, diff/--cached). CTO
  reproduced, then measured replacement gates on the real tree: 3 alias +
  1 relative + 5 union (`legacyToken'`, which also catches the test
  file's `'./legacyToken'`; the comment-only mentions in
  workspaceMembers/passwordSecurity write `legacyToken.ts` with no
  trailing quote and stay invisible — verified). Derived post-edit union
  gate added (5→2). No binding outside the two census blocks changed.
  Worktree ruling: nothing to rule on (zero edits); implementer resumes
  from the start of the pre-edit census. Lesson recorded in
  LESSONS_LEARNED (importer census must see every import spelling; run
  enumerated gates at authoring, don't assert them from file knowledge).
- **2026-07-09** — PATCH-024 AUTHORED (handoff-ready; **GPT-5.5 REQUIRED**
  — auth/session behavior change with two characterization specs rebound
  to repaired states that cannot exist before implementation, the owner's
  definitional GPT-5.5 criterion). This is the plan's ONE authorized
  behavior-change patch (queued since PATCH-017 Amendment 1). Design: new
  `lib/infra/supabase/sessionToken.ts` (getSession → refreshSession —
  PATCH-019's production-proven cascade minus its deep-scan step —
  plus `decodeJwtPayload`/`JwtPayload` moved verbatim); `legacyToken.ts`
  rewritten whole-file-bound down to the four surviving bearer-machinery
  exports (8→4), header corrected per the renumbering (the owner-required
  stale-PATCH-023 fix); eleven token-swap call sites bound individually
  (3 settings-root incl. two manual-atob→decodeJwtPayload upgrades, 5
  profile, 2 password, 1 integrations); unit test file renamed with its
  one import line (76/18 unchanged). Five authorized behavior changes
  enumerated exhaustively in the spec — settings-root and profile REPAIRED
  for cookie users, password's silent no-email defect repaired,
  integrations' dead deep-scan fallback removed, quarantine shrunk.
  Characterization: the two failure-state specs are REBOUND to repaired
  behavior and marked EXPECTED-UNPROBED with a bound STOP-and-amend
  protocol (PATCH-003 unexecuted-spec precedent — the repaired states are
  unobservable until the repair exists); integrations/password specs bound
  byte-untouched as the regression net. Authoring safeguards all applied:
  bound TS compile-verified against installed types (scratch tsc clean),
  gates derived from measured pre-edit counts, substring-collision check
  on `getSessionAccessToken` vs `getAccessToken` (not a substring —
  'Session' splits it), shell-bound numerics, stale-`.next/types` rule
  embedded, read-status-before-staging rule embedded. Share-link RLS
  explicitly deferred to its own server-side patch. Suite stays 27/18.
  Self-review pre-commit caught three spec defects: an 11-vs-12 swap-count
  slip, an unbound Phase A total (bound to 8 = 7+setup), and a
  thinking-out-loud gate comment rewritten as a clean binding.
- **2026-07-09** — PATCH-023 landed and reviewed: PASSED (commit
  `cbe529e`). Grandfather 4→3 — remaining: CanvasClient,
  PostCardContent, FreeformPadletCards (proxy-metric ruling stands; no
  type-only de-linting). All gates independently re-run: the diff is 19
  files / 0 insertions / 3,860 deletions — exactly the 18 bound files plus
  the single grandfather line; accept-route and legacyToken.ts
  byte-untouched across the whole episode (diffed 4bace8f→cbe529e);
  no migrations, no package changes; both trees at 0 files; the one
  surviving `app/collabboard` reference is the bound comment line; tsc 0,
  boundaries clean, vitest 76/18, `--list` 27/18 unchanged, both ports 0.
  Both deviations accepted: PS 5.1 has no `&&` (sequential reruns, intent
  preserved), and the tsc failure was stale `.next/types` route stubs —
  GPT-5.4 diagnosed generated-state-not-source correctly, fixed by
  stop-server → delete `.next` → restart → re-probe → rerun (new §6 rule +
  lesson). **Incident, CTO's own, recorded honestly:** the Amendment-1
  docs commit (`5c3e15f`) bundled Codex's staged 18 deletions into an
  unauthorized push to main — bare `git commit` commits the whole index,
  and the pre-commit `git status` showed all 18 `D` lines unread. Owner
  chose restore (`75cf480`, non-destructive) over keep-and-finish; proper
  implementation followed. New rule: in a worktree an implementer is
  using, docs commits use explicit pathspec (`git commit -- <paths>`), and
  a staged line you didn't create is a STOP signal. Health 74→73: safety
  20→19 (an unauthorized implementation reached the default branch through
  CTO process error — the axis exists to price exactly this; the correct
  recovery and same-day honesty limit the damage but do not erase the
  event). Phase-3 items recorded: drop the 7 surviving v1 tables + 5 test
  rows; the accept-route's dead block; the orphaned `update_canvas_access`
  rpc.
- **2026-07-09** — PATCH-023 Amendment 1: GPT-5.4 stopped correctly at the
  Phase B diff-stat gate (deletions staged via `git rm`, nothing
  committed) — the spec's `git diff --stat` (unstaged) is empty by
  construction once `git rm` has already staged every deletion; corrected
  to `git diff --cached --stat`. Codex independently confirmed the staged
  diff is exactly the bound 18 files, 3859 deletions, zero modifications.
  Worktree ruling: KEEP the staged deletion state, resume verification from
  the corrected command — every prior gate (Phase A probes, all five
  pre-edit census blocks, the deletion itself, post-deletion zero-counts,
  404 route probes, the one surviving comment line) stands.
- **2026-07-09** — PATCH-022 Fact-1 data census EXECUTED (CTO,
  service-role, read-only — the key never printed) and PATCH-023 (deletion)
  AUTHORED. Census: all eight v1 tables from migration 001 — `canvases` 1
  row (owner's dev-test canvas `5fb6e0a5…`, empty title, icon 🎯,
  2025-07-04), `canvas_comments` 4 rows (all the owner's own account, all
  on that same canvas, contents literally "Direct database test comment!
  🎯" / "nested comments are working!", newest 2025-07-08), five tables
  empty, `canvas_files` does not exist in the deployed DB (42P01 — schema
  drifted). **Verdict: zero user data → DELETE, per PATCH-022 Option 3.**
  Census surprises: (1) the vertical includes a v1 AUTH sub-vertical
  (login/register/forgot-password — 3 more pages, all link-orphaned), so
  the deletion is 18 files (9 pages + 9 API routes incl. a typo'd
  `collabborators` route variant); (2) the LIVE
  `app/api/invitations/accept/route.ts` reads `canvases` and upserts
  `canvas_collaborators` for canvas-scoped invitations — a 2026-03-09
  migration even retrofitted `workspace_id` onto the dead table; with zero
  real rows the block is a structural no-op and stays BYTE-UNTOUCHED
  (rule 9 — recorded as a Phase-3 item alongside the table drops and the
  now-orphaned `update_canvas_access` rpc); (3) `canvas_comments` (one of
  the three comment stores) has NO live consumers — the live comment
  systems are `metadata.comments`/`detachedComments`; the third store is
  dead-on-arrival v1, which SIMPLIFIES the Phase-3 comment consolidation.
  PATCH-023 authored PATCH-016-shaped for GPT-5.4: deletions-only diff +
  one grandfather line (4→3), all census greps dry-run-verified against
  the live repo, before/after route probes bound (Phase A records codes,
  Phase B asserts 404), suite stays 27/18, no new spec file, no table
  drops, no package removals. **Renumbering:** scavenger normalization
  023→024, canvas ops seam 024→025, strangler series 025+→026+.
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
