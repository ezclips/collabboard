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
import { serializeAIContentEnvelope } from '../../lib/ai/persistence';

const ANNOTATION = 'patch-100-presentation-snapshot-ai-component-render-evidence' as const;
const DIRECT_MARKER = 'PATCH-100 direct structured lesson marker';
const NESTED_MARKER = 'PATCH-100 nested structured lesson marker';
const LEGACY_MARKER = 'PATCH-100 legacy snapshot marker';
const NOTE_MARKER = 'PATCH-100 non-AI snapshot control';
const EMPTY_FALLBACK = 'No AI component generated yet';
const FINAL_CLASSIFICATION = 'snapshot-ai-component-synchronous-render-observed' as const;

registerDrawingCleanup(test);

type Json = Record<string, unknown>;

type SnapshotEvent = {
  padletId: string;
  kind: string;
};

type SeededSnapshotAI = {
  frameId: string;
  directAiId: string;
  nestedContainerId: string;
  nestedAiId: string;
  legacyAiId: string;
  noteId: string;
};

declare global {
  interface Window {
    __patch100Events?: SnapshotEvent[];
  }
}

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

function structuredLessonEnvelope(marker: string) {
  return serializeAIContentEnvelope({
    mode: 'lesson_board',
    data: {
      type: 'lesson_board',
      title: marker,
      objective: marker,
      sections: [
        {
          title: marker,
          bullets: [`${marker} committed synchronously`],
          durationMinutes: 5,
        },
      ],
    },
    meta: {
      renderer: 'lesson_board',
      prompt: marker,
      createdAt: '2026-07-21T00:00:00.000Z',
    },
  });
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

async function seedSnapshotAIComponentSlide(
  supabase: SupabaseClient,
  fixture: DrawingFixture,
): Promise<SeededSnapshotAI> {
  const frameId = 'patch-100-ai-snapshot-frame';
  const directAiId = crypto.randomUUID();
  const nestedContainerId = crypto.randomUUID();
  const nestedAiId = crypto.randomUUID();
  const legacyAiId = crypto.randomUUID();
  const noteId = crypto.randomUUID();

  const { error } = await supabase.from('padlets').insert([
    {
      id: directAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} direct structured AI`,
      content: EMPTY_FALLBACK,
      type: 'ai-component',
      position_x: 70,
      position_y: 90,
      width: 380,
      height: 240,
      metadata: {
        patch064Harness: true,
        aiComponentJson: structuredLessonEnvelope(DIRECT_MARKER),
      },
    },
    {
      id: nestedContainerId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} container`,
      content: '',
      type: 'container',
      position_x: 485,
      position_y: 90,
      width: 380,
      height: 270,
      metadata: {
        patch064Harness: true,
        childPadletIds: [nestedAiId],
      },
    },
    {
      id: nestedAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} nested structured AI`,
      content: EMPTY_FALLBACK,
      type: 'ai-component',
      position_x: 0,
      position_y: 0,
      width: 330,
      height: 220,
      metadata: {
        patch064Harness: true,
        parentId: nestedContainerId,
        containerIndex: 0,
        aiComponentJson: structuredLessonEnvelope(NESTED_MARKER),
      },
    },
    {
      id: legacyAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} legacy AI`,
      content: EMPTY_FALLBACK,
      type: 'ai-component',
      position_x: 70,
      position_y: 390,
      width: 340,
      height: 190,
      metadata: {
        patch064Harness: true,
        savedAIComponent: {
          code: `<section data-patch-100="legacy">${LEGACY_MARKER}</section>`,
        },
      },
    },
    {
      id: noteId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} note`,
      content: NOTE_MARKER,
      type: 'note',
      position_x: 900,
      position_y: 100,
      width: 240,
      height: 170,
      metadata: {
        patch064Harness: true,
      },
    },
  ]);
  if (error) throw error;

  fixture.containerIds.push(nestedContainerId);
  fixture.childIds.push(directAiId, nestedAiId, legacyAiId, noteId);
  fixture.frameIds.push(frameId);

  await insertMasterPadlet(supabase, fixture, [
    frameElement(frameId, 'PATCH-100 AI Snapshot', 0, 0, 1280, 720),
    embeddableElement('patch-100-direct-ai-embeddable', directAiId, 70, 90, 380, 240, frameId),
    embeddableElement('patch-100-container-embeddable', nestedContainerId, 485, 90, 380, 270, frameId),
    embeddableElement('patch-100-legacy-ai-embeddable', legacyAiId, 70, 390, 340, 190, frameId),
    embeddableElement('patch-100-note-embeddable', noteId, 900, 100, 240, 170, frameId),
  ]);

  return {
    frameId,
    directAiId,
    nestedContainerId,
    nestedAiId,
    legacyAiId,
    noteId,
  };
}

async function installSnapshotEventBuffer(page: Page) {
  await page.evaluate(() => {
    window.__patch100Events = [];
    window.addEventListener('collabboard-ai-snapshot-rendered', (event) => {
      const detail = (event as CustomEvent<SnapshotEvent>).detail;
      window.__patch100Events?.push({
        padletId: detail.padletId,
        kind: detail.kind,
      });
    });
  });
}

async function readSnapshotEvents(page: Page): Promise<SnapshotEvent[]> {
  return page.evaluate(() => window.__patch100Events ?? []);
}

async function readPreviewImageSources(modal: ReturnType<Page['locator']>): Promise<string[]> {
  return modal.locator('img[alt="Slide"], img[alt="Slide preview"]').evaluateAll((images) =>
    images
      .map((image) => image.getAttribute('src') ?? '')
      .filter((src) => src.startsWith('data:image/png;base64,')),
  );
}

async function openPreviewModal(page: Page) {
  await page.getByTitle('Present Frames').click({ force: true });
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(sidebar.getByText('Slides (1)', { exact: true })).toBeVisible({ timeout: 90_000 });
  const slideRow = sidebar.getByText('PATCH-100 AI Snapshot', { exact: true }).locator('xpath=ancestor::div[contains(@class, "group")][1]');
  const slideMenuButton = slideRow.locator('xpath=.//button').last();
  await slideMenuButton.click({ force: true });
  await sidebar.getByRole('button', { name: 'Preview slide', exact: true }).click({ force: true });

  const modal = page.locator('.fixed.inset-0.z-\\[800\\]').first();
  await expect(modal.getByText('PATCH-100 AI Snapshot', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  return modal;
}

async function cleanupAndAssert(supabase: SupabaseClient, fixture: DrawingFixture): Promise<CleanupCounts> {
  await cleanupDrawingFixture(supabase, fixture);
  return assertDrawingFixtureCleanup(supabase, fixture);
}

async function cleanupAndAssertBounded(supabase: SupabaseClient, fixture: DrawingFixture): Promise<CleanupCounts> {
  return Promise.race([
    cleanupAndAssert(supabase, fixture),
    new Promise<CleanupCounts>((_, reject) => {
      setTimeout(() => reject(new Error('PATCH-100 cleanup timed out')), 60_000);
    }),
  ]);
}

test.describe('presentation snapshot AI component rendering (PATCH-100)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('observes synchronous AI component commits before Preview modal capture', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-100-ai-snapshot-render');
    const seeded = await seedSnapshotAIComponentSlide(supabase, fixture);
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      await test.step('open drawing board and install buffered snapshot listener', async () => {
        await openDrawingBoard(page, fixture.boardId);
        await installSnapshotEventBuffer(page);
      });

      const modal = await test.step('open the existing Preview modal', async () => openPreviewModal(page));

      await test.step('observe AI snapshot render events and populated preview image', async () => {
        await expect.poll(() => readSnapshotEvents(page), {
          timeout: 90_000,
          message: 'snapshot AI branch events are buffered before capture completes',
        }).toEqual(expect.arrayContaining([
          expect.objectContaining({ padletId: seeded.directAiId, kind: 'structured' }),
          expect.objectContaining({ padletId: seeded.nestedAiId, kind: 'structured' }),
          expect.objectContaining({ padletId: seeded.legacyAiId, kind: 'legacy_html' }),
        ]));

        await expect.poll(() => readPreviewImageSources(modal), {
          timeout: 90_000,
          message: 'Preview modal exposes a populated snapshot image',
        }).not.toEqual([]);
        await expect(modal.getByTitle('Resize')).toHaveCount(0);
        await expect(modal.getByText('Edit', { exact: true })).toHaveCount(0);
        await expect(modal.getByText('Convert', { exact: true })).toHaveCount(0);
        await expect(modal.getByText(EMPTY_FALLBACK, { exact: true })).toHaveCount(0);
      });

      const events = await readSnapshotEvents(page);
      cleanupCounts = await test.step('cleanup reaches zero', async () => cleanupAndAssertBounded(supabase, fixture));
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });

      test.info().annotations.push({
        type: ANNOTATION,
        description: JSON.stringify({
          boardPrefix: fixture.prefix,
          seeded,
          listenerRegisteredBeforePreviewOpen: true,
          snapshotEvents: events,
          assertions: {
            directStructuredObserved: true,
            nestedStructuredObservedViaSingleChildContainerFallback: true,
            legacyHTMLObserved: true,
            nonAIControlSeeded: NOTE_MARKER,
            previewImagePopulated: true,
            resizeHandleExposed: false,
            editorOnlyControlsExposed: false,
            emptyFallbackForValidAI: false,
          },
          cleanupCounts,
          finalClassification: FINAL_CLASSIFICATION,
        }),
      });
    } finally {
      if (cleanupCounts.boards !== 0) {
        await expect(cleanupAndAssertBounded(supabase, fixture)).resolves.toEqual({
          boards: 0,
          padlets: 0,
          canvasLines: 0,
        });
      }
    }
  });
});
