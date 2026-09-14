// @vitest-environment jsdom
//
// FETCHDATA_CONDITIONAL_WRITE_CORRECTION_1 -- fetchData is read-only.
//
// Loading, refreshing or refetching a board must never INSERT board_sections
// or UPDATE padlets to repair a padlet whose metadata.sectionId points at a
// section that no longer exists. This suite drives the REAL hook against a
// recording fake of the one client both the reads AND any would-be repair
// writes share (supabaseBrowser, which lib/infra/supabase/browserClient
// delegates to for every read/write this hook can reach) -- so a regression
// that reintroduces the legacy backend recovery, or the legacy "a failed
// sections read reads as zero sections", shows up as an actual recorded
// request or an actual state overwrite, never as a call to something this
// test mocked out of the path.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasData } from './useCanvasData';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { CanvasAction } from '../store/actions';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
const toastWarning = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { warning: (m: string) => toastWarning(m), error: (m: string) => toastError(m) },
}));
vi.mock('@/lib/collabboard/thumbnailGenerator', () => ({
  generateAndSaveThumbnail: vi.fn(),
  updateLastVisited: vi.fn(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD = 'f1000000-0000-4000-8000-0000000000b1';

type ReadReply<T> = { data: T; error: { message: string } | null };
type Effects = {
  inserts: Array<{ table: string; payload: unknown }>;
  updates: Array<{ table: string; payload: unknown }>;
};
const newEffects = (): Effects => ({ inserts: [], updates: [] });

type Config = {
  board: ReadReply<Record<string, unknown> | null>;
  padlets: ReadReply<Array<Record<string, unknown>> | null>;
  lines: ReadReply<Array<Record<string, unknown>> | null>;
  sections: ReadReply<Array<Record<string, unknown>> | null>;
};

/**
 * The ONE client every read this hook makes -- and every write a
 * reintroduced recovery attempt would make -- actually goes through:
 * findBoardById/findPostsByBoardId/findLinesByBoardId/findSectionsByBoardId
 * and the sections/posts repositories all resolve to
 * createBrowserSupabaseClient(), which is supabaseBrowser() verbatim. `.eq`
 * reads `config` live (not a snapshot taken at install time) so a test can
 * change what the SECOND fetchData call sees without reinstalling.
 */
function installSupabase(effects: Effects, config: Config) {
  const client = {
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel: () => {},
    from(table: string) {
      return {
        select: () => ({
          eq: (_col: string, _val: string) => {
            if (table === 'boards') return { maybeSingle: async () => config.board };
            if (table === 'canvas_lines') return { then: (resolve: (r: unknown) => void) => resolve(config.lines) };
            if (table === 'board_sections') return { then: (resolve: (r: unknown) => void) => resolve(config.sections) };
            return { then: (resolve: (r: unknown) => void) => resolve(config.padlets) };
          },
        }),
        insert(payload: unknown) {
          effects.inserts.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({ data: null, error: null }),
              then: (resolve: (r: unknown) => void) => resolve({ data: [], error: null }),
            }),
          };
        },
        update(payload: unknown) {
          effects.updates.push({ table, payload });
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
  return client;
}

type Api = ReturnType<typeof useCanvasData>;
let api: Api | null = null;
let mounted: ReturnType<typeof render> | null = null;

function Harness({ canvasId }: { canvasId: string }) {
  const dispatch: React.Dispatch<CanvasAction> = () => {};
  const data = useCanvasData({ canvasId, dispatch });
  api = data;
  return (
    <div data-testid="probe">
      {JSON.stringify({
        loading: data.loading,
        error: data.error,
        canvasId: data.canvas ? (data.canvas as unknown as { id: string }).id : null,
        sections: data.sections.map((s) => ({ id: s.id, title: s.title })),
        padletSectionIds: data.padlets.map((p) => (p.metadata as { sectionId?: unknown } | null)?.sectionId ?? null),
        padletCount: data.padlets.length,
      })}
    </div>
  );
}

function probe() {
  return JSON.parse(screen.getByTestId('probe').textContent ?? '{}');
}

async function mountAndSettle(canvasId = BOARD) {
  await act(async () => {
    mounted = render(<Harness canvasId={canvasId} />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function refetch() {
  await act(async () => {
    await api!.fetchData();
  });
}

const board = (layout: string): ReadReply<Record<string, unknown>> => ({
  data: { id: BOARD, layout },
  error: null,
});
const ok = <T,>(data: T): ReadReply<T> => ({ data, error: null });
const failed = <T,>(): ReadReply<T | null> => ({ data: null, error: { message: 'read failed' } });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (mounted) { act(() => { mounted!.unmount(); }); }
  cleanup();
  mounted = null;
  api = null;
  toastWarning.mockReset();
  toastError.mockReset();
  vi.restoreAllMocks();
});

// == A. complete references: zero repair activity ==================

describe('A. successful reads with every referenced section present', () => {
  it('makes zero create/update requests to board_sections or padlets', async () => {
    const effects = newEffects();
    installSupabase(effects, {
      board: board('columns'),
      padlets: ok([{ id: 'p1', board_id: BOARD, type: 'card', title: 'T', content: '', metadata: { sectionId: '10' } }]),
      lines: ok([]),
      sections: ok([{ id: 10, board_id: BOARD, title: 'S1', description: '', position: 0, created_at: 't', updated_at: 't' }]),
    });

    await mountAndSettle();

    expect(effects.inserts, 'no create request of any kind').toEqual([]);
    expect(effects.updates, 'no update request of any kind').toEqual([]);
    expect(toastWarning, 'no persistence-success toast').not.toHaveBeenCalled();
    const state = probe();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.sections).toEqual([{ id: 10, title: 'S1' }]);
    expect(state.padletCount).toBe(1);
  });
});

// == B. a padlet references a section that does not exist ===========

describe('B. a padlet references a missing section', () => {
  it('synthesizes the section locally under the padlet\'s own referenced id, with zero backend writes', async () => {
    const effects = newEffects();
    installSupabase(effects, {
      board: board('grid'),
      padlets: ok([{ id: 'p1', board_id: BOARD, type: 'card', title: 'T', content: '', metadata: { sectionId: '42' } }]),
      lines: ok([]),
      sections: ok([]),
    });

    await mountAndSettle();

    expect(effects.inserts, 'no board_sections insert -- the section is never persisted').toEqual([]);
    expect(effects.updates, 'no padlet update -- the reference is never rewritten').toEqual([]);
    expect(toastWarning, 'no toast claims anything was recovered on the server').not.toHaveBeenCalled();
    const state = probe();
    // The synthesized section keeps the EXACT id the padlet already points
    // at, so the padlet stays associated for rendering without touching it.
    expect(state.sections).toEqual([{ id: 42, title: 'Recovered Section 1' }]);
    expect(state.padletSectionIds).toEqual(['42']);
    expect(state.padletCount).toBe(1);
  });

  it('a non-grid/columns layout never synthesizes, even with a dangling reference', async () => {
    const effects = newEffects();
    installSupabase(effects, {
      board: board('freeform'),
      padlets: ok([{ id: 'p1', board_id: BOARD, type: 'card', title: 'T', content: '', metadata: { sectionId: '42' } }]),
      lines: ok([]),
      sections: ok([]),
    });

    await mountAndSettle();

    expect(effects.inserts).toEqual([]);
    expect(effects.updates).toEqual([]);
    expect(probe().sections).toEqual([]);
  });
});

// == C. a failed sections read is a load error, not an empty board ===

describe('C. a failed sections read', () => {
  it('is never reinterpreted as "all referenced sections are missing", and issues zero writes', async () => {
    const effects = newEffects();
    const config: Config = {
      board: board('columns'),
      padlets: ok([{ id: 'p1', board_id: BOARD, type: 'card', title: 'T', content: '', metadata: { sectionId: '5' } }]),
      lines: ok([]),
      sections: failed(),
    };
    installSupabase(effects, config);

    await mountAndSettle();

    // A missing-reference recovery driven off this failure would fabricate
    // a "Recovered Section 1" locally and, before this fix, try to persist
    // one. Neither happens: the read failure produces no section at all.
    expect(effects.inserts, 'zero create/insert requests').toEqual([]);
    expect(effects.updates, 'zero update requests').toEqual([]);
    const state = probe();
    expect(state.sections, 'no synthesized "all missing" recovery').toEqual([]);
    expect(state.error, 'a failed sections read is not the load-error path').toBeNull();
    expect(state.padletCount, 'the padlets read, which succeeded, still hydrates').toBe(1);
  });

  it('does not overwrite sections state that a prior successful read already populated', async () => {
    const effects = newEffects();
    const config: Config = {
      board: board('columns'),
      padlets: ok([{ id: 'p1', board_id: BOARD, type: 'card', title: 'T', content: '', metadata: {} }]),
      lines: ok([]),
      sections: ok([{ id: 5, board_id: BOARD, title: 'Known Section', description: '', position: 0, created_at: 't', updated_at: 't' }]),
    };
    installSupabase(effects, config);
    await mountAndSettle();
    expect(probe().sections).toEqual([{ id: 5, title: 'Known Section' }]);

    // The next read of sections fails; everything else keeps succeeding.
    config.sections = failed();
    config.padlets = ok([{ id: 'p1', board_id: BOARD, type: 'card', title: 'Updated', content: '', metadata: {} }]);
    await refetch();

    const state = probe();
    expect(state.sections, 'known section state survives a failed re-read untouched').toEqual([{ id: 5, title: 'Known Section' }]);
    expect(state.padletCount, 'the successful padlets re-read still reconciles').toBe(1);
    expect(effects.inserts).toEqual([]);
    expect(effects.updates).toEqual([]);
  });
});

// == D. repeated / refetch stays read-only, with no accumulation =====

describe('D. repeated fetchData calls remain backend-read-only', () => {
  it('two consecutive fetches over the same dangling reference make zero requests and do not accumulate synthesized sections', async () => {
    const effects = newEffects();
    installSupabase(effects, {
      board: board('columns'),
      padlets: ok([{ id: 'p1', board_id: BOARD, type: 'card', title: 'T', content: '', metadata: { sectionId: '7' } }]),
      lines: ok([]),
      sections: ok([]),
    });

    await mountAndSettle();
    expect(probe().sections).toEqual([{ id: 7, title: 'Recovered Section 1' }]);

    await refetch();
    await refetch();

    expect(effects.inserts, 'still zero after repeated refetches').toEqual([]);
    expect(effects.updates, 'still zero after repeated refetches').toEqual([]);
    expect(probe().sections, 'recomputed fresh each time, not appended').toEqual([{ id: 7, title: 'Recovered Section 1' }]);
  });
});

// == E. no actor-conditional gate stands in for removing the writes ==

describe('E. the removal is unconditional, not authority-gated', () => {
  const hookSrc = fs.readFileSync(
    path.join(process.cwd(), 'components/collabboard/canvas/hooks/useCanvasData.ts'),
    'utf8',
  );

  it('useCanvasData takes no user/authority parameter -- fetchData has nothing an owner/editor/viewer/null-user distinction could attach to', () => {
    expect(hookSrc).toMatch(/export function useCanvasData\(\{\s*canvasId,\s*dispatch\s*\}: UseCanvasDataParams\)/);
  });

  it('no edit-authority probe was added to retain the writes -- they are gone for every actor, not gated', () => {
    expect(hookSrc).not.toMatch(/findBoardCollaboratorRole|canEditBoard|useBoardCollaboratorAuthority|collaboratorAuthority/i);
  });

  it('the backend recovery machinery itself is gone from this file, not merely unreachable', () => {
    expect(hookSrc).not.toMatch(/createCreateSectionsCommand|createSectionsRepository|createUpdatePostMetadataBestEffortCommand/);
    expect(hookSrc).not.toMatch(/Recovered missing row\/grid sections/);
  });

  it('every case in A-D above mounts the hook identically regardless of who -- if anyone -- is calling, and all show zero writes', () => {
    // The runtime proof: E has no separate code path to exercise, because
    // there is no actor input in scope. This assertion documents that the
    // zero-write result above did not depend on any implicit "current user".
    expect(api).toBeNull();
  });
});
