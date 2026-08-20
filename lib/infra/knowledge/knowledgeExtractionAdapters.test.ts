import { describe, expect, it } from 'vitest';
import { asKnowledgeDocumentId } from '../../domain/core/ids';
import type { KnowledgeExtractionCompletion } from '../../domain/knowledge/knowledgeExtraction';
import { SupabaseKnowledgeExtractionRepository, toKnowledgePageRecords } from './knowledgeExtractionAdapters';
import type { KnowledgeExtractionSupabaseClient } from './knowledgeExtractionAdapters';

const DOCUMENT = asKnowledgeDocumentId('44444444-4444-4444-4444-444444444444');
const TOKEN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

interface Recorded { readonly rpcs: Array<{ fn: string; args: Record<string, unknown> }>; }

function client(options: { readonly rpcResults?: Record<string, { data: unknown; error: { message: string } | null }> } = {}) {
  const recorded: Recorded = { rpcs: [] };
  const api = {
    async rpc(fn: string, args: Record<string, unknown>) {
      recorded.rpcs.push({ fn, args });
      return options.rpcResults?.[fn] ?? { data: { status: 'completed' }, error: null };
    },
  };
  return { client: api as unknown as KnowledgeExtractionSupabaseClient, recorded };
}

function completion(overrides: Partial<KnowledgeExtractionCompletion> = {}): KnowledgeExtractionCompletion {
  return {
    documentId: DOCUMENT,
    leaseToken: TOKEN,
    pageCount: 1,
    pages: [{ pageNumber: 1, widthPoints: 612, heightPoints: 792, rotation: 0, text: 'page one', textHash: 'b'.repeat(64) }],
    parserName: 'opendataloader-pdf',
    parserVersion: '2.5.0',
    parserOptionsHash: 'opts-abc',
    rawArtifactPath: null,
    expectedContentSha256: 'a'.repeat(64),
    ...overrides,
  };
}

describe('lease claim and reclaim RPC adapter', () => {
  it('passes TTL and maps a claimed lease', async () => {
    const { client: api, recorded } = client({ rpcResults: {
      claim_knowledge_extraction: { data: {
        status: 'claimed', documentId: DOCUMENT, boardId: '11111111-1111-1111-1111-111111111111',
        storagePath: 'knowledge/b/d/original.pdf', contentSha256: 'a'.repeat(64),
        leaseToken: TOKEN, attempt: 2, leaseExpiresAt: '2030-01-01T00:00:00Z',
      }, error: null },
    } });
    const result = await new SupabaseKnowledgeExtractionRepository(api).claim(DOCUMENT, 7);
    expect(result.ok && result.value.processingAttempt).toBe(2);
    expect(result.ok && result.value.leaseToken).toBe(TOKEN);
    expect(recorded.rpcs[0]).toEqual({ fn: 'claim_knowledge_extraction', args: { p_document_id: DOCUMENT, p_lease_ttl_seconds: 7 } });
  });

  it('maps not-found and conflict claims', async () => {
    for (const data of [{ status: 'not_found' }, { status: 'conflict', currentStatus: 'processing' }]) {
      const { client: api } = client({ rpcResults: { claim_knowledge_extraction: { data, error: null } } });
      expect((await new SupabaseKnowledgeExtractionRepository(api).claim(DOCUMENT, 1)).ok).toBe(false);
    }
  });
});

describe('lease renew and fenced completion/failure RPC adapters', () => {
  it('renews the current lease and blocks a stale token', async () => {
    const { client: api } = client({ rpcResults: {
      renew_knowledge_processing_lease: { data: { status: 'renewed', leaseToken: TOKEN, attempt: 2, leaseExpiresAt: '2030-01-01T00:00:00Z' }, error: null },
    } });
    const result = await new SupabaseKnowledgeExtractionRepository(api).renew(DOCUMENT, TOKEN, 3);
    expect(result.ok && result.value.processingAttempt).toBe(2);
    const stale = client({ rpcResults: { renew_knowledge_processing_lease: { data: { status: 'conflict', reason: 'stale_lease' }, error: null } } });
    const staleResult = await new SupabaseKnowledgeExtractionRepository(stale.client).renew(DOCUMENT, TOKEN, 3);
    expect(!staleResult.ok && staleResult.error.code).toBe('conflict');
  });

  it('passes the lease token into completion and failure', async () => {
    const { client: api, recorded } = client({ rpcResults: {
      complete_knowledge_extraction: { data: { status: 'completed' }, error: null },
      fail_knowledge_extraction: { data: { status: 'failed' }, error: null },
    } });
    const repository = new SupabaseKnowledgeExtractionRepository(api);
    expect((await repository.complete(completion())).ok).toBe(true);
    expect((await repository.fail(DOCUMENT, TOKEN, 'failed')).ok).toBe(true);
    expect(recorded.rpcs[0].args.p_lease_token).toBe(TOKEN);
    expect(recorded.rpcs[1].args.p_lease_token).toBe(TOKEN);
  });

  it('maps stale completion and failure without claiming success', async () => {
    const { client: api } = client({ rpcResults: {
      complete_knowledge_extraction: { data: { status: 'conflict', reason: 'stale_lease' }, error: null },
      fail_knowledge_extraction: { data: { status: 'conflict', reason: 'stale_lease' }, error: null },
    } });
    const repository = new SupabaseKnowledgeExtractionRepository(api);
    expect((await repository.complete(completion())).ok).toBe(false);
    expect((await repository.fail(DOCUMENT, TOKEN, 'failed')).ok).toBe(false);
  });
});

describe('page record mapping', () => {
  it('emits only transactional snake_case page fields', () => {
    expect(toKnowledgePageRecords(completion())[0]).toEqual({ page_number: 1, width_points: 612, height_points: 792, rotation: 0, text: 'page one', text_hash: 'b'.repeat(64) });
  });
});
