# PATCH-318 — A container's title shows the style set in its Text style panel

## Why
Owner report: in the Container editor, selecting the title opens the Text
style panel (heading preset, B/I/S/U, alignment, text colour). The choices are
saved (`usePadletSave.saveContainer` writes `metadata.titleStyle`) and the
editor's own title input shows them (`resolveCaptionStyle`), but everywhere
else the container's title ignores them:
- `RowColumnContainerCard.tsx` header `<h3 className="text-sm font-bold ...">`
  (~line 296) uses only `textColor`. This card is the container on Freeform,
  Columns, Wall, Row, Drawing, Map, Timeline and in the Scheduler posts list.
- `StandaloneSchedulerCanvas.tsx` `CustomEvent` renders the event title (the
  container's title) as plain text (~lines 811 and 815).

## Design
Use the existing resolver, no new style logic:
`resolvePadletTitleStyle(padlet, fallbackColor)` from
`lib/domain/canvas/captionStyle.ts` (container → `metadata.titleStyle`).

1. RowColumnContainerCard header: `style={resolvePadletTitleStyle(padlet, textColor)}`
   when not `isContentOnly` (keep `undefined` color behaviour for content-only).
   Keep `text-sm font-bold text-center` as defaults; inline style wins where set.
   With no titleStyle the result must look exactly as today (color = textColor).
2. Find every other place that renders a CONTAINER's own title on a board
   (grep for container title renders, e.g. Freeform container header in
   `FreeformPadletCards.tsx`, Timeline, Kanban/Columns headers). If one already
   uses `resolvePadletTitleStyle`, leave it. If one ignores titleStyle, apply it
   the same way. List them in your report.
3. Scheduler event title (`CustomEvent`, both the short flex-row span and the
   tall-layout span): apply the resolved style EXCEPT `fontSize`, `lineHeight`
   and `backgroundColor` (the block is small and has its own colour). Only
   apply `color` when titleStyle actually sets one (otherwise keep the event's
   current text colour). Do not touch the item counter badge.
4. Out of scope: child-title rows inside a container (`renderChildTitle`), the
   editor itself, the Text style panel, saving.

## Tests
- RowColumnContainerCard: with `metadata.titleStyle = { color: '#fa5252',
  fontStyle: 'italic', fontWeight: '700', underline: true, textAlign: 'left' }`
  the header has those inline styles (text-decoration underline); without
  titleStyle the header color equals the current textColor and has no
  font-style/text-decoration.
- Scheduler CustomEvent: a container with titleStyle `{ color, fontStyle:
  'italic', fontSize: '24px', backgroundColor }` renders its title italic in
  that colour, with NO font-size 24px and NO background colour.
- Existing counter tests still pass.

## Verification
Focused tests pass; `npx tsc --noEmit` clean. Report all files changed.

## Allowed files
RowColumnContainerCard.tsx, StandaloneSchedulerCanvas.tsx, any other container
title render site found in step 2, and their tests. No git writes.
