import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF Source Notes Panel -- Phase 1 governance seam. Proves the panel is
 * wired entirely from data CanvasClient already holds in memory: no second
 * fetch, no second Supabase read, no new API route, and no ownership change
 * to KnowledgeDocumentDetails. Source invariants, not a render test, for the
 * same reason knowledgeSourceNoteWiring.source.test.ts exists: CanvasClient
 * is a 9k-line legacy controller no single render proof can cover.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
}

const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');
const readerDrawer = sourceOf('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
const notesPanel = sourceOf('components/collabboard/KnowledgeSourceNotesPanel.tsx');
const summaryDomain = sourceOf('lib/domain/knowledge/knowledgeSourceNoteSummary.ts');
const details = sourceOf('components/collabboard/KnowledgeDocumentDetails.tsx');

/** Everything between an anchor and the next `count` characters of source. */
function after(source: string, anchor: string, count = 600): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(index, index + count);
}

/** Everything from `count` characters before an anchor up to the anchor itself. */
function before(source: string, anchor: string, count = 300): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(Math.max(0, index - count), index);
}

describe('PDF Source Notes Panel wiring', () => {
  it('CanvasClient derives Source Note summaries from the SAME already-loaded state as the backlink/color projections', () => {
    const window = after(canvasClient, 'const knowledgeSourceNoteSummaries = useMemo(', 500);
    expect(window).toContain('buildKnowledgeSourceNoteSummaryIndex(');
    expect(window).toContain('sourceReferencesByPadletId');
    expect(window).toContain('padlets');
  });

  it('the derivation is a useMemo, not a new state or a new effect', () => {
    const precedingLine = before(canvasClient, 'const knowledgeSourceNoteSummaries = useMemo(', 5);
    // The declaration itself IS the useMemo call -- nothing else precedes it.
    expect(precedingLine.trim()).toBe('');
    expect(canvasClient).not.toContain('useState<KnowledgeSourceNoteSummaryIndex');
    expect(canvasClient).not.toContain('setKnowledgeSourceNoteSummaries');
    // Exactly one build call in the whole file: no second, competing site.
    const occurrences = canvasClient.split('buildKnowledgeSourceNoteSummaryIndex(').length - 1;
    expect(occurrences).toBe(1);
  });

  it('the provider receives the derived index as noteSummaries, alongside the existing backlink/color props', () => {
    const window = after(canvasClient, '<KnowledgeSourceReferenceProvider', 400);
    expect(window).toContain('noteSummaries={knowledgeSourceNoteSummaries}');
    expect(window).toContain('backlinks={knowledgeSourceBacklinkIndex}');
    expect(window).toContain('noteColors={knowledgeSourceNoteColors}');
  });

  it('the panel reads its data from the shared context hook, never a request of its own', () => {
    expect(notesPanel).toContain('useKnowledgeSourceNoteSummariesForDocument(');
    for (const forbidden of ['fetch(', 'supabase', 'createClient', '/api/']) {
      expect(notesPanel, forbidden).not.toContain(forbidden);
    }
  });

  it('the pure summary domain file issues no request and no Supabase call', () => {
    for (const forbidden of ['fetch(', 'supabase', 'createClient', '.insert(', '.update(', '.delete(']) {
      expect(summaryDomain, forbidden).not.toContain(forbidden);
    }
  });

  it('no new API route file was added for Source Notes', () => {
    for (const forbidden of ['sourceNotes', 'source-notes', 'notesPanel', 'note-summaries']) {
      expect(canvasClient, forbidden).not.toContain(forbidden);
    }
  });

  it('the drawer mounts the panel as a sibling of KnowledgeDocumentDetails and forwards the EXISTING onOpenBacklinkTarget', () => {
    expect(readerDrawer).toContain('<KnowledgeSourceNotesPanel');
    const window = after(readerDrawer, '<KnowledgeSourceNotesPanel', 200);
    expect(window).toContain('onOpenNote={onOpenBacklinkTarget}');
    // The existing forwarding to the reading pane is untouched.
    expect(readerDrawer).toContain('onOpenBacklinkTarget={onOpenBacklinkTarget}');
    expect(readerDrawer).toContain('onCreateNoteFromPage={onCreateNoteFromPage}');
    // The drawer itself never resolves a target or opens an editor -- that
    // stays CanvasClient's job, reached only through the forwarded callback.
    for (const forbidden of ['openPadletInTypeEditor', 'setSelectedPadletId', 'padlets.find']) {
      expect(readerDrawer, forbidden).not.toContain(forbidden);
    }
  });

  it('KnowledgeDocumentDetails was not modified to own the Source Notes panel', () => {
    expect(details).not.toContain('KnowledgeSourceNotesPanel');
    expect(details).not.toContain('useKnowledgeSourceNoteSummariesForDocument');
    expect(details).not.toContain('knowledgeSourceNoteSummary');
  });

  it('the panel never writes: no mutation call anywhere in its source', () => {
    for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'setSelectedPadletId']) {
      expect(notesPanel, forbidden).not.toContain(forbidden);
    }
  });
});
