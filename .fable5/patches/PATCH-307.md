# PATCH-307 — Timeline layout: asked once, remembered, and only the owner chooses

Status: AUTHORIZED (owner, 2026-10-07: "In the timeline canvas when I enter I get asked every time which layout I want
… it doesn't remember the selection … it will not be asked for user with read only privileges and he can also not
change the layout with the button on the top right corner").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO, live 2026-10-07)
- The choice is stored on the board row: `boards.settings.chronoMode` (`createSetChronoModeCommand`,
  `lib/domain/canvas/board.ts`). The row's UPDATE policy is owner-only (`boards_update`: `user_id = auth.uid()`).
- `CanvasClient.tsx` ~L3500: on load, a saved `chronoMode` is used; otherwise `ChronoModeSelectionModal` opens — for
  EVERY viewer. A non-owner's save is refused by RLS with a silent 204 (and the command ignores the resolved error by
  design), so a view-only user or a collaborator is asked again on every visit. The `TimelineHeaderBar` dropdown is
  shown to everyone too, with the same unsaved result.
- Live for the owner: picking Vertical, reloading and reopening the real "History of Flight" board 3× → never asked,
  "Layout: Vertical". So for the owner the store works.
- Stale overwrite: after a save, `canvas.settings` in `useCanvasData` is NOT updated. `CanvasSettingsModal` (L109)
  writes `settings: { ...canvas.settings, titleHeader }`, so saving the board settings in the same visit erases
  `chronoMode`.
- Ownership authority already exists: `canManageBoardSettings = isBoardOwner(user?.id, canvasId, canvas)` (~L631).

## Design
1. `CanvasClient.tsx`, the chrono-mode init effect: saved `chronoMode` → use it (everyone). No saved mode →
   `canManageBoardSettings` ? open the modal : `setChronoMode('horizontal')` with NO modal and NO save. Add
   `canManageBoardSettings` to the effect's dependencies (auth can resolve after the board loads; the modal then opens
   for the owner). Close the modal if it is open and `canManageBoardSettings` is false.
2. `handleChronoModeChange`: if `!canManageBoardSettings`, return without changing state or saving. After a save
   that did not throw, update the local board settings (see 4).
3. The top-right `TimelineHeaderBar` and the `ChronoModeSelectionModal` render only when `canManageBoardSettings`.
   A non-owner sees the timeline in the saved (or default) layout with no layout button.
4. `components/collabboard/canvas/hooks/useCanvasData.ts`: add and return
   `mergeCanvasSettings(patch: Record<string, unknown>)` =
   `setCanvas(prev => prev ? { ...prev, settings: { ...(prev.settings ?? {}), ...patch } } : prev)` (immutable).
   `handleChronoModeChange` calls `mergeCanvasSettings({ chronoMode: mode })` after the save, so the settings modal
   later merges from current settings.
Keep the CanvasClient addition small (< 20 lines net); no other behaviour changes.

## Tests
- A source test `lib/domain/canvas/timelineChronoModeAuthority.source.test.ts` (pattern:
  `freeformDocumentPlacement.source.test.ts`): the init effect gates the modal on `canManageBoardSettings` and falls
  back to `'horizontal'` without saving; `handleChronoModeChange` returns early without `canManageBoardSettings` and
  calls `mergeCanvasSettings({ chronoMode: mode })`; `<TimelineHeaderBar` and `<ChronoModeSelectionModal` are rendered
  under `canManageBoardSettings`.
- `useCanvasData`: `mergeCanvasSettings` merges into existing settings without dropping other keys, keeps the previous
  object unmutated, and is a no-op when there is no board (extend an existing useCanvasData test file or add one).
- Existing `components/canvas/TimelineHeaderBar.test.tsx` stays green.

## Allowed files
`app/dashboard/canvas/[id]/CanvasClient.tsx`, `components/collabboard/canvas/hooks/useCanvasData.ts`, the new source
test, a `useCanvasData` test file. Same rules as before (real tool calls; no git writes, no build, no browser, no curl,
no `.env`, never `cd`, no deletions). Run only the touched/new tests, `components/canvas/TimelineHeaderBar.test.tsx`,
and `npx tsc --noEmit`.

## Commit message (verbatim)
```
fix(board): a timeline asks for its layout once, and only its owner

The layout is saved on the board, which only its owner may change. Every
other visitor was asked again on every visit and could switch a layout
that was never saved. Now only the owner is asked and sees the layout
button; everyone else sees the owner's layout. A saved layout is also no
longer wiped by saving the board settings in the same visit.
```

## Final result (CTO, 2026-10-07, live as the owner)
New Timeline board: asked once; chose Alternating (boards PATCH 204 with `settings.chronoMode`); two reopens and a reload → never asked again, "Layout: Alternating". Test board deleted. The non-owner path (no question, no layout button, saved or horizontal layout) is covered by the source test only: only one account is signed in to the live browser. Gate `.opencode-vitest-307.json`: 26 baseline + 2 AntV renderer files that pass alone (load timeouts); tsc clean.
