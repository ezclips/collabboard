import { z } from 'zod';
import { defineCommand } from '../core/command';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';

/**
 * PATCH-045: the canvas_lines WRITE aggregate - born write-side per the
 * PATCH-043 read idiom (the rendering read lives in canvasViewReads.ts and
 * stays there; only writes and their read-backs live here).
 *
 * Row and update payloads pass through VERBATIM as `object` (the
 * postRowSchema precedent): the legacy call sites built these rows against
 * the untyped client and the table is the shape's only validator, exactly
 * as before the extraction.
 *
 * Failure channels: every command is HONEST (the repository Result passes
 * through unchanged; no BestEffort sibling). Call sites that need the
 * legacy resolved-vs-thrown split discriminate on error.code - the
 * repository maps RESOLVED supabase errors to 'unavailable', while
 * defineCommand maps THROWN exceptions to 'unknown' (pinned in the tests).
 */

export const lineRowSchema = z.custom<object>(
  (value) => typeof value === 'object' && value !== null,
);

export const lineUpdatesSchema = z.custom<object>(
  (value) => typeof value === 'object' && value !== null,
);

export interface LinesRepository {
  /** Plain insert - awaited directly, no returning (the duplicate path). */
  insertLine(row: object): Promise<Result<void, DomainError>>;
  /** insert().select().single() - returns the created row (null mirrors the vendor shape). */
  insertLineReturning(
    row: object,
  ): Promise<Result<Record<string, unknown> | null, DomainError>>;
  updateLineById(id: string, payload: object): Promise<Result<void, DomainError>>;
  deleteLineById(id: string): Promise<Result<void, DomainError>>;
}

export const createLineSchema = z.object({
  row: lineRowSchema,
});

export const createCreateLineCommand = (repository: LinesRepository) =>
  defineCommand({
    name: 'canvas.createLine',
    input: createLineSchema,
    execute: async (input) => repository.insertLine(input.row),
  });

export const createLineAndSelectSchema = z.object({
  row: lineRowSchema,
});

export const createCreateLineAndSelectCommand = (repository: LinesRepository) =>
  defineCommand({
    name: 'canvas.createLineAndSelect',
    input: createLineAndSelectSchema,
    execute: async (input) => repository.insertLineReturning(input.row),
  });

export const updateLineSchema = z.object({
  lineId: z.string(),
  updates: lineUpdatesSchema,
});

/** The updated_at stamp is command-internal (the standing PATCH-032+ fact). */
export const createUpdateLineCommand = (repository: LinesRepository) =>
  defineCommand({
    name: 'canvas.updateLine',
    input: updateLineSchema,
    execute: async (input) =>
      repository.updateLineById(input.lineId, {
        ...input.updates,
        updated_at: new Date().toISOString(),
      }),
  });

export const deleteLineSchema = z.object({
  lineId: z.string(),
});

export const createDeleteLineCommand = (repository: LinesRepository) =>
  defineCommand({
    name: 'canvas.deleteLine',
    input: deleteLineSchema,
    execute: async (input) => repository.deleteLineById(input.lineId),
  });
