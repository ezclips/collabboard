-- PATCH-180. Upload size limits enforced by Storage itself.
--
-- Browser uploads (post images and files, avatars) go straight from the browser
-- to the bucket and never pass the app server, so a bucket's own file_size_limit
-- is the enforcement that holds even for an upload the application never saw.
-- The code checks in lib/domain/storage/uploadLimits.ts give the user a clear
-- message early; this is the backstop.
--
-- UPDATE, not INSERT: a bucket that does not exist is left alone. Sizes are in
-- bytes: 52428800 = 50 MiB, 5242880 = 5 MiB.
--
-- Images stay capped at 20 MB in the BROWSER only: one bucket (padlet-files)
-- holds both images and files, and Storage caps per bucket rather than per MIME
-- type, so the bucket takes the larger file limit and the browser refuses an
-- oversized image first.
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'knowledge-documents';  -- 50 MB
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'padlet-files';         -- 50 MB
UPDATE storage.buckets SET file_size_limit = 5242880  WHERE id = 'avatars';              -- 5 MB
-- Rollback: UPDATE storage.buckets SET file_size_limit = NULL WHERE id IN ('knowledge-documents','padlet-files','avatars');
