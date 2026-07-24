import { expect, test, type Locator, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';
import {
  assertDrawingFixtureCleanup,
  cleanupDrawingFixture,
  createDisposableDrawingBoard,
  openDrawingBoard,
  registerDrawingCleanup,
  type DrawingFixture,
} from './drawingBridgeHarness';
import { resolveSlidePadlets } from '@/components/presentation/slide-renderer/resolveSlidePadlets';
import { planSlideComposition } from '@/components/presentation/slide-renderer/planSlideComposition';

const PATCH_111_LABEL = 'patch-111-frame-membership';
const SLIDE_TITLE = 'PATCH-111 Frame';
const NOTE_TITLE = 'PATCH-111 post card';
const NOTE_CONTENT = 'PATCH-111 frame membership post card';
const SLIDE_COUNTER = /Slide 1 \/ \d+/;

registerDrawingCleanup(test);

type Json = Record<string, unknown>;

type MasterPadletRow = {
  id: string;
  content: string | null;
};

type PadletRow = {
  id: string;
  title: string | null;
  content: string | null;
  type: string | null;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type SceneElement = {
  id: string;
  type: string;
  name?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  frameId?: string | null;
  link?: string | null;
  isDeleted?: boolean;
};

type PhaseObservation = {
  phase: string;
  sceneFrameId: string | null | undefined;
  resolvedPadletIds: string[];
  nativeBelowIds: string[];
  nativeAboveIds: string[];
  previewVisible: boolean;
  previewRect: { x: number; y: number; width: number; height: number } | null;
  slideRect: { x: number; y: number; width: number; height: number } | null;
  parentOverflow: string | null;
  screenshotName: string;
};

let fixtureElementIndexCounter = 0;

function nextFixtureFractionalIndex(): string {
  fixtureElementIndexCounter += 1;
  return `a${String(fixtureElementIndexCounter).padStart(6, '0')}`;
}

function sceneBase(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  frameId: string | null,
): Json {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: type === 'frame' ? '#000000' : '#111827',
    backgroundColor: type === 'rectangle' ? '#dbeafe' : 'transparent',
    fillStyle: 'solid',
    strokeWidth: type === 'frame' ? 2 : 1,
    strokeStyle: 'solid',
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: 111,
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

function frameElement(id: string, name: string, x = 0, y = 0, width = 1280, height = 720): SceneElement {
  return {
    ...sceneBase(id, 'frame', x, y, width, height, null),
    name,
  } as SceneElement;
}

function embeddableElement(
  id: string,
  padletId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  frameId: string | null,
): SceneElement {
  return {
    ...sceneBase(id, 'embeddable', x, y, width, height, frameId),
    link: `padlet://${padletId}`,
    customData: {},
  } as unknown as SceneElement;
}

function rectangleElement(id: string, x: number, y: number, frameId: string | null): SceneElement {
  return {
    ...sceneBase(id, 'rectangle', x, y, 140, 90, frameId),
  } as SceneElement;
}

async function insertPostCard(supabase: any, fixture: DrawingFixture): Promise<string> {
  const { data, error } = await supabase
    .from('padlets')
    .insert({
      board_id: fixture.boardId,
      title: NOTE_TITLE,
      content: NOTE_CONTENT,
      type: 'note',
      position_x: 0,
      position_y: 0,
      width: 300,
      height: 180,
      metadata: { patch111Harness: true },
    })
    .select('id')
    .single();
  if (error) throw error;
  fixture.containerIds.push(data.id);
  return data.id;
}

async function insertMasterPadlet(supabase: any, fixture: DrawingFixture, elements: SceneElement[]): Promise<void> {
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
        patch111Harness: true,
        drawingAppState: JSON.stringify({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
        drawingFiles: JSON.stringify({}),
      },
    })
    .select('id')
    .single();
  if (error) throw error;
  fixture.masterPadletId = data.id;
}

async function updateMasterScene(supabase: any, fixture: DrawingFixture, elements: SceneElement[]): Promise<void> {
  const { error } = await supabase
    .from('padlets')
    .update({
      content: JSON.stringify(elements),
      metadata: {
        patch111Harness: true,
        drawingAppState: JSON.stringify({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
        drawingFiles: JSON.stringify({}),
      },
    })
    .eq('id', fixture.masterPadletId);
  if (error) throw error;
}

async function fetchMasterPadletRow(supabase: any, masterPadletId: string): Promise<MasterPadletRow> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,content')
    .eq('id', masterPadletId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchBoardPadlets(supabase: any, boardId: string): Promise<PadletRow[]> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,content,type,position_x,position_y,width,height,metadata,created_at,updated_at')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function activeSceneElements(master: MasterPadletRow): SceneElement[] {
  const parsed = JSON.parse(master.content ?? '[]') as SceneElement[];
  return parsed.filter((element) => !element.isDeleted);
}

async function openPresentationSidebar(page: Page): Promise<Locator> {
  await page.getByTitle('Present Frames').click();
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(page.getByText('Presentation', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(sidebar).toBeVisible({ timeout: 30_000 });
  return sidebar;
}

async function startPresentation(sidebar: Locator, page: Page): Promise<void> {
  const row = sidebar.getByText(SLIDE_TITLE, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]').first();
  const menuTrigger = row.locator('div.relative.flex-shrink-0.self-end.mb-2 > button').first();
  await expect(menuTrigger).toBeVisible({ timeout: 60_000 });
  await menuTrigger.click();
  await row.getByRole('button', { name: 'Start presentation', exact: true }).click({ timeout: 3_000 });
  await expect(page.getByText(SLIDE_COUNTER)).toBeVisible({ timeout: 60_000 });
}

async function stopPresentation(page: Page): Promise<void> {
  await page.getByText('End presentation', { exact: true }).click();
  await expect(page.getByText(SLIDE_COUNTER)).toHaveCount(0);
}

async function observePhase(
  page: Page,
  supabase: any,
  fixture: DrawingFixture,
  padletId: string,
  phase: string,
  screenshotName: string,
): Promise<PhaseObservation> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-padlet-id]').first().waitFor({ timeout: 90_000 });
  const master = await fetchMasterPadletRow(supabase, fixture.masterPadletId!);
  const elements = activeSceneElements(master);
  const frame = elements.find((element) => element.type === 'frame' && element.id === 'patch-111-frame');
  const embeddable = elements.find((element) => element.type === 'embeddable' && element.link === `padlet://${padletId}`);
  expect(frame).toBeTruthy();

  const padlets = await fetchBoardPadlets(supabase, fixture.boardId);
  const resolved = resolveSlidePadlets(frame as any, elements, padlets as any);
  const plan = planSlideComposition(frame as any, elements, padlets as any);
  const sidebar = await openPresentationSidebar(page);
  await startPresentation(sidebar, page);
  const expectedInPreview = resolved.some((entry) => String(entry.padlet.id) === padletId);
  if (expectedInPreview) {
    await expect.poll(
      async () => page.evaluate((content) => {
        const root = [...document.body.children].find((child) => child.textContent?.includes('End presentation'));
        return root?.textContent?.includes(content) ?? false;
      }, NOTE_CONTENT),
      { timeout: 60_000 },
    ).toBe(true);
  }

  await page.screenshot({ path: test.info().outputPath(screenshotName), fullPage: true });
  const preview = await page.evaluate((content) => {
    const overlayRoot = [...document.body.children].find((child) => child.textContent?.includes('End presentation')) as HTMLElement | undefined;
    const matches = overlayRoot
      ? ([...overlayRoot.querySelectorAll('*')] as HTMLElement[]).filter((element) => element.textContent?.trim() === content)
      : [];
    const element = matches.at(-1) ?? null;
    if (!element) {
      return {
        visible: false,
        previewRect: null,
        slideRect: null,
        parentOverflow: null,
      };
    }
    const rect = element.getBoundingClientRect();
    let clippingAncestor = element.parentElement as HTMLElement | null;
    while (clippingAncestor && clippingAncestor !== document.body && getComputedStyle(clippingAncestor).overflow !== 'hidden') {
      clippingAncestor = clippingAncestor.parentElement;
    }
    const slide = element.closest('div[style*="overflow: hidden"]') as HTMLElement | null;
    const slideRect = slide?.getBoundingClientRect();
    return {
      visible: rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden',
      previewRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      slideRect: slideRect ? { x: slideRect.x, y: slideRect.y, width: slideRect.width, height: slideRect.height } : null,
      parentOverflow: clippingAncestor && clippingAncestor !== document.body ? getComputedStyle(clippingAncestor).overflow : null,
    };
  }, NOTE_CONTENT);

  await stopPresentation(page);

  return {
    phase,
    sceneFrameId: embeddable?.frameId,
    resolvedPadletIds: resolved.map((entry) => String(entry.padlet.id)),
    nativeBelowIds: plan.nativeBelowElements.map((element: any) => String(element.id)),
    nativeAboveIds: plan.nativeAboveElements.map((element: any) => String(element.id)),
    previewVisible: preview.visible,
    previewRect: preview.previewRect,
    slideRect: preview.slideRect,
    parentOverflow: preview.parentOverflow,
    screenshotName,
  };
}

async function observePersistedModelPhase(
  supabase: any,
  fixture: DrawingFixture,
  padletId: string,
  phase: string,
): Promise<PhaseObservation> {
  const master = await fetchMasterPadletRow(supabase, fixture.masterPadletId!);
  const elements = activeSceneElements(master);
  const frame = elements.find((element) => element.type === 'frame' && element.id === 'patch-111-frame');
  const embeddable = elements.find((element) => element.type === 'embeddable' && element.link === `padlet://${padletId}`);
  expect(frame).toBeTruthy();

  const padlets = await fetchBoardPadlets(supabase, fixture.boardId);
  const resolved = resolveSlidePadlets(frame as any, elements, padlets as any);
  const plan = planSlideComposition(frame as any, elements, padlets as any);

  return {
    phase,
    sceneFrameId: embeddable?.frameId,
    resolvedPadletIds: resolved.map((entry) => String(entry.padlet.id)),
    nativeBelowIds: plan.nativeBelowElements.map((element: any) => String(element.id)),
    nativeAboveIds: plan.nativeAboveElements.map((element: any) => String(element.id)),
    previewVisible: false,
    previewRect: null,
    slideRect: null,
    parentOverflow: null,
    screenshotName: 'not-captured-model-only',
  };
}

function cleanupAndAssert(supabase: any, fixture: DrawingFixture) {
  return cleanupDrawingFixture(supabase, fixture).then(() => assertDrawingFixtureCleanup(supabase, fixture));
}

test.describe('drawing slide frame membership and clipping characterization (PATCH-111)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes post-card frameId, overlap fallback, clipping, and reload membership through live presentation', async ({ page }) => {
    test.setTimeout(300_000);

    const { supabase, fixture } = await createDisposableDrawingBoard(PATCH_111_LABEL);
    let cleanedUp = false;

    try {
      const padletId = await insertPostCard(supabase, fixture);
      const frame = frameElement('patch-111-frame', SLIDE_TITLE);
      const otherFrameId = 'patch-111-other-frame';
      fixture.frameIds.push(frame.id);
      const insideWithFrameId = embeddableElement('patch-111-card', padletId, 100, 120, 300, 180, frame.id);
      await insertMasterPadlet(supabase, fixture, [frame, insideWithFrameId]);

      await openDrawingBoard(page, fixture.boardId);

      const insideObservation = await observePhase(page, supabase, fixture, padletId, 'inside-matching-frameId', 'patch-111-inside.png');
      expect(insideObservation.sceneFrameId).toBe(frame.id);
      expect(insideObservation.resolvedPadletIds).toEqual([padletId]);
      expect(insideObservation.previewVisible).toBe(true);

      const sliverNoFrameId = embeddableElement('patch-111-card', padletId, 1279, 120, 300, 180, null);
      await updateMasterScene(supabase, fixture, [frame, sliverNoFrameId]);
      const sliverObservation = await observePhase(page, supabase, fixture, padletId, 'sliver-overlap-no-frameId', 'patch-111-sliver.png');
      expect(sliverObservation.sceneFrameId).toBeNull();
      expect(sliverObservation.resolvedPadletIds).toEqual([padletId]);
      expect(sliverObservation.previewVisible).toBe(true);
      expect(sliverObservation.parentOverflow).toBe('hidden');

      const outsideNoFrameId = embeddableElement('patch-111-card', padletId, 1500, 120, 300, 180, null);
      await updateMasterScene(supabase, fixture, [frame, outsideNoFrameId]);
      const outsideObservation = await observePersistedModelPhase(supabase, fixture, padletId, 'outside-no-frameId-after-reload');
      expect(outsideObservation.sceneFrameId).toBeNull();
      expect(outsideObservation.resolvedPadletIds).toEqual([]);

      const mismatchedFrameId = embeddableElement('patch-111-card', padletId, 100, 120, 300, 180, otherFrameId);
      await updateMasterScene(supabase, fixture, [frame, mismatchedFrameId]);
      const mismatchObservation = await observePersistedModelPhase(supabase, fixture, padletId, 'inside-different-frameId');
      expect(mismatchObservation.sceneFrameId).toBe(otherFrameId);
      expect(mismatchObservation.resolvedPadletIds).toEqual([]);

      const nativeNoFrameId = rectangleElement('patch-111-native-overlap', 100, 120, null);
      await updateMasterScene(supabase, fixture, [frame, nativeNoFrameId]);
      const nativeObservation = await observePersistedModelPhase(supabase, fixture, padletId, 'native-overlap-no-frameId');
      expect(nativeObservation.resolvedPadletIds).toEqual([]);
      expect([...nativeObservation.nativeBelowIds, ...nativeObservation.nativeAboveIds]).not.toContain(nativeNoFrameId.id);

      const annotation = {
        selectedRealAction: 'seeded-persisted-scene-phases-rendered-through-real-drawing-board-and-live-presentation',
        dragActionDrivability: 'action-not-drivable',
        actionEvidence: 'No stable public DOM handle identifies an Excalidraw embeddable by scene id for a deterministic Playwright drag; the spec records the same persisted frameId/geometry states and live presentation output without invoking hidden product handlers.',
        observations: [insideObservation, sliverObservation, outsideObservation, mismatchObservation, nativeObservation],
      };
      test.info().annotations.push({ type: 'patch-111-frame-membership', description: JSON.stringify(annotation) });

      await cleanupAndAssert(supabase, fixture);
      cleanedUp = true;
    } finally {
      if (!cleanedUp) {
        await cleanupAndAssert(supabase, fixture);
      }
    }
  });
});
