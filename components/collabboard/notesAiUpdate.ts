'use client';

/**
 * PATCH-355. The write half of "Apply translation": optimistic title/content
 * first, then one persisted field update per note. The field-update logic lives
 * HERE (not in CanvasClient), so the wiring there stays a couple of lines. The
 * shape mirrors `notesAiArrange.ts`.
 */

import type { Padlet } from '@/types/collabboard';
import { createUpdatePostFieldsCommand } from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';

export interface NotesAiFieldUpdate {
  readonly id: string;
  readonly title: string;
  readonly content: string;
}

/** A `setPadlets`-shaped updater that applies `fields` to those posts. */
export function notesAiFieldUpdater(
  fields: ReadonlyMap<string, { readonly title: string; readonly content: string }>,
): (prev: readonly Padlet[]) => Padlet[] {
  return (prev) => prev.map((post) => {
    const next = fields.get(post.id);
    return next ? { ...post, title: next.title, content: next.content } : post;
  });
}

/**
 * Apply every update optimistically, then persist each. Returns false when ANY
 * persist failed -- the caller rolls the whole translation back, so a half
 * translation is never left behind.
 */
export async function updateNotesForTranslate(
  updates: readonly NotesAiFieldUpdate[],
  applyFields: (fields: ReadonlyMap<string, { readonly title: string; readonly content: string }>) => void,
): Promise<boolean> {
  if (updates.length === 0) return true;
  applyFields(new Map(updates.map((update) => [update.id, { title: update.title, content: update.content }])));

  const updateFields = createUpdatePostFieldsCommand(createPostsRepository());
  const results = await Promise.all(updates.map(async (update) => {
    try {
      const result = await updateFields(
        { postId: update.id, fields: { title: update.title, content: update.content } },
        { userId: null },
      );
      return result.ok;
    } catch {
      return false;
    }
  }));
  return results.every(Boolean);
}
