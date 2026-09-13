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
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const BOARD = 'board-1';
const NOTE_A = 'note-a';
const NOTE_B = 'note-b';
const OTHER = 'note-unrelated';

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

function Harness({ probe, effects }: { probe: () => boolean; effects: Effects }) {
  const [padlets, setPadlets] = React.useState<Padlet[]>(seedRows ?? [
    { id: NOTE_A, title: 'local a', content: 'local a body', type: 'text', metadata: { syncedWith: NOTE_B, parentId: 'pa' } } as unknown as Padlet,
    { id: NOTE_B, title: 'local b', content: 'local b body', type: 'text', metadata: { syncedWith: NOTE_A, parentId: 'pb' } } as unknown as Padlet,
    { id: OTHER, title: 'untouched', content: 'untouched body', type: 'text', metadata: {} } as unknown as Padlet,
  ]);
  const [padletToEdit, setPadletToEdit] = React.useState<Padlet | null>(null);
  setDraft = setPadletToEdit;
  currentPadlets = padlets;

  api = usePadletSave({
    canEditBoardContentNow: probe, canvasId: BOARD, padletToEdit,
    isWallLayout: false, isColumnsLayout: false, isGridLayout: false,
    isDrawingLayout: false, isTimelineLayout: false, isSchedulerLayout: schedulerLayout,
    isFreeformLayout: true, isMapLayout: false,
    setPadletToEdit: (next: Padlet | null) => { effects.draftSets.push(next); setPadletToEdit(next); },
    fetchData: async () => {},
    setIsNoteEditorOpen: () => { effects.editorCloses.push('note'); },
    setIsLinkEditorOpen: () => {}, setIsTodoEditorOpen: () => {},
    setIsTableEditorOpen: () => {}, setIsContainerEditorOpen: () => {},
    setIsCommentEditorOpen: () => {}, setIsCardEditorOpen: () => {},
    setIsImageEditorOpen: () => {}, isImageEditorOpen: true,
    setIsDrawingEditorOpen: () => {}, setIsAIComponentEditorOpen: () => {},
    setPendingPostDraft: () => {}, setIsPlacementPromptOpen: () => {},
    setWallPendingPostDraft: () => {}, setWallPlacementPromptOpen: () => {},
    padlets, setPadlets, getNewPostPosition: () => ({ x: 0, y: 0 }),
    onSourceNoteCreated: (id: string) => { effects.sourceNotes.push(id); },
  } as never);
  return null;
}

function mount(probe: () => boolean, effects: Effects) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Harness probe={probe} effects={effects} />); });
  mounted.push({ root, container });
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
  toastError.mockReset(); vi.clearAllMocks();
});

// == 1. The adapter, on its own ==

describe('1. the RPC adapter classifies, and never softens, an outcome', () => {
  const call = async (reply: RpcReply) => {
    const rpc = vi.fn(async () => reply);
    const result = await updateSyncedNotePair({ rpc } as never, { padletId: NOTE_A,
      boardId: BOARD, title: 't', content: 'c',
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

  it('refuses to call a partial, empty, malformed or duplicated reply a success', async () => {
    const shapes: unknown[] = [
      [], [serverRows()[0]], null, 'rows',
      [serverRows()[0], { title: 'no id' }],
      [serverRows()[0], serverRows()[0]],
    ];
    for (const data of shapes) {
      const { result } = await call({ data, error: null });
      expect(result.status, JSON.stringify(data)).toBe('failed');
    }
    const { result } = await call({ data: serverRows(), error: null });
    expect(result.status, 'and two distinct rows ARE a success').toBe('saved');
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
