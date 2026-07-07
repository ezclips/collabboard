import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { UserId } from '../core/ids';
import type { Result } from '../core/result';
import { err } from '../core/result';

export const accessibilitySettingsSchema = z.object({
  keyboardShortcuts: z.boolean(),
  autoDismissMessages: z.boolean(),
  highContrastMode: z.enum(['system', 'on', 'off']),
  reducedMotion: z.enum(['system', 'on', 'off']),
});

export type AccessibilitySettings = z.infer<typeof accessibilitySettingsSchema>;

export interface AccessibilitySettingsRepository {
  load(userId: UserId): Promise<Result<AccessibilitySettings | null, DomainError>>;
  save(userId: UserId, settings: AccessibilitySettings): Promise<Result<void, DomainError>>;
}

export const createSaveAccessibilityCommand = (repository: AccessibilitySettingsRepository) =>
  defineCommand({
    name: 'settings.saveAccessibility',
    input: accessibilitySettingsSchema,
    execute: async (settings, ctx) => {
      if (!ctx.userId) {
        return err(
          domainError('permission_denied', 'A signed-in user is required to save accessibility settings'),
        );
      }
      return repository.save(ctx.userId, settings);
    },
  });
