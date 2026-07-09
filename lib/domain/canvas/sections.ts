import { z } from 'zod';
import { defineCommand } from '../core/command';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';
import { ok } from '../core/result';

/**
 * PATCH-026: the board_sections group of the canvas seam - same family as
 * posts.ts (one canvas aggregate folder, P6; the trunk grows per group).
 * `board_sections` is the legacy table name; new code says sections.
 */

export interface SectionInsertFields {
  readonly boardId: string;
  readonly title: string;
  readonly description: string;
  readonly position: number;
}

export interface SectionPositionFields {
  readonly position: number;
  readonly updatedAt: string;
}

export interface SectionsRepository {
  /** insert().select().single() - returns the created row for page state (null mirrors the vendor shape). */
  insertSection(
    fields: SectionInsertFields,
  ): Promise<Result<Record<string, unknown> | null, DomainError>>;
  renameSection(
    id: number,
    fields: { readonly title: string; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>>;
  updateSectionPosition(id: number, fields: SectionPositionFields): Promise<Result<void, DomainError>>;
  deleteSection(id: number): Promise<Result<void, DomainError>>;
}

export const createSectionSchema = z.object({
  boardId: z.string(),
  title: z.string(),
  position: z.number(),
});

export const createCreateSectionCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.createSection',
    input: createSectionSchema,
    execute: async (input) =>
      repository.insertSection({
        boardId: input.boardId,
        title: input.title,
        // The legacy insert always sends an empty description (old L2843).
        description: '',
        position: input.position,
      }),
  });

export const renameSectionSchema = z.object({
  sectionId: z.number(),
  title: z.string(),
});

export const createRenameSectionCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.renameSection',
    input: renameSectionSchema,
    execute: async (input) =>
      repository.renameSection(input.sectionId, {
        title: input.title,
        updatedAt: new Date().toISOString(),
      }),
  });

export const deleteSectionSchema = z.object({
  sectionId: z.number(),
});

export const createDeleteSectionCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.deleteSection',
    input: deleteSectionSchema,
    execute: async (input) => repository.deleteSection(input.sectionId),
  });

export const swapSectionPositionsSchema = z.object({
  first: z.object({ sectionId: z.number(), position: z.number() }),
  second: z.object({ sectionId: z.number(), position: z.number() }),
});

export const createSwapSectionPositionsCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.swapSectionPositions',
    input: swapSectionPositionsSchema,
    execute: async (input) => {
      // Sequential, stop on first error - preserves the legacy
      // partial-failure semantics (old L2975-2989): if the second update
      // fails, the first stays applied. Timestamps are generated per update,
      // exactly as the legacy handler did.
      const first = await repository.updateSectionPosition(input.first.sectionId, {
        position: input.first.position,
        updatedAt: new Date().toISOString(),
      });
      if (!first.ok) return first;
      return repository.updateSectionPosition(input.second.sectionId, {
        position: input.second.position,
        updatedAt: new Date().toISOString(),
      });
    },
  });

export const reorderSectionsSchema = z.object({
  sectionIds: z.array(z.number()),
});

export const createReorderSectionsCommand = (repository: SectionsRepository) =>
  defineCommand({
    name: 'canvas.reorderSections',
    input: reorderSectionsSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (old L3020-3028; queued P3-family fix, do
      // NOT repair here): the legacy page awaited Promise.all over raw
      // builders and never read the resolved per-row `error` fields, so
      // database-level failures were silently swallowed - only a THROWN
      // network error reached its catch. Faithful port: run all updates in
      // parallel and ignore the resolved Results; a thrown exception still
      // rejects, escapes execute, and surfaces via defineCommand's catch.
      await Promise.all(
        input.sectionIds.map((sectionId, index) =>
          repository.updateSectionPosition(sectionId, {
            position: index,
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
      return ok(undefined);
    },
  });
