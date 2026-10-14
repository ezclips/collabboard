# PATCH-364 — Guest posts wear the guest's colour; quieter presence warning

## Why
1. The owner watched the presence demo and asked: "have the post created by the guest
   the same top strip colour as his icon colour". Then everyone can see at a glance
   which notes a guest wrote.
2. During the demo, the owner's other tab showed a red Next.js "Console Error":
   `[presence] board channel unavailable`. Diagnosis: a temporary `TIMED_OUT` while the
   dev server was overloaded. Supabase retried, the tab joined (`phx_reply ok`, both
   tabs in `presence_state`), and the stack recovered on its own. It is a recoverable
   state, not an error.

Live facts: `padlets` has NO author column (live columns: id, canvas_id, title,
content, color, position_x, position_y, created_at, top, left, width, height,
updated_at, file_*, type, metadata, board_id, location_*, library_item_id). Posts are
created from many client paths, so the creator must be stamped by the database, not
the app.

## Design

### 1. The database stamps the creator (migration)
New `supabase/migrations/20261014180000_padlet_creator_stamp.sql`, one transaction:
- `public.stamp_padlet_creator()`: plpgsql trigger function, SECURITY DEFINER,
  `SET search_path = public`. BEFORE INSERT OR UPDATE OF metadata ON `padlets`, FOR
  EACH ROW.
  - INSERT: strip any client-sent `createdBy` / `createdByGuest`:
    `NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) - 'createdBy' - 'createdByGuest'`.
    Then, when `auth.uid()` is not null, add `createdBy` (= `auth.uid()::text`) and,
    only when `public.is_guest()`, `"createdByGuest": true`. Service-role inserts (no
    `auth.uid()`) get no stamp.
  - UPDATE: the client cannot change the stamp. Strip both keys from
    `NEW.metadata`, then copy them back from `OLD.metadata` if present.
  - RETURN NEW.
- `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`. `DROP TRIGGER IF EXISTS` then
  `CREATE TRIGGER padlets_stamp_creator`.
- Header comment: why (no author column; many create paths; the client must not
  spoof it); cosmetic data; existing posts have no stamp and look unchanged.

### 2. The strip colour (app)
- Add `guestPostStripColor(metadata): string | null` to
  `lib/domain/presence/boardPresence.ts`: returns `presenceColor(metadata.createdBy)`
  when `metadata.createdByGuest === true` and `createdBy` is a non-empty string, else
  null. Tests.
- Find where a Freeform **text note's** light top strip (the thin header bar above the
  note's text, light grey today) is rendered. When `guestPostStripColor` returns a
  colour, paint that strip in it (same colour as the guest's avatar) and give the strip
  `title="Added by a guest"`. Every other post is unchanged. Keep the strip's size and
  layout. Report which file and component you changed. If several post types share one
  header component, apply it there once.

### 3. Presence warning
In `components/collabboard/presence/useBoardPresence.ts`, use `console.warn` instead of
`console.error` for `CHANNEL_ERROR` / `TIMED_OUT`, with the text
`[presence] board channel not connected yet; retrying`. Keep the status logic: a later
`SUBSCRIBED` sets `'live'` and tracks again. Add a test that `SUBSCRIBED` after
`TIMED_OUT` returns to `'live'` and tracks.

## Allowed files
The migration (+ source test in `lib/infra/presence/`), `lib/domain/presence/boardPresence.ts`
(+ test), the one post-header component (+ its test if any), and `useBoardPresence.ts`
(+ test). Ask before touching anything else. No SQL apply, no git. Run
`npx tsc --noEmit` and the affected tests.

## Verification (PM, live, after the owner applies)
Throwaway Freeform board:
- The owner adds a note → no stamp colour (unchanged look).
- A guest joins and adds a note → its strip has the guest's avatar colour (screenshot
  next to the presence list).
- The guest PATCHes its metadata with `createdByGuest: false` → the stamp stays.
- The owner's own note has `createdBy` = the owner and no guest flag.
