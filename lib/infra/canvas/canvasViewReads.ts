import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

/**
 * PATCH-043: the canvas view's RENDERING READS - the fetchData quartet
 * (board / posts / lines / sections) as a SELECTOR module.
 *
 * RULING (the hooks-phase read idiom): rendering reads that assemble a
 * composite VIEW live in selector modules; only RMW reads that serve a
 * write command join a table's aggregate (the PATCH-036 findMetadataById
 * distinction, applied). The canvas_lines read therefore does NOT become
 * the future lines aggregate's first method - Family 4's aggregate is
 * born write-side.
 *
 * Failure contract (the PATCH-037 no-catch doctrine): resolved supabase
 * errors map to err(unavailable, {cause}); THROWN errors are deliberately
 * NOT caught - they reject into the caller's own catch, preserving the
 * legacy hook's two channels exactly (a thrown failure also aborts the
 * reads that follow it, as the legacy sequential awaits did).
 *
 * Consumers: useCanvasData.fetchData. Future rendering reads may join;
 * write operations may NOT (commands own writes).
 */

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface CanvasViewSupabaseClient {
  from(table: 'boards'): {
    select(columns: '*'): {
      eq(
        column: 'id',
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: SupabaseErrorLike | null;
        }>;
      };
    };
  };
  from(table: 'padlets' | 'canvas_lines' | 'board_sections'): {
    select(columns: '*'): {
      eq(
        column: 'board_id',
        value: string,
      ): PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: SupabaseErrorLike | null;
      }>;
    };
  };
}

function client(): CanvasViewSupabaseClient {
  return createBrowserSupabaseClient() as unknown as CanvasViewSupabaseClient;
}

/** One board row by id, or null when the row is missing (maybeSingle). */
export async function findBoardById(
  id: string,
): Promise<Result<Record<string, unknown> | null, DomainError>> {
  const { data, error } = await client().from('boards').select('*').eq('id', id).maybeSingle();

  if (error) {
    return err(domainError('unavailable', 'Could not load the board', { cause: error }));
  }

  return ok(data);
}

export async function findPostsByBoardId(
  boardId: string,
): Promise<Result<Array<Record<string, unknown>>, DomainError>> {
  const { data, error } = await client().from('padlets').select('*').eq('board_id', boardId);

  if (error) {
    return err(domainError('unavailable', 'Could not load the posts', { cause: error }));
  }

  return ok(data ?? []);
}

export async function findLinesByBoardId(
  boardId: string,
): Promise<Result<Array<Record<string, unknown>>, DomainError>> {
  const { data, error } = await client().from('canvas_lines').select('*').eq('board_id', boardId);

  if (error) {
    return err(domainError('unavailable', 'Could not load the lines', { cause: error }));
  }

  return ok(data ?? []);
}

export async function findSectionsByBoardId(
  boardId: string,
): Promise<Result<Array<Record<string, unknown>>, DomainError>> {
  const { data, error } = await client().from('board_sections').select('*').eq('board_id', boardId);

  if (error) {
    return err(domainError('unavailable', 'Could not load the sections', { cause: error }));
  }

  return ok(data ?? []);
}
