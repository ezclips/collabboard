import { describe, expect, it } from 'vitest';
import {
  createSaveWorkspaceSettingsCommand,
  type WorkspaceSettingsRepository,
  type WorkspacesRepository,
} from './workspace';
import { asUserId } from '../core/ids';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const validInput = {
  workspaceId: 'workspace-1',
  settingsRowId: 'settings-1',
  workspaceName: '',
  workspaceLogo: 'https://example.com/logo.png',
};

function createFakeRepositories() {
  const updateByIdCalls: Array<{
    id: string;
    fields: { workspaceName: string; workspaceLogo: string | null; updatedAt: string };
  }> = [];
  const insertCalls: Array<{
    workspaceId: string;
    userId: ReturnType<typeof asUserId>;
    workspaceName: string;
    workspaceLogo: string | null;
    updatedAt: string;
  }> = [];
  const updateNameAndLogoCalls: Array<{
    workspaceId: string;
    fields: { name: string; logoUrl: string | null; updatedAt: string };
  }> = [];

  let updateByIdResult: Result<void, DomainError> = ok(undefined);
  let insertResult: Result<void, DomainError> = ok(undefined);
  let updateNameAndLogoResult: Result<void, DomainError> = ok(undefined);

  const settingsRepository: WorkspaceSettingsRepository = {
    findByWorkspaceId: async () => ok(null),
    updateById: async (id, fields) => {
      updateByIdCalls.push({ id, fields });
      return updateByIdResult;
    },
    insert: async (fields) => {
      insertCalls.push(fields);
      return insertResult;
    },
  };

  const workspacesRepository: WorkspacesRepository = {
    updateNameAndLogo: async (workspaceId, fields) => {
      updateNameAndLogoCalls.push({ workspaceId, fields });
      return updateNameAndLogoResult;
    },
  };

  return {
    settingsRepository,
    workspacesRepository,
    updateByIdCalls,
    insertCalls,
    updateNameAndLogoCalls,
    setUpdateByIdResult: (result: typeof updateByIdResult) => {
      updateByIdResult = result;
    },
    setInsertResult: (result: typeof insertResult) => {
      insertResult = result;
    },
    setUpdateNameAndLogoResult: (result: typeof updateNameAndLogoResult) => {
      updateNameAndLogoResult = result;
    },
  };
}

describe('settings.saveWorkspace', () => {
  it('rejects missing userId', async () => {
    const fakes = createFakeRepositories();
    const command = createSaveWorkspaceSettingsCommand(
      fakes.settingsRepository,
      fakes.workspacesRepository,
    );

    const result = await command(validInput, { userId: null });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('permission_denied');
    expect(fakes.updateByIdCalls).toHaveLength(0);
    expect(fakes.insertCalls).toHaveLength(0);
    expect(fakes.updateNameAndLogoCalls).toHaveLength(0);
  });

  it('calls updateById when settingsRowId is present', async () => {
    const fakes = createFakeRepositories();
    const command = createSaveWorkspaceSettingsCommand(
      fakes.settingsRepository,
      fakes.workspacesRepository,
    );

    const result = await command(validInput, { userId: asUserId('user-1') });

    expect(result.ok).toBe(true);
    expect(fakes.updateByIdCalls).toHaveLength(1);
    expect(fakes.updateByIdCalls[0]?.id).toBe('settings-1');
    expect(fakes.insertCalls).toHaveLength(0);
  });

  it('calls insert with ctx.userId when settingsRowId is null', async () => {
    const fakes = createFakeRepositories();
    const command = createSaveWorkspaceSettingsCommand(
      fakes.settingsRepository,
      fakes.workspacesRepository,
    );
    const userId = asUserId('user-1');

    const result = await command({ ...validInput, settingsRowId: null }, { userId });

    expect(result.ok).toBe(true);
    expect(fakes.updateByIdCalls).toHaveLength(0);
    expect(fakes.insertCalls).toEqual([
      {
        workspaceId: 'workspace-1',
        userId,
        workspaceName: '',
        workspaceLogo: 'https://example.com/logo.png',
        updatedAt: fakes.insertCalls[0]?.updatedAt,
      },
    ]);
  });

  it('does not call workspacesRepository when settings write fails', async () => {
    const fakes = createFakeRepositories();
    fakes.setUpdateByIdResult(err(domainError('unavailable', 'Could not save workspace settings')));
    const command = createSaveWorkspaceSettingsCommand(
      fakes.settingsRepository,
      fakes.workspacesRepository,
    );

    const result = await command(validInput, { userId: asUserId('user-1') });

    expect(result.ok).toBe(false);
    expect(fakes.updateByIdCalls).toHaveLength(1);
    expect(fakes.updateNameAndLogoCalls).toHaveLength(0);
  });

  it('uses the same updatedAt string for both writes', async () => {
    const fakes = createFakeRepositories();
    const command = createSaveWorkspaceSettingsCommand(
      fakes.settingsRepository,
      fakes.workspacesRepository,
    );

    const result = await command(validInput, { userId: asUserId('user-1') });

    expect(result.ok).toBe(true);
    expect(fakes.updateByIdCalls).toHaveLength(1);
    expect(fakes.updateNameAndLogoCalls).toHaveLength(1);
    expect(fakes.updateByIdCalls[0]?.fields.updatedAt).toBe(
      fakes.updateNameAndLogoCalls[0]?.fields.updatedAt,
    );
  });

  it('returns the workspaces failure after the settings write runs', async () => {
    const fakes = createFakeRepositories();
    fakes.setUpdateNameAndLogoResult(err(domainError('unavailable', 'Could not save workspace')));
    const command = createSaveWorkspaceSettingsCommand(
      fakes.settingsRepository,
      fakes.workspacesRepository,
    );

    const result = await command(validInput, { userId: asUserId('user-1') });

    expect(result.ok).toBe(false);
    expect(fakes.updateByIdCalls).toHaveLength(1);
    expect(fakes.updateNameAndLogoCalls).toHaveLength(1);
  });
});
