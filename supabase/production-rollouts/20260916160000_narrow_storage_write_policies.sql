-- PRODUCTION ROLLOUT -- stop anonymous writes to storage buckets.
--
-- SOURCE: supabase/migrations/20260916160000_narrow_storage_write_policies.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for the full finding;
-- the short version is:
--
--   * `padlet-files` carried a FOR ALL policy scoped `TO public` whose only
--     predicate was the bucket id. Permissive policies OR together, so it
--     outvoted the two `auth.role()`-gated write policies and handed an
--     anonymous caller INSERT, UPDATE and DELETE over all 60 objects;
--   * that policy's NAME promises an ownership check the DATA CANNOT EXPRESS:
--     object names are flat with no user prefix, and `owner` is null
--     throughout. So the exposure is narrowed, not repaired;
--   * six policies move to `authenticated`. Three were `TO public`, where that
--     removes only anon. THREE WERE `TO anon` ONLY, where it also grants
--     `authenticated` a capability it did not have -- deliberate, and the one
--     place this rollout gives rather than only takes away.
--
-- STILL TRUE AFTERWARDS: any AUTHENTICATED user can overwrite or delete any
-- other user's file in padlet-files. That is the recorded ownership gap and it
-- needs its own unit.
--
-- OPERATIONAL NOTE: storage.objects is owned by supabase_storage_admin, and
-- ALTER POLICY requires membership in the owning role. Apply as a role that has
-- it, or the statements will fail with "must be owner of table objects".
--
-- VERIFY WITH:
--   20260916160000_narrow_storage_write_policies_verify.sql
-- UNDO WITH (read its header first):
--   20260916160000_narrow_storage_write_policies_rollback.sql
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- Group 1 -- `TO public` today, so this removes anon and nothing else.
ALTER POLICY "Give users access to own folder" ON storage.objects TO authenticated;
ALTER POLICY "Allow public uploads" ON storage.objects TO authenticated;
ALTER POLICY "Allow uploads for any user" ON storage.objects TO authenticated;

-- Group 2 -- `TO anon` today, so this also grants `authenticated` a capability
-- only anonymous callers had. Deliberate; see the header.
ALTER POLICY "Allow public uploads fjopzy_0" ON storage.objects TO authenticated;
ALTER POLICY "Allow public uploads fjopzy_1" ON storage.objects TO authenticated;
ALTER POLICY "Allow public uploads on board-backgrounds" ON storage.objects TO authenticated;

COMMIT;
