import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));

let idRoute: typeof import('../../../app/api/settings/ai-providers/[id]/route');
let keyRoute: typeof import('../../../app/api/settings/ai-providers/[id]/key/route');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const RAW_KEY = 'FAKE-KEY-DO-NOT-LEAK-1234';

const SAFE_ROW = {
  id: CONNECTION_ID,
  provider_type: 'openai',
  display_name: 'My OpenAI',
  key_hint: '1234',
  default_model: 'gpt-4o-mini',
  verified_at: null,
  created_at: '2026-08-31T00:00:00.000Z',
  updated_at: '2026-08-31T00:00:00.000Z',
};

function params(id: string = CONNECTION_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(method: string, body?: unknown, token: string | null = 'good-token'): Request {
  return new Request(`http://localhost/api/settings/ai-providers/${CONNECTION_ID}`, {
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

let update: ReturnType<typeof vi.fn>;
let updateEq: ReturnType<typeof vi.fn>;
let updateSelect: ReturnType<typeof vi.fn>;
let del: ReturnType<typeof vi.fn>;
let deleteEq: ReturnType<typeof vi.fn>;
let rpc: ReturnType<typeof vi.fn>;

function configureAdmin(options?: { updatedRow?: unknown; rpcData?: unknown; updateError?: unknown }) {
  const updateChain: Record<string, unknown> = {};
  updateEq = vi.fn(() => updateChain);
  updateSelect = vi.fn(() => ({
    maybeSingle: vi.fn(async () => ({
      data: options?.updatedRow === undefined ? SAFE_ROW : options.updatedRow,
      error: options?.updateError ?? null,
    })),
  }));
  updateChain.eq = updateEq;
  updateChain.select = updateSelect;
  update = vi.fn(() => updateChain);

  const deleteChain: Record<string, unknown> = {};
  deleteEq = vi.fn(() => deleteChain);
  deleteChain.eq = deleteEq;
  deleteChain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
  del = vi.fn(() => deleteChain);

  const selectChain: Record<string, unknown> = {};
  selectChain.eq = vi.fn(() => selectChain);
  selectChain.maybeSingle = vi.fn(async () => ({ data: SAFE_ROW, error: null }));

  rpc = vi.fn(async () => ({ data: options?.rpcData ?? true, error: null }));

  mocks.getSupabaseAdmin.mockReturnValue({
    rpc,
    from: vi.fn(() => ({
      update,
      delete: del,
      select: vi.fn(() => selectChain),
    })),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('AI_CREDENTIAL_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));
  configureAuth(USER_ID);
  configureAdmin();
  idRoute = await import('../../../app/api/settings/ai-providers/[id]/route');
  keyRoute = await import('../../../app/api/settings/ai-providers/[id]/key/route');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PATCH /api/settings/ai-providers/[id]', () => {
  it('1. unauthenticated update is rejected before any write', async () => {
    const res = await idRoute.PATCH(request('PATCH', { displayName: 'New' }, null), params());
    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it('2. the update is scoped to the authenticated owner', async () => {
    await idRoute.PATCH(request('PATCH', { displayName: 'New' }), params());
    expect(updateEq.mock.calls).toContainEqual(['user_id', USER_ID]);
    expect(updateEq.mock.calls).toContainEqual(['id', CONNECTION_ID]);
  });

  it('3. only displayName and defaultModel reach the database', async () => {
    await idRoute.PATCH(
      request('PATCH', {
        displayName: 'New',
        providerType: 'anthropic',
        keyHint: 'evil',
        verifiedAt: '2020-01-01T00:00:00.000Z',
        userId: 'someone-else',
        apiKey: RAW_KEY,
      }),
      params(),
    );
    const values = update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(values).sort()).toEqual(['display_name', 'updated_at']);
    expect(JSON.stringify(values)).not.toContain(RAW_KEY);
  });

  it('4. providerType is immutable', async () => {
    const res = await idRoute.PATCH(request('PATCH', { providerType: 'gemini' }), params());
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('5. a client cannot set verifiedAt', async () => {
    await idRoute.PATCH(request('PATCH', { displayName: 'New', verifiedAt: '2020-01-01T00:00:00.000Z' }), params());
    const values = update.mock.calls[0][0] as Record<string, unknown>;
    expect(values.verified_at).toBeUndefined();
  });

  it('6. changing the default model clears verification', async () => {
    await idRoute.PATCH(request('PATCH', { defaultModel: 'gpt-4.1' }), params());
    const values = update.mock.calls[0][0] as Record<string, unknown>;
    expect(values.default_model).toBe('gpt-4.1');
    expect(values.verified_at).toBeNull();
  });

  it('7. renaming alone does not clear verification', async () => {
    await idRoute.PATCH(request('PATCH', { displayName: 'Renamed' }), params());
    const values = update.mock.calls[0][0] as Record<string, unknown>;
    expect('verified_at' in values).toBe(false);
  });

  it('8. a foreign or missing connection is an indistinguishable 404', async () => {
    configureAdmin({ updatedRow: null });
    const res = await idRoute.PATCH(request('PATCH', { displayName: 'New' }), params());
    expect(res.status).toBe(404);
    expect(await res.text()).not.toMatch(/another user|owner|belongs/i);
  });

  it('9. the response carries safe metadata only', async () => {
    const res = await idRoute.PATCH(request('PATCH', { displayName: 'New' }), params());
    expect(await res.text()).not.toMatch(/api_key|apiKey|encrypted|ciphertext/i);
  });
});

describe('DELETE /api/settings/ai-providers/[id]', () => {
  it('10. unauthenticated delete is rejected', async () => {
    const res = await idRoute.DELETE(request('DELETE', undefined, null), params());
    expect(res.status).toBe(401);
    expect(del).not.toHaveBeenCalled();
  });

  it('11. delete is scoped to the authenticated owner', async () => {
    const res = await idRoute.DELETE(request('DELETE'), params());
    expect(res.status).toBe(200);
    expect(deleteEq.mock.calls).toContainEqual(['user_id', USER_ID]);
    expect(deleteEq.mock.calls).toContainEqual(['id', CONNECTION_ID]);
  });

  it('12. cleanup of the credential and role rows is left to the database', async () => {
    await idRoute.DELETE(request('DELETE'), params());
    // Exactly one delete, against the connections table -- no manual cascade.
    expect(del).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('PUT /api/settings/ai-providers/[id]/key', () => {
  it('13. unauthenticated replacement is rejected before encryption', async () => {
    const res = await keyRoute.PUT(request('PUT', { apiKey: RAW_KEY }, null), params());
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('14. the atomic replace receives ciphertext and the owner id', async () => {
    await keyRoute.PUT(request('PUT', { apiKey: RAW_KEY }), params());
    expect(rpc.mock.calls[0][0]).toBe('replace_ai_provider_credential_atomic');
    const args = rpc.mock.calls[0][1] as Record<string, string>;
    expect(args.p_user_id).toBe(USER_ID);
    expect(args.p_api_key_encrypted).toMatch(/^v1\./);
    expect(JSON.stringify(args)).not.toContain(RAW_KEY);
  });

  it('15. the masked hint is replaced alongside the secret', async () => {
    await keyRoute.PUT(request('PUT', { apiKey: 'ANOTHER-FAKE-KEY-ABCD' }), params());
    const args = rpc.mock.calls[0][1] as Record<string, string>;
    expect(args.p_key_hint).toBe('ABCD');
  });

  it('16. a non-owned connection is an indistinguishable 404', async () => {
    configureAdmin({ rpcData: false });
    const res = await keyRoute.PUT(request('PUT', { apiKey: RAW_KEY }), params());
    expect(res.status).toBe(404);
    expect(await res.text()).not.toMatch(/another user|owner|belongs/i);
  });

  it('17. the raw key is never returned', async () => {
    const res = await keyRoute.PUT(request('PUT', { apiKey: RAW_KEY }), params());
    const text = await res.text();
    expect(text).not.toContain(RAW_KEY);
    expect(text).not.toMatch(/api_key|apiKey|encrypted|ciphertext/i);
  });

  it('18. a too-short key is rejected without echoing it', async () => {
    const res = await keyRoute.PUT(request('PUT', { apiKey: 'abc' }), params());
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('abc');
    expect(rpc).not.toHaveBeenCalled();
  });
});
