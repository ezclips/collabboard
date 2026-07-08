import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { WorkspacesRepository } from '../../domain/settings/workspace';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface WorkspacesSupabaseClient {
  from(table: 'workspaces'): {
    update(payload: {
      name: string;
      logo_url: string | null;
      updated_at: string;
    }): {
      eq(column: 'id', value: string): Promise<{ error: SupabaseErrorLike | null }>;
    };
  };
}

export class SupabaseWorkspacesRepository implements WorkspacesRepository {
  constructor(private readonly client: WorkspacesSupabaseClient) {}

  async updateNameAndLogo(
    workspaceId: string,
    fields: { readonly name: string; readonly logoUrl: string | null; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('workspaces')
      .update({
        name: fields.name,
        logo_url: fields.logoUrl,
        updated_at: fields.updatedAt,
      })
      .eq('id', workspaceId);

    if (error) {
      return err(domainError('unavailable', 'Could not save workspace', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createWorkspacesRepository(): WorkspacesRepository {
  return new SupabaseWorkspacesRepository(
    createBrowserSupabaseClient() as unknown as WorkspacesSupabaseClient,
  );
}
