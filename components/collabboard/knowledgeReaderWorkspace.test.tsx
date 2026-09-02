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

  it('11-12. the reference links and Source Notes are the existing ones', () => {
    const pane = libraryPane();
    // Imported, not reimplemented: one UsedInNotes, one Source Notes panel.
    expect(pane).toContain('<KnowledgeSourceNotesPanel documentId={reader.documentId}');
    // Line-ending agnostic: this repo has mixed CRLF/LF sources.
    expect(DRAWER).toMatch(/import KnowledgeDocumentDetails, \{\s*UsedInNotes,\s*pageCountSummary,/);
    expect((DRAWER.match(/<KnowledgeSourceNotesPanel/g) || []).length).toBe(1);
    // And the rows come from the same board index, not a second fetch.
    expect(DRAWER).toContain('useKnowledgeSourceBacklinksForDocument(reader?.documentId ?? null)');
    expect(DRAWER).toContain('knowledgeSourceBacklinkDocumentRows(libraryBacklinks)');
    // The Library rows add no request of their own -- and since the shared
    // page cache took ownership of the `/pages` read, the drawer now issues
    // none at all.
    expect((executable(DRAWER).match(/fetch\(/g) || []).length).toBe(0);
  });

  it('13. the workspace no longer repeats that metadata above the document', () => {
    expect(DRAWER).toContain('hostRendersDocumentHeader={!!onOpenBacklinkTarget}');
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
    return code.slice(at - 200, at + 2600);
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
    // One workspace slot, one Library slot, whichever host draws them.
    expect((code.match(/data-knowledge-reader-workspace="true"/g) || []).length).toBe(1);
    expect((code.match(/data-knowledge-library-panel="true"/g) || []).length).toBe(1);
    expect((code.match(/<KnowledgeDocumentDetails/g) || []).length).toBe(1);
  });
});

describe('30-37. everything outside the reader is untouched', () => {
  it('30. the canvas PDF card is unchanged', () => {
    expect(SURFACE).toContain('data-knowledge-pdf-surface="true"');
    expect(SURFACE).toContain('KnowledgePdfCardControls');
    expect(SURFACE).toContain("(disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-black/10')");
  });

  it('31-32. Add PDF stays in Media, driven by the native label', () => {
    expect(REGISTRY).toContain('type: "knowledge-pdf", pinned: true, activatesInputId: KNOWLEDGE_PDF_INPUT_ID,');
    const media = REGISTRY.slice(REGISTRY.indexOf("id: 'media'"), REGISTRY.indexOf("id: 'draw'"));
    expect(media).toContain('knowledge-pdf');
    expect(SIDEBAR).toContain('htmlFor={tool.activatesInputId}');
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
    // The one-shot Source AI panel still exists; this patch adds no chat.
    expect(DRAWER).toContain('KnowledgeSourceAIPanel');
    expect(executable(DRAWER)).not.toContain('BoardAIChat');
  });
});
