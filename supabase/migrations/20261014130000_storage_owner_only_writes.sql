-- PATCH-359. Only the uploader can change or delete a stored file.
--
-- WHY. The owner's live snapshot (2026-10-14) shows the storage.objects UPDATE
-- and DELETE policies for five buckets check ONLY `bucket_id`. Any registered
-- user could therefore delete or overwrite any other user's uploaded files
-- through the Storage API: post images, Kanban attachments, board thumbnails and
-- backgrounds. PATCH-358 already blocks GUESTS; this closes the hole for every
-- registered user.
--
-- HOW. Supabase Storage records the uploader on every object in
-- `storage.objects.owner_id` (text, set from the JWT `sub`). A permissive
-- policy that requires `owner_id = auth.uid()` lets a user change or delete only
-- their own uploads. An object uploaded by the SERVER (service role) has no
-- owner, so it stays manageable by the server only -- no user can touch it.
--
-- WHAT STAYS. The INSERT policies (a new upload gets a fresh timestamp/UUID
-- name, so INSERT cannot overwrite; overwriting with `upsert` needs UPDATE), the
-- public SELECT policies, the service-role policies, and PATCH-358's restrictive
-- `guest_no_storage_*` policies. `canvas-icons` has no UPDATE/DELETE policy
-- today, so nothing changes for it here.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Idempotent where possible.

BEGIN;

-- 1. DRIFT GUARD. The repo's migrations do not match the live database
-- (PATCH-357 proved that), so do not trust the six names below blindly: fail if
-- the live database has ANY other UPDATE/DELETE/ALL storage.objects policy that
-- names one of the five buckets, so nothing changes until a human re-reviews.
DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(p.policyname, ', ' ORDER BY p.policyname) INTO offending
    FROM pg_policies p
   WHERE p.schemaname = 'storage'
     AND p.tablename = 'objects'
     AND p.cmd IN ('UPDATE', 'DELETE', 'ALL')
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
         ~ '(padlet-files|thumbnails|canvas-wallpapers|board-backgrounds|canvas-icons)'
     AND p.policyname NOT IN (
       'Give users access to own folder',
       'Users can delete own files',
       'Users can delete their thumbnails',
       'Users can update their thumbnails',
       'Allow authenticated deletes',
       'Allow public uploads fjopzy_0',
       -- this migration's own policies: a re-run must pass
       'storage_owner_update',
       'storage_owner_delete'
     )
     AND p.policyname NOT LIKE 'guest_no_storage_%';

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'PATCH-359 storage owner guard: unexpected storage.objects write policies on these buckets: %. Re-review before applying.',
      offending;
  END IF;
END $$;

-- 2. Drop the six bucket-only policies, exactly by name.
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads fjopzy_0" ON storage.objects;

-- 3. One permissive UPDATE and one permissive DELETE, both requiring the object
-- to be the caller's own. `(select auth.uid())` is wrapped in a sub-select so
-- Postgres evaluates it once per statement (an initPlan), not once per row.
DROP POLICY IF EXISTS storage_owner_update ON storage.objects;
CREATE POLICY storage_owner_update ON storage.objects
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('padlet-files', 'thumbnails', 'canvas-wallpapers', 'board-backgrounds', 'canvas-icons')
    AND owner_id = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id IN ('padlet-files', 'thumbnails', 'canvas-wallpapers', 'board-backgrounds', 'canvas-icons')
    AND owner_id = (select auth.uid())::text
  );

DROP POLICY IF EXISTS storage_owner_delete ON storage.objects;
CREATE POLICY storage_owner_delete ON storage.objects
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    bucket_id IN ('padlet-files', 'thumbnails', 'canvas-wallpapers', 'board-backgrounds', 'canvas-icons')
    AND owner_id = (select auth.uid())::text
  );

-- 4. SELF-CHECK. After the change, every UPDATE/DELETE/ALL policy on these five
-- buckets must check owner_id, except PATCH-358's restrictive guest policies
-- (which only ever REMOVE access and are AND-ed on top). Anything else rolls the
-- whole transaction back.
DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(p.policyname, ', ' ORDER BY p.policyname) INTO offending
    FROM pg_policies p
   WHERE p.schemaname = 'storage'
     AND p.tablename = 'objects'
     AND p.cmd IN ('UPDATE', 'DELETE', 'ALL')
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
         ~ '(padlet-files|thumbnails|canvas-wallpapers|board-backgrounds|canvas-icons)'
     AND p.policyname NOT LIKE 'guest_no_storage_%'
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) NOT ILIKE '%owner_id%';

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'PATCH-359 storage owner guard: these storage.objects write policies still do not check owner_id: %',
      offending;
  END IF;
END $$;

COMMIT;
