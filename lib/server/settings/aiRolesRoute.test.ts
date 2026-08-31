import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));

let route: typeof import('../../../app/api/settings/ai-roles/route');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const FOREIGN_ID = '33333333-3333-4333-8333-333333333333';

function request(method: string, body?: unknown, token: string | null = 'good-token'): Request {
  return new Request('http://localhost/api/settings/ai-roles', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function configureAuth(userId: string | null) {
  mocks.createClient.mockReturnValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : { message: 'bad token' },
      })),
    },
  });
}

let upsert: ReturnType<typeof vi.fn>;
let preferenceSelectEq: ReturnType<typeof vi.fn>;

/** `rows` are stored preferences; `ownedIds` are the caller's connections. */
function configureAdmin(rows: readonly unknown[] = [], ownedIds: readonly string[] = [CONNECTION_ID]) {
  upsert = vi.fn(async () => ({ error: null }));

  mocks.getSupabaseAdmin.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'ai_role_preferences') {
        const chain: Record<string, unknown> = {};
        preferenceSelectEq = vi.fn(() => chain);
        chain.eq = preferenceSelectEq;
        chain.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: null }));
        chain.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve);
        return { select: vi.fn(() => chain), upsert };
      }
      // ai_provider_connections -- ownership probe.
      const chain: Record<string, unknown> = {};
      let requestedId: string | null = null;
      chain.eq = vi.fn((column: string, value: unknown) => {
        if (column === 'id') requestedId = value as string;
        return chain;
      });
      chain.maybeSingle = vi.fn(async () => ({
        data: requestedId && ownedIds.includes(requestedId) ? { id: requestedId } : null,
        error: null,
      }));
      return { select: vi.fn(() => chain) };
    }),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  configureAuth(USER_ID);
  configureAdmin();
  route = await import('../../../app/api/settings/ai-roles/route');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/settings/ai-roles', () => {
  it('1. unauthenticated read is rejected', async () => {
    const res = await route.GET(request('GET', undefined, null));
    expect(res.status).toBe(401);
  });

  it('2. both roles are always present, even with no stored rows', async () => {
    const res = await route.GET(request('GET'));
    const body = await res.json();
    expect(Object.keys(body.roles).sort()).toEqual(['edit', 'source-ai']);
  });

  it('3. an absent row reads as CollabBoard Default', async () => {
    const body = await (await route.GET(request('GET'))).json();
    expect(body.roles['source-ai']).toEqual({ connectionId: null, modelId: null });
    expect(body.roles.edit).toEqual({ connectionId: null, modelId: null });
  });

  it('4. a row with a null connection also reads as CollabBoard Default', async () => {
    configureAdmin([{ role: 'edit', connection_id: null, model_id: null }]);
    const body = await (await route.GET(request('GET'))).json();
    expect(body.roles.edit).toEqual({ connectionId: null, modelId: null });
  });

  it('5. a stored assignment is returned with its model override', async () => {
    configureAdmin([{ role: 'source-ai', connection_id: CONNECTION_ID, model_id: 'gpt-4.1' }]);
    const body = await (await route.GET(request('GET'))).json();
    expect(body.roles['source-ai']).toEqual({ connectionId: CONNECTION_ID, modelId: 'gpt-4.1' });
  });

  it('6. the read is scoped to the authenticated user', async () => {
    await route.GET(request('GET'));
    expect(preferenceSelectEq.mock.calls).toContainEqual(['user_id', USER_ID]);
  });
});

describe('PUT /api/settings/ai-roles', () => {
  it('7. unauthenticated write is rejected before any upsert', async () => {
    const res = await route.PUT(request('PUT', { role: 'edit', connectionId: null }, null));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('8. an unknown role is rejected', async () => {
    const res = await route.PUT(request('PUT', { role: 'chat', connectionId: null }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('9. an owned connection can be assigned', async () => {
    const res = await route.PUT(request('PUT', { role: 'source-ai', connectionId: CONNECTION_ID }));
    expect(res.status).toBe(200);
    const row = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.user_id).toBe(USER_ID);
    expect(row.connection_id).toBe(CONNECTION_ID);
  });

  it('10. a connection belonging to someone else is refused before the write', async () => {
    const res = await route.PUT(request('PUT', { role: 'source-ai', connectionId: FOREIGN_ID }));
    expect(res.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('11. a null connection selects CollabBoard Default', async () => {
    const res = await route.PUT(request('PUT', { role: 'edit', connectionId: null }));
    expect(res.status).toBe(200);
    expect((upsert.mock.calls[0][0] as Record<string, unknown>).connection_id).toBeNull();
  });

  it('12. the model override is stored opaquely', async () => {
    await route.PUT(
      request('PUT', { role: 'edit', connectionId: CONNECTION_ID, modelId: 'some-vendor/model:v9' }),
    );
    expect((upsert.mock.calls[0][0] as Record<string, unknown>).model_id).toBe('some-vendor/model:v9');
  });

  it('13. a body-supplied user id cannot redirect the write', async () => {
    await route.PUT(
      request('PUT', { role: 'edit', connectionId: null, userId: '99999999-9999-4999-8999-999999999999' }),
    );
    expect((upsert.mock.calls[0][0] as Record<string, unknown>).user_id).toBe(USER_ID);
  });

  it('14. no provider or model is inferable outside the stored contract', async () => {
    await route.PUT(
      request('PUT', { role: 'edit', connectionId: null, provider: 'openai', baseUrl: 'http://evil.test' }),
    );
    const row = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual([
      'connection_id',
      'created_at',
      'model_id',
      'role',
      'updated_at',
      'user_id',
    ]);
  });
});
