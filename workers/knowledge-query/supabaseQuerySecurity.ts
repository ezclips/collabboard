import { createClient } from '@supabase/supabase-js';
import type { KnowledgeBoardReadAuthorizationClient } from '../../lib/server/knowledge/knowledgeBoardReadAuthorization';

interface AuthUser { readonly id: string; }
interface AuthClient {
  auth: { getUser(accessToken: string): Promise<{ data: { user: AuthUser | null }; error: { status?: number } | null }> };
}

export class QueryAuthenticationError extends Error {}
export class QueryAuthenticationUnavailableError extends Error {}

export interface KnowledgeQuerySecurity {
  verifyAccessToken(accessToken: string): Promise<{ userId: string; client: KnowledgeBoardReadAuthorizationClient }>;
}

export type QuerySecurityClientFactory = (
  url: string,
  anonKey: string,
  options?: Record<string, unknown>,
) => AuthClient;

export class SupabaseQuerySecurity implements SupabaseQuerySecurity {
  constructor(
    private readonly url: string,
    private readonly anonKey: string,
    private readonly createClientImpl: QuerySecurityClientFactory = createClient as unknown as QuerySecurityClientFactory,
  ) {}

  async verifyAccessToken(accessToken: string): Promise<{ userId: string; client: KnowledgeBoardReadAuthorizationClient }> {
    const verifier = this.createClientImpl(this.url, this.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    let result: { data: { user: AuthUser | null }; error: { status?: number } | null };
    try { result = await verifier.auth.getUser(accessToken); } catch { throw new QueryAuthenticationUnavailableError(); }
    if (result.error) {
      if ([400, 401, 403].includes(result.error.status ?? 0)) throw new QueryAuthenticationError();
      throw new QueryAuthenticationUnavailableError();
    }
    if (!result.data.user?.id) throw new QueryAuthenticationError();
    const client = this.createClientImpl(this.url, this.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    return { userId: result.data.user.id, client: client as unknown as KnowledgeBoardReadAuthorizationClient };
  }
}

export function createSupabaseQuerySecurityFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
  createClientImpl?: QuerySecurityClientFactory,
): SupabaseQuerySecurity {
  const url = environment.SUPABASE_URL;
  const anonKey = environment.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase query authentication configuration is required');
  return new SupabaseQuerySecurity(url, anonKey, createClientImpl);
}
