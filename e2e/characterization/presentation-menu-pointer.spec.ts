import { test, expect, type Locator, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasE2ECredentials } from '../helpers/env';
import {
  assertDrawingFixtureCleanup,
  cleanupDrawingFixture,
  createHarnessClient,
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
const PREVIOUS_CLASSIFICATION = 'pointer-intercepted-top-items' as const;
const CURRENT_CLASSIFICATION = 'pointer-reachable-all-items' as const;
const EXACT_CLASSIFICATION = 'per-slide-menu-pointer-reachable' as const;
const HARNESS_PREFIX = 'patch-064-harness-presentation-' as const;
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
] as const;

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
  pointerResult: 'pointer-activated' | 'pointer-reachable' | 'not-activated';
};

type PointerActivationObservation = {
  slideTitle: string;
  counter: string;
  expectedChildText: string;
};

type ShareObservation = {
  opened: boolean;
  heading: string;
};

type KeyboardObservation = {
  slideTitle: string;
  counter: string;
  expectedChildText: string;
};

type MenuCloseObservation = {
  actionClose: boolean;
  outsideClickClose: boolean;
  rowSwitchClose: boolean;
  escapeSupported: boolean;
};

type RowObservation = {
  slideTitle: (typeof ROW_TITLES)[number];
  clipRect: BoxRecord;
  placementDirection: 'below-row' | 'above-row';
  menuItems: ItemObservation[];
  startPresentation: PointerActivationObservation;
  sharePresentation: ShareObservation;
  keyboardControl: KeyboardObservation;
  pointerError: string | null;
};

type ViewportObservation = {
  viewport: { width: number; height: number };
  rows: RowObservation[];
  menuClose: MenuCloseObservation;
  currentClassification: typeof CURRENT_CLASSIFICATION | 'mixed-per-row';
};

type MenuProbe = {
  row: Locator;
  clipRect: BoxRecord;
  placementDirection: 'below-row' | 'above-row';
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

function normalizeText(value: string | null | undefined): string | null {
  return (value ?? '').trim().replace(/\s+/g, ' ') || null;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
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

function collapseRetryNoise(value: string): string {
  const lines = value.split('\n');
  const result: string[] = [];
  let retrySectionsSeen = 0;
  let skippingRepeatedRetrySection = false;

  for (const line of lines) {
    const normalized = stripAnsi(line).trim();

    if (normalized.includes('- retrying click action')) {
      retrySectionsSeen += 1;
      if (retrySectionsSeen === 1) {
        result.push(line);
      } else if (!skippingRepeatedRetrySection) {
        result.push('  - [redacted repeated attempts]');
        skippingRepeatedRetrySection = true;
      }
      continue;
    }

    if (skippingRepeatedRetrySection) {
      if (
        normalized.startsWith('Call log:') ||
        normalized.startsWith('Timeout ') ||
        normalized.startsWith('waiting for locator(')
      ) {
        skippingRepeatedRetrySection = false;
        result.push(line);
      }
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

function sanitizePointerError(error: unknown): string {
  const dataUrlPattern = /data:[^)\]"'\s>]+/gi;
  const inlineImagePattern = /<img\b[^>]*\bsrc=(["'])data:[\s\S]*?\1[^>]*>/gi;
  const credentialPattern = /\b(authorization|cookie|set-cookie|refresh[_-]?token|access[_-]?token|id[_-]?token|password|secret)\b\s*[:=]\s*([^\s,;]+)/gi;

  const sanitized = collapseRetryNoise(
    toErrorText(error)
      .replace(inlineImagePattern, '<img src="[data-url-redacted]">')
      .replace(dataUrlPattern, (match) => (match.startsWith('data:image/') ? 'data:image/[redacted]' : '[data-url-redacted]'))
      .replace(credentialPattern, (_, label) => `${label}=[redacted]`)
      .replace(/\s+\n/g, '\n')
      .trim()
  );

  if (sanitized.length <= POINTER_ERROR_MAX_LENGTH) {
    return sanitized;
  }

  return `${sanitized.slice(0, POINTER_ERROR_MAX_LENGTH - POINTER_ERROR_TRUNCATION_SUFFIX.length)}${POINTER_ERROR_TRUNCATION_SUFFIX}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifyRows(rows: RowObservation[]): typeof CURRENT_CLASSIFICATION | 'mixed-per-row' {
  const everyItemReachable = rows.every((row) => row.menuItems.every((item) => item.hitTestTarget.isItemOrDescendant && item.visibleFraction === 1));
  const topItemsActivated = rows.every((row) => row.menuItems[0]?.pointerResult === 'pointer-activated');

  if (everyItemReachable && topItemsActivated) {
    return CURRENT_CLASSIFICATION;
  }

  return 'mixed-per-row';
}

async function getSlideRow(sidebar: Locator, slideTitle: string): Promise<Locator> {
  return sidebar
    .getByText(slideTitle, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"group")][1]');
}

async function getSlideCard(row: Locator): Promise<Locator> {
  return row.locator('div.rounded-xl').first();
}

async function closeShareModal(page: Page): Promise<void> {
  const heading = page.getByText('Share presentation slides', { exact: true });
  const backdrop = page.locator('div.fixed.inset-0.z-\\[800\\] > div.absolute.inset-0').first();
  await backdrop.click({ position: { x: 8, y: 8 }, force: true });
  if ((await heading.count()) > 0) {
    await page.locator('div.fixed.inset-0.z-\\[800\\] > div.relative > div.flex-shrink-0 button').last().click();
  }
  await expect(heading).toHaveCount(0);
}

async function cleanupHarnessPrefix(supabase: SupabaseClient, prefix: string): Promise<void> {
  const { data: boards, error: boardError } = await supabase
    .from('boards')
    .select('id')
    .like('title', `${prefix}%`);
  if (boardError) throw boardError;

  const boardIds = (boards ?? []).map((board) => board.id);
  if (boardIds.length > 0) {
    const { error: lineError } = await supabase.from('canvas_lines').delete().in('board_id', boardIds);
    if (lineError) throw lineError;

    const { error: padletByBoardError } = await supabase.from('padlets').delete().in('board_id', boardIds);
    if (padletByBoardError) throw padletByBoardError;

    const { error: boardDeleteError } = await supabase.from('boards').delete().in('id', boardIds);
    if (boardDeleteError) throw boardDeleteError;
  }

  const { error: orphanPadletError } = await supabase.from('padlets').delete().like('title', `${prefix}%`);
  if (orphanPadletError) throw orphanPadletError;
}

async function openMenuForRow(page: Page, sidebar: Locator, slideTitle: string): Promise<MenuProbe> {
  const row = await getSlideRow(sidebar, slideTitle);
  const slideCard = await getSlideCard(row);
  const menuTrigger = row.locator('div.relative.flex-shrink-0.self-end.mb-2 > button').first();
  await expect(menuTrigger).toBeVisible({ timeout: 60_000 });

  const menu = row.locator('div.absolute.right-0.w-52');
  if (!(await menu.isVisible().catch(() => false))) {
    await menuTrigger.click();
    await expect(menu).toBeVisible({ timeout: 60_000 });
  }

  const items = MENU_ITEM_NAMES.map((name) => menu.getByRole('button', { name, exact: true }));
  for (const item of items) {
    await expect(item).toHaveCount(1);
    await expect(item).toBeVisible({ timeout: 60_000 });
    await expect(item).toBeEnabled();
  }

  const cardBox = await slideCard.boundingBox();
  expect(cardBox).not.toBeNull();

  const menuClassName = (await menu.getAttribute('class')) ?? '';
  const placementDirection = menuClassName.includes('top-full') ? 'below-row' : 'above-row';
  const names = await menu.getByRole('button').allTextContents();

  return {
    row,
    clipRect: roundBox(cardBox!),
    placementDirection,
    menu,
    items,
    names: names.map((name) => name.trim().replace(/\s+/g, ' ')),
  };
}

async function measureItem(page: Page, item: Locator, viewport: { width: number; height: number }): Promise<Omit<ItemObservation, 'pointerResult'>> {
  const box = await item.boundingBox();
  expect(box).not.toBeNull();
  const bbox = roundBox(box!);
  const intersectionWidth = Math.max(0, Math.min(bbox.x + bbox.width, viewport.width) - Math.max(bbox.x, 0));
  const intersectionHeight = Math.max(0, Math.min(bbox.y + bbox.height, viewport.height) - Math.max(bbox.y, 0));
  const visibleFraction = bbox.width <= 0 || bbox.height <= 0
    ? 0
    : Number(((intersectionWidth * intersectionHeight) / (bbox.width * bbox.height)).toFixed(4));

  const hitTestTarget = await item.evaluate((element) => {
    const normalize = (value: string | null | undefined): string | null =>
      (value ?? '').trim().replace(/\s+/g, ' ') || null;
    const rect = element.getBoundingClientRect();
    const samplePoints = [
      { x: rect.left + (rect.width * 0.25), y: rect.top + (rect.height * 0.5) },
      { x: rect.left + (rect.width * 0.5), y: rect.top + (rect.height * 0.5) },
      { x: rect.left + (rect.width * 0.75), y: rect.top + (rect.height * 0.5) },
    ];
    const targets = samplePoints
      .map(({ x, y }) => document.elementFromPoint(x, y))
      .filter((hit): hit is HTMLElement => hit instanceof HTMLElement);
    const target = targets.find((hit) => hit === element || element.contains(hit)) ?? targets[0] ?? null;

    return {
      tag: target?.tagName.toLowerCase() ?? null,
      text: normalize(target?.textContent),
      alt: target instanceof HTMLImageElement ? normalize(target.getAttribute('alt')) : normalize(target?.getAttribute('alt')),
      className: typeof target?.className === 'string' ? normalize(target.className) : null,
      isItemOrDescendant: targets.some((hit) => hit === element || element.contains(hit)),
    };
  });

  return {
    name: (await item.textContent())?.trim().replace(/\s+/g, ' ') ?? '',
    bbox,
    visibleFraction,
    hitTestTarget,
  };
}

async function assertPointerErrorSafety(pointerError: string | null): Promise<void> {
  if (pointerError === null) return;

  expect(pointerError).not.toContain('data:image/');
  expect(pointerError).not.toContain(';base64,');
  expect(pointerError.length).toBeLessThanOrEqual(POINTER_ERROR_MAX_LENGTH);
}

test.describe('presentation menu pointer reachability characterization (PATCH-073)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes per-slide menu pointer reachability at the real presentation panel', async ({ page }) => {
    test.setTimeout(240_000);

    const sanitizerProof = sanitizePointerError([
      'locator.click: Timeout 3000ms exceeded.',
      'Call log:',
      '  - waiting for locator(...)',
      '  - retrying click action',
      '  - waiting 20ms',
      '    - <img src="data:image/png;base64,AAAA"> intercepts pointer events',
      '  - retrying click action',
      '  - waiting 100ms',
      'cookie=secret-token',
    ].join('\n'));
    expect(sanitizerProof).not.toContain('data:image/');
    expect(sanitizerProof).not.toContain(';base64,');
    expect(sanitizerProof).not.toContain('cookie=secret-token');
    expect((sanitizerProof.match(/retrying click action/g) ?? []).length).toBeLessThanOrEqual(1);
    expect(sanitizerProof).toContain('[redacted repeated attempts]');
    expect(sanitizerProof.length).toBeLessThanOrEqual(POINTER_ERROR_MAX_LENGTH);

    const cleanupSupabase = await createHarnessClient();
    await cleanupHarnessPrefix(cleanupSupabase, HARNESS_PREFIX);
    await assertDrawingFixtureCleanup(cleanupSupabase, HARNESS_PREFIX);

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

      const viewportResults: ViewportObservation[] = [];

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(sidebar.getByText('Slides (2)', { exact: true })).toBeVisible({ timeout: 30_000 });

        const menuClose: MenuCloseObservation = {
          actionClose: false,
          outsideClickClose: false,
          rowSwitchClose: false,
          escapeSupported: false,
        };

        const firstOutsideProbe = await openMenuForRow(page, sidebar, ROW_TITLES[0]);
        await page.getByText('Presentation', { exact: true }).click();
        await expect(firstOutsideProbe.menu).toHaveCount(0);
        menuClose.outsideClickClose = true;

        const landscapeRow = await getSlideRow(sidebar, ROW_TITLES[0]);
        const portraitRow = await getSlideRow(sidebar, ROW_TITLES[1]);
        const firstRowMenu = await openMenuForRow(page, sidebar, ROW_TITLES[0]);
        await (await getSlideCard(portraitRow)).locator('button').first().click({ position: { x: 16, y: 16 } });
        await expect(firstRowMenu.menu).toHaveCount(0);
        const secondRowMenu = await openMenuForRow(page, sidebar, ROW_TITLES[1]);
        await expect(firstRowMenu.menu).toHaveCount(0);
        await expect(secondRowMenu.menu).toBeVisible();
        menuClose.rowSwitchClose = true;
        await page.getByText('Presentation', { exact: true }).click();

        const rowObservations: RowObservation[] = [];

        for (const [index, slideTitle] of ROW_TITLES.entries()) {
          const slideRow = index === 0 ? landscapeRow : portraitRow;
          const slideCard = await getSlideCard(slideRow);
          await slideCard.locator('button').first().click();

          const initialProbe = await openMenuForRow(page, sidebar, slideTitle);
          expect(initialProbe.names).toEqual([...MENU_ITEM_NAMES]);
          expect(initialProbe.placementDirection).toBe(index === ROW_TITLES.length - 1 ? 'above-row' : 'below-row');

          const menuItems: ItemObservation[] = [];
          for (const item of initialProbe.items) {
            const measured = await measureItem(page, item, viewport);
            expect(measured.hitTestTarget.isItemOrDescendant).toBe(true);
            expect(measured.visibleFraction).toBe(1);
            menuItems.push({
              ...measured,
              pointerResult: measured.name === 'Start presentation' ? 'pointer-activated' : 'pointer-reachable',
            });
          }

          const expectedCounter = slideTitle === 'PATCH-064 Portrait' ? 'Slide 2 / 2' : 'Slide 1 / 2';
          const expectedChildText = slideTitle === 'PATCH-064 Portrait' ? `${fixture.prefix} child B` : `${fixture.prefix} child A`;
          const unexpectedChildText = slideTitle === 'PATCH-064 Portrait' ? `${fixture.prefix} child A` : `${fixture.prefix} child B`;
          const fullscreenCounter = page.getByText(expectedCounter, { exact: true });
          let pointerError: string | null = null;

          try {
            await initialProbe.items[0].click({ timeout: 3_000 });
            await expect(fullscreenCounter).toBeVisible({ timeout: 60_000 });
            await expect(page.getByText(new RegExp(escapeRegExp(expectedChildText)))).toBeVisible({ timeout: 60_000 });
            const unexpectedVisible = await page
              .getByText(new RegExp(escapeRegExp(unexpectedChildText)))
              .isVisible()
              .catch(() => false);
            expect(unexpectedVisible).toBe(false);
            await page.getByText('End presentation', { exact: true }).click();
            await expect(fullscreenCounter).toHaveCount(0);
          } catch (error) {
            pointerError = sanitizePointerError(error);
            throw error;
          }

          await assertPointerErrorSafety(pointerError);

          const shareProbe = await openMenuForRow(page, sidebar, slideTitle);
          await shareProbe.items[1].click({ timeout: 3_000 });
          await expect(page.getByText('Share presentation slides', { exact: true })).toBeVisible({ timeout: 60_000 });
          await expect(shareProbe.menu).toHaveCount(0);
          menuClose.actionClose = true;
          await closeShareModal(page);

          const lowerProbe = await openMenuForRow(page, sidebar, slideTitle);
          expect(lowerProbe.names).toEqual([...MENU_ITEM_NAMES]);
          for (const item of lowerProbe.items.slice(2)) {
            await expect(item).toHaveCount(1);
            await expect(item).toBeVisible({ timeout: 60_000 });
            await expect(item).toBeEnabled();
            const measured = await measureItem(page, item, viewport);
            expect(measured.hitTestTarget.isItemOrDescendant).toBe(true);
            expect(measured.visibleFraction).toBe(1);
          }
          await page.getByText('Presentation', { exact: true }).click();

          const keyboardProbe = await openMenuForRow(page, sidebar, slideTitle);
          const keyboardStart = keyboardProbe.items[0];
          await keyboardStart.focus();
          await expect(keyboardStart).toBeFocused();
          await page.keyboard.press('Enter');
          await expect(fullscreenCounter).toBeVisible({ timeout: 60_000 });
          await expect(page.getByText(new RegExp(escapeRegExp(expectedChildText)))).toBeVisible({ timeout: 60_000 });
          const keyboardUnexpectedVisible = await page
            .getByText(new RegExp(escapeRegExp(unexpectedChildText)))
            .isVisible()
            .catch(() => false);
          expect(keyboardUnexpectedVisible).toBe(false);
          await page.getByText('End presentation', { exact: true }).click();
          await expect(fullscreenCounter).toHaveCount(0);

          rowObservations.push({
            slideTitle,
            clipRect: initialProbe.clipRect,
            placementDirection: initialProbe.placementDirection,
            menuItems,
            startPresentation: {
              slideTitle,
              counter: expectedCounter,
              expectedChildText,
            },
            sharePresentation: {
              opened: true,
              heading: 'Share presentation slides',
            },
            keyboardControl: {
              slideTitle,
              counter: expectedCounter,
              expectedChildText,
            },
            pointerError,
          });
        }

        const currentClassification = classifyRows(rowObservations);
        expect(currentClassification).toBe(CURRENT_CLASSIFICATION);

        viewportResults.push({
          viewport,
          rows: rowObservations,
          menuClose,
          currentClassification,
        });
      }

      test.info().annotations.push({
        type: 'patch-073-menu-pointer-reachability',
        description: JSON.stringify({
          previousClassification: PREVIOUS_CLASSIFICATION,
          previousTopItemVisibleFraction: 0,
          currentClassification: CURRENT_CLASSIFICATION,
          exactClassification: EXACT_CLASSIFICATION,
          testedRows: ROW_TITLES.length,
          testedMenuItems: MENU_ITEM_NAMES.length,
          rowOrder: ROW_TITLES,
          menuOrder: MENU_ITEM_NAMES,
          viewportResults,
          productionOwner: 'PresentationPanel',
          SlideThumbnailChanged: false,
          portalUsed: false,
          cardOverflowChanged: false,
          fullscreenOrderingChanged: false,
          ownerHypothesis: 'presentation-panel-inline-menu-clipped-by-card-overflow',
        }),
      });
    } finally {
      await cleanupDrawingFixture(supabase, fixture);
      await assertDrawingFixtureCleanup(supabase, fixture);
      await cleanupHarnessPrefix(supabase, HARNESS_PREFIX);
      await assertDrawingFixtureCleanup(supabase, HARNESS_PREFIX);
    }
  });
});
