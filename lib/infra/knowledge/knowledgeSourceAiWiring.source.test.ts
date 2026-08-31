import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF Source AI Phase 1 governance seam. Mirrors knowledgeSourceNoteWiring's
 * source-invariant approach: these pin call shapes, import boundaries and
 * absence of new authority, not line breaks -- reformatting any of the
 * covered files leaves every assertion here intact.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Everything between an anchor and the next `count` characters of source. */
function after(source: string, anchor: string, count = 900): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(index, index + count);
}

const aiPanel = sourceOf('components/collabboard/KnowledgeSourceAIPanel.tsx');
const drawer = sourceOf('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
const details = sourceOf('components/collabboard/KnowledgeDocumentDetails.tsx');
const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');
const notesPanel = sourceOf('components/collabboard/KnowledgeSourceNotesPanel.tsx');
const selectedTextAIPanel = sourceOf('components/collabboard/editors/SelectedTextAIPanel.tsx');
const noteDraft = sourceOf('lib/domain/knowledge/knowledgeSourceNoteDraft.ts');
const textActionRoute = sourceOf('app/api/ai/text-action/route.ts');

describe('PDF Source AI Phase 1 wiring', () => {
  it('reuses the existing /api/ai/text-action endpoint; no new AI endpoint exists', () => {
    expect(aiPanel).toContain("fetch('/api/ai/text-action'");
    expect(aiPanel).not.toMatch(/fetch\(['"`]\/api\/ai\/(?!text-action)/);
    // Every AI route directory, pinned by name: a new one added for this
    // feature would grow this list, and this test would catch it.
    const routes = readdirSync(resolve(process.cwd(), 'app/api/ai')).sort();
    expect(routes).toEqual(['classify-intent', 'convert-component', 'generate-component', 'save-generated-component', 'text-action']);
  });

  it('the request body carries ONLY action/selectedText/instruction -- no page, board or PDF context', () => {
    const call = after(aiPanel, "fetch('/api/ai/text-action'", 500);
    expect(call).toContain("body: JSON.stringify({ action: 'custom', selectedText, instruction })");
    for (const forbidden of ['sourceDocumentId', 'pageText', 'pageNumber', 'boardId', 'canvasId',
      'documentId', 'sourceReference', 'topStripColor', 'originalFilename']) {
      expect(call, forbidden).not.toContain(forbidden);
    }
    // Every PDF AI action is the endpoint's own 'custom', never a new action kind.
    expect(aiPanel).toContain("action: 'custom'");
    expect(aiPanel).not.toMatch(/action:\s*'(improve|shorten|fix-grammar)'/);
  });

  it('performs no persistence of its own -- writes happen only through ordinary Note Save', () => {
    for (const [name, source] of [['KnowledgeSourceAIPanel', aiPanel], ['KnowledgeSourceReaderDrawer delta', drawer]] as const) {
      for (const forbidden of ['supabase', 'getSupabaseAdmin', '.insert(', '.upsert(', '.update(', '.delete(',
        'localStorage', 'sessionStorage', 'indexedDB']) {
        expect(source, `${name}:${forbidden}`).not.toContain(forbidden);
      }
    }
    // The AI request/response themselves are never named in a stored field.
    for (const forbidden of ['aiPrompt', 'aiResponse', 'aiSession:', 'model:', 'temperature:']) {
      expect(canvasClient, forbidden).not.toContain(forbidden);
    }
  });

  it('the FROZEN endpoint and its shared contract were not touched by this feature', () => {
    // The route stays generic: it knows nothing about Knowledge, PDFs, or boards.
    for (const forbidden of ['sourceDocumentId', 'KnowledgeSource', 'boardId', 'pdf', 'PDF']) {
      expect(textActionRoute, forbidden).not.toContain(forbidden);
    }
    expect(textActionRoute).toContain("const { action, selectedText, instruction } = body");
  });

  it('SelectedTextAIPanel (KNI-R4) stays TipTap-only and gains no Knowledge/PDF coupling', () => {
    expect(selectedTextAIPanel).toContain('editor: Editor');
    for (const forbidden of ['KnowledgeSource', 'KnowledgeDocument', 'sourceDocumentId', 'PdfSource', 'aiSession']) {
      expect(selectedTextAIPanel, forbidden).not.toContain(forbidden);
    }
    // Neither surface IMPORTS the other: two independent panels sharing a
    // pattern, not a dependency. (KnowledgeSourceAIPanel's own doc comment
    // names SelectedTextAIPanel to explain the design choice -- that is
    // documentation, not coupling, so only the import is disallowed.)
    expect(aiPanel).not.toContain("from './editors/SelectedTextAIPanel'");
    expect(aiPanel).not.toContain('import SelectedTextAIPanel');
    expect(details).not.toContain('SelectedTextAIPanel');
  });

  it('knowledgeSourceNoteDraft.ts (FROZEN) gained no AI-specific export or field', () => {
    for (const forbidden of ['initialContentText', 'aiResult', 'AiNoteDraft', "action: 'custom'", 'text-action']) {
      expect(noteDraft, forbidden).not.toContain(forbidden);
    }
    // The one conversion authority this feature reuses is still exported plainly.
    expect(noteDraft).toContain('export function knowledgeSourceSelectionToNoteHtml(selectedText: string): string {');
  });

  it('knowledgeSourceSelectionToNoteHtml is the ONE safe conversion authority for the AI result', () => {
    // CanvasClient converts; the panel itself never builds or injects HTML.
    // Checked as the actual JSX attribute syntax, not the bare word -- the
    // panel's own doc comment names `dangerouslySetInnerHTML` in prose to
    // explain that it is never used, which a bare-substring check would
    // misread as the very violation it is documenting.
    expect(canvasClient).toContain('knowledgeSourceSelectionToNoteHtml(options.initialContentText)');
    for (const forbidden of ['dangerouslySetInnerHTML=', 'element.innerHTML']) {
      expect(aiPanel, forbidden).not.toContain(forbidden);
    }
    expect(aiPanel).not.toContain('knowledgeSourceSelectionToNoteHtml');
  });

  it('the CanvasClient override touches only the initial-content seam -- provenance and topStrip are untouched', () => {
    const handler = after(canvasClient, 'const handleCreateNoteFromKnowledgePage', 1400);
    expect(handler).toContain('const draft = buildKnowledgeSourceNoteDraft(request)');
    expect(handler).toContain('setSourceNoteReference(draft.sourceReference)');
    expect(handler).toContain('metadata: draft.topStripColor ? { topStrip: draft.topStripColor } : {}');
    expect(handler).toContain('options?.initialContentText === undefined');
    expect(handler).toContain(': knowledgeSourceSelectionToNoteHtml(options.initialContentText)');
    // No second, AI-specific draft builder was introduced anywhere.
    expect(canvasClient.match(/buildKnowledgeSourceNoteDraft\(/g) ?? []).toHaveLength(3);
  });

  it('the drawer, not the Source Notes panel, owns AI session state and the pane-mode switch', () => {
    expect(drawer).toContain('aiSession');
    expect(drawer).toContain('KnowledgeSourceAIPanel');
    expect(drawer).toContain('reader.aiSession && onCreateNoteFromPage');
    // KnowledgeSourceNotesPanel (FROZEN) knows nothing about AI existing.
    for (const forbidden of ['aiSession', 'KnowledgeSourceAIPanel', 'text-action']) {
      expect(notesPanel, forbidden).not.toContain(forbidden);
    }
  });

  it('a document switch or reader close invalidates any AI session -- neither carries it forward', () => {
    // Both direct `setReader({...})` state constructions are FRESH objects
    // (never a spread of a prior reader), so aiSession starts null on both --
    // there is no path by which a new document inherits a prior AI session.
    const opener = after(drawer, 'const openDocumentById = async (', 1600);
    expect((opener.match(/aiSession:\s*null/g) ?? []).length).toBe(2);
    expect(opener).not.toMatch(/\.\.\.\w*[Rr]eader\w*,[\s\S]{0,200}aiSession/);
    // Closing the reader nulls the WHOLE state object, session included --
    // checked as separate anchors so CRLF/LF line-ending differences on disk
    // can never make this assertion brittle.
    const closer = after(drawer, 'const closeReader = () => {', 120);
    expect(closer).toContain('readGenerationRef.current += 1;');
    expect(closer).toContain('setReader(null);');
  });

  it('adds no raster, crop, or PDF-worker dependency', () => {
    // 'page-image' is deliberately excluded: it names the PRE-EXISTING,
    // unrelated optional raster route KnowledgeDocumentDetails already
    // references -- this feature simply never depends on it, which is what
    // the other tokens below (and Phase 1's whole design) actually prove.
    for (const [name, source] of [['KnowledgeSourceAIPanel', aiPanel], ['drawer', drawer], ['details', details]] as const) {
      for (const forbidden of ['pdfjs', 'pdf-worker', '@napi-rs/canvas', 'OpenDataLoader', '/crop', 'rasterize']) {
        expect(source, `${name}:${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('the toolbar AI activation is gated exactly like Note Post, and stays lg-only', () => {
    expect(details).toContain('onAiFromSelection?: (request: KnowledgeSourcePageRequest) => void;');
    // Nested inside the SAME `documentId && activeSelection && !regionMode`
    // toolbar block Note Post already lives in -- never a second toolbar.
    expect(details).toContain('onCreateNoteFromPage && documentId && activeSelection && !regionMode');
    expect(details).toContain('{onAiFromSelection ? (');
    const button = after(details, 'aria-label="Ask AI about the selected text"', 400);
    expect(button).toContain('hidden');
    expect(button).toContain('lg:inline-flex');
  });
});
