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

const LABEL_PREFIX = 'patch-101-diagram-readiness' as const;
const NOTE_MARKER = 'PATCH-101 non-AI snapshot control';
const LESSON_MARKER = 'PATCH-101 synchronous lesson snapshot marker';
const LEGACY_MARKER = 'PATCH-101 legacy html snapshot marker';

registerDrawingCleanup(test);

type Json = Record<string, unknown>;

type SnapshotRenderedEvent = {
  padletId: string;
  kind: string;
};

type SnapshotWaitEvent = {
  waitedMs: number;
  timedOut: boolean;
  pendingCount: number;
};

type SeededSlide = {
  frameId: string;
  slideTitle: string;
  aiIds: string[];
  noteId: string;
};

declare global {
  interface Window {
    __patch100Events?: SnapshotRenderedEvent[];
    __patch101WaitEvents?: SnapshotWaitEvent[];
    __patch101TimeoutOverrideMs?: number;
    __patch101DiagramRenderHoldMs?: number;
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

function notePadlet(id: string, fixture: DrawingFixture) {
  return {
    id,
    board_id: fixture.boardId,
    title: `${fixture.prefix} note`,
    content: NOTE_MARKER,
    type: 'note',
    position_x: 640,
    position_y: 100,
    width: 260,
    height: 170,
    metadata: { patch064Harness: true },
  };
}

function lessonEnvelope(marker = LESSON_MARKER) {
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
      createdAt: '2026-07-22T00:00:00.000Z',
    },
  });
}

function flowchartEnvelope(marker: string, stepCount = 36) {
  const code = [
    'flowchart TD',
    '  start([Start]) --> step01[Collect prompt]',
    ...Array.from({ length: stepCount }, (_, index) => {
      const current = String(index + 1).padStart(2, '0');
      const next = String(index + 2).padStart(2, '0');
      return `  step${current} --> step${next}[Render branch ${next}]`;
    }),
    `  step${String(stepCount + 1).padStart(2, '0')} --> done([Done])`,
  ].join('\n');

  return serializeAIContentEnvelope({
    mode: 'diagram',
    data: {
      type: 'diagram',
      subtype: 'flowchart',
      renderer: 'diagram_code',
      title: marker,
      code,
      explanation: marker,
    },
    meta: {
      renderer: 'diagram_code',
      subtype: 'flowchart',
      prompt: marker,
      createdAt: '2026-07-22T00:00:00.000Z',
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

async function seedNoAsyncSlide(supabase: SupabaseClient, fixture: DrawingFixture): Promise<SeededSlide> {
  const frameId = 'patch-101-no-async-frame';
  const lessonId = crypto.randomUUID();
  const noteId = crypto.randomUUID();
  const slideTitle = 'PATCH-101 No Async Snapshot';

  const { error } = await supabase.from('padlets').insert([
    {
      id: lessonId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} synchronous lesson`,
      content: '',
      type: 'ai-component',
      position_x: 80,
      position_y: 90,
      width: 420,
      height: 260,
      metadata: {
        patch064Harness: true,
        aiComponentJson: lessonEnvelope(),
      },
    },
    notePadlet(noteId, fixture),
  ]);
  if (error) throw error;

  fixture.childIds.push(lessonId, noteId);
  fixture.frameIds.push(frameId);

  await insertMasterPadlet(supabase, fixture, [
    frameElement(frameId, slideTitle, 0, 0, 1280, 720),
    embeddableElement('patch-101-no-async-lesson', lessonId, 80, 90, 420, 260, frameId),
    embeddableElement('patch-101-no-async-note', noteId, 640, 100, 260, 170, frameId),
  ]);

  return { frameId, slideTitle, aiIds: [lessonId], noteId };
}

async function seedDiagramSlide(
  supabase: SupabaseClient,
  fixture: DrawingFixture,
  slideTitle: string,
  stepCount = 36,
): Promise<SeededSlide> {
  const frameId = `patch-101-diagram-frame-${crypto.randomUUID()}`;
  const diagramId = crypto.randomUUID();
  const noteId = crypto.randomUUID();

  const { error } = await supabase.from('padlets').insert([
    {
      id: diagramId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} mermaid diagram`,
      content: '',
      type: 'ai-component',
      position_x: 80,
      position_y: 70,
      width: 600,
      height: 520,
      metadata: {
        patch064Harness: true,
        aiComponentJson: flowchartEnvelope(slideTitle, stepCount),
      },
    },
    notePadlet(noteId, fixture),
  ]);
  if (error) throw error;

  fixture.childIds.push(diagramId, noteId);
  fixture.frameIds.push(frameId);

  await insertMasterPadlet(supabase, fixture, [
    frameElement(frameId, slideTitle, 0, 0, 1280, 720),
    embeddableElement(`patch-101-diagram-${diagramId}`, diagramId, 80, 70, 600, 520, frameId),
    embeddableElement(`patch-101-note-${noteId}`, noteId, 760, 90, 260, 170, frameId),
  ]);

  return { frameId, slideTitle, aiIds: [diagramId], noteId };
}

async function seedPatch100SynchronousSlide(supabase: SupabaseClient, fixture: DrawingFixture): Promise<SeededSlide> {
  const frameId = 'patch-101-patch-100-sync-frame';
  const directAiId = crypto.randomUUID();
  const legacyAiId = crypto.randomUUID();
  const noteId = crypto.randomUUID();
  const slideTitle = 'PATCH-101 PATCH-100 Sync Snapshot';

  const { error } = await supabase.from('padlets').insert([
    {
      id: directAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} patch100 structured`,
      content: '',
      type: 'ai-component',
      position_x: 80,
      position_y: 80,
      width: 420,
      height: 250,
      metadata: {
        patch064Harness: true,
        aiComponentJson: lessonEnvelope('PATCH-101 carried PATCH-100 structured marker'),
      },
    },
    {
      id: legacyAiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} patch100 legacy`,
      content: '',
      type: 'ai-component',
      position_x: 80,
      position_y: 380,
      width: 360,
      height: 190,
      metadata: {
        patch064Harness: true,
        savedAIComponent: {
          code: `<section data-patch-101-carried-patch-100="legacy">${LEGACY_MARKER}</section>`,
        },
      },
    },
    notePadlet(noteId, fixture),
  ]);
  if (error) throw error;

  fixture.childIds.push(directAiId, legacyAiId, noteId);
  fixture.frameIds.push(frameId);

  await insertMasterPadlet(supabase, fixture, [
    frameElement(frameId, slideTitle, 0, 0, 1280, 720),
    embeddableElement('patch-101-patch100-structured', directAiId, 80, 80, 420, 250, frameId),
    embeddableElement('patch-101-patch100-legacy', legacyAiId, 80, 380, 360, 190, frameId),
    embeddableElement('patch-101-patch100-note', noteId, 650, 100, 260, 170, frameId),
  ]);

  return { frameId, slideTitle, aiIds: [directAiId, legacyAiId], noteId };
}

async function installSnapshotEventBuffers(page: Page) {
  await page.evaluate(() => {
    window.__patch100Events = [];
    window.__patch101WaitEvents = [];
    window.addEventListener('collabboard-ai-snapshot-rendered', (event) => {
      const detail = (event as CustomEvent<SnapshotRenderedEvent>).detail;
      window.__patch100Events?.push({
        padletId: detail.padletId,
        kind: detail.kind,
      });
    });
    window.addEventListener('collabboard-ai-snapshot-capture-wait', (event) => {
      const detail = (event as CustomEvent<SnapshotWaitEvent>).detail;
      window.__patch101WaitEvents?.push({
        waitedMs: detail.waitedMs,
        timedOut: detail.timedOut,
        pendingCount: detail.pendingCount,
      });
    });
  });
}

async function readSnapshotEvents(page: Page): Promise<SnapshotRenderedEvent[]> {
  return page.evaluate(() => window.__patch100Events ?? []);
}

async function readWaitEvents(page: Page): Promise<SnapshotWaitEvent[]> {
  return page.evaluate(() => window.__patch101WaitEvents ?? []);
}

async function waitForBufferedWaitEvents(page: Page): Promise<SnapshotWaitEvent[]> {
  await expect.poll(() => readWaitEvents(page), {
    timeout: 90_000,
    message: 'snapshot capture wait events are buffered before capture completes',
  }).not.toEqual([]);
  return readWaitEvents(page);
}

async function readPreviewImageSources(modal: ReturnType<Page['locator']>): Promise<string[]> {
  return modal.locator('img[alt="Slide"], img[alt="Slide preview"]').evaluateAll((images) =>
    images
      .map((image) => image.getAttribute('src') ?? '')
      .filter((src) => src.startsWith('data:image/png;base64,')),
  );
}

async function openPreviewModal(page: Page, slideTitle: string) {
  await page.getByTitle('Present Frames').click({ force: true });
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(sidebar.getByText('Slides (1)', { exact: true })).toBeVisible({ timeout: 90_000 });
  const slideRow = sidebar.getByText(slideTitle, { exact: true }).locator('xpath=ancestor::div[contains(@class, "group")][1]');
  const slideMenuButton = slideRow.locator('xpath=.//button').last();
  await slideMenuButton.click({ force: true });
  await sidebar.getByRole('button', { name: 'Preview slide', exact: true }).click({ force: true });

  const modal = page.locator('.fixed.inset-0.z-\\[800\\]').first();
  await expect(modal.getByText(slideTitle, { exact: true }).first()).toBeVisible({ timeout: 90_000 });
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
      setTimeout(() => reject(new Error('PATCH-101 cleanup timed out')), 60_000);
    }),
  ]);
}

async function createSeededBoard(
  page: Page,
  label: string,
  seed: (supabase: SupabaseClient, fixture: DrawingFixture) => Promise<SeededSlide>,
) {
  const { supabase, fixture } = await createDisposableDrawingBoard(`${LABEL_PREFIX}-${label}`);
  const seeded = await seed(supabase, fixture);
  await openDrawingBoard(page, fixture.boardId);
  await installSnapshotEventBuffers(page);
  return { supabase, fixture, seeded };
}

test.describe('presentation snapshot Mermaid readiness (PATCH-101)', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('captures synchronous AI content without entering the bounded poll loop', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture, seeded } = await createSeededBoard(page, 'no-async', seedNoAsyncSlide);
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      const modal = await openPreviewModal(page, seeded.slideTitle);

      const waitEvents = await waitForBufferedWaitEvents(page);
      expect(waitEvents.every((event) => (
        event.waitedMs === 0
        && event.timedOut === false
        && event.pendingCount === 0
      ))).toBe(true);
      await expect.poll(() => readPreviewImageSources(modal), {
        timeout: 90_000,
        message: 'Preview modal exposes a populated snapshot image',
      }).not.toEqual([]);

      cleanupCounts = await cleanupAndAssertBounded(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
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

  test('waits for Mermaid readiness before the normal snapshot capture timeout', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture, seeded } = await createSeededBoard(page, 'ready-before-timeout', (client, board) =>
      seedDiagramSlide(client, board, 'PATCH-101 Mermaid Ready Before Timeout'),
    );
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      const modal = await openPreviewModal(page, seeded.slideTitle);

      await expect.poll(async () => {
        const events = await readWaitEvents(page);
        return events.some((event) => (
          event.timedOut === false
          && event.pendingCount === 0
          && event.waitedMs > 0
        ));
      }, {
        timeout: 90_000,
        message: 'ready-before-timeout wait event is buffered before capture completes',
      }).toBe(true);
      const waitEvents = await readWaitEvents(page);
      const waitEvent = waitEvents.find((event) => (
        event.timedOut === false
        && event.pendingCount === 0
        && event.waitedMs > 0
      ));
      expect(waitEvent).toBeDefined();
      if (!waitEvent) throw new Error('PATCH-101 ready-before-timeout wait event missing');
      expect(waitEvent.timedOut).toBe(false);
      expect(waitEvent.pendingCount).toBe(0);
      expect(waitEvent.waitedMs).toBeGreaterThan(0);
      expect(waitEvent.waitedMs).toBeLessThan(3000);
      await expect.poll(() => readPreviewImageSources(modal), {
        timeout: 90_000,
        message: 'Preview modal exposes a populated snapshot image',
      }).not.toEqual([]);

      cleanupCounts = await cleanupAndAssertBounded(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
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

  test('proceeds with capture on the deterministic forced timeout path', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture, seeded } = await createSeededBoard(page, 'forced-timeout', (client, board) =>
      seedDiagramSlide(client, board, 'PATCH-101 Mermaid Forced Timeout', 180),
    );
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      await page.evaluate(() => {
        window.__patch101TimeoutOverrideMs = 50;
        window.__patch101DiagramRenderHoldMs = 5000;
      });
      const modal = await openPreviewModal(page, seeded.slideTitle);

      await expect.poll(async () => {
        const events = await readWaitEvents(page);
        return events.some((event) => event.timedOut === true);
      }, {
        timeout: 90_000,
        message: 'forced-timeout wait event is buffered before capture completes',
      }).toBe(true);
      const waitEvents = await readWaitEvents(page);
      const waitEvent = waitEvents.find((event) => event.timedOut === true);
      expect(waitEvent).toBeDefined();
      if (!waitEvent) throw new Error('PATCH-101 forced-timeout wait event missing');
      expect(waitEvent.timedOut).toBe(true);
      expect(waitEvent.pendingCount).toBeGreaterThan(0);
      expect(waitEvent.waitedMs).toBeGreaterThanOrEqual(50);
      expect(waitEvent.waitedMs).toBeLessThan(30_000);
      await expect.poll(() => readPreviewImageSources(modal), {
        timeout: 90_000,
        message: 'Preview modal still exposes a populated snapshot image after timeout',
      }).not.toEqual([]);

      cleanupCounts = await cleanupAndAssertBounded(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    } finally {
      await page.evaluate(() => {
        delete window.__patch101TimeoutOverrideMs;
        delete window.__patch101DiagramRenderHoldMs;
      }).catch(() => undefined);
      if (cleanupCounts.boards !== 0) {
        await expect(cleanupAndAssertBounded(supabase, fixture)).resolves.toEqual({
          boards: 0,
          padlets: 0,
          canvasLines: 0,
        });
      }
    }
  });

  test('keeps PATCH-100 synchronous AI snapshot behavior intact', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture, seeded } = await createSeededBoard(page, 'patch-100-sync', seedPatch100SynchronousSlide);
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      const modal = await openPreviewModal(page, seeded.slideTitle);

      await expect.poll(() => readSnapshotEvents(page), {
        timeout: 90_000,
        message: 'PATCH-100 snapshot render events are still buffered before capture completes',
      }).toEqual(expect.arrayContaining([
        expect.objectContaining({ padletId: seeded.aiIds[0], kind: 'structured' }),
        expect.objectContaining({ padletId: seeded.aiIds[1], kind: 'legacy_html' }),
      ]));
      const waitEvents = await waitForBufferedWaitEvents(page);
      expect(waitEvents.every((event) => (
        event.waitedMs === 0
        && event.timedOut === false
        && event.pendingCount === 0
      ))).toBe(true);
      await expect.poll(() => readPreviewImageSources(modal), {
        timeout: 90_000,
        message: 'Preview modal exposes a populated snapshot image',
      }).not.toEqual([]);

      cleanupCounts = await cleanupAndAssertBounded(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
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
