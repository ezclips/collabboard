import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-380. The share-link DELETE route with the optional "also remove the
 * people who joined" body. The ids are collected BEFORE the link row is deleted,
 * because the FK is ON DELETE SET NULL; the owner is never removed; and the
 * response reports how many people went.
 *
 * app/api/** is outside vitest's include globs, so the route is exercised from
 * here -- the same pattern as shareLinkRedeemRoute.test.ts.
 */

const state = {
  permission: 'admin' as string | null,
  rpcError: null as { message?: string } | null,
  board: null as { user_id: string | null } | null,
  boardError: null as { message?: string } | null,
  joined: [] as Array<{ user_id: string }>,
  joinedError: null as { message?: string } | null,
  deleted: [] as Array<{ id: string }>,
  deleteError: null as { message?: string } | null,
  removedRows: [] as Array<{ user_id: string }>,
  removeError: null as { message?: string } | null,
};

const calls = {
  order: [] as string[],
  joinedFilters: [] as Array<Record<string, unknown>>,
  removedFilters: [] as Array<Record<string, unknown>>,
  removedIds: null as unknown,
};

function makeFakeAdmin() {
  return {
    from(table: string) {
      if (table === 'boards') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.board, error: state.boardError }) }),
          }),
        };
      }
      if (table === 'board_collaborators') {
        const selectChain: Record<string, unknown> = {};
        const filters: Record<string, unknown> = {};
        selectChain.eq = (column: string, value: unknown) => { filters[column] = value; return selectChain; };
        selectChain.then = (resolve: (value: unknown) => unknown) => {
          calls.order.push('collect');
          calls.joinedFilters.push({ ...filters });
          return resolve({ data: state.joinedError ? null : state.joined, error: state.joinedError });
        };

        const deleteChain: Record<string, unknown> = {};
        const deleteFilters: Record<string, unknown> = {};
        deleteChain.eq = (column: string, value: unknown) => { deleteFilters[column] = value; return deleteChain; };
        deleteChain.in = (column: string, value: unknown) => {
          calls.removedIds = { column, value };
          return deleteChain;
        };
        deleteChain.select = () => deleteChain;
        deleteChain.then = (resolve: (value: unknown) => unknown) => {
          calls.order.push('remove');
          calls.removedFilters.push({ ...deleteFilters });
          return resolve({ data: state.removeError ? null : state.removedRows, error: state.removeError });
        };

        return { select: () => selectChain, delete: () => deleteChain };
      }
      if (table === 'share_links') {
        const chain: Record<string, unknown> = {};
        chain.eq = () => chain;
        chain.select = () => chain;
        chain.then = (resolve: (value: unknown) => unknown) => {
          calls.order.push('delete-link');
          return resolve({ data: state.deleteError ? null : state.deleted, error: state.deleteError });
        };
        return { delete: () => chain };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    rpc(name: string, args: Record<string, unknown>) {
      void name;
      void args;
      return Promise.resolve({ data: state.rpcError ? null : state.permission, error: state.rpcError });
    },
  };
}

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: mocks.createRouteHandlerClient,
}));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => makeFakeAdmin() }));

const USER_ID = 'admin-1';
const BOARD_ID = 'f1000000-0000-4000-8000-0000000000b1';
const LINK_ID = 'f2000000-0000-4000-8000-0000000000c2';

type RouteModule = typeof import('../../../app/api/boards/[id]/share-links/[linkId]/route');
let route: RouteModule;

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const del = (body?: unknown, id = BOARD_ID, linkId = LINK_ID) => route.DELETE(
  new NextRequest(`http://localhost/api/boards/${id}/share-links/${linkId}`, {
    method: 'DELETE',
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  }),
  { params: Promise.resolve({ id, linkId }) },
);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  state.permission = 'admin';
  state.rpcError = null;
  state.board = { user_id: 'owner-1' };
  state.boardError = null;
  state.joined = [];
  state.joinedError = null;
  state.deleted = [{ id: LINK_ID }];
  state.deleteError = null;
  state.removedRows = [];
  state.removeError = null;
  calls.order.length = 0;
  calls.joinedFilters.length = 0;
  calls.removedFilters.length = 0;
  calls.removedIds = null;
  mocks.cookies.mockResolvedValue({});
  session();
  route = await import('../../../app/api/boards/[id]/share-links/[linkId]/route');
});

describe('PATCH-380 DELETE /boards/[id]/share-links/[linkId]', () => {
  it('401 without a session', async () => {
    session(null);
    expect((await del()).status).toBe(401);
  });

  it('400 for a malformed id', async () => {
    expect((await del(undefined, 'not-a-uuid')).status).toBe(400);
  });

  it('403 when the caller is not a board admin', async () => {
    state.permission = 'editor';
    const response = await del({ removeJoined: true });
    expect(response.status).toBe(403);
    expect(calls.order).toEqual([]);
  });

  it('without removeJoined: deletes the link, removes nobody, reports 0', async () => {
    const response = await del();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ removed: 0 });
    expect(calls.order).toEqual(['delete-link']);
  });

  it('removeJoined: collects the joined ids BEFORE deleting the link, then removes them', async () => {
    state.joined = [{ user_id: 'guest-1' }, { user_id: 'guest-2' }];
    state.removedRows = [{ user_id: 'guest-1' }, { user_id: 'guest-2' }];

    const response = await del({ removeJoined: true });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ removed: 2 });
    // The collect MUST precede the link delete, or the FK nulls the ids first.
    expect(calls.order).toEqual(['collect', 'delete-link', 'remove']);
    expect(calls.joinedFilters[0]).toEqual({ board_id: BOARD_ID, joined_via_link_id: LINK_ID });
    expect(calls.removedIds).toEqual({ column: 'user_id', value: ['guest-1', 'guest-2'] });
  });

  it('removeJoined never removes the board owner, even if a row names them', async () => {
    state.board = { user_id: 'owner-1' };
    state.joined = [{ user_id: 'owner-1' }, { user_id: 'guest-1' }];
    state.removedRows = [{ user_id: 'guest-1' }];

    const response = await del({ removeJoined: true });

    expect(await response.json()).toEqual({ removed: 1 });
    expect(calls.removedIds).toEqual({ column: 'user_id', value: ['guest-1'] });
  });

  it('404 when the link is not found, and nobody is removed', async () => {
    state.deleted = [];
    state.joined = [{ user_id: 'guest-1' }];

    const response = await del({ removeJoined: true });

    expect(response.status).toBe(404);
    expect(calls.order).toEqual(['collect', 'delete-link']);
  });

  it('500 when removing the joined people fails, and it is not swallowed', async () => {
    state.joined = [{ user_id: 'guest-1' }];
    state.removeError = { message: 'boom' };

    const response = await del({ removeJoined: true });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'The link was turned off, but removing its people failed.',
    });
  });

  it('an unparseable body means link-only', async () => {
    const response = await del({ removeJoined: 'yes' });
    expect(await response.json()).toEqual({ removed: 0 });
    expect(calls.order).toEqual(['delete-link']);
  });
});
