import { validateKnowledgeEmbeddingVectors } from '../../lib/domain/knowledge/knowledgeEmbedding';
import type {
  KnowledgeEmbeddingProvider,
  KnowledgeEmbeddingProviderRequest,
  KnowledgeEmbeddingVector,
} from '../../lib/domain/knowledge/knowledgeEmbedding';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_TIMEOUT_MS = 120_000;

export interface LocalTeiEmbeddingProviderConfig {
  readonly baseUrl: string;
  readonly fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  readonly requestTimeoutMs?: number;
}

export function assertLocalTeiUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('KNOWLEDGE_EMBEDDING_TEI_URL must be a valid URL'); }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('KNOWLEDGE_EMBEDDING_TEI_URL must be an unauthenticated HTTP loopback URL');
  }
  return new URL('/embed', parsed).toString();
}

function vectorsFromResponse(value: unknown, request: KnowledgeEmbeddingProviderRequest): readonly KnowledgeEmbeddingVector[] {
  if (!Array.isArray(value) || value.length !== request.inputs.length || !value.every(Array.isArray)) {
    throw new Error('Local TEI embedding response contained an unexpected vector count');
  }
  const vectors = value.map((embedding, index) => ({
    chunkId: request.inputs[index].chunkId,
    modelId: request.profile.modelId,
    dimensions: request.profile.dimensions,
    textHash: request.inputs[index].textHash,
    embedding: embedding as number[],
  }));
  return validateKnowledgeEmbeddingVectors(vectors, request.inputs, request.profile);
}

export class LocalTeiEmbeddingProvider implements KnowledgeEmbeddingProvider {
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly endpoint: string;
  private readonly requestTimeoutMs: number;

  constructor(private readonly config: LocalTeiEmbeddingProviderConfig) {
    this.endpoint = assertLocalTeiUrl(config.baseUrl);
    const timeout = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_REQUEST_TIMEOUT_MS) {
      throw new Error('Embedding request timeout must be between 1 and 120000 milliseconds');
    }
    this.requestTimeoutMs = timeout;
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async embed(request: KnowledgeEmbeddingProviderRequest): Promise<readonly KnowledgeEmbeddingVector[]> {
    if (request.inputs.length === 0) return [];
    const controller = new AbortController();
    const abortExternal = () => controller.abort();
    if (request.signal?.aborted) controller.abort();
    else request.signal?.addEventListener('abort', abortExternal, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        signal: controller.signal,
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inputs: request.inputs.map((input) => input.text),
          prompt_name: 'document',
          dimensions: request.profile.dimensions,
          normalize: true,
          truncate: false,
        }),
      });
      if (!response.ok) throw new Error(`Local TEI embedding request failed with status ${response.status}`);
      return vectorsFromResponse(await response.json() as unknown, request);
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abortExternal);
    }
  }
}
