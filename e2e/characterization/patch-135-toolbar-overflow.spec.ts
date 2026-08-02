import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { E2E_EMAIL, E2E_PASSWORD, hasE2ECredentials } from '../helpers/env';
import { createDisposableDrawingBoard, registerDrawingCleanup } from './drawingBridgeHarness';

type Fixture = {
  boardId: string;
  title: string;
};

type ToolbarMeasurement = {
  viewport: { width: number; height: number };
  visibleGroups: string[];
  overflowGroups: string[];
  railTools: string[];
  menuTools: string[];
  morePresent: boolean;
  moreFullyVisible: boolean;
  clientHeight: number;
  scrollHeight: number;
  finalRailBottom: number;
  sidebarBottom: number;
  clipping: number;
  menuZIndex: string | null;
  pageScroll: { x: number; y: number };
};

const PREFIX = 'patch-135-toolbar-overflow-';
const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1024x600', width: 1024, height: 600 },
  { name: '768x600', width: 768, height: 600 },
] as const;

const GRAPH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_FREEFORM_GRAPH === 'true';

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
  if (!userData.user) throw new Error('PATCH-135 fixture requires an authenticated user');

  const title = `${PREFIX}${layout}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from('boards')
    .insert({
      title,
      description: 'PATCH-135 disposable toolbar overflow fixture',
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

function railTool(page: Page, label: string) {
  return page.locator('[data-toolbar-group] div.cursor-pointer').filter({ hasText: new RegExp(`^${label}$`) }).first();
}

async function openBoard(page: Page, boardId: string, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(`/dashboard/canvas/${boardId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTitle('Back to Dashboard')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Create', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => (await measureToolbar(page)).scrollHeight, { timeout: 10_000 }).toBeLessThanOrEqual(height);
}

async function measureToolbar(page: Page, openMenu = false): Promise<ToolbarMeasurement> {
  const sidebar = page.locator('[data-toolbar-sidebar="true"]');
  await expect(sidebar).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(150);

  if (openMenu) {
    await page.getByRole('button', { name: 'More toolbar tools' }).click();
    await expect(page.locator('[data-toolbar-overflow-menu="true"]')).toBeVisible();
  }

  return sidebar.evaluate((el) => {
    const sidebarRect = el.getBoundingClientRect();
    const groupNodes = Array.from(el.querySelectorAll('[data-toolbar-group]')) as HTMLElement[];
    const visibleGroups = groupNodes
      .map((node) => node.firstElementChild?.textContent?.trim() ?? '')
      .filter(Boolean);
    const railToolNodes = Array.from(el.querySelectorAll('[data-toolbar-group] div.cursor-pointer')) as HTMLElement[];
    const railTools = railToolNodes
      .map((node) => Array.from(node.querySelectorAll('span')).at(-1)?.textContent?.trim() ?? '')
      .filter(Boolean);
    const more = el.querySelector('[data-toolbar-more-trigger="true"]') as HTMLElement | null;
    const moreRect = more?.getBoundingClientRect();
    const menu = document.querySelector('[data-toolbar-overflow-menu="true"]') as HTMLElement | null;
    const menuGroups = Array.from(menu?.querySelectorAll('[data-slot="dropdown-menu-label"]') ?? [])
      .map((node) => node.textContent?.trim() ?? '')
      .filter(Boolean);
    const menuTools = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
      .map((node) => node.textContent?.trim() ?? '')
      .filter(Boolean);
    const bottoms = [
      ...groupNodes.map((node) => node.getBoundingClientRect().bottom),
      ...(moreRect ? [moreRect.bottom] : []),
    ];
    const finalRailBottom = Math.max(sidebarRect.top, ...bottoms);

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      visibleGroups,
      overflowGroups: menuGroups,
      railTools,
      menuTools,
      morePresent: Boolean(more),
      moreFullyVisible: Boolean(
        moreRect &&
        moreRect.top >= sidebarRect.top &&
        moreRect.bottom <= sidebarRect.bottom &&
        moreRect.top >= 0 &&
        moreRect.bottom <= window.innerHeight,
      ),
      clientHeight: (el as HTMLElement).clientHeight,
      scrollHeight: (el as HTMLElement).scrollHeight,
      finalRailBottom,
      sidebarBottom: sidebarRect.bottom,
      clipping: Math.max(0, finalRailBottom - sidebarRect.bottom),
      menuZIndex: menu ? window.getComputedStyle(menu).zIndex : null,
      pageScroll: { x: window.scrollX, y: window.scrollY },
    };
  });
}

async function assertNoClipping(measurement: ToolbarMeasurement, label: string) {
  expect(measurement.clipping, `${label} clipping`).toBe(0);
  expect(measurement.scrollHeight, `${label} scrollHeight`).toBeLessThanOrEqual(measurement.clientHeight);
  if (measurement.morePresent) {
    expect(measurement.moreFullyVisible, `${label} More visible`).toBe(true);
  }
}

registerDrawingCleanup(test);

test.describe('PATCH-135 toolbar overflow', () => {
  test.describe.configure({ mode: 'serial' });

  test('keeps overflow presentation-only and the shared dropdown primitive unchanged', () => {
    const sidebarSource = source('components/collabboard/canvas/ui/CanvasSidebar.tsx');
    expect(sidebarSource).toContain('DropdownMenuContent');
    expect(sidebarSource).toContain('handleToolClick(type)');
    expect(sidebarSource).not.toContain('saveCard(');
    expect(sidebarSource).not.toContain('ActionRegistry');
    expect(sidebarSource).toContain('const OVERHEAD_H = 105');
    expect(sidebarSource).toContain('const GROUP_H = (toolCount: number) => 20 + toolCount * 44');
    expect(source('components/ui/dropdown-menu.tsx')).toContain('data-slot="dropdown-menu-content"');
  });

  test('keeps freeform toolbar capabilities reachable across the supported viewport matrix', async ({ page }) => {
    test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');
    test.setTimeout(120_000);

    const supabase = await createLiveClient();
    let fixture: Fixture | null = null;
    const measurements: ToolbarMeasurement[] = [];

    try {
      fixture = await createFixture(supabase, 'freeform');

      for (const viewport of VIEWPORTS) {
        await openBoard(page, fixture.boardId, viewport.width, viewport.height);
        const closed = await measureToolbar(page);
        await assertNoClipping(closed, viewport.name);
        expect(closed.railTools).toContain('Document');
        if (viewport.name === '1280x720') {
          expect(closed.railTools).toContain('Library');
          await railTool(page, 'Library').click({ trial: true });
        }
        if (viewport.name === '1920x1080') {
          expect(closed.morePresent).toBe(false);
        }
        if (GRAPH_ENABLED) {
          expect([...closed.railTools, ...closed.menuTools]).toContain('Graph Line');
        }

        if (closed.morePresent) {
          const open = await measureToolbar(page, true);
          measurements.push(open);
          await assertNoClipping(open, `${viewport.name} open`);
          expect(open.menuZIndex).toBe('3001');
          expect(open.pageScroll).toEqual({ x: 0, y: 0 });
          expect(open.railTools.some((tool) => open.menuTools.includes(tool))).toBe(false);
          expect([...open.railTools, ...open.menuTools]).toEqual(expect.arrayContaining(['Document', 'Library', 'Canvas settings']));
          if (viewport.name === '1024x600') {
            expect(open.menuTools).toContain('Canvas settings');
          }
          await page.keyboard.press('Escape');
          await expect(page.locator('[data-toolbar-overflow-menu="true"]')).toHaveCount(0);
        } else {
          measurements.push(closed);
        }
      }
    } finally {
      console.log(`PATCH-135 freeform measurements: ${JSON.stringify(measurements)}`);
      await cleanupFixture(supabase, fixture);
    }
  });

  test('keeps Drawing toolbar overflow reachable and unclipped', async ({ page }) => {
    test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');
    test.setTimeout(90_000);

    const { fixture } = await createDisposableDrawingBoard('patch-135-toolbar-overflow');
    const measurements: ToolbarMeasurement[] = [];

    for (const viewport of [
      { name: '1280x720', width: 1280, height: 720 },
      { name: '1024x600', width: 1024, height: 600 },
    ] as const) {
      await openBoard(page, fixture.boardId, viewport.width, viewport.height);
      const closed = await measureToolbar(page);
      await assertNoClipping(closed, `drawing ${viewport.name}`);
      expect(closed.railTools).toContain('Document');

      if (closed.morePresent) {
        const open = await measureToolbar(page, true);
        measurements.push(open);
        await assertNoClipping(open, `drawing ${viewport.name} open`);
        expect([...open.railTools, ...open.menuTools]).toEqual(expect.arrayContaining(['Library', 'Canvas settings']));
        await page.keyboard.press('Escape');
      } else {
        measurements.push(closed);
      }
    }

    console.log(`PATCH-135 drawing measurements: ${JSON.stringify(measurements)}`);
  });

  test('More trigger and menu support keyboard, outside click, touch-style pointer activation and resize recompute', async ({ page }) => {
    test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');
    test.setTimeout(90_000);

    const supabase = await createLiveClient();
    let fixture: Fixture | null = null;

    try {
      fixture = await createFixture(supabase, 'freeform');
      await openBoard(page, fixture.boardId, 1024, 600);

      const more = page.locator('[data-toolbar-more-trigger="true"]');
      await expect(more).toBeVisible();
      await more.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-toolbar-overflow-menu="true"]')).toBeVisible();
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-toolbar-overflow-menu="true"]')).toHaveCount(0);
      await expect(more).toBeFocused();

      await page.keyboard.press('Space');
      await expect(page.locator('[data-toolbar-overflow-menu="true"]')).toBeVisible();
      await page.mouse.click(900, 300);
      await expect(page.locator('[data-toolbar-overflow-menu="true"]')).toHaveCount(0);

      await more.click();
      await page.getByRole('menuitem', { name: 'Draw' }).click();
      await expect(page.locator('[data-toolbar-overflow-menu="true"]')).toHaveCount(0);

      await more.click();
      await page.getByRole('menuitem', { name: 'Draw' }).dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
      await page.getByRole('menuitem', { name: 'Draw' }).dispatchEvent('pointerup', { pointerType: 'touch', button: 0 });
      await page.keyboard.press('Escape');

      const current = await measureToolbar(page);
      if (current.railTools.includes('Library')) {
        await railTool(page, 'Library').click();
      } else {
        await more.click();
        await page.getByRole('menuitem', { name: 'Library' }).click();
      }
      await expect(page.getByText('External Library', { exact: true })).toBeVisible({ timeout: 15_000 });

      await page.setViewportSize({ width: 1920, height: 1080 });
      await expect.poll(async () => (await measureToolbar(page)).morePresent, { timeout: 10_000 }).toBe(false);
      await page.setViewportSize({ width: 1024, height: 600 });
      await expect.poll(async () => (await measureToolbar(page)).morePresent, { timeout: 10_000 }).toBe(true);
      const first = await measureToolbar(page, true);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1_000);
      const second = await measureToolbar(page, true);
      expect(second.menuTools).toEqual(first.menuTools);
      expect(second.railTools).toEqual(first.railTools);
    } finally {
      await cleanupFixture(supabase, fixture);
    }
  });

  test('permission-hidden toolbar groups stay absent from rail and overflow', async ({ page }) => {
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
      if (!userData.user) throw new Error('PATCH-135 readonly fixture requires an authenticated user');

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

      await page.setViewportSize({ width: 1024, height: 600 });
      await page.goto(`/dashboard/canvas/${fixture.boardId}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Double-click', { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(page.locator('[data-toolbar-sidebar="true"]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'More toolbar tools' })).toHaveCount(0);
      await expect(page.locator('[data-toolbar-overflow-menu="true"]')).toHaveCount(0);
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
});
