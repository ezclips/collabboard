import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type {
  BoardBackgroundFields,
  BoardCoverFields,
  CanvasBoardRepository,
} from '../../domain/canvas/board';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface BoardsMutationQuery {
  eq(column: 'id', value: string): Promise<{ error: SupabaseErrorLike | null }>;
}

interface BoardsSupabaseClient {
  from(table: 'boards'): {
    update(
      payload:
        | { settings: Record<string, unknown> }
        | { settings: Record<string, unknown>; updated_at: string }
        | { background_type: string; background_value: string; updated_at: string }
        | {
            metadata: { cover_post_id: string; cover_image: string | null };
            updated_at: string;
          },
    ): BoardsMutationQuery;
  };
}

export class SupabaseCanvasBoardRepository implements CanvasBoardRepository {
  constructor(private readonly client: BoardsSupabaseClient) {}

  async updateSettings(
    id: string,
    fields: { readonly settings: Record<string, unknown> },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('boards')
      .update({ settings: fields.settings })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not save the board settings', { cause: error }));
    }

    return ok(undefined);
  }

  async updateSettingsStamped(
    id: string,
    fields: { readonly settings: Record<string, unknown>; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('boards')
      .update({ settings: fields.settings, updated_at: fields.updatedAt })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not save the board settings', { cause: error }));
    }

    return ok(undefined);
  }

  async updateBackground(
    id: string,
    fields: BoardBackgroundFields,
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('boards')
      .update({
        background_type: fields.backgroundType,
        background_value: fields.backgroundValue,
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not save the board background', { cause: error }));
    }

    return ok(undefined);
  }

  async updateCover(id: string, fields: BoardCoverFields): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('boards')
      .update({
        metadata: {
          cover_post_id: fields.coverPostId,
          cover_image: fields.coverImage,
        },
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not save the board cover', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createCanvasBoardRepository(): CanvasBoardRepository {
  return new SupabaseCanvasBoardRepository(
    createBrowserSupabaseClient() as unknown as BoardsSupabaseClient,
  );
}
