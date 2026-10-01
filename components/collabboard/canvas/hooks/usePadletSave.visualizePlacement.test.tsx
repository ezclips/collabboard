// @vitest-environment jsdom
//
// PATCH-235 -- saveAIComponent's optional placement: a Visualize request places
// the new ai-component where it asked; without it, at newPostPosition.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Padlet } from '@/types/collabboard';
import { usePadletSave } from '@/hooks/canvas/usePadletSave';
import { supabaseBrowser } from '@/lib/supabase/browser';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let inserts: any[] = [];
let newPostPosition = { x: 7, y: 8 };
let api: ReturnType<typeof usePadletSave> | null = null;
let setDraft: ((padlet: Padlet | null) => void) | null = null;
let mounted: Array<{ root: Root; container: HTMLElement }> = [];

function installSupabase() {
  let nextId = 1;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from() {
      return {
        insert(row: any) {
          inserts.push(row);
          const created = { ...row, id: `persisted-${nextId++}` };
          return { select: () => ({ single: async () => ({ data: created, error: null }) }) };
        },
        update() { return { eq: async () => ({ data: null, error: null }) }; },
        select() {
          return {
            eq: () => ({
              single: async () => ({ data: null, error: null }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          };
        },
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
}

function Harness() {
  const [padlets, setPadlets] = React.useState<Padlet[]>([]);
  const [padletToEdit, setPadletToEdit] = React.useState<Padlet | null>(null);
  setDraft = setPadletToEdit;

  api = usePadletSave({
    canEditBoardContentNow: () => true,
    canvasId: 'canvas-1',
    padletToEdit,
    isWallLayout: false,
    isColumnsLayout: false,
    isGridLayout: false,
    isDrawingLayout: false,
    isTimelineLayout: false,
    isSchedulerLayout: false,
    isFreeformLayout: true,
    isMapLayout: false,
    setPadletToEdit: (next) => setPadletToEdit(next as Padlet | null),
    fetchData: async () => {},
    setIsNoteEditorOpen: () => {},
    setIsLinkEditorOpen: () => {},
    setIsTodoEditorOpen: () => {},
    setIsTableEditorOpen: () => {},
    setIsContainerEditorOpen: () => {},
    setIsCommentEditorOpen: () => {},
    setIsCardEditorOpen: () => {},
    setIsImageEditorOpen: () => {},
    isImageEditorOpen: false,
    setIsDrawingEditorOpen: () => {},
    setIsAIComponentEditorOpen: () => {},
    setPendingPostDraft: () => {},
    setIsPlacementPromptOpen: () => {},
    setWallPendingPostDraft: () => {},
    setWallPlacementPromptOpen: () => {},
    padlets,
    setPadlets,
    getNewPostPosition: () => newPostPosition,
  });

  return null;
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Harness />); });
  mounted.push({ root, container });
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  inserts = [];
  newPostPosition = { x: 7, y: 8 };
  api = null;
  setDraft = null;
});

const draft = () => ({
  id: 'new',
  board_id: 'canvas-1',
  title: 'AI Component',
  content: '',
  type: 'ai-component',
  position_x: 0,
  position_y: 0,
  width: 500,
  height: 400,
  metadata: {},
} as unknown as Padlet);

async function save(placement?: { x: number; y: number }) {
  installSupabase();
  mount();
  act(() => { setDraft!(draft()); });
  await act(async () => {
    await api!.saveAIComponent({ aiPrompt: 'p' } as never, placement);
  });
  return inserts.find((row) => row.type === 'ai-component');
}

describe('PATCH-235 saveAIComponent placement', () => {
  it('inserts a new ai-component at the supplied placement', async () => {
    const row = await save({ x: 111, y: 222 });
    expect(row.position_x).toBe(111);
    expect(row.position_y).toBe(222);
  });

  it('without a placement, inserts at newPostPosition', async () => {
    const row = await save();
    expect(row.position_x).toBe(7);
    expect(row.position_y).toBe(8);
  });
});
