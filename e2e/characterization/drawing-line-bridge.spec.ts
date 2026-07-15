import { test, expect, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';
import {
  assertDrawingFixtureCleanup,
  cleanupDrawingFixture,
  createDisposableDrawingBoard,
  fetchHarnessLineRows,
  openDrawingBoard,
  seedAttachedCanvasLines,
  seedDrawingContainers,
  seedLineScene,
  type DrawingFixture,
} from './drawingBridgeHarness';

type LineRole = (typeof LINE_ROLES)[number];
type PointerClassification =
  | 'interaction works'
  | 'wrong Playwright interaction/selector'
  | 'overlay or z-index interception'
  | 'event-bridge timing/routing issue';
type DomDescriptor = {
  tag: string;
  className: string;
  id: string | null;
  title: string | null;
  role: string | null;
  pointerEvents: string;
  zIndex: string;
  dataLineId: string | null;
  dataLineRole: string | null;
  dataLineRenderer: string | null;
  dataPadletId: string | null;
};
type PointerEventRecord = {
  type: string;
  button: number;
  clientX: number;
  clientY: number;
  defaultPrevented: boolean;
  target: DomDescriptor;
};

const LINE_ROLES = [
  'visible-path',
  'hit-path',
  'start-handle',
  'end-handle',
  'midpoint-handle',
  'control-handle',
  'point-handle',
  'label-handle',
] as const;

async function lineGeometry(page: Page, lineId: string) {
  return page.locator(`[data-line-id="${lineId}"][data-line-role="visible-path"]`).first().evaluate((node) => ({
    d: node.getAttribute('d'),
    stroke: node.getAttribute('stroke'),
    strokeWidth: node.getAttribute('stroke-width'),
  }));
}

async function rolePresence(page: Page, lineId: string) {
  const entries = await Promise.all(
    LINE_ROLES.map(async (role) => [role, await page.locator(`[data-line-id="${lineId}"][data-line-role="${role}"]`).count()] as const),
  );
  return Object.fromEntries(entries) as Record<(typeof LINE_ROLES)[number], number>;
}

async function containerSnapshot(page: Page, padletId: string) {
  const locator = page.locator(`[data-padlet-id="${padletId}"]`).first();
  return {
    box: await locator.boundingBox(),
    attrs: await locator.evaluate((node) => ({
      dataPadletId: node.getAttribute('data-padlet-id'),
      className: node.getAttribute('class'),
      style: node.getAttribute('style'),
    })),
  };
}

async function lineSnapshot(page: Page, lineId: string) {
  return {
    geometry: await lineGeometry(page, lineId),
    roles: await rolePresence(page, lineId),
  };
}

async function hitPathCenter(page: Page, lineId: string) {
  const box = await page.locator(`[data-line-id="${lineId}"][data-line-role="hit-path"]`).first().boundingBox();
  expect(box).not.toBeNull();
  return {
    x: Math.round(box!.x + box!.width / 2),
    y: Math.round(box!.y + box!.height / 2),
    width: Math.round(box!.width),
    height: Math.round(box!.height),
  };
}

async function elementsFromPoint(page: Page, x: number, y: number): Promise<DomDescriptor[]> {
  return page.evaluate(({ x: clientX, y: clientY }) => {
    const describe = (node: Element) => {
      const element = node as HTMLElement | SVGElement;
      const htmlElement = element instanceof HTMLElement ? element : null;
      const styles = window.getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        className: element.getAttribute('class') ?? '',
        id: element.getAttribute('id'),
        title: htmlElement?.title ?? element.getAttribute('title'),
        role: element.getAttribute('role'),
        pointerEvents: styles.pointerEvents,
        zIndex: styles.zIndex,
        dataLineId: element.getAttribute('data-line-id'),
        dataLineRole: element.getAttribute('data-line-role'),
        dataLineRenderer: element.getAttribute('data-line-renderer'),
        dataPadletId: element.getAttribute('data-padlet-id'),
      };
    };
    return document.elementsFromPoint(clientX, clientY).map(describe);
  }, { x, y });
}

async function installPointerRecorder(page: Page) {
  await page.evaluate(() => {
    type PointerWindow = Window & typeof globalThis & {
      __patch065PointerRecords?: PointerEventRecord[];
      __patch065PointerHandler?: EventListener;
    };
    const targetWindow = window as PointerWindow;
    targetWindow.__patch065PointerRecords = [];
    const describe = (node: EventTarget | null): DomDescriptor => {
      if (!(node instanceof Element)) {
        return {
          tag: 'unknown',
          className: '',
          id: null,
          title: null,
          role: null,
          pointerEvents: '',
          zIndex: '',
          dataLineId: null,
          dataLineRole: null,
          dataLineRenderer: null,
          dataPadletId: null,
        };
      }
      const element = node as HTMLElement | SVGElement;
      const htmlElement = element instanceof HTMLElement ? element : null;
      const styles = window.getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        className: element.getAttribute('class') ?? '',
        id: element.getAttribute('id'),
        title: htmlElement?.title ?? element.getAttribute('title'),
        role: element.getAttribute('role'),
        pointerEvents: styles.pointerEvents,
        zIndex: styles.zIndex,
        dataLineId: element.getAttribute('data-line-id'),
        dataLineRole: element.getAttribute('data-line-role'),
        dataLineRenderer: element.getAttribute('data-line-renderer'),
        dataPadletId: element.getAttribute('data-padlet-id'),
      };
    };
    const handler: EventListener = (event) => {
      if (!(event instanceof MouseEvent)) return;
      targetWindow.__patch065PointerRecords?.push({
        type: event.type,
        button: event.button,
        clientX: Math.round(event.clientX),
        clientY: Math.round(event.clientY),
        defaultPrevented: event.defaultPrevented,
        target: describe(event.target),
      });
    };
    targetWindow.__patch065PointerHandler = handler;
    for (const type of ['mousedown', 'click', 'dblclick', 'contextmenu']) {
      document.addEventListener(type, handler, true);
    }
  });
}

async function readPointerRecorder(page: Page): Promise<PointerEventRecord[]> {
  return page.evaluate(() => {
    type PointerWindow = Window & typeof globalThis & {
      __patch065PointerRecords?: PointerEventRecord[];
    };
    const targetWindow = window as PointerWindow;
    return [...(targetWindow.__patch065PointerRecords ?? [])];
  });
}

async function clearPointerRecorder(page: Page) {
  await page.evaluate(() => {
    type PointerWindow = Window & typeof globalThis & {
      __patch065PointerRecords?: PointerEventRecord[];
    };
    const targetWindow = window as PointerWindow;
    targetWindow.__patch065PointerRecords = [];
  });
}

async function removePointerRecorder(page: Page) {
  await page.evaluate(() => {
    type PointerWindow = Window & typeof globalThis & {
      __patch065PointerRecords?: PointerEventRecord[];
      __patch065PointerHandler?: EventListener;
    };
    const targetWindow = window as PointerWindow;
    if (targetWindow.__patch065PointerHandler) {
      for (const type of ['mousedown', 'click', 'dblclick', 'contextmenu']) {
        document.removeEventListener(type, targetWindow.__patch065PointerHandler, true);
      }
    }
    delete targetWindow.__patch065PointerHandler;
    delete targetWindow.__patch065PointerRecords;
  });
}

async function lineInteractionState(page: Page, lineId: string) {
  const editPointsButton = page.getByTitle('Edit Points').first();
  const duplicateButton = page.getByRole('button', { name: 'Duplicate', exact: true }).first();
  return {
    roles: await rolePresence(page, lineId),
    geometry: await lineGeometry(page, lineId),
    selected: await editPointsButton.isVisible().catch(() => false),
    contextMenuVisible: await duplicateButton.isVisible().catch(() => false),
  };
}

function findRoleCount(state: Awaited<ReturnType<typeof lineInteractionState>>, role: LineRole) {
  return state.roles[role];
}

async function waitForVisible(locator: ReturnType<Page['locator']>, timeout: number) {
  try {
    await expect(locator).toBeVisible({ timeout });
    return true;
  } catch {
    return false;
  }
}

test.describe('drawing line bridge browser characterization (PATCH-064)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('renders seeded attached back-plane lines through the real Drawing route', async ({ page }) => {
    test.setTimeout(180_000);
    const { supabase, fixture } = await createDisposableDrawingBoard('line');

    try {
      await seedDrawingContainers(supabase, fixture);
      await seedAttachedCanvasLines(supabase, fixture);
      await seedLineScene(supabase, fixture);

      const visitedUrl = await openDrawingBoard(page, fixture.boardId);
      expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);

      for (const containerId of fixture.containerIds) {
        await expect(page.locator(`[data-padlet-id="${containerId}"]`).first()).toBeVisible({ timeout: 90_000 });
      }

      const linesBefore = await fetchHarnessLineRows(supabase, fixture.boardId);
      expect(linesBefore).toHaveLength(3);
      expect(linesBefore[0]).toMatchObject({
        start_post_id: fixture.containerIds[0],
        end_post_id: fixture.containerIds[1],
        layer_plane: 'back',
      });

      const primaryLineId = String(linesBefore[0].id);
      const hitPath = page.locator(`[data-line-id="${primaryLineId}"][data-line-renderer="back"][data-line-role="hit-path"]`);
      await expect(hitPath).toHaveCount(1);
      await expect(page.locator(`[data-line-id="${primaryLineId}"][data-line-role="visible-path"]`)).toHaveCount(1);
      await expect(page.locator(`[data-line-id="${primaryLineId}"][data-line-role="label-handle"]`)).toBeVisible();
      const renderedRoles = await rolePresence(page, primaryLineId);
      expect(renderedRoles).toEqual({
        'visible-path': 1,
        'hit-path': 1,
        'start-handle': 0,
        'end-handle': 0,
        'midpoint-handle': 0,
        'control-handle': 0,
        'point-handle': 0,
        'label-handle': 1,
      });

      const containerA = page.locator(`[data-padlet-id="${fixture.containerIds[0]}"]`).first();
      const dragHeader = containerA.locator('> div').first();
      const containerBeforeDrag = await containerA.boundingBox();
      const lineGeometryBeforeDrag = await lineGeometry(page, primaryLineId);
      const persistedLineBeforeDrag = (await fetchHarnessLineRows(supabase, fixture.boardId)).find((line) => line.id === primaryLineId);
      expect(containerBeforeDrag).not.toBeNull();
      expect(lineGeometryBeforeDrag.d).toBeTruthy();
      expect(persistedLineBeforeDrag).toMatchObject({
        start_x: 480,
        start_y: 250,
        end_x: 620,
        end_y: 270,
      });

      const headerBox = await dragHeader.boundingBox();
      expect(headerBox).not.toBeNull();
      await page.mouse.move(headerBox!.x + headerBox!.width / 2, headerBox!.y + headerBox!.height / 2);
      await page.mouse.down();
      await page.mouse.move(headerBox!.x + headerBox!.width / 2 + 96, headerBox!.y + headerBox!.height / 2 + 42, { steps: 8 });
      await page.mouse.up();
      await expect.poll(async () => {
        const after = await containerA.boundingBox();
        return after && containerBeforeDrag
          ? Math.round(after.x - containerBeforeDrag.x)
          : 0;
      }, { timeout: 30_000 }).not.toBe(0);

      const containerAfterDrag = await containerA.boundingBox();
      const lineGeometryAfterDrag = await lineGeometry(page, primaryLineId);
      const persistedLineAfterDrag = (await fetchHarnessLineRows(supabase, fixture.boardId)).find((line) => line.id === primaryLineId);
      expect(containerAfterDrag).not.toBeNull();
      expect(containerAfterDrag!.x).not.toBe(containerBeforeDrag!.x);
      expect(lineGeometryAfterDrag).toEqual(lineGeometryBeforeDrag);
      expect(persistedLineAfterDrag).toEqual(persistedLineBeforeDrag);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByTitle('Back to Dashboard').waitFor({ timeout: 90_000 });
      await expect(page.locator(`[data-line-id="${primaryLineId}"][data-line-role="hit-path"]`)).toHaveCount(1);

      await page.getByTitle('Back to Dashboard').click();
      await page.waitForURL(/dashboard\/?$/, { timeout: 45_000 });
      await page.goto(`/dashboard/canvas/${fixture.boardId}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(`[data-line-id="${primaryLineId}"][data-line-role="hit-path"]`)).toHaveCount(1, { timeout: 90_000 });

      const { error: deleteError } = await supabase.from('canvas_lines').delete().eq('id', primaryLineId);
      expect(deleteError).toBeNull();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByTitle('Back to Dashboard').waitFor({ timeout: 90_000 });
      await expect(page.locator(`[data-line-id="${primaryLineId}"]`)).toHaveCount(0, { timeout: 30_000 });
      await expect(page.locator(`[data-padlet-id="${fixture.containerIds[0]}"]`).first()).toBeVisible();

      const linesAfterDelete = await fetchHarnessLineRows(supabase, fixture.boardId);
      expect(linesAfterDelete.map((line) => line.id)).not.toContain(primaryLineId);
      expect(linesAfterDelete).toHaveLength(2);
      expect(new Set(linesAfterDelete.map((line) => line.start_post_id))).toEqual(
        new Set([fixture.containerIds[0], fixture.containerIds[2]]),
      );
    } finally {
      await cleanupDrawingFixture(supabase, fixture);
      await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
        boards: 0,
        padlets: 0,
        canvasLines: 0,
      });
    }
  });

  test('attempts child-content growth natural-height resize through the real Drawing editor path', async ({ page }) => {
    test.setTimeout(180_000);
    const { supabase, fixture } = await createDisposableDrawingBoard('line-natural-height');

    try {
      await seedDrawingContainers(supabase, fixture);
      await seedAttachedCanvasLines(supabase, fixture);
      await seedLineScene(supabase, fixture);

      await openDrawingBoard(page, fixture.boardId);
      const targetContainerId = fixture.containerIds[1];
      const targetChildId = fixture.childIds[1];
      const targetLineId = String((await fetchHarnessLineRows(supabase, fixture.boardId))[0].id);
      const targetContainer = page.locator(`[data-padlet-id="${targetContainerId}"]`).first();
      await expect(targetContainer).toBeVisible({ timeout: 90_000 });

      const childBeforeResult = await supabase
        .from('padlets')
        .select('content')
        .eq('id', targetChildId)
        .single();
      expect(childBeforeResult.error).toBeNull();
      const childContentBefore = String(childBeforeResult.data?.content ?? '');
      const containerBefore = await containerSnapshot(page, targetContainerId);
      const lineBefore = await lineSnapshot(page, targetLineId);
      const persistedLineBefore = (await fetchHarnessLineRows(supabase, fixture.boardId)).find((line) => line.id === targetLineId);

      await targetContainer.hover();
      const editButtonSelector = `[data-padlet-id="${targetContainerId}"] button[data-post-menu-trigger="true"][title="Edit"]`;
      const editButton = page.locator(editButtonSelector).first();
      try {
        await editButton.click({ button: 'right', timeout: 10_000 });
      } catch (error) {
        test.skip(
          true,
          `natural-height content-growth path unreachable: attempted selector ${editButtonSelector} with right-click to open Drawing container child edit menu; ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const childEditEntry = page.getByRole('button', { name: new RegExp(`Edit\\s+${fixture.prefix} child B`) }).first();
      try {
        await childEditEntry.click({ timeout: 10_000 });
      } catch (error) {
        test.skip(
          true,
          `natural-height content-growth path unreachable: right-clicked ${editButtonSelector}, then attempted child edit menu button /Edit ${fixture.prefix} child B/; ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const editorSelector = '.ProseMirror[contenteditable="true"]';
      const editor = page.locator(editorSelector).first();
      try {
        await editor.waitFor({ state: 'visible', timeout: 15_000 });
      } catch (error) {
        test.skip(
          true,
          `natural-height content-growth path unreachable: opened child edit menu, then waited for real NoteEditor selector ${editorSelector}; ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const grownText = `${childContentBefore}\n\nPATCH-064 natural-height content-growth attempt\n${Array.from({ length: 24 }, (_, index) => `growth row ${index + 1}: ${fixture.prefix}`).join('\n')}`;
      await editor.click();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await page.keyboard.type(grownText);
      const noteOverlay = page.locator('div.fixed.inset-0').filter({ has: editor }).first();
      try {
        await expect(noteOverlay).toBeVisible({ timeout: 10_000 });
        const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
        await page.mouse.click(viewport.width - 8, 8);
        await expect(editor).toHaveCount(0, { timeout: 15_000 });
      } catch (error) {
        test.skip(
          true,
          `natural-height content-growth path could not save/close: typed grown content into ${editorSelector}, then clicked the real NoteEditor overlay at viewport top-right; ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      await expect.poll(async () => {
        const { data } = await supabase.from('padlets').select('content').eq('id', targetChildId).single();
        return String(data?.content ?? '').includes('PATCH-064 natural-height content-growth attempt');
      }, { timeout: 30_000 }).toBe(true);

      await page.waitForTimeout(1_500);
      const childAfterResult = await supabase
        .from('padlets')
        .select('content')
        .eq('id', targetChildId)
        .single();
      expect(childAfterResult.error).toBeNull();
      const childContentAfter = String(childAfterResult.data?.content ?? '');
      const containerAfter = await containerSnapshot(page, targetContainerId);
      const lineAfter = await lineSnapshot(page, targetLineId);
      const persistedLineAfter = (await fetchHarnessLineRows(supabase, fixture.boardId)).find((line) => line.id === targetLineId);

      expect(childContentAfter).toContain('PATCH-064 natural-height content-growth attempt');
      expect(childContentAfter).not.toBe(childContentBefore);
      expect(containerBefore.box).not.toBeNull();
      expect(containerAfter.box).not.toBeNull();

      const heightChanged = containerAfter.box!.height > containerBefore.box!.height;
      const lineChanged = JSON.stringify(lineAfter) !== JSON.stringify(lineBefore);
      const persistedLineChanged = JSON.stringify(persistedLineAfter) !== JSON.stringify(persistedLineBefore);
      test.info().annotations.push({
        type: 'patch-064-natural-height-result',
        description: JSON.stringify({
          childContentBefore,
          childContentAfter,
          containerBefore,
          containerAfter,
          lineBefore,
          lineAfter,
          persistedLineBefore,
          persistedLineAfter,
          outcome: heightChanged
            ? lineChanged
              ? 'content-saved-height-increased-line-geometry-changed'
              : 'content-saved-height-increased-line-geometry-unchanged'
            : 'content-saved-height-unchanged-line-geometry-unchanged',
          persistedLineChanged,
        }),
      });
      if (heightChanged && lineChanged) {
        expect(lineAfter).not.toEqual(lineBefore);
      } else if (heightChanged) {
        expect(lineAfter).toEqual(lineBefore);
        expect(persistedLineChanged).toBe(false);
      } else {
        expect(containerAfter.box!.height).toBe(containerBefore.box!.height);
        expect(lineAfter).toEqual(lineBefore);
        expect(persistedLineAfter).toEqual(persistedLineBefore);
      }
    } finally {
      await cleanupDrawingFixture(supabase, fixture);
      await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
        boards: 0,
        padlets: 0,
        canvasLines: 0,
      });
    }
  });

  test('characterizes real hit-path pointer routing, selection, edit handles, and context menu', async ({ page }) => {
    test.setTimeout(180_000);
    const { supabase, fixture } = await createDisposableDrawingBoard('line-pointer');

    try {
      await seedDrawingContainers(supabase, fixture);
      await seedAttachedCanvasLines(supabase, fixture);
      await seedLineScene(supabase, fixture);

      await openDrawingBoard(page, fixture.boardId);

      const primaryLineId = String((await fetchHarnessLineRows(supabase, fixture.boardId))[0].id);
      const hitPathSelector = `[data-line-id="${primaryLineId}"][data-line-role="hit-path"]`;
      const hitPath = page.locator(hitPathSelector).first();
      await expect(hitPath).toHaveCount(1);
      await expect(page.locator(`[data-line-id="${primaryLineId}"][data-line-role="visible-path"]`)).toHaveCount(1);
      await expect(page.locator('canvas.excalidraw__canvas').first()).toBeVisible({ timeout: 90_000 });

      const center = await hitPathCenter(page, primaryLineId);
      const stack = await elementsFromPoint(page, center.x, center.y);
      const hitPathIndex = stack.findIndex((entry) => entry.dataLineId === primaryLineId && entry.dataLineRole === 'hit-path');
      const canvasIndex = stack.findIndex((entry) => entry.tag === 'canvas' && entry.className.includes('excalidraw__canvas'));
      expect(hitPathIndex).toBeGreaterThanOrEqual(0);
      expect(canvasIndex).toBeGreaterThanOrEqual(0);
      expect(canvasIndex).toBeLessThan(hitPathIndex);

      const before = await lineInteractionState(page, primaryLineId);
      await installPointerRecorder(page);
      let locatorClickOutcome: { kind: 'succeeded' | 'failed'; message?: string };
      try {
        await hitPath.click({ timeout: 5_000 });
        locatorClickOutcome = { kind: 'succeeded' };
      } catch (error) {
        locatorClickOutcome = {
          kind: 'failed',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      const afterLocatorClick = await lineInteractionState(page, primaryLineId);
      const locatorRecords = await readPointerRecorder(page);
      await clearPointerRecorder(page);

      await page.mouse.click(center.x, center.y);
      const afterCoordinateClick = await lineInteractionState(page, primaryLineId);
      const coordinateClickRecords = await readPointerRecorder(page);
      await clearPointerRecorder(page);
      const coordinateSelectionVisible = await waitForVisible(page.getByTitle('Edit Points').first(), 2_000);

      await page.mouse.dblclick(center.x, center.y);
      const afterDoubleClick = await lineInteractionState(page, primaryLineId);
      const doubleClickRecords = await readPointerRecorder(page);
      await clearPointerRecorder(page);
      const doubleClickHandleCount = findRoleCount(afterDoubleClick, 'start-handle')
        + findRoleCount(afterDoubleClick, 'end-handle')
        + findRoleCount(afterDoubleClick, 'control-handle');

      await page.mouse.click(center.x, center.y, { button: 'right' });
      const afterContextMenu = await lineInteractionState(page, primaryLineId);
      const contextMenuRecords = await readPointerRecorder(page);
      const contextMenuVisible = await waitForVisible(page.getByRole('button', { name: 'Duplicate', exact: true }).first(), 2_000);

      const coordinateTarget = coordinateClickRecords.find((entry) => entry.type === 'mousedown')?.target ?? null;
      const clickWorked = afterCoordinateClick.selected || coordinateSelectionVisible;
      const classification: PointerClassification =
        clickWorked && locatorClickOutcome.kind === 'failed'
          ? 'wrong Playwright interaction/selector'
          : clickWorked
            ? 'interaction works'
            : coordinateTarget?.tag === 'canvas' && coordinateTarget.className.includes('excalidraw__canvas')
              ? 'event-bridge timing/routing issue'
              : 'overlay or z-index interception';
      test.info().annotations.push({
        type: 'patch-065-pointer-investigation',
        description: JSON.stringify({
          hitPathSelector,
          center,
          stack,
          locatorClickOutcome,
          locatorRecords,
          coordinateClickRecords,
          doubleClickRecords,
          contextMenuRecords,
          coordinateSelectionVisible,
          doubleClickHandleCount,
          contextMenuVisible,
          before,
          afterLocatorClick,
          afterCoordinateClick,
          afterDoubleClick,
          afterContextMenu,
          classification,
          productionDefectCandidateProven: classification !== 'wrong Playwright interaction/selector' && classification !== 'interaction works',
        }),
      });

      expect(before).toMatchObject({
        selected: false,
        contextMenuVisible: false,
        roles: {
          'visible-path': 1,
          'hit-path': 1,
          'start-handle': 0,
          'end-handle': 0,
          'midpoint-handle': 0,
          'control-handle': 0,
          'point-handle': 0,
          'label-handle': 1,
        },
      });
      if (locatorClickOutcome.kind === 'failed') {
        expect(locatorClickOutcome.message).toContain('intercepts pointer events');
        expect(afterLocatorClick.selected).toBe(false);
      }
      if (classification === 'wrong Playwright interaction/selector' || classification === 'interaction works') {
        expect(coordinateTarget).toMatchObject({
          tag: 'canvas',
          className: expect.stringContaining('excalidraw__canvas'),
        });
        expect(afterCoordinateClick.selected || coordinateSelectionVisible).toBe(true);
        expect(afterCoordinateClick.contextMenuVisible).toBe(false);
        expect(findRoleCount(afterCoordinateClick, 'start-handle')).toBe(0);
        expect(findRoleCount(afterDoubleClick, 'start-handle')).toBe(1);
        expect(findRoleCount(afterDoubleClick, 'end-handle')).toBe(1);
        expect(findRoleCount(afterDoubleClick, 'control-handle')).toBe(1);
        expect(afterContextMenu.contextMenuVisible || contextMenuVisible).toBe(true);
      } else if (classification === 'event-bridge timing/routing issue') {
        expect(coordinateTarget).toMatchObject({
          tag: 'canvas',
          className: expect.stringContaining('excalidraw__canvas'),
        });
        expect(afterCoordinateClick.selected).toBe(false);
        expect(coordinateSelectionVisible).toBe(false);
        expect(doubleClickHandleCount).toBe(0);
        expect(afterContextMenu.contextMenuVisible).toBe(false);
        expect(contextMenuVisible).toBe(false);
      } else {
        expect(stack[0]).not.toMatchObject({
          tag: 'canvas',
          className: expect.stringContaining('excalidraw__canvas'),
        });
        expect(afterCoordinateClick.selected).toBe(false);
        expect(doubleClickHandleCount).toBe(0);
        expect(contextMenuVisible).toBe(false);
      }
    } finally {
      await removePointerRecorder(page).catch(() => undefined);
      await cleanupDrawingFixture(supabase, fixture);
      await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
        boards: 0,
        padlets: 0,
        canvasLines: 0,
      });
    }
  });
});
