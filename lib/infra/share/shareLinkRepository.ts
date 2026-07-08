import type { Result } from '../../domain/core/result';
import { ok } from '../../domain/core/result';
import type { ShareLink, ShareLinkRepository } from '../../domain/share/shareLinks';
import { createServerSupabaseClient } from '../supabase/serverClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface ShareLinkRow extends ShareLink {}

interface ShareLinkSelectQuery {
  eq(
    column: 'token',
    value: string,
  ): { single(): Promise<{ data: ShareLinkRow | null; error: SupabaseErrorLike | null }> };
}

interface ShareLinkUpdateQuery {
  eq(column: 'id', value: ShareLink['id']): Promise<{ error: SupabaseErrorLike | null }>;
}

interface ShareLinkSupabaseClient {
  from(table: 'share_links'): {
    select(columns: '*'): ShareLinkSelectQuery;
    update(payload: {
      access_count: number;
      last_accessed_at: string;
    }): ShareLinkUpdateQuery;
  };
}

export class SupabaseShareLinkRepository implements ShareLinkRepository {
  constructor(private readonly client: ShareLinkSupabaseClient) {}

  async findByToken(token: string): Promise<Result<ShareLink | null>> {
    const { data, error } = await this.client
      .from('share_links')
      .select('*')
      .eq('token', token)
      .single();

    if (error) {
      // PATCH-015 preserves the page's existing "error || !data" => not found behavior.
      return ok(null);
    }

    return ok(data ?? null);
  }

  async recordAccess(linkId: ShareLink['id'], currentCount: number): Promise<void> {
    await this.client
      .from('share_links')
      .update({
        access_count: currentCount + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', linkId)
      .then(() => {})
      .catch(() => {});
  }
}

export function createShareLinkRepository(): ShareLinkRepository {
  return new SupabaseShareLinkRepository(
    createServerSupabaseClient() as unknown as ShareLinkSupabaseClient,
  );
}
