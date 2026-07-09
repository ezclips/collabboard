# PATCH-022 — CTO Decision Brief: the canvas duality and the CanvasClient strangler program

**Status:** BRIEF — decision RESOLVED same day. **Fact-1 data census
executed 2026-07-09 (CTO, service-role, read-only): zero user data — 5 rows
total, all owner dev-test debris from July 2025 (1 test canvas + 4 literal
"test comment" rows, all the owner's own account); `canvas_files` doesn't
even exist in the deployed DB (42P01). Verdict: DELETE. Deletion patch
authored as PATCH-023 (GPT-5.4, PATCH-016 shape); scavenger normalization
renumbered 023→024, ops seam 024→025, strangler series 026+. Census
surprises recorded in PATCH-023: the vertical includes a v1 AUTH
sub-vertical (3 more pages), and the LIVE invitation-accept route
references the dead tables (structural no-op — stays byte-untouched,
Phase-3 item).**
**Author:** Fable (CTO), 2026-07-09 — final Fable-window strategy document
for batch 5. Every number below was measured against the repo on
2026-07-09 (commit `ea03671` era); none are from memory.

---

## 1. Current state (measured, not recalled)

Four files remain grandfathered (boundary-lint exempt), all canvas-program:

| File | Lines | Raw Supabase surface | Client | Reachability |
|---|---|---|---|---|
| `app/dashboard/canvas/[id]/CanvasClient.tsx` | 8,526 | ~70 table call sites (60 `padlets`, 6 `board_sections`, 4 `boards`) + 2 storage + 3 auth (incl. an `auth.updateUser` at L263 writing user metadata from inside the canvas) | `supabaseBrowser()` | **LIVE** — the app's main canvas, routed via `app/dashboard/canvas/[id]/page.tsx` (14 lines) |
| `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | 6,368 | 22 table call sites (all `padlets`) | `supabaseBrowser()` | **LIVE** — sole importer is CanvasClient (a limb of the monolith) |
| `components/collabboard/PostCardContent.tsx` | 936 | EXACTLY ONE write (task-toggle: `padlets` update at ~L384) | `createClientComponentClient()` inline | **LIVE** — 22 importers across BOTH component trees (wall/row/columns/map/presentation/editors) |
| `app/collabboard/canvas/[id]/page.tsx` | 871 | 2 direct calls (realtime channel + `rpc('update_canvas_access')`) + everything else via `app/api/collabboard/*` routes | `createClientComponentClient()` | **NAV-ORPHANED** — see §2 |

Component trees: `components/canvas/*` (8 files CanvasClient imports:
WallCanvas, ColumnsLayout, ChronoTimeline, Scheduler, etc. — its ONLY
external importer is CanvasClient) and `components/collabboard/*` (~50 of
CanvasClient's 59 component imports). **The live canvas straddles both
trees.** The kanban vertical (`components/kanban-canvas` + `kanban_*`
tables) is under ACTIVE development (dozens of migrations dated
2026-02-13→17) and is not part of this decision.

## 2. The exact duality being decided

ARCHITECTURE.md line 13 calls it "two parallel systems." The census says it
is really THREE distinct facts that were being conflated:

**Fact A — a dead ROUTE vertical.** `app/collabboard/**` (hub page, canvas
page, create page, settings page, its own `CanvasSetupPage` copy, and the
`app/api/collabboard/*` routes) runs on a COMPLETELY SEPARATE data model:
`canvases` / `canvas_sections` (migration 001) — not the live app's
`boards` / `padlets` / `board_sections`. **Nothing outside `app/collabboard/**`
links to `/collabboard`** — not the dashboard, not any navbar, not
middleware. It is reachable only by typed URL or stale bookmark. This is
the abandoned v1.

**Fact B — duplicated FILES, not duplicated systems.** `components/canvas/*`
is not a rival canvas engine; it is 8 layout files the LIVE CanvasClient
imports alongside ~50 collabboard-tree components. The real duplication is
per-file: three `CanvasSetupPage` copies (`components/canvas/`,
`components/collabboard/canvas/`, `app/collabboard/canvas/`), plus obvious
debris (`brocken_WallCanvas.tsx`, `last workingCanvasSetupPage.tsx`,
`FreeformPadletCards.tsx.image-canvas-editor-temp.bak`, a `Neuer Ordner`
directory).

**Fact C — the monolith itself.** CanvasClient + FreeformPadletCards =
14,894 lines with ~92 raw call sites on the live `padlets`-family tables.
This is the actual strangler target and exists REGARDLESS of what happens
to Facts A and B.

**The decision the owner must make is Fact A: delete, keep, or freeze the
collabboard route vertical.** Facts B and C have obvious directions that do
not depend on taste — only on sequencing.

## 3. Options considered (Fact A)

**Option 1 — delete `app/collabboard/**` + `app/api/collabboard/*` now.**
Precedent: PATCH-012/016 census-gated orphan deletions. BUT: unlike
AddPadletMenu (an unimported component), this vertical is ROUTED — orphan
census by import-tracing cannot prove no user reaches it, and CLAUDE.md
rule 10 (never lose user work) applies to whatever rows exist in
`canvases`/`canvas_sections`. Deleting the only UI over that data strands
it — exactly what rule 9 forbids doing opportunistically.

**Option 2 — keep and extract it like any other page.** Rejected: ~871
page lines + 4 API routes + an rpc + realtime, all on a dead data model,
extracted onto seams nothing else will ever consume. Pure waste of the
remaining patch budget.

**Option 3 — data census first, then a conditional deletion patch.**
Owner runs (service-role, read-only):
```sql
select count(*) from canvases;
select count(*) from canvas_sections;
select max(updated_at) from canvases;
```
- **If zero rows (or only owner-created test rows):** delete the vertical
  in one census-gated patch — pages, API routes, its `CanvasSetupPage`
  copy, and the `update_canvas_access` rpc's client caller. Grandfather
  4→3. GPT-5.4-able with a bound census (the PATCH-016 shape, plus a
  route-level "nothing links here" proof bound into the spec).
- **If real data exists:** freeze the vertical (no extraction, no
  deletion), record it as a data-migration item for Phase 3, and the
  grandfather row stays until then. No UI work.

## 4. Recommended direction

**Option 3, with an explicit lean to deletion** — every architectural
signal (nav-orphaned, separate dead schema, v1 naming, zero shared
consumers) says this is abandoned; the only thing missing is proof the
DATA is abandoned too, and that proof is one read-only SQL query away. Do
not skip the query; do not let the deletion ride any other patch.

For Facts B and C (no owner decision needed, sequencing only):

1. **PATCH-023 (already queued, unrelated prerequisite):** scavenger
   normalization — unchanged by this brief.
2. **PATCH-024 — canvas ops seam.** `lib/domain/canvas` +
   `lib/infra/canvas`: a `padlets` repository with the FIRST domain
   command `canvas.toggleTask`, consumed by PostCardContent's single write
   site. This is deliberately the smallest possible live-canvas extraction
   (one write, 22 importers all receiving the same component back,
   Grandfather 4→3 or 3→2 depending on Fact-A sequencing). Its spec must
   decide Result-shape vs raw-passthrough at authoring — note that unlike
   Patterns I/J pages, PostCardContent's error handling is a bare
   `console.error`, so a real domain command with `DomainError.cause`
   passthrough is viable here without toast-text risk.
3. **PATCH-025+ — CanvasClient site-map program.** Swap sites in GROUPS by
   table+operation (the 60 `padlets` sites collapse into far fewer
   operation shapes: create/update-fields/update-metadata/delete/select),
   each group one patch, each patch reusing the PATCH-024 repository.
   FreeformPadletCards LAST (its 22 sites are the same `padlets`
   operations — by then the facade exists and the swap is mechanical).
   The `auth.updateUser`-from-canvas site and the 2 storage sites get
   their own micro-patches (auth mutation + Pattern H reuse respectively).
4. **File-duplication cleanup (Fact B)** rides AFTER the route decision:
   survivor designation per duplicate pair is a CTO/owner call, then each
   deletion is a PATCH-016-shaped census-gated micro-patch. The debris
   files (`brocken_`, `.bak`, `last working…`, `Neuer Ordner`) can go in
   the same patch as their directory's survivor designation.

## 5. Risks and tradeoffs

- **The proxy-metric trap (highest risk, new finding):** BOTH monolith
  files' only `@supabase/*` imports are TYPE imports (`User`, `Session`);
  their ~92 call sites ride `@/lib/supabase/browser`, an internal alias
  the boundary lint does NOT ban. A §5.5 type-only swap would remove both
  files from the grandfather list while extracting NOTHING — the metric
  would read "done" with the monolith untouched. **Binding guidance: the
  grandfather count is hereby demoted from goal to proxy for these two
  files.** No type-only de-linting patch may be authored for them; they
  leave the list only when their call sites actually move. When the last
  consumer is extracted, extend the lint to ban `@/lib/supabase/browser`
  and `@/lib/supabase` in `components/**`/`app/**` so the freeze becomes
  real again.
- **Sequencing risk:** deleting the collabboard vertical changes
  PostCardContent's importer count and the grandfather arithmetic; run the
  Fact-A patch BEFORE 024 if the query says empty, so 024's census is
  written against the post-deletion tree.
- **Realtime/collab semantics in CanvasClient** (channels, presence) are
  NOT covered by any current pattern — they stay in-page until a dedicated
  design (Phase 2's REALTIME_ARCHITECTURE.md work), same ruling as
  Pattern F's escalation clause.
- **Characterization ceiling:** canvas mutations ARE e2e-exercisable
  (unlike members/password — the e2e account owns its boards), so the
  untestable-surface argument that forced GPT-5.5 on 020/021 mostly does
  NOT apply; the risk shifts to sheer diff volume instead.

## 6. What must NOT change yet

- CanvasClient/FreeformPadletCards internals beyond the bound call-site
  swaps of an approved patch; no file splits, no "tidying" (800-line rule
  explicitly waived for these two until Phase 3).
- The kanban vertical (active development — coordinate with the owner
  before ANY patch touches `kanban*`).
- The three comment stores (CLAUDE.md rule 9; Phase 3).
- `app/collabboard/**` — untouched until the data census verdict.
- The Excalidraw fork.
- No lint-config changes except the bound grandfather-line removals.

## 7 & 8. Patch shapes and model assignment

| Work item | Shape | Model | Why |
|---|---|---|---|
| Fact-A data census | 3 read-only SQL queries | **Owner** | service-role, production data |
| Collabboard vertical deletion (if empty) | PATCH-016-shaped orphan deletion, census-gated, route-level proof bound | GPT-5.4 | mechanical once the census is bound; deletion diffs are self-evident |
| PATCH-024 ops seam + PostCardContent | first canvas domain command + repository | **GPT-5.5** | first-of-kind seam; 22 importers depend on the component staying identical; spec is CTO-authored with compile-checked bindings |
| CanvasClient site-group swaps (025+) | grouped call-site swaps reusing 024's repository | **GPT-5.5 first group, then judge** | volume risk; if group 1 lands with zero deviations, later mechanical groups may drop to GPT-5.4 with CTO census |
| FreeformPadletCards swap | same operations, last | GPT-5.5 | limb of the monolith, 22 sites in one file |
| auth.updateUser-from-canvas, storage sites | micro-patches | GPT-5.5 | credential/storage mutation |
| Duplicate-file survivor designation | decision | **CTO/owner** | product judgment |
| Duplicate/debris deletions | census-gated micro-patches | GPT-5.4 | PATCH-016 shape |
| Realtime/presence extraction | not yet designed | **CTO-only design** | no pattern covers it |

## 9. Characterization & census strategy before the first canvas patch

- **Net before knife:** the only canvas characterization today is
  board-lifecycle (wall). Before PATCH-024: add a task-toggle
  characterization (create e2e board → post with tasks → toggle → assert
  persisted state → cleanup within the run), which is a SAFE mutation (the
  e2e account owns the board) — bind quota discipline (≤3 active boards,
  cleanup even on failure) into the spec. Before each 025 group: one
  characterization per operation group on an e2e-owned board, probed
  first, exact texts bound.
- **Census strategy for CanvasClient:** the multi-line-chain lesson is
  BINDING — `grep -c "supabase\."` sees 15 of ~70+ table sites because
  chains split across lines. Every 025-group spec censuses per
  table+method with `grep -n "\.from('padlets'"` style anchors PLUS a
  full-function read of each site (PATCH-009 rule: bind the filter chain
  and consumed fields, not the select string). The site MAP (every call
  site enumerated with line anchor, operation shape, and target group) is
  the 025 prerequisite artifact and gets its own CTO document — it is the
  successor's inheritance, not a per-patch throwaway.

## 10. Standing lessons that BIND every canvas patch

From PATCH-018–021, non-negotiable in every future canvas spec:
1. Warm `/dashboard/canvas/[id]` before any full e2e run (682 kB, heaviest
   route; board-lifecycle participates in every suite).
2. One client at a time against the dev server; read the startup banner
   port (silent :3001 fallback) before pointing anything at :3000.
3. Board-creation failures → diagnose e2e quota via DB (`deleted_at IS
   NULL` count vs `FREE_PLAN_BOARD_LIMIT = 3`) before suspecting code.
   Canvas patches create boards constantly — this will recur.
4. Every numeric gate binds its producing command AND shell (Git Bash vs
   PowerShell `Measure-Object` counts differ).
5. Probe with `getByText`/raw `textContent`, never `.innerText()` — canvas
   UI is full of Tailwind `uppercase` badges.
6. Report every off-spec line or number — including whitespace-only lines;
   "no runtime effect" is the reviewer's conclusion to draw.
7. Compile bound TypeScript at authoring time (scratch file against the
   installed vendor types); bound block comments are code — no `**/x`
   globs inside `/* */`; copy vendor field optionality from the installed
   `.d.ts`, never from memory.
8. No unscoped locators — canvas pages render MANY tables/lists/cards;
   every locator scopes to a section/heading/testid anchor.
9. Every post-edit count gate = measured pre-edit count + bound additions
   − bound deletions; canvas identifiers (`padlets`, `boards`, `canvas`)
   are maximally collision-prone substrings in these files.

## Conclusion

**No Codex-ready patch is authorized by this brief.** The gate is the
owner's Fact-A data census (three read-only SQL queries). After the
verdict: if empty → a GPT-5.4 deletion patch (CTO-authored, PATCH-016
shape) runs first; either way, PATCH-024 (ops seam + PostCardContent) is
the next CTO-authored implementation spec and does not depend on the
Fact-A outcome except for census arithmetic. PATCH-023 (scavenger
normalization) remains queued and unaffected.
