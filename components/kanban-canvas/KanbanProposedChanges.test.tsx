// @vitest-environment jsdom
//
// PATCH-350. The proposal list under one Board AI answer: ticks, Apply
// selected, partial failures, read-only after, and no Apply for a viewer.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import KanbanProposedChanges from './KanbanProposedChanges';
import {
  KNOWLEDGE_TEXT_BUTTON_CLASS,
} from '@/components/collabboard/knowledgeReaderControls';
import type {
  KanbanApplyChangeResult,
  KanbanProposedChange,
} from '@/lib/domain/ai/kanbanChangeProposals';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const CHANGES: readonly KanbanProposedChange[] = [
  { kind: 'create', label: 'Create card “Task A” in To Do', columnId: 'col-todo', title: 'Task A' },
  { kind: 'move', label: 'Move “Fix login bug” to Done', cardId: 'card-1', columnId: 'col-done' },
  { kind: 'update', label: 'Set priority of “Ship it” to High', cardId: 'card-2', priority: 3 },
];

function render(props: Partial<React.ComponentProps<typeof KanbanProposedChanges>> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<KanbanProposedChanges changes={CHANGES} canEdit onApply={vi.fn(async () => [])} {...props} />);
  });
}

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const boxes = () => Array.from(host.querySelectorAll<HTMLInputElement>('[data-kanban-proposed-change-checkbox]'));

describe('PATCH-350 KanbanProposedChanges', () => {
  it('lists every change, all ticked, with the count in the title', () => {
    render();
    expect(q('[data-kanban-proposed-changes="true"]')).not.toBeNull();
    expect(host.textContent).toContain('Proposed changes (3)');
    expect(boxes()).toHaveLength(3);
    expect(boxes().every((box) => box.checked)).toBe(true);
    expect(host.textContent).toContain('Create card “Task A” in To Do');
    // PATCH-349 small button style on both buttons.
    expect(q('[data-kanban-proposed-apply="true"]')?.className).toBe(KNOWLEDGE_TEXT_BUTTON_CLASS);
    expect(q('[data-kanban-proposed-discard="true"]')?.className).toBe(KNOWLEDGE_TEXT_BUTTON_CLASS);
  });

  it('applies only the ticked changes', async () => {
    const onApply = vi.fn(async (chosen: readonly KanbanProposedChange[]): Promise<readonly KanbanApplyChangeResult[]> => (
      chosen.map(() => ({ ok: true }))
    ));
    render({ onApply });

    // Untick the middle one.
    await act(async () => { boxes()[1].click(); });
    expect(boxes()[1].checked).toBe(false);

    await act(async () => { q('[data-kanban-proposed-apply="true"]')!.click(); });

    expect(onApply).toHaveBeenCalledTimes(1);
    const chosen = onApply.mock.calls[0][0] as readonly KanbanProposedChange[];
    expect(chosen.map((change) => change.kind)).toEqual(['create', 'update']);
    expect(q('[data-kanban-proposed-status="true"]')?.textContent).toContain('Applied 2 of 2 changes');
  });

  it('reports partial failures in plain words and stays read-only', async () => {
    const onApply = vi.fn(async (): Promise<readonly KanbanApplyChangeResult[]> => ([
      { ok: true },
      { ok: false, message: 'This card no longer exists' },
      { ok: true },
    ]));
    render({ onApply });

    await act(async () => { q('[data-kanban-proposed-apply="true"]')!.click(); });

    expect(q('[data-kanban-proposed-status="true"]')?.textContent).toContain('Applied 2 of 3 changes');
    const failures = q('[data-kanban-proposed-failures="true"]');
    expect(failures).not.toBeNull();
    expect(failures!.textContent).toContain('This card no longer exists');
    // Read-only after applying.
    expect(q('[data-kanban-proposed-apply="true"]')).toBeNull();
    expect(boxes().every((box) => box.disabled)).toBe(true);
  });

  it('Discard ends the list read-only without applying', async () => {
    const onApply = vi.fn(async () => []);
    render({ onApply });
    await act(async () => { q('[data-kanban-proposed-discard="true"]')!.click(); });
    expect(onApply).not.toHaveBeenCalled();
    expect(q('[data-kanban-proposed-status="true"]')?.textContent).toContain('Discarded');
    expect(q('[data-kanban-proposed-apply="true"]')).toBeNull();
    expect(boxes().every((box) => box.disabled)).toBe(true);
  });

  it('a viewer sees the list read-only with the reason, and no buttons', () => {
    render({ canEdit: false, onApply: undefined });
    expect(boxes()).toHaveLength(3);
    expect(boxes().every((box) => box.disabled)).toBe(true);
    expect(q('[data-kanban-proposed-apply="true"]')).toBeNull();
    expect(q('[data-kanban-proposed-discard="true"]')).toBeNull();
    expect(q('[data-kanban-proposed-readonly="true"]')?.textContent).toContain('Only editors can apply changes.');
  });
});

describe('PATCH-351 the schedule view', () => {
  const SCHEDULE: readonly KanbanProposedChange[] = [
    {
      kind: 'update', label: 'Set start date of “Launch” to 20 Oct 2026',
      cardId: 'c2', cardTitle: 'Launch', startDate: '2026-10-20', endDate: '2026-10-22',
    },
    {
      kind: 'update', label: 'Set start date of “Design homepage” to 13 Oct 2026',
      cardId: 'c1', cardTitle: 'Design homepage', startDate: '2026-10-13', endDate: '2026-10-16',
    },
  ];
  const checkbox = (index: number) =>
    host.querySelector(`[data-kanban-proposed-change-checkbox="${index}"]`) as HTMLInputElement;

  it('titles a plan "Proposed schedule" and sorts the date changes by start date', () => {
    render({ changes: SCHEDULE });
    expect(host.textContent).toContain('Proposed schedule (2)');
    const labels = Array.from(host.querySelectorAll('[data-kanban-proposed-change-label]'))
      .map((node) => node.textContent);
    expect(labels).toEqual([
      '“Design homepage”: Tue 13 Oct → Fri 16 Oct',
      '“Launch”: Tue 20 Oct → Thu 22 Oct',
    ]);
  });

  it('shows a warning in amber and leaves that change UNTICKED by default', () => {
    const warned: readonly KanbanProposedChange[] = [
      { ...SCHEDULE[0], warnings: ['Starts before “Design homepage” ends, which it depends on'] },
      SCHEDULE[1],
    ];
    render({ changes: warned });
    const warning = q('[data-kanban-proposed-warning="true"]');
    expect(warning).not.toBeNull();
    expect(warning!.textContent).toContain('Starts before “Design homepage” ends');
    expect(warning!.className).toContain('amber');
    // The warned change (original index 0) starts unticked; the other does not.
    expect(checkbox(0).checked).toBe(false);
    expect(checkbox(1).checked).toBe(true);
    // Apply is still offered -- the user may tick it anyway.
    expect(q('[data-kanban-proposed-apply="true"]')).not.toBeNull();
  });

  it('a single date change is NOT a schedule -- the plain list is unchanged', () => {
    render({ changes: [SCHEDULE[0], CHANGES[1]] });
    expect(host.textContent).toContain('Proposed changes (2)');
    expect(host.textContent).not.toContain('Proposed schedule');
  });
});
