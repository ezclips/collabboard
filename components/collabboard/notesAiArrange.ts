'use client';

/**
 * PATCH-354. The move half of "Arrange on board": optimistic positions first,
 * then one persisted update per note. The position-update logic lives HERE (not
 * in CanvasClient), so the wiring there stays a couple of lines.
 */

import type { Padlet } from '@/types/collabboard';
import { createUpdatePostPositionCommand } from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';

export interface NotesAiPositionMove {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/** A `setPadlets`-shaped updater that applies `positions` to those posts. */
export function notesAiPositionUpdater(
  positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
): (prev: readonly Padlet[]) => Padlet[] {
  return (prev) => prev.map((post) => {
    const next = positions.get(post.id);
    return next ? { ...post, position_x: next.x, position_y: next.y } : post;
  });
}

/**
 * Apply every move optimistically, then persist each. Returns false when ANY
 * persist failed -- the caller rolls the whole arrangement back, so a half
 * arrangement is never left behind.
 */
export async function moveNotesForArrangement(
  moves: readonly NotesAiPositionMove[],
  applyPositions: (positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>) => void,
): Promise<boolean> {
  if (moves.length === 0) return true;
  applyPositions(new Map(moves.map((move) => [move.id, { x: move.x, y: move.y }])));

  const updatePosition = createUpdatePostPositionCommand(createPostsRepository());
  const results = await Promise.all(moves.map(async (move) => {
    try {
      const result = await updatePosition(
        { postId: move.id, positionX: move.x, positionY: move.y },
        { userId: null },
      );
      return result.ok;
    } catch {
      return false;
    }
  }));
  return results.every(Boolean);
}
