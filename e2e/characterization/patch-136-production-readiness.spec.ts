import { expect, test } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { hasE2ECredentials } from '../helpers/env';
import {
  createDisposableDrawingBoard,
  openDrawingBoard,
  registerDrawingCleanup,
  seedDrawingContainers,
  seedPresentationScene,
} from './drawingBridgeHarness';
import { waitForE2EBridge } from './e2eBridge';

registerDrawingCleanup(test);

const root = process.cwd();
const nextDir = path.join(root, '.next');
const markerPath = path.join(nextDir, 'E2E_BRIDGE_BUILD');
const realModule = 'bridgeRegistration.e2e';
const realMarker = 'COLLABBOARD_E2E_REAL_BRIDGE_REGISTRATION_V1';

function emittedFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(path.join(nextDir, 'static'));
  walk(path.join(nextDir, 'server'));
  return files;
}

function countHits(marker: string): number {
  return emittedFiles().filter((file) => readFileSync(file, 'utf8').includes(marker)).length;
}

test.describe('PATCH-136 build-time E2E bridge selection', () => {
  test('artifact module selection is explicit and exact', () => {
    expect(existsSync(path.join(nextDir, 'BUILD_ID'))).toBe(true);
    const config = readFileSync(path.join(root, 'next.config.ts'), 'utf8');
    expect(config).toContain('E2E_BRIDGE_BUILD === "1"');
    expect(config).toContain('lib/e2e/bridgeRegistration.ts")}$`');
    expect(config).toContain('lib/e2e/bridgeRegistration.e2e.ts');
    expect(config).toContain('collabboard-e2e-bridge:${E2E_BRIDGE_BUILD ? "on" : "off"}');
    expect(config).toContain('NormalModuleReplacementPlugin(/^node:/');
    expect(config).not.toContain('@/lib/e2e/bridgeRegistration$');
  });

  test('ordinary artifact excludes the real bridge or E2E artifact contains it once', () => {
    if (!existsSync(markerPath)) {
      execFileSync(process.execPath, ['scripts/e2e/assertBridgeExclusion.mjs'], { cwd: root, stdio: 'pipe' });
      expect(countHits(realModule)).toBe(0);
      expect(countHits(realMarker)).toBe(0);
      return;
    }
    expect(readFileSync(markerPath, 'utf8').trim()).toBe('1');
    expect(countHits(realMarker)).toBe(1);
    expect(countHits('__COLLABBOARD_E2E__')).toBeGreaterThanOrEqual(1);
  });
});

test.describe('PATCH-136 production observation bridge runtime', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('bridge API is bounded, frozen, cloned, revisioned, and remount-scoped', async ({ page }) => {
    test.setTimeout(180_000);
    expect(existsSync(markerPath)).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(window.__COLLABBOARD_E2E__))).toBe(false);

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-136-bridge');
    await seedDrawingContainers(supabase, fixture);
    await seedPresentationScene(supabase, fixture);
    await openDrawingBoard(page, fixture.boardId);
    await waitForE2EBridge(page);

    const firstInstance = await page.evaluate(() => window.__COLLABBOARD_E2E__!.instanceId);
    expect(firstInstance).toEqual(expect.any(String));

    const surface = await page.evaluate(() => {
      const bridge = window.__COLLABBOARD_E2E__!;
      const scene = bridge.getSceneElements();
      const viewport = bridge.getViewport();
      const interaction = bridge.getInteractionState();
      const first = scene[0] as any;
      const before = first ? JSON.stringify(first) : null;
      try { (scene as any).push({ id: 'mutated' }); } catch {}
      try { if (first) first.id = 'mutated'; } catch {}
      const after = first ? JSON.stringify(bridge.getSceneElements()[0]) : null;
      return {
        keys: Object.keys(bridge).sort(),
        sceneFrozen: Object.isFrozen(scene),
        firstFrozen: first ? Object.isFrozen(first) : true,
        cloneUnaffected: before === after,
        viewportKeys: Object.keys(viewport).sort(),
        viewportFrozen: Object.isFrozen(viewport),
        zoomFrozen: Object.isFrozen(viewport.zoom),
        selectedFrozen: Object.isFrozen(viewport.selectedElementIds),
        interactionKeys: Object.keys(interaction).sort(),
        interactionFrozen: Object.isFrozen(interaction),
        interaction,
        hasMutationSurface: ['updateScene', 'setState', 'app', 'state', 'api'].some((key) => key in bridge),
      };
    });
    expect(surface.keys).toEqual(['getInteractionState', 'getSceneElements', 'getSceneRevision', 'getViewport', 'instanceId', 'subscribeToSceneChange', 'version']);
    expect(surface.sceneFrozen).toBe(true);
    expect(surface.firstFrozen).toBe(true);
    expect(surface.cloneUnaffected).toBe(true);
    expect(surface.viewportKeys).toEqual(['offsetLeft', 'offsetTop', 'scrollX', 'scrollY', 'selectedElementIds', 'zoom']);
    expect(surface.viewportFrozen).toBe(true);
    expect(surface.zoomFrozen).toBe(true);
    expect(surface.selectedFrozen).toBe(true);
    expect(surface.interactionKeys).toEqual(['resizingElementId']);
    expect(surface.interactionFrozen).toBe(true);
    expect(surface.interaction).toEqual({ resizingElementId: null });
    expect(surface.hasMutationSurface).toBe(false);

    const embeddable = await page.evaluate(() =>
      (window.__COLLABBOARD_E2E__!.getSceneElements() as any[])
        .find((el) => el.type === 'embeddable' && !el.isDeleted)
    );
    const viewport = await page.evaluate(() => window.__COLLABBOARD_E2E__!.getViewport());
    const startRevision = await page.evaluate(() => window.__COLLABBOARD_E2E__!.getSceneRevision());
    await page.evaluate(() => {
      const w = window as any;
      w.__patch136Revisions = [];
      w.__patch136Unsub = window.__COLLABBOARD_E2E__!.subscribeToSceneChange((revision) => {
        w.__patch136Revisions.push(revision);
      });
    });
    const x = (embeddable.x + embeddable.width / 2 + viewport.scrollX) * viewport.zoom.value + viewport.offsetLeft;
    const y = (embeddable.y + 8 + viewport.scrollY) * viewport.zoom.value + viewport.offsetTop;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__COLLABBOARD_E2E__!.getSceneRevision()), { timeout: 10_000 }).toBeGreaterThan(startRevision);
    const received = await page.evaluate(() => {
      const w = window as any;
      w.__patch136Unsub();
      w.__patch136Unsub();
      return w.__patch136Revisions;
    });
    expect(received.length).toBeGreaterThan(0);
    expect(received.every((value: unknown) => typeof value === 'number')).toBe(true);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForE2EBridge(page);
    const reloadInstance = await page.evaluate(() => window.__COLLABBOARD_E2E__!.instanceId);
    expect(reloadInstance).not.toBe(firstInstance);

    const second = await createDisposableDrawingBoard('patch-136-bridge-nav');
    await seedDrawingContainers(second.supabase, second.fixture);
    await seedPresentationScene(second.supabase, second.fixture);
    await openDrawingBoard(page, second.fixture.boardId);
    await waitForE2EBridge(page);
    const navigatedInstance = await page.evaluate(() => window.__COLLABBOARD_E2E__!.instanceId);
    expect(navigatedInstance).not.toBe(reloadInstance);
  });
});
