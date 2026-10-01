# PATCH-235 — "Visualize" on a note or document: straight into Show options, placed and linked next to it

Status: AUTHORIZED (owner, 2026-10-01: "ok go" — next step after PATCH-234: Visualize from existing text).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-234 (`5262bbd4`)

## Why (CTO)
Napkin's core gesture is "this text → show me pictures". Today a user must open AI → Diagram → Show options and
paste the text. The text is usually already on the board, in a Note or a Document post. The CTO chose the post's
right-click menu as the entry (it is where post actions already live and needs no new editing state). The new
picture should land NEXT TO its source, and — on boards with the graph enabled — be joined to it by a graph line,
so the board shows where the picture came from.

## Design
### 1. Menu item
- `components/collabboard/menus/NotePostContextMenu.tsx`: new optional prop `onVisualize?: () => void`; when
  passed, a **"Visualize…"** item (Sparkles icon, like the AI tool) appears right after "Edit Post" (inside the same
  group). Nothing else in the menu changes.
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx` (the generic `NotePostContextMenu` call, ~5264):
  pass `onVisualize` ONLY for the Note and Document post types (confirm their stored `padlet.type` values and say
  which), ONLY when `canUseFreeformEditButton`, and ONLY when the post's plain text has at least 20 characters.
  It calls a new prop `onVisualizePost?: (padlet: Padlet) => void` from CanvasClient.

### 2. Plain text from a post
- New pure `lib/ai/visualizeSource.ts`: `visualizeSourceText(padlet): string` — the post's title (if meaningful)
  plus its body converted to plain text (reuse an existing HTML→text helper in the repo if one exists — search
  first and say which; otherwise a small DOMParser-free implementation: drop tags, decode the common entities,
  turn block ends into newlines, collapse blank runs), trimmed to 4000 characters at a word boundary.

### 3. Opening the generator
- `app/dashboard/canvas/[id]/CanvasClient.tsx`: `handleVisualizePost(padlet)` sets the same AI-component draft the
  toolbar sets (`case 'ai-component'`, ~8761-8778), plus:
  - `metadata.aiPrompt` = `visualizeSourceText(padlet)` (so the editor's prompt is prefilled through the existing
    `initialPrompt` path);
  - a CanvasClient state `visualizeRequest = { sourceId, x, y }` where `x = source.position_x + sourceWidth + 80`,
    `y = source.position_y` (source width from `padlet.width`, falling back to the measured card width or 320);
  - opens the editor.
- `components/collabboard/canvas/ui/CanvasModals.tsx` passes a new prop `initialVisualize={!!visualizeRequest}` to
  `AIComponentEditor`.
- `AIComponentEditor.tsx`: when `initialVisualize` is true on open: mode = Diagram, subtype = Show options, and
  Generate runs ONCE automatically (the user asked for pictures; one AI call). Regenerate, option picking and
  Save behave as today. Closing clears it.

### 4. Placing and linking the result
- `hooks/canvas/usePadletSave.ts` `saveAIComponent`: for a NEW ai-component, if an optional
  `placement?: { x: number; y: number }` is supplied (new optional parameter; CanvasClient passes it from
  `visualizeRequest`), use it instead of `newPostPosition(500, 400)` (still through `roundPostGeometry`). Everything
  else unchanged; no new stored fields.
- After a successful insert from a Visualize request, CanvasClient (not the save hook) — only when
  `isFreeformGraphMode` — creates one graph edge source → new post via `createFreeformGraphRepo(canvasId).upsertEdge`
  (solid, forward, grey `#9ca3af`, the PATCH-227 shape) and bumps `graphRefreshToken`. A failure here only logs and
  toasts "The picture was added, but the link line could not be drawn."; it never undoes the post.
- `visualizeRequest` is cleared on save, on cancel and on close.

## Tests
- `lib/ai/visualizeSource.test.ts`: HTML note → plain text with line breaks; entities decoded; 4000-char trim at a
  word boundary; empty/short content → the caller's 20-char rule can see it.
- `NotePostContextMenu`: "Visualize…" appears after "Edit Post" only with the prop, and calls it.
- Wiring (source test in `lib/infra/canvas/`): FreeformPadletCards passes `onVisualize` only for the two types, edit
  permission and the 20-char rule; CanvasClient's handler sets `aiPrompt`, the placement and opens the editor; the
  edge creation is gated on `isFreeformGraphMode`.
- `AIComponentEditor`: with `initialVisualize`, it opens in Diagram + Show options with the prompt and calls
  `/api/ai/generate-outline` exactly once; without it, nothing auto-runs (existing tests stay green).
- `usePadletSave`: a new ai-component with `placement` inserts at it; without, at `newPostPosition`.
- **Mutations:** drop the auto-run guard (run on every render) → the "exactly once" test fails; ignore `placement`
  → the placement test fails.

## Allowed files
```
lib/ai/visualizeSource.ts (+ test)                                              (new)
components/collabboard/menus/NotePostContextMenu.tsx (+ its test)
components/collabboard/canvas/ui/FreeformPadletCards.tsx     (the onVisualize prop at the NotePostContextMenu call + the new prop)
components/collabboard/canvas/ui/CanvasModals.tsx            (the initialVisualize prop only)
components/collabboard/editors/AIComponentEditor.tsx (+ its tests)
app/dashboard/canvas/[id]/CanvasClient.tsx                   (handleVisualizePost, visualizeRequest, the edge after save, prop wiring)
hooks/canvas/usePadletSave.ts (+ its test)                   (the optional placement only)
lib/infra/canvas/*.source.test.ts                            (wiring pins)
```
Forbidden: the database, `package.json`, the AI routes, the renderers, `GraphConnectHandle.tsx`. **Do not touch the
comments inside `isBlockingEditorModalOpen`.** If a census pins the NotePostContextMenu item order, the CanvasModals
AIComponentEditor props, or `saveAIComponent`'s signature, STOP and ask. Every new test path must be collected by
`vitest.config.ts` (check; STOP if not).
Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/collabboard/editors components/collabboard/menus hooks/canvas lib/infra/canvas components/collabboard/freeformHideFrame components/collabboard/freeformPostContextMenus
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-235.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** the CTO creates a test Note with a paragraph, right-clicks → Visualize… → Show options opens and
generates once → picks one → Save: the picture lands to the right of the note, joined by a grey graph line. The
CTO then deletes the test note, the picture and the line.

## Commit message (verbatim)
```
feat(ai): "Visualize…" turns a note or document into pictures

Right-click a Note or Document and choose Visualize…: the AI generator
opens in Show options with the post's text and draws the options at
once. The chosen picture is placed to the right of its source and, on
graph boards, joined to it by a line.
```

## Addendum 1 (CTO): keep the knowledgeSourceAiWiring census; do NOT put `aiPrompt` in CanvasClient
The census bans the literal `aiPrompt` in CanvasClient on purpose; do not edit it and do not hide the literal
behind a helper. Instead: `visualizeRequest` becomes `{ sourceId, x, y, prompt }` (`prompt = visualizeSourceText(padlet)`),
the draft carries NO `aiPrompt` (empty metadata as the toolbar draft does), and CanvasModals gets one more new
optional prop `visualizePrompt?: string` (CanvasClient passes `visualizeRequest?.prompt`), used ONLY on the
AIComponentEditor call that also receives `initialVisualize`: `initialPrompt={visualizePrompt || padletToEdit?.metadata?.aiPrompt || ''}`.
The other two `initialPrompt` lines stay unchanged. Update the wiring pin accordingly. Continue with the rest of the spec.

## Addendum 2 (CTO, live result + three fixes)
Live: right-click a test Note → "Visualize…" (right after Edit Post) → Show options opened with the text and made
exactly ONE `generate-outline` call → 4 options (Mind map, Comparison, Flow, Timeline) → Save to Canvas inserted the
post and ONE grey edge source→picture (POST 201). Deleting the posts removed the edge. Three defects:
1. **"New Note" went into the prompt.** `visualizeSourceText` uses its own placeholder list. Replace
   `meaningfulTitle` with the shared `getMeaningfulTitle(padlet.title, padlet.type)` from
   `lib/infra/collabboard/postTitle.ts` (it already treats "New Note"/"New Post"/"Untitled"/type names as
   placeholders); the function's input type becomes `Pick<Padlet, 'title' | 'content' | 'type'>`. Test: a Note
   titled "New Note" yields only the body.
2. **The gap is too wide.** The stored `padlet.width` (e.g. 280) is wider than the visible card (180). In
   `handleVisualizePost` use the source wrapper's layout width first:
   `document.querySelector('[data-padlet-id="<id>"]')?.offsetWidth` (offsetWidth is unscaled, so it is world
   units), then `padlet.width`, then 320. Same for height (offsetHeight, then `padlet.height`, then 200) — needed by 3.
3. **The picture lands on top of other posts.** New pure helper `lib/ai/visualizePlacement.ts`:
   `findVisualizeSpot({ source: {x,y,width,height}, size: {width: 500, height: 400}, others: Array<{x,y,width,height}>, gap = 80, margin = 24 }): {x,y}`.
   Candidates in order: to the RIGHT of the source (x = source.x + source.width + gap) at y = source.y, then the
   same x at y + 60, y + 120 … (up to 15 steps), then to the LEFT (x = source.x - gap - size.width) with the same
   y steps, then BELOW the source (y = source.y + source.height + gap, x = source.x). The first candidate whose
   rect, grown by `margin`, intersects none of `others` wins; if none is free, the first candidate (right, same y).
   `others` = every padlet on the board except the source, with x/y from `position_x/position_y` and size from
   `width/height` (fallback 320×200). CanvasClient passes the result as the placement. Tests: free right side →
   right at the same y; right side blocked at y → the next free step down; right blocked at every step → left;
   everything blocked → the first candidate; margin respected. Mutation: ignore `others` → the blocked test fails.
Allowed additionally: `lib/ai/visualizePlacement.ts` (+ test). Re-run the verification and the full gate.

## Addendum 3 (CTO, 2026-10-01): live result after Addendum 2
Right-click a test Note → Visualize… → the prompt starts with the note's text (no "New Note") → ONE `generate-outline`
call, 4 options → Save: the picture landed 80 world units to the right of the VISIBLE card, stepped down to the first
free spot (no overlap with the crowded neighbours), and one grey edge joined note → picture (POST 201). The CTO's
test note `52614438`, picture `f9be7ec2` and its edge were deleted (DELETE 204; the edge went with the posts); the
owner's 5 lines untouched. Earlier run's test objects (`3c6b89b4`, `756e638c`, edge `03f1f3a1`) also deleted.
Gate `.opencode-vitest-235b.json`: extra [] missing []; tsc clean; every new test file ran.
