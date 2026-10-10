# PATCH-337 — Scheduler time changes are saved at once and the screen shows what is saved

## Why
Owner, 2026-10-10: split an entry, pulled the new block's top "=" up, went to
Settings to reconnect Google Drive, came back — "the split was down again and
had to be pulled up again". "Make sure it stays/saved as user wants it."

## Reproduced live (throwaway Scheduler board, 14:00–15:30 entry, Europe/Zurich)
| step | screen | database |
|---|---|---|
| Split → Into 2 blocks | **14:00–15:30** and 14:45–15:30 | 14:00–**14:45** and 14:45–15:30 |
| drag 2nd block's top up | both 14:00–15:30 | (0.3 s later) unchanged |
| +2.5 s | | 14:00–14:45 and 14:00–15:30 |
| Settings → back | 14:00–14:45 and 14:00–15:30 | same |
After a split the screen shows the first block at its OLD full length (it
covers the split) while the database has the new end; what the user sees
before leaving differs from what comes back.

## Causes (CanvasClient.tsx)
1. `commitPadletMeta` is ONE `debounce(…, 500)` for every post
   (`components/collabboard/canvas/engine/utils.ts` keeps a single timer): a
   metadata save for post B within 500 ms of one for post A **cancels A's
   save** — silent data loss whenever two posts change in quick succession.
2. Nothing flushes a pending save: leaving the page (client navigation,
   closing the tab) within 500 ms drops it.
3. `splitEventInHalf` saves block A through that 500 ms delay, then
   `handleCreateSchedulerPadlet` inserts block B and `await fetchData()`
   reloads all posts **before** A's save has run, so the screen gets A's old
   dates back (database ends up right; screen is wrong until reload). Same
   shape in `splitEventIntoQuarterHours` and `addConcurrentContainer`.
4. Failures are swallowed (`catch {}`), so a failed save (expired session,
   offline) looks saved until the next reload.

## Design
### A. Debounced post-metadata saves are per post and flushable
- Replace the single-timer debounce for `commitPadletMeta` with a keyed one:
  one pending save per post id (latest metadata wins for THAT id only); saves
  for different posts never cancel each other.
- `flushPendingPadletMeta(): Promise<void>` writes every pending save now.
  Call it: on unmount of the canvas, on `pagehide`, on
  `visibilitychange` → `hidden`, and at the start of `fetchData` (await it), so
  a reload can never read the database before our own pending writes land.
- A small, tested helper (new `lib/infra/keyedDebounce.ts` or similar):
  `schedule(key, value)`, `flush(): Promise<void>`, `cancel(key)`; no React.

### B. Scheduler time changes are saved immediately
Moving, resizing, splitting, duration, day-span, revert and "add container"
are single actions, not slider streams. Give the Scheduler a save that is
**immediate and awaited**: optimistic local update → cancel any pending
debounced save for that id → write now → `markPadletLocallyModified`. Pass it
to `StandaloneSchedulerCanvas` as its `onUpdatePadletMetadata` (all its uses
are such actions). Because the split awaits block A's save before creating
block B, the `fetchData` that follows sees A's new end.

### C. Failed saves are not silent
On a failed write (debounced or immediate): `console.error` with the post id
only, and a toast "Couldn't save your change. Check your connection and try
again." — at most one such toast per 10 s. For the Scheduler's immediate save,
also reload the posts (`fetchData`) so the screen goes back to what is
actually saved instead of pretending.

## Tests
- keyed debounce: two keys within the delay → both written; same key twice →
  one write with the latest value; `flush()` writes pending at once and
  resolves after the writes; `cancel(key)` drops only that key.
- CanvasClient-level (or a unit around the extracted save functions):
  `fetchData` awaits the flush first; the immediate save cancels a pending
  debounced save for the same id; a failing write shows the toast once.
- Scheduler: `splitEventInHalf` awaits `onUpdatePadletMetadata` before it
  calls `onCreatePadlet` (call order with a deferred promise).

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I re-run the live
reproduction: after the split the screen equals the database; drag the new
block's top up and leave for Settings within 0.3 s → back on the board the
new time is there and in the database; two entries changed within 0.5 s both
saved.

## Allowed files
app/dashboard/canvas/[id]/CanvasClient.tsx (commitPadletMeta,
updatePadletMetadata, fetchData flush, the scheduler save + its prop),
new lib/infra/keyedDebounce.ts (+ test),
components/canvas/StandaloneSchedulerCanvas.tsx (only if the split/save order
needs it), and tests. Leave engine/utils `debounce` as it is (other users).
No SQL, no git.

## Addendum 1 — review finding
`createUpdatePostMetadataCommand(...)` never throws: `defineCommand`
(`lib/domain/core/command.ts`) catches and RETURNS `err(...)`. So
`savePadletMetaNow`'s `try/catch` never sees a failed save — no toast, and the
Scheduler's "re-read on failure" never runs. Check the returned result:
`const result = await updatePostMetadata(...); if (!result.ok) { …failure… }`
(keep the catch for a truly unexpected throw). Test: a command that resolves
`{ ok: false }` → `false` returned, toast shown once, Scheduler save re-reads.
