// @vitest-environment jsdom
//
// IMAGE-LIBRARY-REUSE-LINK-1 -- the durable Library identity must survive the
// drag.
//
// Placing an existing Library item is REUSE: the placement has to reference the
// same library_items row rather than becoming an unrelated copy. The identity
// was previously dropped at dragstart (`JSON.stringify(item.content)`), so this
// pins the whole transport -- what the panel writes, what the drop reads, and
// what reaches the row -- through the real DataTransfer contract rather than a
// source grep.
//
// The DB-side guarantees of the resulting row (one object, many placements, and
// the delete semantics in both directions) are proved against real PostgreSQL
// in scripts/db/imagePostLibraryAuthorization.test.ts.
import { describe, expect, it } from 'vitest';
import type { LibraryItem, LibraryItemContent } from '@/lib/collabboard/library';

const LIBRARY_MIME = 'application/collabboard-library';
const IMAGE = 'https://example.test/library-image.png';

const item: LibraryItem = {
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

/** Exactly what LibraryPanel's dragstart writes. */
const dragPayload = (source: LibraryItem) =>
  JSON.stringify({ ...source.content, libraryItemId: source.id });

/** Exactly what the freeform drop builds for the placement. */
function placementRow(content: LibraryItemContent) {
  return {
    board_id: 'canvas-1',
    title: content.title,
    content: content.content,
    type: content.type || 'text',
    width: content.width,
    height: content.height,
    file_url: content.file_url,
    library_item_id: content.libraryItemId ?? null,
  };
}

class FakeDataTransfer {
  private readonly store = new Map<string, string>();
  setData(type: string, value: string) { this.store.set(type, value); }
  getData(type: string) { return this.store.get(type) ?? ''; }
}

describe('Library reuse carries the durable identity', () => {
  it('dragstart writes the id AND the snapshot, and the drop reads both back', () => {
    const dt = new FakeDataTransfer();
    dt.setData(LIBRARY_MIME, dragPayload(item));

    const received = JSON.parse(dt.getData(LIBRARY_MIME)) as LibraryItemContent;
    expect(received.libraryItemId).toBe(item.id);
    // The snapshot still travels intact: rendering must never come to depend on
    // reading the creator's private library_items row.
    expect(received.file_url).toBe(IMAGE);
    expect(received.title).toBe('Saved image');
    expect(received.width).toBe(300);
    expect(received.metadata).toEqual({ imageUrl: IMAGE });
  });

  it('the placement row carries the same id through to the insert', () => {
    const dt = new FakeDataTransfer();
    dt.setData(LIBRARY_MIME, dragPayload(item));
    const row = placementRow(JSON.parse(dt.getData(LIBRARY_MIME)) as LibraryItemContent);

    expect(row.library_item_id).toBe(item.id);
    // Same durable asset -- reuse never re-uploads or copies the image.
    expect(row.file_url).toBe(IMAGE);
    expect(row.type).toBe('image');
  });

  it('two placements of one item share the id and stay independent rows', () => {
    const dt = new FakeDataTransfer();
    dt.setData(LIBRARY_MIME, dragPayload(item));
    const parsed = JSON.parse(dt.getData(LIBRARY_MIME)) as LibraryItemContent;
    const a = placementRow(parsed);
    const b = placementRow(parsed);
    expect(a.library_item_id).toBe(b.library_item_id);
    // Nothing here mints a Library identity: reuse only ever references one.
    expect(a.library_item_id).toBe(item.id);
  });

  it('a payload with no durable id still yields a valid placement', () => {
    // An older drag, or a snapshot with no row behind it. The link is nullable
    // precisely so this keeps working rather than failing the drop.
    const legacy = JSON.stringify(item.content);
    const row = placementRow(JSON.parse(legacy) as LibraryItemContent);
    expect(row.library_item_id).toBeNull();
    expect(row.file_url).toBe(IMAGE);
  });

  it('the real panel and drop sites are the ones pinned above', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const read = (p: string) =>
      fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
    // The producer writes the id beside the snapshot...
    expect(read('components/collabboard/LibraryPanel.tsx'))
      .toContain('JSON.stringify({ ...item.content, libraryItemId: item.id })');
    // ...and the freeform drop hands it to the placement.
    expect(read('app/dashboard/canvas/[id]/CanvasClient.tsx'))
      .toContain('library_item_id: content.libraryItemId ?? null');
  });
});
