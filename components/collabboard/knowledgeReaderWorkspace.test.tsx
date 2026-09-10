// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF-C1 Step 2 -- the reader is TWO regions: a document workspace that takes
 * the majority of the drawer, and a Library panel that answers "what is this
 * source and where is it used". There is no third pane, and nothing reserved
 * for an AI feature that does not exist yet.
 *
 * These are source proofs: the drawer's own behavioural suite already mounts it
 * (53 tests, including the pane geometry these assertions reference), and this
 * file pins the structural decisions that suite would not notice being undone.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const DRAWER = read('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
const DETAILS = read('components/collabboard/KnowledgeDocumentDetails.tsx');
const SURFACE = read('components/collabboard/KnowledgePdfCanvasSurface.tsx');
const REGISTRY = read('components/collabboard/canvas/ui/canvasToolbarRegistry.tsx');
const SIDEBAR = read('components/collabboard/canvas/ui/CanvasSidebar.tsx');
const POST_CARD = read('components/collabboard/PostCardContent.tsx');
const CONTROLS = read('components/collabboard/knowledgeReaderControls.ts');
const DOCK = read('components/collabboard/PdfReaderDock.tsx');

describe('1-6. two regions, a document tab, and no reserved AI space', () => {
  it('1-2. exactly two panes exist, and neither is an empty AI column', () => {
    const code = executable(DRAWER);
    // The workspace and the Library pane, and nothing else, inside the row.
    expect(code).toContain('data-knowledge-reader-workspace="true"');
    expect(code).toContain('data-knowledge-library-panel="true"');
    expect((code.match(/data-knowledge-source-notes-pane="true"/g) || []).length).toBe(1);
    // No placeholder for a feature that does not exist.
    for (const forbidden of ['Ask AI', 'Add to chat', 'Coming soon', 'chat-placeholder']) {
      expect(code, forbidden + ' must not appear').not.toContain(forbidden);
    }
  });

  it('3. the workspace takes the majority width; the Library pane is fixed', () => {
    const code = executable(DRAWER);
    expect(code).toContain('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden');
    expect(code).toContain('w-[300px] flex-none');
    expect(code).toContain('lg:w-[880px]');
    // The old fixed reading column is gone -- it was the narrower half.
    expect(code).not.toContain('lg:w-[420px]');
  });

  it('4-5. the open document is named as a tab, with close still available', () => {
    const code = executable(DRAWER);
    expect(code).toContain('data-knowledge-reader-tabs="true"');
    expect(code).toContain('data-knowledge-reader-tab="active"');
    expect(code).toContain('{reader.originalFilename || \'Document\'}');
    expect(code).toContain('aria-label="Close Knowledge reader"');
  });

  it('6. no multi-document tab manager was introduced', () => {
    const code = executable(DRAWER);
    // One document at a time: no tab collection, ordering or persistence.
    for (const forbidden of ['openTabs', 'tabs.map', 'onReorderTab', 'activeTabId', 'closeTab(']) {
      expect(code, forbidden + ' would be a tab manager').not.toContain(forbidden);
    }
  });
});

describe('7-13. the Library panel owns the document identity', () => {
  const libraryPane = () => {
    const at = DRAWER.indexOf('data-knowledge-library-panel="true"');
    expect(at, 'the Library pane must exist').toBeGreaterThan(-1);
    return DRAWER.slice(at, DRAWER.indexOf('</aside>', at));
  };

  it('7-10. Back, filename, page count and Used in Notes all live here', () => {
    const pane = libraryPane();
    expect(pane).toContain('data-knowledge-library-back="true"');
    expect(pane).toContain('← Back to PDFs');
    expect(pane).toContain('data-knowledge-library-filename="true"');
    expect(pane).toContain('data-knowledge-library-pagecount="true"');
    expect(pane).toContain('<UsedInNotes scope="document"');
  });

  it('11-12. the reference links and the Notes list are the existing ones', () => {
    const pane = libraryPane();
    // Imported, not reimplemented: one UsedInNotes, and the SAME unified
    // Library panel the focused workspace renders -- the docked reader holds
    // no second notion of what this PDF's Library contains.
    expect(pane).toContain('<PdfWorkspaceLibraryPanel');
    expect(pane).toContain('documentId={reader.documentId}');
    // Line-ending agnostic: this repo has mixed CRLF/LF sources.
    expect(DRAWER).toMatch(/import KnowledgeDocumentDetails, \{\s*UsedInNotes,\s*pageCountSummary,/);
    expect(DRAWER).not.toContain('<KnowledgeSourceNotesPanel');
    // And the rows come from the same board index, not a second fetch.
    expect(DRAWER).toContain('useKnowledgeSourceBacklinksForDocument(reader?.documentId ?? null)');
    expect(DRAWER).toContain('knowledgeSourceBacklinkDocumentRows(libraryBacklinks)');
    // The Library rows add no request of their own -- and since the shared
    // page cache took ownership of the `/pages` read, the drawer now issues
    // none at all.
    expect((executable(DRAWER).match(/fetch\(/g) || []).length).toBe(0);
  });

  it('13. the workspace no longer repeats that metadata above the document', () => {
    // Suppressed only while the panel that shows it is actually open: closing
    // the dock hands the header back to the reading pane.
    expect(DRAWER).toContain("hostRendersDocumentHeader={!!onOpenBacklinkTarget && sidePanelRightPanel !== 'closed'}");
    expect(DETAILS).toContain('hostRendersDocumentHeader = false');
    // Suppressed only when a host actually shows it, so Back to PDFs and the
    // filename can never disappear entirely.
    expect(DETAILS).toContain('{hostRendersDocumentHeader ? null : (');
  });
});

describe('14-18. the document workspace keeps its working tools', () => {
  it('14-15. parsed page text and page boundaries are untouched', () => {
    expect(DETAILS).toContain('PAGE_TEXT_ROOT');
    expect(DETAILS).toContain('highlightedText(');
    expect(DETAILS).toContain('min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1');
  });

  it('16-18. search, Select area and Create Note are the same implementations', () => {
    expect(DETAILS).toContain('aria-label="Search in this PDF"');
    expect(DETAILS).toContain('data-knowledge-viewer-action="select-area"');
    expect(DETAILS).toContain('KnowledgeDocumentPageRegionSelector');
    expect(DETAILS).toContain('Create Note');
    // Exactly one of each -- nothing was duplicated into the new toolbar.
    expect((DETAILS.match(/aria-label="Search in this PDF"/g) || []).length).toBe(1);
    expect((DETAILS.match(/Select area\n/g) || []).length).toBeLessThanOrEqual(1);
  });
});

describe('19-25. the bottom viewer toolbar exposes only real functions', () => {
  /** Executable toolbar markup only: prose about what it deliberately omits
   *  must never be able to satisfy or fail a test about the controls. */
  const toolbar = () => {
    const code = executable(DETAILS);
    const at = code.indexOf('data-knowledge-viewer-toolbar="true"');
    expect(at, 'the bottom toolbar must exist').toBeGreaterThan(-1);
    // PDF-R6J moved the area actions into this bar, so the window has to reach
    // past them to the controls that follow.
    return code.slice(at - 200, at + 12000);
  };

  it('19. a compact toolbar sits at the foot of the workspace', () => {
    const bar = toolbar();
    expect(bar).toContain('border-t border-gray-100');
    expect(bar).toContain('flex-none');
  });

  it('20-22. search, Select area and a page indicator are wired to real state', () => {
    const bar = toolbar();
    expect(bar).toContain('setQuery(event.currentTarget.value)');
    expect(bar).toContain('data-knowledge-viewer-action="select-area"');
    expect(bar).toContain('setRegionMode(');
    expect(bar).toContain('data-knowledge-viewer-page-indicator="true"');
    // Counted from the pages actually rendered, never a stored guess.
    expect(bar).toContain('{pages.length}');
  });

  it('23-25. nothing fake was added -- no zoom, no dead controls', () => {
    const bar = toolbar();
    for (const fake of ['Zoom', 'zoom', 'Rotate', 'Fit ', 'disabled>']) {
      expect(bar, fake + ' must not appear in the toolbar').not.toContain(fake);
    }
    // The loading percentage discussed earlier is not, and never becomes, zoom.
    expect(executable(DETAILS)).not.toMatch(/\d+\s*%/);
  });
});

describe('26-29. permissions are the existing capability, unchanged', () => {
  it('26. reading, scrolling and searching are never gated', () => {
    const bar = DETAILS.slice(DETAILS.indexOf('data-knowledge-viewer-toolbar="true"'));
    const searchAt = bar.indexOf('aria-label="Search in this PDF"');
    const gateAt = bar.indexOf('onCreateNoteFromPage && documentId');
    // Search is rendered before -- and outside -- the editor-only gate.
    expect(searchAt).toBeGreaterThan(-1);
    expect(searchAt).toBeLessThan(gateAt);
  });

  it('27-28. Create Note and area capture stay behind the same capability', () => {
    // Absent, not disabled -- exactly as before this patch.
    expect(DETAILS).toContain('{onCreateNoteFromPage && documentId ? (');
    expect(DETAILS).toContain('enabled={regionMode && onCreateNoteFromPage !== undefined}');
  });

  it('29. no new permission model was introduced', () => {
    const code = executable(DRAWER) + executable(DETAILS);
    for (const invented of ['isReadOnly', 'canEditDocument', 'readerPermission']) {
      expect(code, invented + ' would be a second permission model').not.toContain(invented);
    }
  });
});

describe('38-45. Open and Side panel are two hosts for one reader', () => {
  const CARD = read('components/collabboard/KnowledgePdfCanvasSurface.tsx');
  const CLIENT = read('app/dashboard/canvas/[id]/CanvasClient.tsx');

  it('38-39. the two controls request different hosts, never the same action', () => {
    const code = executable(CARD);
    expect(code).toContain("openDocument({ documentId, presentation: 'workspace' })");
    expect(code).toContain("openDocument({ documentId, presentation: 'side-panel' })");
    // The old collision -- both calling the bare open path -- must not return.
    expect((code.match(/openDocument\(\{ documentId \}\)/g) || []).length).toBe(0);
  });

  it('40. both still address the SAME document -- one source, no copy', () => {
    const code = executable(CARD);
    // Identical identity on both paths; only `presentation` differs. Both
    // pass the SAME `documentId` binding -- neither mints or derives an id.
    expect((code.match(/openDocument\(\{ documentId, presentation/g) || []).length).toBe(2);
    expect(code).not.toMatch(/openDocument\(\{\s*documentId:\s*[^}]/);
  });

  it('41. the workspace host covers the board instead of unmounting it', () => {
    const code = executable(DRAWER);
    expect(code).toContain("'fixed inset-0 z-[3100] flex flex-col bg-white'");
    // Above the toolbar wrapper, so the board's own chrome cannot float over
    // -- or steal clicks from -- a workspace that has taken the whole surface.
    expect(code).toContain('z-[3100]');
    // Still the docked geometry for the side panel.
    expect(code).toContain("'fixed inset-y-0 right-0 z-[1200] flex w-full flex-col");
    // The reader is mounted unconditionally, so entering the workspace never
    // unmounts the board -- which is what keeps camera, placements and live
    // state intact on return.
    expect(CLIENT).not.toContain("knowledgeReaderPresentation === 'workspace' ?");
    const mountSite = CLIENT.slice(CLIENT.indexOf('<KnowledgeSourceReaderDrawer') - 200,
                                   CLIENT.indexOf('<KnowledgeSourceReaderDrawer'));
    expect(mountSite).not.toContain('knowledgeReaderPresentation');
  });

  it('42. the workspace offers a way back to the board; the drawer does not need one', () => {
    const code = executable(DRAWER);
    expect(code).toContain('data-knowledge-reader-tab="board"');
    expect(code).toContain('{isWorkspace ? (');
    expect(code).toContain('onClick={closeReader}');
  });

  it('43. the host is carried beside the request, not baked into it', () => {
    // The persisted navigation request keeps the exact shape the citation and
    // library paths already build.
    expect(CLIENT).toContain("const [knowledgeReaderPresentation, setKnowledgeReaderPresentation]");
    // The default is still the docked drawer and it is still derived from the
    // request; BCHAT-C only lifted it into a local so the same value can also
    // decide whether Board AI Chat yields the dock.
    expect(CLIENT).toContain("const presentation = request.presentation ?? 'side-panel';");
    expect(CLIENT).toContain('setKnowledgeReaderPresentation(presentation);');
    expect(CLIENT).toContain('presentation={knowledgeReaderPresentation}');
    // Every other opener keeps the drawer.
    expect(CLIENT).toContain("useState<'workspace' | 'side-panel'>('side-panel')");
  });

  it('44. still exactly ONE reader implementation', () => {
    expect((CLIENT.match(/<KnowledgeSourceReaderDrawer/g) || []).length).toBe(1);
    for (const forbidden of ['KnowledgePdfCentralReader', 'PdfWorkspaceReaderV2', 'ReaderV2']) {
      expect(CLIENT + DRAWER, forbidden + ' would be a second reader').not.toContain(forbidden);
    }
  });

  it('45. both hosts keep the same panels and functions', () => {
    const code = executable(DRAWER);
    // One reading slot per host, one Library slot, and -- since the docked
    // reader now docks the same two panels the workspace does -- one dock
    // component and one Library panel serving both.
    expect((code.match(/data-knowledge-library-panel="true"/g) || []).length).toBe(1);
    expect((code.match(/<PdfReaderDock/g) || []).length).toBe(1);
    expect((code.match(/<PdfWorkspaceLibraryPanel/g) || []).length).toBe(2);
    expect((code.match(/<BoardAiChatDrawer/g) || []).length).toBe(2);
    expect((code.match(/<KnowledgeDocumentDetails/g) || []).length).toBe(2);
  });
});

describe('30-37. everything outside the reader is untouched', () => {
  it('30. the canvas PDF card is unchanged', () => {
    expect(SURFACE).toContain('data-knowledge-pdf-surface="true"');
    expect(SURFACE).toContain('KnowledgePdfCardControls');
    expect(SURFACE).toContain("(disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-black/10')");
  });

  it('31-32. the PDF tool stays in Media, driven by the native label', () => {
    expect(REGISTRY).toContain('type: "knowledge-pdf", pinned: true, activatesInputId: KNOWLEDGE_PDF_TOOLBAR_INPUT_ID,');
    const media = REGISTRY.slice(REGISTRY.indexOf("id: 'media'"), REGISTRY.indexOf("id: 'draw'"));
    expect(media).toContain('knowledge-pdf');
    expect(SIDEBAR).toContain('htmlFor={tool.activatesInputId}');
    // The toolbar owns the input the label points at, on its own id so the
    // workspace's uploader is never the one a board-level click reaches.
    expect(SIDEBAR).toContain('inputId={KNOWLEDGE_PDF_TOOLBAR_INPUT_ID}');
  });

  it('33. the Note source marker still opens the reader', () => {
    expect(POST_CARD).toContain('data-knowledge-source-open="true"');
    expect(POST_CARD).toContain('openSource(openTarget)');
  });

  it('34. direct PDFs remain Freeform-only', () => {
    expect(REGISTRY).toContain("return layout === 'freeform';");
  });

  it('35-37. Knowledge authority, AI and the backend are unchanged', () => {
    const code = executable(DRAWER) + executable(DETAILS);
    expect(code).not.toMatch(/anthropic|openai|byok/i);
    expect(code).not.toMatch(/migration|supabase\/functions|workers\//i);
    // The PDF reader's AI is now the board's own private chat, document
    // scoped -- one surface, no second provider, no second backend.
    expect(DRAWER).not.toContain('KnowledgeSourceAIPanel');
    expect(DRAWER).toContain('BoardAiChatDrawer');
    expect(executable(DRAWER)).not.toContain('BoardAIChat');
  });
});


describe('PDF-R6J-C2: one compact bottom toolbar, and a search popover', () => {
  const code = () => executable(DETAILS);
  const toolbar = () => {
    const c = code();
    const at = c.indexOf('data-knowledge-viewer-toolbar="true"');
    expect(at, 'the bottom toolbar must exist').toBeGreaterThan(-1);
    return c.slice(at - 200, at + 12000);
  };
  /** The per-page header, which must now carry no actions at all. */
  const pageHeader = () => {
    const c = code();
    const at = c.indexOf('<section key={page.pageNumber} data-page-number={page.pageNumber}>');
    expect(at, 'the page section must exist').toBeGreaterThan(-1);
    // Ends at the page visual, which is the first thing after the header --
    // a comment marker would not survive executable()'s stripping.
    const end = c.indexOf('<KnowledgeDocumentPageRegionSelector', at);
    expect(end, 'the page visual must follow the header').toBeGreaterThan(at);
    return c.slice(at, end);
  };

  it('1-4: no page-header action controls, and no permanent search field', () => {
    const header = pageHeader();
    for (const gone of ['<StickyNote', '<Sparkles', '<SquareDashedMousePointer', '<Crop', '<X ', 'onAddBoardAiContext', 'onCreateNoteFromPage']) {
      expect(header, gone).not.toContain(gone);
    }
    // PDF-R6K went further: the header carries nothing at all. The heading
    // and the per-page provenance rows both restated what the Library panel
    // owns, directly above the thing the reader is for.
    expect(header).not.toContain('Page {page.pageNumber}');
    expect(header).not.toContain('<UsedInNotes');
    // The page number still rides on the section -- tracking, scrolling and
    // citation arrival all address it.
    expect(header).toContain('data-page-number={page.pageNumber}');
    // The permanent field is gone: the input only exists inside the popover.
    const c = code();
    expect(c).not.toContain('className="relative min-w-0 flex-1"');
    expect(c.indexOf('aria-label="Search in this PDF"'))
      .toBeGreaterThan(c.indexOf('data-knowledge-search-popover="true"'));
  });

  it('5-10: every action is in the bottom bar, in reading order', () => {
    const bar = toolbar();
    const order = ['search', 'create-note', 'add-to-chat', 'select-area', 'note-from-area', 'clear-area'];
    let previous = -1;
    for (const action of order) {
      const at = bar.indexOf(`data-knowledge-viewer-action="${action}"`);
      expect(at, action).toBeGreaterThan(previous);
      previous = at;
    }
    // ...and the page count closes the row.
    expect(bar.indexOf('data-knowledge-viewer-page-indicator="true"')).toBeGreaterThan(previous);
  });

  it('11,12: the actions are icon-only, and all the same size', () => {
    const bar = toolbar();
    for (const icon of ['<Search className="h-3.5 w-3.5"', '<StickyNote className="h-3.5 w-3.5"',
      '<Sparkles className="h-3.5 w-3.5"', '<Crop className="h-3.5 w-3.5"',
      '<SquareDashedMousePointer className="h-3.5 w-3.5"', '<X className="h-3.5 w-3.5"']) {
      expect(bar, icon).toContain(icon);
    }
    // No visible text label survives on an action button.
    for (const label of ['>Select area<', '>Create Note<', '>Clear<', '>Add page to Board AI<']) {
      expect(bar, label).not.toContain(label);
    }
    // ONE compact control shape for the whole reader: the toolbar imports it
    // rather than owning it, and the header dock draws from the same string.
    expect(code()).toContain("import { KNOWLEDGE_ICON_BUTTON_CLASS } from '@/components/collabboard/knowledgeReaderControls'");
    expect(CONTROLS).toContain('inline-flex h-6 w-6 flex-none shrink-0 items-center justify-center');
    expect(DOCK).toContain("import {");
    expect(DOCK).toContain('KNOWLEDGE_ICON_BUTTON_CLASS');
    expect(DOCK).toContain('${KNOWLEDGE_ICON_BUTTON_CLASS}');
    expect((bar.match(/KNOWLEDGE_ICON_BUTTON_CLASS/g) || []).length).toBeGreaterThanOrEqual(6);
  });

  it('13,14: one row, and the page count is pushed to the end', () => {
    const bar = toolbar();
    // flex-wrap would let the row become two; it is gone.
    expect(bar).toContain('flex flex-none items-center gap-1 border-t border-gray-100 pt-2');
    expect(bar).not.toContain('flex-wrap');
    expect(bar).toContain('ml-auto flex flex-none items-center gap-0.5');
  });

  it('15-17: the search icon opens a popover holding the existing search UI', () => {
    const bar = toolbar();
    expect(bar).toContain('data-knowledge-viewer-action="search"');
    expect(bar).toContain('aria-label="Search this PDF"');
    expect(bar).toContain('setSearchOpen((open) => !open)');
    expect(bar).toContain('data-knowledge-search-popover="true"');
    // The SAME query state, matching and navigation as the permanent field.
    expect(bar).toContain('setQuery(event.currentTarget.value)');
    expect(bar).toContain('moveMatch(-1)');
    expect(bar).toContain('moveMatch(1)');
    expect(bar).toContain("matches.length === 0 ? 'No matches'");
  });

  it('16: it opens UPWARD, because the bar sits at the foot of the reader', () => {
    expect(toolbar()).toContain('absolute bottom-full left-0 z-20 mb-2 w-[280px]');
  });

  it('19,20: Escape and a click outside close it, and only while it is open', () => {
    const c = code();
    expect(c).toContain("if (event.key === 'Escape') setSearchOpen(false);");
    expect(c).toContain('if (popover && !popover.contains(event.target as Node)) setSearchOpen(false);');
    // Bound only while open -- the reader adds no listeners at rest.
    expect(c).toMatch(/if \(!searchOpen\) return;[\s\S]{0,600}addEventListener/);
    expect(c).toContain("window.removeEventListener('keydown', onKeyDown)");
    expect(c).toContain("document.removeEventListener('mousedown', onPointerDown)");
    // Focus lands in the field when it opens.
    expect(c).toContain('if (searchOpen) searchInputRef.current?.focus();');
  });

  it('21-24: the page actions act on the page in view, tracked invisibly', () => {
    const bar = toolbar();
    expect(bar).toContain('pageNumber: activePageNumber');
    expect(bar).toContain('boardAiDraftFromPage(documentId, originalFilename, activePageNumber)');
    expect(bar).toContain('aria-label={`Create Note from page ${activePageNumber}`}');
    expect(bar).toContain('aria-label={`Add page ${activePageNumber} to Board AI`}');
    // The tracking itself: one hook, no new UI, no scroll handler in the view.
    expect(code()).toContain('const activePageNumber = useKnowledgeReaderActivePage(pagesContainerRef, pages.length, initialPageNumber)');
    const hook = read('components/collabboard/useKnowledgeReaderActivePage.ts');
    expect(hook).toContain('new IntersectionObserver(');
    // Opening the reader AT a page means that page from the first press,
    // rather than page 1 until the observer catches up.
    expect(hook).toContain('useState(initialPage)');
    expect(hook).toContain('initialPage = 1');
    expect(hook).toContain("typeof IntersectionObserver === 'undefined'");
  });

  it('26,27: a region keeps its OWN page -- the tracker never overrides it', () => {
    const bar = toolbar();
    expect(bar).toContain('pageNumber: activeRegion.pageNumber');
    expect(bar).toContain('appliedRotation: activeRegion.appliedRotation');
    // The area actions must not read the tracked page at all.
    // Bounded to the area pair itself: the pager after it legitimately reads
    // the tracked page, and would otherwise make this pass for the wrong reason.
    const areaAt = bar.indexOf('data-knowledge-viewer-action="note-from-area"');
    const areaEnd = bar.indexOf('data-knowledge-viewer-action="clear-area"');
    expect(areaEnd).toBeGreaterThan(areaAt);
    expect(bar.slice(areaAt, areaEnd)).not.toContain('activePageNumber');
  });

  it('29,30: the capability gates are exactly the ones that were there before', () => {
    const bar = toolbar();
    // Absent, not disabled -- a viewer never sees them.
    // A page action with no rendered page is not an action.
    expect(bar).toContain('onCreateNoteFromPage && documentId && pages.length > 0 && !activeSelection');
    expect(bar).toContain('onAddBoardAiContext && documentId && pages.length > 0 && !activeSelection');
    expect(bar).toContain('onCreateNoteFromPage && documentId && activeRegion');
    expect(bar).toContain('onCreateNoteFromPage && documentId ?');
    // Search is outside every gate: reading is never a privilege.
    expect(bar.indexOf('data-knowledge-viewer-action="search"'))
      .toBeLessThan(bar.indexOf('onCreateNoteFromPage && documentId'));
  });
});


describe('PDF-R6K: clean page chrome, a pager, and a transient area rectangle', () => {
  const code = () => executable(DETAILS);
  const selector = read('components/collabboard/KnowledgeDocumentPageRegionSelector.tsx');
  const bar = () => {
    const c = code();
    const at = c.indexOf('data-knowledge-viewer-toolbar="true"');
    return c.slice(at - 200, at + 12000);
  };

  it('1-4: the reader shows no page metadata, and the Library keeps the data', () => {
    const c = code();
    const at = c.indexOf('<section key={page.pageNumber} data-page-number={page.pageNumber}>');
    const header = c.slice(at, c.indexOf('<KnowledgeDocumentPageRegionSelector', at));
    expect(header).not.toContain('<UsedInNotes');
    expect(header).not.toContain('knowledgeSourceBacklinkPageRows');
    // Document-scoped provenance is untouched: the Library still renders it.
    expect(c).toContain('<UsedInNotes scope="document"');
    expect(c).toContain('documentRows');
  });

  it('5,6: the pager reports current / total from real state', () => {
    const b = bar();
    expect(b).toContain('data-knowledge-viewer-action="previous-page"');
    expect(b).toContain('data-knowledge-viewer-action="next-page"');
    expect(b).toContain('{activePageNumber} / {pages.length}');
    expect(b).toContain('data-knowledge-viewer-page-indicator="true"');
  });

  it('7,8,12: the arrows move the SCROLL -- the reader stays continuous', () => {
    const b = bar();
    expect(b).toContain('onClick={() => scrollToPage(activePageNumber - 1)}');
    expect(b).toContain('onClick={() => scrollToPage(activePageNumber + 1)}');
    expect(code()).toContain("target.scrollIntoView?.({ block: 'start' })");
    // No page-at-a-time rendering was introduced.
    expect(code()).not.toContain('visiblePage');
    expect(code()).toContain('{pages.map((page, pageIndex) =>');
  });

  it('9,10: the ends are disabled, and nothing wraps', () => {
    const b = bar();
    expect(b).toContain('disabled={activePageNumber <= 1}');
    expect(b).toContain('disabled={activePageNumber >= pages.length}');
    // The helper refuses out-of-range targets even if a caller asks.
    expect(code()).toContain('if (pageNumber < 1 || pageNumber > pages.length) return;');
    expect(code()).not.toContain('% pages.length');
  });

  it('13,14: still one row, and Search is still an icon with a popover', () => {
    const b = bar();
    expect(b).toContain('flex flex-none items-center gap-1 border-t border-gray-100 pt-2');
    expect(b).not.toContain('flex-wrap');
    expect(b).toContain('data-knowledge-viewer-action="search"');
    expect(b).toContain('data-knowledge-search-popover="true"');
    expect(b).toContain('absolute bottom-full left-0 z-20 mb-2 w-[280px]');
  });

  it('31-35: the area rectangle is transient -- a taken drag ends it', () => {
    // dropEffect is the browser's own answer to "did anything accept this?",
    // so the reader needs no channel back from the canvas.
    expect(selector).toContain("if (event.dataTransfer.dropEffect !== 'none') onClear();");
    expect(selector).toContain('onDragEnd={draggableRegion');
    // An abandoned drag leaves it alone, to be retried.
    expect(selector).toContain("!== 'none'");
    // Nothing restores it later: there is no resurrect path at all.
    expect(code()).not.toContain('restoreArmedRegion');
    expect(read('app/dashboard/canvas/[id]/CanvasClient.tsx')).not.toContain('setArmedRegion');
  });

  it('the Clear control and the area-note action both still end the selection', () => {
    const b = bar();
    expect(b).toContain('data-knowledge-viewer-action="clear-area"');
    expect(b).toContain('onClick={() => setArmedRegion(null)}');
    // Creating a Note from the area clears it too, as it always did.
    expect(b).toMatch(/note-from-area[\s\S]{0,1600}setArmedRegion\(null\)/);
  });
});
