// @vitest-environment jsdom
//
// PATCH-341. A card shows a "From brainstorm" badge when it was sent from a
// Freeform note, and the editor lists links back to those notes.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card as CardType } from '@/types/kanban-canvas';

type Link = { noteId: string; boardId: string; boardTitle: string; noteLabel: string };

const hoisted = vi.hoisted(() => ({ brainstormLinks: new Map() as Map<string, Link[]> }));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanData: () => ({ cards: [], columns: [], columnGroups: [], rows: [], links: [], users: [] }),
  useKanbanUI: () => ({ dateFormat: 'YYYY-MM-DD', collapsedColumns: new Set(), collapsedRows: new Set() }),
  useKanbanPersistence: () => ({ updateCard: vi.fn(), addLink: vi.fn(), deleteLink: vi.fn() }),
  useKanbanBrainstormLinks: () => hoisted.brainstormLinks,
}));
vi.mock('@/components/kanban-canvas/useKanbanI18n', () => ({
  useKanbanI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  },
}));

import { Card } from '@/components/kanban-canvas/Card';
import { Editor } from '@/components/kanban-canvas/Editor';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(ui); });
}

const card = (): CardType => ({ id: 'c1', label: 'Task', columnId: 'col-1' } as CardType);
const link = (over: Partial<Link> = {}): Link => ({
  noteId: 'n1', boardId: 'fb', boardTitle: 'Brainstorm', noteLabel: 'Note A', ...over,
});

beforeEach(() => { hoisted.brainstormLinks = new Map(); });
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-341 card badge', () => {
  it('shows the badge only when the card has source notes', async () => {
    hoisted.brainstormLinks = new Map([['c1', [link()]]]);
    await render(<Card card={card()} />);
    expect(document.querySelector('[data-kanban-brainstorm-badge="true"]')).not.toBeNull();
    expect(document.querySelector('[data-kanban-brainstorm-badge="true"]')?.getAttribute('title')).toContain('Brainstorm');

    act(() => root!.unmount());
    root = null;
    document.body.replaceChildren();

    hoisted.brainstormLinks = new Map();
    await render(<Card card={card()} />);
    expect(document.querySelector('[data-kanban-brainstorm-badge="true"]')).toBeNull();
  });
});

describe('PATCH-341 editor links', () => {
  it('lists up to 5 source notes and a "+N more" line, with the right URLs', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      link({ noteId: `n${i + 1}`, boardId: 'fb', noteLabel: `Note ${i + 1}` }));
    hoisted.brainstormLinks = new Map([['c1', many]]);

    await render(<Editor card={card()} onClose={vi.fn()} />);

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-kanban-brainstorm-link="true"]'));
    expect(links).toHaveLength(5);
    expect(links[0].getAttribute('href')).toBe('/dashboard/canvas/fb?openPadlet=n1');
    expect(document.body.textContent).toContain('moreLinks');
  });
});
