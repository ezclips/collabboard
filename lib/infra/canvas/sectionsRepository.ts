import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type {
  SectionInsertFields,
  SectionPositionFields,
  SectionsRepository,
} from '../../domain/canvas/sections';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

/**
 * The real builder's select() is thenable AND .single()-chainable: the
 * single-row path (insertSection) chains .single(), the array path
 * (insertSections) awaits select('*') directly - both legacy shapes.
 */
interface SectionsInsertSelectQuery
  extends PromiseLike<{
    data: Array<Record<string, unknown>> | null;
    error: SupabaseErrorLike | null;
  }> {
  single(): Promise<{ data: Record<string, unknown> | null; error: SupabaseErrorLike | null }>;
}

interface SectionsInsertQuery {
  select(columns?: '*'): SectionsInsertSelectQuery;
}

interface SectionsMutationQuery {
  eq(column: 'id', value: number): Promise<{ error: SupabaseErrorLike | null }>;
}

interface SectionsSupabaseClient {
  from(table: 'board_sections'): {
    insert(
      payload:
        | {
            board_id: string;
            title: string;
            description: string;
            position: number;
          }
        | Array<{
            board_id: string;
            title: string;
            description: string;
            position: number;
          }>,
    ): SectionsInsertQuery;
    update(
      payload:
        | { title: string; updated_at: string }
        | { position: number; updated_at: string },
    ): SectionsMutationQuery;
    delete(): SectionsMutationQuery;
  };
}

export class SupabaseSectionsRepository implements SectionsRepository {
  constructor(private readonly client: SectionsSupabaseClient) {}

  async insertSection(
    fields: SectionInsertFields,
  ): Promise<Result<Record<string, unknown> | null, DomainError>> {
    const { data, error } = await this.client
      .from('board_sections')
      .insert({
        board_id: fields.boardId,
        title: fields.title,
        description: fields.description,
        position: fields.position,
      })
      .select()
      .single();

    if (error) {
      return err(domainError('unavailable', 'Could not create the section', { cause: error }));
    }

    return ok(data);
  }

  async insertSections(
    fields: readonly SectionInsertFields[],
  ): Promise<Result<Array<Record<string, unknown>> | null, DomainError>> {
    const { data, error } = await this.client
      .from('board_sections')
      .insert(
        fields.map((section) => ({
          board_id: section.boardId,
          title: section.title,
          description: section.description,
          position: section.position,
        })),
      )
      .select('*');

    if (error) {
      return err(domainError('unavailable', 'Could not create the sections', { cause: error }));
    }

    return ok(data);
  }

  async renameSection(
    id: number,
    fields: { readonly title: string; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('board_sections')
      .update({ title: fields.title, updated_at: fields.updatedAt })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not rename the section', { cause: error }));
    }

    return ok(undefined);
  }

  async updateSectionPosition(
    id: number,
    fields: SectionPositionFields,
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('board_sections')
      .update({ position: fields.position, updated_at: fields.updatedAt })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not move the section', { cause: error }));
    }

    return ok(undefined);
  }

  async deleteSection(id: number): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('board_sections').delete().eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the section', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createSectionsRepository(): SectionsRepository {
  return new SupabaseSectionsRepository(
    createBrowserSupabaseClient() as unknown as SectionsSupabaseClient,
  );
}
