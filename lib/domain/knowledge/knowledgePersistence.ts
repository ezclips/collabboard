import type {
  BoardId,
  KnowledgeChunkId,
  KnowledgeDocumentId,
  KnowledgePageId,
  PostId,
  SourceReferenceId,
  UserId,
} from '../core/ids';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';
import type { KnowledgeBoundingBox, KnowledgePdfElementType } from './pdfExtraction';

export type KnowledgeDocumentKind = 'pdf';
export type KnowledgeDocumentProcessingStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface KnowledgeDocument {
  readonly id: KnowledgeDocumentId;
  readonly boardId: BoardId;
  readonly createdBy: UserId | null;
  readonly kind: KnowledgeDocumentKind;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly storagePath: string;
  readonly contentSha256: string;
  readonly pageCount: number | null;
  readonly processingStatus: KnowledgeDocumentProcessingStatus;
  readonly processingError: string | null;
  readonly parserName: string | null;
  readonly parserVersion: string | null;
  readonly parserOptionsHash: string | null;
  readonly rawArtifactPath: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgePage {
  readonly id: KnowledgePageId;
  readonly documentId: KnowledgeDocumentId;
  readonly pageNumber: number;
  readonly widthPoints: number | null;
  readonly heightPoints: number | null;
  readonly rotation: number | null;
  readonly text: string;
  readonly textHash: string | null;
  readonly createdAt: string;
}

export interface KnowledgeChunk {
  readonly id: KnowledgeChunkId;
  readonly documentId: KnowledgeDocumentId;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly text: string;
  readonly charStart: number | null;
  readonly charEnd: number | null;
  readonly textHash: string;
  readonly chunkIndex: number;
  readonly createdAt: string;
}

/**
 * Parser-neutral locator payload. It deliberately describes source evidence,
 * not OpenDataLoader fields or IDs as a relational identity.
 */
export interface KnowledgeSourceLocator {
  readonly coordinateSystem?: string;
  readonly bbox?: KnowledgeBoundingBox;
  readonly bboxes?: readonly KnowledgeBoundingBox[];
  readonly sourceElementId?: string;
  readonly elementType?: KnowledgePdfElementType;
  readonly table?: {
    readonly rowNumber?: number;
    readonly columnNumber?: number;
    readonly rowSpan?: number;
    readonly columnSpan?: number;
  };
}

export interface SourceReference {
  readonly id: SourceReferenceId;
  readonly targetPadletId: PostId;
  readonly sourceDocumentId: KnowledgeDocumentId;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly quoteText: string | null;
  readonly quoteHash: string | null;
  readonly charStart: number | null;
  readonly charEnd: number | null;
  readonly locator: KnowledgeSourceLocator | null;
  readonly createdAt: string;
}

/**
 * Read-side contract only. Worker writes remain server-authorized persistence
 * operations and are intentionally not exposed to browser/UI consumers yet.
 */
export interface KnowledgeRepository {
  findDocumentById(id: KnowledgeDocumentId): Promise<Result<KnowledgeDocument | null, DomainError>>;
  listPagesByDocumentId(id: KnowledgeDocumentId): Promise<Result<readonly KnowledgePage[], DomainError>>;
  listChunksByDocumentId(id: KnowledgeDocumentId): Promise<Result<readonly KnowledgeChunk[], DomainError>>;
  listReferencesByTargetPadletId(id: PostId): Promise<Result<readonly SourceReference[], DomainError>>;
}
