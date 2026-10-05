// @vitest-environment jsdom
//
// PATCH-282 -- the drawing editor's library panel must receive proper
// Excalidraw `LibraryItem` objects: the AntV designs first, then each community
// item as its own entry (not their elements flattened into one list).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DrawingEditor from './DrawingEditor';

const hoisted = vi.hoisted(() => ({
  initialData: null as any,
  libraryItems: [] as any[],
}));

vi.mock('./ExcalidrawWrapper', () => ({
  default: (props: any) => {
    if (props.initialData) hoisted.initialData = props.initialData;
    return React.createElement('div', { 'data-testid': 'excalidraw-stub' });
  },
}));

vi.mock('@/lib/collabboard/antvLibrary', () => ({
  loadAntvLibraryItems: () =>
    Promise.resolve([
      {
        id: 'antv:chart-pie-donut-pill-badge',
        status: 'published',
        created: 0,
        name: 'Charts · Pie donut pill badge',
        elements: [{ id: 'antv-e0', type: 'rectangle' }],
      },
    ]),
}));

vi.mock('@/lib/collabboard/excalidrawLibrary', () => ({
  getExcalidrawLibrary: () => [
    {
      id: 'community-1',
      name: 'My import',
      created: 123,
      elements: [
        { id: 'c1', type: 'ellipse' },
        { id: 'c2', type: 'ellipse' },
      ],
    },
  ],
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounted = [];
  hoisted.initialData = null;
});

describe('PATCH-282: DrawingEditor library wiring', () => {
  it('passes AntV items first, then whole community items with id/status/elements', async () => {
    mount(<DrawingEditor isOpen onClose={() => {}} onSave={() => {}} initialMetadata={{}} />);

    await act(async () => {
      for (let i = 0; i < 30; i += 1) {
        const items = hoisted.initialData?.libraryItems ?? [];
        if (items.some((item: any) => String(item.id).startsWith('antv:'))) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    const items = hoisted.initialData?.libraryItems ?? [];
    expect(items.length).toBe(2);
    expect(items[0].id).toBe('antv:chart-pie-donut-pill-badge');
    expect(items[0].status).toBe('published');
    expect(Array.isArray(items[0].elements)).toBe(true);

    const community = items.find((item: any) => item.id === 'community-1');
    expect(community).toBeTruthy();
    expect(community.name).toBe('My import');
    expect(community.status).toBe('unpublished');
    // The community item is one library item of TWO elements -- not flattened
    // into the top-level list as two bare elements.
    expect(community.elements).toHaveLength(2);

    for (const item of items) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.status).toBe('string');
      expect(Array.isArray(item.elements)).toBe(true);
    }
  });
});
