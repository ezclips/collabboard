# PATCH-346 — Modern header for the reader's Library / AI panel

## Why
Owner, 2026-10-12, with a screenshot of the PDF reader's right panel: "I am not
so happy with this layout on top of the Library and the same for AI, can't we
design it modern". Owner picked the "file card + tabs" design from two mockups.

Today the panel stacks three layers of chrome (`KnowledgeSourceReaderDrawer.tsx`
~L1213–1245, plus the embedded chat's own header in `BoardAiChatDrawer.tsx`
~L1637):
1. a blue text link "← Back to PDFs", the filename, "1 page", the full
   "Used in Notes" list (grows with every note), then a bare "Library" / "AI"
   label;
2. in AI mode the chat's own row: model chooser, New chat, and a **second X**
   (the reader's top bar already has one).
The Library tab already lists the same Notes under its own "Notes" section
(`PdfWorkspaceLibraryPanel.tsx` ~L358), so the header list is a duplicate.

## Design (target)
```
 ‹                                   ← icon button, aria-label "Back to PDFs" / "Close"
 ┌────┐ Audi_A2_tire_big.pdf         ← file card
 │PDF │ 1 page · used in 1 note
 └────┘
 ╭──────────────┬───────────────╮
 │   Library    │ ███ ✦ AI ████ │    ← segmented switch
 ╰──────────────┴───────────────╯
 ─────────────────────────────────
 Claude ▾                     ⊕      ← AI only: chooser + New chat, no X
```

### 1. New component `components/collabboard/KnowledgeReaderPanelHeader.tsx`
Extract the header out of `KnowledgeSourceReaderDrawer.tsx` (1,300 lines, over
the ceiling — it must shrink). Props: `filename`, `kind` (pdf | transcript |
text, for the badge and the back label), `pageSummary: string | null`,
`noteCount: number`, `panel: 'library' | 'ai'`, `aiAvailable: boolean`,
`onBack`, `onSelectPanel(panel)`.
- **Back**: a small icon button (lucide `ChevronLeft`, 16px, rounded,
  `hover:bg-gray-100`), `aria-label` and `title` "Back to PDFs" (transcript:
  "Close"). Keep `data-knowledge-library-back="true"` on it.
- **File card**: a row with a 36×36 rounded-lg badge (`bg-red-50 text-red-600`
  with "PDF" for a PDF; `bg-blue-50 text-blue-600` + lucide `FileText` for a
  text/transcript document) and beside it the filename (`text-sm font-semibold
  text-gray-900 truncate`, full name in `title`, keep
  `data-knowledge-library-filename`) and a meta line (`text-xs text-gray-500`):
  `pageSummary` and, when `noteCount > 0`, " · used in N note(s)". Keep
  `data-knowledge-library-pagecount` on the page-summary span. The "used in"
  part is a button that switches to the Library tab
  (`data-knowledge-library-note-count`).
- **Segmented switch**: full width, `rounded-lg bg-gray-100 p-0.5`, two equal
  buttons; the active one `bg-white shadow-sm text-gray-900 font-medium`, the
  other `text-gray-500 hover:text-gray-800`. Labels "Library" (lucide
  `Library` icon) and "AI" (lucide `Sparkles` icon). `role="tablist"` /
  `role="tab"` with `aria-selected`. The AI tab is not rendered when
  `!aiAvailable`. Keep `data-knowledge-reader-panel-title` on the switch with
  the active panel's name as its value, so existing tests can still read which
  panel is shown (update those tests' text assertions as needed).
- Header container: `px-4 pt-3 pb-3 space-y-3 border-b border-gray-100`.
- The **Used in Notes list is removed from the header** (the Library tab's
  Notes section already lists them). The count stays in the meta line.

### 2. `KnowledgeSourceReaderDrawer.tsx`
Replace the inline `<header>` with `<KnowledgeReaderPanelHeader>`; tabs call
`setSidePanelRightPanel`. The top-bar dock icons keep working exactly as now
(they open/close/switch; the switch mirrors the same state). Net line count of
this file must go DOWN.

### 3. `BoardAiChatDrawer.tsx` — embedded only, ~3 lines
When `presentation === 'embedded'`, do not render the header's Close (X)
button: the reader's top bar owns closing, and two X's in one column is the
duplicate the owner saw. The standalone board drawer keeps its X unchanged.
Model chooser and New chat stay; header padding unchanged.

### 4. Not in scope
The reader's top bar, the PDF pane, the Library panel's content and filters,
and the chat body are unchanged. No colour tokens beyond Tailwind's
gray/red/blue already used in these files.

## Tests
- `KnowledgeReaderPanelHeader.test.tsx`: PDF badge vs text badge; filename +
  title; meta line with and without notes ("1 note" / "3 notes"); note-count
  button calls `onSelectPanel('library')`; tabs: aria-selected, click calls
  `onSelectPanel`, no AI tab when `aiAvailable` is false; back button label
  "Back to PDFs" vs "Close" and calls `onBack`.
- Reader drawer tests (`KnowledgeSourceReaderDrawer.test.tsx`,
  `knowledgeReaderWorkspace.test.tsx`): update to the new header; assert the
  header no longer renders `data-knowledge-used-in-notes="document"`; the
  Library tab still lists the Notes; switching tabs switches the panel.
- Chat drawer: embedded presentation has no `data-board-ai-chat-action="close"`;
  the standalone drawer still has it.

## Verification
tsc, focused tests, full gate. Live (PM): open a PDF with a linked note in the
reader, screenshot the Library and AI tabs at the docked width and the wide
(`lg`) width; back button closes the reader; the note-count link switches to
Library; one close X in AI mode.

## Allowed files
new `components/collabboard/KnowledgeReaderPanelHeader.tsx` (+ test),
`components/collabboard/KnowledgeSourceReaderDrawer.tsx` (+ its tests),
`components/collabboard/knowledgeReaderWorkspace.test.tsx`,
`components/collabboard/BoardAiChatDrawer.tsx` (embedded close only, + its
test). No SQL, no git.

## Addendum 1 — the same header when the side panel is closed (owner: "yes")
Live check found the second header: with the right panel CLOSED (or with no
backlink target), `KnowledgeDocumentDetails.tsx` (~L1387, `hostRendersDocumentHeader
=== false`) still renders the old blue "← Back to PDFs" link, filename, page
count and the full "Used in Notes" list above the page. Owner approved making
it match.

1. `KnowledgeReaderPanelHeader` gains two optional props:
   - `showPanelSwitch?: boolean` (default true) — false hides the Library | AI
     switch (no panel is open here);
   - `backLabel?: string` — overrides the derived label, so each host keeps
     the label its back action really means (the details pane says "Back to
     PDFs" today; keep it).
2. `KnowledgeDocumentDetails.tsx`: replace the old header block with
   `<KnowledgeReaderPanelHeader showPanelSwitch={false} …>` (filename, kind
   from the document — transcript/text vs PDF — page summary, note count,
   `onBack`). Keep the transcript disclosure line
   (`KNOWLEDGE_TRANSCRIPT_DISCLOSURE`) directly under the header, unchanged.
   The file is 2,011 lines (over the ceiling): it must not grow.
3. The "used in N notes" link here needs somewhere to go. New optional prop
   on `KnowledgeDocumentDetails`: `onOpenLibrary?: () => void`.
   - The reader drawer passes `() => setSidePanelRightPanel('library')` when it
     has a backlink target (the Library panel exists) — the link opens it.
   - With NO `onOpenLibrary` (no Library panel anywhere), keep the existing
     `UsedInNotes` list rendered under the header exactly as today, so those
     Notes stay reachable; the meta line then shows the count as plain text.
4. Keep the existing data hooks the tests use (`data-knowledge-library-*` come
   from the shared header; any details-specific hooks stay on equivalent
   elements).
Tests: details pane with the panel closed renders the shared header without a
tab switch; note-count link calls `onOpenLibrary`; without `onOpenLibrary` the
`UsedInNotes` list is still rendered; transcript disclosure still shown;
existing details/reader tests updated, not deleted.
Allowed files (added): `components/collabboard/KnowledgeDocumentDetails.tsx`
and its tests, plus the PATCH-346 files.

## Addendum 2 — one panel toggle instead of two dock icons (owner)
Owner, with a screenshot: "you have the same button twice" — the top bar's
Library and AI icons (`PdfReaderDock`) now duplicate the panel's Library | AI
switch. Owner chose: **one show/hide toggle in the top bar; the switch inside
the panel does the switching.**

`components/collabboard/PdfReaderDock.tsx` (used by both
`KnowledgeSourceReaderDrawer` and `PdfWorkspaceChrome`, so both get it):
- Render ONE button: lucide `PanelRightOpen` while the panel is closed,
  `PanelRightClose` while open; `aria-pressed={panel !== 'closed'}`,
  `aria-label`/`title` "Show side panel" / "Hide side panel";
  `data-pdf-workspace-dock="toggle"`; active styling
  `KNOWLEDGE_CONTROL_ACTIVE_BLUE` while open.
- Click while open → `onPanelChange('closed')`. Click while closed →
  reopen the panel that was open LAST (remember it in a ref whenever `panel`
  is 'library' or 'ai'; default 'library'; if the last one was 'ai' but
  `aiAvailable` is now false → 'library').
- Keep the `PdfReaderPanel` type and props unchanged so callers do not change.
Tests: update every test that clicked `data-pdf-workspace-dock="library"` /
`"ai"` (KnowledgeSourceReaderDrawer.test.tsx, PdfWorkspaceChrome.test.tsx,
knowledgeReaderCitationForwarding.test.tsx, knowledgeReaderWorkspace.test.tsx)
to the toggle plus the panel's tab switch (`role="tab"`), keeping what each
test proves. New dock tests: one button; closed→opens last panel; open→closes;
remembers 'ai'; falls back to 'library' without AI.
Allowed files (added): `PdfReaderDock.tsx`, the four test files above.

## Addendum 3 — the full-screen workspace needs the switch too (PM review)
Addendum 2's single toggle removed the only way to change panels in the
FULL-SCREEN workspace: `PdfWorkspaceChrome.tsx` (~L293) renders a title-only
header ("Library"/"AI" + filename + its own X), no switch. Regression — fix:
1. Extract the segmented switch from `KnowledgeReaderPanelHeader.tsx` into an
   exported `KnowledgeReaderPanelSwitch` (same file; props `panel`,
   `aiAvailable`, `onSelectPanel`; same markup, `role="tablist"`,
   `data-knowledge-reader-panel-title`). The header uses it — no behaviour
   change there.
2. `PdfWorkspaceChrome.tsx` panel header: replace the "Library"/"AI" title
   with `<KnowledgeReaderPanelSwitch>` (wired to `rightPanel` /
   `onRightPanelChange`, `aiAvailable` as the dock gets it); keep the filename
   line under it (`data-pdf-workspace-panel-document`); REMOVE the panel's own
   X (`data-pdf-workspace-panel-close`) — the top-bar toggle closes the panel,
   and two closing buttons is the duplication the owner rejected. Keep the
   aside's aria-label. The file must not grow beyond a few lines.
Tests: workspace panel shows the switch, switching calls `onRightPanelChange`,
no AI tab without AI, no panel X; tests that used `data-pdf-workspace-panel-close`
close via the toggle instead.
Allowed files (added): `PdfWorkspaceChrome.tsx` (+ test),
`KnowledgeReaderPanelHeader.tsx` (+ test).

## Addendum 4 — no back row; the top-bar close becomes « (owner)
Owner, with screenshots: the back chevron sits alone on its own row — "too much
empty space for the back arrow. Move the arrow up, maybe use the same icon as
Heptabase just pointing the other way" (Heptabase's panel control is »; the
drawing moves the arrow into the top-right close button's place).
PM finding: the back chevron, the top-bar X ("Close Knowledge reader") and the
"board" tab all call the same `closeReader` — the back button was a duplicate.
1. `KnowledgeReaderPanelHeader.tsx`: REMOVE the back button and its row
   entirely (and the now-unused `onBack` / `backLabel` props and the
   `data-knowledge-library-back` hook). The header starts with the file card.
   Callers (`KnowledgeSourceReaderDrawer.tsx`, `KnowledgeDocumentDetails.tsx`)
   stop passing them; the details pane's `onBack` prop stays if other code
   still needs it, otherwise remove it.
2. `KnowledgeSourceReaderDrawer.tsx` top bar: the close button (~L1143,
   `aria-label="Close Knowledge reader"`) shows lucide `ChevronsLeft` («)
   instead of `X`, same size and button styling, `title="Close reader"`;
   keep the aria-label (tests use it) and `closeReader`.
3. The full-screen workspace's own close (`data-pdf-workspace-close`) is NOT
   changed.
Tests: header has no back control; drawer close button renders the
chevrons icon and still closes; tests that clicked
`data-knowledge-library-back` now close via the top-bar button.
Allowed files: the PATCH-346 files.
