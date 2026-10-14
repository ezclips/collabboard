import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// app/api/** is outside vitest.config.ts's include globs, so the redeem route is
// imported and exercised from here -- the same pattern as
// lib/server/share/sharePasswordRoute.test.ts.

/**
 * PATCH-357. The share-link redeem route. It grants a signed-in user the board
 * role a link carries, and it must deny by default: 401 without a session, 404
 * unknown, 410 expired, 400 post-only, 403 a missing/wrong password or an
 * unusable permission, and never a downgrade of an existing higher role. The
 * response never carries the token or the password hash.
 */

interface ShareLinkRow {
  id: string | number;
  board_id: string | null;
  padlet_id: string | null;
  permission: string | null;
  password_hash: string | null;
  expires_at: string | null;
  access_count: number | null;
}

interface FakeState {
  link: ShareLinkRow | null;
  linkError: { message?: string; code?: string } | null;
  permission: string | null;
  rpcError: { message?: string } | null;
  existingCollaborator: { role: string | null } | null;
  upsertError: { message?: string } | null;
  updateError: { message?: string } | null;
  // PATCH-360. The Kanban membership step.
  existingKanbanMember: { permission_level: string | null } | null;
  kanbanLookupError: { message?: string } | null;
  kanbanUpsertError: { message?: string } | null;
  kanbanUpdateError: { message?: string } | null;
}

const state: FakeState = {
  link: null,
  linkError: null,
  permission: null,
  rpcError: null,
  existingCollaborator: null,
  upsertError: null,
  updateError: null,
  existingKanbanMember: null,
  kanbanLookupError: null,
  kanbanUpsertError: null,
  kanbanUpdateError: null,
};

const calls = {
  upserts: [] as Array<Record<string, unknown>>,
  upsertOptions: [] as unknown[],
  updates: [] as Array<Record<string, unknown>>,
  rpc: [] as Array<{ name: string; args: Record<string, unknown> }>,
  // PATCH-360.
  kanbanUpserts: [] as Array<Record<string, unknown>>,
  kanbanUpsertOptions: [] as unknown[],
  kanbanUpdates: [] as Array<Record<string, unknown>>,
};

/** A thenable that is also chainable, so `.eq().eq()` and `await .eq()` both work. */
function chainable(error: unknown) {
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.then = (resolve: (value: { error: unknown }) => unknown) => resolve({ error });
  return chain;
}

function makeFakeAdmin() {
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return chain;
            },
            async maybeSingle() {
              if (table === 'share_links') {
                return { data: state.linkError ? null : state.link, error: state.linkError };
              }
              if (table === 'board_collaborators') {
                return { data: state.existingCollaborator, error: null };
              }
              if (table === 'kanban_board_members') {
                return {
                  data: state.kanbanLookupError ? null : state.existingKanbanMember,
                  error: state.kanbanLookupError,
                };
              }
              return { data: null, error: null };
            },
          };
          return chain;
        },
        insert(payload: Record<string, unknown>) {
          // Unused by the route now (the Kanban step upserts); kept so a stray
          // insert is visible rather than silently succeeding.
          calls.kanbanUpserts.push(payload);
          return Promise.resolve({ error: state.kanbanUpsertError });
        },
        upsert(payload: Record<string, unknown>, options?: unknown) {
          if (table === 'kanban_board_members') {
            calls.kanbanUpserts.push(payload);
            calls.kanbanUpsertOptions.push(options);
            return Promise.resolve({ error: state.kanbanUpsertError });
          }
          calls.upserts.push(payload);
          calls.upsertOptions.push(options);
          return Promise.resolve({ error: state.upsertError });
        },
        update(payload: Record<string, unknown>) {
          if (table === 'kanban_board_members') {
            calls.kanbanUpdates.push(payload);
            return chainable(state.kanbanUpdateError);
          }
          calls.updates.push(payload);
          return chainable(state.updateError);
        },
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

const USER_ID = 'user-1';
const BOARD_ID = 'board-1';
const PADLET_ID = 'padlet-1';
const TOKEN = 'share-token-1';

type RouteModule = typeof import('../../../app/api/share-link/redeem/route');
let route: RouteModule;
let sharePassword: typeof import('@/lib/server/share/sharePassword');

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const post = (body: unknown) => route.POST(
  new NextRequest('http://localhost/api/share-link/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
);

function openLink(overrides: Partial<ShareLinkRow> = {}): ShareLinkRow {
  return {
    id: 'link-1',
    board_id: BOARD_ID,
    padlet_id: null,
    permission: 'edit',
    password_hash: null,
    expires_at: null,
    access_count: 0,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
    (calls[key] as unknown[]).length = 0;
  }
  state.link = null;
  state.linkError = null;
  state.permission = null;
  state.rpcError = null;
  state.existingCollaborator = null;
  state.upsertError = null;
  state.updateError = null;
  state.existingKanbanMember = null;
  state.kanbanLookupError = null;
  state.kanbanUpsertError = null;
  state.kanbanUpdateError = null;
  mocks.cookies.mockResolvedValue({});
  session();
  sharePassword = await import('@/lib/server/share/sharePassword');
  route = await import('../../../app/api/share-link/redeem/route');
});

describe('PATCH-357 redeem: the session and the link', () => {
  it('401 without a session, and nothing is read', async () => {
    session(null);
    state.link = openLink();
    expect((await post({ token: TOKEN })).status).toBe(401);
    expect(calls.rpc).toHaveLength(0);
    expect(calls.upserts).toHaveLength(0);
  });

  it('400 without a token', async () => {
    expect((await post({})).status).toBe(400);
  });

  it('404 for an unknown token', async () => {
    state.link = null;
    expect((await post({ token: TOKEN })).status).toBe(404);
  });

  it('410 for an expired link', async () => {
    state.link = openLink({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await post({ token: TOKEN })).status).toBe(410);
    expect(calls.upserts).toHaveLength(0);
  });

  it('400 for a post-only link (no board_id)', async () => {
    state.link = openLink({ board_id: null, padlet_id: PADLET_ID });
    expect((await post({ token: TOKEN })).status).toBe(400);
  });
});

describe('PATCH-357 redeem: the password gate', () => {
  it('403 when the password is required but missing', async () => {
    state.link = openLink({ password_hash: await sharePassword.hashSharePassword('secret-pass') });
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(403);
    expect(calls.rpc).toHaveLength(0);
  });

  it('403 when the password is wrong', async () => {
    state.link = openLink({ password_hash: await sharePassword.hashSharePassword('secret-pass') });
    const response = await post({ token: TOKEN, password: 'not-the-password' });
    expect(response.status).toBe(403);
    expect(calls.upserts).toHaveLength(0);
  });

  it('grants when the password is right', async () => {
    state.link = openLink({
      password_hash: await sharePassword.hashSharePassword('secret-pass'),
      permission: 'edit',
    });
    const response = await post({ token: TOKEN, password: 'secret-pass' });
    expect(response.status).toBe(200);
    expect(calls.upserts).toHaveLength(1);
  });
});

describe('PATCH-357 redeem: granting the role', () => {
  it('upserts the mapped role when the user has no access yet', async () => {
    state.link = openLink({ permission: 'edit', padlet_id: PADLET_ID });
    state.permission = null;
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ boardId: BOARD_ID, padletId: PADLET_ID });

    expect(calls.rpc[0]).toEqual({
      name: 'get_board_permission',
      args: { board_uuid: BOARD_ID, user_uuid: USER_ID },
    });
    expect(calls.upserts).toHaveLength(1);
    expect(calls.upserts[0]).toEqual({ board_id: BOARD_ID, user_id: USER_ID, role: 'editor' });
    expect(calls.upsertOptions[0]).toEqual({ onConflict: 'board_id,user_id' });
    // Access was recorded.
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0]).toMatchObject({ access_count: 1 });
  });

  it('maps view -> viewer and comment -> commenter', async () => {
    state.link = openLink({ permission: 'view' });
    state.permission = null;
    await post({ token: TOKEN });
    expect(calls.upserts[0].role).toBe('viewer');

    calls.upserts.length = 0;
    state.link = openLink({ permission: 'comment' });
    await post({ token: TOKEN });
    expect(calls.upserts[0].role).toBe('commenter');
  });

  it('writes nothing when the user already satisfies the role', async () => {
    state.link = openLink({ permission: 'view' });
    state.permission = 'editor';
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(200);
    expect(calls.upserts).toHaveLength(0);
    // It still records the access.
    expect(calls.updates).toHaveLength(1);
  });

  it('never downgrades an existing higher collaborator role', async () => {
    state.link = openLink({ permission: 'view' });
    // get_board_permission says nothing (e.g. the row's role is unknown to it),
    // but the collaborator row is already an editor.
    state.permission = null;
    state.existingCollaborator = { role: 'editor' };
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(200);
    expect(calls.upserts).toHaveLength(0);
  });

  it('upgrades a lower collaborator role', async () => {
    state.link = openLink({ permission: 'edit' });
    state.permission = null;
    state.existingCollaborator = { role: 'viewer' };
    await post({ token: TOKEN });
    expect(calls.upserts).toHaveLength(1);
    expect(calls.upserts[0].role).toBe('editor');
  });

  it('403 for a link whose permission grants no role', async () => {
    state.link = openLink({ permission: 'banana' });
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(403);
    expect(calls.upserts).toHaveLength(0);
  });

  it('503 when the permission check itself fails (fail closed)', async () => {
    state.link = openLink({ permission: 'edit' });
    state.rpcError = { message: 'boom' };
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(503);
    expect(calls.upserts).toHaveLength(0);
  });
});

describe('PATCH-360 redeem: Kanban membership', () => {
  it('upserts a kanban_board_members row when the user has none', async () => {
    state.link = openLink({ permission: 'edit' });
    state.permission = null;
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(200);
    expect(calls.kanbanUpserts).toHaveLength(1);
    expect(calls.kanbanUpserts[0]).toEqual({
      canvas_id: BOARD_ID,
      user_id: USER_ID,
      role: 'member',
      permission_level: 'edit',
    });
    // PATCH-360 Addendum 1: ON CONFLICT DO NOTHING, so a losing race succeeds.
    expect(calls.kanbanUpsertOptions[0]).toEqual({
      onConflict: 'canvas_id,user_id',
      ignoreDuplicates: true,
    });
  });

  it('PATCH-360 Addendum 1: a losing race (row already exists) still returns 200', async () => {
    state.link = openLink({ permission: 'edit' });
    state.permission = null;
    // The upsert with ignoreDuplicates reports no error when the row is already
    // there -- exactly what the request that loses the race sees.
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(200);
    expect(calls.kanbanUpsertOptions[0]).toMatchObject({ ignoreDuplicates: true });
  });

  it('maps view -> view and comment -> comment', async () => {
    state.link = openLink({ permission: 'view' });
    state.permission = null;
    await post({ token: TOKEN });
    expect(calls.kanbanUpserts[0].permission_level).toBe('view');

    calls.kanbanUpserts.length = 0;
    state.link = openLink({ permission: 'comment' });
    await post({ token: TOKEN });
    expect(calls.kanbanUpserts[0].permission_level).toBe('comment');
  });

  it('never downgrades an existing admin row', async () => {
    state.link = openLink({ permission: 'view' });
    state.permission = 'admin'; // board permission already satisfies; step 6 skipped
    state.existingKanbanMember = { permission_level: 'admin' };
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(200);
    expect(calls.kanbanUpserts).toHaveLength(0);
    expect(calls.kanbanUpdates).toHaveLength(0);
  });

  it('never downgrades an existing edit row', async () => {
    state.link = openLink({ permission: 'view' });
    state.permission = 'admin';
    state.existingKanbanMember = { permission_level: 'edit' };
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(200);
    expect(calls.kanbanUpserts).toHaveLength(0);
    expect(calls.kanbanUpdates).toHaveLength(0);
  });

  it('upgrades an existing view row to edit', async () => {
    state.link = openLink({ permission: 'edit' });
    state.permission = null;
    state.existingKanbanMember = { permission_level: 'view' };
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(200);
    expect(calls.kanbanUpserts).toHaveLength(0);
    expect(calls.kanbanUpdates).toHaveLength(1);
    expect(calls.kanbanUpdates[0]).toEqual({ permission_level: 'edit' });
  });

  it('runs even when the collaborator step was skipped (the early-return path)', async () => {
    state.link = openLink({ permission: 'view' });
    state.permission = 'editor'; // board permission satisfies a view link
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(200);
    // No collaborator write, but the Kanban row is still ensured.
    expect(calls.upserts).toHaveLength(0);
    expect(calls.kanbanUpserts).toHaveLength(1);
    expect(calls.kanbanUpserts[0].permission_level).toBe('view');
  });

  it('500 with a clear error when the Kanban upsert fails, never swallowed', async () => {
    state.link = openLink({ permission: 'edit' });
    state.permission = null;
    state.kanbanUpsertError = { message: 'boom' };
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Could not grant Kanban board access.' });
  });

  it('500 when the Kanban update fails', async () => {
    state.link = openLink({ permission: 'edit' });
    state.permission = null;
    state.existingKanbanMember = { permission_level: 'view' };
    state.kanbanUpdateError = { message: 'boom' };
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(500);
  });

  it('500 when the Kanban lookup fails', async () => {
    state.link = openLink({ permission: 'edit' });
    state.permission = null;
    state.kanbanLookupError = { message: 'boom' };
    const response = await post({ token: TOKEN });
    expect(response.status).toBe(500);
  });
});

describe('PATCH-357 redeem: the response boundary', () => {
  it('returns only boardId and padletId -- never the token or the hash', async () => {
    const hash = await sharePassword.hashSharePassword('secret-pass');
    state.link = openLink({ permission: 'edit', padlet_id: PADLET_ID, password_hash: hash });
    const response = await post({ token: TOKEN, password: 'secret-pass' });
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['boardId', 'padletId']);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(hash);
    expect(serialized).not.toContain('password');
  });
});

// The /auth redirect guard: an open redirect would let a share link (or any
// crafted URL) bounce a signed-in user to another origin. app/** is not in the
// vitest include globs, so this is a source invariant.
describe('PATCH-357 /auth redirect guard', () => {
  const source = readFileSync(resolve(process.cwd(), 'app/auth/page.tsx'), 'utf8');

  it('guards the redirect param before using it', () => {
    expect(source).toContain('sanitizeRedirectPath');
    expect(source).toContain("startsWith('//')");
    expect(source).toContain('const redirectPath = sanitizeRedirectPath');
  });

  it('never uses the raw search param as a redirect target', () => {
    expect(source).not.toContain("searchParams.get('redirect') || '/dashboard'");
  });
});
