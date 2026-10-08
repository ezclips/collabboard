// @vitest-environment jsdom
//
// PATCH-325. The K/G/S rail toggles and the "at least one stays open" rule.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/kanban-canvas/store', () => ({
  KanbanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useKanbanData: () => ({ cards: [], columns: [], rows: [] }),
  useKanbanPersistence: () => ({}),
  // PATCH-328 mounted KanbanCalendarAutoSync inside the provider.
  useKanban: () => ({ canvasId: 'board-1', state: {}, dispatch: vi.fn() }),
  useKanbanReadonly: () => false,
}));
vi.mock('@/components/kanban-canvas', () => ({
  KanbanCanvas: () => <div data-testid="kanban-canvas" />,
}));
vi.mock('@/components/scheduler-canvas/KanbanGanttSchedulerSplit', () => ({
  KanbanGanttSchedulerSplit: (props: { showKanban: boolean; showGantt: boolean; showScheduler: boolean }) => (
    <div
      data-testid="split"
      data-show-kanban={String(props.showKanban)}
      data-show-gantt={String(props.showGantt)}
      data-show-scheduler={String(props.showScheduler)}
    />
  ),
}));
vi.mock('@/components/collabboard/canvas/ui/CanvasShareModal', () => ({ default: () => null }));

import KanbanShell from './canvas/ui/KanbanShell';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

interface HarnessProps {
  enableGantt: boolean;
  enableScheduler: boolean;
  initial: { kanban: boolean; gantt: boolean; scheduler: boolean };
}

function Harness({ enableGantt, enableScheduler, initial }: HarnessProps) {
  const [kanban, setKanban] = React.useState(initial.kanban);
  const [gantt, setGantt] = React.useState(initial.gantt);
  const [scheduler, setScheduler] = React.useState(initial.scheduler);
  return (
    <KanbanShell
      canvasId="board-1"
      canvasTitle="Board"
      enableGantt={enableGantt}
      enableScheduler={enableScheduler}
      isKanbanVisible={kanban}
      isGanttVisible={gantt}
      isSchedulerVisible={scheduler}
      setIsKanbanVisible={setKanban}
      setIsGanttVisible={setGantt}
      setIsSchedulerVisible={setScheduler}
      currentWorkspaceRole={null}
      onBack={vi.fn()}
    />
  );
}

async function mount(props: HarnessProps) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<Harness {...props} />); });
}

const button = (view: string) => container.querySelector(`[data-view-toggle="${view}"]`) as HTMLButtonElement | null;
const split = () => container.querySelector('[data-testid="split"]') as HTMLElement | null;
const click = async (view: string) => { await act(async () => { button(view)!.click(); }); };

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-325 the K/G/S rail toggles', () => {
  it('renders K, G and S when both features are enabled', async () => {
    await mount({ enableGantt: true, enableScheduler: true, initial: { kanban: true, gantt: false, scheduler: false } });
    expect(button('kanban')).not.toBeNull();
    expect(button('gantt')).not.toBeNull();
    expect(button('scheduler')).not.toBeNull();
  });

  it('hides K when neither Gantt nor Scheduler is enabled', async () => {
    await mount({ enableGantt: false, enableScheduler: false, initial: { kanban: true, gantt: false, scheduler: false } });
    expect(button('kanban')).toBeNull();
    expect(container.querySelector('[data-testid="kanban-canvas"]')).not.toBeNull();
  });

  it('clicking a closed view opens it', async () => {
    await mount({ enableGantt: true, enableScheduler: true, initial: { kanban: true, gantt: false, scheduler: false } });
    expect(split()!.getAttribute('data-show-gantt')).toBe('false');
    await click('gantt');
    expect(split()!.getAttribute('data-show-gantt')).toBe('true');
  });

  it('the last open view’s button is disabled and does nothing', async () => {
    await mount({ enableGantt: true, enableScheduler: true, initial: { kanban: true, gantt: false, scheduler: false } });
    const kanban = button('kanban')!;
    expect(kanban.disabled).toBe(true);
    expect(kanban.getAttribute('aria-disabled')).toBe('true');
    expect(kanban.getAttribute('title')).toBe('At least one view stays open');
    await click('kanban');
    // The Kanban is still the open view; nothing changed.
    expect(split()!.getAttribute('data-show-kanban')).toBe('true');
  });

  it('a disabled feature flag beats a stored true', async () => {
    // Storage claimed Gantt on, but the flag is off: never shown. With the
    // Kanban also off, the Scheduler must be the one that stays.
    await mount({
      enableGantt: false,
      enableScheduler: true,
      initial: { kanban: false, gantt: true, scheduler: true },
    });
    expect(split()!.getAttribute('data-show-gantt')).toBe('false');
    expect(split()!.getAttribute('data-show-scheduler')).toBe('true');
    // The Scheduler is the only open view, so its button cannot close it.
    expect(button('scheduler')!.disabled).toBe(true);
  });
});
