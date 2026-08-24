import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashRateLimitValue } from '@/lib/auth/rate-limit';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createClient: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));

const EMAIL = 'person@example.com';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ACCESS_TOKEN = 'provider-access-token';
const REFRESH_TOKEN = 'provider-refresh-token';

let loginRoute: typeof import('../../../app/api/auth/login/route');
let failureRows: { created_at: string }[] = [];
let serverOptions: unknown;

function createAdminClient() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: failureRows, error: null })),
    insert: vi.fn(async () => ({ error: null })),
    delete: vi.fn(() => query),
  };

  return { from: vi.fn(() => query) };
}

// AUTH-H1: a stateful admin-client mock that actually filters by the eq()
// columns applied, backed by a plain array. Needed to prove real multi-attempt
// sequences (five chances, IP-vs-email isolation, clear-on-success) instead of
// a static canned response that can't distinguish one filter from another.
type StoredRateLimitRow = {
  action: string;
  email_hash: string;
  ip_hash: string;
  success: boolean;
  user_agent?: string | null;
  created_at: string;
};

function createRateLimitEventStore() {
  return { rows: [] as StoredRateLimitRow[] };
}

function rowMatchesFilters(row: StoredRateLimitRow, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value);
}

function createStatefulAdminClient(store: { rows: StoredRateLimitRow[] }) {
  let seq = 0;

  return {
    from: vi.fn(() => {
      const filters: Record<string, unknown> = {};
      let mode: 'select' | 'delete' | 'insert' | null = null;
      let insertPayload: Record<string, unknown> | null = null;

      const builder: Record<string, unknown> = {
        select: vi.fn(() => { mode = 'select'; return builder; }),
        delete: vi.fn(() => { mode = 'delete'; return builder; }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          mode = 'insert';
          insertPayload = payload;
          return builder;
        }),
        eq: vi.fn((key: string, value: unknown) => { filters[key] = value; return builder; }),
        gte: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(async () => ({
          data: store.rows
            .filter((row) => rowMatchesFilters(row, filters))
            .sort((a, b) => (b as unknown as { _seq: number })._seq - (a as unknown as { _seq: number })._seq)
            .map((row) => ({ created_at: row.created_at })),
          error: null,
        })),
        // `delete()...eq()` and `insert(...)` are awaited directly (no
        // terminal `.limit()`), so the builder itself must be thenable.
        then: (resolve: (value: { error: null }) => void) => {
          if (mode === 'delete') {
            store.rows = store.rows.filter((row) => !rowMatchesFilters(row, filters));
          } else if (mode === 'insert' && insertPayload) {
            store.rows.push({
              ...(insertPayload as unknown as StoredRateLimitRow),
              created_at: new Date().toISOString(),
              _seq: seq++,
            } as StoredRateLimitRow & { _seq: number });
          }
          resolve({ error: null });
        },
      };
      return builder;
    }),
  };
}

function createScriptedProviderClient(outcomes: ReadonlyArray<'fail' | 'success' | 'provider429'>) {
  let index = 0;
  const calls: unknown[] = [];
  return {
    calls,
    client: {
      auth: {
        signInWithPassword: vi.fn(async (credentials: unknown) => {
          calls.push(credentials);
          const outcome = outcomes[index] ?? 'fail';
          index += 1;

          if (outcome === 'success') {
            return {
              data: {
                user: { id: USER_ID, email: EMAIL },
                session: {
                  access_token: ACCESS_TOKEN,
                  refresh_token: REFRESH_TOKEN,
                  user: { id: USER_ID, email: EMAIL, user_metadata: {} },
                },
              },
              error: null,
            };
          }

          if (outcome === 'provider429') {
            return {
              data: { session: null, user: null },
              error: { message: 'Request rate limit reached', status: 429 },
            };
          }

          return {
            data: { session: null, user: null },
            error: { message: 'Invalid login credentials', status: 400 },
          };
        }),
      },
    },
  };
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function configureSuccessfulLogin() {
  const cookieStore = {
    get: vi.fn(() => null),
    set: vi.fn(),
  };
  const profileUpsert = vi.fn(async () => ({ error: null }));
  const serverAuthClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: USER_ID, email: EMAIL } },
        error: null,
      })),
      setSession: vi.fn(async () => {
        const options = serverOptions as {
          cookies: () => {
            set(name: string, value: string, options: unknown): void;
          };
        };
        const resolvedCookieStore = options.cookies();
        resolvedCookieStore.set('sb-access-token', ACCESS_TOKEN, { path: '/' });
        resolvedCookieStore.set('sb-refresh-token', REFRESH_TOKEN, { path: '/' });
        return { error: null };
      }),
    },
    from: vi.fn(() => ({ upsert: profileUpsert })),
  };
  const providerAuthClient = {
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: {
          user: { id: USER_ID, email: EMAIL },
          session: {
            access_token: ACCESS_TOKEN,
            refresh_token: REFRESH_TOKEN,
            user: { id: USER_ID, email: EMAIL, user_metadata: {} },
          },
        },
        error: null,
      })),
    },
  };

  mocks.cookies.mockResolvedValue(cookieStore);
  mocks.createClient.mockReturnValue(providerAuthClient);
  mocks.createRouteHandlerClient.mockImplementation((options: unknown) => {
    serverOptions = options;
    return serverAuthClient;
  });
  mocks.getSupabaseAdmin.mockReturnValue(createAdminClient());

  return { cookieStore, profileUpsert, providerAuthClient, serverAuthClient };
}

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  loginRoute = await import('../../../app/api/auth/login/route');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  failureRows = [];
  serverOptions = undefined;
});

describe('P6C.2 login session cookie wiring', () => {
  it('uses awaited Next cookies and SSR getAll/setAll for provider-issued session tokens', async () => {
    const state = configureSuccessfulLogin();

    const response = await loginRoute.POST(request({
      email: EMAIL,
      password: 'correct-password',
      access_token: 'attacker-token',
      refresh_token: 'attacker-refresh-token',
    }));

    expect(response.status).toBe(200);
    const routeOptions = serverOptions as { cookies: () => unknown };
    expect(routeOptions.cookies()).toBe(state.cookieStore);
    expect(routeOptions.cookies()).not.toBeInstanceOf(Promise);
    expect(state.serverAuthClient.auth.setSession).toHaveBeenCalledWith({
      access_token: ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
    });
    expect(state.cookieStore.set).toHaveBeenCalledWith(
      'sb-access-token',
      ACCESS_TOKEN,
      { path: '/' },
    );
    expect(state.cookieStore.set).toHaveBeenCalledWith(
      'sb-refresh-token',
      REFRESH_TOKEN,
      { path: '/' },
    );
    expect(state.profileUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: USER_ID }));
  });

  it('does not establish a session when credentials fail', async () => {
    const providerAuthClient = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: null, user: null },
          error: { message: 'Invalid login credentials' },
        })),
      },
    };
    mocks.createClient.mockReturnValue(providerAuthClient);
    mocks.getSupabaseAdmin.mockReturnValue(createAdminClient());

    const response = await loginRoute.POST(request({ email: EMAIL, password: 'wrong-password' }));

    expect(response.status).toBe(401);
    expect(mocks.createRouteHandlerClient).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it('preserves the existing application rate-limit response before authentication', async () => {
    failureRows = Array.from({ length: 5 }, () => ({ created_at: new Date().toISOString() }));
    mocks.getSupabaseAdmin.mockReturnValue(createAdminClient());
    mocks.createClient.mockImplementation(() => {
      throw new Error('provider authentication must not run while throttled');
    });

    const response = await loginRoute.POST(request({ email: EMAIL, password: 'blocked-password' }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('structurally enforces the Next 15 SSR cookie construction and removes the legacy helper', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/auth/login/route.ts'),
      'utf8',
    );

    expect(source).toContain("import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';");
    expect(source).not.toContain('@supabase/ssr');
    expect(source).toContain('createRouteHandlerClient');
    expect(source).not.toContain('const cookieStore = cookies()');
    expect(source).toContain('const cookieStore = await cookies()');
    expect(source).toContain('createLoginRouteClient(cookieStore)');
    expect(source).toContain('cookies: () => cookieStore as unknown as ReturnType<typeof cookies>');
    expect(source).toContain('auth.setSession({');
  });
});

describe('AUTH-H1 human-friendly login throttle', () => {
  function configureSuccessSessionWiring() {
    const cookieStore = { get: vi.fn(() => null), set: vi.fn() };
    const profileUpsert = vi.fn(async () => ({ error: null }));
    const serverAuthClient = {
      auth: { setSession: vi.fn(async () => ({ error: null })) },
      from: vi.fn(() => ({ upsert: profileUpsert })),
    };
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createRouteHandlerClient.mockReturnValue(serverAuthClient);
    return { cookieStore, profileUpsert, serverAuthClient };
  }

  it('B-D-E: five ordinary bad submissions all reach the provider; the 6th is a local 429 for ~30s', async () => {
    const store = createRateLimitEventStore();
    mocks.getSupabaseAdmin.mockReturnValue(createStatefulAdminClient(store));
    const provider = createScriptedProviderClient(['fail', 'fail', 'fail', 'fail', 'fail']);
    mocks.createClient.mockReturnValue(provider.client);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await loginRoute.POST(request({ email: EMAIL, password: `wrong-${attempt}` }));
      expect(response.status).toBe(401);
    }
    expect(provider.calls).toHaveLength(5);
    // IP is still hashed and stored on every recorded failure (telemetry) --
    // it just does not decide the throttle above.
    expect(store.rows.every((row) => typeof row.ip_hash === 'string' && row.ip_hash.length > 0)).toBe(true);

    const blocked = await loginRoute.POST(request({ email: EMAIL, password: 'wrong-6' }));
    expect(blocked.status).toBe(429);
    // Provider was NOT called a 6th time.
    expect(provider.calls).toHaveLength(5);

    const retryAfter = Number(blocked.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(29);
    expect(retryAfter).toBeLessThanOrEqual(30);
  });

  it('F: IP failure history alone cannot throttle a fresh email (20 IP failures, 0 email failures)', async () => {
    // A real, matching IP so a reintroduced IP-dominant bug (sec.29a) would
    // actually engage -- not just an unreachable placeholder hash.
    const sharedIp = '203.0.113.10';
    const sharedIpHash = hashRateLimitValue(sharedIp);
    const store = createRateLimitEventStore();
    for (let i = 0; i < 20; i += 1) {
      store.rows.push({
        action: 'login',
        email_hash: 'unrelated-email-hash',
        ip_hash: sharedIpHash,
        success: false,
        created_at: new Date().toISOString(),
      } as StoredRateLimitRow & { _seq: number });
    }
    mocks.getSupabaseAdmin.mockReturnValue(createStatefulAdminClient(store));
    const provider = createScriptedProviderClient(['fail']);
    mocks.createClient.mockReturnValue(provider.client);

    const req = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': sharedIp },
      body: JSON.stringify({ email: EMAIL, password: 'wrong' }),
    });
    const response = await loginRoute.POST(req);

    expect(response.status).toBe(401);
    expect(provider.calls).toHaveLength(1);
  });

  it('G-H: a successful login clears this email\'s failures, so the next fresh typo is not throttled', async () => {
    const store = createRateLimitEventStore();
    mocks.getSupabaseAdmin.mockReturnValue(createStatefulAdminClient(store));
    const provider = createScriptedProviderClient(['fail', 'fail', 'success', 'fail']);
    mocks.createClient.mockReturnValue(provider.client);
    configureSuccessSessionWiring();

    await loginRoute.POST(request({ email: EMAIL, password: 'wrong-1' }));
    await loginRoute.POST(request({ email: EMAIL, password: 'wrong-2' }));
    expect(store.rows.filter((row) => row.success === false)).toHaveLength(2);

    const success = await loginRoute.POST(request({ email: EMAIL, password: 'correct-password' }));
    expect(success.status).toBe(200);
    // G: the failure rows for this email are gone.
    expect(store.rows.some((row) => row.success === false)).toBe(false);

    // H: a fresh typo right after reaches the provider again, immediately (not throttled).
    const freshTypo = await loginRoute.POST(request({ email: EMAIL, password: 'wrong-again' }));
    expect(freshTypo.status).toBe(401);
    expect(provider.calls).toHaveLength(4);
  });

  it('I: a genuine provider rate limit is returned as 429, never downgraded to 401', async () => {
    const store = createRateLimitEventStore();
    mocks.getSupabaseAdmin.mockReturnValue(createStatefulAdminClient(store));
    const providerAuthClient = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: null, user: null },
          error: { message: 'Request rate limit reached', status: 429 },
        })),
      },
    };
    mocks.createClient.mockReturnValue(providerAuthClient);

    const response = await loginRoute.POST(request({ email: EMAIL, password: 'whatever' }));

    expect(response.status).toBe(429);
    // A provider-side rate limit must not itself count as one of the user's
    // five free CollabBoard chances.
    expect(store.rows.some((row) => row.success === false)).toBe(false);
  });

  it('J: the provider Retry-After header is forwarded when Supabase supplies one (structural pin)', () => {
    // getSupabaseAnonServerClient's own createClient() call is mocked in this
    // suite, so its wrapped fetch never actually runs end-to-end -- this pins
    // the exact forwarding code so the behavior cannot silently regress even
    // though it cannot be exercised through this mock.
    const source = readFileSync(resolve(process.cwd(), 'app/api/auth/login/route.ts'), 'utf8');
    expect(source).toContain(
      "retryAfterSeconds = parseRetryAfterHeaderSeconds(response.headers.get('Retry-After'));",
    );
    expect(source).toContain("'Retry-After': String(providerRetryAfterSeconds)");
    expect(source).not.toMatch(/providerRateLimited[\s\S]{0,80}status:\s*401/);
  });

  it('K: wrong email and wrong password return the identical generic message', async () => {
    const store = createRateLimitEventStore();
    mocks.getSupabaseAdmin.mockReturnValue(createStatefulAdminClient(store));
    const providerAuthClient = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: null, user: null },
          error: { message: 'Invalid login credentials' },
        })),
      },
    };
    mocks.createClient.mockReturnValue(providerAuthClient);

    const unknownEmailResponse = await loginRoute.POST(request({ email: 'nobody@example.com', password: 'whatever' }));
    const wrongPasswordResponse = await loginRoute.POST(request({ email: EMAIL, password: 'whatever' }));
    const [unknownBody, wrongBody] = await Promise.all([unknownEmailResponse.json(), wrongPasswordResponse.json()]);

    expect(unknownEmailResponse.status).toBe(401);
    expect(wrongPasswordResponse.status).toBe(401);
    expect(unknownBody.error).toBe(wrongBody.error);
  });

  it('M: attacker-supplied access_token/refresh_token fields never reach setSession', async () => {
    const state = configureSuccessfulLogin();

    await loginRoute.POST(request({
      email: EMAIL,
      password: 'correct-password',
      access_token: 'attacker-token',
      refresh_token: 'attacker-refresh-token',
    }));

    expect(state.serverAuthClient.auth.setSession).toHaveBeenCalledWith({
      access_token: ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
    });
    expect(state.serverAuthClient.auth.setSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'attacker-token' }),
    );
  });

  it('N: no admin or service-role authentication shortcut exists', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/api/auth/login/route.ts'), 'utf8');
    for (const forbidden of ['service_role', 'SERVICE_ROLE', 'body.role', 'body?.role', 'isAdmin', 'bypassAuth']) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/getSupabaseAdmin\(\)\.auth/);
  });

  it('success does not fail the response if throttle-history bookkeeping throws', async () => {
    const state = configureSuccessfulLogin();
    const store = createRateLimitEventStore();
    // fetchRecentEmailFailures (the preflight throttle check) must still
    // succeed; only the post-success bookkeeping (insert/delete, which runs
    // after the session is already established) is made to throw.
    let calls = 0;
    mocks.getSupabaseAdmin.mockImplementation(() => {
      calls += 1;
      if (calls === 1) return createStatefulAdminClient(store);
      throw new Error('transient bookkeeping failure');
    });

    const response = await loginRoute.POST(request({ email: EMAIL, password: 'correct-password' }));

    expect(response.status).toBe(200);
    expect(state.serverAuthClient.auth.setSession).toHaveBeenCalled();
  });
});
