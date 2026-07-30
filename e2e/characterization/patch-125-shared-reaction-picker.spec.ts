import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { E2E_EMAIL, E2E_PASSWORD, hasE2ECredentials } from '../helpers/env';

type Fixture = {
  boardId: string;
  libraryItemId: string;
  clipartTitle: string;
};

const PREFIX = 'patch-125-shared-reaction-picker-';
const SVG_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#0f766e"/><path d="M24 58 44 76 78 26" fill="none" stroke="#f8fafc" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`;

const reactionSiteExpectations = [
  ['components/collabboard/canvas/ui/FreeformPadletCards.tsx', 5],
  ['components/collabboard/editors/ClipartCardDraftModal.tsx', 1],
  ['app/dashboard/canvas/[id]/CanvasClient.tsx', 1],
  ['components/collabboard/editors/NoteEditor.tsx', 1],
  ['components/collabboard/editors/TodoEditor.tsx', 1],
  ['components/collabboard/editors/LinkEditor.tsx', 1],
] as const;

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

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
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
  if (!userData.user) throw new Error('PATCH-125 fixture requires an authenticated user');

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const boardTitle = `${PREFIX}board-${suffix}`;
  const clipartTitle = `${PREFIX}item-${suffix}`;

  const { data: board, error: boardError } = await supabase
    .from('boards')
    .insert({
      title: boardTitle,
      description: 'PATCH-125 disposable shared reaction picker fixture',
      layout: 'freeform',
      user_id: userData.user.id,
      background_type: 'color',
      background_value: '#ffffff',
      container_size: 'medium',
    })
    .select('id')
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
        metadata: { source: 'patch-125-characterization' },
      },
      is_public: false,
    })
    .select('id')
    .single();
  if (libraryError) throw libraryError;

  return {
    boardId: String(board.id),
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

test.describe('PATCH-125 shared reaction picker', () => {
  test('governed reaction sites use the in-repo picker and keep emoji-picker-react only for non-reaction consumers', () => {
    for (const [file, expectedCount] of reactionSiteExpectations) {
      const text = source(file);
      expect((text.match(/<EmojiReactionPicker\b/g) ?? []).length, file).toBe(expectedCount);
      expect(text, file).not.toContain('emoji-picker-react');
      expect(text, file).not.toContain('<EmojiPicker');
      expect(text, file).not.toContain('onEmojiClick=');
    }

    for (const file of [
      'components/collabboard/canvas/IconSelector.tsx',
      'app/dashboard/page.tsx',
      'components/collabboard/editors/CommentEditor.tsx',
    ]) {
      expect(source(file), file).toContain('emoji-picker-react');
    }
  });

  test.setTimeout(60_000);

  test('clipart draft reaction panel uses shared picker search and duplicate append semantics in a browser', async ({ page }) => {
    test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

    const supabase = await createLiveClient();
    let fixture: Fixture | null = null;

    try {
      fixture = await createFixture(supabase);
      await openClipartDraft(page, fixture);

      const toolbarWrapper = page.locator('[data-testid="clipart-toolbar-wrapper"]');
      const reactionPanel = page.locator('[data-testid="clipart-reaction-panel-wrapper"]');
      const cardPreviewWrapper = page.locator('[data-testid="clipart-card-preview-wrapper"]');
      const reactionButton = toolbarWrapper.getByTitle('Reaction');

      await reactionButton.click();
      await expect(reactionPanel).toBeVisible();
      await expect(reactionPanel.locator('.EmojiPickerReact')).toHaveCount(0);
      await expect(reactionPanel.getByText('Add Reaction', { exact: true })).toBeVisible();
      await expect(reactionPanel.getByRole('button', { name: 'Frequently used' })).toBeVisible();

      const search = reactionPanel.getByPlaceholder('Search emojis...');
      await expect(search).toBeVisible();

      const box = await reactionPanel.boundingBox();
      expect(box?.width, 'shared inline picker width').toBeGreaterThanOrEqual(358);
      expect(box?.width, 'shared inline picker width').toBeLessThanOrEqual(362);
      expect(box?.height, 'shared inline picker includes 350px grid content').toBeGreaterThanOrEqual(380);

      await search.fill('  FIRE  ');
      await expect(reactionPanel.locator('.grid button').first()).toBeVisible();

      await search.fill('thumbs up');
      await expect(reactionPanel.locator('.grid button').first()).toBeVisible();

      await search.fill('smile');
      const firstEmoji = reactionPanel.locator('.grid button').first();
      await expect(firstEmoji).toBeVisible();
      const selectedEmoji = ((await firstEmoji.textContent()) ?? '').trim();
      expect(selectedEmoji.length).toBeGreaterThan(0);
      await firstEmoji.click();
      await expect(reactionPanel).toHaveCount(0);

      await reactionButton.click();
      await expect(reactionPanel).toBeVisible();
      await reactionPanel.getByPlaceholder('Search emojis...').fill(selectedEmoji);
      const secondSameEmoji = reactionPanel.locator('.grid button').filter({ hasText: selectedEmoji }).first();
      await expect(secondSameEmoji).toBeVisible();
      await secondSameEmoji.click();

      await expect(cardPreviewWrapper.locator('button').filter({ hasText: selectedEmoji }).filter({ hasText: '2' })).toBeVisible();

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
            .select('metadata')
            .eq('board_id', fixture!.boardId)
            .eq('type', 'card')
            .maybeSingle();
          if (error) throw error;
          return data?.metadata ?? null;
        }, { timeout: 10_000 })
        .toMatchObject({
          reactions: [selectedEmoji, selectedEmoji],
        });
    } finally {
      await cleanupFixture(supabase, fixture);
    }
  });
});
