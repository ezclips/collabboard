// @vitest-environment jsdom
//
// PATCH-307. mergeCanvasSettings updates the board's LOCAL settings in place
// (immutably) so a later write that spreads `canvas.settings` -- the board
// settings modal -- cannot erase a value saved earlier in the same visit.
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasData } from './useCanvasData';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { CanvasAction } from '../store/actions';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
vi.mock('@/lib/collabboard/thumbnailGenerator', () => ({
  generateAndSaveThumbnail: vi.fn(),
  updateLastVisited: vi.fn(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD = 'b1000000-0000-4000-8000-0000000000b1';

function installSupabase(boardData: Record<string, unknown> | null) {
  const empty = { then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) };
  const client = {
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: () => {},
    from(table: string) {
      return {
        select: () => ({
          eq: (_col: string, _val: string) =>
            table === 'boards'
              ? { maybeSingle: async () => ({ data: boardData, error: null }) }
              : empty,
        }),
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
}

type Api = ReturnType<typeof useCanvasData>;
let api: Api | null = null;
let mounted: ReturnType<typeof render> | null = null;

function Harness({ canvasId }: { canvasId?: string }) {
  const dispatch: React.Dispatch<CanvasAction> = () => {};
  const data = useCanvasData({ canvasId, dispatch });
  api = data;
  return (
    <div data-testid="probe">
      {JSON.stringify({ settings: data.canvas?.settings ?? null })}
    </div>
  );
}

const settings = () =>
  JSON.parse(screen.getByTestId('probe').textContent ?? '{}').settings as Record<string, unknown> | null;

async function mount(canvasId: string) {
  await act(async () => {
    mounted = render(<Harness canvasId={canvasId} />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (mounted) {
    act(() => {
      mounted!.unmount();
    });
  }
  cleanup();
  mounted = null;
  api = null;
  vi.restoreAllMocks();
});

describe('useCanvasData.mergeCanvasSettings', () => {
  it('merges a patch into existing settings without dropping other keys', async () => {
    installSupabase({
      id: BOARD,
      layout: 'timeline',
      settings: { chronoMode: 'horizontal', titleHeader: 'History' },
    });
    await mount(BOARD);
    expect(settings()).toEqual({ chronoMode: 'horizontal', titleHeader: 'History' });

    await act(async () => {
      api!.mergeCanvasSettings({ chronoMode: 'vertical' });
    });

    expect(settings()).toEqual({ chronoMode: 'vertical', titleHeader: 'History' });
  });

  it('keeps the previous board object unmutated', async () => {
    installSupabase({ id: BOARD, layout: 'timeline', settings: { chronoMode: 'horizontal' } });
    await mount(BOARD);
    const before = api!.canvas;
    const beforeSettings = { ...(before?.settings ?? {}) };

    await act(async () => {
      api!.mergeCanvasSettings({ chronoMode: 'vertical' });
    });

    expect(api!.canvas).not.toBe(before);
    expect(before?.settings).toEqual(beforeSettings);
  });

  it('is a no-op when there is no board', async () => {
    installSupabase(null);
    await mount(BOARD);
    expect(api!.canvas).toBeNull();

    await act(async () => {
      api!.mergeCanvasSettings({ chronoMode: 'vertical' });
    });

    expect(api!.canvas).toBeNull();
  });
});
