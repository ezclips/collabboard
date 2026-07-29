import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { E2E_EMAIL, E2E_PASSWORD, hasE2ECredentials } from '../helpers/env';

type Fixture = {
  boardId: string;
  boardTitle: string;
  libraryItemId: string;
  clipartTitle: string;
};

const PREFIX = 'patch-120-clipart-draft-';
const SVG_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#2563eb"/><circle cx="50" cy="50" r="24" fill="#facc15"/></svg>',
)}`;

function readEnvLocal(key: string): string {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    const match = raw.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return (match?.[1] ?? '').trim();
  } catch {
    return '';
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key] || readEnvLocal(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

async function createLiveClient(): Promise<SupabaseClient> {
  const supabase = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabase.auth.signInWithPassword({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  });
  if (error) throw error;
  return supabase;
}

async function createFixture(supabase: SupabaseClient): Promise<Fixture> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('PATCH-120 fixture requires an authenticated user');

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const boardTitle = `${PREFIX}board-${suffix}`;
  const clipartTitle = `${PREFIX}item-${suffix}`;

  const { data: board, error: boardError } = await supabase
    .from('boards')
    .insert({
      title: boardTitle,
      description: 'PATCH-120 disposable clipart draft fixture',
      layout: 'freeform',
      user_id: userData.user.id,
      background_type: 'color',
      background_value: '#ffffff',
      container_size: 'medium',
    })
    .select('id,title')
    .single();
  if (boardError) throw boardError;

  const { data: libraryItem, error: libraryError } = await supabase
    .from('library_items')
    .insert({
      user_id: userData.user.id,
      title: clipartTitle,
      type: 'clipart',
      content: {
        title: clipartTitle,
        content: SVG_URL,
        type: 'clipart',
        width: 100,
        height: 100,
        metadata: { source: 'patch-120-characterization' },
      },
      is_public: false,
    })
    .select('id')
    .single();
  if (libraryError) throw libraryError;

  return {
    boardId: String(board.id),
    boardTitle: String(board.title),
    libraryItemId: String(libraryItem.id),
    clipartTitle,
  };
}

async function cleanupFixture(supabase: SupabaseClient, fixture: Fixture | null): Promise<void> {
  if (!fixture) return;
  await supabase.from('padlets').delete().eq('board_id', fixture.boardId);
  await supabase.from('boards').delete().eq('id', fixture.boardId).like('title', `${PREFIX}%`);
  await supabase.from('library_items').delete().eq('id', fixture.libraryItemId);
}

async function openClipartDraft(page: Page, fixture: Fixture) {
  await page.goto(`/dashboard/canvas/${fixture.boardId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Create', { exact: true })).toBeVisible({ timeout: 15_000 });
  const libraryTool = page.locator('div.cursor-pointer').filter({ hasText: /^Library$/ }).first();
  await expect(libraryTool).toBeVisible();

  await libraryTool.click();
  await expect(page.getByText('External Library', { exact: true })).toBeVisible();
  await expect(page.getByAltText(fixture.clipartTitle)).toBeVisible({ timeout: 15_000 });
  await page.getByAltText(fixture.clipartTitle).click();
  await expect(page.getByText('Clipart Card', { exact: true })).toBeVisible();
}

test.describe('PATCH-120 clipart draft reactions and comments', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');
  test.setTimeout(60_000);

  test('draft clipart cards keep reactions, comment badge state, and persisted metadata', async ({ page }, testInfo) => {
    const supabase = await createLiveClient();
    let fixture: Fixture | null = null;

    try {
      fixture = await createFixture(supabase);
      await openClipartDraft(page, fixture);

      await page.getByTitle('Reaction').click();
      await expect(page.getByText('Add Reaction', { exact: true })).toBeVisible();
      const firstEmoji = page.locator('.grid.grid-cols-8.gap-1 button').first();
      const emoji = (await firstEmoji.textContent())?.trim();
      if (!emoji) throw new Error('PATCH-120 emoji picker did not expose an emoji button');
      await firstEmoji.click();
      await expect(page.getByLabel('Draft reactions').getByText(emoji, { exact: true })).toBeVisible();

      await page.getByTitle('Comment').click();
      await expect(page.getByText('Comments', { exact: true })).toBeVisible();
      await page.getByPlaceholder('Add a comment...').fill('PATCH-120 draft comment');
      await page.keyboard.press('Enter');
      await expect(page.getByText('PATCH-120 draft comment', { exact: true })).toBeVisible();
      await expect(page.getByTitle('Comment').locator('span').filter({ hasText: '1' })).toBeVisible();

      await page.getByTitle('Badge Color').click();

      // PATCH-121 — the palette must lay out as six full columns, not compress
      // against the 28px swatch button that is its containing block.
      const palette = page.locator('[data-testid="clipart-badge-color-palette"]');
      const grid = page.locator('[data-testid="clipart-badge-color-grid"]');
      await expect(palette).toBeVisible();

      const gridTemplateColumns = await grid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
      expect(gridTemplateColumns.trim().split(/\s+/)).toHaveLength(6);
      for (const track of gridTemplateColumns.trim().split(/\s+/)) {
        expect(Math.round(parseFloat(track))).toBe(20);
      }

      const paletteBox = await palette.boundingBox();
      expect(paletteBox).not.toBeNull();
      expect(paletteBox!.width).toBeGreaterThanOrEqual(166);

      const swatches = page.locator('[data-badge-color-swatch]');
      await expect(swatches).toHaveCount(48);
      const swatchBoxes: Array<{ x: number; y: number; width: number; height: number }> = [];
      for (let index = 0; index < 48; index += 1) {
        const box = await swatches.nth(index).boundingBox();
        expect(box, `swatch ${index} should be laid out`).not.toBeNull();
        swatchBoxes.push(box!);
      }

      for (const [index, box] of swatchBoxes.entries()) {
        expect(Math.round(box.width), `swatch ${index} width`).toBe(20);
        expect(Math.round(box.height), `swatch ${index} height`).toBe(20);
        // No horizontal clipping: every swatch sits inside the palette box.
        expect(box.x).toBeGreaterThanOrEqual(paletteBox!.x - 0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(paletteBox!.x + paletteBox!.width + 0.5);
        expect(box.y).toBeGreaterThanOrEqual(paletteBox!.y - 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(paletteBox!.y + paletteBox!.height + 0.5);
      }

      // No overlap between any two swatches.
      for (let a = 0; a < swatchBoxes.length; a += 1) {
        for (let b = a + 1; b < swatchBoxes.length; b += 1) {
          const first = swatchBoxes[a];
          const second = swatchBoxes[b];
          const overlaps = first.x < second.x + second.width - 0.5
            && second.x < first.x + first.width - 0.5
            && first.y < second.y + second.height - 0.5
            && second.y < first.y + first.height - 0.5;
          expect(overlaps, `swatches ${a} and ${b} must not overlap`).toBe(false);
        }
      }

      // Exactly six distinct columns, evenly gapped.
      const columnXs = [...new Set(swatchBoxes.map((box) => Math.round(box.x)))].sort((a, b) => a - b);
      expect(columnXs).toHaveLength(6);
      for (let index = 1; index < columnXs.length; index += 1) {
        expect(columnXs[index] - columnXs[index - 1]).toBe(26);
      }

      await palette.screenshot({ path: testInfo.outputPath('patch-121-badge-color-palette.png') });

      // A plain centre click must hit the swatch; PATCH-120 needed a corner
      // offset because the compressed palette overlapped its neighbours.
      await page.getByTitle('#fb923c').click({ timeout: 5_000 });
      await expect(page.getByText('Comments', { exact: true })).toBeVisible();
      await expect(page.getByText('Clipart Card', { exact: true })).toBeVisible();
      const commentBadge = page.getByTitle('Comment').locator('span').filter({ hasText: '1' });
      const badgeStyle = await commentBadge.getAttribute('style', { timeout: 5_000 });
      expect(badgeStyle).toContain('251, 146, 60');

      await page.locator('button[title="Close"]').last().click();
      await expect(page.getByText('Comments', { exact: true })).toHaveCount(0);

      const viewport = page.viewportSize();
      await page.getByLabel('Save clipart card').click({
        position: { x: (viewport?.width ?? 1280) - 24, y: 24 },
        timeout: 5_000,
      });
      await expect(page.getByText('Clipart Card', { exact: true })).toHaveCount(0);

      await expect
        .poll(async () => {
          const { data, error } = await supabase
            .from('padlets')
            .select('id,type,title,metadata')
            .eq('board_id', fixture!.boardId)
            .eq('type', 'card')
            .maybeSingle();
          if (error) throw error;
          return data?.metadata ?? null;
        }, { timeout: 10_000 })
        .toMatchObject({
          reactions: [emoji],
          badgeColor: '#fb923c',
          detachedComments: [expect.objectContaining({ text: 'PATCH-120 draft comment' })],
        });
    } finally {
      await cleanupFixture(supabase, fixture);
    }
  });
});
