# Schema Baseline Status

**State as of 2026-07-06:** `supabase/migrations/` does NOT rebuild the live database.
Migrations were applied non-linearly and several changes went to prod via the SQL
editor or the root-level scripts now archived in `supabase/legacy/`.

## Source of truth (interim)

- `baseline/schema_snapshot_2026-07-05.sql` — pg_dump of the live schema
  (formerly `live_schema_dump_v2.sql`; the three other dumps were table-identical
  and removed). Treat this as read-only reference, not as an executable migration.
- `legacy/` — hand-applied SQL scripts previously in repo root, kept for
  reconciliation only. Never apply these again.

## Finishing the baseline (requires Docker + DB password; blocked 2026-07-06)

1. `npx supabase db diff --linked -f baseline` — generates a migration capturing
   drift between `migrations/` and the live DB (needs Docker for the shadow DB).
2. Review the generated file; it should contain only the drift (hand-applied
   changes), not the whole schema.
3. `npx supabase migration repair` as needed so the remote migration table
   matches the local file list.
4. Verify: `npx supabase db reset` on a fresh local instance rebuilds a schema
   identical to `baseline/schema_snapshot_2026-07-05.sql` (diff the dumps).
5. Delete `legacy/` and this file's interim section once step 4 passes.

## Rules from now on (DATABASE.md §4)

- Schema changes ONLY via timestamped files in `supabase/migrations/`, applied
  with the CLI. No dashboard SQL editor, no root-level scripts.
- Every new table ships RLS + policies in the same migration.
- Migrations must be backward-compatible for one deploy (expand → migrate → contract).
