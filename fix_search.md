Excalidraw Search Fix

Problem
- The drawing canvas crashed with `Maximum update depth exceeded`.
- The stack repeatedly pointed into `components/SearchMenu.tsx`.
- The issue was tied to Excalidraw's internal search UI and stale Next.js dev bundles.

Working fix
- Keep the normal Excalidraw UI.
- Disable only Excalidraw search.
- Do not replace the whole menu or toolbar.

Files to patch
- `components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/SearchMenu.tsx`
- `components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/main-menu/DefaultItems.tsx`
- `components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/DefaultSidebar.tsx`
- `components/collabboard/canvas/excalidraw_fork/packages/excalidraw/actions/actionToggleSearchMenu.ts`
- `components/collabboard/canvas/excalidraw_fork/packages/excalidraw/data/restore.ts`

Patch intent
1. `SearchMenu.tsx`
- Return `null` immediately so SearchMenu never mounts.

2. `DefaultItems.tsx`
- Make `MainMenu.DefaultItems.SearchMenu` return `null`.

3. `DefaultSidebar.tsx`
- Remove the search tab from the default sidebar.
- Keep the library tab if needed.

4. `actionToggleSearchMenu.ts`
- Make the action a no-op.
- `Ctrl+F` should not open Excalidraw search.

5. `restore.ts`
- Drop restored sidebar state that tries to reopen the search tab.

Important
- After patching, stop all old Next dev servers.
- Delete `.next`.
- Start a fresh dev server.
- Otherwise stale chunks can keep serving the old SearchMenu code.

Why this approach
- It removes the crashing feature only.
- It keeps the main Excalidraw menu and drawing controls.
- It avoids replacing the whole Excalidraw UI just to suppress search.
