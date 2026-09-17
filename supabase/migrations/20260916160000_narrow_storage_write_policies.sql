-- NARROW_STORAGE_WRITE_POLICIES_1: stop anonymous INSERT, UPDATE and DELETE on
-- the storage buckets.
--
-- THE FINDING. storage.objects carries 27 policies. Four of them target the
-- `padlet-files` bucket, and because PERMISSIVE policies OR together, the
-- weakest one governs:
--
--   "Files are publicly accessible"   SELECT  PUBLIC  (bucket_id = 'padlet-files')
--   "Give users access to own folder"  ALL    PUBLIC  (bucket_id = 'padlet-files')
--   "Users can delete own files"      DELETE  PUBLIC  (... AND auth.role() = 'authenticated')
--   "Users can upload files"          INSERT  PUBLIC  (... AND auth.role() = 'authenticated')
--
-- The two `auth.role()` policies do gate writes. The FOR ALL policy does not:
-- its only predicate is the bucket id. anon holds SELECT, INSERT, UPDATE and
-- DELETE on storage.objects, so that one policy gave an unauthenticated caller
-- INSERT, UPDATE and DELETE over every one of the 60 objects in the bucket.
-- Reads are public by design -- it is a public bucket -- but the destructive
-- half is not, and the two policies written to prevent it were simply outvoted.
--
-- THE OBVIOUS FIX IS IMPOSSIBLE, AND THAT IS THE IMPORTANT PART. The policy's
-- name promises an ownership check, but the data cannot express one:
--
--   object names in padlet-files : 1752415519838_tjql1hjyn.png -- flat, no
--                                  user prefix, no folder of any kind
--   owner / owner_id             : null on every sampled object
--
-- There are no folders, so `storage.foldername(name)[1] = auth.uid()` would
-- match nothing; there is no recorded owner, so `owner = auth.uid()` would
-- match nothing. A predicate cannot be "restored" here because it never existed
-- in the data. Writing one would not tighten the policy, it would disable the
-- bucket. So this migration NARROWS THE EXPOSURE AND RECORDS THE OWNERSHIP GAP.
-- It does not pretend to fix it.
--
-- WHAT REMAINS TRUE AFTER THIS MIGRATION: any AUTHENTICATED user can still
-- overwrite or delete any other user's file in padlet-files. Closing that needs
-- a data-model decision -- set `owner` on upload and check `owner = auth.uid()`,
-- or move to an `{auth.uid()}/` path prefix that new uploads follow while the
-- existing flat objects get an explicit rule -- and it is its own unit.
--
-- ------------------------------------------------------------------------
-- THE SIX, IN TWO GROUPS. The distinction matters and is not cosmetic.
-- ------------------------------------------------------------------------
--
-- GROUP 1 -- currently scoped `TO public`. `authenticated` is already inside
-- PUBLIC, so narrowing to `authenticated` removes ONLY anon. Provably no change
-- for any other role:
--
--     "Give users access to own folder"    ALL     padlet-files
--     "Allow public uploads"               INSERT  canvas-wallpapers
--     "Allow uploads for any user"         INSERT  canvas-icons
--
-- GROUP 2 -- currently scoped `TO anon` ONLY. Narrowing to `authenticated`
-- removes anon AND HANDS `authenticated` A CAPABILITY IT DID NOT HAVE. That is
-- a deliberate correction, not a side effect: an anonymous uploader is not a
-- user, and if writing a board background belongs to anyone it belongs to a
-- signed-in caller. It is called out here because it is the one place this
-- migration grants rather than only removes:
--
--     "Allow public uploads fjopzy_0"             UPDATE  board-backgrounds
--     "Allow public uploads fjopzy_1"             INSERT  board-backgrounds
--     "Allow public uploads on board-backgrounds" INSERT  board-backgrounds
--
-- The `fjopzy_*` suffixes are Supabase-dashboard-generated names, and two of
-- these three are duplicates of one another. They are NOT renamed or dropped
-- here: this migration changes roles and nothing else.
--
-- ------------------------------------------------------------------------
-- WHAT IS NOT TOUCHED.
-- ------------------------------------------------------------------------
-- The public READ policies stay exactly as they are and remain reachable by
-- anon -- public buckets are public on purpose:
--
--     "Files are publicly accessible", "Allow public read",
--     "Allow public downloads", "Allow public read access",
--     "Allow public read access on canvas-icons",
--     "Public read ai-component-assets", "Public read import previews",
--     "Public thumbnail access"
--
-- The two `auth.role()`-gated padlet-files policies also stay `TO public`: they
-- already deny anon through their own predicate, and rescoping them would be a
-- change this migration has no evidence for.
--
-- ALTER POLICY CHANGES ONLY THE ROLES. No USING or WITH CHECK clause is
-- restated anywhere below. Restating an expression is how a "role-only" change
-- silently becomes a predicate change; the source guard forbids it.
--
-- OPERATIONAL NOTE: storage.objects is owned by supabase_storage_admin. ALTER
-- POLICY requires membership in the owning role. Apply as a role that has it.

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
