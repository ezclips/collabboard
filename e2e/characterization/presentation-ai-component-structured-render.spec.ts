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

const ANNOTATION = 'patch-099-presentation-ai-component-structured-render-evidence' as const;
const DIRECT_STRUCTURED_MARKER = 'PATCH-099 direct structured flowchart marker';
const NESTED_STRUCTURED_MARKER = 'PATCH-099 nested structured flowchart marker';
const LEGACY_HTML_MARKER = 'PATCH-099 legacy saved HTML marker';
const GENERIC_FALLBACK_MARKER = 'PATCH-099 generic fallback should not render';
const FINAL_CLASSIFICATION = 'runtime-ai-component-structured-render-consistent' as const;

registerDrawingCleanup(test);

type Json = Record<string, unknown>;

type SeededStructuredRuntimeAI = {
  frameId: string;
  directAiId: string;
  nestedContainerId: string;
  nestedAiId: string;
  legacyAiId: string;
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

function structuredFlowchartEnvelope(marker: string) {
  return serializeAIContentEnvelope({
    mode: 'diagram',
    data: {
      type: 'diagram',
      subtype: 'flowchart',
      title: marker,
      renderer: 'diagram_code',
      code: [
        'flowchart TD',
        `  A["${marker} start"] --> B["${marker} rendered"]`,
      ].join('\n'),
      explanation: marker,
    },
    meta: {
      renderer: 'diagram_code',
      subtype: 'flowchart',
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

async function seedStructuredRuntimeAIComponentSlide(
  supabase: SupabaseClient,
  fixture: DrawingFixture,
): Promise<SeededStructuredRuntimeAI> {
  const frameId = 'patch-099-ai-structured-runtime-frame';
  const directAiId = crypto.randomUUID();
  const nestedContainerId = crypto.randomUUID();
  const nestedAiId = crypto.randomUUID();
  const legacyAiId = crypto.randomUUID();

  const directEnvelope = structuredFlowchartEnvelope(DIRECT_STRUCTURED_MARKER);
  const nestedEnvelope = structuredFlowchartEnvelope(NESTED_STRUCTURED_MARKER);

  const { error } = await supabase.from('padlets').insert([
    {
      id: directAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} direct structured AI`,
      content: GENERIC_FALLBACK_MARKER,
      type: 'ai-component',
      position_x: 80,
      position_y: 100,
      width: 390,
      height: 260,
      metadata: {
        patch064Harness: true,
        aiComponentJson: directEnvelope,
      },
    },
    {
      id: nestedContainerId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} structured container`,
      content: '',
      type: 'container',
      position_x: 510,
      position_y: 100,
      width: 430,
      height: 330,
      metadata: {
        patch064Harness: true,
        childPadletIds: [nestedAiId],
      },
    },
    {
      id: nestedAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} nested structured AI`,
      content: GENERIC_FALLBACK_MARKER,
      type: 'ai-component',
      position_x: 0,
      position_y: 0,
      width: 370,
      height: 250,
      metadata: {
        patch064Harness: true,
        parentId: nestedContainerId,
        containerIndex: 0,
        aiComponentJson: nestedEnvelope,
      },
    },
    {
      id: legacyAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} legacy AI`,
      content: GENERIC_FALLBACK_MARKER,
      type: 'ai-component',
      position_x: 80,
      position_y: 410,
      width: 360,
      height: 220,
      metadata: {
        patch064Harness: true,
        savedAIComponent: {
          code: `<section data-patch-099="legacy">${LEGACY_HTML_MARKER}</section>`,
        },
      },
    },
  ]);
  if (error) throw error;

  fixture.containerIds.push(nestedContainerId);
  fixture.childIds.push(directAiId, nestedAiId, legacyAiId);
  fixture.frameIds.push(frameId);

  await insertMasterPadlet(supabase, fixture, [
    frameElement(frameId, 'PATCH-099 Structured AI Runtime', 0, 0, 1280, 720),
    embeddableElement('patch-099-direct-structured-ai-embeddable', directAiId, 80, 100, 390, 260, frameId),
    embeddableElement('patch-099-container-embeddable', nestedContainerId, 510, 100, 430, 330, frameId),
    embeddableElement('patch-099-legacy-ai-embeddable', legacyAiId, 80, 410, 360, 220, frameId),
  ]);

  return {
    frameId,
    directAiId,
    nestedContainerId,
    nestedAiId,
    legacyAiId,
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

function metadataRecord(value: unknown): Json {
  return typeof value === 'object' && value !== null ? value as Json : {};
}

test.describe('runtime presentation structured AI component rendering (PATCH-099)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('renders structured direct and nested AI content while preserving legacy HTML in the runtime player', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-099-ai-structured-render');
    const seeded = await seedStructuredRuntimeAIComponentSlide(supabase, fixture);
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      const { data: seededRows, error: seededRowsError } = await supabase
        .from('padlets')
        .select('id, metadata')
        .in('id', [seeded.directAiId, seeded.nestedAiId, seeded.legacyAiId]);
      if (seededRowsError) throw seededRowsError;

      const metadataById = new Map((seededRows ?? []).map((row) => [row.id, metadataRecord(row.metadata)]));
      expect(metadataById.get(seeded.directAiId)?.aiComponentJson).toMatchObject({
        mode: 'diagram',
        version: 1,
        data: {
          type: 'diagram',
          subtype: 'flowchart',
          title: DIRECT_STRUCTURED_MARKER,
        },
        meta: {
          renderer: 'diagram_code',
          subtype: 'flowchart',
        },
      });
      expect(metadataById.get(seeded.nestedAiId)?.aiComponentJson).toMatchObject({
        mode: 'diagram',
        version: 1,
        data: {
          type: 'diagram',
          subtype: 'flowchart',
          title: NESTED_STRUCTURED_MARKER,
        },
      });
      expect(metadataById.get(seeded.directAiId)?.savedAIComponent).toBeUndefined();
      expect(metadataById.get(seeded.nestedAiId)?.savedAIComponent).toBeUndefined();
      expect(metadataById.get(seeded.legacyAiId)?.aiComponentJson).toBeUndefined();

      await openDrawingBoard(page, fixture.boardId);
      await expect(
        page.locator(`[data-padlet-id="${seeded.directAiId}"]`).getByText(DIRECT_STRUCTURED_MARKER, { exact: true }).first(),
      ).toBeVisible({ timeout: 90_000 });

      const fullscreen = await openRuntimePresentation(page);

      await expect(fullscreen.getByText(DIRECT_STRUCTURED_MARKER, { exact: true }).first()).toBeVisible({ timeout: 90_000 });
      await expect(fullscreen.getByText(NESTED_STRUCTURED_MARKER, { exact: true }).first()).toBeVisible({ timeout: 90_000 });
      await expect(fullscreen.getByText(LEGACY_HTML_MARKER, { exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(fullscreen.getByText(GENERIC_FALLBACK_MARKER, { exact: true })).toHaveCount(0);
      await expect(fullscreen.getByTitle('Resize')).toHaveCount(0);
      await expect(fullscreen.getByText('Export', { exact: true })).toHaveCount(0);

      cleanupCounts = await cleanupAndAssert(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });

      test.info().annotations.push({
        type: ANNOTATION,
        description: JSON.stringify({
          boardPrefix: fixture.prefix,
          seeded,
          editorModeControl: {
            directStructuredMarkerVisible: true,
          },
          runtimeAssertions: {
            directStructuredEnvelopeVisible: true,
            nestedStructuredEnvelopeVisibleViaRuntimeContainerChildCard: true,
            legacySavedHTMLStillVisible: true,
            genericFallbackSuppressedForStructuredAndLegacyAI: true,
            resizeHandleExposed: false,
            exportControlExposed: false,
          },
          structuredFormat: {
            mode: 'diagram',
            version: 1,
            dataType: 'diagram',
            subtype: 'flowchart',
            metadataField: 'aiComponentJson',
          },
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
