# Post and Container Visual Unification Plan

## Goal

Unify the visual appearance of posts and containers across canvases without changing layout-specific behavior, save flows, placement flows, or permission rules.

This plan is intentionally limited to presentation-only changes. It must not refactor lifecycle behavior.

## Scope

Included layouts:

- row/grid
- timeline
- freeform
- wall
- drawing

Map canvas status:

- Explicitly out of scope for the first rollout.
- Reason: map uses popup-based rendering and a separate interaction model, so it should only be migrated after the shared shells are proven stable in the main canvas families.
- Follow-up work can add a dedicated Map phase once the shell API is stable.

## Non-Negotiable Constraints

- Do not break any existing layout or render logic.
- Keep code changes isolated to post/container presentation.
- Preserve the two existing behavior variants:
  - Freeform variant: after editing, clicking on the canvas keeps the post on the canvas.
  - Other canvas variants: current delete/reinsert/placement behavior stays exactly as-is.
- Do not move save, delete, placement, or routing logic into shared UI shells.
- Do not move permission logic into shared UI shells.
- Wall canvas is included in the scope.
- Drawing canvas may match visually, but must keep Excalidraw ownership of embeddable lifecycle and interaction.
- Shell API must be frozen before layout migrations begin.

## What Is Being Unified

Only the outer visual shell of posts and containers:

- border
- border radius
- shadow
- padding
- header/title row
- edit button placement
- expand/collapse button placement
- content spacing
- selected/hover visual states
- focus-visible styling
- keyboard focus order consistency
- ARIA labeling strategy

## What Must Not Be Unified Right Now

These remain layout-owned and behavior-specific:

- save flow
- placement flow
- delete/reinsert flow
- canvas click behavior after editing
- drag/drop decisions
- editor open routing
- section/container assignment
- Excalidraw scene syncing
- parent/child linkage persistence
- role/permission checks
- map popup interaction model

## Visual Token Mechanism

Use a shared constants-plus-CSS-variable approach.

- Define shell tokens in a dedicated shared module, for example `components/collabboard/shells/shellTokens.ts`.
- Expose the main visual values as plain constants for React usage.
- Mirror reusable color/radius/shadow values via CSS variables on the shell root where appropriate.
- Use Tailwind utility composition for layout structure, but do not scatter the source-of-truth values across many files.

Rationale:

- simple to adopt incrementally
- easy to override for drawing/wall edge cases
- avoids a full Tailwind theme refactor for this task

## Architecture Boundary

### Shared layer should own

Presentation only:

- shell frame
- slots for header/actions/content
- visual variants such as compact/selected/expanded/collapsed
- accessibility attributes passed in from parent

### Shared layer must not own

Behavior:

- database updates
- editor state
- placement prompts
- add/remove post behavior
- drag state decisions
- permission computation
- global canvas state

## Shell API Freeze

Before any layout migration starts:

- define the shared shell prop contract
- review it against all in-scope layouts
- freeze the interface
- only permit changes to the interface if a documented blocker is found and prior migrated layouts are updated in the same change

This prevents repeated rework across already-migrated layouts.

## Draft Shell Prop Contract

### `PadletCardShell`

Suggested presentational props:

- `variant`: `'default' | 'compact' | 'expanded' | 'collapsed'`
- `selected?: boolean`
- `hovered?: boolean`
- `className?: string`
- `style?: React.CSSProperties`
- `backgroundColor?: string`
- `header?: React.ReactNode`
- `actions?: React.ReactNode`
- `children: React.ReactNode`
- `showHeader?: boolean`
- `showActions?: boolean`
- `onHeaderClick?: () => void`
- `testId?: string`
- `ariaLabel?: string`
- `role?: string`

### `ContainerCardShell`

Suggested presentational props:

- `variant`: `'default' | 'compact' | 'expanded' | 'collapsed'`
- `selected?: boolean`
- `hovered?: boolean`
- `className?: string`
- `style?: React.CSSProperties`
- `backgroundColor?: string`
- `title?: React.ReactNode`
- `actions?: React.ReactNode`
- `children: React.ReactNode`
- `showHeader?: boolean`
- `showExpandButton?: boolean`
- `isExpanded?: boolean`
- `onExpandToggle?: () => void`
- `onHeaderClick?: () => void`
- `testId?: string`
- `ariaLabel?: string`
- `role?: string`

Role-based booleans such as `showEditButton` or `showExpandButton` must be passed in from parent layout code.

## Role and Permission Handling

The shared shells must be permission-blind.

They may receive props such as:

- `showEditButton`
- `showExpandButton`
- `showContextActions`
- `draggable`

But they must not calculate those values from workspace role.

### Rule split

Local UI-only actions may remain available to read-only users if already allowed:

- expand/collapse container
- local visual toggles

Mutating actions must stay gated in parent layout/controller code:

- edit
- delete
- add post
- add container
- drag/drop reorder
- move into container
- color changes
- persistence actions

## Existing High-Risk Behavior Split

This project currently has two important behavior variants.

### Variant A: Freeform

- posts stay on canvas after edit/close interactions
- freeform-specific click behavior must remain untouched

### Variant B: Other canvases

- current placement/delete/reinsert behavior must remain untouched
- applies to row/grid, wall, timeline, and similar non-freeform flows

The shared visual shell must not merge or blur these two behavior paths.

## Existing Files That Must Keep Ownership of Behavior

These files should continue to own layout behavior and persistence decisions:

- `app/dashboard/canvas/[id]/CanvasClient.tsx`
- `hooks/canvas/usePadletSave.ts`
- `components/collabboard/canvas/layouts/DrawingLayout.tsx`
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`
- `components/canvas/ChronoTimelineCanvas.tsx`
- `components/canvas/layouts/ColumnsCanvasRow.tsx`
- `components/canvas/wall/WallContainerCard.tsx`

## Import Boundary Rule

Shared shell files must not import persistence or global canvas state hooks.

Explicitly forbidden in shell files:

- `useCanvasStore`
- `usePadletStore`
- `useSupabase`
- direct `supabase` client usage
- layout-specific state hooks
- editor controller hooks

This should be treated as a lint-level architectural rule.

## Nested Containers

Current plan assumption:

- nested containers are not a supported target for this migration.
- container shells only need to support normal child-post rendering depth.

If nested containers are later confirmed as a supported feature, that requires a separate design review before shell rollout to avoid recursive layout regressions.

## Proposed New Shared Components

Create presentation-only wrappers:

- `components/collabboard/shells/PadletCardShell.tsx`
- `components/collabboard/shells/ContainerCardShell.tsx`
- `components/collabboard/shells/shellTokens.ts`

### Suggested responsibilities

`PadletCardShell.tsx`

- outer frame for non-container posts
- header/action slot
- body slot
- visual variants only

`ContainerCardShell.tsx`

- outer frame for containers
- title row
- action slot
- expand/collapse button slot
- child content area slot
- visual variants only

## Existing Content Components to Keep

Keep these focused on content, not shell ownership:

- `components/collabboard/PostCardContent.tsx`
- `components/collabboard/RowColumnContainerCard.tsx`

### Target responsibility split

`PostCardContent.tsx`

- inner content rendering only
- no outer layout shell ownership

`RowColumnContainerCard.tsx`

- container body and child rendering
- no layout-specific persistence logic
- minimal shell ownership after migration

## Tests and Visual Regression Strategy

Validation should happen per phase, not only at the end.

Recommended approach:

- add Storybook stories for each shared shell variant
- add isolated stories for post shell and container shell states
- run manual screenshot comparison per migrated layout
- where practical, add screenshot/snapshot tests for shell output

The minimum acceptable gate is per-phase manual regression plus Storybook isolation.

Existing tests:

- if any affected component already has tests, update them as part of the same phase
- if tests are absent, add at least shell-level Storybook coverage before migrating the first layout

## Phase Plan

### Phase 1: Shared spec, tokens, and API freeze

Tasks:

- define shared visual tokens
- define shell component contract
- define accessibility baseline
- define import boundary rule
- freeze shell API

Acceptance gate:

- token source of truth is created
- shell prop contract is documented
- shell API is frozen
- no layout migration has started yet

Rollback strategy:

- delete new shell draft files only
- no layout files should need revert in this phase

### Phase 2: Implement shared shell components in isolation

Tasks:

- create shell components
- create shell token module
- create Storybook stories for shell variants
- validate shells without layout integration

Acceptance gate:

- shells render correctly in isolation
- no persistence/state imports exist in shell files
- stories cover default, compact, expanded, collapsed states

Rollback strategy:

- revert shell files and stories only
- no layout files should need revert in this phase

### Phase 3: Row/grid migration

Primary files:

- `components/canvas/layouts/ColumnsCanvasRow.tsx`
- `components/collabboard/RowColumnContainerCard.tsx`

Acceptance gate:

- row/grid posts match shared square shell
- row/grid containers match shared square shell
- no save/placement behavior regression
- row/grid refresh persistence still works

Rollback strategy:

- revert row/grid layout files only
- keep shell files if they are still valid in isolation

### Phase 4: Timeline migration

Primary file:

- `components/canvas/ChronoTimelineCanvas.tsx`

Acceptance gate:

- timeline shell matches shared shell
- ordering and placement remain unchanged
- expand/collapse remains correct

Rollback strategy:

- revert timeline file only
- keep shell files and previous migrated layouts untouched

### Phase 5: Freeform migration

Primary file:

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`

Acceptance gate:

- freeform visual shell matches shared shell
- freeform edit-close-canvas behavior remains unchanged
- drag/drop and editor routing remain unchanged

Rollback strategy:

- revert freeform file only
- do not revert earlier migrated layouts unless regression proves shared shell API is wrong

### Phase 6: Wall migration

Primary file:

- `components/canvas/wall/WallContainerCard.tsx`

Wall-specific constraints:

- preserve wall ordering behavior
- preserve wall placement behavior
- preserve wall container mutation behavior
- preserve any wall-specific card density or column balancing decisions

Acceptance gate:

- wall shells match shared shell visually
- wall placement and ordering remain unchanged
- wall context actions remain unchanged

Rollback strategy:

- revert wall files only
- keep shell files and previous migrated layouts untouched

### Phase 7: Drawing migration

Primary file:

- `components/collabboard/canvas/layouts/DrawingLayout.tsx`

Drawing-specific constraints:

- keep Excalidraw `updateScene()` logic unchanged
- keep embeddable drag behavior unchanged
- keep auto-height sync unchanged
- keep Excalidraw selection/resize ownership unchanged
- only swap the visual wrapper around the content

Acceptance gate:

- drawing shells match shared shell visually as closely as host constraints allow
- Excalidraw interactions remain unchanged
- container auto-height remains correct
- no embeddable lifecycle regression

Rollback strategy:

- revert drawing layout file only
- preserve shared shell work and earlier layout migrations

## Dangerous Logic Boundaries

Do not refactor these together with shell work:

- `setPadletToEdit(...)`
- `closeEditor()`
- `createRealPostFromDraft(...)`
- `handleDrawingLayoutAddPadletWithContainerCheck(...)`
- `onDropDraftIntoContainer`
- `onDropExistingPadlet`
- anything checking `parentId`
- anything checking `sectionId`
- anything checking `childPadletIds`
- freeform canvas click-to-place behavior
- non-freeform placement prompt behavior
- Excalidraw scene synchronization

## Accessibility Baseline

The shared shell spec should include:

- consistent keyboard focus order
- `focus-visible` states
- stable button labels/`aria-label`s
- explicit region/article role choice per shell usage
- no loss of keyboard access when migrating layout wrappers

If a layout cannot fully adopt the baseline in the same phase, document the exception in that phase.

## Feature Flag / Canary Strategy

Use a local opt-in feature flag during migration.

Suggested approach:

- add a temporary `useNewShell` toggle at layout integration points
- enable it one layout at a time during migration
- remove the flag only after all in-scope phases are complete and stable

Purpose:

- instant local rollback without full git revert
- easier validation during partial rollout

## Per-Phase Acceptance Checklist

For each migrated layout, verify:

1. post visual shell matches agreed square style
2. container visual shell matches agreed square style
3. edit button still opens the same editor as before
4. save flow behaves exactly as before
5. clicking canvas after edit behaves exactly as before for that layout
6. drag/drop still works exactly as before
7. right-click/context menu still works
8. expand/collapse still works where supported
9. read-only users keep allowed local UI actions
10. mutating actions remain role-gated
11. refresh shows persisted content correctly

## Rollout Recommendation

Use the phase order above.

Do not migrate multiple behavior-sensitive layouts in one step.

## Final Recommendation

Proceed with visual unification only.

Do not attempt full behavior unification in the same change set.

The correct near-term target is:

- same appearance everywhere in-scope
- same permission boundaries as today
- same placement/save/delete behavior as today
- no cross-layout lifecycle refactor
