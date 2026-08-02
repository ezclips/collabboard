import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { E2E_EMAIL, E2E_PASSWORD, hasE2ECredentials } from '../helpers/env';
import { createDisposableDrawingBoard, registerDrawingCleanup } from './drawingBridgeHarness';
import { buildCanvasToolbarGroups } from '@/components/collabboard/canvas/ui/canvasToolbarRegistry';

type Fixture = {
  boardId: string;
  title: string;
};

const PREFIX = 'patch-134-document-toolbar-';

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

function createServiceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvLocal('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return null;
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createFixture(supabase: SupabaseClient, layout: 'freeform' | 'drawing'): Promise<Fixture> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('PATCH-134 fixture requires an authenticated user');

  const title = `${PREFIX}${layout}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from('boards')
    .insert({
      title,
      description: 'PATCH-134 disposable Document toolbar fixture',
      layout,
      user_id: userData.user.id,
      background_type: 'color',
      background_value: '#ffffff',
      container_size: 'medium',
    })
    .select('id,title')
    .single();
  if (error) throw error;
  return { boardId: String(data.id), title: String(data.title) };
}

async function cleanupFixture(supabase: SupabaseClient, fixture: Fixture | null): Promise<void> {
  if (!fixture) return;
  await supabase.from('canvas_lines').delete().eq('board_id', fixture.boardId);
  await supabase.from('padlets').delete().eq('board_id', fixture.boardId);
  await supabase.from('boards').delete().eq('id', fixture.boardId).like('title', `${PREFIX}%`);
}

function tool(page: Page, label: string) {
  return page.locator('div.cursor-pointer').filter({ hasText: new RegExp(`^${label}$`) }).first();
}

async function openBoard(page: Page, boardId: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/dashboard/canvas/${boardId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTitle('Back to Dashboard')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Create', { exact: true })).toBeVisible({ timeout: 45_000 });
}

async function saveDocument(page: Page, title: string, content: string): Promise<void> {
  await expect(page.getByPlaceholder('Add a title here...')).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder('Add a title here...').fill(title);
  await page.getByPlaceholder('Start writing...').fill(content);
  await page.locator('.fixed.inset-0.z-\\[150\\] button').first().click();
}

async function cardRows(supabase: SupabaseClient, boardId: string) {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,content,type,position_x,position_y,width,height,metadata')
    .eq('board_id', boardId)
    .eq('type', 'card')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

registerDrawingCleanup(test);

test.describe('PATCH-134 Document toolbar registry', () => {
  test.describe.configure({ mode: 'serial' });

  test('keeps the extracted registry declarative and adds Document without ActionRegistry shortcut wiring', () => {
    const groups = buildCanvasToolbarGroups({
      isMapLayout: false,
      isFreeformLayout: true,
      isFreeformGraphMode: true,
      isTimelineLayout: false,
      chronoMode: null,
      canManageCanvasShare: true,
      canUseFreeformEditButton: true,
    });
    const inventory = groups.map((group) => ({
      id: group.id,
      label: group.label,
      tools: group.tools.map((entry) => ({ type: entry.type, label: entry.label })),
    }));

    expect(inventory).toEqual([
      { id: 'canvas', label: 'Canvas', tools: [
        { type: 'line', label: 'Line' },
        { type: 'graph-line', label: 'Graph Line' },
        { type: 'container', label: 'Column' },
      ] },
      { id: 'create', label: 'Create', tools: [
        { type: 'ai-component', label: 'AI' },
        { type: 'note', label: 'Note' },
        { type: 'document', label: 'Document' },
        { type: 'todo', label: 'To-do' },
        { type: 'comment', label: 'Comment' },
        { type: 'table', label: 'Table' },
      ] },
      { id: 'structure', label: 'Blocks', tools: [{ type: 'library', label: 'Library' }] },
      { id: 'media', label: 'Media', tools: [
        { type: 'link', label: 'Link' },
        { type: 'image', label: 'Add image' },
        { type: 'upload', label: 'Upload' },
        { type: 'import', label: 'Import' },
      ] },
      { id: 'draw', label: 'Draw', tools: [{ type: 'draw', label: 'Draw' }] },
      { id: 'share', label: 'Share', tools: [{ type: 'share', label: 'Share canvas' }] },
      { id: 'settings', label: 'Settings', tools: [{ type: 'canvas-settings', label: 'Canvas settings' }] },
    ]);

    const createTools = groups.find((group) => group.id === 'create')?.tools ?? [];
    expect(createTools.filter((entry) => entry.type === 'document')).toHaveLength(1);
    expect(createTools.map((entry) => entry.type)).toEqual(['ai-component', 'note', 'document', 'todo', 'comment', 'table']);
    expect(createTools.find((entry) => entry.type === 'document')?.label).toBe('Document');
    expect(source('components/collabboard/canvas/ui/canvasToolbarRegistry.tsx')).toContain('FileText');
    expect(source('lib/collabboard/ActionRegistry.ts')).not.toContain('create.document');
    expect(source('app/dashboard/canvas/[id]/CanvasClient.tsx')).toContain("case 'document':");
    expect(source('app/dashboard/canvas/[id]/CanvasClient.tsx')).not.toContain('const canvasSpecificTools = [');
  });

  test('Document creates a free-standing Freeform card and preserves Card view editor access', async ({ page }) => {
    test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');
    test.setTimeout(90_000);

    const supabase = await createLiveClient();
    let fixture: Fixture | null = null;

    try {
      fixture = await createFixture(supabase, 'freeform');
      await openBoard(page, fixture.boardId);

      const labels = await page.locator('div.cursor-pointer span').evaluateAll((nodes) =>
        nodes.map((node) => node.textContent?.trim()).filter(Boolean),
      );
      expect(labels).toEqual(expect.arrayContaining(['AI', 'Note', 'Document', 'To-do', 'Comment', 'Table']));
      expect(labels.indexOf('Document')).toBe(labels.indexOf('Note') + 1);
      expect(labels.indexOf('To-do')).toBe(labels.indexOf('Document') + 1);

      const documentTool = tool(page, 'Document');
      await expect(documentTool).toBeVisible();
      await documentTool.click();
      await expect(page.locator('.lucide-file-text')).toBeVisible();

      const title = `${PREFIX}freeform-card`;
      const body = 'Created through the real PATCH-134 Document toolbar path.';
      await saveDocument(page, title, body);

      await expect.poll(async () => {
        const rows = await cardRows(supabase, fixture!.boardId);
        return rows.map((row) => ({
          title: row.title,
          content: row.content,
          type: row.type,
          width: row.width,
          height: row.height,
          hasParent: Boolean((row.metadata as Record<string, unknown> | null)?.parentId),
          hasDocumentType: row.type === 'document',
          placed: Number(row.position_x) !== 0 || Number(row.position_y) !== 0,
        }));
      }, { timeout: 15_000 }).toEqual([
        {
          title,
          content: body,
          type: 'card',
          width: 180,
          height: 220,
          hasParent: false,
          hasDocumentType: false,
          placed: true,
        },
      ]);

      await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 });
      await page.getByText(title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]').locator('button').first().click();
      await expect(page.getByTitle('Card view')).toBeVisible({ timeout: 15_000 });
      await page.getByTitle('Card view').click();
      await expect(page.getByPlaceholder('Add a title here...')).toHaveValue(title);

      await page.getByPlaceholder('Start writing...').fill(`${body} Edited through Card view.`);
      await page.locator('.fixed.inset-0.z-\\[150\\] button').first().click();
      await expect.poll(async () => {
        const [row] = await cardRows(supabase, fixture!.boardId);
        return row?.content;
      }, { timeout: 15_000 }).toBe(`${body} Edited through Card view.`);

      const noteTool = tool(page, 'Note');
      await expect(noteTool).toBeVisible();
      await noteTool.click();
      await expect(page.getByTitle('Bold (Ctrl+B)')).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanupFixture(supabase, fixture);
    }
  });

  test('empty Document dismissal does not persist a blank card', async ({ page }) => {
    test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');
    test.setTimeout(60_000);

    const supabase = await createLiveClient();
    let fixture: Fixture | null = null;

    try {
      fixture = await createFixture(supabase, 'freeform');
      await openBoard(page, fixture.boardId);
      await tool(page, 'Document').click();
      await expect(page.getByPlaceholder('Add a title here...')).toBeVisible({ timeout: 15_000 });
      await page.mouse.click(10, 10);
      await page.waitForTimeout(1_000);
      expect(await cardRows(supabase, fixture.boardId)).toHaveLength(0);

      await tool(page, 'Document').click();
      await expect(page.getByPlaceholder('Add a title here...')).toBeVisible({ timeout: 15_000 });
      await page.locator('.fixed.inset-0.z-\\[150\\] button').first().click();
      await page.waitForTimeout(1_000);
      expect(await cardRows(supabase, fixture.boardId)).toHaveLength(0);
    } finally {
      await cleanupFixture(supabase, fixture);
    }
  });

  test('readonly workspace role receives no create toolbar', async ({ page }) => {
    test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');
    test.setTimeout(60_000);

    const service = createServiceClient();
    test.skip(!service, 'SUPABASE_SERVICE_ROLE_KEY not set');

    const supabase = await createLiveClient();
    let fixture: Fixture | null = null;
    let originalRoles: Array<{ id: string; role: string | null; restoreRole: string }> = [];

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error('PATCH-134 readonly fixture requires an authenticated user');

      fixture = await createFixture(supabase, 'freeform');
      const { data: memberships, error: membershipError } = await service!
        .from('workspace_members')
        .select('id,role,workspace_id')
        .eq('member_user_id', userData.user.id)
        .eq('status', 'active');
      if (membershipError) throw membershipError;
      const workspaceIds = (memberships ?? []).map((row) => String(row.workspace_id));
      const { data: workspaces, error: workspaceError } = await service!
        .from('workspaces')
        .select('id,owner_user_id')
        .in('id', workspaceIds);
      if (workspaceError) throw workspaceError;
      const ownerByWorkspace = new Map((workspaces ?? []).map((row) => [String(row.id), String(row.owner_user_id)]));
      originalRoles = (memberships ?? []).map((row) => {
        const workspaceId = String(row.workspace_id);
        const isOwnerWorkspace = ownerByWorkspace.get(workspaceId) === userData.user!.id;
        return {
          id: String(row.id),
          role: row.role,
          restoreRole: isOwnerWorkspace ? 'owner' : (row.role ?? 'member'),
        };
      });
      test.skip(originalRoles.length === 0, 'No active workspace membership rows to exercise readonly role');

      for (const membership of originalRoles) {
        const { error } = await service!
          .from('workspace_members')
          .update({ role: 'readonly' })
          .eq('id', membership.id);
        if (error) throw error;
      }

      await page.goto(`/dashboard/canvas/${fixture.boardId}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Double-click', { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(page.getByText('Create', { exact: true })).toHaveCount(0);
      await expect(tool(page, 'Document')).toHaveCount(0);
    } finally {
      for (const membership of originalRoles) {
        await service!
          .from('workspace_members')
          .update({ role: membership.restoreRole })
          .eq('id', membership.id);
      }
      await cleanupFixture(supabase, fixture);
    }
  });

  test('Document enters the real Drawing placement path before persistence', async ({ page }) => {
    test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');
    test.setTimeout(120_000);

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-134-document');
    await page.goto(`/dashboard/canvas/${fixture.boardId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTitle('Back to Dashboard')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Create', { exact: true })).toBeVisible({ timeout: 90_000 });

    await tool(page, 'Document').click();
    await expect(page.getByPlaceholder('Add a title here...')).toBeVisible({ timeout: 30_000 });
    await saveDocument(page, `${PREFIX}drawing-card`, 'Drawing placement document');

    await expect(page.getByText('Where should this go?', { exact: true })).toBeVisible({ timeout: 30_000 });
    expect(await cardRows(supabase, fixture.boardId)).toHaveLength(0);

    await page.getByText('New Container', { exact: true }).click();
    await expect.poll(async () => {
      const rows = await cardRows(supabase, fixture.boardId);
      return rows.map((row) => ({
        type: row.type,
        title: row.title,
        parentId: (row.metadata as Record<string, unknown> | null)?.parentId,
      }));
    }, { timeout: 30_000 }).toEqual([
      {
        type: 'card',
        title: `${PREFIX}drawing-card`,
        parentId: expect.any(String),
      },
    ]);
  });

  test('Clipart draft modal keeps Card view and writes edits through onChange', async ({ page }) => {
    test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');
    test.setTimeout(90_000);

    const supabase = await createLiveClient();
    let fixture: Fixture | null = null;
    const clipartTitle = `${PREFIX}clipart-${Date.now()}`;
    const svgUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0ea5e9"/></svg>')}`;

    try {
      fixture = await createFixture(supabase, 'freeform');
      const { data: userData } = await supabase.auth.getUser();
      const { error: libraryError } = await supabase.from('library_items').insert({
        user_id: userData.user!.id,
        title: clipartTitle,
        type: 'clipart',
        content: {
          title: clipartTitle,
          content: svgUrl,
          type: 'clipart',
          width: 100,
          height: 100,
          metadata: { source: 'patch-134-characterization' },
        },
        is_public: false,
      });
      if (libraryError) throw libraryError;

      await openBoard(page, fixture.boardId);
      await tool(page, 'Library').click();
      await expect(page.getByAltText(clipartTitle)).toBeVisible({ timeout: 15_000 });
      await page.getByAltText(clipartTitle).click();

      const toolbar = page.locator('[data-testid="clipart-toolbar-wrapper"]');
      await expect(toolbar.getByTitle('Card view')).toBeVisible();
      await toolbar.getByTitle('Card view').click();
      await expect(page.getByPlaceholder('Add a title here...')).toBeVisible({ timeout: 15_000 });
      await page.getByPlaceholder('Add a title here...').fill(`${clipartTitle} edited`);
      await page.locator('.fixed.inset-0.z-\\[150\\] button').first().click();
      await expect(page.getByText(`${clipartTitle} edited`, { exact: true }).first()).toBeVisible();
    } finally {
      await supabase.from('library_items').delete().eq('title', clipartTitle);
      await cleanupFixture(supabase, fixture);
    }
  });
});
