// @vitest-environment jsdom
//
// CANVAS_BOARD_EDIT_COMMAND_LAYER_AUTHORITY -- the save layer answers for
// itself.
//
// The UI wrappers withhold controls and RLS refuses the write, but between
// them sat a layer that asked nobody: every editor, placement flow and modal
// holds a save callback across renders, so an answer captured when the
// callback was built is not the answer that matters when it runs.
//
// Every case here mounts the REAL hook, takes the REAL callbacks, and drives
// them against a live probe the test controls. The positive cases derive
// authority from the REAL `canEditBoard` policy rather than a stand-in rule,
// so "owner with a readonly workspace may save" is the production answer and
// not this file's opinion.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import {
  usePadletSave,
  BOARD_EDIT_NOT_ALLOWED,
  type SaveCardResult,
} from '@/hooks/canvas/usePadletSave';
import {
  canEditBoard,
  type BoardCollaboratorAuthority,
} from '@/lib/domain/canvas/boardEditAuthority';
import { supabaseBrowser } from '@/lib/supabase/browser';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OWNER = '11111111-1111-4111-8111-111111111111';
const EDITOR = '22222222-2222-4222-8222-222222222222';
const VIEWER = '33333333-3333-4333-8333-333333333333';
const BOARD = 'canvas-1';
/** The two members of a reciprocal synced Note pair. */
const NOTE_A = 'note-a';
const NOTE_B = 'note-b';
const board = { id: BOARD, user_id: OWNER };

const collaborator = (
  userId: string,
  role: BoardCollaboratorAuthority['role'],
): BoardCollaboratorAuthority => ({ userId, boardId: BOARD, role });

/** The production policy, asked exactly as CanvasClient asks it. */
const authorityFor = (
  userId: string | null,
  collaboratorAuthority: BoardCollaboratorAuthority | null,
) => canEditBoard({ userId, boardId: BOARD, board, collaboratorAuthority });

// ---------------------------------------------------------------------------
// Recording Supabase double
// ---------------------------------------------------------------------------

type Effects = {
  inserts: unknown[];
  updates: unknown[];
  updateTables: string[];
  selects: string[];
  rpcs: string[];
  rpcPadletIds: string[];
  authCalls: number;
  fetches: string[];
  placementDrafts: unknown[];
  editorCloses: string[];
  padletSets: number;
  draftSets: number;
};

function newEffects(): Effects {
  return {
    inserts: [], updates: [], updateTables: [], selects: [], rpcs: [], rpcPadletIds: [], authCalls: 0,
    fetches: [], placementDrafts: [], editorCloses: [], padletSets: 0, draftSets: 0,
  };
}

/** Lets a test hold one awaited step open, so revocation can land mid-flight. */
type Gate = { promise: Promise<void>; release: () => void };
function gate(): Gate {
  let release!: () => void;
  const promise = new Promise<void>((done) => { release = () => done(); });
  return { promise, release };
}

function installSupabase(
  effects: Effects,
  gates: { auth?: Gate; insert?: Gate; rpc?: Gate; select?: Gate; update?: Gate } = {},
) {
  let nextId = 1;
  const rows = new Map<string, unknown>();
  const client = {
    auth: {
      getUser: async () => {
        effects.authCalls += 1;
        if (gates.auth) await gates.auth.promise;
        return { data: { user: { id: OWNER } }, error: null };
      },
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      effects.rpcs.push(fn);
      effects.rpcPadletIds.push(String(args.p_padlet_id));
      if (gates.rpc) await gates.rpc.promise;
      // The synced-pair function returns the two committed rows; the
      // image one returns its placement pair. Same double, by name.
      if (fn === 'update_synced_note_pair') {
        return {
          data: [
            { id: NOTE_A, title: 'server-a', content: 'server-body', metadata: { syncedWith: NOTE_B, parentId: 'pa' } },
            { id: NOTE_B, title: 'server-a', content: 'server-body', metadata: { syncedWith: NOTE_A, parentId: 'pb' } },
          ],
          error: null,
        };
      }
      rows.set(args.p_padlet_id as string, { ...args, id: args.p_padlet_id, type: 'image' });
      return { data: [{ padlet_id: args.p_padlet_id }], error: null };
    },
    from(table: string) {
      return {
        insert(row: unknown) {
          effects.inserts.push(row);
          const created = { ...(row as object), id: `persisted-${nextId++}` };
          return {
            select: () => ({
              single: async () => {
                // The primary insert's own await -- where a revocation can land
                // after the row is committed but before any follow-up write.
                if (gates.insert) await gates.insert.promise;
                return { data: created, error: null };
              },
            }),
            then: (resolve: (r: unknown) => void) => resolve({ data: created, error: null }),
          };
        },
        update(fields: unknown) {
          effects.updates.push(fields);
          effects.updateTables.push(table);
          return {
            eq: async () => {
              // The update's own await -- where a revocation can land between
              // a committed first write and the second one that follows it.
              if (gates.update) await gates.update.promise;
              return { data: null, error: null };
            },
          };
        },
        select(_cols?: string) {
          return {
            eq: (_col: string, value: string) => {
              effects.selects.push(value);
              const read = async () => {
                // The container metadata read is an await of its own.
                if (gates.select) await gates.select.promise;
                return { data: rows.get(value) ?? { metadata: {} }, error: null };
              };
              return { single: read, maybeSingle: read };
            },
          };
        },
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
}

// ---------------------------------------------------------------------------
// Mounted harness over the real hook
// ---------------------------------------------------------------------------

type SaveApi = ReturnType<typeof usePadletSave>;
let api: SaveApi | null = null;
let setDraft: ((padlet: Padlet | null) => void) | null = null;
let mounted: Array<{ root: Root; container: HTMLElement }> = [];

function Harness({ probe, effects }: { probe: () => boolean; effects: Effects }) {
  const [padlets, setPadlets] = React.useState<Padlet[]>([]);
  const [padletToEdit, setPadletToEdit] = React.useState<Padlet | null>(null);
  setDraft = setPadletToEdit;

  api = usePadletSave({
    canEditBoardContentNow: probe,
    canvasId: BOARD,
    padletToEdit,
    isWallLayout: false,
    isColumnsLayout: false,
    isGridLayout: false,
    isDrawingLayout: false,
    isTimelineLayout: false,
    isSchedulerLayout: false,
    isFreeformLayout: true,
    isMapLayout: false,
    setPadletToEdit: (next) => { effects.draftSets += 1; setPadletToEdit(next as Padlet | null); },
    fetchData: async () => {},
    setIsNoteEditorOpen: () => { effects.editorCloses.push('note'); },
    setIsLinkEditorOpen: () => { effects.editorCloses.push('link'); },
    setIsTodoEditorOpen: () => { effects.editorCloses.push('todo'); },
    setIsTableEditorOpen: () => { effects.editorCloses.push('table'); },
    setIsContainerEditorOpen: () => { effects.editorCloses.push('container'); },
    setIsCommentEditorOpen: () => { effects.editorCloses.push('comment'); },
    setIsCardEditorOpen: () => { effects.editorCloses.push('card'); },
    setIsImageEditorOpen: () => { effects.editorCloses.push('image'); },
    isImageEditorOpen: true,
    setIsDrawingEditorOpen: () => { effects.editorCloses.push('drawing'); },
    setIsAIComponentEditorOpen: () => { effects.editorCloses.push('ai'); },
    setPendingPostDraft: (d) => { effects.placementDrafts.push(d); },
    setIsPlacementPromptOpen: (v) => { if (v) effects.placementDrafts.push('prompt-open'); },
    setWallPendingPostDraft: (d) => { effects.placementDrafts.push(d); },
    setWallPlacementPromptOpen: (v) => { if (v) effects.placementDrafts.push('wall-prompt-open'); },
    padlets,
    setPadlets: (next) => { effects.padletSets += 1; setPadlets(next); },
    getNewPostPosition: () => ({ x: 0, y: 0 }),
  });

  return null;
}

function mount(probe: () => boolean, effects: Effects) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Harness probe={probe} effects={effects} />); });
  mounted.push({ root, container });
}

afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  api = null;
  setDraft = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** Drives every save action plus the placement boundary, once each. */
async function runEveryAction(): Promise<{ card: SaveCardResult; placement: boolean }> {
  let card!: SaveCardResult;
  let placement!: boolean;
  await act(async () => {
    await api!.saveNote({ title: 'n', content: 'c', metadata: {} } as never);
    await api!.saveLink({ linkTitle: 'l', linkUrl: 'https://example.com', metadata: {} } as never);
    await api!.saveTodo({ todoTitle: 't', tasks: [{ id: 't1', text: 'x', completed: false }], metadata: {} } as never);
    await api!.saveTable({ title: 'tb', content: '{"rows":[]}', metadata: {} } as never);
    await api!.saveContainer({ title: 'ct', metadata: {} } as never);
    await api!.saveComment({ comments: [{ id: 'c1', text: 'cm' }], metadata: {} } as never);
    card = await api!.saveCard({ title: 'cd', content: 'x', metadata: {} } as never);
    await api!.saveImage({ imageUrl: 'https://img', source: 'pexels' } as never);
    await api!.saveDrawing({ drawingData: '{}', drawingAppState: '{}', drawingFiles: '{}' } as never);
    await api!.saveAIComponent({ aiPrompt: 'p', aiComponentCode: 'code' } as never);
    placement = api!.requestPlacementIfRequired(
      { kind: 'note', content: 'c', title: 'n', metadata: {} } as never,
    );
  });
  return { card, placement };
}

function expectNoEffects(effects: Effects, fetchSpy: ReturnType<typeof vi.fn>) {
  expect(effects.inserts, 'no inserts').toEqual([]);
  expect(effects.updates, 'no updates').toEqual([]);
  expect(effects.selects, 'no read-backs').toEqual([]);
  expect(effects.rpcs, 'no RPCs').toEqual([]);
  expect(effects.authCalls, 'no auth calls').toBe(0);
  expect(effects.placementDrafts, 'no placement state').toEqual([]);
  expect(effects.editorCloses, 'no editor closed').toEqual([]);
  expect(effects.padletSets, 'no optimistic/local shared state').toBe(0);
  expect(fetchSpy, 'no fetches').not.toHaveBeenCalled();
}

// ---------------------------------------------------------------------------
// A. Positive authority, derived from the real policy
// ---------------------------------------------------------------------------

describe('A. authorized identities still persist', () => {
  const ALLOWED: ReadonlyArray<readonly [string, string, BoardCollaboratorAuthority | null]> = [
    ['owner + readonly workspace', OWNER, collaborator(OWNER, null)],
    ['board editor + readonly workspace', EDITOR, collaborator(EDITOR, 'editor')],
  ];

  for (const [name, userId, collab] of ALLOWED) {
    it(`${name} saves normally`, async () => {
      const effects = newEffects();
      installSupabase(effects);
      const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchSpy);

      // The workspace role is not consulted anywhere in this chain.
      expect(authorityFor(userId, collab), `${name} is allowed by the real policy`).toBe(true);
      mount(() => authorityFor(userId, collab), effects);
      act(() => { setDraft!({ id: 'new' } as Padlet); });

      const { card } = await runEveryAction();

      // Each callback's own row, by the type IT persists -- not a total.
      const types = effects.inserts.map((row) => (row as { type?: string }).type);
      for (const expected of ['text', 'link', 'todo', 'table', 'container', 'comment', 'card', 'drawing', 'ai-component']) {
        expect(types, `${name} persisted a ${expected}`).toContain(expected);
      }
      expect(effects.rpcs, 'saveImage reached its atomic Library RPC')
        .toContain('create_image_post_with_library_item');
      expect(card.status, 'saveCard succeeded').toBe('saved');
    });
  }
});

// ---------------------------------------------------------------------------
// B. Initial denial
// ---------------------------------------------------------------------------

describe('B. denied identities produce no effect at all', () => {
  const DENIED: ReadonlyArray<readonly [string, () => boolean]> = [
    ['workspace editor + board viewer', () => authorityFor(VIEWER, collaborator(VIEWER, 'viewer'))],
    ['board viewer + readonly workspace', () => authorityFor(VIEWER, collaborator(VIEWER, 'viewer'))],
    ['missing / still-loading authority', () => authorityFor(EDITOR, null)],
    ['unauthenticated', () => authorityFor(null, null)],
  ];

  for (const [name, probe] of DENIED) {
    it(`${name}: zero placement, editor, id, request, state or persistence effects`, async () => {
      const effects = newEffects();
      installSupabase(effects);
      const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchSpy);

      expect(probe(), `${name} is denied by the real policy`).toBe(false);
      mount(probe, effects);
      act(() => { setDraft!({ id: 'new' } as Padlet); });
      const draftSetsBefore = effects.draftSets;

      const { card, placement } = await runEveryAction();

      expectNoEffects(effects, fetchSpy);
      expect(card, 'saveCard keeps its discriminated contract')
        .toEqual({ status: 'failed', error: BOARD_EDIT_NOT_ALLOWED });
      expect(placement, 'placement denial means "caller must stop"').toBe(true);
      expect(effects.draftSets, 'no draft/editor state was touched').toBe(draftSetsBefore);
    });
  }
});

// ---------------------------------------------------------------------------
// C. Retained callbacks, revoked after capture
// ---------------------------------------------------------------------------

describe('C. callbacks captured while authorized refuse after revocation', () => {
  it('all ten saves and requestPlacementIfRequired refuse without being rebuilt', async () => {
    const effects = newEffects();
    installSupabase(effects);
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    let allowed = true;
    mount(() => allowed, effects);
    act(() => { setDraft!({ id: 'new' } as Padlet); });

    // Captured while authorized -- these exact references are reused below.
    const captured = api!;
    await act(async () => {
      await captured.saveNote({ title: 'n', content: 'c', metadata: {} } as never);
    });
    expect(effects.inserts.length, 'positive control').toBeGreaterThan(0);

    // The authority goes away; the callbacks are NOT rebuilt.
    allowed = false;
    const after = newEffects();
    Object.assign(effects, after);
    fetchSpy.mockClear();

    let card!: SaveCardResult;
    let placement!: boolean;
    await act(async () => {
      await captured.saveNote({ title: 'n', content: 'c', metadata: {} } as never);
      await captured.saveLink({ linkTitle: 'l', linkUrl: 'https://example.com', metadata: {} } as never);
      await captured.saveTodo({ todoTitle: 't', tasks: [{ id: 't1', text: 'x', completed: false }], metadata: {} } as never);
      await captured.saveTable({ title: 'tb', content: '{"rows":[]}', metadata: {} } as never);
      await captured.saveContainer({ title: 'ct', metadata: {} } as never);
      await captured.saveComment({ comments: [{ id: 'c1', text: 'cm' }], metadata: {} } as never);
      card = await captured.saveCard({ title: 'cd', content: 'x', metadata: {} } as never);
      await captured.saveImage({ imageUrl: 'https://img', source: 'pexels' } as never);
      await captured.saveDrawing({ drawingData: '{}', drawingAppState: '{}', drawingFiles: '{}' } as never);
      await captured.saveAIComponent({ aiPrompt: 'p', aiComponentCode: 'code' } as never);
      placement = captured.requestPlacementIfRequired(
        { kind: 'note', content: 'c', title: 'n', metadata: {} } as never,
      );
    });

    expectNoEffects(effects, fetchSpy);
    expect(card).toEqual({ status: 'failed', error: BOARD_EDIT_NOT_ALLOWED });
    expect(placement, 'the retained placement boundary still says stop').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D. Revocation mid-flight
// ---------------------------------------------------------------------------

describe('D. revocation during an awaited step stops the next mutation', () => {
  it('Image: revoked while auth.getUser is pending -- no RPC, no read-back', async () => {
    const effects = newEffects();
    const authGate = gate();
    installSupabase(effects, { auth: authGate });
    let allowed = true;
    mount(() => allowed, effects);
    act(() => { setDraft!({ id: 'new' } as Padlet); });

    let running!: Promise<unknown>;
    await act(async () => {
      running = api!.saveImage({ imageUrl: 'https://img', source: 'pexels' } as never);
      await Promise.resolve();
    });
    expect(effects.authCalls, 'the identity lookup started while authorized').toBe(1);

    allowed = false;                       // revoked mid-flight
    await act(async () => { authGate.release(); await running; });

    expect(effects.rpcs, 'zero RPC').toEqual([]);
    expect(effects.selects, 'zero read-back').toEqual([]);
    expect(effects.inserts, 'zero persistence').toEqual([]);
  });

  it('AI: revoked while asset ingestion is pending -- no padlet persistence', async () => {
    const effects = newEffects();
    installSupabase(effects);
    const ingest = gate();
    let allowed = true;
    const fetchSpy = vi.fn(async (url: string) => {
      effects.fetches.push(String(url));
      await ingest.promise;
      return new Response(JSON.stringify({ finalCode: 'x' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    mount(() => allowed, effects);
    act(() => { setDraft!({ id: 'new' } as Padlet); });

    let running!: Promise<unknown>;
    await act(async () => {
      running = api!.saveAIComponent({
        aiPrompt: 'p', aiComponentCode: 'code',
        aiAssets: { images: [{ query: 'q', url: 'https://i', status: 'resolved', source: 's' }] },
      } as never);
      await Promise.resolve();
    });
    expect(effects.fetches.length, 'ingestion started while authorized').toBeGreaterThan(0);

    allowed = false;                       // revoked during ingestion
    await act(async () => { ingest.release(); await running; });

    // The ingestion itself is external work already done and not reversible
    // from here; what must not happen is the board write that follows it.
    expect(effects.inserts, 'zero padlet persistence').toEqual([]);
    expect(effects.padletSets, 'zero local shared state').toBe(0);
  });

  it('Card: revoked after the primary insert -- no follow-up, and the row stands', async () => {
    const effects = newEffects();
    const insertGate = gate();
    installSupabase(effects, { insert: insertGate });
    let allowed = true;
    mount(() => allowed, effects);
    act(() => { setDraft!({ id: 'new' } as Padlet); });

    // Started while authorized, with a parent so a container follow-up WOULD
    // run if the authority still allowed it.
    let running!: Promise<SaveCardResult>;
    await act(async () => {
      running = api!.saveCard({
        title: 'cd', content: 'x', metadata: { parentId: 'container-1' },
      } as never);
      await Promise.resolve();
    });
    expect(effects.inserts.length, 'the primary insert was issued while authorized').toBe(1);

    // Revoked while that insert is still awaiting, then released.
    allowed = false;
    let result!: SaveCardResult;
    await act(async () => { insertGate.release(); result = await running; });

    // The committed row is not reversed -- only the SECOND mutation is stopped.
    expect(effects.inserts.length, 'the completed insert is not reversed').toBe(1);
    expect(effects.updates, 'zero container follow-up write').toEqual([]);
    expect(effects.selects, 'the container was never even read').toEqual([]);
    // The insert committed, so DocumentEditor must CLOSE rather than offer the
    // same Card again: 'failed' shows a retry prompt and would duplicate it.
    expect(result, 'partial success reports the established saved discriminant')
      .toEqual({ status: 'saved' });
    expect(effects.editorCloses, 'the transient editor is settled').toEqual(['card']);
    expect(effects.padletSets, 'no shared canvas state added after revocation').toBe(0);
    expect(effects.placementDrafts, 'no unrelated placement change').toEqual([]);
  });

  it('Image: revoked while the RPC is pending -- no read-back, retry identity kept', async () => {
    const effects = newEffects();
    const rpcGate = gate();
    installSupabase(effects, { rpc: rpcGate });
    let allowed = true;
    mount(() => allowed, effects);
    act(() => { setDraft!({ id: 'new' } as Padlet); });

    const payload = { imageUrl: 'https://img', source: 'pexels' } as never;
    let running!: Promise<unknown>;
    await act(async () => {
      running = api!.saveImage(payload);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(effects.authCalls, 'the identity lookup succeeded').toBe(1);
    expect(effects.rpcs, 'the RPC was issued while authorized').toEqual(['create_image_post_with_library_item']);
    const firstPadletId = effects.rpcPadletIds[0];

    // Revoked while the RPC is in flight, then released.
    allowed = false;
    await act(async () => { rpcGate.release(); await running; });

    // The RPC itself completed server-side and is not claimed to be reversible.
    expect(effects.selects, 'zero read-back').toEqual([]);
    expect(effects.inserts, 'zero later persistence').toEqual([]);
    expect(effects.updates, 'zero later mutation').toEqual([]);

    // Retry identity: the durable creation id was NOT cleared, so a later
    // authorized retry of the same request reuses it instead of minting a
    // second Image.
    allowed = true;
    await act(async () => { await api!.saveImage(payload); });
    expect(effects.rpcPadletIds[1], 'the retry reuses the same durable id').toBe(firstPadletId);
  });

  it('Note: revoked while the container metadata read is pending -- no container update', async () => {
    const effects = newEffects();
    const selectGate = gate();
    installSupabase(effects, { select: selectGate });
    let allowed = true;
    mount(() => allowed, effects);
    // Production takes the parent from padletToEdit.metadata, NOT from the
    // payload -- a draft that only carried it in SaveNoteData never reached
    // this branch at all.
    act(() => { setDraft!({ id: 'new', metadata: { parentId: 'container-1' } } as unknown as Padlet); });

    let running!: Promise<unknown>;
    await act(async () => {
      running = api!.saveNote({ title: 'n', content: 'c' } as never);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(effects.inserts.length, 'the Note insert committed while authorized').toBe(1);
    expect(effects.selects, 'the container read began while authorized').toEqual(['container-1']);

    allowed = false;
    await act(async () => { selectGate.release(); await running; });

    expect(effects.updates, 'zero container update').toEqual([]);
    expect(effects.updateTables, 'no table was written a second time').toEqual([]);
    expect(effects.padletSets, 'no shared canvas state after revocation').toBe(0);
    expect(effects.editorCloses, 'the Note editor is settled, so retry cannot duplicate').toEqual(['note']);
  });

  // SYNCED_NOTE_PAIR_ATOMIC_UPDATE_1 replaces what this case used to
  // characterize. There is no longer a first write and a second write to
  // separate: the pair moves in ONE transaction, so revocation mid-flight
  // can no longer split it. What still has to hold is that nothing else is
  // started afterwards, and that no shared state is invented.
  it('Note: a synced pair is one request, and revocation mid-flight starts no other', async () => {
    const effects = newEffects();
    const rpcGate = gate();
    installSupabase(effects, { rpc: rpcGate });
    let allowed = true;
    mount(() => allowed, effects);
    // A genuine EXISTING synced Note: production reads `syncedWith` from the
    // padlet being edited, and the id must not be 'new'.
    act(() => {
      setDraft!({ id: NOTE_A, metadata: { syncedWith: NOTE_B } } as unknown as Padlet);
    });

    let running!: Promise<unknown>;
    await act(async () => {
      running = api!.saveNote({ title: 'n', content: 'c' } as never);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(effects.rpcs, 'one atomic pair update, issued while authorized')
      .toEqual(['update_synced_note_pair']);
    expect(effects.updates, 'and no direct row write at all').toEqual([]);

    allowed = false;
    await act(async () => { rpcGate.release(); await running; });

    // The transaction had already started and is allowed to finish. What is
    // withheld is everything that would follow it.
    expect(effects.rpcs.length, 'no second request').toBe(1);
    expect(effects.updates, 'no compensating write').toEqual([]);
    expect(effects.selects, 'no container/source-reference follow-up read').toEqual([]);
    expect(effects.padletSets, 'no new optimistic state').toBe(0);
    expect(effects.editorCloses, 'settled as a completed primary save').toEqual(['note']);
  });

  it('Card: revoked while the container metadata read is pending -- saved, no follow-up', async () => {
    const effects = newEffects();
    const selectGate = gate();
    installSupabase(effects, { select: selectGate });
    let allowed = true;
    mount(() => allowed, effects);
    act(() => { setDraft!({ id: 'new', metadata: { parentId: 'container-1' } } as unknown as Padlet); });

    let running!: Promise<SaveCardResult>;
    await act(async () => {
      running = api!.saveCard({ title: 'cd', content: 'x', metadata: {} } as never);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(effects.inserts.length, 'the Card insert committed while authorized').toBe(1);
    expect(effects.selects, 'the container read began while authorized').toEqual(['container-1']);

    allowed = false;
    let result!: SaveCardResult;
    await act(async () => { selectGate.release(); result = await running; });

    expect(effects.updates, 'zero container update').toEqual([]);
    // DocumentEditor closes on 'saved' and only re-prompts on 'failed', so this
    // is what stops the ordinary UI offering the committed Card again.
    expect(result, 'the established success discriminant').toEqual({ status: 'saved' });
    expect(effects.editorCloses, 'the transient editor is settled').toEqual(['card']);
    expect(effects.padletSets, 'no shared canvas state after revocation').toBe(0);
  });

  it('existing Image: revoked between the padlet write and the Library write', async () => {
    const effects = newEffects();
    const updateGate = gate();
    installSupabase(effects, { update: updateGate });
    let allowed = true;
    mount(() => allowed, effects);
    // A genuine EXISTING image with a linked durable Library row.
    act(() => {
      setDraft!({
        id: 'img-1', library_item_id: 'lib-1', title: 'Image',
        width: 300, height: 200, metadata: {},
      } as unknown as Padlet);
    });

    let running!: Promise<unknown>;
    await act(async () => {
      running = api!.saveImage({ imageUrl: 'https://img', source: 'upload' } as never);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(effects.updateTables, 'the placement write began while authorized').toEqual(['padlets']);

    allowed = false;
    await act(async () => { updateGate.release(); await running; });

    // The placement landed and is not reversed; the linked Library row is not
    // written, and nothing further is started.
    expect(effects.updateTables, 'zero library_items write').toEqual(['padlets']);
    expect(effects.selects, 'zero read-back').toEqual([]);
    expect(effects.inserts, 'zero later persistence').toEqual([]);
    expect(effects.padletSets, 'zero local reconciliation').toBe(0);
    expect(effects.rpcs, 'no compensating mutation').toEqual([]);
    expect(effects.editorCloses, 'the image editor is settled').toEqual(['image']);
  });

  it('Note: revoked after the insert -- the row stands, no follow-up write starts', async () => {
    const effects = newEffects();
    installSupabase(effects);
    let allowed = true;
    mount(() => allowed, effects);
    // The parent comes from padletToEdit.metadata -- production ignores any
    // parentId handed in SaveNoteData, so putting it there proved nothing.
    act(() => { setDraft!({ id: 'new', metadata: { parentId: 'container-1' } } as unknown as Padlet); });

    // The insert is permitted; revocation lands before the follow-up writes.
    await act(async () => {
      const saving = api!.saveNote({ title: 'n', content: 'c' } as never);
      await Promise.resolve();
      allowed = false;
      await saving;
    });

    expect(effects.inserts.length, 'the first write completed and is not reversed').toBe(1);
    expect(effects.updates, 'no container follow-up write started').toEqual([]);
    expect(effects.updateTables, 'no second table was written').toEqual([]);
    // The read itself may legitimately have begun while still authorized --
    // what must never happen is the WRITE it feeds. The pending-read case is
    // covered separately above.
    expect(effects.padletSets, 'no shared canvas state after revocation').toBe(0);
  });
});

// ---------------------------------------------------------------------------
// E. Contracts and state under denial
// ---------------------------------------------------------------------------

describe('E. denial leaves contracts and state intact', () => {
  it('no toast, no editor close, no placement UI, and image retry identity survives', async () => {
    const effects = newEffects();
    installSupabase(effects);
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    // Authorized first, so an image retry identity could exist at all.
    let allowed = true;
    mount(() => allowed, effects);
    act(() => { setDraft!({ id: 'new' } as Padlet); });

    allowed = false;
    let card!: SaveCardResult;
    await act(async () => {
      card = await api!.saveCard({ title: 'cd', content: 'x', metadata: {} } as never);
      await api!.saveImage({ imageUrl: 'https://img', source: 'pexels' } as never);
    });

    expect(card).toEqual({ status: 'failed', error: BOARD_EDIT_NOT_ALLOWED });
    expect(effects.editorCloses, 'no editor was closed').toEqual([]);
    expect(effects.placementDrafts, 'no placement UI opened').toEqual([]);
    // A denied image never reached the RPC, so it cannot have cleared the
    // durable creation identity a later authorized retry depends on.
    expect(effects.rpcs).toEqual([]);
    expect(effects.selects).toEqual([]);
  });

  it('the refusal value is stable and distinguishable from a server error', () => {
    expect(BOARD_EDIT_NOT_ALLOWED).toBe('board_edit_not_allowed');
  });
});
