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
    Calendar: (props: { events?: Array<{ id: string; resource: Padlet }>; components?: { eventWrapper?: (args: { event: unknown; children: React.ReactNode }) => React.ReactNode } }) => {
      const EventWrapper = props.components?.eventWrapper;
      const events = props.events ?? [];
      return ReactModule.createElement(
        'div',
        { 'data-testid': 'calendar' },
        events.map((event) =>
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
vi.mock('./scheduler-theme.css', () => ({}));

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

async function mount(): Promise<HTMLElement> {
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
        onEditItem={onEditItem}
      />,
    );
  });
  const wrapper = container.querySelector<HTMLElement>('[data-scheduler-container-id="p1"]');
  expect(wrapper).not.toBeNull();
  return wrapper!;
}

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
