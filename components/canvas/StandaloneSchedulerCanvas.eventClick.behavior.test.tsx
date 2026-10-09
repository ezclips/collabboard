// @vitest-environment jsdom
//
// PATCH-308 Addendum 1. The DnD addon takes the event on mousedown, so the
// release lands on the slot beneath and no click reaches the wrapper. The
// wrapper now watches a window mouseup: a short, near-stationary release is a
// click on the event.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';

vi.mock('react-big-calendar', async () => {
  const ReactModule = await import('react');
  return {
    Calendar: (props: { events?: Array<{ id: string; title?: string; resource: Padlet }>; components?: { eventWrapper?: (args: { event: unknown; children: React.ReactNode }) => React.ReactNode; event?: React.ComponentType<{ title: string; event: unknown }> } }) => {
      const EventWrapper = props.components?.eventWrapper;
      const EventComponent = props.components?.event;
      const events = props.events ?? [];
      return ReactModule.createElement(
        'div',
        { 'data-testid': 'calendar' },
        events.map((event) =>
          ReactModule.createElement(
            ReactModule.Fragment,
            { key: event.id },
            EventWrapper
              ? EventWrapper({
                  event,
                  children: EventComponent
                    ? ReactModule.createElement(EventComponent, { title: event.title ?? '', event })
                    : ReactModule.createElement('div'),
                })
              : null,
          ),
        ),
      );
    },
    momentLocalizer: () => () => ({}),
  };
});
vi.mock('react-big-calendar/lib/addons/dragAndDrop', () => ({ default: (Component: unknown) => Component }));
vi.mock('react-big-calendar/lib/css/react-big-calendar.css', () => ({}));
vi.mock('react-big-calendar/lib/addons/dragAndDrop/styles.css', () => ({}));
vi.mock('./scheduler-theme.css', () => ({}));
// The calendar modal (PATCH-333) imports the Kanban store; it is not used on
// the scheduler target, and loading it here would reach Supabase at import.
vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanUI: () => { throw new Error('useKanban must be used within KanbanProvider'); },
}));

import StandaloneSchedulerCanvas from './StandaloneSchedulerCanvas';

class ResizeObserverMock {
  constructor(
    private readonly callback: (entries: Array<{ contentRect: { width: number; height: number } }>) => void,
  ) {}
  observe() {
    this.callback([{ contentRect: { width: 800, height: 600 } }]);
  }
  unobserve() {}
  disconnect() {}
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PADLET = {
  id: 'p1',
  board_id: 'b1',
  title: 'Kickoff',
  content: '',
  type: 'container',
  position_x: 0,
  position_y: 0,
  width: 100,
  height: 100,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  metadata: { start_date: '2026-01-01T09:00:00.000Z', end_date: '2026-01-01T10:00:00.000Z' },
} as unknown as Padlet;

let root: Root | null = null;
let container: HTMLElement;
const onEditItem = vi.fn();

async function mount(padlets: Padlet[] = [PADLET]): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StandaloneSchedulerCanvas
        padlets={padlets}
        canvasId="b1"
        onUpdatePadletMetadata={vi.fn()}
        onCreatePadlet={vi.fn()}
        onEditItem={onEditItem}
      />,
    );
  });
  const wrapper = container.querySelector<HTMLElement>('[data-scheduler-container-id="p1"]');
  expect(wrapper).not.toBeNull();
  return wrapper!;
}

const childPost = (id: string) =>
  ({
    ...PADLET,
    id,
    title: '',
    metadata: { parentId: 'p1' },
  }) as unknown as Padlet;

const mouse = (type: string, x: number, y: number) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverMock;
  onEditItem.mockReset();
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-308 Addendum 1: an event opens from a click the DnD addon swallowed', () => {
  it('mousedown then a near window mouseup opens the event once', async () => {
    const wrapper = await mount();
    await act(async () => {
      wrapper.dispatchEvent(mouse('mousedown', 100, 100));
      window.dispatchEvent(mouse('mouseup', 102, 101));
    });
    expect(onEditItem).toHaveBeenCalledTimes(1);
    expect(onEditItem.mock.calls[0][0]).toMatchObject({ id: 'p1' });
  });

  it('a release far from the press is a drag, not a click', async () => {
    const wrapper = await mount();
    await act(async () => {
      wrapper.dispatchEvent(mouse('mousedown', 100, 100));
      window.dispatchEvent(mouse('mouseup', 120, 100));
    });
    expect(onEditItem).not.toHaveBeenCalled();
  });
});

describe('PATCH-313/314: an event shows how many items it holds', () => {
  const badge = () => container.querySelector<HTMLElement>('[data-scheduler-post-count]');

  it('shows "2 items" for an event with two child posts', async () => {
    await mount([PADLET, childPost('c1'), childPost('c2')]);
    expect(badge()?.textContent).toBe('2 items');
  });

  it('shows "1 item" for one child post', async () => {
    await mount([PADLET, childPost('c1')]);
    expect(badge()?.textContent).toBe('1 item');
  });

  it('shows no badge for an event with no posts', async () => {
    await mount([PADLET]);
    expect(badge()).toBeNull();
  });

  it('keeps the badge out of the pointer path', async () => {
    await mount([PADLET, childPost('c1')]);
    expect(badge()?.className).toContain('pointer-events-none');
  });

  it('uses the container badge colours for the event background', async () => {
    const light = {
      ...PADLET,
      metadata: { start_date: '2026-01-01T09:00:00.000Z', end_date: '2026-01-01T10:00:00.000Z', cardColor: '#f8fafc' },
    } as unknown as Padlet;
    await mount([light, childPost('c1')]);
    expect(badge()?.style.color).toBe('rgb(15, 23, 42)');
    expect(badge()?.style.backgroundColor).toBe('rgba(15, 23, 42, 0.08)');
  });

  it('shows the badge on the first segment of a multi-day event only', async () => {
    const multiDay = {
      ...PADLET,
      metadata: { start_date: '2026-01-01T09:00:00.000Z', end_date: '2026-01-03T10:00:00.000Z' },
    } as unknown as Padlet;
    await mount([multiDay, childPost('c1'), childPost('c2')]);

    const tabs = Array.from(container.querySelectorAll<HTMLElement>('[data-scheduler-event-tab="true"]'));
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs[0].querySelector('[data-scheduler-post-count]')).not.toBeNull();
    for (const later of tabs.slice(1)) {
      expect(later.querySelector('[data-scheduler-post-count]')).toBeNull();
    }
  });
});

describe('PATCH-316: an event menu has no text entry', () => {
  const menuItem = (text: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes(text),
    ) ?? null;

  it('shows "Add post" and neither "Add text" nor "Edit text"', async () => {
    const wrapper = await mount();
    await act(async () => {
      wrapper.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });

    expect(menuItem('Add post')).not.toBeNull();
    expect(menuItem('Add text')).toBeNull();
    expect(menuItem('Edit text')).toBeNull();
  });
});

describe('PATCH-314 Addendum 1: short events keep the badge and title on one line', () => {
  const badge = () => container.querySelector<HTMLElement>('[data-scheduler-post-count]');

  it('lays the badge and title out as one flex row in a short event', async () => {
    await mount([PADLET, childPost('c1')]);
    const el = badge()!;
    expect(el).not.toBeNull();

    const row = el.parentElement!;
    expect(row.className).toContain('flex');
    expect(row.className).toContain('items-center');
    expect(row.className).toContain('min-w-0');

    const titleSpan = row.querySelector('span.truncate');
    expect(titleSpan).not.toBeNull();
    expect(titleSpan!.parentElement).toBe(row);
    expect(el.className).toContain('flex-none');
  });

  it('positions the badge absolutely in a tall event', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isTab = this.getAttribute?.('data-scheduler-event-tab') === 'true';
      return {
        width: 200,
        height: isTab ? 100 : 0,
        left: 0,
        top: 0,
        right: 200,
        bottom: isTab ? 100 : 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    await mount([PADLET, childPost('c1')]);
    const el = badge()!;
    expect(el.className).toContain('absolute');
    expect(el.className).toContain('bottom-1');
  });
});

describe('PATCH-331/332: the standalone board shows a "Scheduler" title bar', () => {
  it('renders "Scheduler" in a bar above the calendar', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StandaloneSchedulerCanvas
          padlets={[PADLET]}
          canvasId="b1"
          onUpdatePadletMetadata={vi.fn()}
          onCreatePadlet={vi.fn()}
        />,
      );
    });
    const bar = container.querySelector('[data-scheduler-title="true"]');
    expect(bar?.textContent).toContain('Scheduler');
    // The calendar host sits BELOW the bar, so its measured height excludes it.
    expect(container.querySelector('.scheduler-calendar-host')).not.toBeNull();
  });
});

describe('PATCH-333: the standalone Scheduler calendar button and auto-sync', () => {
  async function renderCanvas(props: { readOnly?: boolean } = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StandaloneSchedulerCanvas
          padlets={[PADLET]}
          canvasId="b1"
          readOnly={props.readOnly}
          onUpdatePadletMetadata={vi.fn()}
          onCreatePadlet={vi.fn()}
        />,
      );
    });
    await act(async () => { await Promise.resolve(); });
  }

  it('shows the Calendar button for an editor, not for a read-only board', async () => {
    await renderCanvas();
    expect(container.querySelector('[data-calendar-import-open="standalone"]')).not.toBeNull();
    act(() => root!.unmount());
    root = null;
    container.remove();
    await renderCanvas({ readOnly: true });
    expect(container.querySelector('[data-calendar-import-open="standalone"]')).toBeNull();
  });

  it('auto-syncs connected calendars only when editable', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await renderCanvas();
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/calendar-subscriptions'))).toBe(true);

      fetchMock.mockClear();
      act(() => root!.unmount());
      root = null;
      container.remove();
      await renderCanvas({ readOnly: true });
      await act(async () => { await Promise.resolve(); });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('PATCH-318: a Scheduler event title shows the container title style', () => {
  it('applies italic and colour but never the block font-size or background', async () => {
    const styled = {
      ...PADLET,
      metadata: {
        start_date: '2026-01-01T09:00:00.000Z',
        end_date: '2026-01-01T10:00:00.000Z',
        titleStyle: { color: '#fa5252', fontStyle: 'italic', fontSize: '24px', backgroundColor: '#ffff00' },
      },
    } as unknown as Padlet;
    await mount([styled]);

    const tab = container.querySelector<HTMLElement>('[data-scheduler-event-tab]')!;
    const span = tab.querySelector<HTMLElement>('span.truncate')!;
    expect(span).not.toBeNull();
    expect(span.style.fontStyle).toBe('italic');
    expect(span.style.color).toBe('rgb(250, 82, 82)');
    expect(span.style.fontSize).toBe('');
    expect(span.style.backgroundColor).toBe('');
  });
});
