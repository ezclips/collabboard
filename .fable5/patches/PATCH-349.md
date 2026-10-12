# PATCH-349 — One small button style for the reader's three control groups

## Why
Owner, 2026-10-13: "We have 3 different buttons — make them all the same size
like the top one, small. Library and AI buttons are way too big and the other
too round. Size them down."

The three groups in the PDF reader:
1. top bar show/hide-panel toggle — `KNOWLEDGE_ICON_BUTTON_CLASS`
   (`h-6`, `rounded`, `border border-gray-200`, active
   `KNOWLEDGE_CONTROL_ACTIVE_BLUE`) — **the reference**;
2. Library | AI switch (`KnowledgeReaderPanelSwitch` in
   `KnowledgeReaderPanelHeader.tsx`) — full width, `py-1.5 text-sm`, 14px
   icons, grey track: too big;
3. Notes · Images · Highlights tabs (`PdfWorkspaceLibraryPanel.tsx` ~L329) —
   `rounded-full` pills, solid blue when active: too round, different look.

## Design
1. `components/collabboard/knowledgeReaderControls.ts`: add ONE shared class
   for text buttons that matches the icon button:
   `KNOWLEDGE_TEXT_BUTTON_CLASS = 'inline-flex h-6 shrink-0 items-center gap-1
   rounded border border-gray-200 px-2 text-[11px] font-medium text-gray-600
   hover:bg-gray-50 hover:text-gray-900 focus:outline-none
   focus-visible:ring-2 focus-visible:ring-blue-300'` (reuse the icon
   button's exact border/hover/focus tokens — read them, do not invent new
   ones). Active state = the existing `KNOWLEDGE_CONTROL_ACTIVE_BLUE`.
   Icons inside use `KNOWLEDGE_ICON_SIZE_CLASS`.
2. `KnowledgeReaderPanelSwitch`: two such buttons side by side
   (`flex items-center gap-1`), NOT full width, no grey track, no shadow.
   Library (`Library` icon) and AI (`Sparkles` icon). Keep `role="tablist"`,
   `role="tab"`, `aria-selected`, `data-knowledge-reader-panel-title`, and the
   AI-hidden rule. Used by both the docked panel and the full-screen workspace,
   so both change.
3. Library tabs: same class and active state, `gap-1`, counts kept ("Notes 2").
   Keep `role`, `aria-selected`, `data-pdf-workspace-library-filter`.
4. Remove the now-unused `TAB_ACTIVE`/`TAB_IDLE` constants. Spacing around the
   groups stays (header `space-y-3`), nothing else changes.

## Tests
Update class assertions in the header, workspace chrome and library panel
tests to the shared class/active token (assert they use
`KNOWLEDGE_TEXT_BUTTON_CLASS`, not literal pill classes); behaviour tests stay.

## Verification
tsc, focused tests, full gate; PM screenshot of the panel: three groups the
same 24px height and corner radius.

## Allowed files
`components/collabboard/knowledgeReaderControls.ts`,
`components/collabboard/KnowledgeReaderPanelHeader.tsx`,
`components/collabboard/PdfWorkspaceLibraryPanel.tsx`, and their tests plus
`PdfWorkspaceChrome.test.tsx` if a class assertion there changes. No SQL, no
git.
