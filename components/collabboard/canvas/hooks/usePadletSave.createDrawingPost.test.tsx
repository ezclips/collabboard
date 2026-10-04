// @vitest-environment jsdom
//
// PATCH-278 C. `createDrawingPost` is the one new-drawing insert, used by both
// saveDrawing's `new` branch and the "Edit as drawing" flow. These tests pin the
// insert payload, the `openEditor` open behaviour, the placement-prompt
// hand-off, and that a new drawing saved through saveDrawing still works.
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
let seedBoard: ((padlets: Padlet[]) => void) | null = null;
let editedDraft: Padlet | null = null;
let editorOpen = false;
let pendingDrafts: any[] = [];
let layout = { grid: false, columns: false, wall: false, timeline: false, drawing: false, scheduler: false };
let mounted: Array<{ root: Root; container: HTMLElement }> = [];

function installSupabase() {
  let nextId = 1;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from() {
      return {
        insert(row: any) {
          const created = { ...row, id: `persisted-${nextId++}` };
          inserts.push(created);
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
  seedBoard = (next) => setPadlets(next);

  api = usePadletSave({
    canEditBoardContentNow: () => true,
    canvasId: 'canvas-1',
    padletToEdit,
    isWallLayout: layout.wall,
    isColumnsLayout: layout.columns,
    isGridLayout: layout.grid,
    isDrawingLayout: layout.drawing,
    isTimelineLayout: layout.timeline,
    isSchedulerLayout: layout.scheduler,
    isFreeformLayout: true,
    isMapLayout: false,
    setPadletToEdit: (next) => {
      editedDraft = next as Padlet | null;
      setPadletToEdit(next as Padlet | null);
    },
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
    setIsDrawingEditorOpen: (v) => { editorOpen = v; },
    setIsAIComponentEditorOpen: () => {},
    setPendingPostDraft: (d) => { pendingDrafts.push(d); },
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
  seedBoard = null;
  editedDraft = null;
  editorOpen = false;
  pendingDrafts = [];
  layout = { grid: false, columns: false, wall: false, timeline: false, drawing: false, scheduler: false };
});

const DRAWING = {
  drawingData: 'DATA',
  drawingAppState: 'APP',
  drawingFiles: 'FILES',
  previewUrl: 'PREVIEW',
  title: 'Pic',
};

async function run(data: Record<string, unknown>, opts?: Record<string, unknown>) {
  installSupabase();
  mount();
  await act(async () => {
    await api!.createDrawingPost(data as never, opts as never);
  });
  return inserts.find((row) => row.type === 'drawing');
}

describe('PATCH-278 createDrawingPost', () => {
  it('inserts a drawing with the four metadata fields, size and placement', async () => {
    const row = await run(DRAWING, {
      placement: { x: 11, y: 22 },
      size: { width: 500, height: 300 },
      openEditor: true,
    });
    expect(row).toBeDefined();
    expect(row.type).toBe('drawing');
    expect(row.content).toBe('');
    expect(row.metadata).toEqual({
      drawingData: 'DATA',
      drawingAppState: 'APP',
      drawingFiles: 'FILES',
      previewUrl: 'PREVIEW',
      zIndex: 101,
    });
    expect(row.position_x).toBe(11);
    expect(row.position_y).toBe(22);
    expect(row.width).toBe(500);
    expect(row.height).toBe(300);
    expect(row.title).toBe('Pic');
  });

  it('PATCH-279: lands on top of the board: metadata.zIndex is nextZIndex(padlets)', async () => {
    installSupabase();
    mount();
    act(() => {
      seedBoard!([
        { id: 'top', type: 'ai-component', metadata: { zIndex: 250 } } as unknown as Padlet,
        { id: 'mid', type: 'text', metadata: { zIndex: 100 } } as unknown as Padlet,
      ]);
    });
    await act(async () => {
      await api!.createDrawingPost(DRAWING as never, { openEditor: true });
    });
    const row = inserts.find((r) => r.type === 'drawing');
    expect(row.metadata.zIndex).toBe(251);
  });

  it('PATCH-279: an empty board still gives a drawing a zIndex (101)', async () => {
    const row = await run(DRAWING, { openEditor: true });
    expect(row.metadata.zIndex).toBe(101);
  });

  it('openEditor points padletToEdit at the created post and opens the drawing editor', async () => {
    const row = await run(DRAWING, { openEditor: true });
    expect(editedDraft?.id).toBe(row.id);
    expect(editorOpen).toBe(true);
  });

  it('does not read padletToEdit: a new drawing is created while an AI post is open', async () => {
    installSupabase();
    mount();
    act(() => {
      setDraft!({
        id: 'existing-ai',
        type: 'ai-component',
        metadata: { aiPrompt: 'hello' },
      } as unknown as Padlet);
    });
    await act(async () => {
      await api!.createDrawingPost(DRAWING as never, { openEditor: true });
    });
    expect(inserts.find((row) => row.type === 'drawing')).toBeDefined();
  });

  it('hands the draft to the placement prompt without inserting or opening the editor', async () => {
    layout.grid = true;
    const row = await run(DRAWING, { openEditor: true });
    expect(row).toBeUndefined();
    expect(pendingDrafts).toHaveLength(1);
    expect(pendingDrafts[0].kind).toBe('drawing');
    expect(editorOpen).toBe(false);
  });

  it('saveDrawing for a new drawing still inserts through it', async () => {
    installSupabase();
    mount();
    act(() => {
      setDraft!({
        id: 'new',
        type: 'drawing',
        metadata: { cardColor: '#abcdef' },
      } as unknown as Padlet);
    });
    await act(async () => {
      await api!.saveDrawing({ ...DRAWING, metadata: { topStrip: 'red' } } as never);
    });
    const row = inserts.find((r) => r.type === 'drawing');
    expect(row).toBeDefined();
    expect(row.metadata.cardColor).toBe('#abcdef');
    expect(row.metadata.topStrip).toBe('red');
    expect(row.width).toBe(400);
    expect(row.height).toBe(300);
    expect(row.position_x).toBe(7);
    expect(editorOpen).toBe(false);
    expect(row.metadata.zIndex).toBe(101);
  });
});
