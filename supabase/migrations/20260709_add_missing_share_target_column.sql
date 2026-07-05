-- Migration: Add the missing share_links.share_target column.
--
-- app/api/share-link/route.ts inserts and reads a `share_target` field
-- ('post' | 'board' | 'post-in-board', see components/collabboard/editors/ShareModal.tsx),
-- but the live share_links table has no such column -- meaning any share-link
-- creation request that includes it fails outright with a PostgREST
-- "column not found" error. This isn't a security gap, but it's a real
-- functional break for the share-target feature; adding the column here
-- rather than touching app code, since the app code already matches the
-- intended feature design.

ALTER TABLE "public"."share_links"
  ADD COLUMN IF NOT EXISTS "share_target" "text" DEFAULT 'post-in-board'::"text";

ALTER TABLE "public"."share_links"
  DROP CONSTRAINT IF EXISTS "share_links_share_target_check";

ALTER TABLE "public"."share_links"
  ADD CONSTRAINT "share_links_share_target_check"
  CHECK ("share_target" = ANY (ARRAY['post'::"text", 'board'::"text", 'post-in-board'::"text"]));

-- share_target isn't sensitive like password_hash; grant it the same as the
-- other non-sensitive columns from 20260706_fix_blanket_permissive_policies.sql's
-- column-level lockdown (it didn't exist yet when that migration ran).
GRANT SELECT ("share_target") ON "public"."share_links" TO "anon", "authenticated";
