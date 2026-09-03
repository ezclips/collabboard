/**
 * PDF-R1 -- the database half of the derivative render lifecycle.
 *
 * Four RPCs, and deliberately no table access: every state change goes through
 * a function the migration defines, so the rules about what may be touched
 * live in one reviewable place rather than being re-implemented per caller.
 * Nothing here can reach processing_status, processing_error,
 * processing_attempt, raw_artifact_path or knowledge_pages -- the functions
 * simply do not expose them.
 */

import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';
import type { Result } from '../../domain/core/result';
import type { KnowledgeDocumentId } from '../../domain/core/ids';
import { getSupabaseAdmin } from '../../supabase/admin';

export interface KnowledgeRenderClaimRow {
  readonly documentId: string;
  readonly boardId: string;
  readonly storagePath: string;
  readonly pageCount: number | null;
  readonly leaseToken: string;
}

export interface KnowledgeRenderSupabaseClient {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{ data: T | null; error: unknown }>;
}

const unavailable = (message: string, cause?: unknown): Result<never, DomainError> =>
  err(domainError('unavailable', message, cause === undefined ? undefined : { cause }));

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export class SupabaseKnowledgeRenderLifecycleRepository {
  constructor(private readonly client: KnowledgeRenderSupabaseClient) {}

  async listRenderCandidates(
    rendererVersion: string,
    limit: number,
  ): Promise<Result<readonly KnowledgeDocumentId[], DomainError>> {
    try {
      const { data, error } = await this.client.rpc<readonly { document_id: string }[]>(
        'list_knowledge_render_candidates',
        { p_renderer_version: rendererVersion, p_limit: limit },
      );
      if (error) return unavailable('Could not discover page render candidates', error);
      return ok((data ?? []).map((row) => row.document_id as KnowledgeDocumentId));
    } catch (cause: unknown) {
      return unavailable('Could not discover page render candidates', cause);
    }
  }

  /**
   * Null means "not ours", which is an ordinary outcome: another worker holds
   * the lease, or the request was already satisfied. Only a genuinely broken
   * call is an error.
   */
  async claimRender(
    documentId: KnowledgeDocumentId,
    rendererVersion: string,
    leaseTtlSeconds: number,
  ): Promise<Result<KnowledgeRenderClaimRow | null, DomainError>> {
    try {
      const { data, error } = await this.client.rpc<Record<string, unknown>>(
        'claim_knowledge_page_render',
        {
          p_document_id: documentId,
          p_renderer_version: rendererVersion,
          p_lease_ttl_seconds: leaseTtlSeconds,
        },
      );
      if (error) return unavailable('Could not claim a page render', error);
      if (!data || data.status !== 'claimed') return ok(null);

      const claim = {
        documentId: asString(data.documentId),
        boardId: asString(data.boardId),
        storagePath: asString(data.storagePath),
        leaseToken: asString(data.leaseToken),
      };
      // A claim missing any of these cannot be acted on safely -- and must not
      // be silently repaired into something that names a different object.
      if (!claim.documentId || !claim.boardId || !claim.storagePath || !claim.leaseToken) {
        return unavailable('Page render claim was incomplete');
      }
      return ok({
        documentId: claim.documentId,
        boardId: claim.boardId,
        storagePath: claim.storagePath,
        leaseToken: claim.leaseToken,
        pageCount: typeof data.pageCount === 'number' ? data.pageCount : null,
      });
    } catch (cause: unknown) {
      return unavailable('Could not claim a page render', cause);
    }
  }

  /** False means the lease moved on; the caller's work is simply discarded. */
  async completeRender(
    documentId: KnowledgeDocumentId,
    leaseToken: string,
    rendererVersion: string,
  ): Promise<Result<boolean, DomainError>> {
    try {
      const { data, error } = await this.client.rpc<Record<string, unknown>>(
        'complete_knowledge_page_render',
        { p_document_id: documentId, p_lease_token: leaseToken, p_renderer_version: rendererVersion },
      );
      if (error) return unavailable('Could not complete the page render', error);
      return ok(data?.status === 'completed');
    } catch (cause: unknown) {
      return unavailable('Could not complete the page render', cause);
    }
  }

  async failRender(
    documentId: KnowledgeDocumentId,
    leaseToken: string,
    reason: string,
  ): Promise<Result<boolean, DomainError>> {
    try {
      const { data, error } = await this.client.rpc<Record<string, unknown>>(
        'fail_knowledge_page_render',
        // A low-cardinality reason code by contract; never a driver message.
        { p_document_id: documentId, p_lease_token: leaseToken, p_error: reason },
      );
      if (error) return unavailable('Could not record the page render failure', error);
      return ok(data?.status === 'failed');
    } catch (cause: unknown) {
      return unavailable('Could not record the page render failure', cause);
    }
  }
}

export function createServerKnowledgeRenderLifecycleRepository(): SupabaseKnowledgeRenderLifecycleRepository {
  return new SupabaseKnowledgeRenderLifecycleRepository(
    getSupabaseAdmin() as unknown as KnowledgeRenderSupabaseClient,
  );
}
