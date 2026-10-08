// @vitest-environment jsdom
//
// PATCH-326. Calendar → card mapping, the Import button gate, and the import loop.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@/types/kanban-canvas';
import type { ImportedEvent } from '@/lib/kanban/icsImport';

const hoisted = vi.hoisted(() => ({
  readonly: false,
  addCard: vi.fn(async () => {}),
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanban: () => ({ canvasId: 'board-1', state: {}, dispatch: vi.fn() }),
  useKanbanData: () => ({
    cards: [],
    columns: [{ id: 'col-1', label: 'To do', order: 0 }],
    rows: [],
    users: [],
    columnGroups: [],
  }),
  useKanbanUI: () => ({
    searchQuery: '', sortBy: null, sortOrder: 'asc', groupBy: 'none', groupFilter: null, locale: 'en',
  }),
  useKanbanHistory: () => ({ past: [], future: [] }),
  useKanbanPersistence: () => ({ addCard: hoisted.addCard, refetchFromServer: vi.fn(), canvasId: 'board-1' }),
  useKanbanReadonly: () => hoisted.readonly,
}));
vi.mock('@/components/kanban-canvas/useKanbanI18n', () => ({
  useKanbanI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key) }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { buildCalendarCards, mapEventToCard, CalendarImportModal } from '@/components/kanban-canvas/CalendarImportModal';
import { Toolbar } from '@/components/kanban-canvas/Toolbar';
import { toast } from 'sonner';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localTime = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

let root: Root | null = null;
let container: HTMLElement;

function mount(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  return act(async () => { root!.render(node); });
}

const q = (selector: string) => container.querySelector(selector) as HTMLElement | null;

beforeEach(() => {
  hoisted.readonly = false;
  hoisted.addCard = vi.fn(async () => {});
});

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PATCH-326 event → card mapping', () => {
  it('an all-day event keeps its inclusive dates', () => {
    const card = mapEventToCard(
      { title: 'Holiday', description: 'Beach', allDay: true, startDate: '2026-06-10', endDate: '2026-06-12' },
      { columnId: 'col-1', order: 3 },
    );
    expect(card).toMatchObject({
      label: 'Holiday', columnId: 'col-1', start_date: '2026-06-10', end_date: '2026-06-12',
      progress: 0, order: 3, description: 'Beach',
    });
    expect(card.priority).toBeUndefined();
  });

  it('a timed event across midnight ends on the day of end − 1 ms, with time and location lines', () => {
    const event: ImportedEvent = {
      title: 'Late shift',
      description: 'Bring keys',
      location: 'Room 1',
      allDay: false,
      startIso: '2026-10-10T23:00:00.000Z',
      endIso: '2026-10-11T01:00:00.000Z',
    };
    const card = mapEventToCard(event, { columnId: 'col-1', order: 0 });
    const start = new Date(event.startIso as string);
    const end = new Date(event.endIso as string);
    expect(card.start_date).toBe(localDate(start));
    expect(card.end_date).toBe(localDate(new Date(Math.max(start.getTime(), end.getTime() - 1))));
    expect((card.end_date as string) >= (card.start_date as string)).toBe(true);
    const lines = (card.description as string).split('\n\n');
    expect(lines[0]).toBe(`${localTime(start)}\u2013${localTime(end)}`);
    expect(lines[1]).toBe('Location: Room 1');
    expect(lines[2]).toBe('Bring keys');
  });

  it('never puts the end date before the start date', () => {
    const card = mapEventToCard(
      { title: 'Instant', description: '', allDay: false, startIso: '2026-10-10T12:00:00.000Z', endIso: '2026-10-10T12:00:00.000Z' },
      { columnId: 'col-1', order: 0 },
    );
    expect(card.end_date).toBe(card.start_date);
  });
});

describe('PATCH-326 duplicate detection', () => {
  const existing: Card = {
    id: 'e1', label: 'Holiday', columnId: 'col-1', start_date: '2026-06-10', end_date: '2026-06-10',
  };

  it('skips a card already on the board by label + dates', () => {
    const events: ImportedEvent[] = [
      { title: 'Holiday', description: '', allDay: true, startDate: '2026-06-10', endDate: '2026-06-10' },
      { title: 'New', description: '', allDay: true, startDate: '2026-06-11', endDate: '2026-06-11' },
    ];
    const result = buildCalendarCards(events, {
      columns: [{ id: 'col-1', label: 'To do' }], rows: [], existingCards: [existing], columnId: 'col-1',
    });
    expect(result.cards.map((card) => card.label)).toEqual(['New']);
    expect(result.skipped).toBe(1);
  });

  it('skips a duplicate within the same import too', () => {
    const events: ImportedEvent[] = [
      { title: 'Same', description: '', allDay: true, startDate: '2026-06-10', endDate: '2026-06-10' },
      { title: 'Same', description: '', allDay: true, startDate: '2026-06-10', endDate: '2026-06-10' },
    ];
    const result = buildCalendarCards(events, {
      columns: [{ id: 'col-1', label: 'To do' }], rows: [], existingCards: [], columnId: 'col-1',
    });
    expect(result.cards).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it('orders new cards after the column’s last card', () => {
    const events: ImportedEvent[] = [
      { title: 'A', description: '', allDay: true, startDate: '2026-06-10', endDate: '2026-06-10' },
    ];
    const result = buildCalendarCards(events, {
      columns: [{ id: 'col-1', label: 'To do' }],
      rows: [],
      existingCards: [{ id: 'x', label: 'Old', columnId: 'col-1', order: 7 }],
      columnId: 'col-1',
    });
    expect(result.cards[0].order).toBe(8);
  });
});

describe('PATCH-326 the Import button is editor-only', () => {
  it('renders for an editor', async () => {
    hoisted.readonly = false;
    await mount(<Toolbar onExport={vi.fn()} />);
    expect(q('[data-calendar-import-open="true"]')).not.toBeNull();
  });

  it('is hidden for a read-only viewer', async () => {
    hoisted.readonly = true;
    await mount(<Toolbar onExport={vi.fn()} />);
    expect(q('[data-calendar-import-open="true"]')).toBeNull();
  });
});

describe('PATCH-326 the import loop reports progress and failures', () => {
  const oneEvent = { title: 'Meeting', description: '', allDay: true, startDate: '2026-06-10', endDate: '2026-06-10' };

  function stubPreview(events: ImportedEvent[]) {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ events, truncated: false }), { status: 200, headers: { 'content-type': 'application/json' } })));
  }

  it('shows progress while adding and a success toast after', async () => {
    stubPreview([oneEvent]);
    let resolveAdd: (() => void) | null = null;
    hoisted.addCard = vi.fn(() => new Promise<void>((resolve) => { resolveAdd = resolve; }));
    await mount(<CalendarImportModal isOpen onClose={vi.fn()} />);

    await act(async () => { q('[data-calendar-import-tab="link"]')!.click(); });
    // PATCH-328: the link tab now defaults to "keep updated"; this test covers
    // the one-time import, so turn it off.
    await act(async () => { (q('[data-calendar-keep-updated="true"]') as HTMLInputElement).click(); });
    const urlInput = q('[data-calendar-import-url="true"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(urlInput, 'https://example.com/cal.ics');
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { q('[data-calendar-import-preview="true"]')!.click(); await Promise.resolve(); });
    await act(async () => { q('[data-calendar-import-confirm="true"]')!.click(); });

    expect(q('[data-calendar-import-progress="true"]')?.textContent).toContain('importingProgress');

    await act(async () => { resolveAdd?.(); await Promise.resolve(); await Promise.resolve(); });
    expect(toast.success).toHaveBeenCalled();
  });

  it('continues past a failed card and reports how many failed', async () => {
    stubPreview([oneEvent, { ...oneEvent, title: 'Second' }]);
    hoisted.addCard = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    await mount(<CalendarImportModal isOpen onClose={onClose} />);

    await act(async () => { q('[data-calendar-import-tab="link"]')!.click(); });
    await act(async () => { (q('[data-calendar-keep-updated="true"]') as HTMLInputElement).click(); });
    const urlInput = q('[data-calendar-import-url="true"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(urlInput, 'https://example.com/cal.ics');
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { q('[data-calendar-import-preview="true"]')!.click(); await Promise.resolve(); });
    await act(async () => { q('[data-calendar-import-confirm="true"]')!.click(); await Promise.resolve(); });

    expect(hoisted.addCard).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('importedSomeFailed'));
  });
});

describe('PATCH-329 tab switching and the storage wording', () => {
  it('file → link → file renders without the controlled/uncontrolled warning', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await mount(<CalendarImportModal isOpen onClose={vi.fn()} />);
      await act(async () => { q('[data-calendar-import-tab="link"]')!.click(); });
      await act(async () => { q('[data-calendar-import-tab="file"]')!.click(); });
      await act(async () => { q('[data-calendar-import-tab="link"]')!.click(); });
      const logged = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(logged).not.toContain('uncontrolled input');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('says the link is saved encrypted when keep-updated is on, and not saved when off', async () => {
    await mount(<CalendarImportModal isOpen onClose={vi.fn()} />);
    await act(async () => { q('[data-calendar-import-tab="link"]')!.click(); });
    const note = () => q('[data-calendar-link-storage-note="true"]')?.textContent ?? '';
    expect(note()).toContain('calendarLinkSavedEncrypted');
    await act(async () => { (q('[data-calendar-keep-updated="true"]') as HTMLInputElement).click(); });
    expect(note()).toContain('calendarLinkNotSaved');
  });
});
