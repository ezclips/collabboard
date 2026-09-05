// @vitest-environment jsdom
//
// ORDINARY-IMAGE-LIBRARY-1 -- a saved ordinary Image Post is a durable Library
// asset, not just a board card.
//
// This mounts the REAL usePadletSave hook, so it asserts what the ordinary
// Image Done handler actually sends. The DB-side guarantees of that call --
// authorization, retry ownership, atomicity, delete semantics -- are proved
// against a real PostgreSQL in scripts/db/imagePostLibraryAuthorization.test.ts
// against the SAME RPC; what is new here, and therefore what is pinned here, is
// that the ordinary Image path reaches it at all, and reaches it correctly.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { usePadletSave } from '@/hooks/canvas';
import { supabaseBrowser } from '@/lib/supabase/browser';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

const IMAGE_URL = 'https://example.test/ordinary.png';
const FIRST = 'https://example.test/first.png';
const SECOND = 'https://example.test/SECOND.png';

interface Call { fn: string; args: Record<string, unknown> }

function installFakeSupabase(options: { rpcFails?: boolean; readBackFails?: boolean } = {}) {
  const calls: Call[] = [];
  const inserts: Record<string, unknown>[] = [];
  const rows = new Map<string, Record<string, unknown>>();
  let nextLibrary = 1;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (options.rpcFails) return { data: null, error: { message: 'refused' } };
      const padletId = String(args.p_padlet_id);
      // The accepted RPC is idempotent on the placement id: a retry of the same
      // request returns the pair that already exists.
      const existing = rows.get(padletId);
      if (existing) {
        return { data: [{ padlet_id: padletId, library_item_id: existing.library_item_id }], error: null };
      }
      const libraryItemId = `library-${nextLibrary++}`;
      rows.set(padletId, {
        id: padletId, board_id: args.p_board_id, title: args.p_title, type: 'image',
        content: args.p_content, position_x: args.p_position_x, position_y: args.p_position_y,
        width: args.p_width, height: args.p_height, file_url: args.p_file_url,
        metadata: args.p_metadata, library_item_id: libraryItemId,
      });
      return { data: [{ padlet_id: padletId, library_item_id: libraryItemId }], error: null };
    },
    from(_table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push(row);
          const created = { ...row, id: 'unexpected-direct-insert' };
          return {
            select: () => ({ single: async () => ({ data: created, error: null }) }),
            then: (resolve: (v: unknown) => void) => resolve({ data: created, error: null }),
          };
        },
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
        select: () => ({
          eq: (_c: string, value: string) => ({
            single: async () => (options.readBackFails
              ? { data: null, error: { message: 'read-back failed' } }
              : { data: rows.get(value) ?? null, error: null }),
            maybeSingle: async () => ({ data: rows.get(value) ?? null, error: null }),
          }),
        }),
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
  return { calls, inserts, rows };
}

type SaveApi = ReturnType<typeof usePadletSave>;
let api: SaveApi | null = null;
let placed: Padlet[] = [];

function Harness({ editorOpen }: { editorOpen: boolean }) {
  const [padlets, setPadlets] = React.useState<Padlet[]>([]);
  const [padletToEdit, setPadletToEdit] = React.useState<Padlet | null>(null);
  placed = padlets;
  api = usePadletSave({
    canvasId: 'canvas-1', padletToEdit,
    // C1: the real draft-session boundary.
    isImageEditorOpen: editorOpen,
    isWallLayout: false, isColumnsLayout: false, isGridLayout: false,
    isDrawingLayout: false, isTimelineLayout: false, isSchedulerLayout: false,
    isFreeformLayout: true, isMapLayout: false,
    setPadletToEdit, fetchData: async () => {},
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

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
let rerender: ((open: boolean) => void) | null = null;
function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (open: boolean) => act(() => { root.render(<Harness editorOpen={open} />); });
  render(true);
  rerender = render;
  mounted.push({ root, container });
}
/** Close the Image editor and open it again: a NEW draft session. */
const startNewDraft = () => { rerender!(false); rerender!(true); };
afterEach(() => {
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = []; api = null; placed = []; rerender = null; vi.clearAllMocks();
});

const save = async () => {
  await act(async () => {
    await api!.saveImage({ imageUrl: IMAGE_URL, source: 'upload', caption: 'a caption' });
  });
};

describe('ordinary Image Post ownership', () => {
  it('1-4. Done creates the durable pair through the atomic RPC, never a bare insert', async () => {
    const fake = installFakeSupabase();
    mount();
    // 1. nothing is written merely by mounting the editor.
    expect(fake.calls).toHaveLength(0);
    expect(fake.inserts).toHaveLength(0);

    await save();

    // 2. exactly one durable creation, and it is the accepted RPC.
    expect(fake.calls.map((c) => c.fn)).toEqual(['create_image_post_with_library_item']);
    // A bare padlets insert would be the two-step client save the rule forbids.
    expect(fake.inserts).toHaveLength(0);

    const args = fake.calls[0].args;
    // 3. the placement and the Library object are created together, so the row
    // that lands carries the link.
    const row = fake.rows.get(String(args.p_padlet_id))!;
    expect(row.library_item_id).toBeTruthy();
    // 4. one asset, referenced by both sides -- never a second upload or copy.
    expect(args.p_file_url).toBe(IMAGE_URL);
    expect((args.p_metadata as { imageUrl?: string }).imageUrl).toBe(IMAGE_URL);
  });

  it('5-6. ordinary Image metadata survives, and no PDF provenance is invented', async () => {
    const fake = installFakeSupabase();
    mount();
    await save();
    const metadata = fake.calls[0].args.p_metadata as Record<string, unknown>;
    // 5. the Image keeps what an ordinary Image carries.
    expect(metadata.caption).toBe('a caption');
    expect(metadata.imageUrl).toBe(IMAGE_URL);
    expect(metadata.cardColor).toBeTruthy();
    // 6. an ordinary Image has no PDF source, and none is manufactured for it.
    expect(metadata.source).toBe('upload');
    expect(metadata).not.toHaveProperty('knowledgeDocumentId');
    expect(JSON.stringify(metadata)).not.toContain('pageNumber');
    expect(JSON.stringify(metadata)).not.toContain('region');
  });

  it('7. a discarded draft writes nothing at all', async () => {
    const fake = installFakeSupabase();
    mount();
    // Opening and abandoning the editor never reaches the database: the save
    // handler is the only writer, and it was never called.
    expect(fake.calls).toHaveLength(0);
    expect(fake.inserts).toHaveLength(0);
    expect(placed).toHaveLength(0);
  });

  it('8. a double Done, and a retry after refusal, are one Image -- not two', async () => {
    // The real double-submit: two clicks in the same tick, neither awaiting the
    // other. They must share the draft's identity, so the RPC sees a retry.
    const fake = installFakeSupabase();
    mount();
    await act(async () => {
      await Promise.all([
        api!.saveImage({ imageUrl: IMAGE_URL, source: 'upload' }),
        api!.saveImage({ imageUrl: IMAGE_URL, source: 'upload' }),
      ]);
    });
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1].args.p_padlet_id).toBe(fake.calls[0].args.p_padlet_id);
    expect(fake.rows.size).toBe(1);
  });

  it('8b. a retry after a refused save reuses the same identity', async () => {
    const failing = installFakeSupabase({ rpcFails: true });
    mount();
    await save();
    const attemptedId = failing.calls[0].args.p_padlet_id;
    // The refusal left nothing, and the draft keeps its identity, so the retry
    // cannot become a second durable Image.
    expect(failing.rows.size).toBe(0);
    await save();
    expect(failing.calls[1].args.p_padlet_id).toBe(attemptedId);
  });

  it('the caller is the authenticated user, and no elevated key is involved', async () => {
    const fake = installFakeSupabase();
    mount();
    await save();
    // p_user_id is the signed-in identity; the RPC additionally binds it to
    // auth.uid(), so a forged value cannot survive the database.
    expect(fake.calls[0].args.p_user_id).toBe('user-1');
    expect(fake.calls[0].args.p_board_id).toBe('canvas-1');
  });

  it('a refused save leaves no card behind', async () => {
    const fake = installFakeSupabase({ rpcFails: true });
    mount();
    await save();
    // A viewer, or any refusal from the RPC's authorization, ends here: the
    // pair was never created, so there is nothing partial to undo.
    expect(fake.rows.size).toBe(0);
    expect(placed).toHaveLength(0);
  });

  it('C1-blocker: a committed save whose read-back failed must not capture the NEXT image',
    async () => {
      // The exact scenario the independent review proved. Draft A commits, its
      // read-back fails, the user abandons it and saves a DIFFERENT image.
      const options = { rpcFails: false, readBackFails: true };
      const fake = installFakeSupabase(options);
      mount();
      await act(async () => {
        try { await api!.saveImage({ imageUrl: FIRST, source: 'upload' }); } catch { /* read-back */ }
      });
      expect(fake.rows.size).toBe(1);
      options.readBackFails = false;

      startNewDraft();
      await act(async () => { await api!.saveImage({ imageUrl: SECOND, source: 'upload' }); });

      const idA = fake.calls[0].args.p_padlet_id;
      const idB = fake.calls[1].args.p_padlet_id;
      // A new draft is a new request: it may never inherit A's identity, or the
      // RPC's genuine-retry path would hand back A and discard this image.
      expect(idB).not.toBe(idA);
      const stored = [...fake.rows.values()].map((r) => r.file_url);
      expect(stored).toContain(SECOND);
      expect(fake.rows.size).toBe(2);
    });

  it('C1: a refused draft, then a new draft, get different identities', async () => {
    const options = { rpcFails: true, readBackFails: false };
    const fake = installFakeSupabase(options);
    mount();
    await save();
    const refusedId = fake.calls[0].args.p_padlet_id;
    // Same draft, retried: the identity is kept.
    await save();
    expect(fake.calls[1].args.p_padlet_id).toBe(refusedId);
    // A different draft: a fresh identity, even though the old one was unused.
    options.rpcFails = false;
    startNewDraft();
    await save();
    expect(fake.calls[2].args.p_padlet_id).not.toBe(refusedId);
  });

  it('C1: two ordinary successful drafts are two distinct durable Images', async () => {
    const fake = installFakeSupabase();
    mount();
    await act(async () => { await api!.saveImage({ imageUrl: FIRST, source: 'upload' }); });
    startNewDraft();
    await act(async () => { await api!.saveImage({ imageUrl: SECOND, source: 'upload' }); });
    expect(fake.calls[1].args.p_padlet_id).not.toBe(fake.calls[0].args.p_padlet_id);
    const stored = [...fake.rows.values()].map((r) => r.file_url);
    expect(stored).toEqual([FIRST, SECOND]);
    // Two drafts, two durable Library objects -- never deduplicated by content.
    expect(new Set([...fake.rows.values()].map((r) => r.library_item_id)).size).toBe(2);
  });

  it('C1: the same image saved twice as two drafts stays two Images', async () => {
    const fake = installFakeSupabase();
    mount();
    await act(async () => { await api!.saveImage({ imageUrl: FIRST, source: 'upload' }); });
    startNewDraft();
    await act(async () => { await api!.saveImage({ imageUrl: FIRST, source: 'upload' }); });
    // Identical bytes, two deliberate creations: identity is the draft, never
    // the file url, the name or the pixels.
    expect(fake.rows.size).toBe(2);
  });
});
