# PATCH-198 — The board wiki and Board AI step aside for the "Add a transcript" dialog

Status: AUTHORIZED (PM decision, 2026-09-27; owner report: "When I have board wiki open and want
to transcribe a new video it stays open, make sure wiki and AI close or stay below the post
editing modal windows").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Read first:
- `app/dashboard/canvas/[id]/CanvasClient.tsx`: `isBlockingEditorModalOpen` (~1218) and its
  comment, `isBlockingOverlayOpen` (~1327), where `BoardAiChatDrawer` / `BoardWikiDrawer` receive
  `blockingEditorOpen` (~11390, ~11413), and the `<FreeformPadletCards` mount (~10476);
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`: `transcriptDialog` state (~578),
  `startTranscriptForPost` (~602) and the `<MediaPostTranscriptDialog` mount (~5388);
- `components/collabboard/MediaPostTranscriptDialog.tsx` (`fixed inset-0 z-[1000]`, renders
  nothing while `url === null`);
- `components/collabboard/canvasLayerStackingBoundary.architecture.test.tsx` and
  `components/collabboard/boardAiChatWiring.test.tsx` (how the flag is pinned today).

---

## 1. Why

The wiki and the Board AI chat sit in the z-[1200] band, above the editor tier's z-[1000], and
step aside through ONE flag, `isBlockingEditorModalOpen`, whenever a blocking editor opens. The
"Add a transcript" dialog is a z-[1000] modal too, but its open state lives inside
`FreeformPadletCards` and never reaches that flag. So with the wiki open, the dialog opens
underneath the wiki (owner's screenshot): half of it is covered, including the transcript box.

The fix follows the pattern the flag's comment already establishes (R6C, R6I-C1): the surface
does not get its own z-index; its open state joins the one flag, so every docked surface (wiki,
chat, Knowledge reader, the toolbar and the launchers) yields to it the same way.

## 2. The design

- `FreeformPadletCards` gains an optional prop
  `onTranscriptDialogOpenChange?: (open: boolean) => void`. It reports `true` when
  `transcriptDialog` becomes non-null and `false` when it returns to null, and `false` on unmount
  if it last reported `true` (so a layout switch cannot leave the board stuck "blocked"). Report
  changes only, not on every render.
- `CanvasClient` keeps `const [isTranscriptDialogOpen, setIsTranscriptDialogOpen] = useState(false)`,
  passes the setter to `<FreeformPadletCards onTranscriptDialogOpenChange=...>`, and adds
  `|| isTranscriptDialogOpen` to `isBlockingEditorModalOpen` (with its dependency), with a
  one-line comment in the style of the R6C / R6I-C1 lines.
- The effect: while the dialog is open the wiki renders nothing (its state, including an unsaved
  draft, is kept, since it already only returns null), the chat goes transparent and inert, and
  both come back when the dialog closes. Nothing is closed or discarded.

### What does not change
- No z-index anywhere. No change to `MediaPostTranscriptDialog`, the drawers, or the transcript
  import itself.

## 3. Tests

- `FreeformPadletCards`: opening the transcript dialog calls the callback with `true`; closing
  it calls it with `false`; unmount while open calls `false`. Put this where the existing
  FreeformPadletCards integration tests mount the component, or a new
  `freeformTranscriptDialogBlocking.test.tsx`.
- `CanvasClient` wiring: the flag includes `isTranscriptDialogOpen`, and the setter is passed to
  `FreeformPadletCards`. Follow the style of the existing source/wiring tests that pin
  `isBlockingEditorModalOpen`.
- **Mutations** (report each):
  1. Drop `|| isTranscriptDialogOpen` from the flag → the wiring test fails.
  2. Never call the callback with `true` → the FreeformPadletCards test fails.

## 4. Allowed files

```
app/dashboard/canvas/[id]/CanvasClient.tsx
components/collabboard/canvas/ui/FreeformPadletCards.tsx
components/collabboard/freeformTranscriptDialogBlocking.test.tsx     (new, or an existing test file)
components/collabboard/boardAiChatWiring.test.tsx or canvasLayerStackingBoundary.architecture.test.tsx
```

Forbidden: the database, migrations, `package.json`, any z-index change, the drawers themselves.
If a census or source test elsewhere pins something this changes, STOP and ask, with the
conflict written out (spec line, code at file:line, proposed resolution).

Every test command is `timeout 600 npx vitest run …`, never bare `npx vitest`. Delete any
temporary diagnostic file before reporting. Never use git stash, reset, restore, checkout, clean,
commit or push. Never run a production build. Make every edit with a real tool call.

## 5. Verification

```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/freeformTranscriptDialogBlocking components/collabboard/boardAiChatWiring components/collabboard/canvasLayerStackingBoundary
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-198.json
```

The failing FILE set must equal the 26-file baseline. Compact report: files changed, tests added,
the output, both mutation results. Do not commit.

**Live (CTO, CDP 9333, own tab):** open the wiki, then "Add transcript" on a video card: the
dialog is fully visible and the wiki gone; close the dialog, and the wiki is back with its page.
Same with the Board AI chat open.

## 6. Commit message (verbatim)

```
fix(canvas): the wiki and Board AI step aside for the transcript dialog

The "Add a transcript" dialog kept its open state inside the freeform
cards, so the one flag every docked surface yields to never saw it, and
an open wiki or chat covered half the dialog. The dialog now reports
itself to that flag; no z-index changes, and nothing is closed or lost.
```
