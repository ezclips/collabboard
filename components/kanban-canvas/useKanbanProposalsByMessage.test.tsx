// @vitest-environment jsdom
//
// PATCH-350 Addendum 1. The per-message proposals memory, extracted from the
// drawer: it keeps the changes a message carried after a re-read drops them.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { useKanbanProposalsByMessage } from './useKanbanProposalsByMessage';
import type { KanbanProposedChange } from '@/lib/domain/ai/kanbanChangeProposals';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;
let current: readonly KanbanProposedChange[] = [];

interface Message {
  readonly id: string;
  readonly proposedChanges?: readonly KanbanProposedChange[] | null;
}

function Harness({ message }: { message: Message }) {
  current = useKanbanProposalsByMessage(message);
  return null;
}

function mount(message: Message) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(<Harness message={message} />); });
}

const rerender = (message: Message) => {
  act(() => { root!.render(<Harness message={message} />); });
};

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

const changes: readonly KanbanProposedChange[] = [
  { kind: 'move', label: 'Move “X” to Done', cardId: 'card-1', columnId: 'col-done' },
];

describe('useKanbanProposalsByMessage', () => {
  it('returns the wire value while the message carries it', () => {
    mount({ id: 'a1', proposedChanges: changes });
    expect(current).toEqual(changes);
  });

  it('keeps the value after a re-read returns the same message without it', () => {
    mount({ id: 'a1', proposedChanges: changes });
    expect(current).toEqual(changes);
    rerender({ id: 'a1' });
    expect(current).toEqual(changes);
  });

  it('returns a stable empty list for a message with none', () => {
    mount({ id: 'a2' });
    const none = current;
    expect(none).toEqual([]);
    rerender({ id: 'a2' });
    expect(current).toBe(none);
  });

  it('starts clean when the instance is reused for a different message id', () => {
    mount({ id: 'a1', proposedChanges: changes });
    expect(current).toEqual(changes);
    rerender({ id: 'b1' });
    expect(current).toEqual([]);
  });
});
