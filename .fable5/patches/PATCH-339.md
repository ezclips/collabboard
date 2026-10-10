# PATCH-339 — Scheduler: the "N items" badge never covers the entry title

## Why
Owner, 2026-10-10 (screenshot: entry "English - C1/2 (74178)" with the
"1 item" badge drawn over the title's second line): "Make sure the post
counter doesn't overlay the text from the calendar."

## Cause
`CustomEvent` (components/canvas/StandaloneSchedulerCanvas.tsx), tall layout
(tab ≥ `SHORT_EVENT_MAX_HEIGHT`): the title is a wrapping block at the top and
the badge is `absolute left-1 bottom-1`. When the title wraps onto the line(s)
where the badge sits, the badge paints over the text. (The short layout puts
the badge inline before the title and is fine.)

## Design (tall layout only)
- The tab becomes a vertical flex column (keep the 4 px top inset from
  PATCH-335): calendar icon/title first, then the badge **in normal flow**
  below the title (small gap, left-aligned), never absolutely positioned.
- The badge is `flex-none` and always fully visible. The title takes the
  remaining height: `min-h-0`, wraps, and is cut with an ellipsis after as
  many whole lines as fit (line clamp computed from the space, or simply
  `overflow-hidden` + `-webkit-line-clamp` set from the measured height) — it
  never runs under the badge and is never cut mid-line.
- The full title stays available on hover (the event already has the
  `title` tooltip "14:45 – 15:30: …"; keep it).
- Entries without posts: unchanged (title only).
- Short layout, multi-day segments, day-span handles, resize anchors
  (PATCH-336, z-index 6) unchanged.

## Tests
Behaviour test (jsdom, tall rect as in the PATCH-335 tests): with a child post,
the badge is not `absolute`, comes after the title in DOM order inside a
flex-column tab, and has `flex-none`; the title has the clamp/overflow
classes. Without children no badge.

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I verify live on a
throwaway board with a 1 h and a 2 h entry whose long title wraps and which
hold a post: the badge rectangle does not intersect any title text line.

## Allowed files
components/canvas/StandaloneSchedulerCanvas.tsx (CustomEvent only),
components/canvas/scheduler-theme.css (only if needed), and tests. No SQL,
no git.
