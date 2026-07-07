import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { UserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type {
  WorkspaceMembership,
  WorkspaceMembershipsRepository,
} from '../../domain/workspaces/memberships';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

const workspaceMembershipsSelect = `
                    workspace_id,
                    role,
                    workspaces:workspace_id (
                        id,
                        name,
                        logo_url
                    )
                `;

interface WorkspaceMembershipsSelectByUserIdQuery {
  eq(column: 'member_user_id', value: UserId): {
    eq(
      column: 'status',
      value: 'active',
    ): Promise<{ data: WorkspaceMembership[] | null; error: SupabaseErrorLike | null }>;
  };
}

interface WorkspaceMembershipsSelectByEmailQuery {
  eq(column: 'member_email', value: string): {
    eq(
      column: 'status',
      value: 'active',
    ): Promise<{ data: WorkspaceMembership[] | null; error: SupabaseErrorLike | null }>;
  };
}

interface WorkspaceMembershipsSupabaseClient {
  from(table: 'workspace_members'): {
    select(columns: typeof workspaceMembershipsSelect): WorkspaceMembershipsSelectByUserIdQuery &
      WorkspaceMembershipsSelectByEmailQuery;
  };
}

export class SupabaseWorkspaceMembershipsRepository implements WorkspaceMembershipsRepository {
  constructor(private readonly client: WorkspaceMembershipsSupabaseClient) {}

  async listActiveByUserId(userId: UserId): Promise<Result<WorkspaceMembership[], DomainError>> {
    const { data, error } = await this.client
      .from('workspace_members')
      .select(workspaceMembershipsSelect)
      .eq('member_user_id', userId)
      .eq('status', 'active');

    if (error) {
      return err(domainError('unavailable', 'Could not load workspace memberships', { cause: error }));
    }

    return ok((data ?? []) as WorkspaceMembership[]);
  }

  async listActiveByEmail(emailLowercased: string): Promise<Result<WorkspaceMembership[], DomainError>> {
    const { data, error } = await this.client
      .from('workspace_members')
      .select(workspaceMembershipsSelect)
      .eq('member_email', emailLowercased)
      .eq('status', 'active');

    if (error) {
      return err(
        domainError('unavailable', 'Could not load workspace memberships by email', {
          cause: error,
        }),
      );
    }

    return ok((data ?? []) as WorkspaceMembership[]);
  }
}

export function createWorkspaceMembershipsRepository(): WorkspaceMembershipsRepository {
  return new SupabaseWorkspaceMembershipsRepository(
    createBrowserSupabaseClient() as unknown as WorkspaceMembershipsSupabaseClient,
  );
}
