# TypeScript Stabilization Plan

Date: 2026-03-23
Repo: `C:\Users\rmeic\Projects\dev\starter`

## Evidence Base

This plan is based on a fresh compiler snapshot, not the stale checked-in `tsc_output.txt`.

Command used:

```powershell
cmd /c "cd /d C:\Users\rmeic\Projects\dev\starter && npx tsc --noEmit --pretty false > current_tsc_output.txt 2>&1"
```

Additional repo checks used while building this plan:

- compared duplicate shared modules:
  - `C:\Users\rmeic\Projects\dev\starter\lib\supabase-provider.ts`
  - `C:\Users\rmeic\Projects\dev\starter\lib\supabase-provider.tsx`
  - `C:\Users\rmeic\Projects\dev\starter\lib\collabboard\types.ts`
  - `C:\Users\rmeic\Projects\dev\starter\types\collabboard.ts`
- scanned for existing DB-type artifacts and found no obvious generated Supabase database type file by filename
- scanned for barrels:
  - found: `C:\Users\rmeic\Projects\dev\starter\lib\collabboard\layouts\index.ts`
  - found: `C:\Users\rmeic\Projects\dev\starter\components\collabboard\settings\index.ts`
  - no `index.ts` barrels were found under `C:\Users\rmeic\Projects\dev\starter\types\**`
  - no `index.ts` barrels were found under `C:\Users\rmeic\Projects\dev\starter\components\canvas\**`

## Non-Negotiables

- Preserve runtime behavior exactly.
- Keep styles untouched.
- Do not refactor unrelated code.
- Avoid `any` or broad cast-based suppression as a cleanup strategy.
- Fix in isolated batches with a compiler run between batches.
- Do not change import paths across multiple architectural layers in one batch unless that is the explicit purpose of the batch.

## Fix Strategy

This plan follows the four-step strategy requested:

1. Fix by cluster, not all at once.
2. Start with build blockers and source-of-truth mismatches that are obviously correct.
3. Verify each cluster at compiler, import/runtime, and behavior level before moving on.
4. Do not "green" TypeScript by widening types or adding blanket casts.

## Root Causes Seen In The Current Error Surface

The current TypeScript failures come from several distinct architectural sources:

- `tsconfig.json` is compiling non-runtime files: demos, tests, examples, backups, copies, vendor docs, and sample apps.
- The repo has duplicate shared modules with conflicting responsibilities:
  - `lib/supabase-provider.ts` and `lib/supabase-provider.tsx`
  - `lib/collabboard/types.ts` and `types/collabboard.ts`
- Several API routes are using shared auth/Supabase helpers in a way that produces `cookies()` and `never`-typed query results.
- There is a large, runtime-sensitive canvas surface where types have drifted away from actual state shape and prop contracts.
- The local Excalidraw fork is being type-checked together with docs/examples/tests, and its package boundary appears to mix source types with emitted `dist/types`.

## Verification Model

Every batch should be verified at three levels.

### 1. Compiler Verification

- Full repo: `npx tsc --noEmit --pretty false`
- Narrowed file checks where useful for a batch, but never as a substitute for the full repo pass

### 2. Import / Runtime Verification

- Confirm the affected page, route, or component still resolves and loads
- Confirm imports resolve to the intended canonical module, not a shadow `.ts` / `.tsx` twin or stale barrel

### 3. Behavioral Smoke Verification

Use only where the batch touches runtime behavior:

- auth redirect / user session surface
- billing and subscription render
- collaborators and comments routes
- canvas open / edit / delete
- comments and context menus
- drawing layout movement

## Stop Conditions

Stop after any batch if one of these happens:

- The batch reveals a second runtime implementation of the same feature and the active one is unclear.
- A type fix requires changing persisted data shape or API response shape.
- A shared file starts forcing changes across more than two later batches.
- A batch requires changing import paths in more than one architectural layer at once.

If a stop condition is hit, freeze the batch and produce a narrower follow-up plan before coding.

## Batch Order

### Batch 0A: Import Reachability Audit For Candidate Exclusions

Goal:
- Validate that every file considered for exclusion is truly unreachable from runtime code before touching `tsconfig.json`.

Why this exists:
- In messy repos, copied files can still be pulled in indirectly through barrels, extensionless imports, or dynamic imports.
- A mistaken exclusion can hide active code and create false confidence.

What this batch must produce:

- A reachability list for each candidate exclusion:
  - unreachable dead file
  - reachable runtime file
  - unclear / dynamic-import candidate
- A short audit note for every file or subtree that is not obviously safe to exclude

Primary files and subtrees to audit:

- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\create-canvas\also no goodpage.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\create-canvas\long_but works_page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\create-canvas\samepage.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\layouts\broken_WallLayout.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\layouts\ColumnsCanvasRow - Kopie.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\layouts\ColumnsLayout - Kopie.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\layouts\ColumnsLayout - Kopie (2).tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\layouts\ColumnsLayout - Kopie (3).tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\layouts\ColumnsLayout - Kopie (6).tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\layouts\frombackup_ColumnsLayout.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\last workingCanvasSetupPage.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\Neuer Ordner\**`
- `C:\Users\rmeic\Projects\dev\starter\lib\collabboard\layouts\origFreeformLayout.tsx`
- `C:\Users\rmeic\Projects\dev\starter\lib\collabboard\layouts\origGridLayout.tsx`
- `C:\Users\rmeic\Projects\dev\starter\gantt\react\samples-public\**`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\dev-docs\**`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\examples\**`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\excalidraw-app\tests\**`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\packages\element\tests\**`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\packages\excalidraw\tests\**`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\packages\utils\tests\**`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\setupTests.ts`

Required checks:

- direct import scan
- barrel import scan
- extensionless import resolution scan
- dynamic import scan for the candidate subtree

Verification:

- Candidate exclusion list is complete and classified
- No runtime-reachable file is marked safe to exclude

Risk:
- Low, but critical for everything after it

---

### Batch 0B: Reduce Compiler Scope In `tsconfig.json`

Goal:
- Remove dead/demo/vendor-noise files from the TypeScript program after Batch 0A confirms they are not runtime-reachable.

Files:

- `C:\Users\rmeic\Projects\dev\starter\tsconfig.json`

Only exclude files/subtrees that Batch 0A marked as unreachable dead file.

Verification:

- Re-run full `tsc`
- Save a new error snapshot
- Rebuild the remaining file inventory from the new snapshot before starting Batch 1A

Risk:
- Low if Batch 0A was done correctly

---

### Batch 1A: Supabase / Auth Provider Canon

Goal:
- Decide and enforce the single canonical provider module for `useSupabase`.

Why isolated:
- Provider ambiguity and domain-type ambiguity are different root causes and should not land together.

Files:

- `C:\Users\rmeic\Projects\dev\starter\lib\supabase-provider.ts`
- `C:\Users\rmeic\Projects\dev\starter\lib\supabase-provider.tsx`
- `C:\Users\rmeic\Projects\dev\starter\lib\supabase.ts`
- `C:\Users\rmeic\Projects\dev\starter\app\layout.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\settings\billing\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\settings\subscription\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\account\ProtectedRoute.tsx`

Decision required:

- Choose whether `useSupabase` resolves from:
  - `C:\Users\rmeic\Projects\dev\starter\lib\supabase-provider.tsx`, or
  - another intentionally canonical module

Non-goal:

- Do not touch collabboard domain types in this batch.

Verification:

- Provider consumers compile against one return shape
- `app/layout.tsx` still renders
- protected route and billing/subscription pages still load

Risk:
- Medium

---

### Batch 1B: Domain Type Canon Plus Barrel Audit

Goal:
- Choose one source of truth for collabboard domain types and stop wrong type resolution through direct imports, barrels, or extensionless module resolution.

Why isolated:
- This batch is about the data model and request/response contracts, not auth/provider state.

Primary source-of-truth candidates:

- `C:\Users\rmeic\Projects\dev\starter\lib\collabboard\types.ts`
- `C:\Users\rmeic\Projects\dev\starter\types\collabboard.ts`

Files:

- `C:\Users\rmeic\Projects\dev\starter\lib\collabboard\types.ts`
- `C:\Users\rmeic\Projects\dev\starter\types\collabboard.ts`
- `C:\Users\rmeic\Projects\dev\starter\lib\collabboard\layouts\index.ts`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\settings\index.ts`
- `C:\Users\rmeic\Projects\dev\starter\app\collabboard\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\collabboard\canvas\[id]\settings\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\collabboard\canvas\create\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\CanvasHeader.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\LiveCanvas.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\layouts\WallLayoutRenderer.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\hooks\useCanvasData.ts`
- `C:\Users\rmeic\Projects\dev\starter\tsconfig.json`

Required work in this batch:

- Decide the canonical domain-type module
- Define missing request/response contracts in the chosen source of truth:
  - `CreateCanvasRequest`
  - `UpdateCanvasRequest`
  - `CanvasListResponse`
  - any other missing collabboard request/response types surfaced by the compiler
- Repair imports so consumers point only to the canonical source
- Audit barrels and extensionless imports so the wrong module does not leak back in

Explicit barrel audit scope:

- `C:\Users\rmeic\Projects\dev\starter\lib\collabboard\layouts\index.ts`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\settings\index.ts`
- extensionless imports under:
  - `C:\Users\rmeic\Projects\dev\starter\lib\**`
  - `C:\Users\rmeic\Projects\dev\starter\types\**`
  - `C:\Users\rmeic\Projects\dev\starter\components\collabboard\**`
  - `C:\Users\rmeic\Projects\dev\starter\components\canvas\**`

Verification:

- collabboard pages compile against one `Canvas` / `Padlet` / `LayoutType` contract
- the chosen source-of-truth file is the only one used by runtime consumers for those contracts

Risk:
- Medium-high

---

### Batch 2: Route / Auth / Query Contract Unification

Goal:
- Fix server route typing using one stable route-helper strategy, not file-by-file local improvisation.

Files:

- `C:\Users\rmeic\Projects\dev\starter\app\api\collabboard\canvases\[id]\collabborators\route.ts`
- `C:\Users\rmeic\Projects\dev\starter\app\api\collabboard\canvases\[id]\comments\route.ts`
- `C:\Users\rmeic\Projects\dev\starter\app\api\collabboard\canvases\[id]\comments\[commentId]\replies\route.ts`
- `C:\Users\rmeic\Projects\dev\starter\app\api\imports\resolve-selection\route.ts`
- `C:\Users\rmeic\Projects\dev\starter\app\api\invitations\accept\route.ts`
- `C:\Users\rmeic\Projects\dev\starter\app\api\teams\route.ts`
- `C:\Users\rmeic\Projects\dev\starter\app\api\teams\[id]\route.ts`
- `C:\Users\rmeic\Projects\dev\starter\app\api\workspace\settings-access\route.ts`
- `C:\Users\rmeic\Projects\dev\starter\app\auth\callback\route.ts`
- `C:\Users\rmeic\Projects\dev\starter\lib\workspace\context.ts`
- `C:\Users\rmeic\Projects\dev\starter\lib\auth\permissions.ts`

Required first decision:

- Decide whether the repo will use:
  - generated Supabase DB types as the baseline, or
  - route-local boundary row types

Recommended rule:

- Use generated DB types wherever tables are stable and already represented.
- Use local boundary types only for projections, joins, or clearly temporary legacy areas.

If generated DB types do not exist yet, do not mix ad hoc local typing styles. Pick one boundary pattern for this batch and apply it consistently.

Single route-helper strategy required:

- one route-handler Supabase client creation pattern
- one cookie access pattern
- one authenticated user retrieval pattern
- one typed row selection pattern

Do not:

- fix route files one-by-one with slightly different auth/client setups
- keep using loose `ReturnType<typeof createClient>` or `ReturnType<typeof createRouteHandlerClient>` if that collapses table results to `never`

Verification:

- full `tsc`
- route-level smoke checks:
  - collaborators route
  - comments route
  - teams route
  - auth callback

Risk:
- Medium

---

### Batch 3: Auth And Settings UI Consumers

Goal:
- Repair page/component consumers that currently assume the wrong provider shape or wrong auth state shape.

Files:

- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\settings\billing\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\settings\subscription\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\settings\dashboard\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\settings\import\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\settings\notifications\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\settings\profile\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\account\ProtectedRoute.tsx`

Required work:

- align provider usage to the canonical provider selected in Batch 1A
- remove state initializer drift such as `useState(null)` later receiving `User`
- fix row-to-UI-model mismatches without widening the model
- fix notification typing (`Uint8Array` / `BufferSource`) without changing behavior

Verification:

- full `tsc`
- landing page auth state
- protected route redirect
- billing/subscription render
- profile update flow
- notification subscription flow

Risk:
- Medium

---

### Legacy Gate: Reachable Or Dead

This is a decision point, not a mixed batch.

Question:
- Are legacy collabboard pages still routed and reachable in the product today?

If dead:
- exclude them in the next compiler-scope pass
- do not keep them as a later production batch

If reachable:
- fix them immediately before canvas Batch 4A

Reachability candidates:

- `C:\Users\rmeic\Projects\dev\starter\app\collabboard\canvas\[id]\settings\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\collabboard\canvas\create\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\collabboard\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\app\collabboard\canvas\CanvasSetupPage.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\CanvasSetupPage.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\1stnewRowCanvas.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\TimelineHeaderBar.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\canvas\WallCanvas.tsx`

Conditional remediation batch if reachable:

### Batch 3.5: Reachable Legacy Collabboard Pages Only

Goal:
- Repair active legacy pages so they stop contaminating the runtime type graph before the main canvas batch.

Required work:

- stop imports from non-existent or obsolete collabboard exports
- fix literal / enum mismatches like `ChronoMode`
- decide which setup page surface is actually active and keep only that surface on the runtime type path

Verification:

- open the reachable legacy pages in dev
- confirm they compile against the chosen collabboard type canon

Risk:
- Medium-high

---

### Batch 4A: Canvas Shared Contracts

Goal:
- Quiet the passive shared contracts before touching the main orchestrators.

Why isolated:
- This is mostly contract repair and is safer than editing the top-level state machines first.

Files:

- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\hooks\useCanvasData.ts`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\layouts\WallLayoutRenderer.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\LiveCanvas.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\WallpaperSelector.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\settings\index.ts`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\settings\SettingsPanel.tsx`
- any shared canvas metadata / prop interfaces surfaced by the compiler inside:
  - `C:\Users\rmeic\Projects\dev\starter\types\collabboard.ts`
  - the chosen canonical collabboard type module from Batch 1B

Required work:

- normalize ID types and renderer prop contracts
- normalize shared metadata interfaces only where the runtime already uses those fields
- fix passive contract mismatches without changing orchestration logic

Verification:

- full `tsc`
- import/runtime checks for canvas entry resolution

Risk:
- Medium

---

### Batch 4B: Canvas Orchestrators

Goal:
- Fix the active state orchestration layer once shared contracts are stable.

Files:

- `C:\Users\rmeic\Projects\dev\starter\app\dashboard\canvas\[id]\CanvasClient.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\LiveCanvas.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\layouts\DrawingLayout.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\layouts\WallLayoutRenderer.tsx`

Required work:

- fix state setter signatures
- fix `delete` on required props by aligning mutation-target types to actual runtime usage
- keep all behavior intact

Important boundary rule:

- Do not edit Excalidraw fork internals in this batch.
- Treat the fork as opaque until Batch 6 decides the package boundary.

Verification:

- full `tsc`
- canvas open
- add / edit / delete padlet
- drawing layout movement
- wall/freeform opening paths

Risk:
- High

---

### Batch 4C: Canvas Interaction Surfaces

Goal:
- Repair UI interaction surfaces after contracts and orchestrators are quiet.

Files:

- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\ui\FreeformPadletCards.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\ui\OverlayLayer.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\context-menus\WallContainerContextMenu.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\editors\CommentEditorToolbar.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\editors\ImageActionsToolbar.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\editors\ImageDrawingLayer.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\editors\NoteEditorToolbar.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\LayoutSwitcher.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\menus\ColumnPostContextMenu.tsx`

Required work:

- fix interaction-surface types after the shared metadata and prop contracts are stable
- avoid introducing new shape fields unless they already exist in runtime data

Verification:

- full `tsc`
- comments and context menus
- toolbar and overlay interactions
- freeform card interactions

Risk:
- Medium-high

---

### Batch 6: Excalidraw Package Boundary

Goal:
- Decide and enforce the package boundary for the local Excalidraw fork before fixing fork-internal type errors.

Why isolated:
- The fork behaves like a vendor package inside the repo.
- Mixed imports from source and built output are causing duplicate, nominally identical types.

Files:

- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\package.json`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\tsconfig.json`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\packages\tsconfig.base.json`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\packages\element\tsconfig.json`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\packages\excalidraw\package.json`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\packages\excalidraw\tsconfig.json`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\packages\element\src\**`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\canvas\excalidraw_fork\packages\excalidraw\src\**`

Decision required before any fork-internal fixes:

- Is the app consuming:
  - the fork as a workspace package boundary, or
  - the fork source tree directly

Required rule:

- Do not allow an intermediate state where some imports resolve to fork source and others resolve to built `dist/types`.

Verification:

- full `tsc`
- `tsc` no longer reports "two unrelated types with the same name" patterns between source and `dist/types`
- drawing canvas still loads and basic Excalidraw interactions still work

Risk:
- High

---

### Batch 7: Secondary Product Surfaces

Goal:
- Clean up remaining production-facing surfaces after the app shell and canvas runtime are stable.

Files:

- `C:\Users\rmeic\Projects\dev\starter\app\kanban-canvas\page.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\kanban-canvas\Board.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\kanban-canvas\CardMenu.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\kanban-canvas\Editor.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\kanban-canvas\index.ts`
- `C:\Users\rmeic\Projects\dev\starter\components\kanban-canvas\KanbanCanvas.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\kanban-canvas\RowMenu.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\kanban-canvas\Toolbar.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\map\MapCanvas.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\gantt-canvas\GanttCanvas.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\gantt-canvas\ganttEvents.ts`
- `C:\Users\rmeic\Projects\dev\starter\components\collabboard\AIComponentExportMenu.tsx`
- `C:\Users\rmeic\Projects\dev\starter\hooks\useAIComponent.ts`
- `C:\Users\rmeic\Projects\dev\starter\lib\ai\persistence.ts`
- `C:\Users\rmeic\Projects\dev\starter\lib\imports\preview.ts`
- `C:\Users\rmeic\Projects\dev\starter\lib\kanban\supabaseAdapter.ts`
- `C:\Users\rmeic\Projects\dev\starter\lib\notifications\push.ts`
- `C:\Users\rmeic\Projects\dev\starter\lib\stripe\admin.ts`
- `C:\Users\rmeic\Projects\dev\starter\components\theme-provider.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui\button.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui-kit\Features.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui-kit\Footer.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui-kit\Hero.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui-kit\LanguageSwitch.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui-kit\Pricing.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui-kit\sections\FeaturesAccordion.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui-kit\sections\FeaturesListicle.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui-kit\sections\Hero.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui-kit\sections\Pricing.tsx`
- `C:\Users\rmeic\Projects\dev\starter\components\ui-kit\Testimonials3.tsx`

Required work:

- keep fixes local to the file unless an earlier canonical module is still wrong
- avoid turning this batch into a second shared-contract cleanup

Verification:

- full `tsc`
- targeted smoke checks for kanban, map, AI export, and marketing shell

Risk:
- Medium

## Recommended Order Of Execution

1. Batch 0A
2. Batch 0B
3. re-run `tsc` and regenerate the error inventory
4. Batch 1A
5. Batch 1B
6. Batch 2
7. Batch 3
8. Legacy Gate
9. Batch 3.5 only if those pages are reachable
10. Batch 4A
11. Batch 4B
12. Batch 4C
13. Batch 6
14. Batch 7

This order minimizes rollback pain and makes it easier to distinguish:

- provider regressions
- source-of-truth domain regressions
- route/auth contract regressions
- canvas runtime regressions
- vendor package-boundary regressions
