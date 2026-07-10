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
| 037+ | CanvasClient strangler, remaining groups: auth trio (GPT-5.5 REQUIRED — existing seams `currentUser.ts`/`authState.ts` + one small updateUser command); then hooks (26 read sites, extending the posts aggregate's read surface begun by 036's `findMetadataById`); FreeformPadletCards LAST; realtime/presence CTO-only, undesigned | per-group; Pattern K where bound tests can carry semantics | site map §7 is the sequencing source |

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
