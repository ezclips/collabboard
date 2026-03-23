# Task Checklist: Post and Container Visual Unification

## Pre-flight

- [ ] Verify no in-flight work is modifying the same layout wrapper files
- [ ] Verify map canvas is explicitly out of scope for this rollout
- [ ] Verify nested containers are not a supported migration target in this rollout
- [ ] Identify any existing tests covering affected components
- [ ] Decide temporary feature flag approach for `useNewShell`

## Global Rules

- [ ] Do not change save flow logic
- [ ] Do not change placement flow logic
- [ ] Do not change delete/reinsert behavior
- [ ] Do not move role logic into shared shells
- [ ] Do not break freeform post-after-edit behavior
- [ ] Do not break non-freeform placement/delete behavior
- [ ] Keep wall canvas in scope
- [ ] Keep drawing Excalidraw lifecycle intact
- [ ] Keep map canvas out of scope for this rollout

## Architecture Guardrails

- [ ] Shared shell files must not import persistence hooks
- [ ] Shared shell files must not import global canvas state hooks
- [ ] Shared shell files must not import Supabase client code
- [ ] Add lint/check rule: no persistence/state imports in shell files
- [ ] Freeze shell API before starting layout migrations

## Phase 1: Shared Spec, Tokens, and API Freeze

- [ ] Define shared visual spec for post shell
- [ ] Define shared visual spec for container shell
- [ ] Decide and document token mechanism (`shellTokens.ts` + CSS variables)
- [ ] Define accessibility baseline
- [ ] Define complete shell props contract
- [ ] Define feature flag integration points
- [ ] Freeze shell API

### Phase 1 Acceptance

- [ ] Token source of truth exists
- [ ] Shell prop contract is documented
- [ ] Accessibility baseline is documented
- [ ] Shell API is frozen

### Phase 1 Rollback Checkpoint

- [ ] If blocked, remove draft planning-only shell artifacts and stop before layout edits

## Phase 2: Shared Shell Components in Isolation

- [ ] Create `components/collabboard/shells/PadletCardShell.tsx`
- [ ] Create `components/collabboard/shells/ContainerCardShell.tsx`
- [ ] Create `components/collabboard/shells/shellTokens.ts`
- [ ] Add slots for header/actions/content
- [ ] Add selected/hovered visual support
- [ ] Add expand/collapse visual slot support
- [ ] Add Storybook stories for shell variants
- [ ] Confirm zero persistence/state imports in shell files

### Phase 2 Acceptance

- [ ] Shells render correctly in isolation
- [ ] Stories cover default, compact, expanded, and collapsed states
- [ ] Shell files stay presentation-only

### Phase 2 Rollback Checkpoint

- [ ] If regression detected, revert shell files and stories only

## Phase 3: Row/Grid Migration

- [ ] Update `components/canvas/layouts/ColumnsCanvasRow.tsx`
- [ ] Reduce shell ownership in `components/collabboard/RowColumnContainerCard.tsx`
- [ ] Keep row/grid section logic unchanged
- [ ] Keep row/grid placement behavior unchanged
- [ ] Add or update affected tests if present

### Phase 3 Regression Checks

- [ ] Open post editor in row/grid
- [ ] Save post in row/grid
- [ ] Click canvas after edit in row/grid
- [ ] Drag post/container in row/grid
- [ ] Use right-click menu in row/grid
- [ ] Add to container in row/grid
- [ ] Refresh row/grid canvas
- [ ] Verify content still loads in row/grid

### Phase 3 Acceptance

- [ ] Row/grid posts match shared square shell
- [ ] Row/grid containers match shared square shell
- [ ] No save/placement regression in row/grid
- [ ] Refresh persistence still works in row/grid

### Phase 3 Rollback Checkpoint

- [ ] If regression detected, revert row/grid wrapper files only

## Phase 4: Timeline Migration

- [ ] Update `components/canvas/ChronoTimelineCanvas.tsx`
- [ ] Preserve timeline ordering logic
- [ ] Preserve timeline placement behavior
- [ ] Preserve timeline expand/collapse behavior
- [ ] Add or update affected tests if present

### Phase 4 Regression Checks

- [ ] Open post editor in timeline
- [ ] Save post in timeline
- [ ] Click canvas after edit in timeline
- [ ] Drag post/container in timeline
- [ ] Use right-click menu in timeline
- [ ] Add to container in timeline
- [ ] Refresh timeline canvas
- [ ] Verify content still loads in timeline

### Phase 4 Acceptance

- [ ] Timeline shell matches shared shell
- [ ] Ordering and placement remain unchanged
- [ ] Expand/collapse remains correct in timeline

### Phase 4 Rollback Checkpoint

- [ ] If regression detected, revert timeline file only

## Phase 5: Freeform Migration

- [ ] Update `components/collabboard/canvas/ui/FreeformPadletCards.tsx`
- [ ] Keep freeform edit-close-canvas behavior unchanged
- [ ] Keep freeform drag/drop logic unchanged
- [ ] Keep freeform editor routing unchanged
- [ ] Add or update affected tests if present

### Phase 5 Regression Checks

- [ ] Open post editor in freeform
- [ ] Save post in freeform
- [ ] Click canvas after edit in freeform
- [ ] Drag post/container in freeform
- [ ] Use right-click menu in freeform
- [ ] Add to container in freeform
- [ ] Refresh freeform canvas
- [ ] Verify content still loads in freeform

### Phase 5 Acceptance

- [ ] Freeform visual shell matches shared shell
- [ ] Freeform behavior remains unchanged

### Phase 5 Rollback Checkpoint

- [ ] If regression detected, revert freeform file only

## Phase 6: Wall Migration

- [ ] Update `components/canvas/wall/WallContainerCard.tsx`
- [ ] Preserve wall ordering behavior
- [ ] Preserve wall placement behavior
- [ ] Preserve wall container mutation behavior
- [ ] Add or update affected tests if present

### Phase 6 Regression Checks

- [ ] Open post editor in wall
- [ ] Save post in wall
- [ ] Click canvas after edit in wall
- [ ] Drag post/container in wall
- [ ] Use right-click menu in wall
- [ ] Add to container in wall
- [ ] Refresh wall canvas
- [ ] Verify content still loads in wall

### Phase 6 Acceptance

- [ ] Wall shell matches shared shell visually
- [ ] Wall placement and ordering remain unchanged
- [ ] Wall actions remain unchanged

### Phase 6 Rollback Checkpoint

- [ ] If regression detected, revert wall file(s) only

## Phase 7: Drawing Migration

- [ ] Update visual wrapper in `components/collabboard/canvas/layouts/DrawingLayout.tsx`
- [ ] Keep Excalidraw `updateScene()` logic unchanged
- [ ] Keep embeddable drag behavior unchanged
- [ ] Keep auto-height sync unchanged
- [ ] Keep drawing-specific add/edit/delete behavior unchanged
- [ ] Add or update affected tests if present

### Phase 7 Regression Checks

- [ ] Open post editor in drawing
- [ ] Save post in drawing
- [ ] Click canvas after edit in drawing
- [ ] Drag post/container in drawing
- [ ] Use right-click menu in drawing
- [ ] Add to container in drawing
- [ ] Refresh drawing canvas
- [ ] Verify content still loads in drawing

### Phase 7 Acceptance

- [ ] Drawing shell matches shared shell as closely as host constraints allow
- [ ] Excalidraw interactions remain unchanged
- [ ] Container auto-height remains correct

### Phase 7 Rollback Checkpoint

- [ ] If regression detected, revert drawing file only

## Final Completion Gate

- [ ] Posts share one square visual shell style across in-scope layouts
- [ ] Containers share one square visual shell style across in-scope layouts
- [ ] No layout/render logic regression introduced
- [ ] No permission regression introduced
- [ ] Freeform-vs-other behavior split remains intact
- [ ] Temporary feature flag can be removed or disabled cleanly
