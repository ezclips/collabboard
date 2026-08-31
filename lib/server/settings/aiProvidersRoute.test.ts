import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// app/api/** is outside vitest.config.ts's include globs, so route modules are
// imported and exercised from here -- the same pattern as
// lib/server/ai/textActionRoute.test.ts.
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));

let route: typeof import('../../../app/api/settings/ai-providers/route');

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

function authedRequest(body?: unknown, token: string | null = 'good-token'): Request {
  return new Request('http://localhost/api/settings/ai-providers', {
    method: body === undefined ? 'GET' : 'POST',
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

/**
 * Chainable query double. `.order()` terminates the LIST read and yields rows;
 * `.maybeSingle()` terminates a single-row read.
 */
function selectChain(row: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: row === null ? [] : [row], error }));
  chain.maybeSingle = vi.fn(async () => ({ data: row, error }));
  return chain;
}

let rpc: ReturnType<typeof vi.fn>;
let connectionsSelect: ReturnType<typeof vi.fn>;

function configureAdmin(options?: { rpcData?: unknown; rpcError?: unknown; row?: unknown }) {
  rpc = vi.fn(async () => ({
    data: options?.rpcData ?? CONNECTION_ID,
    error: options?.rpcError ?? null,
  }));
  connectionsSelect = vi.fn(() => selectChain(options?.row ?? SAFE_ROW));
  mocks.getSupabaseAdmin.mockReturnValue({
    rpc,
    from: vi.fn(() => ({ select: connectionsSelect })),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('AI_CREDENTIAL_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));
  configureAuth(USER_ID);
  configureAdmin();
  route = await import('../../../app/api/settings/ai-providers/route');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/settings/ai-providers -- auth', () => {
  it('1. a request with no bearer token is rejected', async () => {
    const res = await route.GET(authedRequest(undefined, null));
    expect(res.status).toBe(401);
  });

  it('2. a token the auth server rejects is 401', async () => {
    configureAuth(null);
    const res = await route.GET(authedRequest());
    expect(res.status).toBe(401);
  });

  it('3. the listed user id comes from the verified token', async () => {
    await route.GET(authedRequest());
    const eqCalls = (connectionsSelect.mock.results[0].value as { eq: ReturnType<typeof vi.fn> }).eq.mock.calls;
    expect(eqCalls).toContainEqual(['user_id', USER_ID]);
  });

  it('4. the projection names only safe columns', async () => {
    await route.GET(authedRequest());
    const columns = connectionsSelect.mock.calls[0][0] as string;
    expect(columns).not.toMatch(/api_key|encrypted|ciphertext/i);
  });
});

describe('POST /api/settings/ai-providers -- auth and validation', () => {
  it('5. unauthenticated create is rejected before any write', async () => {
    const res = await route.POST(
      authedRequest({ providerType: 'openai', displayName: 'x', apiKey: RAW_KEY }, null),
    );
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('6. an unsupported provider is rejected', async () => {
    const res = await route.POST(
      authedRequest({ providerType: 'mistral', displayName: 'x', apiKey: RAW_KEY }),
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('7. deepseek is not an offerable BYOK provider', async () => {
    const res = await route.POST(
      authedRequest({ providerType: 'deepseek', displayName: 'x', apiKey: RAW_KEY }),
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('8. a custom base URL cannot be introduced through the body', async () => {
    await route.POST(
      authedRequest({
        providerType: 'openai',
        displayName: 'x',
        apiKey: RAW_KEY,
        baseUrl: 'http://169.254.169.254/latest/meta-data',
      }),
    );
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(JSON.stringify(args)).not.toContain('169.254.169.254');
    expect(Object.keys(args)).not.toContain('p_base_url');
  });

  it('9. a body-supplied user id is ignored in favour of the session', async () => {
    await route.POST(
      authedRequest({
        providerType: 'openai',
        displayName: 'x',
        apiKey: RAW_KEY,
        userId: '99999999-9999-4999-8999-999999999999',
      }),
    );
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_user_id).toBe(USER_ID);
  });
});

describe('POST /api/settings/ai-providers -- credential handling', () => {
  it('10. the atomic function receives ciphertext, never the raw key', async () => {
    await route.POST(authedRequest({ providerType: 'openai', displayName: 'x', apiKey: RAW_KEY }));
    const args = rpc.mock.calls[0][1] as Record<string, string>;
    expect(args.p_api_key_encrypted).toMatch(/^v1\./);
    expect(args.p_api_key_encrypted).not.toContain(RAW_KEY);
    expect(JSON.stringify(args)).not.toContain(RAW_KEY);
  });

  it('11. the stored hint is the safe suffix only', async () => {
    await route.POST(authedRequest({ providerType: 'openai', displayName: 'x', apiKey: RAW_KEY }));
    const args = rpc.mock.calls[0][1] as Record<string, string>;
    expect(args.p_key_hint).toBe('1234');
    expect(args.p_key_hint.length).toBeLessThanOrEqual(4);
  });

  it('12. creation calls the atomic function, not two separate inserts', async () => {
    await route.POST(authedRequest({ providerType: 'openai', displayName: 'x', apiKey: RAW_KEY }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('create_ai_provider_connection_atomic');
  });

  it('13. no provider network call happens on create', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await route.POST(authedRequest({ providerType: 'openai', displayName: 'x', apiKey: RAW_KEY }));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('14. the response carries safe metadata only', async () => {
    const res = await route.POST(
      authedRequest({ providerType: 'openai', displayName: 'x', apiKey: RAW_KEY }),
    );
    const text = await res.text();
    expect(res.status).toBe(201);
    expect(text).not.toContain(RAW_KEY);
    expect(text).not.toMatch(/api_key|apiKey|encrypted|ciphertext/i);
    expect(JSON.parse(text).provider.keyHint).toBe('1234');
  });

  it('15. a duplicate display name is normalized to 409', async () => {
    configureAdmin({ rpcError: { code: '23505' } });
    const res = await route.POST(
      authedRequest({ providerType: 'openai', displayName: 'x', apiKey: RAW_KEY }),
    );
    expect(res.status).toBe(409);
  });

  it('16. a validation failure never echoes the submitted key', async () => {
    const res = await route.POST(authedRequest({ providerType: 'openai', displayName: '', apiKey: RAW_KEY }));
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain(RAW_KEY);
  });
});
