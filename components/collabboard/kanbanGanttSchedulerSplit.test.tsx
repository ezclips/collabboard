// @vitest-environment jsdom
//
// PATCH-325. The K/G/S stacking rules: one view fills, two or three stack with
// separators, and the card editor host follows the hidden Kanban.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/kanban-canvas', () => ({
  // The Kanban view owns an editor host; the split must not add a second.
  KanbanCanvas: () => (
    <div data-testid="kanban-canvas">
      <div data-testid="editor-host" data-owner="kanban" />
    </div>
  ),
}));
vi.mock('@/components/kanban-canvas/KanbanCardEditorHost', () => ({
  KanbanCardEditorHost: () => <div data-testid="editor-host" data-owner="split" />,
}));
vi.mock('@/components/gantt-canvas', () => ({
  GanttCanvas: () => <div data-testid="gantt-canvas" />,
}));
vi.mock('@/components/scheduler-canvas', () => ({
  SchedulerCanvas: () => <div data-testid="scheduler-canvas" />,
}));

import { KanbanGanttSchedulerSplit } from '@/components/scheduler-canvas/KanbanGanttSchedulerSplit';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function mount(show: { kanban: boolean; gantt: boolean; scheduler: boolean }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <KanbanGanttSchedulerSplit
        canvasId="board-1"
        showKanban={show.kanban}
        showGantt={show.gantt}
        showScheduler={show.scheduler}
      />,
    );
  });
}

const handles = () => container.querySelectorAll('[data-resize-handle]');
const panel = (id: string) => container.querySelector(`[data-split-panel="${id}"]`) as HTMLElement | null;
const filled = (id: string) => panel(id)?.getAttribute('data-split-fill') === 'true';

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-325 one view open fills the area', () => {
  it('K only: Kanban fills, no separator', async () => {
    await mount({ kanban: true, gantt: false, scheduler: false });
    expect(handles()).toHaveLength(0);
    expect(filled('kanban')).toBe(true);
  });

  it('G only: Gantt fills, no separator', async () => {
    await mount({ kanban: false, gantt: true, scheduler: false });
    expect(handles()).toHaveLength(0);
    expect(filled('gantt')).toBe(true);
  });

  it('S only: Scheduler fills, no separator', async () => {
    await mount({ kanban: false, gantt: false, scheduler: true });
    expect(handles()).toHaveLength(0);
    expect(filled('scheduler')).toBe(true);
  });

  it('a hidden Gantt and Scheduler stay MOUNTED at height 0', async () => {
    await mount({ kanban: true, gantt: false, scheduler: false });
    expect(container.querySelector('[data-testid="gantt-canvas"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="scheduler-canvas"]')).not.toBeNull();
    expect(panel('gantt')!.style.height).toBe('0px');
    expect(panel('scheduler')!.style.height).toBe('0px');
  });
});

describe('PATCH-325 two or three views stack with separators', () => {
  it('G + S (Kanban hidden): Gantt fills, one separator above the Scheduler', async () => {
    await mount({ kanban: false, gantt: true, scheduler: true });
    expect(handles()).toHaveLength(1);
    expect(container.querySelector('[data-resize-handle="single-split"]')).not.toBeNull();
    expect(filled('gantt')).toBe(true);
  });

  it('K + G: Kanban fills, one separator above the Gantt', async () => {
    await mount({ kanban: true, gantt: true, scheduler: false });
    expect(handles()).toHaveLength(1);
    expect(container.querySelector('[data-resize-handle="single-split"]')).not.toBeNull();
    expect(filled('kanban')).toBe(true);
  });

  it('K + G + S: Kanban fills, two separators', async () => {
    await mount({ kanban: true, gantt: true, scheduler: true });
    expect(handles()).toHaveLength(2);
    expect(container.querySelector('[data-resize-handle="multi-top-split"]')).not.toBeNull();
    expect(container.querySelector('[data-resize-handle="multi-bottom-split"]')).not.toBeNull();
    expect(filled('kanban')).toBe(true);
  });
});

describe('PATCH-325 the card editor host follows the hidden Kanban', () => {
  it('Kanban hidden: the split renders exactly one host and no Kanban view', async () => {
    await mount({ kanban: false, gantt: true, scheduler: false });
    expect(container.querySelector('[data-testid="kanban-canvas"]')).toBeNull();
    const hosts = container.querySelectorAll('[data-testid="editor-host"]');
    expect(hosts).toHaveLength(1);
    expect(hosts[0].getAttribute('data-owner')).toBe('split');
  });

  it('Kanban shown: exactly one host, owned by the Kanban view', async () => {
    await mount({ kanban: true, gantt: true, scheduler: false });
    const hosts = container.querySelectorAll('[data-testid="editor-host"]');
    expect(hosts).toHaveLength(1);
    expect(hosts[0].getAttribute('data-owner')).toBe('kanban');
  });
});
