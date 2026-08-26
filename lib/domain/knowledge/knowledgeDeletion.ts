import type { BoardId, KnowledgeDocumentId, UserId } from '../core/ids';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';
import type { KnowledgeStorageGateway } from './knowledgeIngestion';
import { knowledgePageDerivativePaths } from './knowledgePdfRenderPolicy';

export interface KnowledgeArtifactPaths {
  readonly storagePath: string;
  readonly rawArtifactPath: string | null;
  /**
   * P6J-F9-A0. Identity and page count are captured so the deterministic page
   * derivatives can be enumerated at cleanup time. No Storage listing is
   * involved: the paths are derivable, so nothing has to be discovered.
   */
  readonly boardId: BoardId;
  readonly documentId: KnowledgeDocumentId;
  readonly pageCount: number | null;
}

export interface KnowledgeStorageCleanupFailure {
  readonly path: string;
  readonly message: string;
}

export interface KnowledgeStorageCleanup {
  readonly status: 'complete' | 'partial';
  readonly attemptedPaths: readonly string[];
  readonly failedPaths: readonly string[];
  readonly failures: readonly KnowledgeStorageCleanupFailure[];
}

export interface KnowledgeDeletionOutcome {
  readonly deleted: true;
  readonly storageCleanup: KnowledgeStorageCleanup;
}

export interface KnowledgeDocumentDeletionRepository {
  findDocumentArtifactPaths(
    id: KnowledgeDocumentId,
  ): Promise<Result<(KnowledgeArtifactPaths & { readonly boardId: BoardId }) | null, DomainError>>;
  deleteDocument(id: KnowledgeDocumentId): Promise<Result<boolean, DomainError>>;
}

export interface KnowledgeBoardDeletionRepository {
  listDocumentArtifactPathsByBoardId(
    boardId: BoardId,
  ): Promise<Result<readonly KnowledgeArtifactPaths[], DomainError>>;
  deleteBoard(boardId: BoardId): Promise<Result<boolean, DomainError>>;
}

export interface KnowledgeBoardDeletionAuthorizer {
  canDeleteBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>>;
}

function failureMessage(error: DomainError | unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'Storage cleanup failed';
}

/**
 * P6J-F9-A1a. Deterministic page derivatives mean one document can contribute
 * a couple of hundred paths, so cleanup removes them in bounded batches
 * instead of one Storage round trip per object.
 */
export const KNOWLEDGE_STORAGE_REMOVAL_BATCH_SIZE = 100;

/**
 * Remove every captured artifact, continuing after an individual failure.
 * This is the one cleanup implementation shared by document and board
 * deletion. Storage is deliberately after the authoritative database delete.
 */
export async function cleanupKnowledgeArtifacts(
  storage: Pick<KnowledgeStorageGateway, 'removeMany'>,
  artifacts: readonly KnowledgeArtifactPaths[],
): Promise<KnowledgeStorageCleanup> {
  const attemptedPaths = [
    ...new Set(
      artifacts.flatMap(({ storagePath, rawArtifactPath, boardId, documentId, pageCount }) =>
        [
          storagePath,
          rawArtifactPath,
          // Additive and deduplicated by the same Set: an absent page count
          // contributes nothing rather than a guessed range.
          ...knowledgePageDerivativePaths(boardId, documentId, pageCount),
        ].filter((path): path is string => Boolean(path)),
      ),
    ),
  ];
  const failures: KnowledgeStorageCleanupFailure[] = [];

  // Batching happens after capture and deduplication, so membership and order
  // are exactly what they were before; only the transport changed.
  for (let start = 0; start < attemptedPaths.length; start += KNOWLEDGE_STORAGE_REMOVAL_BATCH_SIZE) {
    const batch = attemptedPaths.slice(start, start + KNOWLEDGE_STORAGE_REMOVAL_BATCH_SIZE);
    let message: string | undefined;
    try {
      const removed = await storage.removeMany(batch);
      if (!removed.ok) message = failureMessage(removed.error);
    } catch (error: unknown) {
      message = failureMessage(error);
    }
    // A batch-level error is attributed to every path it carried. Storage
    // cannot tell an absent object apart from an undeleted one, so per-path
    // outcomes are not inferable -- and inventing success is the worse error.
    if (message !== undefined) {
      for (const path of batch) failures.push({ path, message });
    }
  }

  return {
    status: failures.length === 0 ? 'complete' : 'partial',
    attemptedPaths,
    failedPaths: failures.map(({ path }) => path),
    failures,
  };
}

export interface DeleteKnowledgeDocumentInput {
  readonly documentId: KnowledgeDocumentId;
  readonly userId: UserId;
}

/** Delete one document after board owner/editor authorization. */
export async function deleteKnowledgeDocument(
  deps: {
    readonly authorizer: {
      canMutateBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>>;
    };
    readonly repository: KnowledgeDocumentDeletionRepository;
    readonly storage: Pick<KnowledgeStorageGateway, 'removeMany'>;
  },
  input: DeleteKnowledgeDocumentInput,
): Promise<Result<KnowledgeDeletionOutcome, DomainError>> {
  const document = await deps.repository.findDocumentArtifactPaths(input.documentId);
  if (!document.ok) return document;
  if (!document.value) {
    return err(domainError('not_found', 'Knowledge document was not found'));
  }

  const authorized = await deps.authorizer.canMutateBoard(document.value.boardId, input.userId);
  if (!authorized.ok) return authorized;
  if (!authorized.value) {
    return err(domainError('permission_denied', 'You do not have permission to delete this document'));
  }

  const deleted = await deps.repository.deleteDocument(input.documentId);
  if (!deleted.ok) return deleted;
  if (!deleted.value) {
    return err(domainError('not_found', 'Knowledge document was not found'));
  }

  return ok({
    deleted: true,
    storageCleanup: await cleanupKnowledgeArtifacts(deps.storage, [document.value]),
  });
}

export interface DeleteKnowledgeBoardInput {
  readonly boardId: BoardId;
  readonly userId: UserId;
}

/**
 * Physical board deletion boundary. It captures all Knowledge paths before
 * deleting the board, lets Postgres perform its normal cascades, and then
 * reuses the exact single-document cleanup helper.
 */
export async function deleteKnowledgeBoard(
  deps: {
    readonly authorizer: KnowledgeBoardDeletionAuthorizer;
    readonly repository: KnowledgeBoardDeletionRepository;
    readonly storage: Pick<KnowledgeStorageGateway, 'removeMany'>;
  },
  input: DeleteKnowledgeBoardInput,
): Promise<Result<KnowledgeDeletionOutcome, DomainError>> {
  const authorized = await deps.authorizer.canDeleteBoard(input.boardId, input.userId);
  if (!authorized.ok) return authorized;
  if (!authorized.value) {
    return err(domainError('permission_denied', 'You do not have permission to delete this board'));
  }

  const artifacts = await deps.repository.listDocumentArtifactPathsByBoardId(input.boardId);
  if (!artifacts.ok) return artifacts;

  const deleted = await deps.repository.deleteBoard(input.boardId);
  if (!deleted.ok) return deleted;
  if (!deleted.value) {
    return err(domainError('not_found', 'Board was not found'));
  }

  return ok({
    deleted: true,
    storageCleanup: await cleanupKnowledgeArtifacts(deps.storage, artifacts.value),
  });
}
