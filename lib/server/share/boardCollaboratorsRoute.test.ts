import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-362. The board-collaborators route contract: list the people who joined
 * by link (admin-only) and remove one (admin-only, never the owner). The
 * authority check is the SAME `getBoardPermission` + `boardPermissionSatisfies`
 * the redeem route uses; the data reads happen with the admin client AFTER it.
 *
 * app/api/** is outside vitest's include globs, so the routes are exercised from
 * here -- the same pattern as shareLinkRedeemRoute.test.ts.
 */

interface CollaboratorRow { user_id: string; role: string | null; added_at: string | null; joined_via_link_id?: string | null }
interface ProfileRow { id: string; email: string | null; full_name: string | null; name?: string | null }

const state = {
  permission: 'admin' as string | null,
  rpcError: null as { message?: string } | null,
  collaborators: [] as CollaboratorRow[],
  collaboratorsError: null as { message?: string } | null,
  profiles: [] as ProfileRow[],
  profilesError: null as { message?: string } | null,
  board: null as { user_id: string | null } | null,
  boardError: null as { message?: string } | null,
  deletedRows: [] as Array<{ user_id: string }>,
  deleteError: null as { message?: string } | null,
};

const calls = {
  rpc: [] as Array<{ name: string; args: Record<string, unknown> }>,
  deletes: [] as Array<{ table: string; filters: Record<string, unknown> }>,
};

function resolveSelect(table: string) {
  if (table === 'board_collaborators') {
    return { data: state.collaboratorsError ? null : state.collaborators, error: state.collaboratorsError };
  }
  if (table === 'users') {
    return { data: state.profilesError ? null : state.profiles, error: state.profilesError };
  }
  if (table === 'boards') {
    return { data: state.boardError ? null : state.board, error: state.boardError };
  }
  return { data: null, error: null };
}

function makeFakeAdmin() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let op: 'select' | 'delete' = 'select';
      const chain: any = {};
      chain.eq = (column: string, value: unknown) => { filters[column] = value; return chain; };
      chain.in = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.select = () => chain;
      chain.maybeSingle = () => Promise.resolve(resolveSelect(table));
      chain.then = (resolve: (value: unknown) => unknown) => {
        if (op === 'delete') {
          calls.deletes.push({ table, filters });
          return resolve({ data: state.deleteError ? null : state.deletedRows, error: state.deleteError });
        }
        return resolve(resolveSelect(table));
      };
      return {
        select: (_columns: string) => chain,
        delete: () => { op = 'delete'; return chain; },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.rpc.push({ name, args });
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
const BOARD_ID = 'board-1';

type ListRoute = typeof import('../../../app/api/boards/[id]/collaborators/route');
type RemoveRoute = typeof import('../../../app/api/boards/[id]/collaborators/[userId]/route');
let listRoute: ListRoute;
let removeRoute: RemoveRoute;

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const listGet = () => listRoute.GET(
  new NextRequest(`http://localhost/api/boards/${BOARD_ID}/collaborators`),
  { params: Promise.resolve({ id: BOARD_ID }) },
);

const removeDelete = (userId: string) => removeRoute.DELETE(
  new NextRequest(`http://localhost/api/boards/${BOARD_ID}/collaborators/${userId}`, { method: 'DELETE' }),
  { params: Promise.resolve({ id: BOARD_ID, userId }) },
);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  state.permission = 'admin';
  state.rpcError = null;
  state.collaborators = [];
  state.collaboratorsError = null;
  state.profiles = [];
  state.profilesError = null;
  state.board = null;
  state.boardError = null;
  state.deletedRows = [];
  state.deleteError = null;
  calls.rpc.length = 0;
  calls.deletes.length = 0;
  mocks.cookies.mockResolvedValue({});
  session();
  listRoute = await import('../../../app/api/boards/[id]/collaborators/route');
  removeRoute = await import('../../../app/api/boards/[id]/collaborators/[userId]/route');
});

describe('PATCH-362 GET /boards/[id]/collaborators', () => {
  it('401 without a session', async () => {
    session(null);
    expect((await listGet()).status).toBe(401);
  });

  it('403 when the caller is not a board admin', async () => {
    state.permission = 'editor';
    const response = await listGet();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Only the board owner can manage access.' });
  });

  it('lists people with names, guest flags and emails withheld from guests', async () => {
    state.collaborators = [
      { user_id: 'u1', role: 'editor', added_at: '2026-01-01T00:00:00Z' },
      { user_id: 'u2', role: 'viewer', added_at: '2026-01-02T00:00:00Z' },
    ];
    state.profiles = [
      { id: 'u1', email: 'ada@example.com', full_name: 'Ada Lovelace' },
      { id: 'u2', email: null, full_name: null },
    ];

    const response = await listGet();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      people: [
        { userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'editor', isGuest: false, joinedAt: '2026-01-01T00:00:00Z', joinedViaLinkId: null },
        { userId: 'u2', name: 'Guest', email: null, role: 'viewer', isGuest: true, joinedAt: '2026-01-02T00:00:00Z', joinedViaLinkId: null },
      ],
    });
    expect(calls.rpc[0]).toEqual({
      name: 'get_board_permission',
      args: { board_uuid: BOARD_ID, user_uuid: USER_ID },
    });
  });

  it('PATCH-380: returns the link each person joined through', async () => {
    state.collaborators = [
      { user_id: 'u1', role: 'editor', added_at: '2026-01-01T00:00:00Z', joined_via_link_id: 'link-1' },
    ];
    state.profiles = [{ id: 'u1', email: 'ada@example.com', full_name: 'Ada Lovelace' }];

    const response = await listGet();
    expect(response.status).toBe(200);
    const body = await response.json() as { people: Array<{ joinedViaLinkId: string | null }> };
    expect(body.people[0].joinedViaLinkId).toBe('link-1');
  });

  it('returns an empty list when nobody joined', async () => {
    const response = await listGet();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ people: [] });
  });
});

describe('PATCH-362 DELETE /boards/[id]/collaborators/[userId]', () => {
  it('401 without a session', async () => {
    session(null);
    expect((await removeDelete('u2')).status).toBe(401);
  });

  it('403 when the caller is not a board admin', async () => {
    state.permission = 'commenter';
    const response = await removeDelete('u2');
    expect(response.status).toBe(403);
    expect(calls.deletes).toHaveLength(0);
  });

  it('400 when asked to remove the board owner', async () => {
    state.board = { user_id: 'owner-1' };
    const response = await removeDelete('owner-1');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "The board owner can't be removed." });
    expect(calls.deletes).toHaveLength(0);
  });

  it('404 when there was no collaborator row', async () => {
    state.deletedRows = [];
    const response = await removeDelete('u2');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'That person is not a collaborator.' });
  });

  it('200 and removes the row', async () => {
    state.deletedRows = [{ user_id: 'u2' }];
    const response = await removeDelete('u2');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ removed: true });
    expect(calls.deletes[0]).toEqual({
      table: 'board_collaborators',
      filters: { board_id: BOARD_ID, user_id: 'u2' },
    });
  });
});
