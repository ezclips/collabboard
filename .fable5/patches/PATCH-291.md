# PATCH-291 — Drawing library button next to the toolbar; no black hover; "Diagrams"; no dead Browse link

Status: AUTHORIZED (owner, 2026-10-06: "The browse library in the drawing post goes to 404. Change the title 'the
Canvas Library' to 'Diagramms'. Change the icon to the library icon we use in the drawing canvas without the black
mouse over (we need to go and change the 4 buttons in excalidraw extra menu for the drawing canvas!!) and move the
library button in the drawing post over to the left … in the same general area as the 4 buttons in drawing canvas").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO-verified live, board 0c65aa8e = Drawing canvas, board af02972f = Freeform with drawing posts)
1. **Black hover — root cause.** The Drawing canvas's 4-button cluster (`DrawingLayout.tsx` ~L4391–4440: Add Comment,
   Open Library, Present Frames, Insert Mermaid) uses Tailwind `hover:bg-gray-100`. Tailwind v4 compiles that to
   `var(--color-gray-100)`, and the cluster is portalled INSIDE the Excalidraw container, where Excalidraw's own theme
   (`excalidraw_fork/.../css/theme.scss` L103) defines `--color-gray-100: #121212`. Measured: on the button the
   variable is `#121212`, on `<body>` it is Tailwind's light grey; hover background `rgb(18,18,18)`.
   `--color-blue-100` is not redefined by Excalidraw (the active state is fine).
2. **404.** Excalidraw's "Browse libraries" link is `${import.meta.env.VITE_APP_LIBRARY_URL}?target=…`
   (`LibraryMenuBrowseButton.tsx`). The fork's `.env.*` files are empty by design (`build-excalidraw-fork.mjs`), so the
   link is `undefined?target=…` → 404, on every surface that shows Excalidraw's library sidebar.
3. **Title.** `excalidraw_fork/packages/excalidraw/locales/en.json` L128 `"excalidrawLib": "the Canvas Library"` (this
   fork already renamed it once).
4. **Drawing post library button.** The drawing post (`DrawingEditor.tsx` → `ExcalidrawWrapper.tsx`) shows
   Excalidraw's default sidebar trigger top-right (`.default-sidebar-trigger`); the sidebar holds the AntV diagrams.
   The Drawing canvas instead has its own cluster right of the stock toolbar (`.Island.App-toolbar`), positioned by
   `DrawingLayout`'s `updatePosition` (L1917ff), and its "Open Library" opens our own `LibraryPanel`.
5. `api.toggleSidebar({ name })` exists on the Excalidraw API (`types.ts` L909); `appState.openSidebar` tells which is
   open.

## Design
1. **No black hover on the 4 buttons (Drawing canvas).** In `DrawingLayout.tsx` replace the Tailwind palette
   classes of those 4 buttons by literal colours that no theme variable can redirect: idle `text-[#374151]
   hover:bg-[#f1f0ff]` (Excalidraw's own button hover, so it matches the stock toolbar), active `bg-[#dbeafe]
   text-[#1d4ed8]`. Same for the cluster's dividers if they use a palette var that Excalidraw redefines (`bg-gray-200`:
   check `--color-gray-200` in theme.scss — if redefined, use `bg-[#e5e7eb]`). Net line growth in `DrawingLayout.tsx`
   = 0 (class strings only). List every other Tailwind `gray-*` class rendered INSIDE the Excalidraw container in
   `DrawingLayout.tsx` and `ExcalidrawWrapper.tsx` in the report (do not change them in this patch unless they are on
   these 4 buttons).
2. **Drawing post: our own library button next to the toolbar.** New
   `components/collabboard/editors/LibraryToolbarButton.tsx` (≤ 150 lines): a white box (`rounded-lg`, 1 px `#e5e7eb`
   border, shadow, `p-1`) with ONE button: lucide `Library` icon size 18, `title`/`aria-label` "Open library",
   `data-drawing-library-button`, colours exactly as in 1, active (`aria-pressed=true`, active colours) while
   `appState.openSidebar?.name === 'default'` (subscribe with `api.onChange`). Click → `api.toggleSidebar({ name:
   'default' })`. Position: `position:absolute` inside the wrapper root, vertically aligned with `.Island.App-toolbar`
   (same top and height centre), left = toolbar's right edge + 12 px, recomputed on `ResizeObserver` (root + toolbar)
   and window resize; hidden (`visibility:hidden`) until measured; if the toolbar is missing, retry briefly, never
   throw. Read-only → not rendered.
   `ExcalidrawWrapper.tsx` gets a prop `libraryButton?: 'toolbar' | 'default'` (default `'default'` = today). With
   `'toolbar'` it renders `LibraryToolbarButton` and hides Excalidraw's own trigger with a CSS rule scoped to the
   wrapper root (`[data-library-button="toolbar"] .default-sidebar-trigger { display: none }`). `DrawingEditor.tsx`
   passes `libraryButton="toolbar"` on an EXISTING line of the `<ExcalidrawWrapper …>` element (net growth 0; the file
   is over the ceiling).
3. **No dead Browse link.** The wrapper hides Excalidraw's `.library-menu-browse-button` on every surface (CSS scoped
   to the wrapper root). Importing from libraries.excalidraw.com would need the `#addLibrary` return flow, which this
   app does not handle — out of scope; record it in the report.
4. **Title.** `en.json` `"excalidrawLib": "Diagrams"` (English spelling of the owner's "Diagramms"). The CTO rebuilds
   the fork (`npm run build:fork`) after the patch — the coder does not build.
5. **Kit.** `scripts/live/kit.mjs` `openLibrary` / `closeLibrary`: use `[data-drawing-library-button]` when present,
   else the old `.sidebar-trigger`. Keep its tests green; add one for the selector preference if testable.

## Tests
- `LibraryToolbarButton`: renders the Library icon button with the literal colour classes (no `gray-100` /
  `blue-100` palette classes); click calls `toggleSidebar({ name: 'default' })` once; `aria-pressed` follows
  `openSidebar`; positioned at toolbar right + 12 px (stub rects); hidden until measured; not rendered read-only.
- Wrapper: `libraryButton="toolbar"` renders the button and the hiding rule; default renders neither; the Browse
  button hiding rule is present in both modes.
- Source test: the 4 Drawing-canvas cluster buttons contain no `hover:bg-gray-100` / `text-gray-700`; they contain
  `hover:bg-[#f1f0ff]`.
- Locale: `en.json` `excalidrawLib` is "Diagrams".
- Mutation: put `hover:bg-gray-100` back on one cluster button → the source test fails.

## Allowed files
```
components/collabboard/canvas/layouts/DrawingLayout.tsx        class strings of the 4-button cluster only, net 0
components/collabboard/editors/ExcalidrawWrapper.tsx            prop + render + scoped CSS, <= +20
components/collabboard/editors/DrawingEditor.tsx                one prop on an existing line, net 0
components/collabboard/editors/LibraryToolbarButton.tsx (+ test)    new
components/collabboard/canvas/excalidraw_fork/packages/excalidraw/locales/en.json   excalidrawLib only
scripts/live/kit.mjs (+ test)                                  openLibrary/closeLibrary selector
tests for the above (new or existing files next to them)
```
Forbidden: everything else, other fork files, the database. Do not run `npm run build:fork`.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server, no browser.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/editors scripts/live --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-291.json
```
Do not commit.

**Live (CTO, through `scripts/live/kit.mjs`):** rebuild the fork; Drawing canvas board: hovering each of the 4 buttons
gives `#f1f0ff`, never black. Drawing post: the Library button sits right of the toolbar, its hover is light, it
opens/closes the library sidebar, the old top-right trigger is gone, the section reads "Diagrams", there is no
"Browse libraries" button; inserting a diagram still works.

## Commit message (verbatim)
```
fix(drawing): library button beside the toolbar and no black hover

The drawing post's library button now sits next to the drawing toolbar
with the same icon as the drawing canvas, the drawing canvas's toolbar
buttons no longer turn black on hover, the library section is called
Diagrams, and the broken Browse libraries link is gone.
```

## Addendum 1 (CTO, 2026-10-06, live after `npm run build:fork`)
Live (kit, own tab): Drawing post — the Library button sits right of the toolbar (toolbar right 1276, button 1293,
same vertical centre 147), the old top-right trigger is hidden, idle transparent, hover `rgb(241,240,255)`.
**Defect:** clicking it sets `aria-pressed=true` and mounts a sidebar, but the sidebar shows NO library items
(`.library-unit` count 0) — `toggleSidebar({ name: 'default' })` opens the default sidebar without a tab.
Excalidraw's own trigger opens it on the library tab. Fix: `toggleSidebar({ name: 'default', tab: 'library' })`
(`LIBRARY_SIDEBAR_TAB` = "library", `DEFAULT_SIDEBAR.defaultTab`), and the active state = `openSidebar?.name ===
'default'` (any tab). Test the call arguments.
**Kit:** `openBoard` uses Playwright's default 30 s `goto` timeout — the first load after a fork rebuild takes longer
(dev recompiles). Use `timeout: 240000` for the `goto` in `openBoard` (the CTO's earlier scripts did). Test that the
option is passed (fake page). Gate `--outputFile=.opencode-vitest-291a.json`.

## Final result (CTO, 2026-10-06, live after rebuilding the fork)
Kit run, own tab, no saves. Drawing post (board af02972f): Library button right of the toolbar (toolbar right 1276,
button 1293, same centre 147), old top-right trigger hidden, idle transparent, hover `rgb(241,240,255)`; click opens
the library sidebar on the library tab (`aria-pressed=true`), sections "Personal Library" and "Diagrams", no
"Browse libraries" button; inserting the first diagram works (Edit values offered). Drawing canvas (board 0c65aa8e):
hover on Add Comment, Open Library, Present Frames, Insert Mermaid Diagram = `rgb(241,240,255)` each (was
`rgb(18,18,18)`). Gate `.opencode-vitest-291a.json`: 59/59 identical to 290d by name; tsc clean. DrawingLayout.tsx
and DrawingEditor.tsx net 0; wrapper +19. Follow-up (coder report): `vitest.config.ts` does not include
`components/collabboard/canvas/layouts/*.test.*`, so tests placed next to DrawingLayout are silently not run.
