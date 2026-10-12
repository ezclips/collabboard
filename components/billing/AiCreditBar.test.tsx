// @vitest-environment jsdom
//
// PATCH-343. The AI credit bar: nothing until data arrives, the level colours
// and texts, the meter's aria, and the one-time low/empty warning.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));

import { toast } from 'sonner';
import type { BoardAiCredits } from '@/lib/hooks/useBoardAiCredits';
import { AiCreditBar } from './AiCreditBar';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const credits = (over: Partial<BoardAiCredits['credits']> = {}, top: Partial<BoardAiCredits> = {}): BoardAiCredits => ({
  planId: 'pro',
  credits: { used: 500, total: 2000, remaining: 1500, renewsOn: '2026-10-25T17:35:45.000Z', ...over },
  ownKey: false,
  ...top,
});

async function render(
  data: BoardAiCredits | null,
  conversationTokens: { input: number; output: number; total: number } | null = null,
) {
  if (!root) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => { root!.render(<AiCreditBar data={data} conversationTokens={conversationTokens} />); });
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(toast.warning).mockClear();
});
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-343 AiCreditBar', () => {
  it('renders nothing until data arrives', async () => {
    await render(null);
    expect(host.textContent).toBe('');
    expect(q('[data-ai-credit-bar]')).toBeNull();
  });

  it('ok: a blue fill, no text, and the meter aria', async () => {
    await render(credits());
    expect(q('[data-ai-credit-bar="ok"]')).not.toBeNull();
    const meter = q('[role="meter"]')!;
    expect(meter.getAttribute('aria-valuenow')).toBe('1500');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('2000');
    const n = (value: number) => value.toLocaleString();
    expect(meter.getAttribute('title')).toContain(`${n(1500)} of ${n(2000)} AI credits left`);
    expect(meter.getAttribute('title')).toContain('renews 25 October');
    const fill = meter.firstElementChild as HTMLElement;
    expect(fill.className).toContain('bg-blue-500');
    expect(fill.style.width).toBe('75%');
    expect(host.textContent).not.toContain('running low');
  });

  it('low: amber fill and a one-line warning with See plans', async () => {
    await render(credits({ remaining: 400 }));
    expect(q('[data-ai-credit-bar="low"]')).not.toBeNull();
    const fill = q('[role="meter"]')!.firstElementChild as HTMLElement;
    expect(fill.className).toContain('bg-amber-500');
    expect(fill.style.width).toBe('20%');
    expect(host.textContent).toContain('AI credits running low: 400 left');
    expect(host.textContent).toContain('See plans');
  });

  it('empty: a red track and the empty text', async () => {
    await render(credits({ remaining: 0 }));
    expect(q('[data-ai-credit-bar="empty"]')).not.toBeNull();
    expect(q('[role="meter"]')!.className).toContain('bg-red-500');
    expect(host.textContent).toContain('No AI credits left until 25 October');
  });

  it('own-key: no bar, one muted line', async () => {
    await render(credits({}, { ownKey: true }));
    expect(q('[data-ai-credit-bar="own-key"]')).not.toBeNull();
    expect(q('[role="meter"]')).toBeNull();
    expect(host.textContent).toContain('Using your own AI key');
  });

  it('PATCH-345 own-key with tokens: shows the per-conversation total', async () => {
    await render(credits({}, { ownKey: true }), { input: 9820, output: 2611, total: 12431 });
    const line = q('[data-ai-credit-bar="own-key"]')!;
    const n = (value: number) => value.toLocaleString();
    expect(line.textContent).toContain(
      `Your own AI key · this chat: ${n(12431)} tokens (${n(9820)} in · ${n(2611)} out)`,
    );
    expect(line.getAttribute('title')).toContain('No CollabBoard credits used');
  });

  it('PATCH-345 own-key without tokens keeps the PATCH-343 line', async () => {
    await render(credits({}, { ownKey: true }));
    expect(q('[data-ai-credit-bar="own-key"]')?.textContent).toContain('Using your own AI key — no credits used');
    expect(q('[data-ai-credit-bar="own-key"]')?.getAttribute('title')).toBeNull();
  });

  it('free: no bar, "No AI on Free" with a See plans link', async () => {
    await render(credits({ total: 0, remaining: 0, renewsOn: null }, { planId: 'free' }));
    expect(q('[data-ai-credit-bar="free"]')).not.toBeNull();
    expect(host.textContent).toContain('No AI on Free');
    expect(q('[data-ai-credit-bar="free"] a')?.getAttribute('href')).toBe('/dashboard/settings/billing');
  });

  it('warns once per renewsOn + level, and not again on re-render', async () => {
    await render(credits({ remaining: 400 }));
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toContain('AI credits running low: 400 left');

    // A new data object with the same period + level must not warn again.
    await render(credits({ remaining: 350 }));
    expect(toast.warning).toHaveBeenCalledTimes(1);

    // A different period DOES warn again.
    await render(credits({ remaining: 300, renewsOn: '2026-11-25T00:00:00.000Z' }));
    expect(toast.warning).toHaveBeenCalledTimes(2);
  });

  it('does not warn for own-key or free', async () => {
    await render(credits({}, { ownKey: true }));
    await render(credits({ total: 0, remaining: 0 }, { planId: 'free' }));
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
