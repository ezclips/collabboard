# PATCH-361 — Profile pictures can be uploaded again

## Why
Live probe (2026-10-14): uploading to the `avatars` bucket as a signed-in user returns
403 "new row violates row-level security policy". The owner's snapshot shows `avatars`
is a public bucket with NO `storage.objects` policy at all, so every avatar and workspace
logo upload fails for everyone. The owner asked for this to be fixed.

App upload paths (all upsert: true; each name contains the uploader's user id):
- `app/dashboard/settings/profile/page.tsx`: `avatars/avatar_<userId>_<ts>.<ext>`;
- `components/UserProfileDropdown.tsx`: `avatars/<userId>.<ext>`;
- `app/dashboard/settings/page.tsx`: `logos/workspace_logo_<userId>_<ts>.<ext>`.

## Design
New migration `supabase/migrations/20261014150000_avatars_upload_policies.sql`, one transaction:

1. **Drift guard:** if any `storage.objects` policy already mentions `'avatars'`
   (other than the four names below), `RAISE EXCEPTION` naming it, so nothing changes.
2. Four PERMISSIVE policies `TO authenticated`, each dropped if it exists first:
   - `avatars_insert_own_name` FOR INSERT WITH CHECK
     `bucket_id = 'avatars' AND position((select auth.uid())::text in name) > 0`.
     A user can only create files whose name carries their own id, so nobody can
     pre-create `avatars/<someone-else>.png`.
   - `avatars_select_own` FOR SELECT USING
     `bucket_id = 'avatars' AND owner_id = (select auth.uid())::text`. Upsert needs
     SELECT on the object; public display uses the public-bucket URL and needs no policy.
   - `avatars_update_own` FOR UPDATE, USING and WITH CHECK
     `bucket_id = 'avatars' AND owner_id = (select auth.uid())::text`.
   - `avatars_delete_own` FOR DELETE USING the same.
3. Header comment: why (the probe); guests stay blocked by PATCH-358's restrictive
   `guest_no_storage_*`; same owner model as PATCH-359.

Source test `lib/infra/storage/avatarsUploadMigration.test.ts`: the four policies,
the insert name check, the owner checks, the drift guard.

## Allowed files
The migration and its test. No apply, no git.

## Verification (PM, live, after the owner applies)
- The owner uploads `avatars/avatar_<own id>_<ts>` with upsert → 200; uploads again
  (upsert overwrite) → 200.
- The owner uploads `avatars/<another id>.png` → refused.
- The owner deletes their own file → 200.
- Real UI: Settings → Profile → change picture → the new picture shows (screenshot);
  then put the owner's original picture back, or tell the owner.
