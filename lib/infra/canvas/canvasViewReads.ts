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
  from(table: 'board_collaborators'): {
    select(columns: 'role'): {
      eq(
        column: 'board_id',
        value: string,
      ): {
        eq(
          column: 'user_id',
          value: string,
        ): {
          maybeSingle(): Promise<{
            data: { role?: unknown } | null;
            error: SupabaseErrorLike | null;
          }>;
        };
      };
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

/**
 * The CURRENT user's `board_collaborators` role on ONE board, or null when
 * they have no row on it.
 *
 * One boolean's worth of authority, read as one row. The roster is
 * deliberately not fetched: `board_collaborators_select` would return the
 * whole thing to a board owner, and nothing in the canvas UI has any use for
 * it. This answers "may I edit this board", nothing more.
 *
 * A failed read resolves to err, and the caller leaves the authority
 * UNRESOLVED rather than treating the failure as an absent role -- a network
 * error must not read as a denial for the owner, nor as a grant for anyone.
 */
export async function findBoardCollaboratorRole(
  boardId: string,
  userId: string,
): Promise<Result<string | null, DomainError>> {
  const { data, error } = await client()
    .from('board_collaborators')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return err(domainError('unavailable', 'Could not load the board collaborator role', { cause: error }));
  }

  return ok(typeof data?.role === 'string' ? data.role : null);
}
