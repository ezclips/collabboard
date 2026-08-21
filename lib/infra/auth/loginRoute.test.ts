import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
