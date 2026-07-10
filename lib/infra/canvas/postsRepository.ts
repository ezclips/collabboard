import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { PostId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { PostMetadataWriteFields, PostsRepository, PostTasksWriteFields } from '../../domain/canvas/posts';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface PostsUpdateQuery {
  eq(column: 'id', value: PostId): Promise<{ error: SupabaseErrorLike | null }>;
}

interface PostsDeleteQuery {
  eq(
    column: 'id' | 'metadata->>parentId',
    value: PostId,
  ): Promise<{ error: SupabaseErrorLike | null }>;
  in(column: 'id', values: readonly PostId[]): Promise<{ error: SupabaseErrorLike | null }>;
}

interface PostsSupabaseClient {
  from(table: 'padlets'): {
    update(
      payload:
        | {
            content: PostTasksWriteFields['content'];
            metadata: PostTasksWriteFields['metadata'];
            updated_at: PostTasksWriteFields['updatedAt'];
          }
        | {
            metadata: PostMetadataWriteFields['metadata'];
            updated_at: PostMetadataWriteFields['updatedAt'];
          },
    ): PostsUpdateQuery;
    delete(): PostsDeleteQuery;
  };
}

export class SupabasePostsRepository implements PostsRepository {
  constructor(private readonly client: PostsSupabaseClient) {}

  async updateTasks(id: PostId, fields: PostTasksWriteFields): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .update({
        content: fields.content,
        metadata: fields.metadata,
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the post tasks', { cause: error }));
    }

    return ok(undefined);
  }

  async updateMetadata(
    id: PostId,
    fields: PostMetadataWriteFields,
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .update({
        metadata: fields.metadata,
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the post', { cause: error }));
    }

    return ok(undefined);
  }

  async deleteById(id: PostId): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('padlets').delete().eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the post', { cause: error }));
    }

    return ok(undefined);
  }

  async deleteByIds(ids: readonly PostId[]): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('padlets').delete().in('id', ids);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the posts', { cause: error }));
    }

    return ok(undefined);
  }

  async deleteByParentId(parentId: PostId): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .delete()
      .eq('metadata->>parentId', parentId);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the child posts', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createPostsRepository(): PostsRepository {
  return new SupabasePostsRepository(
    createBrowserSupabaseClient() as unknown as PostsSupabaseClient,
  );
}
