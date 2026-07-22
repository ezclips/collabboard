import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { E2E_EMAIL, E2E_PASSWORD, hasE2ECredentials } from '../helpers/env';

export const DRAWING_HARNESS_PREFIX = 'patch-064-harness-';

type Json = Record<string, unknown>;

export type DrawingFixture = {
  prefix: string;
  boardId: string;
  boardTitle: string;
  masterPadletId: string | null;
  containerIds: string[];
  childIds: string[];
  lineIds: string[];
  frameIds: string[];
  uploadedImagePadletIds: string[];
};

export type CleanupCounts = {
  boards: number;
  padlets: number;
  canvasLines: number;
};

type SeededContainers = {
  containers: { id: string; title: string }[];
  children: { id: string; title: string; parentId: string }[];
};

type RegisteredDrawingCleanup = {
  supabase: SupabaseClient;
  fixture: DrawingFixture;
};

type PlaywrightTest = typeof import('@playwright/test').test;

const registeredDrawingFixtures: RegisteredDrawingCleanup[] = [];

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
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

export async function createHarnessClient(): Promise<SupabaseClient> {
  if (!hasE2ECredentials) throw new Error('E2E credentials unavailable');
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

function createCleanupClient(fallback: SupabaseClient): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvLocal('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) return fallback;
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

let fixtureElementIndexCounter = 0;

function nextFixtureFractionalIndex(): string {
  fixtureElementIndexCounter += 1;
  return `a${String(fixtureElementIndexCounter).padStart(6, '0')}`;
}

function embeddableElement(id: string, padletId: string, x: number, y: number, width = 320, height = 220, frameId: string | null = null): Json {
  return {
    id,
    type: 'embeddable',
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: nextFixtureFractionalIndex(),
    isDeleted: false,
    groupIds: [],
    frameId,
    boundElements: null,
    updated: Date.now(),
    link: `padlet://${padletId}`,
    locked: false,
    customData: {},
  };
}

function frameElement(id: string, name: string, x: number, y: number, width: number, height: number): Json {
  return {
    id,
    type: 'frame',
    name,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: '#000000',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    frameId: null,
    groupIds: [],
    isDeleted: false,
    version: 1,
    versionNonce: 1,
    updated: Date.now(),
    index: nextFixtureFractionalIndex(),
    boundElements: null,
    link: null,
    locked: false,
  };
}

function textElement(id: string, text: string, x: number, y: number, frameId: string): Json {
  return {
    id,
    type: 'text',
    x,
    y,
    width: 220,
    height: 32,
    angle: 0,
    strokeColor: '#111827',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: 2,
    groupIds: [],
    frameId,
    isDeleted: false,
    version: 1,
    versionNonce: 1,
    updated: Date.now(),
    index: nextFixtureFractionalIndex(),
    boundElements: null,
    link: null,
    locked: false,
    text,
    fontSize: 24,
    fontFamily: 1,
    fontString: '24px Virgil',
    textAlign: 'left',
    verticalAlign: 'top',
    containerId: null,
    originalText: text,
    lineHeight: 1.25,
    baseline: 23,
    autoResize: true,
};
}

function rectangleElement(id: string, x: number, y: number, frameId: string): Json {
  return {
    id,
    type: 'rectangle',
    x,
    y,
    width: 120,
    height: 70,
    angle: 0,
    strokeColor: '#2563eb',
    backgroundColor: '#dbeafe',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: 3,
    groupIds: [],
    frameId,
    isDeleted: false,
    version: 1,
    versionNonce: 1,
    updated: Date.now(),
    index: nextFixtureFractionalIndex(),
    boundElements: null,
    link: null,
    locked: false,
  };
}

async function insertMasterPadlet(supabase: SupabaseClient, fixture: DrawingFixture, elements: Json[]): Promise<void> {
  const row = {
    board_id: fixture.boardId,
    title: `${fixture.prefix} master`,
    content: JSON.stringify(elements),
    type: 'drawing',
    position_x: 0,
    position_y: 0,
    width: 0,
    height: 0,
    metadata: {
      patch064Harness: true,
      drawingAppState: JSON.stringify({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
      drawingFiles: JSON.stringify({}),
    },
  };
  const { data, error } = await supabase.from('padlets').insert(row).select('id').single();
  if (error) throw error;
  fixture.masterPadletId = data.id;
}

export function registerDrawingCleanup(test: PlaywrightTest): void {
  test.afterEach(async () => {
    const failures: string[] = [];

    while (registeredDrawingFixtures.length > 0) {
      const entry = registeredDrawingFixtures.shift()!;

      try {
        await cleanupDrawingFixture(entry.supabase, entry.fixture);
        await assertDrawingFixtureCleanup(entry.supabase, entry.fixture);
      } catch (error) {
        failures.push(
          `prefix=${entry.fixture.prefix} boardId=${entry.fixture.boardId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`PATCH-074 shared drawing cleanup failed: ${failures.join('; ')}`);
    }
  });
}

export async function createDisposableDrawingBoard(label: string): Promise<{ supabase: SupabaseClient; fixture: DrawingFixture }> {
  const supabase = await createHarnessClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const prefix = `${DRAWING_HARNESS_PREFIX}${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from('boards')
    .insert({
      title: prefix,
      description: 'PATCH-064 disposable Drawing harness board',
      layout: 'drawing',
      user_id: userData.user.id,
      background_type: 'color',
      background_value: '#ffffff',
      container_size: 'medium',
    })
    .select('id,title')
    .single();
  if (error) throw error;
  const fixture: DrawingFixture = {
    prefix,
    boardId: data.id,
    boardTitle: data.title,
    masterPadletId: null,
    containerIds: [],
    childIds: [],
    lineIds: [],
    frameIds: [],
    uploadedImagePadletIds: [],
  };
  registeredDrawingFixtures.push({ supabase, fixture });
  return {
    supabase,
    fixture,
  };
}

export async function seedDrawingContainers(supabase: SupabaseClient, fixture: DrawingFixture): Promise<SeededContainers> {
  const containerA = uuid();
  const containerB = uuid();
  const containerC = uuid();
  const childA = uuid();
  const childB = uuid();
  const childC = uuid();
  const rows = [
    {
      id: containerA,
      board_id: fixture.boardId,
      title: `${fixture.prefix} Container A`,
      content: '',
      type: 'container',
      position_x: 160,
      position_y: 140,
      width: 320,
      height: 220,
      metadata: { patch064Harness: true, childPadletIds: [childA] },
    },
    {
      id: containerB,
      board_id: fixture.boardId,
      title: `${fixture.prefix} Container B`,
      content: '',
      type: 'container',
      position_x: 620,
      position_y: 160,
      width: 320,
      height: 220,
      metadata: { patch064Harness: true, childPadletIds: [childB] },
    },
    {
      id: containerC,
      board_id: fixture.boardId,
      title: `${fixture.prefix} Container C`,
      content: '',
      type: 'container',
      position_x: 160,
      position_y: 460,
      width: 320,
      height: 220,
      metadata: { patch064Harness: true, childPadletIds: [childC] },
    },
    {
      id: childA,
      board_id: fixture.boardId,
      title: `${fixture.prefix} child A`,
      content: 'PATCH-064 child A',
      type: 'note',
      position_x: 0,
      position_y: 0,
      width: 260,
      height: 120,
      metadata: { patch064Harness: true, parentId: containerA, containerIndex: 0 },
    },
    {
      id: childB,
      board_id: fixture.boardId,
      title: `${fixture.prefix} child B`,
      content: 'PATCH-064 child B with more text for natural height',
      type: 'note',
      position_x: 0,
      position_y: 0,
      width: 260,
      height: 160,
      metadata: { patch064Harness: true, parentId: containerB, containerIndex: 0 },
    },
    {
      id: childC,
      board_id: fixture.boardId,
      title: `${fixture.prefix} child C`,
      content: 'PATCH-064 child C',
      type: 'note',
      position_x: 0,
      position_y: 0,
      width: 260,
      height: 120,
      metadata: { patch064Harness: true, parentId: containerC, containerIndex: 0 },
    },
  ];
  const { error } = await supabase.from('padlets').insert(rows);
  if (error) throw error;
  fixture.containerIds.push(containerA, containerB, containerC);
  fixture.childIds.push(childA, childB, childC);
  return {
    containers: [
      { id: containerA, title: rows[0].title },
      { id: containerB, title: rows[1].title },
      { id: containerC, title: rows[2].title },
    ],
    children: [
      { id: childA, title: rows[3].title, parentId: containerA },
      { id: childB, title: rows[4].title, parentId: containerB },
      { id: childC, title: rows[5].title, parentId: containerC },
    ],
  };
}

export async function seedAttachedCanvasLines(supabase: SupabaseClient, fixture: DrawingFixture): Promise<void> {
  const [a, b, c] = fixture.containerIds;
  const rows = [
    {
      board_id: fixture.boardId,
      start_x: 480,
      start_y: 250,
      control_x: 560,
      control_y: 120,
      end_x: 620,
      end_y: 270,
      points: [{ x: 480, y: 250, type: 'smooth' }, { x: 620, y: 270, type: 'smooth' }],
      start_post_id: a,
      end_post_id: b,
      color: '#dc2626',
      stroke_width: 3,
      start_arrow: false,
      end_arrow: true,
      dashed: false,
      label: 'attached A-B',
      layer_plane: 'back',
      z_index: 0,
    },
    {
      board_id: fixture.boardId,
      start_x: 480,
      start_y: 570,
      control_x: 560,
      control_y: 430,
      end_x: 620,
      end_y: 300,
      points: [{ x: 480, y: 570, type: 'smooth' }, { x: 620, y: 300, type: 'smooth' }],
      start_post_id: c,
      end_post_id: b,
      color: '#16a34a',
      stroke_width: 2,
      start_arrow: true,
      end_arrow: true,
      dashed: false,
      label: 'attached C-B',
      layer_plane: 'back',
      z_index: 1,
    },
    {
      board_id: fixture.boardId,
      start_x: 320,
      start_y: 360,
      control_x: 350,
      control_y: 260,
      end_x: 480,
      end_y: 250,
      points: [{ x: 320, y: 360, type: 'smooth' }, { x: 480, y: 250, type: 'smooth' }],
      start_post_id: a,
      end_post_id: b,
      color: '#7c3aed',
      stroke_width: 2,
      start_arrow: false,
      end_arrow: false,
      dashed: true,
      label: 'second A line',
      layer_plane: 'back',
      z_index: 2,
    },
  ];
  const { data, error } = await supabase.from('canvas_lines').insert(rows).select('id');
  if (error) throw error;
  fixture.lineIds.push(...data.map((row) => row.id));
}

export async function seedLineScene(supabase: SupabaseClient, fixture: DrawingFixture): Promise<void> {
  const [a, b, c] = fixture.containerIds;
  await insertMasterPadlet(supabase, fixture, [
    embeddableElement('emb-line-a', a, 160, 140),
    embeddableElement('emb-line-b', b, 620, 160),
    embeddableElement('emb-line-c', c, 160, 460),
  ]);
}

export async function seedPresentationScene(supabase: SupabaseClient, fixture: DrawingFixture): Promise<void> {
  const [a, b] = fixture.containerIds;
  const uploadedImageId = uuid();
  const { error } = await supabase.from('padlets').insert({
    id: uploadedImageId,
    board_id: fixture.boardId,
    title: 'PATCH-064 uploaded template image',
    content: '',
    type: 'image',
    file_url: '/templates/moodboard.png',
    file_name: 'moodboard.png',
    file_type: 'image/png',
    position_x: 780,
    position_y: 120,
    width: 320,
    height: 260,
    metadata: { patch064Harness: true, deterministicFixture: 'public/templates/moodboard.png' },
  });
  if (error) throw error;
  fixture.uploadedImagePadletIds.push(uploadedImageId);
  const landscape = 'frame-landscape';
  const portrait = 'frame-portrait';
  fixture.frameIds.push(portrait, landscape);
  await insertMasterPadlet(supabase, fixture, [
    frameElement(portrait, 'PATCH-064 Portrait', 1400, 0, 720, 1280),
    frameElement(landscape, 'PATCH-064 Landscape', 0, 0, 1280, 720),
    embeddableElement('emb-slide-a', a, 360, 120, 360, 260, landscape),
    embeddableElement('emb-uploaded-image', uploadedImageId, 780, 120, 320, 260, landscape),
    textElement('text-landscape', 'PATCH-064 native text', 80, 80, landscape),
    rectangleElement('shape-landscape', 80, 150, landscape),
    embeddableElement('emb-slide-b', b, 1500, 120, 340, 260, portrait),
  ]);
}

export async function openDrawingBoard(page: Page, boardId: string): Promise<string> {
  const url = `/dashboard/canvas/${boardId}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByTitle('Back to Dashboard').waitFor({ timeout: 90_000 });
  await page.locator('[data-padlet-id]').first().waitFor({ timeout: 90_000 });
  return page.url();
}

export async function fetchHarnessLineRows(supabase: SupabaseClient, boardId: string) {
  const { data, error } = await supabase
    .from('canvas_lines')
    .select('id,start_post_id,end_post_id,start_x,start_y,end_x,end_y,layer_plane,label')
    .eq('board_id', boardId)
    .order('z_index', { ascending: true });
  if (error) throw error;
  return data;
}

export async function cleanupDrawingFixture(supabase: SupabaseClient, fixture: DrawingFixture): Promise<void> {
  const cleanupClient = createCleanupClient(supabase);
  const failures: string[] = [];
  const runCleanupStep = async (name: string, action: () => PromiseLike<{ error: unknown }>) => {
    try {
      const { error } = await action();
      if (error) failures.push(`${name}: ${JSON.stringify(error)}`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  await runCleanupStep('canvas_lines by created ids', () =>
    fixture.lineIds.length
      ? cleanupClient.from('canvas_lines').delete().in('id', fixture.lineIds)
      : Promise.resolve({ error: null }),
  );
  await runCleanupStep('canvas_lines by board id', () =>
    cleanupClient.from('canvas_lines').delete().eq('board_id', fixture.boardId),
  );
  await runCleanupStep('padlets by board id', () =>
    cleanupClient.from('padlets').delete().eq('board_id', fixture.boardId),
  );
  await runCleanupStep('board by id and harness title', () =>
    cleanupClient.from('boards').delete().eq('id', fixture.boardId).like('title', `${DRAWING_HARNESS_PREFIX}%`),
  );

  if (failures.length > 0) {
    throw new Error(`PATCH-064 cleanup failed: ${failures.join('; ')}`);
  }
}

export async function assertDrawingFixtureCleanup(
  supabase: SupabaseClient,
  fixtureOrPrefix: DrawingFixture | string = DRAWING_HARNESS_PREFIX,
): Promise<CleanupCounts> {
  const cleanupClient = createCleanupClient(supabase);
  const prefix = typeof fixtureOrPrefix === 'string' ? fixtureOrPrefix : fixtureOrPrefix.prefix;
  const lineIds = typeof fixtureOrPrefix === 'string' ? [] : fixtureOrPrefix.lineIds;
  const boardId = typeof fixtureOrPrefix === 'string' ? null : fixtureOrPrefix.boardId;
  const { data: boards, error: boardError } = await cleanupClient
    .from('boards')
    .select('id,title')
    .like('title', `${prefix}%`);
  if (boardError) throw boardError;
  const { data: padlets, error: padletError } = await cleanupClient
    .from('padlets')
    .select('id,title')
    .like('title', `${prefix}%`);
  if (padletError) throw padletError;
  let canvasLines: unknown[] = [];
  if (lineIds.length > 0) {
    const { data, error } = await cleanupClient
      .from('canvas_lines')
      .select('id,board_id')
      .in('id', lineIds);
    if (error) throw error;
    canvasLines = data ?? [];
  } else if (boardId) {
    const { data, error } = await cleanupClient
      .from('canvas_lines')
      .select('id,board_id')
      .eq('board_id', boardId);
    if (error) throw error;
    canvasLines = data ?? [];
  }
  const counts = {
    boards: boards?.length ?? 0,
    padlets: padlets?.length ?? 0,
    canvasLines: canvasLines.length,
  };
  expect({ boards: boards ?? [], padlets: padlets ?? [], canvasLines }).toEqual({
    boards: [],
    padlets: [],
    canvasLines: [],
  });
  return counts;
}
