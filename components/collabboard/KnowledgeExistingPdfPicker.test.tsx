// @vitest-environment jsdom
// Re-placing a Knowledge PDF the board already has.
//
// The defect this closes: a Knowledge document is durable and board-independent,
// but its canvas card was the only way to reach it. Deleting the card stranded
// the document -- still `ready`, still returned by the board's own listing API,
// with no user action able to reach it again, because Add PDF only uploads.
//
// Add PDF itself is left strictly alone: it is a real <label htmlFor> and the
// browser's own activation is what opens the file dialog.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeExistingPdfPicker from './KnowledgeExistingPdfPicker';
import type { KnowledgePdfSummary } from './KnowledgePdfUploader';

const BOARD = 'board-1';
let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

const doc = (over: Partial<KnowledgePdfSummary> & { id: string }): KnowledgePdfSummary => ({
  boardId: BOARD, originalFilename: `${over.id}.pdf`, mimeType: 'application/pdf',
  fileSizeBytes: 1000, pageCount: 7, processingStatus: 'ready',
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', ...over,
});

async function render(props: Partial<React.ComponentProps<typeof KnowledgeExistingPdfPicker>> = {}) {
  const onPlace = vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  const listDocuments = props.listDocuments
    ?? vi.fn().mockResolvedValue([doc({ id: 'ready-1' })]);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <KnowledgeExistingPdfPicker
        isOpen
        boardId={BOARD}
        placedDocumentIds={[]}
        onClose={onClose}
        onPlace={onPlace}
        listDocuments={listDocuments as never}
        {...props}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
  const rowFor = (id: string) =>
    host!.querySelector(`[data-existing-pdf-id="${id}"] button`) as HTMLButtonElement | null;
  return { onPlace, onClose, listDocuments, rowFor };
}

describe('3. the picker reads the board listing, and nothing else', () => {
  it('loads through the shared board-scoped helper on open', async () => {
    const listDocuments = vi.fn().mockResolvedValue([doc({ id: 'ready-1' })]);
    const { rowFor } = await render({ listDocuments: listDocuments as never });
    expect(listDocuments).toHaveBeenCalledExactlyOnceWith(BOARD);
    expect(rowFor('ready-1')).toBeTruthy();
  });

  it('9. never uploads or creates a Knowledge document', async () => {
    const listDocuments = vi.fn().mockResolvedValue([doc({ id: 'ready-1' })]);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { rowFor, onPlace } = await render({ listDocuments: listDocuments as never });
    await act(async () => { rowFor('ready-1')!.click(); });
    // Placement only: no POST, no storage write, no worker enqueue.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onPlace).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('does not fetch while closed', async () => {
    const listDocuments = vi.fn().mockResolvedValue([]);
    await render({ isOpen: false, listDocuments: listDocuments as never });
    expect(listDocuments).not.toHaveBeenCalled();
  });
});

describe('4/5/7. selecting a ready document places the same durable source', () => {
  it('hands the placement authority the document identity unchanged', async () => {
    const { rowFor, onPlace, onClose } = await render({
      listDocuments: vi.fn().mockResolvedValue([
        doc({ id: 'cd308c08', originalFilename: 'My fancy padlet-slideshow.pdf', pageCount: 7 }),
      ]) as never,
    });
    const row = rowFor('cd308c08')!;
    expect(row.disabled).toBe(false);
    await act(async () => { row.click(); });

    expect(onPlace).toHaveBeenCalledExactlyOnceWith({
      id: 'cd308c08',
      originalFilename: 'My fancy padlet-slideshow.pdf',
      processingStatus: 'ready',
    });
    // A confirmed placement closes the chooser.
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('7. a document whose placement was deleted is selectable again', async () => {
    // The core regression: durable document present, no card references it.
    const { rowFor, onPlace } = await render({
      placedDocumentIds: [],
      listDocuments: vi.fn().mockResolvedValue([doc({ id: 'orphaned' })]) as never,
    });
    expect(rowFor('orphaned')!.disabled).toBe(false);
    await act(async () => { rowFor('orphaned')!.click(); });
    expect(onPlace).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'orphaned' }));
  });
});

describe('6/8. rows that cannot be placed say why instead of doing nothing', () => {
  it('6. a document already on this board is disabled and labelled', async () => {
    const { rowFor, onPlace } = await render({
      placedDocumentIds: ['on-board'],
      listDocuments: vi.fn().mockResolvedValue([doc({ id: 'on-board' })]) as never,
    });
    const row = rowFor('on-board')!;
    expect(row.disabled).toBe(true);
    expect(row.textContent).toContain('Already on board');
    await act(async () => { row.click(); });
    expect(onPlace).not.toHaveBeenCalled();
  });

  it('8. non-ready documents are visible but not selectable', async () => {
    const { rowFor, onPlace } = await render({
      listDocuments: vi.fn().mockResolvedValue([
        doc({ id: 'uploaded-1', processingStatus: 'uploaded' }),
        doc({ id: 'processing-1', processingStatus: 'processing' }),
        doc({ id: 'failed-1', processingStatus: 'failed' }),
      ]) as never,
    });
    expect(rowFor('uploaded-1')!.disabled).toBe(true);
    expect(rowFor('processing-1')!.disabled).toBe(true);
    expect(rowFor('failed-1')!.disabled).toBe(true);
    expect(rowFor('processing-1')!.textContent).toContain('Preparing');
    expect(rowFor('failed-1')!.textContent).toContain('Unavailable');
    for (const id of ['uploaded-1', 'processing-1', 'failed-1']) {
      await act(async () => { rowFor(id)!.click(); });
    }
    expect(onPlace).not.toHaveBeenCalled();
  });

  it('shows an empty state rather than a blank panel', async () => {
    await render({ listDocuments: vi.fn().mockResolvedValue([]) as never });
    expect(host!.textContent).toContain('No existing PDFs available');
  });

  it('exposes no raw document id to the reader', async () => {
    // Filename deliberately unrelated to the id, so the assertion tests the UI
    // rather than the fixture's own naming.
    await render({
      listDocuments: vi.fn().mockResolvedValue([
        doc({ id: 'cd308c08-39f9-46ca', originalFilename: 'My fancy padlet-slideshow.pdf' }),
      ]) as never,
    });
    expect(host!.textContent).toContain('My fancy padlet-slideshow.pdf');
    expect(host!.textContent).not.toContain('cd308c08-39f9-46ca');
  });
});

describe('13. a failed placement is never reported as success', () => {
  it('keeps the chooser open and surfaces the failure', async () => {
    const onPlace = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    const { rowFor } = await render({
      onPlace, onClose,
      listDocuments: vi.fn().mockResolvedValue([doc({ id: 'ready-1' })]) as never,
    });
    await act(async () => { rowFor('ready-1')!.click(); });
    expect(onClose).not.toHaveBeenCalled();
    expect(host!.textContent).toContain('Could not add that PDF');
  });

  it('survives a rejecting placement authority', async () => {
    const onPlace = vi.fn().mockRejectedValue(new Error('insert failed'));
    const onClose = vi.fn();
    const { rowFor } = await render({
      onPlace, onClose,
      listDocuments: vi.fn().mockResolvedValue([doc({ id: 'ready-1' })]) as never,
    });
    await act(async () => { rowFor('ready-1')!.click(); });
    expect(onClose).not.toHaveBeenCalled();
    expect(host!.textContent).toContain('Could not add that PDF');
  });

  it('reports a failed list load without pretending it is empty', async () => {
    await render({ listDocuments: vi.fn().mockRejectedValue(new Error('down')) as never });
    expect(host!.textContent).toContain('temporarily unavailable');
    expect(host!.textContent).not.toContain('No existing PDFs available');
  });
});

describe('1/2/10/11/12. wiring and negative controls', () => {
  const registry = fs.readFileSync(
    path.join(process.cwd(), 'components/collabboard/canvas/ui/canvasToolbarRegistry.tsx'), 'utf8');
  const sidebar = fs.readFileSync(
    path.join(process.cwd(), 'components/collabboard/canvas/ui/CanvasSidebar.tsx'), 'utf8');
  const client = fs.readFileSync(
    path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');

  it('1. Add PDF keeps its native label activation', () => {
    expect(registry).toContain('type: "knowledge-pdf", pinned: true, activatesInputId: KNOWLEDGE_PDF_INPUT_ID');
    // The sidebar still renders that tool as a real <label htmlFor>.
    expect(sidebar).toContain('htmlFor={tool.activatesInputId}');
  });

  it('2. Use existing PDF is a plain tool under the same layout gate', () => {
    expect(registry).toContain('type: "knowledge-pdf-existing"');
    // No native input activation on the new entry -- it must not open a dialog.
    const entry = registry.slice(
      registry.indexOf('Use existing PDF') - 200, registry.indexOf('Use existing PDF') + 200);
    expect(entry).not.toContain('activatesInputId');
    // Both entries live inside the same isDirectPdfLayout branch.
    const gateStart = registry.indexOf('isDirectPdfLayout ? [');
    const gated = registry.slice(gateStart, registry.indexOf('] : []', gateStart));
    expect(gated).toContain('knowledge-pdf-existing');
  });

  it('2b. the chooser is withheld from viewers and unsupported layouts', () => {
    expect(client).toContain('isOpen={isExistingPdfPickerOpen && canUseCanvasToolbar && canPlaceDirectPdf}');
  });

  it('10. both entry points share one placement authority', () => {
    // One handler, one descriptor type, one insert path.
    expect(client).toContain('const handleKnowledgePdfUploaded = useCallback(async (document: KnowledgePdfPlacementSource)');
    expect(client).toContain('onPlace={handleKnowledgePdfUploaded}');
    expect(client).toContain('onKnowledgePdfUploaded={handleKnowledgePdfUploaded}');
    expect(client).toContain('insertPostPreservingFailureChannels(placement as any)');
    // No second placement implementation was introduced.
    expect(client.match(/knowledgeDisplayMode: 'preview'/g) ?? []).toHaveLength(1);
  });

  it('12. the placed card carries the metadata the reader already consumes', () => {
    const handler = client.slice(
      client.indexOf('const handleKnowledgePdfUploaded'),
      client.indexOf('PDF reentry. A Knowledge document is durable'));
    for (const field of ['knowledgeDocumentId: document.id',
      'knowledgeOriginalFilename: document.originalFilename',
      'knowledgeProcessingStatus: document.processingStatus',
      "knowledgeDisplayMode: 'preview'"]) {
      expect(handler).toContain(field);
    }
    expect(handler).toContain("type: 'file'");
  });

  it('11. no Library coupling', () => {
    const picker = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/KnowledgeExistingPdfPicker.tsx'), 'utf8');
    for (const forbidden of ['library_items', 'library_item_id', 'LibraryPanel']) {
      expect(picker).not.toContain(forbidden);
    }
  });
});
