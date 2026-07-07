import { describe, expect, it } from 'vitest';
import {
  createSaveAccessibilityCommand,
  type AccessibilitySettings,
  type AccessibilitySettingsRepository,
} from './accessibility';
import type { UserId } from '../core/ids';
import { asUserId } from '../core/ids';
import type { Result } from '../core/result';
import { ok } from '../core/result';
import type { DomainError } from '../core/errors';

const validSettings: AccessibilitySettings = {
  keyboardShortcuts: true,
  autoDismissMessages: true,
  highContrastMode: 'system',
  reducedMotion: 'system',
};

function createFakeRepository() {
  const calls: Array<{ userId: UserId; settings: AccessibilitySettings }> = [];
  const repository: AccessibilitySettingsRepository = {
    load: async (): Promise<Result<AccessibilitySettings | null, DomainError>> => ok(null),
    save: async (userId, settings): Promise<Result<void, DomainError>> => {
      calls.push({ userId, settings });
      return ok(undefined);
    },
  };
  return { repository, calls };
}

describe('settings.saveAccessibility', () => {
  it('rejects missing userId', async () => {
    const { repository } = createFakeRepository();
    const command = createSaveAccessibilityCommand(repository);

    const result = await command(validSettings, { userId: null });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('permission_denied');
  });

  it('validates settings shape', async () => {
    const { repository, calls } = createFakeRepository();
    const command = createSaveAccessibilityCommand(repository);

    const result = await command(
      { ...validSettings, reducedMotion: 'sometimes' },
      { userId: asUserId('user-1') },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('validation');
    expect(calls).toHaveLength(0);
  });

  it('calls repository with the context user id', async () => {
    const { repository, calls } = createFakeRepository();
    const command = createSaveAccessibilityCommand(repository);
    const userId = asUserId('user-1');

    const result = await command(validSettings, { userId });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ userId, settings: validSettings }]);
  });
});
