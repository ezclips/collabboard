// The Supabase side of importing a transcript.
//
// THIS ADAPTER IS THIN ON PURPOSE. Every rule that matters -- the five locked
// predicates, the revision increment, the chunk/cue validation, the atomic
// replacement -- lives in the RPCs, because only the transaction can hold
// them. An adapter that re-implemented any of it would be a second opinion
// that can disagree, and the one in the database is the one that decides.
//
// So this file does exactly three things: shape the call, map the row back,
// and translate the RPC's SQLSTATEs into domain errors. It never retries, and
// it never softens a refusal into a success.

import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';
import type { Result } from '../../domain/core/result';
import type { BoardId, KnowledgeDocumentId } from '../../domain/core/ids';
import type { KnowledgeDocument } from '../../domain/knowledge/knowledgePersistence';
import {
  KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN,
  type KnowledgeTranscriptCreateWrite,
  type KnowledgeTranscriptExpectedVersion,
  type KnowledgeTranscriptMetadata,
  type KnowledgeTranscriptReplaceWrite,
  type KnowledgeTranscriptRepository,
  type KnowledgeTranscriptTarget,
  type KnowledgeTranscriptUploadIdFactory,
  type KnowledgeTranscriptWriteResult,
} from '../../domain/knowledge/knowledgeTranscriptImport';
import type { KnowledgeTranscriptStoredRepresentation } from '../../domain/knowledge/knowledgeTranscriptVersion';
import { mapKnowledgeDocumentRow } from './knowledgeIngestionAdapters';
import type { KnowledgeDocumentRow } from './knowledgeIngestionAdapters';

/** The SQLSTATEs the RPCs raise. See the migration's error signalling note. */
const RPC_CONFLICT = 'KT001';
const RPC_REVISION_STALLED = 'KT002';
const RPC_VALIDATION = 'KT003';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface TranscriptRevisionRow {
  readonly document_id: string;
  readonly mutation_revision: number | string;
}

type TranscriptTargetRow = KnowledgeDocumentRow & {
  readonly transcript_representation: unknown;
  readonly transcript_mutation_revision: number | string | null;
};

export interface KnowledgeTranscriptSupabaseClient {
  from(table: 'knowledge_documents'): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{ data: TranscriptTargetRow | null; error: SupabaseErrorLike | null }>;
        };
      };
    };
  };
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: TranscriptRevisionRow[] | null; error: SupabaseErrorLike | null }>;
}

/**
 * THE REVISION CROSSES THE WIRE AS A STRING.
 *
 * It is a bigint in the database, and a bigint does not fit in a JavaScript
 * number. PostgREST already serialises it as a string for that reason; this
 * normalises whatever arrives so an equality comparison is never made between
 * a number that silently lost precision and a string that did not. The domain
 * treats the token as opaque, which is exactly what makes this safe.
 */
function revisionOf(value: number | string | null): string | null {
  if (value === null) return null;
  return typeof value === 'string' ? value : String(value);
}

function mapRpcError(error: SupabaseErrorLike, action: string): DomainError {
  switch (error.code) {
    case RPC_CONFLICT:
      // ONE MESSAGE FOR BOTH CAUSES, as the RPC raises it. Telling a caller
      // that a document exists but belongs to another board would confirm a
      // row it cannot see.
      return domainError('conflict', 'This transcript changed since you opened it, or is no longer available');
    case RPC_REVISION_STALLED:
      // The transaction ROLLED BACK -- the function raises before returning --
      // so nothing was saved and a retry from a fresh read is correct. This is
      // NOT the domain's saved-state-uncertain case, which only arises if a
      // write reports success with an unmoved revision.
      return domainError('unavailable', 'The transcript could not be saved safely; please try again', {
        details: { reason: 'the database refused a write that did not advance the revision' },
      });
    case RPC_VALIDATION:
      return domainError('validation', 'This transcript could not be stored', {
        details: { reason: error.message },
      });
    default:
      return domainError('unavailable', `Could not ${action}`, { cause: error });
  }
}

function writeResultOf(
  rows: TranscriptRevisionRow[] | null,
  document: KnowledgeDocument,
): Result<KnowledgeTranscriptWriteResult, DomainError> {
  const revision = revisionOf(rows?.[0]?.mutation_revision ?? null);
  if (revision === null) {
    // The write may well have committed. Saying so, rather than inventing a
    // revision, is the only honest option: a caller that edits on from a
    // guessed token would overwrite whatever really happened.
    return err(
      domainError('unknown', 'The transcript was saved, but its new version could not be read back', {
        details: {
          code: KNOWLEDGE_TRANSCRIPT_SAVED_STATE_UNCERTAIN,
          safeToRetry: false,
          refreshRequired: true,
        },
      }),
    );
  }
  return ok({ document, mutationRevision: revision });
}

export class SupabaseKnowledgeTranscriptRepository implements KnowledgeTranscriptRepository {
  constructor(private readonly client: KnowledgeTranscriptSupabaseClient) {}

  async loadTranscriptTarget(
    boardId: BoardId,
    documentId: KnowledgeDocumentId,
  ): Promise<Result<KnowledgeTranscriptTarget | null, DomainError>> {
    // SCOPED BY BOTH, in the query itself. A document id from another board
    // reads as absent here, and the RPC re-checks the same pair under the row
    // lock -- this read is for a clear message, not for the decision.
    const { data, error } = await this.client
      .from('knowledge_documents')
      .select('*')
      .eq('id', documentId)
      .eq('board_id', boardId)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not load that transcript', { cause: error }));
    }
    if (!data) return ok(null);

    const revision = revisionOf(data.transcript_mutation_revision);
    if (revision === null) {
      // A transcript document must have a revision. A null one matches nothing
      // and would make every edit fail; saying so beats offering a target that
      // cannot be written.
      return err(
        domainError('unavailable', 'That transcript is missing its version marker', {
          details: { documentId },
        }),
      );
    }

    return ok({
      documentId: data.id as KnowledgeDocumentId,
      boardId: data.board_id as BoardId,
      kind: data.kind,
      transcriptRepresentation:
        (data.transcript_representation as KnowledgeTranscriptStoredRepresentation | null) ?? null,
      contentSha256: data.content_sha256,
      mutationRevision: revision,
      storagePath: data.storage_path ?? '',
      originalFilename: data.original_filename,
      document: mapKnowledgeDocumentRow(data),
    });
  }

  async createTranscriptVersion(
    write: KnowledgeTranscriptCreateWrite,
  ): Promise<Result<KnowledgeTranscriptWriteResult, DomainError>> {
    const { data, error } = await this.client.rpc('knowledge_transcript_create_version', {
      p_document_id: write.documentId,
      p_board_id: write.boardId,
      p_created_by: write.createdBy,
      p_original_filename: write.originalFilename,
      p_mime_type: write.mimeType,
      p_file_size_bytes: write.fileSizeBytes,
      p_storage_path: write.storagePath,
      p_content_sha256: write.contentSha256,
      p_parser_name: write.parserName,
      p_parser_version: write.parserVersion,
      p_parser_options_hash: write.parserOptionsHash,
      p_representation: write.representation,
      p_chunks: write.chunks,
    });

    if (error) return err(mapRpcError(error, 'save this transcript'));
    return writeResultOf(data, documentStub(write.documentId));
  }

  async replaceTranscriptVersion(
    write: KnowledgeTranscriptReplaceWrite,
    expected: KnowledgeTranscriptExpectedVersion,
  ): Promise<Result<KnowledgeTranscriptWriteResult, DomainError>> {
    const { data, error } = await this.client.rpc('knowledge_transcript_replace_version', {
      p_document_id: write.documentId,
      p_board_id: write.boardId,
      p_expected_sha256: expected.contentSha256,
      p_expected_revision: expected.mutationRevision,
      p_original_filename: write.originalFilename,
      p_mime_type: write.mimeType,
      p_file_size_bytes: write.fileSizeBytes,
      p_storage_path: write.storagePath,
      p_content_sha256: write.contentSha256,
      p_parser_name: write.parserName,
      p_parser_version: write.parserVersion,
      p_parser_options_hash: write.parserOptionsHash,
      p_representation: write.representation,
      p_chunks: write.chunks,
    });

    if (error) return err(mapRpcError(error, 'replace this transcript'));
    return writeResultOf(data, documentStub(write.documentId));
  }

  async updateTranscriptMetadata(
    scope: { readonly documentId: KnowledgeDocumentId; readonly boardId: BoardId },
    metadata: Omit<KnowledgeTranscriptMetadata, 'format'>,
    expected: KnowledgeTranscriptExpectedVersion,
  ): Promise<Result<KnowledgeTranscriptWriteResult, DomainError>> {
    const { data, error } = await this.client.rpc('knowledge_transcript_update_metadata', {
      p_document_id: scope.documentId,
      p_board_id: scope.boardId,
      p_expected_sha256: expected.contentSha256,
      p_expected_revision: expected.mutationRevision,
      p_original_filename: metadata.originalFilename,
      p_language: metadata.language,
      p_track_kind: metadata.trackKind,
    });

    if (error) return err(mapRpcError(error, 'update this transcript'));
    return writeResultOf(data, documentStub(scope.documentId));
  }
}

/**
 * The RPC returns the id and the revision, not the whole row.
 *
 * Re-reading the document to fill one out would be a SECOND read after the
 * transaction closed, and it could return something a later write had already
 * changed -- a row that never existed at the moment this call committed. The
 * id is what the caller needs to fetch the document through the ordinary read
 * path, and the revision is what it needs to edit on.
 */
function documentStub(documentId: KnowledgeDocumentId): KnowledgeDocument {
  return { id: documentId } as unknown as KnowledgeDocument;
}

/**
 * A fresh id per upload ATTEMPT.
 *
 * Lowercase alphanumerics only, because this becomes part of a storage key and
 * the key builder refuses anything else. 16 characters of crypto randomness:
 * two concurrent attempts must not collide, or one request's cleanup becomes
 * the other's data loss.
 */
export class RandomKnowledgeTranscriptUploadIdFactory implements KnowledgeTranscriptUploadIdFactory {
  newUploadId(): string {
    const bytes = new Uint8Array(10);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 16);
  }
}
