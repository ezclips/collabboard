// @vitest-environment jsdom
//
// IMAGE_LIBRARY_RUNTIME_EVIDENCE_2 defect D -- annotations are DURABLE IMAGE
// CONTENT, so they belong to the Library object, not to one placement.
//
// Observed against production: an Image was created from a PDF area (one
// Library object, correct), then annotated on the board with drawing and text.
// The board showed the annotations; the Library object still showed the
// original crop. The save path updated `padlets.file_url` / `padlets.metadata`
// and never touched the linked `library_items` row, so the durable snapshot
// stayed frozen at creation time.
//
// The ruling this pins: the Library object owns image content, drawing content,
// text content, provenance and identity; the placement owns board id, position,
// size and layout. Editing any placement linked to a Library Image therefore
// edits that ONE durable object -- no second Library item, no fork, no
// re-uploaded asset.
//
// This mounts the REAL usePadletSave hook, so it asserts what the Done handler
// actually sends.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { usePadletSave } from '@/hooks/canvas';
import { supabaseBrowser } from '@/lib/supabase/browser';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

const ORIGINAL = 'https://example.test/crop-original.webp';
const ANNOTATED = 'https://example.test/crop-with-drawing.webp';
const LIBRARY_ID = 'library-item-1';
const PADLET_ID = 'padlet-1';

interface Write { table: string; payload: Record<string, unknown>; id: string }

/**
 * Records every table write with its table name, so the durable-object update
 * can be asserted rather than inferred. `ownedLibraryIds` models the RLS policy
 * `Users can update their own library items` (auth.uid() = user_id): a write to
 * a row the caller does not own matches nothing and changes nothing.
 */
function installFakeSupabase(ownedLibraryIds: readonly string[] = [LIBRARY_ID]) {
  const writes: Write[] = [];
  const rpcCalls: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    async rpc(fn: string) { rpcCalls.push(fn); return { data: [], error: null }; },
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          writes.push({ table, payload: row, id: '(insert)' });
          const created = { ...row, id: 'direct-insert' };
          return {
            select: () => ({ single: async () => ({ data: created, error: null }) }),
            then: (resolve: (v: unknown) => void) => resolve({ data: created, error: null }),
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq: async (_column: string, id: string) => {
              if (table === 'library_items' && !ownedLibraryIds.includes(id)) {
                // RLS refuses: the statement runs, matches no row, changes nothing.
                return { data: [], error: null };
              }
              writes.push({ table, payload, id });
              return { data: null, error: null };
            },
          };
        },
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
  return { writes, rpcCalls };
}

const linkedImagePadlet = (libraryItemId: string | null): Padlet => ({
  id: PADLET_ID,
  board_id: 'canvas-1',
  title: 'Wing diagram',
  content: '',
  type: 'image',
  position_x: 40,
  position_y: 60,
  width: 420,
  height: 300,
  file_url: ORIGINAL,
  created_at: '',
  updated_at: '',
  library_item_id: libraryItemId,
  metadata: { imageUrl: ORIGINAL },
});

type SaveApi = ReturnType<typeof usePadletSave>;
let api: SaveApi | null = null;

function Harness({ padletToEdit }: { padletToEdit: Padlet | null }) {
  const [padlets, setPadlets] = React.useState<Padlet[]>([padletToEdit].filter(Boolean) as Padlet[]);
  api = usePadletSave({
    canvasId: 'canvas-1', padletToEdit,
    isImageEditorOpen: true,
    isWallLayout: false, isColumnsLayout: false, isGridLayout: false,
    isDrawingLayout: false, isTimelineLayout: false, isSchedulerLayout: false,
    isFreeformLayout: true, isMapLayout: false,
    setPadletToEdit: () => {}, fetchData: async () => {},
    setIsNoteEditorOpen: () => {}, setIsLinkEditorOpen: () => {}, setIsTodoEditorOpen: () => {},
    setIsTableEditorOpen: () => {}, setIsContainerEditorOpen: () => {},
    setIsCommentEditorOpen: () => {}, setIsCardEditorOpen: () => {},
    setIsImageEditorOpen: () => {}, setIsDrawingEditorOpen: () => {},
    setIsAIComponentEditorOpen: () => {},
    setPendingPostDraft: () => {}, setIsPlacementPromptOpen: () => {},
    setWallPendingPostDraft: () => {}, setWallPlacementPromptOpen: () => {},
    padlets, setPadlets,
    getNewPostPosition: () => ({ x: 10, y: 20 }),
  });
  return null;
}

let mounted: Root[] = [];
function mount(padletToEdit: Padlet | null) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push(root);
  act(() => root.render(<Harness padletToEdit={padletToEdit} />));
}

/** The annotated save the image editor emits: same asset address, new content. */
const saveAnnotated = async () => {
  await act(async () => {
    await api!.saveImage({
      imageUrl: ANNOTATED,
      source: 'upload',
      drawing: 'data:image/png;base64,ANNOTATIONLAYER',
    } as never);
  });
};

afterEach(() => {
  act(() => { mounted.splice(0).forEach((r) => r.unmount()); });
  document.body.innerHTML = '';
  api = null;
  vi.clearAllMocks();
});

describe('defect D: annotations are durable Library content', () => {
  it('an annotated save updates the placement AND the linked Library object', async () => {
    const { writes } = installFakeSupabase();
    mount(linkedImagePadlet(LIBRARY_ID));
    await saveAnnotated();

    const padletWrite = writes.find((w) => w.table === 'padlets');
    const libraryWrite = writes.find((w) => w.table === 'library_items');

    expect(padletWrite, 'the board placement must still be updated').toBeTruthy();
    expect(padletWrite!.payload.file_url).toBe(ANNOTATED);

    expect(libraryWrite, 'the linked durable object must be updated too').toBeTruthy();
    expect(libraryWrite!.id).toBe(LIBRARY_ID);
    const content = libraryWrite!.payload.content as Record<string, unknown>;
    expect(content.file_url, 'Library content must carry the annotated image').toBe(ANNOTATED);
    expect(content.type).toBe('image');
    expect((content.metadata as Record<string, unknown>).imageUrl).toBe(ANNOTATED);
    // Not thumbnail-only: the renderer reads content, so both move together.
    expect(libraryWrite!.payload.thumbnail_url).toBe(ANNOTATED);
  });

  it('writes ONE Library row and mints no new identity', async () => {
    const { writes, rpcCalls } = installFakeSupabase();
    mount(linkedImagePadlet(LIBRARY_ID));
    await saveAnnotated();

    const libraryWrites = writes.filter((w) => w.table === 'library_items');
    expect(libraryWrites).toHaveLength(1);
    expect(libraryWrites[0].id).toBe(LIBRARY_ID);
    // No second durable object, by any route.
    expect(writes.filter((w) => w.id === '(insert)')).toHaveLength(0);
    expect(rpcCalls).not.toContain('create_image_post_with_library_item');
    expect(libraryWrites[0].payload).not.toHaveProperty('id');
    expect(libraryWrites[0].payload).not.toHaveProperty('user_id');
  });

  it('carries the placement geometry into content, not the other way round', async () => {
    const { writes } = installFakeSupabase();
    mount(linkedImagePadlet(LIBRARY_ID));
    await saveAnnotated();

    const libraryWrite = writes.find((w) => w.table === 'library_items')!;
    const content = libraryWrite.payload.content as Record<string, unknown>;
    // The snapshot mirrors what create_image_post_with_library_item builds.
    expect(Object.keys(content).sort()).toEqual(
      ['content', 'file_url', 'height', 'metadata', 'title', 'type', 'width'].sort());
    // Board id and position are placement-owned and never enter the object.
    expect(content).not.toHaveProperty('board_id');
    expect(content).not.toHaveProperty('position_x');
    expect(content).not.toHaveProperty('position_y');
    // The padlet write must not try to move the placement.
    const padletWrite = writes.find((w) => w.table === 'padlets')!;
    expect(padletWrite.payload).not.toHaveProperty('position_x');
    expect(padletWrite.payload).not.toHaveProperty('library_item_id');
  });

  it('an unlinked Image updates only the placement', async () => {
    const { writes } = installFakeSupabase();
    mount(linkedImagePadlet(null));
    await saveAnnotated();

    expect(writes.filter((w) => w.table === 'padlets')).toHaveLength(1);
    expect(writes.filter((w) => w.table === 'library_items')).toHaveLength(0);
  });

  it('annotating a REUSED image the caller does not own changes no durable object', async () => {
    // RLS is the boundary, not a client-side check: the update is issued and
    // matches nothing. The placement still updates, so the board is correct.
    const { writes } = installFakeSupabase([]); // caller owns no library rows
    mount(linkedImagePadlet(LIBRARY_ID));
    await saveAnnotated();

    expect(writes.filter((w) => w.table === 'padlets')).toHaveLength(1);
    expect(writes.filter((w) => w.table === 'library_items')).toHaveLength(0);
  });
});
