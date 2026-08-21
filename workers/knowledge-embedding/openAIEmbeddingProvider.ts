import {
  validateKnowledgeEmbeddingVectors,
} from '../../lib/domain/knowledge/knowledgeEmbedding';
import type {
  KnowledgeEmbeddingProvider,
  KnowledgeEmbeddingProviderRequest,
  KnowledgeEmbeddingVector,
} from '../../lib/domain/knowledge/knowledgeEmbedding';

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

export interface OpenAIEmbeddingProviderConfig {
  readonly apiKey: string;
  readonly fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  readonly endpoint?: string;
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

  constructor(private readonly config: OpenAIEmbeddingProviderConfig) {
    if (!config.apiKey) throw new Error('OPENAI_API_KEY is required for the embedding worker');
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.endpoint = config.endpoint ?? OPENAI_EMBEDDINGS_URL;
  }

  async embed(request: KnowledgeEmbeddingProviderRequest): Promise<readonly KnowledgeEmbeddingVector[]> {
    if (request.inputs.length === 0) return [];
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
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
  }
}
