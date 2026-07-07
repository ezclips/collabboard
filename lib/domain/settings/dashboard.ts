import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { UserId } from '../core/ids';
import type { Result } from '../core/result';
import { err } from '../core/result';

export interface Library {
  id: string;
  name: string;
  username: string;
  type: 'personal' | 'workspace';
  avatar_url?: string;
  show: boolean;
}

export interface DashboardSettingsData {
  libraries: Library[];
  defaultWorkspace: string;
}

export interface DashboardSettingsRow {
  readonly defaultWorkspace: string | null;
  readonly libraries: unknown | null;
}

const librarySchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  type: z.union([z.literal('personal'), z.literal('workspace')]),
  avatar_url: z.string().optional(),
  show: z.boolean(),
});

export const dashboardSettingsSchema = z.object({
  libraries: z.array(librarySchema),
  defaultWorkspace: z.string(),
});

export interface DashboardSettingsRepository {
  load(userId: UserId): Promise<Result<DashboardSettingsRow | null, DomainError>>;
  save(userId: UserId, settings: DashboardSettingsData): Promise<Result<void, DomainError>>;
}

export const createSaveDashboardSettingsCommand = (repository: DashboardSettingsRepository) =>
  defineCommand({
    name: 'settings.saveDashboard',
    input: dashboardSettingsSchema,
    execute: async (settings, ctx) => {
      if (!ctx.userId) {
        return err(
          domainError('permission_denied', 'A signed-in user is required to save dashboard settings'),
        );
      }
      return repository.save(ctx.userId, settings);
    },
  });
