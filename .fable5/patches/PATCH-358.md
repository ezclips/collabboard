# PATCH-358 — Guests join a board without an account (app side)

## Why
The owner's decision (2026-10-13): timer and dot-voting sessions must let visitors take
part **without creating an account**. PATCH-357 made share links grant access, but only
to signed-in people. This patch lets a visitor with a board link type a name and join as
a **guest**, using Supabase anonymous sign-in (`supabase.auth.signInAnonymously`).

A guest is a real Supabase user with the `authenticated` role and the JWT claim
`is_anonymous: true`. Every policy and route that trusts "signed in" therefore trusts a
guest too. This patch is the APP half. The DATABASE half (restrictive "no guest writes"
policies, storage, and `handle_new_user` with no email) is PATCH-358 part 2. It comes
after a live snapshot, because the repo's migrations do not match the live database
(PATCH-357 proved this).

**"Allow anonymous sign-ins" stays OFF in Supabase until both halves are in and live-tested.**

## Design

### 1. One helper: is this user a guest?
New `lib/domain/auth/guest.ts`:
- `isGuestUser(user: { is_anonymous?: boolean } | null | undefined): boolean`, true only
  when `is_anonymous === true`.
- `normalizeGuestName(raw: string): { ok: true; name: string } | { ok: false; error: string }`:
  trim, collapse inner whitespace, 1–40 characters, no control characters, no `<` or `>`.
- Unit tests for both.

### 2. Join as guest on the share page
`app/share/[token]/page.tsx`: today an unsigned visitor on a board link is redirected to
`/auth?redirect=/share/<token>`. Instead, render a small join card (new client component
`app/share/[token]/GuestJoinCard.tsx`) with:
- the board title (read it with the admin client already used by the repository: title only);
- a **"Your name"** input and a **"Join as guest"** button;
- a secondary link **"Sign in or create an account"** to the existing
  `/auth?redirect=/share/<token>`.

"Join as guest" calls `supabaseBrowser().auth.signInAnonymously({ options: { data: { display_name } } })`,
using the browser's own client so the sign-in costs the visitor's own IP (LESSONS: the
per-IP auth limits). On success it calls `router.refresh()`. The server page then sees a
session and the existing PATCH-357 redeem flow runs unchanged, including password links.

Errors are shown inline, never swallowed:
- anonymous sign-ins disabled (Supabase error message contains "Anonymous sign-ins are disabled")
  → "Guest access is not available yet. Sign in or create an account instead.";
- 429 → "Too many people joined from this network just now. Try again in a few minutes.";
- anything else → "Could not join as a guest. Try again." (log the error with `console.error`
  in the client component, which the existing share code already does).

The button is disabled while the request runs (single-flight). The name is validated
with `normalizeGuestName` before calling.

### 3. Guests never get a workspace
`lib/workspace/context.ts` `resolveCurrentWorkspace`: when `isGuestUser(user)`, return
`null` at the top, before any query, so no bootstrap or membership insert runs. Widen
the `user` parameter type to `Pick<User, 'id' | 'email' | 'is_anonymous'>`. Check the 29
callers compile, and that the canvas callers (`CanvasSetupPage.tsx` lines ~982 and ~1082,
and any `CanvasClient` path) already handle `null`. If one does not, make it handle `null`
the way it handles a bootstrap failure today, and list it in your reply.

### 4. Guests stay on their boards
`middleware.ts`: it already calls `getSession()` (no extra auth call; do NOT add another).
When `session?.user?.is_anonymous === true` and the path starts with `/dashboard` but is
NOT `/dashboard/canvas/<id>` (and its sub-paths), redirect to `/guest`. Keep the matcher
literal byte-for-byte unchanged.

New page `app/guest/page.tsx` (server component, session client):
- no session → redirect `/auth`; a session that is not a guest → redirect `/dashboard`;
- heading "You're visiting as a guest", the guest's display name, and the boards they
  joined: `board_collaborators` rows for `auth.uid()` joined with `boards(title)`, each a
  `<Link href="/dashboard/canvas/<id>">`. If RLS returns nothing, show "Open the link you
  were given to get back to your board.";
- a "Create a free account" `<Link>` to `/auth?mode=signup&switch=1` (check that the
  `switch=1` handling signs the guest out first; if it does not, say so in your reply and
  do not change `/auth`).

### 5. Guests cannot spend AI credits
In `lib/server/billing/aiCredits.ts`, every exported credit CHECK
(`checkAiActionCredits`, the board check(s) next to it, and any other exported check that
returns a credit decision) gets a REQUIRED input `isGuest: boolean`. When it is true,
return before reading anything:
`{ kind: 'refused', status: 403, body: { error: 'Create a free account to use AI.', code: 'guest_no_ai' } }`.
Widen the decision union and the route handling so 403 passes through as is.

Because the input is required, `tsc` lists every call site (routes under `app/api/ai/*`,
`app/api/boards/[id]/ai/*`, `lib/server/ai/boardNotesAiRun.ts`,
`lib/server/ai/componentGeneration.ts`, `lib/server/wiki/boardWikiCompileSession.ts`).
Each passes `isGuestUser(user)` from the user it already has. Do not add an extra
`getUser()` call anywhere. Tests: the check refuses a guest with 403 `guest_no_ai` and
never calls the preference reader, `canReadBoard`, or the plan/ledger.

### Out of scope (later patches)
- Part 2, DB: restrictive policies, storage, `handle_new_user`. Spec after the owner's live snapshot.
- Hiding AI and dashboard buttons in the canvas UI for guests (the server refusal is the guard).
- Turning a guest into a full account while keeping their posts (Supabase identity linking).
- Presence names (PATCH-359), timer, dot-voting.

## Tests
- `lib/domain/auth/guest.test.ts`: `isGuestUser`, and `normalizeGuestName` (empty,
  41 characters, `<b>`, control characters, whitespace collapse, a valid name).
- The credit check: guest → 403 `guest_no_ai`, nothing else called; non-guest unchanged
  (the existing tests stay green).
- `resolveCurrentWorkspace`: guest → `null` and zero client calls.
- Middleware: guest on `/dashboard` → redirect `/guest`; guest on
  `/dashboard/canvas/<uuid>` → passes; a normal user → passes. Put the decision in a pure
  function in `lib/infra/auth/` so it can be unit-tested; the middleware calls it.
- `GuestJoinCard`: validation message, single-flight, the "disabled" error mapped to friendly text.
- Check the vitest include globs before choosing test folders (`lib/hooks/` is NOT included).

## Allowed files
New: `lib/domain/auth/guest.ts` (+ test), `app/share/[token]/GuestJoinCard.tsx` (+ test),
`app/guest/page.tsx`, `lib/infra/auth/guestRouteGuard.ts` (+ test).
Changed: `app/share/[token]/page.tsx`, `middleware.ts` (body only, matcher unchanged),
`lib/workspace/context.ts`, `lib/server/billing/aiCredits.ts` and the call sites `tsc`
names (pass the flag only), the canvas callers of `resolveCurrentWorkspace` only if
they mishandle `null`, and existing tests that need the new required input.
No SQL, no Supabase settings, no git. Ask (question tool) before touching anything else.
Run `npx tsc --noEmit` and the affected tests.

## Verification (PM, after part 2 and the owner turning anonymous sign-ins on)
Throwaway board with an `edit` link. In a fresh browser with no cookies:
1. Open the link → the join card shows the board title.
2. Type a name → land on the board, see the posts, add a post.
3. The owner's tab shows it live.
4. AI routes → 403 `guest_no_ai`.
5. `/dashboard` → `/guest`, listing the board.
6. No workspace row was created for the guest.
7. A `view` link → a guest reader who cannot add.
8. Clean up: delete the board; anonymous users are listed for the owner to remove.

## Addendum 1 — PM review
Review passed for the credit guard, the workspace guard, the middleware, the join card
and the guest page. Three changes:

**A. Guests cannot upload files (storage is paid by the board owner).** These routes
write to storage or create documents with the ADMIN client, so the part 2 database
policies cannot stop a guest with an edit link:
`app/api/boards/[id]/knowledge/route.ts`,
`app/api/boards/[id]/knowledge/transcript/route.ts`,
`app/api/boards/[id]/knowledge/area-image/route.ts`,
`app/api/boards/[id]/knowledge/[documentId]/render-pages/route.ts`,
`app/api/boards/[id]/library-items/[libraryItemId]/image-placement/route.ts`,
`app/api/boards/[id]/padlets/[padletId]/image/route.ts`,
`app/api/imports/resolve-selection/route.ts`.
In each, right after the route has its signed-in user (reuse that user; do NOT add a
`getUser()`), refuse a guest with HTTP 403
`{ error: 'Create a free account to upload files.', code: 'guest_no_upload' }`.
Put that body in one constant, `GUEST_UPLOAD_REFUSAL` in `lib/domain/auth/guest.ts`.
Where a route is built by a factory that only receives a user id (for example,
`getAuthenticatedUserId` in the transcript route), make the factory's auth callback
able to report a guest (for example, return `{ userId, isGuest }`), and have the
factory send the 403. Update its existing tests. Add at least one test per factory or
route family proving a guest gets 403 and the storage gateway is never called.

**B. A password-protected link must not reveal the board title.** In
`app/share/[token]/page.tsx`, read the title only when `!isPasswordProtected`;
otherwise pass `boardTitle={null}`. PATCH-357 deliberately withholds the target of a
password link from visitors who have not unlocked it.

**C.** The `guest.ts` comment says "C0/C1 range", but the regex checks C0 and DEL only.
Fix the comment; the behaviour is fine.

Allowed files: the 7 routes above, the factories or helpers they use for auth (and
their existing tests), `lib/domain/auth/guest.ts` (+ test), `app/share/[token]/page.tsx`.
No SQL, no git. Run `npx tsc --noEmit` and the affected tests.

## Addendum 2 — part 2: the database guard (from the owner's live snapshot, 2026-10-14)
The app guards above are user experience only. The middleware's guest check reads an
UNVERIFIED cookie, and session clients reach PostgREST directly. Postgres verifies the
JWT, so it is the only real guard. Live facts from the snapshot:
- RLS is on for every public table except `spatial_ref_sys` (PostGIS, leave it alone).
- Many permissive policies only check `auth.uid() = user_id`, or are `TO public` and
  check only the bucket, so they let any signed-in user (a guest included) act. One
  example: `boards` "Workspace users can create boards" lets anyone create a board with
  `workspace_id IS NULL`.
- `storage.objects`: INSERT/UPDATE/DELETE policies on `padlet-files`, `thumbnails`,
  `canvas-wallpapers`, `board-backgrounds` and `canvas-icons` check only the bucket.
- `public.users.email` is nullable (a guest has no email). OK.
- `handle_new_user` copies only `raw_user_meta_data->>'full_name'`, but guests send
  `display_name`.

New file `supabase/migrations/20261014120000_guest_write_guard.sql`, one transaction:

1. `public.is_guest()`: `language sql stable`, `security invoker`, with
   `set search_path = ''`, returning
   `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)`.
   `revoke all on function public.is_guest() from public;`
   `grant execute … to authenticated, service_role;`.

2. **Write guard.** For every table in `public` with RLS on, EXCEPT `spatial_ref_sys`
   and this WRITE allow-list: `padlets`, `canvas_lines`, `board_sections`,
   `kanban_cards`, `kanban_columns`, `kanban_swimlanes`, `kanban_column_groups`,
   `kanban_links`, `kanban_comments`, `kanban_votes`, `kanban_card_assignees`.
   Loop over `pg_class` in a `DO` block. For each table, drop-if-exists then create
   three RESTRICTIVE policies `TO authenticated`:
   - `guest_no_insert` FOR INSERT WITH CHECK (`not public.is_guest()`);
   - `guest_no_update` FOR UPDATE USING (…) WITH CHECK (…);
   - `guest_no_delete` FOR DELETE USING (…).
   Allow-listed tables keep only their existing permissive policies, which already
   require owner or board-collaborator (editor) rights.

3. **Read guard.** Same loop, EXCEPT `spatial_ref_sys` and this READ allow-list: the
   write allow-list plus `boards`, `board_collaborators`, `board_map_settings`,
   `freeform_graph_edges`, `freeform_graph_settings`, `kanban_board_members`,
   `knowledge_documents`, `knowledge_pages`, `knowledge_chunks`,
   `knowledge_source_highlights`, `knowledge_pdf_area_image_placements`,
   `source_references`, `board_wiki_pages`. For every other table, create a
   RESTRICTIVE `guest_no_select` FOR SELECT TO authenticated USING
   (`not public.is_guest()`). A guest reading e.g. `users`, `subscriptions` or
   `workspaces` then gets zero rows, not an error.

4. **Storage.** On `storage.objects`, three RESTRICTIVE policies `TO authenticated`
   (`guest_no_storage_insert`, `_update`, `_delete`) with `not public.is_guest()`,
   dropped if they exist first. Reads stay as they are (guests must see images on the
   board).

5. **`handle_new_user`.** Recreate it with the live body (security definer) unchanged,
   except
   `COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'display_name', '')`.
   Add `SET search_path = public` to the function definition. Keep `ON CONFLICT (id) DO NOTHING`.

6. **Self-check at the end**, inside the transaction: count the `guest_no_insert`
   policies, and `RAISE EXCEPTION` if it is not (RLS tables − spatial_ref_sys − the
   11 write-allow-listed tables), or if any allow-listed table name does not exist
   (catches a typo). Comment every block with WHY.

Header comment: this is the real guard (the app checks are user experience); restrictive
policies AND with every permissive policy, so they can only take access away; a new
table gets the guard only when this block runs again (say so, and say that a future
table guests must write needs adding to the allow-list). Name the pre-existing storage
issue (bucket-only checks) as OUT OF SCOPE here: a separate patch.

Allowed files: that new migration only. No SQL apply, no git. Also add a small vitest
source test `lib/infra/auth/guestWriteGuardMigration.test.ts` that reads the file and
asserts: both allow-lists exactly as written above, `AS RESTRICTIVE` present, `is_guest`
reads `is_anonymous`, the storage block exists, and the `display_name` fallback exists.

## Addendum 3: evaluate is_guest() once per query
Review passed. One change: in every policy expression in
`20261014120000_guest_write_guard.sql` (the write, read and storage policies), write
`not (select public.is_guest())` instead of `not public.is_guest()`. Supabase's RLS
performance guidance: wrapped in a sub-select, the function is evaluated once per
statement (an initPlan), not once per row. These policies sit on almost every table.
Add one comment line saying why. Update the source test to assert the wrapped form.
Allowed files: that migration and its test. No apply, no git.
