import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-192. The dashboard's data loader, with a fake Supabase client and the
 * two workspace/entitlements helpers mocked, so the assertions are about the
 * SCHEDULE (parallel vs sequential) and the failure containment.
 */

const mocks = vi.hoisted(() => ({
  resolveCurrentWorkspace: vi.fn(),
  getWorkspaceEntitlements: vi.fn(),
}));

vi.mock('@/lib/workspace/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workspace/context')>()),
  resolveCurrentWorkspace: mocks.resolveCurrentWorkspace,
}));

vi.mock('@/lib/auth/permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/permissions')>()),
  getWorkspaceEntitlements: mocks.getWorkspaceEntitlements,
}));

import { loadDashboardData } from './loadDashboardData';

const USER = { id: 'user-1', email: 'user@example.com' };
const WORKSPACE = {
  workspaceId: 'ws-1',
  ownerUserId: 'user-1',
  role: 'owner' as const,
  workspaceName: 'WS',
  workspaceLogo: null,
};
const ENTITLEMENTS = { plan: 'pro' as const, status: 'active' as const, trialEndsAt: null };

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * The query-builder chain the loader walks. Every `.eq` records which column
 * the read filtered by (the parallel-schedule proof reads them), and hands back
 * the promise the test controls.
 */
function fakeSupabase(
  fakes: { boards: Promise<unknown>; folders: Promise<unknown> },
  started: string[],
): SupabaseClient {
  const from = (table: string) => ({
    select: () => ({
      order: () => ({
        eq: (column: string, value: unknown) => {
          void value;
          started.push(`${table}:${column}`);
          return fakes[table as 'boards' | 'folders'];
        },
      }),
    }),
  });
  return { from } as unknown as SupabaseClient;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.resolveCurrentWorkspace.mockResolvedValue(WORKSPACE);
  mocks.getWorkspaceEntitlements.mockResolvedValue(ENTITLEMENTS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PATCH-192: entitlements, boards and folders run in parallel', () => {
  it('all three are STARTED before any of them resolves', async () => {
    const started: string[] = [];
    const boards = deferred<{ data: unknown; error: unknown }>();
    const folders = deferred<{ data: unknown; error: unknown }>();
    const entitlements = deferred<unknown>();
    mocks.getWorkspaceEntitlements.mockReturnValue(entitlements.promise);

    const pending = loadDashboardData(
      fakeSupabase({ boards: boards.promise, folders: folders.promise }, started),
      USER,
    );

    // The workspace resolves first; by the time one macrotask has passed, all
    // three reads must have been launched even though none has answered.
    await flush();
    expect(mocks.getWorkspaceEntitlements).toHaveBeenCalledTimes(1);
    expect(started).toEqual(expect.arrayContaining(['boards:workspace_id', 'folders:workspace_id']));

    boards.resolve({ data: [{ id: 1, title: 'B' }], error: null });
    folders.resolve({ data: [{ id: 'f1', name: 'F' }], error: null });
    entitlements.resolve(ENTITLEMENTS);

    const result = await pending;
    expect(result.canvases).toHaveLength(1);
    expect(result.folders).toHaveLength(1);
    expect(result.entitlements).toEqual(ENTITLEMENTS);
  });

  it('a workspace present filters boards and folders by workspace_id', async () => {
    const started: string[] = [];
    const supabase = fakeSupabase({
      boards: Promise.resolve({ data: [], error: null }),
      folders: Promise.resolve({ data: [], error: null }),
    }, started);

    await loadDashboardData(supabase, USER);

    expect(started).toContain('boards:workspace_id');
    expect(started).toContain('folders:workspace_id');
  });

  it('no workspace filters boards and folders by user_id', async () => {
    mocks.resolveCurrentWorkspace.mockResolvedValue(null);
    const started: string[] = [];
    const supabase = fakeSupabase({
      boards: Promise.resolve({ data: [], error: null }),
      folders: Promise.resolve({ data: [], error: null }),
    }, started);

    await loadDashboardData(supabase, USER);

    expect(started).toContain('boards:user_id');
    expect(started).toContain('folders:user_id');
  });
});

describe('PATCH-192: one failed read never hides the others', () => {
  it('a boards error yields canvases [] while folders and entitlements still return', async () => {
    const started: string[] = [];
    const supabase = fakeSupabase({
      boards: Promise.resolve({ data: null, error: { message: 'boom' } }),
      folders: Promise.resolve({ data: [{ id: 'f1', name: 'F' }], error: null }),
    }, started);

    const result = await loadDashboardData(supabase, USER);

    expect(result.canvases).toEqual([]);
    expect(result.folders).toHaveLength(1);
    expect(result.entitlements).toEqual(ENTITLEMENTS);
  });

  it('a folders error yields folders [] while canvases still return', async () => {
    const started: string[] = [];
    const supabase = fakeSupabase({
      boards: Promise.resolve({ data: [{ id: 1, title: 'B' }], error: null }),
      folders: Promise.resolve({ data: null, error: { message: 'boom' } }),
    }, started);

    const result = await loadDashboardData(supabase, USER);

    expect(result.folders).toEqual([]);
    expect(result.canvases).toHaveLength(1);
  });

  it('a THROWN folders read yields folders [] while canvases still return', async () => {
    const started: string[] = [];
    const supabase = fakeSupabase({
      boards: Promise.resolve({ data: [{ id: 1, title: 'B' }], error: null }),
      folders: Promise.reject(new Error('relation does not exist')),
    }, started);

    const result = await loadDashboardData(supabase, USER);

    expect(result.folders).toEqual([]);
    expect(result.canvases).toHaveLength(1);
  });

  it('a THROWN entitlements read yields entitlements null while canvases still return', async () => {
    mocks.getWorkspaceEntitlements.mockRejectedValue(new Error('entitlements down'));
    const started: string[] = [];
    const supabase = fakeSupabase({
      boards: Promise.resolve({ data: [{ id: 1, title: 'B' }], error: null }),
      folders: Promise.resolve({ data: [], error: null }),
    }, started);

    const result = await loadDashboardData(supabase, USER);

    expect(result.entitlements).toBeNull();
    expect(result.canvases).toHaveLength(1);
  });

  it('a thrown workspace resolution yields workspace null and filters by user_id', async () => {
    mocks.resolveCurrentWorkspace.mockRejectedValue(new Error('workspace down'));
    const started: string[] = [];
    const supabase = fakeSupabase({
      boards: Promise.resolve({ data: [], error: null }),
      folders: Promise.resolve({ data: [], error: null }),
    }, started);

    const result = await loadDashboardData(supabase, USER);

    expect(result.workspace).toBeNull();
    expect(started).toContain('boards:user_id');
    expect(started).toContain('folders:user_id');
  });
});
