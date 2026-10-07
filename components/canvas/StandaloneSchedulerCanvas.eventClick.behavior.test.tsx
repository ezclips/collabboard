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
const onUpdatePadletMetadata = vi.fn();

async function mount(
  padlets: Padlet[] = [PADLET],
  onRenameContainer?: (containerId: string, title: string) => void,
  readOnly = false,
): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StandaloneSchedulerCanvas
        padlets={padlets}
        canvasId="b1"
        readOnly={readOnly}
        onUpdatePadletMetadata={onUpdatePadletMetadata}
        onCreatePadlet={vi.fn()}
        onEditItem={onEditItem}
        onRenameContainer={onRenameContainer}
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
  onUpdatePadletMetadata.mockReset();
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

describe('PATCH-314: type a short text right in an event', () => {
  const wrapper = () => container.querySelector<HTMLElement>('[data-scheduler-container-id="p1"]')!;
  const menuItem = (text: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes(text),
    ) ?? null;
  const input = () => container.querySelector<HTMLInputElement>('[data-scheduler-event-tab] input');

  async function openMenu() {
    await act(async () => {
      wrapper().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });
  }

  async function chooseEditText() {
    await openMenu();
    const item = menuItem('Edit text');
    expect(item).not.toBeNull();
    await act(async () => {
      item!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      item!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      item!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
      item!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      item!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
  }

  async function type(value: string) {
    const field = input()!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('offers "Edit text" for a titled event', async () => {
    await mount([PADLET], vi.fn());
    await openMenu();
    expect(menuItem('Edit text')).not.toBeNull();
    expect(menuItem('Add text')).toBeNull();
  });

  it('offers "Add text" for an untitled event', async () => {
    await mount([{ ...PADLET, title: '' } as unknown as Padlet], vi.fn());
    await openMenu();
    expect(menuItem('Add text')).not.toBeNull();
    expect(menuItem('Edit text')).toBeNull();
  });

  it('offers neither item without onRenameContainer', async () => {
    await mount([PADLET]);
    await openMenu();
    expect(menuItem('Add text')).toBeNull();
    expect(menuItem('Edit text')).toBeNull();
  });

  it('opens an input and saves the trimmed value on Enter', async () => {
    const rename = vi.fn();
    await mount([PADLET], rename);
    await chooseEditText();
    expect(input()).not.toBeNull();

    await type('  Standup  ');
    await act(async () => {
      input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(rename).toHaveBeenCalledWith('p1', 'Standup');
  });

  it('saves on blur', async () => {
    const rename = vi.fn();
    await mount([PADLET], rename);
    await chooseEditText();
    await type('Standup');
    await act(async () => {
      input()!.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(rename).toHaveBeenCalledWith('p1', 'Standup');
  });

  it('does not save on Escape', async () => {
    const rename = vi.fn();
    await mount([PADLET], rename);
    await chooseEditText();
    await type('Standup');
    await act(async () => {
      input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(rename).not.toHaveBeenCalled();
  });

  it('does not let the input mousedown reach the event wrapper', async () => {
    const rename = vi.fn();
    await mount([PADLET], rename);
    await chooseEditText();
    onEditItem.mockReset();

    await act(async () => {
      input()!.dispatchEvent(mouse('mousedown', 100, 100));
      window.dispatchEvent(mouse('mouseup', 100, 100));
    });
    expect(onEditItem).not.toHaveBeenCalled();
  });

  it('shows the style bar while editing', async () => {
    await mount([PADLET], vi.fn());
    await chooseEditText();
    expect(container.querySelector('[data-text-style-toolbar]')).not.toBeNull();
  });

  it('saves a font choice to metadata.titleStyle', async () => {
    await mount([PADLET], vi.fn());
    await chooseEditText();

    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Font"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(select, 'serif');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onUpdatePadletMetadata).toHaveBeenCalledWith('p1', {
      titleStyle: expect.objectContaining({ fontFamily: 'serif' }),
    });
  });

  it('does not save the text or leave edit mode when a bar control is used', async () => {
    const rename = vi.fn();
    await mount([PADLET], rename);
    await chooseEditText();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')!.click();
      await Promise.resolve();
    });

    expect(rename).not.toHaveBeenCalled();
    expect(input()).not.toBeNull();
  });

  it('renders an event text with its saved style', async () => {
    const styled = {
      ...PADLET,
      metadata: {
        ...PADLET.metadata,
        titleStyle: { fontFamily: 'serif', fontSize: 18, bold: true, color: '#ef4444' },
      },
    } as unknown as Padlet;
    await mount([styled]);

    const tab = container.querySelector<HTMLElement>('[data-scheduler-event-tab]')!;
    const span = tab.querySelector<HTMLElement>('span.truncate')!;
    expect(span).not.toBeNull();
    expect(span.style.fontFamily).toContain('Georgia');
    expect(span.style.fontSize).toBe('18px');
    expect(span.style.fontWeight).toBe('700');
    expect(span.style.color).toBe('rgb(239, 68, 68)');
  });

  it('shows no style bar for a read-only viewer', async () => {
    await mount([PADLET], vi.fn(), true);
    expect(container.querySelector('[data-text-style-toolbar]')).toBeNull();
  });

  it('keeps the typed text across a style change that updates the board', async () => {
    const rename = vi.fn();
    function Harness() {
      const [padlets, setPadlets] = React.useState<Padlet[]>([{ ...PADLET } as Padlet]);
      return (
        <StandaloneSchedulerCanvas
          padlets={padlets}
          canvasId="b1"
          onUpdatePadletMetadata={(id, patch) =>
            setPadlets((prev) =>
              prev.map((p) => (p.id === id ? { ...p, metadata: { ...p.metadata, ...patch } } : p)),
            )
          }
          onCreatePadlet={vi.fn()}
          onEditItem={onEditItem}
          onRenameContainer={rename}
        />
      );
    }

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<Harness />);
    });

    await chooseEditText();
    await type('Standup');

    // A style change updates padlets, giving CustomEvent a new identity and
    // remounting it. The draft lives in the canvas component, so it survives.
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')!.click();
      await Promise.resolve();
    });
    expect(input()!.value).toBe('Standup');

    await act(async () => {
      input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(rename).toHaveBeenCalledWith('p1', 'Standup');
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
