# Architecture

The honest audit of what exists, the target architecture, and the migration path. This is the root architecture document; SYSTEM_DESIGN.md, DATABASE.md, REALTIME_ARCHITECTURE.md, and STATE_MANAGEMENT.md elaborate subsystems.

## 1. Current State — Audit (July 2026)

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind 4 + Radix · Supabase (Postgres + Auth + Realtime + Storage) · Stripe · vendored Excalidraw fork.

### 1.1 Subsystem verdicts

| Subsystem | State | Verdict |
|---|---|---|
| Canvas engine | **Two parallel systems**: `components/canvas/*` + `app/dashboard/canvas/[id]` and `components/collabboard/canvas/*` + `app/collabboard/canvas/[id]`, with duplicated layouts, duplicated `CanvasSetupPage` (1,537 and 956 lines) | 🔴 Consolidate to one |
| Board client | `CanvasClient.tsx`: **8,526 lines, ~38 useState hooks, 105 Supabase references** — routing, data access, realtime, DnD, and rendering for every layout in one file | 🔴 God component; decompose |
| Freeform canvas | `FreeformPadletCards.tsx` 6,368 lines; `DrawingLayout.tsx` 2,794 lines; separate Excalidraw fork with its own collab stack | 🔴 Same disease |
| Kanban | Fully parallel vertical: own routes, own 1,788-line store, own `kanban_*` tables, own Supabase adapter | 🟠 Working but violates P1/P6 |
| Data model | Core tables sane (`canvases`, `canvas_sections`, `canvas_items`, …) but JSONB `metadata` absorbs whole features; comments live in 3 shapes; kanban is a schema island | 🟠 See DATABASE.md |
| Migrations | Non-linear numbering (`001…003`, `120260710`, `2026xxxx`), 4 `live_schema_dump*.sql` snapshots, 7 ad-hoc `supabase_*.sql` files in repo root | 🔴 Schema drift; source of truth unclear |
| Realtime | Per-canvas `postgres_changes` channel; last-write-wins; no presence protocol outside Excalidraw fork | 🟠 Fine to ~10 editors; not a moat |
| Permissions | Clean type model (`types/permissions.ts`), RLS policies exist (22 in migration 001), `lib/auth/permissions.ts`, rate limiting present | 🟢 Best subsystem; extend, don't rewrite |
| AI pipeline | `lib/ai` with contracts, mode registry, validators, golden prompts, test scripts | 🟢 Genuinely good structure |
| Testing | Playwright installed; **zero committed tests**; ad-hoc `test-*.js` scripts in root | 🔴 See TESTING.md |
| Repo hygiene | Backup files, dev logs, `tsc_output.txt`, `*_not_working_*.tsx`, `.pre-cleanup-backup` files committed; "backup: snapshot" commits on master | 🟠 Cheap to fix, do first |

### 1.2 The core architectural flaw

**There is no domain layer.** UI components talk to Supabase directly (105 call sites in one file), which means: business rules are duplicated per layout, realtime handling is re-implemented per surface, permissions are re-checked ad hoc, and every new layout copies the whole stack. This — not any individual big file — is why files got big.

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────┐
│ Layout plugins (wall/grid/timeline/map/kanban/      │
│ freeform/gantt/…) — pure views, registered           │
├─────────────────────────────────────────────────────┤
│ Board Engine (one)                                   │
│  • BoardStore (client state, zustand)                │
│  • SyncEngine (optimistic ops, offline queue)        │
│  • SelectionModel · DnDModel · CommentModel (one)    │
├─────────────────────────────────────────────────────┤
│ Domain layer  lib/domain/*                           │
│  • Repositories (boards, posts, comments, members)   │
│  • Commands (createPost, movePost, …) — the ONLY     │
│    code allowed to write to the database             │
├─────────────────────────────────────────────────────┤
│ Infrastructure                                       │
│  • Supabase (Postgres + RLS, Auth, Storage)          │
│  • Realtime service (broadcast channels → dedicated  │
│    sync service at scale, SYSTEM_DESIGN.md)          │
└─────────────────────────────────────────────────────┘
```

Non-negotiable rules of the target:

1. **One board engine.** Layouts are plugins implementing a `LayoutPlugin` interface (render, hit-testing, position codec, DnD adapter). Adding a layout touches zero engine code.
2. **UI never imports `supabase-js`.** All reads via repositories, all writes via commands. Enforced by ESLint `no-restricted-imports` outside `lib/domain` and `lib/infra`.
3. **Writes are operations, not row updates.** `movePost(postId, target)` — an op — is applied optimistically to the store, queued, persisted, and broadcast. This one abstraction buys undo/redo, offline, realtime, and audit history simultaneously.
4. **One content model.** Posts are block trees (Notion-style); layout-specific data (kanban column, map coords, timeline date) lives in per-projection placement records, not in forked schemas. (DATABASE.md §Target)

## 3. Challenged Decisions

Decisions I audited and **challenge**:

- **Two canvas systems** — accidental, not strategic. Kill `components/canvas/*` or `components/collabboard/canvas/*` after feature diff; do not maintain both another quarter.
- **Kanban as a separate vertical** — understandable experiment; wrong long-term. Fold into placements model in Phase 3. Until then: feature-freeze divergence.
- **dhtmlx-gantt/scheduler** — GPL/commercial dual license, jQuery-era API, 2 MB+ of bundle. Replace with a layout plugin over our own engine or buy licenses consciously (SECURITY.md §Licensing).
- **moment + dayjs both** — drop moment (it's only pulled by react-big-calendar patterns; use the dayjs localizer).
- **Excalidraw fork's private collab stack** — acceptable now; must be bridged to our SyncEngine before we advertise multiplayer drawing.

Decisions I audited and **endorse**:

- Supabase as the platform through ~100k MAU (SYSTEM_DESIGN.md has the exit ramps).
- Next.js App Router + React 19.
- Radix + Tailwind 4 + CVA for the design system.
- The `lib/ai` contract/registry/validator structure — this is the pattern the rest of the codebase should copy.
- RLS as the permission floor.

## 4. Migration Strategy — Strangler, not rewrite

A big-bang rewrite is rejected: the product surface is too broad and revenue-adjacent. Instead:

1. **Freeze the disease** (week 1): ESLint bans on new direct Supabase calls in components; file-size ceiling on touched files; delete dead/backup files from the repo.
2. **Extract the domain layer** (Phase 1): move the 105 Supabase call sites from `CanvasClient.tsx` into repositories/commands *without changing behavior*. Characterization tests via Playwright first (TESTING.md).
3. **Carve layouts out** of `CanvasClient.tsx` one at a time behind the `LayoutPlugin` interface, starting with the simplest (wall), ending with freeform.
4. **Unify comments** onto `canvas_comments` (memory: currently split across `metadata.comments` / `detachedComments` with three UI systems) — first real test of the domain layer.
5. **Swap sync** under the domain layer (postgres_changes → broadcast ops) with zero UI changes — possible only because of step 2.

Full sequencing with exit criteria: ROADMAP.md.
