import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { BoardId, KnowledgeDocumentId } from '../../domain/core/ids';
import {
  KNOWLEDGE_CLAIMABLE_STATUSES,
  type KnowledgeExtractionCompletion,
  type KnowledgeExtractionJob,
  type KnowledgeExtractionRepository,
} from '../../domain/knowledge/knowledgeExtraction';
import { getSupabaseAdmin } from '../../supabase/admin';

/**
 * Server-side implementation of the worker port.
 *
 * Two of the three operations are a single conditional UPDATE, which is
 * already atomic in Postgres -- concurrent writers serialise on the row and
 * the loser re-evaluates its predicate against the winner's committed row, so
 * it matches zero rows. There is deliberately no read-then-write anywhere in
 * this file.
 *
 * Completion is the exception: replacing pages and flipping the status must
 * happen in one transaction, which supabase-js cannot express across calls,
 * so it goes through the `complete_knowledge_extraction` function added by
 * supabase/migrations/20260821_add_knowledge_extraction_lifecycle.sql.
 */

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface KnowledgeClaimRow {
  readonly id: string;
  readonly board_id: string;
  readonly storage_path: string;
  readonly content_sha256: string;
}

interface ClaimSelectQuery {
  maybeSingle(): Promise<{ data: KnowledgeClaimRow | null; error: SupabaseErrorLike | null }>;
}

interface ClaimUpdateQuery {
  eq(column: string, value: string): ClaimUpdateQuery;
  in(column: string, values: readonly string[]): ClaimUpdateQuery;
  select(columns: string): ClaimSelectQuery;
}

interface StatusProbeQuery {
  eq(column: string, value: string): StatusProbeQuery;
  maybeSingle(): Promise<{
    data: { readonly processing_status: string } | null;
    error: SupabaseErrorLike | null;
  }>;
}

interface FailSelectQuery {
  maybeSingle(): Promise<{ data: { readonly id: string } | null; error: SupabaseErrorLike | null }>;
}

interface FailUpdateQuery {
  eq(column: string, value: string): FailUpdateQuery;
  select(columns: string): FailSelectQuery;
}

export interface KnowledgeExtractionSupabaseClient {
  from(table: 'knowledge_documents'): {
    update(payload: Record<string, unknown>): ClaimUpdateQuery & FailUpdateQuery;
    select(columns: 'processing_status'): StatusProbeQuery;
  };
  rpc(
    fn: 'complete_knowledge_extraction',
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: SupabaseErrorLike | null }>;
}

function unavailable(message: string, cause: unknown): Result<never, DomainError> {
  return err(domainError('unavailable', message, { cause }));
}

/** Payload shape consumed by `jsonb_to_recordset` inside the RPC. */
export function toKnowledgePageRecords(
  completion: KnowledgeExtractionCompletion,
): readonly Record<string, unknown>[] {
  return completion.pages.map((page) => ({
    page_number: page.pageNumber,
    width_points: page.widthPoints,
    height_points: page.heightPoints,
    rotation: page.rotation,
    text: page.text,
    text_hash: page.textHash,
  }));
}

export class SupabaseKnowledgeExtractionRepository implements KnowledgeExtractionRepository {
  constructor(private readonly client: KnowledgeExtractionSupabaseClient) {}

  /**
   * One statement:
   *
   *   UPDATE knowledge_documents
   *      SET processing_status = 'processing', processing_error = NULL
   *    WHERE id = $1 AND processing_status IN ('uploaded', 'failed')
   *
   * A second concurrent claim therefore matches no row and is reported as a
   * conflict. The follow-up read exists only to tell "already claimed" apart
   * from "deleted"; the exclusivity decision was already made by the UPDATE.
   */
  async claim(documentId: KnowledgeDocumentId): Promise<Result<KnowledgeExtractionJob, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('knowledge_documents')
        .update({ processing_status: 'processing', processing_error: null })
        .eq('id', documentId)
        .in('processing_status', KNOWLEDGE_CLAIMABLE_STATUSES)
        .select('id, board_id, storage_path, content_sha256')
        .maybeSingle();

      if (error) return unavailable('Could not claim the Knowledge document', error);

      if (data) {
        return ok({
          documentId: data.id as KnowledgeDocumentId,
          boardId: data.board_id as BoardId,
          storagePath: data.storage_path,
          contentSha256: data.content_sha256,
        });
      }

      return this.classifyMiss(documentId, 'claimed');
    } catch (cause: unknown) {
      return unavailable('Could not claim the Knowledge document', cause);
    }
  }

  async complete(completion: KnowledgeExtractionCompletion): Promise<Result<void, DomainError>> {
    try {
      const { data, error } = await this.client.rpc('complete_knowledge_extraction', {
        p_document_id: completion.documentId,
        p_page_count: completion.pageCount,
        p_pages: toKnowledgePageRecords(completion),
        p_parser_name: completion.parserName,
        p_parser_version: completion.parserVersion,
        p_parser_options_hash: completion.parserOptionsHash,
        p_raw_artifact_path: completion.rawArtifactPath,
        p_expected_content_sha256: completion.expectedContentSha256,
      });

      // Any exception raised inside the function rolls the whole commit back,
      // so the document is still `processing` and no pages were replaced.
      if (error) return unavailable('Could not commit the extraction result', error);

      const status = (data as { status?: string } | null)?.status;
      switch (status) {
        case 'completed':
          return ok(undefined);
        case 'not_found':
          return err(domainError('not_found', 'Knowledge document was not found'));
        case 'conflict':
          return err(
            domainError('conflict', 'Knowledge document is not being processed', {
              details: { currentStatus: (data as { currentStatus?: string }).currentStatus },
            }),
          );
        case 'content_mismatch':
          return err(
            domainError('conflict', 'Knowledge document content changed during extraction'),
          );
        default:
          return unavailable('Could not commit the extraction result', { status });
      }
    } catch (cause: unknown) {
      return unavailable('Could not commit the extraction result', cause);
    }
  }

  /**
   * `processing -> failed` only. `raw_artifact_path` is cleared as part of the
   * same statement so a failed run can never leave the document pointing at a
   * partial or unusable parser artifact.
   */
  async fail(documentId: KnowledgeDocumentId, message: string): Promise<Result<void, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('knowledge_documents')
        .update({
          processing_status: 'failed',
          processing_error: message,
          raw_artifact_path: null,
        })
        .eq('id', documentId)
        .eq('processing_status', 'processing')
        .select('id')
        .maybeSingle();

      if (error) return unavailable('Could not record the extraction failure', error);
      if (data) return ok(undefined);

      const classified = await this.classifyMiss(documentId, 'failed');
      return classified as Result<never, DomainError>;
    } catch (cause: unknown) {
      return unavailable('Could not record the extraction failure', cause);
    }
  }

  /**
   * The conditional update matched nothing. Report `not_found` when the
   * document is gone -- a document deleted mid-processing (P4D remains
   * authoritative) must yield a stale-job result, never a resurrection --
   * and `conflict` when it merely holds an ineligible status.
   */
  private async classifyMiss(
    documentId: KnowledgeDocumentId,
    attempted: 'claimed' | 'failed',
  ): Promise<Result<never, DomainError>> {
    const { data, error } = await this.client
      .from('knowledge_documents')
      .select('processing_status')
      .eq('id', documentId)
      .maybeSingle();

    if (error) return unavailable('Could not resolve the Knowledge document state', error);
    if (!data) return err(domainError('not_found', 'Knowledge document was not found'));

    return err(
      domainError(
        'conflict',
        attempted === 'claimed'
          ? 'Knowledge document is already claimed'
          : 'Knowledge document is not being processed',
        { details: { currentStatus: data.processing_status } },
      ),
    );
  }
}

export function createServerKnowledgeExtractionRepository(): SupabaseKnowledgeExtractionRepository {
  // Server-only: the service role is required to execute
  // complete_knowledge_extraction, which is revoked from anon/authenticated.
  return new SupabaseKnowledgeExtractionRepository(
    getSupabaseAdmin() as unknown as KnowledgeExtractionSupabaseClient,
  );
}
