import {
  validateKnowledgeEmbeddingVectors,
} from '../../lib/domain/knowledge/knowledgeEmbedding';
import type {
  KnowledgeEmbeddingProvider,
  KnowledgeEmbeddingProviderRequest,
  KnowledgeEmbeddingVector,
} from '../../lib/domain/knowledge/knowledgeEmbedding';

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_TIMEOUT_MS = 120_000;

export interface OpenAIEmbeddingProviderConfig {
  readonly apiKey: string;
  readonly fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  readonly endpoint?: string;
  readonly requestTimeoutMs?: number;
}

interface JsonRecord { readonly [key: string]: unknown; }

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function vectorFromResponse(
  value: unknown,
  request: KnowledgeEmbeddingProviderRequest,
): readonly KnowledgeEmbeddingVector[] {
  if (!isRecord(value) || !Array.isArray(value.data) || value.data.length !== request.inputs.length) {
    throw new Error('OpenAI embedding response contained an unexpected vector count');
  }
  const vectors: KnowledgeEmbeddingVector[] = [];
  for (const item of value.data) {
    if (!isRecord(item) || typeof item.index !== 'number' || !Number.isInteger(item.index) || item.index < 0) {
      throw new Error('OpenAI embedding response contained an invalid vector index');
    }
    const input = request.inputs[item.index];
    if (!input || !Array.isArray(item.embedding) || !item.embedding.every((entry) => typeof entry === 'number')) {
      throw new Error('OpenAI embedding response contained an invalid vector');
    }
    vectors.push({
      chunkId: input.chunkId,
      modelId: request.profile.modelId,
      dimensions: request.profile.dimensions,
      textHash: input.textHash,
      embedding: item.embedding,
    });
  }
  return validateKnowledgeEmbeddingVectors(vectors, request.inputs, request.profile);
}

export class OpenAIEmbeddingProvider implements KnowledgeEmbeddingProvider {
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly endpoint: string;
  private readonly requestTimeoutMs: number;

  constructor(private readonly config: OpenAIEmbeddingProviderConfig) {
    if (!config.apiKey) throw new Error('OPENAI_API_KEY is required for the embedding worker');
    const timeout = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_REQUEST_TIMEOUT_MS) {
      throw new Error('Embedding request timeout must be between 1 and 120000 milliseconds');
    }
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.endpoint = config.endpoint ?? OPENAI_EMBEDDINGS_URL;
    this.requestTimeoutMs = timeout;
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
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: request.profile.model,
          input: request.inputs.map((input) => input.text),
          dimensions: request.profile.dimensions,
        }),
      });
      if (!response.ok) throw new Error(`OpenAI embedding request failed with status ${response.status}`);
      return vectorFromResponse(await response.json() as unknown, request);
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abortExternal);
    }
  }
}
