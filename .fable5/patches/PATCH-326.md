# PATCH-326 — Import a calendar (.ics) into a Kanban board

## Why
Owner decision 2026-10-08: the "cheap version" of calendar import. No Google
or Microsoft sign-in, no live sync. A user uploads an `.ics` file or pastes a
calendar link (Google "Secret address in iCal format", Outlook.com "Publish a
calendar" ICS link, any public `webcal://` / `https://` ICS link). Each event
becomes a Kanban card with its dates, so it also shows in the Gantt and the
Scheduler. One-time import; re-importing skips cards that are already there.

## Library
Add `ical.js` (Mozilla, 2.2.1, MPL-2.0, used unmodified) — it handles
recurrence rules (RRULE/RDATE/EXDATE), VTIMEZONE and all-day dates. Do not
hand-write an iCalendar parser. Pin the exact version.

## Design

### 1. Parser — new `lib/kanban/icsImport.ts` (pure, server-side use)
`parseIcsEvents(text, { now }): { events: ImportedEvent[]; truncated: boolean }`
- Throws a typed `IcsParseError` when the text is not a VCALENDAR.
- Window: occurrences that overlap [now − 30 days, now + 365 days].
- Recurring events are expanded inside the window (iterator cap 1,000 steps
  per event so a pathological RRULE cannot spin). EXDATE respected; a
  RECURRENCE-ID override replaces its occurrence.
- Skip `STATUS:CANCELLED`.
- `ImportedEvent`:
  - `title`: SUMMARY trimmed, max 200 chars, empty → "Untitled event".
  - `description`: DESCRIPTION, max 4,000 chars (plain text).
  - `location`: LOCATION, max 300 chars, or undefined.
  - `allDay: true` → `startDate`/`endDate` as `YYYY-MM-DD`; the iCalendar
    DTEND of an all-day event is EXCLUSIVE, so `endDate` = DTEND − 1 day
    (a one-day event has start = end). No DTEND → end = start.
  - `allDay: false` → `startIso`/`endIso` as UTC ISO instants (timezone
    resolved by ical.js). No DTEND → DURATION, else end = start.
- Sorted by start; at most 500 events, `truncated: true` if more.
- Never include the UID, organizer, attendees or their emails in the output.

### 2. Server route — new `app/api/boards/[id]/calendar-import/route.ts`
`POST` body: either `{ url }` or `{ icsText }` (exactly one).
- Authenticated user (Supabase route client, same as other board routes) →
  401. Board readable by the caller via `canReadBoardKnowledge` with the
  caller's own client → 403 otherwise. (The route writes nothing; the cards
  are created by the client store, so RLS still decides who can write.)
- `icsText`: max 2 MB → 413.
- `url`: `webcal://` → `https://`; only `http:`/`https:`.
  New `lib/server/net/publicUrlGuard.ts`: `assertPublicUrl(url)` — the
  link-preview blocklist (app/api/link-preview/route.ts) PLUS `0.0.0.0/8`,
  `100.64.0.0/10`, IPv4-mapped IPv6 (`::ffff:10.x` etc. — check the embedded
  v4), `::`, multicast; resolve DNS and check every address.
  Fetch with `redirect: 'manual'`, follow at most 3 redirects, running
  `assertPublicUrl` on EVERY hop; 10 s timeout (AbortController); stop
  reading after 2 MB (stream with a byte counter) → 413.
  Body without `BEGIN:VCALENDAR` → 422 "This link did not return a calendar".
  Upstream non-2xx → 502 "The calendar link could not be read (HTTP n)".
- **The link is a secret** (a Google secret address gives read access to the
  whole calendar): never log it, never store it, never echo it in any
  response or error message.
- Response: `{ events, truncated }` from the parser. Parse error → 422
  "This file is not a calendar (.ics)".
- Rate limit: if a reusable limiter exists (see
  `lib/infra/auth/loginRateLimit.ts`), apply 10 requests / minute / user;
  otherwise skip and say so in your summary.

### 3. UI — new `components/kanban-canvas/CalendarImportModal.tsx`
- Kanban `Toolbar`: an "Import" button (Calendar icon) next to Export, shown
  only when `!readonly`.
- Modal "Import calendar", two choices:
  - "Upload .ics file" — `<input type="file" accept=".ics,text/calendar">`;
    refuse > 2 MB before reading; send the text as `icsText`.
  - "Calendar link" — URL input, with short help:
    Google Calendar: Settings → your calendar → "Secret address in iCal
    format". Outlook.com: Settings → Calendar → Shared calendars → Publish a
    calendar → ICS link. Apple Calendar: File → Export, then upload the file.
    Plus one line: "The link is used once to read the events and is not
    saved."
- "Preview" → shows: "N events from <first date> to <last date>", "M are
  already on this board and will be skipped", "Only the first 500 events
  were read" when truncated, a list of up to 50 (date + title), and a
  column picker (default: first column; first row if rows exist).
- Mapping event → card (in the browser, so dates use the user's time zone):
  - `label` = title; `columnId` = picked column; `rowId` = first row if any;
    `order` after the column's last card; `priority` undefined (None);
    `progress` 0.
  - all-day: `start_date`/`end_date` = the dates.
  - timed: `start_date` = local date of start; `end_date` = local date of
    (end − 1 ms), never before start. Description gets a first line
    `HH:MM–HH:MM` in local time.
  - description = [time line] + [`Location: …`] + description, blank-line
    separated; omitted parts dropped.
  - Duplicate = an existing card on this board with the same label,
    start_date and end_date → skipped.
- "Import N events" → `actions.addCard` one by one (the persistence action,
  so each card is saved like a hand-made one); show "Importing 12 / 40"; on
  finish close and toast "Imported N events"; on a failed card continue and
  report "Imported N, M failed".
- Errors shown in the modal, in plain words, never containing the URL.
- Texts via the Kanban i18n (`useKanbanI18n.ts`, English + existing
  languages, English text for the others is fine).

## Tests
- Parser: all-day exclusive end (one-day and three-day), timed with TZID,
  floating time, recurring weekly expanded inside the window only, EXDATE,
  RECURRENCE-ID override, cancelled skipped, missing SUMMARY, 500 cap +
  truncated, not-a-calendar → IcsParseError, output has no UID/emails.
- Guard: private v4 ranges, `::1`, `::ffff:127.0.0.1`, `100.64.x`, DNS
  answer private → refused; webcal → https; redirect to a private host
  refused; > 3 redirects refused; body over 2 MB → 413; non-calendar → 422.
- Route: 401, 403, both/neither of url/icsText → 400, success shape; the URL
  never appears in the response or in any `console` call (spy).
- Modal: Import button hidden for readonly; mapping (all-day, timed across
  midnight, location/time lines); duplicates skipped; progress and the
  "M failed" message.

## Verification
Focused tests, full vitest gate (26-file baseline), `npx tsc --noEmit`.
I verify live with a real .ics file and a real public calendar link.

## Allowed files
package.json + package-lock.json (ical.js only), new lib/kanban/icsImport.ts,
new lib/server/net/publicUrlGuard.ts, new
app/api/boards/[id]/calendar-import/route.ts, new
components/kanban-canvas/CalendarImportModal.tsx,
components/kanban-canvas/Toolbar.tsx (the button + modal only),
components/kanban-canvas/useKanbanI18n.ts (new strings only), and tests.
Do not change app/api/link-preview/route.ts. No git writes, no database
changes.

## Addendum 1 — webcal links fail (live)
Live: the Google public holiday calendar works as `https://…` but the same
link as `webcal://…` returns "The calendar link could not be reached".
Cause: `fetchIcsText` validates with `assertPublicUrl(current)` (which
converts webcal → https) but then calls `fetchImpl(current, …)` with the
ORIGINAL `webcal://` string, which fetch rejects → `network_error`.
Fix: fetch the URL `assertPublicUrl` returned (`safe.toString()`), and resolve
redirect `Location` against that URL. Test: a `webcal://` input → `fetchImpl`
is called with the `https://` URL.
Also: link-local IPv6 is `fe80::/10` (fe80–febf), not only `fe80:` — block
`/^fe[89ab][0-9a-f]:/` in `isBlockedV6`, with a test for `febf::1`.
