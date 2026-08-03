import { expect, type Page } from '@playwright/test';

export async function waitForE2EBridge(page: Page, timeout = 90_000): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    const bridge = window.__COLLABBOARD_E2E__;
    if (!bridge) return 'missing';
    if (bridge.version !== 1) return `bad-version:${String(bridge.version)}`;
    if (typeof bridge.instanceId !== 'string' || bridge.instanceId.length === 0) return 'missing-instance';
    for (const key of ['getSceneElements', 'getViewport', 'getInteractionState', 'getSceneRevision', 'subscribeToSceneChange'] as const) {
      if (typeof bridge[key] !== 'function') return `missing-method:${key}`;
    }
    return 'ready';
  }), { timeout, intervals: [100, 250, 500, 1_000] }).toBe('ready');
}
