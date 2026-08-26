import type { BoardId, KnowledgeDocumentId, UserId } from '../core/ids';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';
import type { KnowledgeDocument } from './knowledgePersistence';

/**
 * P4 -- PDF ingestion lifecycle.
 *
 *   PDF selected -> validate -> upload original to Storage
 *   -> create knowledge_documents row -> processing_status = 'uploaded'
 *
 * and it stops there. No extraction, no worker, no Padlet. The extraction
 * seam is `KnowledgeProcessingTransition` at the bottom of this file.
 */

export const KNOWLEDGE_PDF_MIME_TYPE = 'application/pdf';

/**
 * Board-scoped, document-scoped, and deliberately independent of the
 * user-supplied filename: the path is derived only from ids we generate or
 * already trust, so a hostile filename can never escape its prefix or
 * collide with another document. The original name is preserved separately
 * in `knowledge_documents.original_filename`.
 */
export function buildKnowledgeStoragePath(
  boardId: BoardId,
  documentId: KnowledgeDocumentId,
): string {
  return `knowledge/${boardId}/${documentId}/original.pdf`;
}

/** The %PDF- signature every PDF file begins with. */
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function hasPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i += 1) {
    if (bytes[i] !== PDF_MAGIC[i]) return false;
  }
  return true;
}

export interface KnowledgePdfCandidate {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface ValidatedKnowledgePdf {
  readonly originalFilename: string;
  readonly mimeType: typeof KNOWLEDGE_PDF_MIME_TYPE;
  readonly fileSizeBytes: number;
  readonly bytes: Uint8Array;
}

/**
 * Accepts PDF only. The declared MIME type and the filename are both
 * caller-controlled, so neither is trusted on its own -- the %PDF- magic
 * number is checked as well.
 *
 * NOTE (reported, not invented): this repository has no established
 * PDF/document upload size policy. `MAX_IMPORT_FILE_BYTES` (25MB) is the
 * workspace-bundle import cap and `MAX_DRAWING_IMPORT_BYTES` (25MB) the
 * Excalidraw scene cap; neither is a document-upload product limit. Rather
 * than invent one, P4 enforces no maximum and the policy gap is reported.
 */
export function validateKnowledgePdf(
  candidate: KnowledgePdfCandidate,
): Result<ValidatedKnowledgePdf, DomainError> {
  const originalFilename = candidate.filename.trim();
  if (originalFilename.length === 0) {
    return err(domainError('validation', 'A filename is required'));
  }

  if (candidate.mimeType !== KNOWLEDGE_PDF_MIME_TYPE) {
    return err(
      domainError('validation', 'Only PDF files can be added to Knowledge', {
        details: { mimeType: candidate.mimeType },
      }),
    );
  }

  if (candidate.bytes.byteLength === 0) {
    return err(domainError('validation', 'The selected file is empty'));
  }

  if (!hasPdfMagic(candidate.bytes)) {
    return err(
      domainError('validation', 'The selected file is not a valid PDF', {
        details: { reason: 'missing %PDF- signature' },
      }),
    );
  }

  return ok({
    originalFilename,
    mimeType: KNOWLEDGE_PDF_MIME_TYPE,
    fileSizeBytes: candidate.bytes.byteLength,
    bytes: candidate.bytes,
  });
}

// ---------------------------------------------------------------------------
// Injected ports. Implementations live in lib/infra (CONVENTIONS.md rule 1).
// ---------------------------------------------------------------------------

/**
 * Mirrors the authorization P3's own `knowledge_documents_insert` RLS policy
 * enforces -- board owner, or a board_collaborators row with role 'editor'.
 * Deliberately NOT a Knowledge-specific membership concept.
 */
export interface KnowledgeBoardAuthorizer {
  canMutateBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>>;
}

export interface KnowledgeDocumentInsert {
  readonly id: KnowledgeDocumentId;
  readonly boardId: BoardId;
  readonly createdBy: UserId;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly storagePath: string;
  readonly contentSha256: string;
}

export interface KnowledgeIngestionRepository {
  insertDocument(record: KnowledgeDocumentInsert): Promise<Result<KnowledgeDocument, DomainError>>;
}

/**
 * The storage seam this ingestion path needs. `remove` exists specifically so
 * a failed ingestion can compensate for its own upload -- the shared
 * StorageGateway (lib/infra/supabase/storage.ts) has no delete operation.
 */
export interface KnowledgeStorageGateway {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<Result<void, DomainError>>;
  remove(path: string): Promise<Result<void, DomainError>>;
  /**
   * P6J-F9-A1a. Deletion cleanup removes deterministic artifact paths in
   * bounded batches rather than one request per object. `remove` stays because
   * ingestion compensation deletes exactly the one path it just uploaded.
   */
  removeMany(paths: readonly string[]): Promise<Result<void, DomainError>>;
}

export interface KnowledgeContentHasher {
  sha256(bytes: Uint8Array): Promise<string>;
}

export interface KnowledgeDocumentIdFactory {
  newDocumentId(): KnowledgeDocumentId;
}

export interface KnowledgeIngestionDeps {
  readonly authorizer: KnowledgeBoardAuthorizer;
  readonly repository: KnowledgeIngestionRepository;
  // Ingestion uploads one object and compensates for that one object. It has
  // no business reaching the batch removal the deletion path needs.
  readonly storage: Pick<KnowledgeStorageGateway, 'upload' | 'remove'>;
  readonly hasher: KnowledgeContentHasher;
  readonly ids: KnowledgeDocumentIdFactory;
}

export interface CreateKnowledgePdfUploadInput {
  readonly boardId: BoardId;
  readonly userId: UserId;
  readonly file: KnowledgePdfCandidate;
}

/**
 * Ingest one PDF.
 *
 * Ordering is chosen so no failure can leave an inconsistent pair:
 *   1. authorize the board mutation      (cheapest rejection first)
 *   2. validate + hash                   (no external effect yet)
 *   3. generate the document id          (needed for the storage path)
 *   4. upload the original PDF
 *   5. insert the knowledge_documents row
 *
 * Only step 5 can fail after an external effect exists, and it compensates by
 * deleting the object uploaded in step 4 -- so this operation never leaves a
 * storage object without a record, nor a record pointing at a missing PDF.
 */
export async function createKnowledgePdfUpload(
  deps: KnowledgeIngestionDeps,
  input: CreateKnowledgePdfUploadInput,
): Promise<Result<KnowledgeDocument, DomainError>> {
  const authorized = await deps.authorizer.canMutateBoard(input.boardId, input.userId);
  if (!authorized.ok) return authorized;
  if (!authorized.value) {
    return err(
      domainError('permission_denied', 'You do not have permission to add files to this board'),
    );
  }

  const validated = validateKnowledgePdf(input.file);
  if (!validated.ok) return validated;

  const contentSha256 = await deps.hasher.sha256(validated.value.bytes);
  const documentId = deps.ids.newDocumentId();
  const storagePath = buildKnowledgeStoragePath(input.boardId, documentId);

  const uploaded = await deps.storage.upload(
    storagePath,
    validated.value.bytes,
    validated.value.mimeType,
  );
  if (!uploaded.ok) return uploaded;

  const inserted = await deps.repository.insertDocument({
    id: documentId,
    boardId: input.boardId,
    createdBy: input.userId,
    originalFilename: validated.value.originalFilename,
    mimeType: validated.value.mimeType,
    fileSizeBytes: validated.value.fileSizeBytes,
    storagePath,
    contentSha256,
  });

  if (!inserted.ok) {
    // Compensate: the object exists but nothing references it. A failure to
    // clean up must not mask the original error, so its result is discarded
    // deliberately rather than surfaced.
    await deps.storage.remove(storagePath);
    return inserted;
  }

  return ok(inserted.value);
}

/**
 * The single seam a future worker needs to claim a document:
 * `uploaded -> processing`. P4 defines it and does not implement it -- there
 * is no queue, no worker, and no OpenDataLoader invocation in this patch.
 * The transition belongs to PDF-KNOWLEDGE-P5-WORKER-BOUNDARY.
 */
export interface KnowledgeProcessingTransition {
  markProcessing(id: KnowledgeDocumentId): Promise<Result<void, DomainError>>;
}
