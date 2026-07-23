import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import { asPostId } from '../core/ids';
import { err, ok } from '../core/result';
import type { PostsRepository } from './posts';
import { postRowSchema } from './posts';

export const createContainerSchema = z.object({
  row: postRowSchema,
});

export const createCreateContainerCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.createContainer',
    input: createContainerSchema,
    execute: async (input) => repository.insert(input.row),
  });

export const dropDraftIntoContainerSchema = z.object({
  row: postRowSchema,
  containerId: z.string(),
  /**
   * Null means the local padlet list did not contain the target container.
   * Legacy behavior still creates the post and skips childPadletIds repair.
   */
  containerMetadata: z.record(z.string(), z.unknown()).nullable(),
});

export const createDropDraftIntoContainerCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.dropDraftIntoContainer',
    input: dropDraftIntoContainerSchema,
    execute: async (input) => {
      const insertResult = await repository.insertReturning(input.row);
      if (!insertResult.ok) {
        return insertResult;
      }

      const created = insertResult.value;
      if (!created || input.containerMetadata === null) {
        return ok(created);
      }

      const currentChildren = Array.isArray(input.containerMetadata.childPadletIds)
        ? input.containerMetadata.childPadletIds
        : [];

      try {
        const updateResult = await repository.updateFieldsById(asPostId(input.containerId), {
          metadata: {
            ...input.containerMetadata,
            childPadletIds: [...currentChildren, created.id],
          },
        });

        if (!updateResult.ok && updateResult.error.code === 'unknown') {
          return err(domainError('unknown', updateResult.error.message, {
            cause: updateResult.error.cause ?? updateResult.error,
            details: { created },
          }));
        }
      } catch (cause: unknown) {
        return err(domainError('unknown', 'Unhandled exception in canvas.dropDraftIntoContainer', {
          cause,
          details: { created },
        }));
      }

      return ok(created);
    },
  });
