# Schema Baseline Status

**State as of 2026-07-06:** `supabase/migrations/` does NOT rebuild the live database.
Migrations were applied non-linearly and several changes went to prod via the SQL
editor or the root-level scripts now archived in `supabase/legacy/`.

## Source of truth (interim)

- `baseline/schema_snapshot_2026-07-05.sql` — pg_dump of the live schema
  (formerly `live_schema_dump_v2.sql`; the three other dumps were table-identical
  and removed). It is the authoritative local reconstruction cutoff. Treat it as
  read-only source input, not as a normal application migration.
- `legacy/` — hand-applied SQL scripts previously in repo root, kept for
  reconciliation only. Never apply these again.

## Reproducible local reconstruction

Run the bootstrap from the repository root:

```text
node scripts/db/bootstrap-local.mjs 2
```

The command verifies the Docker daemon, creates a disposable Supabase project,
loads the baseline snapshot, and applies this exact post-baseline manifest:

1. `20260710_fix_board_sections_wrong_table_rls.sql`
2. `20260713_fix_kanban_board_member_policy_recursion.sql`
3. `20260726_add_canvas_line_coord_space.sql`
4. `20260820_create_knowledge_data_foundation.sql`
5. `20260820_provision_knowledge_documents_bucket.sql`

The `120260710_fix_board_sections_wrong_table_rls.sql` file is a duplicate
archival copy and is intentionally not applied. The snapshot contains the net
effects of 20260706–20260709 and 20260711; it still has the old board-section
policies, so 20260710 is intentionally applied as the first post-baseline
repair. The bootstrap records normalized versions in Supabase's local
`supabase_migrations.schema_migrations` history.

The script provisions `uuid-ossp`, `pgcrypto`, and `postgis` in the disposable
database, starts the local API and Storage services, runs schema/core-table and
private-bucket checks, executes a Knowledge document/page/chunk/source-reference
RLS and cascade smoke test, verifies service-role PDF upload/remove plus failed
anonymous read, runs local `db lint`, then destroys the disposable project and
volumes. It never uses linked credentials, remote URLs, `db push`, or migration
repair.

`supabase/config.toml` is intentionally secret-free. Its migrations and seed
execution are disabled because direct `supabase db reset --local` would replay
the archival historical chain and hit the known `002_add_helper_functions.sql`
return-type conflict. The bootstrap script is the authoritative reconstruction
path.

## Historical chain status

Do not repair or rewrite migrations 001–003 merely to make `db reset` work. The
historical chain is archival and does not represent the live schema. The
baseline snapshot plus the explicit post-baseline manifest above is the current
rebuild strategy.

## Finishing the baseline (remote reconciliation remains separate)

1. `npx supabase db diff --linked -f baseline` — generates a migration capturing
   drift between `migrations/` and the live DB (needs Docker for the shadow DB).
2. Review the generated file; it should contain only the drift (hand-applied
   changes), not the whole schema.
3. `npx supabase migration repair` as needed so the remote migration table
   matches the local file list.
4. Verify the linked schema only through an explicitly authorized, separate
   remote-reconciliation task.
5. Delete `legacy/` and this file's interim section only after that review.

## Rules from now on (DATABASE.md §4)

- Schema changes ONLY via timestamped files in `supabase/migrations/`, applied
  with the CLI. No dashboard SQL editor, no root-level scripts.
- Every new table ships RLS + policies in the same migration.
- Migrations must be backward-compatible for one deploy (expand → migrate → contract).
