// @vitest-environment jsdom
//
// PATCH-311. The scheduler beside Kanban runs on react-big-calendar now, with
// the same drag, create and right-click menu, showing only cards that have
// dates.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card, Column } from '@/types/kanban-canvas';

const hoisted = vi.hoisted(() => ({
  data: { cards: [] as unknown[], columns: [] as unknown[] },
  readonly: false,
  actions: { updateCard: vi.fn(), addCard: vi.fn(), deleteCard: vi.fn() },
  calendarProps: { current: null as Record<string, any> | null },
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanData: () => hoisted.data,
  useKanbanReadonly: () => hoisted.readonly,
  useKanbanPersistence: () => hoisted.actions,
}));

vi.mock('react-big-calendar', async () => {
  const ReactModule = await import('react');
  return {
    Calendar: (props: Record<string, any>) => {
      hoisted.calendarProps.current = props;
      const EventWrapper = props.components?.eventWrapper;
      return ReactModule.createElement(
        'div',
        { 'data-testid': 'calendar' },
        (props.events ?? []).map((event: any) =>
          ReactModule.createElement(
            ReactModule.Fragment,
            { key: event.id },
            EventWrapper ? EventWrapper({ event, children: ReactModule.createElement('div') }) : null,
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
vi.mock('@/components/canvas/scheduler-theme.css', () => ({}));
vi.mock('@/components/scheduler-canvas/scheduler.css', () => ({}));

import { SchedulerCanvas } from '@/components/scheduler-canvas/SchedulerCanvas';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const datedCard = (over: Partial<Card> = {}): Card => ({
  id: 'c-dated',
  label: 'Dated',
  columnId: 'col-1',
  order: 1,
  start_date: '2026-01-01T09:00:00.000Z',
  end_date: '2026-01-01T10:00:00.000Z',
  ...over,
});
const undatedCard = (over: Partial<Card> = {}): Card => ({
  id: 'c-undated',
  label: 'Undated',
  columnId: 'col-1',
  order: 2,
  ...over,
});
const column = (over: Partial<Column> = {}): Column => ({ id: 'col-1', label: 'Todo', order: 1, ...over });

let root: Root | null = null;
let container: HTMLElement;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<SchedulerCanvas />);
  });
}

const calendar = () => hoisted.calendarProps.current!;

beforeEach(() => {
  hoisted.actions.updateCard.mockReset();
  hoisted.actions.addCard.mockReset();
  hoisted.actions.deleteCard.mockReset();
  hoisted.readonly = false;
  hoisted.data = { cards: [], columns: [column()] };
  hoisted.calendarProps.current = null;
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

describe('PATCH-311: the Kanban scheduler on react-big-calendar', () => {
  it('shows only cards that have a date', async () => {
    hoisted.data = { cards: [datedCard(), undatedCard()], columns: [column()] };
    await mount();

    const events = calendar().events as Array<{ id: string; title: string; resource: Card }>;
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('c-dated');
    expect(events[0].title).toBe('Dated');
    expect(events[0].resource).toMatchObject({ id: 'c-dated' });
  });

  it('drag and resize write ISO start and end dates', async () => {
    hoisted.data = { cards: [datedCard()], columns: [column()] };
    await mount();

    const start = new Date('2026-02-01T11:00:00.000Z');
    const end = new Date('2026-02-01T12:00:00.000Z');
    await act(async () => {
      calendar().onEventDrop({ event: calendar().events[0], start, end });
      calendar().onEventResize({ event: calendar().events[0], start, end });
    });

    expect(hoisted.actions.updateCard).toHaveBeenCalledTimes(2);
    expect(hoisted.actions.updateCard).toHaveBeenCalledWith('c-dated', {
      start_date: start.toISOString(),
      end_date: end.toISOString(),
    });
  });

  it('drag-select creates an untitled card in the first column; a single click does not', async () => {
    hoisted.data = {
      cards: [datedCard()],
      columns: [column({ id: 'col-1', order: 1 }), column({ id: 'col-2', order: 2 })],
    };
    await mount();

    const start = new Date('2026-03-01T09:00:00.000Z');
    const end = new Date('2026-03-01T10:00:00.000Z');
    await act(async () => {
      calendar().onSelectSlot({ start, end, action: 'select' });
    });

    expect(hoisted.actions.addCard).toHaveBeenCalledTimes(1);
    expect(hoisted.actions.addCard).toHaveBeenCalledWith(expect.objectContaining({
      label: 'Untitled',
      columnId: 'col-1',
      order: 2,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
    }));

    hoisted.actions.addCard.mockReset();
    await act(async () => {
      calendar().onSelectSlot({ start, end, action: 'click' });
    });
    expect(hoisted.actions.addCard).not.toHaveBeenCalled();
  });

  it('right-click opens the menu and "Set 30 minutes" updates the card', async () => {
    hoisted.data = { cards: [datedCard()], columns: [column()] };
    await mount();

    const wrapper = container.querySelector<HTMLElement>('[data-scheduler-event-id="c-dated"]')!;
    expect(wrapper).not.toBeNull();
    await act(async () => {
      wrapper.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }));
    });

    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const button = Array.from(menu!.querySelectorAll('button')).find((el) => el.textContent === 'Set 30 minutes')!;
    expect(button).toBeTruthy();

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(hoisted.actions.updateCard).toHaveBeenCalledWith('c-dated', expect.objectContaining({
      start_date: expect.any(String),
      end_date: expect.any(String),
    }));
  });

  it('is inert when read-only: no create and no menu', async () => {
    hoisted.readonly = true;
    hoisted.data = { cards: [datedCard()], columns: [column()] };
    await mount();

    expect(calendar().onSelectSlot).toBeUndefined();
    expect(calendar().onEventDrop).toBeUndefined();

    const wrapper = container.querySelector<HTMLElement>('[data-scheduler-event-id="c-dated"]')!;
    await act(async () => {
      wrapper.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(hoisted.actions.addCard).not.toHaveBeenCalled();
  });
});
