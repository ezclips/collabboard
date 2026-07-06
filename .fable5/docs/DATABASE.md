# Database

Postgres (Supabase). Current schema audit, target model, and migration discipline.

## 1. Current Schema — Audit

Core (migration 001): `canvases`, `canvas_sections`, `canvas_items`, `canvas_collaborators`, `canvas_comments`, `canvas_activity`, `canvas_files`, `canvas_presence` — a sane spine, with RLS from day one (22 policies). Plus: a `padlets` table written to directly from the client, a full parallel `kanban_*` table set, and freeform graph tables.

### Findings

| # | Finding | Severity |
|---|---|---|
| D1 | **Migration history is not a source of truth.** Numbering is non-linear (`001…003`, `120260710_fix…`, `2026xxxx_*`), four `live_schema_dump*.sql` snapshots exist, and 7 ad-hoc `supabase_*.sql` files sit in repo root — some presumably applied to prod by hand. Nobody can rebuild the database from `supabase/migrations` alone. | 🔴 |
| D2 | **Comments in three shapes:** `metadata.comments` (JSONB on items), `detachedComments`, and the `canvas_comments` table — 199 code references across the split. Threads can't be queried, counted, or notified uniformly. | 🔴 |
| D3 | **Kanban schema island:** `kanban_cards/columns/links/comments/votes/…` duplicate concepts that exist for canvas items (comments, ordering, assignees). Two permission systems, two comment systems, two orderings. | 🟠 |
| D4 | **JSONB `metadata` as a junk drawer:** whole features (comments, line labels/colors/points, workspace settings) landed as untyped JSONB + root-level SQL patches. No schema validation on write. | 🟠 |
| D5 | `canvas_presence` as a table — presence is ephemeral; rows churn and bloat. Move to Realtime Presence (in-memory) in Phase 2. | 🟡 |
| D6 | Naming: `padlets` table and "padlet" terminology in schema — legal + clarity issue (P7). | 🟡 |

## 2. Target Model — "block tree + placements"

The schema that makes P1 (layout is a view) true:

```sql
boards        (id, workspace_id, title, active_layout, settings jsonb, created_by, …)
posts         (id, board_id, author_id, created_at, deleted_at, …)     -- the unit users see
blocks        (id, post_id, parent_block_id, type, content jsonb,      -- Notion-style content
               order_key text)                                          -- fractional index
placements    (id, post_id, layout text, section_id, x, y, w, h,
               order_key text, props jsonb)                             -- per-layout position
sections      (id, board_id, layout, title, order_key)                  -- columns/lanes/shelves
comments      (id, post_id, block_id?, parent_comment_id?, author_id, body, …)  -- ONE system
reactions     (id, post_id, user_id, kind)
board_ops     (id bigserial, board_id, actor_id, op jsonb, version)     -- append-only op log
```

Key decisions:

- **`placements` is the load-bearing idea.** A post has one placement per layout it has appeared in. Switching layouts reads/creates placements; nothing is destroyed. Kanban's column = a `sections` row + placement `order_key`; map = placement `props.lng/lat`; timeline = placement date. The `kanban_*` island migrates onto this and gets deleted.
- **Fractional ordering everywhere** (`order_key` text, generateKeyBetween): concurrent reorders don't conflict. Kanban's `order_index → numeric` migration was the right instinct; text-based keys are the durable version.
- **JSONB is allowed only inside a zod-validated envelope** per `blocks.type` / `placements.props`. Every JSONB write goes through a command that validates (coding rule; also CHECK constraints for critical invariants).
- **Soft delete** (`deleted_at`) on posts/blocks/comments with 30-day retention (P3).
- **`board_ops`** gives undo/audit/activity feed from one mechanism; `canvas_activity` folds into it. Prune/snapshot beyond N days.

## 3. Query Discipline

- Board open = **one RPC** (`get_board_snapshot(board_id)`) returning board + sections + posts + blocks + placements + comment counts in a single round trip. Never N+1 from the client (today `CanvasClient` issues many independent queries).
- Dashboard lists are paginated (`limit`/keyset) — audit current dashboard queries for unbounded selects.
- Indexes to guarantee: `placements(board_id, layout)`, `blocks(post_id, order_key)`, `comments(post_id)`, `board_ops(board_id, version)`.

## 4. Migration Discipline (mandatory from now)

1. `supabase/migrations` is the **only** source of truth. Root-level `supabase_*.sql` files: reconcile into a baseline migration, then delete.
2. **Phase 1 first act:** `supabase db diff` against prod → commit as `20260706000000_baseline.sql`; delete the four `live_schema_dump*` files.
3. Timestamp-named migrations only, applied via CLI, never via dashboard SQL editor.
4. Every migration is backward-compatible for one deploy (expand → migrate → contract) so deploys stay zero-downtime.
5. Every table ships with RLS enabled + policies in the same migration (SECURITY.md).

## 5. Data Migration Plan (Phase 3, after domain layer exists)

1. Dual-write comments to `canvas_comments`/`comments` while backfilling from `metadata.comments`/`detachedComments`; flip reads; delete JSONB copies. (First, because it's the worst user-facing inconsistency.)
2. Backfill `placements` from current per-layout position fields; flip layouts one at a time (they're plugins by then).
3. Migrate `kanban_*` → posts/sections/placements; freeze kanban schema changes immediately until then.
4. Rename `padlets`/`canvases` → `boards` last (mechanical, big blast radius; do it when tests exist).
