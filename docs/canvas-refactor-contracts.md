# Canvas Refactor Contracts

## Document Status
- Owner: Canvas refactor track
- Applies to: `app/dashboard/canvas/[id]/CanvasClient.tsx` (12,057 lines as of writing)
- Intent: Prevent breakage while turning `CanvasClient` into a thin page-level orchestrator
- **Audit date**: All line numbers, search strings, and counts verified against the actual file

## Verified File Metrics
| Metric | Count |
|--------|-------|
| Total lines | 12,057 |
| `useState` calls | 115 |
| `useCallback` calls | 57 |
| `useEffect` calls | 27 |
| `useMemo` calls | 5 |
| `supabase.from` calls | 27 |
| `supabase.auth` calls | 2 |
| `supabase.channel` calls | 1 |
| Component function starts at | L208 (`export default function CanvasClient`) |
| Main JSX `return (` at | L5223 |
| JSX section size | ~6,835 lines (L5223–L12057) |
| Early returns (Kanban) | L5113 |
| Early returns (Gantt) | L5196 |

## Refactor Goal
Turn `CanvasClient` into a thin page-level orchestrator by splitting responsibilities into:
1. State + actions (canvas store/reducer)
2. Data layer (Supabase fetch/save, realtime, uploads)
3. Interaction layer (selection, drag, resize, zoom/pan, keyboard)
4. UI composition (sidebars, toolbars, overlays, modals)
5. Editors registry (note/table/link/image/etc)

Expected outcomes:
- Fewer `useState` calls in `CanvasClient` (currently 115)
- Predictable state transitions
- Isolated rendering/UI replacement
- Smaller PRs with minimal breakage

---

## Phase 0 Safety Net (Required before extraction)

### 0.1 Behavior checklist
Create and maintain `docs/canvas-refactor-behavior-checklist.md` and verify these behaviors do not regress:
- selection behavior
- drag/resize behavior
- zoom/pan + wheel/trackpad behavior
- open/close editor modals
- comment popup behavior
- image editing overlays (crop/draw/color picker)
- autosave / persistence triggers
- keyboard shortcuts
- early-return layout paths (Kanban at L5113, Gantt at L5196)

### 0.2 Debug toggles
- Add `NEXT_PUBLIC_DEBUG_CANVAS`
- Add `debugCanvasLogger` helper, instrument these exact locations:
  - `pointerDown` → `handlePadletMouseDown` (L4000)
  - `pointerUp` → `handleCanvasMouseUp` (L4167)
  - `dragStart` → inside `handleCanvasMouseMove` when `isDragging` flips true (L4066)
  - `dragMove` → inside `handleCanvasMouseMove` position update (L4066)
  - `dragEnd` → inside `handleCanvasMouseUp` cleanup path (L4167)
  - `selectionChange` → `setSelectedPadletId` (L481), `setSelectedLineId` (L507)
  - `saveStart` / `saveEnd` → `saveLineToDb` (L4466), `updateLine` (L4507), `deletePadletById` (L2907), `requestDeletePadlet` (L2933)
  - `realtimeUpdate` → `handleRealtimePadletChange` (L2570)

Stop point:
- Any bug can be reproduced with ordered event sequence in logs.

---

## Non-Negotiable Refactor Rules
1. No Supabase calls in UI components (`CanvasShell`, `CanvasViewport`, layers, toolbars, modals). Ever.
2. After store/reducer introduction: no scattered direct `setState` in handlers. Handlers dispatch actions only.
3. Engine helpers remain pure: no React, no store, no Supabase, no DOM.
4. Hooks may touch store + DOM events, but only `useCanvasData` may call Supabase (after PR5).
5. Canonical type source is `types/collabboard.ts` (221 lines); migrate consumers away from `lib/collabboard/types.ts` (258 lines).

---

## Existing Extractions (Do Not Re-extract)
| File | Already extracted | Used at |
|------|------------------|---------|
| `hooks/canvas/usePadletSave.ts` (1,044 lines) | Save handlers: `saveNote`, `saveLink`, `saveTodo`, `saveTable`, `saveContainer`, `saveComment`, `saveCard`, `saveImage`, `saveDrawing` | L2343 via `usePadletSave({...})` |
| `lib/collabboard/ClipboardManager` | `clipboardManager.copy` / `.paste` | L3277, L3358 |

**Note**: `ActionRegistry` (imported L71) is imported but **never used** in the file body. Remove the dead import in PR2.

---

## Type Source Divergence (Must resolve before PR4)

`types/collabboard.ts` exports: `Canvas`, `Padlet`, `CanvasLine`, `BoardSection`, `PendingPostDraft`, `NewPostDragState`, `DropIndicatorState`, `ChronoMode`, `LayoutType` — **these are the ones `CanvasClient.tsx` actually imports (L58, L31)**.

`lib/collabboard/types.ts` exports: `PadletPosition`, `LayoutType`, `CanvasConfig`, `Padlet` (simpler version without metadata), `BoardSection` (with string id vs number id), `CanvasViewport`, `DragDropContext`, plus many layout-config types unused by CanvasClient.

**Key conflicts**:
- `Padlet`: `types/collabboard.ts` has full metadata; `lib/collabboard/types.ts` has bare-bones version
- `BoardSection.id`: **number** in `types/collabboard.ts` vs **string** in `lib/collabboard/types.ts`
- `LayoutType`: duplicated in both files (identical values)

**Resolution**: `types/collabboard.ts` is already the canonical source for `CanvasClient`. The `lib/collabboard/types.ts` file is used by other non-canvas consumers. Do NOT merge them blindly — just ensure no new `CanvasClient`-tree imports from `lib/collabboard/types.ts`.

---

## Contracts First (must be documented before PR4)

### 1) Store shape contract
State groups with their **actual** `useState` locations:

**`data` group** (keep as raw useState until PR5):
- `canvas` (L225), `padlets` (L226), `lines` (L503), `sections` (L826)
- `loading` (L227), `error` (L228)

**`view` group** (camera):
- `canvasZoom` (L233)
- `isGanttVisible` (L785), `isSchedulerVisible` (L786)

**`selection` group**:
- `selectedPadletId` (L481), `selectedLineId` (L507)
- `isGraphConnectMode` (L482), `graphConnectSource` (L483), `graphConnectSelection` (L484), `graphRefreshToken` (L485)
- `selectedSchedulerSlot` (L486), `selectedSchedulerContainerId` (L487), `schedulerPopoverPadletId` (L488)

**`interaction` group** (drag/resize):
- `isDragging` (L896), `dragOffset` (L897), `draggingPadletId` (L898)
- `lastMousePosition` (L925)
- `draggingLineId` (L509)
- `pendingPostDraft` (L538), `newPostDragState` (L545), `newPostHoverContainerId` (L551)
- `placementContext` (L552), `activeSectionId` (L553)
- `dropIndicator` (L556)
- `isPlacementPromptOpen` (L544)
- `wallPlacementPromptOpen` (L356), `wallPendingPostDraft` (L357), `wallPlacementMode` (L358), `wallActiveContainerTargetId` (L359), `wallContextMenuState` (L360)
- `containerCreationPromptOpen` (L367), `containerCreationLocation` (L368)

**`ui` group** (overlays, popups, toolbars):
- `commentPopupOpen` (L338), `commentPopupPosition` (L339), `commentPopupComments` (L340), `commentPopupPadletId` (L348), `commentPopupCommentId` (L349)
- `textLinkColorPickerOpen` (L351), `textLinkColorPickerPosition` (L352), `commentPopupHighlightColor` (L353)
- `detachedPopupOpen` (L434), `detachedPopupPosition` (L435), `detachedPopupPadletId` (L436), `detachedBadgeColorOpen` (L437), `detachedPopupComments` (L438)
- `cardCommentPopupPadletId` (L447), `cardCommentList` (L448), `activeCardCommentId` (L458), `editingCardCommentId` (L459), `editingCardCommentText` (L460)
- `commentColorPopupId` (L461), `noteBadgeColorPadletId` (L462), `internalBadgeColorPopupId` (L463), `internalBadgePopupPosition` (L464)
- `reminderPopupOpen` (L469), `reminderPopupPosition` (L470), `reminderPopupTasks` (L471), `reminderPopupPadletId` (L478)
- `showDeleteConfirm` (L489)
- `collapsedPopupPadletId` (L490), `collapsedBadgeColorOpen` (L491), `collapsedActiveCommentId` (L492), `collapsedEditingCommentId` (L493), `collapsedEditingText` (L494), `collapsedCommentColorPopupId` (L495)
- `syncPrompt` (L498)
- `cardToolbarPadletId` (L333), `imageToolbarPadletId` (L500)
- `lineContextMenuState` (L511)
- `isDrawingMode` (L518), `drawingPadlet` (L519)
- `isCaptionMode` (L520), `editingCaption` (L521)
- `isImageEmojiOpen` (L522), `imageEditorTab` (L523)
- `isCropMode` (L524), `cropPadlet` (L525)
- `captionPopupPadletId` (L526), `textStylePadletId` (L527)
- `isCardViewerOpen` (L528), `isCardColorPickerOpen` (L529), `isImageColorPickerOpen` (L530)
- `cardColorPickerPosition` (L531), `cardColorTab` (L532)
- `captionEditorPadletId` (L533), `iconReplaceTargetPadlet` (L534)
- `isLibraryOpen` (L466)
- `isLineMode` (L506), `lineEditModeId` (L505)
- `gridSectionOrder` (L829)
- `imageColorTab` (L330)

**`editors` group**:
- `isNoteEditorOpen` (L321), `isTableEditorOpen` (L322), `isLinkEditorOpen` (L323), `isTodoEditorOpen` (L324)
- `isContainerEditorOpen` (L325), `isCommentEditorOpen` (L328), `isImageEditorOpen` (L329), `isDrawingEditorOpen` (L331)
- `isCardEditorOpen` (L332), `padletToEdit` (L334), `viewDrawingPadlet` (L335)
- `chronoMode` (L326), `showChronoModeModal` (L327)

**Auth/session** (stays outside store):
- `session` (L210), `sessionReady` (L211), `hasMounted` (L224), `user` (L229), `currentWorkspaceRole` (L230)

Rule:
- Hooks may read selectors.
- Hooks/UI dispatch actions only.
- No direct mutation outside reducer/store.

### 2) Hook boundaries contract
Each hook receives:
- state slice + dispatch
- minimal dependencies (`supabase client`, `canvasId`, `session`)

Each hook returns:
- UI handlers
- computed values (camera transforms, selection flags, etc.)
- imperative actions (`zoomToFit`, `openEditor`, etc.)

### 3) Persistence boundary contract
Only `persistence/*` may:
- generate diffs
- queue saves
- call Supabase `insert/update/delete`

All other layers emit intent actions only.

---

## Canonical Section Marker Contract (PR2)

Insert these exact markers in `CanvasClient.tsx`. The line ranges below show where each region's code **currently** lives:

| # | Marker | Current code range |
|---|--------|--------------------|
| 1 | `// === BEGIN TYPES + CONSTANTS REGION ===` | Before L86 (after imports end) |
| 2 | `// === END TYPES + CONSTANTS REGION ===` | After L205 (before `export default function`) |
| 3 | `// === BEGIN SESSION + AUTH REGION ===` | L210–L316 |
| 4 | `// === END SESSION + AUTH REGION ===` | After L316 |
| 5 | `// === BEGIN DATA REGION: SUPABASE + REALTIME ===` | L1625–L2660 (fetchData, realtime, markLocally*) |
| 6 | `// === END DATA REGION: SUPABASE + REALTIME ===` | After L2660 |
| 7 | `// === BEGIN CAMERA REGION ===` | L233–L236 (zoom state + handlers) |
| 8 | `// === END CAMERA REGION ===` | After L236 |
| 9 | `// === BEGIN SELECTION REGION ===` | L481–L495 (selectedPadletId, graphConnect*, etc.) |
| 10 | `// === END SELECTION REGION ===` | After L495 |
| 11 | `// === BEGIN INTERACTIONS REGION ===` | L896–L925 (drag state), L4000–L4320 (mouse handlers) |
| 12 | `// === END INTERACTIONS REGION ===` | After L4320 |
| 13 | `// === BEGIN LINE REGION ===` | L503–L516 (line state), L4323–L4610 (line CRUD) |
| 14 | `// === END LINE REGION ===` | After L4625 |
| 15 | `// === BEGIN SHORTCUTS REGION ===` | L4430–L4465 (handleGlobalKeyDown), L2883–L2902 (delete key), L4610–L4625 (line delete key) |
| 16 | `// === END SHORTCUTS REGION ===` | After keyboard useEffects |
| 17 | `// === BEGIN OVERLAYS + UI STATE REGION ===` | L321–L534 (all modal/popup/toolbar state) |
| 18 | `// === END OVERLAYS + UI STATE REGION ===` | After overlay state block |
| 19 | `// === BEGIN EDITORS REGION ===` | L321–L335 (editor open states), `usePadletSave` call at L2343 |
| 20 | `// === END EDITORS REGION ===` | After editor wiring |
| 21 | `// === BEGIN RENDER REGION (JSX ONLY) ===` | L5113 (first early return) |
| 22 | `// === END RENDER REGION (JSX ONLY) ===` | L12057 (end of file) |

**Important**: Some code spans multiple regions (e.g., editor open states are both "overlays" and "editors"). During PR2, if a `useState` serves two regions, annotate it with `// SHARED: overlays + editors` — do NOT duplicate or move it yet. The markers are for readability; actual extraction happens in later PRs.

---

## Pure Engine Helpers (Outside Component, Pre-L208)

These functions are defined **outside** the component and are already pure (no React, no state, no Supabase):

| Function | Line | Pure? | Target file |
|----------|------|-------|-------------|
| `isStripVisible` | L86 | Yes | `engine/rendering.ts` |
| `debounce` | L136 | Yes | `engine/utils.ts` |
| `sanitizeLibraryMetadata` | L144 | Yes | `engine/utils.ts` |
| `GraphLineToolIcon` | L156 | No (JSX) | Keep in UI or `ui/icons/` |
| `isGraphSide` | L170 | Yes | `engine/graph.ts` |
| `orientation` | L174 | Yes | `engine/geometry.ts` |
| `onSegment` | L180 | Yes | `engine/geometry.ts` |
| `segmentsIntersect` | L189 | Yes | `engine/geometry.ts` |

These functions are defined **inside** the component but are logically pure (can be extracted if state is passed as params):

| Function | Line | Needs state? | Target file |
|----------|------|-------------|-------------|
| `normalizeZIndexes` | L3918 | Yes — reads `padlets` | `engine/zIndex.ts` (pass padlets as param) |
| `getClickedSide` | L3971 | Yes — reads `padlets` | `engine/hitTest.ts` (pass padlets as param) |
| `isContainerPadlet` | L712 | No | `engine/utils.ts` |
| `formatRelativeTime` | L738 | No | `engine/utils.ts` |
| `htmlToText` | L748 | No | `engine/utils.ts` |

---

## Complete Supabase Call Inventory

Every `supabase.*` call in `CanvasClient.tsx` with exact line:

**Auth (2 calls)**:
- L289: `supabase.auth.getUser()` — session fetch
- L306: `supabase.auth.onAuthStateChange()` — auth listener

**Workspace role (1 call)**:
- L257: `supabase.from('workspace_members').select('role')...`

**Realtime (2 calls)**:
- L2601: `supabase.channel(...)` — subscribe
- L2616: `supabase.removeChannel(channel)` — cleanup

**fetchData (4 queries, L1625–L1697)**:
- L1635: `supabase.from('boards').select('*')...`
- L1641: `supabase.from('padlets').select('*')...`
- L1646: `supabase.from('canvas_lines').select('*')...`
- L1652: `supabase.from('board_sections').select('*')...`

**Padlet inserts (15 calls)**:
- L415, L1390, L1792, L1880, L1882, L1935, L1983, L2021, L2100, L2130, L2131, L2235, L2266, L2267, L3841: `supabase.from('padlets').insert(...)`

**Padlet updates (7 calls)**:
- L2101, L2385, L3324, L3425, L3845, L4708, L4713: `supabase.from('padlets').update(...)`

**Padlet deletes (1 call)**:
- L1596: `supabase.from('padlets').delete()...`

**Padlet inserts inside JSX event handlers (3 calls — must be hoisted before PR12)**:
- L4828: `supabase.from('padlets').insert({...})` — inside `handleCreateSchedulerPadlet`
- L5729: `supabase.from('padlets').insert({...})` — inline in freeform padlet creation JSX
- L5919: `supabase.from('padlets').insert(newPadlet)` — inline in freeform padlet creation JSX

**Padlet ops inside JSX (2 calls — must be hoisted before PR12)**:
- L6361: `supabase.from('padlets').insert(newPadlet)` — inside DrawingLayout inline handler
- L6372: `supabase.from('padlets').update(updates)...` — inside DrawingLayout inline handler

**Line CRUD (inside useCallbacks, L4466–L4610)**:
- L4473: `supabase.from('canvas_lines').update({...})` — saveLineToDb
- L4517: `supabase.from('canvas_lines').update({...})` — updateLine
- L4536: `supabase.from('canvas_lines').delete()...` — deleteLine
- L4343: `supabase.from('canvas_lines').insert({...})` — createLine
- L4591: `supabase.from('canvas_lines').insert({...})` — duplicateLine

**Section CRUD**:
- L867: `supabase.from('board_sections').update({...})` — handleGridSectionReorder
- L680: `supabase.from('padlets').update({...})` — handleColumnReorder
- L993: `supabase.from('padlets').update({...})` — handleWallReorder
- L1100–L1160: multiple `supabase.from('padlets').update/insert` — moveContainerToSection

**Delete router (L2907–L2980)**:
- L2911: `supabase.from('padlets').delete()...` — deletePadletById
- L2955: `supabase.from('padlets').delete()...` — requestDeletePadlet

---

## Tightened Extraction Plan with Stop Points

### PR1 — Safety net + debug infra
Checklist:
- [ ] Create `docs/canvas-refactor-behavior-checklist.md` covering all behaviors listed in Phase 0.1
- [ ] Add `NEXT_PUBLIC_DEBUG_CANVAS` env var
- [ ] Create `lib/collabboard/debugCanvasLogger.ts` with event logging
- [ ] Instrument the exact locations listed in Phase 0.2

Verified search strings (all confirmed present in file):
- `const handlePadletMouseDown =` (L4000)
- `const handleCanvasMouseMove =` (L4066)
- `const handleCanvasMouseUp =` (L4167 — note: declared as `const handleCanvasMouseUp = async`)
- `const handleRealtimePadletChange = useCallback((payload: any) => {` (L2570)
- `const fetchData = useCallback(async (showLoading = false) => {` (L1625)

Stop point:
- Event trace can explain any regression end-to-end.

---

### PR2 — Structure-only regions + dead import cleanup
Checklist:
- [ ] Insert section markers exactly as defined in the Canonical Section Marker table
- [ ] Remove dead import: `import { ActionId, actionRegistry }` (L71) — confirmed unused in file body
- [ ] No file moves, no behavior changes
- [ ] Add `// SHARED: overlays + editors` annotations where useState serves multiple regions

Verified search strings:
- `const fetchData = useCallback` (L1625)
- `const handleRealtimePadletChange =` (L2570)
- `const handlePadletMouseDown =` (L4000)
- `const createLine = useCallback` (L4323)
- `const handleToolClick =` (L4914)

Stop point:
- Searching `BEGIN DATA REGION` reveals every Supabase touchpoint in its boundary.

---

### PR2.5 — Type canonicalization pass
**Why**: `types/collabboard.ts` and `lib/collabboard/types.ts` both export `Padlet`, `BoardSection`, and `LayoutType` with **different shapes** (see Type Source Divergence section above). Must resolve before PR4 introduces a store that formalizes these types.

Checklist:
- [ ] Audit all files in `components/collabboard/canvas/` tree that import from `lib/collabboard/types.ts`
- [ ] Migrate those imports to `types/collabboard.ts` where the Padlet/BoardSection shape matches
- [ ] If a consumer relies on `lib/collabboard/types.ts`-specific interfaces (`LayoutConfig`, `CanvasViewport`, etc.), leave those imports but do NOT import `Padlet` or `BoardSection` from there
- [ ] Add lint rule or eslint comment to prevent new imports of `Padlet`/`BoardSection` from `lib/collabboard/types.ts`

Stop point:
- `grep -r "from.*lib/collabboard/types" components/collabboard/canvas/` returns zero matches for `Padlet` or `BoardSection`.

---

### PR3 — Extract pure engine helpers
Target files:
- `components/collabboard/canvas/engine/geometry.ts`
- `components/collabboard/canvas/engine/hitTest.ts`
- `components/collabboard/canvas/engine/utils.ts`
- `components/collabboard/canvas/engine/zIndex.ts`

**What moves (exact lines)**:

To `engine/geometry.ts`:
- `orientation` (L174–L178)
- `onSegment` (L180–L188)
- `segmentsIntersect` (L189–L205)

To `engine/hitTest.ts`:
- `getClickedSide` — currently `useCallback` at L3971. **Refactor**: extract the pure logic (the rect-side calculation) into a plain function accepting `(padlets, mouseX, mouseY)` as params. Leave the `useCallback` wrapper in `CanvasClient` calling this function.

To `engine/utils.ts`:
- `isStripVisible` (L86–L88)
- `debounce` (L136–L142)
- `sanitizeLibraryMetadata` (L144–L153)
- `isContainerPadlet` (L712–L715)
- `formatRelativeTime` (L738–L745)
- `htmlToText` (L748–L752)
- `isGraphSide` (L170–L172)

To `engine/zIndex.ts`:
- `normalizeZIndexes` — currently `useCallback` at L3918. **Refactor**: extract pure sorting/reindexing logic into a plain function accepting padlets array as param. Leave `useCallback` wrapper calling this function.

**What does NOT move** (confirmed needs React or store state):
- `GraphLineToolIcon` (L156) — JSX component, move to `ui/icons/` in PR12
- `movePadletLayer` (L3680) — calls `supabase.from('padlets').update` inline; stays until persistence boundary (PR14)
- `handleChangeLineLayer` (L4548) — calls `saveLineToDb` which uses supabase; stays until PR14

Checklist:
- [ ] Create engine files with extracted functions
- [ ] Update imports in `CanvasClient.tsx`
- [ ] `getClickedSide` and `normalizeZIndexes`: extract pure logic only, keep useCallback wrappers

Guardrail:
- If a function needs `supabase`, `setPadlets`, or any React hook — it does NOT go to `engine/*`. Pass data as plain params instead.

Stop point:
- `CanvasClient` compiles with engine imports, no functional or behavior changes.

---

### PR4 — Store skeleton (ui + selection groups only)

Target files:
- `components/collabboard/canvas/store/types.ts`
- `components/collabboard/canvas/store/actions.ts`
- `components/collabboard/canvas/store/selectors.ts`
- `components/collabboard/canvas/store/canvasReducer.ts`

Tactic: group-by-group migration. Do NOT mirror all 115 useState calls at once.

**Scope for this PR — `editors` state (11 useState → store)**:
- `isNoteEditorOpen` (L321)
- `isTableEditorOpen` (L322)
- `isLinkEditorOpen` (L323)
- `isTodoEditorOpen` (L324)
- `isContainerEditorOpen` (L325)
- `isCommentEditorOpen` (L328)
- `isImageEditorOpen` (L329)
- `isDrawingEditorOpen` (L331)
- `isCardEditorOpen` (L332)
- `padletToEdit` (L334)
- `viewDrawingPadlet` (L335)

**Scope for this PR — `selection` state (9 useState → store)**:
- `selectedPadletId` (L481)
- `selectedLineId` (L507)
- `isGraphConnectMode` (L482)
- `graphConnectSource` (L483)
- `graphConnectSelection` (L484)
- `graphRefreshToken` (L485)
- `selectedSchedulerSlot` (L486)
- `selectedSchedulerContainerId` (L487)
- `schedulerPopoverPadletId` (L488)

**What stays as raw useState for now**:
- All `data` group: `canvas`, `padlets`, `lines`, `sections`, `loading`, `error` — these move in PR5
- All `interaction` group: `isDragging`, `dragOffset`, etc. — these move in PR8
- All `ui` group: popups, overlays — these move in PR11
- All auth: `session`, `user`, `currentWorkspaceRole`

**Impact on `isAnyEditorOpen` memo** (L615–L640):
- This `useMemo` reads 20+ editor/overlay booleans. After PR4, the editor booleans will come from store selectors instead of local state. Update the memo's deps accordingly.

**Impact on `usePadletSave` call** (L2343):
- Currently receives `setIsNoteEditorOpen`, `setIsLinkEditorOpen`, etc. as props. After PR4, `usePadletSave` must receive dispatch instead, or the store actions must be passed as equivalent callbacks. **Decision**: keep the setter-callback interface for now by wrapping dispatch in setter-shaped callbacks at the call site. This avoids modifying `usePadletSave.ts` in this PR.

Checklist:
- [ ] Create store files with `editors` and `selection` slices
- [ ] Wire `useReducer` or Zustand store into `CanvasClient`
- [ ] Replace 20 useState calls with store selectors + dispatch
- [ ] Update `isAnyEditorOpen` memo
- [ ] Wrap dispatch in setter-shaped callbacks for `usePadletSave` compatibility
- [ ] Verify all search strings below still compile correctly

Verified search strings:
- `const [isNoteEditorOpen, setIsNoteEditorOpen] = useState(false);` (L321)
- `const [selectedPadletId, setSelectedPadletId] = useState<string | null>(null);` (L481)
- `const [selectedLineId, setSelectedLineId] = useState<string | null>(null);` (L507)
- `const [graphConnectSelection, setGraphConnectSelection] =` (L484)

Stop point:
- `CanvasClient` has ~20 fewer `useState` calls. Dispatch wiring exists and works.

---

### PR5 — Extract useCanvasData

Target file:
- `components/collabboard/canvas/hooks/useCanvasData.ts`

**What moves (exact lines)**:

Data state (stays as raw useState inside the hook, NOT in PR4 store):
- `canvas` (L225), `padlets` (L226), `lines` (L503), `sections` (L826)
- `loading` (L227), `error` (L228)

Fetch + realtime:
- `fetchData` (L1625–L1697)
- `handleRealtimePadletChange` (L2570–L2594)
- Realtime subscription useEffect (L2594–L2632) — includes `supabase.channel`, `supabase.removeChannel`, `generateAndSaveThumbnail`
- `markPadletLocallyModified` (L2642–L2652)
- `markLineLocallyModified` (L2651–L2660)
- `locallyModifiedPadletsRef` (L219)
- `locallyModifiedLinesRef` (L221)
- `padletsRef` (L222) — used for thumbnail generation in cleanup

Mutations (CRUD that call supabase — all move here):
- `deletePadletById` (L2907–L2925)
- `requestDeletePadlet` (L2933–L2980)
- `updatePadletMetadata` (L4764–L4776)
- `updatePadletContent` (L4778–L4793)
- `updatePadletTitle` (L4795–L4812)
- `handleAddSection` (L2994)
- `handleRenameSection` (L3122)
- `handleDeleteSection` (L3137)
- `handleMoveSection` (L3165)
- `handleColumnReorder` (L643–L710)
- `handleWallReorder` (L950–L1012)
- `moveContainerToSection` (L1014–L1165)
- `handleGridSectionReorder` (L843–L875)
- `handleCreateContainerAt` (L2371–L2416)
- `createRealPostFromDraft` (L1351–L1410)

Layout-specific container placement that includes supabase calls:
- `handleCreateWallContainerWithDraft` (L1276–L1350)
- `handleCreateEmptyWallContainer` (L1413–L1468)
- `handleDropLibraryCreateContainer` (L1815–L1889)
- `handleDropDraftIntoContainer` (L1891–L1955)
- `duplicateTimelineContainer` (L1957–L1992)
- `handleCreateEmptyTimelineContainer` (L1993–L2026)
- `handleSchedulerExternalDrop` (L2142–L2278)
- `handleCreateSchedulerPadlet` (L4816–L4850)
- `addPadletToOpenContainer` (L2292–L2330)
- `copyPadlet`, `cutPadlet`, `duplicatePadlet` (L3273–L3356)
- `createSyncedCopy` (L3392–L3437)

Line CRUD:
- `createLine` (L4323), `createLineFromCoords` (L4369), `updateLineLocal` (L4401), `saveLineToDb` (L4466), `updateLine` (L4507), `deleteLine` (L4529), `duplicateLine` (L4570), `handleChangeLineLayer` (L4548)

Context menu action handlers that call supabase:
- `addImageToLink` (L3522), `toggleCropToGrid` (L3657), `movePadletLayer` (L3680), `changeCardColor` (L3788), `addPostRelative` (L3806), `lockPadlet` (L3496), `renameTodo` (L3598), `renameColumn` (L3608), `renameComment` (L3618)

**What stays in CanvasClient** (no supabase, just wiring):
- `closeAllToolbars` (L718)
- `getCanvasBackgroundStyle` (L754)
- Layout booleans (`isWallLayout`, `isColumnsLayout`, etc.)
- `isAnyEditorOpen` memo

Auth (stays in CanvasClient):
- L249–L316: workspace role fetch + auth listener. These use `supabase.auth` and `supabase.from('workspace_members')` — they belong with session, not canvas data.

**Decision**: Auth supabase calls (L257, L289, L306) remain in `CanvasClient` since they are session-scoped, not canvas-data-scoped. The non-negotiable rule "only useCanvasData may call Supabase" applies to **canvas entity CRUD** only. Document this exception explicitly.

Interface contract:
```typescript
interface UseCanvasDataReturn {
  // State
  dataState: {
    loading: boolean;
    error: string | null;
    canvas: Canvas | null;
    padlets: Padlet[];
    lines: CanvasLine[];
    sections: BoardSection[];
  };
  // Actions
  load: (showLoading?: boolean) => Promise<void>;
  reload: () => Promise<void>;
  mutations: {
    // Padlet CRUD
    deletePadletById: (id: string) => Promise<void>;
    requestDeletePadlet: (id: string) => Promise<void>;
    updatePadletMetadata: (id: string, meta: any) => Promise<void>;
    updatePadletContent: (id: string, content: string) => Promise<void>;
    updatePadletTitle: (id: string, title: string) => Promise<void>;
    // Line CRUD
    createLine: (...args: any[]) => Promise<void>;
    updateLine: (...args: any[]) => Promise<void>;
    deleteLine: (id: string) => Promise<void>;
    duplicateLine: (id: string) => Promise<void>;
    saveLineToDb: (id: string) => Promise<void>;
    // Section CRUD
    addSection: (...args: any[]) => Promise<void>;
    renameSection: (...args: any[]) => Promise<void>;
    deleteSection: (...args: any[]) => Promise<void>;
    moveSection: (...args: any[]) => Promise<void>;
    // Container/placement — all layout-specific handlers
    createContainerAt: (...args: any[]) => Promise<void>;
    // ... all other mutation handlers listed above
  };
  // Local modification tracking
  markPadletLocallyModified: (id: string) => void;
  markLineLocallyModified: (id: string) => void;
  // Optimistic update helpers (temporary — removed after PR14)
  setPadlets: React.Dispatch<React.SetStateAction<Padlet[]>>;
  setLines: React.Dispatch<React.SetStateAction<CanvasLine[]>>;
  setSections: React.Dispatch<React.SetStateAction<BoardSection[]>>;
}
```

**Note on `setPadlets` exposure**: Many interaction handlers (drag end, placement) do optimistic `setPadlets` calls that don't immediately hit supabase. The hook must expose the raw setters for these cases until PR14 centralizes persistence. This is an intentional temporary leak.

Verified search strings:
- `const fetchData = useCallback(async (showLoading = false) => {` (L1625)
- `const handleRealtimePadletChange = useCallback((payload: any) => {` (L2570)
- `const markPadletLocallyModified = useCallback((padletId: string) => {` (L2642)
- `const markLineLocallyModified = useCallback((lineId: string) => {` (L2651)
- `const deletePadletById = async` (L2907)
- `const requestDeletePadlet = async` (L2933)
- `const updatePadletMetadata = async` (L4764)
- `const updatePadletContent = async` (L4778)
- `const updatePadletTitle = async` (L4795)
- `const handleAddSection = useCallback(` (L2994)
- `const handleRenameSection = useCallback(` (L3122)
- `const handleDeleteSection = useCallback(` (L3137)
- `const handleMoveSection = useCallback(` (L3165)

Stop point:
- `CanvasClient.tsx` contains zero `supabase.from('padlets')`, `supabase.from('canvas_lines')`, or `supabase.from('board_sections')` calls.
- `supabase.auth` and `supabase.from('workspace_members')` calls remain (documented exception).
- `supabase.channel` + `supabase.removeChannel` moved into hook.

---

### PR6 — Extract useCanvasCamera

Target file:
- `components/collabboard/canvas/hooks/useCanvasCamera.ts`

**What moves (exact lines)**:
- `canvasZoom` state (L233)
- `handleZoomIn` (L234)
- `handleZoomOut` (L235)
- `handleZoomReset` (L236)

**What does NOT move** (clarifying what does NOT exist):
- There is **no** ctrl+wheel zoom handler in `CanvasClient.tsx`. Zoom is button-only (L234–L236). Do NOT add features in this PR.
- `edgeThreshold = 60` and scroll-position helpers are inline constants inside `handleCanvasMouseMove` (L4066+). They belong to interactions (PR8), not camera.
- `containerRef` (L213) is used by both camera (scroll position) and interactions (mouse events). It stays in `CanvasClient` and is passed to both hooks.

Interface:
```typescript
interface UseCanvasCameraReturn {
  canvasZoom: number;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
}
```

Stop point:
- Zoom buttons work identically. 4 fewer useState/useCallback in CanvasClient.

---

### PR7 — Extract useCanvasSelection

Target file:
- `components/collabboard/canvas/hooks/useCanvasSelection.ts`

**What moves** (if not already in store from PR4):
- `selectedPadletId` (L481) — already in store after PR4
- `selectedLineId` (L507) — already in store after PR4
- `isGraphConnectMode` (L482) — already in store
- `graphConnectSource` (L483) — already in store
- `graphConnectSelection` (L484) — already in store
- `graphRefreshToken` (L485) — already in store
- `selectedSchedulerSlot` (L486) — already in store
- `selectedSchedulerContainerId` (L487) — already in store
- `schedulerPopoverPadletId` (L488) — already in store

Selection logic:
- `handleLineSelect` (L4410)
- `handleToggleLineEditMode` (L4420)
- `handleToggleGraphConnect` (L2665)
- `handleOrganizeGraph` (L2675)

**Clarification**: PR4 moves the state into the store. PR7 extracts the *hook* that encapsulates the selection logic + dispatches. After PR7, `CanvasClient` consumes `useCanvasSelection()` which internally reads/dispatches to the store.

Stop point:
- Selection transitions flow through one hook. Zero direct `setSelectedPadletId` / `setSelectedLineId` calls in CanvasClient.

---

### PR8 — Extract useCanvasInteractions

Target file:
- `components/collabboard/canvas/hooks/useCanvasInteractions.ts`

**What moves (exact lines)**:

Drag state:
- `isDragging` (L896), `dragOffset` (L897), `draggingPadletId` (L898)
- `lastMousePosition` (L925)
- `pendingDragRef` (L917–L923)
- `isDraggingRef` (L563), `draggingPadletIdRef` (L564)
- `dragEndInFlightRef` (L561)
- `handleCanvasMouseUpRef` (L565)
- `bodyUserSelectRef` (L566), `lockBodySelection` (L567), `unlockBodySelection` (L578)

Mouse handlers:
- `handlePadletMouseDown` (L4000)
- `handleImagePadletDrag` (L4039)
- `handleCanvasMouseMove` (L4066)
- `handleCanvasMouseUp` (L4167)
- Window mouseup useEffects (L4291, L4298, L4313)

**What does NOT move** (layout-specific placement logic):
- `newPostDragState` (L545), `newPostHoverContainerId` (L551) — these are layout-specific placement drag, not generic canvas drag. They stay in CanvasClient or get their own `useColumnPlacement` hook.
- `wallPlacementMode` (L358), `wallPendingPostDraft` (L357) — wall-specific placement, stays
- `pendingPostDraft` (L538), `isPlacementPromptOpen` (L544) — placement prompt state, stays
- `dropIndicator` (L556) — DnD kit state, stays
- Ghost drag mouse tracking useEffect (L2478) — tied to newPostDragState, stays

**Layout-specific interaction decision**: Create a separate `useColumnPlacement` hook for the column/wall/timeline placement logic in a follow-up, or keep it in the orchestrator. Do NOT bundle it into `useCanvasInteractions` since it's fundamentally different from canvas drag.

Critical rule:
- No Supabase in this hook. `handleCanvasMouseUp` currently calls `supabase.from('padlets').update` for position saves (lines ~L4200–L4280). After PR5, those calls go through `mutations.updatePadletMetadata`. This hook calls `mutations.*` instead of supabase directly.

Receives from camera hook:
- `canvasZoom` (for coordinate transforms in `handleCanvasMouseMove`)

Stop point:
- Freeform drag/resize behavior stable. `handlePadletMouseDown`, `handleCanvasMouseMove`, `handleCanvasMouseUp` gone from CanvasClient.

---

### PR9 — Extract useCanvasLines

Target file:
- `components/collabboard/canvas/hooks/useCanvasLines.ts`

**What moves (exact lines)**:

Line state:
- `lines` (L503) — after PR5, comes from `useCanvasData`
- `lineEditModeId` (L505)
- `isLineMode` (L506)
- `draggingLineId` (L509)
- `lineContextMenuState` (L511–L516)

Line CRUD (after PR5, these are in `useCanvasData.mutations`; this hook wraps them):
- `createLine` (L4323)
- `createLineFromCoords` (L4369)
- `updateLineLocal` (L4401)
- `handleLineSelect` (L4410)
- `handleToggleLineEditMode` (L4420)
- `handleLineDragChange` (L4425)
- `saveLineToDb` (L4466)
- `updateLine` (L4507)
- `deleteLine` (L4529)
- `handleChangeLineLayer` (L4548)
- `duplicateLine` (L4570)

**Correction from original plan**: There is **no** comment `// Line connector functions` in the file. The line code starts directly with state declarations at L503. This search string has been removed.

Stop point:
- All line logic encapsulated in one hook. `CanvasClient` has no `setLines`, `setLineEditModeId`, etc.

---

### PR10 — Extract useCanvasShortcuts

Target file:
- `components/collabboard/canvas/hooks/useCanvasShortcuts.ts`

**What moves (exact lines)**:

Keyboard useEffects:
- Delete key for padlets (L2883–L2902): `useEffect` with `handleKeyDown` that calls `requestDeletePadlet`
- Global keydown — Escape/layering shortcuts (L4430–L4465): `useEffect` with `handleGlobalKeyDown`
- Line delete key (L4610–L4625): `useEffect` with `handleLineDeleteKey` declared **inside** the useEffect (NOT a standalone const)

Verified search strings:
- `window.addEventListener('keydown', handleKeyDown);` (confirmed 2 matches in file: L2900 and L4463)
- `const handleGlobalKeyDown = (e: KeyboardEvent) => {` (L4431 — declared inside useEffect)
- `const handleLineDeleteKey = (e: KeyboardEvent) => {` (L4611 — declared inside useEffect)

**Important correction from original plan**: Both `handleGlobalKeyDown` and `handleLineDeleteKey` are declared **inside their respective useEffect closures**, not as standalone `const` declarations. The hook extraction must lift them into the hook scope or keep them inside their respective useEffects within the hook.

Stop point:
- Zero `window.addEventListener('keydown'` calls in CanvasClient.

---

### PR11 — Extract useCanvasOverlays

Target file:
- `components/collabboard/canvas/hooks/useCanvasOverlays.ts`

**What moves — all popup/overlay useState (exact lines)**:

Comment popups:
- `commentPopupOpen` (L338), `commentPopupPosition` (L339), `commentPopupComments` (L340), `commentPopupPadletId` (L348), `commentPopupCommentId` (L349)
- `textLinkColorPickerOpen` (L351), `textLinkColorPickerPosition` (L352), `commentPopupHighlightColor` (L353)
- `detachedPopupOpen` (L434), `detachedPopupPosition` (L435), `detachedPopupPadletId` (L436), `detachedBadgeColorOpen` (L437), `detachedPopupComments` (L438)
- `cardCommentPopupPadletId` (L447), `cardCommentList` (L448), `activeCardCommentId` (L458), `editingCardCommentId` (L459), `editingCardCommentText` (L460)
- `commentColorPopupId` (L461), `noteBadgeColorPadletId` (L462), `internalBadgeColorPopupId` (L463), `internalBadgePopupPosition` (L464)

Reminder popup:
- `reminderPopupOpen` (L469), `reminderPopupPosition` (L470), `reminderPopupTasks` (L471), `reminderPopupPadletId` (L478)

Image editing overlays:
- `isDrawingMode` (L518), `drawingPadlet` (L519)
- `isCaptionMode` (L520), `editingCaption` (L521)
- `isImageEmojiOpen` (L522), `imageEditorTab` (L523)
- `isCropMode` (L524), `cropPadlet` (L525)
- `captionPopupPadletId` (L526), `textStylePadletId` (L527)
- `isCardViewerOpen` (L528), `isCardColorPickerOpen` (L529), `isImageColorPickerOpen` (L530)
- `cardColorPickerPosition` (L531), `cardColorTab` (L532), `imageColorTab` (L330)
- `captionEditorPadletId` (L533), `iconReplaceTargetPadlet` (L534)

Collapsed/misc:
- `collapsedPopupPadletId` (L490), `collapsedBadgeColorOpen` (L491), `collapsedActiveCommentId` (L492), `collapsedEditingCommentId` (L493), `collapsedEditingText` (L494), `collapsedCommentColorPopupId` (L495)
- `syncPrompt` (L498)
- `showDeleteConfirm` (L489)
- `cardToolbarPadletId` (L333), `imageToolbarPadletId` (L500)
- `lineContextMenuState` (L511)
- `isLibraryOpen` (L466)

Helpers:
- `closeAllToolbars` (L718)

Total: ~50 useState calls → one hook returning an overlay state object + handlers.

Stop point:
- Overlay state centralized. `CanvasClient` has ~50 fewer useState calls.

---

### PR11.5 — Hoist inline JSX handlers (Required before PR12)

**Why**: The JSX section (L5223–L12057, ~6,835 lines) contains inline `supabase.from` calls and complex lambda handlers declared inside JSX props. These must be hoisted to named functions or routed through `useCanvasData.mutations` before the JSX can be split into UI components.

**Specific inline supabase calls to hoist**:
- L5729: `supabase.from('padlets').insert({...})` — freeform padlet creation
- L5919: `supabase.from('padlets').insert(newPadlet)` — freeform padlet creation
- L6361: `supabase.from('padlets').insert(newPadlet)` — DrawingLayout `onCreatePadlet` handler
- L6372: `supabase.from('padlets').update(updates)` — DrawingLayout `onUpdatePadlet` handler

**Specific inline handler patterns to hoist** (search for `commitEdit` and `startEdit` in JSX):
- `commitEdit` lambdas at: L7043, L7983, L8355, L8849, L9889, L10258, L10617, L11017
- `startEdit` lambdas at: L7064, L8004, L8373

These should become named callbacks in the component body (e.g. `handleNoteCommitEdit`, `handleLinkCommitEdit`) that are passed as props.

Checklist:
- [ ] Hoist all 4 inline supabase calls to named handlers routing through `useCanvasData.mutations`
- [ ] Hoist `commitEdit`/`startEdit` lambdas to named handlers (at least the 10+ instances listed above)
- [ ] No behavior changes

Stop point:
- Zero `supabase.from` calls inside JSX `return (...)` block.

---

### PR12 — Split UI components

Target files:
- `components/collabboard/canvas/ui/CanvasSidebar.tsx` — sidebar (L5225–L5280)
- `components/collabboard/canvas/ui/CanvasModals.tsx` — editor modals (L5286–L5568)
- `components/collabboard/canvas/ui/CanvasViewport.tsx` — main viewport container (L5570–L5820)
- `components/collabboard/canvas/ui/BackgroundLineLayer.tsx` — line layer behind padlets (L5803–L5820)
- `components/collabboard/canvas/ui/PadletLayer.tsx` — padlet rendering per layout (L5821–L6500)
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx` — freeform padlet cards (L6528–L11800 approx)
- `components/collabboard/canvas/ui/OverlayLayer.tsx` — comment popups, color pickers, line context menu
- `components/collabboard/canvas/ui/ZoomControls.tsx` — zoom buttons (L12003–L12038)
- `components/collabboard/canvas/ui/GhostDragElement.tsx` — ghost drag overlay (L12041–L12054)

**Early return layouts** (L5113–L5221):
- Kanban early return (L5113): Extract to `components/collabboard/canvas/ui/KanbanShell.tsx`
- Gantt early return (L5196): Extract to `components/collabboard/canvas/ui/GanttShell.tsx`

**DnD-kit integration** (currently in CanvasClient):
- Grid section DnD: `gridSensors` (L830), `handleGridDragEnd` (L879), `gridSectionOrder` (L829)
- Column reorder: via props to `ColumnsLayout`
- These stay in orchestrator or get a `useDndReorder` hook. They use `@dnd-kit/core` and `@dnd-kit/sortable` (imported L69-L71).

Rule:
- UI components receive all data via props. No `supabase`, no `useState` for canvas data, no direct store mutation.
- Each component file < 500 lines target.

Stop point:
- `CanvasClient` render section is ~200 lines of component composition. Rerender boundaries are controllable.

---

### PR13 — Editor system

Target files:
- `components/collabboard/canvas/editors/types.ts`
- `components/collabboard/canvas/editors/registry.tsx`
- `components/collabboard/canvas/editors/EditorHost.tsx`

Current editor imports (all verified at file top, L3–L15):
- `TableEditor` (L3)
- `NoteEditor` (L4)
- `LinkEditor` (L5)
- `DrawingEditor` (L6)
- `InlineCaption` (L7)
- `TodoEditor` (L8)
- `ContainerEditor` (L9)
- `CommentEditor` (L10)
- `ImageEditor` (L11)

Current editor open states (in store after PR4):
- `isNoteEditorOpen` (L321)
- `isTableEditorOpen` (L322)
- `isLinkEditorOpen` (L323)
- `isTodoEditorOpen` (L324)
- `isContainerEditorOpen` (L325)
- `isCommentEditorOpen` (L328)
- `isImageEditorOpen` (L329)
- `isDrawingEditorOpen` (L331)
- `isCardEditorOpen` (L332)

Current save handlers (from `usePadletSave` at L2343):
- `saveNote`, `saveLink`, `saveTodo`, `saveTable`, `saveContainer`, `saveComment`, `saveCard`, `saveImage`, `saveDrawing`

Migration plan:
1. Define `EditorType` enum matching the 9 editor types above
2. Create `EditorHost` that reads `activeEditor` from store and renders the matching editor
3. Replace 9 individual modal blocks in JSX (L5288–L5568) with single `<EditorHost />`
4. `EditorHost` receives `padletToEdit`, save handler, and close handler as props

Migration order: Note → Link → Todo → Table → Container → Comment → Image → Drawing → Card

Stop point:
- All editors mount through `EditorHost`. Zero individual `isXxxEditorOpen` checks in JSX.

---

### PR14 — Persistence boundary

Target files:
- `components/collabboard/canvas/persistence/padletPersistence.ts`
- `components/collabboard/canvas/persistence/linePersistence.ts`
- `components/collabboard/canvas/persistence/sectionPersistence.ts`
- `components/collabboard/canvas/persistence/saveQueue.ts`
- `components/collabboard/canvas/hooks/useAutosave.ts`

Required behavior:
- Autosave subscribes to store changes (debounced)
- Queue batches and deduplicates by `(entityType, entityId)`
- Operations: `padlet:insert`, `padlet:update`, `padlet:delete`, `line:insert`, `line:update`, `line:delete`, `section:reorder`

**What centralizes here** (currently scattered across useCanvasData mutations from PR5):
All `supabase.from('padlets').*` calls: 15 inserts + 7 updates + 1 delete = 23 calls
All `supabase.from('canvas_lines').*` calls: 2 inserts + 2 updates + 1 delete = 5 calls
All `supabase.from('board_sections').*` calls: 1 update = 1 call

**usePadletSave.ts** (1,044 lines):
- After EditorHost (PR13) + autosave (PR14) exist, evaluate whether to:
  - Split into `persistence/padletSavers/*` modules
  - Keep as adapter wrapping persistence modules
- Do not rewrite before PR13+PR14 are stable.

Stop point:
- All Supabase entity CRUD routes through `persistence/*`. `useCanvasData` delegates to persistence layer.
- Saving is predictable, debounced, and centralized.

---

### PR15 — Performance pass

Checklist:
- [ ] Selector memoization for derived lists
- [ ] `React.memo` boundaries for heavy UI components from PR12
- [ ] Ensure viewport avoids unrelated rerenders
- [ ] Address `isAnyEditorOpen` memo (L615) — currently depends on 20+ individual booleans causing frequent recalculation. After PR4, this should be a single store selector.

Current memos (verified):
- `rootPadlets` (L929): `padlets.filter(p => !p.metadata?.parentId)` — keep
- `wallOrderedPadlets` (L935): sort of rootPadlets — keep
- `isAnyEditorOpen` (L615): 20+ deps — refactor to store selector
- `getTimelineContainers` (L1720): useCallback, not useMemo — evaluate converting
- `applyTimelineOrder` (L1736): useCallback — evaluate

Performance targets:
- Freeform drag must NOT trigger CanvasClient rerender per mouse move — verify `isDraggingRef` pattern works after hook extraction
- Editor open/close must NOT rerender padlet layer

Stop point:
- Measurable rerender reduction without behavior drift.

---

## Biggest Risk Points and Mitigations

1. **Interactions ↔ camera coupling**
   - Current state: `handleCanvasMouseMove` (L4066) reads `canvasZoom` and `containerRef.current.scrollLeft/scrollTop` directly
   - Mitigation: `useCanvasCamera` exposes `canvasZoom` as a value; `useCanvasInteractions` receives it as a param. `containerRef` stays in orchestrator, passed to both hooks.

2. **Realtime collisions with local modifications**
   - Current state: `handleRealtimePadletChange` (L2570) checks `locallyModifiedPadletsRef` and skips known-local updates
   - Mitigation: `useCanvasData` owns this conflict policy unchanged. No behavior change here.

3. **Editor draft state leaking globally**
   - Current state: `padletToEdit` (L334) is shared across all editors
   - Mitigation: `EditorHost` owns draft lifecycle; store keeps only `activeEditorType` + `editTargetId`.

4. **usePadletSave prop explosion**
   - Current state: `usePadletSave` receives 20+ setter callbacks (L2343–L2387)
   - Mitigation: After PR4 (store) and PR13 (EditorHost), reduce to `dispatch` + `editorConfig`. Do NOT rewrite usePadletSave before then.

5. **6,835-line JSX section**
   - Mitigation: PR11.5 hoists inline handlers. PR12 splits into ~9 UI component files. Each file < 500 lines.

6. **DnD-kit state entanglement**
   - Current state: `DndContext`, `SortableContext` (imported L69-L71), `gridSensors` (L830), `handleGridDragEnd` (L879) are in CanvasClient
   - Mitigation: DnD wiring stays in orchestrator (it's composition-level). Grid section order state can move to store in PR4 if needed.

---

## PR Gate Criteria (applies to every PR)
- [ ] Behavior checklist run and all cases pass unchanged
- [ ] Debug event sequence still coherent
- [ ] Non-negotiable rules preserved
- [ ] Stop point achieved for this PR before opening next PR
- [ ] No hidden Supabase usage outside `useCanvasData` boundary (after PR5), except documented auth exception
- [ ] No new imports from `lib/collabboard/types.ts` for `Padlet` or `BoardSection`

---

## Additional Hard Constraints

1. **Camera/interaction dependency must remain one-way.**
   - `useCanvasInteractions` may consume camera values (`canvasZoom`, viewport scroll position).
   - `useCanvasCamera` must not import or reference interaction hooks.
   - No hook-to-hook cyclic dependency.

2. **Realtime collision policy is mandatory.**
   - When local interaction is active for an entity (drag/resize/edit), incoming realtime updates for that same entity must be queued/ignored per current `locallyModifiedPadletsRef` pattern (L2575–L2578).
   - Do not change this behavior during refactor.

3. **High-frequency pointer updates must not force orchestrator rerenders.**
   - Current pattern uses `isDraggingRef` (L563), `draggingPadletIdRef` (L564) — refs, not state — for mouse move.
   - Preserve this pattern in hook extraction. Do NOT convert refs to state.

4. **Z-index behavior split is explicit.**
   - `engine/zIndex.ts` contains pure deterministic ordering math only (extracted from `normalizeZIndexes` at L3918).
   - `movePadletLayer` (L3680) stays in data layer since it calls supabase. After PR14, it routes through persistence.

5. **Type-source migration timing.**
   - Execute PR2.5 (type canonicalization) before PR4.
   - Canonical source: `types/collabboard.ts`.

---

## Additional Required Behavior Checklist Cases

Add to `docs/canvas-refactor-behavior-checklist.md`:

1. **Remote update while local drag is active**
   - Start local drag on padlet A.
   - Trigger realtime update for padlet A.
   - Verify: no flicker/jump during drag; `locallyModifiedPadletsRef` skips the update; final position consistent after drag end.

2. **Camera/interaction contract stability**
   - Zoom in → start drag → zoom out mid-drag → release.
   - Verify coordinates are correct throughout.

3. **High-frequency interaction performance**
   - Sustained mouse drag for 5+ seconds.
   - Verify `CanvasClient` (orchestrator) does not rerender per raw pointer event.
   - Confirm renders limited to dragged padlet layer only.

4. **Early return layout paths**
   - Load canvas with Kanban layout → verify early return at L5113 renders correctly.
   - Load canvas with Gantt layout → verify early return at L5196 renders correctly.
   - These must continue working after PR12 extracts them to separate shells.

5. **Editor open/close cycle for each type**
   - For each of the 9 editor types: open → edit → save → close.
   - Verify `padletToEdit` is set and cleared correctly.
   - Verify `usePadletSave` handlers fire correctly.

---

## PR Dependency Graph

```
PR1 (safety net)
 └─ PR2 (region markers + dead import cleanup)
     └─ PR2.5 (type canonicalization)
         └─ PR3 (pure engine helpers)
             └─ PR4 (store: editors + selection)
                 ├─ PR5 (useCanvasData)
                 │   ├─ PR6 (useCanvasCamera)
                 │   ├─ PR7 (useCanvasSelection)
                 │   ├─ PR8 (useCanvasInteractions)
                 │   ├─ PR9 (useCanvasLines)
                 │   ├─ PR10 (useCanvasShortcuts)
                 │   └─ PR11 (useCanvasOverlays)
                 │       └─ PR11.5 (hoist inline JSX handlers)
                 │           └─ PR12 (split UI components)
                 │               └─ PR13 (editor system)
                 │                   └─ PR14 (persistence boundary)
                 │                       └─ PR15 (performance pass)
                 └─ (PR6-PR11 can be parallelized after PR5)
```

**Note**: PR6 through PR11 are independent of each other and can be worked in parallel after PR5 is merged. PR11.5 depends on PR11 being merged. PR12 depends on PR11.5.
