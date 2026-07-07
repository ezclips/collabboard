import { describe, expect, it } from 'vitest';
import {
  createSaveDashboardSettingsCommand,
  type DashboardSettingsData,
  type DashboardSettingsRepository,
} from './dashboard';
import type { UserId } from '../core/ids';
import { asUserId } from '../core/ids';
import type { Result } from '../core/result';
import { ok } from '../core/result';
import type { DomainError } from '../core/errors';

const validSettings: DashboardSettingsData = {
  libraries: [
    {
      id: 'personal-1',
      name: 'Personal Library',
      username: 'user',
      type: 'personal',
      show: true,
    },
    {
      id: 'workspace-1',
      name: 'Workspace Library',
      username: 'owner',
      type: 'workspace',
      avatar_url: 'https://example.com/logo.png',
      show: false,
    },
  ],
  defaultWorkspace: 'personal-1',
};

function createFakeRepository() {
  const calls: Array<{ userId: UserId; settings: DashboardSettingsData }> = [];
  const repository: DashboardSettingsRepository = {
    load: async (): Promise<Result<null, DomainError>> => ok(null),
    save: async (userId, settings): Promise<Result<void, DomainError>> => {
      calls.push({ userId, settings });
      return ok(undefined);
    },
  };
  return { repository, calls };
}

describe('settings.saveDashboard', () => {
  it('rejects missing userId', async () => {
    const { repository } = createFakeRepository();
    const command = createSaveDashboardSettingsCommand(repository);

    const result = await command(validSettings, { userId: null });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('permission_denied');
  });

  it('validates settings shape', async () => {
    const { repository, calls } = createFakeRepository();
    const command = createSaveDashboardSettingsCommand(repository);

    const result = await command(
      {
        ...validSettings,
        libraries: [{ ...validSettings.libraries[0], show: 'yes' }],
      },
      { userId: asUserId('user-1') },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('validation');
    expect(calls).toHaveLength(0);
  });

  it('calls repository with the context user id', async () => {
    const { repository, calls } = createFakeRepository();
    const command = createSaveDashboardSettingsCommand(repository);
    const userId = asUserId('user-1');

    const result = await command(validSettings, { userId });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ userId, settings: validSettings }]);
  });
});
