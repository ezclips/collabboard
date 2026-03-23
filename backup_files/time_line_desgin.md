# Timeline Canvas Design & Restore Guide

Purpose
- This document defines the intended behavior and structure for the Timeline canvas.
- Use this to restore functionality if the timeline becomes corrupted.

Scope
- Timeline layout only (`canvas.layout === 'timeline'`).
- Chrono modes: `vertical`, `horizontal`, `horizontal-all`, `alternating`.
- Applies to `components/canvas/ChronoTimelineCanvas.tsx` and wiring in `app/dashboard/canvas/[id]/CanvasClient.tsx`.

Source of Truth Files
- `components/canvas/ChronoTimelineCanvas.tsx`
- `app/dashboard/canvas/[id]/CanvasClient.tsx`
- `components/collabboard/RowColumnContainerCard.tsx`

Core Data Model
- Timeline containers are `padlets` with:
  - `type === 'container'` OR `metadata.kind === 'container'` OR `metadata.isContainer === true`
  - Must NOT have `metadata.parentId` (root containers only)
- Timeline ordering uses:
  - `metadata.position_in_timeline`
  - Secondary sort: `created_at`

Container Integration
- Container children:
  - Child post IDs are stored in `metadata.childPadletIds` on the container.
  - Child posts should have `metadata.parentId` set to the container id.
- Container rendering uses `RowColumnContainerCard`.
- Timeline containers allow drop-in of:
  - Library posts
  - External clipart (SVG)
  - Existing padlets

Chrono Modes (Design Variations)

1) Vertical
- Timeline line on the left.
- Cards appear to the right of the line.
- Dot centered vertically on each card.
- Plus button disabled (no click) but supports drop.
- Library drag-and-drop still allowed on vertical line drop zones.

2) Horizontal
- Timeline line across top.
- Cards stack under dots.
- Scrollable horizontally with drag-to-scroll.
- Plus buttons active between cards (click to insert).
- Drop zones between cards support Library drop.

3) Horizontal-all
- Cards in a grid-like flow.
- No central line. Still uses container cards.

4) Alternating
- Timeline line centered vertically.
- Cards alternate left/right sides.
- Dots positioned on the line with slight offset toward the card.
- Plus buttons between each pair.

Key Functions & Responsibilities

ChronoTimelineCanvas
- `containerPadlets`: filters and sorts root containers.
- `renderTimelineItem(container, index, mode)`: builds card per mode.
- `renderTimelineContent()`: chooses layout based on `chronoMode`.
- `handleLineDrop(e, position)`: handles drop on timeline line (+) to create container with library item.

CanvasClient
- `handleChronoModeChange(mode)`: persists `canvas.settings.chronoMode`.
- `getTimelineContainers()`: returns sorted root containers.
- `insertTimelineContainerAt(position)`: inserts a container at a specific index.
- `addTimelineContainerBefore/After(containerId)`.
- `handleDropLibraryCreateContainer(position, draftPayload)`:
  - Creates container + child post from library drop.
  - Writes to Supabase.
- `ChronoTimelineCanvas` props wired here.

RowColumnContainerCard (Timeline Integration)
- Prop `renderFullPostContent`:
  - When true, children render via `PostCardContent` (full view).
  - Comment posts still use `EmbeddedCommentList` for correct behavior.
- Drop handling inside container for:
  - Library posts
  - SVG clipart
  - Existing padlets

Library / Post Integration
- Library items are normalized to draft payloads with:
  - `type`, `title`, `content`, `metadata`, `width`, `height`
- External clipart is normalized to `type: 'image'` with:
  - `metadata.imageUrl`, `metadata.previewUrl`
- In timeline:
  - Library drop on the line creates a **new container** with the dropped item.
  - Drop onto a container inserts as a child.

Design Details
- Container cards: `min-w-[280px]`, `min-h-[160px]`
- Date badge (per container):
  - Label: `metadata.timelineLabel || created_at` formatted
  - Color: `metadata.timelineBadgeColor || #3b82f6`
  - Right-click opens date menu

Restore Checklist
1) Verify `canvas.layout === 'timeline'` and `chronoMode` in settings.
2) Ensure `containerPadlets` filters root containers only.
3) Confirm all timeline modes render the correct layout.
4) Ensure `handleLineDrop` creates a container with a library item.
5) Ensure timeline containers render children via `RowColumnContainerCard` with `renderFullPostContent={true}`.
6) Confirm comments render using `EmbeddedCommentList` inside timeline containers.

Common Failure Modes
- Library items show as thumbnails only:
  - `RowColumnContainerCard` missing `renderFullPostContent` usage.
- Comment posts not rendering:
  - `RowColumnContainerCard` must use `EmbeddedCommentList` for comments.
- Timeline ordering incorrect:
  - `position_in_timeline` not set or sorting broken.
- Drop on timeline line does nothing:
  - `handleLineDrop` not wired to `onDropLibraryCreateContainer`.

Last Known Good Files
- `components/canvas/ChronoTimelineCanvas.tsx`
- `app/dashboard/canvas/[id]/CanvasClient.tsx`
- `components/collabboard/RowColumnContainerCard.tsx`

