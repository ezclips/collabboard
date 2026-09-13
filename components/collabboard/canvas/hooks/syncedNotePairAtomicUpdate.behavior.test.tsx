// @vitest-environment jsdom
//
// SYNCED_NOTE_PAIR_ATOMIC_UPDATE_1 -- the synced pair moves as one thing.
//
// The defect this closes was not a missing check. It was a SHAPE: two
// independently committed writes, with a window between them that no client
// check can remove. Every case below therefore measures REQUESTS, not
// intentions -- how many left, which one, and what local state was invented
// on the strength of them.
//
// The hook is the real hook, mounted, driven through its real callbacks.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteEditor from '@/components/collabboard/editors/NoteEditor';
import type { Padlet } from '@/types/collabboard';
import { usePadletSave } from '@/hooks/canvas/usePadletSave';
import { supabaseBrowser } from '@/lib/supabase/browser';
import {
  readSyncedTwinId,
  updateSyncedNotePair,
} from '@/lib/infra/canvas/syncedNotePairMutation';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m) } }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Real UUIDs: the adapter refuses to reconcile a row whose id is not one,
// because the database never returns anything else.
const BOARD = 'd5000000-0000-4000-8000-0000000000b1';
const NOTE_A = 'd5000000-0000-4000-8000-0000000000a1';
const NOTE_B = 'd5000000-0000-4000-8000-0000000000a2';
const OTHER = 'd5000000-0000-4000-8000-0000000000a3';

const serverRows = () => [
  { id: NOTE_A, title: 'server title', content: 'server body', metadata: { syncedWith: NOTE_B, parentId: 'pa' } },
  { id: NOTE_B, title: 'server title', content: 'server body', metadata: { syncedWith: NOTE_A, parentId: 'pb' } },
];

// == Recording double ==

type Effects = {
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  updates: unknown[];
  inserts: unknown[];
  selects: string[];
  editorCloses: string[];
  draftSets: Array<Padlet | null>;
  sourceNotes: string[];
};
const newEffects = (): Effects => ({ rpcCalls: [], updates: [], inserts: [], selects: [], editorCloses: [], draftSets: [], sourceNotes: [] });

type Gate = { promise: Promise<void>; release: () => void };
const gate = (): Gate => {
  let release!: () => void;
  return { promise: new Promise<void>((done) => { release = () => done(); }), release };
};

type RpcReply = { data: unknown; error: { code?: string; message: string } | null };

function installSupabase(effects: Effects, opts: { reply?: RpcReply; rpcGate?: Gate } = {}) {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
    async rpc(fn: string, args: Record<string, unknown>) {
      effects.rpcCalls.push({ fn, args });
      if (opts.rpcGate) await opts.rpcGate.promise;
      return opts.reply ?? { data: serverRows(), error: null };
    },

    from() {
      return {
        insert(row: unknown) {
          effects.inserts.push(row);
          const created = { ...(row as object), id: 'persisted-1' };
          return {
            select: () => ({ single: async () => ({ data: created, error: null }) }),
            then: (resolve: (r: unknown) => void) => resolve({ data: created, error: null }),
          };
        },
        update(fields: unknown) { effects.updates.push(fields); return { eq: async () => ({ data: null, error: null }) }; },
        select() {
          return { eq: (_c: string, value: string) => {
            effects.selects.push(value);
            const read = async () => ({ data: { metadata: {} }, error: null });
            return { single: read, maybeSingle: read };
          } };
        },
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
}

// == Mounted harness ==

type SaveApi = ReturnType<typeof usePadletSave>;
let api: SaveApi | null = null;
let setDraft: ((p: Padlet | null) => void) | null = null;
let currentPadlets: Padlet[] = [];
let mounted: Array<{ root: Root; container: HTMLElement }> = [];

let schedulerLayout = false;
let seedRows: Padlet[] | null = null;
let onSaveSpy: ((d: never) => unknown) | null = null;
let closes = 0;
/** The order the hook CALLS its setters -- the only thing separating "reconcile
 *  then settle" from its reverse, since batching makes the end state identical. */
let callOrder: string[] = [];

/** ONE harness for both halves of this file: `withEditor` also renders the REAL
 *  NoteEditor against the REAL callback, which is all the lifecycle cases need. */
function Harness({ probe, effects, withEditor }: { probe: () => boolean; effects: Effects; withEditor?: boolean }) {
  const [padlets, setPadlets] = React.useState<Padlet[]>(seedRows ?? [
    { id: NOTE_A, title: 'local a', content: 'local a body', type: 'text', metadata: { syncedWith: NOTE_B, parentId: 'pa' } } as unknown as Padlet,
    { id: NOTE_B, title: 'local b', content: 'local b body', type: 'text', metadata: { syncedWith: NOTE_A, parentId: 'pb' } } as unknown as Padlet,
    { id: OTHER, title: 'untouched', content: 'untouched body', type: 'text', metadata: {} } as unknown as Padlet,
  ]);
  const [padletToEdit, setPadletToEdit] = React.useState<Padlet | null>(withEditor ? padlets[0] : null);
  const [open, setOpen] = React.useState(true);
  setDraft = setPadletToEdit;
  currentPadlets = padlets;

  const api2 = usePadletSave({
    canEditBoardContentNow: probe, canvasId: BOARD, padletToEdit,
    isWallLayout: false, isColumnsLayout: false, isGridLayout: false,
    isDrawingLayout: false, isTimelineLayout: false, isSchedulerLayout: schedulerLayout,
    isFreeformLayout: true, isMapLayout: false,
    setPadletToEdit: (next: Padlet | null) => {
      callOrder.push('clear-draft'); effects.draftSets.push(next); setPadletToEdit(next);
    },
    fetchData: async () => {},
    setIsNoteEditorOpen: (v: boolean) => {
      callOrder.push('settle'); effects.editorCloses.push('note'); setOpen(Boolean(v));
    },
    setIsLinkEditorOpen: () => {}, setIsTodoEditorOpen: () => {},
    setIsTableEditorOpen: () => {}, setIsContainerEditorOpen: () => {},
    setIsCommentEditorOpen: () => {}, setIsCardEditorOpen: () => {},
    setIsImageEditorOpen: () => {}, isImageEditorOpen: true,
    setIsDrawingEditorOpen: () => {}, setIsAIComponentEditorOpen: () => {},
    setPendingPostDraft: () => {}, setIsPlacementPromptOpen: () => {},
    setWallPendingPostDraft: () => {}, setWallPlacementPromptOpen: () => {},
    padlets,
    setPadlets: ((next: never) => { callOrder.push('reconcile'); setPadlets(next); }) as never,
    getNewPostPosition: () => ({ x: 0, y: 0 }),
    onSourceNoteCreated: (id: string) => { effects.sourceNotes.push(id); },
  } as never);
  api = api2;
  if (!withEditor) return null;
  return (
    <NoteEditor
      isOpen={open}
      initialTitle={padletToEdit?.title ?? ''}
      initialContent={padletToEdit?.content ?? ''}
      onSave={(onSaveSpy ?? api2.saveNote) as never}
      // Exactly CanvasModals' wiring: onClose is what discards the draft.
      onClose={() => { closes += 1; setOpen(false); setPadletToEdit(null); }}
    />
  );
}

function mount(probe: () => boolean, effects: Effects, withEditor?: boolean) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Harness probe={probe} effects={effects} withEditor={withEditor} />); });
  mounted.push({ root, container });
  return container;
}

const rowById = (id: string) => currentPadlets.find((p) => p.id === id)!;

const NOTE_PAYLOAD = {
  title: 'edited title', content: 'edited body', cardColor: '#abcdef',
  reactions: ['x'], badgeColor: '#facc15',
  detachedComments: [{ id: 'c1', text: 't', userId: 'u', userName: 'U', timestamp: 1 }],
} as never;

afterEach(() => {
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = []; api = null; setDraft = null; currentPadlets = [];
  schedulerLayout = false; seedRows = null;
  onSaveSpy = null; closes = 0; callOrder = [];
  toastError.mockReset(); vi.clearAllMocks();
});

// == 1. The adapter, on its own ==

describe('1. the RPC adapter classifies, and never softens, an outcome', () => {
  const call = async (reply: RpcReply) => {
    const rpc = vi.fn(async () => reply);
    const result = await updateSyncedNotePair({ rpc } as never, { padletId: NOTE_A,
      twinId: NOTE_B, boardId: BOARD, title: 't', content: 'c',
      shared: { cardColor: '#111' }, sourceOnly: { reactions: ['a'] } });
    return { result, rpc };
  };

  it('names one function, and sends only allowlisted keys under explicit nulls', async () => {
    const { rpc } = await call({ data: serverRows(), error: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as unknown as [string, Record<string, never>];
    expect(fn).toBe('update_synced_note_pair');
    // `undefined` would vanish in JSON and read as "unchanged"; the RPC needs
    // an explicit null to clear a key back to its default.
    expect(args.p_shared_appearance)
      .toEqual({ cardColor: '#111', topStrip: null, textColor: null, titleStyle: null });
    expect(args.p_source_metadata).toEqual({ reactions: ['a'], badgeColor: null,
      detachedComments: null, commentTitle: null, commentTitleStyle: null });
    // Nothing structural is even nameable from here.
    expect(JSON.stringify(args)).not.toContain('parentId');
    expect(JSON.stringify(args)).not.toContain('syncedWith');
  });

  it('maps each typed refusal, and anything else to failed', async () => {
    const cases: Array<[string, string]> = [['42501', 'denied'], ['22023', 'invalid_pair'],
      ['40001', 'conflict'], ['08006', 'failed'], ['P0001', 'failed']];
    for (const [code, status] of cases) {
      const { result } = await call({ data: null, error: { code, message: 'x' } });
      expect(result.status, code).toBe(status);
    }
  });

  it('refuses every reply it cannot fully vouch for', async () => {
    const [a, b] = serverRows();
    const THIRD = 'd5000000-0000-4000-8000-0000000000ff';
    const shapes: Array<[string, unknown]> = [
      ['zero rows', []],
      ['one row', [a]],
      ['three rows', [a, b, { ...a, id: THIRD }]],
      ['not an array', null],
      ['a string', 'rows'],
      ['duplicate ids', [a, a]],
      // Records this save never asked about: a filtered, cached or simply
      // wrong reply must not be reconciled into the board.
      ['an unrelated id in place of the twin', [a, { ...b, id: THIRD }]],
      ['a non-uuid id', [a, { ...b, id: 'note-b' }]],
      // Shapes reconciliation would otherwise write straight into the canvas.
      ['a missing id', [a, { title: 'x', content: 'y', metadata: {} }]],
      ['a numeric title', [a, { ...b, title: 7 }]],
      ['an object content', [a, { ...b, content: { html: 'x' } }]],
      ['null metadata', [a, { ...b, metadata: null }]],
      ['array metadata', [a, { ...b, metadata: [] }]],
      ['primitive metadata', [a, { ...b, metadata: 'meta' }]],
      // Two rows that no longer point at each other are not a committed pair.
      ['a missing syncedWith', [a, { ...b, metadata: {} }]],
      ['a non-reciprocal syncedWith', [a, { ...b, metadata: { syncedWith: THIRD } }]],
    ];
    for (const [name, data] of shapes) {
      const { result } = await call({ data, error: null });
      expect(result.status, name).toBe('failed');
    }
    const { result } = await call({ data: serverRows(), error: null });
    expect(result.status, 'and the genuine reciprocal pair IS a success').toBe('saved');
    // Order is the server's to choose; both orders are the same pair.
    expect((await call({ data: [b, a], error: null })).result.status, 'either order').toBe('saved');
  });

  it('reports a rejecting or empty-handed client as failed, and never throws', async () => {
    const boom = { rpc: async () => { throw new Error('network down'); } };
    const sync = { rpc: () => { throw new Error('client not ready'); } };
    const nothing = { rpc: async () => undefined };
    for (const [name, client] of [['rejects', boom], ['throws', sync], ['returns nothing', nothing]] as const) {
      const result = await updateSyncedNotePair(client as never, {
        padletId: NOTE_A, twinId: NOTE_B, boardId: BOARD, title: 't', content: 'c',
        shared: {}, sourceOnly: {},
      });
      expect(result.status, name).toBe('failed');
    }
  });

  it('treats only a non-empty string twin as a synced record', () => {
    expect(readSyncedTwinId({ syncedWith: NOTE_B })).toBe(NOTE_B);
    for (const meta of [null, undefined, {}, { syncedWith: '' }, { syncedWith: 7 }, { syncedWith: {} }]) {
      expect(readSyncedTwinId(meta), JSON.stringify(meta)).toBeNull();
    }
  });
});

// == 2. The hook ==

describe('2. an existing synced Note is saved by exactly one transaction', () => {
  const openPair = (effects: Effects, probe: () => boolean) => {
    mount(probe, effects);
    act(() => { setDraft!(rowById(NOTE_A)); });
  };

  it('makes one RPC, reconciles BOTH returned rows, and settles the editor', async () => {
    const effects = newEffects();
    installSupabase(effects);
    openPair(effects, () => true);

    await act(async () => { await api!.saveNote(NOTE_PAYLOAD); });

    expect(effects.rpcCalls.map((c) => c.fn)).toEqual(['update_synced_note_pair']);
    expect(effects.updates, 'no direct row write survives anywhere in this path').toEqual([]);
    const args = effects.rpcCalls[0].args;
    expect(args.p_padlet_id).toBe(NOTE_A);
    expect(args.p_board_id).toBe(BOARD);
    expect(args.p_title).toBe('edited title');
    // Reactions and the comment set are per-record: they go to the edited
    // member only, and are not part of what synchronizes.
    expect((args.p_source_metadata as Record<string, unknown>).reactions).toEqual(['x']);
    expect((args.p_shared_appearance as Record<string, unknown>)).not.toHaveProperty('reactions');

    // SERVER truth on both members -- not the client's own guess about either.
    expect(rowById(NOTE_A).title).toBe('server title');
    expect(rowById(NOTE_B).title).toBe('server title');
    expect(rowById(NOTE_A).content).toBe('server body');
    expect(rowById(NOTE_B).content).toBe('server body');
    // And each keeps its OWN record-specific metadata.
    expect((rowById(NOTE_A).metadata as Record<string, unknown>).parentId).toBe('pa');
    expect((rowById(NOTE_B).metadata as Record<string, unknown>).parentId).toBe('pb');
    expect(rowById(OTHER).title, 'an unrelated record is untouched').toBe('untouched');

    expect(effects.editorCloses).toEqual(['note']);
    expect(effects.draftSets.at(-1)).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('leaves an UNSYNCED Note on its existing single-row path', async () => {
    const effects = newEffects();
    installSupabase(effects);
    mount(() => true, effects);
    act(() => { setDraft!(rowById(OTHER)); });

    await act(async () => { await api!.saveNote(NOTE_PAYLOAD); });

    expect(effects.rpcCalls, 'no pair transaction for a record with no twin').toEqual([]);
    expect(effects.updates.length, 'one ordinary update, as before').toBe(1);
    expect(rowById(OTHER).title).toBe('edited title');
    expect(effects.editorCloses).toEqual(['note']);
  });

  it('the container and source-reference follow-ups stay limited to NEW Notes', async () => {
    const effects = newEffects();
    installSupabase(effects);
    openPair(effects, () => true);
    await act(async () => { await api!.saveNote(NOTE_PAYLOAD); });
    expect(effects.selects, 'no container read for an existing Note').toEqual([]);
    expect(effects.sourceNotes, 'and no provenance write').toEqual([]);
    expect(effects.inserts, 'nothing was created').toEqual([]);
  });
});

describe('3. authority is asked live, and the answer is obeyed', () => {
  it('an unauthorized probe issues no request and changes nothing', async () => {
    for (const probe of [() => false, () => false as boolean]) {
      const effects = newEffects();
      installSupabase(effects);
      mount(probe, effects);
      act(() => { setDraft!(rowById(NOTE_A)); });

      await act(async () => { await api!.saveNote(NOTE_PAYLOAD); });

      expect(effects.rpcCalls, 'zero requests').toEqual([]);
      expect(effects.updates, 'zero writes').toEqual([]);
      expect(rowById(NOTE_A).title, 'zero local effect').toBe('local a');
      expect(rowById(NOTE_B).title).toBe('local b');
      expect(effects.editorCloses, 'and no editor state touched').toEqual([]);
      expect(toastError, 'a refusal is silent, not an error report').not.toHaveBeenCalled();
    }
  });

  it('a callback retained across a true->false transition issues no request', async () => {
    const effects = newEffects();
    installSupabase(effects);
    let allowed = true;
    mount(() => allowed, effects);
    act(() => { setDraft!(rowById(NOTE_A)); });

    // The SAME callback reference, taken while authorized.
    const retained = api!.saveNote;
    allowed = false;
    await act(async () => { await retained(NOTE_PAYLOAD); });

    expect(effects.rpcCalls, 'the retained handle asks the live probe').toEqual([]);
    expect(rowById(NOTE_A).title).toBe('local a');
  });

  it('revoked while the transaction is in flight: it finishes, nothing follows it', async () => {
    const effects = newEffects();
    const rpcGate = gate();
    installSupabase(effects, { rpcGate });
    let allowed = true;
    mount(() => allowed, effects);
    act(() => { setDraft!(rowById(NOTE_A)); });

    let running!: Promise<unknown>;
    await act(async () => {
      running = api!.saveNote(NOTE_PAYLOAD);
      await Promise.resolve(); await Promise.resolve();
    });
    expect(effects.rpcCalls.length, 'the one request left while authorized').toBe(1);

    allowed = false;
    await act(async () => { rpcGate.release(); await running; });

    expect(effects.rpcCalls.length, 'no second request').toBe(1);
    expect(effects.updates, 'and no compensating write').toEqual([]);
    // The rows committed, but publishing them locally is no longer ours to do.
    expect(rowById(NOTE_A).title, 'no optimistic reconciliation').toBe('local a');
    expect(rowById(NOTE_B).title).toBe('local b');
    // The editor IS settled, so the same content cannot be submitted twice.
    expect(effects.editorCloses).toEqual(['note']);
    expect(effects.draftSets.at(-1)).toBeNull();
  });
});

describe('4. a refused transaction is never dressed up as a save', () => {
  const failures: Array<[string, RpcReply]> = [
    ['denied', { data: null, error: { code: '42501', message: 'synced_note_pair_denied' } }],
    ['invalid_pair', { data: null, error: { code: '22023', message: 'synced_note_pair_invalid' } }],
    ['conflict', { data: null, error: { code: '40001', message: 'synced_note_pair_conflict' } }],
    ['transport', { data: null, error: { message: 'network' } }],
    ['one row only', { data: [serverRows()[0]], error: null }],
    ['zero rows', { data: [], error: null }],
  ];

  for (const [name, reply] of failures) {
    it(`${name}: the draft survives, no row moves, and the caller is told`, async () => {
      const effects = newEffects();
      installSupabase(effects, { reply });
      mount(() => true, effects);
      act(() => { setDraft!(rowById(NOTE_A)); });

      const result = await act(async () => api!.saveNote(NOTE_PAYLOAD));

      expect((result as { status?: string } | void)?.status, 'reported as failed').toBe('failed');
      expect(rowById(NOTE_A).title, 'neither member is reconciled').toBe('local a');
      expect(rowById(NOTE_B).title).toBe('local b');
      // The editor is what holds the draft. Closing it here would lose an edit
      // the database never accepted.
      expect(effects.editorCloses, 'the editor is NOT closed').toEqual([]);
      expect(effects.draftSets, 'and the draft is not cleared').toEqual([]);
      expect(effects.rpcCalls.length, 'exactly one attempt -- no automatic retry').toBe(1);
      expect(effects.updates, 'and no compensating write').toEqual([]);
      expect(toastError, 'one notification').toHaveBeenCalledTimes(1);
    });
  }

  it('a retry after a failure sends exactly one more request and then succeeds', async () => {
    const effects = newEffects();
    let reply: RpcReply = { data: [], error: null };
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        effects.rpcCalls.push({ fn, args });
        return reply;
      },
      from: () => ({ update: () => ({ eq: async () => ({ data: null, error: null }) }) }),
    };
    vi.mocked(supabaseBrowser).mockReturnValue(client as never);
    mount(() => true, effects);
    act(() => { setDraft!(rowById(NOTE_A)); });

    await act(async () => { await api!.saveNote(NOTE_PAYLOAD); });
    expect(effects.editorCloses).toEqual([]);

    reply = { data: serverRows(), error: null };
    await act(async () => { await api!.saveNote(NOTE_PAYLOAD); });

    expect(effects.rpcCalls.length, 'one per attempt, never more').toBe(2);
    expect(rowById(NOTE_A).title).toBe('server title');
    expect(rowById(NOTE_B).title).toBe('server title');
    expect(effects.editorCloses).toEqual(['note']);
  });
});

// == 5. Scheduler defaults: per-record, and unchanged from before this slice ==

describe('5. a scheduler Note keeps its own dates, and gives the twin none', () => {
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  /** What the RPC was asked to merge into the edited member alone. */
  const sourcePatch = (effects: Effects) =>
    effects.rpcCalls[0].args.p_source_metadata as Record<string, unknown>;
  const sharedPatch = (effects: Effects) =>
    effects.rpcCalls[0].args.p_shared_appearance as Record<string, unknown>;

  const pair = (aMeta: object, bMeta: object): Padlet[] => ([
    { id: NOTE_A, title: 'local a', content: 'a', type: 'text', metadata: { syncedWith: NOTE_B, ...aMeta } },
    { id: NOTE_B, title: 'local b', content: 'b', type: 'text', metadata: { syncedWith: NOTE_A, ...bMeta } },
  ] as unknown as Padlet[]);

  const save = async (effects: Effects) => {
    mount(() => true, effects);
    act(() => { setDraft!(rowById(NOTE_A)); });
    await act(async () => { await api!.saveNote(NOTE_PAYLOAD); });
  };

  it('A+C. on a scheduler layout the edited member gets the defaults; the twin gets none', async () => {
    schedulerLayout = true;
    seedRows = pair({ parentId: 'pa' }, { parentId: 'pb' });
    const effects = newEffects();
    installSupabase(effects);
    await save(effects);

    // The REAL helper ran: a whole hour, and its matching one-hour end.
    const patch = sourcePatch(effects);
    expect(patch.start_date, 'start is an ISO instant').toMatch(ISO);
    expect(patch.end_date).toMatch(ISO);
    const start = Date.parse(patch.start_date as string);
    expect(new Date(start).getMinutes(), 'rounded to the hour, as before').toBe(0);
    expect(new Date(start).getSeconds()).toBe(0);
    expect(Date.parse(patch.end_date as string) - start, 'one hour, as before').toBe(3_600_000);
    // C. The dates are per-record: the twin is never sent them at all.
    expect(sharedPatch(effects), 'not synchronized').not.toHaveProperty('start_date');
    expect(sharedPatch(effects)).not.toHaveProperty('end_date');
  });

  it('B. an existing scheduler value is preserved, never overwritten by a default', async () => {
    schedulerLayout = true;
    seedRows = pair({ start_date: '2026-03-01T09:00:00.000Z', end_date: '2026-03-01T10:00:00.000Z' },
                    { start_date: '2099-12-31T00:00:00.000Z' });
    const effects = newEffects();
    installSupabase(effects);
    await save(effects);

    const patch = sourcePatch(effects);
    expect(patch.start_date, "the edited member's own value survives").toBe('2026-03-01T09:00:00.000Z');
    expect(patch.end_date).toBe('2026-03-01T10:00:00.000Z');
    // The twin's own 2099 date is never named, so nothing can overwrite it.
    expect(JSON.stringify(sharedPatch(effects))).not.toContain('2026-03-01');
    expect(JSON.stringify(effects.rpcCalls[0].args)).not.toContain('2099-12-31');
  });

  it('D. a non-scheduler layout sends no scheduler key at all', async () => {
    seedRows = pair({ parentId: 'pa' }, { parentId: 'pb' });
    const effects = newEffects();
    installSupabase(effects);
    await save(effects);

    const patch = sourcePatch(effects);
    // Omitted, NOT null: the helper only ever adds a default, so an absent
    // value must leave whatever is stored alone rather than clear it.
    expect(patch).not.toHaveProperty('start_date');
    expect(patch).not.toHaveProperty('end_date');
  });

  it('E+F. neither patch can carry placement or any other structural key', async () => {
    seedRows = pair({ parentId: 'pa', sectionId: 'sa' }, { parentId: 'pb' });
    const effects = newEffects();
    installSupabase(effects);
    mount(() => true, effects);
    act(() => { setDraft!(rowById(NOTE_A)); });
    // A hostile payload, offered through every field the editor can fill.
    await act(async () => {
      await api!.saveNote({ ...(NOTE_PAYLOAD as object),
        commentTitle: 'ok',
        metadata: { parentId: 'HIJACK', syncedWith: 'HIJACK' },
      } as never);
    });

    const sent = JSON.stringify(effects.rpcCalls[0].args);
    for (const key of ['parentId', 'sectionId', 'syncedWith', 'childPadletIds', 'position_x', 'zIndex']) {
      expect(sent, `${key} is not nameable through either patch`).not.toContain(key);
    }
    expect(sent).not.toContain('HIJACK');
    // And the allowlisted source keys really are limited to these.
    expect(Object.keys(sourcePatch(effects)).sort())
      .toEqual(['badgeColor', 'commentTitle', 'commentTitleStyle', 'detachedComments', 'reactions']);
  });
});

// == 6. The real save callback, driven through the real NoteEditor ==
//
// Every defect corrected here lived in the SEAM between two files: a save that
// reported nothing, an editor reading silence as success, a settlement done
// twice, a rejection nobody caught. Stubbing either half reproduces none.
describe('6. real saveNote + real NoteEditor, one lifecycle', () => {
  let host: HTMLElement;
  const open = (probe: () => boolean, effects: Effects) => { host = mount(probe, effects, true); };

  /** Closing the Note is what saves it -- there is no separate Save button. */
  const closeByBackdrop = async () => {
    const overlay = host.firstElementChild as HTMLElement;
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
  };
  const editorIsOpen = () => host.querySelector('.ProseMirror') !== null;
  beforeEach(() => { seedRows = [
    { id: NOTE_A, title: 'A', content: '<p>a</p>', type: 'text', metadata: { syncedWith: NOTE_B } },
    { id: NOTE_B, title: 'B', content: '<p>b</p>', type: 'text', metadata: { syncedWith: NOTE_A } },
  ] as unknown as Padlet[]; });

  it('A+G. authorized: reconciles BOTH rows, THEN settles, closing exactly once', async () => {
    const effects = newEffects();
    installSupabase(effects);
    open(() => true, effects);
    await closeByBackdrop();
    expect(effects.rpcCalls.length, 'one transaction').toBe(1);
    // Call order, not commit order: batching makes the end state identical
    // either way, so the end state is not what is asserted here.
    expect(callOrder).toEqual(['reconcile', 'settle', 'clear-draft']);
    expect(effects.editorCloses, 'settled once, by the save itself').toEqual(['note']);
    expect(closes, 'and NOT a second time by the editor').toBe(0);
    expect(editorIsOpen()).toBe(false);
    expect(rowById(NOTE_A).title, 'both rows carry server truth').toBe('server title');
    expect(rowById(NOTE_B).title).toBe('server title');
  });

  it('B. denied from the start: no request, no close, draft intact, silent', async () => {
    const effects = newEffects();
    installSupabase(effects);
    open(() => false, effects);
    await closeByBackdrop();
    expect(effects.rpcCalls, 'zero requests').toEqual([]);
    expect(effects.editorCloses, 'nothing settled').toEqual([]);
    expect(closes).toBe(0);
    expect(editorIsOpen(), 'still open, holding the draft').toBe(true);
    expect(effects.draftSets, 'the draft was never cleared').toEqual([]);
    expect(toastError, 'a permission never held is not announced').not.toHaveBeenCalled();
    expect(rowById(NOTE_A).title, 'no reconciliation').toBe('A');
  });

  it('C. a retained callback after true->false: no request, editor stays open', async () => {
    const effects = newEffects();
    installSupabase(effects);
    let allowed = true;
    open(() => allowed, effects);
    allowed = false;
    await closeByBackdrop();
    expect(effects.rpcCalls).toEqual([]);
    expect(editorIsOpen()).toBe(true);
    expect(closes).toBe(0);
  });

  const refusals: Array<[string, RpcReply]> = [
    ['denied', { data: null, error: { code: '42501', message: 'x' } }],
    ['invalid_pair', { data: null, error: { code: '22023', message: 'x' } }],
    ['conflict', { data: null, error: { code: '40001', message: 'x' } }],
    ['failed', { data: null, error: { message: 'x' } }],
  ];
  for (const [name, reply] of refusals) {
    it(`D. ${name}: the editor stays open with its draft, nothing reconciles`, async () => {
      const effects = newEffects();
      installSupabase(effects, { reply });
      open(() => true, effects);
      await closeByBackdrop();
      expect(editorIsOpen(), 'still open').toBe(true);
      expect(effects.editorCloses, 'nothing settled').toEqual([]);
      expect(closes).toBe(0);
      expect(effects.draftSets).toEqual([]);
      expect(rowById(NOTE_A).title, 'no reconciliation').toBe('A');
      expect(toastError, 'one message').toHaveBeenCalledTimes(1);
      expect(String(toastError.mock.calls[0][0]), 'and it names no database detail')
        .not.toMatch(/sql|postgres|4250|2202|4000/i);
    });
  }

  /** Catches anything escaping as an unhandled promise rejection. */
  const watchRejections = () => {
    const seen: unknown[] = [];
    const on = (e: Event) => { seen.push(e); };
    window.addEventListener('unhandledrejection', on);
    return { seen, stop: () => window.removeEventListener('unhandledrejection', on) };
  };
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
  it('E. a genuinely rejecting RPC: no unhandled rejection, editor and draft survive', async () => {
    const effects = newEffects();
    const watch = watchRejections();
    vi.mocked(supabaseBrowser).mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
      rpc: async () => {
        effects.rpcCalls.push({ fn: 'update_synced_note_pair', args: {} });
        throw new Error('network down');
      },
      from: () => ({ update: () => ({ eq: async () => ({ data: null, error: null }) }) }),
    } as never);
    open(() => true, effects);
    await closeByBackdrop(); await flush(); watch.stop();
    expect(watch.seen, 'nothing escaped as an unhandled rejection').toEqual([]);
    expect(editorIsOpen(), 'the editor still holds the draft').toBe(true);
    expect(effects.editorCloses).toEqual([]);
    expect(effects.rpcCalls.length, 'one attempt, no automatic retry').toBe(1);
    expect(toastError, 'the intended handling, once').toHaveBeenCalledTimes(1);
  });

  it('F. a rejecting onSave: no unhandled rejection, no close, still retryable', async () => {
    const effects = newEffects();
    installSupabase(effects);
    const watch = watchRejections();
    let attempts = 0;
    onSaveSpy = (() => { attempts += 1; return Promise.reject(new Error('boom')); }) as never;
    open(() => true, effects);
    await closeByBackdrop();
    await flush();
    expect(watch.seen).toEqual([]);
    expect(closes, 'the editor did not close over a rejected save').toBe(0);
    expect(editorIsOpen()).toBe(true);
    // And the editor is not wedged: the very next attempt is still accepted.
    await closeByBackdrop();
    await flush();
    watch.stop();
    expect(attempts, 'a retry is still possible').toBe(2);
  });

  it('H. success that arrives after revocation: settled, but nothing optimistic', async () => {
    const effects = newEffects();
    const rpcGate = gate();
    installSupabase(effects, { rpcGate });
    let allowed = true;
    open(() => allowed, effects);
    await closeByBackdrop();
    expect(effects.rpcCalls.length, 'the one request left while authorized').toBe(1);

    allowed = false;
    await act(async () => { rpcGate.release(); await Promise.resolve(); await Promise.resolve(); });
    expect(effects.rpcCalls.length, 'no second request').toBe(1);
    expect(effects.updates, 'and no compensating write').toEqual([]);
    expect(rowById(NOTE_A).title, 'no optimistic reconciliation').toBe('A');
    expect(rowById(NOTE_B).title).toBe('B');
    expect(effects.editorCloses, 'settled safely, once').toEqual(['note']);
    expect(closes).toBe(0);
  });
});
