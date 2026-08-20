import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { BoardId, KnowledgeDocumentId, UserId } from '../../domain/core/ids';
import type {
  KnowledgeArtifactPaths,
  KnowledgeBoardDeletionAuthorizer,
  KnowledgeBoardDeletionRepository,
  KnowledgeDocumentDeletionRepository,
} from '../../domain/knowledge/knowledgeDeletion';
import {
  KNOWLEDGE_STORAGE_BUCKET,
  SupabaseKnowledgeStorageGateway,
} from './knowledgeIngestionAdapters';
import { getSupabaseAdmin } from '../../supabase/admin';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface KnowledgeDocumentArtifactRow {
  readonly board_id: string;
  readonly storage_path: string;
  readonly raw_artifact_path: string | null;
}

interface KnowledgeArtifactRow {
  readonly storage_path: string;
  readonly raw_artifact_path: string | null;
}

interface KnowledgeSingleQuery {
  eq(column: string, value: string): KnowledgeSingleQuery;
  maybeSingle(): Promise<{
    data: KnowledgeDocumentArtifactRow | null;
    error: SupabaseErrorLike | null;
  }>;
}

interface KnowledgeListQuery {
  eq(column: string, value: string): KnowledgeListQuery;
  then<TResult1 = { data: KnowledgeArtifactRow[] | null; error: SupabaseErrorLike | null }>(
    onfulfilled?:
      | ((
          value: { data: KnowledgeArtifactRow[] | null; error: SupabaseErrorLike | null },
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1>;
}

interface KnowledgeDocumentDeleteQuery {
  eq(column: string, value: string): KnowledgeDocumentDeleteQuery;
  select(columns: string): KnowledgeSingleQuery;
}

interface KnowledgeDocumentsTable {
  select(
    columns: 'board_id, storage_path, raw_artifact_path',
  ): KnowledgeSingleQuery;
  select(columns: 'storage_path, raw_artifact_path'): KnowledgeListQuery;
  delete(): KnowledgeDocumentDeleteQuery;
}

interface KnowledgeDeletionSupabaseClient {
  from(table: 'knowledge_documents'): KnowledgeDocumentsTable;
  from(table: 'boards'): {
    select(columns: string): BoardOwnerQuery;
    delete(): BoardDeleteQuery;
  };
}

interface BoardOwnerQuery {
  eq(column: string, value: string): BoardOwnerQuery;
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: SupabaseErrorLike | null }>;
}

interface BoardDeleteQuery {
  eq(column: string, value: string): BoardDeleteQuery;
  select(columns: string): BoardDeleteSingleQuery;
}

interface BoardDeleteSingleQuery {
  maybeSingle(): Promise<{ data: { id: string } | null; error: SupabaseErrorLike | null }>;
}

function unavailable(message: string, cause: unknown): Result<never, DomainError> {
  return err(domainError('unavailable', message, { cause }));
}

/** Server-side repository: it is never constructed from a browser client. */
export class SupabaseKnowledgeDeletionRepository
  implements KnowledgeDocumentDeletionRepository, KnowledgeBoardDeletionRepository
{
  constructor(private readonly client: KnowledgeDeletionSupabaseClient) {}

  async findDocumentArtifactPaths(
    id: KnowledgeDocumentId,
  ): Promise<Result<(KnowledgeArtifactPaths & { readonly boardId: BoardId }) | null, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('knowledge_documents')
        .select('board_id, storage_path, raw_artifact_path')
        .eq('id', id)
        .maybeSingle();
      if (error) return unavailable('Could not load the Knowledge document', error);
      if (!data) return ok(null);
      return ok({
        boardId: data.board_id as BoardId,
        storagePath: data.storage_path,
        rawArtifactPath: data.raw_artifact_path,
      });
    } catch (cause: unknown) {
      return unavailable('Could not load the Knowledge document', cause);
    }
  }

  async deleteDocument(id: KnowledgeDocumentId): Promise<Result<boolean, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('knowledge_documents')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) return unavailable('Could not delete the Knowledge document', error);
      return ok(data !== null);
    } catch (cause: unknown) {
      return unavailable('Could not delete the Knowledge document', cause);
    }
  }

  async listDocumentArtifactPathsByBoardId(
    boardId: BoardId,
  ): Promise<Result<readonly KnowledgeArtifactPaths[], DomainError>> {
    try {
      const { data, error } = await this.client
        .from('knowledge_documents')
        .select('storage_path, raw_artifact_path')
        .eq('board_id', boardId);
      if (error) return unavailable('Could not capture board Knowledge artifacts', error);
      return ok(
        (data ?? []).map((row) => ({
          storagePath: row.storage_path,
          rawArtifactPath: row.raw_artifact_path,
        })),
      );
    } catch (cause: unknown) {
      return unavailable('Could not capture board Knowledge artifacts', cause);
    }
  }

  async deleteBoard(boardId: BoardId): Promise<Result<boolean, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('boards')
        .delete()
        .eq('id', boardId)
        .select('id')
        .maybeSingle();
      if (error) return unavailable('Could not delete the board', error);
      return ok(data !== null);
    } catch (cause: unknown) {
      return unavailable('Could not delete the board', cause);
    }
  }
}

/** Board deletion keeps the existing product rule: only the board owner may hard-delete. */
export class SupabaseBoardDeletionAuthorizer implements KnowledgeBoardDeletionAuthorizer {
  constructor(private readonly client: KnowledgeDeletionSupabaseClient) {}

  async canDeleteBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('boards')
        .select('id')
        .eq('id', boardId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) return unavailable('Could not verify board permissions', error);
      return ok(data !== null);
    } catch (cause: unknown) {
      return unavailable('Could not verify board permissions', cause);
    }
  }
}

export function createServerKnowledgeDeletionRepository(): SupabaseKnowledgeDeletionRepository {
  return new SupabaseKnowledgeDeletionRepository(
    getSupabaseAdmin() as unknown as KnowledgeDeletionSupabaseClient,
  );
}

export function createServerBoardDeletionAuthorizer(): SupabaseBoardDeletionAuthorizer {
  return new SupabaseBoardDeletionAuthorizer(
    getSupabaseAdmin() as unknown as KnowledgeDeletionSupabaseClient,
  );
}

export function createServerKnowledgeStorageGateway() {
  // Reuse the existing gateway so upload and deletion share one private-bucket
  // contract. This factory is only called by server code.
  return new SupabaseKnowledgeStorageGateway(
    getSupabaseAdmin() as never,
    KNOWLEDGE_STORAGE_BUCKET,
  );
}
