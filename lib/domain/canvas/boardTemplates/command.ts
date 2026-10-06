import { z } from 'zod';
import { defineCommand } from '../../core/command';
import { domainError } from '../../core/errors';
import { asPostId } from '../../core/ids';
import { err, ok } from '../../core/result';
import type { PostsRepository } from '../posts';
import type { SectionsRepository } from '../sections';
import { boardTemplateSchema } from './schema';
import { buildTemplateRows } from './rows';

/**
 * PATCH-296. `board.applyTemplate`. Inserts the built rows in order; a
 * failure at any step rolls back the rows and sections already written and
 * returns `template_apply_failed`. Columns and grid reuse the board's
 * existing sections (renamed in position order), add the missing ones, and
 * delete the surplus only AFTER every post insert succeeded.
 */

type TemplateRow = Record<string, unknown> & { id: string };

export const applyBoardTemplateSchema = z.object({
  boardId: z.string(),
  template: boardTemplateSchema,
  existingSections: z
    .array(z.object({ id: z.number(), title: z.string(), position: z.number() }))
    .default([]),
  /**
   * Placeholder posts (e.g. the blank root container a Timeline board
   * auto-creates) removed only after every insert succeeded.
   */
  replacePostIds: z.array(z.string()).default([]),
});

export const createApplyBoardTemplateCommand = (
  postsRepository: PostsRepository,
  sectionsRepository: SectionsRepository,
) =>
  defineCommand({
    name: 'board.applyTemplate',
    input: applyBoardTemplateSchema,
    execute: async (input) => {
      const { template } = input;
      const usesSections = template.layout === 'columns' || template.layout === 'grid';
      const sectionPosts = template.posts.filter((post) => post.kind === 'section');

      const insertedIds: string[] = [];
      const createdSectionIds: number[] = [];
      const renamedSections: Array<{ id: number; oldTitle: string }> = [];
      const sectionIds: Record<string, number> = {};
      let surplusSections: Array<{ id: number; title: string; position: number }> = [];

      const rollback = async (cause: unknown) => {
        if (insertedIds.length > 0) {
          await postsRepository.deleteByIds(insertedIds.map(asPostId));
        }
        for (const sectionId of createdSectionIds) {
          await sectionsRepository.deleteSection(sectionId);
        }
        for (const renamed of [...renamedSections].reverse()) {
          await sectionsRepository.renameSection(renamed.id, {
            title: renamed.oldTitle,
            updatedAt: new Date().toISOString(),
          });
        }
        return err(
          domainError('template_apply_failed', 'Could not apply the board template', {
            cause,
            details: { insertedIds },
          }),
        );
      };

      if (usesSections) {
        const existing = [...input.existingSections].sort((a, b) => a.position - b.position);
        const reuseCount = Math.min(existing.length, sectionPosts.length);

        for (let index = 0; index < reuseCount; index += 1) {
          const section = existing[index];
          const post = sectionPosts[index];
          const result = await sectionsRepository.renameSection(section.id, {
            title: post.title,
            updatedAt: new Date().toISOString(),
          });
          if (!result.ok) return rollback(result.error);
          renamedSections.push({ id: section.id, oldTitle: section.title });
          sectionIds[post.key] = section.id;
        }

        if (sectionPosts.length > reuseCount) {
          const basePosition = existing.length > 0 ? existing[existing.length - 1].position : 0;
          const missing = sectionPosts.slice(reuseCount);
          const result = await sectionsRepository.insertSections(
            missing.map((post, index) => ({
              boardId: input.boardId,
              title: post.title,
              description: '',
              position: basePosition + 1 + index,
            })),
          );
          if (!result.ok) return rollback(result.error);
          const created = result.value ?? [];
          missing.forEach((post, index) => {
            const rawId = created[index]?.id;
            const id = typeof rawId === 'number' ? rawId : Number(rawId);
            createdSectionIds.push(id);
            sectionIds[post.key] = id;
          });
        }

        surplusSections = existing.slice(sectionPosts.length);
      }

      const rows = buildTemplateRows(
        input.boardId,
        template,
        () => crypto.randomUUID(),
        usesSections ? sectionIds : undefined,
      ) as TemplateRow[];

      for (const row of rows) {
        const result = await postsRepository.insert(row);
        if (!result.ok) return rollback(result.error);
        insertedIds.push(row.id);
      }

      if (usesSections) {
        for (const section of surplusSections) {
          const result = await sectionsRepository.deleteSection(section.id);
          if (!result.ok) return rollback(result.error);
        }
      }

      if (input.replacePostIds.length > 0) {
        const result = await postsRepository.deleteByIds(input.replacePostIds.map(asPostId));
        if (!result.ok) return rollback(result.error);
      }

      return ok(rows.length);
    },
  });
