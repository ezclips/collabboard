-- PATCH-361. Profile pictures can be uploaded again.
--
-- WHY. A live probe (2026-10-14) found uploading to the `avatars` bucket as a
-- signed-in user returns 403 "new row violates row-level security policy". The
-- owner's snapshot shows `avatars` is a public bucket with NO storage.objects
-- policy at all, so every avatar AND workspace-logo upload fails for everyone.
--
-- The app uploads with `upsert: true`, and every object name carries the
-- uploader's own user id:
--   * `avatars/avatar_<userId>_<ts>.<ext>` (Settings -> Profile)
--   * `avatars/<userId>.<ext>`               (profile dropdown)
--   * `avatars/logos/workspace_logo_<userId>_<ts>.<ext>` (Settings -> workspace)
-- So the INSERT policy requires the caller's id to appear in the object name:
-- nobody can pre-create `avatars/<someone-else>.png`.
--
-- GUESTS stay blocked: PATCH-358's restrictive `guest_no_storage_*` policies are
-- AND-ed on top of these permissive ones, so a guest is refused regardless.
-- This is the same owner model as PATCH-359: an object is the caller's own when
-- `storage.objects.owner_id` matches the JWT `sub`.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Idempotent where possible.

BEGIN;

-- 1. DRIFT GUARD. The repo's migrations do not match the live database, so fail
-- if the live database already has ANY other storage.objects policy that names
-- the avatars bucket -- nothing changes until a human re-reviews.
DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(p.policyname, ', ' ORDER BY p.policyname) INTO offending
    FROM pg_policies p
   WHERE p.schemaname = 'storage'
     AND p.tablename = 'objects'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ILIKE '%avatars%'
     AND p.policyname NOT IN (
       'avatars_insert_own_name',
       'avatars_select_own',
       'avatars_update_own',
       'avatars_delete_own'
     );

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'PATCH-361 avatars upload guard: unexpected storage.objects policies mention the avatars bucket: %. Re-review before applying.',
      offending;
  END IF;
END $$;

-- 2. INSERT: only a name that carries the caller's own id. `position(sub in str)`
--    is the SQL substring test. This is what stops a pre-created
--    `avatars/<someone-else>.png`.
DROP POLICY IF EXISTS avatars_insert_own_name ON storage.objects;
CREATE POLICY avatars_insert_own_name ON storage.objects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND position((select auth.uid())::text in name) > 0
  );

-- 3. SELECT: the caller's own objects. `upsert: true` needs to read the object it
--    may overwrite. Public display uses the public-bucket URL and needs no
--    policy, so this does not make other users' avatars unreadable by the app.
DROP POLICY IF EXISTS avatars_select_own ON storage.objects;
CREATE POLICY avatars_select_own ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND owner_id = (select auth.uid())::text
  );

-- 4. UPDATE (the upsert overwrite) and DELETE: the caller's own objects only.
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND owner_id = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND owner_id = (select auth.uid())::text
  );

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND owner_id = (select auth.uid())::text
  );

COMMIT;
