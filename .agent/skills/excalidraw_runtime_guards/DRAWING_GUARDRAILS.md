# DRAWING_GUARDRAILS.md

These rules apply ONLY to the drawing canvas system:
- Excalidraw integration
- DrawingLayout
- runtime slideshow
- presentation / slide mode
- drawing toolbar / positioning
- drawing embeddables

Load this file before any drawing-related task.

---

## LOADER

Use this at the top of every drawing-related coder prompt:

LOAD SKILL: .agent/skills/excalidraw_runtime_guards/DRAWING_GUARDRAILS.md (MANDATORY)

---

## 1. SYSTEM SEPARATION

### Freeform
- uses `metadata.zIndex`
- uses DOM layering
- uses React render order

### Drawing
- uses Excalidraw scene order ONLY
- does NOT use `metadata.zIndex`
- does NOT use DOM z-index logic

Do NOT mix these systems.

---

## 2. EXCALIDRAW EMBEDDABLES

Padlets in Drawing are Excalidraw embeddables.

Identify them with:
- `el.type === "embeddable"`
- `el.link === "padlet://<id>"`

Ordering source of truth:
- `scene.elements` array order only

Do NOT:
- reorder DOM for Drawing
- inject `metadata.zIndex` into Drawing
- modify Excalidraw internals

---

## 3. TOP FLOATING BUTTON CLUSTER (CRITICAL)

Do NOT modify anything related to the top floating button cluster unless the task is explicitly about that cluster.

Includes:
- `rightClusterLeftPx`
- measurement loops (`useLayoutEffect` / `useEffect`)
- `.Island.App-toolbar` querying
- portal rendering
- anchor resolution (`rightClusterAnchorEl`, `drawingRootRef`)
- opacity / visibility logic
- z-index / stacking

Reason:
- async + DOM-timing dependent
- already caused repeated regressions
- small unrelated changes can break visibility or positioning

If your change touches this area unintentionally:
- STOP
- report instead of proceeding

---

## 4. FREEFORM DOM STRUCTURE (CRITICAL)

Do NOT change DOM hierarchy of `FreeformPadletCards`.

Includes:
- no wrapper extraction
- no element reordering
- no layout ownership changes

Reason:
- drag / zoom / position logic depends on exact DOM structure

---

## 5. DRAWING RUNTIME vs EXPORT SPLIT

There are two separate pipelines:

### Runtime slideshow
- live DOM + Excalidraw PNG layers

### Export/static
- separate flattened renderer
- thumbnails
- static preview
- PDF
- PPTX

Do NOT:
- merge runtime and export paths
- reuse export cards as runtime cards by default
- introduce cross-dependencies unless explicitly requested

---

## 6. RUNTIME RENDERING SAFETY

High-risk runtime files:
- `RuntimeSlideRenderer`
- `RuntimePadletLayer`
- `DrawingLayout`
- slide export/render helpers

Rules:
- avoid repeated async render cycles
- avoid recreating object identities unnecessarily
- avoid mount-time render churn
- preserve stale-result guards
- do not blank visible layers before replacements are ready unless the task explicitly requires it

If touching:
- async rendering
- portals
- layering
- slideshow paint order
- measured layout
- initial viewport restore / first paint timing

Treat as HIGH RISK.
Use the smallest safe patch only.

---

## 7. TOOLBAR / POSITIONING DEBUG RULES

Before changing any toolbar or positioning logic, verify with runtime proof:

- `getBoundingClientRect()`
- viewport vs canvas coordinates
- portal target correctness
- parent flex vs absolute behavior
- viewport resize behavior
- devtools docking impact

Do NOT:
- hardcode offsets blindly
- assume timing
- patch without checking real DOM boxes

---

## 8. EVENT BRIDGE RULES

Back-plane lines do NOT receive events directly.

They MUST go through the DrawingLayout bridge.

Bridge responsibilities:
- `mousedown`
- `click`
- `contextmenu`
- `dblclick`

Bridge must bail if:
- `tool !== selection`
- `target !== canvas.excalidraw__canvas`
- no back target found

Do NOT bypass this bridge.

---

## 9. DRAWING DEBUG RULES

Always verify before changing:
- log `event.target`
- log `elementsFromPoint()`
- confirm which layer handles event

Never assume:
- DOM z-index has no effect in Drawing ordering
- scene order controls everything

If interaction fails, check:
1. Did bridge run?
2. Did guard pass?
3. Did lookup find target?
4. Did redispatch happen?
5. Did target handler fire?

If ordering fails, check:
1. embeddable found?
2. reorderElements applied?
3. updateScene called?
4. commitToHistory true?
5. autosave persisted?

If UI shifts, check:
- parent flex vs absolute
- viewport resize
- devtools docking impact

---

## 10. REGRESSION CHECKLIST

### Line interaction
- [ ] left click selects line
- [ ] right click opens correct menu
- [ ] double click enters edit mode
- [ ] edit handles appear
- [ ] bend handles draggable

### Back-line bridge
- [ ] mousedown routed
- [ ] click routed
- [ ] contextmenu routed
- [ ] dblclick routed
- [ ] empty canvas does NOT trigger edit

### Ordering
- [ ] send to back works
- [ ] bring to front works
- [ ] forward/backward works
- [ ] hit-testing follows visual order

### Containers
- [ ] drag still works
- [ ] resize still works
- [ ] child editing still works

### Slide / presentation mode
- [ ] Excalidraw elements included
- [ ] embeddable padlets included
- [ ] ordering preserved

### Toolbar
- [ ] right toolbar stays fixed on resize
- [ ] left toolbar items usable
- [ ] no overlap with canvas

### Safety
- [ ] Freeform unchanged
- [ ] no console errors

---

## 11. SLIDE / PRESENTATION RULES

Custom padlets in Drawing slides are tied to embeddables.

Before patching slide behavior:
1. locate presentation element collection logic
2. confirm whether embeddables are included/excluded
3. log elements passed into presentation
4. verify frame traversal logic
5. verify whether `type === "embeddable"` is filtered out

Do NOT implement slide changes from architecture assumptions alone.
Audit first.

### Editor vs slideshow stop-check

Before changing any runtime/presentation file for a visual flash:
- first confirm whether the bug happens in the editor page or only in fullscreen slideshow
- if the bug is visible on the editor canvas at `dashboard/canvas/[id]`, audit editor card renderers first
- do NOT patch `RuntimeSlideRenderer` / `RuntimePadletLayer` for an editor-only card flash

Known separate editor-path pitfall:
- the whole drawing canvas can flash or appear to jump if Excalidraw first-paints before saved viewport state settles
- this is a `DrawingLayout` startup / viewport-restore issue, not automatically a card renderer issue
- if saved `drawingAppState` exists, audit `initialData.appState`, `scrollToContent`, and first-paint visibility timing before touching card content or slideshow code

Known pitfall:
- clipart / SVG cards on the editor page can flash their `iconBgColor` before the SVG image loads
- this is an editor card-rendering issue, not automatically a slideshow/runtime-layer issue
- likely audit targets include editor card renderers such as `PostCardContent` before presentation runtime files

For any flash report:
1. reproduce on the exact surface the user names
2. verify whether the flashing node is an editor card, slideshow padlet layer, or Excalidraw/export layer
3. patch the owning renderer only
4. if the whole editor canvas shifts from near top-of-viewport into place after reload, treat it as viewport restore first

### Saved viewport restore rules

If the bug is an editor hard-refresh flash / snap / jump:
- first inspect whether saved `drawingAppState.scrollX`, `scrollY`, and `zoom` are being restored
- do NOT leave `scrollToContent: true` enabled during init when saved viewport state exists
- prefer a one-time first-mount reveal gate on the Excalidraw surface over repeated delays
- the gate must resolve once and stay resolved
- keep the top floating button cluster and zoom controls hidden until the same reveal gate settles if they depend on the same root timing

Do NOT:
- reintroduce unconditional init auto-fit when saved viewport exists
- move this fix into slideshow runtime files
- treat a whole-canvas viewport snap as a clipart-only bug

---

## 12. RUNTIME TOOLBAR POSITION NOTE

Stable anchor path for the custom top-right cluster must stay inside Excalidraw-owned DOM, not app-shell or CanvasViewport containers.

If toolbar positioning regresses:
- verify live DOM boxes first
- do not change anchor or offset assumptions blindly

Known runtime note:
- measured `left` position is required
- closed and presentation-open layouts can need different visual targets

---

## 13. GENERAL STOP CONDITIONS

If a change affects any of these unexpectedly:
- toolbar visibility
- toolbar positioning
- drag / zoom
- slideshow rendering order
- runtime/export separation
- drawing event bridge
- scene-order behavior

Then:
- STOP
- report instead of continuing

---

## 14. DEFAULT WORKING STYLE FOR DRAWING TASKS

For any drawing-related task:
1. audit first
2. identify one exact cause
3. patch the smallest safe surface
4. validate in browser
5. run regression checklist

Never jump straight to broad refactors.
