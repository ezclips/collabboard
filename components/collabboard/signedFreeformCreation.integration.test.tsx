// @vitest-environment jsdom
//
// PATCH 9V.2B -- creation into the negative signed world, per root post type.
//
// Placement for every type routed through normal creation funnels into ONE
// function: CanvasClient's getNewPostPosition(cardWidth, cardHeight), which
// PATCH 9V.2B changed from Math.max(0, ...) to the signed rect contract. This
// test mounts the REAL usePadletSave hook -- the shared creation pipeline all
// ten editors save through -- with a getNewPostPosition composed from the
// REAL exported clamp, and asserts on the row that actually reaches the
// database.
//
// It therefore proves two distinct things at once:
//   1. each type's real creation dimensions reach the bound (a 500x400 AI
//      component and a 180x220 card do NOT stop at the same coordinate), and
//   2. nothing downstream of the helper -- not the hook, not the command, not
//      the repository -- quietly re-floors the value at zero on the way out.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { usePadletSave } from '@/hooks/canvas/usePadletSave';
import {
  clampRectPositionToFreeformBounds,
  FREEFORM_WORLD_MIN_X,
  FREEFORM_WORLD_MIN_Y,
} from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import { supabaseBrowser } from '@/lib/supabase/browser';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface InsertedRow {
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
  type?: string;
}

function installFakeSupabase() {
  const inserted: InsertedRow[] = [];
  let nextId = 1;
  const client = {
    from(_table: string) {
      return {
        insert(row: any) {
          inserted.push(row);
          const created = { ...row, id: `persisted-${nextId++}` };
          return {
            select: () => ({ single: async () => ({ data: created, error: null }) }),
            then: (resolve: any) => resolve({ data: created, error: null }),
          };
        },
        update(_fields: any) {
          return { eq: async () => ({ data: null, error: null }) };
        },
        select(_cols: string) {
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
  vi.mocked(supabaseBrowser).mockReturnValue(client as any);
  return inserted;
}

/**
 * CanvasClient's getNewPostPosition, reproduced over a simulated camera:
 * take the world point at the viewport centre, offset by half the new card,
 * and bound the resulting rectangle. `worldCenter` stands in for wherever the
 * user has panned to -- including out past the world edge into the gutter.
 */
function makeGetNewPostPosition(worldCenter: { x: number; y: number }) {
  return (cardWidth: number, cardHeight: number) =>
    clampRectPositionToFreeformBounds({
      x: Math.round(worldCenter.x - cardWidth / 2),
      y: Math.round(worldCenter.y - cardHeight / 2),
      width: cardWidth,
      height: cardHeight,
    });
}

type SaveApi = ReturnType<typeof usePadletSave>;

let api: SaveApi | null = null;
let setDraft: ((padlet: Padlet | null) => void) | null = null;

function Harness({ worldCenter }: { worldCenter: { x: number; y: number } }) {
  const [padlets, setPadlets] = React.useState<Padlet[]>([]);
  const [padletToEdit, setPadletToEdit] = React.useState<Padlet | null>(null);
  setDraft = setPadletToEdit;

  api = usePadletSave({
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
    setPadletToEdit,
    fetchData: async () => {},
    setIsNoteEditorOpen: () => {},
    setIsLinkEditorOpen: () => {},
    setIsTodoEditorOpen: () => {},
    setIsTableEditorOpen: () => {},
    setIsContainerEditorOpen: () => {},
    setIsCommentEditorOpen: () => {},
    setIsCardEditorOpen: () => {},
    setIsImageEditorOpen: () => {},
    setIsDrawingEditorOpen: () => {},
    setIsAIComponentEditorOpen: () => {},
    setPendingPostDraft: () => {},
    setIsPlacementPromptOpen: () => {},
    setWallPendingPostDraft: () => {},
    setWallPlacementPromptOpen: () => {},
    padlets,
    setPadlets,
    getNewPostPosition: makeGetNewPostPosition(worldCenter),
  });

  return null;
}

let mounted: Array<{ root: Root; container: HTMLElement }> = [];

function mount(worldCenter: { x: number; y: number }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Harness worldCenter={worldCenter} />); });
  mounted.push({ root, container });
}

afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  api = null;
  setDraft = null;
  vi.clearAllMocks();
});

const NEW_DRAFT = (type: string): Padlet => ({
  id: 'new',
  board_id: 'canvas-1',
  title: '',
  content: '',
  type,
  position_x: 0,
  position_y: 0,
  width: 180,
  height: 220,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  metadata: {},
} as Padlet);

/** Every root type routed through normal creation, with the dimensions its
 *  own branch of usePadletSave passes to getNewPostPosition. */
const CREATION_MATRIX: Array<{
  label: string;
  draftType: string;
  width: number;
  height: number;
  save: (a: SaveApi) => Promise<unknown>;
}> = [
  { label: 'Note/text [33]', draftType: 'text', width: 280, height: 280, save: (a) => a.saveNote({ content: 'hello' }) },
  { label: 'Document/Card [34]', draftType: 'card', width: 180, height: 220, save: (a) => a.saveCard({ title: 'Doc', content: '<p>body</p>', metadata: {} }) },
  { label: 'Image [35]', draftType: 'image', width: 300, height: 200, save: (a) => a.saveImage({ imageUrl: 'https://example.test/a.png', source: 'upload' }) },
  { label: 'Comment [36]', draftType: 'comment', width: 300, height: 280, save: (a) => a.saveComment({ comments: [{ id: 'c1', text: 'hi', userId: 'u', userName: 'U', timestamp: 1 }] }) },
  { label: 'Todo [37]', draftType: 'todo', width: 300, height: 350, save: (a) => a.saveTodo({ tasks: [{ id: 't1', text: 'task', completed: false }] }) },
  { label: 'Table [38]', draftType: 'table', width: 400, height: 300, save: (a) => a.saveTable({ title: 'T', content: '{}' }) },
  { label: 'Container [39]', draftType: 'container', width: 350, height: 300, save: (a) => a.saveContainer({ title: 'Col', backgroundColor: '#fff' }) },
  { label: 'Drawing [40]', draftType: 'drawing', width: 400, height: 300, save: (a) => a.saveDrawing({ drawingData: '[]', drawingAppState: '{}', drawingFiles: '{}' }) },
  { label: 'AI component [41]', draftType: 'ai-component', width: 500, height: 400, save: (a) => a.saveAIComponent({ aiPrompt: 'p', aiComponentCode: '<div/>' }) },
  { label: 'Link', draftType: 'link', width: 300, height: 350, save: (a) => a.saveLink({ linkUrl: 'https://example.test' }) },
];

async function create(entry: typeof CREATION_MATRIX[number]) {
  await act(async () => { setDraft!(NEW_DRAFT(entry.draftType)); });
  await act(async () => { await entry.save(api!); });
}

describe('PATCH 9V.2B: creation while the camera looks at negative world [matrix 33-41]', () => {
  it.each(CREATION_MATRIX)('creates $label at the intended negative world position', async (entry) => {
    const inserted = installFakeSupabase();
    // Camera centred on world (-1000, -800): comfortably inside the signed
    // world, so nothing should be bounded -- the post lands where it looks.
    mount({ x: -1000, y: -800 });
    await create(entry);

    const row = inserted.find((r) => r.position_x !== undefined);
    expect(row, 'creation produced no inserted row').toBeDefined();
    expect({ x: row!.position_x, y: row!.position_y }).toEqual({
      x: Math.round(-1000 - entry.width / 2),
      y: Math.round(-800 - entry.height / 2),
    });
    expect(row!.position_x).toBeLessThan(0);
    expect(row!.position_y).toBeLessThan(0);
  });
});

describe('PATCH 9V.2B: creation from the outer camera gutter [matrix 42; Phase 36, 37]', () => {
  it.each(CREATION_MATRIX)('clamps $label back to the signed world edge, never a gutter coordinate', async (entry) => {
    const inserted = installFakeSupabase();
    // Camera panned far past the world minimum -- legal for the CAMERA, but
    // no object may be persisted out there.
    mount({ x: -20000, y: -20000 });
    await create(entry);

    const row = inserted.find((r) => r.position_x !== undefined);
    expect(row, 'creation produced no inserted row').toBeDefined();
    expect({ x: row!.position_x, y: row!.position_y })
      .toEqual({ x: FREEFORM_WORLD_MIN_X, y: FREEFORM_WORLD_MIN_Y });
  });

  it('clamps by each type\'s OWN size at the max edge, not a shared constant', async () => {
    const results: Record<string, number> = {};
    for (const entry of [CREATION_MATRIX[0], CREATION_MATRIX[8]]) {
      const inserted = installFakeSupabase();
      mount({ x: 99999, y: 99999 });
      await create(entry);
      const row = inserted.find((r) => r.position_x !== undefined)!;
      results[entry.label] = row.position_x;
      // Whole rectangle inside the world.
      expect(row.position_x + entry.width).toBe(15000);
    }
    // A 280-wide Note and a 500-wide AI component stop at different x.
    expect(results['Note/text [33]']).toBe(15000 - 280);
    expect(results['AI component [41]']).toBe(15000 - 500);
  });
});
