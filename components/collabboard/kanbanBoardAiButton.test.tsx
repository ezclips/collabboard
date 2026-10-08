// @vitest-environment jsdom
//
// PATCH-323. The Kanban left rail offers the Board AI button; it is the surface
// CanvasClient toggles, and the Kanban area yields its width while it is open.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  data: { cards: [], columns: [], rows: [], links: [], users: [], columnGroups: [] } as any,
  actions: { addCard: vi.fn(), setActiveCard: vi.fn() } as any,
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  KanbanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useKanbanData: () => hoisted.data,
  useKanbanPersistence: () => hoisted.actions,
  // PATCH-328 mounted KanbanCalendarAutoSync inside the provider.
  useKanban: () => ({ canvasId: 'board-1', state: {}, dispatch: vi.fn() }),
  useKanbanReadonly: () => false,
}));
vi.mock('@/components/kanban-canvas', () => ({ KanbanCanvas: () => <div data-testid="kanban-canvas" /> }));
vi.mock('@/components/scheduler-canvas/KanbanGanttSchedulerSplit', () => ({
  KanbanGanttSchedulerSplit: () => <div data-testid="kanban-split" />,
}));
vi.mock('@/components/collabboard/canvas/ui/CanvasShareModal', () => ({
  default: () => <div data-testid="share-modal" />,
}));

import KanbanShell from './canvas/ui/KanbanShell';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function mount(props: Partial<React.ComponentProps<typeof KanbanShell>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <KanbanShell
        canvasId="board-1"
        canvasTitle="Board"
        enableGantt={false}
        enableScheduler={false}
        isGanttVisible={false}
        isSchedulerVisible={false}
        setIsGanttVisible={vi.fn()}
        setIsSchedulerVisible={vi.fn()}
        currentWorkspaceRole={null}
        onBack={vi.fn()}
        {...props}
      />,
    );
  });
}

beforeEach(() => {
  hoisted.actions.addCard.mockReset();
  hoisted.actions.setActiveCard.mockReset();
  hoisted.data = { cards: [], columns: [], rows: [], links: [], users: [], columnGroups: [] };
});

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-323 the Board AI button lives in the Kanban rail', () => {
  it('renders the button when Board AI is enabled and toggles on click', async () => {
    const onToggle = vi.fn();
    await mount({ boardAiEnabled: true, onToggleBoardAiChat: onToggle });
    const button = container.querySelector('[data-board-ai-button="true"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button!.getAttribute('aria-label')).toBe('Board AI');
    await act(async () => { button!.click(); });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no Board AI button when the feature is off', async () => {
    await mount({ boardAiEnabled: false });
    expect(container.querySelector('[data-board-ai-button="true"]')).toBeNull();
  });

  it('yields the panel width while the drawer is open', async () => {
    await mount({ boardAiEnabled: true, isBoardAiChatOpen: true });
    const area = container.querySelector('[data-kanban-board-area="true"]') as HTMLElement;
    expect(area.style.paddingRight).toBe('420px');
  });

  it('does not pad the board while the drawer is closed', async () => {
    await mount({ boardAiEnabled: true, isBoardAiChatOpen: false });
    const area = container.querySelector('[data-kanban-board-area="true"]') as HTMLElement;
    expect(area.style.paddingRight).toBe('');
  });
});
