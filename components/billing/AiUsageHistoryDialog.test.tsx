// @vitest-environment jsdom
//
// PATCH-344. The AI usage history dialog: rows and their labels, Load more,
// and the empty / error / loading states. The reader is mocked so the fetch
// shape and paging are what the test observes.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/infra/billing/fetchAiUsageHistory', () => ({ fetchAiUsageHistory: vi.fn() }));

import { fetchAiUsageHistory, type AiUsageHistoryEntry } from '@/lib/infra/billing/fetchAiUsageHistory';
import { AiUsageHistoryDialog } from './AiUsageHistoryDialog';

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const entry = (over: Partial<AiUsageHistoryEntry> = {}): AiUsageHistoryEntry => ({
  id: 'e1',
  createdAt: '2026-10-12T14:05:00.000000+00:00',
  feature: 'notes_to_cards',
  featureLabel: 'Suggest cards',
  boardId: 'b1',
  boardTitle: 'Brainstorm',
  boardGone: false,
  byYou: true,
  credits: 1,
  bucket: 'allowance',
  ...over,
});

async function render(isOpen = true) {
  if (!root) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => { root!.render(<AiUsageHistoryDialog isOpen={isOpen} onClose={vi.fn()} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const rows = () => Array.from(document.querySelectorAll('[data-ai-usage-row]')) as HTMLElement[];

beforeEach(() => {
  vi.mocked(fetchAiUsageHistory).mockReset();
  vi.mocked(fetchAiUsageHistory).mockResolvedValue({ entries: [entry()], nextBefore: null });
});
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-344 AiUsageHistoryDialog', () => {
  it('renders rows with their labels', async () => {
    await render();
    expect(rows()).toHaveLength(1);
    const row = rows()[0];
    expect(row.textContent).toContain('Suggest cards');
    expect(row.textContent).toContain('Brainstorm');
    expect(row.textContent).toContain('You');
    expect(row.textContent).toContain('Monthly');
    expect(row.textContent).toContain('2026');
    expect(q('[data-ai-usage-history="true"]')).not.toBeNull();
  });

  it('shows "Deleted board" / "A board you can\'t open" and "Another member"', async () => {
    vi.mocked(fetchAiUsageHistory).mockResolvedValue({
      entries: [
        entry({ id: 'a', boardId: null, boardTitle: null, boardGone: true }),
        entry({ id: 'b', boardId: 'b9', boardTitle: null, boardGone: true, byYou: false, bucket: 'grant' }),
      ],
      nextBefore: null,
    });
    await render();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Deleted board');
    expect(text).toContain("A board you can't open");
    expect(text).toContain('Another member');
    expect(text).toContain('Welcome credits');
  });

  it('Load more appends and passes the cursor as before', async () => {
    const cursor = '2026-10-11T00:00:00.123456+00:00';
    vi.mocked(fetchAiUsageHistory)
      .mockResolvedValueOnce({ entries: [entry({ id: 'p1' })], nextBefore: cursor })
      .mockResolvedValueOnce({ entries: [entry({ id: 'p2' })], nextBefore: null });
    await render();

    const more = q('[data-ai-usage-load-more="true"]') as HTMLButtonElement;
    expect(more).not.toBeNull();
    await act(async () => { more.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(vi.mocked(fetchAiUsageHistory).mock.calls[1][0]).toEqual({ before: cursor });
    expect(rows()).toHaveLength(2);
    expect(q('[data-ai-usage-load-more="true"]')).toBeNull();
  });

  it('a failed Load more keeps the rows, shows an inline error and allows a retry', async () => {
    const cursor = '2026-10-11T00:00:00.123456+00:00';
    vi.mocked(fetchAiUsageHistory)
      .mockResolvedValueOnce({ entries: [entry({ id: 'p1' })], nextBefore: cursor })
      .mockRejectedValueOnce(new Error('down'));
    await render();

    expect(rows()).toHaveLength(1);
    await act(async () => { (q('[data-ai-usage-load-more="true"]') as HTMLButtonElement).click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // P3: the row already shown is kept, and the full-dialog error is NOT shown.
    expect(rows()).toHaveLength(1);
    expect(q('[data-ai-usage-error="true"]')).toBeNull();
    expect(q('[data-ai-usage-load-more-error="true"]')?.textContent).toContain("Couldn't load more. Try again.");

    const button = q('[data-ai-usage-load-more="true"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(false);

    // The retry succeeds and clears the inline error.
    vi.mocked(fetchAiUsageHistory).mockResolvedValueOnce({ entries: [entry({ id: 'p2' })], nextBefore: null });
    await act(async () => { button.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(rows()).toHaveLength(2);
    expect(q('[data-ai-usage-load-more-error="true"]')).toBeNull();
  });

  it('shows the empty state', async () => {
    vi.mocked(fetchAiUsageHistory).mockResolvedValue({ entries: [], nextBefore: null });
    await render();
    expect(q('[data-ai-usage-empty="true"]')?.textContent).toContain('No AI credits used yet.');
  });

  it('shows a plain-words error', async () => {
    vi.mocked(fetchAiUsageHistory).mockRejectedValue(new Error('Usage history is unavailable right now.'));
    await render();
    expect(q('[data-ai-usage-error="true"]')?.textContent).toContain('Usage history is unavailable right now.');
  });

  it('shows a loading state while the first page is pending', async () => {
    vi.mocked(fetchAiUsageHistory).mockReturnValue(new Promise(() => {}));
    await render();
    expect(q('[data-ai-usage-loading="true"]')).not.toBeNull();
  });

  it('always shows the own-key note', async () => {
    await render();
    expect(document.body.textContent).toContain('own API key');
  });
});
