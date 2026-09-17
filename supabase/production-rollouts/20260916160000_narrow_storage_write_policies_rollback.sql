-- ROLLBACK for
-- supabase/production-rollouts/20260916160000_narrow_storage_write_policies.sql
--
-- READ THIS BEFORE RUNNING IT.
--
-- RUNNING THIS RE-OPENS ANONYMOUS WRITE TO STORAGE. It widens six
-- storage.objects policies back to roles an unauthenticated caller holds. After
-- running it, an ANONYMOUS caller once again has INSERT, UPDATE and DELETE over
-- the 60 objects in `padlet-files`, through "Give users access to own folder" --
-- a FOR ALL policy whose only predicate is the bucket id. Nothing else in that
-- bucket stops them: the two write policies that check auth.role() are
-- PERMISSIVE, so they OR with this one rather than constraining it.
--
-- Concretely, an anonymous caller regains the ability to:
--
--   * OVERWRITE any file in padlet-files -- every image and file attachment on
--     every board that uses the bucket;
--   * DELETE any of them;
--   * UPLOAD arbitrary new objects into the bucket.
--
-- It also re-opens anonymous INSERT on `canvas-wallpapers` and `canvas-icons`,
-- and anonymous INSERT and UPDATE on `board-backgrounds`.
--
-- THE THREE `TO anon` ONES ARE NOT A MISTAKE IN THIS FILE. Three of the six
-- were scoped `TO anon` only before the migration, so restoring them means
-- `TO anon`, not `TO public`. Widening them to `public` instead would grant
-- `authenticated` a capability it did not have before the migration either, and
-- this file's only job is to put things back exactly as they were.
--
-- THIS FILE EXISTS ONLY TO UNDO THAT ONE MIGRATION, and only if applying it is
-- shown to have broken something. It is not a maintenance tool and there is no
-- other legitimate reason to run it. If some path turns out to need anonymous
-- upload, restore THAT ONE policy for the specific bucket it needs, and record
-- why an unauthenticated caller may write there.
--
-- THIS PROJECT'S SUPABASE PLAN HAS NO POINT-IN-TIME RECOVERY, which is why the
-- undo is version-controlled rather than assumed. That it is available is not a
-- reason to reach for it.
--
-- ALTER POLICY changes only the roles: no USING or WITH CHECK clause is
-- restated here either, so widening cannot alter a predicate. No policy is
-- created, dropped or renamed.
--
-- OPERATIONAL NOTE: storage.objects is owned by supabase_storage_admin, and
-- ALTER POLICY requires membership in the owning role.
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- Group 1 -- back to `public`, which is where they were.
ALTER POLICY "Give users access to own folder" ON storage.objects TO public;
ALTER POLICY "Allow public uploads" ON storage.objects TO public;
ALTER POLICY "Allow uploads for any user" ON storage.objects TO public;

-- Group 2 -- back to `anon` ONLY, which is where they were. Not `public`.
ALTER POLICY "Allow public uploads fjopzy_0" ON storage.objects TO anon;
ALTER POLICY "Allow public uploads fjopzy_1" ON storage.objects TO anon;
ALTER POLICY "Allow public uploads on board-backgrounds" ON storage.objects TO anon;

COMMIT;
