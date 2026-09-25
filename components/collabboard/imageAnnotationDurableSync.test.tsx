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
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { deriveCropOriginalImageUrl } from '@/lib/infra/collabboard/imageDurableContent';

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
    // CANVAS_BOARD_EDIT_COMMAND_LAYER_AUTHORITY: the save layer now requires an
    // explicit live board-authority probe. Granted DELIBERATELY here -- this
    // suite's subject is persistence, not permission, and the denial cases are
    // proved in hooks/canvas/usePadletSave.authority.behavior.test.tsx.
    canEditBoardContentNow: () => true,
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

/**
 * CANVAS_BOARD_EDIT_COMMAND_LAYER_AUTHORITY_CORRECTION_2 -- the two DIRECT
 * image-edit callbacks.
 *
 * These live inline in CanvasClient, which is the whole board shell and cannot
 * be mounted here, so each callback body is EXTRACTED FROM ITS OWN SOURCE and
 * executed with its dependencies injected. The live ref is modelled exactly as
 * production holds it -- one mutable `{ current }` the test flips -- so a
 * callback captured while authorized is the same object invoked after
 * revocation.
 *
 * This is the outer layer only. The actual persistence choke point is proved
 * independently, and behaviourally, in imageDurableContent.test.ts.
 */
const CLIENT_SOURCE = readFileSync(
  resolvePath(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

/** The real body of one inline `onSave={async (...) => { ... }}` callback. */
function extractOnSave(afterMarker: string): string {
  const at = CLIENT_SOURCE.indexOf(afterMarker);
  if (at < 0) throw new Error(`MARKER_NOT_FOUND: ${afterMarker}`);
  const start = CLIENT_SOURCE.lastIndexOf('onSave={async (', at);
  if (start < 0) throw new Error(`ONSAVE_NOT_FOUND_BEFORE: ${afterMarker}`);
  const end = CLIENT_SOURCE.indexOf('\n                  }}', start);
  if (end < 0) throw new Error(`ONSAVE_END_NOT_FOUND: ${afterMarker}`);
  const body = CLIENT_SOURCE.slice(start + 'onSave={'.length, end) + '\n                  }';
  // `new Function` parses JavaScript; these bodies carry two TypeScript
  // casts. Both removals must match, so an edit that changes their shape
  // fails loudly here instead of running a mangled copy of the callback.
  let js = body;
  const casts: ReadonlyArray<readonly [RegExp, string]> = [
    [/\((drawingPadlet|cropPadlet) as \{[^}]*\}\)/g, '$1'],
    [/ as never/g, ''],
  ];
  for (const [pattern, replacement] of casts) {
    if (!pattern.test(js)) throw new Error(`TYPE_STRIP_NO_LONGER_MATCHES: ${pattern}`);
    pattern.lastIndex = 0;
    js = js.replace(pattern, replacement);
  }
  return js;
}

function buildOnSave(source: string, deps: Record<string, unknown>) {
  const names = Object.keys(deps);
  return new Function(...names, `return ${source};`)(
    ...names.map((name) => deps[name]),
  ) as (...args: unknown[]) => Promise<void>;
}

describe('CORRECTION_2: the direct draw and crop callbacks answer to live authority', () => {
  type Recorder = {
    helperCalls: unknown[];
    stored: unknown[];
    modeSets: string[];
    refreshes: number;
    errors: string[];
  };

  function deps(
    ref: { current: boolean },
    log: Recorder,
    outcome = 'complete',
    onStore: (ref: { current: boolean }) => Promise<{ url: string; stored: string }> = async () => ({
      url: 'https://stored.test/edit.png',
      stored: 'public-file',
    }),
  ) {
    return {
      canEditBoardContentRef: ref,
      canEditBoardContentProbe: () => ref.current,
      supabase: {},
      // PATCH-182: the arm now moves the picture to Storage first. Modelled
      // here so the extracted callback runs with the dependency it really uses.
      storeEditedImage: async (input: unknown) => {
        log.stored.push(input);
        return onStore(ref);
      },
      persistDurableImageContent: async (_client: unknown, payload: unknown) => {
        log.helperCalls.push(payload);
        return outcome;
      },
      // CROP_ORIGINAL_PRESERVATION_1: the real helper, so the extracted crop
      // callback resolves the same free variable production code does.
      deriveCropOriginalImageUrl,
      drawingPadlet: { id: PADLET_ID, library_item_id: LIBRARY_ID, title: 'Image', width: 300, height: 200, metadata: {} },
      cropPadlet: { id: PADLET_ID, library_item_id: LIBRARY_ID, title: 'Image', width: 300, height: 200, metadata: {} },
      setIsDrawingMode: (v: boolean) => { log.modeSets.push(`draw:${v}`); },
      setDrawingPadlet: () => { log.modeSets.push('draw:padlet'); },
      setIsCropMode: (v: boolean) => { log.modeSets.push(`crop:${v}`); },
      setCropPadlet: () => { log.modeSets.push('crop:padlet'); },
      fetchData: () => { log.refreshes += 1; },
      // Surfaced, not swallowed: the callback catches its own failures, and a
      // harness that quietly fell into that path would look like a refusal.
      console: { error: (...parts: unknown[]) => { log.errors.push(parts.map(String).join(' ')); } },
    };
  }

  const recorder = (): Recorder => ({ helperCalls: [], stored: [], modeSets: [], refreshes: 0, errors: [] });

  const CASES: ReadonlyArray<readonly [string, string, unknown[], 'drawing' | 'base']> = [
    ['draw-on-image', "'Failed to save drawing:'", [ANNOTATED, [], []], 'drawing'],
    ['crop-image', "'Failed to save cropped image:'", [ANNOTATED], 'base'],
  ];

  for (const [name, marker, args, variant] of CASES) {
    it(`${name}: a callback retained from an authorized render refuses after revocation`, async () => {
      const ref = { current: true };
      const log = recorder();
      const onSave = buildOnSave(extractOnSave(marker), deps(ref, log));

      // Positive control, with the very same reference reused below.
      await onSave(...args);
      expect(log.errors, `${name} harness did not fall into the catch`).toEqual([]);
      expect(log.helperCalls, `${name} positive control reaches the helper`).toHaveLength(1);
      // PATCH-182: the placement adopts the STORED url, and the editor's variant
      // is what was handed to Storage.
      expect((log.helperCalls[0] as { imageUrl?: string }).imageUrl).toBe('https://stored.test/edit.png');
      expect((log.stored[0] as { variant?: string }).variant).toBe(variant);
      expect(log.refreshes, `${name} refreshes once authorized`).toBe(1);

      ref.current = false;
      await onSave(...args);

      expect(log.helperCalls, 'zero helper call after revocation').toHaveLength(1);
      expect(log.modeSets.length, 'zero further callback state effect')
        .toBe(log.modeSets.length);
      expect(log.refreshes, 'zero further refresh').toBe(1);
    });

    it(`${name}: authority revoked DURING the store stops before persistence`, async () => {
      // PATCH-182 §2.5: the upload can take a while, so the arm asks again
      // before persisting. A revocation that lands mid-store must write nothing.
      const ref = { current: true };
      const log = recorder();
      const onStore = async (liveRef: { current: boolean }) => {
        liveRef.current = false;
        return { url: 'https://stored.test/edit.png', stored: 'public-file' };
      };
      const onSave = buildOnSave(extractOnSave(marker), deps(ref, log, 'complete', onStore));

      await onSave(...args);

      expect(log.errors, `${name} harness did not fall into the catch`).toEqual([]);
      expect(log.stored, 'the store was attempted').toHaveLength(1);
      expect(log.helperCalls, 'zero persist after authority was revoked mid-store').toHaveLength(0);
      expect(log.modeSets, 'zero editor state change').toEqual([]);
      expect(log.refreshes, 'zero refresh for a write that never happened').toBe(0);
    });

    it(`${name}: a denied helper result produces no state change and no refresh`, async () => {
      // The guard-to-helper race, from the consumer's side: the entry probe saw
      // true, the helper refused, and nothing downstream may run.
      const ref = { current: true };
      const log = recorder();
      const onSave = buildOnSave(extractOnSave(marker), deps(ref, log, 'denied'));

      await onSave(...args);

      expect(log.errors, 'harness did not fall into the catch').toEqual([]);
      expect(log.helperCalls, 'the helper was reached').toHaveLength(1);
      expect(log.modeSets, 'zero editor state change').toEqual([]);
      expect(log.refreshes, 'zero refresh for a write that never happened').toBe(0);
    });
  }

  it('both callbacks hand the helper a LIVE probe, not a captured boolean', () => {
    for (const marker of ["'Failed to save drawing:'", "'Failed to save cropped image:'"]) {
      const body = extractOnSave(marker);
      expect(body, 'entry guard reads the live ref')
        .toContain('if (!canEditBoardContentRef.current) return;');
      expect(body, 'the helper gets the live probe')
        .toContain('mayContinue: canEditBoardContentProbe,');
      expect(body, 'a denied helper result stops everything downstream')
        .toContain("if (outcome === 'denied') return;");
    }
  });
});

describe('CORRECTION_2: revocation dismisses both mutation-capable image modals', () => {
  it('clears draw and crop state, touches nothing else, and is not sticky', () => {
    const marker = '   * Losing board-edit authority closes the two image tools';
    const at = CLIENT_SOURCE.indexOf(marker);
    expect(at, 'the revocation effect exists').toBeGreaterThan(-1);
    const start = CLIENT_SOURCE.indexOf('  useEffect(() => {', at);
    const end = CLIENT_SOURCE.indexOf('\n  }, [canEditBoardContent,', start);
    const body = CLIENT_SOURCE.slice(start, end);

    // No board, Library, optimistic, placement or network work in here.
    for (const forbidden of ['supabase', 'persistDurableImageContent', 'fetchData', 'setPadlets']) {
      expect(body, `the effect performs no ${forbidden}`).not.toContain(forbidden);
    }

    const cleared: string[] = [];
    const run = new Function(
      'canEditBoardContent', 'setIsDrawingMode', 'setDrawingPadlet', 'setIsCropMode', 'setCropPadlet',
      `${body.replace('  useEffect(() => {', 'const effect = () => {')}\n  }; return effect;`,
    );

    // Authorized: the tools are left exactly as they are.
    run(true, () => cleared.push('draw'), () => cleared.push('drawPadlet'),
      () => cleared.push('crop'), () => cleared.push('cropPadlet'))();
    expect(cleared, 'nothing is dismissed while authorized').toEqual([]);

    // Revoked: both mutation-capable modals are cleared.
    run(false, () => cleared.push('draw'), () => cleared.push('drawPadlet'),
      () => cleared.push('crop'), () => cleared.push('cropPadlet'))();
    expect(cleared).toEqual(['draw', 'drawPadlet', 'crop', 'cropPadlet']);

    // Restoring authority dismisses nothing further, so the tools reopen
    // normally -- the effect holds no sticky state.
    const before = cleared.length;
    run(true, () => cleared.push('draw'), () => cleared.push('drawPadlet'),
      () => cleared.push('crop'), () => cleared.push('cropPadlet'))();
    expect(cleared.length, 'authority restored: nothing re-dismissed').toBe(before);
  });
});
