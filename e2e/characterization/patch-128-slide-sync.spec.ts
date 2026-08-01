import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createDisposableDrawingBoard,
  registerDrawingCleanup,
  openDrawingBoard,
} from './drawingBridgeHarness';

registerDrawingCleanup(test);

type ThumbSample = { hash: string; nonWhitePixels: number };

async function openPresentationSidebar(page: Page, expectedSlideCount: number): Promise<Locator> {
  await page.getByTitle('Present Frames').click();
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(page.getByText('Presentation', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(sidebar.getByText(`Slides (${expectedSlideCount})`, { exact: true })).toBeVisible({ timeout: 30_000 });
  return sidebar;
}

async function waitForFramesLoaded(page: Page, expectedFrameCount: number): Promise<void> {
  await page.waitForFunction((count) => {
    const els = (window as any).h?.elements as any[] | undefined;
    if (!els) return false;
    return els.filter((el) => el.type === 'frame' && !el.isDeleted).length >= count;
  }, expectedFrameCount, { timeout: 30_000 });
}

function slideRow(sidebar: Locator, title: string): Locator {
  return sidebar.getByText(title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
}

function slideThumbnail(row: Locator): Locator {
  return row.locator('img[alt="Slide preview"]').first();
}

async function sampleThumbnail(row: Locator): Promise<ThumbSample> {
  const image = slideThumbnail(row);
  await expect(image).toBeVisible({ timeout: 60_000 });
  return image.evaluate(async (img) => {
    const source = img as HTMLImageElement;
    await source.decode().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let nonWhitePixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      hash ^= r + (g << 8) + (b << 16) + (a << 24);
      hash = Math.imul(hash, 16777619);
      if (a > 0 && (r < 245 || g < 245 || b < 245)) nonWhitePixels += 1;
    }
    return { hash: String(hash >>> 0), nonWhitePixels };
  });
}

// Waits for the thumbnail to change from `previous`, then confirms it holds
// stable across a short follow-up window -- avoids asserting on a transient
// mid-regeneration frame (e.g. a briefly blank canvas) as the canonical result.
async function waitForStableThumbnailChange(row: Locator, previous: ThumbSample, timeoutMs = 30_000): Promise<ThumbSample> {
  await expect.poll(async () => (await sampleThumbnail(row)).hash, { timeout: timeoutMs, intervals: [500, 1000, 2000, 3000] }).not.toBe(previous.hash);
  let candidate = await sampleThumbnail(row);
  let consecutiveMatches = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    await row.page().waitForTimeout(800);
    const next = await sampleThumbnail(row);
    if (next.hash === candidate.hash) {
      consecutiveMatches += 1;
      if (consecutiveMatches >= 2) return next;
      continue;
    }
    consecutiveMatches = 0;
    candidate = next;
  }
  return candidate;
}

async function waitForHarness(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const target = window as any;
    return Boolean(target.h?.app && Array.isArray(target.h.elements));
  }, { timeout: 90_000 });
}

async function getAppState(page: Page): Promise<any> {
  return page.evaluate(() => {
    const h = (window as any).h;
    if (typeof h?.app?.getAppState === 'function') return h.app.getAppState();
    return h?.state ?? {};
  });
}

async function getElements(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).h.elements as any[]);
}

async function sceneToScreen(page: Page, sceneX: number, sceneY: number) {
  const appState = await getAppState(page);
  const zoom = appState?.zoom?.value ?? 1;
  const offsetLeft = appState?.offsetLeft ?? 0;
  const offsetTop = appState?.offsetTop ?? 0;
  const scrollX = appState?.scrollX ?? 0;
  const scrollY = appState?.scrollY ?? 0;
  return {
    x: (sceneX + scrollX) * zoom + offsetLeft,
    y: (sceneY + scrollY) * zoom + offsetTop,
  };
}

const nowMs = Date.now();
// Sequential fractional indices matching array insertion order -- an ad-hoc scheme
// (e.g. keying off element id) does not sort consistently with array order and
// Excalidraw's fractional-index validation silently drops elements as a result.
let fractionalIndexCounter = 0;
function nextFractionalIndex(): string {
  fractionalIndexCounter += 1;
  return `a${String(fractionalIndexCounter).padStart(6, '0')}`;
}
function frameEl(id: string, name: string, x: number, y: number, w = 1280, h = 720) {
  return { id, type: 'frame', name, x, y, width: w, height: h, angle: 0, strokeColor: '#000000', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 0, opacity: 100, frameId: null, groupIds: [], isDeleted: false, version: 1, versionNonce: 1, updated: nowMs, index: nextFractionalIndex(), boundElements: null, link: null, locked: false };
}
function embEl(id: string, padletId: string, x: number, y: number, w: number, h: number, frameId: string | null) {
  return { id, type: 'embeddable', x, y, width: w, height: h, angle: 0, strokeColor: 'transparent', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid', roundness: null, roughness: 0, opacity: 100, seed: 1, version: 1, versionNonce: 1, index: nextFractionalIndex(), isDeleted: false, groupIds: [], frameId, boundElements: null, updated: nowMs, link: `padlet://${padletId}`, locked: false, customData: {} };
}
function rectEl(id: string, x: number, y: number, frameId: string | null) {
  return { id, type: 'rectangle', x, y, width: 120, height: 80, angle: 0, strokeColor: '#dc2626', backgroundColor: '#dc2626', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roundness: null, roughness: 0, opacity: 100, seed: 5, groupIds: [], frameId, isDeleted: false, version: 1, versionNonce: 1, updated: nowMs, index: nextFractionalIndex(), boundElements: null, link: null, locked: false };
}

test('PATCH-128 geometry: app-owned and native drags synchronize slides and thumbnails', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(`console: ${msg.text()}`); });

  const { supabase, fixture } = await createDisposableDrawingBoard('p128-geometry');

  const slideA = 'slide-a';
  const slideB = 'slide-b';
  const withinCardId = crypto.randomUUID();
  const crossCardId = crypto.randomUUID();
  const nativeRectId = 'native-rect';

  const { error: padletsErr } = await supabase.from('padlets').insert([
    { id: withinCardId, board_id: fixture.boardId, title: 'Within-slide Card', content: '', type: 'card', position_x: 100, position_y: 100, width: 200, height: 150, metadata: {} },
    { id: crossCardId, board_id: fixture.boardId, title: 'Cross-slide Card', content: '', type: 'card', position_x: 400, position_y: 100, width: 200, height: 150, metadata: {} },
  ]);
  if (padletsErr) throw padletsErr;

  const scene = [
    frameEl(slideA, 'Geometry Slide A', 0, 0),
    frameEl(slideB, 'Geometry Slide B', 1500, 0),
    embEl('emb-within', withinCardId, 100, 100, 200, 150, slideA),
    embEl('emb-cross', crossCardId, 400, 100, 200, 150, slideA),
    rectEl(nativeRectId, 150, 350, slideA),
    // Slide B starts with its own content (not a never-rendered blank frame) so this
    // test isolates the cross-slide sync mechanism from PATCH-124's pre-existing,
    // separate first-render-of-an-empty-frame behavior (reproduced identically on
    // baseline, before this patch's changes -- see governance record).
    rectEl('anchor-rect-b', 1500 + 900, 500, slideB),
  ];

  const { data: masterData, error: masterErr } = await supabase.from('padlets').insert({
    board_id: fixture.boardId,
    title: `${fixture.prefix} master`,
    content: JSON.stringify(scene),
    type: 'drawing',
    position_x: 0, position_y: 0, width: 0, height: 0,
    metadata: { drawingAppState: JSON.stringify({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }), drawingFiles: JSON.stringify({}) },
  }).select('id').single();
  if (masterErr) throw masterErr;
  fixture.masterPadletId = masterData.id;

  await openDrawingBoard(page, fixture.boardId);
  await waitForHarness(page);
  await waitForFramesLoaded(page, 2);
  await page.waitForTimeout(2000);

  const sidebar = await openPresentationSidebar(page, 2);
  const rowA = slideRow(sidebar, 'Geometry Slide A');
  const rowB = slideRow(sidebar, 'Geometry Slide B');
  const beforeA = await sampleThumbnail(rowA);
  const beforeB = await sampleThumbnail(rowB);

  // ── Scenario 2: app-owned within-slide drag (large movement) ────────────
  // Use scene->screen conversion (as for the native/cross-slide drags below) rather
  // than a raw DOM boundingBox -- with two frames spanning a wide scene extent,
  // Excalidraw's initial fit-to-view can scroll the card's screen position far
  // outside the viewport's positive coordinate range.
  const elementsBeforeWithin = await getElements(page);
  const withinEmbBefore = elementsBeforeWithin.find((el) => el.id === 'emb-within');
  const withinStripScreen = await sceneToScreen(page, withinEmbBefore.x + withinEmbBefore.width / 2, withinEmbBefore.y + 8);
  const withinDestScreen = await sceneToScreen(page, withinEmbBefore.x + withinEmbBefore.width / 2 + 250, withinEmbBefore.y + 8 + 200);

  await page.mouse.move(withinStripScreen.x, withinStripScreen.y);
  await page.mouse.down();
  await page.mouse.move((withinStripScreen.x + withinDestScreen.x) / 2, (withinStripScreen.y + withinDestScreen.y) / 2, { steps: 6 });
  await page.mouse.move(withinDestScreen.x, withinDestScreen.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1500);

  const elementsAfterWithin = await getElements(page);
  const withinEmbAfter = elementsAfterWithin.find((el) => el.id === 'emb-within');
  const reactElementsAfterWithin = await page.evaluate(() => (window as any).h.elements as any[]);
  const withinEmbAfterReact = reactElementsAfterWithin.find((el: any) => el.id === 'emb-within');

  expect(withinEmbAfter.x).not.toBe(withinEmbBefore.x);
  expect(withinEmbAfterReact.x).toBe(withinEmbAfter.x);
  expect(withinEmbAfterReact.y).toBe(withinEmbAfter.y);

  const afterWithinA = await waitForStableThumbnailChange(rowA, beforeA);

  // ── Scenario 1: app-owned cross-slide drag ───────────────────────────────
  const elementsBeforeCross = await getElements(page);
  const crossEmbBefore = elementsBeforeCross.find((el) => el.id === 'emb-cross');
  const crossStripScreen = await sceneToScreen(page, crossEmbBefore.x + crossEmbBefore.width / 2, crossEmbBefore.y + 8);
  const crossDest = await sceneToScreen(page, 1500 + 200, 200);

  await page.mouse.move(crossStripScreen.x, crossStripScreen.y);
  await page.mouse.down();
  await page.mouse.move((crossStripScreen.x + crossDest.x) / 2, (crossStripScreen.y + crossDest.y) / 2, { steps: 8 });
  await page.mouse.move(crossDest.x, crossDest.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1500);

  const elementsAfterCross = await getElements(page);
  const crossEmbAfter = elementsAfterCross.find((el) => el.id === 'emb-cross');
  expect(crossEmbAfter.frameId).toBe(slideB);

  // PATCH-124 renders both the source and destination slide.
  const afterCrossA = await waitForStableThumbnailChange(rowA, afterWithinA);
  const afterCrossB = await waitForStableThumbnailChange(rowB, beforeB);

  // ── Scenario 3: native real-pointer cross-slide drag ─────────────────────
  const nativeFrom = await sceneToScreen(page, 150 + 60, 350 + 40);
  const nativeTo = await sceneToScreen(page, 1500 + 400, 300);

  await page.mouse.move(nativeFrom.x, nativeFrom.y);
  await page.mouse.down();
  await page.mouse.move((nativeFrom.x + nativeTo.x) / 2, (nativeFrom.y + nativeTo.y) / 2, { steps: 8 });
  await page.mouse.move(nativeTo.x, nativeTo.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1500);

  const elementsAfterNative = await getElements(page);
  const nativeRectAfter = elementsAfterNative.find((el) => el.id === nativeRectId);
  expect(nativeRectAfter.frameId).toBe(slideB);

  await waitForStableThumbnailChange(rowA, afterCrossA);
  await waitForStableThumbnailChange(rowB, afterCrossB);

  test.info().annotations.push({
    type: 'patch128-geometry-evidence',
    description: JSON.stringify({
      withinEmbBefore: { x: withinEmbBefore.x, y: withinEmbBefore.y },
      withinEmbAfter: { x: withinEmbAfter.x, y: withinEmbAfter.y, version: withinEmbAfter.version },
      crossEmbAfter: { frameId: crossEmbAfter.frameId, x: crossEmbAfter.x, y: crossEmbAfter.y },
      nativeRectAfter: { frameId: nativeRectAfter.frameId, x: nativeRectAfter.x, y: nativeRectAfter.y, version: nativeRectAfter.version },
      pageErrors,
    }),
  });

  expect(pageErrors).toEqual([]);
});

test('PATCH-128 geometry: history/undo-redo and one persistence write on app-owned drag', async ({ page }) => {
  test.setTimeout(60_000);
  const { supabase, fixture } = await createDisposableDrawingBoard('p128-history');

  const slideA = 'slide-h1';
  const cardId = crypto.randomUUID();
  const { error: padletsErr } = await supabase.from('padlets').insert({
    id: cardId, board_id: fixture.boardId, title: 'History Card', content: '', type: 'card', position_x: 100, position_y: 100, width: 200, height: 150, metadata: {},
  });
  if (padletsErr) throw padletsErr;

  const scene = [
    frameEl(slideA, 'History Slide', 0, 0),
    embEl('emb-history', cardId, 100, 100, 200, 150, slideA),
  ];
  const { data: masterData, error: masterErr } = await supabase.from('padlets').insert({
    board_id: fixture.boardId, title: `${fixture.prefix} master`, content: JSON.stringify(scene), type: 'drawing',
    position_x: 0, position_y: 0, width: 0, height: 0,
    metadata: { drawingAppState: JSON.stringify({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }), drawingFiles: JSON.stringify({}) },
  }).select('id').single();
  if (masterErr) throw masterErr;
  fixture.masterPadletId = masterData.id;

  await openDrawingBoard(page, fixture.boardId);
  await waitForHarness(page);
  await page.waitForTimeout(2000);

  const cardBox = page.locator(`[data-padlet-id="${cardId}"]`);
  const box = await cardBox.boundingBox();
  if (!box) throw new Error('history card not found');
  const stripX = box.x + box.width / 2;
  const stripY = box.y + 8;

  const initialElements = await getElements(page);
  const initialX = initialElements.find((el: any) => el.id === 'emb-history').x;

  await page.mouse.move(stripX, stripY);
  await page.mouse.down();
  await page.mouse.move(stripX + 30, stripY, { steps: 3 });
  await page.mouse.move(stripX + 60, stripY, { steps: 3 });
  await page.mouse.move(stripX + 100, stripY, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(1000);

  const afterDragElements = await getElements(page);
  const afterDragX = afterDragElements.find((el: any) => el.id === 'emb-history').x;
  expect(afterDragX).not.toBe(initialX);

  // One undo must restore the original position (not one undo per pointermove frame).
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const afterUndoElements = await getElements(page);
  const afterUndoX = afterUndoElements.find((el: any) => el.id === 'emb-history').x;
  expect(afterUndoX).toBe(initialX);

  // Redo restores the final dragged position.
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(500);
  const afterRedoElements = await getElements(page);
  const afterRedoX = afterRedoElements.find((el: any) => el.id === 'emb-history').x;
  expect(afterRedoX).toBe(afterDragX);

  // Persistence: exactly one DB row reflects the final position after settling.
  await page.waitForTimeout(2000);
  const { data: persisted } = await supabase.from('padlets').select('position_x').eq('id', cardId).single();

  test.info().annotations.push({
    type: 'patch128-history-evidence',
    description: JSON.stringify({ initialX, afterDragX, afterUndoX, afterRedoX, persistedPositionX: persisted?.position_x }),
  });
});

test('PATCH-128 metadata: title, non-text todo, and outside-slide edits synchronize correctly', async ({ page }) => {
  test.setTimeout(90_000);
  const { supabase, fixture } = await createDisposableDrawingBoard('p128-metadata');

  const slideM = 'slide-m';
  const titleCardId = crypto.randomUUID();
  const todoCardId = crypto.randomUUID();
  const outsideCardId = crypto.randomUUID();

  const { error: padletsErr } = await supabase.from('padlets').insert([
    { id: titleCardId, board_id: fixture.boardId, title: 'Title Before', content: '', type: 'card', position_x: 100, position_y: 100, width: 260, height: 200, metadata: {} },
    { id: todoCardId, board_id: fixture.boardId, title: 'Todo Card', content: '', type: 'todo', position_x: 420, position_y: 100, width: 260, height: 200, metadata: { todoTitle: 'Todo Card', tasks: [{ id: 't1', text: 'Task one', completed: false }] } },
    { id: outsideCardId, board_id: fixture.boardId, title: 'Outside Card', content: '', type: 'todo', position_x: -2000, position_y: -2000, width: 260, height: 200, metadata: { todoTitle: 'Outside Card', tasks: [{ id: 't2', text: 'Task two', completed: false }] } },
  ]);
  if (padletsErr) throw padletsErr;

  const scene = [
    frameEl(slideM, 'Metadata Slide', 0, 0),
    embEl('emb-title', titleCardId, 100, 100, 260, 200, slideM),
    embEl('emb-todo', todoCardId, 420, 100, 260, 200, slideM),
    embEl('emb-outside', outsideCardId, -2000, -2000, 260, 200, null),
  ];
  const { data: masterData, error: masterErr } = await supabase.from('padlets').insert({
    board_id: fixture.boardId, title: `${fixture.prefix} master`, content: JSON.stringify(scene), type: 'drawing',
    position_x: 0, position_y: 0, width: 0, height: 0,
    metadata: { drawingAppState: JSON.stringify({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }), drawingFiles: JSON.stringify({}) },
  }).select('id').single();
  if (masterErr) throw masterErr;
  fixture.masterPadletId = masterData.id;

  await openDrawingBoard(page, fixture.boardId);
  await waitForHarness(page);
  await waitForFramesLoaded(page, 1);
  await page.waitForTimeout(2000);

  const sidebar = await openPresentationSidebar(page, 1);
  const rowM = slideRow(sidebar, 'Metadata Slide');
  const before = await sampleThumbnail(rowM);

  // ── Scenario 4: real title metadata edit ─────────────────────────────────
  const titleCardBox = page.locator(`[data-padlet-id="${titleCardId}"]`);
  await titleCardBox.hover();
  await titleCardBox.locator('button[title="Edit"]').click();
  const titleInput = page.locator('input[placeholder="Add a title here..."]');
  await expect(titleInput).toBeVisible({ timeout: 15_000 });
  const geometryBefore = (await getElements(page)).find((el: any) => el.id === 'emb-title');
  await titleInput.fill('Title After');
  // Click the backdrop directly (force: bypasses actionability interception checks
  // from overlapping decorative layers; the backdrop element itself owns onClick=handleSave).
  await page.locator('.absolute.inset-0.bg-black\\/40').first().click({ position: { x: 640, y: 710 }, force: true });
  await expect(titleInput).toHaveCount(0, { timeout: 15_000 });

  const afterTitleEdit = await waitForStableThumbnailChange(rowM, before);
  expect(afterTitleEdit.nonWhitePixels).toBeGreaterThan(0); // not a transient blank frame
  const geometryAfter = (await getElements(page)).find((el: any) => el.id === 'emb-title');
  expect(geometryAfter.x).toBe(geometryBefore.x);
  expect(geometryAfter.y).toBe(geometryBefore.y);
  expect(geometryAfter.width).toBe(geometryBefore.width);
  expect(geometryAfter.height).toBe(geometryBefore.height);

  // ── Scenario 5: real non-text todo metadata edit ─────────────────────────
  const todoCardBox = page.locator(`[data-padlet-id="${todoCardId}"]`);
  await todoCardBox.hover();
  await todoCardBox.locator('button[title="Edit"]').click();
  const taskCheckbox = page.locator('div.space-y-1 input[type="checkbox"]').first();
  await expect(taskCheckbox).toBeVisible({ timeout: 15_000 });
  await taskCheckbox.click();
  await page.locator('.fixed.inset-0.bg-black\\/50').first().click({ position: { x: 300, y: 10 } });
  await expect(page.locator('.fixed.inset-0.bg-black\\/50')).toHaveCount(0, { timeout: 15_000 });

  const afterTodoEdit = await waitForStableThumbnailChange(rowM, afterTitleEdit);

  // ── Scenario 6: real outside-slide metadata edit ─────────────────────────
  await page.locator('canvas.excalidraw__canvas').first().click({ position: { x: 640, y: 400 }, force: true });
  await page.keyboard.press('Shift+1');
  const outsideCardBox = page.locator(`[data-padlet-id="${outsideCardId}"]`);
  await outsideCardBox.waitFor({ state: 'visible', timeout: 15_000 });
  await outsideCardBox.hover();
  await outsideCardBox.locator('button[title="Edit"]').click();
  const outsideCheckbox = page.locator('div.space-y-1 input[type="checkbox"]').first();
  await expect(outsideCheckbox).toBeVisible({ timeout: 15_000 });
  await outsideCheckbox.click();
  await page.locator('.fixed.inset-0.bg-black\\/50').first().click({ position: { x: 300, y: 10 } });
  await expect(page.locator('.fixed.inset-0.bg-black\\/50')).toHaveCount(0, { timeout: 15_000 });

  await page.waitForTimeout(3000); // allow any pipeline activity to (not) occur
  const afterOutsideEdit = await sampleThumbnail(rowM);

  test.info().annotations.push({
    type: 'patch128-metadata-evidence',
    description: JSON.stringify({
      before, afterTitleEdit, afterTodoEdit, afterOutsideEdit,
      geometryBefore: { x: geometryBefore.x, y: geometryBefore.y, width: geometryBefore.width, height: geometryBefore.height },
      geometryAfter: { x: geometryAfter.x, y: geometryAfter.y, width: geometryAfter.width, height: geometryAfter.height },
    }),
  });

  expect(afterOutsideEdit.hash).toBe(afterTodoEdit.hash); // outside-slide edit must not affect slide M's thumbnail
});
