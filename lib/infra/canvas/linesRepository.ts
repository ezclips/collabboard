import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { LinesRepository } from '../../domain/canvas/lines';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

/**
 * The insert builder is awaited directly for the plain insert (thenable)
 * and chained .select().single() when the caller consumes the created row -
 * both legacy shapes (the PostsInsertQuery precedent).
 */
interface LinesInsertQuery extends PromiseLike<{ error: SupabaseErrorLike | null }> {
  select(): {
    single(): Promise<{
      data: Record<string, unknown> | null;
      error: SupabaseErrorLike | null;
    }>;
  };
}

interface LinesMutationQuery {
  eq(column: 'id', value: string): Promise<{ error: SupabaseErrorLike | null }>;
}

interface LinesSupabaseClient {
  from(table: 'canvas_lines'): {
    insert(row: object): LinesInsertQuery;
    update(payload: object): LinesMutationQuery;
    delete(): LinesMutationQuery;
  };
}

export class SupabaseLinesRepository implements LinesRepository {
  constructor(private readonly client: LinesSupabaseClient) {}

  async insertLine(row: object): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('canvas_lines').insert(row);

    if (error) {
      return err(domainError('unavailable', 'Could not create the line', { cause: error }));
    }

    return ok(undefined);
  }

  async insertLineReturning(
    row: object,
  ): Promise<Result<Record<string, unknown> | null, DomainError>> {
    const { data, error } = await this.client.from('canvas_lines').insert(row).select().single();

    if (error) {
      return err(domainError('unavailable', 'Could not create the line', { cause: error }));
    }

    return ok(data);
  }

  async updateLineById(id: string, payload: object): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('canvas_lines').update(payload).eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the line', { cause: error }));
    }

    return ok(undefined);
  }

  async deleteLineById(id: string): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('canvas_lines').delete().eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the line', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createLinesRepository(): LinesRepository {
  return new SupabaseLinesRepository(
    createBrowserSupabaseClient() as unknown as LinesSupabaseClient,
  );
}
