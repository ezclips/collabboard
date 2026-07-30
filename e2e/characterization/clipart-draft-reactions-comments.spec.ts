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
  await expect(page.locator('[data-testid="clipart-main-panel"]')).toBeVisible();
}

async function requiredBox(locator: ReturnType<Page['locator']>, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should have a bounding box`).not.toBeNull();
  return box!;
}

async function backgroundColor(locator: ReturnType<Page['locator']>) {
  return locator.evaluate((el) => window.getComputedStyle(el).backgroundColor);
}

function expectAlignedTops(
  mainBox: { y: number },
  commentsBox: { y: number },
  label: string,
) {
  const delta = Math.abs(mainBox.y - commentsBox.y);
  expect(delta, label).toBeLessThanOrEqual(1);
  return delta;
}

function centerDeltas(
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
) {
  return {
    x: Math.abs(box.x + box.width / 2 - viewport.width / 2),
    y: Math.abs(box.y + box.height / 2 - viewport.height / 2),
  };
}

function expectCentered(
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  label: string,
) {
  const deltas = centerDeltas(box, viewport);
  expect(deltas.x, `${label} should be horizontally centered`).toBeLessThanOrEqual(2);
  expect(deltas.y, `${label} should be vertically centered`).toBeLessThanOrEqual(2);
  return deltas;
}

function expectInsideViewport(
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  label: string,
) {
  expect(box.x, `${label} left should be inside viewport`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${label} top should be inside viewport`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} right should be inside viewport`).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height, `${label} bottom should be inside viewport`).toBeLessThanOrEqual(viewport.height);
}

async function draftMetadataFingerprint(supabase: SupabaseClient, fixture: Fixture) {
  const { data, error } = await supabase
    .from('padlets')
    .select('metadata')
    .eq('board_id', fixture.boardId)
    .eq('type', 'card')
    .maybeSingle();
  if (error) throw error;
  return JSON.stringify(data?.metadata ?? null);
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

      const defaultViewport = page.viewportSize() ?? { width: 1280, height: 720 };
      const compositionRow = page.locator('[data-testid="clipart-composition-row"]');
      const toolbarWrapper = page.locator('[data-testid="clipart-toolbar-wrapper"]');
      const mainPanel = page.locator('[data-testid="clipart-main-panel"]');
      const cardPreviewAnchor = page.locator('[data-testid="clipart-card-preview-anchor"]');
      const cardPreviewWrapper = page.locator('[data-testid="clipart-card-preview-wrapper"]');
      const commentsPanel = page.locator('[data-testid="clipart-comments-panel"]');
      const mainPanelBadge = page.locator('[data-testid="clipart-main-comment-badge"]');
      const reactionPanel = page.locator('[data-testid="clipart-reaction-panel-wrapper"]');
      const captionStylePanel = page.locator('[data-testid="clipart-caption-style-panel"]');
      const inlineCaption = page.locator('[data-testid="clipart-inline-caption"]');
      const inlineCaptionInput = inlineCaption.locator('textarea');
      const toolbarCaptionButton = toolbarWrapper.getByTitle('Caption');
      const toolbarReactionButton = toolbarWrapper.getByTitle('Reaction');
      const toolbarCommentButton = toolbarWrapper.getByTitle('Comment');
      await expect(mainPanel).toBeVisible();
      await expect(compositionRow).toBeVisible();
      await expect(toolbarWrapper).toBeVisible();
      await expect(cardPreviewAnchor).toBeVisible();
      await expect(cardPreviewWrapper).toBeVisible();
      await expect(page.getByPlaceholder('Optional caption')).toHaveCount(0);
      await expect(toolbarCaptionButton).toBeVisible();
      await expect(page.getByText('Caption', { exact: true })).toBeVisible();
      await expect(mainPanelBadge).toHaveCount(0);
      const centeringDeltas: Record<string, { x: number; y: number }> = {};
      const topDeltas: Record<string, number> = {};
      const initialRowBox = await requiredBox(compositionRow, 'initial composition row');
      centeringDeltas.compact = expectCentered(initialRowBox, defaultViewport, 'compact editor composition');
      expectInsideViewport(initialRowBox, defaultViewport, 'compact editor composition');
      const initialMainBox = await requiredBox(mainPanel, 'initial main Clipart panel');
      const initialToolbarBox = await requiredBox(toolbarWrapper, 'initial toolbar wrapper');
      const initialPreviewAnchorBox = await requiredBox(cardPreviewAnchor, 'initial card preview anchor');
      const initialPreviewWrapperBox = await requiredBox(cardPreviewWrapper, 'initial compact card preview wrapper');
      expect(Math.round(initialMainBox.width), 'compact editor width should match the reference card editor').toBe(220);
      expect(Math.round(initialPreviewAnchorBox.width), 'badge anchor width should match the compact card editor').toBe(220);
      expect(Math.round(initialPreviewWrapperBox.width), 'compact card preview wrapper width').toBe(220);
      expect(Math.round(initialPreviewWrapperBox.height), 'compact card preview wrapper minimum height').toBeGreaterThanOrEqual(200);
      expect(Math.abs(initialMainBox.x - initialPreviewWrapperBox.x), 'compact editor should start at the preview wrapper left edge').toBeLessThanOrEqual(1);
      expect(Math.abs(initialMainBox.y - initialPreviewWrapperBox.y), 'compact editor should start at the preview wrapper top edge').toBeLessThanOrEqual(1);
      topDeltas.toolbarCompact = expectAlignedTops(initialToolbarBox, initialMainBox, 'toolbar and compact card top edges should align');
      expect(await cardPreviewAnchor.evaluate((el) => window.getComputedStyle(el).overflow)).toBe('visible');
      expect(await cardPreviewWrapper.evaluate((el) => window.getComputedStyle(el).overflow)).toBe('hidden');
      await page.screenshot({ path: testInfo.outputPath('patch-122-compact-editor-centered.png'), fullPage: false });

      await toolbarCaptionButton.click();
      await expect(inlineCaptionInput).toBeFocused();
      await expect(captionStylePanel).toBeVisible();
      await expect(page.getByText('Large heading', { exact: true })).toBeVisible();
      await expect(page.getByText('Normal heading', { exact: true })).toBeVisible();
      const captionStyleRowBox = await requiredBox(compositionRow, 'composition row with Caption style open');
      centeringDeltas.captionStyle = expectCentered(captionStyleRowBox, defaultViewport, 'Caption style composition');
      const captionStyleBox = await requiredBox(captionStylePanel, 'Caption style panel');
      topDeltas.captionStyleCompact = expectAlignedTops(captionStyleBox, await requiredBox(mainPanel, 'main Clipart panel with Caption style open'), 'Caption style panel and compact card top edges should align');
      expectInsideViewport(captionStyleRowBox, defaultViewport, 'Caption style composition');
      expectInsideViewport(captionStyleBox, defaultViewport, 'Caption style panel');
      await inlineCaptionInput.fill('');
      await expect(inlineCaptionInput).toHaveValue('');
      await expect(inlineCaptionInput).toHaveAttribute('placeholder', 'Write a caption...');
      await page.screenshot({ path: testInfo.outputPath('patch-122-empty-inline-caption.png'), fullPage: false });
      await inlineCaptionInput.fill('PATCH-122 inline caption');
      await expect(inlineCaptionInput).toHaveValue('PATCH-122 inline caption');
      await page.getByText('Large heading', { exact: true }).click();
      await expect(captionStylePanel).toBeVisible();
      const captionEditingRowBox = await requiredBox(compositionRow, 'composition row during caption editing');
      expect(captionEditingRowBox.width, 'caption style panel should expand the centered composition row').toBeGreaterThan(initialRowBox.width);
      await page.screenshot({ path: testInfo.outputPath('patch-122-active-caption-editing.png'), fullPage: false });

      await toolbarReactionButton.click();
      await expect(captionStylePanel).toHaveCount(0);
      await expect(reactionPanel).toBeVisible();
      await expect(reactionPanel.locator('.EmojiPickerReact')).toHaveCount(0);
      await expect(reactionPanel.getByText('Add Reaction', { exact: true })).toBeVisible();
      await expect(reactionPanel.getByPlaceholder('Search emojis...')).toBeVisible();
      const reactionRowBox = await requiredBox(compositionRow, 'composition row with Reaction open');
      centeringDeltas.reaction = expectCentered(reactionRowBox, defaultViewport, 'Reaction composition');
      const reactionBox = await requiredBox(reactionPanel, 'Reaction panel');
      topDeltas.reactionCompact = expectAlignedTops(reactionBox, await requiredBox(mainPanel, 'main Clipart panel with Reaction open'), 'Reaction panel and compact card top edges should align');
      await reactionPanel.getByPlaceholder('Search emojis...').fill('smile');
      const firstEmoji = reactionPanel.locator('.grid button').first();
      await expect(firstEmoji).toBeVisible();
      const selectedEmoji = ((await firstEmoji.textContent()) ?? '').trim();
      expect(selectedEmoji.length).toBeGreaterThan(0);
      await firstEmoji.click();
      await expect(reactionPanel).toHaveCount(0);
      await toolbarReactionButton.click();
      await expect(reactionPanel).toBeVisible();
      await expect(reactionPanel.locator('.EmojiPickerReact')).toHaveCount(0);
      await reactionPanel.getByPlaceholder('Search emojis...').fill('smile');
      const secondSameEmoji = reactionPanel.locator('.grid button').filter({ hasText: selectedEmoji }).first();
      await expect(secondSameEmoji).toBeVisible();
      await secondSameEmoji.click();
      await expect(reactionPanel).toHaveCount(0);
      await expect(cardPreviewWrapper.locator('button').filter({ hasText: selectedEmoji }).filter({ hasText: '2' })).toBeVisible();
      const afterReactionRowBox = await requiredBox(compositionRow, 'composition row after selecting Reaction');
      centeringDeltas.reactionSelected = expectCentered(afterReactionRowBox, defaultViewport, 'Reaction composition after selection');

      await toolbarCommentButton.click();
      await expect(page.getByText('Comments', { exact: true })).toBeVisible();
      await expect(commentsPanel).toBeVisible();
      const commentIconRowBox = await requiredBox(compositionRow, 'composition row with Comments opened from icon');
      centeringDeltas.commentIcon = expectCentered(commentIconRowBox, defaultViewport, 'Comments composition from icon');
      const openMainBox = await requiredBox(mainPanel, 'main Clipart panel with Comments open');
      const openCommentsBox = await requiredBox(commentsPanel, 'Comments panel');
      topDeltas.open = expectAlignedTops(openMainBox, openCommentsBox, 'main panel and Comments panel top edges should align');
      topDeltas.toolbarComments = expectAlignedTops(await requiredBox(toolbarWrapper, 'toolbar with Comments open'), openMainBox, 'toolbar and compact card top edges should stay aligned with Comments');
      expect(openCommentsBox.x).toBeGreaterThan(openMainBox.x + openMainBox.width);
      expect((await requiredBox(toolbarWrapper, 'toolbar left of compact card')).x).toBeLessThan(openMainBox.x);
      expect(openMainBox.x, 'opening Comments should recenter the whole row and move the compact card left').toBeLessThan(initialMainBox.x);
      expectInsideViewport(commentIconRowBox, defaultViewport, 'Comments composition from icon');
      expectInsideViewport(openCommentsBox, defaultViewport, 'Comments panel');

      await page.getByPlaceholder('Add a comment...').fill('PATCH-120 draft comment');
      await page.keyboard.press('Enter');
      await expect(page.getByText('PATCH-120 draft comment', { exact: true })).toBeVisible();
      const toolbarBadge = toolbarCommentButton.locator('span').filter({ hasText: '1' });
      await expect(toolbarBadge).toBeVisible();
      await expect(mainPanelBadge).toHaveText('1');
      await expect(mainPanelBadge).toBeVisible();

      const toolbarBadgeText = (await toolbarBadge.textContent())?.trim();
      const mainBadgeText = (await mainPanelBadge.textContent())?.trim();
      expect(mainBadgeText).toBe(toolbarBadgeText);

      const mainBadgeBox = await requiredBox(mainPanelBadge, 'main-panel comment badge');
      const commentedMainBox = await requiredBox(mainPanel, 'main Clipart panel after comment');
      const commentedPreviewBox = await requiredBox(cardPreviewWrapper, 'compact card preview wrapper after comment');
      expect(Math.round(mainBadgeBox.width), 'main-panel badge width').toBe(24);
      expect(Math.round(mainBadgeBox.height), 'main-panel badge height').toBe(24);
      expect(Math.round(mainBadgeBox.x - commentedPreviewBox.x), 'badge left should sit 8px outside the card right edge').toBe(204);
      expect(Math.round(mainBadgeBox.y - commentedPreviewBox.y), 'badge top should sit 8px above the card top edge').toBe(-8);
      expect(Math.round((mainBadgeBox.x + mainBadgeBox.width) - (commentedPreviewBox.x + commentedPreviewBox.width)), 'badge right edge should extend outside the card').toBe(8);
      expect(Math.round(commentedPreviewBox.y - mainBadgeBox.y), 'badge top edge should extend outside the card').toBe(8);
      expect(Math.round((mainBadgeBox.x + mainBadgeBox.width / 2) - (commentedPreviewBox.x + commentedPreviewBox.width)), 'badge centre should sit 4px inside the card right edge').toBe(-4);
      expect(Math.round((mainBadgeBox.y + mainBadgeBox.height / 2) - commentedPreviewBox.y), 'badge centre should sit 4px inside the card top edge').toBe(4);
      expect(mainBadgeBox.x).toBeGreaterThanOrEqual(commentedMainBox.x - 8.5);
      expect(mainBadgeBox.y).toBeGreaterThanOrEqual(commentedMainBox.y - 8.5);
      const viewport = page.viewportSize();
      expect(mainBadgeBox.x + mainBadgeBox.width).toBeLessThanOrEqual((viewport?.width ?? 1280) + 0.5);
      expect(mainBadgeBox.y + mainBadgeBox.height).toBeLessThanOrEqual((viewport?.height ?? 720) + 0.5);
      expect(await backgroundColor(mainPanelBadge)).toBe('rgb(250, 204, 21)');
      expect(await backgroundColor(toolbarBadge)).toBe(await backgroundColor(mainPanelBadge));

      await page.locator('button[title="Close"]').last().click();
      await expect(page.getByText('Comments', { exact: true })).toHaveCount(0);
      const closedAfterCommentRowBox = await requiredBox(compositionRow, 'composition row after closing Comments');
      centeringDeltas.closedAfterComment = expectCentered(closedAfterCommentRowBox, defaultViewport, 'closed composition after comment');
      expect(Math.abs((await requiredBox(mainPanel, 'main panel after closing first Comments')).x - initialMainBox.x), 'closing Comments should recenter the smaller composition').toBeLessThanOrEqual(1);

      const beforeCardBadgeMetadata = await draftMetadataFingerprint(supabase, fixture);
      await mainPanelBadge.click();
      await expect(page.getByText('Comments', { exact: true })).toBeVisible();
      await expect(commentsPanel).toBeVisible();
      await expect(mainPanelBadge).toHaveText('1');
      expect(await draftMetadataFingerprint(supabase, fixture)).toBe(beforeCardBadgeMetadata);
      const cardBadgeRowBox = await requiredBox(compositionRow, 'composition row with Comments opened from card badge');
      centeringDeltas.cardBadge = expectCentered(cardBadgeRowBox, defaultViewport, 'Comments composition from card badge');
      topDeltas.cardBadgeComments = expectAlignedTops(await requiredBox(mainPanel, 'main panel from card badge'), await requiredBox(commentsPanel, 'Comments from card badge'), 'card badge opens the same aligned Comments panel');
      await page.screenshot({ path: testInfo.outputPath('patch-122-comments-from-card-badge.png'), fullPage: false });

      await page.locator('button[title="Close"]').last().click();
      await expect(page.getByText('Comments', { exact: true })).toHaveCount(0);
      const beforeToolbarBadgeMetadata = await draftMetadataFingerprint(supabase, fixture);
      const toolbarBadgeBox = await requiredBox(toolbarBadge, 'toolbar comment badge');
      const toolbarCommentButtonBox = await requiredBox(toolbarCommentButton, 'toolbar Comment button');
      const toolbarBadgeOverhangPoint = {
        x: toolbarBadgeBox.x + toolbarBadgeBox.width - 2,
        y: toolbarBadgeBox.y + toolbarBadgeBox.height / 2,
      };
      expect(toolbarBadgeOverhangPoint.x, 'toolbar badge click should be in the right-side overhang').toBeGreaterThan(toolbarCommentButtonBox.x + toolbarCommentButtonBox.width);
      expect(toolbarBadgeOverhangPoint.y, 'toolbar badge click should stay inside the visible badge height').toBeGreaterThan(toolbarBadgeBox.y);
      expect(toolbarBadgeOverhangPoint.y, 'toolbar badge click should stay inside the visible badge height').toBeLessThan(toolbarBadgeBox.y + toolbarBadgeBox.height);
      await page.mouse.click(toolbarBadgeOverhangPoint.x, toolbarBadgeOverhangPoint.y);
      await expect(page.getByText('Comments', { exact: true })).toBeVisible();
      await expect(commentsPanel).toBeVisible();
      await expect(mainPanelBadge).toHaveText('1');
      expect(await draftMetadataFingerprint(supabase, fixture)).toBe(beforeToolbarBadgeMetadata);
      const toolbarBadgeRowBox = await requiredBox(compositionRow, 'composition row with Comments opened from toolbar badge overhang');
      centeringDeltas.toolbarBadge = expectCentered(toolbarBadgeRowBox, defaultViewport, 'Comments composition from toolbar badge overhang');
      topDeltas.toolbarBadgeComments = expectAlignedTops(await requiredBox(mainPanel, 'main panel from toolbar badge'), await requiredBox(commentsPanel, 'Comments from toolbar badge'), 'toolbar badge opens the same aligned Comments panel');
      await page.screenshot({ path: testInfo.outputPath('patch-122-comments-from-toolbar-badge-overhang.png'), fullPage: false });

      await toolbarCommentButton.click();
      await expect(page.getByText('Comments', { exact: true })).toBeVisible();
      await expect(mainPanelBadge).toHaveText('1');

      await page.getByTitle('Badge Color').click();

      // PATCH-121 — the palette must lay out as six full columns, not compress
      // against the 28px swatch button that is its containing block.
      const palette = page.locator('[data-testid="clipart-badge-color-palette"]');
      const grid = page.locator('[data-testid="clipart-badge-color-grid"]');
      await expect(palette).toBeVisible();
      const paletteRowBox = await requiredBox(compositionRow, 'composition row with badge palette open');
      centeringDeltas.palette = expectCentered(paletteRowBox, defaultViewport, 'badge palette composition');
      const paletteMainBox = await requiredBox(mainPanel, 'main Clipart panel with palette open');
      const paletteCommentsBox = await requiredBox(commentsPanel, 'Comments panel with palette open');
      topDeltas.palette = expectAlignedTops(paletteMainBox, paletteCommentsBox, 'badge-colour palette must not alter top alignment');

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
      await expect(mainPanel).toBeVisible();
      await expect(mainPanelBadge).toHaveText('1');
      const commentBadge = toolbarCommentButton.locator('span').filter({ hasText: '1' });
      const badgeStyle = await commentBadge.getAttribute('style', { timeout: 5_000 });
      expect(badgeStyle).toContain('251, 146, 60');
      expect(await backgroundColor(mainPanelBadge)).toBe(await backgroundColor(commentBadge));

      await expect(page.getByPlaceholder('Optional caption')).toHaveCount(0);
      await expect(inlineCaptionInput).toHaveValue('PATCH-122 inline caption');

      const selectedMainBox = await requiredBox(mainPanel, 'main Clipart panel after badge colour change');
      const selectedCommentsBox = await requiredBox(commentsPanel, 'Comments panel after badge colour change');
      topDeltas.selected = expectAlignedTops(selectedMainBox, selectedCommentsBox, 'badge colour selection must preserve top alignment');
      const filledCaptionBox = await requiredBox(inlineCaption, 'filled inline caption');
      const selectedPreviewBox = await requiredBox(cardPreviewWrapper, 'compact card preview wrapper with filled caption');
      expect(filledCaptionBox.x).toBeGreaterThanOrEqual(selectedPreviewBox.x - 0.5);
      expect(filledCaptionBox.x + filledCaptionBox.width).toBeLessThanOrEqual(selectedPreviewBox.x + selectedPreviewBox.width + 0.5);
      expect(Math.round(selectedPreviewBox.width), 'filled caption should not change compact card width').toBe(220);
      expect(Math.round((await requiredBox(mainPanel, 'main panel with filled caption')).width), 'filled caption should not change compact editor width').toBe(220);
      const alignedScreenshotPath = testInfo.outputPath('patch-122-aligned-clipart-comments.png');
      await page.screenshot({ path: alignedScreenshotPath, fullPage: false });
      await page.screenshot({ path: testInfo.outputPath('patch-122-filled-caption-with-comments-open.png'), fullPage: false });

      await page.locator('button[title="Close"]').last().click();
      await expect(page.getByText('Comments', { exact: true })).toHaveCount(0);
      const closedMainBox = await requiredBox(mainPanel, 'main Clipart panel after closing Comments');
      const closedAfterPaletteRowBox = await requiredBox(compositionRow, 'composition row after closing Comments following palette');
      centeringDeltas.closedAfterPalette = expectCentered(closedAfterPaletteRowBox, defaultViewport, 'closed composition after palette');
      topDeltas.closedToolbarCompact = expectAlignedTops(await requiredBox(toolbarWrapper, 'toolbar after closing Comments following palette'), closedMainBox, 'toolbar and compact card top edges should remain aligned after closing Comments');

      await toolbarCommentButton.click();
      await expect(page.getByText('Comments', { exact: true })).toBeVisible();
      const reopenedMainBox = await requiredBox(mainPanel, 'main Clipart panel after reopening Comments');
      const reopenedCommentsBox = await requiredBox(commentsPanel, 'Comments panel after reopening');
      topDeltas.reopened = expectAlignedTops(reopenedMainBox, reopenedCommentsBox, 'reopened Comments panel should stay aligned');
      const reopenedRowBox = await requiredBox(compositionRow, 'composition row after reopening Comments');
      centeringDeltas.reopened = expectCentered(reopenedRowBox, defaultViewport, 'reopened Comments composition');

      await page.setViewportSize({ width: defaultViewport.width, height: 240 });
      const shortViewport = page.viewportSize() ?? { width: defaultViewport.width, height: 240 };
      const shortRowBox = await requiredBox(compositionRow, 'short viewport composition row');
      expect(shortRowBox.y, 'short viewport row top should remain reachable').toBeGreaterThanOrEqual(0);
      expect(shortRowBox.y, 'short viewport auto margins should collapse to normal top flow').toBeLessThanOrEqual(16);
      expect(shortRowBox.x, 'short viewport row left should remain reachable').toBeGreaterThanOrEqual(0);
      expect(shortRowBox.x + shortRowBox.width, 'short viewport row right should remain inside viewport').toBeLessThanOrEqual(shortViewport.width);
      await page.screenshot({ path: testInfo.outputPath('patch-122-short-viewport-reachability.png'), fullPage: false });
      await page.setViewportSize(defaultViewport);
      await expect(page.getByText('Comments', { exact: true })).toBeVisible();

      console.log('[PATCH-122 centering]', centeringDeltas);
      console.log('[PATCH-122 geometry]', topDeltas);

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
          return data ? { title: data.title, metadata: data.metadata } : null;
        }, { timeout: 10_000 })
        .toMatchObject({
          title: 'PATCH-122 inline caption',
          metadata: {
            reactions: [selectedEmoji, selectedEmoji],
            badgeColor: '#fb923c',
            captionStyle: expect.objectContaining({
              heading: 'h1',
              fontSize: '18px',
              fontWeight: '700',
              fontStyle: 'normal',
              lineHeight: '1.3',
            }),
            detachedComments: [expect.objectContaining({ text: 'PATCH-120 draft comment' })],
          },
        });
      const { data: savedCard, error: savedCardError } = await supabase
        .from('padlets')
        .select('title,metadata')
        .eq('board_id', fixture!.boardId)
        .eq('type', 'card')
        .maybeSingle();
      if (savedCardError) throw savedCardError;
      expect(savedCard?.title).toBe('PATCH-122 inline caption');
      expect(savedCard?.metadata).not.toHaveProperty('caption');
      expect(savedCard?.metadata?.captionStyle).toMatchObject({
        heading: 'h1',
        fontSize: '18px',
        fontWeight: '700',
        fontStyle: 'normal',
        lineHeight: '1.3',
      });
      expect(savedCard?.metadata?.captionStyle).not.toHaveProperty('opacity');
    } finally {
      await cleanupFixture(supabase, fixture);
    }
  });
});
