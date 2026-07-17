import { test, expect, type Locator, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';
import {
  assertDrawingFixtureCleanup,
  cleanupDrawingFixture,
  createDisposableDrawingBoard,
  openDrawingBoard,
  seedDrawingContainers,
  seedPresentationScene,
} from './drawingBridgeHarness';

const ROW_TITLES = ['PATCH-064 Landscape', 'PATCH-064 Portrait'] as const;
const MENU_ITEM_NAMES = [
  'Start presentation',
  'Share presentation',
  'Preview slide',
  'Duplicate slide',
  'Rename slide',
  'Add slide below',
  'Remove slide',
] as const;
const POINTER_ERROR_MAX_LENGTH = 1_500;
const POINTER_ERROR_TRUNCATION_SUFFIX = '...[truncated]';

type BoxRecord = { x: number; y: number; width: number; height: number };

type HitIdentity = {
  tag: string | null;
  text: string | null;
  alt: string | null;
  className: string | null;
  isItemOrDescendant: boolean;
};

type ItemObservation = {
  name: string;
  bbox: BoxRecord;
  visibleFraction: number;
  hitTestTarget: HitIdentity;
  pointerResult: 'pointer-activated' | 'pointer-intercepted' | 'not-attempted';
};

type KeyboardObservation = {
  slideTitle: string;
  counter: string;
  expectedChildText: string;
};

type RowObservation = {
  slideTitle: (typeof ROW_TITLES)[number];
  clipRect: BoxRecord;
  menuItems: ItemObservation[];
  keyboardControl: KeyboardObservation;
  interceptorIdentity: HitIdentity | null;
  pointerError: string | null;
};

type MenuProbe = {
  clipRect: BoxRecord;
  menu: Locator;
  items: Locator[];
  names: string[];
};

function roundBox(box: { x: number; y: number; width: number; height: number }): BoxRecord {
  return {
    x: Number(box.x.toFixed(2)),
    y: Number(box.y.toFixed(2)),
    width: Number(box.width.toFixed(2)),
    height: Number(box.height.toFixed(2)),
  };
}

function toErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function sanitizePointerError(error: unknown): string {
  const dataUrlPattern = /data:[^)\]"'\s>]+/gi;
  const inlineImagePattern = /<img\b[^>]*\bsrc=(["'])data:[\s\S]*?\1[^>]*>/gi;
  const credentialPattern = /\b(authorization|cookie|set-cookie|refresh[_-]?token|access[_-]?token|id[_-]?token|password|secret)\b\s*[:=]\s*([^\s,;]+)/gi;
  const repeatedRetryPattern = /(?:\n\s*- retrying click action[\s\S]*?)(?=\n\s*- |\n\s*Call log:|\n\s*Timeout |\n\s*waiting for|\s*$)/gi;

  const sanitized = toErrorText(error)
    .replace(inlineImagePattern, '<img src="[data-url-redacted]">')
    .replace(dataUrlPattern, (match) => (match.startsWith('data:image/') ? 'data:image/[redacted]' : '[data-url-redacted]'))
    .replace(credentialPattern, (_, label) => `${label}=[redacted]`)
    .replace(repeatedRetryPattern, '\n  - retrying click action [redacted repeated attempts]\n')
    .replace(/\s+\n/g, '\n')
    .trim();

  if (sanitized.length <= POINTER_ERROR_MAX_LENGTH) {
    return sanitized;
  }

  return `${sanitized.slice(0, POINTER_ERROR_MAX_LENGTH - POINTER_ERROR_TRUNCATION_SUFFIX.length)}${POINTER_ERROR_TRUNCATION_SUFFIX}`;
}

async function getSlideCard(sidebar: Locator, slideTitle: string): Promise<Locator> {
  return sidebar
    .getByText(slideTitle, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
}

async function openMenuForRow(page: Page, sidebar: Locator, slideTitle: string): Promise<MenuProbe> {
  const slideCard = await getSlideCard(sidebar, slideTitle);
  const menuTrigger = slideCard.locator('button').last();
  await expect(menuTrigger).toBeVisible({ timeout: 60_000 });

  const menu = slideCard.locator('div.absolute.right-0.bottom-full');
  const menuAlreadyVisible = await menu.isVisible().catch(() => false);
  if (!menuAlreadyVisible) {
    await menuTrigger.click();
    await expect(menu).toBeVisible({ timeout: 60_000 });
  }

  const items = MENU_ITEM_NAMES.map((name) => menu.getByRole('button', { name, exact: true }));
  for (const item of items) {
    await expect(item).toHaveCount(1);
    await expect(item).toBeVisible({ timeout: 60_000 });
  }

  const cardBox = await slideCard.boundingBox();
  expect(cardBox).not.toBeNull();
  const names = await menu.getByRole('button').allTextContents();

  return {
    clipRect: roundBox(cardBox!),
    menu,
    items,
    names: names.map((name) => name.trim().replace(/\s+/g, ' ')),
  };
}

async function measureItem(page: Page, item: Locator, clipRect: BoxRecord): Promise<Omit<ItemObservation, 'pointerResult'>> {
  const box = await item.boundingBox();
  expect(box).not.toBeNull();
  const bbox = roundBox(box!);
  const intersectionWidth = Math.max(0, Math.min(bbox.x + bbox.width, clipRect.x + clipRect.width) - Math.max(bbox.x, clipRect.x));
  const intersectionHeight = Math.max(0, Math.min(bbox.y + bbox.height, clipRect.y + clipRect.height) - Math.max(bbox.y, clipRect.y));
  const visibleFraction = bbox.width <= 0 || bbox.height <= 0
    ? 0
    : Number(((intersectionWidth * intersectionHeight) / (bbox.width * bbox.height)).toFixed(4));

  const hitTestTarget = await item.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const hit = document.elementFromPoint(centerX, centerY);
    const normalizeText = (value: string | null | undefined) => (value ?? '').trim().replace(/\s+/g, ' ') || null;
    const target = hit instanceof HTMLElement ? hit : null;
    return {
      tag: target?.tagName.toLowerCase() ?? null,
      text: normalizeText(target?.textContent),
      alt: target instanceof HTMLImageElement ? normalizeText(target.getAttribute('alt')) : normalizeText(target?.getAttribute('alt')),
      className: typeof target?.className === 'string' ? normalizeText(target.className) : null,
      isItemOrDescendant: !!target && (target === element || element.contains(target)),
    };
  });

  return {
    name: (await item.textContent())?.trim().replace(/\s+/g, ' ') ?? '',
    bbox,
    visibleFraction,
    hitTestTarget,
  };
}

function classifyRows(rows: RowObservation[]): 'pointer-intercepted-top-items' | 'pointer-reachable-all-items' | 'mixed-per-row' {
  const everyTopIntercepted = rows.every((row) => row.menuItems[0]?.pointerResult === 'pointer-intercepted');
  const everyItemReachable = rows.every((row) => row.menuItems.every((item) => item.hitTestTarget.isItemOrDescendant));
  const everyTopActivated = rows.every((row) => row.menuItems[0]?.pointerResult === 'pointer-activated');

  if (everyTopIntercepted) return 'pointer-intercepted-top-items';
  if (everyItemReachable && everyTopActivated) return 'pointer-reachable-all-items';
  return 'mixed-per-row';
}

test.describe('presentation menu pointer reachability characterization (PATCH-073)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes per-slide menu pointer reachability at the real presentation panel', async ({ page }) => {
    test.setTimeout(240_000);
    const { supabase, fixture } = await createDisposableDrawingBoard('presentation');

    try {
      await seedDrawingContainers(supabase, fixture);
      await seedPresentationScene(supabase, fixture);

      const visitedUrl = await openDrawingBoard(page, fixture.boardId);
      expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
      await expect(page.locator(`[data-padlet-id="${fixture.containerIds[0]}"]`).first()).toBeVisible({ timeout: 90_000 });

      await page.getByTitle('Present Frames').click();
      const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
      await expect(page.getByText('Presentation', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(sidebar.getByText('Slides (2)', { exact: true })).toBeVisible();

      const slideTitles = await sidebar.getByText(/PATCH-064 (Landscape|Portrait)/).allTextContents();
      expect(slideTitles).toEqual([...ROW_TITLES]);

      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();
      const rowObservations: RowObservation[] = [];

      for (const slideTitle of ROW_TITLES) {
        const firstProbe = await openMenuForRow(page, sidebar, slideTitle);
        expect(firstProbe.names).toEqual([...MENU_ITEM_NAMES]);

        const menuItems: ItemObservation[] = [];
        for (let index = 0; index < firstProbe.items.length; index += 1) {
          const item = firstProbe.items[index];
          const measured = await measureItem(page, item, firstProbe.clipRect);
          menuItems.push({
            ...measured,
            pointerResult: index === 0 ? 'pointer-intercepted' : 'not-attempted',
          });
        }

        const topItem = firstProbe.items[0];
        const expectedCounter = slideTitle === 'PATCH-064 Portrait' ? 'Slide 2 / 2' : 'Slide 1 / 2';
        const expectedChildText = slideTitle === 'PATCH-064 Portrait' ? `${fixture.prefix} child B` : `${fixture.prefix} child A`;
        const unexpectedChildText = slideTitle === 'PATCH-064 Portrait' ? `${fixture.prefix} child A` : `${fixture.prefix} child B`;
        const fullscreenCounter = page.getByText(expectedCounter, { exact: true });
        let pointerError: string | null = null;

        try {
          await topItem.click({ timeout: 3_000 });
          menuItems[0].pointerResult = 'pointer-activated';
          await expect(fullscreenCounter).toBeVisible({ timeout: 60_000 });
          await expect(page.getByText(new RegExp(expectedChildText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeVisible({ timeout: 60_000 });
          const unexpectedVisible = await page
            .getByText(new RegExp(unexpectedChildText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
            .isVisible()
            .catch(() => false);
          expect(unexpectedVisible).toBe(false);
          await page.getByText('End presentation', { exact: true }).click();
          await expect(fullscreenCounter).toHaveCount(0);
        } catch (error) {
          pointerError = sanitizePointerError(error);
          menuItems[0].pointerResult = 'pointer-intercepted';
          await expect(fullscreenCounter).toHaveCount(0);
        }

        if (pointerError !== null) {
          expect(pointerError).not.toContain('data:image/');
          expect(pointerError).not.toContain(';base64,');
          expect(pointerError.length).toBeLessThanOrEqual(POINTER_ERROR_MAX_LENGTH);
          expect(pointerError).toMatch(/intercept(?:ed|s)? pointer events|did not receive pointer events/i);
        }

        const secondProbe = await openMenuForRow(page, sidebar, slideTitle);
        const keyboardStart = secondProbe.items[0];
        await keyboardStart.focus();
        await expect(keyboardStart).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(fullscreenCounter).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText(new RegExp(expectedChildText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeVisible({ timeout: 60_000 });
        const keyboardUnexpectedVisible = await page
          .getByText(new RegExp(unexpectedChildText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
          .isVisible()
          .catch(() => false);
        expect(keyboardUnexpectedVisible).toBe(false);
        await page.getByText('End presentation', { exact: true }).click();
        await expect(fullscreenCounter).toHaveCount(0);

        rowObservations.push({
          slideTitle,
          clipRect: firstProbe.clipRect,
          menuItems,
          keyboardControl: {
            slideTitle,
            counter: expectedCounter,
            expectedChildText,
          },
          interceptorIdentity: menuItems[0].pointerResult === 'pointer-intercepted' ? menuItems[0].hitTestTarget : null,
          pointerError,
        });
      }

      const exactClassification = classifyRows(rowObservations);
      test.info().annotations.push({
        type: 'patch-073-menu-pointer-reachability',
        description: JSON.stringify({
          viewport,
          rowsTested: ROW_TITLES.length,
          menuItemsTested: MENU_ITEM_NAMES.length,
          rowOrder: ROW_TITLES,
          menuOrder: MENU_ITEM_NAMES,
          rows: rowObservations,
          ownerHypothesis: 'presentation-panel-inline-menu-clipped-by-card-overflow',
          exactClassification,
        }),
      });
    } finally {
      await cleanupDrawingFixture(supabase, fixture);
      await assertDrawingFixtureCleanup(supabase, fixture);
      await assertDrawingFixtureCleanup(supabase, 'patch-064-harness-presentation-');
    }
  });
});
