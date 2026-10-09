// @vitest-environment jsdom
//
// PATCH-330. A left click on a Gantt week label opens the date-range popover,
// right click still works, and a second click closes it.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ readonly: false }));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanban: () => ({ canvasId: 'board-1', state: {}, dispatch: vi.fn() }),
  useKanbanData: () => ({ cards: [], columns: [], rows: [], links: [], users: [], columnGroups: [] }),
  useKanbanPersistence: () => ({ loadCardsForColumn: vi.fn(async () => ({ ok: true })), refetchFromServer: vi.fn() }),
  useKanbanReadonly: () => hoisted.readonly,
}));
vi.mock('@/components/kanban-canvas/useKanbanI18n', () => ({
  useKanbanI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/gantt-canvas/NewTaskModal', () => ({ NewTaskModal: () => null }));
// Vitest's Vite cannot run the repo's PostCSS config on dhtmlx's CSS; the
// stylesheet is irrelevant to this behaviour.
vi.mock('dhtmlx-gantt/codebase/dhtmlxgantt.css', () => ({}));
vi.mock('@/components/gantt-canvas/gantt.css', () => ({}));
vi.mock('dhtmlx-gantt', () => ({
  gantt: {
    config: {}, locale: {}, plugins: vi.fn(), attachEvent: vi.fn(() => 'e'), detachEvent: vi.fn(),
    init: vi.fn(), parse: vi.fn(), clearAll: vi.fn(), render: vi.fn(), getTask: vi.fn(), getChildren: vi.fn(() => []),
    ext: {},
  },
}));

import { configureGantt } from '@/components/gantt-canvas/GanttConfig';
import { GanttCanvas } from '@/components/gantt-canvas/GanttCanvas';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function mountGantt() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<GanttCanvas />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

function addWeekLabel() {
  const board = container.querySelector('.gantt-container')!;
  const span = document.createElement('span');
  span.className = 'gantt-week-scale-label';
  span.setAttribute('data-gantt-week-label', 'Week #41');
  span.setAttribute('data-gantt-week-range', '5-11 Oct 2026');
  span.textContent = 'Week #41';
  board.appendChild(span);
  return span;
}

const popover = () => container.querySelector('.gantt-week-range-popover') as HTMLElement | null;

beforeEach(() => { hoisted.readonly = false; });
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-330 GanttConfig week labels carry a title', () => {
  it('both the week and month templates have a title with the range', () => {
    const levels: { name: string; scales: { template?: (d: Date) => string }[] }[] = [];
    const gantt: Record<string, unknown> = {
      config: {}, locale: {}, plugins: vi.fn(), attachEvent: vi.fn(() => 'e'),
      constants: { KEY_CODES: {} },
      ext: { zoom: { init: (c: { levels: typeof levels }) => levels.push(...c.levels), setLevel: vi.fn() } },
    };
    configureGantt(gantt as never, false, undefined, undefined, true);

    const week = levels.find((level) => level.name === 'week')!;
    const month = levels.find((level) => level.name === 'month')!;
    const date = new Date(2026, 9, 5);
    for (const html of [week.scales[0].template!(date), month.scales[1].template!(date)]) {
      expect(html).toContain('title="');
      expect(html).toContain('data-gantt-week-range=');
      expect(html).toMatch(/title="Week #\d+: /);
    }
  });
});

describe('PATCH-330 Gantt week range opens on click', () => {
  it('a left click opens the popover with that week’s range', async () => {
    await mountGantt();
    const span = addWeekLabel();
    await act(async () => {
      span.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 20 }));
    });
    expect(popover()).not.toBeNull();
    expect(popover()!.textContent).toContain('Week #41');
    expect(popover()!.textContent).toContain('5-11 Oct 2026');
  });

  it('a second click on the same week closes it', async () => {
    await mountGantt();
    const span = addWeekLabel();
    await act(async () => {
      span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(popover()).not.toBeNull();
    await act(async () => {
      span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(popover()).toBeNull();
  });

  it('right click still opens it', async () => {
    await mountGantt();
    const span = addWeekLabel();
    await act(async () => {
      span.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 }));
    });
    expect(popover()).not.toBeNull();
  });

  it('the Calendar button renders for editors and opens the modal', async () => {
    await mountGantt();
    const button = container.querySelector('[data-calendar-import-open="gantt"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    await act(async () => { button!.click(); });
    expect(container.querySelector('[data-calendar-import-modal="true"]')).not.toBeNull();
  });

  it('the Calendar button is hidden for a read-only viewer', async () => {
    hoisted.readonly = true;
    await mountGantt();
    expect(container.querySelector('[data-calendar-import-open="gantt"]')).toBeNull();
  });
});
