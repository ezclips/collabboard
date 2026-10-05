// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DrawnKind } from '@/lib/ai/drawn/prompt';
import type { VisualOutline } from '@/lib/ai/outline';

import { useDrawnOptions, type UseDrawnOptionsResult } from './useDrawnOptions';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const outline: VisualOutline = {
  title: 'Launch',
  ordered: false,
  kind: 'steps',
  items: [{ label: 'A' }, { label: 'B' }],
};

const picture = {
  version: 1,
  width: 800,
  height: 600,
  background: '#ffffff',
  elements: [{ id: 'r', type: 'rect', x: 0, y: 0, w: 100, h: 50, fill: '#aabbcc', stroke: '#000000' }],
};

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
let latest: UseDrawnOptionsResult | null = null;

function Harness({ boardId }: { boardId?: string }) {
  latest = useDrawnOptions({ boardId });
  return null;
}

function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  latest = null;
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

function okResponse() {
  return new Response(JSON.stringify({ picture, kind: 'pie', seed: 1 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function bodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter((call) => call[0] === '/api/ai/draw-picture')
    .map((call) => JSON.parse(String((call[1] as RequestInit).body)));
}

describe('PATCH-284 useDrawnOptions', () => {
  it('draws three pictures with distinct seeds and the board id', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    mount(<Harness boardId="board-1" />);

    act(() => { latest!.draw(outline, 'pie'); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); });

    const posted = bodies(fetchMock);
    expect(posted).toHaveLength(3);
    expect(new Set(posted.map((b) => b.seed)).size).toBe(3);
    expect(posted.every((b) => b.boardId === 'board-1' && b.kind === 'pie')).toBe(true);
    expect(latest!.status).toBe('done');
    expect(latest!.options).toHaveLength(3);
    expect(latest!.options[0].key.startsWith('drawn:pie:')).toBe(true);
  });

  it('keeps at most two requests in flight', async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn((url: string) => {
      if (url !== '/api/ai/draw-picture') return Promise.resolve(okResponse());
      return new Promise<Response>((resolve) => pending.push(resolve));
    });
    vi.stubGlobal('fetch', fetchMock);
    mount(<Harness />);

    act(() => { latest!.draw(outline, 'flowchart'); });
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => { pending[0](okResponse()); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      pending[1](okResponse());
      pending[2](okResponse());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(latest!.options).toHaveLength(3);
  });

  it('keeps the good pictures when one request fails', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      return call === 2
        ? new Response(JSON.stringify({ error: 'Nope' }), { status: 500 })
        : okResponse();
    });
    vi.stubGlobal('fetch', fetchMock);
    mount(<Harness />);

    act(() => { latest!.draw(outline, 'bar'); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); });

    expect(latest!.status).toBe('done');
    expect(latest!.options).toHaveLength(2);
  });

  it("carries the route's message when all three fail", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment before generating again.' }), {
        status: 429,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    mount(<Harness />);

    act(() => { latest!.draw(outline, 'timeline'); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); });

    expect(latest!.status).toBe('error');
    expect(latest!.error).toBe('Rate limit exceeded. Please wait a moment before generating again.');
    expect(latest!.options).toHaveLength(0);
  });

  it('shuffle draws three more with seeds never seen this session', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    mount(<Harness />);

    act(() => { latest!.draw(outline, 'pie'); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); });
    act(() => { latest!.shuffle(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); });

    const seeds = bodies(fetchMock).map((b) => b.seed as number);
    expect(seeds).toHaveLength(6);
    expect(new Set(seeds).size).toBe(6);
  });

  it('aborts in-flight requests on unmount', async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetchMock);
    const container = mount(<Harness />);

    act(() => { latest!.draw(outline, 'pie'); });
    await act(async () => { await Promise.resolve(); });
    expect(signals[0]?.aborted).toBe(false);

    act(() => { mounted[0].root.unmount(); });
    container.remove();
    mounted = [];
    expect(signals[0]?.aborted).toBe(true);
  });
});
