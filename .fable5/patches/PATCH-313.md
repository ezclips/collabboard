# PATCH-313 — A visible post count on every Scheduler event

Status: AUTHORIZED (owner, 2026-10-07, screenshot of two events and an event's posts: "There used to be an indicator
how many posts are in the time span, currently there is none").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO)
The only count ever shown was the event tab's native `title` tooltip ("1 post" on hover) in
`components/canvas/StandaloneSchedulerCanvas.tsx` `CustomEvent` (~L758). PATCH-308 moved it to `aria-label` because
the tooltip covered the right-click menu — so sighted users lost it. `childCount` / `postLabel` are still computed there.

## Design (`CustomEvent` only)
- When `childCount >= 1`, render a badge inside the tab: `<span data-scheduler-post-count className="pointer-events-none
  absolute right-3 top-0.5 rounded-full bg-white/85 px-1.5 text-[11px] font-semibold leading-4 text-slate-700
  shadow-sm">{postLabel}</span>` (`right-3` keeps it clear of the 8 px end handle). No badge for 0 posts.
- For multi-day events (`event.segment`), only on the first segment (`event.segment.isFirst`).
- Keep the title `span` truncating so the badge never pushes layout; add `pr-16` to the title span when the badge shows
  so a long title does not run under it.
- Keep the `aria-label`. Nothing else changes.

## Tests
Extend `components/canvas/StandaloneSchedulerCanvas.eventClick.behavior.test.tsx` (or a new behaviour test with the
same react-big-calendar mock): an event with two child posts renders `[data-scheduler-post-count]` "2 posts"; with one
→ "1 post"; with none → no badge; a multi-day event shows it on the first segment only; the badge has
`pointer-events-none`.

## Allowed files
`components/canvas/StandaloneSchedulerCanvas.tsx` and the test. Same rules. Run the scheduler tests and tsc.

## Commit message (verbatim)
```
fix(scheduler): every event shows how many posts it holds again

The count was only a hover tooltip, removed because it covered the event
menu. It is now a small badge on the event itself, shown when the event
has posts, on the first day of a multi-day event.
```

## Final result (CTO, 2026-10-07, live)
A test event with one Note shows a "1 post" badge at its top right; the right-click menu still opens. Tests 23/23 scheduler; gate 26 + the Excalidraw context-menu file (passes alone, load timeout); tsc clean; test board deleted.
