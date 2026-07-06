# Roadmap

Phased consolidation → differentiation → scale. Each phase has **exit criteria**; we do not start the next phase's risky work until the current one's criteria are green. Dates assume current team velocity; revisit monthly. (Today: 2026-07-06.)

## Phase 0 — Stop the Bleeding (executed 2026-07-06; three items carried)

- [x] Repo hygiene purge: ~10.9k files removed from tip incl. committed Chrome profiles; history purge pending owner approval
- [~] Migration baseline: SQL archived to `supabase/legacy/`, snapshot in `supabase/baseline/`, procedure in `supabase/BASELINE.md` — final `db diff` blocked on Docker + DB password
- [ ] ESLint boundaries → moved to Phase 1 (PATCH-002); lint decoupled from build (5,426-error burn-down tracked)
- [x] Typecheck zero errors; production build repaired; CI workflow ready (inert until a remote exists); smoke tests green
- [ ] Telemetry: Sentry + web-vitals RUM + `board_open_ms` — **carried, do early in Phase 1**
- [x] Security quick audit: debug routes removed, orphan hardcoded-key file removed, gitignore hardened (SSRF/webhook deep-audit carried to Phase 1)
- [ ] dhtmlx licensing decision — **owner decision still open**

**Exit status:** green enough to open Phase 1; carried items stay on CURRENT_TASK.md and do not block the characterization net.

## Phase 1 — Domain Layer & Characterization Net (4–6 weeks; opened 2026-07-06)

Work proceeds via numbered patches in `.fable5/patches/` (see SKILL.md / CTO_GUIDELINES.md).
Planned early sequence: PATCH-001 characterization harness → PATCH-002 ESLint boundary
freeze → PATCH-003 domain-layer skeleton (`lib/domain`, Result type, first repository)
→ PATCH-004+ command-by-command extraction from `CanvasClient.tsx`.

- [ ] Playwright characterization suite for current behavior (TESTING.md §1 flows 1–6) — started with PATCH-001
- [ ] `lib/domain`: repositories + commands; move all 105 `CanvasClient.tsx` data call sites behind them, behavior-preserving
- [ ] `BoardStore` + `BoardUiStore` (zustand); `CanvasClient.tsx` → < 1,000 lines (STATE_MANAGEMENT.md §5)
- [ ] Snapshot RPC `get_board_snapshot` — board open in one round trip
- [ ] Decide the surviving canvas system (`components/canvas` vs `components/collabboard/canvas`) after a feature diff; freeze the loser
- [ ] "Padlet" naming purge in code + `padlets` table rename plan queued

**Exit:** no direct DB calls from components in the board path; characterization suite green before/after every extraction PR.

## Phase 2 — One Engine, Real Multiplayer (6–10 weeks)

- [ ] `LayoutPlugin` interface + registry; extract layouts from the monolith one at a time: wall → columns → row → timeline → map (COMPONENT_GUIDELINES.md §2)
- [ ] SyncEngine: op-based writes, IndexedDB offline queue, optimistic apply + rollback
- [ ] Transport switch: Broadcast channels + Presence (drop `postgres_changes` and the `canvas_presence` table); channel auth (PERMISSIONS.md §4)
- [ ] Presence UX: avatars, live cursors, "editing…" hints, change attribution (REALTIME_ARCHITECTURE.md §6)
- [ ] Undo/redo across all layouts (inverse ops)
- [ ] Virtualized surfaces for list/grid layouts; layout-level code splitting (PERFORMANCE.md levers 2–3)
- [ ] Realtime convergence test rig (fuzzer + two-browser suite)

**Exit:** two browsers editing one board with zero clobbering on the conflict matrix; 2,000-post board at 60 fps; board route bundle < 450 kB gz.

## Phase 3 — One Data Model (6–8 weeks)

- [ ] Blocks + placements schema; migrate per DATABASE.md §5 (comments unification **first**, then placements, then kanban fold-in)
- [ ] Comment system: one thread component, one table, notifications hooked to it
- [ ] Kanban becomes a layout plugin; `kanban_*` schema retired
- [ ] Lossless layout switching shipped as a headline feature (P1 realized — the anti-Padlet demo)
- [ ] Yjs-backed collaborative text in post editors (TipTap bindings)
- [ ] Design-system merge (`ui-kit` → `ui`), tokens, dark theme completeness; a11y P0 flows to AA (ACCESSIBILITY.md)

**Exit:** one content model in prod; migration reversibility proven on staging with prod-scale data; layout-switch demo passes on all 6 core layouts.

## Phase 4 — Differentiation (ongoing, starts when 3 is stable)

- Excalidraw fork bridged onto the op stream (drawing joins the same multiplayer)
- Post linking + board-level search + database-style views over posts (the Notion wedge)
- Template gallery, education pack (approval queue, grading, anonymous modes) — Padlet parity++
- AI: board generation, summarize/cluster posts (the `lib/ai` pipeline productized)
- Public API + webhook/plugin surface (the extensibility bet: LayoutPlugin registry opens outward)
- Mobile PWA hardening (web-push already present)

## Phase 5 — Scale (triggered by metrics, not calendar)

Triggers from SYSTEM_DESIGN.md §2: read replicas at sustained DB > 60% · dedicated sync service at > 200 concurrent editors/board or > 50k concurrent WS · CDN/media pipeline hardening with storage growth.

## Standing Rules

- Feature asks during Phases 1–3 ship **on the new architecture or not at all** — no new code on the monolith.
- Every phase runs the full characterization suite; every migration rehearses on a prod-copy first.
- Monthly: this file re-baselined; COMPETITOR_ANALYSIS.md checked quarterly.
