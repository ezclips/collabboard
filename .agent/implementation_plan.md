# FreeformPadletCards: Exact Coding Patch Sequence

This document defines the exact file-by-file patch sequence to safely execute the pre-extraction stabilization of `FreeformPadletCards.tsx`. No type-specific card extraction occurs in this phase.

---

## Phase 1 Patch Plan: Split `usePadletSave`

**Goal:** Decompose the 1200+ line save hook to separate map/grid dependencies from freeform saving.

**Files to Create:**
1.  `hooks/canvas/useMapPadletSave.ts`: Copied from map branches in `usePadletSave.ts`.
2.  `hooks/canvas/useGridPadletSave.ts`: Copied from grid/columns branches and ghost drag routing.

**Files to Modify:**
1.  `hooks/canvas/usePadletSave.ts`:
    *   Delete all branches conditionally executing code for `isMapLayout` or `isColumnsLayout`.
    *   Remove dependencies like `mapActiveContainerId` or `placementContext` from its parameters.
2.  `app/collabboard/canvas/[id]/CanvasClient.tsx`:
    *   Import all three hooks.
    *   Call `const mapSaves = useMapPadletSave(...)`, `const gridSaves = useGridPadletSave(...)`, and `const freeformSaves = usePadletSave(...)`.
    *   Update `saveCard`, `saveLink`, etc., to dynamically route: `if (isMapLayout) return mapSaves.saveCard(...); else if (isColumnsLayout || isGridLayout) return gridSaves.saveCard(...); else return freeformSaves.saveCard(...);`.

**Testing Checklist:**
- [ ] Freeform: Add a Note, Link, and Card. They appear on the canvas.
- [ ] Columns/Grid: Add a Note. Ghost drag ghost appears, dropping places it into the target column.
- [ ] Map: Drop a pin, save address. Post creates correctly attached to the container.

---

## Phase 2 Patch Plan: Introduce `stableActions` Prop

**Goal:** Provide orchestration callbacks to Freeform without forcing re-renders when closures change.

**Files to Create:**
1.  `hooks/canvas/useStableCanvasActions.ts`

**Files to Modify:**
1.  `hooks/canvas/useStableCanvasActions.ts`:
    *   Implement `const refs = useRef(actions); useLayoutEffect(() => { refs.current = actions; }, [actions]);`.
    *   Return a `useMemo(() => ({ duplicatePadlet: (id) => refs.current.duplicatePadlet(id), ... }), [])`.
2.  `app/collabboard/canvas/[id]/CanvasClient.tsx`:
    *   Import and call `const stableActions = useStableCanvasActions({ duplicatePadlet, requestDeletePadlet, ...30+ more });` explicitly specifying out all the orchestration callbacks that `FreeformPadletCards` uses.
    *   Inject it: `<FreeformPadletCards stableActions={stableActions} /*...rest props*/ />`
3.  `components/collabboard/canvas/ui/FreeformPadletCards.tsx`:
    *   **Interface Change:** Add `stableActions: StableCanvasActions;`. Remove the 30+ discrete callback typings (`duplicatePadlet: (id: string) => void;`, etc).
    *   **Component Change:** In the parameters, remove the discrete callbacks and destructure `stableActions`. Throughout the `.map` body, find/replace `duplicatePadlet(` with `stableActions.duplicatePadlet(` for all stable actions.

**Testing Checklist:**
- [ ] Right click a freeform post -> Duplicate (must duplicate).
- [ ] Right click a freeform post -> Delete (must delete).
- [ ] Change a card's color via the editor (must save and update).

---

## Phase 3 Patch Plan: CanvasEditorContext

**Goal:** Move 60+ medium-volatility modal/editor props off of `FreeformPadletCards`.

**Files to Create:**
1.  `components/collabboard/canvas/contexts/CanvasEditorContext.tsx`:
    *   Export `CanvasEditorContext`, `CanvasEditorProvider`, and `useCanvasEditor()`.
    *   Define the `EditorState` interface exactly matching the removed props.

**Files to Modify:**
1.  `app/collabboard/canvas/[id]/CanvasClient.tsx`:
    *   Initialize the `EditorState` object literal using the local state flags (`isNoteEditorOpen`, `cardToolbarPadletId`, `commentPopupPosition`, etc).
    *   Wrap `<FreeformPadletCards>` inside `<CanvasEditorProvider value={editorState}>`.
2.  `components/collabboard/canvas/ui/FreeformPadletCards.tsx`:
    *   **Interface Change:** Delete all 60+ editor state props.
    *   **Component Change:** Pluck the context at the top level: `const editorState = useCanvasEditor();`. Prefix usages: `editorState.isNoteEditorOpen`.

**Testing Checklist:**
- [ ] Double-click a post (or use toolbar) to open the note editor.
- [ ] Click a comment badge to open the detached comment popup. Popup aligns correctly.
- [ ] Click the color picker on a card toolbar.

---

## Phase 4 Patch Plan: CanvasConfigContext

**Goal:** Move low-volatility view settings into context.

**Files to Create:**
1.  `components/collabboard/canvas/contexts/CanvasConfigContext.tsx`:
    *   Export `CanvasConfigContext`, `CanvasConfigProvider`, and `useCanvasConfig()`.

**Files to Modify:**
1.  `app/collabboard/canvas/[id]/CanvasClient.tsx`:
    *   Initialize the config object (`canvasZoom`, `canvasId`, `isFreeformGraphMode`, `isDrawingMode`, `isColumnsLayout`, `canUseFreeformEditButton`).
    *   Wrap `<CanvasEditorProvider>` inside `<CanvasConfigProvider value={configState}>`.
2.  `components/collabboard/canvas/ui/FreeformPadletCards.tsx`:
    *   **Interface Change:** Delete the config props.
    *   **Component Change:** `const config = useCanvasConfig();`. Replace usages with `config.canvasZoom`.

**Testing Checklist:**
- [ ] Use mouse wheel or toolbar to zoom in/out -> Posts scale smoothly.
- [ ] Switch to Freeform Graph view -> Graph connecting lines become interactive.

---

## Transitional Compatibility Notes
*   **Action Routing in CanvasClient:** When routing save commands in Phase 1, `CanvasClient` will temporarily hold `if/else` logic routing to the 3 distinct hooks. This is structurally necessary because `CanvasClient` holds the unified layout toggle state.
*   **Retained Direct Props in FreeformPadletCards:** The following props must **NOT** be moved to Context or removed from the `FreeformPadletCardsProps` interface throughout all patches:
    *   `rootPadlets: Padlet[]`
    *   `padlets: Padlet[]`
    *   `isDragging: boolean`
    *   `draggingPadletId: string | null`
    *   `selectedPadletId: string | null`
    *   `setPadlets` (if specifically required for drag-drop reordering inside Freeform).
    *   `isLineMode`, `isGraphConnectMode` (High-volatility geometry tracking).

---

## Commit Checkpoints
1.  `refactor(canvas): phase 1 - split usePadletSave hook by layout domain`
2.  `refactor(canvas): phase 2 - inject stableActions into FreeformPadletCards`
3.  `refactor(canvas): phase 3 - implement CanvasEditorContext`
4.  `refactor(canvas): phase 4 - implement CanvasConfigContext`

---

## Final Pre-Extraction State
Before any developer touches extracted cards, `FreeformPadletCards.tsx` will:
- Mount via `<FreeformPadletCards stableActions={stableActions} padlets={padlets} ... />` taking less than ~15 props.
- Run a single massive `.map` loop mapping the `FreeformImageCard` / `FreeformNoteCard` *inline components*, which will no longer read values from the root props signature, but instead read from `editorState`, `config`, and `stableActions`.
- Rerender optimally because interaction events won't fire context updates, and context providers will only broadcast on explicit modal/layout toggles.
