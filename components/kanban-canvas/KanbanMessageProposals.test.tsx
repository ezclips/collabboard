// @vitest-environment jsdom
//
// PATCH-350 Addendum 1. The per-message proposals wrapper: it renders the
// changes a message carries, and keeps them when a re-read drops them.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import KanbanMessageProposals from './KanbanMessageProposals';
import type { KanbanProposedChange } from '@/lib/domain/ai/kanbanChangeProposals';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const changes: readonly KanbanProposedChange[] = [
  { kind: 'move', label: 'Move “X” to Done', cardId: 'card-1', columnId: 'col-done' },
];

function render(ui: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(ui); });
}

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const onApply = async () => [];

describe('PATCH-350 KanbanMessageProposals', () => {
  it('renders the proposals a message carries', () => {
    render(<KanbanMessageProposals message={{ id: 'a1', proposedChanges: changes }} canEdit onApply={onApply} />);
    expect(q('[data-kanban-proposed-changes="true"]')).not.toBeNull();
    expect(host.textContent).toContain('Move “X” to Done');
  });

  it('keeps them after a re-read returns the same message without them', () => {
    render(<KanbanMessageProposals message={{ id: 'a1', proposedChanges: changes }} canEdit onApply={onApply} />);
    expect(q('[data-kanban-proposed-changes="true"]')).not.toBeNull();

    // The re-read: the same message id, no proposedChanges.
    act(() => {
      root!.render(<KanbanMessageProposals message={{ id: 'a1' }} canEdit onApply={onApply} />);
    });
    expect(q('[data-kanban-proposed-changes="true"]')).not.toBeNull();
    expect(host.textContent).toContain('Move “X” to Done');
  });

  it('renders nothing for a message with no proposals', () => {
    render(<KanbanMessageProposals message={{ id: 'a2' }} canEdit onApply={onApply} />);
    expect(q('[data-kanban-proposed-changes="true"]')).toBeNull();
  });

  it('passes the read-only state through for a viewer', () => {
    render(<KanbanMessageProposals message={{ id: 'a3', proposedChanges: changes }} canEdit={false} onApply={undefined} />);
    expect(q('[data-kanban-proposed-apply="true"]')).toBeNull();
    expect(q('[data-kanban-proposed-readonly="true"]')?.textContent).toContain('Only editors can apply changes.');
  });
});
