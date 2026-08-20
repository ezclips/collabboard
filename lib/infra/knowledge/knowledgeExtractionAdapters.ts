import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { BoardId, KnowledgeDocumentId } from '../../domain/core/ids';
import type {
  KnowledgeExtractionCompletion,
  KnowledgeExtractionJob,
  KnowledgeExtractionRepository,
  KnowledgeProcessingLease,
} from '../../domain/knowledge/knowledgeExtraction';
import { getSupabaseAdmin } from '../../supabase/admin';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface KnowledgeExtractionRpcResult {
  readonly status?: string;
  readonly documentId?: string;
  readonly boardId?: string;
  readonly storagePath?: string;
  readonly contentSha256?: string;
  readonly leaseToken?: string;
  readonly attempt?: number;
  readonly leaseExpiresAt?: string;
  readonly currentStatus?: string;
  readonly reason?: string;
  readonly pageCount?: number;
}

export interface KnowledgeExtractionSupabaseClient {
  rpc<TData = unknown>(
    fn:
      | 'claim_knowledge_extraction'
      | 'renew_knowledge_processing_lease'
      | 'complete_knowledge_extraction'
      | 'fail_knowledge_extraction'
      | 'list_knowledge_processing_candidates',
    args: Record<string, unknown>,
  ): Promise<{ data: TData; error: SupabaseErrorLike | null }>;
}

function unavailable(message: string, cause: unknown): Result<never, DomainError> {
  return err(domainError('unavailable', message, { cause }));
}

function leaseFromResult(data: KnowledgeExtractionRpcResult | null): Result<KnowledgeProcessingLease, DomainError> {
  const attempt = data?.attempt;
  if (!data?.leaseToken || !data.leaseExpiresAt || typeof attempt !== 'number' || !Number.isInteger(attempt) || attempt < 1) {
    return unavailable('Could not read the Knowledge processing lease', { data });
  }
  return ok({
    leaseToken: data.leaseToken,
    processingAttempt: attempt,
    leaseExpiresAt: data.leaseExpiresAt,
  });
}

function mapClaimResult(
  data: KnowledgeExtractionRpcResult | null,
  documentId: KnowledgeDocumentId,
): Result<KnowledgeExtractionJob, DomainError> {
  switch (data?.status) {
    case 'claimed': {
      if (!data.documentId || !data.boardId || !data.storagePath || !data.contentSha256) {
        return unavailable('Could not read the claimed Knowledge document', { data });
      }
      const lease = leaseFromResult(data);
      if (!lease.ok) return lease;
      return ok({
        documentId: data.documentId as KnowledgeDocumentId,
        boardId: data.boardId as BoardId,
        storagePath: data.storagePath,
        contentSha256: data.contentSha256,
        leaseToken: lease.value.leaseToken,
        processingAttempt: lease.value.processingAttempt,
        leaseExpiresAt: lease.value.leaseExpiresAt,
      });
    }
    case 'not_found':
      return err(domainError('not_found', 'Knowledge document was not found'));
    case 'conflict':
      return err(domainError('conflict', 'Knowledge document is not claimable', {
        details: { currentStatus: data.currentStatus },
      }));
    default:
      return unavailable('Could not claim the Knowledge document', { documentId, data });
  }
}

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

  async claim(documentId: KnowledgeDocumentId, leaseTtlSeconds: number): Promise<Result<KnowledgeExtractionJob, DomainError>> {
    try {
      const { data: rawData, error } = await this.client.rpc<KnowledgeExtractionRpcResult | null>('claim_knowledge_extraction', {
        p_document_id: documentId,
        p_lease_ttl_seconds: leaseTtlSeconds,
      });
      if (error) return unavailable('Could not claim the Knowledge document', error);
      return mapClaimResult(rawData, documentId);
    } catch (cause: unknown) {
      return unavailable('Could not claim the Knowledge document', cause);
    }
  }

  async renew(documentId: KnowledgeDocumentId, leaseToken: string, leaseTtlSeconds: number): Promise<Result<KnowledgeProcessingLease, DomainError>> {
    try {
      const { data: rawData, error } = await this.client.rpc<KnowledgeExtractionRpcResult | null>('renew_knowledge_processing_lease', {
        p_document_id: documentId,
        p_lease_token: leaseToken,
        p_lease_ttl_seconds: leaseTtlSeconds,
      });
      if (error) return unavailable('Could not renew the Knowledge processing lease', error);
      if (rawData?.status === 'not_found') return err(domainError('not_found', 'Knowledge document was not found'));
      if (rawData?.status !== 'renewed') return err(domainError('conflict', 'Knowledge processing lease is stale', { details: rawData }));
      return leaseFromResult(rawData);
    } catch (cause: unknown) {
      return unavailable('Could not renew the Knowledge processing lease', cause);
    }
  }

  async complete(completion: KnowledgeExtractionCompletion): Promise<Result<void, DomainError>> {
    try {
      const { data: rawData, error } = await this.client.rpc<KnowledgeExtractionRpcResult | null>('complete_knowledge_extraction', {
        p_document_id: completion.documentId,
        p_lease_token: completion.leaseToken,
        p_page_count: completion.pageCount,
        p_pages: toKnowledgePageRecords(completion),
        p_parser_name: completion.parserName,
        p_parser_version: completion.parserVersion,
        p_parser_options_hash: completion.parserOptionsHash,
        p_raw_artifact_path: completion.rawArtifactPath,
        p_expected_content_sha256: completion.expectedContentSha256,
      });
      if (error) return unavailable('Could not commit the extraction result', error);
      switch (rawData?.status) {
        case 'completed':
          return ok(undefined);
        case 'not_found':
          return err(domainError('not_found', 'Knowledge document was not found'));
        case 'conflict':
          return err(domainError('conflict', 'Knowledge processing lease is stale', {
              details: { currentStatus: rawData.currentStatus, reason: rawData.reason },
          }));
        case 'content_mismatch':
          return err(domainError('conflict', 'Knowledge document content changed during extraction'));
        default:
          return unavailable('Could not commit the extraction result', { data: rawData });
      }
    } catch (cause: unknown) {
      return unavailable('Could not commit the extraction result', cause);
    }
  }

  async fail(documentId: KnowledgeDocumentId, leaseToken: string, message: string): Promise<Result<void, DomainError>> {
    try {
      const { data: rawData, error } = await this.client.rpc<KnowledgeExtractionRpcResult | null>('fail_knowledge_extraction', {
        p_document_id: documentId,
        p_lease_token: leaseToken,
        p_processing_error: message,
      });
      if (error) return unavailable('Could not record the extraction failure', error);
      switch (rawData?.status) {
        case 'failed':
          return ok(undefined);
        case 'not_found':
          return err(domainError('not_found', 'Knowledge document was not found'));
        default:
          return err(domainError('conflict', 'Knowledge processing lease is stale', { details: rawData }));
      }
    } catch (cause: unknown) {
      return unavailable('Could not record the extraction failure', cause);
    }
  }

  async listProcessingCandidates(
    limit: number,
  ): Promise<Result<readonly KnowledgeDocumentId[], DomainError>> {
    try {
      const { data, error } = await this.client.rpc<readonly { document_id: string }[]>(
        'list_knowledge_processing_candidates',
        { p_limit: limit },
      );
      if (error) return unavailable('Could not discover Knowledge processing candidates', error);
      return ok((data ?? []).map((row) => row.document_id as KnowledgeDocumentId));
    } catch (cause: unknown) {
      return unavailable('Could not discover Knowledge processing candidates', cause);
    }
  }
}

export function createServerKnowledgeExtractionRepository(): SupabaseKnowledgeExtractionRepository {
  return new SupabaseKnowledgeExtractionRepository(
    getSupabaseAdmin() as unknown as KnowledgeExtractionSupabaseClient,
  );
}
