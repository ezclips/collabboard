-- Migration: Tighten share_links row-level policies now that
-- SUPABASE_SERVICE_ROLE_KEY is confirmed set in production.
--
-- The app's share-link routes (app/api/share-link/route.ts,
-- app/api/share-link/padlet/route.ts, app/share/[token]/page.tsx) all use the
-- service role client, which bypasses RLS entirely -- so these row policies
-- only govern *direct* REST access via the public anon/authenticated key,
-- which no legitimate app feature does (confirmed: nothing in the codebase
-- queries share_links by created_by or lists a user's own links directly).
--
-- Column-level grants from 20260706_fix_blanket_permissive_policies.sql
-- (hiding password_hash, restricting UPDATE to access_count/last_accessed_at)
-- stay in place as defense-in-depth underneath these row policies.

DROP POLICY IF EXISTS "Anyone can create share links" ON "public"."share_links";
DROP POLICY IF EXISTS "Anyone can read share links" ON "public"."share_links";
DROP POLICY IF EXISTS "Anyone can update share links" ON "public"."share_links";

CREATE POLICY "share_links_select_own"
ON "public"."share_links" FOR SELECT
TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "share_links_insert_own"
ON "public"."share_links" FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "share_links_update_own"
ON "public"."share_links" FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "share_links_delete_own"
ON "public"."share_links" FOR DELETE
TO authenticated
USING (created_by = auth.uid());
