import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { QueryAuthenticationError, QueryAuthenticationUnavailableError, SupabaseQuerySecurity, createSupabaseQuerySecurityFromEnvironment } from './supabaseQuerySecurity';

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };

function factory(user: { id: string } | null, error: { status?: number } | null = null) {
  const clients: Array<{ auth: { getUser: ReturnType<typeof vi.fn> } }> = [];
  const create = vi.fn((_url: string, _key: string, _options?: Record<string, unknown>) => {
    const client = { auth: { getUser: vi.fn(async () => ({ data: { user }, error })) } };
    clients.push(client);
    return client;
  });
  return { create, clients };
}

describe('Supabase query security', () => {
  it('requires URL and anon-key configuration and verifies the exact token', async () => {
    expect(() => createSupabaseQuerySecurityFromEnvironment({})).toThrow();
    const injected = factory({ id: 'user-1' });
    const security = createSupabaseQuerySecurityFromEnvironment(env, injected.create);
    const result = await security.verifyAccessToken('token-abc');
    expect(injected.create).toHaveBeenCalledTimes(2);
    expect(injected.clients[0].auth.getUser).toHaveBeenCalledWith('token-abc');
    expect(result.userId).toBe('user-1');
    expect(injected.create).toHaveBeenLastCalledWith(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, expect.objectContaining({ global: { headers: { Authorization: 'Bearer token-abc' } } }));
  });

  it('classifies invalid tokens and auth-service failures without raw errors', async () => {
    const invalid = factory(null, { status: 401 });
    await expect(new SupabaseQuerySecurity(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, invalid.create).verifyAccessToken('bad')).rejects.toBeInstanceOf(QueryAuthenticationError);
    const failed = factory(null, { status: 500 });
    await expect(new SupabaseQuerySecurity(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, failed.create).verifyAccessToken('bad')).rejects.toBeInstanceOf(QueryAuthenticationUnavailableError);
  });

  it('does not require or reference a service-role key for verification', () => {
    const source = fs.readFileSync(new URL('./supabaseQuerySecurity.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('SERVICE_ROLE');
    expect(source).toContain('SUPABASE_ANON_KEY');
  });
});
