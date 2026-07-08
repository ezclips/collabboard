import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { UserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type {
  WorkspaceSettingsRepository,
  WorkspaceSettingsRow,
  WorkspaceSettingsWriteFields,
} from '../../domain/settings/workspace';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface WorkspaceSettingsSupabaseRow {
  readonly id: string;
  readonly workspace_name: string | null;
  readonly workspace_logo: string | null;
}

interface WorkspaceSettingsSelectQuery {
  eq(column: 'workspace_id', value: string): {
    maybeSingle(): Promise<{ data: WorkspaceSettingsSupabaseRow | null; error: SupabaseErrorLike | null }>;
  };
}

interface WorkspaceSettingsUpdateQuery {
  eq(column: 'id', value: string): Promise<{ error: SupabaseErrorLike | null }>;
}

interface WorkspaceSettingsSupabaseClient {
  from(table: 'workspace_settings'): {
    select(columns: 'id, workspace_name, workspace_logo'): WorkspaceSettingsSelectQuery;
    update(payload: {
      workspace_name: WorkspaceSettingsWriteFields['workspaceName'];
      workspace_logo: WorkspaceSettingsWriteFields['workspaceLogo'];
      updated_at: WorkspaceSettingsWriteFields['updatedAt'];
    }): WorkspaceSettingsUpdateQuery;
    insert(payload: {
      workspace_id: string;
      user_id: UserId;
      workspace_name: WorkspaceSettingsWriteFields['workspaceName'];
      workspace_logo: WorkspaceSettingsWriteFields['workspaceLogo'];
      updated_at: WorkspaceSettingsWriteFields['updatedAt'];
    }): Promise<{ error: SupabaseErrorLike | null }>;
  };
}

export class SupabaseWorkspaceSettingsRepository implements WorkspaceSettingsRepository {
  constructor(private readonly client: WorkspaceSettingsSupabaseClient) {}

  async findByWorkspaceId(workspaceId: string): Promise<Result<WorkspaceSettingsRow | null, DomainError>> {
    const { data, error } = await this.client
      .from('workspace_settings')
      .select('id, workspace_name, workspace_logo')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not load workspace settings', { cause: error }));
    }

    if (!data) {
      return ok(null);
    }

    return ok({
      id: data.id,
      workspaceName: data.workspace_name ?? null,
      workspaceLogo: data.workspace_logo ?? null,
    });
  }

  async updateById(id: string, fields: WorkspaceSettingsWriteFields): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('workspace_settings')
      .update({
        workspace_name: fields.workspaceName,
        workspace_logo: fields.workspaceLogo,
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not save workspace settings', { cause: error }));
    }

    return ok(undefined);
  }

  async insert(
    fields: WorkspaceSettingsWriteFields & { readonly workspaceId: string; readonly userId: UserId },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('workspace_settings').insert({
      workspace_id: fields.workspaceId,
      user_id: fields.userId,
      workspace_name: fields.workspaceName,
      workspace_logo: fields.workspaceLogo,
      updated_at: fields.updatedAt,
    });

    if (error) {
      return err(domainError('unavailable', 'Could not save workspace settings', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createWorkspaceSettingsRepository(): WorkspaceSettingsRepository {
  return new SupabaseWorkspaceSettingsRepository(
    createBrowserSupabaseClient() as unknown as WorkspaceSettingsSupabaseClient,
  );
}
