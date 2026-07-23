import { expect, test, type Page, type Route } from '@playwright/test';
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

const LABEL_PREFIX = 'patch-102-image-readiness' as const;
const NOTE_MARKER = 'PATCH-102 non-AI snapshot control';
const DATA_URI_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const SYNTHETIC_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mP8z8BQz0AEYBxVSFUBAE6DBBC8LEUyAAAAAElFTkSuQmCC',
  'base64',
);

registerDrawingCleanup(test);

type Json = Record<string, unknown>;

type SnapshotWaitEvent = {
  waitedMs: number;
  timedOut: boolean;
  pendingCount: number;
};

type SeededSlide = {
  frameId: string;
  slideTitle: string;
  aiId: string;
  noteId: string;
};

declare global {
  interface Window {
    __patch102WaitEvents?: SnapshotWaitEvent[];
    __patch101TimeoutOverrideMs?: number;
  }
}

let fixtureElementIndexCounter = 0;

function nextFixtureFractionalIndex(): string {
  fixtureElementIndexCounter += 1;
  return `a${String(fixtureElementIndexCounter).padStart(6, '0')}`;
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
    index: nextFixtureFractionalIndex(),
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

function legacyImageHtml(marker: string, imageSrc?: string) {
  const image = imageSrc
    ? `<img src="${imageSrc}" alt="${marker} image" />`
    : '';
  return `<section data-patch-102-marker="${marker}"><h2>${marker}</h2>${image}<p>${marker} body</p></section>`;
}

function flowchartEnvelope(marker: string) {
  return serializeAIContentEnvelope({
    mode: 'diagram',
    data: {
      type: 'diagram',
      subtype: 'flowchart',
      renderer: 'diagram_code',
      title: marker,
      code: [
        'flowchart TD',
        '  start([Start]) --> image[Legacy image selector]',
        '  image --> done([Done])',
      ].join('\n'),
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

async function seedLegacyHtmlSlide(
  supabase: SupabaseClient,
  fixture: DrawingFixture,
  slideTitle: string,
  html: string,
): Promise<SeededSlide> {
  const frameId = `patch-102-frame-${crypto.randomUUID()}`;
  const aiId = crypto.randomUUID();
  const noteId = crypto.randomUUID();

  const { error } = await supabase.from('padlets').insert([
    {
      id: aiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} legacy html`,
      content: '',
      type: 'ai-component',
      position_x: 80,
      position_y: 70,
      width: 520,
      height: 360,
      metadata: {
        patch064Harness: true,
        savedAIComponent: { code: html },
      },
    },
    notePadlet(noteId, fixture),
  ]);
  if (error) throw error;

  fixture.childIds.push(aiId, noteId);
  fixture.frameIds.push(frameId);

  await insertMasterPadlet(supabase, fixture, [
    frameElement(frameId, slideTitle, 0, 0, 1280, 720),
    embeddableElement(`patch-102-ai-${aiId}`, aiId, 80, 70, 520, 360, frameId),
    embeddableElement(`patch-102-note-${noteId}`, noteId, 700, 100, 260, 170, frameId),
  ]);

  return { frameId, slideTitle, aiId, noteId };
}

async function seedMermaidSlide(
  supabase: SupabaseClient,
  fixture: DrawingFixture,
): Promise<SeededSlide> {
  const frameId = `patch-102-mermaid-frame-${crypto.randomUUID()}`;
  const aiId = crypto.randomUUID();
  const noteId = crypto.randomUUID();
  const slideTitle = 'PATCH-102 Mermaid Carry';

  const { error } = await supabase.from('padlets').insert([
    {
      id: aiId,
      board_id: fixture.boardId,
      title: `${fixture.prefix} mermaid`,
      content: '',
      type: 'ai-component',
      position_x: 80,
      position_y: 70,
      width: 560,
      height: 420,
      metadata: {
        patch064Harness: true,
        aiComponentJson: flowchartEnvelope(slideTitle),
      },
    },
    notePadlet(noteId, fixture),
  ]);
  if (error) throw error;

  fixture.childIds.push(aiId, noteId);
  fixture.frameIds.push(frameId);

  await insertMasterPadlet(supabase, fixture, [
    frameElement(frameId, slideTitle, 0, 0, 1280, 720),
    embeddableElement(`patch-102-mermaid-${aiId}`, aiId, 80, 70, 560, 420, frameId),
    embeddableElement(`patch-102-mermaid-note-${noteId}`, noteId, 720, 100, 260, 170, frameId),
  ]);

  return { frameId, slideTitle, aiId, noteId };
}

async function installSnapshotWaitBuffer(page: Page) {
  await page.evaluate(() => {
    window.__patch102WaitEvents = [];
    window.addEventListener('collabboard-ai-snapshot-capture-wait', (event) => {
      const detail = (event as CustomEvent<SnapshotWaitEvent>).detail;
      window.__patch102WaitEvents?.push({
        waitedMs: detail.waitedMs,
        timedOut: detail.timedOut,
        pendingCount: detail.pendingCount,
      });
    });
  });
}

async function readWaitEvents(page: Page): Promise<SnapshotWaitEvent[]> {
  return page.evaluate(() => window.__patch102WaitEvents ?? []);
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
      setTimeout(() => reject(new Error('PATCH-102 cleanup timed out')), 60_000);
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
  await installSnapshotWaitBuffer(page);
  return { supabase, fixture, seeded };
}

async function expectPreviewCaptureCompletes(modal: ReturnType<Page['locator']>) {
  await expect.poll(() => readPreviewImageSources(modal), {
    timeout: 90_000,
    message: 'Preview modal exposes a populated snapshot image',
  }).not.toEqual([]);
}

async function fulfillSyntheticPngAfterDelay(route: Route, delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: SYNTHETIC_PNG,
  });
}

test.describe('presentation snapshot legacy image readiness (PATCH-102)', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('captures legacy HTML with no image without entering the bounded poll loop', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture, seeded } = await createSeededBoard(page, 'no-image', (client, board) =>
      seedLegacyHtmlSlide(client, board, 'PATCH-102 No Legacy Image', legacyImageHtml('PATCH-102 no image')),
    );
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      const modal = await openPreviewModal(page, seeded.slideTitle);
      const waitEvents = await waitForBufferedWaitEvents(page);
      expect(waitEvents.every((event) => event.waitedMs === 0 && event.timedOut === false && event.pendingCount === 0)).toBe(true);
      await expectPreviewCaptureCompletes(modal);

      cleanupCounts = await cleanupAndAssertBounded(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    } finally {
      if (cleanupCounts.boards !== 0) {
        await expect(cleanupAndAssertBounded(supabase, fixture)).resolves.toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
      }
    }
  });

  test('captures an already-complete legacy HTML image without meaningful wait', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture, seeded } = await createSeededBoard(page, 'cached-image', (client, board) =>
      seedLegacyHtmlSlide(client, board, 'PATCH-102 Cached Image', legacyImageHtml('PATCH-102 cached image', DATA_URI_PNG)),
    );
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      const modal = await openPreviewModal(page, seeded.slideTitle);
      const waitEvents = await waitForBufferedWaitEvents(page);
      expect(waitEvents.every((event) => event.timedOut === false && event.pendingCount === 0 && event.waitedMs < 500)).toBe(true);
      await expectPreviewCaptureCompletes(modal);

      cleanupCounts = await cleanupAndAssertBounded(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    } finally {
      if (cleanupCounts.boards !== 0) {
        await expect(cleanupAndAssertBounded(supabase, fixture)).resolves.toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
      }
    }
  });

  test('waits for a delayed legacy HTML image load before capture', async ({ page }) => {
    test.setTimeout(300_000);

    const imageUrl = 'https://patch-102.test/delayed.png';
    let requestCount = 0;
    const inFlightHandlers = new Set<Promise<void>>();
    const handleDelayedImageRoute = (route: Route): Promise<void> => {
      requestCount += 1;

      const handlerPromise = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: SYNTHETIC_PNG,
        });
      })();

      inFlightHandlers.add(handlerPromise);
      void handlerPromise.finally(() => {
        inFlightHandlers.delete(handlerPromise);
      });

      return handlerPromise;
    };

    await page.route(imageUrl, handleDelayedImageRoute);
    const { supabase, fixture, seeded } = await createSeededBoard(page, 'delayed-image', (client, board) =>
      seedLegacyHtmlSlide(client, board, 'PATCH-102 Delayed Image', legacyImageHtml('PATCH-102 delayed image', imageUrl)),
    );
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      const modal = await openPreviewModal(page, seeded.slideTitle);

      await expect.poll(async () => {
        const events = await readWaitEvents(page);
        return events.some((event) => event.waitedMs > 0 && event.timedOut === false && event.pendingCount === 0);
      }, {
        timeout: 90_000,
        message: 'delayed-image wait event observes settlement before timeout',
      }).toBe(true);
      const waitEvent = (await readWaitEvents(page)).find((event) => event.waitedMs > 0 && event.timedOut === false && event.pendingCount === 0);
      expect(waitEvent).toBeDefined();
      expect(waitEvent?.waitedMs).toBeLessThan(3000);
      await expectPreviewCaptureCompletes(modal);
      expect(requestCount).toBeGreaterThanOrEqual(1);

      cleanupCounts = await cleanupAndAssertBounded(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    } finally {
      const handlerResults = await Promise.allSettled([...inFlightHandlers]);
      const rejectedHandler = handlerResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (rejectedHandler) {
        throw rejectedHandler.reason;
      }
      await page.unroute(imageUrl).catch(() => undefined);
      if (cleanupCounts.boards !== 0) {
        await expect(cleanupAndAssertBounded(supabase, fixture)).resolves.toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
      }
    }
  });

  test('treats a legacy HTML image error as settled and still captures', async ({ page }) => {
    test.setTimeout(300_000);

    const imageUrl = 'https://patch-102.test/error.png';
    await page.route(imageUrl, (route) => route.abort('failed'));
    const { supabase, fixture, seeded } = await createSeededBoard(page, 'image-error', (client, board) =>
      seedLegacyHtmlSlide(client, board, 'PATCH-102 Image Error', legacyImageHtml('PATCH-102 image error', imageUrl)),
    );
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      const modal = await openPreviewModal(page, seeded.slideTitle);
      const waitEvents = await waitForBufferedWaitEvents(page);
      expect(waitEvents.every((event) => event.timedOut === false && event.pendingCount === 0)).toBe(true);
      await expectPreviewCaptureCompletes(modal);

      cleanupCounts = await cleanupAndAssertBounded(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    } finally {
      await page.unroute(imageUrl).catch(() => undefined);
      if (cleanupCounts.boards !== 0) {
        await expect(cleanupAndAssertBounded(supabase, fixture)).resolves.toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
      }
    }
  });

  test('proceeds with capture when a legacy HTML image exceeds the forced timeout', async ({ page }) => {
    test.setTimeout(300_000);

    const imageUrl = 'https://patch-102.test/timeout.png';
    await page.route(imageUrl, (route) => fulfillSyntheticPngAfterDelay(route, 2000));
    const { supabase, fixture, seeded } = await createSeededBoard(page, 'forced-timeout', (client, board) =>
      seedLegacyHtmlSlide(client, board, 'PATCH-102 Forced Timeout', legacyImageHtml('PATCH-102 forced timeout', imageUrl)),
    );
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      await page.evaluate(() => {
        window.__patch101TimeoutOverrideMs = 100;
      });
      const modal = await openPreviewModal(page, seeded.slideTitle);

      await expect.poll(async () => {
        const events = await readWaitEvents(page);
        return events.some((event) => event.timedOut === true && event.pendingCount > 0);
      }, {
        timeout: 90_000,
        message: 'forced-timeout wait event observes pending image fallback',
      }).toBe(true);
      const waitEvent = (await readWaitEvents(page)).find((event) => event.timedOut === true && event.pendingCount > 0);
      expect(waitEvent).toBeDefined();
      expect(waitEvent?.waitedMs).toBeGreaterThanOrEqual(100);
      expect(waitEvent?.waitedMs).toBeLessThan(30_000);
      await expectPreviewCaptureCompletes(modal);

      cleanupCounts = await cleanupAndAssertBounded(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    } finally {
      await page.evaluate(() => {
        delete window.__patch101TimeoutOverrideMs;
      }).catch(() => undefined);
      await page.unroute(imageUrl).catch(() => undefined);
      if (cleanupCounts.boards !== 0) {
        await expect(cleanupAndAssertBounded(supabase, fixture)).resolves.toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
      }
    }
  });

  test('keeps Mermaid readiness covered by the combined selector', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture, seeded } = await createSeededBoard(page, 'mermaid-carry', seedMermaidSlide);
    let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };

    try {
      const modal = await openPreviewModal(page, seeded.slideTitle);
      await expect.poll(async () => {
        const events = await readWaitEvents(page);
        return events.some((event) => event.timedOut === false && event.pendingCount === 0);
      }, {
        timeout: 90_000,
        message: 'Mermaid readiness still settles under the combined selector',
      }).toBe(true);
      expect((await readWaitEvents(page)).every((event) => event.timedOut === false)).toBe(true);
      await expectPreviewCaptureCompletes(modal);

      cleanupCounts = await cleanupAndAssertBounded(supabase, fixture);
      expect(cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    } finally {
      if (cleanupCounts.boards !== 0) {
        await expect(cleanupAndAssertBounded(supabase, fixture)).resolves.toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
      }
    }
  });
});
