import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { UserId } from '../core/ids';
import type { Result } from '../core/result';
import { err } from '../core/result';

/** Mirrors the three columns the settings page selects today. */
export interface WorkspaceSettingsRow {
  readonly id: string;
  readonly workspaceName: string | null;
  readonly workspaceLogo: string | null;
}

export interface WorkspaceSettingsWriteFields {
  readonly workspaceName: string;
  readonly workspaceLogo: string | null;
  readonly updatedAt: string;
}

export interface WorkspaceSettingsRepository {
  /** null = no row for this workspace (maybeSingle semantics, not an error). */
  findByWorkspaceId(workspaceId: string): Promise<Result<WorkspaceSettingsRow | null, DomainError>>;
  updateById(id: string, fields: WorkspaceSettingsWriteFields): Promise<Result<void, DomainError>>;
  insert(
    fields: WorkspaceSettingsWriteFields & { readonly workspaceId: string; readonly userId: UserId },
  ): Promise<Result<void, DomainError>>;
}

export interface WorkspacesRepository {
  updateNameAndLogo(
    workspaceId: string,
    fields: { readonly name: string; readonly logoUrl: string | null; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>>;
}

/** Empty name is deliberately allowed - the legacy page saves '' today. */
export const saveWorkspaceSettingsSchema = z.object({
  workspaceId: z.string(),
  settingsRowId: z.string().nullable(),
  workspaceName: z.string(),
  workspaceLogo: z.string().nullable(),
});

export const createSaveWorkspaceSettingsCommand = (
  settingsRepository: WorkspaceSettingsRepository,
  workspacesRepository: WorkspacesRepository,
) =>
  defineCommand({
    name: 'settings.saveWorkspace',
    input: saveWorkspaceSettingsSchema,
    execute: async (input, ctx) => {
      if (!ctx.userId) {
        return err(
          domainError('permission_denied', 'A signed-in user is required to save workspace settings'),
        );
      }
      // ONE timestamp for both tables - mirrors the legacy page exactly.
      const updatedAt = new Date().toISOString();
      const fields = {
        workspaceName: input.workspaceName,
        workspaceLogo: input.workspaceLogo,
        updatedAt,
      };
      // Write order and partial-failure semantics preserved from the legacy
      // page (PATCH-017): settings row first; if it fails, workspaces is NOT
      // touched. If workspaces then fails, the settings write stays applied.
      const settingsResult = input.settingsRowId
        ? await settingsRepository.updateById(input.settingsRowId, fields)
        : await settingsRepository.insert({
            ...fields,
            workspaceId: input.workspaceId,
            userId: ctx.userId,
          });
      if (!settingsResult.ok) return settingsResult;
      return workspacesRepository.updateNameAndLogo(input.workspaceId, {
        name: input.workspaceName,
        logoUrl: input.workspaceLogo,
        updatedAt,
      });
    },
  });
