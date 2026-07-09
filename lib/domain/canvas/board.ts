import { z } from 'zod';
import { defineCommand } from '../core/command';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';
import { ok } from '../core/result';

/**
 * PATCH-027: the boards-row write group of the canvas seam - same family as
 * posts.ts and sections.ts (one canvas aggregate folder, P6). This is the
 * CANVAS PAGE's board-appearance/settings surface; the unconsumed exemplar
 * interface in lib/domain/boards/repository.ts (lifecycle reads +
 * softDelete, no implementation, no importers) is a different concern and
 * stays untouched.
 */

export interface BoardBackgroundFields {
  readonly backgroundType: string;
  readonly backgroundValue: string;
  readonly updatedAt: string;
}

export interface BoardCoverFields {
  readonly coverPostId: string;
  readonly coverImage: string | null;
  readonly updatedAt: string;
}

export interface CanvasBoardRepository {
  /** Legacy map-style write sends NO updated_at (old L1063) - dedicated method. */
  updateSettings(
    id: string,
    fields: { readonly settings: Record<string, unknown> },
  ): Promise<Result<void, DomainError>>;
  updateSettingsStamped(
    id: string,
    fields: { readonly settings: Record<string, unknown>; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>>;
  updateBackground(id: string, fields: BoardBackgroundFields): Promise<Result<void, DomainError>>;
  updateCover(id: string, fields: BoardCoverFields): Promise<Result<void, DomainError>>;
}

export const setMapStyleSchema = z.object({
  boardId: z.string(),
  styleId: z.string(),
  /** The board's CURRENT settings JSONB, passed through untyped (legacy shape). */
  currentSettings: z.record(z.string(), z.unknown()),
});

export const createSetMapStyleCommand = (repository: CanvasBoardRepository) =>
  defineCommand({
    name: 'canvas.setMapStyle',
    input: setMapStyleSchema,
    execute: async (input) =>
      // Merge preserved from old L1057-1060; deliberately NO updated_at -
      // the legacy write never sent one (old L1063).
      repository.updateSettings(input.boardId, {
        settings: { ...input.currentSettings, mapStyleId: input.styleId },
      }),
  });

export const setBoardBackgroundSchema = z.object({
  boardId: z.string(),
  backgroundType: z.string(),
  backgroundValue: z.string(),
});

export const createSetBoardBackgroundCommand = (repository: CanvasBoardRepository) =>
  defineCommand({
    name: 'canvas.setBoardBackground',
    input: setBoardBackgroundSchema,
    execute: async (input) =>
      repository.updateBackground(input.boardId, {
        backgroundType: input.backgroundType,
        backgroundValue: input.backgroundValue,
        updatedAt: new Date().toISOString(),
      }),
  });

export const setBoardCoverSchema = z.object({
  boardId: z.string(),
  coverPostId: z.string(),
  coverImage: z.string().nullable(),
});

export const createSetBoardCoverCommand = (repository: CanvasBoardRepository) =>
  defineCommand({
    name: 'canvas.setBoardCover',
    input: setBoardCoverSchema,
    execute: async (input) =>
      // The legacy write REPLACES boards.metadata wholesale with exactly
      // these two keys (old L4070-4073) - no spread of existing metadata.
      repository.updateCover(input.boardId, {
        coverPostId: input.coverPostId,
        coverImage: input.coverImage,
        updatedAt: new Date().toISOString(),
      }),
  });

export const setChronoModeSchema = z.object({
  boardId: z.string(),
  mode: z.string(),
  /** The board's CURRENT settings JSONB, passed through untyped (legacy shape). */
  currentSettings: z.record(z.string(), z.unknown()),
});

export const createSetChronoModeCommand = (repository: CanvasBoardRepository) =>
  defineCommand({
    name: 'canvas.setChronoMode',
    input: setChronoModeSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (old L4310-4316; queued P3-family fix, do
      // NOT repair here): the legacy handler awaited the raw builder and
      // never read the resolved `error` field, so database-level failures
      // were silently swallowed - only a THROWN network error reached its
      // catch. Faithful port: perform the write and ignore the resolved
      // Result; a thrown exception still rejects, escapes execute, and
      // surfaces via defineCommand's catch.
      await repository.updateSettingsStamped(input.boardId, {
        settings: { ...input.currentSettings, chronoMode: input.mode },
        updatedAt: new Date().toISOString(),
      });
      return ok(undefined);
    },
  });
