# PATCH-359 — Only the uploader can change or delete a stored file

## Why
The owner's live snapshot (2026-10-14) shows that the `storage.objects` UPDATE and DELETE
policies for five buckets check ONLY `bucket_id`. Any registered user can therefore
delete or overwrite any other user's uploaded files through the Storage API: post
images, Kanban attachments, board thumbnails and backgrounds. Guests are already
blocked by PATCH-358; this patch closes the hole for registered users. The owner asked
to fix it before presence.

Live policies to replace (exact names):

| Policy | Command | Bucket |
|---|---|---|
| `Give users access to own folder` | ALL | padlet-files (bucket check only) |
| `Users can delete own files` | DELETE | padlet-files (+ `auth.role()='authenticated'`) |
| `Users can delete their thumbnails` | DELETE | thumbnails |
| `Users can update their thumbnails` | UPDATE | thumbnails |
| `Allow authenticated deletes` | DELETE | canvas-wallpapers |
| `Allow public uploads fjopzy_0` | UPDATE | board-backgrounds |

Kept as they are: the INSERT policies (a new upload gets a fresh name with a timestamp
or UUID, so INSERT cannot overwrite; overwriting with `upsert` needs UPDATE), the public
SELECT policies, the service-role policies, and PATCH-358's restrictive guest policies.
`canvas-icons` has no UPDATE/DELETE policy today, so nothing changes for it.

## Design
Supabase Storage records the uploader on every object (`storage.objects.owner_id`, text,
set from the JWT `sub`). Admin (service-role) uploads have no owner and stay manageable
by the server only. So:

New migration `supabase/migrations/20261014130000_storage_owner_only_writes.sql`, one transaction:

1. **Drift guard first.** A `DO` block lists every `storage.objects` policy whose command
   is UPDATE, DELETE or ALL, whose expression mentions one of `padlet-files`,
   `thumbnails`, `canvas-wallpapers`, `board-backgrounds` or `canvas-icons`, and which is
   not one of the six names above or the PATCH-358 `guest_no_storage_*` policies. If any
   exist, `RAISE EXCEPTION` naming them, so nothing changes (the repo does not match
   live; PATCH-357 proved that).
2. Drop the six policies (`DROP POLICY IF EXISTS`, exact names, quoted).
3. Create two PERMISSIVE policies `TO authenticated`:
   - `storage_owner_update` FOR UPDATE, USING and WITH CHECK
     `bucket_id IN ('padlet-files','thumbnails','canvas-wallpapers','board-backgrounds','canvas-icons') AND owner_id = (select auth.uid())::text`;
   - `storage_owner_delete` FOR DELETE, USING the same expression.
4. **Self-check:** after the change, no UPDATE/DELETE/ALL policy on those buckets may lack
   `owner_id`, except the restrictive `guest_no_storage_*` ones. Otherwise `RAISE EXCEPTION`.
5. Header comment: why (the snapshot), what stays, and that admin-uploaded objects
   (no owner) can only be managed by the server.

## App behaviour to check (code, no change unless needed)
A Kanban card or post deleted by someone other than the uploader now leaves that file
in storage; Storage silently removes nothing that RLS hides. Check
`lib/kanban/kanbanAttachmentStorage.ts` (`remove`) and any other client `remove()`: a
failure must not break the card or post delete. If one throws or toasts an error on
that path, make it log and continue. Report what you found.

## Tests
`lib/infra/storage/storageOwnerOnlyMigration.test.ts` (check vitest globs; use
`lib/infra/auth/` if `lib/infra/storage/` is not included): read the file and assert
the six drops, both new policies with `owner_id = (select auth.uid())::text`, the five
bucket names, the drift guard and the self-check.

## Allowed files
The new migration and its test, plus `lib/kanban/kanbanAttachmentStorage.ts` (+ its
test) only if the check above needs it. No SQL apply, no git.

## Verification (PM, live, after the owner applies)
Two registered accounts (owner = shared Chromium; second = `guest-login.mjs` in its
own browser):
- The owner uploads a test file to `padlet-files`.
- The second account tries to delete it → the file still exists.
- The second account tries to overwrite it with upsert → refused.
- The second account uploads and deletes its own file → OK.
- The owner deletes their own file → OK.
- Regression: the owner adds an image post on a board and it shows.

## Addendum 1 — the drift guard must accept this patch's own policies
Review passed, with one bug: re-running the migration fails, because the drift guard
flags `storage_owner_update` and `storage_owner_delete` (they name the buckets and are
not in its exclusion list). Add both names to the guard's `NOT IN` list, with a comment
("this migration's own policies: a re-run must pass"). Extend the source test to assert
it. Allowed files: the migration and its test. No apply, no git.
