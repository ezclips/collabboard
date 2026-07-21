import { expect, test, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasE2ECredentials } from '../helpers/env';
import {
  assertDrawingFixtureCleanup,
  cleanupDrawingFixture,
  createDisposableDrawingBoard,
  openDrawingBoard,
  registerDrawingCleanup,
  type CleanupCounts,
  type DrawingFixture,
} from './drawingBridgeHarness';

const ANNOTATION = 'patch-097-presentation-ai-component-render-evidence' as const;
const DIRECT_MARKER = 'PATCH-097 direct saved AI marker';
const DIRECT_LOWER_PRIORITY = 'PATCH-097 direct lower priority should not render';
const DIRECT_GENERIC_FALLBACK = 'PATCH-097 direct generic content should not render';
const NESTED_MARKER = 'PATCH-097 nested aiComponentCode marker';
const NESTED_LOWER_PRIORITY = 'PATCH-097 nested raw lower priority should not render';
const NOTE_MARKER = 'PATCH-097 ordinary note remains visible';
const FINAL_CLASSIFICATION = 'runtime-ai-component-render-consistent' as const;

registerDrawingCleanup(test);

type Json = Record<string, unknown>;

type SeededRuntimeAI = {
  frameId: string;
  directAiId: string;
  nestedContainerId: string;
  nestedAiId: string;
  emptyAiId: string;
  noteId: string;
};

function sceneBase(id: string, type: string, x: number, y: number, width: number, height: number, frameId: string | null): Json {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: type === 'frame' ? '#000000' : 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: type === 'frame' ? 2 : 1,
    strokeStyle: 'solid',
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

function frameElement(id: string, name: string, x: number, y: number, width: number, height: number): Json {
  return {
    ...sceneBase(id, 'frame', x, y, width, height, null),
    name,
  };
}

function embeddableElement(
  id: string,
  padletId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  frameId: string,
): Json {
  return {
    ...sceneBase(id, 'embeddable', x, y, width, height, frameId),
    link: `padlet://${padletId}`,
    customData: {},
  };
}

async function insertMasterPadlet(
  supabase: SupabaseClient,
  fixture: DrawingFixture,
  elements: Json[],
): Promise<void> {
  const { data, error } = await supabase
    .from('padlets')
    .insert({
      board_id: fixture.boardId,
      title: `${fixture.prefix} master`,
      content: JSON.stringify(elements),
      type: 'drawing',
      position_x: 0,
      position_y: 0,
      width: 0,
      height: 0,
      metadata: {
        patch064Harness: true,
        drawingAppState: JSON.stringify({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
        drawingFiles: JSON.stringify({}),
      },
    })
    .select('id')
    .single();
  if (error) throw error;
  fixture.masterPadletId = data.id;
}

async function seedRuntimeAIComponentSlide(
  supabase: SupabaseClient,
  fixture: DrawingFixture,
): Promise<SeededRuntimeAI> {
  const frameId = 'patch-097-ai-runtime-frame';
  const directAiId = crypto.randomUUID();
  const nestedContainerId = crypto.randomUUID();
  const nestedAiId = crypto.randomUUID();
  const emptyAiId = crypto.randomUUID();
  const noteId = crypto.randomUUID();

  const { error } = await supabase.from('padlets').insert([
    {
      id: directAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} direct AI`,
      content: DIRECT_GENERIC_FALLBACK,
      type: 'ai-component',
      position_x: 80,
      position_y: 100,
      width: 360,
      height: 220,
      metadata: {
        patch064Harness: true,
        savedAIComponent: {
          code: `<section data-patch-097="direct">${DIRECT_MARKER}</section>`,
        },
        aiComponentCode: `<section>${DIRECT_LOWER_PRIORITY}</section>`,
        aiRawCode: `<section>${DIRECT_LOWER_PRIORITY}</section>`,
      },
    },
    {
      id: nestedContainerId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} container`,
      content: '',
      type: 'container',
      position_x: 500,
      position_y: 100,
      width: 420,
      height: 300,
      metadata: {
        patch064Harness: true,
        childPadletIds: [nestedAiId],
      },
    },
    {
      id: nestedAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} nested AI`,
      content: 'PATCH-097 nested generic content should not render',
      type: 'ai-component',
      position_x: 0,
      position_y: 0,
      width: 360,
      height: 220,
      metadata: {
        patch064Harness: true,
        parentId: nestedContainerId,
        containerIndex: 0,
        aiComponentCode: `<article data-patch-097="nested">${NESTED_MARKER}</article>`,
        aiRawCode: `<article>${NESTED_LOWER_PRIORITY}</article>`,
      },
    },
    {
      id: emptyAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} empty AI`,
      content: '',
      type: 'ai-component',
      position_x: 80,
      position_y: 380,
      width: 320,
      height: 180,
      metadata: {
        patch064Harness: true,
      },
    },
    {
      id: noteId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} ordinary note`,
      content: NOTE_MARKER,
      type: 'note',
      position_x: 980,
      position_y: 120,
      width: 220,
      height: 180,
      metadata: {
        patch064Harness: true,
      },
    },
  ]);
  if (error) throw error;

  fixture.containerIds.push(nestedContainerId);
  fixture.childIds.push(directAiId, nestedAiId, emptyAiId, noteId);
  fixture.frameIds.push(frameId);

  await insertMasterPadlet(supabase, fixture, [
    frameElement(frameId, 'PATCH-097 AI Runtime', 0, 0, 1280, 720),
    embeddableElement('patch-097-direct-ai-embeddable', directAiId, 80, 100, 360, 220, frameId),
    embeddableElement('patch-097-container-embeddable', nestedContainerId, 500, 100, 420, 300, frameId),
    embeddableElement('patch-097-empty-ai-embeddable', emptyAiId, 80, 380, 320, 180, frameId),
    embeddableElement('patch-097-note-embeddable', noteId, 980, 120, 220, 180, frameId),
  ]);

  return {
    frameId,
    directAiId,
    nestedContainerId,
    nestedAiId,
    emptyAiId,
    noteId,
  };
}

async function openRuntimePresentation(page: Page) {
  await page.getByTitle('Present Frames').click();
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(sidebar.getByText('Slides (1)', { exact: true })).toBeVisible({ timeout: 90_000 });
  await sidebar.getByRole('button', { name: 'Start presentation', exact: true }).last().click();
  const fullscreen = page.locator('div[style*="z-index: 9999"]').first();
  await expect(fullscreen.getByText('Slide 1 / 1', { exact: true })).toBeVisible({ timeout: 60_000 });
  return fullscreen;
}

async function cleanupAndAssert(supabase: SupabaseClient, fixture: DrawingFixture): Promise<CleanupCounts> {
  await cleanupDrawingFixture(supabase, fixture);
  return assertDrawingFixtureCleanup(supabase, fixture);
}

test.describe('runtime presentation AI component rendering (PATCH-097)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('renders direct and nested AI-component HTML in the runtime player', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-097-ai-render');
    const seeded = await seedRuntimeAIComponentSlide(supabase, fixture);
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      await openDrawingBoard(page, fixture.boardId);
      await expect(page.locator(`[data-padlet-id="${seeded.directAiId}"]`).getByText(DIRECT_MARKER)).toBeVisible({ timeout: 90_000 });

      let fullscreen = await openRuntimePresentation(page);

      await expect(fullscreen.getByText(DIRECT_MARKER, { exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(fullscreen.getByText(NESTED_MARKER, { exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(fullscreen.getByText(NOTE_MARKER, { exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(fullscreen.getByText('No AI component generated yet', { exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(fullscreen.getByText(DIRECT_LOWER_PRIORITY, { exact: true })).toHaveCount(0);
      await expect(fullscreen.getByText(NESTED_LOWER_PRIORITY, { exact: true })).toHaveCount(0);
      await expect(fullscreen.getByText(DIRECT_GENERIC_FALLBACK, { exact: true })).toHaveCount(0);
      await expect(fullscreen.getByTitle('Resize')).toHaveCount(0);
      await expect(fullscreen.getByText('Convert', { exact: true })).toHaveCount(0);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await openDrawingBoard(page, fixture.boardId);
      fullscreen = await openRuntimePresentation(page);
      await expect(fullscreen.getByText(DIRECT_MARKER, { exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(fullscreen.getByText(NESTED_MARKER, { exact: true })).toBeVisible({ timeout: 90_000 });

      cleanupCounts = await cleanupAndAssert(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });

      test.info().annotations.push({
        type: ANNOTATION,
        description: JSON.stringify({
          boardPrefix: fixture.prefix,
          seeded,
          editorModeControl: {
            directAIMarkerVisible: true,
          },
          runtimeAssertions: {
            directSavedAIHtmlVisible: true,
            nestedAIComponentCodeVisible: true,
            metadataFallbackOrder: 'savedAIComponent.code before aiComponentCode before aiRawCode; aiComponentCode before aiRawCode',
            genericTextFallbackSuppressedForValidAI: true,
            nonAIControlVisible: true,
            emptyAIFallback: 'No AI component generated yet',
            editorOnlyRendererMountedAsShortcut: false,
            resizeHandleExposed: false,
          },
          reloadStability: true,
          cleanupCounts,
          finalClassification: FINAL_CLASSIFICATION,
        }),
      });
    } finally {
      if (cleanupCounts.boards !== 0) {
        await expect(cleanupAndAssert(supabase, fixture)).resolves.toEqual({
          boards: 0,
          padlets: 0,
          canvasLines: 0,
        });
      }
    }
  });
});
