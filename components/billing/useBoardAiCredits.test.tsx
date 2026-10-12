// @vitest-environment jsdom
//
// PATCH-343 Addendum 1. The credits hook: a null board id makes no request, a
// valid body is parsed, and a malformed body is treated like a failed read.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBoardAiCredits, type BoardAiCredits } from '@/lib/hooks/useBoardAiCredits';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;
let latest: { data: BoardAiCredits | null; refresh: () => Promise<void> } | null = null;

function Harness({ boardId }: { boardId: string | null }) {
  latest = useBoardAiCredits(boardId);
  return null;
}

async function render(boardId: string | null) {
  if (!root) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => { root!.render(<Harness boardId={boardId} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const VALID = {
  planId: 'pro',
  credits: { used: 500, total: 2000, remaining: 1500, renewsOn: '2026-10-25T17:35:45.000Z' },
  ownKey: false,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  latest = null;
  fetchMock = vi.fn(async () => json(VALID));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PATCH-343 useBoardAiCredits', () => {
  it('makes no request and holds no data for a null board id', async () => {
    await render(null);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(latest?.data).toBeNull();
  });

  it('fetches once and parses a valid body', async () => {
    await render('board-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/boards/board-1/ai/credits');
    expect(latest?.data).toEqual(VALID);
  });

  it('treats a malformed body as no data', async () => {
    fetchMock.mockResolvedValue(json({ planId: 'pro', credits: { used: 0, total: 0, remaining: 0, renewsOn: null } }));
    await render('board-1');
    expect(latest?.data).toBeNull();
  });

  it('treats a negative credit and a bad plan id as no data', async () => {
    fetchMock.mockResolvedValue(json({ ...VALID, planId: 'enterprise' }));
    await render('board-1');
    expect(latest?.data).toBeNull();

    fetchMock.mockResolvedValue(json({ ...VALID, credits: { ...VALID.credits, remaining: -1 } }));
    await act(async () => { await latest!.refresh(); });
    expect(latest?.data).toBeNull();
  });

  it('treats a non-ok response as no data', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Forbidden' }, 403));
    await render('board-1');
    expect(latest?.data).toBeNull();
  });

  it('refetches on refresh()', async () => {
    await render('board-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await latest!.refresh(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
