import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { UserId } from '../core/ids';
import type { Result } from '../core/result';
import { err } from '../core/result';

export interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  push: boolean;
  email: boolean;
  roleRestriction?: string;
}

export interface NotificationCategory {
  title: string;
  settings: NotificationSetting[];
}

export type TabType = 'general' | 'scenes' | 'accounts';

export type NotificationSettingsData = Record<TabType, NotificationCategory[]>;

const settingSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  push: z.boolean(),
  email: z.boolean(),
  roleRestriction: z.string().optional(),
});

const categorySchema = z.object({
  title: z.string(),
  settings: z.array(settingSchema),
});

export const notificationSettingsSchema = z.object({
  general: z.array(categorySchema),
  scenes: z.array(categorySchema),
  accounts: z.array(categorySchema),
});

export interface NotificationSettingsRepository {
  load(userId: UserId): Promise<Result<NotificationSettingsData | null, DomainError>>;
  save(userId: UserId, settings: NotificationSettingsData): Promise<Result<void, DomainError>>;
}

export const createSaveNotificationsCommand = (repository: NotificationSettingsRepository) =>
  defineCommand({
    name: 'settings.saveNotifications',
    input: notificationSettingsSchema,
    execute: async (settings, ctx) => {
      if (!ctx.userId) {
        return err(
          domainError('permission_denied', 'A signed-in user is required to save notification settings'),
        );
      }
      return repository.save(ctx.userId, settings);
    },
  });
