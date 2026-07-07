import type { DomainError } from '../core/errors';
import type { UserId } from '../core/ids';
import type { Result } from '../core/result';

export interface WorkspaceMembership {
  workspace_id: string;
  role: string;
  workspaces: {
    id: string;
    name: string;
    logo_url: string | null;
  } | null;
}

export interface WorkspaceMembershipsRepository {
  listActiveByUserId(userId: UserId): Promise<Result<WorkspaceMembership[], DomainError>>;
  listActiveByEmail(emailLowercased: string): Promise<Result<WorkspaceMembership[], DomainError>>;
}
