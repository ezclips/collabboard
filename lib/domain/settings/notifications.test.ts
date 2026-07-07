import { describe, expect, it } from 'vitest';
import {
  createSaveNotificationsCommand,
  type NotificationSettingsData,
  type NotificationSettingsRepository,
} from './notifications';
import type { UserId } from '../core/ids';
import { asUserId } from '../core/ids';
import type { Result } from '../core/result';
import { ok } from '../core/result';
import type { DomainError } from '../core/errors';

const validSettings: NotificationSettingsData = {
  general: [
    {
      title: 'Updates',
      settings: [
        {
          id: 'product_updates',
          label: 'Product updates',
          description: 'Updates about what has changed in CollabBoard.',
          push: false,
          email: false,
        },
      ],
    },
  ],
  scenes: [
    {
      title: 'Scene notifications',
      settings: [
        {
          id: 'scene_new_post',
          label: 'New post',
          description: 'Someone adds a new post to a scene you follow.',
          push: true,
          email: false,
        },
      ],
    },
  ],
  accounts: [
    {
      title: 'Account notifications',
      settings: [
        {
          id: 'security_alerts',
          label: 'Security alerts',
          description: 'Important security notifications about your account.',
          push: true,
          email: true,
        },
      ],
    },
  ],
};

function createFakeRepository() {
  const calls: Array<{ userId: UserId; settings: NotificationSettingsData }> = [];
  const repository: NotificationSettingsRepository = {
    load: async (): Promise<Result<NotificationSettingsData | null, DomainError>> => ok(null),
    save: async (userId, settings): Promise<Result<void, DomainError>> => {
      calls.push({ userId, settings });
      return ok(undefined);
    },
  };
  return { repository, calls };
}

describe('settings.saveNotifications', () => {
  it('rejects missing userId', async () => {
    const { repository } = createFakeRepository();
    const command = createSaveNotificationsCommand(repository);

    const result = await command(validSettings, { userId: null });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('permission_denied');
  });

  it('validates settings shape', async () => {
    const { repository, calls } = createFakeRepository();
    const command = createSaveNotificationsCommand(repository);

    const result = await command(
      {
        ...validSettings,
        general: [{ ...validSettings.general[0], settings: [{ ...validSettings.general[0].settings[0], email: 'yes' }] }],
      },
      { userId: asUserId('user-1') },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('validation');
    expect(calls).toHaveLength(0);
  });

  it('calls repository with the context user id', async () => {
    const { repository, calls } = createFakeRepository();
    const command = createSaveNotificationsCommand(repository);
    const userId = asUserId('user-1');

    const result = await command(validSettings, { userId });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ userId, settings: validSettings }]);
  });
});
