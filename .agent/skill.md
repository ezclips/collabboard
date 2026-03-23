---
name: Canvas Implementation Notes
description: Current implementation notes for map, freeform, drawing, library placement, image editing, and AI post behavior in CanvasClient and related canvas components. Updated 2026-03-20.
---

# Canvas Implementation Notes

## Scope

This documents the implemented map canvas behavior in this repo and the key constraints for future edits.

## Core Integration

- Canvas entry point: `app/dashboard/canvas/[id]/CanvasClient.tsx`
- Map component: `components/map/MapCanvas.tsx`
- Search control: `components/map/MapSearchControl.tsx`
- Marker/cluster layer: `components/map/MarkersLayer.tsx`
- Pin popup container: `components/map/PostPopup.tsx`
- Geo helpers: `lib/map/geojson.ts`

`CanvasClient` should keep map-specific branching minimal and only wire props/state needed by `MapCanvas`.

## Implemented Behavior

1. Search and create
- Mapbox Search JS is wired through `MapSearchControl`.
- Selecting a result creates a draft location and supports `Create Post Here`.

2. Pin containers
- Map posts are `type: "container"` with map coordinates.
- Pin click opens popup above the pin and sets active container context.
- Left toolbar add-tools create child posts into the active pin container via `metadata.parentId`.

3. Popup UX
- Popup header shows title (small), light-gray pencil, and close `x` in one row.
- Pencil opens standard container editor.
- Popup prevents click propagation so first pencil click does not close popup.
- `Edit Location` button removed from popup actions.

4. Child resolution consistency
- Container views resolve children from both:
  - `metadata.childPadletIds`
  - `metadata.parentId === containerId`
- This is applied in:
  - `RowColumnContainerCard`
  - `CanvasModals` -> `ContainerEditor` childPadlets
  - map pin counter fallback logic

5. Drop Pin + Address Picker flow (implemented 2026-03-06)
- User clicks `Drop Pin` (top-right toolbar), then clicks the map to place an amber draft pin.
- User can also reposition an existing pin and confirm with `Save Location`.
- Address picker opens and presents nearby labels from Mapbox reverse search (`searchbox/v1/reverse`), up to 5 options plus a coordinate fallback.
  - Query types: `address,street,poi`
  - Fallback row is always present so flow never blocks.
- Draft pin remains draggable. After moving it, the picker options refresh for the new coordinates.
- Selecting an address commits label/location and opens (or keeps) the pin container context.
- Dismissing the picker (`x`) leaves the draft pin in place so user can continue adjusting.
- Pin labeling should prefer selected human-readable address over raw coordinates whenever available.

6. Map sidebar (implemented 2026-03-06)
- Sidebar is rendered by `components/map/MapSidebar.tsx` and mounted from `MapCanvas`.
- Sidebar is map-canvas only; opened/closed from the main left toolbar map-pin button.
- Header control order is:
  - title (left)
  - `Manual`/`Auto` toggle (middle, fixed width to prevent label-width UI jump)
  - close `x` (right)
- `Add section` uses the same button shape as other header controls (`rounded-md`).
- Sidebar top offset is below search/drop-pin controls to avoid overlap.
- Sections support:
  - add, rename (single click title -> select-all edit), delete if empty
  - collapse/expand
  - drag reorder
- Posts support:
  - drag reorder in `Manual`
  - in `Auto`, same-section free reorder is disabled, cross-section move remains enabled
- Selection synchronization:
  - sidebar row click -> flyTo marker + open popup
  - marker click -> highlight corresponding sidebar row + auto-expand section if collapsed
- `Unplaced` is a virtual section for posts without valid/known section mapping.
- Sidebar map-post detection uses `getPadletMapLocation` so it matches marker inclusion logic.

## Technical Fixes Applied

- `react-map-gl` import path uses `react-map-gl/mapbox` (not package root).
- `@mapbox/search-js-react` is client-only/dynamic to avoid SSR `document is not defined`.
- Nested button hydration issue removed by marker/popup structure update.
- Map popup and editor now show all children even when `childPadletIds` is stale.
- Right-click on pins was blocked by a Mapbox GL `mousedown` race at map-container level (`button === 2` consumed before child `contextmenu` handlers were reliable).
- Temporary mitigation (`stopPropagation` on marker `mousedown/contextmenu`) was not robust across browsers/device input combinations.
- Final decision: abandon right-click dependent pin flows and use explicit/drop-pin driven address-picker interactions.
- Map post move/reorder logic was updated to use `getPadletMapLocation` (instead of `typeof location_lng === "number"` checks) to avoid excluding valid rows when coordinates arrive as non-number primitives.
- Sidebar section-grouping fallback sends unknown section IDs to `Unplaced` so pins do not silently disappear from the sidebar.

### Popup comment input / button interaction fix (2026-03-07)

**Problem:** In canvas mode (map popup), comment textarea would not accept typed text, and buttons (Send, Edit, Close) would not trigger.

**Root cause:** Mapbox GL JS attaches native listeners to `mapboxgl-canvas-container`. React 17+ attaches its root synthetic-event listener to the React root (`#__next`), which is *above* the canvas container in the DOM. The bubble order is:

```
button → popup wrapper → mapboxgl-canvas-container (Mapbox fires here) → #__next (React fires here)
```

- **Typing blocked:** Mapbox's keyboard handler class intercepted `keydown` events (arrow keys `preventDefault`'d), stealing cursor movement and character insertion.
- **Click-to-close:** Mapbox's click listener unmounted the popup before React's `onClick` on buttons could fire.
- **Drag start:** Mapbox's `mousedown` handler called `canvas.focus()`, stealing focus from the input.

**Failed approaches:**
- React synthetic `stopPropagation` on popup wrapper: fires too late — Mapbox's native listener already ran.
- Stopping ALL native events at the wrapper (including `click`/`keydown`): broke button `onClick` and Enter-to-submit, because React's root listener also never saw those events.
- Disabling Mapbox drag/scroll/keyboard handlers entirely when popup open: too broad, blocked other map interactions.

**Correct fix — two-part:**

1. **`MapCanvas.tsx`** — `map.keyboard.disable()` when `selectedPostId` is set; re-enable on close. Prevents Mapbox keyboard handler from intercepting `keydown` while popup is open. An `eventCameFromPopup` guard on the map `onClick` prop checks `event.originalEvent.target.closest('[data-map-popup-root="true"]')` and returns early, preventing the popup from being closed by map clicks originating inside it.

2. **`PostPopup.tsx`** — Native DOM listeners (not React synthetic) attached in a `useEffect` on the popup root div, stopping ONLY the events Mapbox uses to start drag/zoom interactions:
   ```
   mousedown, pointerdown, touchstart, touchmove, wheel
   ```
   `click`, `keydown`, `keyup`, `contextmenu`, `mouseup`, `pointerup`, `touchend` are intentionally NOT stopped so React's root listener and `ColumnPostContextMenu` still receive them.

**Key rule:** Never stop `click` or `keydown` propagation on the popup wrapper - those events must reach the React root (`#__next`) above the Mapbox canvas container, or React's synthetic `onClick`/`onKeyDown` on buttons and inputs will silently not fire.

### Badge color propagation fix (2026-03-07)

**Problem:** The comment-count badge stayed blue in map popup/comment views even after selecting a custom badge color (for example orange) in `CommentEditor`.

**Root cause:** The visible counter came from `EmbeddedCommentList`, which used a hardcoded Tailwind class (`bg-blue-500`). In parallel, map marker badge color had to be resolved from child comment metadata (`metadata.parentId === containerId`) rather than from container metadata.

**Implemented fix:**

1. **`MapCanvas.tsx`**
- Removed old pin badge color wiring via `onChangePinBadgeColor`.
- Marker badge color now resolves from child posts:
  - find child where `metadata.parentId === post.id` and `metadata.badgeColor` is set
  - use that color for marker bubble + pointer
  - fallback keeps existing selected/default styling

2. **`PostPopup.tsx`**
- Removed popup-header badge color button/swatch UI so color source remains only the editor flow.

3. **`CanvasClient.tsx`**
- Removed obsolete `onChangePinBadgeColor` prop wiring into `MapCanvas`.

4. **`EmbeddedCommentList.tsx` + call sites**
- Added `badgeColor?: string` prop.
- Replaced hardcoded counter class `bg-blue-500` with inline `style={{ backgroundColor: badgeColor || '#3b82f6' }}`.
- Passed `badgeColor` from comment child metadata at all active render sites:
  - `RowColumnContainerCard`
  - `PostCardContent`
  - `RowCanvas`
  - `DrawingLayout`

**Resulting flow:**
- Right-click pin -> edit comment post in modal -> choose badge color -> save.
- `saveComment` writes `metadata.badgeColor` on the child comment post.
- Map marker counter and embedded comment counters read that saved child badge color and render consistently.

### Edit-post submenu ordering parity fix (2026-03-07)

**Problem:** In the map pin context menu, `Edit post` submenu order could differ from the visual child order in the container card (example: `image` appeared above `comment`).

**Root cause:** `PostPopup.tsx` passed `openTargets={childPadlets}` directly to `ColumnPostContextMenu` without applying the same comment-first ordering used by `RowColumnContainerCard`.

**Implemented fix (`PostPopup.tsx`):**
- Added local `isCommentTarget` detection:
  - `target.type === 'comment'` (case-insensitive), or
  - missing type with `metadata.comments` array fallback.
- Built `orderedOpenTargets` with:
  - comments first
  - then non-comment children
- Passed `openTargets={orderedOpenTargets}` to `ColumnPostContextMenu`.

**Result:** `Edit post` submenu now matches container ordering, so comment entries stay on top when container view is comment-first.

### Pin marker shape + contrast update (2026-03-08)

**Problem:** Map pins had duplicate visuals (cluster/unclustered + custom marker), low contrast issues for count text on some colors, and repeated seam artifacts where circle+diamond outlines intersected.

**Implemented fix (`MapCanvas.tsx`, `MarkersLayer.tsx`):**
- Removed unclustered circle layer from `MarkersLayer`; only clusters render from layer, individual pins render via custom marker in `MapCanvas`.
- Pin fill now follows container background color (`metadata.cardColor`) with fallback `#0f172a`.
- Pin count text uses auto-contrast (`getContrastTextColor`) plus stroke outline for readability on all pin colors.
- Replaced multi-element circle+square pin composition with a **single merged SVG path** (one object) to eliminate outline seam/intersection artifacts.
- Final pin geometry: round top, cut bottom arc, two straight sides converging to one pointer tip.

**Result:**
- No duplicate pin visual.
- Readable count number on light and dark pin colors.
- One-object pin pointer shape without border seams from overlapping elements.

## Current Map Data Contract

- Container/pin row stores:
  - `location_lng`, `location_lat`, `location_label`
  - `metadata.mapLocation = { lng, lat, label }`
- Child posts under a pin should always set:
  - `metadata.parentId = <containerId>`

`childPadletIds` may exist for ordering/legacy, but rendering must not depend on it alone.

## Guardrails

- Do not reuse Freeform-only container UI for map popup.
- Keep map popup using standard container/card behavior.
- Do not add Google/OSM external buttons back in popup unless explicitly requested.
- Keep map token in `.env.local` as `NEXT_PUBLIC_MAPBOX_TOKEN`.
- Do not implement product-critical map pin flows that depend on right-click/contextmenu.
- Treat right-click on map pins as non-deterministic with Mapbox GL due to event ordering at the map container.

## Regression Checklist

1. Click pin -> popup opens centered above pin.
2. Click pencil once -> container editor opens immediately.
3. Add first, second, third post via left toolbar -> all appear in same container editor.
4. Pin counter equals number of child posts.
5. No nested button hydration warnings.
6. No SSR `document is not defined` from map search.
7. Click `Drop Pin` -> click map -> amber draft pin appears and address picker opens.
8. Drag amber draft pin -> address options refresh for new coordinates.
9. Pick address -> post is created/updated with selected label, picker closes, pin becomes normal marker.
10. Dismiss picker (`x`) -> draft pin stays and user can continue drag/select flow.
11. Map-pin toolbar button toggles sidebar open/close on map canvas only.
12. Sidebar header controls do not overlap search/drop-pin controls.
13. `Manual` and `Auto` toggle keeps fixed width (no text-width "dancing").
14. Sidebar and markers show the same set of map posts (search-created and drop-pin-created).
15. Unknown/missing section IDs render under `Unplaced` instead of disappearing.
16. Section title click enters inline rename with selected text and Enter/Blur save, Esc cancel.
17. Open pin popup -> click comment input -> type text -> cursor moves and characters appear (Mapbox keyboard handler must not intercept).
18. Type comment and press Send (click or Enter) -> comment appears in list -> page refresh retains it.
19. Pencil (edit container) and close (x) buttons in popup header are clickable and trigger their actions without closing the popup first.
20. Change comment badge color in `CommentEditor` and save -> map pin count badge uses the saved color.
21. Open popup/container with embedded comment list -> small `Comments` count badge uses the same saved `badgeColor` (not hardcoded blue).
22. In map pin context menu, `Edit post` submenu order matches container child order (comment-first when comment cards are rendered first).
23. Map pin is rendered as one merged SVG object (no circle/diamond seam), uses `metadata.cardColor` fill, and count text remains readable via auto-contrast + text outline.

---

# Ghost Drag / Drop-into-Container Fix History (2026-03-09)

## Scope

Documents the ghost container drag-and-drop system used across Wall, Columns, Timeline, and Grid layouts for placing new posts into existing containers.

## Architecture

### Ghost Drag Flow

1. User creates a post (note, link, todo, etc.) from the left toolbar.
2. `usePadletSave` detects the layout needs container placement and calls the appropriate callback:
   - **Columns/Grid:** `setPendingPostDraft` + `setIsPlacementPromptOpen(true)` → `ColumnContainerCreationPrompt` modal
   - **Wall:** `setWallPendingPostDraft` + `setWallPlacementPromptOpen(true)` → `WallPlacementPrompt` modal
   - **Timeline:** `onTimelinePlacementStart` callback → starts ghost drag directly (no modal)
   - **Drawing:** `onDrawingPlacementStart` callback → `PlacementPrompt` modal
3. When user chooses "Add to Existing" from a modal (or timeline starts directly), the ghost drag activates:
   - `setNewPostDragState({ isActive: true, draft: ..., cursor: ..., grabOffset: ... })`
   - `setPlacementContext('columns' | 'wall')`
4. `GhostDragElement` renders a fixed-position overlay following the cursor.
5. A `useEffect` in `CanvasClient` attaches window-level `mousemove`/`mouseup`/`keydown` listeners.
6. On mouseup over a container, `createRealPostFromDraft(draft, containerId)` creates the post.

### Key Files

- `app/dashboard/canvas/[id]/CanvasClient.tsx` — Ghost drag `useEffect`, `createRealPostFromDraft`, placement callbacks
- `components/collabboard/canvas/ui/GhostDragElement.tsx` — Visual ghost overlay (fixed, pointer-events-none, z-9999)
- `components/collabboard/canvas/hooks/useCanvasInteractions.ts` — Freeform drag/resize (does NOT handle ghost drag)
- `hooks/canvas/usePadletSave.ts` — Routes new-post saves to correct placement flow per layout

### State

- `newPostDragState: { isActive, draft, cursor, grabOffset }` — controls ghost visibility and carries the draft
- `newPostHoverContainerId: string | null` — which container the cursor is over (for highlight feedback)
- `hoverContainerRef: React.MutableRefObject<string | null>` — synchronous mirror of hover target (avoids stale closure)
- `placementContext: 'columns' | 'wall' | null` — where the drag originated (for cancel-routing)
- `pendingPostDraft` / `wallPendingPostDraft` — layout-specific draft state

## Fixes Applied

### 1. Missing `placementContext` state declaration

**Problem:** `setPlacementContext` called at lines 1388 and 1410 but never declared → runtime error "setPlacementContext is not defined".

**Root cause:** The `useState<'columns' | 'wall' | null>(null)` declaration was accidentally removed.

**Fix:** Added `const [placementContext, setPlacementContext] = useState<'columns' | 'wall' | null>(null);` after `newPostHoverContainerId` state.

### 2. Missing Ghost Drag Mouse Tracking `useEffect`

**Problem:** Ghost container showed and was draggable but would never drop into a container. The ghost disappeared on mouseup without creating the post.

**Root cause:** The entire `useEffect` that attaches window-level `mousemove`/`mouseup`/`keydown` listeners was missing from `CanvasClient`. Without it:
- No DOM-based hit testing (`document.elementFromPoint` + `data-container-id`) to detect which container the cursor hovers
- No `mouseup` handler to call `createRealPostFromDraft`

The coordinate-based hit testing in `useCanvasInteractions` only works for freeform layout (uses `position_x`/`position_y`), not CSS-positioned layouts (Wall, Columns, Timeline, Grid).

**Fix:** Added the full `useEffect` with DOM-based container detection using `document.elementsFromPoint` + `[data-container-id]`.

### 3. Multiple duplicate posts created on drop (4 copies)

**Problem:** Dropping a ghost onto a container created 4 copies of the post.

**Root cause:** Both the new `useEffect` (window listeners) AND `useCanvasInteractions` hook handled ghost drag:
- `useEffect` `handleMouseUp` → `createRealPostFromDraft` or `handlePlaceInExisting`
- `useCanvasInteractions` `handleCanvasMouseUp` → `handlePlaceInExisting` → `handleContainerPick` → `createRealPostFromDraft`
- Canvas div `onMouseUp` and `onMouseLeave` both called `handleCanvasMouseUp`

Multiple code paths all triggering `createRealPostFromDraft` on the same event.

**Fix:** Made `useCanvasInteractions` early-return when `newPostDragState.isActive`:
- `handleCanvasMouseMove`: `if (newPostDragState.isActive) return;`
- `handleCanvasMouseUp`: `if (newPostDragState.isActive) return;`

Now only the `useEffect` in `CanvasClient` handles ghost drag events.

### 4. Stale closure — drop appears to work then disappears

**Problem:** Ghost drop looked like it would land (hover highlight), but the post vanished ~0.5s later, or multiple copies appeared then were cleaned up.

**Root cause:** `handleMouseUp` in the `useEffect` read `newPostHoverContainerId` from its closure, but `handleMouseMove` set it via `setNewPostHoverContainerId()` — a React state update. Since these are native DOM listeners (not React synthetic events), React may not have flushed the state update before `mouseup` fires. The closure captured `null` → hit the else branch → cancelled the drop and reopened the placement prompt.

**Fix:** Added `hoverContainerRef = useRef<string | null>(null)` written synchronously in `handleMouseMove` and read in `handleMouseUp`. Removed `newPostHoverContainerId` from the `useEffect` dependency array. The ref always has the latest value regardless of React's render timing.

### 5. `elementFromPoint` blocked by ghost overlay

**Problem:** Ghost container showed, but hovering over containers never detected them — `hoverContainerRef` stayed `null`.

**Root cause:** `document.elementFromPoint()` returns the topmost rendered element at that coordinate. The `GhostDragElement` is at `z-index: 9999` with `position: fixed`. Despite having `pointer-events: none` (which makes it transparent to mouse events), `elementFromPoint` does NOT respect `pointer-events` CSS — it always returns the topmost element in the rendering tree. So it returned the ghost div, `.closest('[data-container-id]')` found nothing.

**Fix:** Switched from `document.elementFromPoint()` to `document.elementsFromPoint()`, which returns ALL elements at that point stacked top-to-bottom. The loop walks through them until it finds one with a `[data-container-id]` ancestor:
```ts
const elements = document.elementsFromPoint(e.clientX, e.clientY);
for (const el of elements) {
  const found = el.closest('[data-container-id]');
  if (found) { containerEl = found; break; }
}
```

### 6. Timeline layout missing ghost drag entirely

**Problem:** Timeline layout never showed the ghost container. Adding a post just silently did nothing.

**Root cause:** `usePadletSave` calls `onTimelinePlacementStart?.(timelineDraft)` for timeline layout, but `CanvasClient` never passed the `onTimelinePlacementStart` callback to `usePadletSave`. The optional chaining `?.` silently skipped the call.

**Fix:** Added `onTimelinePlacementStart` to the `usePadletSave` call in `CanvasClient`:
```ts
onTimelinePlacementStart: (draft) => {
  setPendingPostDraft(draft);
  setPlacementContext('columns');
  setNewPostDragState({ isActive: true, draft, cursor: { x: 0, y: 0 }, grabOffset: { x: 0, y: 0 } });
  toast.info('Click a container to place your post');
},
```

### 7. Stale `createRealPostFromDraft` after page refresh (first-attempt failure)

**Problem:** On the wall canvas, after a page refresh the first ghost drag attempt fails silently — the ghost appears, user drags to a container, drops, but no post is created. The second attempt works fine.

**Root cause:** When Fix #4 removed `newPostHoverContainerId` from the `useEffect` dep array (replaced by `hoverContainerRef`), the effect stopped re-running on every hover change. This means `createRealPostFromDraft` is captured once — when `isActive` becomes `true` — and never refreshed. After a page refresh, `padlets` goes through multiple reference changes (initial `[]` → fetched data → z-index migration re-fetch → realtime subscription updates). If `padlets` changes after the effect captures `createRealPostFromDraft`, the captured function has stale `padlets` → `padlets.find(p => p.id === containerId)` returns `undefined` → `if (!container) return` silently exits. On the second try, `padlets` is stable, so the freshly captured function works.

**Fix:** Added `createRealPostFromDraftRef` (a ref always pointing at the latest function), same pattern as `hoverContainerRef`:
```ts
const createRealPostFromDraftRef = useRef(createRealPostFromDraft);
useEffect(() => { createRealPostFromDraftRef.current = createRealPostFromDraft; });
```
In `handleMouseUp`:
```ts
createRealPostFromDraftRef.current(newPostDragState.draft, hoverId);
```

## Guardrails

- Ghost drag is handled EXCLUSIVELY by the `useEffect` in `CanvasClient`. `useCanvasInteractions` must early-return when `newPostDragState.isActive`.
- Always use `document.elementsFromPoint()` (plural), never `elementFromPoint()` — the ghost overlay at z-9999 blocks single-element hit testing.
- Always use `hoverContainerRef` (ref) for the drop target in `handleMouseUp`, never the React state `newPostHoverContainerId` (stale closure risk).
- Always use `createRealPostFromDraftRef.current(...)` in the ghost-drag `useEffect`, never the bare `createRealPostFromDraft` — both suffer the same stale-closure problem when the effect dep array omits `padlets`.
- All layout container components must render `data-container-id={container.id}` on their container div for DOM-based hit testing to work.
- When adding a new layout that needs ghost drag, wire the corresponding `on<Layout>PlacementStart` callback in the `usePadletSave` call.

## Regression Checklist (Ghost Drag)

1. **Columns:** Create note from toolbar → "Add to Existing" → ghost appears → drop on container → post created (1 copy only).
2. **Wall:** Create note from toolbar → "Add to Existing" → ghost appears → drop on container → post created (1 copy only).
3. **Timeline:** Create note from toolbar → ghost appears immediately → drop on timeline container → post created.
4. **Cancel:** Start ghost drag → release mouse NOT over a container → placement prompt reopens (Wall prompt for wall, Column prompt for columns).
5. **Escape:** Start ghost drag → press Escape → ghost disappears, draft cleared.
6. **No duplicates:** Drop should create exactly 1 post, never 2+ copies.
7. **Hover detection:** Ghost cursor over a container should set `newPostHoverContainerId` (for any future highlight feedback).
8. **Grid:** Grid layout uses `setIsPlacementPromptOpen` path → same ghost flow as columns.
9. **First attempt after refresh:** Hard-refresh the page → create a post → "Add to Existing" → ghost drop into wall container → post MUST be created on the very first attempt (stale-closure regression).

---

# Library Click-to-Place Flow (2026-03-16)

## Scope

Documents the library panel interaction changes: external clipart items are now placed via click → edit → container placement, replacing the previous drag-and-drop workflow.

## Architecture

### Flow by Layout

**Freeform:**
1. User opens Library panel (left toolbar BookOpen button).
2. Clicks a clipart item preview → library closes, card editor opens with `padletToEdit = { id: 'new', type: 'card', metadata: { svgUrl, iconBgColor, ... } }`.
3. User edits card (title, content, colors) and saves → `saveCard` inserts directly to DB with random canvas coordinates.

**Map:**
1. Same click → editor flow.
2. `onClipartClick` in CanvasClient auto-sets `metadata.parentId = mapActiveContainerId` (the open pin).
3. On save, `saveCard` skips placement check (already has parentId) → inserts card and updates container's `childPadletIds`.

**Wall / Columns / Grid / Timeline / Drawing / Scheduler:**
1. Same click → editor flow.
2. On save, `saveCard` calls `checkPlacementRequired()` which routes to the appropriate placement modal:
   - Wall → `WallPlacementPrompt` ("New Container" / "Add to Existing")
   - Columns/Grid → `ColumnContainerCreationPrompt`
   - Timeline → ghost drag directly (no modal)
   - Drawing → `PlacementPrompt`
   - Scheduler → scheduler slot placement
3. User completes placement (new container or ghost-drag to existing).

### Key Changes

**`components/collabboard/LibraryPanel.tsx`:**
- Added `onClipartClick?: (svgUrl: string, title: string) => void` prop.
- External clipart items: **drag removed** (no more `draggable` / `onDragStart`).
- Click on **preview area** → calls `onClipartClick` (or `onSelectClipart` in icon-replace mode).
- Click on **checkmark** → only toggles selection for "Delete selected" (uses `stopPropagation`).
- Selected items show subtle `border-gray-400` instead of bold `border-blue-500 ring-2 ring-blue-200`.

**`app/dashboard/canvas/[id]/CanvasClient.tsx`:**
- `onClipartClick` handler on `<LibraryPanel>`: creates temporary card padlet (`id: 'new'`), closes library, opens card editor.
- Map layout: auto-attaches `parentId = mapActiveContainerId`.
- Passes `isFreeformLayout` and `isMapLayout` to `usePadletSave`.

**`hooks/canvas/usePadletSave.ts`:**
- Added `isFreeformLayout` and `isMapLayout` params to `UsePadletSaveParams`.
- `saveCard` now calls `checkPlacementRequired` for new cards — **except** on freeform layout and map layout with parentId.
- New cards with `parentId` update the container's `childPadletIds` array after insert.

**`types/collabboard.ts`:**
- Added `'card'` to `PendingPostDraft.kind` union.

### Hints

The P2 library hint in CanvasClient (dynamic hint bar) was updated:
- **Map:** "Click a clipart to edit and place it in the open pin"
- **Freeform:** "Click a clipart to edit and place it on the canvas"
- **Other layouts:** "Click a clipart to edit, then choose a container. Use ✓ to select for deletion"

Library toolbar tooltip updated: removed "drag & drop" reference.

---

# Dynamic Per-Layout Hint System (2026-03-15)

## Scope

Documents the Excalidraw-style hint bar at the bottom of the canvas that shows context-sensitive hints based on current layout + tool mode.

## Architecture

### Location

`app/dashboard/canvas/[id]/CanvasClient.tsx` — inline IIFE inside JSX render, approximately line ~4596–4720.

### Visual Styling

Modeled after Excalidraw's `HintViewer`:
- Fixed to bottom center of canvas (`fixed bottom-4 left-1/2 -translate-x-1/2`).
- Background: `bg-white/70 backdrop-blur` with rounded-lg, shadow, border.
- Text: `text-[11px] text-gray-500` with inline `<kbd>` badges.
- `<kbd>` style: `{ display: 'inline-block', padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.06)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: 0.3, border: '1px solid rgba(0,0,0,0.08)' }`.
- `pointer-events-none` so it never blocks canvas interaction.
- `z-[1000]` to stay above canvas content but below modals.

### Color Adaptation

`getGraphConnectHintStyle()` (line ~739) returns `{color, fontSize}` based on background luminance:
- Dark bg (`luminance < 0.45`): `color: 'rgba(255,255,255,0.72)'`
- Light bg: `color: 'rgba(15,23,42,0.55)'`

### Priority System

Hints are evaluated in priority order. First match wins — later conditions are skipped:

| Priority | Condition | Hint |
|----------|-----------|------|
| **P0** | `isFreeformGraphMode && graphConnectFrom` | "Now click the **TO** post to create the connection. Esc to cancel" |
| **P0** | `isFreeformGraphMode && !graphConnectFrom` | "Select a post **FROM**, then a post **TO** to connect them. Del removes selected edge" |
| **P0** | `isLineMode` | "Click to start a line, click to add points, double-click or Esc to finish" |
| **P1** | `selectedLineId && lineEditModeId` | "Drag control points to reshape. Click away or Esc to finish editing" |
| **P1** | `selectedLineId` | "Line selected — Double-click to edit, Delete to remove, Esc to deselect" |
| **P2** | `isLibraryOpen` (map) | "Click a clipart to edit and place it in the open pin" |
| **P2** | `isLibraryOpen` (freeform) | "Click a clipart to edit and place it on the canvas" |
| **P2** | `isLibraryOpen` (other) | "Click a clipart to edit, then choose a container. Use ✓ to select for deletion" |
| **P3** | `newPostDragState.isActive` (freeform) | "Drop to place the post on the canvas" |
| **P3** | `newPostDragState.isActive` (other) | "Drop to place the post into a container" |
| **P4** | Empty canvas per layout | Layout-specific onboarding hints (e.g., "Use the toolbar to add your first post") |

### Layout Variables Used

Defined at ~line 768 in CanvasClient:
- `isWallLayout`, `isColumnsLayout`, `isGridLayout`, `isFreeformLayout`
- `isTimelineLayout`, `isMapLayout`, `isDrawingLayout`, `isSchedulerLayout`
- `isFreeformGraphMode` (freeform + graph enabled)

### Guardrails

- Hints must be `pointer-events-none` — never block canvas clicks.
- P0 hints (graph connect, line mode) always win over library/ghost drag hints.
- Library hint (P2) must reflect the current interaction model (click-to-place, not drag).
- Ghost drag hint (P3) uses "canvas" for freeform, "container" for everything else.
- Empty-canvas hints (P4) only show when layout has zero relevant posts/containers.

## SVG Clipart Rendering Fixes (2026-03-15)

### Container Drop Type Mismatch

**Problem:** When SVG clipart was dropped into a container (via the old drag flow), it was saved as `type: 'image'` with `metadata.imageUrl`, causing the IMAGE handler in PostCardContent to render it with `object-cover` + `maxHeight: 160px` — clipping the SVG.

**Root cause:** `RowColumnContainerCard.tsx` drop handler for `application/collabboard-svg` hardcoded `type: 'image'` and mapped `svgUrl → metadata.imageUrl`.

**Fix (`RowColumnContainerCard.tsx`):** Changed drop handler to create `type: 'card'` with `metadata.svgUrl` and `iconBgColor`, matching the freeform card creation path.

### SVG Image Detection in PostCardContent

**Problem:** Existing container children already saved as `type: 'image'` with `.svg` URLs were still rendered with `object-cover` + `maxHeight: 160px`.

**Fix (`PostCardContent.tsx`):**
- Added `isSvgImage` detection: `imageSrc.endsWith('.svg') || imageSrc.includes('.svg?')`.
- SVG images in containers now render with `object-contain` (not `object-cover`) and no `maxHeight` cap.
- Non-SVG images keep existing `object-cover` + `maxHeight: 160px` behavior.

### Card/Clipart Type Handler

**PostCardContent.tsx** has a dedicated CARD/CLIPART handler (`type === "card" && metadata.svgUrl`):
- Renders: `<img src={svgUrl} className="w-full h-auto object-contain" />` inside icon background color div.
- No maxHeight — lets SVG display at natural proportions.
- `isCardClipart` guard at the IMAGE TYPE section prevents card posts from being caught by the image branch.

**RowColumnContainerCard.tsx** child detection:
- `isCardChild = child.type === 'card' && !!child.metadata?.svgUrl` → gets `p-0` padding (edge-to-edge).
- `isImageChild` with `.svg` URL → also gets `p-0`.

## Guardrails

- External clipart items in LibraryPanel must NOT be draggable. Placement goes through click → editor → container prompt.
- Checkmark on clipart items must ONLY toggle selection for deletion, never trigger placement.
- `saveCard` must call `checkPlacementRequired` for new cards on all container-based layouts.
- Freeform and Map (with active pin) skip placement check — they can insert directly.
- Map clipart placement must always update `childPadletIds` on the target container.
- SVG clipart dropped into containers must be created as `type: 'card'` with `metadata.svgUrl`, never `type: 'image'` with `metadata.imageUrl`.

## Regression Checklist (Library + Clipart)

1. **Library click (freeform):** Click clipart → editor opens, library closes → save → card appears on canvas.
2. **Library click (map):** Open pin → click clipart → editor opens → save → card appears in pin popup.
3. **Library click (wall):** Click clipart → editor → save → "Where should this go?" modal → "New Container" creates container with card inside.
4. **Library click (columns):** Same flow as wall but with column container prompt.
5. **Library click (timeline):** Click clipart → editor → save → ghost drag starts → drop on timeline container.
6. **Checkmark:** Click checkmark → toggles selection (for Delete selected) → does NOT open editor.
7. **No drag:** Clipart items are not draggable. No drag ghost appears on mouse drag.
8. **Icon replace mode:** When editing a card and clicking "Icon" → library opens in icon-replace mode → clicking clipart replaces the icon (existing behavior preserved).
9. **SVG in container:** Card-type SVG children render at full proportional height, not clipped.
10. **Legacy image-type SVG:** Older SVG items saved as `type: 'image'` render with `object-contain` (not `object-cover`).

---

# Drawing Canvas Load Stability (2026-03-19)

## Scope

Documents the initial-load stabilization changes for the Excalidraw-backed drawing canvas.

## Key Files

- `components/collabboard/canvas/layouts/DrawingLayout.tsx`

## Implemented Behavior

1. Embeddable scene reconciliation
- Drawing embeddables now carry a `customData.renderSignature` derived from padlet render fields (`type`, `title`, `content`, `file_url`, `position_x`, `position_y`, `width`, `height`, `metadata`).
- When live padlet data differs from the stored Excalidraw embeddable element, the scene element is refreshed in place (`x`, `y`, `width`, `height`, version/versionNonce, updated timestamp).

2. One-shot post-load bound refresh
- After Excalidraw mounts and padlets are loaded, all existing `padlet://` embeddables receive one synthetic `updateScene(..., commitToHistory: false)` refresh plus `updateBoundElements(...)`.
- This is intended to settle detached connector lines and stale embeddable wrappers immediately on first open, without requiring the user to move a post.

3. Embeddable remount on render changes
- `renderEmbeddable` now keys `DrawingEmbeddableCard` by `padletId + renderSignature`.
- This forces a remount when clipart/icon/media render inputs change, preventing stale first-paint content that only appeared after a later move.

## Guardrails

- Any synthetic Excalidraw `updateScene` used for embeddable reconciliation must set `isSyncingEmbeddablesRef.current = true` so `handleChange` does not trigger an auto-save cascade.
- Do not remove `customData.renderSignature` from padlet embeddables; it is part of the stale-render invalidation path.
- Use `updateBoundElements` when embeddables are refreshed or inserted so arrow bindings reroute immediately.

## Regression Checklist

1. Open drawing canvas after hard refresh -> clipart/icon cards render on first load.
2. Connected lines start attached on first load (no manual nudge required).
3. Existing drawings still save normally (synthetic refresh must not spam autosave history).

---

# Freeform Image Post Editing (2026-03-19)

## Scope

Documents the final split between the freeform image-post editing flow and the add/upload image editor.

## Key Files

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`
- `components/collabboard/editors/ImageActionsToolbar.tsx`
- `components/collabboard/editors/ImageDrawingLayer.tsx`
- `components/collabboard/editors/ImageEditor.tsx`

## Final Behavior

1. Freeform image post edit entry points
- The image post pencil/edit path in freeform must open the image-post editing window (vertical toolbar on the left, active image on the right).
- It must NOT route to the add/upload image editor window (`Add Image`, `Search Pexels`, `Upload File`).

2. Image-post editing layout
- The working image-post editor layout lives in the freeform image-toolbar path in `FreeformPadletCards.tsx`, using `ImageActionsToolbar`.
- That layout consists of:
  - a separate vertical toolbar
  - a single active image beside it
  - modal layering above the canvas so graph lines/posts do not paint over it

3. Add/upload image editor separation
- `ImageEditor.tsx` remains the add/upload image flow and must not be reused for the freeform image-post edit button.
- The visual signs of the wrong path are:
  - `Add Image` title
  - `Search Pexels`
  - `Upload File`

4. Image text overlay fix
- In `ImageDrawingLayer.tsx`, text overlay save/export now scales text position, font size, background box, border, padding, and line height from display coordinates back to original image coordinates.
- Large text sizes must keep the background box sized correctly in the editor and remain centered when saved back to canvas.

## Guardrails

- For freeform image-post editing, do not route the edit button through the add/upload editor path.
- Keep the add/upload editor and the image-post editor as separate products; they serve different jobs.
- Modal layering for the image-post editor must mount outside transformed canvas stacking contexts.

## Regression Checklist

1. Click freeform image post pencil -> opens the image-post editing window (toolbar left, image right).
2. The wrong add/upload editor never opens from that image-post pencil.
3. `Color`, `Caption`, `Draw on top`, `Reaction`, and `Comment` still work from the image-post editing window.
4. Large text overlay background boxes grow with font size.
5. Saved image text remains visually centered on the canvas.

---

# Freeform AI Post Behavior (2026-03-20)

## Scope

Documents the current freeform AI component post behavior: resize, collapse/expand, and export.

## Key Files

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`
- `components/collabboard/AIComponentRenderer.tsx`
- `components/collabboard/AIComponentExportMenu.tsx`

## Implemented Behavior

1. Resizing
- AI component posts use stored `padlet.width` / `padlet.height` instead of a hardcoded fixed width.
- `AIComponentRenderer` exposes a bottom-right resize handle and uses pointer-capture drag logic with zoom-aware math (`dx / canvasZoom`, `dy / canvasZoom`).
- `onResize` updates local canvas state live; `onResizeEnd` persists width/height to Supabase.

2. Collapse / expand
- AI posts are collapsed to their saved `height` by default.
- `AIComponentRenderer` measures whether the rendered AI content exceeds the collapsed height using `ResizeObserver` + `MutationObserver`.
- If overflow exists, freeform shows the standard strip expand button for AI posts only.
- Expanding reveals the full AI content; collapsing returns to the saved height.

3. Export menu
- AI posts now have an `Export` dropdown placed in the strip immediately to the right of the expand button.
- Export formats:
  - PDF
  - Word document
  - Markdown
  - Plain text
- Current library choices:
  - `html2canvas` + `jspdf` for PDF (visual export from rendered DOM)
  - `turndown` for HTML -> Markdown
  - `docx` for browser-side Word export
  - plain text from sanitized HTML text content

4. Export target wiring
- `AIComponentRenderer` reports its live rendered content element via `onExportTargetReady`.
- `FreeformPadletCards` stores those element refs by padlet id and hands them to `AIComponentExportMenu`.
- PDF export must use the rendered AI DOM node, not the raw HTML string, so the visual output matches what the user sees.

5. Export sanitation
- Export parsing strips non-content nodes:
  - `script`
  - `noscript`
  - `style`
  - stylesheet `link`
  - `meta`
  - `title`
- This prevents inline CSS from being exported as visible content in Word/Markdown/plain text.

## Guardrails

- Keep export button placement in the strip, immediately to the right of the expand button for AI posts.
- Do not reuse AI export logic for arbitrary post types without re-validating format assumptions.
- PDF export is screenshot-based and therefore visual, not semantic; semantic exports are Word/Markdown/plain text.
- Word export should never include raw CSS or head-only markup.

## Regression Checklist

1. AI post can be resized from the bottom-right handle and persists after refresh.
2. Long AI post shows expand button only when overflow exists.
3. Expand/collapse affects AI posts only, not other post types.
4. Export button opens a menu with `PDF`, `Word document`, `Markdown`, and `Plain text`.
5. Word export contains content only, not CSS text.
6. Markdown/plain text export omit script/style/head noise.

## Skill Routing and Improvement

When a specialized skill exists for the task, use that skill instead of solving from general instructions.

Use `skill_improver` only when:
- analyzing a weak prior result
- logging a structured skill failure
- refining a specialized skill
- comparing baseline vs improved skill behavior

Do not rewrite specialized skills during normal task execution.

Only revise specialized skills through structured failure analysis with evidence-backed minimal edits.

Treat root `.agent/skill.md` as global operating guidance.
Prefer local skill fixes over global rule changes unless the same defect appears across multiple skills.

## Quality Gate

For tasks involving architecture changes, refactoring, system design, or multi-step implementation planning:
- check whether the output is constraint-complete
- check whether it preserves existing working systems
- check whether it avoids unsupported assumptions

If the output clearly fails one of those checks, invoke `skill_improver`.
Do not invoke it for purely stylistic preferences.
