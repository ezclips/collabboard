# PATCH-314 — Type a short text right in a Scheduler event; the post counter in the container's design

Status: AUTHORIZED (owner, 2026-10-07: "would it make sense that you can add a short text right in the time span? I
don't think it is possible right now? For the post counter we should stay consistent and use this design [the
container's '1 item' badge] and lower left corner, the same spot we use for the container").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO)
- An event already SHOWS its container's title (`StandaloneSchedulerCanvas.tsx` events memo ~L211:
  `title = padlet.title?.trim() || ''`), but the only way to set it is: click the event → posts popover → pencil →
  full container editor. Nothing lets you type in the event itself.
- The Timeline already renames containers through `onRenameContainer={(id, title) => updatePadletTitle(id, title)}`
  (`CanvasClient.tsx` ~L10364, `ChronoTimelineCanvas.tsx`).
- The container's counter (`RowColumnContainerCard.tsx` ~L722): `text-[9px] font-medium px-1.5 py-0.5 rounded`,
  `backgroundColor: badgeBg`, `color: textColor`, where `textColor = getContrastTextColor(bg)` ('#f8fafc' or
  '#0f172a') and `badgeBg = textColor === '#f8fafc' ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.08)'`; text
  "1 item" / "N items"; lower left.
- PATCH-313 put a "N posts" pill at the event's top right.

## Design
### A. Text in the event
1. `StandaloneSchedulerCanvas` gets an optional prop `onRenameContainer?: (containerId: string, title: string) =>
   void`; CanvasClient passes `canUseFreeformEditButton ? (id, t) => updatePadletTitle(id, t) : undefined` (same as
   the Timeline). Read-only or no prop → none of the below.
2. Right-click menu (`SchedulerEventContextMenu`): a new item right after "Add post": **"Add text"** when the event has
   no title, **"Edit text"** when it has one (icon `Type` from lucide). Only rendered when renaming is possible.
3. Choosing it puts that event into edit mode: the title line becomes an `<input>` (same font, full width of the tab,
   white 90 % background, `maxLength={80}`, `placeholder="Short text"`, autofocus, text selected).
   **Enter** or blur → `onRenameContainer(id, value.trim())` when it changed; **Escape** → cancel. While editing, the
   input stops propagation of mouse/pointer/key events so the calendar does not drag, select or open the posts.
   Only one event edits at a time (state: `editingEventId`). Use the menu-close timing that PATCH-308 proved
   (the menu item's onSelect sets the state; focus the input in an effect).
4. Display: the title may wrap in tall events (`whitespace-normal break-words`, clipped by the tab's
   `overflow-hidden`); short events keep one truncated line.
### B. Counter in the container's design
Replace PATCH-313's top-right pill: same classes and colours as the container counter (`text-[9px] font-medium
px-1.5 py-0.5 rounded`, `badgeBg`/`textColor` computed from the event's background exactly like
`RowColumnContainerCard` — default blue event → light text on rgba(255,255,255,0.22)); wording **"1 item" / "N
items"**; still hidden for 0 and only on the first segment of a multi-day event; `pointer-events-none`;
`data-scheduler-post-count` kept.
- Position: **lower left** of the event (`absolute left-1 bottom-1`). In a short event (rendered height < 36 px) there
  is no second line, so show it at the left of the single line, before the title (inline, same style, `mr-1`).
- Move the shared colour helper into `lib/domain/canvas/containerBadgeColors.ts`
  (`containerBadgeColors(bg) → { textColor, badgeBg }`) and use it from both components so they cannot drift.

## Tests
- Behaviour tests (existing scheduler test mocks): the menu shows "Add text" for an untitled event and "Edit text"
  for a titled one, and neither without `onRenameContainer`; choosing it shows an input; typing + Enter calls
  `onRenameContainer(id, 'Standup')`; Escape does not; blur saves; the input's mousedown does not reach the event
  wrapper.
- Counter: "1 item" / "2 items"; none for 0; the style uses the helper's colours; first segment only.
- `containerBadgeColors` unit test (light bg → dark text + rgba(15,23,42,0.08); dark bg → light text +
  rgba(255,255,255,0.22)); `RowColumnContainerCard` still renders the same counter (existing tests stay green).

## Allowed files
`components/canvas/StandaloneSchedulerCanvas.tsx`, `components/canvas/SchedulerEventContextMenu.tsx`,
`components/collabboard/RowColumnContainerCard.tsx` (use the helper only), new
`lib/domain/canvas/containerBadgeColors.ts`, `app/dashboard/canvas/[id]/CanvasClient.tsx` (pass the prop only), and
tests. Same rules. Run the scheduler tests, RowColumnContainerCard tests and tsc.

## Commit message (verbatim)
```
feat(scheduler): type a short text right in an event

Right-click an event and choose Add text (or Edit text) to type a short
label straight into it; Enter saves, Escape cancels. The post counter now
matches the container's "1 item" badge and sits in the same lower-left
spot.
```

## Addendum 1 (CTO, live 2026-10-07)
Live: menu shows "Add text" → input → "Standup" + Enter saves (survives reload); menu then shows "Edit text"; Escape
keeps the old text; a click still opens the posts. **Bug:** in a short event (~32 px tall, 1 h at this zoom) the
"1 item" badge renders on its own line and pushes the text below the visible area — the text is cut off.
**Fix (`StandaloneSchedulerCanvas.tsx`):** short layout = ONE flex row `flex items-center gap-1 min-w-0`:
`[badge (flex-none)] [title span: min-w-0 truncate]` — the title span must not be `block` there. Tall layout
unchanged (title on top, wraps; badge `absolute left-1 bottom-1`). Decide short vs tall by the measured tab height
(< 36 px = short) and re-measure when the event resizes (ResizeObserver). Test: in the short layout the badge and the
title are siblings in one flex row and the title has `truncate`; in the tall layout the badge is absolutely positioned.
Same rules; run the scheduler tests and tsc.

## Final result (CTO, 2026-10-07, live)
Right-click → "Add text" → typed "Standup" + Enter: saved (back after a reload); the menu then says "Edit text"; Escape keeps the old text; a click still opens the posts. Counter in the container design: short event = "1 item" then the text on one line; tall event (3 h) = text on top, "1 item" lower left. Scheduler tests 35/35; gate 26 + drawingPost (passes alone, load timeout); tsc clean; test boards deleted.
