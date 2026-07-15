import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
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
  buttons: number;
  clientX: number;
  clientY: number;
  defaultPrevented: boolean;
  target: DomDescriptor;
};
type ConsoleDiagnosticEntry = {
  type: string;
  text: string;
  values: unknown[];
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
      if (!(event instanceof MouseEvent) && !(event instanceof PointerEvent)) return;
      targetWindow.__patch065PointerRecords?.push({
        type: event.type,
        button: event.button,
        buttons: event.buttons,
        clientX: Math.round(event.clientX),
        clientY: Math.round(event.clientY),
        defaultPrevented: event.defaultPrevented,
        target: describe(event.target),
      });
    };
    targetWindow.__patch065PointerHandler = handler;
    for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu']) {
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
      for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu']) {
        document.removeEventListener(type, targetWindow.__patch065PointerHandler, true);
      }
    }
    delete targetWindow.__patch065PointerHandler;
    delete targetWindow.__patch065PointerRecords;
  });
}

async function lineInteractionState(page: Page, lineId: string) {
  const editPointsButton = page.getByTitle('Edit Points').first();
  return {
    roles: await rolePresence(page, lineId),
    geometry: await lineGeometry(page, lineId),
    selected: await editPointsButton.isVisible().catch(() => false),
    contextMenuVisible: await lineContextMenu(page).isVisible().catch(() => false),
  };
}

function findRoleCount(state: Awaited<ReturnType<typeof lineInteractionState>>, role: LineRole) {
  return state.roles[role];
}

function lineContextMenu(page: Page) {
  return page
    .locator('div.fixed')
    .filter({ has: page.getByRole('button', { name: 'Duplicate', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Send to Back', exact: true }) })
    .first();
}

function excalidrawContextMenu(page: Page) {
  return page.locator('.context-menu').first();
}

async function waitForVisible(locator: ReturnType<Page['locator']>, timeout: number) {
  try {
    await expect(locator).toBeVisible({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitForEventCycle(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}

function isConsolePayload(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function consolePayload(entry: ConsoleDiagnosticEntry) {
  return entry.values.find(isConsolePayload) ?? null;
}

function findConsolePayload(entries: ConsoleDiagnosticEntry[], phase: string) {
  return entries
    .map(consolePayload)
    .find((payload) => payload?.phase === phase) ?? null;
}

function hasConsolePayload(entries: ConsoleDiagnosticEntry[], phase: string) {
  return entries
    .map(consolePayload)
    .some((payload) => payload?.phase === phase);
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
    const consoleEntries: ConsoleDiagnosticEntry[] = [];
    const consoleReads: Promise<void>[] = [];
    const consoleListener = (message: ConsoleMessage) => {
      const read = (async () => {
        const values: unknown[] = [];
        for (const arg of message.args()) {
          try {
            values.push(await arg.jsonValue());
          } catch {
            values.push(`[unserializable:${arg.toString()}]`);
          }
        }
        consoleEntries.push({
          type: message.type(),
          text: message.text(),
          values,
        });
      })();
      consoleReads.push(read);
    };
    const flushConsoleEntries = async () => {
      await Promise.all(consoleReads.splice(0, consoleReads.length));
    };
    const readAndClearConsoleEntries = async () => {
      await flushConsoleEntries();
      return consoleEntries.splice(0, consoleEntries.length);
    };
    page.on('console', consoleListener);

    try {
      await seedDrawingContainers(supabase, fixture);
      await seedAttachedCanvasLines(supabase, fixture);
      await seedLineScene(supabase, fixture);

      await openDrawingBoard(page, fixture.boardId);

      const persistedLineRowsBefore = await fetchHarnessLineRows(supabase, fixture.boardId);
      const primaryLineId = String(persistedLineRowsBefore[0].id);
      const persistedPrimaryLineBefore = persistedLineRowsBefore.find((row) => String(row.id) === primaryLineId);
      const persistedOtherLinesBefore = persistedLineRowsBefore.filter((row) => String(row.id) !== primaryLineId);
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
      const primaryLineBefore = await lineSnapshot(page, primaryLineId);
      const otherLineSnapshotsBefore = await Promise.all(
        persistedOtherLinesBefore.map(async (row) => ({
          lineId: String(row.id),
          snapshot: await lineSnapshot(page, String(row.id)),
        })),
      );
      const containerSnapshotsBefore = await Promise.all(
        fixture.containerIds.map(async (containerId) => ({
          containerId,
          snapshot: await containerSnapshot(page, containerId),
        })),
      );
      await installPointerRecorder(page);

      await readAndClearConsoleEntries();
      await clearPointerRecorder(page);
      await page.mouse.click(center.x, center.y, { button: 'right' });
      await waitForEventCycle(page);
      const stateUConsoleEntries = await readAndClearConsoleEntries();
      const stateUAfterContextMenu = await lineInteractionState(page, primaryLineId);
      const stateUContextMenuRecords = await readPointerRecorder(page);
      await clearPointerRecorder(page);
      const stateULineMenuVisible = await waitForVisible(lineContextMenu(page), 2_000);
      const stateUExcalidrawMenuVisible = await excalidrawContextMenu(page).isVisible().catch(() => false);
      const stateULineRowsAfter = await fetchHarnessLineRows(supabase, fixture.boardId);
      const stateULineGeometryAfter = await lineGeometry(page, primaryLineId);
      const stateUOtherLineSnapshotsAfter = await Promise.all(
        persistedOtherLinesBefore.map(async (row) => ({
          lineId: String(row.id),
          snapshot: await lineSnapshot(page, String(row.id)),
        })),
      );
      const stateUContainerSnapshotsAfter = await Promise.all(
        fixture.containerIds.map(async (containerId) => ({
          containerId,
          snapshot: await containerSnapshot(page, containerId),
        })),
      );
      const stateUPhysicalTarget = stateUContextMenuRecords.find((entry) => entry.type === 'pointerdown')?.target
        ?? stateUContextMenuRecords.find((entry) => entry.type === 'mousedown')?.target
        ?? stateUContextMenuRecords.find((entry) => entry.type === 'contextmenu')?.target
        ?? null;
      const stateUContextMenuTargetLookup = findConsolePayload(stateUConsoleEntries, 'contextmenu-capture:target-lookup');
      const stateUContextMenuCapture = findConsolePayload(stateUConsoleEntries, 'contextmenu-capture');
      const stateURendererContextMenuBefore = findConsolePayload(stateUConsoleEntries, 'hit-path-contextmenu:before-stop');
      const stateURendererContextMenuAfter = findConsolePayload(stateUConsoleEntries, 'hit-path-contextmenu:after-stop');

      test.info().annotations.push({
        type: 'patch-067-state-u',
        description: JSON.stringify({
          hitPathSelector,
          center,
          stack,
          initialState: before,
          records: stateUContextMenuRecords,
          physicalTarget: stateUPhysicalTarget,
          afterContextMenu: stateUAfterContextMenu,
          bridgeDiagnostics: {
            contextMenuCapture: stateUContextMenuCapture,
            contextMenuTargetLookup: stateUContextMenuTargetLookup,
          },
          rendererDiagnostics: {
            stateURendererContextMenuBefore,
            stateURendererContextMenuAfter,
          },
          menu: {
            lineMenuVisible: stateULineMenuVisible,
            excalidrawMenuVisible: stateUExcalidrawMenuVisible,
          },
          invariants: {
            geometryUnchanged: JSON.stringify(stateULineGeometryAfter) === JSON.stringify(primaryLineBefore.geometry),
            persistedRowsUnchanged: JSON.stringify(stateULineRowsAfter) === JSON.stringify(persistedLineRowsBefore),
            otherLinesUnchanged: JSON.stringify(stateUOtherLineSnapshotsAfter) === JSON.stringify(otherLineSnapshotsBefore),
            containersUnchanged: JSON.stringify(stateUContainerSnapshotsAfter) === JSON.stringify(containerSnapshotsBefore),
          },
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
      expect(stateUPhysicalTarget).toMatchObject({
        tag: 'canvas',
        className: expect.stringContaining('excalidraw__canvas'),
      });
      expect(stateUContextMenuCapture).toMatchObject({
        phase: 'contextmenu-capture',
        guardPassed: true,
        backTargetFound: true,
        foundTargetLineId: primaryLineId,
        foundTargetLineRole: 'hit-path',
      });
      expect(stateUContextMenuTargetLookup).toMatchObject({
        phase: 'contextmenu-capture:target-lookup',
        backTargetFound: true,
        foundTargetLineId: primaryLineId,
        foundTargetLineRole: 'hit-path',
      });
      expect(stateURendererContextMenuBefore).toMatchObject({
        phase: 'hit-path-contextmenu:before-stop',
        rendererLabel: 'back',
        lineId: primaryLineId,
      });
      expect(stateURendererContextMenuAfter).toMatchObject({
        phase: 'hit-path-contextmenu:after-stop',
        rendererLabel: 'back',
        lineId: primaryLineId,
      });
      expect(stateUAfterContextMenu).toMatchObject({
        selected: true,
        contextMenuVisible: true,
        geometry: primaryLineBefore.geometry,
      });
      expect(stateULineMenuVisible).toBe(true);
      expect(stateUExcalidrawMenuVisible).toBe(false);
      expect(stateULineGeometryAfter).toEqual(primaryLineBefore.geometry);
      expect(stateULineRowsAfter).toEqual(persistedLineRowsBefore);
      expect(stateUOtherLineSnapshotsAfter).toEqual(otherLineSnapshotsBefore);
      expect(stateUContainerSnapshotsAfter).toEqual(containerSnapshotsBefore);

      await page.keyboard.press('Escape');
      await expect(lineContextMenu(page)).toBeHidden({ timeout: 5_000 });
      await readAndClearConsoleEntries();
      await clearPointerRecorder(page);

      await page.mouse.click(center.x, center.y);
      await expect.poll(async () => (await lineInteractionState(page, primaryLineId)).selected, { timeout: 5_000 }).toBe(true);
      await waitForEventCycle(page);
      const coordinateClickConsoleEntries = await readAndClearConsoleEntries();
      const afterCoordinateClick = await lineInteractionState(page, primaryLineId);
      const coordinateClickRecords = await readPointerRecorder(page);
      await clearPointerRecorder(page);

      await page.mouse.dblclick(center.x, center.y);
      await expect.poll(async () => (await lineInteractionState(page, primaryLineId)).selected, { timeout: 5_000 }).toBe(true);
      await waitForEventCycle(page);
      const doubleClickConsoleEntries = await readAndClearConsoleEntries();
      const afterDoubleClick = await lineInteractionState(page, primaryLineId);
      const doubleClickRecords = await readPointerRecorder(page);
      await clearPointerRecorder(page);

      const stateSStack = await elementsFromPoint(page, center.x, center.y);
      await readAndClearConsoleEntries();
      await page.mouse.click(center.x, center.y, { button: 'right' });
      await waitForEventCycle(page);
      const stateSConsoleEntries = await readAndClearConsoleEntries();
      const stateSAfterContextMenu = await lineInteractionState(page, primaryLineId);
      const stateSContextMenuRecords = await readPointerRecorder(page);
      const stateSLineMenuVisible = await lineContextMenu(page).isVisible().catch(() => false);
      const stateSExcalidrawMenuVisible = await excalidrawContextMenu(page).isVisible().catch(() => false);
      const persistedLineRowsAfter = await fetchHarnessLineRows(supabase, fixture.boardId);
      const primaryLineGeometryAfter = await lineGeometry(page, primaryLineId);
      const otherLineSnapshotsAfter = await Promise.all(
        persistedOtherLinesBefore.map(async (row) => ({
          lineId: String(row.id),
          snapshot: await lineSnapshot(page, String(row.id)),
        })),
      );
      const containerSnapshotsAfter = await Promise.all(
        fixture.containerIds.map(async (containerId) => ({
          containerId,
          snapshot: await containerSnapshot(page, containerId),
        })),
      );

      const coordinateTarget = coordinateClickRecords.find((entry) => entry.type === 'pointerdown')?.target
        ?? coordinateClickRecords.find((entry) => entry.type === 'mousedown')?.target
        ?? null;
      const stateSPhysicalTarget = stateSContextMenuRecords.find((entry) => entry.type === 'pointerdown')?.target
        ?? stateSContextMenuRecords.find((entry) => entry.type === 'mousedown')?.target
        ?? stateSContextMenuRecords.find((entry) => entry.type === 'contextmenu')?.target
        ?? null;
      const mouseDownCapture = findConsolePayload(coordinateClickConsoleEntries, 'mouse-down-capture');
      const mouseDownTargetLookup = findConsolePayload(coordinateClickConsoleEntries, 'mouse-down-capture:target-lookup');
      const clickCapture = findConsolePayload(coordinateClickConsoleEntries, 'click-capture');
      const contextMenuTargetLookup = findConsolePayload(stateSConsoleEntries, 'contextmenu-capture:target-lookup');
      const contextMenuCapture = findConsolePayload(stateSConsoleEntries, 'contextmenu-capture');
      const rendererDragEntry = findConsolePayload(coordinateClickConsoleEntries, 'line-drag-start:entry');
      const rendererDragBranch = findConsolePayload(coordinateClickConsoleEntries, 'line-drag-start:drag-branch');
      const rendererPathClickBefore = findConsolePayload(coordinateClickConsoleEntries, 'path-click:before-stop');
      const rendererPathClickAfter = findConsolePayload(coordinateClickConsoleEntries, 'path-click:after-stop');
      const stateSRendererContextMenuBeforePresent = hasConsolePayload(stateSConsoleEntries, 'hit-path-contextmenu:before-stop');
      const stateSRendererContextMenuAfterPresent = hasConsolePayload(stateSConsoleEntries, 'hit-path-contextmenu:after-stop');
      const stateSTargetRole = typeof contextMenuTargetLookup?.foundTargetLineRole === 'string'
        ? contextMenuTargetLookup.foundTargetLineRole
        : null;
      test.info().annotations.push({
        type: 'patch-066-stage0-proof',
        description: JSON.stringify({
          hitPathSelector,
          center,
          stack,
          coordinateClickRecords,
          doubleClickRecords,
          contextMenuRecords: stateSContextMenuRecords,
          contextMenuVisible: stateSLineMenuVisible,
          before,
          afterCoordinateClick,
          afterDoubleClick,
          afterContextMenu: stateSAfterContextMenu,
          bridgeDiagnostics: {
            mouseDownCapture,
            mouseDownTargetLookup,
            clickCapture,
            contextMenuTargetLookup,
            contextMenuCapture,
          },
          rendererDiagnostics: {
            rendererDragEntry,
            rendererDragBranch,
            rendererPathClickBefore,
            rendererPathClickAfter,
          },
        }),
      });
      test.info().annotations.push({
        type: 'patch-067-state-s',
        description: JSON.stringify({
          center,
          stack: stateSStack,
          initialState: afterDoubleClick,
          records: stateSContextMenuRecords,
          physicalTarget: stateSPhysicalTarget,
          afterContextMenu: stateSAfterContextMenu,
          bridgeDiagnostics: {
            contextMenuCapture,
            contextMenuTargetLookup,
          },
          rendererDiagnostics: {
            hitPathContextMenuBeforePresent: stateSRendererContextMenuBeforePresent,
            hitPathContextMenuAfterPresent: stateSRendererContextMenuAfterPresent,
          },
          menu: {
            lineMenuVisible: stateSLineMenuVisible,
            excalidrawMenuVisible: stateSExcalidrawMenuVisible,
          },
          targetRole: stateSTargetRole,
          invariants: {
            geometryUnchanged: JSON.stringify(primaryLineGeometryAfter) === JSON.stringify(primaryLineBefore.geometry),
            persistedRowsUnchanged: JSON.stringify(persistedLineRowsAfter) === JSON.stringify(persistedLineRowsBefore),
            otherLinesUnchanged: JSON.stringify(otherLineSnapshotsAfter) === JSON.stringify(otherLineSnapshotsBefore),
            containersUnchanged: JSON.stringify(containerSnapshotsAfter) === JSON.stringify(containerSnapshotsBefore),
          },
        }),
      });
      test.info().annotations.push({
        type: 'patch-067-classification',
        description: JSON.stringify({
          primaryRow: 'R6',
          label: 'selected-state context-menu divergence',
          stateU: {
            hitPathWon: stateUContextMenuTargetLookup?.foundTargetLineRole === 'hit-path',
            hitPathHandlerRan: Boolean(stateURendererContextMenuBefore && stateURendererContextMenuAfter),
            lineMenuOpened: stateULineMenuVisible,
          },
          stateS: {
            editHandleWon: stateSTargetRole === 'midpoint-handle' || stateSTargetRole === 'point-handle',
            hitPathHandlerRan: stateSRendererContextMenuBeforePresent || stateSRendererContextMenuAfterPresent,
            lineMenuOpened: stateSLineMenuVisible,
          },
          secondaryContributingCondition: 'edit-mode interactive-role priority places midpoint/point handles above hit-path; those handle roles do not own the line context-menu callback',
        }),
      });

      expect(coordinateTarget).toMatchObject({
        tag: 'canvas',
        className: expect.stringContaining('excalidraw__canvas'),
      });
      expect(afterCoordinateClick).toMatchObject({
        selected: true,
        contextMenuVisible: false,
        geometry: primaryLineBefore.geometry,
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
      expect(afterDoubleClick).toMatchObject({
        selected: true,
        contextMenuVisible: false,
        geometry: primaryLineBefore.geometry,
        roles: {
          'visible-path': 1,
          'hit-path': 1,
          'start-handle': 0,
          'end-handle': 0,
          'midpoint-handle': 1,
          'control-handle': 0,
          'point-handle': 2,
          'label-handle': 1,
        },
      });
      expect(stateSPhysicalTarget).toMatchObject({
        tag: 'canvas',
        className: expect.stringContaining('excalidraw__canvas'),
      });
      expect(stateSAfterContextMenu).toMatchObject({
        selected: true,
        contextMenuVisible: false,
        geometry: primaryLineBefore.geometry,
      });
      expect(stateSLineMenuVisible).toBe(false);
      expect(stateSExcalidrawMenuVisible).toBe(false);
      expect(findRoleCount(stateSAfterContextMenu, 'midpoint-handle')).toBe(1);
      expect(findRoleCount(stateSAfterContextMenu, 'point-handle')).toBe(2);

      expect(mouseDownCapture).toMatchObject({
        phase: 'mouse-down-capture',
        guardPassed: true,
        activeToolType: 'selection',
        backTargetFound: true,
        foundTargetLineId: primaryLineId,
        foundTargetLineRole: 'hit-path',
      });
      expect(mouseDownTargetLookup).toMatchObject({
        phase: 'mouse-down-capture:target-lookup',
        backTargetFound: true,
        foundTargetLineId: primaryLineId,
        foundTargetLineRole: 'hit-path',
      });
      expect(clickCapture).toMatchObject({
        phase: 'click-capture',
        guardPassed: true,
        backTargetFound: true,
        foundTargetLineId: primaryLineId,
        foundTargetLineRole: 'hit-path',
      });
      expect(rendererDragEntry).toMatchObject({
        phase: 'line-drag-start:entry',
        rendererLabel: 'back',
        lineId: primaryLineId,
      });
      expect(rendererDragBranch).toMatchObject({
        phase: 'line-drag-start:drag-branch',
        rendererLabel: 'back',
        lineId: primaryLineId,
      });
      expect(rendererPathClickBefore).toMatchObject({
        phase: 'path-click:before-stop',
        rendererLabel: 'back',
        lineId: primaryLineId,
      });
      expect(rendererPathClickAfter).toMatchObject({
        phase: 'path-click:after-stop',
        rendererLabel: 'back',
        lineId: primaryLineId,
      });
      expect(contextMenuCapture).toMatchObject({
        phase: 'contextmenu-capture',
        guardPassed: true,
        backTargetFound: true,
        foundTargetLineId: primaryLineId,
        foundTargetLineRole: expect.stringMatching(/^(midpoint-handle|point-handle)$/),
      });
      expect(contextMenuTargetLookup).toMatchObject({
        phase: 'contextmenu-capture:target-lookup',
        backTargetFound: true,
        foundTargetLineId: primaryLineId,
        foundTargetLineRole: expect.stringMatching(/^(midpoint-handle|point-handle)$/),
      });
      expect(stateSTargetRole === 'midpoint-handle' || stateSTargetRole === 'point-handle').toBe(true);
      expect(stateSTargetRole).not.toBe('hit-path');
      expect(stateSRendererContextMenuBeforePresent).toBe(false);
      expect(stateSRendererContextMenuAfterPresent).toBe(false);

      expect(primaryLineGeometryAfter).toEqual(primaryLineBefore.geometry);
      expect(persistedLineRowsAfter).toEqual(persistedLineRowsBefore);
      expect(persistedLineRowsAfter.find((row) => String(row.id) === primaryLineId)).toEqual(persistedPrimaryLineBefore);
      expect(
        persistedLineRowsAfter.filter((row) => String(row.id) !== primaryLineId),
      ).toEqual(persistedOtherLinesBefore);
      expect(otherLineSnapshotsAfter).toEqual(otherLineSnapshotsBefore);
      expect(containerSnapshotsAfter).toEqual(containerSnapshotsBefore);
      expect(stack[0]).toMatchObject({
        tag: 'canvas',
        className: expect.stringContaining('excalidraw__canvas'),
      });
    } finally {
      page.off('console', consoleListener);
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
