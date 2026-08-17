import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120_000);
test.use({ viewport: { width: 1800, height: 1100 } });

async function seedAndSelect(page: Page) {
  await page.goto('/e2e-fixtures/drawing-container-resize');
  await page.waitForFunction(() => !!(window as any).__drawingResizeFixture?.apiRef?.current);
  await page.evaluate(() => {
    const api = (window as any).__drawingResizeFixture.apiRef.current;
    const make = (id: string, link: string, x: number, y: number, width: number, height: number, index: string, locked: boolean) => ({
      id, type: 'embeddable', x, y, width, height, angle: 0,
      strokeColor: 'transparent', backgroundColor: 'transparent', fillStyle: 'solid',
      strokeWidth: 1, strokeStyle: 'solid', roughness: 0, opacity: 100,
      seed: id.length * 1234, version: 1, versionNonce: id.length * 9876, index,
      isDeleted: false, groupIds: [], frameId: null, roundness: null,
      boundElements: null, updated: Date.now(), link, locked, customData: { fixture: id },
    });
    api.updateScene({ elements: [
      make('element-container-fixture', 'padlet://container-fixture', 180, 160, 500, 280, 'a0', true),
      make('element-neighbor-fixture', 'padlet://neighbor-fixture', 700, 250, 320, 180, 'a1', false),
    ] });
  });
  await page.locator('[data-padlet-id="container-fixture"] > div').first().click({ position: { x: 20, y: 10 } });
  await expect(page.locator('[data-post-resize-handle="true"]')).toBeVisible();
}

async function scene(page: Page) {
  return page.evaluate(() => {
    const el = (window as any).__drawingResizeFixture.apiRef.current.getSceneElements()
      .find((item: any) => item.link === 'padlet://container-fixture');
    return { id: el.id, link: el.link, x: el.x, y: el.y, width: el.width, height: el.height, angle: el.angle, version: el.version, locked: el.locked };
  });
}

async function hit(page: Page) {
  return page.evaluate(() => {
    const handle = document.querySelector<HTMLElement>('[data-post-resize-handle="true"]');
    if (!handle) return { ok: false, width: 0, height: 0, stack: [] as string[] };
    const rect = handle.getBoundingClientRect();
    const winner = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      ok: !!winner?.closest('[data-post-resize-handle="true"]'),
      width: rect.width,
      height: rect.height,
      stack: document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        .slice(0, 8)
        .map((node) => `${node.tagName}.${String(node.className)}:${node.getAttribute('data-post-resize-handle')}`),
    };
  });
}

async function gutterGeometry(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('[data-padlet-id="container-fixture"]')!;
    const outer = card.closest<HTMLElement>('.excalidraw__embeddable__outer')!;
    const content = Array.from(card.children).find((node) => node.classList.contains('p-2')) as HTMLElement;
    const rowRoot = content.firstElementChild!.firstElementChild as HTMLElement;
    const cardStyle = getComputedStyle(card);
    const contentStyle = getComputedStyle(content);
    const rowStyle = getComputedStyle(rowRoot);
    return {
      left: (parseFloat(cardStyle.borderLeftWidth) || 0) + (parseFloat(contentStyle.paddingLeft) || 0) + (parseFloat(rowStyle.paddingLeft) || 0),
      right: (parseFloat(cardStyle.borderRightWidth) || 0) + (parseFloat(contentStyle.paddingRight) || 0) + (parseFloat(rowStyle.paddingRight) || 0),
      wrapperPadding: parseFloat(getComputedStyle(outer).paddingLeft) || 0,
      cardOverflowX: cardStyle.overflowX,
      contentOverflowX: contentStyle.overflowX,
    };
  });
}

// Product convergence readiness, not a machine-speed guess. A reconciliation
// that changes padlet.metadata (orientation, child membership) intentionally
// changes getPadletRenderSignature and remounts DrawingEmbeddableCard -- the
// handle and its portal briefly do not exist while React/Excalidraw's own
// internal scheduling completes that remount. Poll for that convergence
// instead of asserting on a fixed clock tick.
async function waitForHandleReady(page: Page, timeoutMs = 5000) {
  await expect.poll(async () => (await hit(page)).ok, { timeout: timeoutMs }).toBe(true);
}

// PATCH POST-RESIZE-B3.2.2: verifies the actual fix -- a metadata-triggered
// reconciliation of the Container's card must NOT drop app-level selection
// (ContainerResizeSelectionStore), the handle must remain (or reappear)
// without any re-click, and the Container stays immediately resizable. The
// Container's own outer DOM node (`[data-padlet-id]`) is stable across this
// (confirmed live -- it is the selection-gated handle/portal subtree that
// toggles away and back, not the whole card); this marker proves that
// stability rather than assuming a full remount that doesn't actually occur.
async function switchOrientationAndVerify(page: Page, orientation: 'vertical' | 'horizontal', label: string, resizeDelta = 40) {
  await page.evaluate(() => {
    const card = document.querySelector('[data-padlet-id="container-fixture"]');
    if (card) (card as any).__b322CardIdentityMarker = true;
  });

  await page.evaluate((nextOrientation) => {
    const api = (window as any).__drawingResizeFixture;
    const current = api.getPadlets().find((padlet: any) => padlet.id === 'container-fixture');
    api.updateContainer({ metadata: { ...current.metadata, orientation: nextOrientation } });
  }, orientation);

  await waitForHandleReady(page);

  const cardIdentityStable = await page.evaluate(() => {
    const card = document.querySelector('[data-padlet-id="container-fixture"]');
    return !!(card as any)?.__b322CardIdentityMarker;
  });
  expect(cardIdentityStable, `${label}: Container's own card DOM node is stable across reconciliation`).toBe(true);

  const hitResult = await hit(page);
  expect(hitResult.ok, `${label}: handle survives remount without a re-click`).toBe(true);
  expect(await page.locator('[data-post-resize-handle="true"]').count(), `${label}: exactly one handle`).toBe(1);

  const before = await scene(page);
  await dragWorld(page, resizeDelta);
  expect((await scene(page)).width - before.width, `${label}: immediate post-transition resize applied`).toBe(resizeDelta);
}

async function dragWorld(page: Page, dx: number, dy = 0, settleMs = 350) {
  await waitForHandleReady(page);
  const box = await page.locator('[data-post-resize-handle="true"]').boundingBox();
  expect(box).not.toBeNull();
  const zoom = await page.evaluate(() => (window as any).__drawingResizeFixture.apiRef.current.getAppState().zoom.value);
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx * zoom, y + dy * zoom, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(settleMs);
}

async function setZoomAndCenter(page: Page, zoom: number) {
  await page.evaluate((value) => {
    const api = (window as any).__drawingResizeFixture.apiRef.current;
    const el = api.getSceneElements().find((item: any) => item.link === 'padlet://container-fixture');
    api.updateScene({ appState: {
      zoom: { value },
      scrollX: 900 / value - (el.x + el.width / 2),
      scrollY: 550 / value - (el.y + el.height / 2),
    } });
  }, zoom);
  await page.waitForTimeout(150);
  await page.evaluate((value) => {
    const api = (window as any).__drawingResizeFixture.apiRef.current;
    const state = api.getAppState();
    const rect = document.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!.getBoundingClientRect();
    api.updateScene({ appState: {
      scrollX: state.scrollX + (900 - (rect.x + rect.width / 2)) / value,
      scrollY: state.scrollY + (550 - (rect.y + rect.height / 2)) / value,
    } });
  }, zoom);
  await page.waitForTimeout(200);
}

test('real Excalidraw keeps Drawing Container resize chrome hittable through repeated scene updates', async ({ page }) => {
  const backendRequests: string[] = [];
  page.on('request', (request) => {
    if (/supabase|postgrest/i.test(request.url())) backendRequests.push(request.url());
  });
  await seedAndSelect(page);
  const initial = await scene(page);

  const sequence: Array<[string, number]> = [
    ['grow', 100], ['shrink', -50], ['grow', 80], ['minimum', -2000],
    ['grow', 120], ['no-op', 0],
  ];
  const gutters = [await gutterGeometry(page)];
  for (const [, dx] of sequence) {
    await dragWorld(page, dx);
    gutters.push(await gutterGeometry(page));
  }
  for (const geometry of gutters) {
    expect(geometry.left).toBe(15);
    expect(geometry.right).toBe(15);
    expect(geometry.wrapperPadding).toBe(1);
    expect(geometry.cardOverflowX).toBe('hidden');
    expect(geometry.contentOverflowX).toBe('hidden');
  }
  expect((await scene(page)).width).toBe(480);

  await page.evaluate(() => (window as any).__drawingResizeFixture.failNext());
  const failureOrigin = (await scene(page)).width;
  await dragWorld(page, 100, 0, 650);
  expect((await scene(page)).width).toBe(failureOrigin);
  for (const dx of [100, -40, 60]) await dragWorld(page, dx);
  expect((await scene(page)).width).toBe(600);

  // Negative control for the actual root cause. Lowering only the scoped
  // interaction layer recreates the failure; native lock state does not.
  const loweredWinner = await page.evaluate(() => {
    const portal = document.querySelector<HTMLElement>('[data-drawing-container-resize-portal="true"]')!;
    portal.style.zIndex = '1';
    const handle = document.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;
    const rect = handle.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      ?.closest('[data-padlet-id]')?.getAttribute('data-padlet-id');
  });
  expect(loweredWinner).toBe('neighbor-fixture');
  for (const locked of [false, true]) {
    await page.evaluate((nextLocked) => {
      const api = (window as any).__drawingResizeFixture.apiRef.current;
      api.updateScene({ elements: api.getSceneElements().map((el: any) => el.link === 'padlet://container-fixture'
        ? { ...el, locked: nextLocked, version: el.version + 1 }
        : el) });
    }, locked);
    expect(await page.evaluate(() => {
      const handle = document.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;
      const rect = handle.getBoundingClientRect();
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        ?.closest('[data-padlet-id]')?.getAttribute('data-padlet-id');
    })).toBe('neighbor-fixture');
  }
  await page.evaluate(() => { document.querySelector<HTMLElement>('[data-drawing-container-resize-portal="true"]')!.style.zIndex = '3'; });
  expect((await hit(page)).ok).toBe(true);

  const beforeVerticalOnly = await scene(page);
  await dragWorld(page, 0, 200);
  expect((await scene(page)).width).toBe(beforeVerticalOnly.width);

  for (const zoom of [0.1, 0.25, 0.5, 1, 1.5, 2]) {
    await setZoomAndCenter(page, zoom);
    const before = await scene(page);
    const grip = await hit(page);
    expect(grip.ok).toBe(true);
    expect(grip.width).toBeCloseTo(28, 1);
    await dragWorld(page, 200);
    expect((await scene(page)).width - before.width).toBe(200);
  }

  await setZoomAndCenter(page, 1);
  const beforeRemote = await scene(page);
  await page.evaluate((width) => (window as any).__drawingResizeFixture.updateContainer({ width }), beforeRemote.width - 125);
  await expect.poll(async () => (await scene(page)).width).toBe(beforeRemote.width - 125);
  await dragWorld(page, 25);

  // PATCH POST-RESIZE-B3.2.2: the B3R failure was an intermittent race
  // immediately after a Vertical -> Horizontal orientation switch, root-
  // caused to a spurious native click (landing on raw canvas, or on the
  // Container's own card body) reaching the app's blank-canvas deselect
  // handler shortly after a metadata-triggered remount. Exercise repeated
  // alternating transitions -- not just one -- with no re-click, verifying
  // selection/handle survive a genuine remount each time.
  // Alternate the per-transition resize delta (grow/shrink) so accumulated
  // width stays roughly flat across the sequence -- this loop is stacked on
  // top of the width already grown earlier in the test (zoom sweep, remote
  // update), and a viewport is finite; net-positive growth here would
  // eventually push the handle off-screen for reasons that have nothing to
  // do with the defect being verified.
  for (const [orientation, delta] of [
    ['horizontal', 40], ['vertical', -40], ['horizontal', 40], ['vertical', -40], ['horizontal', 40], ['vertical', -40],
  ] as const) {
    await switchOrientationAndVerify(page, orientation, `orientation->${orientation}`, delta);
  }
  // Auto-grow below is horizontal-orientation behavior; the alternating
  // sequence above intentionally ends on vertical, so restore horizontal
  // (itself one more verified transition) before relying on it.
  await switchOrientationAndVerify(page, 'horizontal', 'orientation->horizontal (pre-auto-grow)', 0);

  const beforeAutoGrow = await scene(page);
  await page.evaluate((width) => (window as any).__drawingResizeFixture.updateChild('child-wide-fixture', { width }), beforeAutoGrow.width + 500);
  await expect.poll(async () => (await scene(page)).width).toBeGreaterThan(beforeAutoGrow.width);
  await dragWorld(page, 50);

  // A child removal changes natural height/intrinsic width but never
  // auto-shrinks the outer width. The next manual gesture remains hittable
  // without a re-click (same class of defect as the orientation loop above).
  const beforeRemoval = await scene(page);
  await page.evaluate(() => (window as any).__drawingResizeFixture.removeChild('child-wide-fixture'));
  await waitForHandleReady(page);
  expect((await scene(page)).width).toBe(beforeRemoval.width);
  await dragWorld(page, -1000);

  const final = await scene(page);
  expect(final.id).toBe(initial.id);
  expect(final.link).toBe(initial.link);
  expect(final.x).toBe(initial.x);
  expect(final.y).toBe(initial.y);
  expect(final.angle).toBe(initial.angle);
  expect(final.locked).toBe(true);
  expect(await page.locator('[data-drawing-container-resize-portal="true"]').count()).toBe(1);
  expect(backendRequests).toEqual([]);

  const writes = await page.evaluate(() => (window as any).__drawingResizeFixture.writes());
  const strictWidthWrites = writes.filter((write: any) => write.strict && Object.keys(write.updates).length === 1 && typeof write.updates.width === 'number');
  expect(strictWidthWrites.length).toBeGreaterThan(10);
  expect(strictWidthWrites.every((write: any) => !('height' in write.updates) && !('metadata' in write.updates))).toBe(true);
});
