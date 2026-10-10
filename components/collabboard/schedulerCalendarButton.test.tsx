// @vitest-environment jsdom
//
// PATCH-330. The Scheduler toolbar has the same Calendar button as the Kanban
// one, for editors only.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ readonly: false }));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanban: () => ({ canvasId: 'board-1', state: {}, dispatch: vi.fn() }),
  useKanbanData: () => ({ cards: [], columns: [], rows: [], links: [], users: [], columnGroups: [] }),
  useKanbanPersistence: () => ({ updateCard: vi.fn(), addCard: vi.fn(), deleteCard: vi.fn(), refetchFromServer: vi.fn() }),
  useKanbanReadonly: () => hoisted.readonly,
}));
vi.mock('@/components/kanban-canvas/useKanbanI18n', () => ({
  useKanbanI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('react-big-calendar', () => ({
  Calendar: () => <div data-testid="calendar" />,
  momentLocalizer: () => () => ({}),
}));
vi.mock('react-big-calendar/lib/addons/dragAndDrop', () => ({ default: (component: unknown) => component }));
vi.mock('@/components/scheduler-canvas/SchedulerEventMenu', () => ({ SchedulerEventMenu: () => null }));
// Vitest's Vite cannot run the repo's PostCSS config on these stylesheets; they
// are irrelevant to this behaviour.
vi.mock('react-big-calendar/lib/css/react-big-calendar.css', () => ({}));
vi.mock('react-big-calendar/lib/addons/dragAndDrop/styles.css', () => ({}));
vi.mock('@/components/canvas/scheduler-theme.css', () => ({}));
vi.mock('@/components/scheduler-canvas/scheduler.css', () => ({}));

import { SchedulerCanvas } from '@/components/scheduler-canvas/SchedulerCanvas';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<SchedulerCanvas />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => { hoisted.readonly = false; });
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PATCH-330 Scheduler calendar button', () => {
  it('renders for an editor and opens the calendar modal', async () => {
    await mount();
    const button = container.querySelector('[data-calendar-import-open="scheduler"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    // PATCH-334: same "Import" label as the Kanban button (this suite's i18n
    // mock returns the key).
    expect(button!.textContent).toContain('import');
    await act(async () => { button!.click(); });
    expect(container.querySelector('[data-calendar-import-modal="true"]')).not.toBeNull();
  });

  it('is hidden for a read-only viewer', async () => {
    hoisted.readonly = true;
    await mount();
    expect(container.querySelector('[data-calendar-import-open="scheduler"]')).toBeNull();
  });
});
