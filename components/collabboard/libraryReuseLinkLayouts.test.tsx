// @vitest-environment jsdom
//
// IMAGE_LIBRARY_NONFREEFORM_LINK_1 -- the durable Library identity must survive
// reuse into EVERY supported layout, not just Freeform.
//
// Library identity is layout-agnostic: placing an existing Library image on a
// Timeline, a Scheduler slot, a Row/Column container or a Drawing board is
// REUSE. Each gesture creates one new placement that REFERENCES the same
// library_items row -- it never mints a second Library object, never calls the
// atomic NEW-image RPC, and never re-uploads or copies the asset.
//
// Freeform's own transport is pinned in libraryReuseLinkTransport.test.tsx; the
// DB-side guarantees (one object / many placements, and the delete semantics in
// both directions) are proved against real PostgreSQL in
// scripts/db/imagePostLibraryAuthorization.test.ts.
//
// Every builder below mirrors ONE real placement writer, and the final block
// pins each of those writers by source so a builder cannot silently drift away
// from the site it stands for.
import { describe, expect, it } from 'vitest';
import type { LibraryItem, LibraryItemContent } from '@/lib/collabboard/library';

const LIBRARY_MIME = 'application/collabboard-library';
const IMAGE = 'https://example.test/library-image.png';

const L: LibraryItem = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  user_id: 'user-1',
  title: 'Saved image',
  type: 'image',
  content: {
    title: 'Saved image',
    content: '',
    type: 'image',
    width: 300,
    height: 200,
    file_url: IMAGE,
    metadata: { imageUrl: IMAGE },
  },
  is_public: false,
  created_at: '',
  updated_at: '',
};

/** Exactly what LibraryPanel's dragstart writes -- unchanged by this slice. */
const dragPayload = (source: LibraryItem) =>
  JSON.stringify({ ...source.content, libraryItemId: source.id });

/** A pre-durable-id drag, or a snapshot with no Library row behind it. */
const legacyPayload = (source: LibraryItem) => JSON.stringify(source.content);

class FakeDataTransfer {
  private readonly store = new Map<string, string>();
  setData(type: string, value: string) { this.store.set(type, value); }
  getData(type: string) { return this.store.get(type) ?? ''; }
}

const readLibraryDrop = (raw: string) => {
  const dt = new FakeDataTransfer();
  dt.setData(LIBRARY_MIME, raw);
  return JSON.parse(dt.getData(LIBRARY_MIME)) as LibraryItemContent & Record<string, unknown>;
};

// --- The five placement writers, one builder each -------------------------

/**
 * CanvasClient's SECOND (layout-aware / container) Library-drop path. The draft
 * it builds feeds both the drawing-container branch and the direct insert.
 */
const canvasClientLayoutAwareDraft = (itemContent: Record<string, any>) => {
  const fileUrl = itemContent.file_url || itemContent.metadata?.file_url || itemContent.metadata?.imageUrl;
  return {
    type: itemContent.type || 'text',
    title: itemContent.title || 'Untitled',
    content: itemContent.content || '',
    width: itemContent.width || 300,
    height: itemContent.height || 200,
    file_url: fileUrl || null,
    library_item_id: itemContent.libraryItemId ?? null,
    metadata: { imageUrl: itemContent.metadata?.imageUrl || fileUrl, file_url: fileUrl },
  };
};

/** ChronoTimelineCanvas normalises the drag, CanvasClient writes the row. */
const timelineDraft = (libData: Record<string, any>) => {
  const fileUrl = libData.file_url || libData.metadata?.file_url || libData.metadata?.imageUrl;
  return {
    type: libData.type || 'text',
    title: libData.title || 'Untitled',
    content: libData.content || '',
    width: libData.width || 300,
    height: libData.height || 200,
    file_url: fileUrl,
    library_item_id: libData.libraryItemId ?? null,
    metadata: { imageUrl: libData.metadata?.imageUrl || fileUrl, file_url: fileUrl },
  };
};

const timelineContainerRow = (draftPayload: Record<string, any>, containerId: string, position: number) => ({
  board_id: 'canvas-1',
  title: draftPayload.title || 'New Post',
  content: draftPayload.content || '',
  type: draftPayload.type || 'text',
  width: draftPayload.width || 300,
  height: draftPayload.height || 200,
  file_url: draftPayload.file_url || null,
  library_item_id: draftPayload.library_item_id ?? null,
  metadata: { ...draftPayload.metadata, parentId: containerId, position_in_timeline: position },
});

/** StandaloneSchedulerCanvas forwards the parsed payload verbatim; CanvasClient writes. */
const schedulerRow = (payload: Record<string, any>, slot: { start: string; end: string }) => {
  const fileUrl = payload.file_url || payload.metadata?.file_url || payload.metadata?.imageUrl;
  return {
    board_id: 'canvas-1',
    title: payload.title || 'New Post',
    content: payload.content || '',
    type: payload.type || 'text',
    width: payload.width || 300,
    height: payload.height || 200,
    file_url: fileUrl || null,
    library_item_id: (payload.libraryItemId as string | undefined) ?? null,
    metadata: { start_date: slot.start, end_date: slot.end, imageUrl: fileUrl },
  };
};

/** DrawingLayout's canvas drop -> the staged draft the container prompt reads. */
const drawingCanvasDraft = (item: Record<string, any>) => ({
  type: item.type || item.kind || 'note',
  title: item.title || 'Library Item',
  content: typeof item.content === 'string' ? item.content : '',
  width: item.width || 320,
  height: item.height || 280,
  file_url: item.file_url || item.metadata?.imageUrl || undefined,
  library_item_id: item.libraryItemId ?? null,
  metadata: { ...(item.metadata || {}), forceContainerPrompt: true },
});

/** CanvasClient's "New Container" branch of the drawing prompt. */
const drawingNewContainerChildRow = (pendingDraft: Record<string, any>, containerId: string) => {
  const { forceContainerPrompt: _f, ...childMetadata } = pendingDraft.metadata || {};
  return {
    board_id: 'canvas-1',
    title: pendingDraft.title || '',
    content: pendingDraft.content || '',
    type: pendingDraft.type || 'image',
    width: pendingDraft.width || 300,
    height: pendingDraft.height || 200,
    file_url: pendingDraft.file_url || undefined,
    library_item_id: pendingDraft.library_item_id ?? null,
    metadata: { ...childMetadata, parentId: containerId },
  };
};

/**
 * DrawingLayout's container drop. Two payload shapes land here: a direct
 * Library drag (`libraryItemId`) and a ghost draft re-serialised from a staged
 * placement draft (already the `library_item_id` column name).
 */
const drawingContainerChildRow = (libData: Record<string, any>, containerId: string) => ({
  board_id: 'canvas-1',
  type: libData.type || libData.kind || 'text',
  title: libData.title || 'New Post',
  content: typeof libData.content === 'string' ? libData.content : '',
  file_url: libData.file_url || undefined,
  width: libData.width || 300,
  height: libData.height || 200,
  library_item_id: libData.libraryItemId ?? libData.library_item_id ?? null,
  metadata: { parentId: containerId },
});

/** RowColumnContainerCard normalises the drag; the container writer inserts it. */
const rowColumnDraft = (libData: Record<string, any>) => {
  const fileUrl = libData.file_url || libData.metadata?.file_url || libData.metadata?.imageUrl;
  return {
    type: libData.type || 'text',
    title: libData.title || 'Untitled',
    content: libData.content || '',
    width: libData.width || 300,
    height: libData.height || 200,
    file_url: fileUrl,
    library_item_id: libData.libraryItemId ?? null,
    metadata: { imageUrl: libData.metadata?.imageUrl || fileUrl, file_url: fileUrl },
  };
};

/** CanvasClient's generic container writer -- a spread, so the link rides through. */
const containerRowFromDraft = (
  draftPayload: Record<string, any>,
  containerId: string,
): Record<string, any> => ({
  ...draftPayload,
  board_id: 'canvas-1',
  position_x: 0,
  position_y: 0,
  metadata: { ...draftPayload.metadata, parentId: containerId },
});

// --- Per-path proofs ------------------------------------------------------

const paths: ReadonlyArray<{
  readonly name: string;
  readonly place: (parsed: Record<string, any>) => Record<string, any>;
}> = [
  {
    name: 'CanvasClient second (layout-aware/container) path',
    place: (parsed) => canvasClientLayoutAwareDraft(parsed),
  },
  {
    name: 'Timeline',
    place: (parsed) => timelineContainerRow(timelineDraft(parsed), 'container-1', 0),
  },
  {
    name: 'Scheduler',
    place: (parsed) => schedulerRow(parsed, { start: '2026-01-01T09:00:00.000Z', end: '2026-01-01T10:00:00.000Z' }),
  },
  {
    name: 'Drawing',
    place: (parsed) => drawingNewContainerChildRow(drawingCanvasDraft(parsed), 'container-1'),
  },
  {
    name: 'Row/Column',
    place: (parsed) => containerRowFromDraft(rowColumnDraft(parsed), 'container-1'),
  },
];

describe.each(paths)('Library reuse into $name', ({ place }) => {
  it('links the placement to the durable Library item', () => {
    const row = place(readLibraryDrop(dragPayload(L)));
    expect(row.library_item_id).toBe(L.id);
  });

  it('keeps the content snapshot and the same asset -- nothing is copied', () => {
    const row = place(readLibraryDrop(dragPayload(L)));
    // Rendering stays on the placement's own snapshot, so a collaborator never
    // needs SELECT on another user's private library_items row.
    expect(row.title).toBe('Saved image');
    expect(row.type).toBe('image');
    expect(row.width).toBe(300);
    expect(row.file_url).toBe(IMAGE);
    expect(row.metadata?.imageUrl ?? row.file_url).toBe(IMAGE);
  });

  it('creates no Library object -- the placement only ever references one', () => {
    const row = place(readLibraryDrop(dragPayload(L)));
    // A placement row carries the reference and nothing that could mint a
    // second durable object: no library_items payload, no RPC arguments.
    expect(Object.keys(row)).not.toContain('libraryItemId');
    expect(row).not.toHaveProperty('library_items');
    expect(JSON.stringify(row)).not.toContain('create_image_post_with_library_item');
  });

  it('accepts a legacy payload with no durable id and links nothing', () => {
    const row = place(readLibraryDrop(legacyPayload(L)));
    expect(row.library_item_id).toBeNull();
    // The drop still succeeds and the snapshot still renders.
    expect(row.file_url).toBe(IMAGE);
    expect(row.title).toBe('Saved image');
  });
});

describe('Drawing ghost draft -- the negative control', () => {
  /**
   * The ghost is DrawingLayout's own "Add to Existing" affordance. It reuses
   * the Library MIME as transport for a staged draft that has no Library row
   * behind it, so it must never acquire a durable link it did not earn.
   */
  const ghostFromNonLibraryDraft = {
    type: 'image',
    title: 'Drawn image',
    content: '',
    width: 300,
    height: 200,
    file_url: 'https://example.test/drawn.png',
    metadata: {},
  };

  it('a ghost that was never Library-backed places with a NULL link', () => {
    const parsed = readLibraryDrop(JSON.stringify(ghostFromNonLibraryDraft));
    const row = drawingContainerChildRow(parsed, 'container-1');
    expect(row.library_item_id).toBeNull();
    // ...and its existing placement behavior is otherwise untouched.
    expect(row.title).toBe('Drawn image');
    expect(row.file_url).toBe('https://example.test/drawn.png');
    expect(row.metadata.parentId).toBe('container-1');
  });

  it('a real Library drag onto the same drop still links correctly', () => {
    const row = drawingContainerChildRow(readLibraryDrop(dragPayload(L)), 'container-1');
    expect(row.library_item_id).toBe(L.id);
    expect(row.file_url).toBe(IMAGE);
  });

  it('a ghost staged FROM a Library reuse keeps the link it already earned', () => {
    // The prompt stages the draft, the ghost re-serialises it, and the drop
    // reads it back -- the durable id must not be lost across that round trip.
    const staged = drawingCanvasDraft(readLibraryDrop(dragPayload(L)));
    const row = drawingContainerChildRow(readLibraryDrop(JSON.stringify(staged)), 'container-1');
    expect(row.library_item_id).toBe(L.id);
  });
});

describe('One Library item, many placements across layouts', () => {
  it('reuses a single durable object into every supported layout', () => {
    const parsed = readLibraryDrop(dragPayload(L));

    // Freeform's own writer, pinned in libraryReuseLinkTransport.test.tsx.
    const freeform = { file_url: parsed.file_url, library_item_id: parsed.libraryItemId ?? null };
    const placements = [
      freeform,
      timelineContainerRow(timelineDraft(parsed), 'c-timeline', 0),
      schedulerRow(parsed, { start: '2026-01-01T09:00:00.000Z', end: '2026-01-01T10:00:00.000Z' }),
      containerRowFromDraft(rowColumnDraft(parsed), 'c-rowcol'),
      drawingNewContainerChildRow(drawingCanvasDraft(parsed), 'c-drawing'),
      canvasClientLayoutAwareDraft(parsed),
    ];

    // Exactly one durable object stands behind all of them.
    expect(new Set(placements.map((p) => p.library_item_id))).toEqual(new Set([L.id]));
    // Same asset everywhere -- reuse never re-uploads or copies the image.
    expect(placements.every((p) => p.file_url === IMAGE)).toBe(true);
  });

  it('keeps each placement independent in its own layout-local state', () => {
    const parsed = readLibraryDrop(dragPayload(L));
    const timeline = timelineContainerRow(timelineDraft(parsed), 'c-timeline', 2);
    const scheduler = schedulerRow(parsed, { start: '2026-02-02T08:00:00.000Z', end: '2026-02-02T09:00:00.000Z' });
    const rowcol = containerRowFromDraft(rowColumnDraft(parsed), 'c-rowcol');

    expect(timeline.library_item_id).toBe(scheduler.library_item_id);
    expect(timeline.library_item_id).toBe(rowcol.library_item_id);
    // Layout-local geometry, ordering and slot metadata stay independent.
    expect(timeline.metadata.position_in_timeline).toBe(2);
    expect(timeline.metadata.parentId).toBe('c-timeline');
    expect(scheduler.metadata.start_date).toBe('2026-02-02T08:00:00.000Z');
    expect(scheduler.metadata.end_date).toBe('2026-02-02T09:00:00.000Z');
    expect(rowcol.metadata.parentId).toBe('c-rowcol');
    expect(scheduler.metadata).not.toHaveProperty('position_in_timeline');
  });
});

describe('the real placement writers are the ones modelled above', () => {
  const read = async (p: string) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    return fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
  };

  it('every non-freeform placement writer forwards the durable id', async () => {
    const canvasClient = await read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    // CanvasClient second (layout-aware/container) Library-drop path.
    expect(canvasClient).toContain('library_item_id: itemContent.libraryItemId ?? null');
    // Timeline line-drop container writer.
    expect(canvasClient).toContain('library_item_id: draftPayload.library_item_id ?? null');
    // Scheduler slot writer.
    expect(canvasClient).toContain('library_item_id: (payload.libraryItemId as string | undefined) ?? null');
    // Drawing "New Container" branch of the placement prompt.
    expect(canvasClient).toContain('library_item_id: (drawingPendingDraft as any).library_item_id ?? null');
    // Freeform's existing link is untouched by this slice.
    expect(canvasClient).toContain('library_item_id: content.libraryItemId ?? null');

    const timeline = await read('components/canvas/ChronoTimelineCanvas.tsx');
    // Both timeline drops: the line (new container) and an existing container.
    expect(timeline.match(/library_item_id: libData\.libraryItemId \?\? null/g)).toHaveLength(2);

    const rowColumn = await read('components/collabboard/RowColumnContainerCard.tsx');
    expect(rowColumn).toContain('library_item_id: libData.libraryItemId ?? null');

    const drawing = await read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
    expect(drawing).toContain('library_item_id: item.libraryItemId ?? null');
    expect(drawing).toContain('library_item_id: libData.libraryItemId ?? libData.library_item_id ?? null');
  });

  it('no path mints a Library object, calls the NEW-image RPC, or copies the asset', async () => {
    for (const file of [
      'app/dashboard/canvas/[id]/CanvasClient.tsx',
      'components/canvas/ChronoTimelineCanvas.tsx',
      'components/canvas/StandaloneSchedulerCanvas.tsx',
      'components/collabboard/RowColumnContainerCard.tsx',
      'components/collabboard/canvas/layouts/DrawingLayout.tsx',
    ]) {
      const source = await read(file);
      expect(source).not.toContain('create_image_post_with_library_item');
      expect(source).not.toMatch(/from\s*\(\s*['"]library_items['"]\s*\)\s*\n?\s*\.insert/);
    }
  });

  it('the drag contract and the NEW-image flows are unchanged', async () => {
    // The producer still ships the id beside the snapshot -- no reshaped
    // { libraryItemId, content } envelope, no renamed field, no new MIME.
    expect(await read('components/collabboard/LibraryPanel.tsx'))
      .toContain('JSON.stringify({ ...item.content, libraryItemId: item.id })');
    // The atomic NEW-image RPC stays the only creator of Library objects.
    expect(await read('lib/server/knowledge/knowledgePdfAreaImageRoute.ts'))
      .toContain('create_image_post_with_library_item');
  });
});
